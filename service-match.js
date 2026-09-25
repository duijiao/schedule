/*
 * ════════════════════════════════════════════════════════════════
 *  服侍匹配测试 · 引擎 / 渲染逻辑
 * ════════════════════════════════════════════════════════════════
 *  自成一体的模块：不修改、不依赖改写 app.js 里任何排班核心逻辑。
 *  与主项目的交互只有两处（都是"读取"，不会破坏原功能）：
 *    1) 读取全局变量 isAdmin / scheduleData / ROLES（如果存在）用于
 *       "管理员服侍画像"和"排班推荐同工"功能。
 *    2) 尝试复用主项目已有的 Supabase 连接（initSupabaseClient /
 *       supabaseClient / SUPABASE_CONFIG，如果存在）来做云端同步；
 *       如果对应的表/字段还没建，会自动降级为仅本地 localStorage，
 *       不会报错、不会影响原有功能。
 *
 *  关闭这个功能：见文件末尾 ServiceMatch.disableCompletely()。
 * ════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  var DATA = window.ServiceMatchData;
  if (!DATA) { console.warn('[服侍匹配] 未找到 service-match-data.js，功能未加载'); return; }

  // ── localStorage keys ──────────────────────────────
  var LS_INTRO_CLOSED = 'serviceMatchIntroClosed';
  var LS_PROGRESS = 'serviceMatchProgress';
  var LS_RECORDS = 'serviceMatchRecords';
  var LS_LOCAL_DISABLED = 'serviceMatchDisabledLocal';
  var LS_LAST_NAME = 'serviceMatchLastName';

  // ── 小工具 ─────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return 'sm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function safeGetLS(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSetLS(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
  function safeRemoveLS(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function readJSON(key, fallback) { try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
  function prefersReducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // 是否有主项目的 Supabase 连接可用（不新建连接，直接复用）
  function hasHostSupabase() {
    try { return typeof initSupabaseClient === 'function' && initSupabaseClient() && typeof supabaseClient !== 'undefined' && !!supabaseClient; } catch (e) { return false; }
  }
  // 是否处于主项目的管理员模式
  function hostIsAdmin() { try { return typeof isAdmin !== 'undefined' && !!isAdmin; } catch (e) { return false; } }
  function hostToast(msg) { try { if (typeof showToast === 'function') { showToast(msg); return; } } catch (e) {} console.log(msg); }

  // ══════════════════════════════════════════════════
  //  状态
  // ══════════════════════════════════════════════════
  var state = {
    menuOpen: false,
    view: null,          // 'quizIntro' | 'quiz' | 'result' | 'records' | 'jobs' | 'jobDetail' | 'radar' | 'share' | 'settings' | 'adminProfiles'
    answers: {},
    qIndex: 0,
    resultRecord: null,  // 当前正在查看的结果记录
    jobDetailId: null,
    allRemoteRecords: null // 管理员视图用的缓存
  };

  function totalQuestions() { return DATA.QUESTIONS.length; }

  // ══════════════════════════════════════════════════
  //  打分引擎
  // ══════════════════════════════════════════════════
  function computeRawScores(answers) {
    var scores = {};
    DATA.CATEGORIES.forEach(function (c) { scores[c] = 0; });
    DATA.QUESTIONS.forEach(function (q) {
      var picked = answers[q.id];
      if (!picked) return;
      var opt = q.options.filter(function (o) { return o.key === picked; })[0];
      if (!opt || !opt.scores) return;
      Object.keys(opt.scores).forEach(function (cat) { scores[cat] = (scores[cat] || 0) + opt.scores[cat]; });
    });
    return scores;
  }
  // 归一化到 0~1，用于岗位匹配度和雷达图（沿用第一版 12 题时定的经验阈值，
  // 按用户要求本次不改动评分公式，因此未随题量增加而调整）
  function normalizeScores(scores) {
    var CEIL = 8;
    var norm = {};
    DATA.CATEGORIES.forEach(function (c) { norm[c] = Math.max(0, Math.min(1, (scores[c] || 0) / CEIL)); });
    return norm;
  }
  function pickPersonas(scores) {
    var entries = DATA.CATEGORIES.map(function (c) { return { cat: c, val: scores[c] || 0 }; });
    entries.sort(function (a, b) { return b.val - a.val; });
    var primary = entries[0], secondary = entries[1];
    var showSecondary = !!secondary && primary.val > 0 && (primary.val - secondary.val) <= Math.max(1, primary.val * 0.3) && secondary.val > 0;
    return { primary: primary.cat, secondary: showSecondary ? secondary.cat : null };
  }
  function computeJobMatches(scores) {
    var norm = normalizeScores(scores);
    return DATA.JOBS.map(function (job) {
      var reqs = job.requiredTypes || {};
      var keys = Object.keys(reqs);
      var weightSum = 0, matchSum = 0;
      keys.forEach(function (k) { weightSum += reqs[k]; matchSum += reqs[k] * (norm[k] || 0); });
      var pct = weightSum > 0 ? Math.round((matchSum / weightSum) * 100) : 0;
      pct = Math.max(5, Math.min(99, pct));
      return Object.assign({}, job, { matchPct: pct });
    }).sort(function (a, b) { return b.matchPct - a.matchPct; });
  }
  function starsForPct(pct) {
    var n = Math.round(pct / 20);
    n = Math.max(1, Math.min(5, n));
    return '★★★★★☆☆☆☆☆'.slice(5 - n, 10 - n);
  }
  var RADAR_TAGLINE = {
    leader: '你更偏向台前带领型服侍', worship: '你更偏向敬拜氛围型服侍',
    technical: '你更偏向幕后技术型服侍', visual: '你更偏向视觉创意型服侍',
    management: '你更偏向组织后勤型服侍', care: '你更偏向关怀陪伴型服侍',
    execution: '你更偏向行动执行型服侍', planning: '你更偏向幕后策划型服侍'
  };

  function buildResultFromAnswers(answers) {
    var scores = computeRawScores(answers);
    var personas = pickPersonas(scores);
    return { id: uid(), at: new Date().toISOString(), scores: scores, primary: personas.primary, secondary: personas.secondary, name: safeGetLS(LS_LAST_NAME) || '' };
  }

  // ══════════════════════════════════════════════════
  //  测试记录（本地 + 可选 Supabase）
  // ══════════════════════════════════════════════════
  function getLocalRecords() { return readJSON(LS_RECORDS, []); }
  function saveLocalRecord(record) {
    var list = getLocalRecords();
    list.unshift(record);
    if (list.length > 30) list = list.slice(0, 30);
    safeSetLS(LS_RECORDS, JSON.stringify(list));
  }
  // 尝试把记录写入 Supabase（表：service_match_results）。
  // 表不存在时会静默失败并提示一次控制台信息，不影响本地记录。
  function trySyncRecordToRemote(record, displayName) {
    if (!hasHostSupabase()) return Promise.resolve(false);
    try {
      return supabaseClient.from('service_match_results').insert({
        record_id: record.id,
        name: displayName || record.name || '',
        primary_type: record.primary,
        secondary_type: record.secondary || null,
        scores: record.scores,
        created_at: record.at
      }).then(function (res) {
        if (res && res.error) { console.info('[服侍匹配] service_match_results 表可能尚未创建，已仅保存到本地。', res.error.message); return false; }
        return true;
      }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function fetchAllRemoteRecords() {
    if (!hasHostSupabase()) return Promise.resolve([]);
    try {
      return supabaseClient.from('service_match_results').select('*').order('created_at', { ascending: false }).limit(500)
        .then(function (res) { return (res && res.data) ? res.data : []; })
        .catch(function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }
  // 全局开关（存在主项目 church_app_state 表里，字段：service_match_enabled）。
  // 表/字段不存在时静默降级为"始终开启"，不影响其它功能。
  function fetchGlobalEnabled() {
    if (!hasHostSupabase()) return Promise.resolve(true);
    try {
      return supabaseClient.from(SUPABASE_CONFIG.table).select('service_match_enabled').eq('id', SUPABASE_CONFIG.rowId).maybeSingle()
        .then(function (res) { return !(res && res.data && res.data.service_match_enabled === false); })
        .catch(function () { return true; });
    } catch (e) { return Promise.resolve(true); }
  }
  function setGlobalEnabled(val) {
    if (!hasHostSupabase()) return Promise.resolve(false);
    try {
      return supabaseClient.from(SUPABASE_CONFIG.table).upsert({ id: SUPABASE_CONFIG.rowId, service_match_enabled: val, updated_at: new Date().toISOString() }, { onConflict: 'id' })
        .then(function (res) { return !(res && res.error); })
        .catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  // ══════════════════════════════════════════════════
  //  DOM 构建（只挂载一次）
  // ══════════════════════════════════════════════════
  var root, fabWrap, fabBtn, introBubble, menuEl, overlayEl, modalEl, modalBodyEl;

  function mount() {
    root = document.getElementById('serviceMatchRoot');
    if (!root) { root = document.createElement('div'); root.id = 'serviceMatchRoot'; document.body.appendChild(root); }
    root.innerHTML =
      '<div class="sm-fab-wrap" id="smFabWrap">' +
        '<div class="sm-intro-bubble" id="smIntroBubble" role="dialog" aria-label="服侍匹配测试介绍">' +
          '<button class="sm-intro-close" id="smIntroCloseBtn" aria-label="关闭提示"><i class="ti ti-x"></i></button>' +
          '<div class="sm-intro-title">MBTI 服侍匹配测试</div>' +
          '<div class="sm-intro-sub">2 分钟找到你的服侍位置</div>' +
          '<button class="sm-intro-cta" id="smIntroCtaBtn">开始测试</button>' +
        '</div>' +
        '<div class="sm-menu" id="smMenu" role="menu">' +
          '<button class="sm-menu-item" data-action="quiz" role="menuitem"><span class="sm-menu-icon"><i class="ti ti-compass"></i></span><span class="sm-menu-text"><b>MBTI 服侍匹配</b><small>找到你的服侍位置</small></span></button>' +
          '<button class="sm-menu-item" data-action="records" role="menuitem"><span class="sm-menu-icon"><i class="ti ti-clipboard-list"></i></span><span class="sm-menu-text">我的测试记录</span></button>' +
          '<button class="sm-menu-item" data-action="jobs" role="menuitem"><span class="sm-menu-icon"><i class="ti ti-target-arrow"></i></span><span class="sm-menu-text">推荐岗位</span></button>' +
          '<button class="sm-menu-item" data-action="bible" role="menuitem"><span class="sm-menu-icon"><i class="ti ti-book-2"></i></span><span class="sm-menu-text">阅读圣经</span></button>' +
          '<button class="sm-menu-item sm-menu-admin" data-action="adminProfiles" role="menuitem" style="display:none"><span class="sm-menu-icon"><i class="ti ti-folders"></i></span><span class="sm-menu-text">服侍画像（管理员）</span></button>' +
          '<button class="sm-menu-item" data-action="settings" role="menuitem"><span class="sm-menu-icon"><i class="ti ti-settings"></i></span><span class="sm-menu-text">功能设置</span></button>' +
        '</div>' +
        '<button class="sm-fab" id="smFabBtn" aria-label="服侍匹配" aria-haspopup="true" aria-expanded="false">' +
          '<span class="sm-fab-icons">' +
            '<i class="ti ti-heart-handshake sm-fab-ic sm-fab-ic-default"></i>' +
            '<i class="ti ti-x sm-fab-ic sm-fab-ic-close"></i>' +
          '</span>' +
          '<span class="sm-fab-label-wrap"><span class="sm-fab-label">服侍匹配</span></span>' +
        '</button>' +
      '</div>' +
      '<div class="sm-overlay" id="smOverlay">' +
        '<div class="sm-modal" id="smModal" role="dialog" aria-modal="true" aria-label="服侍匹配测试">' +
          '<button class="sm-modal-close" id="smModalCloseBtn" aria-label="关闭">×</button>' +
          '<div class="sm-modal-body" id="smModalBody"></div>' +
        '</div>' +
      '</div>';

    fabWrap = $('#smFabWrap'); fabBtn = $('#smFabBtn'); introBubble = $('#smIntroBubble');
    menuEl = $('#smMenu'); overlayEl = $('#smOverlay'); modalEl = $('#smModal'); modalBodyEl = $('#smModalBody');

    bindStaticEvents();
    maybeShowIntro();
    if (hostIsAdmin()) { var b = $('.sm-menu-admin'); if (b) b.style.display = ''; }
    watchAudioBarCollision();
    watchScrollHide();
  }

  function bindStaticEvents() {
    fabBtn.addEventListener('click', function () { toggleMenu(); });
    $('#smIntroCloseBtn').addEventListener('click', function (e) { e.stopPropagation(); dismissIntro(); });
    $('#smIntroCtaBtn').addEventListener('click', function (e) { e.stopPropagation(); dismissIntro(); openMenuAction('quiz'); });
    menuEl.addEventListener('click', function (e) {
      var item = e.target.closest('.sm-menu-item');
      if (!item) return;
      openMenuAction(item.getAttribute('data-action'));
    });
    overlayEl.addEventListener('click', function (e) { if (e.target === overlayEl) closeModal(); });
    $('#smModalCloseBtn').addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (overlayEl.classList.contains('open')) closeModal(); else if (state.menuOpen) closeMenu(); }
    });
  }

  // ── 首次提示气泡 ─────────────────────────────────
  function maybeShowIntro() {
    if (safeGetLS(LS_INTRO_CLOSED) === '1') return;
    setTimeout(function () { introBubble.classList.add('show'); }, 900);
  }
  function dismissIntro() { introBubble.classList.remove('show'); safeSetLS(LS_INTRO_CLOSED, '1'); }

  // ── 悬浮菜单 ─────────────────────────────────────
  function toggleMenu() { state.menuOpen ? closeMenu() : openMenu(); }
  function openMenu() {
    state.menuOpen = true;
    fabWrap.classList.add('menu-open');
    fabBtn.setAttribute('aria-expanded', 'true');
    introBubble.classList.remove('show');
  }
  function closeMenu() {
    state.menuOpen = false;
    fabWrap.classList.remove('menu-open');
    fabBtn.setAttribute('aria-expanded', 'false');
  }
  function openMenuAction(action) {
    closeMenu();
    if (action === 'quiz') { openQuizIntro(); }
    else if (action === 'records') { openRecords(); }
    else if (action === 'jobs') { openJobsStandalone(); }
    else if (action === 'bible') { openBible(); }
    else if (action === 'settings') { openSettingsView(); }
    else if (action === 'adminProfiles') { openAdminProfiles(); }
  }
  function openBible() {
    try {
      // 与旧版「阅读圣经」悬浮按钮一致：打开圣经独立页面
      if (typeof openBiblePage === 'function') { openBiblePage(); return; }
      if (typeof openBibleFullscreen === 'function') { openBibleFullscreen(); return; }
    } catch (e) {}
    var sec = document.getElementById('bibleSection');
    if (sec && sec.scrollIntoView) { sec.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }
    else { hostToast('未找到圣经阅读功能'); }
  }

  // ── 弹窗开关 ─────────────────────────────────────
  function openModal(html) {
    modalBodyEl.innerHTML = html;
    overlayEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlayEl.classList.remove('open');
    document.body.style.overflow = '';
    state.view = null;
  }

  // ══════════════════════════════════════════════════
  //  视图：测试首页
  // ══════════════════════════════════════════════════
  function openQuizIntro() {
    state.view = 'quizIntro';
    var progress = readJSON(LS_PROGRESS, null);
    var resumeNote = (progress && progress.qIndex > 0) ? '<div class="sm-resume-hint">检测到未完成的测试，将从第 ' + (progress.qIndex + 1) + ' 题继续 →</div>' : '';
    openModal(
      '<div class="sm-quiz-intro">' +
        '<div class="sm-qi-title">找到你的服侍位置</div>' +
        '<div class="sm-qi-sub">也许你不是站在台上的那个人，<br>但你可能正是那个不可缺少的人。</div>' +
        '<div class="sm-qi-meta">' +
          '<span><i class="ti ti-clock"></i> 约 2 分钟</span>' +
          '<span><i class="ti ti-list-numbers"></i> ' + totalQuestions() + ' 道题</span>' +
          '<span><i class="ti ti-sparkles"></i> 趣味测试</span>' +
        '</div>' +
        resumeNote +
        '<button class="sm-btn sm-btn-primary sm-btn-block" id="smStartQuizBtn">开始测试 →</button>' +
        '<div class="sm-qi-disclaimer">这不是属灵恩赐的正式鉴定，只是帮助你发现自己可能更喜欢怎样服侍。</div>' +
      '</div>'
    );
    $('#smStartQuizBtn').addEventListener('click', startQuiz);
  }

  // ══════════════════════════════════════════════════
  //  视图：测试题
  // ══════════════════════════════════════════════════
  function startQuiz() {
    var progress = readJSON(LS_PROGRESS, null);
    if (progress && progress.answers) { state.answers = progress.answers; state.qIndex = progress.qIndex || 0; }
    else { state.answers = {}; state.qIndex = 0; }
    state.view = 'quiz';
    renderQuizQuestion();
  }
  function saveProgress() { safeSetLS(LS_PROGRESS, JSON.stringify({ answers: state.answers, qIndex: state.qIndex, savedAt: Date.now() })); }
  function clearProgress() { safeRemoveLS(LS_PROGRESS); }

  function renderQuizQuestion() {
    var idx = state.qIndex, q = DATA.QUESTIONS[idx], total = totalQuestions();
    var pct = Math.round(((idx) / total) * 100);
    var picked = state.answers[q.id];
    var optionsHtml = q.options.map(function (o) {
      return '<button class="sm-option' + (picked === o.key ? ' selected' : '') + '" data-key="' + o.key + '" aria-pressed="' + (picked === o.key) + '">' +
        '<span class="sm-option-key">' + o.key + '</span><span class="sm-option-text">' + esc(o.text) + '</span>' +
      '</button>';
    }).join('');
    openModal(
      '<div class="sm-quiz">' +
        '<div class="sm-quiz-top"><div class="sm-quiz-qlabel">Q' + (idx + 1) + '</div><div class="sm-quiz-progress-label">' + (idx + 1) + ' / ' + total + '</div></div>' +
        '<div class="sm-progress-track"><div class="sm-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="sm-quiz-question">' + esc(q.text) + '</div>' +
        '<div class="sm-quiz-options">' + optionsHtml + '</div>' +
      '</div>' +
      '<div class="sm-quiz-footer">' +
        '<button class="sm-btn sm-btn-ghost" id="smPrevBtn" ' + (idx === 0 ? 'disabled' : '') + '>上一题</button>' +
        '<button class="sm-btn sm-btn-primary" id="smNextBtn" ' + (picked ? '' : 'disabled') + '>' + (idx === total - 1 ? '查看结果' : '下一题') + '</button>' +
      '</div>'
    );
    $all('.sm-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.answers[q.id] = btn.getAttribute('data-key');
        saveProgress();
        renderQuizQuestion();
      });
    });
    $('#smPrevBtn').addEventListener('click', function () { if (state.qIndex > 0) { state.qIndex--; saveProgress(); renderQuizQuestion(); } });
    $('#smNextBtn').addEventListener('click', function () {
      if (!state.answers[q.id]) return;
      if (state.qIndex < total - 1) { state.qIndex++; saveProgress(); renderQuizQuestion(); }
      else { finishQuiz(); }
    });
  }

  function finishQuiz() {
    var record = buildResultFromAnswers(state.answers);
    saveLocalRecord(record);
    clearProgress();
    state.answers = {}; state.qIndex = 0;
    openResult(record);
  }

  // ══════════════════════════════════════════════════
  //  视图：结果页
  // ══════════════════════════════════════════════════
  function openResult(record) {
    state.view = 'result'; state.resultRecord = record;
    var primary = DATA.PERSONAS[record.primary];
    var secondary = record.secondary ? DATA.PERSONAS[record.secondary] : null;
    var jobs = computeJobMatches(record.scores);
    var topJobs = jobs.slice(0, 5);
    var talents = jobs.slice(0, 4);

    var jobRows = topJobs.map(function (j) {
      return '<button class="sm-job-row" data-job="' + j.id + '">' +
        '<span class="sm-job-icon">' + j.icon + '</span>' +
        '<span class="sm-job-info"><span class="sm-job-name">' + esc(j.name) + '</span><span class="sm-job-stars" aria-hidden="true">' + starsForPct(j.matchPct) + '</span></span>' +
        '<span class="sm-job-pct">' + j.matchPct + '%</span>' +
      '</button>';
    }).join('');

    var talentRows = talents.map(function (j) {
      return '<div class="sm-talent-row"><span class="sm-talent-name">' + j.icon + ' ' + esc(j.name) + '</span>' +
        '<div class="sm-talent-bar"><div class="sm-talent-fill" style="width:' + j.matchPct + '%"></div></div>' +
        '<span class="sm-talent-pct">' + j.matchPct + '%</span></div>';
    }).join('');

    var secondaryHtml = secondary ?
      '<div class="sm-secondary-wrap"><span class="sm-secondary-label">隐藏类型</span><span class="sm-secondary-badge">' + secondary.emoji + ' ' + esc(secondary.name) + '</span></div>' : '';

    var savedName = record.name || safeGetLS(LS_LAST_NAME) || '';
    var syncHtml = hasHostSupabase() ?
      '<div class="sm-sync-row">' +
        '<input type="text" class="sm-name-input" id="smSyncNameInput" placeholder="填写你的名字（可选）" value="' + esc(savedName) + '" maxlength="20">' +
        '<button class="sm-btn sm-btn-ghost sm-btn-sm" id="smSyncBtn">同步给管理员</button>' +
      '</div>' : '';

    openModal(
      '<div class="sm-result">' +
        '<div class="sm-result-badge">✨ 测试完成</div>' +
        '<div class="sm-result-label">你的服侍类型</div>' +
        '<div class="sm-result-emoji">' + primary.emoji + '</div>' +
        '<div class="sm-result-title">' + esc(primary.name) + '</div>' +
        '<div class="sm-result-desc">' + esc(primary.description) + '</div>' +
        secondaryHtml +
        '<div class="sm-result-stats">' +
          '<div class="sm-stat"><div class="sm-stat-label">性格倾向</div><div class="sm-stat-value">' + esc(primary.mbti) + '</div></div>' +
          '<div class="sm-stat"><div class="sm-stat-label">服侍倾向</div><div class="sm-stat-value">' + esc(primary.giftPair) + '</div></div>' +
        '</div>' +
        '<div class="sm-keywords">' + primary.keywords.map(function (k) { return '<span class="sm-keyword-chip">' + esc(k) + '</span>'; }).join('') + '</div>' +
        '<div class="sm-mbti-note">MBTI 仅作为趣味性格参考，不代表专业心理测评结果。</div>' +
        syncHtml +

        '<div class="sm-section-title">🎯 推荐服侍岗位</div>' +
        '<div class="sm-job-list">' + jobRows + '</div>' +

        '<div class="sm-section-title">✨ 你的隐藏天赋</div>' +
        '<div class="sm-talent-list">' + talentRows + '</div>' +
        '<button class="sm-link-btn" id="smRadarLinkBtn">查看我的服侍地图 →</button>' +

        '<div class="sm-result-actions">' +
          '<button class="sm-btn sm-btn-ghost sm-btn-block" id="smShareCardBtn">生成我的专属卡片</button>' +
        '</div>' +
        '<div class="sm-disclaimer">这不是属灵恩赐的正式鉴定，只是帮助你发现自己可能更喜欢怎样服侍。</div>' +
      '</div>'
    );

    $all('.sm-job-row').forEach(function (btn) { btn.addEventListener('click', function () { openJobDetail(btn.getAttribute('data-job'), record); }); });
    $('#smRadarLinkBtn').addEventListener('click', function () { openRadar(record); });
    $('#smShareCardBtn').addEventListener('click', function () { openShareCard(record); });
    var syncBtn = $('#smSyncBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        var name = ($('#smSyncNameInput').value || '').trim();
        if (!name) { hostToast('请先填写名字，方便管理员识别'); return; }
        safeSetLS(LS_LAST_NAME, name);
        syncBtn.disabled = true; syncBtn.textContent = '同步中…';
        trySyncRecordToRemote(record, name).then(function (ok) {
          syncBtn.disabled = false;
          syncBtn.textContent = '同步给管理员';
          hostToast(ok ? '✅ 已同步' : '同步失败（可能尚未配置数据表），已保存在本机');
        });
      });
    }
  }

  // ══════════════════════════════════════════════════
  //  视图：岗位详情
  // ══════════════════════════════════════════════════
  function countScheduleHistory(personName, scheduleRoles) {
    // 只读取现有 scheduleData，不做任何修改
    var counts = {};
    if (!personName || !scheduleRoles || typeof scheduleData === 'undefined') return counts;
    try {
      Object.keys(scheduleData).forEach(function (dateKey) {
        (scheduleData[dateKey] || []).forEach(function (row) {
          if (scheduleRoles.indexOf(row.role) === -1) return;
          if (row.persons && row.persons.indexOf(personName) !== -1) counts[row.role] = (counts[row.role] || 0) + 1;
        });
      });
    } catch (e) {}
    return counts;
  }
  function openJobDetail(jobId, record) {
    state.view = 'jobDetail'; state.jobDetailId = jobId;
    var jobs = computeJobMatches(record.scores);
    var job = jobs.filter(function (j) { return j.id === jobId; })[0];
    if (!job) { openResult(record); return; }
    var reqLabels = Object.keys(job.requiredTypes || {}).map(function (k) { return DATA.PERSONAS[k] ? DATA.PERSONAS[k].emoji + ' ' + DATA.PERSONAS[k].name.replace(/型.*/, '') : k; });
    var name = record.name || safeGetLS(LS_LAST_NAME) || '';
    var history = job.scheduleRoles ? countScheduleHistory(name, job.scheduleRoles) : {};
    var historyText = Object.keys(history).length ? Object.keys(history).map(function (r) { return r + ' × ' + history[r]; }).join('，') : (name ? '暂无记录' : '填写名字后可查看');
    var scheduleStatusText = job.scheduleRoles ? ('对应排班岗位：' + job.scheduleRoles.join(' / ')) : '暂未接入现有排班系统';

    openModal(
      '<div class="sm-job-detail">' +
        '<button class="sm-back-btn" id="smBackToResultBtn"><i class="ti ti-arrow-left"></i> 返回结果</button>' +
        '<div class="sm-job-detail-head"><span class="sm-job-detail-icon">' + job.icon + '</span><div><div class="sm-job-detail-name">' + esc(job.name) + '</div><div class="sm-job-detail-pct">匹配度 ' + job.matchPct + '%　' + starsForPct(job.matchPct) + '</div></div></div>' +
        '<div class="sm-talent-bar" style="margin-bottom:14px"><div class="sm-talent-fill" style="width:' + job.matchPct + '%"></div></div>' +
        '<div class="sm-job-detail-block"><div class="sm-job-detail-label">岗位介绍</div><div class="sm-job-detail-text">' + esc(job.description) + '</div></div>' +
        '<div class="sm-job-detail-block"><div class="sm-job-detail-label">岗位要求</div><div class="sm-keywords">' + reqLabels.map(function (r) { return '<span class="sm-keyword-chip">' + esc(r) + '</span>'; }).join('') + '</div></div>' +
        '<div class="sm-job-detail-block"><div class="sm-job-detail-label">已有经验</div><div class="sm-job-detail-text">' + esc(historyText) + '</div></div>' +
        '<div class="sm-job-detail-block"><div class="sm-job-detail-label">是否正在排班</div><div class="sm-job-detail-text">' + esc(scheduleStatusText) + '</div></div>' +
      '</div>'
    );
    $('#smBackToResultBtn').addEventListener('click', function () { openResult(record); });
  }

  // ══════════════════════════════════════════════════
  //  视图：独立"推荐岗位"（从菜单直接进入，用最近一次记录）
  // ══════════════════════════════════════════════════
  function openJobsStandalone() {
    var records = getLocalRecords();
    if (!records.length) { openQuizIntro(); hostToast('还没有测试记录，先来测一下吧～'); return; }
    openResult(records[0]);
  }

  // ══════════════════════════════════════════════════
  //  视图：我的测试记录
  // ══════════════════════════════════════════════════
  function openRecords() {
    state.view = 'records';
    var records = getLocalRecords();
    var rowsHtml = records.length ? records.map(function (r) {
      var p = DATA.PERSONAS[r.primary];
      var d = new Date(r.at);
      var dateStr = isNaN(d.getTime()) ? '' : (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
      return '<button class="sm-record-row" data-id="' + r.id + '">' +
        '<span class="sm-record-emoji">' + p.emoji + '</span>' +
        '<span class="sm-record-info"><span class="sm-record-name">' + esc(p.name) + '</span><span class="sm-record-date">' + dateStr + '</span></span>' +
        '<i class="ti ti-chevron-right"></i>' +
      '</button>';
    }).join('') : '<div class="sm-empty-hint">还没有测试记录，快去测一下你的服侍类型吧～</div>';

    openModal(
      '<div class="sm-records">' +
        '<div class="sm-view-title">我的测试记录</div>' +
        '<div class="sm-record-list">' + rowsHtml + '</div>' +
        '<button class="sm-btn sm-btn-primary sm-btn-block" id="smNewTestBtn">再测一次</button>' +
      '</div>'
    );
    $all('.sm-record-row').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var rec = records.filter(function (r) { return r.id === btn.getAttribute('data-id'); })[0];
        if (rec) openResult(rec);
      });
    });
    $('#smNewTestBtn').addEventListener('click', openQuizIntro);
  }

  // ══════════════════════════════════════════════════
  //  视图：服侍地图（雷达图，纯 SVG，无第三方图表库）
  // ══════════════════════════════════════════════════
  var RADAR_LABELS = { leader: '主领', worship: '敬拜', technical: '音控', visual: 'PPT/视觉', management: '后勤', care: '关怀', execution: '执行', planning: '统筹' };
  function buildRadarSvg(scores) {
    var norm = normalizeScores(scores);
    var cats = DATA.CATEGORIES;
    var n = cats.length, cx = 150, cy = 150, maxR = 108;
    function pt(i, r) {
      var angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    }
    var rings = [0.25, 0.5, 0.75, 1].map(function (f) {
      var pts = cats.map(function (c, i) { var p = pt(i, maxR * f); return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
      return '<polygon points="' + pts + '" class="sm-radar-ring"></polygon>';
    }).join('');
    var axes = cats.map(function (c, i) { var p = pt(i, maxR); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1) + '" class="sm-radar-axis"></line>'; }).join('');
    var dataPts = cats.map(function (c, i) { var p = pt(i, maxR * (norm[c] || 0)); return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    var labels = cats.map(function (c, i) {
      var p = pt(i, maxR + 20);
      return '<text x="' + p.x.toFixed(1) + '" y="' + p.y.toFixed(1) + '" class="sm-radar-label" text-anchor="middle" dominant-baseline="middle">' + RADAR_LABELS[c] + '</text>';
    }).join('');
    return '<svg viewBox="0 0 300 300" class="sm-radar-svg" role="img" aria-label="服侍能力雷达图">' + rings + axes +
      '<polygon points="' + dataPts + '" class="sm-radar-data"></polygon>' + labels + '</svg>';
  }
  function openRadar(record) {
    state.view = 'radar';
    var primary = DATA.PERSONAS[record.primary];
    openModal(
      '<div class="sm-radar-view">' +
        '<button class="sm-back-btn" id="smBackToResultBtn2"><i class="ti ti-arrow-left"></i> 返回结果</button>' +
        '<div class="sm-view-title">我的服侍地图</div>' +
        '<div class="sm-radar-wrap">' + buildRadarSvg(record.scores) +
          '<div class="sm-radar-center"><div class="sm-radar-center-label">我的服侍画像</div></div>' +
        '</div>' +
        '<div class="sm-radar-tagline">' + (RADAR_TAGLINE[record.primary] || '') + '</div>' +
        '<div class="sm-mbti-note">图表基于本次测试作答估算，仅供趣味参考。</div>' +
      '</div>'
    );
    $('#smBackToResultBtn2').addEventListener('click', function () { openResult(record); });
  }

  // ══════════════════════════════════════════════════
  //  视图：分享卡片（复用项目已引入的 html2canvas，把一个
  //  离屏的 9:16 HTML 卡片截成图片；没有 html2canvas 时自动
  //  降级为"复制分享文案"）
  // ══════════════════════════════════════════════════
  function buildShareCardHtml(record) {
    var primary = DATA.PERSONAS[record.primary];
    var jobsText = computeJobMatches(record.scores).slice(0, 3).map(function (j) { return j.name; }).join(' · ');
    return (
      '<div class="sm-share-render">' +
        '<div class="sm-share-render-card">' +
          '<div class="sm-share-render-tag">✨ 我的服侍人格</div>' +
          '<div class="sm-share-render-emoji">' + primary.emoji + '</div>' +
          '<div class="sm-share-render-name">' + esc(primary.name) + '</div>' +
          '<div class="sm-share-render-quote">' + esc(primary.description) + '</div>' +
          '<div class="sm-share-render-mbti">' + esc(primary.mbti) + '</div>' +
          '<div class="sm-share-render-gift">' + esc(primary.giftPair) + '</div>' +
          '<div class="sm-share-render-keywords">' + primary.keywords.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</div>' +
          '<div class="sm-share-render-jobs">🎯 推荐：' + esc(jobsText) + '</div>' +
          '<div class="sm-share-render-footer">找到属于你的服侍位置</div>' +
        '</div>' +
      '</div>'
    );
  }
  function openShareCard(record) {
    state.view = 'share';
    var primary = DATA.PERSONAS[record.primary];
    openModal(
      '<div class="sm-share-view">' +
        '<button class="sm-back-btn" id="smBackToResultBtn3"><i class="ti ti-arrow-left"></i> 返回结果</button>' +
        '<div class="sm-view-title">生成我的专属卡片</div>' +
        '<div class="sm-share-card-wrap"><div id="smShareCardImgWrap" class="sm-empty-hint">正在生成卡片…</div></div>' +
        '<div class="sm-share-actions">' +
          '<a class="sm-btn sm-btn-ghost" id="smSaveImgBtn" style="display:none" download="服侍人格-' + esc(primary.name) + '.png">保存图片</a>' +
          '<button class="sm-btn sm-btn-primary" id="smShareBtn" style="display:none">分享</button>' +
        '</div>' +
      '</div>'
    );
    $('#smBackToResultBtn3').addEventListener('click', function () { openResult(record); });

    var shareText = '我测出的服侍人格是「' + primary.name + '」' + primary.emoji + '，' + primary.description + '　#服侍匹配测试';
    function bindShareBtn(canvas) {
      $('#smShareBtn').addEventListener('click', function () {
        if (canvas && canvas.toBlob) {
          canvas.toBlob(function (blob) {
            var file = blob ? new File([blob], 'service-match.png', { type: 'image/png' }) : null;
            if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: '我的服侍人格', text: shareText }).catch(function () {}); }
            else { fallbackShareText(); }
          });
        } else { fallbackShareText(); }
      });
    }
    function fallbackShareText() {
      if (navigator.share) { navigator.share({ title: '我的服侍人格', text: shareText }).catch(function () {}); }
      else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(shareText).then(function () { hostToast('已复制分享文案，快去粘贴分享吧～'); }).catch(function () { window.prompt('复制以下文字分享：', shareText); }); }
      else { window.prompt('复制以下文字分享：', shareText); }
    }

    if (typeof html2canvas !== 'function') {
      // 没有 html2canvas 时的降级方案：只提供文字分享，不生成图片
      $('#smShareCardImgWrap').innerHTML = '<div class="sm-empty-hint">当前环境无法生成图片卡片，可使用下方"分享"复制文案。</div>';
      $('#smSaveImgBtn').style.display = 'none';
      $('#smShareBtn').style.display = '';
      bindShareBtn(null);
      return;
    }

    var off = document.createElement('div');
    off.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;';
    off.innerHTML = buildShareCardHtml(record);
    document.body.appendChild(off);
    html2canvas(off.firstElementChild, { scale: 2, backgroundColor: null }).then(function (canvas) {
      if (off.parentNode) off.parentNode.removeChild(off);
      var dataUrl = canvas.toDataURL('image/png');
      var wrap = $('#smShareCardImgWrap');
      if (wrap) wrap.innerHTML = '<img class="sm-share-card-img" src="' + dataUrl + '" alt="' + esc(primary.name) + ' 服侍人格分享卡片">';
      var saveLink = $('#smSaveImgBtn'); if (saveLink) { saveLink.href = dataUrl; saveLink.style.display = ''; }
      var shareBtn = $('#smShareBtn'); if (shareBtn) shareBtn.style.display = '';
      bindShareBtn(canvas);
    }).catch(function (err) {
      if (off.parentNode) off.parentNode.removeChild(off);
      console.warn('[服侍匹配] 分享卡片生成失败', err);
      var wrap = $('#smShareCardImgWrap'); if (wrap) wrap.innerHTML = '<div class="sm-empty-hint">卡片生成失败，可使用下方"分享"复制文案。</div>';
      var shareBtn = $('#smShareBtn'); if (shareBtn) shareBtn.style.display = '';
      bindShareBtn(null);
    });
  }

  // ══════════════════════════════════════════════════
  //  视图：功能设置
  // ══════════════════════════════════════════════════
  function openSettingsView() {
    state.view = 'settings';
    var adminSection = hostIsAdmin() ?
      '<div class="sm-settings-block">' +
        '<div class="sm-settings-row"><span>为所有人关闭悬浮入口</span>' +
          '<label class="sm-toggle"><input type="checkbox" id="smDisableToggle" ' + (window.__smGlobalEnabled === false ? 'checked' : '') + '><span class="sm-toggle-track"></span></label>' +
        '</div>' +
        '<div class="sm-settings-desc">' + (hasHostSupabase() ? '开启后所有人打开网页都不会再看到悬浮按钮，随时可以在这里重新打开。' : '当前未连接云端数据库，这个开关只会影响你自己这台设备；如需彻底移除功能，请参考项目说明移除 service-match 相关文件引用。') + '</div>' +
      '</div>' : '';
    openModal(
      '<div class="sm-settings-view">' +
        '<div class="sm-view-title">功能设置</div>' +
        '<div class="sm-settings-block"><div class="sm-settings-row"><span>清除我的测试记录</span><button class="sm-btn sm-btn-ghost sm-btn-sm" id="smClearRecordsBtn">清除</button></div></div>' +
        adminSection +
        '<div class="sm-settings-desc">「属灵恩赐 & MBTI 服侍匹配测试」为趣味性小工具，测试结果仅供参考。</div>' +
      '</div>'
    );
    $('#smClearRecordsBtn').addEventListener('click', function () {
      if (confirm('确定要清除本机保存的全部测试记录吗？')) { safeRemoveLS(LS_RECORDS); hostToast('已清除测试记录'); }
    });
    var toggle = $('#smDisableToggle');
    if (toggle) {
      toggle.addEventListener('change', function () {
        var wantEnabled = !toggle.checked;
        toggle.disabled = true;
        window.ServiceMatch.setGlobalEnabled(wantEnabled).then(function (ok) {
          toggle.disabled = false;
          if (!ok) { toggle.checked = !toggle.checked; hostToast('保存失败，请稍后重试'); return; }
          hostToast(wantEnabled ? '已重新开启悬浮入口' : (hasHostSupabase() ? '已为所有人关闭悬浮入口' : '已在本设备关闭悬浮入口'));
        });
      });
    }
  }

  // ══════════════════════════════════════════════════
  //  视图：管理员 · 服侍画像
  // ══════════════════════════════════════════════════
  function openAdminProfiles() {
    if (!hostIsAdmin()) return;
    state.view = 'adminProfiles';
    openModal('<div class="sm-admin-profiles"><div class="sm-view-title">服侍画像（管理员）</div><div id="smAdminProfilesBody" class="sm-empty-hint">加载中…</div></div>');
    var body = $('#smAdminProfilesBody');
    var localAsRemote = getLocalRecords().filter(function (r) { return r.name; }).map(function (r) { return { name: r.name, primary_type: r.primary, secondary_type: r.secondary, scores: r.scores, created_at: r.at }; });
    fetchAllRemoteRecords().then(function (remote) {
      var all = (remote && remote.length) ? remote : localAsRemote;
      state.allRemoteRecords = all;
      if (!all.length) { body.innerHTML = '<div class="sm-empty-hint">暂无同工提交的测试记录（或数据表尚未创建）。</div>'; return; }
      // 按 name 去重，保留最新一条
      var byName = {};
      all.forEach(function (r) { if (!byName[r.name] || new Date(r.created_at) > new Date(byName[r.name].created_at)) byName[r.name] = r; });
      var list = Object.keys(byName).map(function (n) { return byName[n]; });
      body.innerHTML = list.map(function (r) {
        var p = DATA.PERSONAS[r.primary_type];
        if (!p) return '';
        var jobs = computeJobMatches(r.scores).slice(0, 4);
        var jobsText = jobs.map(function (j) { return j.name + ' ' + j.matchPct + '%'; }).join('　');
        var scheduleRolesSet = {};
        jobs.forEach(function (j) { (j.scheduleRoles || []).forEach(function (role) { scheduleRolesSet[role] = true; }); });
        var history = countScheduleHistory(r.name, Object.keys(scheduleRolesSet));
        var doneText = Object.keys(history).length ? Object.keys(history).map(function (role) { return role + ' × ' + history[role]; }).join('，') : '暂无排班记录';
        var allJobRoles = {}; DATA.JOBS.forEach(function (j) { (j.scheduleRoles || []).forEach(function (rr) { allJobRoles[rr] = true; }); });
        var untried = Object.keys(allJobRoles).filter(function (rr) { return !history[rr]; });
        return '<div class="sm-admin-profile-card">' +
          '<div class="sm-admin-profile-name">' + esc(r.name || '匿名') + '</div>' +
          '<div class="sm-admin-profile-type">' + p.emoji + ' ' + esc(p.name) + '</div>' +
          '<div class="sm-admin-profile-sub">' + esc(p.mbti) + '　' + esc(p.giftPair) + '</div>' +
          '<div class="sm-admin-profile-row"><span class="sm-admin-profile-label">推荐岗位：</span>' + esc(jobsText) + '</div>' +
          '<div class="sm-admin-profile-row"><span class="sm-admin-profile-label">已服侍：</span>' + esc(doneText) + '</div>' +
          (untried.length ? '<div class="sm-admin-profile-row"><span class="sm-admin-profile-label">尚未尝试：</span>' + esc(untried.join('、')) + '</div>' : '') +
        '</div>';
      }).join('');
    });
  }

  // ══════════════════════════════════════════════════
  //  管理员排班推荐（挂在 renderEditDrawer 之后，不修改原函数）
  // ══════════════════════════════════════════════════
  function jobsForScheduleRole(role) {
    return DATA.JOBS.filter(function (j) { return j.scheduleRoles && j.scheduleRoles.indexOf(role) !== -1; });
  }
  function injectRoleSuggestions() {
    if (!hostIsAdmin()) return;
    if (typeof editSelections === 'undefined' || typeof ROLES === 'undefined') return;
    var records = state.allRemoteRecords || getLocalRecords().filter(function (r) { return r.name; }).map(function (r) { return { name: r.name, primary_type: r.primary, scores: r.scores }; });
    if (!records.length) return;
    // 每人只保留分数最新/最好的一条（这里简单取第一条）
    var byName = {}; records.forEach(function (r) { if (!byName[r.name]) byName[r.name] = r; });

    $all('#editRoleSections .role-section').forEach(function (sec) {
      var roleText = sec.querySelector('.role-section-badge span');
      if (!roleText) return;
      var role = roleText.textContent.trim();
      var jobs = jobsForScheduleRole(role);
      if (!jobs.length) return;
      var sel = (typeof editSelections !== 'undefined' && editSelections[role]) ? editSelections[role] : new Set();
      var best = null, bestPct = -1, bestJob = null;
      Object.keys(byName).forEach(function (name) {
        if (sel.has(name)) return;
        var rec = byName[name];
        jobs.forEach(function (job) {
          var matches = computeJobMatches(rec.scores);
          var m = matches.filter(function (mm) { return mm.id === job.id; })[0];
          if (m && m.matchPct > bestPct) { bestPct = m.matchPct; best = name; bestJob = job; }
        });
      });
      if (!best || bestPct < 60) return; // 匹配度太低就不打扰管理员
      if (sec.querySelector('.sm-suggest-card')) return; // 避免重复插入
      var persona = DATA.PERSONAS[byName[best].primary_type];
      var card = document.createElement('div');
      card.className = 'sm-suggest-card';
      card.innerHTML =
        '<div class="sm-suggest-head">💡 推荐同工</div>' +
        '<div class="sm-suggest-body">' +
          '<span class="sm-suggest-name">' + esc(best) + '</span>' +
          '<span class="sm-suggest-persona">' + (persona ? persona.emoji + ' ' + esc(persona.name) : '') + '</span>' +
          '<span class="sm-suggest-pct">' + bestJob.name + '匹配度 ' + bestPct + '%</span>' +
        '</div>' +
        '<div class="sm-suggest-actions">' +
          '<button type="button" class="sm-btn sm-btn-ghost sm-btn-sm sm-suggest-skip">暂不考虑</button>' +
          '<button type="button" class="sm-btn sm-btn-primary sm-btn-sm sm-suggest-add">加入候选</button>' +
        '</div>';
      sec.appendChild(card);
      card.querySelector('.sm-suggest-skip').addEventListener('click', function () { card.remove(); });
      card.querySelector('.sm-suggest-add').addEventListener('click', function () {
        try {
          if (typeof unmarkPersonRemoved === 'function') unmarkPersonRemoved(role, best);
          if (typeof addRolePeopleToLibrary === 'function') addRolePeopleToLibrary(role, best);
          if (typeof customPeople !== 'undefined') { if (!customPeople[role]) customPeople[role] = []; if (customPeople[role].indexOf(best) === -1) customPeople[role].push(best); }
          if (!editSelections[role]) editSelections[role] = new Set();
          editSelections[role].add(best);
          if (typeof renderEditDrawer === 'function') renderEditDrawer();
          hostToast('已将 ' + best + ' 加入候选');
        } catch (e) { console.warn('[服侍匹配] 加入候选失败', e); }
      });
    });
  }
  function hookAdminIntegration() {
    try {
      if (typeof renderEditDrawer !== 'function') return;
      var original = renderEditDrawer;
      window.renderEditDrawer = function () {
        original.apply(this, arguments);
        injectRoleSuggestions();
      };
      // 预取一次远端记录供推荐使用（不影响原有加载流程）
      fetchAllRemoteRecords().then(function (remote) { if (remote && remote.length) state.allRemoteRecords = remote; });
    } catch (e) { console.warn('[服侍匹配] 管理员排班推荐挂载失败（不影响原排班功能）', e); }
  }

  // ══════════════════════════════════════════════════
  //  悬浮按钮避让：底部音频条弹出时自动上移
  // ══════════════════════════════════════════════════
  function watchScrollHide() {
    var IDLE_MS = 450, timer = null, hidden = false;
    function onScroll(e) {
      var t = e && e.target;
      // 忽略悬浮按钮/测试弹窗自身内部的滚动
      if (t && t.nodeType === 1 && t.closest && t.closest('#serviceMatchRoot')) return;
      if (!hidden) {
        hidden = true;
        fabWrap.classList.add('sm-scrolling');
        if (state.menuOpen) closeMenu();
      }
      clearTimeout(timer);
      timer = setTimeout(function () {
        hidden = false;
        fabWrap.classList.remove('sm-scrolling');
      }, IDLE_MS);
    }
    // capture：页面内任意滚动容器（含 body、弹层）的滚动都能捕获
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('wheel', onScroll, { passive: true });
  }

  function watchAudioBarCollision() {
    var bar = document.querySelector('.floating-audio-bar');
    if (!bar || !window.MutationObserver) return;
    var mo = new MutationObserver(function () {
      fabWrap.classList.toggle('sm-raised', bar.classList.contains('show'));
    });
    mo.observe(bar, { attributes: true, attributeFilter: ['class'] });
  }

  // ══════════════════════════════════════════════════
  //  启动
  // ══════════════════════════════════════════════════
