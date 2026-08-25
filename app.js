// ── Data ──────────────────────────────────────────────
const ZH_MONTHS = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];

// ── Rotation config (editable) ────────────────────────
// 初始数据现在从 config.js 里的 window.APP_CONFIG 读取（内容与 config.json 一致），
// 而不是直接写死在这个文件里，方便单独维护/编辑数据。
let rotationConfig = window.APP_CONFIG.rotationConfig;

// Per-Sunday sermon: { 'YYYY-MM-DD': '证道人' }
let sermonByDate = window.APP_CONFIG.sermonByDate;

// 特别聚会日期：除了每周固定的主日之外，管理员可以额外添加的排班日期
// （比如培灵会、退修会这种一周里连续好几天都要排班的场合）。
// 结构：{ 'YYYY-MM-DD': '标签文字，比如"特别聚会"' }
let customEventDates = window.APP_CONFIG.customEventDates;

function getRotationPerson(cfg, key) {
  const base = new Date(cfg.base + 'T00:00:00');
  const cur  = new Date(key + 'T00:00:00');
  const week = Math.round((cur - base) / (7 * 24 * 60 * 60 * 1000));
  const list = cfg.list;
  return list[((week % list.length) + list.length) % list.length];
}

function getSermonForKey(key) {
  return sermonByDate[key] || '（待上传）';
}

function getNoticeForKey(key) {
  return {
    leader: getRotationPerson(rotationConfig.leader, key),
    sermon: getSermonForKey(key),
    prayer: getRotationPerson(rotationConfig.prayer, key),
  };
}

// songData: { key: [{title, src}] }
let songData = window.APP_CONFIG.songData;

// ── Song library (歌单库) ──────────────────────────────
const LS_SONG_LIBRARY = 'churchSongLibrary';
let songLibrary = []; // [{id, title, category, lyrics, keys:[{id,label,src}], createdAt}]
function loadSongLibrary() {
  try {
    const raw = localStorage.getItem(LS_SONG_LIBRARY);
    songLibrary = normalizeSongLibrary(raw ? JSON.parse(raw) : []);
  } catch (e) { songLibrary = []; }
}
function persistSongLibrary() {
  try { localStorage.setItem(LS_SONG_LIBRARY, JSON.stringify(songLibrary)); } catch (e) {}
}
// ── "我的收藏"只存在本机 localStorage，不随歌单库同步到云端 ──
// （收藏是个人偏好，换设备/换人登录不应该互相影响，所以刻意不放进 song_library 的同步字段里）
const LS_SONG_LIB_FAVORITES = 'churchSongLibFavoritesLocal';
let songLibFavoriteIds = new Set();
function loadSongLibFavorites() {
  try {
    const raw = localStorage.getItem(LS_SONG_LIB_FAVORITES);
    songLibFavoriteIds = new Set(raw ? JSON.parse(raw) : []);
  } catch (e) { songLibFavoriteIds = new Set(); }
}
function persistSongLibFavorites() {
  try { localStorage.setItem(LS_SONG_LIB_FAVORITES, JSON.stringify([...songLibFavoriteIds])); } catch (e) {}
}
function isSongLibFavorite(id) {
  return songLibFavoriteIds.has(id);
}
// ── 管理员手动添加的分类（即使还没有歌曲用到，也会出现在侧边分类栏里）──
const LS_SONG_LIB_CATEGORIES = 'churchSongLibCategories';
let songLibCategories = [];
function normalizeSongLibCategoryList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach(c => {
    const v = String(c || '').trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  });
  return out;
}
function loadSongLibCategories() {
  try {
    const raw = localStorage.getItem(LS_SONG_LIB_CATEGORIES);
    songLibCategories = normalizeSongLibCategoryList(raw ? JSON.parse(raw) : []);
  } catch (e) { songLibCategories = []; }
}
function persistSongLibCategories() {
  try { localStorage.setItem(LS_SONG_LIB_CATEGORIES, JSON.stringify(songLibCategories)); } catch (e) {}
}
async function syncSongLibCategoriesToRemote() {
  try { await syncRemoteField('song_lib_categories', songLibCategories); } catch (e) {}
}
// ── 管理员手动添加的诗歌本（与分类联动：选中某个分类后，诗歌本栏只显示该分类下用到的诗歌本）──
const LS_SONG_LIB_SONGBOOKS = 'churchSongLibSongbooks';
let songLibSongbooks = [];
function normalizeSongLibSongbookList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach(c => {
    const v = String(c || '').trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  });
  return out;
}
function loadSongLibSongbooks() {
  try {
    const raw = localStorage.getItem(LS_SONG_LIB_SONGBOOKS);
    songLibSongbooks = normalizeSongLibSongbookList(raw ? JSON.parse(raw) : []);
  } catch (e) { songLibSongbooks = []; }
}
function persistSongLibSongbooks() {
  try { localStorage.setItem(LS_SONG_LIB_SONGBOOKS, JSON.stringify(songLibSongbooks)); } catch (e) {}
}
async function syncSongLibSongbooksToRemote() {
  try { await syncRemoteField('song_lib_songbooks', songLibSongbooks); } catch (e) {}
}
// ── 诗歌库专属 Supabase 存储配置（仅管理员可修改，用于 mp3 上传）──
const LS_SONGLIB_SB_CONFIG = 'churchSongLibSbConfig';
let songLibSupabaseConfig = { url: '', anonKey: '', bucket: 'songs' };
let songLibSupabaseClient = null;
let songLibSupabaseClientKey = '';
function normalizeSongLibSbConfig(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    url: typeof o.url === 'string' ? o.url.trim() : '',
    anonKey: typeof o.anonKey === 'string' ? o.anonKey.trim() : '',
    bucket: (typeof o.bucket === 'string' && o.bucket.trim()) ? o.bucket.trim() : 'songs',
  };
}
function loadSongLibSupabaseConfig() {
  try {
    const raw = localStorage.getItem(LS_SONGLIB_SB_CONFIG);
    songLibSupabaseConfig = normalizeSongLibSbConfig(raw ? JSON.parse(raw) : {});
  } catch (e) { songLibSupabaseConfig = normalizeSongLibSbConfig({}); }
}
function persistSongLibSupabaseConfig() {
  try { localStorage.setItem(LS_SONGLIB_SB_CONFIG, JSON.stringify(songLibSupabaseConfig)); } catch (e) {}
}
function getSongLibSupabaseClient() {
  const cfg = songLibSupabaseConfig;
  if (!cfg.url || !cfg.anonKey || !window.supabase) return null;
  const key = cfg.url + '|' + cfg.anonKey;
  if (!songLibSupabaseClient || songLibSupabaseClientKey !== key) {
    songLibSupabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    songLibSupabaseClientKey = key;
  }
  return songLibSupabaseClient;
}
function fillSongLibStorageSettingsInputs() {
  const u = document.getElementById('songLibSbUrl');
  const k = document.getElementById('songLibSbAnonKey');
  const b = document.getElementById('songLibSbBucket');
  if (u) u.value = songLibSupabaseConfig.url || '';
  if (k) k.value = songLibSupabaseConfig.anonKey || '';
  if (b) b.value = songLibSupabaseConfig.bucket || 'songs';
}
async function saveSongLibStorageConfig() {
  if (!isAdmin) return;
  const url = (document.getElementById('songLibSbUrl').value || '').trim();
  const anonKey = (document.getElementById('songLibSbAnonKey').value || '').trim();
  const bucket = (document.getElementById('songLibSbBucket').value || '').trim() || 'songs';
  songLibSupabaseConfig = normalizeSongLibSbConfig({ url, anonKey, bucket });
  songLibSupabaseClient = null; // 强制用新配置重新建立连接
  persistSongLibSupabaseConfig();
  showToast('✅ 诗歌库存储配置已保存');
  try { await syncRemoteField('song_lib_storage_config', songLibSupabaseConfig); } catch (e) {}
}
async function uploadMusicMp3File(file) {
  const client = getSongLibSupabaseClient();
  if (!client) throw new Error('尚未配置诗歌库 Supabase 存储，请联系管理员在"设置"中配置');
  const bucket = songLibSupabaseConfig.bucket || 'songs';
  const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
  const filePath = `${Date.now()}_${safeName}`;
  const { error } = await client.storage.from(bucket).upload(filePath, file, {
    contentType: file.type || 'audio/mpeg',
    upsert: true,
  });
  if (error) throw new Error(error.message || '上传失败');
  const { data } = client.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
async function handleMusicLinkMp3Select(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const errEl = document.getElementById('musicLinkAddError');
  const urlInput = document.getElementById('musicLinkAddUrl');
  const labelInput = document.getElementById('musicLinkAddLabel');
  errEl.classList.remove('show');
  urlInput.disabled = true;
  const prevPlaceholder = urlInput.placeholder;
  urlInput.value = '';
  urlInput.placeholder = '⏳ 正在上传 mp3…';
  try {
    const publicUrl = await uploadMusicMp3File(file);
    urlInput.value = publicUrl;
    if (!labelInput.value.trim()) labelInput.value = file.name.replace(/\.[^.]+$/, '');
    showToast('✅ mp3 上传成功');
  } catch (e) {
    errEl.textContent = e.message || '上传失败，请检查诗歌库存储设置';
    errEl.classList.add('show');
  } finally {
    urlInput.disabled = false;
    urlInput.placeholder = prevPlaceholder;
    input.value = '';
  }
}
function genSongLibId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
function normalizeSongLibrary(raw) {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set();
  return raw.map(item => {
    let id = item?.id || genSongLibId();
    while (seenIds.has(id)) id = id + '_' + Math.random().toString(36).slice(2, 4);
    seenIds.add(id);
    let keys;
    if (Array.isArray(item?.keys)) {
      const seenKeyIds = new Set();
      keys = item.keys.map(k => {
        let kid = k?.id || genSongLibId();
        while (seenKeyIds.has(kid)) kid = kid + '_' + Math.random().toString(36).slice(2, 4);
        seenKeyIds.add(kid);
        return { id: kid, label: (k?.label || '').trim(), src: k?.src || '' };
      }).filter(k => k.src);
    } else {
      keys = [];
    }
    // 旧数据迁移：早期版本每首歌只有单个 src 字段，没有"调"的概念，
    // 迁移成 keys 数组里唯一一项，标签留空（显示为"默认"）
    if (!keys.length && item?.src) {
      keys = [{ id: genSongLibId(), label: '', src: item.src }];
    }
    let music;
    if (Array.isArray(item?.music)) {
      const seenMusicIds = new Set();
      music = item.music.map(m => {
        let mid = m?.id || genSongLibId();
        while (seenMusicIds.has(mid)) mid = mid + '_' + Math.random().toString(36).slice(2, 4);
        seenMusicIds.add(mid);
        return { id: mid, label: (m?.label || '').trim(), url: (m?.url || '').trim() };
      }).filter(m => m.url);
    } else {
      music = [];
    }
    return {
      id,
      title: (item?.title || '').trim(),
      category: (item?.category || '').trim(),
      band: (item?.band || '').trim(),
      songbook: (item?.songbook || '').trim(),
      lyrics: item?.lyrics || '',
      keys,
      music,
      lastPlayedAt: item?.lastPlayedAt || null,
      createdAt: item?.createdAt || new Date().toISOString(),
    };
  }).filter(item => item.title);
}
// 确保某首歌（按标题去重）存在于歌单库；已存在则在没有任何调的情况下补充一个默认调，返回库内记录
function ensureSongInLibrary(title, src) {
  const t = (title || '').trim();
  if (!t) return null;
  let entry = songLibrary.find(s => s.title === t);
  if (entry) {
    if (src && !entry.keys.length) entry.keys.push({ id: genSongLibId(), label: '', src });
    return entry;
  }
  entry = {
    id: genSongLibId(),
    title: t,
    category: '',
    band: '',
    songbook: '',
    lyrics: '',
    keys: src ? [{ id: genSongLibId(), label: '', src }] : [],
    music: [],
    lastPlayedAt: null,
    createdAt: new Date().toISOString(),
  };
  songLibrary.unshift(entry);
  return entry;
}
// 查重专用：trim + 大小写不敏感比对，避免"奇异恩典 "和"奇异恩典"、"Amazing Grace"和"amazing grace"被误判为不同歌曲
function findDuplicateSongInLibrary(title) {
  const t = (title || '').trim().toLowerCase();
  if (!t) return null;
  return songLibrary.find(s => s.title.trim().toLowerCase() === t) || null;
}
function removeSongFromLibrary(id) {
  songLibrary = songLibrary.filter(s => s.id !== id);
}
// 歌单库里当前用过的所有分类/乐团/诗歌本（去重、去空），用于筛选栏和上传表单的建议列表
// 分类还会并入管理员手动添加的"预设分类"（即使还没有歌曲用到，也会出现在列表里）
function getSongLibCategories() {
  const set = new Set();
  songLibrary.forEach(s => { if (s.category) set.add(s.category); });
  songLibCategories.forEach(c => { if (c) set.add(c); });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}
function getSongLibBands() {
  const set = new Set();
  songLibrary.forEach(s => { if (s.band) set.add(s.band); });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}
function getSongLibSongbooks() {
  const set = new Set();
  songLibrary.forEach(s => { if (s.songbook) set.add(s.songbook); });
  songLibSongbooks.forEach(sb => { if (sb) set.add(sb); });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}
// 诗歌本筛选栏专用：与当前选中的分类联动——只列出"预设诗歌本" + "该分类下歌曲实际用到的诗歌本"
function getSongLibSongbookChipOptions() {
  const set = new Set();
  songLibrary.forEach(s => {
    if (songLibCategoryFilter && s.category !== songLibCategoryFilter) return;
    if (s.songbook) set.add(s.songbook);
  });
  songLibSongbooks.forEach(sb => { if (sb) set.add(sb); });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}
function getSongLibKeyDisplayLabel(key) {
  return key?.label ? key.label : '默认';
}
// ── 诗歌音乐链接（YouTube / mp3 直链等在线收听）──────────
// 按标题（trim + 大小写不敏感）在歌单库中查找对应记录，供"本周诗歌"列表与歌单库网格共用
function findSongLibEntryByTitle(title) {
  const t = (title || '').trim().toLowerCase();
  if (!t) return null;
  return songLibrary.find(s => s.title.trim().toLowerCase() === t) || null;
}
// 转义正则特殊字符，供高亮搜索词使用
function escapeRegExpChars(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// 在文本中高亮所有匹配到的搜索关键词（忽略大小写），内部已做 HTML 转义
function highlightKeyword(text, keyword){
  const t = text || '';
  const kw = (keyword || '').trim();
  if (!kw) return escapeHtml(t);
  const re = new RegExp(escapeRegExpChars(kw), 'ig');
  let result = '', lastIndex = 0, m;
  while ((m = re.exec(t)) !== null) {
    result += escapeHtml(t.slice(lastIndex, m.index));
    result += `<mark class="song-lib-hl">${escapeHtml(m[0])}</mark>`;
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  result += escapeHtml(t.slice(lastIndex));
  return result;
}
// 通用：把一组字符串填充进某个 <datalist>，供多处输入建议列表复用
function fillDatalist(id, values) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = (values || []).map(c => `<option value="${escapeHtml(c)}">`).join('');
}
function getMusicLinksForTitle(title) {
  const s = findSongLibEntryByTitle(title);
  return s?.music || [];
}
// 仅取"音频文件"类型的链接（用于列表播放/上一个/下一个，跳过 YouTube、外部链接）
function getAudioLinksForTitle(title) {
  return getMusicLinksForTitle(title).filter(l => detectMusicPlatform(l.url) === 'audio');
}
function detectMusicPlatform(url) {
  const u = (url || '').toLowerCase();
  if (/youtu\.?be/.test(u)) return 'youtube';
  if (/\.(mp3|m4a|wav|ogg|aac|flac)(\?|#|$)/.test(u)) return 'audio';
  return 'link';
}
function getYoutubeEmbedSrc(url) {
  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&]+)/, /youtube\.com\/embed\/([^?&]+)/, /youtube\.com\/shorts\/([^?&]+)/];
  let id = '';
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) { id = m[1]; break; }
  }
  return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : '';
}
function getMusicPlatformIcon(platform) {
  return platform === 'youtube' ? 'ti-brand-youtube' : platform === 'audio' ? 'ti-file-music' : 'ti-link';
}
function getMusicPlatformLabel(platform) {
  return platform === 'youtube' ? 'YouTube' : platform === 'audio' ? '音频文件' : '外部链接';
}
// 某首歌（按标题）在哪些主日被使用过，倒序返回 key 列表
function findSongUsageWeeks(title) {
  const t = (title || '').trim();
  if (!t) return [];
  return Object.keys(songData)
    .filter(key => (songData[key] || []).some(s => s.title === t))
    .sort((a, b) => b.localeCompare(a));
}
async function syncSongLibraryToRemote(successMsg) {
  if (!initSupabaseClient()) return false;
  try {
    await syncRemoteField('song_library', songLibrary);
    if (successMsg) showToast(successMsg);
    return true;
  } catch (e) {
    console.error('同步歌单库失败', e);
    if (isMissingRemoteColumnError(e, 'song_library')) {
      showToast('后端缺少 song_library 字段，请先执行修复 SQL');
    } else {
      showToast('已保存到本地，但云端同步失败');
    }
    return false;
  }
}
const LS_SERMON_PASSAGES = 'churchSermonPassages';
const LS_SERMON_THEMES = 'churchSermonThemes';
const LS_SERMON_AUDIO = 'churchSermonAudio';
const LS_SERMON_NOTES = 'churchSermonNotes';
const LS_SERMON_COLLAPSED = 'churchSermonCollapsed';
let sermonPassagesByDate = {}; // { 'YYYY-MM-DD': [{ bookAbbr, chapter, verseStart, verseEnd }] }
let sermonThemesByDate = {};   // { 'YYYY-MM-DD': '主题' }
let sermonAudioByDate = {};    // { 'YYYY-MM-DD': '音频链接' }
let sermonNotesByDate = {};    // { 'YYYY-MM-DD': '笔记' }
let sermonCollapsedByDate = {}; // { 'YYYY-MM-DD': boolean }
let sermonExtrasCollapsedByDate = {}; // { 'YYYY-MM-DD': boolean }
let sermonPassageEditKey = null, sermonPassageDraft = [], sermonThemeDraft = '', sermonAudioDraft = '', sermonDraftTestament = 'ot';

