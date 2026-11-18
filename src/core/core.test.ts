import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeChannelDistribution,
  normalizeOrders,
  resolveOrderChannel,
} from './channelResolver';
import { calculateChannelMetrics, calculateQianchuanRoi } from './metricEngine';
import { DEFAULT_ALERT_RULES, evaluateAlertRules } from './alertEngine';
import { createBatchPlan, executeBatchPlan } from './batchPlanner';
import { analyzeImagePixels, l2Normalize, queryTopSimilar } from './visionMath';
import { signLicense, verifyLicense } from './licenseCrypto';
import type { QianchuanCampaign, RawDoudianOrder, Shop, SkuItem } from './types';

test('ChannelResolver prioritizes Hongguo sceneType and appSource over generic bType', () => {
  const order: RawDoudianOrder = {
    orderId: 'ORD-1',
    shopId: 'SHOP-A',
    bType: 'mall',
    sceneType: 'hongguo_search_same',
    payAmount: 199,
    refundAmount: 0,
    itemCount: 1,
    skuId: 'SKU-1',
    productTitle: '碎花连衣裙',
    orderStatus: 'paid_unshipped',
    payTime: '2026-11-17T10:30:00Z',
    shipDeadline: '2026-11-17T13:00:00Z',
    updateTime: '2026-11-17T10:30:00Z',
  };
  const res = resolveOrderChannel(order);
  assert.equal(res.channel, 'hongguo');
  assert.equal(res.matchedRuleId, 'rule_hg_scene');

  const dist = analyzeChannelDistribution([order]);
  assert.equal(dist[0].count, 1);
  assert.equal(dist[0].ratio, 1);
});

test('MetricCalculator computes dual-basis net GMV, ship risk (<4h), burst index, and Qianchuan true ROI', () => {
  const nowIso = '2026-11-17T11:00:00Z';
  const rawOrders: RawDoudianOrder[] = [
    {
      orderId: 'O1',
      shopId: 'S1',
      sceneType: 'hongguo_drama',
      payAmount: 200,
      refundAmount: 0,
      itemCount: 1,
      skuId: 'SKU-1',
      productTitle: 'Dress',
      orderStatus: 'paid_unshipped',
      payTime: '2026-11-17T10:20:00Z',
      shipDeadline: '2026-11-17T13:30:00Z', // 2.5h remaining -> risk
      updateTime: '2026-11-17T10:20:00Z',
    },
    {
      orderId: 'O2',
      shopId: 'S1',
      appSource: 'hongguo',
      payAmount: 100,
      refundAmount: 50,
      itemCount: 1,
      skuId: 'SKU-1',
      productTitle: 'Dress',
      orderStatus: 'completed',
      payTime: '2026-11-17T10:40:00Z',
      shipDeadline: '2026-11-18T10:40:00Z',
      updateTime: '2026-11-17T10:40:00Z',
    },
    {
      orderId: 'O3',
      shopId: 'S1',
      bType: 'mall',
      payAmount: 150,
      refundAmount: 0,
      itemCount: 1,
      skuId: 'SKU-2',
      productTitle: 'Kettle',
      orderStatus: 'shipped',
      payTime: '2026-11-17T08:00:00Z',
      shipDeadline: '2026-11-18T08:00:00Z',
      updateTime: '2026-11-17T08:00:00Z',
    },
  ];
  const normalized = normalizeOrders(rawOrders);
  const summaries = calculateChannelMetrics(normalized, {
    nowIso,
    baselineSameHour7dOrders: {
      hongguo: 1,
      mall: 2,
      live: 2,
      video: 2,
      search: 1,
      other: 1,
      unknown: 1,
    },
  });

  const hg = summaries.find((s) => s.channel === 'hongguo');
  assert.ok(hg);
  assert.equal(hg.gmvGross, 300);
  assert.equal(hg.gmvNet, 250);
  assert.equal(hg.shipTimeoutRiskCount, 1);
  assert.equal(hg.burstIndex, 2); // 2 orders in 1h / baseline 1

  const skus: SkuItem[] = [
    {
      skuId: 'SKU-1',
      shopId: 'S1',
      productId: 'P1',
      title: 'Dress',
      category: '女装',
      stock: 40,
      safetyThreshold: 20,
      price: 200,
      costEstimate: 50,
      status: 'on_sale',
      imgMain: '',
      updateTime: nowIso,
    },
  ];
  const campaigns: QianchuanCampaign[] = [
    {
      campaignId: 'C1',
      shopId: 'S1',
      campaignName: '红果同款放量',
      targetSkuId: 'SKU-1',
      cost: 100,
      attributedGmv: 300,
      attributionMode: 'exact_sku',
      statDate: '2026-11-17',
    },
  ];
  const roi = calculateQianchuanRoi(campaigns, normalized, skus);
  assert.equal(roi[0].nominalRoi, 3);
  // True ROI = (300 - 50 refund - 2*50 cogs) / 100 = 1.5
  assert.equal(roi[0].trueRoi, 1.5);
});

