//
// This is a structured object for advanced content moderation.
// It categorizes keywords by risk level and provides context for better filtering.
//
// 基于全球最佳实践的分级权重关键词系统 (World-Leading Enhanced Version)
export const yellowWords = {
  // ===== 极高风险词汇 (权重: 200分, 立即拦截) =====
  // 涉及未成年人、极端违法内容 - 零容忍
  criticalRisk: [
    // 未成年相关
    '幼女', '萝莉', 'Loli', '正太', 'shota', '童妓', '恋童', '儿童色情', 'child porn', 'cp',
    'underage', 'minor', 'teen porn', '未成年', 'l0li', 'l0l1', 'l.oli', 'lo.li', 'kiddie',
    '男童', '女童', '幼童', '雛妓', '炼铜',
    
    // 极端暴力犯罪
    '强奸', '强暴', '迷奸', '轮奸', '诱奸', '奸杀', '性侵', '猥亵儿童', '奸污',
    '兽交', '人兽', '尸交', '恋尸', '虐杀', '性虐杀', '肢解', '斩首', '血腥',
    
    // 繁体版本
    '強姦', '強暴', '迷姦', '輪姦', '誘姦', '姦殺', '兒童色情', '未成年', '猥褻兒童',
    
    // 日语
    'ロリ', '児童ポルノ', 'jc', 'js', 'jk', '合法ロリ' // JC=初中女生, JS=小学生, JK=高中女生
  ],

  // ===== 高风险词汇 (权重: 100-150分) =====
  // 直接露骨的成人内容
  highRisk: [
    // 核心色情词汇
    '色情', '淫秽', '淫乱', 'A片', '毛片', '黄片', '三级片', 'AV', '成人电影', '成人影片',
    '女优', '女優', '巨乳', '爆乳', '美乳', '骚货', '母狗', '肉便器', '肉便', '春药', '催情', '媚药',
    '淫荡', '淫水', '淫娃', '淫语', '淫叫', '淫声', '荡妇', '荡女', '浪女', '骚B', '肉体', '裸体', '赤裸',
    
    // 直接性行为描述
    '做爱', '性爱', '口交', '肛交', '群交', '乱伦', '通奸', '射精', '内射', '中出', '性交', '交媾',
    '颜射', '口爆', '潮吹', '高潮', '3P', 'NP', '多P', '车震', '颜射', 'ぶっかけ', 'Bukkake',
    
    // 身体部位露骨描述
    '阴茎', '阴道', '鸡巴', '逼', '屌', '肉棒', '骚穴', '嫩穴', '龟头', '睾丸', 'JB',
    '精液', '精子', '体液', '乳交', '胸推', '阴部', '阴唇', '阴蒂', '私处', '私密处',
    '肉缝', '美鲍', 'B', '小穴', '骚B', '穴', '肛门', '后庭', '走后门', '菊花', '屁眼',
    
    // 平台相关
    'pornhub', 'xvideos', 'xhamster', 'onlyfans', 'chaturbate', 'xnxx', 'fansly', 'missav', 'javbus',
    
    // 繁体版本
    '色情', '淫穢', '做愛', '性愛', '口交', '肛交', '亂倫', '射精', '內射', '中出',
    '顏射', '調教', '捆綁', '無碼A片', '成人影片', 'H漫', '肉體', '裸體',
    
    // 日语罗马音
    'nakadashi', 'bukakke', 'gokkun', 'chikan', 'hentai', 'oppai', 'sekkusu', 'ero', 'enkou',
    
    // 规避性拼写
    'p0rn', 'pr0n', 'xxx', 'se.x', 's3x', 'f.uck', 'fvck', 'p.orn', 'po.rn', ' sexu', 'f u c k'
  ],

  // ===== 中高风险词汇 (权重: 60-90分) =====
  // 强关联成人内容但可能有合法用途
  mediumHighRisk: [
    // 题材标签
    '制服诱惑', '黑丝诱惑', '国产传媒', '日本无码', '日本有码', '网红主播', '女高中生', '女子高生',
    '色情片', '同性片', '福利视频', '福利片', '写真热舞', '伦理片', '理论片', 'R片',
    '韩国伦理', '港台三级', '里番动漫', '门事件', '萝莉少女', '人妻', '熟女', '教师', '老师', '先生',
    '家教', '补习', '主播', '福利姬', '媛交', '金主',
    
    // BDSM相关
    'SM', 'BDSM', '调教', '捆绑', '性奴', '奴隶', '主奴', '主人', '滴蜡', '性虐', '虐待',
    '羞辱', '支配', '臣服', '口枷', '项圈', '鞭打', '犬奴', '圣水', '黄金', '灌肠',
    
    // 特定行为
    '自慰', '手淫', '无套', '叫床', '撸管', '打飞机', '下海', '交配', '破处', '破身',
    '性瘾', '爱抚', '前戏', '舔', '吸', '吮', '插入', '抽插', '活塞', '痉挛', '喷潮', '失禁', '呻吟',
    '催眠', '洗脑', '下药', '捡尸',
    
    // 平台厂商
    'JAV', 'FC2', 'FC2PPV', 'SWAG', '91', '探花', '麻豆', '天美', '精东', '果冻',
    '星空', '蜜桃', '糖心', '一本道', '加勒比', '东京热', 'HEYZO', 'SIRO', 'MGS',
    
    // 繁体补充
    '倫理', '裏番', '國產', '無碼', '有碼', '寫真', '調教', '捆綁', '人妻', '熟女'
  ],

  // ===== 中风险词汇 (权重: 30-50分) =====
  // 需要结合语境判断
  mediumRisk: [
    // 角色身份
    '少妇', '寡妇', '女仆', '姐妹', '母女', '父女', '师生', '兄妹', '姐弟', '继母', '继父', '继女',
    '阿姨', '岳母', '女教师', '女学生', '学生妹', '美少女', 'JK', '空姐', '护士', '嫩模', '外围',
    '模特', 'cosplay', 'Coser', '兔女郎', '痴女', '寝取', 'NTR',
    
    // 身体特征
    '罩杯', '贫乳', '御姐', '丝袜', '黑丝', '肉丝', '白丝', '制服', '美腿', '美足', '美臀', '屁股',
    '乳房', '奶子', '乳头', 'JK制服', '水手服', '死库水', '体操服', '白虎', '一线天', '肥臀', '肉感',
    
    // 地区类型
    '国产', '传媒', '日本', '韩国', '欧美', '港台', '里番', '无码', '有码', '步兵', '骑兵', '三级',
    '限制级', '情色', '黄色', '伦理', '日本伦理', '素人', '人妻', '熟女',
    
    // 特殊癖好
    '足交', '脚交', '恋足', '露出', '痴汉', '偷拍', '自拍', '针孔', '摄像头', '密会', '搭讪',
    
    // 繁体版本
    '禦姐', '誘惑', '三級', '亂倫', '偷拍', '女優', '自慰'
  ],

  // ===== 低风险词汇 (权重: 10-25分) =====
  // 单独出现通常无害，组合使用风险增加
  lowRisk: [
    // 弱特征词
    '福利', '激情', '动作', '爱情动作', '啪啪啪', '嘿咻', '床上', '搞基', '哥哥', '妹妹', '弟弟',
    '诱惑', '撩人', '挑逗', '大尺度', '性感', '魅惑', '真空', '凸点', '激凸', '走光', '漏底', '湿身',
    '裙底', '视角', '男友视角', '秘密', '私密', '约会',
    
    // 场所职业
    '楼凤', 'LF', '会所', '桑拿', '水疗', '按摩', '推油', '足浴', '私房', '闺密', '闺蜜', '睡前',
    '教学', '辅导', '清洁', '检查', '体检', '独居', '合租', '隔壁', '房东', '司机', '老板', '秘书',
    '加班', '夜勤', '出差', '浴室', '教室', '厕所', '电车', '公交',
    
    // 技术相关
    '会员', '付费', '解锁', '订阅', '付费内容', '付费视频', '完整版', '未删减', '泄露', '流出',
    '在线观看', '在线', '下载', '密码', '磁力', '磁链', '种子', 'torrent', 'magnet', 'BT',
    'ed2k', '迅雷', '百度网盘', '提取码', 'XX网盘', ' viu', ' netflix',
    
    // 声音描述
    '亚麻带', 'yamete', 'kimochi', '一库', 'ikuyo', '啊哼', '嗯啊', '唔唔', '啊啊',
    
    // 动物暗语
    '鸡', '鸭', '鸡婆', '小姐', '公主', '小妹', '犬交'
  ],

  // ===== 规避性变体词汇 =====
  evasionPatterns: [
    // 拼音
    'seqing', 'se qing', 'huangse', 'yinhui', 'lunli', 'fuli', 'sao', 'zuoai', 'luoli', 'youtong',
    'koujiao', 'gangqiao', 'kouhuo', 'kb', 'ns', 'zs', 'cj', 'lm', 'rj', 'yy', 'mm', 'sb',
    'cp', 'jy', 'gc', 'cc', 'xp', 'tp', '89', 'av',
    
    // 分隔符干扰
    '色*情', '淫*秽', '乱*伦', '强*奸', '诱*奸', '迷*奸', '性*奴', '卖*淫',
    '爆*乳', '巨*乳', '肛*交', '口*交', '做*爱', '性*爱', '萝*莉', '师*生',
    '色.情', '淫.秽', '乱.伦', '强.奸', '做.爱', '口.交', '肛.交', '女.优',
    '色 情', '淫 秽', '乱 伦', '强 奸', '做 爱', '口 交', '肛 交', '老 师',
    '色_情', '淫_秽', '乱_伦', '强_奸', '做_爱', '口_交', '肛_交', '学_生',
    
    // 谐音变体
    '艹', '肏', '操', '草B', '操B', '法克', 'fuck', '碧池', 'bitch', '煞笔', '沙雕',
    '簧片', '小电影', '动作片', '爱情片', '基佬', '拉拉', 'Les', 'GAY', 'GV',
    
    // 数字字母替换
    'b1tch', 'fvck', 'sh1t', 'a55', 'p0rn', 'pr0n', 'ƒuck', 'ѕex', 'рorn', 'аss', 'тits'
  ],

  // ===== 多语言扩展 =====
  international: {
    korean: [
      '한국야동', '일본야동', '품번', '섹스', '노출', '김치녀', '야동', '성인',
      '포르노', '19금', '성관계', '자위', '오르가즘', '여고생' // 여고생 = 女高中生
    ],
    russian: [
      'порно', 'секс', 'русское', 'сиськи', 'жопа', 'ебля', 'трах', 'минет',
      'анал', 'оргазм', 'мастурбация', 'голая', 'эротика'
    ],
    japanese: [
      '無碼', '人妻', '熟女', '巨乳', '貧乳', '痴漢', '露出', '素人', '中出し',
      '顔射', '鬼畜', 'ロリ', 'セーラー服', '制服', 'ギャル', 'おっぱい', 'セックス',
      'エロ', 'アダルト', 'オナニー', 'フェラ', 'パイズリ', '女子校生' // 女子校生 = 女高中生
    ],
    english: [
      'porn', 'sex', 'fuck', 'pussy', 'dick', 'cock', 'tits', 'ass', 'nude',
      'naked', 'blowjob', 'anal', 'orgasm', 'masturbate', 'cumshot', 'hardcore',
      'adult', 'xxx', 'erotic', 'nsfw', 'milf', 'teen', 'amateur', 'BDSM', 'fetish'
    ],
    spanish: [
      'porno', 'sexo', 'desnudo', 'adulto', 'erótico', 'coño', 'polla', 'tetas',
      'culo', 'follar', 'mamada', 'anal', 'orgasmo', 'masturbación'
    ],
    french: [
      'porno', 'sexe', 'nu', 'adulte', 'érotique', 'chatte', 'bite', 'seins',
      'cul', 'baiser', 'fellation', 'anal', 'orgasme', 'masturbation'
    ],
    german: [
      'porno', 'sex', 'nackt', 'erwachsene', 'erotik', 'muschi', 'schwanz', 'titten',
      'arsch', 'ficken', 'blasen', 'anal', 'orgasmus', 'masturbation'
    ],
    italian: [
      'porno', 'sesso', 'nudo', 'adulto', 'erotico', 'figa', 'cazzo', 'tette',
      'culo', 'scopare', 'pompino', 'anale', 'orgasmo', 'masturbazione'
    ],
    portuguese: [
      'porno', 'sexo', 'nu', 'adulto', 'erótico', 'buceta', 'pau', 'peitos',
      'bunda', 'transar', 'boquete', 'anal', 'orgasmo', 'masturbação'
    ],
    dutch: [
      'porno', 'seks', 'naakt', 'volwassen', 'erotisch', 'kut', 'lul', 'tieten',
      'kont', 'neuken', 'pijpen', 'anaal', 'orgasme', 'masturbatie'
    ],
    arabic: [
      'إباحية', 'جنس', 'عاري', 'بالغ', 'مثير', 'قضيب', 'مهبل', 'ثدي'
    ],
    hindi: [
      'अश्लील', 'यौन', 'नग्न', 'वयस्क', 'कामुक', 'लिंग', 'योनि', 'स्तन'
    ]
  }
};

