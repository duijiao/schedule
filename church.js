// church.js — 教会公开主页逻辑
// 跟 app.js 共用同一个 Supabase 项目/同一张 church_app_state 表：
//   - church_site 字段：管理员在排班系统"设置"里上传的 logo / 欢迎横幅背景图
//   - sermon_by_date / sermon_themes_by_date / sermon_passages_by_date / sermon_audio_by_date：
//     本周证道人、主题、经文、录音链接，都是排班系统里已经在维护的数据，这里只读不写。
// 这个页面本身不需要管理员登录，纯展示。

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

// ── 尝试读取实际经文内容（跟排班系统同目录的圣经文本文件，可能不存在，读不到就跳过） ──
async function tryFetchVerseQuote(item) {
  try {
    const res = await fetch('./cmn-cu89s_vpl.txt');
    if (!res.ok) return '';
    const text = await res.text();
    const bookAbbr = item.bookAbbr.toUpperCase();
    const target = `${bookAbbr} ${item.chapter}:${item.verseStart}`;
    const line = text.split(/\r?\n/).find(l => l.startsWith(target + ' '));
    if (!line) return '';
    const match = line.match(/^[A-Z0-9]+\s+\d+:\d+\s+(.*)$/);
    return match ? match[1] : '';
  } catch (e) {
    return '';
  }
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

  const refText = passages.length ? passages.map(formatPassageRef).join('；') : '';
  let quoteText = '';
  if (passages.length) {
    quoteText = await tryFetchVerseQuote(passages[0]);
  }

  const dateLabel = formatDateLabel(upcomingSunday(new Date()));

  const html = `
    <div class="church-sermon-row">
      <div class="church-sermon-thumb"><i class="ti ti-book-2"></i></div>
      <div class="church-sermon-info">
        ${theme ? `<span class="church-sermon-tag">本周主题</span><div class="church-sermon-title">${escapeHtml(theme)}</div>` : ''}
        ${refText ? `<div class="church-sermon-ref">${escapeHtml(refText)}</div>` : ''}
        ${quoteText ? `<div class="church-sermon-quote">「${escapeHtml(quoteText)}」</div>` : ''}
      </div>
    </div>
    <div class="church-sermon-bottom">
      <div class="church-sermon-preacher">
        <div class="church-sermon-avatar"><i class="ti ti-user"></i></div>
        <div>
          <div class="church-sermon-preacher-name">证道人：${preacher ? escapeHtml(preacher) : '待安排'}</div>
          <div class="church-sermon-preacher-date">${dateLabel}</div>
        </div>
      </div>
      ${audioUrl
        ? `<a class="church-sermon-watch-btn" href="${audioUrl}" target="_blank" rel="noopener"><i class="ti ti-player-play-filled"></i>观看证道</a>`
        : `<span class="church-sermon-watch-btn" style="background:#d8d4cc;cursor:default"><i class="ti ti-player-play-filled"></i>暂无录音</span>`}
    </div>
  `;
  document.getElementById('churchSermonBody').innerHTML = html;
}

function renderSermonEmpty() {
  document.getElementById('churchSermonBody').innerHTML =
    `<div class="church-sermon-empty"><i class="ti ti-book-off" style="font-size:22px;display:block;margin-bottom:8px;opacity:0.5"></i>本周证道信息暂未发布，敬请期待</div>`;
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