function getBibleBookByAbbr(abbr) {
  return BIBLE_BOOKS.find(b => b.abbr === abbr);
}
function loadSermonPassages() {
  try {
    const raw = localStorage.getItem(LS_SERMON_PASSAGES);
    sermonPassagesByDate = raw ? JSON.parse(raw) : {};
  } catch(e) { sermonPassagesByDate = {}; }
}
function loadSermonThemes() {
  try {
    const raw = localStorage.getItem(LS_SERMON_THEMES);
    sermonThemesByDate = raw ? JSON.parse(raw) : {};
  } catch(e) { sermonThemesByDate = {}; }
}
function loadSermonAudio() {
  try {
    const raw = localStorage.getItem(LS_SERMON_AUDIO);
    sermonAudioByDate = raw ? JSON.parse(raw) : {};
  } catch(e) { sermonAudioByDate = {}; }
}
function loadSermonNotes() {
  try {
    const raw = localStorage.getItem(LS_SERMON_NOTES);
    sermonNotesByDate = raw ? JSON.parse(raw) : {};
  } catch(e) { sermonNotesByDate = {}; }
}
function loadSermonCollapsed() {
  try {
    const raw = localStorage.getItem(LS_SERMON_COLLAPSED);
    sermonCollapsedByDate = raw ? JSON.parse(raw) : {};
  } catch(e) { sermonCollapsedByDate = {}; }
}
function persistSermonPassages() {
  try { localStorage.setItem(LS_SERMON_PASSAGES, JSON.stringify(sermonPassagesByDate)); } catch(e) {}
}
function persistSermonThemes() {
  try { localStorage.setItem(LS_SERMON_THEMES, JSON.stringify(sermonThemesByDate)); } catch(e) {}
}
function persistSermonAudio() {
  try { localStorage.setItem(LS_SERMON_AUDIO, JSON.stringify(sermonAudioByDate)); } catch(e) {}
}
function persistSermonNotes() {
  try { localStorage.setItem(LS_SERMON_NOTES, JSON.stringify(sermonNotesByDate)); } catch(e) {}
}
function persistSermonCollapsed() {
  try { localStorage.setItem(LS_SERMON_COLLAPSED, JSON.stringify(sermonCollapsedByDate)); } catch(e) {}
}
function getSermonPassagesForKey(key) {
  return Array.isArray(sermonPassagesByDate[key]) ? sermonPassagesByDate[key] : [];
}
function getSermonThemeForKey(key) {
  return sermonThemesByDate[key] || '';
}
function getSermonAudioForKey(key) {
  return sermonAudioByDate[key] || '';
}
function getSermonNotesForKey(key) {
  return sermonNotesByDate[key] || '';
}
function isSermonSectionCollapsed(key) {
  // 默认收起，展示紧凑摘要；用户主动展开过则记住该状态
  return sermonCollapsedByDate[key] === undefined ? true : !!sermonCollapsedByDate[key];
}
function toggleSermonSectionCollapse(key) {
  sermonCollapsedByDate[key] = !isSermonSectionCollapsed(key);
  persistSermonCollapsed();
  renderSermonPassages(key);
}
function isSermonExtraCollapsed(key) {
  return sermonExtrasCollapsedByDate[key] !== false;
}
function toggleSermonExtraCollapse(key) {
  sermonExtrasCollapsedByDate[key] = !isSermonExtraCollapsed(key);
  renderSermonPassages(key);
}
function getSafeExternalUrl(url) {
  const val = String(url || '').trim();
  if(!val) return '';
  try {
    const parsed = new URL(val);
    return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
  } catch(e) {
    return '';
  }
}
function normalizeExternalUrlInput(url) {
  const val = String(url || '').trim();
  if(!val) return '';
  if(/^https?:\/\//i.test(val)) return val;
  if(/^\/\//.test(val)) return `https:${val}`;
  if(/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(val)) return `https://${val}`;
  return val;
}
function saveSermonNotesLocal(key, value, showIndicator=true) {
  const raw = String(value || '');
  if(raw.trim()) sermonNotesByDate[key] = raw;
  else delete sermonNotesByDate[key];
  persistSermonNotes();
  const el = document.getElementById('sermonNotesSaved');
  if(el){
    el.textContent = '已保存到本地缓存';
    if(showIndicator){
      el.classList.add('show');
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => el.classList.remove('show'), 1400);
    }
  }
}
function queueSermonNotesSave(key){
  const input = document.getElementById('sermonNotesEditor');
  const indicator = document.getElementById('sermonNotesSaved');
  if(indicator){
    indicator.textContent = '正在保存...';
    indicator.classList.add('show');
  }
  clearTimeout(sermonNotesSaveTimer);
  sermonNotesSaveTimer = setTimeout(() => {
    saveSermonNotesLocal(key, input?.value || '', true);
  }, 320);
}
function flushSermonNotesSave(key){
  clearTimeout(sermonNotesSaveTimer);
  const input = document.getElementById('sermonNotesEditor');
  saveSermonNotesLocal(key, input?.value || '', true);
}
function formatSermonPassageRef(item) {
  const book = getBibleBookByAbbr(item.bookAbbr);
  const name = book ? book.name : item.bookAbbr;
  const start = Number(item.verseStart) || 1;
  const end = Math.max(start, Number(item.verseEnd) || start);
  return `${name} ${item.chapter}:${start}${end !== start ? '-' + end : ''}`;
}

const roleColors = {
  '主领':{ bg:'#FAECE7',text:'#993C1D',badgeBg:'#993C1D',badgeText:'#fff',icon:'ti-microphone' },
  '伴唱':{ bg:'#B5D4F4',text:'#185FA5',badgeBg:'#185FA5',badgeText:'#fff',icon:'ti-music' },
  '键盘':{ bg:'#F4C0D1',text:'#993556',badgeBg:'#993556',badgeText:'#fff',icon:'ti-piano' },
  '吉他':{ bg:'#FAC775',text:'#854F0B',badgeBg:'#854F0B',badgeText:'#fff',icon:'ti-guitar-pick' },
  '贝斯':{ bg:'#C0DD97',text:'#3B6D11',badgeBg:'#3B6D11',badgeText:'#fff',icon:'ti-wave-sine' },
  '鼓':  { bg:'#AFA9EC',text:'#534AB7',badgeBg:'#534AB7',badgeText:'#fff',icon:'ti-circle' },
  '教歌':{ bg:'#85B7EB',text:'#0C447C',badgeBg:'#0C447C',badgeText:'#fff',icon:'ti-book' },
};

let scheduleData = {
  '2026-06-07':[
    {role:'主领',name:'根英',persons:['根英']},
    {role:'伴唱',name:'曼茹/建蝉/张荣/小小',persons:['曼茹','建蝉','张荣','小小']},
    {role:'键盘',name:'慧慧/雨婷',persons:['慧慧','雨婷']},
    {role:'吉他',name:'佳欣/嘉乐',persons:['佳欣','嘉乐']},
    {role:'贝斯',name:'诗诗',persons:['诗诗']},
    {role:'鼓',name:'周阳',persons:['周阳']},
    {role:'教歌',name:'张荣',persons:['张荣']},
  ],
  '2026-06-14':[
    {role:'主领',name:'佳欣/丽娜',persons:['佳欣','丽娜']},
    {role:'伴唱',name:'加恩/嘉乐/婷婷/Irene',persons:['加恩','嘉乐','婷婷','Irene']},
    {role:'键盘',name:'孙望/叶合均',persons:['孙望','叶合均']},
    {role:'吉他',name:'智博/周周',persons:['智博','周周']},
    {role:'贝斯',name:'诗诗',persons:['诗诗']},
    {role:'鼓',name:'Isaac',persons:['Isaac']},
    {role:'教歌',name:'美美',persons:['美美']},
  ],
  '2026-06-21':[
    {role:'主领',name:'张荣/嘉乐',persons:['张荣','嘉乐']},
    {role:'伴唱',name:'小小/安娜/雨婷/曼茹',persons:['小小','安娜','雨婷','曼茹']},
    {role:'键盘',name:'美美/叶合均',persons:['美美','叶合均']},
    {role:'吉他',name:'佳欣/周周',persons:['佳欣','周周']},
    {role:'贝斯',name:'Isaac',persons:['Isaac']},
    {role:'鼓',name:'Irene',persons:['Irene']},
    {role:'教歌',name:'慧慧',persons:['慧慧']},
  ],
  '2026-06-28':[
    {role:'主领',name:'美美/雨婷',persons:['美美','雨婷']},
    {role:'伴唱',name:'富雄/加恩/根英/婷婷',persons:['富雄','加恩','根英','婷婷']},
    {role:'键盘',name:'玲晓/孙望',persons:['玲晓','孙望']},
    {role:'吉他',name:'智博/嘉乐',persons:['智博','嘉乐']},
    {role:'贝斯',name:'Isaac',persons:['Isaac']},
    {role:'鼓',name:'周阳',persons:['周阳']},
    {role:'教歌',name:'根英',persons:['根英']},
  ],
};

// ── Helpers ───────────────────────────────────────────
const BIBLE_BOOKS = [
  {name:'创世记', abbr:'gen', chapters:50},
  {name:'出埃及记', abbr:'exo', chapters:40},
  {name:'利未记', abbr:'lev', chapters:27},
  {name:'民数记', abbr:'num', chapters:36},
  {name:'申命记', abbr:'deu', chapters:34},
  {name:'约书亚记', abbr:'jos', chapters:24},
  {name:'士师记', abbr:'jdg', chapters:21},
  {name:'路得记', abbr:'rut', chapters:4},
  {name:'撒母耳记上', abbr:'1sa', chapters:31},
  {name:'撒母耳记下', abbr:'2sa', chapters:24},
  {name:'列王纪上', abbr:'1ki', chapters:22},
  {name:'列王纪下', abbr:'2ki', chapters:25},
  {name:'历代志上', abbr:'1ch', chapters:29},
  {name:'历代志下', abbr:'2ch', chapters:36},
  {name:'以斯拉记', abbr:'ezr', chapters:10},
  {name:'尼希米记', abbr:'neh', chapters:13},
  {name:'以斯帖记', abbr:'est', chapters:10},
  {name:'约伯记', abbr:'job', chapters:42},
  {name:'诗篇', abbr:'psa', chapters:150},
  {name:'箴言', abbr:'pro', chapters:31},
  {name:'传道书', abbr:'ecc', chapters:12},
  {name:'雅歌', abbr:'sng', chapters:8},
  {name:'以赛亚书', abbr:'isa', chapters:66},
  {name:'耶利米书', abbr:'jer', chapters:52},
  {name:'耶利米哀歌', abbr:'lam', chapters:5},
  {name:'以西结书', abbr:'ezk', chapters:48},
  {name:'但以理书', abbr:'dan', chapters:12},
  {name:'何西阿书', abbr:'hos', chapters:14},
  {name:'约珥书', abbr:'jol', chapters:3},
  {name:'阿摩司书', abbr:'amo', chapters:9},
  {name:'俄巴底亚书', abbr:'oba', chapters:1},
  {name:'约拿书', abbr:'jon', chapters:4},
  {name:'弥迦书', abbr:'mic', chapters:7},
  {name:'那鸿书', abbr:'nam', chapters:3},
  {name:'哈巴谷书', abbr:'hab', chapters:3},
  {name:'西番雅书', abbr:'zep', chapters:3},
  {name:'哈该书', abbr:'hag', chapters:2},
  {name:'撒迦利亚书', abbr:'zec', chapters:14},
  {name:'玛拉基书', abbr:'mal', chapters:4},
  {name:'马太福音', abbr:'mat', chapters:28},
  {name:'马可福音', abbr:'mar', chapters:16},
  {name:'路加福音', abbr:'luk', chapters:24},
  {name:'约翰福音', abbr:'joh', chapters:21},
  {name:'使徒行传', abbr:'act', chapters:28},
  {name:'罗马书', abbr:'rom', chapters:16},
  {name:'哥林多前书', abbr:'1co', chapters:16},
  {name:'哥林多后书', abbr:'2co', chapters:13},
  {name:'加拉太书', abbr:'gal', chapters:6},
  {name:'以弗所书', abbr:'eph', chapters:6},
  {name:'腓立比书', abbr:'phi', chapters:4},
  {name:'歌罗西书', abbr:'col', chapters:4},
  {name:'帖撒罗尼迦前书', abbr:'1th', chapters:5},
  {name:'帖撒罗尼迦后书', abbr:'2th', chapters:3},
  {name:'提摩太前书', abbr:'1ti', chapters:6},
  {name:'提摩太后书', abbr:'2ti', chapters:4},
  {name:'提多书', abbr:'tit', chapters:3},
  {name:'腓利门书', abbr:'phm', chapters:1},
  {name:'希伯来书', abbr:'heb', chapters:13},
  {name:'雅各书', abbr:'jas', chapters:5},
  {name:'彼得前书', abbr:'1pe', chapters:5},
  {name:'彼得后书', abbr:'2pe', chapters:3},
  {name:'约翰一书', abbr:'1jn', chapters:5},
  {name:'约翰二书', abbr:'2jn', chapters:1},
  {name:'约翰三书', abbr:'3jn', chapters:1},
  {name:'犹大书', abbr:'jud', chapters:1},
  {name:'启示录', abbr:'rev', chapters:22},
];
const NT_START_INDEX = BIBLE_BOOKS.findIndex(b => b.abbr === 'mat'); // 马太福音起为新约
function isNewTestamentBook(bookAbbr) {
  const idx = BIBLE_BOOKS.findIndex(b => b.abbr === bookAbbr);
  return idx >= NT_START_INDEX;
}
let currentTestament = 'ot'; // 'ot' | 'nt' — drives the book dropdown filter
// ── Bible versions (local text files, format: BOOK chap:verse text) ──
const BIBLE_VERSIONS = [
  { id:'cunp',   name:'和合本（CUNP）',     file:'./cmn-cu89s_vpl.txt' },
  { id:'cunpss', name:'和合本（神版）',     file:'./cmn-cu89ss_vpl.txt' },
  { id:'rcuv',   name:'和合本修订版（RCUV）', file:'./cmn-rcuv_vpl.txt' },
];
let currentBibleVersion = BIBLE_VERSIONS[0].id;
const bibleLinesCache = {};   // versionId -> lines[]
const bibleIndexCache = {};   // versionId -> { 'BOOK_chap': [{verse,text}] }
const bibleLoadErrors = {};   // versionId -> error message
let bibleFontSize = 15;

function getBibleVersionMeta(versionId){
  return BIBLE_VERSIONS.find(v=>v.id===versionId);
}
function isBibleSourceUnavailable(versionId){
  return !!bibleLoadErrors[versionId];
}
function getBibleSourceUnavailableHtml(versionId, compact=false){
  const ver=getBibleVersionMeta(versionId);
  const extra=compact
    ? '当前目录未放入圣经文本文件，暂时无法显示经文预览'
    : `未找到经文文件 <code style="font-size:11px">${ver?ver.file:''}</code><br>请将该文本文件与本页面放在同一目录下。`;
  return `<div class="bible-empty">
    <i class="ti ti-book-off" style="font-size:26px;display:block;margin-bottom:8px;color:#ddd"></i>
    ${extra}
  </div>`;
}
async function loadBibleFile(versionId){
  if(bibleIndexCache[versionId]) return;
  if(bibleLoadErrors[versionId]) throw new Error(bibleLoadErrors[versionId]);
  const ver = getBibleVersionMeta(versionId);
  if(!ver) throw new Error('未知版本');
  try{
    const res = await fetch(ver.file);
    if(!res.ok) throw new Error(`无法加载 ${ver.file}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    const index = {};
    lines.forEach(line=>{
      const match = line.match(/^([A-Z0-9]+)\s+(\d+):(\d+)\s+(.*)$/);
      if(!match) return;
      const key = `${match[1]}_${match[2]}`;
      if(!index[key]) index[key]=[];
      index[key].push({ verse:Number(match[3]), text:match[4] });
    });
    bibleLinesCache[versionId]=lines;
    bibleIndexCache[versionId]=index;
    delete bibleLoadErrors[versionId];
  }catch(err){
    bibleLoadErrors[versionId] = err?.message || `无法加载 ${ver.file}`;
    throw err;
  }
}

function escapeHtml(str){ return String(str).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function initBibleSelectors(){
  const verSel=document.getElementById('bibleVersionSelect');
  if(verSel){
    verSel.innerHTML=BIBLE_VERSIONS.map(v=>`<option value="${v.id}">${v.name}</option>`).join('');
    verSel.value=currentBibleVersion;
  }
  const bookSel=document.getElementById('bibleBookSelect');
  if(!bookSel) return;
  populateBookOptions();
  bookSel.value='gen';
  updateBibleChapterOptions(1);
  // restore saved font size
  const fs=document.getElementById('fontSlider');
  if(fs){ fs.value=bibleFontSize; document.getElementById('fontSizeVal').textContent=bibleFontSize+'px'; }
  // restore last-read position
  restoreLastRead();
}
function populateBookOptions(){
  const bookSel=document.getElementById('bibleBookSelect');
  if(!bookSel) return;
  const books = currentTestament==='nt' ? BIBLE_BOOKS.slice(NT_START_INDEX) : BIBLE_BOOKS.slice(0, NT_START_INDEX);
  bookSel.innerHTML = books.map(b=>`<option value="${b.abbr}">${b.name}</option>`).join('');
}
function getTestamentLastPosition(testament){
  const saved = getLastRead(testament);
  if (saved && saved.bookAbbr && isNewTestamentBook(saved.bookAbbr) === (testament === 'nt')) return saved;
  return { bookAbbr: testament==='nt' ? 'mat' : 'gen', chapter: 1 };
}
function setTestamentFilter(testament, skipLoad){
  currentTestament = testament;
  document.getElementById('testamentBtnOT').classList.toggle('active', testament==='ot');
  document.getElementById('testamentBtnNT').classList.toggle('active', testament==='nt');
  populateBookOptions();
  const bookSel=document.getElementById('bibleBookSelect');
  const target = getTestamentLastPosition(testament);
  bookSel.value = target.bookAbbr;
  updateBibleChapterOptions(target.chapter);
  if(!skipLoad) loadBibleChapter();
}
function onBibleVersionChange(){
  currentBibleVersion=document.getElementById('bibleVersionSelect').value;
  loadBibleChapter();
  if(selectedSunday) renderSermonPassages(toKey(selectedSunday));
}
function getSelectedBibleBook(){
  const bookSel=document.getElementById('bibleBookSelect');
  return BIBLE_BOOKS.find(b=>b.abbr===(bookSel?.value||''))||BIBLE_BOOKS[0];
}
function updateBibleChapterOptions(preferredChapter){
  const book=getSelectedBibleBook();
  const chapterSel=document.getElementById('bibleChapterSelect');
  if(!chapterSel) return;
  const current=preferredChapter||parseInt(chapterSel.value,10)||1;
  chapterSel.innerHTML=Array.from({length:book.chapters},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  chapterSel.value=String(Math.min(current,book.chapters));
  updateBibleSourceLink();
  updateBibleNavState();
}
function updateBibleSourceLink(){
  const link=document.getElementById('bibleSourceLink');
  if(!link) return;
  const ver=BIBLE_VERSIONS.find(v=>v.id===currentBibleVersion);
  link.innerHTML=`${ver?ver.name:''} · 本地版`;
}
function updateBibleNavState(){
  const book=getSelectedBibleBook();
  const chapterSel=document.getElementById('bibleChapterSelect');
  const chapter=parseInt(chapterSel?.value,10)||1;
  const bookIdx=BIBLE_BOOKS.findIndex(b=>b.abbr===book.abbr);
  const isFirst = bookIdx===0 && chapter===1;
  const isLast  = bookIdx===BIBLE_BOOKS.length-1 && chapter===book.chapters;
  ['bibleChapPrev','bfsPrev'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled=isFirst; });
  ['bibleChapNext','bfsNext'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled=isLast; });
  const label=`${book.name} 第 ${chapter} 章`;
  const navLabel=document.getElementById('bibleNavLabel'); if(navLabel) navLabel.textContent=label;
  const bfsLabel=document.getElementById('bfsLabel'); if(bfsLabel) bfsLabel.textContent=label;
  const bfsTitle=document.getElementById('bfsTitle'); if(bfsTitle) bfsTitle.textContent=label;
}

function stepBibleChapter(delta, fromFullscreen){
  const book=getSelectedBibleBook();
  const chapterSel=document.getElementById('bibleChapterSelect');
  let chapter=parseInt(chapterSel.value,10)||1;
  let bookIdx=BIBLE_BOOKS.findIndex(b=>b.abbr===book.abbr);

  chapter += delta;
  if(chapter < 1){
    bookIdx -= 1;
    if(bookIdx < 0) return; // already at very start
    chapter = BIBLE_BOOKS[bookIdx].chapters;
  } else if(chapter > book.chapters){
    bookIdx += 1;
    if(bookIdx >= BIBLE_BOOKS.length) return; // already at very end
    chapter = 1;
  }

  const newBook = bookIdx===BIBLE_BOOKS.findIndex(b=>b.abbr===book.abbr) ? book : BIBLE_BOOKS[bookIdx];
  const newTestament = isNewTestamentBook(newBook.abbr) ? 'nt' : 'ot';
  if(newTestament !== currentTestament){
    currentTestament = newTestament;
    document.getElementById('testamentBtnOT').classList.toggle('active', newTestament==='ot');
    document.getElementById('testamentBtnNT').classList.toggle('active', newTestament==='nt');
    populateBookOptions();
  }
  document.getElementById('bibleBookSelect').value = newBook.abbr;
  updateBibleChapterOptions(chapter);
  loadBibleChapter().then(()=>{ if(fromFullscreen) document.getElementById('bfsBody').scrollTop = 0; });
}

async function loadBibleChapter(){
  const list=document.getElementById('bibleResultList');
  if(!list) return;
  const book=getSelectedBibleBook();
  const chapter=Number(document.getElementById('bibleChapterSelect').value);
  updateBibleSourceLink();
  updateBibleNavState();
  list.innerHTML='<div class="bible-loading">正在加载经文...</div>';
  try{
    await loadBibleFile(currentBibleVersion);
    const index=bibleIndexCache[currentBibleVersion];
    const key=`${book.abbr.toUpperCase()}_${chapter}`;
    const verses=index[key]||[];
    if(!verses.length){
      list.innerHTML=`<div class="bible-empty">没有找到经文</div>`;
      syncFullscreenBody(list.innerHTML);
      return;
    }
    const html=renderBibleVerses(book.name, chapter, verses);
    list.innerHTML=html;
    applyBibleFontSize();
    syncFullscreenBody(html);
    // ── Save last-read position
    saveLastRead(book.abbr, chapter);
  }catch(err){
    if(!isBibleSourceUnavailable(currentBibleVersion)) console.error(err);
    const msg=getBibleSourceUnavailableHtml(currentBibleVersion,false);
    list.innerHTML=msg;
    syncFullscreenBody(msg);
  }
}
function renderBibleVerses(bookName, chapter, verses){
  const bookAbbr = getSelectedBibleBook().abbr;
  let html=`<div class="bible-result-item"><div class="bible-chapter-title">${escapeHtml(bookName)} 第 ${chapter} 章</div>`;
  verses.forEach(v=>{
    const bKey = `${bookAbbr}_${chapter}_${v.verse}`;
    const isBookmarked = bibleBookmarks[bKey] ? 'bookmarked' : '';
    html+=`<div class="bible-verse">
      <span class="bible-verse-num">${v.verse}</span>
      <div class="bible-verse-text">${escapeHtml(v.text)}</div>
      <button class="verse-bookmark-btn ${isBookmarked}" title="收藏此经节"
        onclick="toggleVerseBookmark('${bookAbbr}','${escapeHtml(bookName)}',${chapter},${v.verse},'${escapeHtml(v.text).replace(/'/g,"\\'")}',this)">
        <i class="ti ti-star${isBookmarked ? '-filled' : ''}"></i>
      </button>
    </div>`;
  });
  html+='</div>';
  return html;
}

// ── Font size control ─────────────────────────────────
function toggleFontPopover(e){
  if(e) e.stopPropagation();
  const pop=document.getElementById('fontPopover');
  const backdrop=document.getElementById('fontPopoverBackdrop');
  const isOpen=pop.classList.contains('open');
  if(isOpen){ closeFontPopover(); }
  else{ pop.classList.add('open'); backdrop.classList.add('open'); }
}
function closeFontPopover(){
  const pop=document.getElementById('fontPopover');
  const backdrop=document.getElementById('fontPopoverBackdrop');
  if(pop) pop.classList.remove('open');
  if(backdrop) backdrop.classList.remove('open');
}
function onFontSliderChange(val){
  bibleFontSize=Number(val);
  document.getElementById('fontSizeVal').textContent=bibleFontSize+'px';
  applyBibleFontSize();
}
function applyBibleFontSize(){
  document.querySelectorAll('.bible-verse-text').forEach(el=>{ el.style.fontSize=bibleFontSize+'px'; });
  document.querySelectorAll('.bible-chapter-title').forEach(el=>{ el.style.fontSize=(bibleFontSize+2)+'px'; });
}

// ── Fullscreen reading mode ───────────────────────────
function openBibleFullscreen(){
  const overlay=document.getElementById('bibleFullscreenOverlay');
  const body=document.getElementById('bfsBody');
  body.innerHTML=document.getElementById('bibleResultList').innerHTML;
  applyBibleFontSize();
  updateBibleNavState();
  overlay.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeBibleFullscreen(){
  document.getElementById('bibleFullscreenOverlay').classList.remove('open');
  document.body.style.overflow='';
}
function syncFullscreenBody(html){
  const overlay=document.getElementById('bibleFullscreenOverlay');
  if(overlay && overlay.classList.contains('open')){
    document.getElementById('bfsBody').innerHTML=html;
    applyBibleFontSize();
  }
}
function toggleScheduleSection(){
  scheduleCollapsed=!scheduleCollapsed;
  updateScheduleCollapseUI();
}
function updateScheduleCollapseUI(){
  const body=document.getElementById('scheduleBody'), btn=document.getElementById('scheduleToggleBtn'), txt=document.getElementById('scheduleToggleText');
  if(!body||!btn||!txt) return;
  body.classList.toggle('collapsed',scheduleCollapsed);
  btn.classList.toggle('collapsed',scheduleCollapsed);
  txt.textContent=scheduleCollapsed?'展开':'收起';
}
function getInitials(n){ if(!n)return'?'; const t=n.trim(); return /[a-zA-Z]/.test(t[0])?t.slice(0,2).toUpperCase():t.slice(0,1); }
function getSundaysOfMonth(y,m){ const d=new Date(y,m,1),r=[]; while(d.getMonth()===m){if(d.getDay()===0)r.push(new Date(d));d.setDate(d.getDate()+1);}return r; }
function toKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function monthHasData(y,m){ const p=`${y}-${String(m+1).padStart(2,'0')}-`; return Object.keys(scheduleData).some(k=>k.startsWith(p)); }
// 特别聚会日期：从 customEventDates（YYYY-MM-DD -> 标签）里挑出属于某个月份的，转成 Date 数组
function getExtraDatesOfMonth(y,m){
  return Object.keys(customEventDates)
    .filter(k=>{ const parts=k.split('-'); return +parts[0]===y && (+parts[1]-1)===m; })
    .map(k=>{ const parts=k.split('-'); return new Date(+parts[0], +parts[1]-1, +parts[2]); })
    .sort((a,b)=>a-b);
}
// 某个日期在导航条 / 标题里应该显示的标签：主日显示"主日"，特别聚会显示管理员填的标签，
// 其他情况（理论上不会被选中，兜底用）显示对应的中文星期
function getDateNavLabel(d){
  if (d.getDay()===0) return '主日';
  const custom = customEventDates[toKey(d)];
  if (custom) return custom;
  const zhWeek=['周日','周一','周二','周三','周四','周五','周六'];
  return zhWeek[d.getDay()];
}
// 合并"当月所有主日" + "当月所有特别聚会日期"，按日期先后排序，用于导航条和月份总览
function getAllScheduleDatesOfMonth(y,m){
  const merged=[...getSundaysOfMonth(y,m), ...getExtraDatesOfMonth(y,m)];
  merged.sort((a,b)=>a-b);
  return merged;
}
// 添加一个特别聚会日期（管理员操作），成功后自动跳转过去查看
async function addCustomEventDate(){
  if(!isAdmin) return;
  const dateStr=(prompt('添加特别聚会日期（格式：YYYY-MM-DD，例如 2026-08-21）：','')||'').trim();
  if(!dateStr) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){ showToast('日期格式不对，请填 YYYY-MM-DD'); return; }
  const d=new Date(dateStr+'T00:00:00');
  if(isNaN(d)){ showToast('日期格式不对'); return; }
  if(d.getDay()===0){ showToast('这一天本来就是主日，不用重复添加'); return; }
  const label=(prompt('给这一天起个名字（比如：特别聚会、培灵会）：','特别聚会')||'').trim();
  if(!label) return;
  customEventDates[dateStr]=label;
  selectedSunday=d;
  render();
  showToast(`✅ 已添加「${label}」· ${d.getMonth()+1}月${d.getDate()}日`);
  await syncRemoteField('custom_event_dates', customEventDates);
}
// 删除一个特别聚会日期（管理员操作）
async function removeCustomEventDate(dateStr){
  if(!isAdmin) return;
  const label=customEventDates[dateStr]||'这个日期';
  if(!confirm(`确定要删除"${label}"吗？该日期已经排好的班/上传的诗歌等数据不会被删除，只是不再出现在日期导航里。`)) return;
  delete customEventDates[dateStr];
  // 如果删掉的正好是当前正在查看的日期，跳回最近的主日，避免停留在一个导航条里已经消失的日期上
  if(selectedSunday && toKey(selectedSunday)===dateStr) selectedSunday=getCurrentWeekSunday();
  render();
  showToast('已删除该特别聚会日期');
  await syncRemoteField('custom_event_dates', customEventDates);
}

// ── State ─────────────────────────────────────────────
let selectedSunday=null, pickerYear=new Date().getFullYear(), headerCollapsed=false, scheduleCollapsed=false, isAdmin=false, viewMode='card';

// ── View mode toggle ──────────────────────────────────
function setViewMode(mode){
  viewMode=mode;
  document.getElementById('viewBtnList').classList.toggle('active', mode==='list');
  document.getElementById('viewBtnCard').classList.toggle('active', mode==='card');
  renderShifts(toKey(selectedSunday));
}

// ── Bible collapse ────────────────────────────────────
let bibleCollapsed = true;
let sermonNotesSaveTimer = null;
const APP_LOADER_MIN_MS = 850;
const appLoaderStartedAt = Date.now();
const LOADER_VERSES = [
  { text: '你的话是我脚前的灯，是我路上的光。', ref: '诗篇 119:105' },
  { text: '你要专心仰赖耶和华，不可倚靠自己的聪明。', ref: '箴言 3:5' },
  { text: '凡劳苦担重担的人，可以到我这里来，我就使你们得安息。', ref: '马太福音 11:28' },
  { text: '应当一无挂虑，只要凡事借着祷告、祈求和感谢，将你们所要的告诉神。', ref: '腓立比书 4:6' },
  { text: '但那等候耶和华的，必重新得力。', ref: '以赛亚书 40:31' },
  { text: '我们爱，因为神先爱我们。', ref: '约翰一书 4:19' },
  { text: '你们要休息，要知道我是神。', ref: '诗篇 46:10' },
  { text: '你当刚强壮胆，不要惧怕，也不要惊惶。', ref: '约书亚记 1:9' }
];
function applyRandomLoaderVerse(){
  const verseEl = document.getElementById('appLoaderVerse');
  const refEl = document.getElementById('appLoaderVerseRef');
  if(!verseEl || !refEl) return;
  const item = LOADER_VERSES[Math.floor(Math.random() * LOADER_VERSES.length)];
  verseEl.textContent = item.text;
  refEl.textContent = item.ref;
}
function toggleBible(){
  bibleCollapsed = !bibleCollapsed;
  updateBibleCollapseUI();
}
function hideAppLoader(){
  const loader = document.getElementById('appLoader');
  if(!loader || loader.classList.contains('hidden')) return;
  const elapsed = Date.now() - appLoaderStartedAt;
  const wait = Math.max(0, APP_LOADER_MIN_MS - elapsed);
  setTimeout(() => {
    loader.classList.add('hidden');
    document.body.classList.remove('app-loading');
  }, wait);
}
function updateBibleCollapseUI(){
  const card = document.getElementById('bibleCard');
  const btn = document.getElementById('bibleCollapseBtn');
  const txt = document.getElementById('bibleCollapseText');
  if(card) card.classList.toggle('collapsed', bibleCollapsed);
  if(btn) btn.classList.toggle('collapsed', bibleCollapsed);
  if(txt) txt.textContent = bibleCollapsed ? '展开' : '收起';
}

// ── Collapse ──────────────────────────────────────────
function toggleCollapse(){
  headerCollapsed=!headerCollapsed;
  document.getElementById('headerCard').classList.toggle('collapsed',headerCollapsed);
  document.getElementById('collapseLabel').textContent=headerCollapsed?'展开':'收起';
  render();
}

// ── Auth ──────────────────────────────────────────────
function openLogin(){ document.getElementById('loginUser').value=''; document.getElementById('loginPass').value=''; document.getElementById('loginError').classList.remove('show'); document.getElementById('loginOverlay').classList.add('open'); setTimeout(()=>document.getElementById('loginUser').focus(),300); }
function closeLogin(e){ if(!e||e.target===document.getElementById('loginOverlay')) document.getElementById('loginOverlay').classList.remove('open'); }
function doLogin(){
  const u=document.getElementById('loginUser').value.trim(), p=document.getElementById('loginPass').value;
  if(u==='admin'&&p==='church2026'){ isAdmin=true; document.getElementById('loginOverlay').classList.remove('open'); updateAdminUI(); render(); }
  else{ document.getElementById('loginError').classList.add('show'); document.getElementById('loginPass').value=''; document.getElementById('loginPass').focus(); }
}
function logout(){ isAdmin=false; closeAdminMenu(); updateAdminUI(); render(); }
function toggleAdminMenu(e){
  if(e) e.stopPropagation();
  document.getElementById('adminMenu').classList.toggle('open');
}
function closeAdminMenu(){
  const menu=document.getElementById('adminMenu');
  if(menu) menu.classList.remove('open');
}
document.addEventListener('click', (e)=>{
  const menu=document.getElementById('adminMenu');
  if(menu && menu.classList.contains('open') && !e.target.closest('.admin-menu-wrap')) closeAdminMenu();
});
function updateAdminUI(){
  document.getElementById('adminBar').classList.toggle('show',isAdmin);
  const tb=document.getElementById('topbarAdminBadge'); if(tb) tb.style.display=isAdmin?'flex':'none';
  const gb=document.getElementById('topbarGuestBadge'); if(gb) gb.style.display=isAdmin?'none':'flex';
  const b=document.getElementById('addShiftBtn'); if(b) b.style.display=isAdmin?'flex':'none';
  const me=document.getElementById('adminMonthlyEditBtn'); if(me) me.style.display=isAdmin?'flex':'none';
  document.querySelectorAll('.upload-song-btn').forEach(el=>el.classList.toggle('show',isAdmin));
  document.querySelectorAll('.sermon-edit-btn').forEach(el=>el.classList.toggle('show',isAdmin));
  updateLeaveBadge();
  updateSongLibImportHint();
}

// ── Month picker ──────────────────────────────────────
function openMonthPicker(){ pickerYear=(selectedSunday||new Date()).getFullYear(); renderPickerGrid(); document.getElementById('monthPickerOverlay').classList.add('open'); }
function closeMonthPicker(e){ document.getElementById('monthPickerOverlay').classList.remove('open'); }
function shiftYear(d){ pickerYear+=d; renderPickerGrid(); }
function renderPickerGrid(){
  document.getElementById('pickerYear').textContent=pickerYear+'年';
  const cy=selectedSunday?selectedSunday.getFullYear():-1, cm=selectedSunday?selectedSunday.getMonth():-1;
  document.getElementById('monthGrid').innerHTML=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'].map((l,i)=>{
    const a=pickerYear===cy&&i===cm, h=monthHasData(pickerYear,i);
    return `<div class="month-cell ${a?'active':''} ${h?'has-data':'no-data'}" onclick="pickMonth(${pickerYear},${i})">${l}</div>`;
  }).join('');
}
function pickMonth(y,m){ closeMonthPicker(); const s=getSundaysOfMonth(y,m); selectedSunday=s.length?s[0]:new Date(y,m,1); render(); }
function shiftMonth(d){ const n=new Date(selectedSunday.getFullYear(),selectedSunday.getMonth()+d,1); const s=getSundaysOfMonth(n.getFullYear(),n.getMonth()); selectedSunday=s.length?s[0]:n; render(); }

// ── Notice ────────────────────────────────────────────
function renderNotice(key){
  const sec=document.getElementById('noticeSection');
  const d=selectedSunday, dateStr=`${d.getMonth()+1}月${d.getDate()}日（${getDateNavLabel(d)}）`;
  const data=getNoticeForKey(key);
  sec.innerHTML=`
    <div class="leader-card" onclick="openNoticeDetail('${key}','${dateStr}')">
      <div class="leader-avatar"><i class="ti ti-user"></i></div>
      <div class="leader-info">
        <div class="leader-info-top"><i class="ti ti-pray leader-crown"></i><span class="leader-info-label">本周祷告</span></div>
        <div class="leader-name">${escapeHtml(data.prayer)}</div>
      </div>
      <button class="leader-detail-btn" onclick="event.stopPropagation();openNoticeDetail('${key}','${dateStr}')">查看详情</button>
    </div>`;
}
function openNoticeDetail(key,dateStr){
  const data=getNoticeForKey(key);
  document.getElementById('noticeDetailTitle').textContent=`本周通知 · ${dateStr}`;
  document.getElementById('noticeDetailBody').innerHTML=`
    <div class="notice-detail-row">
      <div class="nd-icon" style="background:#FAECE7"><i class="ti ti-microphone" style="color:#993C1D"></i></div>
      <div><div class="nd-label">主理</div><div class="nd-value">${data.leader}</div></div>
    </div>
    <div class="notice-detail-row">
      <div class="nd-icon" style="background:#B5D4F4"><i class="ti ti-book" style="color:#185FA5"></i></div>
      <div><div class="nd-label">证道</div><div class="nd-value">${data.sermon}</div></div>
    </div>
    <div class="notice-detail-row">
      <div class="nd-icon" style="background:#C0DD97"><i class="ti ti-pray" style="color:#3B6D11"></i></div>
      <div><div class="nd-label">祷告</div><div class="nd-value">${data.prayer}</div></div>
    </div>`;
  document.getElementById('noticeDetailOverlay').classList.add('open');
}

// ── Songs ─────────────────────────────────────────────
let uploadEditKey=null, uploadDraft=[];
let lightboxSongs=[], lightboxIndex=0;

function renderSongs(key){
  const sec=document.getElementById('songSection');
  const songs=songData[key]||[];
  const songTitle=getRelativeWeekSectionTitle(selectedSunday,'诗歌');
  const uploadBtn=`<button class="song-compact-icon-btn ${isAdmin?'show':''}" onclick="openUploadSong('${key}')" title="上传诗歌"><i class="ti ti-upload"></i></button>`;
  const header=`<div class="section-title-row">
      <div class="sermon-section-head-left">
        <div class="song-section-icon"><i class="ti ti-music"></i></div>
        <span class="section-ttl">${songTitle}</span>
      </div>
      ${uploadBtn}
    </div>`;
  const viewAllLink='';
  if(!songs.length){
    sec.innerHTML=`<div class="song-compact-card">
      ${header}
      <div class="song-empty" style="margin-bottom:0"><i class="ti ti-music-off"></i>${songTitle}暂无上传</div>
      ${viewAllLink}
    </div>`;
    return;
  }
  const rows=songs.map((s,i)=>{
    return `<div class="song-compact-row">
      <div class="song-compact-num">${i+1}</div>
      <div class="song-compact-title" title="${escapeHtml(s.title)}" onclick="${s.src?`openLightbox('${key}',${i})`:''}">${escapeHtml(s.title)}</div>
      <div class="song-compact-actions">
        <button class="song-compact-btn ghost" onclick="downloadSongDirect('${key}',${i})" ${s.src?'':'disabled'}><i class="ti ti-download"></i><span>下载</span></button>
      </div>
    </div>`;
  }).join('');
  sec.innerHTML=`<div class="song-compact-card">
    ${header}
    <div class="song-compact-list">${rows}</div>
    ${viewAllLink}
  </div>`;
}

function openLightbox(key, index){
  const songs=(songData[key]||[]).filter(s=>s.src);
  // map index from full list to filtered list with src
  const fullList=songData[key]||[];
  const filteredIdx=songs.findIndex(s=>s===fullList[index]);
  openLightboxWithList(songs, filteredIdx>=0?filteredIdx:0);
}
// 通用底层方法：传入任意 {title, src} 数组与起始索引即可打开大图查看器，
// 供"本周诗歌"、"歌单库搜索结果"等不同来源复用同一套放大/翻页/下载体验
function openLightboxWithList(list, index){
  lightboxSongs=(list||[]).filter(s=>s && s.src);
  lightboxIndex=Math.max(0, Math.min(index||0, lightboxSongs.length-1));
  showLightboxImage();
  document.getElementById('lightbox').classList.add('open');
  document.addEventListener('keydown', onLightboxKeydown);
}
function showLightboxImage(){
  const s=lightboxSongs[lightboxIndex];
  if(!s) return;
  document.getElementById('lightboxImg').src=s.src;
  document.getElementById('lightboxTitle').textContent=s.title;
  const total=lightboxSongs.length;
  document.getElementById('lightboxCounter').textContent=total>1?`${lightboxIndex+1} / ${total}`:'';
  document.getElementById('lightboxPrev').style.display=total>1?'flex':'none';
  document.getElementById('lightboxNext').style.display=total>1?'flex':'none';
  document.getElementById('lightboxPrev').disabled=lightboxIndex<=0;
  document.getElementById('lightboxNext').disabled=lightboxIndex>=total-1;
}
function stepLightbox(delta){
  const newIdx=lightboxIndex+delta;
  if(newIdx<0||newIdx>=lightboxSongs.length) return;
  lightboxIndex=newIdx;
  showLightboxImage();
}
function onLightboxKeydown(e){
  if(e.key==='ArrowLeft') stepLightbox(-1);
  else if(e.key==='ArrowRight') stepLightbox(1);
  else if(e.key==='Escape') closeLightbox();
}
function closeLightbox(){
  document.getElementById('lightbox').classList.remove('open');
  document.removeEventListener('keydown', onLightboxKeydown);
}
// 下载当前 lightbox 显示的图片
async function downloadLightboxImage(){
  const s=lightboxSongs[lightboxIndex];
  if(!s || !s.src) return;
  await downloadImageFile(s.src, s.title);
}
// 供"本周诗歌"列表的下载按钮直接使用，无需先打开大图查看器
async function downloadSongDirect(key, index){
  const s=(songData[key]||[])[index];
  if(!s || !s.src) return;
  await downloadImageFile(s.src, s.title);
}
// 通用图片下载方法
async function downloadImageFile(src, title){
  const safeName=(title||'诗歌图片').replace(/[\\/:*?"<>|]/g,'_');
  try{
    if(src.startsWith('data:')){
      // 本地 base64 图片：直接触发下载
      const a=document.createElement('a');
      a.href=src;
      a.download=safeName;
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    // 远程图片：fetch 成 blob 后下载，避免点击直接跳转到图片新标签页
    const resp=await fetch(src, {mode:'cors'});
    if(!resp.ok) throw new Error('fetch failed');
    const blob=await resp.blob();
    const ext=(blob.type && blob.type.split('/')[1]) ? '.'+blob.type.split('/')[1].replace('jpeg','jpg') : '';
    const blobUrl=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=blobUrl;
    a.download=safeName.match(/\.[a-zA-Z0-9]+$/)?safeName:(safeName+ext);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(blobUrl), 4000);
  }catch(err){
    // 跨域等原因 fetch 失败时，退而求其次在新标签页打开，用户可手动长按/右键保存
    console.error('下载图片失败，改为新标签页打开', err);
    window.open(src, '_blank');
    showToast('该图片暂不支持直接下载，已为您在新标签页打开，请长按或右键保存');
  }
}

// Swipe support for lightbox
(function(){
  let touchStartX=0, touchStartY=0;
  document.addEventListener('touchstart', e=>{
    const lb=document.getElementById('lightbox');
    if(!lb||!lb.classList.contains('open')) return;
    touchStartX=e.touches[0].clientX;
    touchStartY=e.touches[0].clientY;
  }, {passive:true});
  document.addEventListener('touchend', e=>{
    const lb=document.getElementById('lightbox');
    if(!lb||!lb.classList.contains('open')) return;
    const dx=e.changedTouches[0].clientX-touchStartX;
    const dy=e.changedTouches[0].clientY-touchStartY;
    if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)){
      if(dx>0) stepLightbox(-1); else stepLightbox(1);
    }
  }, {passive:true});
})();

// Upload songs
function openUploadSong(key){
  uploadEditKey=key;
  uploadDraft=JSON.parse(JSON.stringify(songData[key]||[]));
  const d=new Date(key+'T00:00:00'), lbl=`${d.getMonth()+1}月${d.getDate()}日（周日）`;
  document.getElementById('uploadSongSub').textContent=lbl;
  document.getElementById('newSongName').value='';
  document.getElementById('newSongUrl').value='';
  document.getElementById('localFileInput').value='';
  document.getElementById('uploadLibPickSearch').value='';
  pendingLocalSrc='';
  setUploadSourceTab('new');
  renderUploadList();
  document.getElementById('uploadSongOverlay').classList.add('open');
}
function closeUploadSong(e){ if(!e||e.target===document.getElementById('uploadSongOverlay')) document.getElementById('uploadSongOverlay').classList.remove('open'); }
function renderUploadList(){
  const list=document.getElementById('uploadSongList');
  if(!uploadDraft.length){ list.innerHTML='<div style="color:#bbb;font-size:13px;text-align:center;padding:8px 0">暂无诗歌</div>'; return; }
  list.innerHTML=uploadDraft.map((s,i)=>`
    <div class="upload-song-row">
      <div class="upload-song-thumb">${s.src?`<img src="${s.src}" alt="${escapeHtml(s.title||'歌曲封面')}">`:'<i class="ti ti-photo"></i>'}</div>
      <span class="upload-song-name">${s.title}</span>
      <button class="remove-song-btn" onclick="removeSongDraft(${i})"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}
function removeSongDraft(i){ uploadDraft.splice(i,1); renderUploadList(); }
let pendingLocalSrc='';
function handleLocalFile(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{ pendingLocalSrc=ev.target.result; };
  reader.readAsDataURL(file);
}
function addSongEntry(){
  const name=document.getElementById('newSongName').value.trim();
  if(!name){ alert('请输入诗歌名称'); return; }
  if(uploadDraft.some(s=>s.title===name)){ alert('本周诗歌列表中已经有同名诗歌了'); return; }
  const urlInput=document.getElementById('newSongUrl').value.trim();
  const src=pendingLocalSrc||urlInput||'';
  uploadDraft.push({title:name, src});
  ensureSongInLibrary(name, src); // 新建的诗歌自动归档进歌单库，供以后复用
  pendingLocalSrc='';
  document.getElementById('newSongName').value='';
  document.getElementById('newSongUrl').value='';
  document.getElementById('localFileInput').value='';
  renderUploadList();
}
function setUploadSourceTab(tab){
  document.getElementById('uploadTabNew').classList.toggle('active', tab==='new');
  document.getElementById('uploadTabLib').classList.toggle('active', tab==='lib');
  document.getElementById('uploadNewPanel').style.display = tab==='new' ? '' : 'none';
  document.getElementById('uploadLibPanel').style.display = tab==='lib' ? '' : 'none';
  if (tab==='lib') renderUploadLibPickList();
}
function renderUploadLibPickList(){
  const kw = document.getElementById('uploadLibPickSearch').value.trim().toLowerCase();
  const totalEl = document.getElementById('uploadLibTotalCount');
  if (totalEl) totalEl.textContent = songLibrary.length;
  const list = songLibrary
    .slice()
    .sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt))
    .filter(s => !kw || s.title.toLowerCase().includes(kw));
  const wrap = document.getElementById('uploadLibPickList');
  if (!songLibrary.length) {
    wrap.innerHTML = `<div class="upload-lib-pick-empty">歌单库还是空的，先在"新建诗歌"里添加几首吧</div>`;
    return;
  }
  if (!list.length) {
    wrap.innerHTML = `<div class="upload-lib-pick-empty">没有找到匹配的诗歌</div>`;
    return;
  }
  wrap.innerHTML = list.map(s => {
    const already = uploadDraft.some(d => d.title === s.title);
    const firstSrc = s.keys[0]?.src || '';
    const thumb = firstSrc ? `<img src="${firstSrc}" alt="${escapeHtml(s.title||'歌曲封面')}">` : `<i class="ti ti-photo"></i>`;
    return `<div class="upload-lib-pick-row${already?' already-added':''}" onclick="${already?'':`pickSongFromLibrary('${s.id}')`}">
      <div class="upload-lib-pick-thumb">${thumb}</div>
      <span class="upload-lib-pick-name">${escapeHtml(s.title)}</span>
      <span class="upload-lib-pick-add">${already?'已添加':'+ 添加'}</span>
    </div>`;
  }).join('');
}
function pickSongFromLibrary(id){
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  if (uploadDraft.some(d => d.title === s.title)) return;
  uploadDraft.push({title: s.title, src: s.keys[0]?.src || ''});
  renderUploadList();
  renderUploadLibPickList();
}
function saveUploadedSongs(){
  songData[uploadEditKey]=JSON.parse(JSON.stringify(uploadDraft));
  document.getElementById('uploadSongOverlay').classList.remove('open');
  persistSongLibrary();
  render();
}

// ── Song library (歌单库) ──────────────────────────────
let songLibSearchKeyword = '';
let songLibCategoryFilter = '';
let songLibSongbookFilter = '';
let songLibTab = 'all'; // 'all' | 'favorite' | 'recent'
function openSongLibrary(){
  document.getElementById('songLibSearchInput').value = '';
  songLibSearchKeyword = '';
  songLibCategoryFilter = '';
  songLibSongbookFilter = '';
  songLibTab = 'all';
  songLibSearchOpen = false;
  document.getElementById('songLibSearchWrap')?.classList.remove('open');
  document.getElementById('songLibSearchToggleBtn')?.classList.remove('active');
  document.getElementById('songLibSearchClear').classList.remove('visible');
  renderSongLibTabs();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  updateSongLibImportHint();
  document.getElementById('songLibraryOverlay').classList.add('open');
}
function renderSongLibTabs(){
  const wrap = document.getElementById('songLibTabs');
  if (!wrap) return;
  const tabs = [
    { id: 'all', label: '全部' },
    { id: 'favorite', label: '我的收藏' },
    { id: 'recent', label: '最近使用' },
  ];
  wrap.innerHTML = tabs.map(t =>
    `<button class="song-lib-tab${songLibTab === t.id ? ' active' : ''}" onclick="setSongLibTab('${t.id}')">${t.label}</button>`
  ).join('');
}
function setSongLibTab(tab){
  songLibTab = tab;
  renderSongLibTabs();
  renderSongLibraryGrid();
}
// 扫描 songData 中所有周次，按标题去重，找出尚未收录进 songLibrary 的历史诗歌
// 同名歌曲优先采用带图片链接的版本，便于一键导入时图片不缺失
function getUnimportedHistoricalSongs(){
  const byTitle = new Map();
  Object.keys(songData).forEach(key => {
    (songData[key] || []).forEach(s => {
      const title = (s?.title || '').trim();
      if (!title) return;
      const existing = byTitle.get(title);
      if (!existing || (!existing.src && s.src)) byTitle.set(title, { title, src: s.src || '' });
    });
  });
  const libTitles = new Set(songLibrary.map(s => s.title));
  return Array.from(byTitle.values()).filter(s => !libTitles.has(s.title));
}
function updateSongLibImportHint(){
  const hint = document.getElementById('songLibImportHint');
  if (!hint) return;
  if (!isAdmin) { hint.classList.remove('show'); return; }
  const pending = getUnimportedHistoricalSongs();
  document.getElementById('songLibImportCount').textContent = pending.length;
  hint.classList.toggle('show', pending.length > 0);
}
async function importHistoricalSongs(){
  const hint = document.getElementById('songLibImportHint');
  const pending = getUnimportedHistoricalSongs();
  if (!pending.length) return;
  hint.classList.add('importing');
  pending.forEach(s => ensureSongInLibrary(s.title, s.src));
  persistSongLibrary();
  updateSongLibImportHint();
  renderSongLibraryGrid();
  hint.classList.remove('importing');
  showToast(`✅ 已导入 ${pending.length} 首历史诗歌到歌单库`);
  await syncSongLibraryToRemote('☁️ 歌单库已同步到云端');
}

