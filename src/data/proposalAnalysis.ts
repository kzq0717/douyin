export interface FeasibilityDimension {
  dimension: string;
  verdict: '高可行' | '有条件可行' | '需重点重构';
  scoreLabel: string;
  summary: string;
  keyGate: string;
}

export interface OptimizationItem {
  id: string;
  area: string;
  severity: '关键阻塞' | '架构优化' | '工程提效';
  v1Original: string;
  v2Optimized: string;
  rationale: string;
  codeSnippet: string;
}

export interface ExpansionIdea {
  phase: string;
  title: string;
  targetCustomer: string;
  valueProp: string;
  technicalPath: string;
}

export const FEASIBILITY_DIMENSIONS: FeasibilityDimension[] = [
  {
    dimension: '商业定位与合规红线',
    verdict: '高可行',
    scoreLabel: '合规闭环完整',
    summary:
      '坚持“仅用官方开放 API + 不抓短剧流 + 不承诺识别命中”三条红线，将收入与爆品波动解耦，30–50 家付费工作室即可覆盖单人维护成本。',
    keyGate: '需以企业主体申请抖店服务市场 ISV 资质，个人开发者通常无法获取跨店铺订单/库存写权限。',
  },
  {
    dimension: '抖店渠道字段可拆分性',
    verdict: '有条件可行',
    scoreLabel: '需 M0 实测验证',
    summary:
      '抖店订单接口提供流量来源枚举，但红果短剧在不同类目与版本中可能映射到不同字段（scene_type / app_source / theme_type），并非固定单字段。',
    keyGate: '将 ChannelResolver 规则从客户端抽离至服务端下发 JSON，平台调整映射时免发版热更新。',
  },
  {
    dimension: '本地图像检索与白底检测',
    verdict: '高可行',
    scoreLabel: '可大幅简化依赖',
    summary:
      'CLIP ViT-B/32 视觉编码器（INT8 ONNX）在 4 核 CPU 上单图约 50–90ms；但 5,000 图规模引入 FAISS C++ 与 OpenCV 属于过度设计。',
    keyGate: '改用 10MB 连续 Float32 矩阵 + SIMD 精确余弦检索（< 2ms）+ QImage 原生预处理，安装包可从 250MB 压至 95MB。',
  },
  {
    dimension: '安全架构与密钥保管',
    verdict: '需重点重构',
    scoreLabel: 'MVP 存在泄露风险',
    summary:
      '原方案 MVP 将 app_secret 混淆拆片硬编码在 Qt 客户端内，逆向提取后可冒用 ISV 身份并打爆全局 QPS 配额，导致应用被平台封禁。',
    keyGate: '即使 MVP 也必须引入极轻量云函数/Node 服务托管 app_secret 并代理 code 换取 token，客户端零密钥。',
  },
  {
    dimension: 'Qt6 + ONNX 工期与交付',
    verdict: '有条件可行',
    scoreLabel: '原 17 人日偏乐观',
    summary:
      '对熟悉 C++/Qt 的开发者技术栈匹配，但含 OAuth、同步游标、SQLite 并发、ONNX 封装与审核等待，实际 MVP 需 4–5 周。',
    keyGate: '未签名的 Qt + ONNX 客户端极易被杀软/SmartScreen 拦截，代码签名证书需提前至首次外测前采购。',
  },
  {
    dimension: '千川 ROI 归因准确度',
    verdict: '有条件可行',
    scoreLabel: 'T+1 估算口径',
    summary:
      '千川按计划归因、抖店按订单落库，天然存在多对多模糊区；原方案提出的“真实 ROI（扣退款与成本）”具有极强差异化卖点。',
    keyGate: '增加 SKU 成本维护表与“精确 SKU 归因 / 店铺时间窗估算”双标签，明确数据截至 T+1。',
  },
];

