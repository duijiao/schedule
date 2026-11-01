// church.js — 教会公开主页逻辑
// 跟 app.js 共用同一个 Supabase 项目/同一张 church_app_state 表：
//   - church_site 字段：管理员在排班系统"设置"里上传的 logo / 欢迎横幅背景图，
//     现在也用它的 liveSlideUrl 字段承载"当前投影内容"图片（见文件底部 ProPresenter 说明）。
//   - sermon_by_date / sermon_themes_by_date / sermon_passages_by_date / sermon_audio_by_date：
//     本周证道人、主题、经文、录音链接，都是排班系统里已经在维护的数据，这里只读不写。
// 这个页面本身不需要管理员登录，纯展示。
//
// SUPABASE_CONFIG、BIBLE_BOOKS、getBibleBookByAbbr、formatSermonPassageRef、toKey
// 这几个跟 app.js 共用的定义，现在统一放在 shared.js 里，church.html 会在这个文件之前加载它。
const SUPABASE_CONFIG = {
  url: 'https://citorcvisrfqkflwortx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdG9yY3Zpc3JmcWtmbHdvcnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTk4NjQsImV4cCI6MjA5NzQ3NTg2NH0.I1G-oO1T3wfWJ5GcmYejT6Y0x2wAJ0xXRQsIcPVPjos',
  table: 'church_app_state',
  rowId: 1,
};

// ── 圣经书卷名对照（跟排班系统 app.js 里的 BIBLE_BOOKS 是同一份） ──
const BIBLE_BOOKS = [
  {name:'创世记', abbr:'gen'}, {name:'出埃及记', abbr:'exo'}, {name:'利未记', abbr:'lev'},
  {name:'民数记', abbr:'num'}, {name:'申命记', abbr:'deu'}, {name:'约书亚记', abbr:'jos'},
  {name:'士师记', abbr:'jdg'}, {name:'路得记', abbr:'rut'}, {name:'撒母耳记上', abbr:'1sa'},
  {name:'撒母耳记下', abbr:'2sa'}, {name:'列王纪上', abbr:'1ki'}, {name:'列王纪下', abbr:'2ki'},
  {name:'历代志上', abbr:'1ch'}, {name:'历代志下', abbr:'2ch'}, {name:'以斯拉记', abbr:'ezr'},
  {name:'尼希米记', abbr:'neh'}, {name:'以斯帖记', abbr:'est'}, {name:'约伯记', abbr:'job'},
  {name:'诗篇', abbr:'psa'}, {name:'箴言', abbr:'pro'}, {name:'传道书', abbr:'ecc'},
  {name:'雅歌', abbr:'sng'}, {name:'以赛亚书', abbr:'isa'}, {name:'耶利米书', abbr:'jer'},
  {name:'耶利米哀歌', abbr:'lam'}, {name:'以西结书', abbr:'ezk'}, {name:'但以理书', abbr:'dan'},
  {name:'何西阿书', abbr:'hos'}, {name:'约珥书', abbr:'jol'}, {name:'阿摩司书', abbr:'amo'},
  {name:'俄巴底亚书', abbr:'oba'}, {name:'约拿书', abbr:'jon'}, {name:'弥迦书', abbr:'mic'},
  {name:'那鸿书', abbr:'nam'}, {name:'哈巴谷书', abbr:'hab'}, {name:'西番雅书', abbr:'zep'},
  {name:'哈该书', abbr:'hag'}, {name:'撒迦利亚书', abbr:'zec'}, {name:'玛拉基书', abbr:'mal'},
  {name:'马太福音', abbr:'mat'}, {name:'马可福音', abbr:'mar'}, {name:'路加福音', abbr:'luk'},
  {name:'约翰福音', abbr:'joh'}, {name:'使徒行传', abbr:'act'}, {name:'罗马书', abbr:'rom'},
  {name:'哥林多前书', abbr:'1co'}, {name:'哥林多后书', abbr:'2co'}, {name:'加拉太书', abbr:'gal'},
  {name:'以弗所书', abbr:'eph'}, {name:'腓立比书', abbr:'phi'}, {name:'歌罗西书', abbr:'col'},
  {name:'帖撒罗尼迦前书', abbr:'1th'}, {name:'帖撒罗尼迦后书', abbr:'2th'}, {name:'提摩太前书', abbr:'1ti'},
  {name:'提摩太后书', abbr:'2ti'}, {name:'提多书', abbr:'tit'}, {name:'腓利门书', abbr:'phm'},
  {name:'希伯来书', abbr:'heb'}, {name:'雅各书', abbr:'jas'}, {name:'彼得前书', abbr:'1pe'},
  {name:'彼得后书', abbr:'2pe'}, {name:'约翰一书', abbr:'1jn'}, {name:'约翰二书', abbr:'2jn'},
  {name:'约翰三书', abbr:'3jn'}, {name:'犹大书', abbr:'jud'}, {name:'启示录', abbr:'rev'},
];
function getBibleBookByAbbr(abbr) { return BIBLE_BOOKS.find(b => b.abbr === abbr); }
function formatPassageRef(item) {
  const book = getBibleBookByAbbr(item.bookAbbr);
  const name = book ? book.name : item.bookAbbr;
  const start = Number(item.verseStart) || 1;
  const end = Math.max(start, Number(item.verseEnd) || start);
  return `${name} ${item.chapter}:${start}${end !== start ? '-' + end : ''}`;
}

function toKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function upcomingSunday(d) {
  const day = d.getDay();
  const diff = (7 - day) % 7;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  return r;
}
function formatDateLabel(d) {
  const isToday = toKey(d) === toKey(new Date());
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${isToday ? '今天主日' : '主日'}）`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 经文正文：跟排班系统同目录的圣经文本文件（cmn-cu89s_vpl.txt），可能不存在，读不到就跳过 ──
// 跟 app.js 里的 loadBibleFile 用同一份文件、同样的格式（BOOK chap:verse text），
// 这里单独做一份轻量索引，church.html 不需要加载整个 app.js。
const BIBLE_FILE = './cmn-cu89s_vpl.txt';
let bibleIndex = null;       // { 'BOOK_chap': [{verse,text}] } | null（null = 还没试过加载）
let bibleLoadFailed = false;

async function ensureBibleIndex() {
  if (bibleIndex || bibleLoadFailed) return;
  try {
    const res = await fetch(BIBLE_FILE);
    if (!res.ok) {
      bibleLoadFailed = true;
      console.error(`[church.js] 经文文件加载失败：HTTP ${res.status}，请确认 ${BIBLE_FILE} 和 church.html 上传在同一个目录下`);
      return;
    }
    const text = await res.text();
    const index = {};
    let matched = 0;
    text.split(/\r?\n/).forEach(line => {
      const m = line.match(/^([A-Z0-9]+)\s+(\d+):(\d+)\s+(.*)$/);
      if (!m) return;
      matched++;
      const key = `${m[1]}_${m[2]}`;
      if (!index[key]) index[key] = [];
      index[key].push({ verse: Number(m[3]), text: m[4] });
    });
    if (!matched) {
      bibleLoadFailed = true;
      console.error(`[church.js] ${BIBLE_FILE} 加载成功，但没有解析出任何经文行，请检查文件格式是否为「BOOK 章:节 经文内容」，比如 GEN 1:1 起初，神创造天地。`);
      return;
    }
    bibleIndex = index;
  } catch (e) {
    bibleLoadFailed = true;
    console.error('[church.js] 经文文件加载出错：', e);
  }
}

// 取某段经文（一个 passage item）对应的经节数组，取不到就返回 []
function getPassageVerses(item) {
  if (!bibleIndex) return [];
  const start = Number(item.verseStart) || 1;
  const end = Math.max(start, Number(item.verseEnd) || start);
  const list = bibleIndex[`${item.bookAbbr.toUpperCase()}_${item.chapter}`] || [];
  return list.filter(v => v.verse >= start && v.verse <= end);
}

async function loadChurchData() {
  if (!window.supabase) { renderSermonEmpty(); renderSongsEmpty(); return; }
  const client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  const { data: row, error } = await client
    .from(SUPABASE_CONFIG.table)
    .select('church_site, sermon_by_date, sermon_themes_by_date, sermon_passages_by_date, sermon_audio_by_date')
    .eq('id', SUPABASE_CONFIG.rowId)
    .single();

  if (error || !row) {
    console.error('教会主页数据加载失败：', error);
    renderSermonEmpty();
    renderSongsEmpty();
    return;
  }

  // 先渲染证道卡片（会生成 #csThumb 占位），再应用 logo/横幅/投影画面，
  // 这样投影画面首次加载就能显示，不用等 15 秒后第一次轮询才出现。
  await renderSermon(row);
  applyChurchSite(row.church_site || {});
  startLiveSlidePolling(client);
  // 本周诗歌单独查询：即使 song_data 读取失败，也不会影响上面的证道卡片
  loadWeeklySongs(client);
}

function applyChurchSite(site) {
  const logoImg = document.getElementById('churchLogoImg');
  const logoFallback = document.getElementById('churchLogoFallback');
  if (site.logoUrl) {
    logoImg.src = site.logoUrl;
    logoImg.style.display = '';
    logoFallback.style.display = 'none';
  }
  // 欢迎横幅已从首页移除，这里保留判断，避免元素不存在时报错
  const banner = document.getElementById('churchWelcomeBanner');
  if (banner && site.bannerUrl) {
    banner.style.backgroundImage = `url("${site.bannerUrl}")`;
  }
  applyLiveSlide(site.liveSlideUrl || '');
}

// ── 证道缩略图：如果配置了 liveSlideUrl（当前投影画面），显示图片；否则显示书本图标 ──
function applyLiveSlide(url) {
  const thumb = document.getElementById('csThumb');
  if (!thumb) return;
  if (!url) {
    thumb.innerHTML = '<i class="ti ti-book-2"></i>';
    return;
  }
  const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  const existingImg = thumb.querySelector('img');
  if (existingImg) {
    existingImg.src = bust;
  } else {
    thumb.innerHTML = `<img src="${bust}" alt="当前投影画面"><span class="cs-live-badge">LIVE</span>`;
  }
}

// 每 15 秒重新读一次 church_site.liveSlideUrl 并刷新图片（简单轮询，不是推送）。
// 只有配置了 liveSlideUrl 才会一直轮询；没配置就不轮询，避免空跑请求。
let liveSlidePollTimer = null;
function startLiveSlidePolling(client) {
  if (liveSlidePollTimer) return;
  liveSlidePollTimer = setInterval(async () => {
    const { data: row, error } = await client
      .from(SUPABASE_CONFIG.table)
      .select('church_site')
      .eq('id', SUPABASE_CONFIG.rowId)
      .single();
    if (error || !row) return;
    const url = (row.church_site || {}).liveSlideUrl || '';
    if (url) applyLiveSlide(url);
  }, 15000);
}


async function renderSermon(row) {
  const key = toKey(upcomingSunday(new Date()));
  const preacher = (row.sermon_by_date || {})[key] || '';
  const theme = (row.sermon_themes_by_date || {})[key] || '';
  const passages = (row.sermon_passages_by_date || {})[key] || [];
  const audioUrl = (row.sermon_audio_by_date || {})[key] || '';

  if (!preacher && !theme && !passages.length) {
    renderSermonEmpty();
    return;
  }

  // 有经文才需要经文正文，提前把索引加载好（内部有缓存，重复调用不会重复请求）
  if (passages.length) await ensureBibleIndex();

  const dateLabel = formatDateLabel(upcomingSunday(new Date()));

  const passageCardsHtml = passages.map(item => {
    const ref = formatPassageRef(item);
    const verses = getPassageVerses(item);
    let bodyHtml;
    if (verses.length) {
      bodyHtml = `<div class="cs-passage-quote">${verses
        .map(v => `<span class="v-num">${v.verse}</span>${escapeHtml(v.text)}`)
        .join(' ')}</div>`;
    } else if (bibleLoadFailed) {
      bodyHtml = `<div class="cs-passage-empty">经文原文暂不可用</div>`;
    } else {
      bodyHtml = `<div class="cs-passage-loading">经文加载中…</div>`;
    }
    return `
      <div class="cs-passage-card">
        <div class="cs-passage-ref"><i class="ti ti-bookmark"></i>${escapeHtml(ref)}</div>
        ${bodyHtml}
      </div>`;
  }).join('');

  const dotsHtml = passages.length > 1
    ? `<div class="cs-dots">${passages
        .map((_, i) => `<button type="button" class="cs-dot${i === 0 ? ' active' : ''}" data-idx="${i}" aria-label="第 ${i + 1} 段经文"></button>`)
        .join('')}</div>`
    : '';

  const html = `
    <div class="cs-top">
      <div class="cs-thumb" id="csThumb"><i class="ti ti-book-2"></i></div>
      <div class="cs-meta">
        ${theme
          ? `<span class="cs-tag">本周主题</span><div class="cs-title">${escapeHtml(theme)}</div>`
          : `<div class="cs-title cs-title-muted">本周证道</div>`}
      </div>
    </div>
    ${passages.length ? `
    <div class="cs-passages">
      <div class="cs-passage-track" id="csPassageTrack">${passageCardsHtml}</div>
      ${dotsHtml}
    </div>` : ''}
    <div class="cs-bottom">
      <div class="cs-preacher">
        <div class="cs-avatar"><i class="ti ti-user"></i></div>
        <div>
          <div class="cs-preacher-name">证道人：${preacher ? escapeHtml(preacher) : '待安排'}</div>
          <div class="cs-preacher-date">${escapeHtml(dateLabel)}</div>
        </div>
      </div>
      ${audioUrl
        ? `<a class="cs-watch-btn" href="${audioUrl}" target="_blank" rel="noopener"><i class="ti ti-player-play-filled"></i>观看证道</a>`
        : `<span class="cs-watch-btn cs-watch-btn-disabled"><i class="ti ti-player-play-filled"></i>暂无录音</span>`}
    </div>
  `;
  document.getElementById('churchSermonBody').innerHTML = html;

  if (passages.length > 1) setupPassageDots();
}

// 多段经文卡片：点圆点跳转到对应卡片，滑动时同步高亮当前圆点
function setupPassageDots() {
  const track = document.getElementById('csPassageTrack');
  const dots = Array.from(document.querySelectorAll('.cs-dot'));
  if (!track || !dots.length) return;

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = Number(dot.dataset.idx);
      const card = track.children[idx];
      if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    });
  });

  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const idx = Math.round(track.scrollLeft / (track.clientWidth || 1));
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      ticking = false;
    });
  });
}

function renderSermonEmpty() {
  document.getElementById('churchSermonBody').innerHTML =
    `<div class="cs-empty"><i class="ti ti-book-off" style="font-size:22px;display:block;margin-bottom:8px"></i>本周证道信息暂未发布，敬请期待</div>`;
}

// ══════════════════════════════════════════════════════════════
// 本周诗歌：读取排班系统 song_data（{ 'YYYY-MM-DD': [{title, src}] }），
// 取本周主日（跟证道同一个日期规则）的歌谱图片，双列展示；点击进入大图查看器，可放大缩小。
// ══════════════════════════════════════════════════════════════
let weeklySongs = [];   // 只保留有图片的歌，供大图查看器翻页使用

async function loadWeeklySongs(client) {
  try {
    const { data: row, error } = await client
      .from(SUPABASE_CONFIG.table)
      .select('song_data')
      .eq('id', SUPABASE_CONFIG.rowId)
      .single();
    if (error || !row) {
      console.error('本周诗歌加载失败：', error);
      renderSongsEmpty();
      return;
    }
    const key = toKey(upcomingSunday(new Date()));
    const list = Array.isArray((row.song_data || {})[key]) ? row.song_data[key] : [];
    renderSongs(list.map(s => ({ title: (s && s.title) || '', src: (s && (s.src || s.image_url)) || '' }))
      .filter(s => s.title || s.src));
  } catch (e) {
    console.error('本周诗歌加载出错：', e);
    renderSongsEmpty();
  }
}

function renderSongsEmpty() {
  const body = document.getElementById('churchSongBody');
  if (!body) return;
  const cnt = document.getElementById('csSongCount');
  if (cnt) cnt.textContent = '';
  body.innerHTML = `<div class="cs-empty"><i class="ti ti-music-off" style="font-size:22px;display:block;margin-bottom:8px"></i>本周诗歌暂未发布，敬请期待</div>`;
}

function renderSongs(list) {
  const body = document.getElementById('churchSongBody');
  if (!body) return;
  if (!list.length) { renderSongsEmpty(); return; }

  weeklySongs = list.filter(s => s.src);
  const cnt = document.getElementById('csSongCount');
  if (cnt) cnt.textContent = `共 ${list.length} 首`;

  body.innerHTML = `<div class="cs-song-grid">${list.map((s, i) => {
    const title = escapeHtml(s.title || `诗歌 ${i + 1}`);
    if (!s.src) {
      return `<div class="cs-song-item"><div class="cs-song-thumb"><span class="cs-song-num">${i + 1}</span><i class="ti ti-photo-off"></i></div>
        <div class="cs-song-title">${title}</div><div class="cs-song-nosrc">暂无歌谱图片</div></div>`;
    }
    const lbIdx = weeklySongs.indexOf(s);
    return `<button type="button" class="cs-song-item" data-idx="${lbIdx}" aria-label="查看歌谱：${title}">
      <div class="cs-song-thumb">
        <span class="cs-song-num">${i + 1}</span>
        <img src="${escapeHtml(s.src)}" alt="${title}" loading="lazy">
        <span class="cs-song-zoom"><i class="ti ti-zoom-in"></i></span>
      </div>
      <div class="cs-song-title">${title}</div>
    </button>`;
  }).join('')}</div>`;

  // 图片加载失败时显示占位图标，避免出现破图
  body.querySelectorAll('.cs-song-thumb img').forEach(img => {
    img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('i'), { className: 'ti ti-photo-off' }));
    });
  });
  body.querySelectorAll('.cs-song-item[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => openSongLightbox(Number(btn.dataset.idx)));
  });
}

// ── 歌谱大图查看器：放大/缩小/还原、双指缩放、拖动、左右切换 ──
const SL = { idx: 0, scale: 1, tx: 0, ty: 0, min: 1, max: 5, pointers: new Map(), pinchDist: 0, pinchScale: 1,
             downX: 0, downY: 0, downT: 0, moved: false, swipeStartX: 0, ready: false };

function slEls() {
  return {
    overlay: document.getElementById('songLightbox'), stage: document.getElementById('slStage'),
    img: document.getElementById('slImg'), title: document.getElementById('slTitle'),
    counter: document.getElementById('slCounter'), prev: document.getElementById('slPrev'), next: document.getElementById('slNext'),
  };
}

function slApply() {
  const { img, stage } = slEls();
  // 限制拖动范围：图片放大后不能被拖出可视区域
  const maxX = Math.max(0, (img.clientWidth * SL.scale - stage.clientWidth) / 2);
  const maxY = Math.max(0, (img.clientHeight * SL.scale - stage.clientHeight) / 2);
  SL.tx = Math.max(-maxX, Math.min(maxX, SL.tx));
  SL.ty = Math.max(-maxY, Math.min(maxY, SL.ty));
  img.style.transform = `translate(${SL.tx}px, ${SL.ty}px) scale(${SL.scale})`;
  stage.classList.toggle('zoomed', SL.scale > 1.01);
}

// 以舞台中心为原点的坐标 (cx, cy) 为焦点缩放，让手指/鼠标所在位置保持不动
function slZoomTo(newScale, cx = 0, cy = 0) {
  newScale = Math.max(SL.min, Math.min(SL.max, newScale));
  const ratio = newScale / SL.scale;
  SL.tx = cx - (cx - SL.tx) * ratio;
  SL.ty = cy - (cy - SL.ty) * ratio;
  SL.scale = newScale;
  if (newScale <= SL.min) { SL.tx = 0; SL.ty = 0; }
  slApply();
}
function slReset() { SL.scale = 1; SL.tx = 0; SL.ty = 0; slApply(); }

function slShow() {
  const { img, title, counter, prev, next } = slEls();
  const s = weeklySongs[SL.idx];
  if (!s) return;
  slReset();
  img.src = s.src;
  title.textContent = s.title || `诗歌 ${SL.idx + 1}`;
  const total = weeklySongs.length;
  counter.textContent = total > 1 ? `${SL.idx + 1} / ${total}` : '';
  prev.style.display = next.style.display = total > 1 ? 'flex' : 'none';
  prev.disabled = SL.idx <= 0;
  next.disabled = SL.idx >= total - 1;
}
function slStep(d) {
  const n = SL.idx + d;
  if (n < 0 || n >= weeklySongs.length) return;
  SL.idx = n;
  slShow();
}

function openSongLightbox(idx) {
  if (!weeklySongs.length) return;
  setupSongLightbox();
  SL.idx = Math.max(0, Math.min(idx, weeklySongs.length - 1));
  const { overlay } = slEls();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  slShow();
}
function closeSongLightbox() {
  const { overlay } = slEls();
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  SL.pointers.clear();
}

function setupSongLightbox() {
  if (SL.ready) return;
  SL.ready = true;
  const { overlay, stage } = slEls();
  const stageCenter = (clientX, clientY) => {
    const r = stage.getBoundingClientRect();
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  };
  const dist = () => { const [a, b] = [...SL.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  document.getElementById('slClose').addEventListener('click', closeSongLightbox);
  document.getElementById('slPrev').addEventListener('click', e => { e.stopPropagation(); slStep(-1); });
  document.getElementById('slNext').addEventListener('click', e => { e.stopPropagation(); slStep(1); });
  document.getElementById('slZoomIn').addEventListener('click', () => slZoomTo(SL.scale * 1.4));
  document.getElementById('slZoomOut').addEventListener('click', () => slZoomTo(SL.scale / 1.4));
  document.getElementById('slReset').addEventListener('click', slReset);

  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') closeSongLightbox();
    else if (e.key === 'ArrowLeft') slStep(-1);
    else if (e.key === 'ArrowRight') slStep(1);
    else if (e.key === '+' || e.key === '=') slZoomTo(SL.scale * 1.4);
    else if (e.key === '-') slZoomTo(SL.scale / 1.4);
    else if (e.key === '0') slReset();
  });

  // 电脑端：滚轮缩放
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const c = stageCenter(e.clientX, e.clientY);
    slZoomTo(SL.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), c.x, c.y);
  }, { passive: false });

  // 触摸/鼠标统一用 Pointer 事件：单指拖动/点按切换缩放/左右滑动换歌，双指捏合缩放
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.sl-nav')) return;
    stage.setPointerCapture(e.pointerId);
    SL.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (SL.pointers.size === 1) {
      SL.downX = SL.swipeStartX = e.clientX; SL.downY = e.clientY; SL.downT = Date.now(); SL.moved = false;
    } else if (SL.pointers.size === 2) {
      SL.pinchDist = dist(); SL.pinchScale = SL.scale; SL.moved = true;
    }
  });
  stage.addEventListener('pointermove', e => {
    const p = SL.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (SL.pointers.size === 2) {
      const [a, b] = [...SL.pointers.values()];
      const c = stageCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (SL.pinchDist > 0) slZoomTo(SL.pinchScale * dist() / SL.pinchDist, c.x, c.y);
    } else if (SL.pointers.size === 1) {
      if (Math.hypot(e.clientX - SL.downX, e.clientY - SL.downY) > 8) SL.moved = true;
      if (SL.scale > 1.01) { SL.tx += dx; SL.ty += dy; slApply(); }
    }
  });
  const endPointer = e => {
    if (!SL.pointers.has(e.pointerId)) return;
    const wasSingle = SL.pointers.size === 1;
    SL.pointers.delete(e.pointerId);
    if (SL.pointers.size === 1) { // 捏合结束后剩一根手指，重置起点，避免误触发点按
      SL.moved = true;
    }
    if (!wasSingle || e.type === 'pointercancel') return;
    const dx = e.clientX - SL.swipeStartX;
    if (!SL.moved && Date.now() - SL.downT < 400) {
      // 轻点：在 1 倍和 2.5 倍之间切换
      if (SL.scale > 1.01) slReset();
      else { const c = stageCenter(e.clientX, e.clientY); slZoomTo(2.5, c.x, c.y); }
    } else if (SL.scale <= 1.01 && Math.abs(dx) > 60 && Math.abs(e.clientY - SL.downY) < Math.abs(dx)) {
      slStep(dx > 0 ? -1 : 1); // 没放大时左右滑动切换上一首/下一首
    }
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  window.addEventListener('resize', () => { if (overlay.classList.contains('open')) slApply(); });
}

function shareChurchPage() {
  const url = location.href;
  const title = document.title;
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
    return;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => alert('链接已复制'));
  } else {
    alert(url);
  }
}

loadChurchData();