// 浏览器里触发文件下载的小工具：优先 fetch 成 blob 再下载（能拿到正确的文件名和跨域图片），
// fetch 失败（比如图片源不支持 CORS）就退化成直接新开页面，至少能让用户手动保存
async function triggerFileDownload(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return true;
  } catch (e) {
    console.error('下载失败，改为新窗口打开', e);
    window.open(url, '_blank');
    return false;
  }
}
function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}
// 文件名不能带 / \ : * ? " < > | 这些字符，简单替换成下划线
function sanitizeFileName(str) {
  return String(str || '').replace(/[\/\\:*?"<>|]/g, '_').trim() || '未命名';
}

// ── Song library: add new song (open to everyone) ─────
let songLibAddPendingSrc = '';
function openSongLibAdd(){
  document.getElementById('songLibAddName').value = '';
  document.getElementById('songLibAddCategory').value = '';
  document.getElementById('songLibAddBand').value = '';
  document.getElementById('songLibAddSongbook').value = '';
  document.getElementById('songLibAddKeyLabel').value = '';
  document.getElementById('songLibAddUrl').value = '';
  document.getElementById('songLibAddLyrics').value = '';
  document.getElementById('songLibAddFileInput').value = '';
  songLibAddPendingSrc = '';
  document.getElementById('songLibAddPreview').classList.remove('show');
  document.getElementById('songLibAddDupHint').classList.remove('show');
  document.getElementById('songLibAddError').classList.remove('show');
  document.getElementById('songLibAddSubmitBtn').disabled = false;
  const fillDatalist = (id, values) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = values.map(c => `<option value="${escapeHtml(c)}">`).join('');
  };
  fillDatalist('songLibCategoryDatalist', getSongLibCategories());
  fillDatalist('songLibBandDatalist', getSongLibBands());
  fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
  document.getElementById('songLibAddOverlay').classList.add('open');
}
function closeSongLibAdd(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibAddOverlay').classList.remove('open');
}
function onSongLibAddNameInput(){
  const name = document.getElementById('songLibAddName').value;
  const dup = findDuplicateSongInLibrary(name);
  document.getElementById('songLibAddDupHint').classList.toggle('show', !!dup);
  document.getElementById('songLibAddError').classList.remove('show');
}
function handleSongLibAddFile(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    songLibAddPendingSrc = ev.target.result;
    const preview = document.getElementById('songLibAddPreview');
    preview.innerHTML = `<img src="${songLibAddPendingSrc}" alt="封面预览"><span>${escapeHtml(file.name)}</span><button onclick="clearSongLibAddPreview()"><i class="ti ti-x"></i></button>`;
    preview.classList.add('show');
  };
  reader.readAsDataURL(file);
}
function clearSongLibAddPreview(){
  songLibAddPendingSrc = '';
  document.getElementById('songLibAddFileInput').value = '';
  document.getElementById('songLibAddPreview').classList.remove('show');
  document.getElementById('songLibAddPreview').innerHTML = '';
}
async function submitSongLibAdd(){
  const name = document.getElementById('songLibAddName').value.trim();
  const errEl = document.getElementById('songLibAddError');
  if (!name) {
    errEl.textContent = '请输入诗歌名称';
    errEl.classList.add('show');
    return;
  }
  const dup = findDuplicateSongInLibrary(name);
  if (dup) {
    errEl.textContent = `歌单库中已经有《${dup.title}》了，无法重复上传`;
    errEl.classList.add('show');
    document.getElementById('songLibAddDupHint').classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  const category = document.getElementById('songLibAddCategory').value.trim();
  const band = document.getElementById('songLibAddBand').value.trim();
  const songbook = document.getElementById('songLibAddSongbook').value.trim();
  const keyLabel = document.getElementById('songLibAddKeyLabel').value.trim();
  const lyrics = document.getElementById('songLibAddLyrics').value.trim();
  const urlInput = document.getElementById('songLibAddUrl').value.trim();
  const src = songLibAddPendingSrc || urlInput || '';
  const submitBtn = document.getElementById('songLibAddSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '上传中…';
  try {
    let finalSrc = src;
    // 本地图片优先上传到 Storage 换取真实链接，避免歌单库长期存着巨大的 base64
    if (finalSrc.startsWith('data:') && typeof uploadSongDataUrl === 'function' && initSupabaseClient()) {
      try {
        finalSrc = await uploadSongDataUrl('song-library', finalSrc, Date.now());
      } catch (e) {
        console.error('图片上传到 Storage 失败，保留本地图片', e);
        // 失败时不阻断流程，退回本地 base64，至少在本机可用
      }
    }
    const entry = ensureSongInLibrary(name, '');
    entry.category = category;
    entry.band = band;
    entry.songbook = songbook;
    entry.lyrics = lyrics;
    if (finalSrc) entry.keys.push({ id: genSongLibId(), label: keyLabel, src: finalSrc });
    persistSongLibrary();
    closeSongLibAdd();
    renderSongLibFilterBar();
    renderSongLibraryGrid();
    updateSongLibImportHint();
    showToast(`✅ 《${entry.title}》已上传到歌单库`);
    await syncSongLibraryToRemote();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '上传';
  }
}

function closeSongLibrary(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibraryOverlay').classList.remove('open');
}
let songLibSearchOpen = false;
// 点击顶部搜索按钮：展开/收起搜索框（再次点击即可关闭）
function toggleSongLibSearch(){
  const wrap = document.getElementById('songLibSearchWrap');
  const btn = document.getElementById('songLibSearchToggleBtn');
  if (!wrap || !btn) return;
  songLibSearchOpen = !songLibSearchOpen;
  if (songLibSearchOpen) {
    wrap.classList.add('open');
    btn.classList.add('active');
    setTimeout(() => document.getElementById('songLibSearchInput')?.focus(), 200);
  } else {
    wrap.classList.remove('open');
    btn.classList.remove('active');
    document.getElementById('songLibSearchInput')?.blur();
    if (songLibSearchKeyword) {
      document.getElementById('songLibSearchInput').value = '';
      songLibSearchKeyword = '';
      document.getElementById('songLibSearchClear').classList.remove('visible');
      renderSongLibraryGrid();
    }
  }
}
function onSongLibrarySearch(){
  songLibSearchKeyword = document.getElementById('songLibSearchInput').value.trim();
  document.getElementById('songLibSearchClear').classList.toggle('visible', songLibSearchKeyword.length > 0);
  renderSongLibraryGrid();
}
function clearSongLibrarySearch(){
  document.getElementById('songLibSearchInput').value = '';
  songLibSearchKeyword = '';
  document.getElementById('songLibSearchClear').classList.remove('visible');
  renderSongLibraryGrid();
  document.getElementById('songLibSearchInput').focus();
}
function renderSongLibFilterBar(){
  const bar = document.getElementById('songLibFilterBar');
  if (!bar) return;
  // 左侧栏只按诗歌本分类，不再提供"分类"筛选模式
  const options = getSongLibSongbookChipOptions();
  const chips = [{ label: '全部', value: '' }, ...options.map(sb => ({ label: sb, value: sb }))];
  const itemsHtml = chips.map(c => {
    const safeVal = escapeHtml(c.value).replace(/'/g,"\\'");
    const editBtn = (isAdmin && c.value) ? `<button class="song-lib-sidebar-item-edit" onclick="event.stopPropagation();renameSongLibSongbook('${safeVal}')" title="重命名诗歌本"><i class="ti ti-pencil"></i></button>` : '';
    const delBtn = (isAdmin && c.value) ? `<button class="song-lib-sidebar-item-del" onclick="event.stopPropagation();deleteSongLibSongbook('${safeVal}')" title="删除诗歌本"><i class="ti ti-x"></i></button>` : '';
    return `<div class="song-lib-sidebar-item${songLibSongbookFilter === c.value ? ' active' : ''}" onclick="setSongLibSongbookFilter('${safeVal}')">${escapeHtml(c.label)}${editBtn}${delBtn}</div>`;
  }).join('') + (isAdmin ? `<button class="song-lib-sidebar-add-btn" onclick="addSongLibSongbookPrompt()"><i class="ti ti-plus"></i>诗歌本</button>` : '');
  bar.innerHTML = itemsHtml;
}
function openSongLibCategoryAdd(){
  document.getElementById('songLibCategoryAddInput').value = '';
  document.getElementById('songLibCategoryAddError').classList.remove('show');
  document.getElementById('songLibCategoryAddOverlay').classList.add('open');
  setTimeout(() => document.getElementById('songLibCategoryAddInput')?.focus(), 100);
}
function closeSongLibCategoryAdd(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibCategoryAddOverlay').classList.remove('open');
}
async function submitSongLibCategoryAdd(){
  const val = document.getElementById('songLibCategoryAddInput').value.trim();
  const errEl = document.getElementById('songLibCategoryAddError');
  if (!val) { errEl.textContent = '请输入分类名称'; errEl.classList.add('show'); return; }
  const exists = getSongLibCategories().some(c => c.toLowerCase() === val.toLowerCase());
  if (exists) { errEl.textContent = '这个分类已经存在了'; errEl.classList.add('show'); return; }
  errEl.classList.remove('show');
  songLibCategories.push(val);
  persistSongLibCategories();
  closeSongLibCategoryAdd();
  renderSongLibFilterBar();
  fillDatalist('songLibCategoryDatalist', getSongLibCategories());
  showToast(`✅ 已添加分类「${val}」`);
  await syncSongLibCategoriesToRemote();
}
// 重命名分类：预设分类列表 + 所有正在用这个分类的歌曲，一起改名（联动），改完同步到云端
async function renameSongLibCategory(oldCat){
  const val = prompt(`将分类「${oldCat}」重命名为：`, oldCat);
  if (val === null) return;
  const newCat = val.trim();
  if (!newCat) { showToast('分类名称不能为空'); return; }
  if (newCat.toLowerCase() === oldCat.toLowerCase() && newCat === oldCat) return; // 没有变化
  if (newCat.toLowerCase() !== oldCat.toLowerCase() && getSongLibCategories().some(c => c.toLowerCase() === newCat.toLowerCase())) {
    showToast(`分类「${newCat}」已经存在，不能重复`);
    return;
  }
  const idx = songLibCategories.findIndex(c => c.toLowerCase() === oldCat.toLowerCase());
  if (idx !== -1) songLibCategories[idx] = newCat; else songLibCategories.push(newCat);
  persistSongLibCategories();
  let changed = 0;
  songLibrary.forEach(s => { if (s.category && s.category.toLowerCase() === oldCat.toLowerCase()) { s.category = newCat; changed++; } });
  if (changed) persistSongLibrary();
  if (songLibCategoryFilter.toLowerCase() === oldCat.toLowerCase()) songLibCategoryFilter = newCat;
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  fillDatalist('songLibCategoryDatalist', getSongLibCategories());
  showToast(`✅ 已重命名为「${newCat}」${changed ? `，同步更新了 ${changed} 首歌曲` : ''}`);
  await syncSongLibCategoriesToRemote();
  if (changed) await syncSongLibraryToRemote();
}
async function deleteSongLibCategory(cat){
  const usageCount = songLibrary.filter(s => s.category === cat).length;
  const msg = usageCount > 0
    ? `有 ${usageCount} 首歌正在使用「${cat}」这个分类，删除后这些歌曲的分类会一并清空。确定要删除吗？`
    : `确定要删除分类「${cat}」吗？`;
  if (!confirm(msg)) return;
  songLibCategories = songLibCategories.filter(c => c.toLowerCase() !== cat.toLowerCase());
  persistSongLibCategories();
  let changed = 0;
  songLibrary.forEach(s => { if (s.category === cat) { s.category = ''; changed++; } });
  if (changed) persistSongLibrary();
  if (songLibCategoryFilter === cat) songLibCategoryFilter = '';
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  fillDatalist('songLibCategoryDatalist', getSongLibCategories());
  showToast(`✅ 已删除分类「${cat}」${changed ? `，${changed} 首歌曲的分类已清空` : ''}`);
  await syncSongLibCategoriesToRemote();
  if (changed) await syncSongLibraryToRemote();
}
async function addSongLibSongbookPrompt(){
  const val = (prompt('新增诗歌本名称（如：生命圣诗、赞美之泉）：') || '').trim();
  if (!val) return;
  if (getSongLibSongbooks().some(sb => sb.toLowerCase() === val.toLowerCase())) { showToast('这个诗歌本已经存在了'); return; }
  songLibSongbooks.push(val);
  persistSongLibSongbooks();
  renderSongLibFilterBar();
  fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
  showToast(`✅ 已添加诗歌本「${val}」`);
  await syncSongLibSongbooksToRemote();
}
// 重命名诗歌本：预设列表 + 所有正在用这个诗歌本的歌曲，一起改名（联动），改完同步到云端
async function renameSongLibSongbook(oldSb){
  const val = prompt(`将诗歌本「${oldSb}」重命名为：`, oldSb);
  if (val === null) return;
  const newSb = val.trim();
  if (!newSb) { showToast('诗歌本名称不能为空'); return; }
  if (newSb.toLowerCase() === oldSb.toLowerCase() && newSb === oldSb) return; // 没有变化
  if (newSb.toLowerCase() !== oldSb.toLowerCase() && getSongLibSongbooks().some(sb => sb.toLowerCase() === newSb.toLowerCase())) {
    showToast(`诗歌本「${newSb}」已经存在，不能重复`);
    return;
  }
  const idx = songLibSongbooks.findIndex(sb => sb.toLowerCase() === oldSb.toLowerCase());
  if (idx !== -1) songLibSongbooks[idx] = newSb; else songLibSongbooks.push(newSb);
  persistSongLibSongbooks();
  let changed = 0;
  songLibrary.forEach(s => { if (s.songbook && s.songbook.toLowerCase() === oldSb.toLowerCase()) { s.songbook = newSb; changed++; } });
  if (changed) persistSongLibrary();
  if (songLibSongbookFilter.toLowerCase() === oldSb.toLowerCase()) songLibSongbookFilter = newSb;
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
  showToast(`✅ 已重命名为「${newSb}」${changed ? `，同步更新了 ${changed} 首歌曲` : ''}`);
  await syncSongLibSongbooksToRemote();
  if (changed) await syncSongLibraryToRemote();
}
async function deleteSongLibSongbook(sb){
  const usageCount = songLibrary.filter(s => s.songbook === sb).length;
  const msg = usageCount > 0
    ? `有 ${usageCount} 首歌正在使用「${sb}」这个诗歌本，删除后这些歌曲的诗歌本会一并清空。确定要删除吗？`
    : `确定要删除诗歌本「${sb}」吗？`;
  if (!confirm(msg)) return;
  songLibSongbooks = songLibSongbooks.filter(x => x.toLowerCase() !== sb.toLowerCase());
  persistSongLibSongbooks();
  let changed = 0;
  songLibrary.forEach(s => { if (s.songbook === sb) { s.songbook = ''; changed++; } });
  if (changed) persistSongLibrary();
  if (songLibSongbookFilter === sb) songLibSongbookFilter = '';
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
  showToast(`✅ 已删除诗歌本「${sb}」${changed ? `，${changed} 首歌曲的诗歌本已清空` : ''}`);
  await syncSongLibSongbooksToRemote();
  if (changed) await syncSongLibraryToRemote();
}
function setSongLibCategoryFilter(cat){
  songLibCategoryFilter = cat;
  songLibSongbookFilter = ''; // 联动：切换分类后，诗歌本可选项会变，之前选的诗歌本筛选先清空
  renderSongLibFilterBar();
  renderSongLibraryGrid();
}
function setSongLibSongbookFilter(sb){
  songLibSongbookFilter = sb;
  renderSongLibFilterBar();
  renderSongLibraryGrid();
}
function getFilteredSongLibrary(){
  let list = songLibrary.slice();
  if (songLibTab === 'favorite') {
    list = list.filter(s => isSongLibFavorite(s.id));
    list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (songLibTab === 'recent') {
    list = list.filter(s => s.lastPlayedAt);
    list.sort((a,b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt));
  } else {
    list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if (songLibCategoryFilter) list = list.filter(s => s.category === songLibCategoryFilter);
  if (songLibSongbookFilter) list = list.filter(s => s.songbook === songLibSongbookFilter);
  if (!songLibSearchKeyword) return list;
  const kw = songLibSearchKeyword.toLowerCase();
  return list.filter(s =>
    s.title.toLowerCase().includes(kw) ||
    s.category.toLowerCase().includes(kw) ||
    s.band.toLowerCase().includes(kw) ||
    s.songbook.toLowerCase().includes(kw)
  );
}
function renderSongLibraryGrid(){
  const grid = document.getElementById('songLibGrid');
  const countEl = document.getElementById('songLibCount');
  const list = getFilteredSongLibrary();
  const filtered = !!(songLibSearchKeyword || songLibCategoryFilter || songLibSongbookFilter);
  if (songLibTab === 'favorite') {
    countEl.textContent = filtered ? `找到 ${list.length} 首` : `共收藏 ${list.length} 首`;
  } else if (songLibTab === 'recent') {
    countEl.textContent = filtered ? `找到 ${list.length} 首` : `最近使用 ${list.length} 首`;
  } else {
    countEl.textContent = filtered ? `找到 ${list.length} 首` : `共收录 ${songLibrary.length} 首诗歌`;
  }
  if (!list.length) {
    let emptyIcon = filtered ? 'ti-search-off' : 'ti-music-off';
    let emptyMsg = filtered ? '没有找到匹配的诗歌' : '歌单库还是空的，上传诗歌后会自动收录';
    if (!filtered && songLibTab === 'favorite') { emptyIcon = 'ti-heart'; emptyMsg = '还没有收藏任何诗歌，点击♡即可收藏'; }
    if (!filtered && songLibTab === 'recent') { emptyIcon = 'ti-history'; emptyMsg = '还没有播放记录，播放过的诗歌会显示在这里'; }
    grid.innerHTML = `<div class="song-lib-empty"><i class="ti ${emptyIcon}"></i>${emptyMsg}</div>`;
    return;
  }
  grid.innerHTML = list.map((s,i) => {
    const firstSrc = s.keys[0]?.src || '';
    const thumb = firstSrc
      ? `<img src="${firstSrc}" alt="${escapeHtml(s.title)}" loading="lazy" onclick="event.stopPropagation();openLightboxFromLibraryGrid(${i})"><div class="song-lib-zoom-hint" onclick="event.stopPropagation();openLightboxFromLibraryGrid(${i})"><i class="ti ti-maximize"></i></div>`
      : `<i class="ti ti-photo"></i>`;
    const usageCount = findSongUsageWeeks(s.title).length;
    const d = new Date(s.createdAt);
    const dateLabel = isNaN(d) ? '' : `${d.getMonth()+1}/${d.getDate()}收录`;
    const metaParts = [];
    if (usageCount > 0) metaParts.push(`<i class="ti ti-repeat"></i>用过${usageCount}次`);
    if (dateLabel) metaParts.push(dateLabel);
    const meta = metaParts.length
      ? metaParts.join('<span class="ulib-dot"> · </span>')
      : '<span style="color:#ccc">暂无使用记录</span>';
    const badges = [];
    if (s.category) badges.push(`<span class="song-lib-category-badge">${escapeHtml(s.category)}</span>`);
    if (s.keys.length > 1) badges.push(`<span class="song-lib-key-count-badge">${s.keys.length}个调</span>`);
    const sourceParts = [];
    if (s.band) sourceParts.push(`<i class="ti ti-users"></i>${escapeHtml(s.band)}`);
    const sourceLine = sourceParts.length
      ? `<div class="song-lib-card-source">${sourceParts.join('<span class="ulib-dot"> · </span>')}</div>`
      : '';
    const safeTitle=escapeHtml(s.title).replace(/'/g,"\\'");
    const isFav = isSongLibFavorite(s.id);
    return `<div class="song-lib-card" onclick="openSongLibDetail('${s.id}')">
      <div class="song-lib-card-thumb${firstSrc?' has-img':''}">${thumb}</div>
      <div class="song-lib-card-info">
        <div class="song-lib-card-title-row"><div class="song-lib-card-title">${highlightKeyword(s.title, songLibSearchKeyword)}</div>${badges.join('')}</div>
        ${sourceLine}
        <div class="song-lib-card-meta">${meta}</div>
      </div>
      <div class="song-lib-card-actions">
        <button class="song-lib-card-play-btn" onclick="event.stopPropagation();quickPlaySongAudio('${safeTitle}')" title="列表播放"><i class="ti ti-player-play"></i></button>
        <button class="song-lib-card-fav-btn${isFav?' active':''}" onclick="event.stopPropagation();toggleSongLibFavorite('${s.id}')" title="${isFav?'取消收藏':'收藏'}"><i class="ti ${isFav?'ti-heart-filled':'ti-heart'}"></i></button>
      </div>
    </div>`;
  }).join('');
}
// 收藏/取消收藏（网格里的心形按钮、详情页里的心形按钮共用）—— 只存本机 localStorage，不同步云端
function toggleSongLibFavorite(id){
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  if (songLibFavoriteIds.has(id)) songLibFavoriteIds.delete(id); else songLibFavoriteIds.add(id);
  persistSongLibFavorites();
  renderSongLibraryGrid();
  if (songLibDetailCurrent && songLibDetailCurrent.id === id) renderSongLibDetailFavBtn();
}
function toggleSongLibFavoriteFromDetail(){
  if (!songLibDetailCurrent) return;
  toggleSongLibFavorite(songLibDetailCurrent.id);
}
function renderSongLibDetailFavBtn(){
  const btn = document.getElementById('songLibDetailFavBtn');
  const s = songLibDetailCurrent;
  if (!btn || !s) return;
  const isFav = isSongLibFavorite(s.id);
  btn.classList.toggle('active', isFav);
  btn.title = isFav ? '取消收藏' : '收藏';
  btn.innerHTML = `<i class="ti ${isFav ? 'ti-heart-filled' : 'ti-heart'}"></i>`;
}
// 记录"最近使用"：每次打开某首歌的音乐播放器都算一次使用
function markSongLibPlayed(title){
  const s = findSongLibEntryByTitle(title);
  if (!s) return;
  s.lastPlayedAt = new Date().toISOString();
  persistSongLibrary();
  syncSongLibraryToRemote();
}
// 点击歌单库网格中的缩略图：以当前筛选结果为列表打开大图查看器（用每首歌的第一个调）
function openLightboxFromLibraryGrid(index){
  const list = getFilteredSongLibrary().map(s => ({ title: s.title, src: s.keys[0]?.src || '' }));
  openLightboxWithList(list, index);
}

// ── Song library: detail (category, 多个调, 歌词下载) ──
let songLibDetailCurrent = null;
let songLibDetailKeyIndex = 0;
function openSongLibDetail(id){
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  songLibDetailCurrent = s;
  songLibDetailKeyIndex = 0;
  closeAddKeyPanel();
  cancelLyricsEdit();
  document.getElementById('songLibDetailTitle').textContent = s.title;
  renderSongLibDetailFavBtn();
  document.getElementById('songLibDetailCategory').innerHTML = s.category
    ? `<span class="song-lib-category-badge">${escapeHtml(s.category)}</span>`
    : '';
  songLibSourceEditing = false;
  renderSongLibDetailSource();
  const d = new Date(s.createdAt);
  const dateLabel = isNaN(d) ? '' : `首次收录于 ${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  document.getElementById('songLibDetailMeta').textContent = dateLabel;
  renderSongLibDetailKeyChips();
  renderSongLibDetailThumb();
  renderSongLibLyrics();
  const weeks = findSongUsageWeeks(s.title);
  const usageList = document.getElementById('songLibUsageList');
  usageList.innerHTML = weeks.length
    ? weeks.map(key => {
        const wd = new Date(key + 'T00:00:00');
        return `<div class="song-lib-usage-item"><i class="ti ti-calendar-event"></i>${wd.getMonth()+1}月${wd.getDate()}日（周日）</div>`;
      }).join('')
    : `<div class="song-lib-usage-empty">暂无使用记录</div>`;
  const actions = document.getElementById('songLibDetailActions');
  actions.innerHTML = isAdmin
    ? `<button class="btn-cancel" onclick="closeSongLibDetail()">关闭</button>
       <button class="btn-save" style="background:#e74c3c" onclick="deleteSongFromLibrary('${s.id}')">从歌单库删除</button>`
    : `<button class="btn-save" style="flex:1" onclick="closeSongLibDetail()">关闭</button>`;
  document.getElementById('songLibDetailOverlay').classList.add('open');
}
function renderSongLibDetailThumb(){
  const s = songLibDetailCurrent;
  const key = s?.keys[songLibDetailKeyIndex];
  document.getElementById('songLibDetailThumb').innerHTML = key?.src
    ? `<img src="${key.src}" alt="${escapeHtml(s.title)}" style="cursor:zoom-in" onclick="openLightboxFromDetail()">`
    : `<i class="ti ti-photo"></i>`;
  const downloadBtn = document.getElementById('songLibDownloadImgBtn');
  if (downloadBtn) downloadBtn.disabled = !key?.src;
}
function renderSongLibDetailKeyChips(){
  const wrap = document.getElementById('songLibKeyChips');
  const s = songLibDetailCurrent;
  if (!wrap || !s) return;
  const chips = s.keys.map((k, i) => {
    const delBtn = isAdmin && s.keys.length > 0
      ? `<button class="song-lib-key-chip-del" onclick="event.stopPropagation();deleteSongLibKey('${k.id}')" title="删除此调"><i class="ti ti-x"></i></button>`
      : '';
    return `<button class="song-lib-key-chip${i === songLibDetailKeyIndex ? ' active' : ''}" onclick="selectSongLibDetailKey(${i})">
      <i class="ti ti-music"></i>${escapeHtml(getSongLibKeyDisplayLabel(k))}${delBtn}
    </button>`;
  }).join('');
  wrap.innerHTML = chips + `<button class="song-lib-key-add-chip" onclick="openAddKeyPanel()"><i class="ti ti-plus"></i>添加调</button>`;
}
function selectSongLibDetailKey(idx){
  songLibDetailKeyIndex = idx;
  renderSongLibDetailKeyChips();
  renderSongLibDetailThumb();
}
// 点击歌单库详情页中的大图：打开放大查看器（仅这一张图，无翻页）
function openLightboxFromDetail(){
  const s = songLibDetailCurrent;
  const key = s?.keys[songLibDetailKeyIndex];
  if (!key?.src) return;
  const label = getSongLibKeyDisplayLabel(key);
  openLightboxWithList([{ title: `${s.title}${key.label ? '（' + label + '）' : ''}`, src: key.src }], 0);
}
async function downloadCurrentSongLibKeyImage(){
  const s = songLibDetailCurrent;
  const key = s?.keys[songLibDetailKeyIndex];
  if (!key?.src) return;
  const label = key.label ? `-${key.label}` : '';
  const ext = (key.src.split('?')[0].split('.').pop() || 'jpg').slice(0, 4);
  await triggerFileDownload(key.src, `${sanitizeFileName(s.title)}${label}.${/^[a-zA-Z0-9]+$/.test(ext) ? ext : 'jpg'}`);
}
function closeSongLibDetail(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibDetailOverlay').classList.remove('open');
}
async function deleteSongFromLibrary(id){
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`确定要从歌单库删除《${s.title}》吗？已经排入各周诗歌列表的记录不会受影响。`)) return;
  removeSongFromLibrary(id);
  persistSongLibrary();
  closeSongLibDetail();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  showToast('已从歌单库删除');
  await syncSongLibraryToRemote();
}

// ── Song library detail: 添加新的调（同一首歌的另一份图片）──
let songLibAddKeyPendingSrc = '';
function openAddKeyPanel(){
  document.getElementById('songLibAddKeyLabelInput').value = '';
  document.getElementById('songLibAddKeyUrl').value = '';
  document.getElementById('songLibAddKeyFileInput').value = '';
  songLibAddKeyPendingSrc = '';
  document.getElementById('songLibAddKeyPreview').classList.remove('show');
  document.getElementById('songLibAddKeyPreview').innerHTML = '';
  document.getElementById('songLibAddKeyError').classList.remove('show');
  document.getElementById('songLibAddKeyPanel').classList.add('show');
}
function closeAddKeyPanel(){
  const panel = document.getElementById('songLibAddKeyPanel');
  if (panel) panel.classList.remove('show');
}
function handleSongLibAddKeyFile(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    songLibAddKeyPendingSrc = ev.target.result;
    const preview = document.getElementById('songLibAddKeyPreview');
    preview.innerHTML = `<img src="${songLibAddKeyPendingSrc}" alt="预览"><span>${escapeHtml(file.name)}</span><button onclick="clearSongLibAddKeyPreview()"><i class="ti ti-x"></i></button>`;
    preview.classList.add('show');
  };
  reader.readAsDataURL(file);
}
function clearSongLibAddKeyPreview(){
  songLibAddKeyPendingSrc = '';
  document.getElementById('songLibAddKeyFileInput').value = '';
  document.getElementById('songLibAddKeyPreview').classList.remove('show');
  document.getElementById('songLibAddKeyPreview').innerHTML = '';
}
async function submitAddSongKey(){
  const s = songLibDetailCurrent;
  if (!s) return;
  const label = document.getElementById('songLibAddKeyLabelInput').value.trim();
  const urlInput = document.getElementById('songLibAddKeyUrl').value.trim();
  const src = songLibAddKeyPendingSrc || urlInput || '';
  const errEl = document.getElementById('songLibAddKeyError');
  if (!src) {
    errEl.classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  const submitBtn = document.getElementById('songLibAddKeySubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '添加中…';
  try {
    let finalSrc = src;
    if (finalSrc.startsWith('data:') && typeof uploadSongDataUrl === 'function' && initSupabaseClient()) {
      try {
        finalSrc = await uploadSongDataUrl('song-library', finalSrc, Date.now());
      } catch (e) {
        console.error('图片上传到 Storage 失败，保留本地图片', e);
      }
    }
    s.keys.push({ id: genSongLibId(), label, src: finalSrc });
    persistSongLibrary();
    songLibDetailKeyIndex = s.keys.length - 1;
    closeAddKeyPanel();
    renderSongLibDetailKeyChips();
    renderSongLibDetailThumb();
    renderSongLibraryGrid();
    showToast('✅ 已添加新的调');
    await syncSongLibraryToRemote();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '添加';
  }
}
async function deleteSongLibKey(keyId){
  const s = songLibDetailCurrent;
  if (!s) return;
  if (!confirm('确定要删除这个调的图片吗？')) return;
  s.keys = s.keys.filter(k => k.id !== keyId);
  if (songLibDetailKeyIndex >= s.keys.length) songLibDetailKeyIndex = Math.max(0, s.keys.length - 1);
  persistSongLibrary();
  renderSongLibDetailKeyChips();
  renderSongLibDetailThumb();
  renderSongLibraryGrid();
  showToast('已删除该调');
  await syncSongLibraryToRemote();
}

// ── Song library detail: 完整歌词（纯文字，无涂鸦标记）──
// ── Song library detail: 来源信息（乐团 / 诗歌本）内联编辑 ──
let songLibSourceEditing = false;
function renderSongLibDetailSource(){
  const s = songLibDetailCurrent;
  const wrap = document.getElementById('songLibDetailSource');
  if (!s || !wrap) return;
  if (songLibSourceEditing) {
    const fillDatalist = (id, values) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = values.map(c => `<option value="${escapeHtml(c)}">`).join('');
    };
    fillDatalist('songLibBandDatalist', getSongLibBands());
    fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
    wrap.innerHTML = `<div class="song-lib-source-edit-panel show">
      <input type="text" id="songLibSourceEditBand" list="songLibBandDatalist" placeholder="乐团（如：敬拜团、青年团契）" value="${escapeHtml(s.band)}">
      <input type="text" id="songLibSourceEditSongbook" list="songLibSongbookDatalist" placeholder="诗歌本（如：生命圣诗、赞美之泉）" value="${escapeHtml(s.songbook)}">
      <div class="song-lib-source-edit-actions">
        <button class="btn-cancel" onclick="cancelSourceEdit()">取消</button>
        <button class="btn-save" onclick="saveSourceEdit()">保存</button>
      </div>
    </div>`;
    return;
  }
  const parts = [];
  if (s.band) parts.push(`<span><i class="ti ti-users"></i>${escapeHtml(s.band)}</span>`);
  if (s.songbook) parts.push(`<span><i class="ti ti-book-2"></i>${escapeHtml(s.songbook)}</span>`);
  const editBtn = `<button class="song-lib-source-edit-btn" onclick="openSourceEdit()"><i class="ti ti-edit"></i>${parts.length ? '编辑' : '添加乐团/诗歌本'}</button>`;
  wrap.innerHTML = `<div class="song-lib-detail-source-line">${parts.join('')}${editBtn}</div>`;
}
function openSourceEdit(){
  songLibSourceEditing = true;
  renderSongLibDetailSource();
}
function cancelSourceEdit(){
  songLibSourceEditing = false;
  if (songLibDetailCurrent) renderSongLibDetailSource();
}
async function saveSourceEdit(){
  const s = songLibDetailCurrent;
  if (!s) return;
  s.band = (document.getElementById('songLibSourceEditBand')?.value || '').trim();
  s.songbook = (document.getElementById('songLibSourceEditSongbook')?.value || '').trim();
  persistSongLibrary();
  songLibSourceEditing = false;
  renderSongLibDetailSource();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  showToast('✅ 已保存来源信息');
  await syncSongLibraryToRemote();
}

// ── 音乐播放弹窗：为某首诗歌挑选平台链接在线收听 ─────────
let musicPlayerSongTitle = '';
let musicPlayerActiveId = null;

// ── 全局持久 <audio> 元素：支撑"单曲循环 / 列表播放 / 关闭弹窗后悬浮播放" ──
let globalAudioEl = null;      // 唯一的音频播放实例，跨弹窗/悬浮条复用，移动 DOM 节点不会打断播放
let loadedAudioLinkId = null;  // 当前已加载到 globalAudioEl 里的链接 id
let audioRepeatOne = false;    // 单曲循环
let audioPlaylistMode = false; // 列表循环播放（播完自动接播下一个音频，到末尾回到第一个）
let floatingAudioVisible = false; // 悬浮播放条是否展示中

function ensureGlobalAudioEl() {
  if (globalAudioEl) return globalAudioEl;
  const el = document.createElement('audio');
  el.id = 'globalAudioEl';
  el.style.width = '100%';
  el.preload = 'auto';
  el.addEventListener('ended', onGlobalAudioEnded);
  el.addEventListener('play', updateFloatingAudioPlayState);
  el.addEventListener('pause', updateFloatingAudioPlayState);
  el.addEventListener('timeupdate', updateFloatingAudioProgress);
  document.body.appendChild(el);
  globalAudioEl = el;
  return el;
}
function onGlobalAudioEnded() {
  // 注意：当 loop=true（单曲循环）时浏览器不会触发 ended 事件，因此这里只处理列表播放的场景
  if (!audioPlaylistMode) return;
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  const curIdx = audioLinks.findIndex(l => l.id === loadedAudioLinkId);
  if (curIdx !== -1 && curIdx < audioLinks.length - 1) {
    // 当前这首歌还有其他版本没播完，先接着播完这首歌的所有版本
    playAdjacentAudioLink(1);
  } else {
    // 这首歌的音频都播完了，自动切到歌单库列表中的下一首歌
    playNextSongInLibrary();
  }
}
// 按当前筛选/排序顺序（与歌单库网格显示一致）自动播放下一首含有音频链接的歌曲，到末尾会回到第一首循环
function playNextSongInLibrary() {
  const list = getFilteredSongLibrary();
  const curTitle = (musicPlayerSongTitle || '').trim().toLowerCase();
  const curIndex = list.findIndex(s => s.title.trim().toLowerCase() === curTitle);
  const n = list.length;
  if (n > 0 && curIndex !== -1) {
    for (let step = 1; step <= n; step++) {
      const candidate = list[(curIndex + step) % n];
      const audioLinks = getAudioLinksForTitle(candidate.title);
      if (audioLinks.length) { startPlaylistSong(candidate.title, audioLinks[0]); return; }
    }
  }
  // 当前歌曲不在筛选列表里，或找不到其他可播放的歌：从头重新播放当前这首
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  if (audioLinks.length) startPlaylistSong(musicPlayerSongTitle, audioLinks[0]);
}
// 与 playNextSongInLibrary 相同的顺序，反向切到歌单库列表中的上一首（用于悬浮播放条的"上一个"按钮）
function playPrevSongInLibrary() {
  const list = getFilteredSongLibrary();
  const curTitle = (musicPlayerSongTitle || '').trim().toLowerCase();
  const curIndex = list.findIndex(s => s.title.trim().toLowerCase() === curTitle);
  const n = list.length;
  if (n > 0 && curIndex !== -1) {
    for (let step = 1; step <= n; step++) {
      const candidate = list[((curIndex - step) % n + n) % n];
      const audioLinks = getAudioLinksForTitle(candidate.title);
      if (audioLinks.length) { startPlaylistSong(candidate.title, audioLinks[0]); return; }
    }
  }
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  if (audioLinks.length) startPlaylistSong(musicPlayerSongTitle, audioLinks[0]);
}
// 列表播放模式下切歌的公共逻辑：加载并播放某首歌的指定音频链接
function startPlaylistSong(title, link) {
  musicPlayerSongTitle = title;
  musicPlayerActiveId = link.id;
  markSongLibPlayed(title);
  const audioEl = ensureGlobalAudioEl();
  const safeUrl = getSafeExternalUrl(link.url);
  if (!safeUrl) return;
  audioEl.loop = false;
  audioEl.src = safeUrl;
  loadedAudioLinkId = link.id;
  audioEl.play().catch(() => {});
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar();
}
function toggleAudioRepeatOne() {
  audioRepeatOne = !audioRepeatOne;
  if (audioRepeatOne) audioPlaylistMode = false;
  if (globalAudioEl) globalAudioEl.loop = audioRepeatOne;
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar();
}
function toggleAudioPlaylistMode() {
  audioPlaylistMode = !audioPlaylistMode;
  if (audioPlaylistMode) { audioRepeatOne = false; if (globalAudioEl) globalAudioEl.loop = false; }
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar();
}
// 悬浮播放条上的"循环播放/列表播放"两个模式按钮，与弹窗内的模式共用同一份状态
function updateFloatingAudioModeButtons() {
  const loopBtn = document.getElementById('floatingAudioLoopBtn');
  const listBtn = document.getElementById('floatingAudioListBtn');
  if (loopBtn) loopBtn.classList.toggle('active', audioRepeatOne);
  if (listBtn) listBtn.classList.toggle('active', audioPlaylistMode);
}
// 在当前诗歌的"音频文件"链接间切换到上一个/下一个，到边界时循环回绕
function playAdjacentAudioLink(dir) {
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  if (audioLinks.length < 2) return;
  const curIdx = audioLinks.findIndex(l => l.id === loadedAudioLinkId);
  let nextIdx = (curIdx === -1 ? 0 : curIdx + dir);
  if (nextIdx < 0) nextIdx = audioLinks.length - 1;
  if (nextIdx >= audioLinks.length) nextIdx = 0;
  musicPlayerActiveId = audioLinks[nextIdx].id;
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar();
}
function renderAudioToolsHtml() {
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  const hasMultiple = audioLinks.length > 1;
  return `<div class="music-player-audio-tools">
    <button class="audio-tool-btn${audioRepeatOne ? ' active' : ''}" onclick="toggleAudioRepeatOne()" title="单曲循环播放"><i class="ti ti-repeat-once"></i>循环播放</button>
    ${hasMultiple ? `<button class="audio-tool-btn${audioPlaylistMode ? ' active' : ''}" onclick="toggleAudioPlaylistMode()" title="列表循环播放"><i class="ti ti-repeat"></i>列表播放</button>
    <button class="audio-tool-btn" onclick="playAdjacentAudioLink(-1)" title="上一个音频"><i class="ti ti-player-skip-back"></i>上一个</button>
    <button class="audio-tool-btn" onclick="playAdjacentAudioLink(1)" title="下一个音频"><i class="ti ti-player-skip-forward"></i>下一个</button>` : ''}
  </div>`;
}

// ── 悬浮播放条：关闭音乐弹窗后，若音频仍在播放则不中断，改为悬浮显示 ──
function showFloatingAudioBar() {
  const bar = document.getElementById('floatingAudioBar');
  if (!bar || !loadedAudioLinkId || !globalAudioEl) return;
  globalAudioEl.style.display = 'none';
  bar.appendChild(globalAudioEl); // 只是移动 DOM 节点，不会打断播放
  document.getElementById('floatingAudioTitle').textContent = musicPlayerSongTitle || '未知诗歌';
  const link = getMusicLinksForTitle(musicPlayerSongTitle).find(l => l.id === loadedAudioLinkId);
  const songEntry = songLibrary.find(s => s.title.trim().toLowerCase() === (musicPlayerSongTitle || '').trim().toLowerCase());
  const sourceLabel = link?.label || '音频播放中';
  document.getElementById('floatingAudioSub').textContent = songEntry?.band ? `${songEntry.band} · ${sourceLabel}` : sourceLabel;
  const playableSongs = getFilteredSongLibrary().filter(s => getAudioLinksForTitle(s.title).length > 0);
  const hasMultiple = playableSongs.length > 1;
  document.getElementById('floatingAudioPrevBtn').style.display = hasMultiple ? '' : 'none';
  document.getElementById('floatingAudioNextBtn').style.display = hasMultiple ? '' : 'none';
  updateFloatingAudioPlayState();
  updateFloatingAudioProgress();
  updateFloatingAudioModeButtons();
  bar.classList.add('show');
  floatingAudioVisible = true;
}
function hideFloatingAudioBar() {
  const bar = document.getElementById('floatingAudioBar');
  if (bar) bar.classList.remove('show');
  floatingAudioVisible = false;
}
function stopFloatingAudio() {
  if (globalAudioEl) globalAudioEl.pause();
  loadedAudioLinkId = null;
  hideFloatingAudioBar();
}
function toggleFloatingAudioPlay() {
  if (!globalAudioEl) return;
  if (globalAudioEl.paused) globalAudioEl.play().catch(() => {}); else globalAudioEl.pause();
}
function updateFloatingAudioPlayState() {
  const btn = document.getElementById('floatingAudioPlayBtn');
  if (!btn) return;
  const playing = globalAudioEl && !globalAudioEl.paused;
  btn.innerHTML = playing ? '<i class="ti ti-player-pause"></i>' : '<i class="ti ti-player-play"></i>';
  const icon = document.getElementById('floatingAudioIcon');
  if (icon) icon.classList.toggle('spin', !!playing);
}
function updateFloatingAudioProgress() {
  const fill = document.getElementById('floatingAudioProgressFill');
  if (!fill) return;
  if (!globalAudioEl || !globalAudioEl.duration) { fill.style.width = '0%'; return; }
  fill.style.width = `${(globalAudioEl.currentTime / globalAudioEl.duration) * 100}%`;
}
function floatingAudioNext() { playNextSongInLibrary(); }
function floatingAudioPrev() { playPrevSongInLibrary(); }
// 点击悬浮条主体：重新打开该诗歌的音乐弹窗（继续播放，不会重新开始）
function reopenFloatingAudio() {
  if (musicPlayerSongTitle) openMusicPlayer(musicPlayerSongTitle);
}

// 歌单库网格里点击"列表播放"按钮：不打开弹窗，直接播放并以悬浮条展示，默认开启列表播放模式
function quickPlaySongAudio(title) {
  const audioLinks = getAudioLinksForTitle(title);
  if (!audioLinks.length) {
    // 没有可直接播放的音频文件链接（可能只有 YouTube/外部链接），退回打开音乐弹窗手动选择
    openMusicPlayer(title);
    return;
  }
  markSongLibPlayed(title);
  musicPlayerSongTitle = title;
  musicPlayerActiveId = audioLinks[0].id;
  audioRepeatOne = false;
  audioPlaylistMode = true; // 默认按列表播放
  const audioEl = ensureGlobalAudioEl();
  audioEl.loop = false;
  const safeUrl = getSafeExternalUrl(audioLinks[0].url);
  if (!safeUrl) { showToast('音频链接无效'); return; }
  audioEl.src = safeUrl;
  loadedAudioLinkId = audioLinks[0].id;
  audioEl.play().catch(() => {});
  showFloatingAudioBar();
}
function openMusicPlayer(title) {
  markSongLibPlayed(title);
  // 若悬浮播放条正在播放"同一首诗歌"，重新打开弹窗时保持在当前播放的链接上，不从头重置
  const resuming = floatingAudioVisible && musicPlayerSongTitle === title && loadedAudioLinkId;
  musicPlayerSongTitle = title;
  const links = getMusicLinksForTitle(title);
  if (resuming && links.find(l => l.id === loadedAudioLinkId)) {
    musicPlayerActiveId = loadedAudioLinkId;
  } else {
    musicPlayerActiveId = links[0]?.id || null;
  }
  document.getElementById('musicPlayerTitle').textContent = title;
  closeMusicLinkAddForm();
  hideFloatingAudioBar();
  renderMusicPlayerBody();
  document.getElementById('musicPlayerOverlay').classList.add('open');
}
function closeMusicPlayer(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('musicPlayerOverlay').classList.remove('open');
  closeMusicLinkAddForm();
  if (loadedAudioLinkId && globalAudioEl) {
    // 音频还在播放：不销毁，转为悬浮显示继续收听
    showFloatingAudioBar();
  } else {
    document.getElementById('musicPlayerStage').innerHTML = '';
  }
}
function renderMusicPlayerBody() {
  const links = getMusicLinksForTitle(musicPlayerSongTitle);
  const listWrap = document.getElementById('musicPlayerLinkList');
  const stage = document.getElementById('musicPlayerStage');
  const addChip = `<button class="music-link-add-chip" onclick="openMusicLinkAddForm()"><i class="ti ti-plus"></i>添加链接</button>`;
  if (!links.length) {
    listWrap.innerHTML = isAdmin ? addChip : '';
    stage.innerHTML = `<div class="music-player-empty"><i class="ti ti-music-off"></i>${isAdmin ? '这首诗歌还没有音乐链接，点击上方"添加链接"' : '这首诗歌暂无音乐链接'}</div>`;
    return;
  }
  if (!links.find(l => l.id === musicPlayerActiveId)) musicPlayerActiveId = links[0].id;
  listWrap.innerHTML = links.map(l => {
    const platform = detectMusicPlatform(l.url);
    const editBtn = isAdmin ? `<button class="music-link-chip-edit" onclick="event.stopPropagation();openMusicLinkEdit('${l.id}')" title="修改说明"><i class="ti ti-edit"></i></button>` : '';
    const delBtn = isAdmin ? `<button class="music-link-chip-del" onclick="event.stopPropagation();deleteMusicLink('${l.id}')" title="删除"><i class="ti ti-x"></i></button>` : '';
    return `<button class="music-link-chip${l.id === musicPlayerActiveId ? ' active' : ''}" onclick="selectMusicLink('${l.id}')">
      <i class="ti ${getMusicPlatformIcon(platform)}"></i><span>${escapeHtml(l.label || getMusicPlatformLabel(platform))}</span>${editBtn}${delBtn}
    </button>`;
  }).join('') + (isAdmin ? addChip : '');
  renderMusicStage();
}
function renderMusicStage() {
  const links = getMusicLinksForTitle(musicPlayerSongTitle);
  const link = links.find(l => l.id === musicPlayerActiveId);
  const stage = document.getElementById('musicPlayerStage');
  if (!link) { stage.innerHTML = ''; return; }
  const platform = detectMusicPlatform(link.url);
  const safeUrl = getSafeExternalUrl(link.url);
  if (platform === 'youtube') {
    const embed = getYoutubeEmbedSrc(link.url);
    stage.innerHTML = embed
      ? `<div class="music-player-embed-wrap"><iframe src="${embed}" title="${escapeHtml(musicPlayerSongTitle)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
      : `<div class="music-player-empty"><i class="ti ti-alert-circle"></i>无法解析该 YouTube 链接${safeUrl ? `<br><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">在新标签页打开</a>` : ''}</div>`;
  } else if (platform === 'audio') {
    if (safeUrl) {
      const audioEl = ensureGlobalAudioEl();
      audioEl.controls = true;
      audioEl.style.display = '';
      audioEl.loop = audioRepeatOne;
      stage.innerHTML = '';
      stage.appendChild(audioEl);
      stage.insertAdjacentHTML('beforeend', renderAudioToolsHtml());
      if (loadedAudioLinkId !== link.id) {
        audioEl.src = safeUrl;
        loadedAudioLinkId = link.id;
        audioEl.play().catch(() => {});
      }
    } else {
      loadedAudioLinkId = null;
      stage.innerHTML = `<div class="music-player-empty"><i class="ti ti-alert-circle"></i>音频链接无效</div>`;
    }
  } else {
    stage.innerHTML = `<div class="music-player-empty"><i class="ti ti-external-link"></i>该链接暂不支持内嵌播放${safeUrl ? `<br><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">在新标签页打开收听</a>` : ''}</div>`;
  }
}
function selectMusicLink(id) {
  musicPlayerActiveId = id;
  renderMusicPlayerBody();
}
function openMusicLinkAddForm() {
  document.getElementById('musicLinkAddLabel').value = '';
  document.getElementById('musicLinkAddUrl').value = '';
  document.getElementById('musicLinkAddError').classList.remove('show');
  document.getElementById('musicLinkAddForm').classList.add('show');
}
function closeMusicLinkAddForm() {
  const panel = document.getElementById('musicLinkAddForm');
  if (panel) panel.classList.remove('show');
}
async function submitMusicLinkAdd() {
  const title = musicPlayerSongTitle;
  if (!title) return;
  const label = document.getElementById('musicLinkAddLabel').value.trim();
  const url = normalizeExternalUrlInput(document.getElementById('musicLinkAddUrl').value.trim());
  const errEl = document.getElementById('musicLinkAddError');
  if (!url) {
    errEl.textContent = '请输入音乐链接';
    errEl.classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  const entry = ensureSongInLibrary(title, '');
  if (!entry) return;
  if (!Array.isArray(entry.music)) entry.music = [];
  const newLink = { id: genSongLibId(), label, url };
  entry.music.push(newLink);
  musicPlayerActiveId = newLink.id;
  persistSongLibrary();
  closeMusicLinkAddForm();
  renderMusicPlayerBody();
  renderSongLibraryGrid();
  showToast('✅ 已添加音乐链接');
  await syncSongLibraryToRemote();
}
async function deleteMusicLink(id) {
  const s = findSongLibEntryByTitle(musicPlayerSongTitle);
  if (!s) return;
  if (!confirm('确定要删除这个音乐链接吗？')) return;
  s.music = (s.music || []).filter(m => m.id !== id);
  persistSongLibrary();
  if (musicPlayerActiveId === id) musicPlayerActiveId = s.music[0]?.id || null;
  if (loadedAudioLinkId === id) {
    if (globalAudioEl) globalAudioEl.pause();
    loadedAudioLinkId = null;
    hideFloatingAudioBar();
  }
  renderMusicPlayerBody();
  renderSongLibraryGrid();
  showToast('已删除音乐链接');
  await syncSongLibraryToRemote();
}
// 修改某个音乐链接的说明文字（不改链接地址本身）
let musicLinkEditingId = null;
function openMusicLinkEdit(id) {
  const s = findSongLibEntryByTitle(musicPlayerSongTitle);
  const link = s?.music?.find(m => m.id === id);
  if (!link) return;
  musicLinkEditingId = id;
  document.getElementById('musicLinkEditLabelInput').value = link.label || '';
  document.getElementById('musicLinkEditOverlay').classList.add('open');
  setTimeout(() => document.getElementById('musicLinkEditLabelInput')?.focus(), 100);
}
function closeMusicLinkEdit(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('musicLinkEditOverlay').classList.remove('open');
  musicLinkEditingId = null;
}
async function submitMusicLinkEdit() {
  if (!musicLinkEditingId) return;
  const s = findSongLibEntryByTitle(musicPlayerSongTitle);
  const link = s?.music?.find(m => m.id === musicLinkEditingId);
  if (!link) return;
  link.label = document.getElementById('musicLinkEditLabelInput').value.trim();
  persistSongLibrary();
  closeMusicLinkEdit();
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar(); // 悬浮条上的说明文字同步刷新
  showToast('✅ 已更新链接说明');
  await syncSongLibraryToRemote();
}

let songLibLyricsEditing = false;
function renderSongLibLyrics(){
  const s = songLibDetailCurrent;
  const actionsEl = document.getElementById('songLibLyricsActions');
  const bodyEl = document.getElementById('songLibLyricsBody');
  if (!s || !actionsEl || !bodyEl) return;
  if (songLibLyricsEditing) {
    actionsEl.innerHTML = '';
    bodyEl.innerHTML = `<div class="song-lib-lyrics-edit">
      <textarea id="songLibLyricsTextarea" placeholder="逐行输入完整歌词…">${escapeHtml(s.lyrics)}</textarea>
      <div class="song-lib-lyrics-edit-actions">
        <button class="btn-cancel" onclick="cancelLyricsEdit()">取消</button>
        <button class="btn-save" onclick="saveLyricsEdit()">保存</button>
      </div>
    </div>`;
    return;
  }
  actionsEl.innerHTML = s.lyrics
    ? `<button class="song-lib-lyrics-link-btn" onclick="downloadCurrentSongLibLyrics()"><i class="ti ti-download"></i>下载歌词</button>
       <button class="song-lib-lyrics-link-btn" onclick="openLyricsEdit()"><i class="ti ti-edit"></i>编辑</button>`
    : `<button class="song-lib-lyrics-link-btn" onclick="openLyricsEdit()"><i class="ti ti-plus"></i>添加歌词</button>`;
  bodyEl.innerHTML = s.lyrics
    ? `<div class="song-lib-lyrics-preview">${escapeHtml(s.lyrics)}</div>`
    : `<div class="song-lib-lyrics-empty">还没有录入纯文字歌词，添加后即可一键下载不带任何涂鸦/标记的完整歌词</div>`;
}
function openLyricsEdit(){
  songLibLyricsEditing = true;
  renderSongLibLyrics();
  const ta = document.getElementById('songLibLyricsTextarea');
  if (ta) ta.focus();
}
function cancelLyricsEdit(){
  songLibLyricsEditing = false;
  if (songLibDetailCurrent) renderSongLibLyrics();
}
async function saveLyricsEdit(){
  const s = songLibDetailCurrent;
  if (!s) return;
  const ta = document.getElementById('songLibLyricsTextarea');
  s.lyrics = (ta?.value || '').trim();
  persistSongLibrary();
  songLibLyricsEditing = false;
  renderSongLibLyrics();
  showToast('✅ 歌词已保存');
  await syncSongLibraryToRemote();
}
function downloadCurrentSongLibLyrics(){
  const s = songLibDetailCurrent;
  if (!s || !s.lyrics) return;
  const content = `${s.title}\n\n${s.lyrics}\n`;
  downloadTextFile(content, `${sanitizeFileName(s.title)}-歌词.txt`);
}


// ── Weekly sermon passages ───────────────────────────
function initSermonThemeMarquees(root=document){
  root.querySelectorAll('.sermon-marquee').forEach(el=>{
    const text=el.dataset.text||'';
    if(!text) return;
    el.setAttribute('title', text);
    el.classList.remove('is-overflowing');
    el.style.removeProperty('--marquee-distance');
    el.innerHTML='';
    const plain=document.createElement('span');
    plain.className='sermon-marquee-text';
    plain.textContent=text;
    el.appendChild(plain);
    if(plain.scrollWidth<=el.clientWidth+4) return;
    const first=document.createElement('span');
    first.className='sermon-marquee-text';
    first.textContent=text;
    const gap=document.createElement('span');
    gap.className='sermon-marquee-gap';
    const second=document.createElement('span');
    second.className='sermon-marquee-text';
    second.textContent=text;
    const track=document.createElement('div');
    track.className='sermon-marquee-track';
    track.appendChild(first);
    track.appendChild(gap);
    track.appendChild(second);
    el.innerHTML='';
    el.appendChild(track);
    const distance=first.scrollWidth+gap.getBoundingClientRect().width;
    el.style.setProperty('--marquee-distance', `${distance}px`);
    el.classList.add('is-overflowing');
  });
}
function closeSermonThemeDetail(e){
  if(!e || e.target===document.getElementById('sermonThemeDetailOverlay')){
    document.getElementById('sermonThemeDetailOverlay').classList.remove('open');
  }
}
function handleSermonThemeKeydown(event, key){
  if(event.key==='Enter' || event.key===' '){
    event.preventDefault();
    openSermonThemeDetail(key);
  }
}
function openSermonThemeDetail(key){
  const theme=getSermonThemeForKey(key).trim();
  if(!theme) return;
  const preacher=getSermonForKey(key).trim() || '待补充';
  const items=getSermonPassagesForKey(key);
  const audioUrl=getSafeExternalUrl(getSermonAudioForKey(key).trim());
  const d=new Date(key+'T00:00:00');
  const dateLabel=`${d.getMonth()+1}月${d.getDate()}日（${getDateNavLabel(d)}）`;
  const passageHtml=items.length
    ? `<div class="sermon-theme-detail-block">
        <div class="sermon-theme-detail-label">证道经文</div>
        <div class="sermon-theme-detail-passage-list">
          ${items.map(item=>`<span class="sermon-theme-detail-passage-item"><i class="ti ti-book-2"></i>${escapeHtml(formatSermonPassageRef(item))}</span>`).join('')}
        </div>
      </div>`
    : '';
  const audioHtml=audioUrl
    ? `<div class="sermon-theme-detail-block">
        <div class="sermon-theme-detail-label">讲道音频</div>
        <div class="sermon-theme-detail-value"><a class="sermon-audio-link" href="${escapeHtml(audioUrl)}" target="_blank" rel="noopener noreferrer"><i class="ti ti-headphones"></i>打开讲道音频链接</a></div>
      </div>`
    : '';
  document.getElementById('sermonThemeDetailTitle').textContent='证道详情';
  document.getElementById('sermonThemeDetailDate').textContent=dateLabel;
  document.getElementById('sermonThemeDetailBody').innerHTML=`
    <div class="sermon-theme-detail-block">
      <div class="sermon-theme-detail-label">证道人</div>
      <div class="sermon-theme-detail-value">${escapeHtml(preacher)}</div>
    </div>
    <div class="sermon-theme-detail-block">
      <div class="sermon-theme-detail-label">证道主题</div>
      <div class="sermon-theme-detail-value"><strong>${escapeHtml(theme)}</strong></div>
    </div>
    ${passageHtml}
    ${audioHtml}
  `;
  document.getElementById('sermonThemeDetailOverlay').classList.add('open');
}
function renderSermonPassages(key){
  const sec=document.getElementById('sermonPassageSection');
  if(!sec) return;
  const sermonTitle=getRelativeWeekSectionTitle(selectedSunday,'证道');
  const items=getSermonPassagesForKey(key);
  const theme=getSermonThemeForKey(key).trim();
  const preacher=getSermonForKey(key);
  const passageSummary=items.length
    ? escapeHtml(formatSermonPassageRef(items[0])) + (items.length>1?` 等${items.length}处`:'')
    : '（暂未设置）';
  const compactRows=`<div class="sermon-compact-rows">
      <div class="sermon-compact-row"><span class="sermon-compact-label">讲题</span><span class="sermon-compact-value">${theme?escapeHtml(theme):'（暂未设置）'}</span></div>
      <div class="sermon-compact-row"><span class="sermon-compact-label">经文</span><span class="sermon-compact-value">${passageSummary}</span></div>
      <div class="sermon-compact-row"><span class="sermon-compact-label">证道</span><span class="sermon-compact-value">${escapeHtml(preacher)}</span></div>
    </div>`;
  sec.innerHTML=`
    <div class="sermon-passage-card">
      <div class="section-title-row">
        <div class="sermon-section-head-left">
          <div class="sermon-section-icon"><i class="ti ti-book-2"></i></div>
          <span class="section-ttl">${sermonTitle}</span>
        </div>
      </div>
      ${compactRows}
      <button class="sermon-detail-btn" onclick="openSermonDetail('${key}')"><i class="ti ti-list-details"></i>查看详情</button>
    </div>`;
}
function openSermonDetail(key){
  const sermonPassageTitle=getRelativeWeekSectionTitle(selectedSunday,'证道经文');
  const items=getSermonPassagesForKey(key);
  const theme=getSermonThemeForKey(key).trim();
  const preacher=getSermonForKey(key);
  const audioUrl=getSermonAudioForKey(key).trim();
  const notes=getSermonNotesForKey(key).trim();
  const safeAudioUrl=getSafeExternalUrl(audioUrl);
  const d=new Date(key+'T00:00:00');
  const dateLabel=`${d.getMonth()+1}月${d.getDate()}日（${getDateNavLabel(d)}）`;
  const editBtn=isAdmin?`<button class="sermon-compact-edit-btn" onclick="closeSermonDetail();openSermonPassageEditor('${key}')"><i class="ti ti-edit"></i>编辑</button>`:'';
  const previewHtml=items.length
    ? `<div class="sermon-block-label">证道经文</div>
       <div class="sermon-preview-list" id="sermonDetailPreviewList">
        <div class="bible-loading">正在加载经文...</div>
      </div>`
    : `<div class="sermon-preview-empty"><i class="ti ti-book-off"></i>${sermonPassageTitle}尚未设置</div>`;
  const audioHtml=`<div class="sermon-extra-card">
      <div class="sermon-extra-label">讲道音频链接</div>
      ${safeAudioUrl
        ? `<a class="sermon-audio-link" href="${escapeHtml(safeAudioUrl)}" target="_blank" rel="noopener noreferrer"><i class="ti ti-headphones"></i>讲道音频链接</a>`
        : `<div class="sermon-extra-empty">${audioUrl ? '音频链接格式无效，请重新设置' : '暂未添加讲道音频链接'}</div>`}
    </div>`;
  const noteHtml=`<div class="sermon-extra-card">
      <div class="sermon-extra-label">讲道笔记</div>
      <textarea class="sermon-note-editor" id="sermonNotesEditor" placeholder="写下本周讲道笔记，内容只会保存在当前浏览器缓存中" oninput="queueSermonNotesSave('${key}')" onblur="flushSermonNotesSave('${key}')">${escapeHtml(notes)}</textarea>
      <div class="sermon-note-footer">
        <span class="sermon-note-hint">无需登录，自动保存到当前设备浏览器缓存</span>
        <span class="sermon-note-saved${notes.trim() ? ' show' : ''}" id="sermonNotesSaved">${notes.trim() ? '已保存到本地缓存' : ''}</span>
      </div>
    </div>`;
  document.getElementById('sermonDetailTitle').textContent='证道详情';
  document.getElementById('sermonDetailDate').textContent=dateLabel;
  document.getElementById('sermonDetailBody').innerHTML=`
    ${editBtn}
    ${previewHtml}
    ${audioHtml}
    ${noteHtml}
  `;
  document.getElementById('sermonDetailOverlay').classList.add('open');
  if(items.length) hydrateSermonPassagePreview(key, items);
}
function closeSermonDetail(e){
  if(!e || e.target===document.getElementById('sermonDetailOverlay')){
    document.getElementById('sermonDetailOverlay').classList.remove('open');
  }
}
async function hydrateSermonPassagePreview(key, items){
  const container=document.getElementById('sermonDetailPreviewList');
  if(!container) return;
  try{
    await loadBibleFile(currentBibleVersion);
    const index=bibleIndexCache[currentBibleVersion]||{};
    if(!document.getElementById('sermonDetailPreviewList')) return;
    container.innerHTML=items.map(item=>{
      const ref=formatSermonPassageRef(item);
      const verses=(index[`${item.bookAbbr.toUpperCase()}_${item.chapter}`]||[])
        .filter(v=>v.verse>=(Number(item.verseStart)||1)&&v.verse<=(Number(item.verseEnd)||Number(item.verseStart)||1));
      const preview=verses.length
        ? verses.map(v=>`<span style="color:var(--primary);font-weight:600;margin-right:4px">${v.verse}</span>${escapeHtml(v.text)}`).join(' ')
        : '未找到经文内容';
      return `<div class="sermon-preview-item" id="sermonPreviewItem-${key}-${item.bookAbbr}-${item.chapter}-${item.verseStart}-${item.verseEnd}" onclick="toggleSermonPreviewItem(this)">
        <div class="sermon-preview-head">
          <div class="sermon-preview-ref">${ref}</div>
          <div class="sermon-preview-tip">点击展开<i class="ti ti-chevron-down"></i></div>
        </div>
        <div class="sermon-preview-text-wrap">
          <div class="sermon-preview-text">${preview}</div>
          <div class="sermon-preview-actions">
            <button class="sermon-preview-link" onclick="event.stopPropagation();jumpToBibleLocation('${item.bookAbbr}',${item.chapter})"><i class="ti ti-arrow-right"></i>跳转圣经</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }catch(err){
    if(document.getElementById('sermonDetailPreviewList')){
      if(isBibleSourceUnavailable(currentBibleVersion)){
        container.innerHTML='<div class="sermon-preview-empty"><i class="ti ti-book-off"></i>当前目录未放入圣经文本文件，暂时无法显示经文预览</div>';
      }else{
        console.error(err);
        container.innerHTML='<div class="sermon-preview-empty"><i class="ti ti-alert-circle"></i>经文预览加载失败</div>';
      }
    }
  }
}
function toggleSermonPreviewItem(el){
  if(!el) return;
  el.classList.toggle('open');
}
function openSermonPassageEditor(key){
  if(!isAdmin) return;
  sermonPassageEditKey=key;
  sermonPassageDraft=JSON.parse(JSON.stringify(getSermonPassagesForKey(key)));
  sermonThemeDraft=getSermonThemeForKey(key);
  sermonAudioDraft=getSermonAudioForKey(key);
  const d=new Date(key+'T00:00:00');
  document.getElementById('sermonPassageSub').textContent=`${d.getMonth()+1}月${d.getDate()}日（${getDateNavLabel(d)}）`;
  document.getElementById('sermonThemeInput').value=sermonThemeDraft;
  document.getElementById('sermonAudioInput').value=sermonAudioDraft;
  renderSermonPassageDraftList();
  setSermonDraftTestament(currentTestament||'ot');
  document.getElementById('sermonPassageOverlay').classList.add('open');
}
function closeSermonPassageEditor(e){
  if(!e || e.target===document.getElementById('sermonPassageOverlay')){
    document.getElementById('sermonPassageOverlay').classList.remove('open');
  }
}
function renderSermonPassageDraftList(){
  const list=document.getElementById('sermonPassageList');
  if(!list) return;
  if(!sermonPassageDraft.length){
    list.innerHTML='<div style="color:#bbb;font-size:13px;text-align:center;padding:8px 0">尚未添加证道经文</div>';
    return;
  }
  list.innerHTML=sermonPassageDraft.map((item,idx)=>`
    <div class="sermon-editor-row">
      <div class="sermon-editor-icon"><i class="ti ti-book-2"></i></div>
      <div class="sermon-editor-main">
        <div class="sermon-editor-name">${formatSermonPassageRef(item)}</div>
        <div class="sermon-editor-sub">支持一周添加多段经文，保存后将显示在本周页面</div>
      </div>
      <button class="remove-song-btn" onclick="removeSermonPassageDraft(${idx})"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}
function removeSermonPassageDraft(idx){
  sermonPassageDraft.splice(idx,1);
  renderSermonPassageDraftList();
}
function setSermonDraftTestament(testament){
  sermonDraftTestament=testament;
  document.getElementById('sermonTestamentBtnOT').classList.toggle('active',testament==='ot');
  document.getElementById('sermonTestamentBtnNT').classList.toggle('active',testament==='nt');
  const bookSel=document.getElementById('sermonDraftBook');
  if(!bookSel) return;
  const books=testament==='nt'?BIBLE_BOOKS.slice(NT_START_INDEX):BIBLE_BOOKS.slice(0,NT_START_INDEX);
  bookSel.innerHTML=books.map(b=>`<option value="${b.abbr}">${b.name}</option>`).join('');
  bookSel.value=books[0]?.abbr||'gen';
  updateSermonDraftChapterOptions();
}
function updateSermonDraftChapterOptions(preferredChapter){
  const book=getBibleBookByAbbr(document.getElementById('sermonDraftBook')?.value)||BIBLE_BOOKS[0];
  const chapterSel=document.getElementById('sermonDraftChapter');
  if(!chapterSel) return;
  const current=preferredChapter||parseInt(chapterSel.value,10)||1;
  chapterSel.innerHTML=Array.from({length:book.chapters},(_,i)=>`<option value="${i+1}">第${i+1}章</option>`).join('');
  chapterSel.value=String(Math.min(current,book.chapters));
  updateSermonDraftVerseOptions();
}
async function updateSermonDraftVerseOptions(preferredStart, preferredEnd){
  const bookAbbr=document.getElementById('sermonDraftBook')?.value||'gen';
  const chapter=Number(document.getElementById('sermonDraftChapter')?.value||1);
  const startSel=document.getElementById('sermonDraftVerseStart');
  const endSel=document.getElementById('sermonDraftVerseEnd');
  if(!startSel||!endSel) return;
  let verseCount=1;
  try{
    await loadBibleFile(currentBibleVersion);
    const index=bibleIndexCache[currentBibleVersion]||{};
    const verses=index[`${bookAbbr.toUpperCase()}_${chapter}`]||[];
    verseCount=Math.max(verses.length,1);
  }catch(e){}
  const options=Array.from({length:verseCount},(_,i)=>`<option value="${i+1}">${i+1}节</option>`).join('');
  startSel.innerHTML=options;
  const start=Math.min(Number(preferredStart)||Number(startSel.value)||1,verseCount);
  startSel.value=String(start);
  startSel.dataset.totalVerses = String(verseCount);
  updateSermonDraftEndVerseOptions(preferredEnd);
}
function updateSermonDraftEndVerseOptions(preferredEnd){
  const startSel=document.getElementById('sermonDraftVerseStart');
  const endSel=document.getElementById('sermonDraftVerseEnd');
  if(!startSel||!endSel) return;
  const start=Number(startSel.value)||1;
  const verseCount=Math.max(Number(startSel.dataset.totalVerses)||start, start);
  const currentEnd=Number(preferredEnd)||Number(endSel.value)||start;
  endSel.innerHTML=Array.from({length:verseCount-start+1},(_,i)=>`<option value="${start+i}">${start+i}节</option>`).join('');
  const end=Math.max(start,Math.min(currentEnd,verseCount));
  endSel.value=String(end);
}
function syncSermonDraftVerseRange(){
  updateSermonDraftEndVerseOptions();
}
function addSermonPassageDraft(){
  const bookAbbr=document.getElementById('sermonDraftBook')?.value;
  const chapter=Number(document.getElementById('sermonDraftChapter')?.value||1);
  const verseStart=Number(document.getElementById('sermonDraftVerseStart')?.value||1);
  const verseEnd=Math.max(verseStart,Number(document.getElementById('sermonDraftVerseEnd')?.value||verseStart));
  if(!bookAbbr){ showToast('请先选择书卷'); return; }
  sermonPassageDraft.push({ bookAbbr, chapter, verseStart, verseEnd });
  renderSermonPassageDraftList();
  showToast('已添加证道经文');
}
function saveSermonPassages(){
  if(!sermonPassageEditKey) return;
  sermonThemeDraft=document.getElementById('sermonThemeInput')?.value.trim()||'';
  sermonAudioDraft=normalizeExternalUrlInput(document.getElementById('sermonAudioInput')?.value.trim()||'');
  if(sermonPassageDraft.length) sermonPassagesByDate[sermonPassageEditKey]=JSON.parse(JSON.stringify(sermonPassageDraft));
  else delete sermonPassagesByDate[sermonPassageEditKey];
  if(sermonThemeDraft) sermonThemesByDate[sermonPassageEditKey]=sermonThemeDraft;
  else delete sermonThemesByDate[sermonPassageEditKey];
  if(sermonAudioDraft) sermonAudioByDate[sermonPassageEditKey]=sermonAudioDraft;
  else delete sermonAudioByDate[sermonPassageEditKey];
  persistSermonPassages();
  persistSermonThemes();
  persistSermonAudio();
  closeSermonPassageEditor();
  render();
  showToast('✅ 证道内容已保存');
}
function jumpToBibleLocation(bookAbbr, chapter){
  openBiblePage();
  const targetTestament = isNewTestamentBook(bookAbbr) ? 'nt' : 'ot';
  if(targetTestament !== currentTestament) setTestamentFilter(targetTestament, true);
  const bookSel = document.getElementById('bibleBookSelect');
  if (bookSel) { bookSel.value = bookAbbr; updateBibleChapterOptions(chapter); }
  loadBibleChapter();
}
// ── Bible standalone page (entry: floating button) ────
function openBiblePage(){
  document.getElementById('biblePageOverlay').classList.add('open');
}
function closeBiblePage(){
  document.getElementById('biblePageOverlay').classList.remove('open');
}

// ── Render shifts (list or card view) ────────────────
function renderShifts(key){
  const shifts=scheduleData[key]||[];
  const list=document.getElementById('shiftList'); list.innerHTML='';
  if(!shifts.length){ list.innerHTML=`<div class="empty-state"><i class="ti ti-calendar-off"></i>本月暂未排班</div>`; return; }

  if(viewMode==='card'){
    const wrap=document.createElement('div'); wrap.className='card-view-list';
    shifts.forEach(s=>{
      const col=roleColors[s.role]||{bg:'#f0f0ee',text:'#444',badgeBg:'#888',badgeText:'#fff',icon:'ti-user'};
      const ec=isAdmin?' editable':'';
      const leaveSet=new Set(Array.isArray(s.leavePersons)?s.leavePersons:[]);
      const chips=s.persons.map(p=>{
        const onLeave=leaveSet.has(p);
        return `<span class="cvi-chip${onLeave?' cvi-chip-leave':''}">${escapeHtml(p)}${onLeave?'<i class="ti ti-calendar-off cvi-chip-leave-icon" title="已请假"></i>':''}</span>`;
      }).join('');
      const item=document.createElement('div');
      item.className=`card-view-item${ec}`;
      item.style.cssText=`background:${col.bg};color:${col.text}`;
      if(isAdmin) item.setAttribute('onclick',`openEditDrawer('${s.role}','${key}')`);
      item.innerHTML=`
        <button class="cvi-edit-btn" onclick="event.stopPropagation();openEditDrawer('${s.role}','${key}')">✎ 编辑</button>
        <div class="cvi-header">
          <div class="cvi-icon"><i class="ti ${col.icon}" style="color:${col.text}"></i></div>
          <span class="cvi-role">${s.role}</span>
        </div>
        <div class="cvi-chips">${chips}</div>`;
      wrap.appendChild(item);
    });
    list.appendChild(wrap);
  } else {
    shifts.forEach((s,i)=>{
      const isFirst=i===0;
      const col=roleColors[s.role]||{bg:'#ddd',text:'#444',badgeBg:'#888',badgeText:'#fff',icon:'ti-user'};
      const row=document.createElement('div'); row.className='role-row';
      const leaveSet=new Set(Array.isArray(s.leavePersons)?s.leavePersons:[]);
      const personsHtml=s.persons.map(p=>{
        const ab=isFirst?'rgba(255,255,255,0.28)':col.bg, at=isFirst?'#fff':col.text;
        const onLeave=leaveSet.has(p);
        const leaveTag=onLeave?'<span class="person-leave-tag"><i class="ti ti-calendar-off"></i>请假</span>':'';
        return `<div class="person${onLeave?' person-on-leave':''}"><div class="avatar" style="background:${ab};color:${at}">${getInitials(p)}</div><span class="person-name">${escapeHtml(p)}</span>${leaveTag}</div>`;
      }).join('');
      const ec=isAdmin?' editable':'';
      const ea=isAdmin?`title="点击修改" onclick="openEditDrawer('${s.role}','${key}')"`:'';
      const mb=isAdmin?`<button class="more-btn" onclick="event.stopPropagation();openEditDrawer('${s.role}','${key}')">✎</button>`:`<button class="more-btn">···</button>`;
      row.innerHTML=`
        <div class="role-label"><div class="role-badge" style="background:${col.badgeBg}"><i class="ti ${col.icon} role-icon" style="color:${col.badgeText}"></i><span class="role-text" style="color:${col.badgeText}">${s.role}</span></div></div>
        <div class="shift-card${ec} ${isFirst?'active-card':''}" ${ea}>${mb}<div class="shift-name">${s.name}</div><div class="persons">${personsHtml}</div></div>`;
      list.appendChild(row);
    });
  }
}
function render(){
  const d=selectedSunday, year=d.getFullYear(), month=d.getMonth();
  const sundays=getAllScheduleDatesOfMonth(year,month);
  const now=new Date();
  const zhWeek=['主日','周一','周二','周三','周四','周五','周六'];
  document.getElementById('hdrDay').textContent=headerCollapsed ? ZH_MONTHS[month]+'月份' : `${now.getMonth()+1}月${now.getDate()}日`;
  const wt=document.getElementById('hdrWeekdayTag'); if(wt) wt.textContent = zhWeek[now.getDay()];
  document.getElementById('hdrInfo').textContent=getSundayCountdownLabel();
  document.getElementById('hdrMini').textContent='敬拜排班表';
  const wl=document.getElementById('todayBtn');
  if(wl) wl.textContent=getRelativeWeekLabel(new Date(d));
  const lbl=document.getElementById('cardDateLabel');
  if(lbl) lbl.innerHTML=`${month+1}月${d.getDate()}日&nbsp;<span>${getDateNavLabel(d)}</span>`;
  const scheduleLabel=document.getElementById('scheduleSectionLabel');
  if(scheduleLabel) scheduleLabel.textContent=getRelativeWeekSectionTitle(d,'排班');
  // 日期导航条：本月所有主日 + 本月所有特别聚会日期，按日期先后排列
  const nav=document.getElementById('sundayNav'); nav.innerHTML='';
  sundays.forEach(s=>{
    const a=s.toDateString()===d.toDateString();
    const isCustom=s.getDay()!==0;
    const p=document.createElement('div');
    p.className='sunday-pill'+(a?' active':'')+(isCustom?' custom-date':'');
    const delBtn=(isCustom&&isAdmin)?`<button class="s-del-btn" onclick="event.stopPropagation();removeCustomEventDate('${toKey(s)}')" title="删除这个日期"><i class="ti ti-x"></i></button>`:'';
    p.innerHTML=`<span class="s-num">${s.getDate()}</span><span class="s-label">${getDateNavLabel(s)}</span>${a?'<span class="s-dot"></span>':''}${delBtn}`;
    p.onclick=()=>{selectedSunday=s;render();};
    nav.appendChild(p);
  });
  if(isAdmin){
    const addBtn=document.createElement('button');
    addBtn.className='sunday-pill-add';
    addBtn.title='添加特别聚会日期';
    addBtn.innerHTML='<i class="ti ti-plus"></i>';
    addBtn.onclick=(e)=>{ e.stopPropagation(); addCustomEventDate(); };
    nav.appendChild(addBtn);
  }
  const key=toKey(d);
  renderNotice(key);
  renderSermonPassages(key);
  updateBackToTodayFab();

  // Inject bible card into #bibleSection once
  const bibleSec=document.getElementById('bibleSection');
  if(bibleSec && !bibleSec.hasChildNodes()){
    bibleSec.innerHTML=`
      <div class="bible-search-card" id="bibleCard">
        <div class="bible-body">
          <div class="bible-progress-row" id="bibleProgressRow"></div>

          <div class="bible-selectors">
            <div class="bible-version-row">
              <select class="bible-select" id="bibleVersionSelect" onchange="onBibleVersionChange()"></select>
            </div>
            <div class="testament-toggle">
              <button class="testament-btn active" id="testamentBtnOT" onclick="setTestamentFilter('ot')">旧约</button>
              <button class="testament-btn" id="testamentBtnNT" onclick="setTestamentFilter('nt')">新约</button>
            </div>
            <div class="bible-book-chapter-row">
              <select class="bible-select" id="bibleBookSelect" onchange="updateBibleChapterOptions()"></select>
              <select class="bible-select bible-chapter-select" id="bibleChapterSelect" onchange="loadBibleChapter()"></select>
            </div>
          </div>

          <div class="bible-toolbar">
            <div class="bible-nav-group">
              <button class="bible-nav-btn" id="bibleChapPrev" onclick="stepBibleChapter(-1)" title="上一章"><i class="ti ti-chevron-left"></i></button>
              <span class="bible-nav-label" id="bibleNavLabel"></span>
              <button class="bible-nav-btn" id="bibleChapNext" onclick="stepBibleChapter(1)" title="下一章"><i class="ti ti-chevron-right"></i></button>
            </div>
            <div class="bible-tool-row">
              <button class="bible-search-btn" onclick="loadBibleChapter()"><i class="ti ti-book"></i>读取本章</button>
            </div>
            <div class="bible-tool-group">
              <div class="tool-icons-left">
                <button class="bible-tool-btn" id="bibleFontBtn" onclick="toggleFontPopover(event)" title="字体大小"><i class="ti ti-text-size"></i></button>
                <button class="bible-tool-btn" onclick="openBibleFullscreen()" title="全屏阅读"><i class="ti ti-maximize"></i></button>
              </div>
              <button class="bible-tool-btn bookmarks-entry-btn" onclick="openBookmarks()" title="经文收藏"><i class="ti ti-star"></i>收藏</button>
            </div>
          </div>

          <div class="bible-result-list" id="bibleResultList"></div>
          <div class="bible-source-link" id="bibleSourceLink"></div>
        </div>
      </div>`;
    initBibleSelectors();
  }

  renderSongs(key);
  renderShifts(key);
  renderDesktopPanels(key);
  const ab=document.getElementById('addShiftBtn'); if(ab) ab.style.display=isAdmin?'flex':'none';
  updateAdminUI();
}

// ── Search ────────────────────────────────────────────
function openSearchModal(){
  document.getElementById('searchInput').value='';
  document.getElementById('searchClear').classList.remove('visible');
  document.getElementById('searchResultPanel').classList.remove('visible');
  const hint=document.getElementById('searchModalHint');
  if(hint) hint.classList.remove('hidden');
  document.getElementById('searchOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('searchInput').focus(), 260);
}
function closeSearchModal(e){
  if(e && e.target!==e.currentTarget) return;
  document.getElementById('searchOverlay').classList.remove('open');
}
function onSearch(){
  const q=document.getElementById('searchInput').value.trim();
  const panel=document.getElementById('searchResultPanel');
  const hint=document.getElementById('searchModalHint');
  document.getElementById('searchClear').classList.toggle('visible',q.length>0);
  if(!q){ panel.classList.remove('visible'); if(hint) hint.classList.remove('hidden'); return; }
  if(hint) hint.classList.add('hidden');
  panel.classList.add('visible');
  renderSearchResults(q);
}
function clearSearch(){ document.getElementById('searchInput').value=''; onSearch(); document.getElementById('searchInput').focus(); }
function renderSearchResults(q){
  const list=document.getElementById('searchResultList'), title=document.getElementById('searchResultTitle');
  const d=selectedSunday, prefix=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-`;
  const results=[];
  Object.entries(scheduleData).forEach(([key,shifts])=>{
    if(!key.startsWith(prefix)) return;
    shifts.forEach(s=>{ if(s.persons.some(p=>p.includes(q))){ const[,m,dd]=key.split('-'); results.push({key,dateLabel:`${parseInt(m)}月${parseInt(dd)}日（周日）`,role:s.role,shiftName:s.name,team:s.persons.join(' / ')}); }});
  });
  const ms=`${d.getFullYear()}年${d.getMonth()+1}月`;
  title.innerHTML=results.length?`<strong>${q}</strong> 在 ${ms} 共 <strong>${results.length}</strong> 条排班`:`${ms} 未找到 <strong>${q}</strong>`;
  if(!results.length){ list.innerHTML=`<div class="result-empty"><i class="ti ti-mood-empty"></i>本月暂无该人员的排班</div>`; return; }
  const grouped={};
  results.forEach(r=>{ if(!grouped[r.key]) grouped[r.key]={label:r.dateLabel,items:[]}; grouped[r.key].items.push(r); });
  list.innerHTML=Object.entries(grouped).map(([,g])=>`
    <div class="result-date-group"><div class="result-date-label">${g.label}</div>
    ${g.items.map(r=>{ const c=roleColors[r.role]||{badgeBg:'#888',badgeText:'#fff',icon:'ti-user'}; return `<div class="result-item"><div class="result-role-badge" style="background:${c.badgeBg}"><i class="ti ${c.icon}" style="color:${c.badgeText}"></i><span style="color:${c.badgeText}">${r.role}</span></div><div class="result-info"><div class="result-name">${r.shiftName}</div><div class="result-team">${r.team}</div></div></div>`; }).join('')}
    </div>`).join('');
}

// ── Admin edit ────────────────────────────────────────
const DEFAULT_ALL_PEOPLE={
  '主领':['根英','佳欣','丽娜','张荣','嘉乐','美美','雨婷','林上恩','慧慧'],
  '伴唱':['曼茹','建蝉','张荣','小小','加恩','嘉乐','婷婷','Irene','安娜','雨婷','富雄','根英'],
  '键盘':['慧慧','雨婷','孙望','叶合均','美美','玲晓'],
  '吉他':['佳欣','嘉乐','智博','周周'],
  '贝斯':['诗诗','Isaac'],
  '鼓':['周阳','Isaac','Irene'],
  '教歌':['张荣','美美','慧慧','根英'],
};
Object.keys(DEFAULT_ALL_PEOPLE).forEach(k=>{ DEFAULT_ALL_PEOPLE[k]=[...new Set(DEFAULT_ALL_PEOPLE[k])]; });
const ROLES=['主领','伴唱','键盘','吉他','贝斯','鼓','教歌'];
let editMode=null,editKey=null,editRole=null,editSelections={},customPeople={};

function uniqPeople(list){
  const seen = new Set(), next = [];
  (Array.isArray(list) ? list : []).forEach(item => {
    const name = String(item || '').trim();
    if(!name || seen.has(name)) return;
    seen.add(name);
    next.push(name);
  });
  return next;
}
function createEmptyPeopleByRole(){
  const next = {};
  ROLES.forEach(role => { next[role] = []; });
  return next;
}
// Tracks people explicitly deleted by admin — persisted inside rotationConfig
function ensureRemovedPeople(){
  if(!rotationConfig.removedPeople || typeof rotationConfig.removedPeople !== 'object')
    rotationConfig.removedPeople = {};
  ROLES.forEach(r => { if(!Array.isArray(rotationConfig.removedPeople[r])) rotationConfig.removedPeople[r] = []; });
  return rotationConfig.removedPeople;
}
function isPersonRemoved(role, name){
  return (ensureRemovedPeople()[role] || []).includes(name);
}
function markPersonRemoved(role, name){
  const removed = ensureRemovedPeople();
  if(!removed[role].includes(name)) removed[role].push(name);
}
function unmarkPersonRemoved(role, name){
  const removed = ensureRemovedPeople();
  removed[role] = removed[role].filter(n => n !== name);
}

function normalizePeopleByRole(raw){
  const next = createEmptyPeopleByRole();
  if(raw && typeof raw === 'object'){
    Object.entries(raw).forEach(([role, people]) => {
      if(!ROLES.includes(role) || !Array.isArray(people)) return;
      next[role] = uniqPeople(people);
    });
  }
  return next;
}
// Seed DEFAULT_ALL_PEOPLE into peopleByRole only when the library is completely empty
// (first-time init). Called once at bootstrap.
function seedDefaultPeopleIfEmpty(){
  const lib = ensureRotationPeopleLibrary();
  const removed = ensureRemovedPeople();
  const isEmpty = ROLES.every(r => !(lib[r] || []).length);
  if(isEmpty){
    ROLES.forEach(role => {
      lib[role] = uniqPeople((DEFAULT_ALL_PEOPLE[role] || []).filter(n => !(removed[role]||[]).includes(n)));
    });
  }
}
function ensureRotationPeopleLibrary(){
  rotationConfig.peopleByRole = normalizePeopleByRole(rotationConfig.peopleByRole);
  return rotationConfig.peopleByRole;
}
function getPersistedRolePeople(role){
  return ensureRotationPeopleLibrary()[role] || [];
}
function collectScheduledRolePeople(role){
  const removed = ensureRemovedPeople()[role] || [];
  const names = [];
  Object.values(scheduleData || {}).forEach(rows => {
    (Array.isArray(rows) ? rows : []).forEach(row => {
      if(row?.role === role && Array.isArray(row.persons))
        names.push(...row.persons.filter(n => !removed.includes(n)));
    });
  });
  return uniqPeople(names);
}
function getRolePeople(role, extras=[]){
  const removed = ensureRemovedPeople()[role] || [];
  return uniqPeople([
    ...getPersistedRolePeople(role),
    ...collectScheduledRolePeople(role),
    ...(Array.isArray(extras) ? extras : []),
  ]).filter(n => !removed.includes(n));
}
function addRolePeopleToLibrary(role, names){
  const incoming = Array.isArray(names) ? names : [names];
  const lib = ensureRotationPeopleLibrary();
  const before = lib[role] || [];
  const after = uniqPeople([...before, ...incoming]);
  const changed = before.length !== after.length || before.some((name, idx) => name !== after[idx]);
  lib[role] = after;
  return changed;
}
function removeRolePersonFromLibrary(role, name){
  const lib = ensureRotationPeopleLibrary();
  const before = lib[role] || [];
  const after = before.filter(item => item !== name);
  const changed = before.length !== after.length;
  lib[role] = after;
  markPersonRemoved(role, name);  // blacklist so they don't reappear from scheduleData
  return changed;
}
function addRolePersonBackToLibrary(role, name){
  // When re-adding a previously removed person, clear blacklist entry
  unmarkPersonRemoved(role, name);
  addRolePeopleToLibrary(role, [name]);
}function decodeInlineValue(val){
  try { return decodeURIComponent(val); } catch(e) { return val; }
}
function togglePersonByCode(roleCode,nameCode){
  togglePerson(decodeInlineValue(roleCode), decodeInlineValue(nameCode));
}
function removePersonByCode(roleCode,nameCode){
  removePerson(decodeInlineValue(roleCode), decodeInlineValue(nameCode));
}

function openAddDrawer(){ if(!isAdmin)return; editMode='add'; editKey=toKey(selectedSunday); editRole=null; editSelections={}; customPeople={};
  const ex=scheduleData[editKey]||[];
  ROLES.forEach(r=>{ const f=ex.find(s=>s.role===r); editSelections[r]=new Set(f?f.persons:[]); customPeople[r]=[]; });
  renderEditDrawer(); document.getElementById('editOverlay').classList.add('open'); }
function openEditDrawer(role,key){ if(!isAdmin)return; editMode='edit'; editKey=key; editRole=role; editSelections={}; customPeople={};
  const f=(scheduleData[key]||[]).find(s=>s.role===role);
  editSelections[role]=new Set(f?f.persons:[]); customPeople[role]=[];
  renderEditDrawer(); document.getElementById('editOverlay').classList.add('open'); }
function closeEdit(e){ if(!e||e.target===document.getElementById('editOverlay')) document.getElementById('editOverlay').classList.remove('open'); }

function renderEditDrawer(){
  const d=selectedSunday, roles=editMode==='edit'?[editRole]:ROLES;
  document.getElementById('editDrawerTitle').textContent=editMode==='edit'?`修改「${editRole}」安排`:'新增排班';
  document.getElementById('editDrawerSub').textContent=`${d.getMonth()+1}月${d.getDate()}日（${getDateNavLabel(d)}）`;
  const c=document.getElementById('editRoleSections'); c.innerHTML='';
  roles.forEach(role=>{
    const col=roleColors[role]||{badgeBg:'#888',badgeText:'#fff',icon:'ti-user'};
    const sel=editSelections[role]||new Set();
    const custom=customPeople[role]||[];
    const all=getRolePeople(role, custom);
    const sec=document.createElement('div'); sec.className='role-section';
    const chips=all.map(p=>{
      const roleCode=encodeURIComponent(role), nameCode=encodeURIComponent(p);
      return `<button class="person-chip ${sel.has(p)?'selected':''} custom-chip" onclick="togglePersonByCode('${roleCode}','${nameCode}')">
        <i class="ti ti-check chip-check"></i>${escapeHtml(p)}<span class="chip-remove" onclick="event.stopPropagation();removePersonByCode('${roleCode}','${nameCode}')">×</span></button>`;
    }).join('');
    sec.innerHTML=`
      <div class="role-section-head"><div class="role-section-badge" style="background:${col.badgeBg}"><i class="ti ${col.icon}" style="color:${col.badgeText}"></i><span style="color:${col.badgeText}">${role}</span></div></div>
      <div class="people-grid" id="grid-${role}">${chips}</div>
      <div class="add-person-row">
        <input class="add-person-input" id="inp-${role}" placeholder="手动输入人名" onkeydown="if(event.key==='Enter')addCustomPerson('${role}')">
        <button class="add-person-btn" onclick="addCustomPerson('${role}')">添加</button>
      </div>`;
    c.appendChild(sec);
  });
}
function findPersonConflictRole(role,name){
  if(role==='教歌') return null;
  // 1) 检查本次编辑会话中其他岗位（新增排班时可能同时编辑多个岗位）
  for(const r in editSelections){
    if(r===role || r==='教歌') continue;
    if(editSelections[r] && editSelections[r].has(name)) return r;
  }
  // 2) 检查该主日已保存但本次未在编辑范围内的其他岗位（单岗位修改场景）
  const existing=scheduleData[editKey]||[];
  for(const item of existing){
    if(item.role===role || item.role==='教歌') continue;
    if(editMode==='edit' && item.role===editRole) continue; // 已被上面的 editSelections 覆盖
    if(item.persons && item.persons.includes(name)) return item.role;
  }
  return null;
}
function togglePerson(role,name){
  if(!editSelections[role]) editSelections[role]=new Set();
  const sel=editSelections[role];
  if(sel.has(name)){
    sel.delete(name);
  } else {
    sel.add(name);
    const conflictRole=findPersonConflictRole(role,name);
    if(conflictRole) showToast(`⚠️ ${name} 本周已在「${conflictRole}」岗位，请确认是否重复安排`, 3500);
  }
  document.querySelectorAll(`#grid-${role} .person-chip`).forEach(btn=>{
    const n=btn.textContent.replace('×','').trim(); btn.classList.toggle('selected',sel.has(n));
  });
}
function addCustomPerson(role){
  const inp=document.getElementById(`inp-${role}`);
  const name=inp.value.trim(); if(!name) return;
  if(!customPeople[role]) customPeople[role]=[];
  unmarkPersonRemoved(role, name);  // allow re-adding previously deleted people
  addRolePeopleToLibrary(role, name);
  if(!customPeople[role].includes(name)) customPeople[role].push(name);
  if(!editSelections[role]) editSelections[role]=new Set();
  editSelections[role].add(name); inp.value=''; renderEditDrawer();
}
function removePerson(role,name){
  if(!confirm(`确定要从「${role}」名单中删除「${name}」吗？\n\n删除后该人员将不再出现在排班选择列表中。`)) return;
  const idx=(customPeople[role]||[]).indexOf(name);
  if(idx>-1) customPeople[role].splice(idx,1);
  removeRolePersonFromLibrary(role, name);
  if(editSelections[role]) editSelections[role].delete(name);
  renderEditDrawer();
}
function saveEdit(){
  const key=editKey;
  if(!scheduleData[key]) scheduleData[key]=[];
  const roles=editMode==='edit'?[editRole]:ROLES;
  roles.forEach(role=>{
    const persons=[...(editSelections[role]||[])];
    addRolePeopleToLibrary(role, persons);
    if(!persons.length){ scheduleData[key]=scheduleData[key].filter(s=>s.role!==role); return; }
    const ex=scheduleData[key].find(s=>s.role===role);
    if(ex){ex.persons=persons;ex.name=persons.join('/');}
    else scheduleData[key].push({role,name:persons.join('/'),persons,leavePersons:[]});
  });
  scheduleData[key].sort((a,b)=>ROLES.indexOf(a.role)-ROLES.indexOf(b.role));
  if(!scheduleData[key].length) delete scheduleData[key];
  closeEdit(); render();
}

// ── Export ────────────────────────────────────────────
// 共用的表格绘制逻辑：给定要导出的主日 key 数组、标题、副标题、文件名，画到 canvas 上并下载。
// doExport（本周/本月）和 doExportCustom（自定义日期范围+自定义标题）都复用这一份代码，
// 避免以后改样式要改两处。
function renderExportTable(keys, titleStr, subStr, filename){
  const dpr=window.devicePixelRatio||1;
  const padX=10, padY=8;
  const cols=keys.length;
  const totalCols=cols+1;
  const minColW=110;
  const W=Math.max(760, padX*2+totalCols*minColW);
  const cw=(W-padX*2)/totalCols;
  const rowH=74, hdrH=96, dateRowH=56;
  const roles=ROLES.filter(r=>keys.some(k=>(scheduleData[k]||[]).find(s=>s.role===r)));
  const H=hdrH+dateRowH+(roles.length*rowH)+padY*2+20;
  const roleIcons={ '主领':'🎤','伴唱':'🎵','键盘':'🎹','吉他':'🎸','贝斯':'🎻','鼓':'🥁','教歌':'📖' };

  const canvas=document.getElementById('exportCanvas');
  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);

  // background
  ctx.fillStyle='#f2f2f0'; ctx.fillRect(0,0,W,H);
  // title bar - use actual hex color (CSS vars don't work in canvas)
  const canvasPrimary = settings ? settings.primaryColor : '#1D9E75';
  rr(ctx,0,0,W,hdrH,0,canvasPrimary);
  ctx.fillStyle='#fff'; ctx.font='bold 28px PingFang SC,sans-serif'; ctx.textAlign='center';
  ctx.fillText(titleStr,W/2,44);
  ctx.font='17px PingFang SC,sans-serif'; ctx.fillStyle='rgba(255,255,255,0.75)';
  ctx.fillText(subStr,W/2,70);

  // table header
  ctx.fillStyle='#fff'; ctx.fillRect(padX,hdrH,W-padX*2,dateRowH);
  ctx.fillStyle='#555'; ctx.font='bold 20px PingFang SC,sans-serif'; ctx.textAlign='center';
  ctx.fillText('类别',padX+cw/2,hdrH+35);
  keys.forEach((k,i)=>{
    const[,m,dd]=k.split('-');
    const dObj=new Date(k+'T00:00:00');
    const isSunday=dObj.getDay()===0;
    const cx=padX+cw*(i+1)+cw/2;
    ctx.fillStyle=settings ? settings.primaryColor : '#1D9E75'; ctx.font='bold 20px PingFang SC,sans-serif';
    ctx.fillText(`${parseInt(dd)}/${parseInt(m)}`, cx, isSunday?hdrH+35:hdrH+27);
    // 非主日（特别聚会日期）在日期下面加一行小标签，导出图片上能一眼看出这是什么聚会
    if(!isSunday){
      ctx.fillStyle='#888'; ctx.font='12px PingFang SC,sans-serif';
      ctx.fillText(getDateNavLabel(dObj), cx, hdrH+47);
    }
  });

  // divider
  ctx.strokeStyle='rgba(0,0,0,0.08)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(padX,hdrH+dateRowH); ctx.lineTo(W-padX,hdrH+dateRowH); ctx.stroke();

  // rows
  roles.forEach((role,ri)=>{
    const y=hdrH+dateRowH+ri*rowH;
    const bg=ri%2===0?'#ffffff':'#f9f9f7';
    ctx.fillStyle=bg; ctx.fillRect(padX,y,W-padX*2,rowH);
    const col=roleColors[role]||{badgeBg:'#888',badgeText:'#fff'};
    const badgeX=padX+6, badgeW=cw-20, badgeY=y+8, badgeH=rowH-16;
    rr(ctx,badgeX,badgeY,badgeW,badgeH,8,col.badgeBg);
    // icon on top, role text below - stacked vertically, centered as a group
    const icon=roleIcons[role]||'';
    const iconFont='20px PingFang SC,sans-serif';
    const textFont='bold 16px PingFang SC,sans-serif';
    const bcx=badgeX+badgeW/2, bcy=badgeY+badgeH/2;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    if(icon){
      ctx.font=iconFont; ctx.fillStyle=col.badgeText; ctx.fillText(icon,bcx,bcy-11);
      ctx.font=textFont; ctx.fillText(role,bcx,bcy+11);
    } else {
      ctx.font=textFont; ctx.fillStyle=col.badgeText; ctx.fillText(role,bcx,bcy);
    }
    ctx.textBaseline='alphabetic'; ctx.textAlign='center';
    keys.forEach((k,i)=>{
      const shift=(scheduleData[k]||[]).find(s=>s.role===role);
      const cx=padX+cw*(i+1), cy=y;
      ctx.fillStyle='#333'; ctx.font='19px PingFang SC,sans-serif'; ctx.textAlign='center';
      if(shift){
        const names=shift.persons;
        if(names.length===1){ ctx.fillText(names[0],cx+cw/2,cy+rowH/2+7); }
        else{
          const line1=names.slice(0,Math.ceil(names.length/2)).join('/');
          const line2=names.slice(Math.ceil(names.length/2)).join('/');
          ctx.fillStyle='#444'; ctx.font='17px PingFang SC,sans-serif';
          ctx.fillText(line1,cx+cw/2,cy+rowH/2-6);
          ctx.fillText(line2,cx+cw/2,cy+rowH/2+18);
        }
      } else { ctx.fillStyle='#ccc'; ctx.fillText('—',cx+cw/2,cy+rowH/2+7); }
    });
    // row divider
    ctx.strokeStyle='rgba(0,0,0,0.05)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(padX,y+rowH); ctx.lineTo(W-padX,y+rowH); ctx.stroke();
    // col dividers
    for(let i=1;i<=keys.length;i++){
      const x=padX+cw*i;
      ctx.beginPath(); ctx.moveTo(x,hdrH); ctx.lineTo(x,y+rowH); ctx.stroke();
    }
  });

  // outer border
  ctx.strokeStyle='rgba(0,0,0,0.1)'; ctx.lineWidth=1.5;
  ctx.strokeRect(padX,hdrH,W-padX*2,dateRowH+roles.length*rowH);

  const a=document.createElement('a');
  a.download=filename; a.href=canvas.toDataURL('image/png'); a.click();
}

function doExport(mode){
  document.getElementById('exportChoiceOverlay').classList.remove('open');
  const d=selectedSunday, year=d.getFullYear(), month=d.getMonth();
  // 本月全部：主日 + 当月所有特别聚会日期都算进去，只要那天有排班数据
  const allDates=getAllScheduleDatesOfMonth(year,month);
  const keys=mode==='week'?[toKey(d)]:allDates.map(s=>toKey(s)).filter(k=>scheduleData[k]);

  if(!keys.length){ alert('这段时间还没有排班数据，无法导出'); return; }

  const titleStr=`${year}年${ZH_MONTHS[month]}月份敬拜排班表`;
  const subStr=mode==='week'?`${month+1}月${d.getDate()}日（${getDateNavLabel(d)}）`:`本月全部 ${keys.length} 场排班`;
  const fname=mode==='week'?`排班_${month+1}月${d.getDate()}日.png`:`排班_${year}年${month+1}月全部.png`;
  renderExportTable(keys, titleStr, subStr, fname);
}

// ── 自定义导出：选日期范围 + 自定义标题 ─────────────────
function openCustomExport(){
  document.getElementById('exportChoiceOverlay').classList.remove('open');
  // 默认把日期范围设成当前选中周日所在的月份，标题留空（导出时会给个默认值）
  const d=selectedSunday, year=d.getFullYear(), month=d.getMonth();
  const first=new Date(year,month,1), last=new Date(year,month+1,0);
  const toInputDate=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  document.getElementById('customExportStart').value=toInputDate(first);
  document.getElementById('customExportEnd').value=toInputDate(last);
  document.getElementById('customExportTitle').value='';
  document.getElementById('customExportOverlay').classList.add('open');
}

function doExportCustom(){
  const startVal=document.getElementById('customExportStart').value;
  const endVal=document.getElementById('customExportEnd').value;
  const customTitle=document.getElementById('customExportTitle').value.trim();

  if(!startVal||!endVal){ alert('请选择开始和结束日期'); return; }
  const start=new Date(startVal+'T00:00:00');
  const end=new Date(endVal+'T00:00:00');
  if(start>end){ alert('开始日期不能晚于结束日期'); return; }

  // 收集范围内、且已经有排班数据的所有日期 —— 逐天扫描，
  // 这样主日和管理员额外添加的"特别聚会日期"都能被导出，不会漏掉特别聚会
  const keys=[];
  const cur=new Date(start);
  while(cur<=end){
    const k=toKey(cur);
    if(scheduleData[k]) keys.push(k);
    cur.setDate(cur.getDate()+1);
  }

  if(!keys.length){ alert('所选日期范围内没有找到已排班的日期，无法导出'); return; }

  const titleStr=customTitle || '敬拜排班表';
  const fmtShort=k=>{ const[,m,dd]=k.split('-'); return `${parseInt(m)}/${parseInt(dd)}`; };
  const subStr=keys.length===1?`${fmtShort(keys[0])}（${getDateNavLabel(new Date(keys[0]+'T00:00:00'))}）`:`${fmtShort(keys[0])} - ${fmtShort(keys[keys.length-1])}，共 ${keys.length} 场排班`;
  const safeTitle=(customTitle||'排班').replace(/[\\/:*?"<>|]/g,'_');
  const fname=`${safeTitle}.png`;

  document.getElementById('customExportOverlay').classList.remove('open');
  renderExportTable(keys, titleStr, subStr, fname);
}

function doExportPerson(name){
  if(!name) return;
  const d=selectedSunday, year=d.getFullYear(), month=d.getMonth();
  const prefix=`${year}-${String(month+1).padStart(2,'0')}-`;
  // collect all shifts for this person in the current month
  const results=[];
  Object.entries(scheduleData).forEach(([key,shifts])=>{
    if(!key.startsWith(prefix)) return;
    (shifts||[]).forEach(s=>{
      if(s.persons.some(p=>p.includes(name))){
        const[,m,dd]=key.split('-');
        results.push({key,date:`${parseInt(m)}月${parseInt(dd)}日`,role:s.role,shiftName:s.name,persons:s.persons});
      }
    });
  });

  const dpr=window.devicePixelRatio||1;
  const W=600, padX=24, padY=20;
  const hdrH=88, rowH=60, emptyH=88;
  const H=hdrH+(results.length?results.length*rowH+padY:emptyH)+padY+16;

  const canvas=document.getElementById('exportCanvas');
  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);

  const primary=settings ? settings.primaryColor : '#1D9E75';

  // background
  ctx.fillStyle='#f2f2f0'; ctx.fillRect(0,0,W,H);

  // title bar
  rr(ctx,0,0,W,hdrH,0,primary);
  ctx.fillStyle='#fff'; ctx.font='bold 20px PingFang SC,sans-serif'; ctx.textAlign='center';
  ctx.fillText(`${name} — ${year}年${ZH_MONTHS[month]}月排班明细`,W/2,38);
  ctx.font='15px PingFang SC,sans-serif'; ctx.fillStyle='rgba(255,255,255,0.78)';
  const subStr=results.length?`本月共 ${results.length} 条排班`:'本月暂无排班记录';
  ctx.fillText(subStr,W/2,66);

  if(!results.length){
    ctx.fillStyle='#ccc'; ctx.font='16px PingFang SC,sans-serif'; ctx.textAlign='center';
    ctx.fillText('本月暂无该人员的排班',W/2,hdrH+emptyH/2+10);
  } else {
    results.forEach((r,i)=>{
      const y=hdrH+i*rowH+padY/2;
      const bg=i%2===0?'#ffffff':'#f9f9f7';
      rr(ctx,padX,y,W-padX*2,rowH-6,10,bg);

      // role badge
      const col=roleColors[r.role]||{badgeBg:'#888',badgeText:'#fff'};
      rr(ctx,padX+10,y+7,50,rowH-20,8,col.badgeBg);
      ctx.fillStyle=col.badgeText; ctx.font='bold 13px PingFang SC,sans-serif'; ctx.textAlign='center';
      ctx.fillText(r.role,padX+10+25,y+(rowH-20)/2+7+5);

      // date
      ctx.fillStyle=primary; ctx.font='bold 15px PingFang SC,sans-serif'; ctx.textAlign='left';
      ctx.fillText(r.date,padX+72,y+20);

      // shift name
      ctx.fillStyle='#333'; ctx.font='14px PingFang SC,sans-serif';
      ctx.fillText(r.shiftName,padX+72,y+40);

      // persons (highlight matched name)
      const personsStr=r.persons.join(' / ');
      ctx.fillStyle='#888'; ctx.font='14px PingFang SC,sans-serif'; ctx.textAlign='right';
      ctx.fillText(personsStr,W-padX-10,y+rowH/2+7);
    });
  }

  const a=document.createElement('a');
  a.download=`${name}_${year}年${month+1}月排班明细.png`;
  a.href=canvas.toDataURL('image/png'); a.click();
}

function rr(ctx,x,y,w,h,r,fill){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
}

// ── Init ──────────────────────────────────────────────
function getCurrentWeekSunday(){
  const now=new Date();
  const s=getSundaysOfMonth(now.getFullYear(),now.getMonth());
  let t=s.find(x=>x.toDateString()===now.toDateString());
  if(!t){
    const f=s.filter(x=>x>=now);
    if(f.length){
      t=f[0];
    } else {
      // 本月的主日都已过完（包括最后一个周末），自动跳到下个月第一个主日
      let ny=now.getFullYear(), nm=now.getMonth()+1;
      if(nm>11){ nm=0; ny++; }
      const ns=getSundaysOfMonth(ny,nm);
      t=ns.length?ns[0]:s[s.length-1];
    }
  }
  return t;
}
function getSundayCountdownLabel(){
  const cur=getCurrentWeekSunday();
  if(!cur) return '主日';
  const today=new Date(); today.setHours(0,0,0,0);
  const sunday=new Date(cur); sunday.setHours(0,0,0,0);
  const days=Math.round((sunday-today)/(24*60*60*1000));
  if(days<=0) return '今天就是主日';
  if(days===1) return '明天就是主日';
  return `距主日还有 ${days} 天`;
}
function getRelativeWeekPrefix(d){
  const cur=getCurrentWeekSunday();
  if(!d || !cur) return '本周';
  const target=new Date(d);
  const diffDays=Math.round((target.setHours(0,0,0,0)-new Date(cur).setHours(0,0,0,0))/(24*60*60*1000));
  const diffWeeks=Math.round(diffDays/7);
  if(diffWeeks===0) return '本周';
  if(diffWeeks===1) return '下周';
  if(diffWeeks===-1) return '上周';
  if(diffWeeks===2) return '下下周';
  if(diffWeeks===-2) return '上上周';
  return `${target.getMonth()+1}月${target.getDate()}日`;
}
function getRelativeWeekSectionTitle(d,suffix='排班'){
  return `${getRelativeWeekPrefix(d)}${suffix}`;
}
function getRelativeWeekLabel(d){
  return getRelativeWeekSectionTitle(d,'排班');
}
function goToday(){
  selectedSunday=getCurrentWeekSunday(); updateAdminUI(); render();
}
function updateBackToTodayFab(){
  const fab=document.getElementById('backToTodayFab');
  const btn=document.getElementById('todayBtn');
  if(!selectedSunday) return;
  const cur=getCurrentWeekSunday();
  const isCurrentWeek = cur && selectedSunday.toDateString()===cur.toDateString();
  if(fab) fab.classList.toggle('show', !isCurrentWeek);
  if(btn) btn.textContent = getRelativeWeekLabel(new Date(selectedSunday));
}
// ── Month overview (view all Sundays' shifts at once) ──
function openMonthOverview(){
  const d=selectedSunday||new Date();
  renderMonthOverview(d.getFullYear(), d.getMonth());
  document.getElementById('monthOverviewOverlay').classList.add('open');
}
function closeMonthOverview(e){
  if(!e || e.target===document.getElementById('monthOverviewOverlay'))
    document.getElementById('monthOverviewOverlay').classList.remove('open');
}
function jumpToMonthOverviewWeek(y,m,dt){
  selectedSunday=new Date(y,m,dt);
  document.getElementById('monthOverviewOverlay').classList.remove('open');
  updateAdminUI();
  render();
}
function renderMonthOverview(year, month){
  const sundays=getSundaysOfMonth(year, month);
  const list=document.getElementById('monthOverviewList');
  const title=document.getElementById('monthOverviewTitle');
  const sub=document.getElementById('monthOverviewSub');
  title.textContent=`📅 ${year}年${ZH_MONTHS[month]}月排班总览`;
  sub.textContent=`本月共 ${sundays.length} 个主日 · 点击日期可跳转查看`;
  if(!sundays.length){
    list.innerHTML=`<div class="leave-list-empty"><i class="ti ti-calendar-off"></i>该月没有主日</div>`;
    return;
  }
  list.innerHTML=sundays.map(s=>{
    const key=toKey(s);
    const shifts=scheduleData[key]||[];
    const preacher=getSermonForKey(key).trim();
    const dateLabel=`${month+1}月${s.getDate()}日`;
    const isCur=selectedSunday && s.toDateString()===selectedSunday.toDateString();

    const itemsHtml=shifts.length
      ? shifts.map(sh=>{
          const c=roleColors[sh.role]||{badgeBg:'#888',badgeText:'#fff',icon:'ti-user'};
          const leaveSet=new Set(Array.isArray(sh.leavePersons)?sh.leavePersons:[]);
          const personsHtml=sh.persons.map(p=>
            leaveSet.has(p)
              ? `<span style="text-decoration:line-through;color:#bbb">${escapeHtml(p)}</span>`
              : escapeHtml(p)
          ).join(' / ');
          return `<div class="leave-list-item" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-left:none;border-radius:14px">
            <div style="width:42px;height:42px;border-radius:12px;background:${c.badgeBg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="ti ${c.icon}" style="color:${c.badgeText};font-size:20px"></i>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;color:#aaa;margin-bottom:3px">${escapeHtml(sh.role)}</div>
              <div style="font-size:14px;font-weight:500;color:#1a1a1a;line-height:1.4">${personsHtml}</div>
            </div>
          </div>`;
        }).join('')
      : `<div class="leave-list-empty" style="padding:1.2rem 0"><i class="ti ti-calendar-off"></i>暂未排班</div>`;

    return `<div class="result-date-group">
      <div class="leave-list-head" style="margin-bottom:8px;padding:0 2px">
        <div>
          <span style="font-size:13px;font-weight:700;color:${isCur?'var(--primary)':'#1a1a1a'}">${dateLabel}（周日）${isCur?' · 当前':''}</span>
          ${preacher?`<span class="leave-list-when" style="margin-left:8px">证道：${escapeHtml(preacher)}</span>`:''}
        </div>
        <button onclick="jumpToMonthOverviewWeek(${s.getFullYear()},${s.getMonth()},${s.getDate()})"
          style="background:${isCur?'var(--primary)':'#f5f5f2'};color:${isCur?'#fff':'#666'};border:none;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap">
          跳转查看
        </button>
      </div>
      ${itemsHtml}
    </div>`;
  }).join('');
}

// ── Monthly Schedule Editor ───────────────────────────
let meYear = null, meMonth = null;

function openMonthlyEditor(){
  if(!isAdmin) return;
  const d = selectedSunday || new Date();
  meYear = d.getFullYear();
  meMonth = d.getMonth();
  renderMonthlyEditor();
  document.getElementById('monthlyEditorOverlay').classList.add('open');
}

function closeMonthlyEditor(e){
  if(!e || e.target === document.getElementById('monthlyEditorOverlay')){
    document.getElementById('monthlyEditorOverlay').classList.remove('open');
    render();
  }
}

function shiftMonthlyEditor(delta){
  const d = new Date(meYear, meMonth + delta, 1);
  meYear = d.getFullYear();
  meMonth = d.getMonth();
  renderMonthlyEditor();
}

function renderMonthlyEditor(){
  const sundays = getSundaysOfMonth(meYear, meMonth);
  document.getElementById('monthlyEditorTitle').textContent =
    `${meYear}年${ZH_MONTHS[meMonth]}月排班`;
  document.getElementById('monthlyEditorSub').textContent =
    `本月共 ${sundays.length} 个主日 · 点击角色可直接编辑`;

  // copy bar only for admins (always shown in this context)
  document.getElementById('monthlyEditorCopyBar').style.display = isAdmin ? 'flex' : 'none';

  const body = document.getElementById('monthlyEditorBody');
  if(!sundays.length){
    body.innerHTML = `<div class="me-empty"><i class="ti ti-calendar-off"></i>该月没有主日</div>`;
    return;
  }

  const curKey = selectedSunday ? toKey(selectedSunday) : null;

  body.innerHTML = sundays.map((s, idx) => {
    const key = toKey(s);
    const shifts = scheduleData[key] || [];
    const dateLabel = `${meMonth+1}月${s.getDate()}日（周日）`;
    const preacher = getSermonForKey(key).trim();
    const isCur = key === curKey;
    const filledCount = shifts.length;
    const totalRoles = ROLES.length;
    const metaStr = filledCount
      ? `已排 ${filledCount}/${totalRoles} 个角色${preacher ? ' · 证道：'+preacher : ''}`
      : `尚未排班${preacher ? ' · 证道：'+preacher : ''}`;

    // expand first sunday or current week by default
    const isOpen = idx === 0 || isCur;

    const rolesHtml = ROLES.map(role => {
      const col = roleColors[role] || {badgeBg:'#888', badgeText:'#fff', icon:'ti-user'};
      const shift = shifts.find(s => s.role === role);
      const personsStr = shift ? shift.persons.join(' / ') : '';
      const editAttr = isAdmin
        ? `onclick="meEditRole('${role}','${key}')" class="me-role-row editable"`
        : `class="me-role-row"`;
      return `<div ${editAttr}>
        <div class="me-role-badge" style="background:${col.badgeBg}">
          <i class="ti ${col.icon}" style="color:${col.badgeText}"></i>
          <span style="color:${col.badgeText}">${role}</span>
        </div>
        <div class="me-role-persons ${personsStr?'':'empty'}">${escapeHtml(personsStr)||'未安排'}</div>
        ${isAdmin ? '<div class="me-role-edit-hint">✎</div>' : ''}
      </div>`;
    }).join('');

    const addRowHtml = isAdmin
      ? `<div class="me-add-row show">
          <button class="me-add-btn" onclick="meOpenAddForDate('${key}')">
            <i class="ti ti-plus"></i>新增 / 批量编辑
          </button>
        </div>` : '';

    const swapBtnsHtml = isAdmin
      ? `<div class="me-swap-btns" onclick="event.stopPropagation()">
          <button class="me-swap-btn" title="与上一周对调排班" ${idx===0?'disabled':''} onclick="meSwapWeek(${idx},-1)"><i class="ti ti-arrow-up"></i></button>
          <button class="me-swap-btn" title="与下一周对调排班" ${idx===sundays.length-1?'disabled':''} onclick="meSwapWeek(${idx},1)"><i class="ti ti-arrow-down"></i></button>
        </div>`
      : '';

    return `<div class="me-sunday-block" id="me-block-${key}">
      <div class="me-sunday-header ${isCur?'active-week':''}" onclick="meToggleBlock('${key}')">
        <div>
          <div class="me-sunday-date">${dateLabel}${isCur?' 〈当前〉':''}</div>
          <div class="me-sunday-meta">${escapeHtml(metaStr)}</div>
        </div>
        <div class="me-sunday-header-right">
          ${swapBtnsHtml}
          <i class="ti ti-chevron-down me-sunday-chevron ${isOpen?'open':''}" id="me-chev-${key}"></i>
        </div>
      </div>
      <div class="me-sunday-body ${isOpen?'open':''}" id="me-body-${key}">
        ${rolesHtml}
        ${addRowHtml}
      </div>
    </div>`;
  }).join('');
}

async function meSwapWeek(idx, direction){
  if(!isAdmin) return;
  const sundays = getSundaysOfMonth(meYear, meMonth);
  const otherIdx = idx + direction;
  if(otherIdx < 0 || otherIdx >= sundays.length) return;
  const keyA = toKey(sundays[idx]);
  const keyB = toKey(sundays[otherIdx]);
  const dataA = scheduleData[keyA];
  const dataB = scheduleData[keyB];
  if(dataB !== undefined) scheduleData[keyA] = dataB; else delete scheduleData[keyA];
  if(dataA !== undefined) scheduleData[keyB] = dataA; else delete scheduleData[keyB];
  renderMonthlyEditor();
  const label = `${sundays[idx].getMonth()+1}月${sundays[idx].getDate()}日 与 ${sundays[otherIdx].getMonth()+1}月${sundays[otherIdx].getDate()}日`;
  if(typeof initSupabaseClient === 'function' && initSupabaseClient() && typeof syncRemoteField === 'function'){
    try {
      await syncRemoteField('schedule_data', scheduleData);
      showToast(`☁️ 已对调 ${label} 的排班并同步到云端`);
    } catch(e){
      console.error('同步排班顺序失败', e);
      showToast('排班顺序已对调，但云端同步失败');
    }
  } else {
    showToast(`已对调 ${label} 的排班`);
  }
  // keep main view in sync if the swapped week is currently displayed
  if(typeof render === 'function') render();
}

function meToggleBlock(key){
  const body = document.getElementById(`me-body-${key}`);
  const chev = document.getElementById(`me-chev-${key}`);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  chev.classList.toggle('open', !isOpen);
}

function meEditRole(role, key){
  if(!isAdmin) return;
  // Store month/year so we can re-render after saving
  const origSave = saveEdit;
  openEditDrawer(role, key);
  // Hook into save to re-render monthly editor after
  const overlay = document.getElementById('editOverlay');
  const onSave = () => {
    overlay.removeEventListener('transitionend', onSave);
    if(document.getElementById('monthlyEditorOverlay').classList.contains('open'))
      renderMonthlyEditor();
  };
  overlay.addEventListener('transitionend', onSave, {once: true});
}

function meOpenAddForDate(key){
  if(!isAdmin) return;
  // Temporarily switch selectedSunday to this date so openAddDrawer uses it
  const parts = key.split('-');
  const prevSunday = selectedSunday;
  selectedSunday = new Date(+parts[0], +parts[1]-1, +parts[2]);
  editMode = 'add'; editKey = key; editRole = null; editSelections = {}; customPeople = {};
  const ex = scheduleData[editKey] || [];
  ROLES.forEach(r => { const f = ex.find(s => s.role === r); editSelections[r] = new Set(f ? f.persons : []); customPeople[r] = []; });
  renderEditDrawer();
  document.getElementById('editOverlay').classList.add('open');
  // After closing editOverlay, restore & re-render
  const overlay = document.getElementById('editOverlay');
  const onClose = () => {
    overlay.removeEventListener('transitionend', onClose);
    selectedSunday = prevSunday;
    if(document.getElementById('monthlyEditorOverlay').classList.contains('open'))
      renderMonthlyEditor();
  };
  overlay.addEventListener('transitionend', onClose, {once: true});
}

function meCopyFromLastMonth(){
  if(!isAdmin) return;
  const prevD = new Date(meYear, meMonth - 1, 1);
  const prevY = prevD.getFullYear(), prevM = prevD.getMonth();
  const prevSundays = getSundaysOfMonth(prevY, prevM);
  const curSundays = getSundaysOfMonth(meYear, meMonth);
  if(!prevSundays.length){ alert('上月没有主日可复制'); return; }
  if(!curSundays.length){ alert('本月没有主日'); return; }
  const hasData = curSundays.some(s => scheduleData[toKey(s)]?.length);
  if(hasData && !confirm(`本月已有部分排班数据，复制上月排班会覆盖相同主日的角色。确定继续？`)) return;
  // Copy each week's data in order, wrapping if unequal counts
  curSundays.forEach((s, i) => {
    const srcKey = toKey(prevSundays[i % prevSundays.length]);
    const dstKey = toKey(s);
    const src = scheduleData[srcKey];
    if(src && src.length){
      scheduleData[dstKey] = src.map(sh => ({...sh, persons:[...sh.persons], leavePersons:[]}));
    }
  });
  renderMonthlyEditor();
  // Trigger remote sync if available
  if(typeof syncRemoteField === 'function'){
    try { syncRemoteField('schedule_data', scheduleData); } catch(e){}
  }
}

function meClearMonth(){
  if(!isAdmin) return;
  const sundays = getSundaysOfMonth(meYear, meMonth);
  const count = sundays.filter(s => scheduleData[toKey(s)]?.length).length;
  if(!count){ alert('本月暂无排班数据'); return; }
  if(!confirm(`确定要清空${meYear}年${ZH_MONTHS[meMonth]}月的所有排班数据（共 ${count} 周）？此操作不可撤销。`)) return;
  sundays.forEach(s => delete scheduleData[toKey(s)]);
  renderMonthlyEditor();
  if(typeof syncRemoteField === 'function'){
    try { syncRemoteField('schedule_data', scheduleData); } catch(e){}
  }
}

// ── Roster management ────────────────────────────────
function openRoster(){
  renderRosterChips('leader');
  renderRosterChips('prayer');
  document.getElementById('leaderBase').value = rotationConfig.leader.base;
  document.getElementById('prayerBase').value = rotationConfig.prayer.base;
  // Default to currently selected month
  const d = selectedSunday || new Date();
  const monthVal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('sermonMonthInput').value = monthVal;
  renderSermonMonthUI();
  initServiceStatsUI();
  document.getElementById('rosterOverlay').classList.add('open');
}
function closeRoster(e){
  if(!e || e.target===document.getElementById('rosterOverlay'))
    document.getElementById('rosterOverlay').classList.remove('open');
  render();
}

// ── Service (serving) count statistics ────────────────
function initServiceStatsUI(){
  const roleSel = document.getElementById('svcStatRole');
  if(roleSel && roleSel.options.length <= 1){
    ROLES.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r; opt.textContent = r;
      roleSel.appendChild(opt);
    });
  }
  const d = selectedSunday || new Date();
  const curMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const startEl = document.getElementById('svcStatStart');
  const endEl = document.getElementById('svcStatEnd');
  if(startEl && !startEl.value){
    const startD = new Date(d.getFullYear(), d.getMonth() - 5, 1);
    startEl.value = `${startD.getFullYear()}-${String(startD.getMonth()+1).padStart(2,'0')}`;
  }
  if(endEl && !endEl.value) endEl.value = curMonth;
  renderServiceStats();
}

// 计算某段月份区间内，每人每岗位被排班（服侍）的次数
// startMonth/endMonth 格式为 "YYYY-MM"（闭区间，含首尾月）
function computeServiceStats(startMonth, endMonth, roleFilter){
  const result = {}; // name -> { total, byRole: {role:count} }
  if(!startMonth || !endMonth) return result;
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  const startKey = `${sy}-${String(sm).padStart(2,'0')}`;
  const endKey = `${ey}-${String(em).padStart(2,'0')}`;
  Object.keys(scheduleData).forEach(dateKey => {
    const ym = dateKey.slice(0, 7); // "YYYY-MM"
    if(ym < startKey || ym > endKey) return;
    const rows = scheduleData[dateKey] || [];
    rows.forEach(row => {
      if(roleFilter && row.role !== roleFilter) return;
      const persons = Array.isArray(row.persons) && row.persons.length
        ? row.persons
        : (row.name ? row.name.split('/').map(s=>s.trim()).filter(Boolean) : []);
      const onLeave = new Set(row.leavePersons || []);
      persons.forEach(name => {
        if(!name || onLeave.has(name)) return; // 请假的不计入服侍次数
        if(!result[name]) result[name] = { total: 0, byRole: {} };
        result[name].total += 1;
        result[name].byRole[row.role] = (result[name].byRole[row.role] || 0) + 1;
      });
    });
  });
  return result;
}

function renderServiceStats(){
  const startMonth = document.getElementById('svcStatStart')?.value;
  const endMonth = document.getElementById('svcStatEnd')?.value;
  const roleFilter = document.getElementById('svcStatRole')?.value || '';
  const listEl = document.getElementById('svcStatList');
  const summaryEl = document.getElementById('svcStatSummary');
  if(!listEl || !summaryEl) return;
  if(!startMonth || !endMonth){
    listEl.innerHTML = '';
    summaryEl.textContent = '请选择起止月份';
    return;
  }
  if(startMonth > endMonth){
    listEl.innerHTML = '';
    summaryEl.textContent = '起始月份不能晚于结束月份';
    return;
  }
  const stats = computeServiceStats(startMonth, endMonth, roleFilter);
  const entries = Object.entries(stats).sort((a,b) => b[1].total - a[1].total);
  const [sy, sm] = startMonth.split('-');
  const [ey, em] = endMonth.split('-');
  summaryEl.textContent = `统计区间：${sy}年${Number(sm)}月 至 ${ey}年${Number(em)}月${roleFilter ? '　岗位：'+roleFilter : ''}　共 ${entries.length} 人`;
  if(!entries.length){
    listEl.innerHTML = '<div style="text-align:center;color:#ccc;font-size:12px;padding:10px 0">该区间内暂无排班数据</div>';
    return;
  }
  listEl.innerHTML = entries.map(([name, info], idx) => {
    const detail = Object.entries(info.byRole).map(([r,c]) => `${r} ${c}次`).join('　');
    return `<div class="svc-stat-row">
      <div class="svc-stat-rank">${idx+1}</div>
      <div class="svc-stat-name">${name}</div>
      <div class="svc-stat-detail">${detail}</div>
      <div class="svc-stat-count">${info.total} 次</div>
    </div>`;
  }).join('');
}

function renderRosterChips(type){
  const cfg = rotationConfig[type];
  const containerId = type==='leader' ? 'leaderChips' : 'prayerChips';
  const container = document.getElementById(containerId);
  container.innerHTML = cfg.list.map((name,i) =>
    `<div style="display:flex;align-items:center;gap:4px;background:#f5f5f2;border-radius:20px;padding:5px 8px 5px 12px;font-size:13px;color:#444">
      <span ondblclick="startEditRosterPerson('${type}',${i})">${escapeHtml(name)}</span>
      <button onclick="startEditRosterPerson('${type}',${i})" title="修改姓名" style="background:none;border:none;cursor:pointer;color:#999;font-size:12px;padding:0 2px;line-height:1;display:flex"><i class="ti ti-pencil"></i></button>
      <button onclick="removeRosterPerson('${type}',${i})" style="background:none;border:none;cursor:pointer;color:#bbb;font-size:13px;padding:0 2px;line-height:1">×</button>
    </div>`
  ).join('');
}

function startEditRosterPerson(type, idx){
  const cfg = rotationConfig[type];
  const containerId = type==='leader' ? 'leaderChips' : 'prayerChips';
  const container = document.getElementById(containerId);
  const chip = container.children[idx];
  if(!chip) return;
  const oldName = cfg.list[idx];
  const inputId = `rosterEditInput-${type}-${idx}`;
  chip.innerHTML = `<input type="text" value="${escapeHtml(oldName)}" id="${inputId}"
    style="border:1px solid var(--primary);border-radius:14px;padding:4px 10px;font-size:13px;width:84px;outline:none"
    onkeydown="if(event.key==='Enter'){this.blur();}else if(event.key==='Escape'){this.dataset.cancel='1';this.blur();}"
    onblur="confirmEditRosterPerson('${type}',${idx})">`;
  const inp = document.getElementById(inputId);
  inp.focus(); inp.select();
}

function confirmEditRosterPerson(type, idx){
  const inputId = `rosterEditInput-${type}-${idx}`;
  const inp = document.getElementById(inputId);
  if(!inp){ renderRosterChips(type); return; }
  const cfg = rotationConfig[type];
  const newName = inp.dataset.cancel ? cfg.list[idx] : inp.value.trim();
  if(newName && newName !== cfg.list[idx]) cfg.list[idx] = newName;
  renderRosterChips(type);
}

function addRosterPerson(type){
  const inputId = type==='leader' ? 'leaderInput' : 'prayerInput';
  const inp = document.getElementById(inputId);
  const name = inp.value.trim();
  if(!name) return;
  rotationConfig[type].list.push(name);
  inp.value = '';
  renderRosterChips(type);
}

function removeRosterPerson(type, idx){
  rotationConfig[type].list.splice(idx, 1);
  renderRosterChips(type);
}

function saveRosterBase(type, val){
  if(val) rotationConfig[type].base = val;
}

function renderSermonMonthUI(){
  const val = document.getElementById('sermonMonthInput').value; // 'YYYY-MM'
  const container = document.getElementById('sermonMonthList');
  if(!val){ container.innerHTML = '<div style="color:#bbb;font-size:13px;text-align:center;padding:8px 0">请先选择月份</div>'; return; }
  const [y, m] = val.split('-').map(Number);
  const sundays = getSundaysOfMonth(y, m - 1);
  if(!sundays.length){ container.innerHTML = '<div style="color:#bbb;font-size:13px;text-align:center;padding:8px 0">该月无周日</div>'; return; }
  container.innerHTML = sundays.map(s => {
    const key = toKey(s);
    const current = sermonByDate[key] || '';
    const label = `${m}月${s.getDate()}日（周日）`;
    return `<div style="display:flex;align-items:center;gap:8px;background:#f8f8f6;border-radius:12px;padding:10px 12px">
      <span style="font-size:12px;font-weight:500;color:#888;min-width:100px;flex-shrink:0">${label}</span>
      <input value="${current}" placeholder="证道人姓名"
        id="sermon-inp-${key}"
        style="flex:1;padding:6px 10px;border:1.5px solid rgba(0,0,0,0.1);border-radius:20px;font-size:13px;outline:none;font-family:inherit"
        onfocus="this.style.borderColor='#185FA5'"
        onblur="this.style.borderColor='rgba(0,0,0,0.1)'"
        onkeydown="if(event.key==='Enter'){saveSermonDate('${key}',this.value);this.blur();}">
      <button onclick="saveSermonDate('${key}',document.getElementById('sermon-inp-${key}').value)"
        style="background:#185FA5;color:#fff;border:none;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap">
        保存
      </button>
    </div>`;
  }).join('');
}

function saveSermonDate(key, name){
  const val = name.trim();
  if(val) sermonByDate[key] = val;
  else delete sermonByDate[key];
  // visual feedback
  const inp = document.getElementById(`sermon-inp-${key}`);
  if(inp){
    inp.style.borderColor = 'var(--primary)';
    setTimeout(() => inp.style.borderColor = 'rgba(0,0,0,0.1)', 1000);
  }
  if(selectedSunday && toKey(selectedSunday)===key) renderSermonPassages(key);
}

loadBibleFile(currentBibleVersion)
  .catch(()=>{});

// ── Settings ──────────────────────────────────────────
// Preset color swatches
const COLOR_PRESETS = [
  { color: '#1D9E75', name: '翡翠绿（默认）' },
  { color: '#2563EB', name: '天空蓝' },
  { color: '#7C3AED', name: '紫罗兰' },
  { color: '#DC2626', name: '珊瑚红' },
  { color: '#D97706', name: '琥珀橙' },
  { color: '#DB2777', name: '玫瑰粉' },
  { color: '#0891B2', name: '深海蓝' },
  { color: '#065F46', name: '森林绿' },
];

// Sections config: id of DOM element, label, icon, iconBg, iconColor
const SECTIONS_CONFIG = [
  { key: 'notice',   label: '通知',       icon: 'ti-bell',        iconBg: '#FFF7DB', iconColor: '#7a5500', domId: 'noticeSection' },
  { key: 'topCards', label: '诗歌与证道', icon: 'ti-layout-grid', iconBg: '#EEF2FF', iconColor: '#3B5BDB', domId: 'topCardsRow'   },
  { key: 'schedule', label: '排班',       icon: 'ti-calendar',    iconBg: '#E6FCF5', iconColor: '#1D9E75', domId: 'mainScheduleInner' },
];

// ── Persistent settings state ─────────────────────────
let settings = {
  primaryColor: '#1D9E75',
  a11yMode: false,
  sectionOrder: ['notice', 'topCards', 'schedule'],
  sectionVisible: { notice: true, topCards: true, schedule: true },
  watchNames: [],
};

function loadSettings() {
  try {
    const saved = localStorage.getItem('churchAppSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      settings = Object.assign(settings, parsed);
      // ensure all keys present
      SECTIONS_CONFIG.forEach(s => {
        if (settings.sectionVisible[s.key] === undefined) settings.sectionVisible[s.key] = true;
      });
      if (!settings.sectionOrder || settings.sectionOrder.length !== SECTIONS_CONFIG.length) {
        settings.sectionOrder = SECTIONS_CONFIG.map(s => s.key);
      }
    }
  } catch(e) {}
}

function saveSettings() {
  try { localStorage.setItem('churchAppSettings', JSON.stringify(settings)); } catch(e) {}
}

function applySettingsToDOM() {
  // Apply primary color
  setPrimaryColor(settings.primaryColor, false);
  // Apply a11y
  document.body.classList.toggle('a11y-mode', settings.a11yMode);
  // Apply section order & visibility
  applySectionOrderAndVisibility();
}

// ── Primary color ─────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return { r, g, b };
}
function darkenHex(hex, amount=0.15) {
  let { r, g, b } = hexToRgb(hex);
  r = Math.max(0, Math.floor(r*(1-amount)));
  g = Math.max(0, Math.floor(g*(1-amount)));
  b = Math.max(0, Math.floor(b*(1-amount)));
  return '#' + [r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function lightenHex(hex, alpha=0.12) {
  const { r, g, b } = hexToRgb(hex);
  // return as rgba
  return `rgba(${r},${g},${b},${alpha})`;
}
function lightenHexSolid(hex, mix=0.88) {
  const { r, g, b } = hexToRgb(hex);
  const R = Math.round(r*(1-mix) + 255*mix);
  const G = Math.round(g*(1-mix) + 255*mix);
  const B = Math.round(b*(1-mix) + 255*mix);
  return '#' + [R,G,B].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function setPrimaryColor(hex, save=true) {
  const root = document.documentElement;
  root.style.setProperty('--primary', hex);
  root.style.setProperty('--primary-dark', darkenHex(hex, 0.12));
  root.style.setProperty('--primary-light', lightenHexSolid(hex, 0.88));
  root.style.setProperty('--primary-mid', lightenHexSolid(hex, 0.78));
  if (save) {
    settings.primaryColor = hex;
    saveSettings();
  }
}

function applyCustomColor(val) {
  setPrimaryColor(val);
  // deselect presets
  document.querySelectorAll('.color-preset').forEach(el => el.classList.remove('active'));
}

// ── Settings modal open/close ─────────────────────────
function openSettings() {
  renderColorPresets();
  renderSectionOrderList();
  renderNameTags();
  updateNotifStatus();
  // sync a11y toggle
  document.getElementById('a11yToggle').checked = settings.a11yMode;
  // sync color picker
  document.getElementById('customColorPicker').value = settings.primaryColor;
  // 诗歌库存储配置：仅管理员可见
  const songLibSec = document.getElementById('songLibStorageSection');
  if (songLibSec) {
    songLibSec.style.display = isAdmin ? '' : 'none';
    if (isAdmin) fillSongLibStorageSettingsInputs();
  }
  // 批量导入邮箱提醒：仅管理员可见
  const bulkReminderSec = document.getElementById('bulkReminderSection');
  if (bulkReminderSec) {
    bulkReminderSec.style.display = isAdmin ? '' : 'none';
    if (isAdmin) loadReminderSubscribersList();
  }
  document.getElementById('settingsOverlay').classList.add('open');
}

function closeSettings(e) {
  if (!e || e.target === document.getElementById('settingsOverlay'))
    document.getElementById('settingsOverlay').classList.remove('open');
}

// ── Color presets render ──────────────────────────────
function renderColorPresets() {
  const wrap = document.getElementById('colorPresets');
  wrap.innerHTML = COLOR_PRESETS.map(p => {
    const isActive = p.color.toLowerCase() === settings.primaryColor.toLowerCase();
    return `<div class="color-preset ${isActive?'active':''}" style="background:${p.color}" title="${p.name}" onclick="selectPresetColor('${p.color}')">
      <i class="ti ti-check"></i>
    </div>`;
  }).join('');
}

function selectPresetColor(hex) {
  setPrimaryColor(hex);
  document.getElementById('customColorPicker').value = hex;
  renderColorPresets();
}

// ── Accessibility mode ────────────────────────────────
function toggleA11yMode(enabled) {
  settings.a11yMode = enabled;
  document.body.classList.toggle('a11y-mode', enabled);
  saveSettings();
}

// ── Section order & visibility ────────────────────────
function renderSectionOrderList() {
  const container = document.getElementById('sectionOrderList');
  container.innerHTML = settings.sectionOrder.map((key, idx) => {
    const cfg = SECTIONS_CONFIG.find(s => s.key === key);
    if (!cfg) return '';
    const visible = settings.sectionVisible[key];
    const isFirst = idx === 0;
    const isLast = idx === settings.sectionOrder.length - 1;
    return `<div class="section-order-row" id="sord-${key}">
      <div class="section-order-icon" style="background:${cfg.iconBg}">
        <i class="ti ${cfg.icon}" style="color:${cfg.iconColor}"></i>
      </div>
      <span class="section-order-label">${cfg.label}</span>
      <div class="section-order-arrows">
        <button class="section-order-btn" onclick="moveSectionUp('${key}')" ${isFirst?'disabled':''} title="上移"><i class="ti ti-chevron-up"></i></button>
        <button class="section-order-btn" onclick="moveSectionDown('${key}')" ${isLast?'disabled':''} title="下移"><i class="ti ti-chevron-down"></i></button>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" ${visible?'checked':''} onchange="toggleSectionVisible('${key}',this.checked)">
        <div class="toggle-track"></div>
        <div class="toggle-thumb"></div>
      </label>
    </div>`;
  }).join('');
}

function moveSectionUp(key) {
  const idx = settings.sectionOrder.indexOf(key);
  if (idx <= 0) return;
  [settings.sectionOrder[idx-1], settings.sectionOrder[idx]] = [settings.sectionOrder[idx], settings.sectionOrder[idx-1]];
  saveSettings();
  applySectionOrderAndVisibility();
  renderSectionOrderList();
}

function moveSectionDown(key) {
  const idx = settings.sectionOrder.indexOf(key);
  if (idx >= settings.sectionOrder.length - 1) return;
  [settings.sectionOrder[idx+1], settings.sectionOrder[idx]] = [settings.sectionOrder[idx], settings.sectionOrder[idx+1]];
  saveSettings();
  applySectionOrderAndVisibility();
  renderSectionOrderList();
}

function toggleSectionVisible(key, visible) {
  settings.sectionVisible[key] = visible;
  saveSettings();
  applySectionOrderAndVisibility();
}


// ── Desktop layout helpers ───────────────────────────
const DESKTOP_BREAKPOINT = 1180;
function isDesktopLayout() {
  return window.innerWidth >= DESKTOP_BREAKPOINT;
}
function pickDesktopSunday(year, month, day) {
  selectedSunday = new Date(year, month, day);
  render();
}
function renderDesktopPanels(key) {
  renderDesktopWeekCard(key);
  renderDesktopMonthCard(selectedSunday || new Date());
  renderDesktopProfileCard();
  updateDesktopClock();
}
function renderDesktopWeekCard(key) {
  const el = document.getElementById('desktopWeeklyCard');
  if (!el || !selectedSunday) return;
  const info = getNoticeForKey(key);
  const date = selectedSunday;
  const items = [
    { label: '主领', value: info.leader, bg: '#FAECE7', color: '#993C1D', icon: 'ti-microphone' },
    { label: '证道', value: info.sermon, bg: '#EAF2FF', color: '#185FA5', icon: 'ti-book' },
    { label: '祷告', value: info.prayer, bg: '#ECF9E8', color: '#3B6D11', icon: 'ti-pray' },
  ];
  el.innerHTML = `
    <div class="desktop-side-card desktop-week-card">
      <div class="desktop-brand-row">
        <div class="desktop-brand-mark"><i class="ti ti-cross"></i></div>
        <div>
          <div class="desktop-brand-title">敬拜排班表</div>
          <div class="desktop-brand-sub">保留移动端风格的桌面版</div>
        </div>
      </div>
      <div class="desktop-card-kicker">Weekly Service</div>
      <div class="desktop-card-title">${date.getMonth()+1}月${date.getDate()}日</div>
      <div class="desktop-card-sub">当前查看周日排班，桌面端按三栏信息面板重新组织。</div>
      <div class="desktop-week-items">
        ${items.map(item => `
          <div class="desktop-week-item">
            <div class="desktop-week-item-icon" style="background:${item.bg};color:${item.color}">
              <i class="ti ${item.icon}"></i>
            </div>
            <div>
              <div class="desktop-week-item-label">${item.label}</div>
              <div class="desktop-week-item-value">${escapeHtml(item.value || '待定')}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="desktop-side-link" onclick="openMonthOverview()">查看本月全部排班</button>
    </div>`;
}
function renderDesktopMonthCard(date) {
  const el = document.getElementById('desktopMonthCard');
  if (!el || !date) return;
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const sundaySet = new Set(getSundaysOfMonth(year, month).map(d => d.getDate()));
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push('<span class="desktop-mini-day placeholder">·</span>');
  for (let day = 1; day <= lastDate; day++) {
    const isSunday = sundaySet.has(day);
    const isActive = day === date.getDate();
    const cls = ['desktop-mini-day'];
    if (isSunday) cls.push('is-sunday');
    if (isActive) cls.push('active');
    const attrs = isSunday ? `onclick="pickDesktopSunday(${year}, ${month}, ${day})" title="切换到 ${month+1}月${day}日"` : '';
    cells.push(`<button class="${cls.join(' ')}" ${attrs}>${day}</button>`);
  }
  el.innerHTML = `
    <div class="desktop-side-card">
      <div class="desktop-calendar-head">
        <div>
          <div class="desktop-calendar-title">${year} 年 ${month + 1} 月</div>
          <div class="desktop-calendar-sub">带圆点的日期为主日</div>
        </div>
        <button class="view-toggle-btn" onclick="openMonthPicker()" title="选择月份"><i class="ti ti-calendar-month"></i></button>
      </div>
      <div class="desktop-mini-grid">
        ${weekdayLabels.map(label => `<span class="desktop-mini-weekday">${label}</span>`).join('')}
        ${cells.join('')}
      </div>
    </div>`;
}
function renderDesktopProfileCard() {
  const el = document.getElementById('desktopProfileCard');
  if (!el || !selectedSunday) return;
  const label = isAdmin ? '管理员模式' : '访客模式';
  const sub = isAdmin ? '可以新增和修改排班' : '当前仅浏览排班内容';
  const avatar = isAdmin ? '管' : '访';
  const weekLabel = getRelativeWeekLabel(selectedSunday);
  el.innerHTML = `
    <div class="desktop-side-card desktop-profile-card">
      <div class="desktop-profile-top">
        <div>
          <div class="desktop-profile-name">桌面工作台</div>
          <div class="desktop-profile-sub">${selectedSunday.getMonth()+1}月${selectedSunday.getDate()}日 · ${escapeHtml(weekLabel)}</div>
        </div>
        <div class="desktop-profile-avatar">${avatar}</div>
      </div>
      <div class="desktop-status-badge"><i class="ti ti-shield-check"></i>${label}</div>
      <div class="desktop-card-sub">${sub}</div>
      <div class="desktop-clock-wrap">
        <div class="desktop-clock" id="desktopClock">--:--</div>
        <div class="desktop-clock-sub" id="desktopClockSub">巴西时间</div>
      </div>
      <div class="desktop-quick-actions">
        <button class="desktop-quick-btn" onclick="openSettings()"><i class="ti ti-settings"></i>设置</button>
        <button class="desktop-quick-btn" onclick="goToday()"><i class="ti ti-calendar-event"></i>本周</button>
        <button class="desktop-quick-btn" onclick="openMonthOverview()"><i class="ti ti-layout-grid"></i>月总览</button>
        <button class="desktop-quick-btn" onclick="openBookmarks()"><i class="ti ti-star"></i>收藏</button>
      </div>
    </div>`;
}
function updateDesktopClock() {
  const clock = document.getElementById('desktopClock');
  const sub = document.getElementById('desktopClockSub');
  if (!clock || !sub) return;
  const now = new Date();
  const week = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  clock.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  sub.textContent = `${week[now.getDay()]} · 巴西当地时间`;
}
function syncResponsiveLayout() {
  document.body.classList.toggle('desktop-mode', isDesktopLayout());
}
window.addEventListener('resize', () => {
  syncResponsiveLayout();
  applySectionOrderAndVisibility();
  syncTopbarSpacer();
});
setInterval(updateDesktopClock, 1000);

// ── Fixed top bar: shadow-on-scroll + spacer height sync ──
function syncTopbarSpacer() {
  const bar = document.getElementById('appTopbar');
  const spacer = document.querySelector('.app-topbar-spacer');
  if (bar && spacer) spacer.style.height = bar.offsetHeight + 'px';
}
function onAppScroll() {
  const bar = document.getElementById('appTopbar');
  if (!bar) return;
  bar.classList.toggle('scrolled', window.scrollY > 4);
}
window.addEventListener('scroll', onAppScroll, { passive: true });
window.addEventListener('load', syncTopbarSpacer);

function applySectionOrderAndVisibility() {
  const container = document.getElementById('mainSchedule');
  if (!container) return;
  const noticeEl = document.getElementById('noticeSection');
  const topCardsEl = document.getElementById('topCardsRow');
  const scheduleEl = document.getElementById('mainScheduleInner');
  const leftRail = document.getElementById('desktopLeftRail');
  const rightRail = document.getElementById('desktopRightRail');
  const bannerEl = document.getElementById('nameReminderBanner');
  const ordered = {
    notice: noticeEl,
    topCards: topCardsEl,
    schedule: scheduleEl,
  };

  if (isDesktopLayout()) {
    container.style.display = 'grid';
    container.style.flexDirection = '';
    if (leftRail) leftRail.style.display = 'block';
    if (rightRail) rightRail.style.display = 'block';
    Object.entries(ordered).forEach(([key, el]) => {
      if (!el) return;
      el.style.order = '';
      el.style.display = settings.sectionVisible[key] ? '' : 'none';
    });
    if (bannerEl) bannerEl.style.order = '';
    return;
  }

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  if (leftRail) leftRail.style.display = 'none';
  if (rightRail) rightRail.style.display = 'none';
  settings.sectionOrder.forEach((key, idx) => {
    const el = ordered[key];
    if (!el) return;
    el.style.display = settings.sectionVisible[key] ? '' : 'none';
    el.style.order = idx;
  });
  if (bannerEl) bannerEl.style.order = '';
}

// ── Leave requests (self-service) ─────────────────────
const LS_LEAVE_REQUESTS = 'churchLeaveRequests';
let leaveRequests = []; // { id, key, role, name, reason, status, createdAt }
let leaveDraftKey = null, leaveDraftRole = null, leaveDraftName = null;
let leaveListFilter = 'pending';

function loadLeaveRequests() {
  try {
    const raw = localStorage.getItem(LS_LEAVE_REQUESTS);
    leaveRequests = raw ? JSON.parse(raw) : [];
  } catch (e) { leaveRequests = []; }
}
function persistLeaveRequests() {
  try { localStorage.setItem(LS_LEAVE_REQUESTS, JSON.stringify(leaveRequests)); } catch (e) {}
}
function normalizeLeaveRequests(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => ({
    id: item?.id || (Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
    key: item?.key || '',
    role: item?.role || '',
    name: item?.name || '',
    reason: item?.reason || '',
    status: ['pending', 'approved', 'declined'].includes(item?.status) ? item.status : 'pending',
    createdAt: item?.createdAt || new Date().toISOString(),
  })).filter(item => item.key && item.role && item.name);
}
async function syncLeaveRequestsToRemote(successMsg) {
  if (!initSupabaseClient()) return false;
  try {
    await syncRemoteField('leave_requests', leaveRequests);
    if (successMsg) showToast(successMsg);
    return true;
  } catch (e) {
    console.error('同步请假申请失败', e);
    if (isMissingRemoteColumnError(e, 'leave_requests')) {
      showToast('后端缺少 leave_requests 字段，请先执行修复 SQL');
    } else {
      showToast('已保存到本地，但云端同步失败');
    }
    return false;
  }
}
function pendingLeaveCount() {
  return leaveRequests.filter(r => r.status === 'pending').length;
}

// ── Email reminder subscribers (每周三/五/六/日 提醒本周祷告/证道/服侍) ──
const LS_REMINDER_EMAIL = 'churchReminderEmail'; // 仅历史遗留：旧版本自助订阅用过，保留常量避免报错，现已不再写入
let reminderSubscribers = []; // { email, name, token, addedAt }—— 现在完全由管理员统一添加，不再和"关注人名"联动

// 每条订阅记录的专属 token，用于生成"修改绑定信息"的链接（?manage=token）。
// 只在新建 / 编辑保存时生成一次，normalize 时不会重新生成——否则每次从云端
// 拉取数据都会换一个新 token，之前发出去的修改链接就全部失效了。
function genSubscriberToken() {
  return 'sub' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// 数据结构：每条订阅记录只有一个 name（管理员添加时指定的人名），不再是
// watchNames 数组，也不再跟"人名排班提醒"（settings.watchNames）联动。
// 匹配规则：本周排班（主领/证道/祷告/服侍）里出现了这个 name，就发提醒；
// 没出现就不发。name 留空的（极少数老数据）视为"通用订阅"，始终发送。
function normalizeReminderSubscribers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map(item => ({
    email: String(item?.email || '').trim().toLowerCase(),
    name: String(item?.name || (Array.isArray(item?.watchNames) ? item.watchNames[0] : '') || '').trim(),
    token: String(item?.token || '').trim(),
    addedAt: item?.addedAt || new Date().toISOString(),
  })).filter(item => {
    if (!item.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) return false;
    if (seen.has(item.email)) return false;
    seen.add(item.email);
    return true;
  });
}
async function fetchReminderSubscribersFromRemote() {
  if (!initSupabaseClient()) return reminderSubscribers;
  const { data, error } = await supabaseClient
    .from(SUPABASE_CONFIG.table)
    .select('reminder_subscribers')
    .eq('id', SUPABASE_CONFIG.rowId)
    .maybeSingle();
  if (error) throw error;
  reminderSubscribers = normalizeReminderSubscribers(data?.reminder_subscribers);
  return reminderSubscribers;
}

// ── 批量导入邮箱提醒（管理员统一添加，唯一的添加入口）──────────
// 解析一行输入，支持"姓名 邮箱" / "姓名,邮箱" / "邮箱 姓名" / "邮箱,姓名"，
// 中英文逗号、空格、顿号都认。一行里找到一个合法邮箱，剩下的部分当作姓名。
// 姓名是必填的——没有姓名就没法判断"本周排班里有没有这个人"，这条记录会被跳过。
function parseBulkReminderLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[,，、\s]+/).filter(Boolean);
  if (!parts.length) return null;
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const email = parts.find(p => emailRe.test(p));
  if (!email) return null;
  const name = parts.filter(p => p !== email).join(' ').trim();
  if (!name) return null;
  return { email: email.trim().toLowerCase(), name };
}

// ── 已导入邮箱列表展示 + 按条发送 ─────────────────────
// 拼出"修改绑定信息"的专属链接：当前页面地址 + ?manage=token。
function buildManageLink(token) {
  return `${location.origin}${location.pathname}?manage=${encodeURIComponent(token)}`;
}

// 从远端重新拉一次订阅名单并刷新列表显示（打开设置页/点"刷新"按钮时调用）
async function loadReminderSubscribersList() {
  try {
    await fetchReminderSubscribersFromRemote();
    renderReminderSubscribersListUI();
  } catch (e) {
    console.error('加载订阅列表失败', e);
    showToast('加载订阅列表失败，请检查网络后重试');
  }
}

// 把当前内存里的 reminderSubscribers 渲染成列表，每条带一个"发送"按钮
function renderReminderSubscribersListUI() {
  const wrap = document.getElementById('reminderSubscribersListWrap');
  const countEl = document.getElementById('reminderSubscriberCount');
  if (!wrap) return;
  if (countEl) countEl.textContent = reminderSubscribers.length;
  if (!reminderSubscribers.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:#bbb;padding:8px 0">暂无已导入的邮箱</div>';
    return;
  }
  wrap.innerHTML = reminderSubscribers.map(s => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#fff;border:1px solid #eee;border-radius:8px">
      <div style="min-width:0;flex:1;overflow:hidden">
        <div style="font-size:13px;font-weight:600;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.name || '（未填姓名）')}</div>
        <div style="font-size:12px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.email)}</div>
      </div>
      <div style="flex:none;display:flex;gap:6px">
        <button class="name-add-btn" style="padding:5px 10px;font-size:12px" data-token="${escapeHtml(s.token)}" onclick="sendSingleWelcomeEmail(this.dataset.token, this)">发送</button>
        <button class="name-add-btn" style="padding:5px 10px;font-size:12px;background:#3B5BDB" data-token="${escapeHtml(s.token)}" onclick="sendScheduleOnlyEmail(this.dataset.token, this)">发排班</button>
      </div>
    </div>
  `).join('');
}

// 按条发送：给这一个订阅者发一封邮件（跟批量发送用同一个 Edge Function，
// 只是走单个模式，不带 mode:"batchAll"）。
// type 为空：发"订阅成功"确认邮件（原来的"发送"按钮）；
// type 为 "scheduleOnly"：只发"本周是否有排班"+"本月排班明细"，不含订阅/
// 欢迎文案（"发排班"按钮）。失败会自动重试一次，不需要手动再点一次。
async function sendSingleReminderEmail(token, btnEl, type) {
  const sub = reminderSubscribers.find(s => s.token === token);
  if (!sub) { showToast('没有找到这条订阅记录，请先点"刷新"'); return; }
  if (!isSupabaseEnabled()) { showToast('未配置 Supabase，无法发送'); return; }
  const originalText = btnEl ? btnEl.textContent : '';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '发送中…'; }
  const manageUrl = sub.token ? buildManageLink(sub.token) : '';
  const doSend = async () => {
    const resp = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'apikey': SUPABASE_CONFIG.anonKey,
      },
      body: JSON.stringify({ email: sub.email, name: sub.name || '', manageUrl, type: type || undefined }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  };
  try {
    await doSend();
    showToast(`✅ 已发送给 ${sub.email}`);
  } catch (e) {
    // 第一次失败：先提示"发送失败"，然后自动重试一次，不需要用户手动再点一次
    console.error('发送提醒邮件失败，准备自动重试', e);
    showToast(`⚠️ 发送失败：${sub.email}，正在自动重试…`);
    if (btnEl) btnEl.textContent = '重试中…';
    try {
      await doSend();
      showToast(`✅ 重试成功，已发送给 ${sub.email}`);
    } catch (e2) {
      console.error('自动重试后仍然发送失败', e2);
      showToast(`❌ 发送失败：${sub.email}（已自动重试一次），请检查 Edge Function 是否已部署`);
    }
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = originalText; }
  }
}
function sendSingleWelcomeEmail(token, btnEl) {
  return sendSingleReminderEmail(token, btnEl, '');
}
function sendScheduleOnlyEmail(token, btnEl) {
  return sendSingleReminderEmail(token, btnEl, 'scheduleOnly');
}

async function bulkImportReminderSubscribers() {
  const input = document.getElementById('bulkReminderInput');
  const errEl = document.getElementById('bulkReminderError');
  const listEl = document.getElementById('bulkReminderList');
  const raw = input?.value || '';
  const lines = raw.split('\n');
  const parsed = [];
  const invalidLines = [];
  lines.forEach(line => {
    if (!line.trim()) return;
    const item = parseBulkReminderLine(line);
    if (item) parsed.push(item);
    else invalidLines.push(line.trim());
  });
  if (errEl) errEl.classList.remove('show');
  if (!parsed.length) {
    if (errEl) { errEl.textContent = '没有解析到有效的记录，请检查格式（每行：姓名 邮箱，姓名必填）'; errEl.classList.add('show'); }
    return;
  }
  try {
    await fetchReminderSubscribersFromRemote();
    let added = 0, updated = 0;
    parsed.forEach(({ email, name }) => {
      const existing = reminderSubscribers.find(s => s.email === email);
      if (existing) {
        existing.name = name;
        if (!existing.token) existing.token = genSubscriberToken();
        updated++;
      } else {
        reminderSubscribers.push({
          email,
          name,
          token: genSubscriberToken(),
          addedAt: new Date().toISOString(),
        });
        added++;
      }
    });
    await syncRemoteField('reminder_subscribers', reminderSubscribers);
    if (input) input.value = '';
    showToast(`✅ 导入完成：新增 ${added} 个，更新 ${updated} 个${invalidLines.length ? `，${invalidLines.length} 行未能识别` : ''}`);
    if (listEl) listEl.textContent = invalidLines.length ? `未能识别的行（姓名或邮箱缺失）：${invalidLines.join(' ／ ')}` : '';
    renderReminderSubscribersListUI();
  } catch (e) {
    console.error('批量导入邮箱提醒失败', e);
    if (isMissingRemoteColumnError(e, 'reminder_subscribers')) {
      showToast('后端缺少 reminder_subscribers 字段，请先执行修复 SQL');
    } else {
      showToast('批量导入失败，请检查网络后重试');
    }
  }
}

// 调一次批量发送请求。onlyEmails 传了就只给这几个邮箱发（自动重试用），
// 不传就是发给全部订阅者。type 为空发"订阅成功"邮件；type 为 "scheduleOnly"
// 发"仅排班提醒"邮件。
async function requestBatchReminderEmails(type, onlyEmails) {
  const reqBody = { mode: 'batchAll', siteUrl: `${location.origin}${location.pathname}` };
  if (type) reqBody.type = type;
  if (Array.isArray(onlyEmails) && onlyEmails.length) reqBody.onlyEmails = onlyEmails;
  const resp = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/send-welcome-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
      'apikey': SUPABASE_CONFIG.anonKey,
    },
    body: JSON.stringify(reqBody),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

// 手动触发一次批量发送，发给当前订阅列表里的所有邮箱（不只是刚导入的）。
// 实际发信在 Edge Function 里按顺序完成（跟 weekly-reminder 一样，避免个人邮箱
// SMTP 并发被限流），这里只是发一个"批量模式"的请求。
// 如果有发送失败的邮箱，会自动只对失败的那几个重试一次，不需要把全部人再发一遍。
async function triggerBatchReminderEmails(type, confirmText, doneLabel, failLogLabel) {
  if (!isSupabaseEnabled()) { showToast('未配置 Supabase，无法发送'); return; }
  if (!confirm(confirmText)) return;
  const listEl = document.getElementById('bulkReminderList');
  showToast('⏳ 正在批量发送，请稍候…');
  try {
    const first = await requestBatchReminderEmails(type);
    let totalSent = first.sent || 0;
    let finalFailed = Array.isArray(first.failed) ? first.failed : [];

    if (finalFailed.length) {
      showToast(`⚠️ ${finalFailed.length} 个发送失败，正在自动重试…`);
      try {
        const retryEmails = finalFailed.map(f => f.email);
        const retry = await requestBatchReminderEmails(type, retryEmails);
        totalSent += retry.sent || 0;
        finalFailed = Array.isArray(retry.failed) ? retry.failed : [];
      } catch (retryErr) {
        // 重试这次请求本身失败了（比如网络问题），保留第一次的失败列表不变
        console.error('批量重试请求失败', retryErr);
      }
    }

    showToast(`✅ ${doneLabel}完成：成功 ${totalSent} 个${finalFailed.length ? `，失败 ${finalFailed.length} 个（已自动重试）` : ''}`);
    if (listEl) {
      listEl.textContent = finalFailed.length ? `发送失败：${finalFailed.map(f => f.email).join(' ／ ')}` : '';
    }
    loadReminderSubscribersList();
  } catch (e) {
    console.error(failLogLabel, e);
    showToast('批量发送失败，请检查 Edge Function 是否已部署');
  }
}
function triggerBatchWelcomeEmails() {
  return triggerBatchReminderEmails('', '确认要给当前订阅列表里的所有邮箱都发一遍"订阅成功"提醒吗？', '批量发送', '批量发送订阅成功提醒失败');
}
function triggerBatchScheduleEmails() {
  return triggerBatchReminderEmails('scheduleOnly', '确认要给当前订阅列表里的所有邮箱都发一遍"排班提醒"吗？', '批量发送', '批量发送排班提醒失败');
}

// ── 通过专属链接修改邮箱绑定信息 ──────────────────────
// 打开 “xxx?manage=token” 这样的链接时，弹窗展示这条订阅记录的邮箱/姓名，
// 可以直接修改或取消订阅，不需要登录。
let manageSubCurrent = null; // { email, name, token, addedAt }

async function checkManageLinkFromUrl() {
  let token = '';
  try {
    token = new URLSearchParams(location.search).get('manage') || '';
  } catch (e) { return; }
  if (!token) return;
  try {
    await fetchReminderSubscribersFromRemote();
    const sub = reminderSubscribers.find(s => s.token === token);
    if (!sub) { showToast('没有找到对应的订阅信息，链接可能已失效'); return; }
    openManageSubModal(sub);
  } catch (e) {
    console.error('读取订阅信息失败', e);
    showToast('读取订阅信息失败，请检查网络后重试');
  }
}

function openManageSubModal(sub) {
  manageSubCurrent = {
    email: sub.email,
    name: sub.name || '',
    token: sub.token,
    addedAt: sub.addedAt,
  };
  const emailInput = document.getElementById('manageSubEmailInput');
  const nameInput = document.getElementById('manageSubNameInput');
  if (emailInput) emailInput.value = manageSubCurrent.email;
  if (nameInput) nameInput.value = manageSubCurrent.name;
  const errEl = document.getElementById('manageSubError');
  if (errEl) errEl.classList.remove('show');
  document.getElementById('manageSubOverlay').classList.add('open');
}
function closeManageSubModal(e) {
  if (!e || e.target === document.getElementById('manageSubOverlay')) {
    document.getElementById('manageSubOverlay').classList.remove('open');
  }
}
async function saveManageSubModal() {
  if (!manageSubCurrent) return;
  const emailInput = document.getElementById('manageSubEmailInput');
  const nameInput = document.getElementById('manageSubNameInput');
  const errEl = document.getElementById('manageSubError');
  const newEmail = (emailInput?.value || '').trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    if (errEl) { errEl.textContent = '请输入有效的邮箱地址'; errEl.classList.add('show'); }
    return;
  }
  if (errEl) errEl.classList.remove('show');
  try {
    await fetchReminderSubscribersFromRemote();
    const nextRecord = {
      email: newEmail,
      name: (nameInput?.value || '').trim(),
      token: manageSubCurrent.token,
      addedAt: manageSubCurrent.addedAt || new Date().toISOString(),
    };
    // 用 token 定位这条记录（邮箱可能改了，不能再按旧邮箱找）；
    // 如果改成了另一个已存在的邮箱，去掉那条旧记录，避免同一个邮箱出现两条
    reminderSubscribers = reminderSubscribers.filter(s => s.token !== manageSubCurrent.token && s.email !== newEmail);
    reminderSubscribers.push(nextRecord);
    await syncRemoteField('reminder_subscribers', reminderSubscribers);
    manageSubCurrent = nextRecord;
    showToast('✅ 已保存修改');
    closeManageSubModal();
  } catch (e) {
    console.error('保存订阅信息失败', e);
    showToast('保存失败，请检查网络后重试');
  }
}
async function unsubscribeFromManageModal() {
  if (!manageSubCurrent) return;
  if (!confirm('确定要取消这个邮箱的提醒订阅吗？')) return;
  try {
    await fetchReminderSubscribersFromRemote();
    reminderSubscribers = reminderSubscribers.filter(s => s.token !== manageSubCurrent.token);
    await syncRemoteField('reminder_subscribers', reminderSubscribers);
    showToast('已取消邮箱提醒订阅');
    closeManageSubModal();
  } catch (e) {
    console.error('取消订阅失败', e);
    showToast('取消订阅失败，请检查网络后重试');
  }
}

const LS_SUNDAY_REMINDER = 'churchSundayReminderShown';
function checkSundayReminder(){
  const today=new Date();
  if(today.getDay()!==0) return;
  const todayKey=`${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;
  try{
    if(localStorage.getItem(LS_SUNDAY_REMINDER)===todayKey) return;
    localStorage.setItem(LS_SUNDAY_REMINDER, todayKey);
  }catch(e){}
  const overlay=document.getElementById('sundayReminderOverlay');
  if(overlay) overlay.classList.add('open');
}
function closeSundayReminder(e){
  if(!e || e.target===document.getElementById('sundayReminderOverlay')){
    document.getElementById('sundayReminderOverlay').classList.remove('open');
  }
}
const LS_SATURDAY_REMINDER = 'churchSaturdayReminderShown';
function checkSaturdayReminder(){
  const today=new Date();
  if(today.getDay()!==6) return;
  const todayKey=`${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;
  try{
    if(localStorage.getItem(LS_SATURDAY_REMINDER)===todayKey) return;
    localStorage.setItem(LS_SATURDAY_REMINDER, todayKey);
  }catch(e){}
  const overlay=document.getElementById('saturdayReminderOverlay');
  if(overlay) overlay.classList.add('open');
}
function closeSaturdayReminder(e){
  if(!e || e.target===document.getElementById('saturdayReminderOverlay')){
    document.getElementById('saturdayReminderOverlay').classList.remove('open');
  }
}
function updateLeaveBadge() {
  // Leave entry now lives in Settings (guests) / the admin dropdown menu (admins) instead of
  // its own top-bar button, so this only needs to keep the admin menu badge in sync.
  const menuBtn = document.getElementById('adminMenuBtn');
  const menuBtnDot = document.getElementById('adminMenuBadgeDot');
  const menuItemBadge = document.getElementById('leaveMenuBadge');
  if (!isAdmin) return;
  const n = pendingLeaveCount();
  const label = n > 99 ? '99+' : String(n);
  if (menuBtn) { menuBtn.title = n > 0 ? `管理（请假 ${n} 条待处理）` : '管理'; menuBtn.setAttribute('aria-label', menuBtn.title); }
  if (menuBtnDot) { menuBtnDot.textContent = label; menuBtnDot.classList.toggle('show', n > 0); }
  if (menuItemBadge) { menuItemBadge.textContent = label; menuItemBadge.classList.toggle('show', n > 0); }
}

// Entry button routes to the right modal depending on role
function openLeaveEntry() {
  if (isAdmin) { openLeaveList(); return; }
  leaveDraftKey = toKey(selectedSunday || getCurrentWeekSunday());
  leaveDraftRole = null; leaveDraftName = null;
  document.getElementById('leaveFormBox').style.display = '';
  document.getElementById('leaveSuccessBox').classList.remove('show');
  document.getElementById('leaveReasonInput').value = '';
  document.getElementById('leaveFormError').classList.remove('show');
  document.getElementById('leaveDateInput').value = leaveDraftKey;
  renderLeaveShiftPickGrid();
  document.getElementById('leaveOverlay').classList.add('open');
}
function closeLeaveEntry(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('leaveOverlay').classList.remove('open');
}
function onLeaveDateChange() {
  const val = document.getElementById('leaveDateInput').value;
  if (!val) return;
  leaveDraftKey = val; leaveDraftRole = null; leaveDraftName = null;
  document.getElementById('leaveNameField').style.display = 'none';
  renderLeaveShiftPickGrid();
}
function renderLeaveShiftPickGrid() {
  const grid = document.getElementById('leaveShiftPickGrid');
  const shifts = scheduleData[leaveDraftKey] || [];
  if (!shifts.length) {
    grid.innerHTML = `<div class="leave-shift-pick-empty"><i class="ti ti-calendar-off" style="font-size:24px;display:block;margin-bottom:6px;color:#ddd"></i>该主日暂无排班</div>`;
    document.getElementById('leaveNameField').style.display = 'none';
    return;
  }
  grid.innerHTML = shifts.map(s => {
    const col = roleColors[s.role] || { bg: '#f0f0ee', text: '#444', badgeBg: '#888', badgeText: '#fff', icon: 'ti-user' };
    const sel = leaveDraftRole === s.role ? ' selected' : '';
    return `<div class="leave-shift-pick-item${sel}" onclick="pickLeaveShift('${s.role}')">
      <div class="leave-shift-pick-badge" style="background:${col.badgeBg}"><i class="ti ${col.icon}" style="color:${col.badgeText}"></i></div>
      <div><div class="leave-shift-pick-role">${s.role}</div><div class="leave-shift-pick-names">${escapeHtml(s.persons.join(' / '))}</div></div>
    </div>`;
  }).join('');
  if (leaveDraftRole) renderLeaveNameChips();
}
function pickLeaveShift(role) {
  leaveDraftRole = role; leaveDraftName = null;
  renderLeaveShiftPickGrid();
  renderLeaveNameChips();
}
function renderLeaveNameChips() {
  const field = document.getElementById('leaveNameField');
  const wrap = document.getElementById('leaveNameChipGrid');
  const shift = (scheduleData[leaveDraftKey] || []).find(s => s.role === leaveDraftRole);
  if (!shift) { field.style.display = 'none'; return; }
  field.style.display = '';
  wrap.innerHTML = shift.persons.map((p, idx) => {
    const sel = leaveDraftName === p ? ' selected' : '';
    return `<div class="leave-name-chip${sel}" data-idx="${idx}" onclick="pickLeaveNameByIdx(this)">${escapeHtml(p)}</div>`;
  }).join('');
}
function pickLeaveNameByIdx(el) {
  const idx = Number(el.getAttribute('data-idx'));
  const shift = (scheduleData[leaveDraftKey] || []).find(s => s.role === leaveDraftRole);
  if (!shift || !shift.persons[idx]) return;
  leaveDraftName = shift.persons[idx];
  renderLeaveNameChips();
}
function sendLeaveRequestNotification(item) {
  if (!isAdmin) return; // 只提醒当前设备上的管理员，避免提交者收到"自己发给自己"的通知
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const dateStr = formatLeaveDateLabel(item.key);
  new Notification('📋 收到新的请假申请', {
    body: `${item.name}（${item.role}）申请 ${dateStr} 请假${item.reason ? '：' + item.reason : ''}`,
    tag: 'leave-request-' + item.id,
  });
}
async function submitLeaveRequest() {
  const errEl = document.getElementById('leaveFormError');
  if (!leaveDraftKey || !leaveDraftRole || !leaveDraftName) {
    errEl.classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  const reason = document.getElementById('leaveReasonInput').value.trim();
  const item = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    key: leaveDraftKey,
    role: leaveDraftRole,
    name: leaveDraftName,
    reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  leaveRequests.unshift(item);
  persistLeaveRequests();
  updateLeaveBadge();
  document.getElementById('leaveFormBox').style.display = 'none';
  document.getElementById('leaveSuccessBox').classList.add('show');
  sendLeaveRequestNotification(item);
  await syncLeaveRequestsToRemote();
}

// ── Leave requests (admin review) ─────────────────────
function openLeaveList() {
  setLeaveListFilter('pending');
  const hint = document.getElementById('leaveNotifHint');
  if (hint) {
    const canPrompt = ('Notification' in window) && Notification.permission === 'default';
    hint.classList.toggle('show', canPrompt);
  }
  document.getElementById('leaveListOverlay').classList.add('open');
}
function closeLeaveList(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('leaveListOverlay').classList.remove('open');
}
function setLeaveListFilter(filter) {
  leaveListFilter = filter;
  ['pending', 'approved', 'all'].forEach(f => {
    const btn = document.getElementById('leaveFilter' + f.charAt(0).toUpperCase() + f.slice(1));
    if (btn) btn.classList.toggle('active', f === filter);
  });
  renderLeaveList();
}
function formatLeaveDateLabel(key) {
  if (!key) return '';
  const [, m, dd] = key.split('-');
  return `${parseInt(m)}月${parseInt(dd)}日（周日）`;
}
function formatLeaveCreatedAt(iso) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 提交`;
  } catch (e) { return ''; }
}
function renderLeaveList() {
  const body = document.getElementById('leaveListBody');
  let items = leaveRequests.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (leaveListFilter === 'pending') items = items.filter(r => r.status === 'pending');
  else if (leaveListFilter === 'approved') items = items.filter(r => r.status === 'approved');
  if (!items.length) {
    body.innerHTML = `<div class="leave-list-empty"><i class="ti ti-mood-empty"></i>暂无${leaveListFilter === 'pending' ? '待处理的' : ''}请假申请</div>`;
    return;
  }
  const statusLabel = { pending: '待处理', approved: '已批准', declined: '已拒绝' };
  body.innerHTML = items.map(r => {
    const col = roleColors[r.role] || { badgeBg: '#888', badgeText: '#fff', icon: 'ti-user' };
    const actions = r.status === 'pending'
      ? `<div class="leave-list-actions">
           <button class="leave-list-btn approve" onclick="approveLeaveRequest('${r.id}')"><i class="ti ti-check"></i>批准</button>
           <button class="leave-list-btn decline" onclick="declineLeaveRequest('${r.id}')">拒绝</button>
           <button class="leave-list-btn goto" onclick="gotoLeaveShift('${r.id}')">前往排班</button>
         </div>`
      : r.status === 'approved'
      ? `<div class="leave-list-actions">
           <button class="leave-list-btn goto" onclick="gotoLeaveShift('${r.id}')">前往排班</button>
           <button class="leave-list-btn" onclick="unmarkLeaveRequest('${r.id}')">撤销标签</button>
         </div>`
      : `<div class="leave-list-actions">
           <button class="leave-list-btn goto" onclick="gotoLeaveShift('${r.id}')">查看排班</button>
         </div>`;
    return `<div class="leave-list-item ${r.status}">
      <div class="leave-list-head">
        <span class="leave-list-who">${escapeHtml(r.name)}</span>
        <span class="leave-list-status ${r.status}">${statusLabel[r.status]}</span>
      </div>
      <div class="leave-list-meta">
        <span class="leave-list-role-badge" style="background:${col.badgeBg};color:${col.badgeText}"><i class="ti ${col.icon}"></i>${r.role}</span>
        <span class="leave-list-date">${formatLeaveDateLabel(r.key)}</span>
      </div>
      ${r.reason ? `<div class="leave-list-reason">${escapeHtml(r.reason)}</div>` : ''}
      <div class="leave-list-when">${formatLeaveCreatedAt(r.createdAt)}</div>
      ${actions}
    </div>`;
  }).join('');
}
async function syncScheduleStateWithRemote(successMsg) {
  if (!initSupabaseClient()) return false;
  try {
    await upsertRemoteAppState({
      schedule_data: normalizeScheduleData(scheduleData),
    });
    if (successMsg) showToast(successMsg);
    return true;
  } catch (e) {
    console.error('同步排班失败', e);
    showToast('请假标注已保存到本地，但云端同步失败');
    return false;
  }
}
function markShiftPersonOnLeave(key, role, name) {
  const rows = scheduleData[key];
  if (!Array.isArray(rows)) return false;
  const shift = rows.find(s => s.role === role);
  if (!shift) return false;
  if (!shift.persons.includes(name)) return false; // 该人已不在此岗位，无需标记
  const cur = Array.isArray(shift.leavePersons) ? shift.leavePersons : [];
  if (!cur.includes(name)) shift.leavePersons = uniqPeople([...cur, name]);
  return true;
}
function clearShiftLeaveTag(key, role, name) {
  const rows = scheduleData[key];
  if (!Array.isArray(rows)) return;
  const shift = rows.find(s => s.role === role);
  if (!shift || !Array.isArray(shift.leavePersons)) return;
  shift.leavePersons = shift.leavePersons.filter(n => n !== name);
}
async function approveLeaveRequest(id) {
  const r = leaveRequests.find(x => x.id === id);
  if (!r) return;
  r.status = 'approved';
  persistLeaveRequests();
  const marked = markShiftPersonOnLeave(r.key, r.role, r.name);
  updateLeaveBadge();
  renderLeaveList();
  render();
  showToast(marked
    ? `✅ 已批准 ${r.name} 的请假申请，排班卡片已标注，请尽快安排替补`
    : `✅ 已批准 ${r.name} 的请假申请`);
  await syncLeaveRequestsToRemote();
  if (marked) await syncScheduleStateWithRemote('☁️ 请假标注已同步到云端');
}
async function unmarkLeaveRequest(id) {
  const r = leaveRequests.find(x => x.id === id);
  if (!r) return;
  clearShiftLeaveTag(r.key, r.role, r.name);
  render();
  renderLeaveList();
  showToast(`已撤销 ${r.name} 在排班卡片上的请假标签`);
  await syncScheduleStateWithRemote();
}
async function declineLeaveRequest(id) {
  const r = leaveRequests.find(x => x.id === id);
  if (!r) return;
  r.status = 'declined';
  persistLeaveRequests();
  updateLeaveBadge();
  renderLeaveList();
  await syncLeaveRequestsToRemote();
}
function gotoLeaveShift(id) {
  const r = leaveRequests.find(x => x.id === id);
  if (!r) return;
  closeLeaveList();
  const d = new Date(r.key + 'T00:00:00');
  if (!isNaN(d)) { selectedSunday = d; render(); }
  if (isAdmin) {
    setTimeout(() => openEditDrawer(r.role, r.key), 150);
  }
}

// ── Watch names ───────────────────────────────────────
function renderNameTags() {
  const wrap = document.getElementById('nameTagsList');
  if (!settings.watchNames.length) {
    wrap.innerHTML = '<span style="font-size:13px;color:#bbb">暂未添加关注人名</span>';
    return;
  }
  wrap.innerHTML = settings.watchNames.map((name, i) =>
    `<div class="name-tag">${name}<button class="name-tag-remove" onclick="removeWatchName(${i})"><i class="ti ti-x"></i></button></div>`
  ).join('');
}

function addWatchName() {
  const inp = document.getElementById('nameAddInput');
  const name = inp.value.trim();
  if (!name) return;
  if (!settings.watchNames.includes(name)) {
    settings.watchNames.push(name);
    saveSettings();
  }
  inp.value = '';
  renderNameTags();
}

function removeWatchName(idx) {
  settings.watchNames.splice(idx, 1);
  saveSettings();
  renderNameTags();
}

// ── Name reminder banner ──────────────────────────────
function checkNameReminder(key) {
  const banner = document.getElementById('nameReminderBanner');
  const rowsEl = document.getElementById('nameReminderRows');
  if (!settings.watchNames.length) { banner.classList.remove('visible'); return; }

  const shifts = scheduleData[key] || [];
  const matches = [];
  settings.watchNames.forEach(name => {
    shifts.forEach(s => {
      if (s.persons.some(p => p.includes(name) || name.includes(p))) {
        matches.push({ name, role: s.role, persons: s.persons.join(' / ') });
      }
    });
  });

  if (!matches.length) { banner.classList.remove('visible'); return; }

  rowsEl.innerHTML = matches.map(m =>
    `<div class="nrb-row"><strong>${m.name}</strong> · ${m.role}<span>${m.persons}</span></div>`
  ).join('');
  banner.classList.add('visible');

  // Browser push notification
  sendPushNotification(matches, key);
}

// ── Browser push notification ─────────────────────────
function updateNotifStatus() {
  const el = document.getElementById('notifStatus');
  if (!('Notification' in window)) {
    el.textContent = '不支持'; el.className = 'notif-status denied'; return;
  }
  const p = Notification.permission;
  if (p === 'granted') { el.textContent = '已授权'; el.className = 'notif-status granted'; }
  else if (p === 'denied') { el.textContent = '已拒绝'; el.className = 'notif-status denied'; }
  else { el.textContent = '未授权'; el.className = 'notif-status'; }
}

function requestNotifPermission() {
  if (!('Notification' in window)) { alert('您的浏览器不支持推送通知'); return; }
  if (Notification.permission === 'denied') { alert('通知权限已被拒绝，请在浏览器设置中手动开启'); return; }
  Notification.requestPermission().then(p => {
    updateNotifStatus();
    if (p === 'granted') {
      new Notification('🎉 通知已开启', { body: '当本周排班包含关注人名时将自动提醒', icon: '' });
    }
  });
}

let lastNotifKey = null;
function sendPushNotification(matches, key) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (lastNotifKey === key) return; // only once per date key
  lastNotifKey = key;
  const names = [...new Set(matches.map(m => m.name))].join('、');
  const roles = matches.map(m => `${m.name}（${m.role}）`).join(' · ');
  const d = new Date(key + 'T00:00:00');
  const dateStr = `${d.getMonth()+1}月${d.getDate()}日`;
  new Notification(`📅 ${dateStr} 有你的排班`, {
    body: roles,
    tag: 'schedule-reminder-' + key,
  });
}

// ── Init: wrap inner schedule + build desktop center column ──
(function wrapScheduleInner() {
  const main = document.getElementById('mainSchedule');
  if (!main) return;

  // Step 1: wrap the "schedule head + main-card" (the leftover, un-IDed children) into #mainScheduleInner
  let inner = document.getElementById('mainScheduleInner');
  if (!inner) {
    const noticeEl = document.getElementById('noticeSection');
    inner = document.createElement('div');
    inner.id = 'mainScheduleInner';
    const children = Array.from(main.children);
    const sectionIds = new Set(['desktopLeftRail','desktopRightRail','noticeSection','topCardsRow','nameReminderBanner']);
    children.forEach(child => {
      if (!sectionIds.has(child.id)) {
        inner.appendChild(child);
      }
    });
    if (noticeEl) main.insertBefore(inner, noticeEl);
    else main.appendChild(inner);
  }

  // Step 2: build #desktopCenterColumn — a single grid cell (column 2, row 1) that
  // holds notice/banner/sermon/bible/song/schedule stacked via normal block flow,
  // so the desktop 3-column grid never produces an oversized empty row.
  let centerCol = document.getElementById('desktopCenterColumn');
  if (!centerCol) {
    centerCol = document.createElement('div');
    centerCol.id = 'desktopCenterColumn';
    main.insertBefore(centerCol, document.getElementById('desktopLeftRail').nextSibling);
  }
  const centerOrder = ['nameReminderBanner', 'topCardsRow', 'mainScheduleInner'];
  centerOrder.forEach(id => {
    const el = document.getElementById(id);
    if (el) centerCol.appendChild(el);
  });
})();

// ── Override render to include name reminder check ────
const _origRender = render;
// Patch render to also run checkNameReminder
const _patchedRender = function() {
  _origRender();
  const key = toKey(selectedSunday);
  checkNameReminder(key);
  applySectionOrderAndVisibility();
};
// Replace render globally
window.render = _patchedRender;

// ── Bible Bookmarks ───────────────────────────────────
const LS_BOOKMARKS = 'churchBibleBookmarks';

let bibleBookmarks = {}; // key: `${abbr}_${chapter}_${verse}` → { bookAbbr, bookName, chapter, verse, text }

function loadBibleBookmarks() {
  try {
    const raw = localStorage.getItem(LS_BOOKMARKS);
    bibleBookmarks = raw ? JSON.parse(raw) : {};
  } catch(e) { bibleBookmarks = {}; }
}

function saveBibleBookmarks() {
  try { localStorage.setItem(LS_BOOKMARKS, JSON.stringify(bibleBookmarks)); } catch(e) {}
}

function toggleVerseBookmark(bookAbbr, bookName, chapter, verse, text, btn) {
  const key = `${bookAbbr}_${chapter}_${verse}`;
  if (bibleBookmarks[key]) {
    delete bibleBookmarks[key];
    btn.classList.remove('bookmarked');
    btn.innerHTML = '<i class="ti ti-star"></i>';
    showToast('已取消收藏');
  } else {
    bibleBookmarks[key] = { bookAbbr, bookName, chapter, verse, text, savedAt: Date.now() };
    btn.classList.add('bookmarked');
    btn.innerHTML = '<i class="ti ti-star-filled"></i>';
    showToast('⭐ 已收藏该经节');
  }
  saveBibleBookmarks();
}

function openBookmarks() {
  renderBookmarksList();
  document.getElementById('bookmarksOverlay').classList.add('open');
}

function closeBookmarks(e) {
  if (!e || e.target === document.getElementById('bookmarksOverlay'))
    document.getElementById('bookmarksOverlay').classList.remove('open');
}

function renderBookmarksList() {
  const container = document.getElementById('bookmarksList');
  const items = Object.entries(bibleBookmarks)
    .sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
  if (!items.length) {
    container.innerHTML = `<div class="bookmarks-empty"><i class="ti ti-star-off"></i>暂无收藏经节<br><span style="font-size:12px">阅读圣经时点击经节旁的 ⭐ 即可收藏</span></div>`;
    return;
  }
  container.innerHTML = items.map(([key, bm]) => `
    <div class="bookmark-item" id="bmi-${key}">
      <div class="bookmark-ref" style="cursor:pointer" onclick="jumpToBookmark('${bm.bookAbbr}',${bm.chapter})">
        <i class="ti ti-star-filled"></i>
        ${escapeHtml(bm.bookName)} ${bm.chapter}:${bm.verse}
        <span style="font-size:11px;color:#aaa;font-weight:400;margin-left:4px">（点击跳转）</span>
      </div>
      <div class="bookmark-text">${escapeHtml(bm.text)}</div>
      <textarea class="bookmark-note" placeholder="写下你的笔记或感想…"
        oninput="saveBookmarkNote('${key}',this.value)"
        onblur="saveBookmarkNote('${key}',this.value)"
      >${escapeHtml(bm.note || '')}</textarea>
      <div class="bookmark-note-saved" id="bns-${key}">✓ 笔记已保存</div>
      <button class="bookmark-remove-btn" title="删除收藏"
        onclick="removeBookmark('${key}')">
        <i class="ti ti-x"></i>
      </button>
    </div>`).join('');
}

function removeBookmark(key) {
  delete bibleBookmarks[key];
  saveBibleBookmarks();
  renderBookmarksList();
  // update bookmark button state in current view
  const btn = document.querySelector(`.verse-bookmark-btn[onclick*="${key}"]`);
  if (btn) { btn.classList.remove('bookmarked'); btn.innerHTML = '<i class="ti ti-star"></i>'; }
}

function saveBookmarkNote(key, text) {
  if (!bibleBookmarks[key]) return;
  bibleBookmarks[key].note = text;
  saveBibleBookmarks();
  // show saved indicator
  const ind = document.getElementById('bns-' + key);
  if (!ind) return;
  ind.classList.add('show');
  clearTimeout(ind._t);
  ind._t = setTimeout(() => ind.classList.remove('show'), 1800);
}

function jumpToBookmark(bookAbbr, chapter) {
  document.getElementById('bookmarksOverlay').classList.remove('open');
  jumpToBibleLocation(bookAbbr, chapter);
}

// ── Last-read chapter persistence (separate OT / NT) ──
const LS_LAST_READ_OT = 'churchBibleLastReadOT';
const LS_LAST_READ_NT = 'churchBibleLastReadNT';

function saveLastRead(bookAbbr, chapter) {
  const testamentKey = isNewTestamentBook(bookAbbr) ? LS_LAST_READ_NT : LS_LAST_READ_OT;
  try {
    localStorage.setItem(testamentKey, JSON.stringify({ bookAbbr, chapter, ts: Date.now() }));
  } catch(e) {}
  renderBibleProgress();
}

function getLastRead(testament) {
  const lsKey = testament === 'nt' ? LS_LAST_READ_NT : LS_LAST_READ_OT;
  try {
    const raw = localStorage.getItem(lsKey);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function restoreLastRead() {
  // Restore whichever testament was read most recently; default OT if neither exists
  const ot = getLastRead('ot');
  const nt = getLastRead('nt');
  let target = null;
  if (ot && nt) target = (nt.ts || 0) > (ot.ts || 0) ? nt : ot;
  else target = nt || ot;
  if (!target) { renderBibleProgress(); return; }
  const targetTestament = isNewTestamentBook(target.bookAbbr) ? 'nt' : 'ot';
  if(targetTestament !== currentTestament) setTestamentFilter(targetTestament, true);
  const bookSel = document.getElementById('bibleBookSelect');
  if (bookSel && target.bookAbbr) {
    bookSel.value = target.bookAbbr;
    updateBibleChapterOptions(target.chapter);
  }
  renderBibleProgress();
}

function renderBibleProgress() {
  const row = document.getElementById('bibleProgressRow');
  if (!row) return;
  const ot = getLastRead('ot');
  const nt = getLastRead('nt');
  row.innerHTML = [
    renderProgressCard('ot', '旧约读到', ot, '#FAECE7', '#993C1D', 'ti-bookmarks'),
    renderProgressCard('nt', '新约读到', nt, '#B5D4F4', '#185FA5', 'ti-bookmarks'),
  ].join('');
}

function renderProgressCard(testament, label, data, bg, fg, icon) {
  if (!data) {
    return `<div class="bible-progress-card empty">
      <div class="bible-progress-icon" style="background:${bg}"><i class="ti ${icon}" style="color:${fg}"></i></div>
      <div class="bible-progress-text">
        <div class="bible-progress-label">${label}</div>
        <div class="bible-progress-value">尚未阅读</div>
      </div>
    </div>`;
  }
  const book = BIBLE_BOOKS.find(b => b.abbr === data.bookAbbr);
  const bookName = book ? book.name : data.bookAbbr;
  return `<div class="bible-progress-card" onclick="jumpToLastRead('${testament}')">
    <div class="bible-progress-icon" style="background:${bg}"><i class="ti ${icon}" style="color:${fg}"></i></div>
    <div class="bible-progress-text">
      <div class="bible-progress-label">${label}</div>
      <div class="bible-progress-value">${escapeHtml(bookName)} 第${data.chapter}章</div>
    </div>
  </div>`;
}

function jumpToLastRead(testament) {
  const data = getLastRead(testament);
  if (!data) return;
  bibleCollapsed = false;
  const card = document.getElementById('bibleCard');
  if (card) card.classList.remove('collapsed');
  if(testament !== currentTestament) setTestamentFilter(testament, true);
  const bookSel = document.getElementById('bibleBookSelect');
  if (bookSel) {
    bookSel.value = data.bookAbbr;
    updateBibleChapterOptions(data.chapter);
  }
  loadBibleChapter();
}

// ── Clear cache helpers ───────────────────────────────
function showToast(msg, duration=2000) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.75);color:#fff;padding:9px 20px;border-radius:20px;
      font-size:13px;z-index:9999;pointer-events:none;transition:opacity 0.3s;white-space:nowrap;`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.bottom = floatingAudioVisible ? '150px' : '80px';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

function confirmClearBookmarks() {
  if (!Object.keys(bibleBookmarks).length) { showToast('暂无收藏记录'); return; }
  if (!confirm('确定清除所有经文收藏？此操作不可恢复。')) return;
  bibleBookmarks = {};
  saveBibleBookmarks();
  // refresh star buttons
  document.querySelectorAll('.verse-bookmark-btn.bookmarked').forEach(btn => {
    btn.classList.remove('bookmarked'); btn.innerHTML = '<i class="ti ti-star"></i>';
  });
  showToast('✅ 收藏已清除');
}

function confirmClearLastRead() {
  try {
    localStorage.removeItem(LS_LAST_READ_OT);
    localStorage.removeItem(LS_LAST_READ_NT);
  } catch(e) {}
  renderBibleProgress();
  showToast('✅ 阅读记录已清除');
}

function confirmClearAllCache() {
  if (!confirm('确定清除全部缓存并恢复默认设置？所有个人设置、收藏、阅读记录都将被清空。')) return;
  try {
    localStorage.removeItem('churchAppSettings');
    localStorage.removeItem(LS_BOOKMARKS);
    localStorage.removeItem(LS_SERMON_PASSAGES);
    localStorage.removeItem(LS_SERMON_THEMES);
    localStorage.removeItem(LS_SERMON_AUDIO);
    localStorage.removeItem(LS_SERMON_NOTES);
    localStorage.removeItem(LS_SERMON_COLLAPSED);
    localStorage.removeItem(LS_LAST_READ_OT);
    localStorage.removeItem(LS_LAST_READ_NT);
  } catch(e) {}
  showToast('✅ 缓存已清除，即将刷新…');
  setTimeout(() => location.reload(), 1500);
}

// ── Supabase integration ──────────────────────────────
// 使用说明：
// 1. 把下面两个值换成你自己的 Supabase 项目配置
// 2. 在 Supabase 建表：church_app_state
// 3. 建公开存储桶：song-images
// 4. 如需管理员登录，请在 Supabase Auth 中创建管理员账号
const SUPABASE_CONFIG = {
  url: 'https://citorcvisrfqkflwortx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdG9yY3Zpc3JmcWtmbHdvcnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTk4NjQsImV4cCI6MjA5NzQ3NTg2NH0.I1G-oO1T3wfWJ5GcmYejT6Y0x2wAJ0xXRQsIcPVPjos',
  table: 'church_app_state',
  rowId: 1,
  songBucket: 'song-images',
  visitsTable: 'site_visits',
  loginLogsTable: 'login_logs',
};

let supabaseClient = null;

function isSupabaseEnabled() {
  return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey && window.supabase);
}

function initSupabaseClient() {
  if (!isSupabaseEnabled()) return false;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );
  }
  return true;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeRotationConfig(raw) {
  const next = raw && typeof raw === 'object' ? deepClone(raw) : {};
  const removedRaw = next?.removedPeople || {};
  const removedNorm = {};
  ROLES.forEach(r => { removedNorm[r] = Array.isArray(removedRaw[r]) ? removedRaw[r] : []; });
  return {
    leader: {
      base: next?.leader?.base || '',
      list: Array.isArray(next?.leader?.list) ? next.leader.list : [],
    },
    prayer: {
      base: next?.prayer?.base || '',
      list: Array.isArray(next?.prayer?.list) ? next.prayer.list : [],
    },
    peopleByRole: normalizePeopleByRole(next?.peopleByRole || next?.people_by_role),
    removedPeople: removedNorm,
  };
}

function normalizeScheduleData(raw) {
  const next = {};
  const source = raw && typeof raw === 'object' ? raw : {};
  Object.entries(source).forEach(([key, rows]) => {
    if (!Array.isArray(rows)) return;
    next[key] = rows.map(row => {
      const persons = Array.isArray(row?.persons)
        ? row.persons.filter(Boolean)
        : (typeof row?.name === 'string' ? row.name.split('/').map(s => s.trim()).filter(Boolean) : []);
      const leavePersons = Array.isArray(row?.leavePersons) ? row.leavePersons.filter(Boolean) : [];
      return {
        role: row?.role || '',
        name: persons.join('/'),
        persons,
        leavePersons,
      };
    }).filter(row => row.role);
    next[key].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  });
  return next;
}

function normalizeSongData(raw) {
  const next = {};
  const source = raw && typeof raw === 'object' ? raw : {};
  Object.entries(source).forEach(([key, rows]) => {
    next[key] = Array.isArray(rows)
      ? rows.map(item => ({
          title: item?.title || '',
          src: item?.src || item?.image_url || '',
        })).filter(item => item.title || item.src)
      : [];
  });
  return next;
}

function normalizeSimpleMap(raw) {
  return raw && typeof raw === 'object' ? deepClone(raw) : {};
}
function getSermonRemotePayload() {
  return {
    sermon_passages_by_date: deepClone(sermonPassagesByDate),
    sermon_themes_by_date: deepClone(sermonThemesByDate),
    sermon_audio_by_date: deepClone(sermonAudioByDate),
  };
}
function getSupabaseErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.details || error.hint || error.code || '');
}
function isMissingRemoteColumnError(error, columnName) {
  const msg = getSupabaseErrorMessage(error).toLowerCase();
  return !!(msg && columnName && msg.includes(String(columnName).toLowerCase()));
}

function getSharedAppStateSnapshot() {
  return {
    rotation_config: normalizeRotationConfig(rotationConfig),
    sermon_by_date: normalizeSimpleMap(sermonByDate),
    song_data: normalizeSongData(songData),
    schedule_data: normalizeScheduleData(scheduleData),
    sermon_passages_by_date: normalizeSimpleMap(sermonPassagesByDate),
    sermon_themes_by_date: normalizeSimpleMap(sermonThemesByDate),
    sermon_audio_by_date: normalizeSimpleMap(sermonAudioByDate),
    leave_requests: normalizeLeaveRequests(leaveRequests),
    song_library: normalizeSongLibrary(songLibrary),
    reminder_subscribers: normalizeReminderSubscribers(reminderSubscribers),
    song_lib_storage_config: normalizeSongLibSbConfig(songLibSupabaseConfig),
    song_lib_categories: normalizeSongLibCategoryList(songLibCategories),
    song_lib_songbooks: normalizeSongLibSongbookList(songLibSongbooks),
    custom_event_dates: normalizeSimpleMap(customEventDates),
  };
}

function applyRemoteAppState(row) {
  rotationConfig = normalizeRotationConfig(row?.rotation_config || rotationConfig);
  sermonByDate = normalizeSimpleMap(row?.sermon_by_date || sermonByDate);
  songData = normalizeSongData(row?.song_data || songData);
  scheduleData = normalizeScheduleData(row?.schedule_data || scheduleData);
  sermonPassagesByDate = normalizeSimpleMap(row?.sermon_passages_by_date || sermonPassagesByDate);
  sermonThemesByDate = normalizeSimpleMap(row?.sermon_themes_by_date || sermonThemesByDate);
  sermonAudioByDate = normalizeSimpleMap(row?.sermon_audio_by_date || sermonAudioByDate);
  customEventDates = normalizeSimpleMap(row?.custom_event_dates || customEventDates);
  if (row && row.leave_requests !== undefined) {
    leaveRequests = normalizeLeaveRequests(row.leave_requests);
    persistLeaveRequests();
  }
  if (row && row.song_library !== undefined) {
    songLibrary = normalizeSongLibrary(row.song_library);
    persistSongLibrary();
  }
  if (row && row.reminder_subscribers !== undefined) {
    reminderSubscribers = normalizeReminderSubscribers(row.reminder_subscribers);
  }
  if (row && row.song_lib_storage_config !== undefined) {
    songLibSupabaseConfig = normalizeSongLibSbConfig(row.song_lib_storage_config);
    songLibSupabaseClient = null;
    persistSongLibSupabaseConfig();
  }
  if (row && row.song_lib_categories !== undefined) {
    songLibCategories = normalizeSongLibCategoryList(row.song_lib_categories);
    persistSongLibCategories();
  }
  if (row && row.song_lib_songbooks !== undefined) {
    songLibSongbooks = normalizeSongLibSongbookList(row.song_lib_songbooks);
    persistSongLibSongbooks();
  }
  updateLeaveBadge();
}

async function upsertRemoteAppState(partial) {
  if (!initSupabaseClient()) return false;
  const payload = Object.assign({
    id: SUPABASE_CONFIG.rowId,
    updated_at: new Date().toISOString(),
  }, partial);
  const { error } = await supabaseClient
    .from(SUPABASE_CONFIG.table)
    .upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  return true;
}

async function loadRemoteAppState() {
  if (!initSupabaseClient()) return false;
  const { data, error } = await supabaseClient
    .from(SUPABASE_CONFIG.table)
    .select('*')
    .eq('id', SUPABASE_CONFIG.rowId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    // First run: seed peopleByRole with DEFAULT_ALL_PEOPLE before writing to cloud
    seedDefaultPeopleIfEmpty();
    await upsertRemoteAppState(getSharedAppStateSnapshot());
    return true;
  }

  applyRemoteAppState(data);

  // If cloud peopleByRole is empty/missing (e.g. old schema), seed defaults and push up
  seedDefaultPeopleIfEmpty();
  const lib = rotationConfig.peopleByRole;
  const wasEmpty = ROLES.every(r => !(lib[r] || []).length);
  if (wasEmpty) {
    await syncRemoteField('rotation_config', rotationConfig);
  }

  return true;
}

async function syncRemoteField(fieldName, value) {
  if (!initSupabaseClient()) return false;
  const payload = {};
  payload[fieldName] = deepClone(value);
  await upsertRemoteAppState(payload);
  return true;
}

async function syncAuthState() {
  if (!initSupabaseClient()) {
    isAdmin = false;
    updateAdminUI();
    return;
  }
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  isAdmin = !!data?.session;
  updateAdminUI();
}

// ── Visitor tracking & login logs ─────────────────────
const LS_VISITOR_ID = 'churchAppVisitorId';
function getVisitorId() {
  try {
    let id = localStorage.getItem(LS_VISITOR_ID);
    if (!id) {
      id = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(LS_VISITOR_ID, id);
    }
    return id;
  } catch (e) { return 'unknown'; }
}

// 获取访客公网 IP（第三方免费接口，失败时静默返回空字符串，不影响主流程）
async function getPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (!res.ok) return '';
    const data = await res.json();
    return data.ip || '';
  } catch (e) {
    return '';
  }
}