// ===== 上下文白名单系统 (降低误报) =====
export const contextWhitelist = {
  medical: [
    // 医疗健康
    '健康', '医疗', '治疗', '疾病', '症状', '诊断', '预防', '康复', '医学', '临床',
    '医院', '医生', '护理', '药物', '手术', '检查', '体检', '病理', '解剖', '生理',
    '妇科', '男科', '泌尿科', '外科', '内科', '儿科', '肿瘤科', '皮肤科',
    '乳腺癌', '前列腺', '子宫', '卵巢', '睾丸', '阴道炎', '尿道炎', '性病', 'HPV',
    'health', 'medical', 'treatment', 'disease', 'diagnosis', 'prevention', 'therapy'
  ],
  
  educational: [
    // 教育科普
    '教育', '科普', '知识', '学习', '课程', '教学', '研究', '学术', '科学', '生物学',
    '解剖学', '生理学', '心理学', '社会学', '人类学', '性教育', '青春期', '发育',
    '教科书', '百科全书', '学校', '大学', '学院', '教授', '老师', '学生', '讲座', '论文',
    'education', 'science', 'biology', 'anatomy', 'physiology', 'textbook', 'university'
  ],
  
  news: [
    // 新闻报道
    '新闻', '报道', '案件', '法律', '判决', '起诉', '调查', '警方', '法院', '律师',
    '证据', '犯罪', '受害者', '嫌疑人', '司法', '执法', '立法', '政策', '社会',
    '公共安全', '维权', '法制', '正义', '公正', '纪录片',
    'news', 'report', 'case', 'legal', 'court', 'police', 'investigation', 'justice'
  ],
  
  art: [
    // 艺术文化
    '艺术', '文化', '历史', '文学', '电影', '戏剧', '绘画', '雕塑', '摄影', '音乐',
    '博物馆', '展览', '收藏', '古典', '现代', '当代', '创作', '作品', '艺术家',
    '文艺复兴', '印象派', '抽象派', '写实主义', '浪漫主义', '人体艺术',
    'art', 'culture', 'history', 'literature', 'museum', 'exhibition', 'artist'
  ],
  
  fitness: [
    // 健身运动
    '健身', '运动', '锻炼', '训练', '体能', '肌肉', '力量', '耐力', '柔韧性',
    '瑜伽', '普拉提', '有氧运动', '无氧运动', '跑步', '游泳', '举重', '体操',
    'fitness', 'exercise', 'training', 'workout', 'muscle', 'strength', 'yoga'
  ]
};