test('AlertEngine deduplicates within cooldown and enforces quiet hours for warnings', () => {
  const shop: Shop = {
    shopId: 'S1',
    shopName: '南风服饰旗舰店',
    authStatus: 'valid',
    tokenExpiresAt: '2026-11-20T00:00:00Z',
    experienceScore: 4.55,
    yesterdayScore: 4.78, // -0.23 drop -> warning
    lastSyncAt: '2026-11-17T02:00:00',
  };
  const skus: SkuItem[] = [
    {
      skuId: 'SKU-LOW',
      shopId: 'S1',
      productId: 'P1',
      title: '法式茶歇裙',
      category: '女装',
      stock: 12,
      safetyThreshold: 20,
      price: 189,
      costEstimate: 60,
      status: 'on_sale',
      imgMain: '',
      updateTime: '2026-11-17T02:00:00',
    },
  ];

  // During 02:00 local quiet hours, warning-level score_drop & low_stock (>5) are suppressed, critical burst fires
  const quietAlerts = evaluateAlertRules({
    shop,
    channelMetrics: [
      {
        channel: 'hongguo',
        label: '红果短剧',
        gmvGross: 5000,
        refundAmount: 0,
        gmvNet: 5000,
        orderCount: 25,
        validCount: 25,
        aov: 200,
        refundRate: 0,
        shipTimeoutRiskCount: 4,
        burstIndex: 3.5,
      },
    ],
    skus,
    rules: DEFAULT_ALERT_RULES,
    existingAlerts: [],
    nowIso: '2026-11-17T02:00:00',
    quietHoursEnabled: true,
  });

  assert.equal(quietAlerts.length, 2); // burst_order + ship_timeout_risk (both critical)

  // Re-evaluating 5 minutes later should suppress duplicates due to cooldown
  const cooldownAlerts = evaluateAlertRules({
    shop,
    channelMetrics: [
      {
        channel: 'hongguo',
        label: '红果短剧',
        gmvGross: 5000,
        refundAmount: 0,
        gmvNet: 5000,
        orderCount: 25,
        validCount: 25,
        aov: 200,
        refundRate: 0,
        shipTimeoutRiskCount: 4,
        burstIndex: 3.5,
      },
    ],
    skus,
    rules: DEFAULT_ALERT_RULES,
    existingAlerts: quietAlerts,
    nowIso: '2026-11-17T02:05:00',
    quietHoursEnabled: true,
  });
  assert.equal(cooldownAlerts.length, 0);
});

