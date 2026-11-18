import type { Channel, ChannelRule, NormalizedOrder, RawDoudianOrder } from './types';

export const DEFAULT_CHANNEL_RULES: ChannelRule[] = [
  {
    id: 'rule_hg_scene',
    channel: 'hongguo',
    priority: 1,
    field: 'sceneType',
    matchValues: ['hongguo_drama', 'hongguo_search_same', 'hg_short_drama', 'redfruit_mall'],
  },
  {
    id: 'rule_hg_app',
    channel: 'hongguo',
    priority: 2,
    field: 'appSource',
    matchValues: ['hongguo', 'com.phoenix.read', 'redfruit'],
  },
  {
    id: 'rule_hg_theme',
    channel: 'hongguo',
    priority: 3,
    field: 'themeType',
    matchValues: ['short_drama_same_style', '9001'],
  },
  {
    id: 'rule_live_btype',
    channel: 'live',
    priority: 4,
    field: 'bType',
    matchValues: ['live', '1', 'douyin_live'],
  },
  {
    id: 'rule_video_btype',
    channel: 'video',
    priority: 5,
    field: 'bType',
    matchValues: ['video', '2', 'short_video'],
  },
  {
    id: 'rule_search_scene',
    channel: 'search',
    priority: 6,
    field: 'sceneType',
    matchValues: ['search_tab', 'mall_search'],
  },
  {
    id: 'rule_mall_btype',
    channel: 'mall',
    priority: 7,
    field: 'bType',
    matchValues: ['mall', '0', 'douyin_mall'],
  },
];

export const CHANNEL_LABELS: Record<Channel, string> = {
  hongguo: '红果短剧',
  mall: '抖店商城',
  live: '直播间',
  video: '短视频',
  search: '泛搜索',
  other: '其他渠道',
  unknown: '未识别',
};

export function resolveOrderChannel(
  order: RawDoudianOrder,
  rules: ChannelRule[] = DEFAULT_CHANNEL_RULES,
): { channel: Channel; channelRaw: string; matchedRuleId: string } {
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const rawSnapshot = [
    order.sceneType ? `scene=${order.sceneType}` : '',
    order.appSource ? `app=${order.appSource}` : '',
    order.themeType ? `theme=${order.themeType}` : '',
    order.bType !== undefined ? `b=${String(order.bType)}` : '',
    order.subBType !== undefined ? `subB=${String(order.subBType)}` : '',
  ]
    .filter(Boolean)
    .join(';');

  for (const rule of sortedRules) {
    const rawVal = order[rule.field];
    if (rawVal === undefined || rawVal === null) continue;
    const normalized = String(rawVal).trim().toLowerCase();
    const matched = rule.matchValues.some((candidate) => candidate.toLowerCase() === normalized);
    if (matched) {
      return {
        channel: rule.channel,
        channelRaw: rawSnapshot || 'empty',
        matchedRuleId: rule.id,
      };
    }
  }

  return {
    channel: rawSnapshot ? 'other' : 'unknown',
    channelRaw: rawSnapshot || 'empty',
    matchedRuleId: 'fallback_default',
  };
}

export function normalizeOrders(
  orders: RawDoudianOrder[],
  rules: ChannelRule[] = DEFAULT_CHANNEL_RULES,
): NormalizedOrder[] {
  return orders.map((order) => {
    const resolved = resolveOrderChannel(order, rules);
    return {
      ...order,
      ...resolved,
    };
  });
}

export interface ChannelDistributionItem {
  key: string;
  count: number;
  ratio: number;
}

export function analyzeChannelDistribution(orders: RawDoudianOrder[]): ChannelDistributionItem[] {
  if (orders.length === 0) return [];
  const counts = new Map<string, number>();
  for (const order of orders) {
    const key = `scene:${order.sceneType ?? '-'} | app:${order.appSource ?? '-'} | bType:${String(order.bType ?? '-')}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      count,
      ratio: Number((count / orders.length).toFixed(4)),
    }))
    .sort((a, b) => b.count - a.count);
}
