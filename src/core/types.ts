export type Channel = 'hongguo' | 'mall' | 'live' | 'video' | 'search' | 'other' | 'unknown';

export interface Shop {
  shopId: string;
  shopName: string;
  authStatus: 'valid' | 'expiring' | 'expired';
  tokenExpiresAt: string;
  experienceScore: number;
  yesterdayScore: number;
  lastSyncAt: string;
}

export interface RawDoudianOrder {
  orderId: string;
  shopId: string;
  bType?: string | number;
  subBType?: string | number;
  sceneType?: string;
  themeType?: string;
  appSource?: string;
  payAmount: number;
  refundAmount: number;
  itemCount: number;
  skuId: string;
  productTitle: string;
  orderStatus: 'paid_unshipped' | 'shipped' | 'completed' | 'closed_unpaid' | 'refunded';
  payTime: string;
  shipDeadline: string;
  shipTime?: string;
  refundTime?: string;
  updateTime: string;
}

export interface NormalizedOrder extends RawDoudianOrder {
  channel: Channel;
  channelRaw: string;
  matchedRuleId: string;
}

export interface ChannelRule {
  id: string;
  channel: Channel;
  priority: number;
  field: keyof Pick<RawDoudianOrder, 'sceneType' | 'themeType' | 'appSource' | 'subBType' | 'bType'>;
  matchValues: string[];
}

export interface SkuItem {
  skuId: string;
  shopId: string;
  productId: string;
  title: string;
  category: string;
  stock: number;
  safetyThreshold: number;
  price: number;
  costEstimate: number;
  status: 'on_sale' | 'off_shelf';
  imgMain: string;
  updateTime: string;
}

export interface ChannelMetricSummary {
  channel: Channel;
  label: string;
  gmvGross: number;
  refundAmount: number;
  gmvNet: number;
  orderCount: number;
  validCount: number;
  aov: number;
  refundRate: number;
  shipTimeoutRiskCount: number;
  burstIndex: number;
}

export interface HourlyPoint {
  hourLabel: string;
  hongguoOrders: number;
  baselineAvg7d: number;
  hongguoGmv: number;
}

export interface QianchuanCampaign {
  campaignId: string;
  shopId: string;
  campaignName: string;
  targetSkuId: string;
  cost: number;
  attributedGmv: number;
  attributionMode: 'exact_sku' | 'shop_window_estimate';
  statDate: string;
}

export interface QianchuanRoiResult {
  campaignId: string;
  campaignName: string;
  targetSkuId: string;
  cost: number;
  attributedGmv: number;
  refundAmount: number;
  estimatedCogs: number;
  nominalRoi: number;
  trueRoi: number;
  attributionMode: 'exact_sku' | 'shop_window_estimate';
  statDate: string;
}

export type AlertLevel = 'critical' | 'warning';

export interface AlertRule {
  id: string;
  name: string;
  type: 'ratio' | 'threshold' | 'delta';
  metric: 'order_count_1h' | 'sku_stock' | 'risk_order_count' | 'shop_score';
  op: '>=' | '<=';
  value: number;
  level: AlertLevel;
  cooldownMin: number;
  channels?: Channel[];
  enabled: boolean;
}

export interface AlertRecord {
  id: string;
  shopId: string;
  ruleId: string;
  ruleName: string;
  level: AlertLevel;
  subject: string;
  detail: string;
  createdAt: string;
  acked: boolean;
  suppressedByCooldown?: boolean;
  suppressedByQuietHours?: boolean;
}

export type BatchOpType = 'adjust_stock' | 'set_price' | 'off_shelf' | 'on_sale';

export interface BatchDiffItem {
  skuId: string;
  title: string;
  field: 'stock' | 'price' | 'status';
  oldValue: string | number;
  newValue: string | number;
  changed: boolean;
  riskFlag?: string;
}

export interface BatchPlan {
  planId: string;
  shopId: string;
  opType: BatchOpType;
  dryRun: boolean;
  batchSize: number;
  intervalMs: number;
  items: BatchDiffItem[];
  changedCount: number;
  skippedCount: number;
  estimatedQuotaCost: number;
  estimatedDurationSec: number;
  requiresConfirmationCode: boolean;
  warnings: string[];
}

export interface OpAuditLog {
  id: string;
  shopId: string;
  opType: BatchOpType;
  dryRun: boolean;
  targetCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  summary: string;
  createdAt: string;
  rollbackAvailable: boolean;
}

export type ImageKind = 'white_bg' | 'flat_lay' | 'lifestyle_scene';

export interface ImageAnalysisMetrics {
  borderWhitenessRatio: number; // 0..1
  edgeDensity: number; // 0..1
  colorEntropy: number; // 0..1 normalized
  foregroundCoverage: number; // 0..1
  kind: ImageKind;
  kindLabel: string;
  suggestions: string[];
}

export interface VisionIndexEntry {
  skuId: string;
  productTitle: string;
  category: string;
  imagePath: string;
  kind: ImageKind;
  embedding: number[]; // L2 normalized
}

export interface VisionMatchResult {
  skuId: string;
  productTitle: string;
  category: string;
  imagePath: string;
  kind: ImageKind;
  score: number;
}

export interface LicensePayload {
  machineHashes: [string, string, string]; // [board, disk, cpuid]
  expireDate: string; // YYYY-MM-DD
  plan: 'basic' | 'pro' | 'studio' | 'private';
  maxShops: number;
  features: string[];
}