export const OPTIMIZATION_ITEMS: OptimizationItem[] = [
  {
    id: 'opt-secret',
    area: 'M1 授权安全边界',
    severity: '关键阻塞',
    v1Original: 'MVP 纯本地桌面端，使用混淆 + 分片存储将 app_secret 打包进 .exe。',
    v2Optimized: 'MVP 即采用“瘦认证中继 + 本地重计算”架构：50 行无状态代理服务托管 app_secret 与签名，客户端只持短期 access_token。',
    rationale: '彻底消除客户端被逆向后导致全平台 ISV 应用被吊销的致命风险，且云函数/轻量容器月成本不足 30 元。',
    codeSnippet: `// 服务端 OAuth Token Exchange（客户端零 app_secret）
app.post('/api/oauth/exchange', async (req, res) => {
  const { code, codeVerifier } = req.body;
  // 服务端注入 process.env.DOUDIAN_APP_SECRET 并完成 HMAC-SHA256 签名
  const tokenBundle = await doudianClient.exchangeCode({ code, codeVerifier });
  res.json({ shopId: tokenBundle.shopId, accessToken: tokenBundle.accessToken, expiresIn: tokenBundle.expiresIn });
});`,
  },
  {
    id: 'opt-faiss',
    area: '识图检索与包体积优化',
    severity: '架构优化',
    v1Original: '引入 FAISS C++（HNSW）+ OpenCV + CLIP FP32 ONNX，预估包体积 120MB（实际常超 230MB）。',
    v2Optimized: '≤ 5,000 SKU 时移除 FAISS 与 OpenCV：QImage 直接双线性缩放归一化；连续 Float32 矩阵 SIMD 精确余弦检索；INT8 量化 CLIP ONNX。',
    rationale: '5,000 × 512 向量仅占 10MB 内存，AVX2 精确点积耗时 < 2ms、100% 召回率，彻底免去 Windows 编译 FAISS 与墓碑删除难题。',
    codeSnippet: `// C++20 / Qt6 无 FAISS 精确余弦检索（5000x512 仅 ~1.4ms）
float dotProduct512(const float* a, const float* b) {
  float sum = 0.0f;
  for (int i = 0; i < 512; ++i) sum += a[i] * b[i]; // 编译器自动向量化为 AVX2/FMA
  return sum;
}`,
  },
  {
    id: 'opt-clip-prompt',
    area: '白底图与场景丰富度判定',
    severity: '架构优化',
    v1Original: '依赖 OpenCV 角点密度与连通域启发式规则判断“白底图 / 平铺 / 有场景”。',
    v2Optimized: '边缘纯白占比 + 色阶熵检测，叠加 CLIP 文本塔离线预计算的 4 个锚点向量（白底棚拍 / 平铺 / 穿搭场景 / 居家生活）做零样本余弦打分。',
    rationale: 'CLIP 文本编码器无需打包进客户端，仅需 4×512 = 8KB 常量向量，即可显著减少浅色背景场景图被误判为白底图的概率。',
    codeSnippet: `// 离线预计算 4 组 CLIP 文本锚点向量（0 运行时文本模型开销）
constexpr float kAnchorWhiteBg[512] = { /* "product isolated on pure white studio background" */ };
constexpr float kAnchorLifestyle[512] = { /* "person wearing or using product in daily lifestyle scene" */ };`,
  },
  {
    id: 'opt-rules-hotfix',
    area: '渠道规则与 API 字段热更新',
    severity: '架构优化',
    v1Original: 'ChannelResolver 规则与接口路径本地随包分发，字段变动需客户端发版更新。',
    v2Optimized: '随更新检测接口下发签名后的 channel_rules.json（含字段优先级与平台枚举映射），本地保留原始 channel_raw 供回溯重算。',
    rationale: '当抖店调整红果流量标识字段时，5 分钟内全量商家热更新规则并本地重跑订单渠道分类，零停机。',
    codeSnippet: `GET /api/rules/channel -> {
  "version": "2026.11.17",
  "rules": [
    { "id": "rule_hg_scene", "channel": "hongguo", "priority": 1, "field": "sceneType", "matchValues": ["hongguo_drama", "hongguo_search_same"] }
  ]
}`,
  },
  {
    id: 'opt-sqlite-writer',
    area: 'SQLite 并发写入与双口径归期',
    severity: '工程提效',
    v1Original: 'UI 线程与同步线程共用 SQLite WAL，metric_daily 按日快照未说明跨天退款重算机制。',
    v2Optimized: '强制单一写入队列（Single-Writer Thread + busy_timeout=5000ms），每次同步后自动重算近 14 天滑动窗口内的 metric_daily。',
    rationale: '避免多任务并发写触发 SQLITE_BUSY，同时解决第 3 天发生售后退款导致历史日报与净 GMV 不一致的财务对账缺陷。',
    codeSnippet: `PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;`,
  },
  {
    id: 'opt-timeline',
    area: 'M0 验证门禁与工期校准',
    severity: '工程提效',
    v1Original: 'M0 仅 3–5 天，应用申请仅估 1 天，MVP 合计 17 人日（2 周）。',
    v2Optimized: '拆分为 M0a（企业主体 + ISV 审核 2 周并行前置）与 M0b（核心闭环开发 4 周），将代码签名证书纳入首测前置项。',
    rationale: '预留真实审核周期与 Windows SmartScreen 信誉积累期，避免开发完成后因无权限或被杀软拦截无法交付试点商家。',
    codeSnippet: `# M0 退出硬门禁 Checklist
1. 拿到抖店正式店铺测试 Token（非仅沙箱）
2. 抽样 >= 200 笔真实订单验证 hongguo 渠道占比可解释
3. INT8 CLIP ONNX 在老旧办公本 (i5-10210U) 单图 <= 120ms`,
  },
  {
    id: 'opt-batch-safety',
    area: '批量改价/下架风控与回滚栈',
    severity: '工程提效',
    v1Original: 'op_log 仅做“撤销参考”，降价或下架仅用确认码拦截。',
    v2Optimized: '引入价格护栏（跌幅 > 30% 或低于 SKU 成本价强拦截）、配额预算预估与一键生成反向回滚 Plan（Snapshot -> Restore）。',
    rationale: '大幅降低大促爆单慌乱操作下的误改价损失，让“可逆操作”成为工作室多员工协作的定心丸。',
    codeSnippet: `if (targetPrice < sku.costEstimate) {
  plan.warnings.push_back("低于预估成本价，需主管双人复核或显式解锁");
}`,
  },
  {
    id: 'opt-architecture-ui',
    area: '桌面端渲染与 Web 管理台协同',
    severity: '架构优化',
    v1Original: 'Qt Widgets 桌面端与 V2 Vue Web 端各自独立渲染业务表格与图表。',
    v2Optimized: 'V1 起即保持 Core 逻辑与 JSON Schema 标准化；桌面端专注“本地重算与视觉实验室”，V2 团队版通过本地/云端 REST 共享同一套指标口径。',
    rationale: '保证桌面端与 Web 端“红果净 GMV / 爆单指数 / 真实 ROI”数字绝对一致，避免多端对数灾难。',
    codeSnippet: `// Core 指标 Schema 统一对齐：桌面端 C++ 与服务端 TS/Go 输出完全同构 JSON`,
  },
];

