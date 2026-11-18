import type {
  AlertRecord,
  AlertRule,
  ChannelMetricSummary,
  Shop,
  SkuItem,
} from './types';

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'burst_order',
    name: '红果渠道爆单指数预警',
    type: 'ratio',
    metric: 'order_count_1h',
    op: '>=',
    value: 3.0,
    level: 'critical',
    cooldownMin: 30,
    channels: ['hongguo'],
    enabled: true,
  },
  {
    id: 'low_stock',
    name: 'SKU 安全库存阈值告警',
    type: 'threshold',
    metric: 'sku_stock',
    op: '<=',
    value: 20,
    level: 'warning',
    cooldownMin: 60,
    enabled: true,
  },
  {
    id: 'ship_timeout_risk',
    name: '超时发货风险单积压',
    type: 'threshold',
    metric: 'risk_order_count',
    op: '>=',
    value: 3,
    level: 'critical',
    cooldownMin: 15,
    enabled: true,
  },
  {
    id: 'score_drop',
    name: '店铺体验分单日下跌',
    type: 'delta',
    metric: 'shop_score',
    op: '<=',
    value: -0.15,
    level: 'warning',
    cooldownMin: 180,
    enabled: true,
  },
];

export interface AlertEvaluationInput {
  shop: Shop;
  channelMetrics: ChannelMetricSummary[];
  skus: SkuItem[];
  rules: AlertRule[];
  existingAlerts: AlertRecord[];
  nowIso: string;
  quietHoursEnabled: boolean;
}

export function isQuietHours(isoTimestamp: string): boolean {
  const hour = new Date(isoTimestamp).getHours();
  return hour >= 23 || hour < 8;
}

function isInCooldown(
  existingAlerts: AlertRecord[],
  ruleId: string,
  subject: string,
  cooldownMin: number,
  nowMs: number,
): boolean {
  const cooldownMs = cooldownMin * 60 * 1000;
  return existingAlerts.some(
    (a) =>
      a.ruleId === ruleId &&
      a.subject === subject &&
      !a.suppressedByCooldown &&
      nowMs - new Date(a.createdAt).getTime() < cooldownMs,
  );
}

function compareOp(actual: number, op: '>=' | '<=', target: number): boolean {
  return op === '>=' ? actual >= target : actual <= target;
}

export function evaluateAlertRules(input: AlertEvaluationInput): AlertRecord[] {
  const nowMs = new Date(input.nowIso).getTime();
  const quietNow = input.quietHoursEnabled && isQuietHours(input.nowIso);
  const newAlerts: AlertRecord[] = [];

  for (const rule of input.rules) {
    if (!rule.enabled) continue;

    if (rule.metric === 'order_count_1h') {
      const targetChannels = rule.channels ?? ['hongguo'];
      for (const m of input.channelMetrics) {
        if (!targetChannels.includes(m.channel)) continue;
        if (compareOp(m.burstIndex, rule.op, rule.value)) {
          const subject = `${input.shop.shopName} · ${m.label}`;
          const inCooldown = isInCooldown(input.existingAlerts, rule.id, subject, rule.cooldownMin, nowMs);
          if (inCooldown) continue;
          const suppressedByQuiet = quietNow && rule.level !== 'critical';
          if (suppressedByQuiet) continue;

          newAlerts.push({
            id: `al_${rule.id}_${m.channel}_${nowMs}`,
            shopId: input.shop.shopId,
            ruleId: rule.id,
            ruleName: rule.name,
            level: rule.level,
            subject,
            detail: `近1小时爆单指数达到 ${m.burstIndex.toFixed(2)}x（阈值 ${rule.value}x），建议立即核查库存与发货运力。`,
            createdAt: input.nowIso,
            acked: false,
          });
        }
      }
    }

    if (rule.metric === 'sku_stock') {
      const shopSkus = input.skus.filter((s) => s.shopId === input.shop.shopId && s.status === 'on_sale');
      for (const sku of shopSkus) {
        const threshold = Math.min(rule.value, sku.safetyThreshold);
        if (compareOp(sku.stock, rule.op, threshold)) {
          const subject = `${sku.skuId} · ${sku.title}`;
          if (isInCooldown(input.existingAlerts, rule.id, subject, rule.cooldownMin, nowMs)) continue;
          if (quietNow && rule.level !== 'critical') continue;

          newAlerts.push({
            id: `al_${rule.id}_${sku.skuId}_${nowMs}`,
            shopId: input.shop.shopId,
            ruleId: rule.id,
            ruleName: rule.name,
            level: sku.stock <= 5 ? 'critical' : rule.level,
            subject,
            detail: `当前可用库存 ${sku.stock} 件，已低于安全阈值 ${threshold} 件。`,
            createdAt: input.nowIso,
            acked: false,
          });
        }
      }
    }

    if (rule.metric === 'risk_order_count') {
      const totalRisk = input.channelMetrics.reduce((s, m) => s + m.shipTimeoutRiskCount, 0);
      if (compareOp(totalRisk, rule.op, rule.value)) {
        const subject = `${input.shop.shopName} · 履约时效`;
        if (isInCooldown(input.existingAlerts, rule.id, subject, rule.cooldownMin, nowMs)) continue;
        if (quietNow && rule.level !== 'critical') continue;

        newAlerts.push({
          id: `al_${rule.id}_${input.shop.shopId}_${nowMs}`,
          shopId: input.shop.shopId,
          ruleId: rule.id,
          ruleName: rule.name,
          level: rule.level,
          subject,
          detail: `存在 ${totalRisk} 笔已付款未发货订单距承诺截止时间不足 4 小时。`,
          createdAt: input.nowIso,
          acked: false,
        });
      }
    }

    if (rule.metric === 'shop_score') {
      const delta = Number((input.shop.experienceScore - input.shop.yesterdayScore).toFixed(2));
      if (compareOp(delta, rule.op, rule.value)) {
        const subject = `${input.shop.shopName} · 体验分`;
        if (isInCooldown(input.existingAlerts, rule.id, subject, rule.cooldownMin, nowMs)) continue;
        if (quietNow && rule.level !== 'critical') continue;

        newAlerts.push({
          id: `al_${rule.id}_${input.shop.shopId}_${nowMs}`,
          shopId: input.shop.shopId,
          ruleId: rule.id,
          ruleName: rule.name,
          level: rule.level,
          subject,
          detail: `体验分由 ${input.shop.yesterdayScore.toFixed(2)} 降至 ${input.shop.experienceScore.toFixed(2)}（日环比 ${delta}）。`,
          createdAt: input.nowIso,
          acked: false,
        });
      }
    }
  }

  return newAlerts;
}