// 记录一次访问（每次打开/刷新页面调用一次），静默失败，不影响主流程
async function recordVisit() {
  if (!initSupabaseClient()) return;
  try {
    const ip = await getPublicIp();
    await supabaseClient.from(SUPABASE_CONFIG.visitsTable).insert({
      path: location.pathname || '/',
      referrer: document.referrer || '',
      user_agent: navigator.userAgent || '',
      visitor_id: getVisitorId(),
      ip_address: ip || null,
    });
  } catch (e) {
    console.error('访客记录写入失败', e);
  }
}

// 记录一次登录尝试（成功或失败），静默失败，不影响登录流程本身
async function recordLoginAttempt(email, success) {
  if (!initSupabaseClient()) return;
  try {
    await supabaseClient.from(SUPABASE_CONFIG.loginLogsTable).insert({
      email: email || '',
      success: !!success,
      user_agent: navigator.userAgent || '',
    });
  } catch (e) {
    console.error('登录记录写入失败', e);
  }
}

// 删除所有 IP 地址未知（null）的访客记录，包含加 ip_address 字段之前留下的旧数据
async function deleteUnknownVisits() {
  if (!initSupabaseClient()) return;
  if (!confirm('确定要删除所有 IP 地址未知的访客记录吗？此操作不可撤销。')) return;
  const btn = document.getElementById('deleteUnknownVisitsBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i><span>删除中…</span>'; }
  try {
    const { error, count } = await supabaseClient
      .from(SUPABASE_CONFIG.visitsTable)
      .delete({ count: 'exact' })
      .is('ip_address', null);
    if (error) throw error;
    showToast(`已删除 ${count ?? 0} 条 IP 未知的访客记录`);
    await refreshAdminData();
  } catch (e) {
    console.error('删除 IP 未知访客记录失败', e);
    showToast('删除失败，请稍后重试');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-trash"></i><span>删除 IP 未知的访客记录</span>'; }
  }
}

