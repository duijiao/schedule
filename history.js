// history.js — 历史证道库页面逻辑
// 跟 church.js 读同一个 Supabase 项目/同一张 church_app_state 表，只读不写，不需要管理员登录。
// 这里没有引入 church.js（它结尾会自动执行 loadChurchData()，操作的是主页专属的 DOM 元素，
// 放到这个页面里会报错），所以把用得到的几个小工具函数在这里单独复制了一份，跟 church.js 保持一致。
const SUPABASE_CONFIG = {
  url: 'https://citorcvisrfqkflwortx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdG9yY3Zpc3JmcWtmbHdvcnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTk4NjQsImV4cCI6MjA5NzQ3NTg2NH0.I1G-oO1T3wfWJ5GcmYejT6Y0x2wAJ0xXRQsIcPVPjos',
  table: 'church_app_state',
  rowId: 1,
};

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
function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function formatHistoryDate(d) { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（主日）`; }
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PAGE_SIZE = 7;
let allSermons = [];       // 全部历史证道，按日期倒序
let filteredSermons = [];  // 经过年份/筛选/搜索之后的结果
let currentPage = 1;
let activeYear = 'all';
let audioOnlyFilter = false;
let searchQuery = '';

async function loadHistory() {
  if (!window.supabase) { showLoadError(); return; }
  const client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  // select('*') 而不是点名字段：以后排班系统给证道加新字段（比如分类标签）时，
  // 这个页面不用改查询语句也能自动读到。
  const { data: row, error } = await client
    .from(SUPABASE_CONFIG.table)
    .select('*')
    .eq('id', SUPABASE_CONFIG.rowId)
    .single();

  if (error || !row) {
    console.error('历史证道库加载失败：', error);
    showLoadError();
    return;
  }

  allSermons = buildSermonList(row);
  document.getElementById('hsTotalCount').textContent = allSermons.length;
  renderYearTabs();
  applyFilters();
}

// 把 sermon_by_date / sermon_themes_by_date / sermon_passages_by_date / sermon_audio_by_date
// 这几张按日期存的表汇总成一个列表，只保留今天以前（已经讲过）的记录。
// sermon_tags_by_date 是预留的：排班系统如果以后加了证道分类标签，这里会自动显示；现在没有就不显示标签。
function buildSermonList(row) {
  const byPreacher = row.sermon_by_date || {};
  const byTheme = row.sermon_themes_by_date || {};
  const byPassages = row.sermon_passages_by_date || {};
  const byAudio = row.sermon_audio_by_date || {};
  const byTag = row.sermon_tags_by_date || {};

  const keys = new Set([
    ...Object.keys(byPreacher), ...Object.keys(byTheme),
    ...Object.keys(byPassages), ...Object.keys(byAudio),
  ]);
  const todayKey = toKey(new Date());

  const list = [];
  keys.forEach(key => {
    if (key > todayKey) return; // 还没到的主日不算"历史"
    const preacher = byPreacher[key] || '';
    const theme = byTheme[key] || '';
    const passages = byPassages[key] || [];
    const audioUrl = byAudio[key] || '';
    const tag = byTag[key] || '';
    if (!preacher && !theme && !passages.length) return; // 空日期跳过
    const date = parseKey(key);
    if (!date) return;
    list.push({ key, date, preacher, theme, passages, audioUrl, tag });
  });

  list.sort((a, b) => b.date - a.date);
  return list;
}

function renderYearTabs() {
  const years = Array.from(new Set(allSermons.map(s => s.date.getFullYear()))).sort((a, b) => b - a);
  const recentYears = years.slice(0, 3);
  const earlierYears = years.slice(3);

  const track = document.getElementById('yearTabs');
  let html = `<button type="button" class="hs-tab active" data-year="all">全部</button>`;
  recentYears.forEach(y => { html += `<button type="button" class="hs-tab" data-year="${y}">${y}年</button>`; });
  if (earlierYears.length) html += `<button type="button" class="hs-tab" data-year="earlier">更早</button>`;
  track.innerHTML = html;
  track.dataset.earlierYears = JSON.stringify(earlierYears);

  track.querySelectorAll('.hs-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeYear = btn.dataset.year;
      track.querySelectorAll('.hs-tab').forEach(b => b.classList.toggle('active', b === btn));
      currentPage = 1;
      applyFilters();
    });
  });
}

function applyFilters() {
  let list = allSermons;

  if (activeYear === 'earlier') {
    const track = document.getElementById('yearTabs');
    const earlierYears = JSON.parse(track.dataset.earlierYears || '[]');
    list = list.filter(s => earlierYears.includes(s.date.getFullYear()));
  } else if (activeYear !== 'all') {
    list = list.filter(s => s.date.getFullYear() === Number(activeYear));
  }

  if (audioOnlyFilter) list = list.filter(s => !!s.audioUrl);

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(s =>
      (s.theme && s.theme.toLowerCase().includes(q)) ||
      (s.preacher && s.preacher.toLowerCase().includes(q)) ||
      s.passages.some(p => formatPassageRef(p).toLowerCase().includes(q))
    );
  }

  filteredSermons = list;
  renderPage();
}

function renderPage() {
  const totalPages = Math.max(1, Math.ceil(filteredSermons.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredSermons.slice(start, start + PAGE_SIZE);

  const list = document.getElementById('hsList');
  if (!filteredSermons.length) {
    list.innerHTML = `<div class="hs-empty"><i class="ti ti-book-off"></i>没有找到符合条件的证道记录</div>`;
  } else {
    list.innerHTML = pageItems.map(renderCard).join('');
    list.querySelectorAll('.hs-more-btn').forEach(btn => {
      btn.addEventListener('click', () => shareSermon(btn.dataset.key));
    });
  }

  document.getElementById('hsPageLabel').textContent = `${currentPage} / ${totalPages}`;
  document.getElementById('hsPrevBtn').disabled = currentPage <= 1;
  document.getElementById('hsNextBtn').disabled = currentPage >= totalPages;
}

function renderCard(s) {
  const refText = s.passages.length ? s.passages.map(formatPassageRef).join('；') : '暂无经文';
  const dateText = formatHistoryDate(s.date);
  const title = s.theme || (s.preacher ? `${s.preacher}的证道` : '本周证道');
  const playHtml = s.audioUrl
    ? `<a class="hs-play-btn" href="${s.audioUrl}" target="_blank" rel="noopener"><i class="ti ti-player-play-filled"></i>播放</a>`
    : `<span class="hs-play-btn hs-play-btn-disabled"><i class="ti ti-player-play-filled"></i>暂无</span>`;
  return `
    <div class="hs-card">
      <div class="hs-card-icon"><i class="ti ti-book-2"></i></div>
      <div class="hs-card-body">
        <div class="hs-card-title">${escapeHtml(title)}</div>
        <div class="hs-card-ref">${escapeHtml(refText)}</div>
        <div class="hs-card-meta">
          <span class="hs-card-date">${escapeHtml(dateText)}</span>
          ${s.tag ? `<span class="hs-card-tag">${escapeHtml(s.tag)}</span>` : ''}
        </div>
      </div>
      <div class="hs-card-actions">
        ${playHtml}
        <button type="button" class="hs-more-btn" data-key="${s.key}" aria-label="更多"><i class="ti ti-dots"></i></button>
      </div>
    </div>`;
}

function shareSermon(key) {
  const item = allSermons.find(s => s.key === key);
  const url = `${location.origin}${location.pathname}?date=${key}`;
  const title = item && item.theme ? item.theme : '证道分享';
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

function showLoadError() {
  document.getElementById('hsList').innerHTML =
    `<div class="hs-empty"><i class="ti ti-alert-circle"></i>历史证道加载失败，请稍后重试</div>`;
  document.getElementById('hsTotalCount').textContent = '0';
}

function goBack() {
  if (document.referrer && document.referrer.indexOf(location.host) !== -1 && history.length > 1) {
    history.back();
  } else {
    location.href = 'church.html';
  }
}

document.getElementById('hsSearchBtn').addEventListener('click', () => {
  const bar = document.getElementById('hsSearchBar');
  const willShow = bar.style.display !== 'flex';
  bar.style.display = willShow ? 'flex' : 'none';
  if (willShow) document.getElementById('hsSearchInput').focus();
});

document.getElementById('hsSearchInput').addEventListener('input', e => {
  searchQuery = e.target.value;
  currentPage = 1;
  applyFilters();
});

document.getElementById('hsFilterBtn').addEventListener('click', () => {
  audioOnlyFilter = !audioOnlyFilter;
  const btn = document.getElementById('hsFilterBtn');
  btn.classList.toggle('active', audioOnlyFilter);
  btn.innerHTML = audioOnlyFilter
    ? `<i class="ti ti-check"></i>仅有录音`
    : `<i class="ti ti-filter"></i>筛选`;
  currentPage = 1;
  applyFilters();
});

document.getElementById('hsPrevBtn').addEventListener('click', () => {
  if (currentPage > 1) { currentPage--; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
document.getElementById('hsNextBtn').addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(filteredSermons.length / PAGE_SIZE));
  if (currentPage < totalPages) { currentPage++; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});

loadHistory();