test('BatchPlanner generates diff preview, preserves state on dry-run, and updates on commit', () => {
  const skus: SkuItem[] = [
    {
      skuId: 'SKU-1',
      shopId: 'S1',
      productId: 'P1',
      title: 'A',
      category: '家居',
      stock: 10,
      safetyThreshold: 20,
      price: 100,
      costEstimate: 40,
      status: 'on_sale',
      imgMain: '',
      updateTime: '2026-11-17T10:00:00Z',
    },
  ];
  const dryPlan = createBatchPlan({
    shopId: 'S1',
    opType: 'adjust_stock',
    targetSkus: skus,
    deltaStock: 50,
    dryRun: true,
  });
  assert.equal(dryPlan.changedCount, 1);
  assert.equal(dryPlan.items[0].newValue, 60);

  const dryRes = executeBatchPlan(dryPlan, skus, '2026-11-17T10:05:00Z');
  assert.equal(dryRes.updatedSkus[0].stock, 10);
  assert.equal(dryRes.auditLog.dryRun, true);

  const livePlan = createBatchPlan({
    shopId: 'S1',
    opType: 'adjust_stock',
    targetSkus: skus,
    deltaStock: 50,
    dryRun: false,
  });
  const liveRes = executeBatchPlan(livePlan, skus, '2026-11-17T10:06:00Z');
  assert.equal(liveRes.updatedSkus[0].stock, 60);
  assert.equal(liveRes.auditLog.successCount, 1);
});

test('VisionMath detects white-background image vs colorful scene and retrieves top similar vectors', () => {
  // Synthetic 20x20 pure white border + small center square -> white_bg
  const width = 20;
  const height = 20;
  const whiteBgRgba = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 7; y < 13; y += 1) {
    for (let x = 7; x < 13; x += 1) {
      const i = (y * width + x) * 4;
      whiteBgRgba[i] = 90;
      whiteBgRgba[i + 1] = 140;
      whiteBgRgba[i + 2] = 100;
    }
  }
  const analyzedWhite = analyzeImagePixels({ width, height, rgba: whiteBgRgba });
  assert.equal(analyzedWhite.metrics.kind, 'white_bg');
  assert.ok(analyzedWhite.metrics.borderWhitenessRatio > 0.9);

  const v1 = l2Normalize([1, 0, 0, 0]);
  const v2 = l2Normalize([0.9, 0.2, 0, 0]);
  const v3 = l2Normalize([0, 0, 1, 0]);
  const results = queryTopSimilar(
    v1,
    [
      { skuId: 'A', productTitle: 'Item A', category: 'C', imagePath: '', kind: 'lifestyle_scene', embedding: v2 },
      { skuId: 'B', productTitle: 'Item B', category: 'C', imagePath: '', kind: 'white_bg', embedding: v3 },
    ],
    2,
    0.5,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].skuId, 'A');
  assert.ok(results[0].score > 0.95);
});

test('LicenseCrypto enforces 2-of-3 hardware match and 7-day grace window', () => {
  const secret = 'test-secret-key';
  const key = signLicense(
    {
      machineHashes: ['MB-111', 'DISK-222', 'CPU-333'],
      expireDate: '2026-11-20',
      plan: 'pro',
      maxShops: 5,
      features: ['dashboard', 'alerts', 'vision'],
    },
    secret,
  );

  // Single disk replaced -> 2 of 3 still match -> valid
  const active = verifyLicense(key, ['MB-111', 'DISK-NEW', 'CPU-333'], secret, '2026-11-17');
  assert.equal(active.valid, true);
  assert.equal(active.status, 'active');

  // 3 days after expiry -> grace_readonly
  const grace = verifyLicense(key, ['MB-111', 'DISK-222', 'CPU-333'], secret, '2026-11-24');
  assert.equal(grace.valid, true);
  assert.equal(grace.status, 'grace_readonly');

  // 10 days after expiry -> expired
  const expired = verifyLicense(key, ['MB-111', 'DISK-222', 'CPU-333'], secret, '2026-12-01');
  assert.equal(expired.valid, false);
  assert.equal(expired.status, 'expired');

  // Two hardware parts changed -> mismatch
  const mismatch = verifyLicense(key, ['MB-X', 'DISK-Y', 'CPU-333'], secret, '2026-11-17');
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.status, 'machine_mismatch');
});
