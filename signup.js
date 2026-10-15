// ── 与排班表共用同一个 Supabase 后台（同一个项目 / 同一行共享状态） ──
const SP_CONFIG = {
  url: 'https://citorcvisrfqkflwortx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdG9yY3Zpc3JmcWtmbHdvcnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTk4NjQsImV4cCI6MjA5NzQ3NTg2NH0.I1G-oO1T3wfWJ5GcmYejT6Y0x2wAJ0xXRQsIcPVPjos',
  table: 'church_app_state',
  rowId: 1,
  bucket: 'song-images',
  submissionsTable: 'church_signup_submissions',
};
let spClient = null;
function spInitClient(){
  if(!spClient && window.supabase) spClient = window.supabase.createClient(SP_CONFIG.url, SP_CONFIG.anonKey);
  return spClient;
}

// ── 字段类型 ──
const SP_FIELD_TYPES = [
  {v:'text', label:'单行文本', icon:'ti-user'},
  {v:'tel', label:'电话号码', icon:'ti-phone'},
  {v:'email', label:'邮箱', icon:'ti-mail'},
  {v:'number', label:'数字（带加减）', icon:'ti-plus-minus'},
  {v:'textarea', label:'多行文本', icon:'ti-align-left'},
  {v:'select', label:'下拉选择', icon:'ti-list'},
  {v:'radio', label:'单选', icon:'ti-circle-check'},
  {v:'checkbox', label:'多选', icon:'ti-checkbox'},
  {v:'date', label:'日期', icon:'ti-calendar'},
  {v:'time', label:'时间', icon:'ti-clock'},
];
function spFieldIcon(type){ return (SP_FIELD_TYPES.find(t=>t.v===type)||SP_FIELD_TYPES[0]).icon; }

