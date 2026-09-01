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
  if (!window.supabase) { renderSermonEmpty(); return; }
  const client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  const { data: row, error } = await client
    .from(SUPABASE_CONFIG.table)
    .select('church_site, sermon_by_date, sermon_themes_by_date, sermon_passages_by_date, sermon_audio_by_date')
    .eq('id', SUPABASE_CONFIG.rowId)
    .single();

  if (error || !row) {
    console.error('教会主页数据加载失败：', error);
    renderSermonEmpty();
    return;
  }

  applyChurchSite(row.church_site || {});
  await renderSermon(row);
  startLiveSlidePolling(client);
}

function applyChurchSite(site) {
  const logoImg = document.getElementById('churchLogoImg');
  const logoFallback = document.getElementById('churchLogoFallback');
  if (site.logoUrl) {
    logoImg.src = site.logoUrl;
    logoImg.style.display = '';
    logoFallback.style.display = 'none';
  }
  const banner = document.getElementById('churchWelcomeBanner');
  if (site.bannerUrl) {
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

  const dateLabel = formatDateLabel(upcomingSunday(new Date()));

  const body = document.getElementById('churchSermonBody');
  body.innerHTML = `
    <div class="cs-top">
      <div class="cs-thumb" id="csThumb"><i class="ti ti-book-2"></i></div>
      <div class="cs-meta">
        ${theme ? `<span class="cs-tag">本周主题</span><div class="cs-title">${escapeHtml(theme)}</div>` : `<div class="cs-title cs-title-muted">本周主题待发布</div>`}
      </div>
    </div>
    ${passages.length ? `
    <div class="cs-passages">
      <div class="cs-passage-track" id="csPassageTrack">
        ${passages.map((item, i) => `
          <div class="cs-passage-card">
            <div class="cs-passage-ref"><i class="ti ti-bookmark"></i>${escapeHtml(formatSermonPassageRef(item))}</div>
            <div class="cs-passage-quote" id="csQuote-${i}"><span class="cs-passage-loading">正在加载经文…</span></div>
          </div>`).join('')}
      </div>
      ${passages.length > 1 ? `<div class="cs-dots" id="csDots">${passages.map((_, i) => `<span class="cs-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>` : ''}
    </div>` : ''}
    <div class="cs-bottom">
      <div class="cs-preacher">
        <div class="cs-avatar"><i class="ti ti-user"></i></div>
        <div>
          <div class="cs-preacher-name">证道人：${preacher ? escapeHtml(preacher) : '待安排'}</div>
          <div class="cs-preacher-date">${dateLabel}</div>
        </div>
      </div>
      ${audioUrl
        ? `<a class="cs-watch-btn" href="${audioUrl}" target="_blank" rel="noopener"><i class="ti ti-player-play-filled"></i>观看证道</a>`
        : `<span class="cs-watch-btn cs-watch-btn-disabled"><i class="ti ti-player-play-filled"></i>暂无录音</span>`}
    </div>
  `;

  // liveSlideUrl 已经在 applyChurchSite 里读过一次了，thumb 刚被重建，需要重新套用
  applyLiveSlide((row.church_site || {}).liveSlideUrl || '');

  if (passages.length) hydratePassageQuotes(passages);
  if (passages.length > 1) wirePassageDots(passages.length);
}

async function hydratePassageQuotes(passages) {
  await ensureBibleIndex();
  passages.forEach((item, i) => {
    const el = document.getElementById(`csQuote-${i}`);
    if (!el) return;
    const verses = getPassageVerses(item);
    if (!verses.length) {
      el.innerHTML = `<span class="cs-passage-empty">经文内容暂不可查看</span>`;
      if (bibleLoadFailed) {
        console.error('[church.js] 经文正文未能显示：经文文件没有加载成功（见上方错误）');
      } else {
        console.error(`[church.js] 经文正文未能显示：在经文文件里没有找到 ${item.bookAbbr.toUpperCase()}_${item.chapter}（对应 ${formatSermonPassageRef(item)}），请检查该书卷缩写、章节是否正确`);
      }
      return;
    }
    el.innerHTML = verses.map(v => `<span class="v-num">${v.verse}</span>${escapeHtml(v.text)}`).join(' ');
  });
}

function wirePassageDots(count) {
  const track = document.getElementById('csPassageTrack');
  const dots = document.getElementById('csDots');
  if (!track || !dots) return;
  const dotEls = Array.from(dots.children);
  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const cardWidth = track.clientWidth;
      const idx = Math.round(track.scrollLeft / cardWidth);
      dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
      ticking = false;
    });
  }, { passive: true });
  dotEls.forEach((d, i) => {
    d.addEventListener('click', () => {
      track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    });
  });
}

function renderSermonEmpty() {
  document.getElementById('churchSermonBody').innerHTML =
    `<div class="cs-empty"><i class="ti ti-book-off" style="font-size:22px;display:block;margin-bottom:8px;opacity:0.5"></i>本周证道信息暂未发布，敬请期待</div>`;
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
