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
    intro: src.intro || '',
    highlights: Array.isArray(src.highlights) ? src.highlights.filter(Boolean) : [],
    detailTitle: src.detailTitle || '活动详情',
    detail: src.detail || '',
    ctaText: src.ctaText || '立即报名',
    submitText: src.submitText || '提交报名',
    fields: Array.isArray(src.fields) && src.fields.length ? src.fields.map(spNormField) : spDefaultFields(),
    createdAt: src.createdAt || new Date().toISOString(),
    updatedAt: src.updatedAt || new Date().toISOString(),
  };
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
function spShare(){
  const ev = spGetEvent(spCurrentId);
  const url = location.origin+location.pathname+(ev?('?id='+encodeURIComponent(ev.id)):'');
  if(navigator.share){ navigator.share({title: ev?ev.title:'活动报名', url}).catch(()=>{}); }
  else{
    navigator.clipboard?.writeText(url).then(()=>spToast('链接已复制')).catch(()=>spToast(url));
  }
}

function spRender(){
  const back = document.getElementById('spBackBtn');
  const share = document.getElementById('spShareBtn');
  const title = document.getElementById('spTopbarTitle');
  const body = document.getElementById('spBody');
  const canBack = (spView==='form') || (spView==='detail' && spEnabledEvents().length>1) || (spView==='success');
  back.classList.toggle('ghost', !canBack);
  share.classList.toggle('ghost', spView!=='detail');
  title.textContent = spView==='list' ? '报名活动' : (spView==='form' ? '报名参与' : '');

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
          <div class="sp-list-card-meta"><i class="ti ti-calendar-event"></i>${spFormatDate(e.date)} ${spEscapeHtml(e.timeStart)}${e.timeEnd?'-'+spEscapeHtml(e.timeEnd):''}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

function spRenderDetail(body){
  const e = spGetEvent(spCurrentId);
  if(!e){ body.innerHTML = `<div class="sp-empty"><i class="ti ti-calendar-off"></i><div>活动不存在或已下线</div></div>`; return; }
  document.getElementById('spPageTitle').textContent = e.title || '活动报名';
  body.innerHTML = `
    <div class="sp-cover-wrap">${e.coverImage?`<img class="sp-cover" src="${spEscapeHtml(e.coverImage)}">`:''}</div>
    <div class="sp-detail-card">
      ${e.tag?`<span class="sp-tag-pill">${spEscapeHtml(e.tag)}</span>`:''}
      <h1 class="sp-title">${spEscapeHtml(e.title)}</h1>
      <div class="sp-meta-row"><i class="ti ti-calendar-event"></i><span>${spFormatDate(e.date)} ${spEscapeHtml(e.timeStart)}${e.timeEnd?'-'+spEscapeHtml(e.timeEnd):''}</span></div>
      ${e.location?`<div class="sp-meta-row"><i class="ti ti-map-pin"></i><span>${spEscapeHtml(e.location)}${e.address?`（${spEscapeHtml(e.address)}）`:''}</span></div>`:''}
      ${e.intro?`<p class="sp-intro">${spEscapeHtml(e.intro)}</p>`:''}
      ${e.highlights.length?`<div class="sp-highlights">${e.highlights.map(h=>`<span class="sp-highlight-pill">${spEscapeHtml(h)}</span>`).join('')}</div>`:''}
      <hr class="sp-divider">
      <div class="sp-detail-section-title">${spEscapeHtml(e.detailTitle||'活动详情')}</div>
      <p class="sp-detail-text">${spEscapeHtml(e.detail)}</p>
    </div>
  `;
  document.getElementById('spBody').insertAdjacentHTML('beforeend', `
    <div class="sp-cta-bar"><button class="sp-cta-btn" onclick="spGoForm('${e.id}')"><i class="ti ti-user-plus"></i>${spEscapeHtml(e.ctaText||'立即报名')}</button></div>
  `);
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
  const btn = document.getElementById('spSubmitBtn');
  if(btn){ btn.disabled = true; btn.textContent = '提交中…'; }
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
function spOpenManager(){
  spRenderManagerList();
  document.getElementById('spManagerOverlay').classList.add('open');
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
        <div class="sp-event-admin-meta">${spFormatDate(e.date)||'未设置日期'}</div>
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
  document.getElementById('spfIntro').value = e.intro;
  document.getElementById('spfHighlights').value = e.highlights.join(',');
  document.getElementById('spfDetailTitle').value = e.detailTitle;
  document.getElementById('spfDetail').value = e.detail;
  document.getElementById('spfCtaText').value = e.ctaText;
  document.getElementById('spfSubmitText').value = e.submitText;
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
    intro: document.getElementById('spfIntro').value,
    highlights: document.getElementById('spfHighlights').value.split(',').map(s=>s.trim()).filter(Boolean),
    detailTitle: document.getElementById('spfDetailTitle').value.trim() || '活动详情',
    detail: document.getElementById('spfDetail').value,
    ctaText: document.getElementById('spfCtaText').value.trim() || '立即报名',
    submitText: document.getElementById('spfSubmitText').value.trim() || '提交报名',
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
  const list = spSubsCache;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayCnt = list.filter(s=>s.created_at && new Date(s.created_at)>=today).length;
  const people = list.reduce((n,s)=>n+(spSubSummary(s).num||0),0);
  document.getElementById('spSubsStats').innerHTML = `
    <div class="sp-stat accent"><div class="sp-stat-top"><i class="ti ti-clipboard-check"></i>报名总数</div><div class="sp-stat-num">${list.length}</div></div>
    <div class="sp-stat"><div class="sp-stat-top"><i class="ti ti-calendar-plus"></i>今日新增</div><div class="sp-stat-num">${todayCnt}</div></div>
    <div class="sp-stat"><div class="sp-stat-top"><i class="ti ti-users"></i>预计人数</div><div class="sp-stat-num">${people||'—'}</div></div>`;
  const last = list[0] && list.length ? list.reduce((a,b)=>new Date(a.created_at)>new Date(b.created_at)?a:b) : null;
  document.getElementById('spSubsSub').innerHTML = last ? `<i class="ti ti-clock"></i>最近报名 ${spRelTime(last.created_at)}` : '';
}

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
  const q = (document.getElementById('spSubsSearch').value||'').trim().toLowerCase();
  document.getElementById('spSubsSearchClear').classList.toggle('show', !!q);
  let list = spSubsCache.slice();
  if(q) list = list.filter(s=>Object.values(s.values||{}).some(v=>String(Array.isArray(v)?v.join(' '):v).toLowerCase().includes(q)));
  list.sort((a,b)=>{ const d = new Date(a.created_at)-new Date(b.created_at); return spSubsSortDesc ? -d : d; });
  spVisibleIds = list.map(s=>String(s.id));
  spUpdateBatchBar();
  if(!spSubsCache.length){
    wrap.innerHTML = `<div class="sp-subs-empty"><i class="ti ti-inbox"></i>暂无报名记录<br>分享活动链接，等待第一位报名者吧</div>`; return;
  }
  if(!list.length){
    wrap.innerHTML = `<div class="sp-subs-empty"><i class="ti ti-search-off"></i>没有找到与“${spEscapeHtml(q)}”相关的记录</div>`; return;
  }
  spVisibleIds = list.map(s=>String(s.id));
  const dayAgo = Date.now() - 86400000;
  wrap.innerHTML = list.map(s=>{
    const vals = s.values || {};
    const sm = spSubSummary(s);
    const color = SP_AVATAR_COLORS[(s.id!=null ? Number(s.id) : sm.name.charCodeAt(0)) % SP_AVATAR_COLORS.length] || SP_AVATAR_COLORS[0];
    const isNew = s.created_at && new Date(s.created_at).getTime() > dayAgo;
    const items = Object.keys(vals).map(k=>{
      const raw = vals[k];
      const copyable = !(raw==null||raw===''||(Array.isArray(raw)&&!raw.length));
      const copyText = Array.isArray(raw) ? raw.join('、') : String(raw==null?'':raw);
      return `<div class="sp-sub-item">
        <div class="sp-sub-item-icon"><i class="ti ${spIconForLabel(k)}"></i></div>
        <div class="sp-sub-item-body"><div class="sp-sub-item-label">${spEscapeHtml(k)}</div>${spValueHtml(k, raw)}</div>
        ${copyable ? `<div class="sp-sub-item-act"><button class="sp-mini-icon-btn" title="复制" onclick="spCopyText(decodeURIComponent('${encodeURIComponent(copyText)}'))"><i class="ti ti-copy"></i></button></div>` : ''}
      </div>`;
    }).join('');
    const sel = spSelected.has(String(s.id));
    return `<div class="sp-sub-card${sel?' selected':''}" id="spSub_${s.id}">
      <div class="sp-sub-head" onclick="spToggleSub('${s.id}')">
        ${spSelectMode?`<input type="checkbox" class="sp-sub-check" ${sel?'checked':''} onclick="event.stopPropagation()" onchange="spPickSub('${s.id}',this.checked)">`:''}
        <div class="sp-sub-avatar" style="background:${color}">${spEscapeHtml(sm.name.trim().charAt(0).toUpperCase()||'?')}</div>
        <div class="sp-sub-main">
          <div class="sp-sub-name">${spEscapeHtml(sm.name)}${isNew?'<span class="sp-sub-new">NEW</span>':''}</div>
          <div class="sp-sub-time"><i class="ti ti-clock"></i>${spRelTime(s.created_at)}${sm.tel?` · <i class="ti ti-phone"></i>${spEscapeHtml(sm.tel)}`:''}</div>
        </div>
        ${sm.num?`<span class="sp-sub-badge"><i class="ti ti-users"></i>${sm.num}人</span>`:''}
        <i class="ti ti-chevron-down sp-sub-chevron"></i>
      </div>
      <div class="sp-sub-detail">
        ${items}
        <div class="sp-sub-item"><div class="sp-sub-item-icon"><i class="ti ti-calendar-time"></i></div>
          <div class="sp-sub-item-body"><div class="sp-sub-item-label">提交时间</div><div class="sp-sub-item-val">${spFmtFull(s.created_at)}</div></div></div>
        <div class="sp-sub-foot">
          ${sm.tel?`<a class="sp-btn sp-btn-ghost" href="tel:${spEscapeHtml(sm.tel)}" style="text-decoration:none"><i class="ti ti-phone-call"></i>拨打电话</a>`:''}
          <button class="sp-btn sp-btn-danger" onclick="spDeleteSubmission(${s.id})"><i class="ti ti-trash"></i>删除</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function spToggleSub(id){
  if(spSelectMode){ spPickSub(String(id), !spSelected.has(String(id))); spRenderSubs(); return; }
  const el = document.getElementById('spSub_'+id); if(el) el.classList.toggle('open');
}
function spClearSubsSearch(){ const i = document.getElementById('spSubsSearch'); i.value=''; spRenderSubs(); i.focus(); }
function spToggleSubsSort(){
  spSubsSortDesc = !spSubsSortDesc;
  document.querySelector('#spSubsSortBtn i').className = 'ti ' + (spSubsSortDesc ? 'ti-sort-descending' : 'ti-sort-ascending');
  spToast(spSubsSortDesc ? '按时间：最新优先' : '按时间：最早优先');
  spRenderSubs();
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
    const { data, error } = await client.from(SP_CONFIG.submissionsTable)
      .select('*').eq('event_id', spSubsCurrentEvent.id).order('created_at', { ascending:false }).limit(500);
    if(error) throw error;
    spSubsCache = data || [];
    spRenderSubsStats();
    spRenderSubs();
    if(spSubsTab==='chart') spRenderSubsCharts();
  }catch(err){
    console.error(err);
    spSubsCache = [];
    spRenderSubsStats();
    wrap.innerHTML = `<div class="sp-subs-empty"><i class="ti ti-cloud-off"></i>加载失败，请检查后台是否已建好 ${SP_CONFIG.submissionsTable} 表</div>`;
  }finally{
    if(refreshBtn) refreshBtn.classList.remove('spin');
  }
}
async function spDeleteSubmission(id){
  if(!confirm('确定删除这条报名记录吗？')) return;
  try{
    const client = spInitClient();
    const { error } = await client.from(SP_CONFIG.submissionsTable).delete().eq('id', id);
    if(error) throw error;
    spLoadSubmissions();
  }catch(err){ spToast('删除失败，请重试'); }
}
// ── Tab 切换 ──
function spSwitchSubsTab(tab){
  spSubsTab = tab;
  document.querySelectorAll('#spSubsTabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  const isList = tab==='list';
  document.getElementById('spSubsList').style.display = isList ? '' : 'none';
  document.getElementById('spSubsCharts').style.display = isList ? 'none' : '';
  document.querySelector('.sp-subs-toolbar').style.display = isList ? '' : 'none';
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
  const n = spSelected.size;
  const c = document.getElementById('spBatchCount'); if(c) c.textContent = '已选 ' + n + ' 条';
  const btn = document.getElementById('spBatchDelBtn'); if(btn) btn.disabled = n===0;
  const all = document.getElementById('spSelectAll');
  if(all){ all.checked = spVisibleIds.length>0 && spVisibleIds.every(id=>spSelected.has(id)); }
}
async function spBatchDelete(){
  const ids = [...spSelected];
  if(!ids.length) return;
  if(!confirm('确定删除选中的 ' + ids.length + ' 条报名记录吗？此操作无法恢复。')) return;
  const btn = document.getElementById('spBatchDelBtn');
  btn.disabled = true;
  try{
    const client = spInitClient();
    const { error } = await client.from(SP_CONFIG.submissionsTable).delete().in('id', ids.map(x=>isNaN(x)?x:Number(x)));
    if(error) throw error;
    spToast('已删除 ' + ids.length + ' 条记录');
    spSelected.clear();
    await spLoadSubmissions();
  }catch(err){
    console.error(err);
    spToast('批量删除失败，请重试');
    btn.disabled = false;
  }
}

// ── 图表 ──
function spRenderSubsCharts(){
  const box = document.getElementById('spSubsCharts');
  const list = spSubsCache;
  if(!list.length){ box.innerHTML = '<div class="sp-subs-empty"><i class="ti ti-chart-bar-off"></i>暂无数据，报名后这里会生成图表</div>'; return; }
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
  document.getElementById('spExportMenu').classList.toggle('open');
}
document.addEventListener('click', ()=>{ const m = document.getElementById('spExportMenu'); if(m) m.classList.remove('open'); });

function spSubsTable(){
  const cols = [];
  const seen = new Set();
  // 先按活动里字段定义的顺序，再补充历史数据里出现过的其他列
  ((spSubsCurrentEvent && spSubsCurrentEvent.fields) || []).forEach(f=>{ if(!seen.has(f.label)){ seen.add(f.label); cols.push(f.label); } });
  spSubsCache.forEach(s=>Object.keys(s.values||{}).forEach(k=>{ if(!seen.has(k)){ seen.add(k); cols.push(k); } }));
  const header = ['提交时间', ...cols];
  const rows = spSubsCache.map(s=>{
    const vals = s.values || {};
    return [spFmtFull(s.created_at), ...cols.map(c=>{ const v = vals[c]; return Array.isArray(v) ? v.join('、') : (v==null?'':v); })];
  });
  return { header, rows, cols };
}
function spExportSubsXLSX(){
  if(!spSubsCache.length){ spToast('暂无数据可导出'); return; }
  if(!window.XLSX){ spToast('Excel 组件未加载，已改为导出 CSV'); spExportSubsCSV(); return; }
  const { header, rows } = spSubsTable();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h,i)=>{
    const w = Math.max(String(h).length*2, ...rows.map(r=>String(r[i]==null?'':r[i]).length*1.6));
    return { wch: Math.min(40, Math.max(10, Math.ceil(w))) };
  });
  const wb = XLSX.utils.book_new();
  const title = (spSubsCurrentEvent ? spSubsCurrentEvent.title : '报名数据').replace(/[\\\/\?\*\[\]:]/g,'').slice(0,28) || '报名数据';
  XLSX.utils.book_append_sheet(wb, ws, title);
  XLSX.writeFile(wb, `报名数据_${spSubsCurrentEvent?spSubsCurrentEvent.title:'export'}_${Date.now()}.xlsx`);
  spToast('已导出 Excel');
}
function spExportSubsCSV(){
  if(!spSubsCache.length){ spToast('暂无数据可导出'); return; }
  const { header, rows } = spSubsTable();
  const esc = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
  const csv = '\uFEFF' + [header, ...rows].map(r=>r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `报名数据_${spSubsCurrentEvent?spSubsCurrentEvent.title:'export'}_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  spToast('已导出 CSV');
}

// ── 启动 ──
(async function spInit(){
  spInitClient();
  await spLoadState();
  spBoot();
})();