function spDefaultFields(){
  return [
    {id:spUid(), type:'text', label:'姓名', placeholder:'请输入您的姓名', required:true},
    {id:spUid(), type:'tel', label:'手机号', placeholder:'请输入手机号', required:true},
    {id:spUid(), type:'number', label:'陪同参加人数', placeholder:'如：我+家人共3人', required:false, min:0, max:20, default:1},
    {id:spUid(), type:'textarea', label:'备注 / 特殊需要', placeholder:'如：需要轮椅、儿童看护等', required:false, maxLength:200},
  ];
}
function spUid(){ return Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
function spEscapeHtml(str){ return String(str==null?'':str).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function spToast(msg){
  const t=document.getElementById('spToast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(spToast._tm); spToast._tm=setTimeout(()=>t.classList.remove('show'),2200);
}

// ── 状态 ──
let spEvents = [];
let spIsAdmin = false;
let spView = 'list';      // list | detail | form | success
let spCurrentId = null;
let spEditingId = null;   // 编辑器里正在编辑的活动 id，null 表示新建
let spEditorFields = [];
let spSubsCurrentEvent = null;
let spSubsCache = [];
let spNumberVals = {};    // 表单里 number 字段当前值 {fieldId: n}

function spNormEvent(raw){
  const src = raw && typeof raw==='object' ? raw : {};
  return {
    id: src.id || spUid(),
    enabled: !!src.enabled,
    coverImage: src.coverImage || '',
    tag: src.tag || '',
    title: src.title || '',
    date: src.date || '',
    timeStart: src.timeStart || '',
    timeEnd: src.timeEnd || '',
    location: src.location || '',
    address: src.address || '',
    introTitle: src.introTitle || '',
    intro: src.intro || '',
    highlights: Array.isArray(src.highlights) ? src.highlights.filter(Boolean) : [],
    detailTitle: src.detailTitle || '活动详情',
    detail: src.detail || '',
    ctaText: src.ctaText || '立即报名',
    submitText: src.submitText || '提交报名',
    capacity: Math.max(0, parseInt(src.capacity,10) || 0),
    capacityMode: src.capacityMode==='people' ? 'people' : 'count',
    deadline: src.deadline || '',
    showRemaining: src.showRemaining!==false,
    fields: Array.isArray(src.fields) && src.fields.length ? src.fields.map(spNormField) : spDefaultFields(),
    createdAt: src.createdAt || new Date().toISOString(),
    updatedAt: src.updatedAt || new Date().toISOString(),
  };
}
// ── 名额 / 截止时间 ──
const SP_STATUS = {
  pending:    { label:'待确认', icon:'ti-hourglass-empty' },
  confirmed:  { label:'已确认', icon:'ti-circle-check' },
  checked_in: { label:'已到场', icon:'ti-user-check' },
  cancelled:  { label:'已取消', icon:'ti-circle-x' },
};
function spPeopleKey(e){
  const nums = (e.fields||[]).filter(f=>f.type==='number');
  const f = nums.find(f=>/人数|几人|陪同/.test(f.label)) || nums[0];
  return f ? f.label : '';
}
function spDeadlineTs(e){ if(!e.deadline) return null; const t = new Date(e.deadline).getTime(); return isNaN(t) ? null : t; }
function spDeadlinePassed(e){ const t = spDeadlineTs(e); return t!=null && Date.now() > t; }
function spFmtDeadline(e){
  const d = new Date(e.deadline); if(isNaN(d.getTime())) return '';
  const p = n=>String(n).padStart(2,'0');
  return `${d.getMonth()+1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// 读取已占用名额：优先走数据库函数（只返回汇总数字），失败时退回直接查询
async function spFetchUsage(e){
  const client = spInitClient(); if(!client) return null;
  const key = spPeopleKey(e);
  try{
    const { data, error } = await client.rpc('sp_event_usage', { p_event: String(e.id), p_people_key: key || null });
    if(error) throw error;
    const r = typeof data==='string' ? JSON.parse(data) : data;
    if(r && typeof r.count!=='undefined') return { count:Number(r.count)||0, people:Number(r.people)||0 };
  }catch(_){}
  try{
    let res = await client.from(SP_CONFIG.submissionsTable).select('values,status,deleted_at').eq('event_id', e.id).limit(5000);
    if(res.error) res = await client.from(SP_CONFIG.submissionsTable).select('values').eq('event_id', e.id).limit(5000);
    if(res.error) throw res.error;
    const rows = (res.data||[]).filter(r=>!r.deleted_at && r.status!=='cancelled');
    const people = rows.reduce((n,r)=>n + (key ? (Number((r.values||{})[key])||0) : 0), 0);
    return { count: rows.length, people };
  }catch(err){ console.error('读取名额失败', err); return null; }
}
function spCapState(e, usage){
  const cap = e.capacity;
  if(!cap || !usage) return { cap, used:null, remaining:null, full:false, mode:'count', unit:'个' };
  const mode = (e.capacityMode==='people' && spPeopleKey(e)) ? 'people' : 'count';
  const used = mode==='people' ? usage.people : usage.count;
  return { cap, used, mode, unit: mode==='people' ? '人' : '个', remaining: Math.max(0, cap-used), full: used>=cap };
}
function spPaintCta(e, st){
  const bar = document.getElementById('spCtaBar'); if(!bar) return;
  let why = '';
  if(spDeadlinePassed(e)) why = '报名已截止';
  else if(st && st.full) why = '名额已满';
  bar.innerHTML = why
    ? `<button class="sp-cta-btn disabled" disabled><i class="ti ti-lock"></i>${why}</button>`
    : `<button class="sp-cta-btn" onclick="spGoForm('${e.id}')"><i class="ti ti-user-plus"></i>${spEscapeHtml(e.ctaText||'立即报名')}<i class="ti ti-chevron-right sp-cta-arrow"></i></button>`;
}
async function spLoadCapacity(e){
  if(!e.capacity) return;
  const st = spCapState(e, await spFetchUsage(e));
  if(!(spView==='detail' && spCurrentId===e.id)) return;
  const box = document.getElementById('spCapBox');
  if(box && st.used!=null && e.showRemaining){
    const pct = Math.min(100, Math.round(st.used/st.cap*100));
    box.className = 'sp-cap' + (st.full ? ' full' : '');
    box.innerHTML = `<div class="sp-cap-top"><span><i class="ti ti-ticket"></i>${st.full?'名额已满':'剩余名额'}</span><b>${st.full?'':st.remaining+' '+st.unit}</b></div>
      <div class="sp-cap-track"><div class="sp-cap-fill" style="width:${pct}%"></div></div>
      <div class="sp-cap-hint">已报名 ${st.used} / ${st.cap} ${st.unit==='人'?'人':'个名额'}</div>`;
  }
  spPaintCta(e, st);
}
async function spLoadListCaps(list){
  for(const e of list){
    const el = document.getElementById('spCap_'+e.id); if(!el) continue;
    if(spDeadlinePassed(e)){ el.className='sp-list-cap off'; el.textContent='已截止'; continue; }
    if(!e.capacity || !e.showRemaining) continue;
    spFetchUsage(e).then(u=>{
      const st = spCapState(e,u); const el2 = document.getElementById('spCap_'+e.id);
      if(!el2 || st.used==null) return;
      if(st.full){ el2.className='sp-list-cap off'; el2.textContent='名额已满'; }
      else { el2.className = 'sp-list-cap' + (st.remaining<=Math.max(3,Math.ceil(st.cap*0.1)) ? ' warn' : ''); el2.textContent = '剩余 '+st.remaining+' '+st.unit; }
    });
  }
}
function spNormField(f){
  const src = f && typeof f==='object' ? f : {};
  const type = SP_FIELD_TYPES.some(t=>t.v===src.type) ? src.type : 'text';
  return {
    id: src.id || spUid(),
    type,
    label: src.label || '',
    placeholder: src.placeholder || '',
    required: !!src.required,
    options: Array.isArray(src.options) ? src.options.filter(Boolean) : (typeof src.options==='string' ? src.options.split(',').map(s=>s.trim()).filter(Boolean) : []),
    min: typeof src.min==='number' ? src.min : 0,
    max: typeof src.max==='number' ? src.max : 99,
    default: typeof src.default==='number' ? src.default : 1,
    maxLength: typeof src.maxLength==='number' ? src.maxLength : 200,
  };
}

async function spLoadState(){
  const client = spInitClient();
  if(!client) return;
  try{
    const { data, error } = await client.from(SP_CONFIG.table).select('id,signup_events').eq('id', SP_CONFIG.rowId).maybeSingle();
    if(error) throw error;
    spEvents = (data && Array.isArray(data.signup_events)) ? data.signup_events.map(spNormEvent) : [];
  }catch(e){
    console.error('加载报名活动失败', e);
    spEvents = [];
  }
}
async function spSaveEventsRemote(){
  const client = spInitClient();
  if(!client) throw new Error('未连接后台');
  const payload = { id: SP_CONFIG.rowId, signup_events: spEvents, updated_at: new Date().toISOString() };
  const { error } = await client.from(SP_CONFIG.table).upsert(payload, { onConflict:'id' });
  if(error) throw error;
}

// ── 日期格式化 ──
function spFormatDate(dateStr){
  if(!dateStr) return '';
  const d = new Date(dateStr+'T00:00:00');
  if(isNaN(d.getTime())) return dateStr;
  const wd = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}（${wd}）`;
}

// ── 路由 / 视图 ──
function spEnabledEvents(){
  return spEvents.filter(e=>e.enabled).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
}
function spGetEvent(id){ return spEvents.find(e=>e.id===id); }

function spBoot(){
  const params = new URLSearchParams(location.search);
  const idParam = params.get('id');
  const enabled = spEnabledEvents();
  if(idParam && spGetEvent(idParam) && spGetEvent(idParam).enabled){
    spCurrentId = idParam; spView='detail';
  } else if(enabled.length===1){
    spCurrentId = enabled[0].id; spView='detail';
  } else if(enabled.length>1){
    spView='list';
  } else {
    spView='empty';
  }
  spRender();
  if(params.get('admin')==='1' && !spIsAdmin) spOpenLogin();
}

function spGoBack(){
  if(spView==='form'){ spView='detail'; spRender(); return; }
  if(spView==='detail' && spEnabledEvents().length>1){ spView='list'; spCurrentId=null; spRender(); return; }
  if(spView==='success'){ spView='detail'; spRender(); return; }
}
function spGoList(){ spView='list'; spCurrentId=null; spRender(); }
function spGoDetail(id){ spCurrentId=id; spView='detail'; spRender(); window.scrollTo(0,0); }
function spGoForm(id){ spCurrentId=id; spView='form'; spNumberVals={}; spRender(); window.scrollTo(0,0); }
function spRender(){
  const back = document.getElementById('spBackBtn');
  const share = document.getElementById('spShareBtn');
  const title = document.getElementById('spTopbarTitle');
  const body = document.getElementById('spBody');
  const shell = document.querySelector('.sp-shell'); if(shell) shell.dataset.view = spView;
  const canBack = (spView==='form') || (spView==='detail' && spEnabledEvents().length>1) || (spView==='success');
  back.classList.toggle('ghost', !canBack);
  share.classList.toggle('ghost', spView!=='detail');
  const curEv = spGetEvent(spCurrentId);
  title.textContent = spView==='detail' ? ((curEv && curEv.title) || '活动报名')
    : spView==='form' ? '报名参与'
    : spView==='success' ? '报名成功'
    : '报名活动';

  if(spView==='empty'){
    body.innerHTML = `<div class="sp-empty"><i class="ti ti-calendar-off"></i><div>暂无报名活动</div></div>`;
    return;
  }
  if(spView==='list'){ spRenderList(body); return; }
  if(spView==='detail'){ spRenderDetail(body); return; }
  if(spView==='form'){ spRenderForm(body); return; }
  if(spView==='success'){ spRenderSuccess(body); return; }
}

function spRenderList(body){
  const list = spEnabledEvents();
  if(!list.length){ body.innerHTML = `<div class="sp-empty"><i class="ti ti-calendar-off"></i><div>暂无报名活动</div></div>`; return; }
  body.innerHTML = `<div class="sp-list-page">
    <div class="sp-list-header">报名活动</div>
    ${list.map(e=>`
      <div class="sp-list-card" onclick="spGoDetail('${e.id}')">
        <img class="sp-list-card-img" src="${spEscapeHtml(e.coverImage)}" onerror="this.style.visibility='hidden'">
        <div class="sp-list-card-body">
          ${e.tag?`<span class="sp-tag-pill small">${spEscapeHtml(e.tag)}</span>`:''}
          <div class="sp-list-card-title">${spEscapeHtml(e.title)}</div>
          <div class="sp-list-card-meta"><i class="ti ti-calendar-event"></i>${spFormatDate(e.date)} ${spEscapeHtml(e.timeStart)}${e.timeEnd?'-'+spEscapeHtml(e.timeEnd):''}<span class="sp-list-cap" id="spCap_${e.id}"></span></div>
        </div>
      </div>`).join('')}
  </div>`;
  spLoadListCaps(list);
}

function spHighlightIcon(t){
  t = String(t||'');
  if(/敬拜|赞美|诗歌|音乐|歌/.test(t)) return 'ti-music';
  if(/团契|聚会|相交|家庭|小组|交通/.test(t)) return 'ti-users';
  if(/圣经|查经|讲道|信息|分享|真理/.test(t)) return 'ti-book-2';
  if(/游戏|互动|运动/.test(t)) return 'ti-device-gamepad-2';
  if(/餐|饭|美食|茶点|点心|爱宴/.test(t)) return 'ti-tools-kitchen-2';
  if(/祷告|祈祷|代祷/.test(t)) return 'ti-heart-handshake';
  if(/见证|生命|成长/.test(t)) return 'ti-plant-2';
  if(/免费|名额/.test(t)) return 'ti-ticket';
  return 'ti-sparkles';
}
function spRenderDetail(body){
  const e = spGetEvent(spCurrentId);
  if(!e){ body.innerHTML = `<div class="sp-empty"><i class="ti ti-calendar-off"></i><div>活动不存在或已下线</div></div>`; return; }
  document.getElementById('spPageTitle').textContent = e.title || '活动报名';
  const timeStr = `${spFormatDate(e.date)} ${spEscapeHtml(e.timeStart)}${e.timeEnd?'-'+spEscapeHtml(e.timeEnd):''}`.trim();
  const hasIntro = !!(e.introTitle || e.intro || e.highlights.length);
  body.innerHTML = `
    <div class="sp-cover-wrap${e.coverImage?'':' empty'}">${e.coverImage?`<img class="sp-cover" src="${spEscapeHtml(e.coverImage)}" alt="">`:''}</div>
    <div class="sp-detail-card">
      ${e.tag?`<span class="sp-tag-pill">${spEscapeHtml(e.tag)}</span>`:''}
      <h1 class="sp-title">${spEscapeHtml(e.title)}</h1>
      ${timeStr?`<div class="sp-meta-row"><i class="ti ti-calendar-event"></i><span>${timeStr}</span></div>`:''}
      ${e.location?`<div class="sp-meta-row"><i class="ti ti-map-pin-filled"></i><span>${spEscapeHtml(e.location)}${e.address?`（${spEscapeHtml(e.address)}）`:''}</span></div>`:''}
      ${spDeadlineTs(e)!=null?`<div class="sp-meta-row"><i class="ti ti-hourglass-high"></i><span>报名截止：${spFmtDeadline(e)}${spDeadlinePassed(e)?'（已截止）':''}</span></div>`:''}
      <div id="spCapBox"></div>
      ${hasIntro?`<hr class="sp-divider">
        ${e.introTitle?`<div class="sp-sec-head"><i class="ti ti-users-group"></i><span>${spEscapeHtml(e.introTitle)}</span></div>`:''}
        ${e.intro?`<p class="sp-intro">${spEscapeHtml(e.intro)}</p>`:''}
        ${e.highlights.length?`<div class="sp-highlights">${e.highlights.map(h=>`<span class="sp-highlight-pill"><i class="ti ${spHighlightIcon(h)}"></i>${spEscapeHtml(h)}</span>`).join('')}</div>`:''}`:''}
    </div>
    ${e.detail&&e.detail.trim()?`<div class="sp-detail-card second">
      <div class="sp-sec-head"><i class="ti ti-file-text"></i><span>${spEscapeHtml(e.detailTitle||'活动详情')}</span></div>
      <div class="sp-sec-underline"></div>
      <p class="sp-detail-text">${spEscapeHtml(e.detail)}</p>
    </div>`:''}
  `;
  document.getElementById('spBody').insertAdjacentHTML('beforeend', `<div class="sp-cta-bar" id="spCtaBar"></div>`);
  spPaintCta(e, null);
  spLoadCapacity(e);
}


function spRenderFieldHtml(f){
  const req = f.required ? `<span class="sp-required-dot">*</span>` : '';
  const icon = spFieldIcon(f.type);
  let input = '';
  if(f.type==='textarea'){
    input = `<textarea class="sp-textarea" id="spf_${f.id}" placeholder="${spEscapeHtml(f.placeholder)}" maxlength="${f.maxLength}" oninput="document.getElementById('spcount_${f.id}').textContent=this.value.length+'/${f.maxLength}'"></textarea>
      <div class="sp-char-count" id="spcount_${f.id}">0/${f.maxLength}</div>`;
  } else if(f.type==='number'){
    spNumberVals[f.id] = typeof f.default==='number' ? f.default : 1;
    input = `<div class="sp-stepper">
      <button type="button" class="sp-stepper-btn" onclick="spStep('${f.id}',-1,${f.min},${f.max})"><i class="ti ti-minus"></i></button>
      <span class="sp-stepper-val" id="spf_${f.id}">${spNumberVals[f.id]}</span>
      <button type="button" class="sp-stepper-btn" onclick="spStep('${f.id}',1,${f.min},${f.max})"><i class="ti ti-plus"></i></button>
    </div>`;
  } else if(f.type==='select'){
    input = `<select class="sp-select" id="spf_${f.id}">
      <option value="">${spEscapeHtml(f.placeholder||'请选择')}</option>
      ${f.options.map(o=>`<option value="${spEscapeHtml(o)}">${spEscapeHtml(o)}</option>`).join('')}
    </select>`;
  } else if(f.type==='radio'){
    input = `<div class="sp-choice-group" id="spf_${f.id}" data-multi="0">
      ${f.options.map(o=>`<span class="sp-choice-pill" onclick="spPickChoice('${f.id}','${spEscapeHtml(o).replace(/'/g,"\\'")}',false)">${spEscapeHtml(o)}</span>`).join('')}
    </div>`;
  } else if(f.type==='checkbox'){
    input = `<div class="sp-choice-group" id="spf_${f.id}" data-multi="1">
      ${f.options.map(o=>`<span class="sp-choice-pill" onclick="spPickChoice('${f.id}','${spEscapeHtml(o).replace(/'/g,"\\'")}',true)">${spEscapeHtml(o)}</span>`).join('')}
    </div>`;
  } else {
    const htmlType = f.type==='tel' ? 'tel' : (f.type==='email' ? 'email' : (f.type==='date' ? 'date' : (f.type==='time' ? 'time' : 'text')));
    input = `<input class="sp-input" type="${htmlType}" id="spf_${f.id}" placeholder="${spEscapeHtml(f.placeholder)}" autocomplete="off">`;
  }
  return `<div class="sp-field" data-field-id="${f.id}" data-type="${f.type}" data-required="${f.required?1:0}" data-label="${spEscapeHtml(f.label)}">
    <div class="sp-field-label"><i class="ti ${icon}"></i>${spEscapeHtml(f.label)}${req}</div>
    ${input}
  </div>`;
}
function spStep(fieldId, delta, min, max){
  let v = (spNumberVals[fieldId]||0) + delta;
  v = Math.max(min, Math.min(max, v));
  spNumberVals[fieldId] = v;
  document.getElementById('spf_'+fieldId).textContent = v;
}
function spPickChoice(fieldId, val, multi){
  const wrap = document.getElementById('spf_'+fieldId);
  const pills = wrap.querySelectorAll('.sp-choice-pill');
  if(multi){
    pills.forEach(p=>{ if(p.textContent===val) p.classList.toggle('active'); });
  } else {
    pills.forEach(p=>p.classList.toggle('active', p.textContent===val));
  }
}

function spRenderForm(body){
  const e = spGetEvent(spCurrentId);
  if(!e){ body.innerHTML = `<div class="sp-empty"><i class="ti ti-calendar-off"></i><div>活动不存在</div></div>`; return; }
  body.innerHTML = `
    <div class="sp-form-wrap">
      <div class="sp-event-mini-card">
        <div class="sp-mini-icon"><i class="ti ti-building"></i></div>
        <div>
          <div class="sp-mini-title">${spEscapeHtml(e.title)}</div>
          <div class="sp-mini-sub">${spFormatDate(e.date)} ${spEscapeHtml(e.timeStart)}${e.timeEnd?'-'+spEscapeHtml(e.timeEnd):''}${e.location?' · '+spEscapeHtml(e.location):''}</div>
        </div>
      </div>
      <div class="sp-section-title">个人信息</div>
      <div id="spFieldsWrap">${e.fields.map(spRenderFieldHtml).join('')}</div>
    </div>
  `;
  document.getElementById('spBody').insertAdjacentHTML('beforeend', `
    <div class="sp-cta-bar"><button class="sp-cta-btn" id="spSubmitBtn" onclick="spSubmit('${e.id}')">${spEscapeHtml(e.submitText||'提交报名')}</button></div>
  `);
}

function spCollectValues(e){
  const values = {}; let missing = '';
  for(const f of e.fields){
    let v;
    if(f.type==='number'){ v = spNumberVals[f.id]; }
    else if(f.type==='radio'){
      const active = document.querySelector(`#spf_${f.id} .sp-choice-pill.active`);
      v = active ? active.textContent : '';
    } else if(f.type==='checkbox'){
      v = Array.from(document.querySelectorAll(`#spf_${f.id} .sp-choice-pill.active`)).map(p=>p.textContent);
    } else {
      v = document.getElementById('spf_'+f.id).value.trim();
    }
    if(f.required && (v===''||v==null||(Array.isArray(v)&&!v.length))){ missing = f.label; break; }
    values[f.label] = v;
  }
  return { values, missing };
}

async function spSubmit(eventId){
  const e = spGetEvent(eventId);
  if(!e) return;
  const { values, missing } = spCollectValues(e);
  if(missing){ spToast('请填写：'+missing); return; }
  if(spDeadlinePassed(e)){ spToast('报名已截止'); return; }
  const btn = document.getElementById('spSubmitBtn');
  if(btn){ btn.disabled = true; btn.textContent = '提交中…'; }
  const resetBtn = ()=>{ if(btn){ btn.disabled=false; btn.textContent = e.submitText||'提交报名'; } };
  if(e.capacity){
    const st = spCapState(e, await spFetchUsage(e));
    if(st.used!=null){
      if(st.full){ spToast('抱歉，名额已满'); resetBtn(); return; }
      if(st.mode==='people'){
        const mine = Number(values[spPeopleKey(e)]) || 1;
        if(mine > st.remaining){ spToast(`剩余名额不足（仅剩 ${st.remaining} 人）`); resetBtn(); return; }
      }
    }
  }
  try{
    const client = spInitClient();
    if(!client) throw new Error('未连接后台');
    const { error } = await client.from(SP_CONFIG.submissionsTable).insert({
      event_id: e.id, event_title: e.title, values,
    });
    if(error) throw error;
    spView='success'; spRender();
  }catch(err){
    console.error('提交报名失败', err);
    spToast('提交失败，请检查网络后重试');
    if(btn){ btn.disabled=false; btn.textContent = e.submitText||'提交报名'; }
  }
}

function spRenderSuccess(body){
  const e = spGetEvent(spCurrentId);
  body.innerHTML = `
    <div class="sp-success">
      <div class="sp-success-icon"><i class="ti ti-circle-check"></i></div>
      <div class="sp-success-title">报名成功！</div>
      <div class="sp-success-sub">我们已收到你的报名信息，期待与你相见。</div>
      <button class="sp-btn sp-btn-primary" style="padding:11px 28px" onclick="spGoDetail('${e?e.id:''}')">返回活动详情</button>
      <button class="sp-btn sp-btn-ghost" style="padding:11px 24px;margin-top:10px;display:inline-flex;align-items:center;gap:6px" onclick="spOpenShare('${e?e.id:''}')"><i class="ti ti-share-3"></i>邀请朋友一起来</button>
    </div>
  `;
}

// ── 管理员：登录 ──
function spOpenLogin(){
  document.getElementById('spLoginUser').value='';
  document.getElementById('spLoginPass').value='';
  document.getElementById('spLoginErr').classList.remove('show');
  document.getElementById('spLoginOverlay').classList.add('open');
}
function spCloseOverlay(ev, id){
  if(!ev || ev.target===document.getElementById(id)) document.getElementById(id).classList.remove('open');
}
function spDoLogin(){
  const u=document.getElementById('spLoginUser').value.trim(), p=document.getElementById('spLoginPass').value;
  if(u==='admin' && p==='church2026'){
    spIsAdmin=true;
    document.getElementById('spLoginOverlay').classList.remove('open');
    spUpdateAdminUI();
    spOpenManager();
  } else {
    document.getElementById('spLoginErr').classList.add('show');
  }
}
function spLogout(){
  spIsAdmin=false;
  spUpdateAdminUI();
  document.getElementById('spManagerOverlay').classList.remove('open');
}
function spUpdateAdminUI(){
  const btn = document.getElementById('spAdminBtn');
  btn.classList.toggle('is-admin', spIsAdmin);
  btn.title = spIsAdmin ? '管理活动' : '管理员登录';
}
function spAdminFabClick(){
  if(!spIsAdmin) spOpenLogin(); else spOpenManager();
}

// ── 管理员：活动列表 ──
let spCounts = {};
async function spLoadCounts(){
  const client = spInitClient(); if(!client) return;
  try{
    let res = await client.from(SP_CONFIG.submissionsTable).select('event_id,status,deleted_at').limit(10000);
    if(res.error) res = await client.from(SP_CONFIG.submissionsTable).select('event_id').limit(10000);
    if(res.error) throw res.error;
    const c = {};
    (res.data||[]).forEach(r=>{ if(r.deleted_at || r.status==='cancelled') return; c[r.event_id] = (c[r.event_id]||0)+1; });
    spCounts = c; spRenderManagerList();
  }catch(err){ console.error('统计报名数失败', err); }
}
function spOpenManager(){
  spRenderManagerList();
  const mw = document.getElementById('spManagerList');
  let bt = document.getElementById('spBuildTag');
  if(!bt && mw && mw.parentNode){ bt = document.createElement('div'); bt.id='spBuildTag'; bt.style.cssText='text-align:center;font-size:10.5px;color:#b0b4bd;padding:10px 0 2px'; mw.parentNode.insertBefore(bt, mw.nextSibling); }
  if(bt) bt.textContent = '页面版本 ' + SP_BUILD;
  document.getElementById('spManagerOverlay').classList.add('open');
  spLoadCounts();
}
function spRenderManagerList(){
  const wrap = document.getElementById('spManagerList');
  if(!spEvents.length){ wrap.innerHTML = `<div style="font-size:12.5px;color:var(--text-3);text-align:center;padding:20px 0">还没有报名活动，点上面的按钮新建一个</div>`; return; }
  const sorted = [...spEvents].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  wrap.innerHTML = sorted.map(e=>`
    <div class="sp-event-admin-card">
      <img class="sp-event-admin-thumb" src="${spEscapeHtml(e.coverImage)}" onerror="this.style.visibility='hidden'">
      <div class="sp-event-admin-body">
        <div class="sp-event-admin-title">${spEscapeHtml(e.title||'（未命名活动）')}</div>
        <div class="sp-event-admin-meta">${spFormatDate(e.date)||'未设置日期'}<span class="sp-cnt"><i class="ti ti-users"></i>${spCounts[e.id]!=null ? spCounts[e.id] : '–'}${e.capacity?' / '+e.capacity:''}</span>${spDeadlinePassed(e)?'<span class="sp-cnt" style="color:var(--text-3)"><i class="ti ti-lock"></i>已截止</span>':''}</div>
        <button class="sp-admin-share" onclick="spOpenShare('${e.id}')"><i class="ti ti-share-3"></i>分享 / 二维码</button>
      </div>
      <div class="sp-event-admin-actions">
        <label class="sp-switch" title="启用/关闭"><input type="checkbox" ${e.enabled?'checked':''} onchange="spToggleEnabled('${e.id}',this.checked)"><span class="track"></span><span class="thumb"></span></label>
        <button class="sp-mini-icon-btn" title="报名数据" onclick="spOpenSubmissions('${e.id}')"><i class="ti ti-clipboard-list"></i></button>
        <button class="sp-mini-icon-btn" title="编辑" onclick="spOpenEditor('${e.id}')"><i class="ti ti-pencil"></i></button>
        <button class="sp-mini-icon-btn danger" title="删除" onclick="spDeleteEvent('${e.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>
  `).join('');
}
async function spToggleEnabled(id, val){
  const e = spGetEvent(id); if(!e) return;
  const before = e.enabled;
  e.enabled = val; e.updatedAt = new Date().toISOString();
  try{ await spSaveEventsRemote(); spToast(val?'已启用':'已关闭'); }
  catch(err){ e.enabled = before; spRenderManagerList(); spToast('同步失败，请重试'); }
}
async function spDeleteEvent(id){
  if(!confirm('确定删除这个报名活动吗？报名数据不会一起删除。')) return;
  const before = spEvents;
  spEvents = spEvents.filter(e=>e.id!==id);
  try{ await spSaveEventsRemote(); spRenderManagerList(); if(spCurrentId===id){ spBoot(); } spToast('已删除'); }
  catch(err){ spEvents = before; spToast('删除失败，请重试'); }
}

// ── 管理员：编辑器 ──
function spOpenEditor(id){
  spEditingId = id;
  const e = id ? spGetEvent(id) : spNormEvent({ fields: spDefaultFields() });
  document.getElementById('spEditorTitle').textContent = id ? '编辑报名活动' : '新建报名活动';
  document.getElementById('spfTag').value = e.tag;
  document.getElementById('spfEnabled').checked = e.enabled;
  document.getElementById('spfTitle').value = e.title;
  document.getElementById('spfDate').value = e.date;
  document.getElementById('spfTimeStart').value = e.timeStart;
  document.getElementById('spfTimeEnd').value = e.timeEnd;
  document.getElementById('spfLocation').value = e.location;
  document.getElementById('spfAddress').value = e.address;
  document.getElementById('spfIntroTitle').value = e.introTitle;
  document.getElementById('spfIntro').value = e.intro;
  document.getElementById('spfHighlights').value = e.highlights.join(',');
  document.getElementById('spfDetailTitle').value = e.detailTitle;
  document.getElementById('spfDetail').value = e.detail;
  document.getElementById('spfCtaText').value = e.ctaText;
  document.getElementById('spfSubmitText').value = e.submitText;
  document.getElementById('spfCapacity').value = e.capacity || '';
  document.getElementById('spfCapacityMode').value = e.capacityMode;
  document.getElementById('spfDeadline').value = e.deadline || '';
  document.getElementById('spfShowRemaining').checked = e.showRemaining;
  const prev = document.getElementById('spEditorCoverPreview');
  prev.dataset.url = e.coverImage || '';
  prev.src = e.coverImage || ''; prev.style.display = e.coverImage ? '' : 'none';
  spEditorFields = e.fields.map(f=>Object.assign({}, f));
  spRenderFieldEditorList();
  document.getElementById('spManagerOverlay').classList.remove('open');
  document.getElementById('spEditorOverlay').classList.add('open');
}
function spRemoveCover(){
  const prev = document.getElementById('spEditorCoverPreview');
  prev.dataset.url=''; prev.src=''; prev.style.display='none';
}
async function spUploadCover(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const prev = document.getElementById('spEditorCoverPreview');
  try{
    const client = spInitClient();
    if(!client) throw new Error('未连接后台');
    const mime = file.type || 'image/png';
    const rawExt = (mime.split('/')[1] || file.name.split('.').pop() || 'png').toLowerCase();
    const ext = rawExt==='jpeg' ? 'jpg' : rawExt;
    const filePath = `signup/cover_${Date.now()}.${ext}`;
    const { error } = await client.storage.from(SP_CONFIG.bucket).upload(filePath, file, { contentType:mime, upsert:true });
    if(error) throw error;
    const { data } = client.storage.from(SP_CONFIG.bucket).getPublicUrl(filePath);
    prev.dataset.url = data.publicUrl; prev.src = data.publicUrl; prev.style.display='';
    spToast('✅ 封面图已上传');
  }catch(err){ console.error(err); spToast('上传失败：'+(err?.message||'请重试')); }
  finally{ input.value=''; }
}

function spRenderFieldEditorList(){
  const wrap = document.getElementById('spFieldEditorList');
  wrap.innerHTML = spEditorFields.map((f,i)=>`
    <div class="sp-field-editor-row">
      <div class="sp-field-editor-head">
        <span class="sp-field-idx">#${i+1}</span>
        <input type="text" class="sp-input" style="flex:1;padding:7px 9px;font-size:12.5px" placeholder="字段标签，如：姓名" value="${spEscapeHtml(f.label)}" oninput="spEditorFields[${i}].label=this.value">
        <select class="sp-select" style="width:122px;flex-shrink:0;padding:7px 8px;font-size:12px" onchange="spEditorFields[${i}].type=this.value;spRenderFieldEditorList()">
          ${SP_FIELD_TYPES.map(t=>`<option value="${t.v}" ${f.type===t.v?'selected':''}>${t.label}</option>`).join('')}
        </select>
        <button class="sp-mini-icon-btn" onclick="spMoveField(${i},-1)" ${i===0?'disabled':''}><i class="ti ti-arrow-up"></i></button>
        <button class="sp-mini-icon-btn" onclick="spMoveField(${i},1)" ${i===spEditorFields.length-1?'disabled':''}><i class="ti ti-arrow-down"></i></button>
        <button class="sp-mini-icon-btn danger" onclick="spRemoveField(${i})"><i class="ti ti-trash"></i></button>
      </div>
      <div class="sp-row-2">
        <input type="text" class="sp-input" style="padding:7px 9px;font-size:12.5px" placeholder="占位提示文字" value="${spEscapeHtml(f.placeholder)}" oninput="spEditorFields[${i}].placeholder=this.value">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2)">
          <input type="checkbox" ${f.required?'checked':''} onchange="spEditorFields[${i}].required=this.checked" style="width:15px;height:15px">必填
        </label>
      </div>
      ${['select','radio','checkbox'].includes(f.type)?`
        <input type="text" class="sp-input" style="margin-top:8px;padding:7px 9px;font-size:12.5px" placeholder="选项，用逗号分隔，如：是,否" value="${spEscapeHtml(f.options.join(','))}" oninput="spEditorFields[${i}].options=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
      `:''}
      ${f.type==='number'?`
        <div class="sp-row-2" style="margin-top:8px">
          <input type="number" class="sp-input" style="padding:7px 9px;font-size:12.5px" placeholder="最小值" value="${f.min}" oninput="spEditorFields[${i}].min=Number(this.value)||0">
          <input type="number" class="sp-input" style="padding:7px 9px;font-size:12.5px" placeholder="最大值" value="${f.max}" oninput="spEditorFields[${i}].max=Number(this.value)||0">
        </div>
      `:''}
      ${f.type==='textarea'?`
        <input type="number" class="sp-input" style="margin-top:8px;padding:7px 9px;font-size:12.5px" placeholder="最多字数" value="${f.maxLength}" oninput="spEditorFields[${i}].maxLength=Number(this.value)||200">
      `:''}
    </div>
  `).join('') || `<div style="font-size:12px;color:var(--text-3);text-align:center;padding:14px 0">还没有字段，点"添加字段"开始</div>`;
}
function spAddField(){
  spEditorFields.push({id:spUid(), type:'text', label:'', placeholder:'', required:false, options:[], min:0, max:99, default:1, maxLength:200});
  spRenderFieldEditorList();
}
function spRemoveField(i){ spEditorFields.splice(i,1); spRenderFieldEditorList(); }
function spMoveField(i, dir){
  const j=i+dir; if(j<0||j>=spEditorFields.length) return;
  [spEditorFields[i],spEditorFields[j]]=[spEditorFields[j],spEditorFields[i]];
  spRenderFieldEditorList();
}

async function spSaveEvent(){
  const title = document.getElementById('spfTitle').value.trim();
  if(!title){ spToast('请填写活动标题'); return; }
  const fields = spEditorFields.map(spNormField).filter(f=>f.label);
  if(!fields.length){ spToast('请至少保留一个报名信息字段'); return; }
  const data = {
    id: spEditingId || spUid(),
    enabled: document.getElementById('spfEnabled').checked,
    coverImage: document.getElementById('spEditorCoverPreview').dataset.url || '',
    tag: document.getElementById('spfTag').value.trim(),
    title,
    date: document.getElementById('spfDate').value,
    timeStart: document.getElementById('spfTimeStart').value,
    timeEnd: document.getElementById('spfTimeEnd').value,
    location: document.getElementById('spfLocation').value.trim(),
    address: document.getElementById('spfAddress').value.trim(),
    introTitle: document.getElementById('spfIntroTitle').value.trim(),
    intro: document.getElementById('spfIntro').value,
    highlights: document.getElementById('spfHighlights').value.split(',').map(s=>s.trim()).filter(Boolean),
    detailTitle: document.getElementById('spfDetailTitle').value.trim() || '活动详情',
    detail: document.getElementById('spfDetail').value,
    ctaText: document.getElementById('spfCtaText').value.trim() || '立即报名',
    submitText: document.getElementById('spfSubmitText').value.trim() || '提交报名',
    capacity: Math.max(0, parseInt(document.getElementById('spfCapacity').value,10) || 0),
    capacityMode: document.getElementById('spfCapacityMode').value,
    deadline: document.getElementById('spfDeadline').value || '',
    showRemaining: document.getElementById('spfShowRemaining').checked,
    fields,
    createdAt: (spEditingId && spGetEvent(spEditingId)) ? spGetEvent(spEditingId).createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const norm = spNormEvent(data);
  const before = spEvents;
  if(spEditingId && spGetEvent(spEditingId)){
    spEvents = spEvents.map(e=>e.id===spEditingId ? norm : e);
  } else {
    spEvents = [...spEvents, norm];
  }
  try{
    await spSaveEventsRemote();
    document.getElementById('spEditorOverlay').classList.remove('open');
    spOpenManager();
    spToast('✅ 已保存并对所有人发布');
    if(spCurrentId===norm.id || !spCurrentId) spBoot();
  }catch(err){
    spEvents = before;
    spToast('保存失败，请检查网络后重试');
  }
}

// ── 管理员：报名数据查看 / 导出 ──
async function spOpenSubmissions(eventId){
  spSubsCurrentEvent = spGetEvent(eventId);
  document.getElementById('spSubsTitle').textContent = '报名数据 · ' + (spSubsCurrentEvent ? spSubsCurrentEvent.title : '');
  document.getElementById('spManagerOverlay').classList.remove('open');
  document.getElementById('spSubsSearch').value = '';
  document.getElementById('spSubsFrom').value = '';
  document.getElementById('spSubsTo').value = '';
  spStatusFilter = 'all'; spShown = SP_PAGE; spOpenIds.clear(); spSelected.clear();
  if(spSelectMode) spToggleSelectMode();
  spSwitchSubsTab('list');
  document.getElementById('spSubsOverlay').classList.add('open');
  await spLoadSubmissions();
}
let spSubsSortDesc = true;
let spSelectMode = false;
let spSelected = new Set();
let spSubsTab = 'list';
let spTrendDays = 14;
let spVisibleIds = [];
const SP_PAGE = 20;
let spShown = SP_PAGE;
let spStatusFilter = 'all';
let spOpenIds = new Set();
let spFilterTm = null;
const SP_AVATAR_COLORS = ['#1D9E75','#4C8DF6','#F2994A','#9B6BDF','#E6484F','#17A2B8','#D4A017','#6C7A89'];

// 根据字段名推断图标：优先匹配活动里定义的字段类型，其次按关键词猜测
function spIconForLabel(label){
  const ev = spSubsCurrentEvent;
  const f = ev && ev.fields ? ev.fields.find(x=>x.label===label) : null;
  const l = String(label||'');
  if(/姓名|名字|称呼/.test(l)) return 'ti-user';
  if(/手机|电话|微信|whatsapp/i.test(l)) return 'ti-phone';
  if(/邮箱|email|mail/i.test(l)) return 'ti-mail';
  if(/人数|几人|陪同/.test(l)) return 'ti-users';
  if(/备注|需要|留言|说明/.test(l)) return 'ti-message-2';
  if(/地址|地点/.test(l)) return 'ti-map-pin';
  if(f) return spFieldIcon(f.type);
  return 'ti-point';
}
function spFieldTypeOf(label){
  const f = spSubsCurrentEvent && spSubsCurrentEvent.fields ? spSubsCurrentEvent.fields.find(x=>x.label===label) : null;
  if(f) return f.type;
  if(/手机|电话/.test(label)) return 'tel';
  if(/邮箱|email/i.test(label)) return 'email';
  return 'text';
}
// 找出「主要人名」「联系电话」「人数」
function spPickKey(vals, type, regex){
  const keys = Object.keys(vals);
  let k = keys.find(x=>regex.test(x));
  if(!k && spSubsCurrentEvent){
    const f = spSubsCurrentEvent.fields.find(x=>x.type===type && keys.includes(x.label));
    if(f) k = f.label;
  }
  return k;
}
function spSubSummary(s){
  const vals = s.values || {};
  const nameKey = spPickKey(vals,'text',/姓名|名字|称呼/) || Object.keys(vals)[0];
  const telKey = spPickKey(vals,'tel',/手机|电话/);
  const numKey = Object.keys(vals).find(k=>/人数|几人|陪同/.test(k)) || spPickKey(vals,'number',/^$/);
  const name = String((nameKey && vals[nameKey]) || '未填写姓名');
  const num = numKey && Number(vals[numKey]) ? Number(vals[numKey]) : null;
  return { name, nameKey, telKey, numKey, num, tel: telKey ? String(vals[telKey]||'') : '' };
}
function spHasCol(c){ return !spSubsCache.length || (c in spSubsCache[0]); }
function spIsDeleted(s){ return !!s.deleted_at; }
function spStatusOf(s){ return SP_STATUS[s.status] ? s.status : 'pending'; }
function spNormId(x){ return isNaN(x) ? x : Number(x); }
function spToday0(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
function spYmd(d){ const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function spRelTime(iso){
  if(!iso) return '';
  const d = new Date(iso), diff = (Date.now()-d.getTime())/1000;
  if(diff<60) return '刚刚';
  if(diff<3600) return Math.floor(diff/60)+' 分钟前';
  if(diff<86400) return Math.floor(diff/3600)+' 小时前';
  if(diff<86400*7) return Math.floor(diff/86400)+' 天前';
  return d.toLocaleDateString('zh-CN');
}
function spFmtFull(iso){ return iso ? new Date(iso).toLocaleString('zh-CN') : ''; }

function spRenderSubsStats(){
  const live = spSubsCache.filter(s=>!spIsDeleted(s));
  const act = live.filter(s=>spStatusOf(s)!=='cancelled');
  const t0 = spToday0();
  const todayCnt = live.filter(s=>s.created_at && new Date(s.created_at)>=t0).length;
  const people = act.reduce((n,s)=>n+(spSubSummary(s).num||0),0);
  let html = `
    <div class="sp-stat accent"><div class="sp-stat-top"><i class="ti ti-clipboard-check"></i>报名总数</div><div class="sp-stat-num">${live.length}</div></div>
    <div class="sp-stat"><div class="sp-stat-top"><i class="ti ti-calendar-plus"></i>今日新增</div><div class="sp-stat-num">${todayCnt}</div></div>
    <div class="sp-stat"><div class="sp-stat-top"><i class="ti ti-users"></i>预计人数</div><div class="sp-stat-num">${people||'—'}</div></div>`;
  const ev = spSubsCurrentEvent;
  if(ev && ev.capacity){
    const mode = (ev.capacityMode==='people' && spPeopleKey(ev)) ? 'people' : 'count';
    const used = mode==='people' ? people : act.length;
    const pct = Math.min(100, Math.round(used/ev.capacity*100));
    html += `<div class="sp-stat sp-stat-wide${used>=ev.capacity?' full':''}">
      <div class="sp-stat-top"><i class="ti ti-ticket"></i>名额 ${used} / ${ev.capacity}${mode==='people'?' 人':''}（不含已取消）<span class="sp-stat-pct">${used>=ev.capacity?'已满':'剩余 '+(ev.capacity-used)}</span></div>
      <div class="sp-cap-track" style="margin-top:6px"><div class="sp-cap-fill" style="width:${pct}%"></div></div></div>`;
  }
  document.getElementById('spSubsStats').innerHTML = html;
  const last = live.length ? live.reduce((a,b)=>new Date(a.created_at)>new Date(b.created_at)?a:b) : null;
  const parts = [];
  if(last) parts.push(`<i class="ti ti-clock"></i>最近报名 ${spRelTime(last.created_at)}`);
  if(ev && spDeadlineTs(ev)!=null) parts.push(`<i class="ti ti-hourglass-high"></i>${spDeadlinePassed(ev)?'已截止':'截止 '+spFmtDeadline(ev)}`);
  document.getElementById('spSubsSub').innerHTML = parts.join(' &nbsp;·&nbsp; ');
  const warn = document.getElementById('spSchemaWarn');
  const old = spSubsCache.length && !spHasCol('status');
  warn.classList.toggle('show', !!old);
  if(old) warn.innerHTML = '<b>数据库还没有升级</b>：状态、备注、签到、撤销与回收站暂不可用。请在 Supabase → SQL Editor 执行 <b>signup_upgrade.sql</b> 后刷新。';
}

function spFilteredSubs(){
  let list = spSubsCache.slice();
  if(spStatusFilter==='trash') list = list.filter(spIsDeleted);
  else {
    list = list.filter(s=>!spIsDeleted(s));
    if(spStatusFilter!=='all') list = list.filter(s=>spStatusOf(s)===spStatusFilter);
  }
  const from = document.getElementById('spSubsFrom').value, to = document.getElementById('spSubsTo').value;
  if(from){ const f = new Date(from+'T00:00:00'); list = list.filter(s=>new Date(s.created_at)>=f); }
  if(to){ const t = new Date(to+'T00:00:00'); t.setDate(t.getDate()+1); list = list.filter(s=>new Date(s.created_at)<t); }
  const q = (document.getElementById('spSubsSearch').value||'').trim().toLowerCase();
  if(q) list = list.filter(s=>{
    const vals = Object.values(s.values||{}).map(v=>Array.isArray(v)?v.join(' '):String(v==null?'':v));
    return vals.concat([s.admin_note||'']).some(v=>v.toLowerCase().includes(q));
  });
  list.sort((a,b)=>{ const d = new Date(a.created_at)-new Date(b.created_at); return spSubsSortDesc ? -d : d; });
  return list;
}
function spRenderChips(){
  const box = document.getElementById('spSubsChips'); if(!box) return;
  const live = spSubsCache.filter(s=>!spIsDeleted(s));
  const chips = [['all','ti-list','全部',live.length]];
  if(spHasCol('status')) Object.keys(SP_STATUS).forEach(k=>chips.push([k, SP_STATUS[k].icon, SP_STATUS[k].label, live.filter(s=>spStatusOf(s)===k).length]));
  if(spHasCol('deleted_at')) chips.push(['trash','ti-trash','回收站',spSubsCache.length-live.length]);
  box.innerHTML = chips.map(c=>`<button class="sp-fchip${spStatusFilter===c[0]?' active':''}" onclick="spSetStatusFilter('${c[0]}')"><i class="ti ${c[1]}"></i>${c[2]}<em>${c[3]}</em></button>`).join('');
}
function spSetStatusFilter(k){ spStatusFilter = k; spShown = SP_PAGE; spSelected.clear(); spRenderSubs(); }
function spOnFilterChange(){
  clearTimeout(spFilterTm);
  spFilterTm = setTimeout(()=>{ spShown = SP_PAGE; spRenderSubs(); }, 120);
}
function spClearDates(){ document.getElementById('spSubsFrom').value=''; document.getElementById('spSubsTo').value=''; spOnFilterChange(); }
function spQuickRange(days){
  const t = spToday0(), f = new Date(t); f.setDate(f.getDate()-(days-1));
  document.getElementById('spSubsFrom').value = spYmd(f);
  document.getElementById('spSubsTo').value = spYmd(t);
  spOnFilterChange();
}
function spShowMore(){ spShown += SP_PAGE; spRenderSubs(); }

function spValueHtml(label, v){
  const type = spFieldTypeOf(label);
  const isEmpty = v==null || v==='' || (Array.isArray(v) && !v.length);
  if(isEmpty) return `<div class="sp-sub-item-val empty">未填写</div>`;
  if(Array.isArray(v)) return `<div class="sp-val-chips">${v.map(x=>`<span class="sp-val-chip">${spEscapeHtml(x)}</span>`).join('')}</div>`;
  const t = spEscapeHtml(v);
  if(type==='tel') return `<div class="sp-sub-item-val"><a href="tel:${t}">${t}</a></div>`;
  if(type==='email') return `<div class="sp-sub-item-val"><a href="mailto:${t}">${t}</a></div>`;
  if(type==='radio' || type==='select') return `<div class="sp-val-chips"><span class="sp-val-chip">${t}</span></div>`;
  return `<div class="sp-sub-item-val">${t}</div>`;
}

function spRenderSubs(){
  const wrap = document.getElementById('spSubsList');
  const q = (document.getElementById('spSubsSearch').value||'').trim();
  document.getElementById('spSubsSearchClear').classList.toggle('show', !!q);
  const hasDate = document.getElementById('spSubsFrom').value || document.getElementById('spSubsTo').value;
  document.getElementById('spDateClear').style.display = hasDate ? '' : 'none';
  spRenderChips();
  const list = spFilteredSubs();
  spVisibleIds = list.map(s=>String(s.id));
  spUpdateBatchBar();
  if(!spSubsCache.length){
    wrap.innerHTML = `<div class="sp-subs-empty"><i class="ti ti-inbox"></i>暂无报名记录<br>分享活动链接，等待第一位报名者吧</div>`; return;
  }
  if(!list.length){
    const why = spStatusFilter==='trash' ? '回收站是空的' : (q||hasDate||spStatusFilter!=='all') ? '没有符合当前筛选条件的记录' : '暂无记录';
    wrap.innerHTML = `<div class="sp-subs-empty"><i class="ti ti-search-off"></i>${why}</div>`; return;
  }
  const inTrash = spStatusFilter==='trash';
  const hasStatus = spHasCol('status');
  const dayAgo = Date.now() - 86400000;
  const shown = list.slice(0, spShown);
  wrap.innerHTML = shown.map(s=>{
    const vals = s.values || {};
    const sm = spSubSummary(s);
    const sid = String(s.id);
    const st = spStatusOf(s);
    const color = SP_AVATAR_COLORS[(s.id!=null && !isNaN(s.id) ? Number(s.id) : sm.name.charCodeAt(0)) % SP_AVATAR_COLORS.length] || SP_AVATAR_COLORS[0];
    const isNew = s.created_at && new Date(s.created_at).getTime() > dayAgo && !inTrash;
    const sel = spSelected.has(sid);
    const open = spOpenIds.has(sid);
    const items = Object.keys(vals).map(k=>{
      const raw = vals[k];
      const copyable = !(raw==null||raw===''||(Array.isArray(raw)&&!raw.length));
      const copyText = Array.isArray(raw) ? raw.join('、') : String(raw==null?'':raw);
      return `<div class="sp-sub-item">
        <div class="sp-sub-item-icon"><i class="ti ${spIconForLabel(k)}"></i></div>
        <div class="sp-sub-item-body"><div class="sp-sub-item-label">${spEscapeHtml(k)}</div>${spValueHtml(k, raw)}</div>
        ${copyable ? `<div class="sp-sub-item-act"><button class="sp-mini-icon-btn" title="复制" aria-label="复制" onclick="spCopyText(decodeURIComponent('${encodeURIComponent(copyText)}'))"><i class="ti ti-copy"></i></button></div>` : ''}
      </div>`;
    }).join('');
    const pill = inTrash
      ? `<span class="sp-st-pill st-trash"><i class="ti ti-trash"></i>已删除</span>`
      : (hasStatus ? `<span class="sp-st-pill st-${st}"><i class="ti ${SP_STATUS[st].icon}"></i>${SP_STATUS[st].label}</span>` : '');
    const statusBlock = (!inTrash && hasStatus) ? `
      <div class="sp-sub-item"><div class="sp-sub-item-icon"><i class="ti ti-flag"></i></div>
        <div class="sp-sub-item-body"><div class="sp-sub-item-label">处理状态</div>
          <div class="sp-st-opts">${Object.keys(SP_STATUS).map(k=>`<button class="sp-st-opt${k===st?' active st-'+k:''}" onclick="spSetStatus('${sid}','${k}')"><i class="ti ${SP_STATUS[k].icon}"></i>${SP_STATUS[k].label}</button>`).join('')}</div></div></div>
      <div class="sp-sub-item"><div class="sp-sub-item-icon"><i class="ti ti-notes"></i></div>
        <div class="sp-sub-item-body"><div class="sp-sub-item-label">管理员备注（仅后台可见）</div>
          <textarea class="sp-note" placeholder="如：已电话确认、需安排轮椅…" data-orig="${spEscapeHtml(s.admin_note||'')}" onblur="spSaveNote('${sid}',this)">${spEscapeHtml(s.admin_note||'')}</textarea></div></div>` : '';
    const checkInfo = s.checked_in_at && st==='checked_in' ? `<div class="sp-sub-item"><div class="sp-sub-item-icon"><i class="ti ti-user-check"></i></div><div class="sp-sub-item-body"><div class="sp-sub-item-label">签到时间</div><div class="sp-sub-item-val">${spFmtFull(s.checked_in_at)}</div></div></div>` : '';
    const foot = inTrash
      ? `<button class="sp-btn sp-btn-ghost" onclick="spRestoreSubs(['${sid}'])"><i class="ti ti-arrow-back-up"></i>恢复</button>
         <button class="sp-btn sp-btn-danger" onclick="spPurgeSubs(['${sid}'])"><i class="ti ti-trash-x"></i>彻底删除</button>`
      : `${(hasStatus && st!=='checked_in' && st!=='cancelled')?`<button class="sp-btn sp-btn-primary" onclick="spSetStatus('${sid}','checked_in')"><i class="ti ti-user-check"></i>签到</button>`:''}
         ${sm.tel?`<a class="sp-btn sp-btn-ghost" href="tel:${spEscapeHtml(sm.tel)}" style="text-decoration:none"><i class="ti ti-phone-call"></i>拨打</a>`:''}
         <button class="sp-btn sp-btn-danger" onclick="spDeleteSubmission('${sid}')"><i class="ti ti-trash"></i>删除</button>`;
    return `<div class="sp-sub-card${sel?' selected':''}${open?' open':''}${st==='cancelled'&&!inTrash?' is-cancelled':''}${inTrash?' is-trash':''}" id="spSub_${sid}">
      <div class="sp-sub-head" onclick="spToggleSub('${sid}')">
        ${spSelectMode?`<input type="checkbox" class="sp-sub-check" aria-label="选择" ${sel?'checked':''} onclick="event.stopPropagation()" onchange="spPickSub('${sid}',this.checked)">`:''}
        <div class="sp-sub-avatar" style="background:${color}">${spEscapeHtml(sm.name.trim().charAt(0).toUpperCase()||'?')}</div>
        <div class="sp-sub-main">
          <div class="sp-sub-name">${spEscapeHtml(sm.name)}${isNew?'<span class="sp-sub-new">NEW</span>':''}</div>
          <div class="sp-sub-time">${pill}<i class="ti ti-clock"></i>${inTrash&&s.deleted_at?'删除于 '+spRelTime(s.deleted_at):spRelTime(s.created_at)}${sm.tel?` · <i class="ti ti-phone"></i>${spEscapeHtml(sm.tel)}`:''}</div>
        </div>
        ${sm.num?`<span class="sp-sub-badge"><i class="ti ti-users"></i>${sm.num}人</span>`:''}
        <i class="ti ti-chevron-down sp-sub-chevron"></i>
      </div>
      <div class="sp-sub-detail">
        ${items}
        <div class="sp-sub-item"><div class="sp-sub-item-icon"><i class="ti ti-calendar-time"></i></div>
          <div class="sp-sub-item-body"><div class="sp-sub-item-label">提交时间</div><div class="sp-sub-item-val">${spFmtFull(s.created_at)}</div></div></div>
        ${checkInfo}
        ${statusBlock}
        <div class="sp-sub-foot">${foot}</div>
      </div>
    </div>`;
  }).join('') + (list.length>shown.length ? `<button class="sp-more-btn" onclick="spShowMore()">加载更多（还有 ${list.length-shown.length} 条）</button>` : `<div style="text-align:center;font-size:11.5px;color:var(--text-4);padding:4px 0 8px">共 ${list.length} 条</div>`);
}
function spToggleSub(id){
  id = String(id);
  if(spSelectMode){ spPickSub(id, !spSelected.has(id)); const cb = (document.getElementById('spSub_'+id)||document).querySelector('.sp-sub-check'); if(cb) cb.checked = spSelected.has(id); return; }
  const el = document.getElementById('spSub_'+id); if(!el) return;
  el.classList.toggle('open');
  if(el.classList.contains('open')) spOpenIds.add(id); else spOpenIds.delete(id);
}
function spClearSubsSearch(){ const i = document.getElementById('spSubsSearch'); i.value=''; spShown = SP_PAGE; spRenderSubs(); i.focus(); }
function spToggleSubsSort(){
  spSubsSortDesc = !spSubsSortDesc;
  document.querySelector('#spSubsSortBtn i').className = 'ti ' + (spSubsSortDesc ? 'ti-sort-descending' : 'ti-sort-ascending');
  spToast(spSubsSortDesc ? '按时间：最新优先' : '按时间：最早优先');
  spShown = SP_PAGE; spRenderSubs();
}
async function spCopyText(text){
  try{ await navigator.clipboard.writeText(text); spToast('已复制'); }
  catch(e){
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); spToast('已复制'); }catch(_){ spToast('复制失败'); }
    document.body.removeChild(ta);
  }
}

async function spLoadSubmissions(){
  const wrap = document.getElementById('spSubsList');
  const refreshBtn = document.querySelector('.sp-subs-toolbar .sp-tool-btn[title="刷新"]');
  if(refreshBtn) refreshBtn.classList.add('spin');
  wrap.innerHTML = '<div class="sp-skel"></div><div class="sp-skel"></div><div class="sp-skel"></div>';
  try{
    const client = spInitClient();
    const out = [], PAGE = 1000;
    for(let from=0; from<20000; from+=PAGE){
      const { data, error } = await client.from(SP_CONFIG.submissionsTable)
        .select('*').eq('event_id', spSubsCurrentEvent.id).order('created_at', { ascending:false }).range(from, from+PAGE-1);
      if(error) throw error;
      out.push(...(data||[]));
      if(!data || data.length<PAGE) break;
    }
    spSubsCache = out;
    const ids = new Set(out.map(s=>String(s.id)));
    spSelected.forEach(id=>{ if(!ids.has(id)) spSelected.delete(id); });
    spRenderSubsStats();
    spRenderSubs();
    if(spSubsTab==='chart') spRenderSubsCharts();
  }catch(err){
    console.error(err);
    spSubsCache = [];
    spRenderSubsStats();
    wrap.innerHTML = `<div class="sp-subs-empty"><i class="ti ti-cloud-off"></i>加载失败，请检查网络或后台是否已建好 ${SP_CONFIG.submissionsTable} 表<button class="sp-btn sp-btn-ghost" style="margin-top:6px" onclick="spLoadSubmissions()"><i class="ti ti-refresh"></i> 重试</button></div>`;
  }finally{
    if(refreshBtn) refreshBtn.classList.remove('spin');
  }
}
async function spUpdateSubs(ids, patch){
  ids = [].concat(ids).map(String);
  const client = spInitClient();
  const { error } = await client.from(SP_CONFIG.submissionsTable).update(patch).in('id', ids.map(spNormId));
  if(error){
    console.error(error);
    spToast(/column|schema|does not exist/i.test(error.message||'') ? '请先在 Supabase 执行 signup_upgrade.sql 升级数据库' : '操作失败，请检查权限或网络');
    return false;
  }
  spSubsCache.forEach(s=>{ if(ids.includes(String(s.id))) Object.assign(s, patch); });
  return true;
}
function spAfterChange(){ spRenderSubsStats(); spRenderSubs(); if(spSubsTab==='chart') spRenderSubsCharts(); spLoadCounts(); }
async function spSetStatus(id, st){
  const ok = await spUpdateSubs(id, { status: st, checked_in_at: st==='checked_in' ? new Date().toISOString() : null });
  if(ok){ spAfterChange(); spToast('已设为「' + SP_STATUS[st].label + '」'); }
}
async function spBatchSetStatus(st){
  const sel = document.getElementById('spBatchStatus'); sel.value = '';
  if(!st || !spSelected.size) return;
  const ids = [...spSelected];
  const ok = await spUpdateSubs(ids, { status: st, checked_in_at: st==='checked_in' ? new Date().toISOString() : null });
  if(ok){ spAfterChange(); spToast(`已将 ${ids.length} 条设为「${SP_STATUS[st].label}」`); }
}
async function spSaveNote(id, el){
  const val = el.value.trim();
  if(val === (el.dataset.orig||'')) return;
  if(await spUpdateSubs(id, { admin_note: val || null })){ el.dataset.orig = val; spToast('备注已保存'); }
}
let spUndoTm = null;
const SP_BUILD = '20261015a';
// 撤销提示条：由 JS 动态创建、样式全部内联，不依赖 HTML 结构和 CSS 文件是否为最新
function spEnsureUndoEl(){
  let box = document.getElementById('spUndoToast');
  if(box) return box;
  box = document.createElement('div');
  box.id = 'spUndoToast';
  box.style.cssText = 'display:none;position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:2147483000;align-items:center;gap:8px;max-width:92vw;padding:8px 8px 8px 14px;border-radius:999px;background:rgba(26,26,26,.94);color:#fff;font-size:13px;line-height:1.2;box-shadow:0 6px 20px rgba(0,0,0,.25);transition:opacity .2s;opacity:0';
  box.innerHTML = '<span id="spUndoMsg" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span><button id="spUndoBtn" type="button" style="border:none;background:rgba(255,255,255,.16);color:#7ef0c6;font-weight:800;font-size:12.5px;font-family:inherit;padding:6px 13px;border-radius:999px;cursor:pointer;flex-shrink:0">撤销</button>';
  document.body.appendChild(box);
  return box;
}
// 清理旧版 HTML 里残留的静态提示条（旧版曾直接写在页面里）
(function(){ const old = document.getElementById('spUndo'); if(old) old.remove(); })();
function spHideUndo(){
  const box = document.getElementById('spUndoToast'); if(!box) return;
  clearTimeout(spUndoTm);
  box.style.opacity = '0';
  spUndoTm = setTimeout(()=>{ box.style.display = 'none'; }, 220);
}
function spUndoToast(msg, fn){
  const box = spEnsureUndoEl();
  box.querySelector('#spUndoMsg').textContent = msg;
  box.querySelector('#spUndoBtn').onclick = ()=>{ spHideUndo(); fn(); };
  clearTimeout(spUndoTm);
  box.style.display = 'flex';
  requestAnimationFrame(()=>{ box.style.opacity = '1'; });
  spUndoTm = setTimeout(spHideUndo, 7000);
}
async function spDeleteSubmission(id){ return spSoftDelete([String(id)]); }
async function spSoftDelete(ids){
  if(!ids.length) return;
  if(!spHasCol('deleted_at')){
    if(!confirm(`确定永久删除 ${ids.length} 条报名记录吗？\n（升级数据库后即可使用「撤销」与「回收站」）`)) return;
    return spPurgeSubs(ids, true);
  }
  if(await spUpdateSubs(ids, { deleted_at: new Date().toISOString() })){
    ids.forEach(id=>spSelected.delete(String(id)));
    spAfterChange();
    spUndoToast(`已删除 ${ids.length} 条`, ()=>spRestoreSubs(ids));
  }
}
async function spRestoreSubs(ids){
  if(await spUpdateSubs(ids, { deleted_at: null })){ ids.forEach(id=>spSelected.delete(String(id))); spAfterChange(); spToast(`已恢复 ${ids.length} 条`); }
}
async function spPurgeSubs(ids, skipConfirm){
  if(!skipConfirm && !confirm(`彻底删除 ${ids.length} 条记录后无法恢复，确定吗？`)) return;
  try{
    const client = spInitClient();
    const { error } = await client.from(SP_CONFIG.submissionsTable).delete().in('id', ids.map(spNormId));
    if(error) throw error;
    const set = new Set(ids.map(String));
    spSubsCache = spSubsCache.filter(s=>!set.has(String(s.id)));
    set.forEach(id=>spSelected.delete(id));
    spAfterChange(); spToast(`已彻底删除 ${ids.length} 条`);
  }catch(err){ console.error(err); spToast('删除失败，请检查权限或网络'); }
}
// ── Tab 切换 ──
function spSwitchSubsTab(tab){
  spSubsTab = tab;
  document.querySelectorAll('#spSubsTabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  const isList = tab==='list';
  document.getElementById('spSubsList').style.display = isList ? '' : 'none';
  document.getElementById('spSubsCharts').style.display = isList ? 'none' : '';
  document.getElementById('spSubsListTools').style.display = isList ? '' : 'none';
  document.getElementById('spSelectModeBtn').style.display = isList ? '' : 'none';
  if(!isList){ if(spSelectMode) spToggleSelectMode(); spRenderSubsCharts(); }
}

// ── 批量选择 / 删除 ──
function spToggleSelectMode(){
  spSelectMode = !spSelectMode;
  spSelected.clear();
  document.getElementById('spSelectModeBtn').classList.toggle('active', spSelectMode);
  document.querySelector('#spSelectModeBtn span').textContent = spSelectMode ? '取消' : '批量';
  document.getElementById('spBatchBar').classList.toggle('show', spSelectMode);
  spRenderSubs();
}
function spPickSub(id, on){
  id = String(id);
  if(on) spSelected.add(id); else spSelected.delete(id);
  const el = document.getElementById('spSub_'+id);
  if(el) el.classList.toggle('selected', on);
  spUpdateBatchBar();
}
function spSelectAllToggle(on){
  spVisibleIds.forEach(id=> on ? spSelected.add(id) : spSelected.delete(id));
  spRenderSubs();
}
function spUpdateBatchBar(){
  const n = spSelected.size, trash = spStatusFilter==='trash';
  const c = document.getElementById('spBatchCount'); if(c) c.textContent = '已选 ' + n + ' 条';
  const show = (id, on)=>{ const b = document.getElementById(id); if(b){ b.style.display = on ? '' : 'none'; if('disabled' in b) b.disabled = n===0; } };
  show('spBatchDelBtn', !trash); show('spBatchRestoreBtn', trash); show('spBatchPurgeBtn', trash);
  const st = document.getElementById('spBatchStatus'); if(st) st.style.display = (!trash && spHasCol('status')) ? '' : 'none';
  const all = document.getElementById('spSelectAll');
  if(all) all.checked = spVisibleIds.length>0 && spVisibleIds.every(id=>spSelected.has(id));
}
function spBatchDelete(){ return spSoftDelete([...spSelected]); }
function spBatchRestore(){ if(spSelected.size) return spRestoreSubs([...spSelected]); }
function spBatchPurge(){ if(spSelected.size) return spPurgeSubs([...spSelected]); }

// ── 图表 ──
function spRenderSubsCharts(){
  const box = document.getElementById('spSubsCharts');
  const live = spSubsCache.filter(s=>!spIsDeleted(s));
  const list = live.filter(s=>spStatusOf(s)!=='cancelled');
  if(!live.length){ box.innerHTML = '<div class="sp-subs-empty"><i class="ti ti-chart-bar-off"></i>暂无数据，报名后这里会生成图表</div>'; return; }
  const colors = ['#1D9E75','#4C8DF6','#F2994A','#9B6BDF','#E6484F','#17A2B8','#D4A017','#6C7A89'];
  let html = '';

  // 1) 报名趋势
  const days = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for(let i=spTrendDays-1;i>=0;i--){ const d = new Date(today); d.setDate(d.getDate()-i); days.push(d); }
  const counts = days.map(d=>{
    const end = new Date(d); end.setDate(end.getDate()+1);
    return list.filter(s=>{ const t = new Date(s.created_at); return t>=d && t<end; }).length;
  });
  const max = Math.max(1, ...counts);
  const inRange = counts.reduce((a,b)=>a+b,0);
  html += `<div class="sp-chart-card">
    <div class="sp-chart-title"><i class="ti ti-chart-line"></i>报名趋势
      <div class="sp-range">
        <button class="${spTrendDays===7?'active':''}" onclick="spSetTrendDays(7)">7天</button>
        <button class="${spTrendDays===14?'active':''}" onclick="spSetTrendDays(14)">14天</button>
        <button class="${spTrendDays===30?'active':''}" onclick="spSetTrendDays(30)">30天</button>
      </div></div>
    <div class="sp-trend">${days.map((d,i)=>{
      const c = counts[i];
      const showLbl = spTrendDays<=14 || i%5===0 || i===days.length-1;
      return `<div class="sp-trend-col"><div class="sp-trend-bar${c?'':' zero'}" style="height:${c?Math.max(6,c/max*100):2}%">${c&&spTrendDays<=14?`<span>${c}</span>`:''}</div><div class="sp-trend-label">${showLbl?(d.getMonth()+1)+'/'+d.getDate():''}</div></div>`;
    }).join('')}</div>
    <div style="font-size:11.5px;color:var(--text-3);margin-top:8px;text-align:right">近 ${spTrendDays} 天共 ${inRange} 条</div>
  </div>`;

  // 1.5) 状态分布
  if(spHasCol('status')){
    const stCnt = Object.keys(SP_STATUS).map(k=>live.filter(s=>spStatusOf(s)===k).length);
    const stMax = Math.max(1, ...stCnt);
    const stColors = ['#F2994A','#4C8DF6','#1D9E75','#9aa0ab'];
    html += `<div class="sp-chart-card"><div class="sp-chart-title"><i class="ti ti-flag"></i>处理状态<small>共 ${live.length} 条</small></div>
      ${Object.keys(SP_STATUS).map((k,i)=>`<div class="sp-dist-row"><div class="sp-dist-top"><span><i class="ti ${SP_STATUS[k].icon}" style="margin-right:5px;color:${stColors[i]}"></i>${SP_STATUS[k].label}</span><span>${stCnt[i]} 条</span></div>
        <div class="sp-dist-track"><div class="sp-dist-fill" style="width:${stCnt[i]/stMax*100}%;background:${stColors[i]}"></div></div></div>`).join('')}</div>`;
  }

  // 2) 时段分布（按小时分成 4 段）
  const slots = [['凌晨 0-6点','ti-moon-stars',0,6],['上午 6-12点','ti-sun-low',6,12],['下午 12-18点','ti-sun',12,18],['晚上 18-24点','ti-moon',18,24]];
  const slotCnt = slots.map(([,,a,b])=>list.filter(s=>{ const hr = new Date(s.created_at).getHours(); return hr>=a && hr<b; }).length);
  const slotMax = Math.max(1, ...slotCnt);
  html += `<div class="sp-chart-card"><div class="sp-chart-title"><i class="ti ti-clock-hour-4"></i>报名时段</div>
    ${slots.map((s,i)=>`<div class="sp-dist-row"><div class="sp-dist-top"><span><i class="ti ${s[1]}" style="margin-right:5px;color:var(--text-3)"></i>${s[0]}</span><span>${slotCnt[i]} 条</span></div>
      <div class="sp-dist-track"><div class="sp-dist-fill" style="width:${slotCnt[i]/slotMax*100}%;background:${colors[i]}"></div></div></div>`).join('')}
  </div>`;

  // 3) 选择类字段分布（单选 / 下拉 / 多选）
  const fields = (spSubsCurrentEvent && spSubsCurrentEvent.fields || []).filter(f=>['select','radio','checkbox'].includes(f.type));
  fields.forEach(f=>{
    const tally = {};
    let answered = 0;
    list.forEach(s=>{
      const v = (s.values||{})[f.label];
      const arr = Array.isArray(v) ? v : (v ? [v] : []);
      if(arr.length) answered++;
      arr.forEach(x=>{ tally[x] = (tally[x]||0)+1; });
    });
    const entries = Object.entries(tally).sort((a,b)=>b[1]-a[1]);
    if(!entries.length) return;
    const total = entries.reduce((n,e)=>n+e[1],0);
    if(f.type!=='checkbox' && entries.length<=6){
      // 环形图
      let acc = 0;
      const stops = entries.map((e,i)=>{ const from = acc/total*100; acc += e[1]; return `${colors[i%colors.length]} ${from}% ${acc/total*100}%`; }).join(',');
      html += `<div class="sp-chart-card"><div class="sp-chart-title"><i class="ti ${spFieldIcon(f.type)}"></i>${spEscapeHtml(f.label)}<small>${answered} 人作答</small></div>
        <div class="sp-donut-wrap"><div class="sp-donut" style="background:conic-gradient(${stops})"><div class="sp-donut-center"><b>${total}</b><small>票</small></div></div>
        <div class="sp-legend">${entries.map((e,i)=>`<div class="sp-legend-item"><i style="background:${colors[i%colors.length]}"></i><span>${spEscapeHtml(e[0])}</span><em>${e[1]} · ${Math.round(e[1]/total*100)}%</em></div>`).join('')}</div></div></div>`;
    }else{
      const m = entries[0][1];
      html += `<div class="sp-chart-card"><div class="sp-chart-title"><i class="ti ${spFieldIcon(f.type)}"></i>${spEscapeHtml(f.label)}<small>${answered} 人作答</small></div>
        ${entries.map((e,i)=>`<div class="sp-dist-row"><div class="sp-dist-top"><span>${spEscapeHtml(e[0])}</span><span>${e[1]} 人 · ${Math.round(e[1]/answered*100)}%</span></div><div class="sp-dist-track"><div class="sp-dist-fill" style="width:${e[1]/m*100}%;background:${colors[i%colors.length]}"></div></div></div>`).join('')}</div>`;
    }
  });

  // 4) 人数汇总
  const peopleVals = list.map(s=>spSubSummary(s).num).filter(n=>n);
  if(peopleVals.length){
    const sum = peopleVals.reduce((a,b)=>a+b,0);
    html += `<div class="sp-chart-card"><div class="sp-chart-title"><i class="ti ti-users"></i>人数概览</div>
      <div class="sp-stats" style="margin:0">
        <div class="sp-stat accent"><div class="sp-stat-top"><i class="ti ti-sum"></i>总人数</div><div class="sp-stat-num">${sum}</div></div>
        <div class="sp-stat"><div class="sp-stat-top"><i class="ti ti-chart-arrows"></i>平均每组</div><div class="sp-stat-num">${(sum/peopleVals.length).toFixed(1)}</div></div>
        <div class="sp-stat"><div class="sp-stat-top"><i class="ti ti-trophy"></i>最大一组</div><div class="sp-stat-num">${Math.max(...peopleVals)}</div></div>
      </div></div>`;
  }
  box.innerHTML = html;
}
function spSetTrendDays(n){ spTrendDays = n; spRenderSubsCharts(); }

// ── 导出菜单 / Excel ──
function spToggleExportMenu(ev){
  ev.stopPropagation();
  const m = document.getElementById('spExportMenu');
  const n = spExportList().length;
  document.getElementById('spExportScope').textContent = spSelected.size ? `导出范围：已选 ${n} 条` : `导出范围：当前筛选结果 ${n} 条`;
  m.classList.toggle('open');
}
document.addEventListener('click', ()=>{ const m = document.getElementById('spExportMenu'); if(m) m.classList.remove('open'); });

function spExportList(){
  if(spSelected.size) return spSubsCache.filter(s=>spSelected.has(String(s.id)));
  return spFilteredSubs();
}
function spSubsTable(list){
  list = list || spExportList();
  const cols = [], seen = new Set();
  ((spSubsCurrentEvent && spSubsCurrentEvent.fields) || []).forEach(f=>{ if(!seen.has(f.label)){ seen.add(f.label); cols.push(f.label); } });
  list.forEach(s=>Object.keys(s.values||{}).forEach(k=>{ if(!seen.has(k)){ seen.add(k); cols.push(k); } }));
  const hasStatus = spHasCol('status');
  const header = ['提交时间', ...(hasStatus?['状态']:[]), ...cols, ...(hasStatus?['签到时间','管理员备注']:[])];
  const rows = list.map(s=>{
    const vals = s.values || {};
    return [spFmtFull(s.created_at),
      ...(hasStatus ? [spIsDeleted(s) ? '已删除' : SP_STATUS[spStatusOf(s)].label] : []),
      ...cols.map(c=>{ const v = vals[c]; return Array.isArray(v) ? v.join('、') : (v==null?'':v); }),
      ...(hasStatus ? [s.checked_in_at ? spFmtFull(s.checked_in_at) : '', s.admin_note||''] : [])];
  });
  return { header, rows, cols };
}
function spExportName(ext){
  const t = (spSubsCurrentEvent ? spSubsCurrentEvent.title : 'export').replace(/[\\/:*?"<>|]/g,'');
  return `报名数据_${t}_${spYmd(new Date()).replace(/-/g,'')}.${ext}`;
}
// SheetJS：npm 上的 0.18.5 存在已知漏洞（CVE-2023-30533 / CVE-2024-22363），官方 CDN 的 0.20.3 已修复。仅在点击导出时才加载。
const SP_XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let spXlsxPromise = null;
function spLoadXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(spXlsxPromise) return spXlsxPromise;
  spXlsxPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = SP_XLSX_URL; s.async = true;
    s.onload = ()=> window.XLSX ? resolve(window.XLSX) : (spXlsxPromise=null, reject(new Error('XLSX 未就绪')));
    s.onerror = ()=>{ spXlsxPromise = null; s.remove(); reject(new Error('XLSX 加载失败')); };
    document.head.appendChild(s);
  });
  return spXlsxPromise;
}
async function spExportSubsXLSX(){
  document.getElementById('spExportMenu').classList.remove('open');
  const list = spExportList();
  if(!list.length){ spToast('没有可导出的数据'); return; }
  spToast(window.XLSX ? '正在生成 Excel…' : '正在加载 Excel 组件…');
  let X;
  try{ X = await spLoadXLSX(); }
  catch(err){ console.error(err); spToast('Excel 组件加载失败，已改为导出 CSV'); spExportSubsCSV(); return; }
  const { header, rows } = spSubsTable(list);
  const ws = X.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h,i)=>{
    const w = Math.max(String(h).length*2, ...rows.map(r=>String(r[i]==null?'':r[i]).length*1.6));
    return { wch: Math.min(40, Math.max(10, Math.ceil(w))) };
  });
  const wb = X.utils.book_new();
  const title = ((spSubsCurrentEvent && spSubsCurrentEvent.title) || '报名数据').replace(/[\\\/\?\*\[\]:]/g,'').slice(0,28) || '报名数据';
  X.utils.book_append_sheet(wb, ws, title);
  X.writeFile(wb, spExportName('xlsx'));
  spToast(`已导出 Excel（${list.length} 条）`);
}
function spExportSubsCSV(){
  document.getElementById('spExportMenu').classList.remove('open');
  const list = spExportList();
  if(!list.length){ spToast('没有可导出的数据'); return; }
  const { header, rows } = spSubsTable(list);
  const esc = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
  const csv = '\uFEFF' + [header, ...rows].map(r=>r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = spExportName('csv');
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  spToast(`已导出 CSV（${list.length} 条）`);
}
function spBuildSignSheetHtml(list){
  const ev = spSubsCurrentEvent || {};
  const rows = list.map((s,i)=>{
    const sm = spSubSummary(s);
    return `<tr><td class="c">${i+1}</td><td>${spEscapeHtml(sm.name)}</td><td>${spEscapeHtml(sm.tel)}</td><td class="c">${sm.num||''}</td><td>${spEscapeHtml(s.admin_note||'')}</td><td></td></tr>`;
  }).join('');
  const total = list.reduce((n,s)=>n+(spSubSummary(s).num||0),0);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>签到表 - ${spEscapeHtml(ev.title||'')}</title>
<style>
  @page{size:A4; margin:14mm}
  *{box-sizing:border-box}
  body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; color:#1a1a1a; margin:0}
  h1{font-size:20px; margin:0 0 4px}
  .meta{font-size:12.5px; color:#555; margin-bottom:12px; line-height:1.7}
  table{width:100%; border-collapse:collapse; font-size:13px}
  th,td{border:1px solid #888; padding:8px 8px; height:34px; text-align:left}
  th{background:#f0f1f3; font-weight:700}
  td.c,th.c{text-align:center; width:44px}
  th:nth-child(3){width:120px} th:nth-child(4){width:52px} th:nth-child(6){width:120px}
  tr{page-break-inside:avoid}
  thead{display:table-header-group}
  .foot{margin-top:10px; font-size:12px; color:#555}
</style></head><body>
<h1>${spEscapeHtml(ev.title||'活动')} · 签到表</h1>
<div class="meta">${ev.date?`日期：${spFormatDate(ev.date)} ${spEscapeHtml(ev.timeStart||'')}${ev.timeEnd?'-'+spEscapeHtml(ev.timeEnd):''}　`:''}${ev.location?`地点：${spEscapeHtml(ev.location)}　`:''}<br>共 ${list.length} 组${total?`，预计 ${total} 人`:''}　打印时间：${new Date().toLocaleString('zh-CN')}</div>
<table><thead><tr><th class="c">序号</th><th>姓名</th><th>电话</th><th class="c">人数</th><th>备注</th><th>签到</th></tr></thead><tbody>${rows}</tbody></table>
<div class="foot">签到栏可直接手写勾选或签名。</div>
</body></html>`;
}
function spPrintSignSheet(){
  document.getElementById('spExportMenu').classList.remove('open');
  const list = spExportList().filter(s=>!spIsDeleted(s) && spStatusOf(s)!=='cancelled')
    .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  if(!list.length){ spToast('没有可打印的数据'); return; }
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(spBuildSignSheetHtml(list)); f.contentDocument.close();
  setTimeout(()=>{
    try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ spToast('无法调起打印，请换用电脑浏览器'); }
    setTimeout(()=>f.remove(), 60000);
  }, 300);
}

// ============================================================
// 分享：二维码 / 海报卡片 / 邀请文案
// 二维码库：qrcode-generator 2.0.4（MIT，Kazuhiko Arase）已内联压缩，无需联网加载
// ============================================================
const SP_QR = (function(){
var qrcode=function(){var t=function(t,r){var e=t,n=g[r],o=null,i=0,a=null,u=[],f={},c=function(t,r){o=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(i=4*e+17),l(0,0),l(i-7,0),l(0,i-7),s(),h(),d(t,r),e>=7&&v(t),null==a&&(a=p(e,n,u)),w(a,r)},l=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||i<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||i<=r+n||(o[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},h=function(){for(var t=8;t<i-8;t+=1)null==o[t][6]&&(o[t][6]=t%2==0);for(var r=8;r<i-8;r+=1)null==o[6][r]&&(o[6][r]=r%2==0)},s=function(){for(var t=B.getPatternPosition(e),r=0;r<t.length;r+=1)for(var n=0;n<t.length;n+=1){var i=t[r],a=t[n];if(null==o[i][a])for(var u=-2;u<=2;u+=1)for(var f=-2;f<=2;f+=1)o[i+u][a+f]=-2==u||2==u||-2==f||2==f||0==u&&0==f}},v=function(t){for(var r=B.getBCHTypeNumber(e),n=0;n<18;n+=1){var a=!t&&1==(r>>n&1);o[Math.floor(n/3)][n%3+i-8-3]=a}for(n=0;n<18;n+=1){a=!t&&1==(r>>n&1);o[n%3+i-8-3][Math.floor(n/3)]=a}},d=function(t,r){for(var e=n<<3|r,a=B.getBCHTypeInfo(e),u=0;u<15;u+=1){var f=!t&&1==(a>>u&1);u<6?o[u][8]=f:u<8?o[u+1][8]=f:o[i-15+u][8]=f}for(u=0;u<15;u+=1){f=!t&&1==(a>>u&1);u<8?o[8][i-u-1]=f:u<9?o[8][15-u-1+1]=f:o[8][15-u-1]=f}o[i-8][8]=!t},w=function(t,r){for(var e=-1,n=i-1,a=7,u=0,f=B.getMaskFunction(r),c=i-1;c>0;c-=2)for(6==c&&(c-=1);;){for(var g=0;g<2;g+=1)if(null==o[n][c-g]){var l=!1;u<t.length&&(l=1==(t[u]>>>a&1)),f(n,c-g)&&(l=!l),o[n][c-g]=l,-1==(a-=1)&&(u+=1,a=7)}if((n+=e)<0||i<=n){n-=e,e=-e;break}}},p=function(t,r,e){for(var n=A.getRSBlocks(t,r),o=b(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=k(i[u],l.getLength()-1).mod(l);for(a[u]=new Array(l.getLength()-1),g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=s>=0?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};f.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=M(t);break;case"Alphanumeric":e=x(t);break;case"Byte":e=m(t);break;case"Kanji":e=L(t);break;default:throw"mode:"+r}u.push(e),a=null},f.isDark=function(t,r){if(t<0||i<=t||r<0||i<=r)throw t+","+r;return o[t][r]},f.getModuleCount=function(){return i},f.make=function(){if(e<1){for(var t=1;t<40;t++){for(var r=A.getRSBlocks(t,n),o=b(),i=0;i<u.length;i++){var a=u[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var g=0;for(i=0;i<r.length;i++)g+=r[i].dataCount;if(o.getLengthInBits()<=8*g)break}e=t}c(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){c(!0,e);var n=B.getLostPoint(f);(0==e||t>n)&&(t=n,r=e)}return r}())},f.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<f.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<f.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=f.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},f.createSvgTag=function(t,r,e,n){var o={};"object"==typeof arguments[0]&&(t=(o=arguments[0]).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,c,g=f.getModuleCount()*t+2*r,l="";for(c="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",l+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',l+=o.scalable?"":' width="'+g+'px" height="'+g+'px"',l+=' viewBox="0 0 '+g+" "+g+'" ',l+=' preserveAspectRatio="xMinYMin meet"',l+=n.text||e.text?' role="img" aria-labelledby="'+y([n.id,e.id].join(" ").trim())+'"':"",l+=">",l+=n.text?'<title id="'+y(n.id)+'">'+y(n.text)+"</title>":"",l+=e.text?'<description id="'+y(e.id)+'">'+y(e.text)+"</description>":"",l+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',l+='<path d="',a=0;a<f.getModuleCount();a+=1)for(u=a*t+r,i=0;i<f.getModuleCount();i+=1)f.isDark(a,i)&&(l+="M"+(i*t+r)+","+u+c);return l+='" stroke="transparent" fill="black"/>',l+="</svg>"},f.createDataURL=function(t,r){t=t||2,r=void 0===r?4*t:r;var e=f.getModuleCount()*t+2*r,n=r,o=e-r;return I(e,e,function(r,e){if(n<=r&&r<o&&n<=e&&e<o){var i=Math.floor((r-n)/t),a=Math.floor((e-n)/t);return f.isDark(a,i)?0:1}return 1})},f.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=f.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=f.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=y(e),o+='"'),o+="/>"};var y=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return f.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*f.getModuleCount()+2*t,u=t,c=a-t,g={"██":"█","█ ":"▀"," █":"▄","  ":" "},l={"██":"▀","█ ":"▀"," █":" ","  ":" "},h="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<c&&u<=r&&r<c&&f.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<c&&u<=r+1&&r+1<c&&f.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",h+=t<1&&r+1>=c?l[i]:g[i];h+="\n"}return a%2&&t>0?h.substring(0,h.length-a-1)+Array(a+1).join("▀"):h.substring(0,h.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=f.getModuleCount()*t+2*r,u=r,c=a-r,g=Array(t+1).join("██"),l=Array(t+1).join("  "),h="",s="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),s="",n=0;n<a;n+=1)i=1,u<=n&&n<c&&u<=e&&e<c&&f.isDark(o,Math.floor((n-u)/t))&&(i=0),s+=i?g:l;for(o=0;o<t;o+=1)h+=s+"\n"}return h.substring(0,h.length-1)},f.renderTo2dContext=function(t,r){r=r||2;for(var e=f.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=f.isDark(n,o)?"black":"white",t.fillRect(o*r,n*r,r,r)},f};t.stringToBytes=(t.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}}).default,t.createStringToBytes=function(t,r){var e=function(){for(var e=S(t),n=function(){var t=e.read();if(-1==t)throw"eof";return t},o=0,i={};;){var a=e.read();if(-1==a)break;var u=n(),f=n()<<8|n();i[String.fromCharCode(a<<8|u)]=f,o+=1}if(o!=r)throw o+" != "+r;return i}(),n="?".charCodeAt(0);return function(t){for(var r=[],o=0;o<t.length;o+=1){var i=t.charCodeAt(o);if(i<128)r.push(i);else{var a=e[t.charAt(o)];"number"==typeof a?(255&a)==a?r.push(a):(r.push(a>>>8),r.push(255&a)):r.push(n)}}return r}};var r,e,n,o,i,a=1,u=2,f=4,c=8,g={L:1,M:0,Q:3,H:2},l=0,h=1,s=2,v=3,d=4,w=5,p=6,y=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],e=1335,n=7973,i=function(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r},(o={}).getBCHTypeInfo=function(t){for(var r=t<<10;i(r)-i(e)>=0;)r^=e<<i(r)-i(e);return 21522^(t<<10|r)},o.getBCHTypeNumber=function(t){for(var r=t<<12;i(r)-i(n)>=0;)r^=n<<i(r)-i(n);return t<<12|r},o.getPatternPosition=function(t){return r[t-1]},o.getMaskFunction=function(t){switch(t){case l:return function(t,r){return(t+r)%2==0};case h:return function(t,r){return t%2==0};case s:return function(t,r){return r%3==0};case v:return function(t,r){return(t+r)%3==0};case d:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case w:return function(t,r){return t*r%2+t*r%3==0};case p:return function(t,r){return(t*r%2+t*r%3)%2==0};case y:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},o.getErrorCorrectPolynomial=function(t){for(var r=k([1],0),e=0;e<t;e+=1)r=r.multiply(k([1,C.gexp(e)],0));return r},o.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case f:case c:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case f:return 16;case c:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case f:return 16;case c:return 12;default:throw"mode:"+t}}},o.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);i>5&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},o),C=function(){for(var t=new Array(256),r=new Array(256),e=0;e<8;e+=1)t[e]=1<<e;for(e=8;e<256;e+=1)t[e]=t[e-4]^t[e-5]^t[e-6]^t[e-8];for(e=0;e<255;e+=1)r[t[e]]=e;var n={glog:function(t){if(t<1)throw"glog("+t+")";return r[t]},gexp:function(r){for(;r<0;)r+=255;for(;r>=256;)r-=255;return t[r]}};return n}();function k(t,r){if(void 0===t.length)throw t.length+"/"+r;var e=function(){for(var e=0;e<t.length&&0==t[e];)e+=1;for(var n=new Array(t.length-e+r),o=0;o<t.length-e;o+=1)n[o]=t[o+e];return n}(),n={getAt:function(t){return e[t]},getLength:function(){return e.length},multiply:function(t){for(var r=new Array(n.getLength()+t.getLength()-1),e=0;e<n.getLength();e+=1)for(var o=0;o<t.getLength();o+=1)r[e+o]^=C.gexp(C.glog(n.getAt(e))+C.glog(t.getAt(o)));return k(r,0)},mod:function(t){if(n.getLength()-t.getLength()<0)return n;for(var r=C.glog(n.getAt(0))-C.glog(t.getAt(0)),e=new Array(n.getLength()),o=0;o<n.getLength();o+=1)e[o]=n.getAt(o);for(o=0;o<t.getLength();o+=1)e[o]^=C.gexp(C.glog(t.getAt(o))+r);return k(e,0).mod(t)}};return n}var A=function(){var t=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],r=function(t,r){var e={};return e.totalCount=t,e.dataCount=r,e},e={};return e.getRSBlocks=function(e,n){var o=function(r,e){switch(e){case g.L:return t[4*(r-1)+0];case g.M:return t[4*(r-1)+1];case g.Q:return t[4*(r-1)+2];case g.H:return t[4*(r-1)+3];default:return}}(e,n);if(void 0===o)throw"bad rs block @ typeNumber:"+e+"/errorCorrectionLevel:"+n;for(var i=o.length/3,a=[],u=0;u<i;u+=1)for(var f=o[3*u+0],c=o[3*u+1],l=o[3*u+2],h=0;h<f;h+=1)a.push(r(c,l));return a},e}(),b=function(){var t=[],r=0,e={getBuffer:function(){return t},getAt:function(r){var e=Math.floor(r/8);return 1==(t[e]>>>7-r%8&1)},put:function(t,r){for(var n=0;n<r;n+=1)e.putBit(1==(t>>>r-n-1&1))},getLengthInBits:function(){return r},putBit:function(e){var n=Math.floor(r/8);t.length<=n&&t.push(0),e&&(t[n]|=128>>>r%8),r+=1}};return e},M=function(t){var r=a,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+2<r.length;)t.put(o(r.substring(n,n+3)),10),n+=3;n<r.length&&(r.length-n==1?t.put(o(r.substring(n,n+1)),4):r.length-n==2&&t.put(o(r.substring(n,n+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return n},x=function(t){var r=u,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+1<r.length;)t.put(45*o(r.charAt(n))+o(r.charAt(n+1)),11),n+=2;n<r.length&&t.put(o(r.charAt(n)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return n},m=function(r){var e=f,n=t.stringToBytes(r),o={getMode:function(){return e},getLength:function(t){return n.length},write:function(t){for(var r=0;r<n.length;r+=1)t.put(n[r],8)}};return o},L=function(r){var e=c,n=t.stringToBytesFuncs.SJIS;if(!n)throw"sjis not supported.";!function(){var t=n("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=n(r),i={getMode:function(){return e},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return i},D=function(){var t=[],r={writeByte:function(r){t.push(255&r)},writeShort:function(t){r.writeByte(t),r.writeByte(t>>>8)},writeBytes:function(t,e,n){e=e||0,n=n||t.length;for(var o=0;o<n;o+=1)r.writeByte(t[o+e])},writeString:function(t){for(var e=0;e<t.length;e+=1)r.writeByte(t.charCodeAt(e))},toByteArray:function(){return t},toString:function(){var r="";r+="[";for(var e=0;e<t.length;e+=1)e>0&&(r+=","),r+=t[e];return r+="]"}};return r},S=function(t){var r=t,e=0,n=0,o=0,i={read:function(){for(;o<8;){if(e>=r.length){if(0==o)return-1;throw"unexpected end of file./"+o}var t=r.charAt(e);if(e+=1,"="==t)return o=0,-1;t.match(/^\s$/)||(n=n<<6|a(t.charCodeAt(0)),o+=6)}var i=n>>>o-8&255;return o-=8,i}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return i},I=function(t,r,e){for(var n=function(t,r){var e=t,n=r,o=new Array(t*r),i={setPixel:function(t,r,n){o[r*e+t]=n},write:function(t){t.writeString("GIF87a"),t.writeShort(e),t.writeShort(n),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(e),t.writeShort(n),t.writeByte(0);var r=a(2);t.writeByte(2);for(var o=0;r.length-o>255;)t.writeByte(255),t.writeBytes(r,o,255),o+=255;t.writeByte(r.length-o),t.writeBytes(r,o,r.length-o),t.writeByte(0),t.writeString(";")}},a=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,i=u(),a=0;a<r;a+=1)i.add(String.fromCharCode(a));i.add(String.fromCharCode(r)),i.add(String.fromCharCode(e));var f,c,g,l=D(),h=(f=l,c=0,g=0,{write:function(t,r){if(t>>>r!=0)throw"length over";for(;c+r>=8;)f.writeByte(255&(t<<c|g)),r-=8-c,t>>>=8-c,g=0,c=0;g|=t<<c,c+=r},flush:function(){c>0&&f.writeByte(g)}});h.write(r,n);var s=0,v=String.fromCharCode(o[s]);for(s+=1;s<o.length;){var d=String.fromCharCode(o[s]);s+=1,i.contains(v+d)?v+=d:(h.write(i.indexOf(v),n),i.size()<4095&&(i.size()==1<<n&&(n+=1),i.add(v+d)),v=d)}return h.write(i.indexOf(v),n),h.write(e,n),h.flush(),l.toByteArray()},u=function(){var t={},r=0,e={add:function(n){if(e.contains(n))throw"dup key:"+n;t[n]=r,r+=1},size:function(){return r},indexOf:function(r){return t[r]},contains:function(r){return void 0!==t[r]}};return e};return i}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=D();n.write(a);for(var u=function(){var t=0,r=0,e=0,n="",o={},i=function(t){n+=String.fromCharCode(a(63&t))},a=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return o.writeByte=function(n){for(t=t<<8|255&n,r+=8,e+=1;r>=6;)i(t>>>r-6),r-=6},o.flush=function(){if(r>0&&(i(t<<6-r),t=0,r=0),e%3!=0)for(var o=3-e%3,a=0;a<o;a+=1)n+="="},o.toString=function(){return n},o}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return t}();qrcode.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||n>=57344?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)};
return qrcode;
})();

let spShareEv = null, spShareTab = 'poster', spPoster = null, spQrCard = null, spPosterSeq = 0;
const SP_FONT = "'PingFang SC','Noto Sans SC','Microsoft YaHei','Hiragino Sans GB',sans-serif";

function spInWeChat(){ return /MicroMessenger/i.test(navigator.userAgent); }
function spShareUrl(ev){ return location.origin + location.pathname + (ev ? ('?id=' + encodeURIComponent(ev.id)) : ''); }
function spEventTimeText(ev){
  return [spFormatDate(ev.date), (ev.timeStart||'') + (ev.timeEnd ? '-' + ev.timeEnd : '')].map(s=>String(s||'').trim()).filter(Boolean).join(' ');
}
function spEventPlaceText(ev){ return ev.location ? ev.location + (ev.address ? `（${ev.address}）` : '') : (ev.address || ''); }
function spInviteText(ev){
  const L = [`【${ev.title || '活动报名'}】`];
  const t = spEventTimeText(ev), p = spEventPlaceText(ev);
  if(t) L.push('📅 时间：' + t);
  if(p) L.push('📍 地点：' + p);
  if(spDeadlineTs(ev) != null) L.push('⏰ 报名截止：' + spFmtDeadline(ev));
  const intro = (ev.intro || '').split('\n').map(s=>s.trim()).filter(Boolean)[0];
  if(intro) L.push('', intro);
  L.push('', '👉 点击链接报名：' + spShareUrl(ev));
  return L.join('\n');
}

// ── 二维码 ──
function spQrCanvas(text, px){
  const qr = SP_QR(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), quiet = 3;
  const cell = Math.max(2, Math.floor(px / (n + quiet * 2)));
  const size = cell * (n + quiet * 2);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#14201b';
  for(let r = 0; r < n; r++) for(let k = 0; k < n; k++) if(qr.isDark(r, k)) g.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
  return c;
}

// ── 画布工具 ──
function spRoundPath(g, x, y, w, h, r){
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  g.beginPath();
  g.moveTo(x + tl, y); g.lineTo(x + w - tr, y); g.quadraticCurveTo(x + w, y, x + w, y + tr);
  g.lineTo(x + w, y + h - br); g.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  g.lineTo(x + bl, y + h); g.quadraticCurveTo(x, y + h, x, y + h - bl);
  g.lineTo(x, y + tl); g.quadraticCurveTo(x, y, x + tl, y); g.closePath();
}
// 中日韩逐字换行、英文按单词换行；超过 maxLines 行用省略号收尾
function spWrap(g, text, maxW, maxLines){
  const tokens = String(text || '').match(/[A-Za-z0-9\u00C0-\u024F.,'’\-–\/#&@:;()]+|\n|\s|[\s\S]/g) || [];
  const lines = []; let cur = '';
  const push = ()=>{ lines.push(cur.replace(/\s+$/, '')); cur = ''; };
  for(const tk of tokens){
    if(tk === '\n'){ push(); continue; }
    if(!cur && /^\s+$/.test(tk)) continue;
    if(g.measureText(cur + tk).width > maxW && cur){
      push();
      if(/^\s+$/.test(tk)) continue;
    }
    if(g.measureText(tk).width > maxW){ // 极长的单词：退回逐字符
      for(const ch of tk){ if(g.measureText(cur + ch).width > maxW && cur) push(); cur += ch; }
    } else cur += tk;
  }
  if(cur) push();
  while(lines.length && lines[lines.length - 1] === '') lines.pop();
  if(lines.length > maxLines){
    const out = lines.slice(0, maxLines); let last = out[maxLines - 1];
    while(last && g.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    out[maxLines - 1] = last + '…'; return out;
  }
  return lines;
}
function spLoadImage(src){
  return new Promise(resolve=>{
    if(!src) return resolve(null);
    const im = new Image(); im.crossOrigin = 'anonymous';
    const timer = setTimeout(()=>resolve(null), 8000);
    im.onload = ()=>{ clearTimeout(timer); resolve(im); };
    im.onerror = ()=>{ clearTimeout(timer); resolve(null); };
    // 加参数避开页面里已缓存的「无 CORS」副本，否则画布会被污染而无法导出
    im.src = /^data:|^blob:/.test(src) ? src : src + (src.includes('?') ? '&' : '?') + '_sp=1';
  });
}
function spCanvasBlob(c, type){
  return new Promise((resolve, reject)=>c.toBlob(b=> b ? resolve(b) : reject(new Error('导出图片失败')), type || 'image/png'));
}

// ── 海报卡片 ──
async function spBuildPoster(ev){
  const W = 1080, M = 48, CW = W - M * 2, P = 52, IW = CW - P * 2;
  const font = (w, s)=>`${w} ${s}px ${SP_FONT}`;
  const mg = document.createElement('canvas').getContext('2d');
  const cover = await spLoadImage(ev.coverImage);
  const coverH = Math.round(CW * 10 / 16);

  // 1) 先排版，算出整体高度
  let y = coverH + 48; const items = [];
  if(ev.tag){ mg.font = font('700', 30); items.push({ t:'tag', y, w: Math.ceil(mg.measureText(ev.tag).width) + 46, text: ev.tag }); y += 54 + 24; }
  mg.font = font('800', 60);
  const titleLines = spWrap(mg, ev.title || '活动报名', IW, 3);
  items.push({ t:'title', y, lines: titleLines }); y += titleLines.length * 80 + 14;
  const rows = [['时间', spEventTimeText(ev)], ['地点', spEventPlaceText(ev)]];
  if(spDeadlineTs(ev) != null) rows.push(['截止', spFmtDeadline(ev)]);
  mg.font = font('500', 34);
  rows.forEach(([label, val])=>{
    if(!val) return;
    const lines = spWrap(mg, val, IW - 112, 3);
    items.push({ t:'row', y, label, lines }); y += lines.length * 48 + 18;
  });
  const introSrc = (ev.intro || '').trim() || (ev.detail || '').trim();
  if(introSrc){
    mg.font = font('400', 31);
    const lines = spWrap(mg, introSrc.replace(/\n+/g, ' '), IW, 3);
    y += 4; items.push({ t:'intro', y, lines }); y += lines.length * 50 + 10;
  }
  y += 22; const divY = y; y += 40;
  const qrBoxY = y, QR = 292;
  y += QR + 44 + P - 8;
  const cardH = y;
  const H = M + cardH + M;

  // 2) 绘制
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.textBaseline = 'top';
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#d5f0e5'); bg.addColorStop(1, '#f3faf6');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const cx = M, cy = M;
  g.save(); g.shadowColor = 'rgba(20,70,50,.18)'; g.shadowBlur = 44; g.shadowOffsetY = 16;
  spRoundPath(g, cx, cy, CW, cardH, 44); g.fillStyle = '#fff'; g.fill(); g.restore();
  // 封面
  g.save(); spRoundPath(g, cx, cy, CW, coverH, [44, 44, 0, 0]); g.clip();
  if(cover){
    const s = Math.max(CW / cover.width, coverH / cover.height), dw = cover.width * s, dh = cover.height * s;
    g.drawImage(cover, cx + (CW - dw) / 2, cy + (coverH - dh) / 2, dw, dh);
  } else {
    const gr = g.createLinearGradient(cx, cy, cx + CW, cy + coverH); gr.addColorStop(0, '#1D9E75'); gr.addColorStop(1, '#7fd3b4');
    g.fillStyle = gr; g.fillRect(cx, cy, CW, coverH);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(cx + CW - 120, cy + 90, 230, 0, 7); g.fill();
    g.beginPath(); g.arc(cx + 110, cy + coverH - 40, 170, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = font('800', 92); g.textAlign = 'center'; g.fillText('活动邀请', cx + CW / 2, cy + coverH / 2 - 56); g.textAlign = 'left';
  }
  g.restore();
  // 内容
  const X = cx + P;
  items.forEach(it=>{
    const top = cy + it.y;
    if(it.t === 'tag'){
      spRoundPath(g, X, top, it.w, 54, 27); g.fillStyle = '#e8f5f0'; g.fill();
      g.fillStyle = '#1D9E75'; g.font = font('700', 30); g.fillText(it.text, X + 23, top + 10);
    } else if(it.t === 'title'){
      g.fillStyle = '#1a1a1a'; g.font = font('800', 60);
      it.lines.forEach((ln, i)=>g.fillText(ln, X, top + i * 80 + 8));
    } else if(it.t === 'row'){
      spRoundPath(g, X, top + 3, 84, 40, 12); g.fillStyle = '#e8f5f0'; g.fill();
      g.fillStyle = '#1D9E75'; g.font = font('700', 26); g.textAlign = 'center'; g.fillText(it.label, X + 42, top + 9); g.textAlign = 'left';
      g.fillStyle = '#2f2f2a'; g.font = font('500', 34);
      it.lines.forEach((ln, i)=>g.fillText(ln, X + 112, top + i * 48 + 3));
    } else if(it.t === 'intro'){
      g.fillStyle = '#8f8f86'; g.font = font('400', 31);
      it.lines.forEach((ln, i)=>g.fillText(ln, X, top + i * 50 + 6));
    }
  });
  // 分隔虚线
  g.strokeStyle = '#d9ddd9'; g.lineWidth = 3; g.setLineDash([12, 12]);
  g.beginPath(); g.moveTo(X, cy + divY); g.lineTo(X + IW, cy + divY); g.stroke(); g.setLineDash([]);
  // 二维码区
  const qy = cy + qrBoxY, qx = X + IW - QR;
  spRoundPath(g, qx - 6, qy - 6, QR + 12, QR + 12, 26); g.fillStyle = '#fff'; g.fill();
  g.strokeStyle = '#d9eee6'; g.lineWidth = 3; g.stroke();
  g.imageSmoothingEnabled = false;
  g.drawImage(spQrCanvas(spShareUrl(ev), 600), qx, qy, QR, QR);
  g.imageSmoothingEnabled = true;
  g.fillStyle = '#6b6b63'; g.font = font('500', 32); g.fillText('微信扫一扫 / 长按识别', X, qy + 22);
  g.fillStyle = '#1D9E75'; g.font = font('800', 56); g.fillText('立即报名', X, qy + 78);
  g.fillStyle = '#1a1a1a'; g.font = font('800', 56); g.fillText('参加活动', X, qy + 146);
  g.fillStyle = '#8f8f86'; g.font = font('400', 28);
  g.fillText(ev.capacity ? '名额有限，欢迎尽早报名' : '期待你的参与', X, qy + 232);
  return spCanvasBlob(c, 'image/png');
}

// ── 单独的二维码卡片 ──
function spBuildQrCard(ev){
  const W = 720, P = 56, font = (w, s)=>`${w} ${s}px ${SP_FONT}`;
  const mg = document.createElement('canvas').getContext('2d'); mg.font = font('800', 40);
  const lines = spWrap(mg, ev.title || '活动报名', W - P * 2, 2);
  const QR = 500, H = P + lines.length * 56 + 28 + QR + 28 + 46 + 18 + 40 + P - 10;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.textBaseline = 'top';
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.fillStyle = '#1a1a1a'; g.font = font('800', 40);
  let y = P; lines.forEach(ln=>{ g.fillText(ln, W / 2, y); y += 56; });
  y += 28;
  g.imageSmoothingEnabled = false; g.drawImage(spQrCanvas(spShareUrl(ev), 1000), (W - QR) / 2, y, QR, QR); g.imageSmoothingEnabled = true;
  y += QR + 28;
  g.fillStyle = '#1D9E75'; g.font = font('700', 30); g.fillText('微信扫一扫 / 长按识别，立即报名', W / 2, y);
  const t = spEventTimeText(ev);
  if(t){ g.fillStyle = '#8f8f86'; g.font = font('400', 26); g.fillText(t, W / 2, y + 46); }
  return c;
}

// ── 分享面板 ──
function spOpenShare(id){
  const ev = spGetEvent(id || spCurrentId); if(!ev) return;
  spShareEv = ev; spShareTab = 'poster'; spPoster = null; spQrCard = null;
  let ov = document.getElementById('spShareOverlay');
  if(!ov){
    ov = document.createElement('div'); ov.id = 'spShareOverlay'; ov.className = 'sp-overlay'; ov.style.zIndex = '600';
    ov.onclick = (e)=>spCloseOverlay(e, 'spShareOverlay');
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="sp-sheet sp-share-sheet" onclick="event.stopPropagation()">
      <button class="sp-sheet-close" aria-label="关闭" onclick="spCloseOverlay(null,'spShareOverlay')"><i class="ti ti-x"></i></button>
      <div class="sp-sheet-handle"></div>
      <div class="sp-share-head"><div class="sp-share-head-icon"><i class="ti ti-share-3"></i></div>
        <div style="min-width:0"><div class="sp-sheet-title" style="margin:0">分享活动</div><div class="sp-share-sub">${spEscapeHtml(ev.title||'')}</div></div></div>
      ${spInWeChat()?`<div class="sp-share-wx"><i class="ti ti-brand-wechat"></i><span>你正在微信中打开：点右上角「<b>···</b>」可直接发送给朋友；也可<b>长按下方海报图片</b>发送到群聊。</span></div>`:''}
      <div class="sp-seg sp-share-tabs" id="spShareTabs">
        <button data-tab="poster" onclick="spSetShareTab('poster')"><i class="ti ti-photo"></i>海报卡片</button>
        <button data-tab="qr" onclick="spSetShareTab('qr')"><i class="ti ti-qrcode"></i>二维码</button>
        <button data-tab="link" onclick="spSetShareTab('link')"><i class="ti ti-link"></i>链接文案</button>
      </div>
      <div id="spShareBody"></div>
    </div>`;
  ov.classList.add('open');
  spRenderShareTab();
  const seq = ++spPosterSeq;
  spBuildPoster(ev).then(blob=>{
    if(seq !== spPosterSeq) return;
    spPoster = { blob, url: URL.createObjectURL(blob) };
    if(spShareTab === 'poster') spRenderShareTab();
  }).catch(err=>{
    console.error('海报生成失败', err);
    if(seq !== spPosterSeq) return;
    spPoster = { error: true }; if(spShareTab === 'poster') spRenderShareTab();
  });
}
function spShare(){ spOpenShare(spCurrentId); }
function spSetShareTab(t){ spShareTab = t; spRenderShareTab(); }
function spCanShareFiles(){
  try{
    if(!navigator.share || !navigator.canShare) return false;
    return navigator.canShare({ files: [new File([new Blob(['x'], { type:'image/png' })], 'a.png', { type:'image/png' })] });
  }catch(_){ return false; }
}
function spRenderShareTab(){
  const body = document.getElementById('spShareBody'); if(!body || !spShareEv) return;
  const ev = spShareEv, wx = spInWeChat();
  document.querySelectorAll('#spShareTabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab === spShareTab));
  if(spShareTab === 'poster'){
    const ready = spPoster && spPoster.url, failed = spPoster && spPoster.error;
    const native = spCanShareFiles();
    body.innerHTML = `
      <div class="sp-poster-box">${ready ? `<img id="spPosterImg" src="${spPoster.url}" alt="活动海报">`
        : failed ? `<div class="sp-poster-skel"><i class="ti ti-photo-off"></i>海报生成失败，请使用「二维码」或「链接文案」分享</div>`
        : `<div class="sp-poster-skel"><i class="ti ti-loader-2 sp-spin"></i>正在生成海报…</div>`}</div>
      ${wx ? `<div class="sp-share-tip">长按海报 → 选择「发送给朋友」即可转发到微信群；海报里的二维码长按也能识别报名。</div>` : `
      <div class="sp-share-actions">
        ${native ? `<button class="sp-btn sp-btn-primary" ${ready?'':'disabled'} onclick="spSharePosterNative()"><i class="ti ti-brand-wechat"></i>分享到微信群 / 更多</button>` : ''}
        <button class="sp-btn ${native?'sp-btn-ghost':'sp-btn-primary'}" ${ready?'':'disabled'} onclick="spSavePoster()"><i class="ti ti-download"></i>保存图片</button>
      </div>
      <div class="sp-share-tip">${native ? '点「分享到微信群」，在弹出的列表里选<b>微信</b>，再选择群聊即可发送。' : '保存图片后，在微信里选择群聊，发送这张图片即可。'}海报内的二维码可直接长按识别。</div>`}`;
  } else if(spShareTab === 'qr'){
    if(!spQrCard) spQrCard = spBuildQrCard(ev);
    body.innerHTML = `
      <div class="sp-qr-card"><img src="${spQrCard.toDataURL('image/png')}" alt="报名二维码"></div>
      <div class="sp-share-actions">
        ${wx ? '' : `<button class="sp-btn sp-btn-primary" onclick="spSaveQr()"><i class="ti ti-download"></i>保存二维码</button>`}
        <button class="sp-btn ${wx?'sp-btn-primary':'sp-btn-ghost'}" onclick="spCopyShareLink()"><i class="ti ti-copy"></i>复制链接</button>
      </div>
      <div class="sp-share-tip">${wx ? '长按二维码可保存图片或发送给朋友。' : '可打印张贴，或发到群里让大家扫码报名。'}</div>`;
  } else {
    const url = spShareUrl(ev), text = spInviteText(ev);
    body.innerHTML = `
      <div class="sp-share-label">活动链接</div>
      <div class="sp-link-row"><input type="text" id="spShareLinkInput" readonly value="${spEscapeHtml(url)}" onfocus="this.select()"><button class="sp-btn sp-btn-primary" onclick="spCopyShareLink()"><i class="ti ti-copy"></i>复制</button></div>
      <div class="sp-share-label" style="margin-top:14px">邀请文案（可直接粘贴到微信群）</div>
      <textarea id="spShareText" class="sp-share-text" rows="8" readonly>${spEscapeHtml(text)}</textarea>
      <div class="sp-share-actions">
        <button class="sp-btn sp-btn-primary" onclick="spCopyInvite()"><i class="ti ti-copy"></i>复制文案</button>
        ${navigator.share ? `<button class="sp-btn sp-btn-ghost" onclick="spShareTextNative()"><i class="ti ti-share-2"></i>系统分享</button>` : ''}
      </div>`;
  }
}

// ── 操作 ──
function spFileName(ext){ return ((spShareEv && spShareEv.title) || '活动').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) + ext; }
function spDownloadBlob(blob, name){
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(u), 4000);
}
async function spSharePosterNative(){
  if(!spPoster || !spPoster.blob) return;
  const ev = spShareEv;
  try{
    const file = new File([spPoster.blob], spFileName('_海报.png'), { type:'image/png' });
    await navigator.share({ files: [file], title: ev.title || '活动报名', text: spInviteText(ev) });
  }catch(err){
    if(err && err.name === 'AbortError') return;
    console.error(err); spToast('无法调起分享，请先保存图片');
  }
}
function spSavePoster(){ if(spPoster && spPoster.blob){ spDownloadBlob(spPoster.blob, spFileName('_海报.png')); spToast('海报已保存'); } }
async function spSaveQr(){
  if(!spQrCard) return;
  try{ spDownloadBlob(await spCanvasBlob(spQrCard, 'image/png'), spFileName('_二维码.png')); spToast('二维码已保存'); }
  catch(_){ spToast('保存失败，请长按二维码保存'); }
}
function spCopyShareLink(){ spCopyText(spShareUrl(spShareEv)); }
function spCopyInvite(){ spCopyText(spInviteText(spShareEv)); }
async function spShareTextNative(){
  const ev = spShareEv;
  try{ await navigator.share({ title: ev.title || '活动报名', text: spInviteText(ev) }); }
  catch(err){ if(!(err && err.name === 'AbortError')){ console.error(err); spCopyInvite(); } }
}


// ── 启动 ──
(async function spInit(){
  spInitClient();
  await spLoadState();
  spBoot();
})();