function boot() {
  if (!hasHostSupabase()) {
    // 未连接云端数据库：全局开关退化为"只影响本设备"，尊重本机上一次的选择
    var localOff = safeGetLS(LS_LOCAL_DISABLED) === '1';
    window.__smGlobalEnabled = !localOff;
    if (localOff) return;
    mount();
    setTimeout(hookAdminIntegration, 0);
    return;
  }
  // 已连接云端数据库：每次启动都以云端最新状态为准，
  // 本地缓存只是展示用，不再用来跳过挂载判断，
  // 避免"管理员重新打开后，其他人因为本地陈旧缓存而永远看不到"的问题。
  fetchGlobalEnabled().then(function (enabled) {
    window.__smGlobalEnabled = enabled;
    safeSetLS(LS_LOCAL_DISABLED, enabled ? '0' : '1');
    if (!enabled) return; // 管理员已为所有人关闭
    mount();
    // 排班推荐钩子延迟挂载，确保 app.js 里的函数都已定义完毕
    setTimeout(hookAdminIntegration, 0);
  });
}

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }

  // ── 对外暴露的最小 API（方便调试/彻底关闭功能/在设置面板里控制）───
  window.ServiceMatch = {
    open: function () { openQuizIntro(); },
    isGlobalEnabled: function () { return window.__smGlobalEnabled !== false; },
    hasCloudSync: hasHostSupabase,
    // 供主项目「设置」面板里的管理员开关调用：true=开启，false=对所有人关闭
    setGlobalEnabled: function (val) {
      return setGlobalEnabled(val).then(function (ok) {
        if (!ok && hasHostSupabase()) return false;
        window.__smGlobalEnabled = val;
        safeSetLS(LS_LOCAL_DISABLED, val ? '0' : '1');
        if (val) { if (!fabWrap) { mount(); setTimeout(hookAdminIntegration, 0); } else { fabWrap.style.display = ''; } }
        else if (fabWrap) { fabWrap.style.display = 'none'; }
        return true;
      });
    },
    disableCompletely: function () {
      safeSetLS(LS_LOCAL_DISABLED, '1');
      if (fabWrap) fabWrap.style.display = 'none';
      if (overlayEl) closeModal();
    },
    enableAgain: function () { safeSetLS(LS_LOCAL_DISABLED, '0'); if (fabWrap) fabWrap.style.display = ''; else { mount(); setTimeout(hookAdminIntegration, 0); } }
  };
})();