// ===== 组合检测规则系统 =====
export const combinationRules = [
  // 极高风险组合 (立即拦截)
  {
    pattern: ['未成年', '性', '视频'],
    weight: 300,
    action: 'block',
    description: '涉及未成年人的性内容'
  },
  {
    pattern: ['幼女', '萝莉', '诱惑'],
    weight: 300,
    action: 'block',
    description: '儿童性剥削内容'
  },
  {
    pattern: ['强奸', '真实', '记录'],
    weight: 300,
    action: 'block',
    description: '性暴力内容'
  },
  {
    pattern: ['儿童', '猥亵'],
    weight: 300,
    action: 'block',
    description: '儿童性虐待'
  },
   {
    pattern: ['女高中生', '肉体'],
    weight: 250,
    action: 'block',
    description: '角色扮演与身体部位'
  },
  
  // 高风险组合 (人工审核)
  {
    pattern: ['制服', '诱惑', '学生'],
    weight: 180,
    action: 'human_review',
    description: '可能的角色扮演成人内容'
  },
  {
    pattern: ['护士', '按摩', '私密'],
    weight: 120,
    action: 'human_review',
    description: '可能的职业角色成人内容'
  },
  {
    pattern: ['女高中生', '老师'],
    weight: 180,
    action: 'human_review',
    description: '师生关系相关的成人内容'
  },
   {
    pattern: ['女高中生', '先生'],
    weight: 180,
    action: 'human_review',
    description: '师生关系相关的成人内容'
  },
  {
    pattern: ['女学生', '老师'],
    weight: 180,
    action: 'human_review',
    description: '师生关系相关的成人内容'
  },
  {
    pattern: ['女学生', '先生'],
    weight: 180,
    action: 'human_review',
    description: '师生关系相关的成人内容'
  },
  {
    pattern: ['妹妹', '哥哥', '继'],
    weight: 160,
    action: 'human_review',
    description: '可能的乱伦内容'
  },
  {
    pattern: ['护士', '病栋', '私密'],
    weight: 150,
    action: 'human_review',
    description: '可能的职业角色成人内容'
   },
  {
    pattern: ['主播', '福利', '付费'],
    weight: 120,
    action: 'human_review',
    description: '可能的付费成人内容'
  },
  {
    pattern: ['人妻', '出轨'],
    weight: 150,
    action: 'human_review',
    description: '特定成人题材'
  },
  {
    pattern: ['教师', '补习', '秘密'],
    weight: 160,
    action: 'human_review',
    description: '师生关系相关的成人内容'
  },
   {
    pattern: ['学生', '家教', ' अकेले'], // अकेले = alone in Hindi
    weight: 150,
    action: 'human_review',
    description: '师生关系相关的成人内容'
  },
  {
    pattern: ['秘书', '老板', '办公室'],
    weight: 140,
    action: 'human_review',
    description: '可能的职业角色成人内容'
  },
  {
    pattern: ['少女', '催眠'],
    weight: 170,
    action: 'human_review',
    description: '特定成人题材'
  },

  // 中风险组合 (AI审核)
  {
    pattern: ['写真', '大尺度', '私房'],
    weight: 80,
    action: 'ai_review',
    description: '边缘性感内容'
  },
  {
    pattern: ['JK', '痴汉', '电车'],
    weight: 90,
    action: 'ai_review',
    description: '边缘性感内容'
   },
  {
    pattern: ['直播', '深夜', '互动'],
    weight: 60,
    action: 'ai_review',
    description: '可能的成人直播'
  },
  {
    pattern: ['熟女', '在线观看'],
    weight: 85,
    action: 'ai_review',
    description: '角色与技术词组合'
  },
  {
    pattern: ['国产', '泄露'],
    weight: 95,
    action: 'ai_review',
    description: '地区与高风险行为组合'
  },
  {
    pattern: ['护士', '检查'],
    weight: 80,
    action: 'ai_review',
    description: '职业与模糊行为组合'
  },
  {
    pattern: ['妹妹', '房间'],
    weight: 80,
    action: 'ai_review',
    description: '家庭关系与私密场所组合'
  }
];