let adminDataTab = 'visits';
let adminDataLoaded = false;

function openAdminData() {
  document.getElementById('adminDataOverlay').classList.add('open');
  adminDataTab = 'visits';
  switchAdminDataTab('visits');
  refreshAdminData();
}
function closeAdminData(e) {
  if (!e || e.target === document.getElementById('adminDataOverlay'))
    document.getElementById('adminDataOverlay').classList.remove('open');
}
function switchAdminDataTab(tab) {
  adminDataTab = tab;
  document.getElementById('adminDataTabVisits').classList.toggle('active', tab === 'visits');
  document.getElementById('adminDataTabLogins').classList.toggle('active', tab === 'logins');
  document.getElementById('adminDataVisitsPane').style.display = tab === 'visits' ? 'flex' : 'none';
  document.getElementById('adminDataLoginsPane').style.display = tab === 'logins' ? 'flex' : 'none';
  const delBtn = document.getElementById('deleteUnknownVisitsBtn');
  if (delBtn) delBtn.style.display = tab === 'visits' ? 'flex' : 'none';
}

async function refreshAdminData() {
  const loadingEl = document.getElementById('adminDataLoading');
  const summaryEl = document.getElementById('adminDataSummary');
  const visitsPane = document.getElementById('adminDataVisitsPane');
  const loginsPane = document.getElementById('adminDataLoginsPane');
  if (!initSupabaseClient()) {
    loadingEl.textContent = '云端未配置，无法读取访客与登录记录';
    return;
  }
  loadingEl.style.display = 'block';
  loadingEl.textContent = '加载中…';
  visitsPane.innerHTML = '';
  loginsPane.innerHTML = '';
  try {
    const [visitsRes, loginsRes, totalRes, todayRes] = await Promise.all([
      supabaseClient.from(SUPABASE_CONFIG.visitsTable).select('*').order('created_at', { ascending: false }).limit(200),
      supabaseClient.from(SUPABASE_CONFIG.loginLogsTable).select('*').order('created_at', { ascending: false }).limit(200),
      supabaseClient.from(SUPABASE_CONFIG.visitsTable).select('*', { count: 'exact', head: true }),
      supabaseClient.from(SUPABASE_CONFIG.visitsTable).select('*', { count: 'exact', head: true }).gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
    ]);
    if (visitsRes.error) throw visitsRes.error;
    if (loginsRes.error) throw loginsRes.error;

    const visits = visitsRes.data || [];
    const logins = loginsRes.data || [];

    // 优先按设备（visitor_id）去重：同一部手机/浏览器换了不同 IP（比如切换 WiFi/流量）
    // 也会被合并成一条，只展示最近一次访问；只有没有 visitor_id 的旧数据才退回用 IP 分组。
    const visitCountByKey = {};
    const ipsByKey = {};
    visits.forEach(v => {
      const key = v.visitor_id || v.ip_address || 'unknown';
      visitCountByKey[key] = (visitCountByKey[key] || 0) + 1;
      if (v.ip_address) {
        if (!ipsByKey[key]) ipsByKey[key] = new Set();
        ipsByKey[key].add(v.ip_address);
      }
    });
    const seenKeys = new Set();
    const dedupedVisits = [];
    visits.forEach(v => {
      const key = v.visitor_id || v.ip_address || 'unknown';
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      dedupedVisits.push(v);
    });
    const uniqueVisitors = dedupedVisits.length;

    summaryEl.innerHTML = `
      <span>累计访问：<b>${totalRes.count ?? visits.length}</b> 次</span>
      <span>今日访问：<b>${todayRes.count ?? '-'}</b> 次</span>
      <span>近期独立访客（按设备）：<b>${uniqueVisitors}</b> 人</span>
      <span>登录记录：<b>${logins.length}</b> 条</span>
    `;

    visitsPane.innerHTML = dedupedVisits.length ? dedupedVisits.map(v => {
      const key = v.visitor_id || v.ip_address || 'unknown';
      const count = visitCountByKey[key];
      const ipSet = ipsByKey[key];
      const ipChangedNote = ipSet && ipSet.size > 1 ? ` · 换过 ${ipSet.size} 个 IP` : '';
      return `
      <div class="log-row">
        <div class="log-row-top">
          <span class="log-row-main">${v.ip_address ? escapeHtml(v.ip_address) : 'IP 未知'}</span>
          <span class="log-row-time">${formatLogTime(v.created_at)}</span>
        </div>
        <div class="log-row-sub">最近访问页面：${v.path || '/'}${count > 1 ? ` · 共访问 ${count} 次` : ''}${ipChangedNote}</div>
        <div class="log-row-sub">来源：${v.referrer ? v.referrer : '直接访问'}</div>
        <div class="log-row-sub">${v.user_agent || ''}</div>
      </div>
    `;
    }).join('') : '<div style="text-align:center;color:#ccc;font-size:12px;padding:20px 0">暂无访客记录</div>';

    loginsPane.innerHTML = logins.length ? logins.map(l => `
      <div class="log-row">
        <div class="log-row-top">
          <span class="log-row-main">${l.email || '(未知账号)'}</span>
          <span class="log-row-tag ${l.success ? 'ok' : 'fail'}">${l.success ? '登录成功' : '登录失败'}</span>
        </div>
        <div class="log-row-sub">${formatLogTime(l.created_at)}</div>
        <div class="log-row-sub">${l.user_agent || ''}</div>
      </div>
    `).join('') : '<div style="text-align:center;color:#ccc;font-size:12px;padding:20px 0">暂无登录记录</div>';

    loadingEl.style.display = 'none';
  } catch (e) {
    console.error('读取访客/登录记录失败', e);
    loadingEl.textContent = '读取失败，请确认已在 Supabase 中建好 site_visits / login_logs 表并配置好权限';
  }
}

function formatLogTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

async function uploadSongDataUrl(serviceDate, dataUrl, index) {
  if (!initSupabaseClient()) return dataUrl;
  const blob = await dataUrlToBlob(dataUrl);
  const mime = blob.type || 'image/png';
  const rawExt = mime.split('/')[1] || 'png';
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const filePath = `${serviceDate}/${Date.now()}_${index}.${ext}`;
  const { error } = await supabaseClient.storage
    .from(SUPABASE_CONFIG.songBucket)
    .upload(filePath, blob, {
      contentType: mime,
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabaseClient.storage
    .from(SUPABASE_CONFIG.songBucket)
    .getPublicUrl(filePath);
  return data.publicUrl;
}

async function normalizeSongsForRemote(serviceDate, songs) {
  const next = [];
  for (let i = 0; i < songs.length; i++) {
    const item = songs[i];
    let src = item?.src || '';
    if (src.startsWith('data:')) {
      src = await uploadSongDataUrl(serviceDate, src, i);
    }
    next.push({
      title: item?.title || '',
      src,
    });
  }
  return next;
}

const _localDoLogin = doLogin;
doLogin = async function() {
  if (!initSupabaseClient()) return _localDoLogin();
  const email = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    recordLoginAttempt(email, false);
    document.getElementById('loginError').classList.add('show');
    document.getElementById('loginPass').value = '';
    document.getElementById('loginPass').focus();
    return;
  }
  recordLoginAttempt(email, true);
  isAdmin = true;
  document.getElementById('loginOverlay').classList.remove('open');
  updateAdminUI();
  render();
};

const _localLogout = logout;
logout = async function() {
  if (!initSupabaseClient()) return _localLogout();
  await supabaseClient.auth.signOut();
  isAdmin = false;
  updateAdminUI();
  render();
};

const _localSaveEdit = saveEdit;
saveEdit = async function() {
  _localSaveEdit();
  // Refresh monthly editor view if it's open
  if(document.getElementById('monthlyEditorOverlay').classList.contains('open'))
    renderMonthlyEditor();
  if (!initSupabaseClient()) return;
  try {
    await upsertRemoteAppState({
      schedule_data: deepClone(scheduleData),
      rotation_config: normalizeRotationConfig(rotationConfig),
    });
    showToast('☁️ 排班与人员库已同步到云端');
  } catch (e) {
    console.error('同步排班失败', e);
    showToast('排班已保存到本地，但云端同步失败');
  }
};

const _localSaveSermonDate = saveSermonDate;
saveSermonDate = async function(key, name) {
  _localSaveSermonDate(key, name);
  if (!initSupabaseClient()) return;
  try {
    await syncRemoteField('sermon_by_date', sermonByDate);
    showToast('☁️ 证道人已同步到云端');
  } catch (e) {
    console.error('同步证道人失败', e);
    showToast('证道人已保存到本地，但云端同步失败');
  }
};

const _localSaveSermonPassages = saveSermonPassages;
saveSermonPassages = async function() {
  _localSaveSermonPassages();
  if (!initSupabaseClient()) return;
  try {
    await upsertRemoteAppState(getSermonRemotePayload());
    showToast('☁️ 经文主题与音频已同步到云端');
  } catch (e) {
    console.error('同步证道内容失败', e);
    if (isMissingRemoteColumnError(e, 'sermon_audio_by_date')) {
      showToast('后端缺少 sermon_audio_by_date 字段，请执行修复 SQL');
    } else {
      showToast('经文主题与音频已保存到本地，但云端同步失败');
    }
  }
};

const _localAddRosterPerson = addRosterPerson;
addRosterPerson = async function(type) {
  _localAddRosterPerson(type);
  if (!initSupabaseClient()) return;
  try {
    await syncRemoteField('rotation_config', rotationConfig);
  } catch (e) {
    console.error('同步名单失败', e);
    showToast('名单已改动，但云端同步失败');
  }
};

const _localAddCustomPerson = addCustomPerson;
addCustomPerson = async function(role) {
  const input = document.getElementById(`inp-${role}`);
  const name = input ? input.value.trim() : '';
  _localAddCustomPerson(role);
  if (!name || !initSupabaseClient()) return;
  try {
    await syncRemoteField('rotation_config', rotationConfig);
    showToast('☁️ 人员已加入云端名单');
  } catch (e) {
    console.error('同步排班人员库失败', e);
    showToast('人员已加入当前排班，但云端名单同步失败');
  }
};

const _localRemovePerson = removePerson;
removePerson = async function(role, name) {
  _localRemovePerson(role, name);
  if (!initSupabaseClient()) return;
  try {
    await syncRemoteField('rotation_config', rotationConfig);
    showToast(`☁️ 已从「${role}」名单移除 ${name}`);
  } catch (e) {
    console.error('移除排班人员库失败', e);
    showToast('人员显示已更新，但云端名单同步失败');
  }
};

const _localRemoveRosterPerson = removeRosterPerson;
removeRosterPerson = async function(type, idx) {
  _localRemoveRosterPerson(type, idx);
  if (!initSupabaseClient()) return;
  try {
    await syncRemoteField('rotation_config', rotationConfig);
  } catch (e) {
    console.error('同步名单失败', e);
    showToast('名单已改动，但云端同步失败');
  }
};

const _localConfirmEditRosterPerson = confirmEditRosterPerson;
confirmEditRosterPerson = async function(type, idx) {
  const cfg = rotationConfig[type];
  const before = cfg ? cfg.list[idx] : undefined;
  _localConfirmEditRosterPerson(type, idx);
  const after = cfg ? cfg.list[idx] : undefined;
  if (before === after || !initSupabaseClient()) return;
  try {
    await syncRemoteField('rotation_config', rotationConfig);
    showToast(`☁️ 已将「${before}」改为「${after}」并同步到云端`);
  } catch (e) {
    console.error('同步名单失败', e);
    showToast('姓名已修改，但云端同步失败');
  }
};

const _localSaveRosterBase = saveRosterBase;
saveRosterBase = async function(type, val) {
  _localSaveRosterBase(type, val);
  if (!initSupabaseClient()) return;
  try {
    await syncRemoteField('rotation_config', rotationConfig);
    showToast('☁️ 轮值起始日期已同步到云端');
  } catch (e) {
    console.error('同步起始日期失败', e);
    showToast('起始日期已保存到本地，但云端同步失败');
  }
};

const _localSaveUploadedSongs = saveUploadedSongs;
saveUploadedSongs = async function() {
  if (!initSupabaseClient()) return _localSaveUploadedSongs();
  try {
    const serviceDate = uploadEditKey;
    const beforeTitles = (uploadDraft || []).map(s => ({ title: s.title, oldSrc: s.src || '' }));
    songData[serviceDate] = await normalizeSongsForRemote(serviceDate, uploadDraft);
    // 本地 data: 图片经 normalizeSongsForRemote 上传后会拿到真实 URL，
    // 这里把歌单库里同名条目对应"调"的 src 也同步更新为真实 URL，避免库内长期存着巨大的 base64
    songData[serviceDate].forEach((s, i) => {
      const oldSrc = beforeTitles[i]?.oldSrc || '';
      const wasLocal = oldSrc.startsWith('data:');
      if (wasLocal && s.src && !s.src.startsWith('data:')) {
        const libEntry = songLibrary.find(l => l.title === s.title);
        const matchKey = libEntry?.keys.find(k => k.src === oldSrc);
        if (matchKey) matchKey.src = s.src;
      }
      ensureSongInLibrary(s.title, s.src);
    });
    persistSongLibrary();
    document.getElementById('uploadSongOverlay').classList.remove('open');
    await syncRemoteField('song_data', songData);
    await syncSongLibraryToRemote();
    render();
    showToast('☁️ 诗歌已同步到云端');
  } catch (e) {
    console.error('同步诗歌失败', e);
    showToast('诗歌云端同步失败，请检查存储桶配置');
  }
};

// ── Boot ─────────────────────────────────────────────
async function bootstrapApp() {
  applyRandomLoaderVerse();
  loadBibleBookmarks();
  loadSermonPassages();
  loadSermonThemes();
  loadSermonAudio();
  loadSermonNotes();
  loadSermonCollapsed();
  loadLeaveRequests();
  loadSongLibrary();
  loadSongLibFavorites();
  loadSongLibCategories();
  loadSongLibSongbooks();
  loadSongLibSupabaseConfig();
  loadSettings();
  applySettingsToDOM();
  syncResponsiveLayout();

  if (initSupabaseClient()) {
    try {
      await loadRemoteAppState();
      await syncAuthState();
      await checkManageLinkFromUrl();
    } catch (e) {
      console.error('Supabase 初始化失败，已回退到本地模式', e);
    }
    recordVisit();
  } else {
    updateAdminUI();
  }

  goToday();
  syncTopbarSpacer();
  checkSundayReminder();
  checkSaturdayReminder();
}

bootstrapApp().finally(hideAppLoader);
