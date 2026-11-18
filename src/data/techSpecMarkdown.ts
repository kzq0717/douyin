export const OPTIMIZED_TECH_SPEC_MARKDOWN = `# 红果短剧电商商家赋能工具 · 优化版技术方案（v2.0）

> 修订说明：本方案基于 v1.0 进行工程可行性与商业合规深度评审后升级，重点解决 **密钥防泄露（Thin-Backend OAuth Relay）**、**视觉检索轻量化（移除 FAISS/OpenCV，改用连续矩阵 SIMD 精确检索 + INT8 ONNX）**、**渠道规则云端热更新** 与 **SQLite 单写队列双口径重算** 四大关键瓶颈。

---

## 1. 可行性总评与关键优化决策

| 维度 | v1.0 原方案 | v2.0 优化方案 | 优化收益 |
|---|---|---|---|
| **OAuth 密钥安全** | \`app_secret\` 分片混淆硬编码在 Qt 客户端 | **极轻量云端 Token 代理服务**托管 \`app_secret\` 与 HMAC 签名 | 消除 ISV 密钥被逆向提取与平台封号风险 |
| **向量检索引擎** | FAISS C++ (HNSW) + OpenCV | **纯 C++20 连续 Float32 矩阵 SIMD 点积** + \`QImage\` 原生缩放 | N ≤ 5,000 时 < 2ms 100% 精确召回，体积降 60% |
| **图像分类策略** | OpenCV 边缘/连通域启发式 | **边缘白底率 + 色阶熵 + 离线 CLIP 文本锚点常量** | 0 运行时文本模型开销，显著降低误判率 |
| **渠道字段适配** | 客户端内嵌匹配表 | **服务端签名下发 \`channel_rules.json\`** + 本地重算 | 平台调整字段时 5 分钟内热更新，免重新打包 |
| **SQLite 并发** | 多线程直连 WAL | **Single-Writer 串行写队列** + 近 14 天滑动窗口重算 | 彻底消除 \`SQLITE_BUSY\` 与跨天退款账目漂移 |
| **工期与交付** | 17 人日（2 周），签名证书可选 | **M0 资质前置（2 周）+ MVP 开发（4 周）+ 强制代码签名** | 规避审核周期错判与杀软拦截导致的试商用受阻 |

---

## 2. 优化后系统架构（瘦中继 + 本地重计算）

\`\`\`mermaid
flowchart LR
  subgraph Client["商家本地桌面端（Qt 6.5 LTS / C++17）"]
    UI[看板 / 告警 / 批量 / 识图]
    Core[Pure Core：指标 · 告警 · 批量规划 · 精确余弦检索]
    Ort[ONNX Runtime CPU EP · CLIP ViT-B/32 INT8]
    DB[(SQLite WAL · Single-Writer)]
  end

  subgraph Relay["极轻量云端中继（Node/Go · 月成本 < 50元）"]
    Auth[OAuth Token Exchange · 托管 app_secret]
    Rules[channel_rules.json 热更新分发]
    Lic[License 签名验证与版本清单]
  end

  subgraph Official["官方开放平台"]
    DD[抖店开放平台 API]
    QC[巨量千川只读报表 API]
  end

  UI --> Core
  Core --> Ort
  Core --> DB
  Client -->|HTTPS: code换token / 拉取规则| Relay
  Relay -->|HTTPS + 服务端签名| DD
  Client -->|HTTPS + 短期access_token| DD
  Client -->|HTTPS| QC
\`\`\`

### 架构边界原则

1. **商家数据不出本地**：订单明细、商品库存、千川报表与商品图片全部落盘在商家本地 SQLite 与本地目录，云端中继**零存储商家经营数据**。
2. **应用密钥不出云端**：\`app_secret\`、签名私钥、渠道热更新规则签名私钥严格驻留云端中继。

---

## 3. 核心模块工程实现规范

### 3.1 渠道识别与热更新（ChannelResolver）

订单原始 JSON 中的 \`sceneType\` / \`appSource\` / \`themeType\` / \`bType\` 在入库时必须同时保留 \`channel_raw\` 快照，支持规则热更新后全量本地重分类：

\`\`\`typescript
// 规则优先级匹配（已在本项目 src/core/channelResolver.ts 实现并单测通过）
export function resolveOrderChannel(order: RawDoudianOrder, rules: ChannelRule[]) {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    const val = order[rule.field];
    if (val !== undefined && rule.matchValues.some(v => v.toLowerCase() === String(val).toLowerCase())) {
      return { channel: rule.channel, matchedRuleId: rule.id };
    }
  }
  return { channel: 'other', matchedRuleId: 'fallback_default' };
}
\`\`\`

### 3.2 指标计算与双口径对账（MetricEngine）

- **红果净 GMV**：\`SUM(pay_amount - refund_amount)\`（按支付时间归期 + 每次同步重算近 14 天退款更新）。
- **超时发货风险单**：\`order_status == 'paid_unshipped' && (ship_deadline - now) <= 4h\`。
- **爆单指数**：\`近 1 小时有效单量 / 过去 7 天同时段均值\`，比值 \`>= 3.0\` 触发一级预警。
- **千川真实 ROI**：\`(attributed_gmv - refund_amount - estimated_cogs) / cost\`，并显式标注 \`精确 SKU 归因\` 或 \`店铺时间窗估算\`。

### 3.3 告警引擎去重与静默策略（AlertEngine）

- **冷却期去重（Cooldown）**：同一 \`(ruleId, subject)\` 在 \`cooldownMin\` 分钟内仅触发一次，防止爆单时桌面弹窗风暴。
- **夜间静默（Quiet Hours）**：\`23:00–08:00\` 自动过滤 \`warning\` 级别，仅推送 \`critical\` 级（爆单指数 >= 3x、超时风险单积压、库存 <= 5）。

### 3.4 本地图像检索与白底检测（替代 FAISS）

对于单店/工作室常见规模（\`N <= 5,000\` 张 SKU 主图）：

1. **内存占用**：\`5,000 × 512 × 4B ≈ 10.24 MB\`，可全量常驻连续 \`std::vector<float>\`（64 字节对齐）。
2. **检索性能**：单次查询执行 5,000 次 512 维点积（256 万次乘加），在开启 AVX2 的现代 CPU 上耗时 **< 2 ms**，且为 **100% 精确召回**。
3. **增删改维护**：删除某 SKU 图片仅需 \`swap-and-pop\` 交换尾部元素，彻底摆脱 FAISS HNSW 的墓碑标记与索引重建复杂度。
4. **白底图 / 平铺 / 场景三分类**：结合边缘 8% 区域纯白像素占比（\`>= 0.72\` 且前景覆盖率 \`<= 0.68\` 判为白底图）、梯度边缘密度、亮度直方图熵及预计算 CLIP 文本锚点向量，给出可解释的补充场景图建议（不承诺平台识别率）。

---

## 4. 风险前置门禁（M0 退出标准）

在投入大规模 UI 开发前，必须按顺序完成以下 3 项硬验证：

1. **资质与权限门禁**：以企业主体完成抖店开放平台服务商注册，并确认获取 \`order.searchList\`、\`product.listV2\`、\`sku.stockBatchSync\` 权限包。
2. **真实样本渠道验证**：接入 1 家测试店铺近 30 天真实订单，运行 \`analyzeChannelDistribution\`，确认红果相关来源字段可稳定解析。
3. **低配 PC 推理基准**：在商家主流办公机（如 i5-10210U / 8GB RAM）上验证 CLIP ViT-B/32 INT8 ONNX 单图推理 \`<= 120ms\`，整包体积 \`<= 100MB\`。

---

## 5. 后续扩展演进路线（V2 → V4）

- **V2.1 短剧热词与商品属性完整度自检**：基于高转化订单词库与平台类目必填项，辅助商家补全基础信息。
- **V2.2 爆单应急预案钩子**：爆单 >= 3x 时自动生成“限购 + 预售切换 + 代发分单导出”待审计划。
- **V3.0 制片方 / 植入方多租户脱敏看板**：为短剧制片方聚合多合作店铺的植入时段成交曲线（零消费隐私）。
- **V4.0 本地合规构图辅助**：引入轻量本地抠图模型（RMBG-1.4 ONNX）辅助缺美工商家生成生活场景副图并即时评估。
`;