// ===== 权重计算系统 =====
export const weightSystem = {
  criticalRisk: 200,
  highRisk: 100,
  mediumHighRisk: 80,
  mediumRisk: 50,
  lowRisk: 20,
  evasionPatterns: 50,
  international: {
    korean: 60,
    russian: 60,
    japanese: 70,
    english: 80,
    spanish: 40,
    french: 40,
    german: 40,
    italian: 40,
    portuguese: 40,
    dutch: 40,
    arabic: 30,
    hindi: 30
  }
};

// ===== 决策阈值系统=====
export const decisionThresholds = {
  BLOCK: 200,           // 立即拦截
  HUMAN_REVIEW: 110,    // 人工审核
  AI_REVIEW: 75,        // AI深度审核
  FLAG: 50,             // 标记监控
  APPROVED: 0           // 通过
};

// ===== 核心审核逻辑 (内部函数，不导出) =====
// 这个函数现在接收所有依赖作为参数，解决了作用域问题
function _moderateContentLogic(
  text: string,
  config: {
    words: typeof yellowWords;
    whitelist: typeof contextWhitelist;
    rules: typeof combinationRules;
    weights: typeof weightSystem;
    thresholds: typeof decisionThresholds;
  },
  _context = {}
) {
  let totalScore = 0;
  const flags: string[] = [];
  const matchedWords: Array<{word: string; category: string; weight: number}> = [];
  
  if (!text || typeof text !== 'string') {
    return {
      decision: 'APPROVED',
      totalScore: 0,
      matchedWords: [],
      flags: ['invalid_input'],
      hasWhitelistContext: false,
      recommendation: '输入内容无效',
    };
  }
  
  const lowerCaseText = text.toLowerCase();

  // 第一层：关键词检测
  Object.entries(config.words).forEach(([category, words]) => {
    if (Array.isArray(words)) {
      words.forEach(word => {
        if (lowerCaseText.includes(word.toLowerCase())) {
          const weight = config.weights[category as keyof Omit<typeof weightSystem, 'international'>] || 10;
          totalScore += weight;
          matchedWords.push({ word, category, weight });
        }
      });
    } else if (typeof words === 'object' && category === 'international') {
      // 处理 international 对象
      Object.entries(words).forEach(([lang, langWords]) => {
        (langWords as string[]).forEach(word => {
          if (lowerCaseText.includes(word.toLowerCase())) {
            const weight = config.weights.international[lang as keyof typeof weightSystem.international] || 10;
            totalScore += weight;
            matchedWords.push({ word, category: `international_${lang}`, weight });
          }
        });
      });
    }
  });
  
  // 第二层：上下文分析 (降权)
  let hasWhitelistContext = false;
  Object.values(config.whitelist).forEach(contextWords => {
    if (hasWhitelistContext) return; // 优化：一旦找到白名单上下文就停止检查
    for (const contextWord of contextWords) {
      if (lowerCaseText.includes(contextWord.toLowerCase())) {
        hasWhitelistContext = true;
        break;
      }
    }
  });
  
  if (hasWhitelistContext && totalScore < config.thresholds.HUMAN_REVIEW) {
    totalScore *= 0.9; // 降权
    flags.push('whitelist_context_detected');
  }
  
  // 第三层：组合规则检测
  config.rules.forEach(rule => {
    const allMatched = rule.pattern.every(keyword => 
      lowerCaseText.includes(keyword.toLowerCase())
    );
    if (allMatched) {
      totalScore += rule.weight;
      flags.push(`combination_${rule.action}_${rule.description}`);
    }
  });

  // 内部辅助函数，解决了未导出的问题
  function getRecommendation(decision: string, _score: number): string {
    switch (decision) {
      case 'BLOCK':
        return '内容包含严重违规词汇，建议立即拦截';
      case 'HUMAN_REVIEW':
        return '内容存在较高风险，需要人工审核';
      case 'AI_REVIEW':
        return '内容存在中等风险，建议AI深度分析';
      case 'FLAG':
        return '内容存在轻微风险，标记监控';
      default:
        return '内容通过基础检测';
    }
  }
  
  // 决策逻辑
  let decision = 'APPROVED';
  if (totalScore >= config.thresholds.BLOCK) {
    decision = 'BLOCK';
  } else if (totalScore >= config.thresholds.HUMAN_REVIEW) {
    decision = 'HUMAN_REVIEW';
  } else if (totalScore >= config.thresholds.AI_REVIEW) {
    decision = 'AI_REVIEW';
  } else if (totalScore >= config.thresholds.FLAG) {
    decision = 'FLAG';
  }
  
  return {
    decision,
    totalScore,
    matchedWords,
    flags,
    hasWhitelistContext,
    recommendation: getRecommendation(decision, totalScore)
  };
}

// ===== 导出的主函数 =====
// 这个函数封装了内部逻辑，并自动传入所有配置，保持外部调用接口的简洁性
export function moderateContent(text: string, context = {}) {
  const config = {
    words: yellowWords,
    whitelist: contextWhitelist,
    rules: combinationRules,
    weights: weightSystem,
    thresholds: decisionThresholds
  };
  return _moderateContentLogic(text, config, context);
}


// ===== 持续优化机制=====
export const optimizationSystem = {
  // 反馈学习
  addFeedback: function(_content: string, _humanDecision: string, _systemDecision: string) {
    // 记录人工审核与系统判断的差异，用于优化权重
  },
  
  // 新词汇发现
  discoverNewTerms: function(_flaggedContent: string) {
    // 通过聚类分析发现新的规避词汇
  },
  
  // 动态权重调整
  adjustWeights: function(_category: string, _adjustment: number) {
    // 根据误报率和漏报率动态调整权重
  }
};
