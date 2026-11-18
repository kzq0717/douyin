import { normalizeOrders } from '../core/channelResolver';
import type {
  OpAuditLog,
  QianchuanCampaign,
  RawDoudianOrder,
  Shop,
  SkuItem,
} from '../core/types';

export const SEED_NOW_ISO = '2026-11-17T17:30:00';

export const SEED_SHOPS: Shop[] = [
  {
    shopId: 'SHOP-HG-01',
    shopName: '素白物语 · 轻复古女装店',
    authStatus: 'valid',
    tokenExpiresAt: '2026-11-24T17:30:00',
    experienceScore: 4.82,
    yesterdayScore: 4.85,
    lastSyncAt: '2026-11-17T17:28:00',
  },
  {
    shopId: 'SHOP-HG-02',
    shopName: '器物集 · 原创家居生活馆',
    authStatus: 'expiring',
    tokenExpiresAt: '2026-11-17T19:10:00',
    experienceScore: 4.61,
    yesterdayScore: 4.80,
    lastSyncAt: '2026-11-17T17:25:00',
  },
];

export const SEED_SKUS: SkuItem[] = [
  {
    skuId: 'SKU-DRESS-101',
    shopId: 'SHOP-HG-01',
    productId: 'PROD-8801',
    title: '法式鼠尾草绿碎花收腰茶歇连衣裙（白底主图版）',
    category: '女装 · 连衣裙',
    stock: 16,
    safetyThreshold: 25,
    price: 198,
    costEstimate: 64,
    status: 'on_sale',
    imgMain: '/src/assets/images/product_white_bg_dress_1794967103486.jpg',
    updateTime: '2026-11-17T17:00:00',
  },
  {
    skuId: 'SKU-DRESS-102',
    shopId: 'SHOP-HG-01',
    productId: 'PROD-8802',
    title: '法式鼠尾草绿碎花茶歇连衣裙（庭院穿搭场景图）',
    category: '女装 · 连衣裙',
    stock: 84,
    safetyThreshold: 25,
    price: 208,
    costEstimate: 66,
    status: 'on_sale',
    imgMain: '/src/assets/images/product_scene_dress_1794967103900.jpg',
    updateTime: '2026-11-17T17:05:00',
  },
  {
    skuId: 'SKU-BAG-204',
    shopId: 'SHOP-HG-01',
    productId: 'PROD-8809',
    title: '手工编织草编托特包 · 度假风配饰',
    category: '箱包 · 配饰',
    stock: 42,
    safetyThreshold: 20,
    price: 129,
    costEstimate: 38,
    status: 'on_sale',
    imgMain: '/src/assets/images/product_scene_dress_1794967103900.jpg',
    updateTime: '2026-11-17T16:40:00',
  },
  {
    skuId: 'SKU-KETTLE-301',
    shopId: 'SHOP-HG-02',
    productId: 'PROD-9101',
    title: '哑光奶白陶瓷鹅颈手冲壶套装（平铺俯拍图）',
    category: '家居 · 咖啡器具',
    stock: 14,
    safetyThreshold: 30,
    price: 249,
    costEstimate: 82,
    status: 'on_sale',
    imgMain: '/src/assets/images/product_flatlay_kettle_1794967103570.jpg',
    updateTime: '2026-11-17T17:10:00',
  },
  {
    skuId: 'SKU-LAMP-305',
    shopId: 'SHOP-HG-02',
    productId: 'PROD-9108',
    title: '剧集同款客厅暖琥珀玻璃氛围台灯',
    category: '家居 · 灯饰',
    stock: 58,
    safetyThreshold: 20,
    price: 189,
    costEstimate: 55,
    status: 'on_sale',
    imgMain: '/src/assets/images/drama_frame_livingroom_1794967104697.jpg',
    updateTime: '2026-11-17T16:50:00',
  },
];

