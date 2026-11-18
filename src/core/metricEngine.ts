import { CHANNEL_LABELS } from './channelResolver';
import type {
  Channel,
  ChannelMetricSummary,
  HourlyPoint,
  NormalizedOrder,
  QianchuanCampaign,
  QianchuanRoiResult,
  SkuItem,
} from './types';

export interface MetricCalculationOptions {
  nowIso: string;
  baselineSameHour7dOrders?: Record<Channel, number>;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export function calculateChannelMetrics(
  orders: NormalizedOrder[],
  options: MetricCalculationOptions,
): ChannelMetricSummary[] {
  const nowMs = new Date(options.nowIso).getTime();
  const channels: Channel[] = ['hongguo', 'mall', 'live', 'video', 'search', 'other'];

  return channels
    .map((channel) => {
      const subset = orders.filter((o) => o.channel === channel);
      const validOrders = subset.filter(
        (o) => o.orderStatus !== 'closed_unpaid' && o.orderStatus !== 'refunded',
      );

      const gmvGross = subset.reduce(
        (sum, o) => (o.orderStatus === 'closed_unpaid' ? sum : sum + o.payAmount),
        0,
      );
      const refundAmount = subset.reduce((sum, o) => sum + o.refundAmount, 0);
      const gmvNet = Math.max(0, gmvGross - refundAmount);
      const validCount = validOrders.length;
      const aov = validCount > 0 ? gmvNet / validCount : 0;
      const refundRate = gmvGross > 0 ? refundAmount / gmvGross : 0;

      const shipTimeoutRiskCount = subset.filter((o) => {
        if (o.orderStatus !== 'paid_unshipped') return false;
        const deadlineMs = new Date(o.shipDeadline).getTime();
        const remaining = deadlineMs - nowMs;
        return remaining <= FOUR_HOURS_MS;
      }).length;

      const recent1hCount = subset.filter((o) => {
        if (o.orderStatus === 'closed_unpaid') return false;
        const payMs = new Date(o.payTime).getTime();
        return payMs >= nowMs - ONE_HOUR_MS && payMs <= nowMs;
      }).length;

      const baseline = options.baselineSameHour7dOrders?.[channel] ?? 4;
      const burstIndex = baseline > 0 ? Number((recent1hCount / baseline).toFixed(2)) : 0;

      return {
        channel,
        label: CHANNEL_LABELS[channel],
        gmvGross: Number(gmvGross.toFixed(2)),
        refundAmount: Number(refundAmount.toFixed(2)),
        gmvNet: Number(gmvNet.toFixed(2)),
        orderCount: subset.length,
        validCount,
        aov: Number(aov.toFixed(2)),
        refundRate: Number(refundRate.toFixed(4)),
        shipTimeoutRiskCount,
        burstIndex,
      };
    })
    .filter((summary) => summary.orderCount > 0 || summary.channel === 'hongguo');
}

export function calculateHourlyBurstSeries(
  orders: NormalizedOrder[],
  nowIso: string,
  baselineByHour: number[],
): HourlyPoint[] {
  const now = new Date(nowIso);
  const points: HourlyPoint[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const slotEnd = new Date(now.getTime() - offset * ONE_HOUR_MS);
    const slotStart = new Date(slotEnd.getTime() - ONE_HOUR_MS);
    const hourNum = slotEnd.getHours();
    const hourLabel = `${String(hourNum).padStart(2, '0')}:00`;

    const slotOrders = orders.filter((o) => {
      if (o.channel !== 'hongguo' || o.orderStatus === 'closed_unpaid') return false;
      const payMs = new Date(o.payTime).getTime();
      return payMs > slotStart.getTime() && payMs <= slotEnd.getTime();
    });

    const gmv = slotOrders.reduce((s, o) => s + Math.max(0, o.payAmount - o.refundAmount), 0);
    const baseline = baselineByHour[hourNum % baselineByHour.length] ?? 5;

    points.push({
      hourLabel,
      hongguoOrders: slotOrders.length,
      baselineAvg7d: baseline,
      hongguoGmv: Number(gmv.toFixed(2)),
    });
  }

  return points;
}

export function calculateQianchuanRoi(
  campaigns: QianchuanCampaign[],
  orders: NormalizedOrder[],
  skus: SkuItem[],
): QianchuanRoiResult[] {
  const skuMap = new Map(skus.map((s) => [s.skuId, s]));

  return campaigns.map((campaign) => {
    const relatedOrders = orders.filter(
      (o) =>
        o.shopId === campaign.shopId &&
        o.skuId === campaign.targetSkuId &&
        o.orderStatus !== 'closed_unpaid',
    );
    const refundAmount = relatedOrders.reduce((s, o) => s + o.refundAmount, 0);
    const unitCost = skuMap.get(campaign.targetSkuId)?.costEstimate ?? 0;
    const validUnits = relatedOrders
      .filter((o) => o.orderStatus !== 'refunded')
      .reduce((s, o) => s + o.itemCount, 0);
    const estimatedCogs = validUnits * unitCost;

    const nominalRoi = campaign.cost > 0 ? campaign.attributedGmv / campaign.cost : 0;
    const trueRoi =
      campaign.cost > 0
        ? (campaign.attributedGmv - refundAmount - estimatedCogs) / campaign.cost
        : 0;

    return {
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      targetSkuId: campaign.targetSkuId,
      cost: Number(campaign.cost.toFixed(2)),
      attributedGmv: Number(campaign.attributedGmv.toFixed(2)),
      refundAmount: Number(refundAmount.toFixed(2)),
      estimatedCogs: Number(estimatedCogs.toFixed(2)),
      nominalRoi: Number(nominalRoi.toFixed(2)),
      trueRoi: Number(trueRoi.toFixed(2)),
      attributionMode: campaign.attributionMode,
      statDate: campaign.statDate,
    };
  });
}
