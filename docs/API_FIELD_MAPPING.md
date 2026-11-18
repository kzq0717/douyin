# 官方 API 字段映射与 M0 门禁验证表

> 所有平台字段名称及枚举值在 M0 联调阶段必须以官方最新文档及真实店铺抽样为准，并配置化写入 `channel_rules.json`。

## 1. 抖店 / 千川核心接口清单

| 平台 | 接口能力 | 用途 | 权限策略 |
|---|---|---|---|
| 抖店开放平台 | `order.searchList` / `order.orderDetail` | 增量订单拉取与渠道字段提取 | 必选（按 `update_time` 游标） |
| 抖店开放平台 | `product.listV2` / `product.detail` | 商品列表与主图 URL 拉取 | 必选（只读同步） |
| 抖店开放平台 | `sku.stockBatchSync` | 批量改库存（分片 + 回读校验） | 写权限包（受批量护栏保护） |
| 抖店开放平台 | `product.editV2` / `product.setOffline` | 批量改价 / 上下架 | 高危写权限（需二次确认码） |
| 巨量引擎（千川） | 广告计划日级报表接口 | 消耗、归因成交与 T+1 真实 ROI | 只读（禁止自动调预算写操作） |

## 2. 订单渠道字段映射候选表

| 业务字段 | 平台候选字段 | 映射规则示例 | 备注 |
|---|---|---|---|
| `channel = hongguo` | `scene_type` | `hongguo_drama`, `hongguo_search_same`, `redfruit_mall` | 优先级 1 |
| `channel = hongguo` | `app_source` | `hongguo`, `com.phoenix.read`, `redfruit` | 优先级 2 |
| `channel = hongguo` | `theme_type` | `short_drama_same_style`, `9001` | 优先级 3 |
| `channel = live` | `b_type` | `live`, `1`, `douyin_live` | 优先级 4 |
| `channel = video` | `b_type` | `video`, `2`, `short_video` | 优先级 5 |
| `channel = mall` | `b_type` | `mall`, `0`, `douyin_mall` | 优先级 7 |

## 3. M0 退出硬门禁

1. 完成企业资质认证并获取至少 1 家真实授权测试店铺的 Token。
2. 对 ≥ 200 笔历史订单运行 `ChannelResolver::analyzeDistribution`，确认红果渠道字段命中率与可解释性。
3. 在普通办公本 CPU 上验证 `clip_vit_b32_vision_int8.onnx` 单图推理耗时 ≤ 120ms。