function buildSeedOrders(): RawDoudianOrder[] {
  const baseOrders: RawDoudianOrder[] = [];
  const baseMs = new Date(SEED_NOW_ISO).getTime();

  // Hongguo orders over past 12 hours (Shop 1 & Shop 2)
  const hgHoursOffset = [0.2, 0.35, 0.5, 0.7, 0.85, 1.4, 2.2, 3.1, 4.0, 5.2, 6.4, 7.8, 9.1, 10.5];
  hgHoursOffset.forEach((h, idx) => {
    const payTime = new Date(baseMs - h * 3600 * 1000).toISOString();
    const isRisk = idx < 4;
    const shipDeadline = new Date(baseMs + (isRisk ? 2.1 : 18) * 3600 * 1000).toISOString();
    const shopId = idx % 3 === 0 ? 'SHOP-HG-02' : 'SHOP-HG-01';
    const skuId = shopId === 'SHOP-HG-02' ? 'SKU-KETTLE-301' : idx % 2 === 0 ? 'SKU-DRESS-102' : 'SKU-DRESS-101';
    const price = shopId === 'SHOP-HG-02' ? 249 : 208;
    const isRefund = idx === 11;
    baseOrders.push({
      orderId: `HG-20261117-${1000 + idx}`,
      shopId,
      bType: 'mall',
      sceneType: idx % 2 === 0 ? 'hongguo_search_same' : 'hongguo_drama',
      appSource: 'hongguo',
      payAmount: price,
      refundAmount: isRefund ? price : 0,
      itemCount: 1,
      skuId,
      productTitle: skuId === 'SKU-KETTLE-301' ? '哑光奶白陶瓷鹅颈手冲壶套装' : '法式鼠尾草绿碎花茶歇连衣裙',
      orderStatus: isRefund ? 'refunded' : isRisk ? 'paid_unshipped' : 'shipped',
      payTime,
      shipDeadline,
      updateTime: payTime,
    });
  });

  // Mall, Live, Video, Search orders for comparison
  const otherConfigs: Array<{
    channelTag: Partial<RawDoudianOrder>;
    count: number;
    price: number;
    shopId: string;
    skuId: string;
    title: string;
  }> = [
    {
      channelTag: { bType: 'mall', sceneType: 'mall_tab' },
      count: 9,
      price: 198,
      shopId: 'SHOP-HG-01',
      skuId: 'SKU-DRESS-101',
      title: '法式鼠尾草绿碎花收腰茶歇连衣裙',
    },
    {
      channelTag: { bType: 'live', sceneType: 'live_room' },
      count: 6,
      price: 129,
      shopId: 'SHOP-HG-01',
      skuId: 'SKU-BAG-204',
      title: '手工编织草编托特包',
    },
    {
      channelTag: { bType: 'video', sceneType: 'feed_video' },
      count: 4,
      price: 189,
      shopId: 'SHOP-HG-02',
      skuId: 'SKU-LAMP-305',
      title: '剧集同款客厅暖琥珀玻璃氛围台灯',
    },
    {
      channelTag: { bType: 'mall', sceneType: 'search_tab' },
      count: 3,
      price: 249,
      shopId: 'SHOP-HG-02',
      skuId: 'SKU-KETTLE-301',
      title: '哑光奶白陶瓷鹅颈手冲壶套装',
    },
  ];

  let seq = 2000;
  for (const cfg of otherConfigs) {
    for (let i = 0; i < cfg.count; i += 1) {
      const payTime = new Date(baseMs - (i * 1.1 + 0.5) * 3600 * 1000).toISOString();
      baseOrders.push({
        orderId: `DY-20261117-${seq++}`,
        shopId: cfg.shopId,
        ...cfg.channelTag,
        payAmount: cfg.price,
        refundAmount: i === 0 ? Number((cfg.price * 0.5).toFixed(2)) : 0,
        itemCount: 1,
        skuId: cfg.skuId,
        productTitle: cfg.title,
        orderStatus: i === 1 ? 'paid_unshipped' : 'completed',
        payTime,
        shipDeadline: new Date(baseMs + (i === 1 ? 3.2 : 24) * 3600 * 1000).toISOString(),
        updateTime: payTime,
      });
    }
  }

  return baseOrders;
}

export const SEED_ORDERS = normalizeOrders(buildSeedOrders());

export const BASELINE_7D_BY_HOUR = [2, 1, 1, 1, 1, 1, 2, 3, 4, 4, 5, 5, 6, 5, 4, 4, 5, 3, 6, 8, 9, 8, 5, 3];

export const SEED_CAMPAIGNS: QianchuanCampaign[] = [
  {
    campaignId: 'QC-7701',
    shopId: 'SHOP-HG-01',
    campaignName: '红果短剧同款 · 茶歇裙场景图放量计划',
    targetSkuId: 'SKU-DRESS-102',
    cost: 480,
    attributedGmv: 1872,
    attributionMode: 'exact_sku',
    statDate: '2026-11-17',
  },
  {
    campaignId: 'QC-7702',
    shopId: 'SHOP-HG-01',
    campaignName: '全店泛商城通投 · 草编配饰拉新',
    targetSkuId: 'SKU-BAG-204',
    cost: 320,
    attributedGmv: 774,
    attributionMode: 'shop_window_estimate',
    statDate: '2026-11-17',
  },
  {
    campaignId: 'QC-8801',
    shopId: 'SHOP-HG-02',
    campaignName: '都市剧家居场景 · 手冲壶人群包',
    targetSkuId: 'SKU-KETTLE-301',
    cost: 410,
    attributedGmv: 1494,
    attributionMode: 'exact_sku',
    statDate: '2026-11-17',
  },
];

export const SEED_AUDIT_LOGS: OpAuditLog[] = [
  {
    id: 'op_seed_1',
    shopId: 'SHOP-HG-01',
    opType: 'adjust_stock',
    dryRun: false,
    targetCount: 2,
    successCount: 2,
    failedCount: 0,
    skippedCount: 0,
    summary: '[已提交并回读校验] 批量库存调整：成功 2 项，跳过 0 项（分 1 批执行）。',
    createdAt: '2026-11-17T14:20:00',
    rollbackAvailable: true,
  },
];

export const VISION_SAMPLE_LIBRARY = [
  {
    id: 'sample-drama-frame',
    label: '剧集参考截图（自持剧集帧）',
    subtitle: '模拟商家自持短剧画面中的客厅桌面手冲壶场景',
    imagePath: '/src/assets/images/drama_frame_livingroom_1794967104697.jpg',
    role: 'query' as const,
  },
  {
    id: 'sample-white-dress',
    label: '白底商品图（待优化对比）',
    subtitle: '纯白底平拍主图 · 缺少人物与光影使用场景',
    imagePath: '/src/assets/images/product_white_bg_dress_1794967103486.jpg',
    role: 'query' as const,
  },
  {
    id: 'sample-scene-dress',
    label: '生活场景穿搭图',
    subtitle: '自然光庭院穿着场景 · 构图层次完整',
    imagePath: '/src/assets/images/product_scene_dress_1794967103900.jpg',
    role: 'query' as const,
  },
  {
    id: 'sample-flatlay-kettle',
    label: '桌面平铺俯拍图',
    subtitle: '木质桌面俯拍平铺 · 背景纹理较浅',
    imagePath: '/src/assets/images/product_flatlay_kettle_1794967103570.jpg',
    role: 'query' as const,
  },
];
