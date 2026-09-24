/*
 * ════════════════════════════════════════════════════════════════
 *  服侍匹配测试 · 数据配置文件
 * ════════════════════════════════════════════════════════════════
 *  这是唯一需要修改的文件，用来增加/调整：
 *   1) 测试题目 QUESTIONS
 *   2) 服侍人格 PERSONAS（8 种）
 *   3) 岗位数据库 JOBS
 *
 *  不涉及任何渲染逻辑，纯数据，改了直接刷新页面就生效。
 *  逻辑代码在 service-match.js 里，一般不需要碰。
 * ════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  // 8 个打分维度（对应 8 种服侍人格，不要随意改 key，否则要同步改 PERSONAS）
  var CATEGORIES = ['leader', 'worship', 'technical', 'visual', 'management', 'care', 'execution', 'planning'];

  // ── 测试题 ──────────────────────────────────────────
  // 新增题目：复制一条 push 进数组即可，id 需要唯一。
  // scores 里没写到的维度默认 +0，不需要每个维度都列出来。
  var QUESTIONS = [
    {
      id: 'q1',
      text: '聚会开始前 5 分钟，发现设备出了问题，你会？',
      options: [
        { key: 'A', text: '先冷静下来，快速找出问题并解决', scores: { technical: 2, execution: 1 } },
        { key: 'B', text: '找负责人一起处理', scores: { management: 2, care: 1 } },
        { key: 'C', text: '直接寻找替代方案', scores: { execution: 2, planning: 1 } },
        { key: 'D', text: '先安慰周围的人不要紧张', scores: { care: 2, management: 1 } }
      ]
    },
    {
      id: 'q2',
      text: '如果让你负责一次聚会，你最喜欢负责哪一部分？',
      options: [
        { key: 'A', text: '台上的流程与带领', scores: { leader: 2, execution: 1 } },
        { key: 'B', text: '音乐与氛围', scores: { worship: 2, care: 1 } },
        { key: 'C', text: '技术设备', scores: { technical: 2, execution: 1 } },
        { key: 'D', text: '整体流程安排', scores: { planning: 2, management: 1 } }
      ]
    },
    {
      id: 'q3',
      text: '团队合作时，大家都不知道下一步做什么，你通常会？',
      options: [
        { key: 'A', text: '主动站出来安排', scores: { leader: 2, planning: 1 } },
        { key: 'B', text: '观察一下再行动', scores: { care: 1, planning: 1 } },
        { key: 'C', text: '找人分工', scores: { management: 2, leader: 1 } },
        { key: 'D', text: '先把自己负责的事情做好', scores: { execution: 2, technical: 1 } }
      ]
    },
    {
      id: 'q4',
      text: '你更喜欢哪种工作状态？',
      options: [
        { key: 'A', text: '和很多人互动', scores: { care: 2, leader: 1 } },
        { key: 'B', text: '专注自己的工作', scores: { technical: 2, execution: 1 } },
        { key: 'C', text: '一边沟通一边处理事情', scores: { management: 2, care: 1 } },
        { key: 'D', text: '在幕后默默完成任务', scores: { planning: 2, execution: 1 } }
      ]
    },
    {
      id: 'q5',
      text: '发现 PPT 有一个错别字，聚会马上开始，你会？',
      options: [
        { key: 'A', text: '马上修改', scores: { visual: 2, execution: 1 } },
        { key: 'B', text: '告诉负责的人', scores: { management: 2, care: 1 } },
        { key: 'C', text: '如果影响不大就算了', scores: { care: 1, execution: 1 } },
        { key: 'D', text: '顺便检查其他页面', scores: { visual: 2, planning: 1 } }
      ]
    },
    {
      id: 'q6',
      text: '别人突然请你帮忙，你通常会？',
      options: [
        { key: 'A', text: '直接答应', scores: { care: 2, execution: 1 } },
        { key: 'B', text: '看自己有没有时间', scores: { planning: 2, management: 1 } },
        { key: 'C', text: '先问清楚需要做什么', scores: { technical: 1, planning: 1 } },
        { key: 'D', text: '如果能帮就尽量帮', scores: { care: 2, execution: 1 } }
      ]
    },
    {
      id: 'q7',
      text: '第一次看到一个完全不会用的设备，你会？',
      options: [
        { key: 'A', text: '直接研究', scores: { technical: 2, execution: 1 } },
        { key: 'B', text: '找教程', scores: { technical: 1, planning: 1 } },
        { key: 'C', text: '问会的人', scores: { care: 1, management: 1 } },
        { key: 'D', text: '边用边摸索', scores: { execution: 2, technical: 1 } }
      ]
    },
    {
      id: 'q8',
      text: '如果一次聚会没有你，哪件事最可能出现问题？',
      options: [
        { key: 'A', text: '整体流程', scores: { leader: 2, planning: 1 } },
        { key: 'B', text: '音乐氛围', scores: { worship: 2, care: 1 } },
        { key: 'C', text: '技术设备', scores: { technical: 2, visual: 1 } },
        { key: 'D', text: '后勤安排', scores: { management: 2, execution: 1 } }
      ]
    },
    {
      id: 'q9',
      text: '你喜欢别人怎么评价你？',
      options: [
        { key: 'A', text: '「你很会带动大家。」', scores: { leader: 2, worship: 1 } },
        { key: 'B', text: '「交给你我很放心。」', scores: { management: 2, technical: 1 } },
        { key: 'C', text: '「你很有创意。」', scores: { visual: 2, worship: 1 } },
        { key: 'D', text: '「你总能及时帮助别人。」', scores: { care: 2, execution: 1 } }
      ]
    },
    {
      id: 'q10',
      text: '临时被安排新岗位，你的第一反应？',
      options: [
        { key: 'A', text: '「好，我来试试。」', scores: { leader: 1, execution: 2 } },
        { key: 'B', text: '「等等，我先了解一下。」', scores: { planning: 2, technical: 1 } },
        { key: 'C', text: '「有人教我吗？」', scores: { care: 1, technical: 1 } },
        { key: 'D', text: '「没问题，我自己研究。」', scores: { technical: 2, execution: 1 } }
      ]
    },
    {
      id: 'q11',
      text: '如果有一天不用上台，你最愿意做什么？',
      options: [
        { key: 'A', text: '调音', scores: { technical: 2, execution: 1 } },
        { key: 'B', text: '控制 PPT', scores: { visual: 2, technical: 1 } },
        { key: 'C', text: '拍摄记录', scores: { visual: 2, care: 1 } },
        { key: 'D', text: '帮忙准备现场', scores: { execution: 2, management: 1 } }
      ]
    },
    {
      id: 'q12',
      text: '如果你的服侍只能用一句话形容，你更喜欢哪一句？',
      options: [
        { key: 'A', text: '「让大家一起参与。」', scores: { leader: 2, care: 1 } },
        { key: 'B', text: '「让每个细节都做好。」', scores: { technical: 2, planning: 1 } },
        { key: 'C', text: '「让整个聚会顺利进行。」', scores: { management: 2, execution: 1 } },
        { key: 'D', text: '「让人感受到被爱。」', scores: { care: 2, worship: 1 } }
      ]
    },
    {
      id: 'q13',
      text: '当你第一次学习一个新的服侍岗位时，你更倾向于：',
      options: [
        { key: 'A', text: '先看别人完整做一遍', scores: { planning: 2, technical: 1 } },
        { key: 'B', text: '自己直接上手尝试', scores: { execution: 2, technical: 1 } },
        { key: 'C', text: '先了解整个流程和原理', scores: { planning: 2, management: 1 } },
        { key: 'D', text: '找熟悉的人一起研究', scores: { care: 2, planning: 1 } }
      ]
    },
    {
      id: 'q14',
      text: '如果聚会前突然多出一项任务，你通常会：',
      options: [
        { key: 'A', text: '马上开始处理', scores: { execution: 2, technical: 1 } },
        { key: 'B', text: '先确认具体要求', scores: { planning: 2, management: 1 } },
        { key: 'C', text: '看看有没有更好的解决方法', scores: { planning: 2, execution: 1 } },
        { key: 'D', text: '找人一起商量', scores: { management: 2, care: 1 } }
      ]
    },
    {
      id: 'q15',
      text: '如果让你帮助准备一次聚会，你最愿意负责：',
      options: [
        { key: 'A', text: '整理流程和时间安排', scores: { planning: 2, management: 1 } },
        { key: 'B', text: '检查设备和技术问题', scores: { technical: 2, execution: 1 } },
        { key: 'C', text: '准备 PPT、图片和视觉内容', scores: { visual: 2, technical: 1 } },
        { key: 'D', text: '接待和帮助参加聚会的人', scores: { care: 2, leader: 1 } }
      ]
    },
    {
      id: 'q16',
      text: '团队讨论一个问题时，你通常更喜欢：',
      options: [
        { key: 'A', text: '直接说出自己的想法', scores: { leader: 2, execution: 1 } },
        { key: 'B', text: '听完大家的意见再发言', scores: { care: 1, planning: 1 } },
        { key: 'C', text: '先观察问题，再提出方案', scores: { planning: 2, technical: 1 } },
        { key: 'D', text: '私下和熟悉的人讨论', scores: { care: 2, management: 1 } }
      ]
    },
    {
      id: 'q17',
      text: '如果现场突然出现技术问题，你第一反应更接近：',
      options: [
        { key: 'A', text: '马上寻找问题原因', scores: { technical: 2, execution: 1 } },
        { key: 'B', text: '先找一个临时替代方案', scores: { execution: 2, planning: 1 } },
        { key: 'C', text: '联系负责的人', scores: { management: 2, care: 1 } },
        { key: 'D', text: '先保证现场其他人不受影响', scores: { care: 2, leader: 1 } }
      ]
    },
    {
      id: 'q18',
      text: '如果让你选择一种服侍方式，你更喜欢：',
      options: [
        { key: 'A', text: '在台前直接与大家互动', scores: { leader: 2, worship: 1 } },
        { key: 'B', text: '在幕后负责技术', scores: { technical: 2, execution: 1 } },
        { key: 'C', text: '负责整个流程和安排', scores: { management: 2, planning: 1 } },
        { key: 'D', text: '默默帮助需要帮助的人', scores: { care: 2, execution: 1 } }
      ]
    },
    {
      id: 'q19',
      text: '你看到一场聚会结束后，最容易注意到：',
      options: [
        { key: 'A', text: '哪些环节衔接得不够顺', scores: { planning: 2, management: 1 } },
        { key: 'B', text: '哪些画面和视觉效果很好', scores: { visual: 2, worship: 1 } },
        { key: 'C', text: '音乐和声音是否舒服', scores: { worship: 2, technical: 1 } },
        { key: 'D', text: '有没有人被忽略', scores: { care: 2, leader: 1 } }
      ]
    },
    {
      id: 'q20',
      text: '如果让你负责一个长期项目，你更喜欢：',
      options: [
        { key: 'A', text: '制定一个清晰的计划', scores: { planning: 2, management: 1 } },
        { key: 'B', text: '边做边调整', scores: { execution: 2, technical: 1 } },
        { key: 'C', text: '先确定最终目标，再寻找方法', scores: { planning: 2, leader: 1 } },
        { key: 'D', text: '和团队一起慢慢推进', scores: { care: 2, management: 1 } }
      ]
    },
    {
      id: 'q21',
      text: '如果有人第一次来到教会，你更自然的反应是：',
      options: [
        { key: 'A', text: '主动和他打招呼', scores: { care: 2, leader: 1 } },
        { key: 'B', text: '观察他是否需要帮助', scores: { care: 2, planning: 1 } },
        { key: 'C', text: '带他认识环境', scores: { care: 2, management: 1 } },
        { key: 'D', text: '如果他主动交流，我会认真陪他聊天', scores: { care: 2, worship: 1 } }
      ]
    },
    {
      id: 'q22',
      text: '如果给你一套新的设备，你最感兴趣的是：',
      options: [
        { key: 'A', text: '它到底是怎么工作的', scores: { technical: 2, planning: 1 } },
        { key: 'B', text: '怎样把它调到最佳状态', scores: { technical: 2, execution: 1 } },
        { key: 'C', text: '它还能不能实现其他功能', scores: { technical: 1, visual: 1 } },
        { key: 'D', text: '有没有更简单的使用方法', scores: { execution: 2, technical: 1 } }
      ]
    },
    {
      id: 'q23',
      text: '如果活动当天临时改变流程，你通常会：',
      options: [
        { key: 'A', text: '按照新的流程重新安排', scores: { management: 2, planning: 1 } },
        { key: 'B', text: '直接根据现场情况调整', scores: { execution: 2, leader: 1 } },
        { key: 'C', text: '找负责人确认', scores: { management: 2, care: 1 } },
        { key: 'D', text: '先保证自己负责的部分正常完成', scores: { execution: 2, technical: 1 } }
      ]
    },
    {
      id: 'q24',
      text: '如果让你选择一个「别人可能不太注意，但很重要」的工作，你会选择：',
      options: [
        { key: 'A', text: '提前检查设备', scores: { technical: 2, execution: 1 } },
        { key: 'B', text: '整理物资和现场', scores: { management: 2, execution: 1 } },
        { key: 'C', text: '检查 PPT、歌词和画面', scores: { visual: 2, planning: 1 } },
        { key: 'D', text: '提前联系需要帮助的人', scores: { care: 2, management: 1 } }
      ]
    },
    {
      id: 'q25',
      text: '如果没有人知道这件事情是你完成的，你仍然愿意做：',
      options: [
        { key: 'A', text: '把整个流程安排得井井有条', scores: { planning: 2, management: 1 } },
        { key: 'B', text: '把设备和技术调试到最佳状态', scores: { technical: 2, execution: 1 } },
        { key: 'C', text: '帮助一个刚加入的同工熟悉环境', scores: { care: 2, management: 1 } },
        { key: 'D', text: '把现场记录下来，留下美好的画面', scores: { visual: 2, care: 1 } }
      ]
    }
  ];

  // ── 8 种服侍人格 ─────────────────────────────────────
  // key 必须是 CATEGORIES 里的一个。想改文案/关键词直接改这里。
  var PERSONAS = {
    leader: {
      id: 'leader',
      emoji: '🎤',
      name: '控场型主领',
      keywords: ['感染力', '表达', '领导', '临场'],
      mbti: 'ENFJ · 领导型倾向',
      giftPair: '治理 × 劝化',
      description: '你的存在总能让人安心地跟随，天生适合站在台前，带领大家一起往前走。'
    },
    worship: {
      id: 'worship',
      emoji: '🎹',
      name: '氛围型敬拜者',
      keywords: ['共情', '音乐', '感受', '创造'],
      mbti: 'ENFP · 感性型倾向',
      giftPair: '敬拜 × 怜悯',
      description: '音乐一响你就知道该往哪个方向带，你用旋律传递感受，让敬拜更有温度。'
    },
    technical: {
      id: 'technical',
      emoji: '🎛️',
      name: '细节控音控师',
      keywords: ['专注', '稳定', '技术', '细节'],
      mbti: 'ISTJ · 细节型倾向',
      giftPair: '治理 × 执事',
      description: '你可能不是最显眼的人，但你会让整个聚会变得更稳定。'
    },
    visual: {
      id: 'visual',
      emoji: '🖥️',
      name: '视觉导演',
      keywords: ['审美', '创意', '观察', '画面'],
      mbti: 'INFP · 创意型倾向',
      giftPair: '智慧 × 服事',
      description: '你用画面说话，细节里藏着你的用心，让人一眼记住那个瞬间。'
    },
    management: {
      id: 'management',
      emoji: '📋',
      name: '后勤大管家',
      keywords: ['责任', '组织', '计划', '可靠'],
      mbti: 'ESTJ · 组织型倾向',
      giftPair: '治理 × 执事',
      description: '你把复杂的事情安排得井井有条，是团队背后最安心的存在。'
    },
    care: {
      id: 'care',
      emoji: '🤝',
      name: '温暖陪伴者',
      keywords: ['倾听', '关怀', '沟通', '陪伴'],
      mbti: 'ISFJ · 关怀型倾向',
      giftPair: '怜悯 × 服事',
      description: '你总能注意到别人没被照顾到的地方，让人感受到被爱与陪伴。'
    },
    execution: {
      id: 'execution',
      emoji: '⚡',
      name: '行动派执行官',
      keywords: ['行动', '反应', '执行', '应变'],
      mbti: 'ESTP · 行动型倾向',
      giftPair: '服事 × 信心',
      description: '遇到状况你从不慌张，总能第一时间做出反应、解决问题。'
    },
    planning: {
      id: 'planning',
      emoji: '🧠',
      name: '幕后策划师',
      keywords: ['思考', '规划', '系统', '解决问题'],
      mbti: 'INTJ · 策划型倾向',
      giftPair: '智慧 × 治理',
      description: '你喜欢在幕后把系统想清楚，让团队少走弯路。'
    }
  };

  // ── 岗位数据库 ───────────────────────────────────────
  // 新增岗位：复制一条 push 进数组即可，会自动出现在匹配结果里。
  // requiredTypes 里的数字是 0~1 的权重（该维度对这个岗位有多重要）。
  // scheduleRoles：对应现有排班系统 ROLES 数组里的岗位名（没有就留 null，
  // 表示这个岗位还没有接入排班系统，"是否正在排班"会显示"暂未接入排班"）。
  var JOBS = [
    { id: 'leader', name: '主领', icon: '🎤', category: '带领', description: '带领整场聚会的流程与节奏，是台上的核心角色。', requiredTypes: { leader: 1, worship: 0.5 }, scheduleRoles: ['主领'] },
    { id: 'host', name: '主持', icon: '🎙️', category: '带领', description: '串场与引导，让聚会的每个环节衔接自然。', requiredTypes: { leader: 0.9, care: 0.4 }, scheduleRoles: null },
    { id: 'musician', name: '乐手', icon: '🎸', category: '敬拜', description: '用乐器为敬拜伴奏，撑起整场的音乐氛围。', requiredTypes: { worship: 1, technical: 0.3 }, scheduleRoles: ['键盘', '吉他', '贝斯', '鼓'] },
    { id: 'vocal', name: '和声', icon: '🎶', category: '敬拜', description: '用歌声烘托敬拜氛围，与主领配合带动会众。', requiredTypes: { worship: 0.9, care: 0.4 }, scheduleRoles: ['伴唱'] },
    { id: 'audio', name: '音控', icon: '🎛️', category: '技术', description: '把关全场音质与音量，是最容易被忽略却最重要的岗位。', requiredTypes: { technical: 1, execution: 0.6 }, scheduleRoles: null },
    { id: 'ppt', name: 'PPT / 投影', icon: '🖥️', category: '技术', description: '同步歌词与经文投影，配合流程节奏切换画面。', requiredTypes: { visual: 0.8, technical: 0.6 }, scheduleRoles: null },
    { id: 'live', name: '直播', icon: '📡', category: '技术', description: '负责线上直播的推流与画面稳定。', requiredTypes: { technical: 0.8, visual: 0.5 }, scheduleRoles: null },
    { id: 'light', name: '灯光', icon: '💡', category: '技术', description: '配合流程调整灯光氛围。', requiredTypes: { technical: 0.7, visual: 0.6 }, scheduleRoles: null },
    { id: 'subtitle', name: '字幕', icon: '📝', category: '技术', description: '实时校对与切换字幕内容。', requiredTypes: { technical: 0.6, planning: 0.5 }, scheduleRoles: null },
    { id: 'photo', name: '摄影', icon: '📷', category: '视觉', description: '记录聚会精彩瞬间的静态影像。', requiredTypes: { visual: 1, care: 0.3 }, scheduleRoles: null },
    { id: 'video', name: '摄像', icon: '🎬', category: '视觉', description: '记录与剪辑聚会的视频内容。', requiredTypes: { visual: 0.9, technical: 0.4 }, scheduleRoles: null },
    { id: 'reception', name: '接待', icon: '🤝', category: '关怀', description: '迎接会众与新朋友，让每个人被看见。', requiredTypes: { care: 1, leader: 0.3 }, scheduleRoles: null },
    { id: 'logistics', name: '后勤', icon: '📦', category: '后勤', description: '统筹物资与场地准备，保障聚会顺利进行。', requiredTypes: { management: 0.9, execution: 0.6 }, scheduleRoles: null },
    { id: 'service', name: '场务', icon: '🏃', category: '后勤', description: '现场布置、设备搬运与突发状况应急处理。', requiredTypes: { execution: 1, management: 0.5 }, scheduleRoles: null },
    { id: 'schedule', name: '排班', icon: '🗓️', category: '统筹', description: '统筹协调各岗位的每周排班安排。', requiredTypes: { management: 1, planning: 0.6 }, scheduleRoles: null },
    { id: 'planning', name: '策划', icon: '🧭', category: '统筹', description: '负责整体活动或系列聚会的策划与统筹。', requiredTypes: { planning: 1, management: 0.5 }, scheduleRoles: null }
  ];

  global.ServiceMatchData = { CATEGORIES: CATEGORIES, QUESTIONS: QUESTIONS, PERSONAS: PERSONAS, JOBS: JOBS };
})(window);