export const EXPANSION_IDEAS: ExpansionIdea[] = [
  {
    phase: 'V2 运营深化（3–6 个月）',
    title: '短剧热词与商品标题/标签合规自检台',
    targetCustomer: '多店工作室 · 美工与运营团队',
    valueProp: '结合商家自有订单高转化关键词，对比商品标题与属性缺失项，在不触碰平台黑盒的前提下提升商品信息完整度与搜同款候选匹配面。',
    technicalPath: '纯文本分词 + TF-IDF / 轻量本地词库匹配 + 抖店属性必填校验接口。',
  },
  {
    phase: 'V2 财务与履约（3–6 个月）',
    title: '爆单应急预案与代发供应商分单路由',
    targetCustomer: '一件代发中小商家 · 供应链负责人',
    valueProp: '当“爆单指数 >= 3x”触发时，自动生成“限购阈值调整 + 预售时效切换 + 备用供应商导出包”，把告警从“看见风险”推进到“一键止损”。',
    technicalPath: '基于告警引擎动作钩子（Action Hook）串联 BatchOperationPlanner 预置模板。',
  },
  {
    phase: 'V3 生态协同（6–12 个月）',
    title: '制片方 / 剧方“道具植入带货归因”独立看板',
    targetCustomer: '短剧制片公司 · 品牌植入代理商',
    valueProp: '为制片方提供多品牌授权店铺的聚合渠道报表（只脱敏展示渠道单量、GMV 与植入剧集时段曲线），解决品牌植入后无法量化带货效果的痛点。',
    technicalPath: '私有化部署形态 + 多租户只读授权视图 + 分时段播映曲线叠加层。',
  },
  {
    phase: 'V4 智能工作流（12 个月+）',
    title: '合规前提下的“本地 AIGC 场景图构图辅助”',
    targetCustomer: '缺专业美工的中小商家',
    valueProp: '当系统检测到某高潜商品只有白底图时，引导商家在本地通过合规背景替换与光影合成生成多套生活场景图，并用内置视觉评估模型即时对比构图完整度。',
    technicalPath: '本地轻量抠图分割（RMBG-1.4 ONNX ~40MB）+ 合规场景模板合成 + CLIP 评分闭环。',
  },
];
