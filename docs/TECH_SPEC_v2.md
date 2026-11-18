# 红果短剧电商商家赋能工具 · 优化版技术方案（v2.0）

> 本文件与仓库内 `src/data/techSpecMarkdown.ts` 保持同步。v2.0 重点针对 v1.0 的 **密钥防泄露（Thin-Backend OAuth Relay）**、**向量检索轻量化（移除 FAISS/OpenCV，改用连续矩阵 SIMD 精确检索）**、**渠道规则云端热更新** 与 **SQLite Single-Writer 并发写入** 四大工程瓶颈进行了重构并已落地源码实现。

---

## 1. 可行性总评与关键优化决策

| 维度 | v1.0 原方案 | v2.0 优化方案 | 优化收益 |
|---|---|---|---|
| **OAuth 密钥安全** | `app_secret` 分片混淆硬编码在 Qt 客户端 | **极轻量云端 Token 代理服务**托管 `app_secret` 与签名 | 消除 ISV 密钥被逆向提取与平台封号风险 |
| **向量检索引擎** | FAISS C++ (HNSW) + OpenCV | **纯 C++17 连续 Float32 矩阵精确点积** + `QImage` 原生缩放 | N ≤ 5,000 时 < 2ms 100% 精确召回，体积降 60% |
| **图像分类策略** | OpenCV 边缘/连通域启发式 | **边缘白底率 + 色阶熵 + 离线 CLIP 文本锚点常量** | 0 运行时文本模型开销，显著降低误判率 |
| **渠道字段适配** | 客户端内嵌匹配表 | **服务端签名下发 `channel_rules.json`** + 本地重算 | 平台调整字段时 5 分钟内热更新，免重新打包 |
| **SQLite 并发** | 多线程直连 WAL | **Single-Writer 串行写队列** + 近 14 天滑动窗口重算 | 彻底消除 `SQLITE_BUSY` 与跨天退款账目漂移 |
| **工期与交付** | 17 人日（2 周），签名证书可选 | **M0 资质前置（2 周）+ MVP 开发（4 周）+ 强制代码签名** | 规避审核周期错判与杀软拦截 |

---

## 2. 仓库内对应代码映射

- **桌面端 C++17 核心库**：`desktop/HongguoTool/src/core/`
  - `channel_resolver.cpp`：优先级匹配与字段分布统计
  - `metric_calculator.cpp`：净 GMV、超时风险单、爆单指数
  - `alert_engine.cpp`：冷却去重 + 23:00–08:00 夜间静默
  - `exact_cosine_index.cpp`：10MB 连续内存精确余弦检索 + `swap-and-pop` 删除 + `HGV2` 二进制持久化
  - `license_validator.cpp`：2/3 硬件指纹容错 + 7 天只读宽限期
- **桌面端基础设施层**：`desktop/HongguoTool/src/infra/`
  - `oauth_loopback.cpp`：`QTcpServer` 本地回环 + PKCE + 云端中继交换
  - `sqlite_writer.cpp`：WAL + `busy_timeout=5000` 单写工作线程
  - `onnx_clip_embedder.cpp`：`QImage` 原生预处理（无 OpenCV）+ ONNX Runtime 推理 + 结构启发式判定
- **Web 同构引擎与中继服务端**：`src/core/*` & `server.ts`
