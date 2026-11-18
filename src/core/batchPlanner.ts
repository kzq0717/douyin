import type {
  BatchDiffItem,
  BatchOpType,
  BatchPlan,
  OpAuditLog,
  SkuItem,
} from './types';

export interface BatchPlanRequest {
  shopId: string;
  opType: BatchOpType;
  targetSkus: SkuItem[];
  deltaStock?: number;
  newPrice?: number;
  dryRun: boolean;
  batchSize?: number;
  intervalMs?: number;
}

export function createBatchPlan(req: BatchPlanRequest): BatchPlan {
  const batchSize = Math.max(1, Math.min(req.batchSize ?? 20, 50));
  const intervalMs = req.intervalMs ?? 2000;
  const warnings: string[] = [];

  const items: BatchDiffItem[] = req.targetSkus.map((sku) => {
    if (req.opType === 'adjust_stock') {
      const delta = req.deltaStock ?? 0;
      const nextStock = Math.max(0, sku.stock + delta);
      const changed = nextStock !== sku.stock;
      return {
        skuId: sku.skuId,
        title: sku.title,
        field: 'stock',
        oldValue: sku.stock,
        newValue: nextStock,
        changed,
        riskFlag: nextStock === 0 ? '库存归零将触发自动停售' : undefined,
      };
    }

    if (req.opType === 'set_price') {
      const targetPrice = Math.max(0.01, Number((req.newPrice ?? sku.price).toFixed(2)));
      const changed = targetPrice !== sku.price;
      const discountRatio = sku.price > 0 ? targetPrice / sku.price : 1;
      const riskFlag =
        discountRatio < 0.7
          ? '降幅超过 30%，可能触发平台低价风控拦截'
          : targetPrice < sku.costEstimate
            ? '低于预估成本价，存在亏损风险'
            : undefined;
      if (riskFlag && changed) {
        warnings.push(`${sku.skuId}: ${riskFlag}`);
      }
      return {
        skuId: sku.skuId,
        title: sku.title,
        field: 'price',
        oldValue: sku.price,
        newValue: targetPrice,
        changed,
        riskFlag,
      };
    }

    const nextStatus = req.opType === 'off_shelf' ? 'off_shelf' : 'on_sale';
    return {
      skuId: sku.skuId,
      title: sku.title,
      field: 'status',
      oldValue: sku.status,
      newValue: nextStatus,
      changed: sku.status !== nextStatus,
      riskFlag: nextStatus === 'off_shelf' ? '下架将中断正在推广的短剧同款入口' : undefined,
    };
  });

  const changedCount = items.filter((i) => i.changed).length;
  const skippedCount = items.length - changedCount;
  const chunkCount = Math.ceil(changedCount / batchSize);
  const estimatedDurationSec =
    changedCount === 0 ? 0 : Number(((chunkCount * intervalMs) / 1000 + changedCount * 0.15).toFixed(1));

  if (changedCount === 0) {
    warnings.push('所有选中商品目标字段无实质变更，执行阶段将自动跳过。');
  }

  return {
    planId: `plan_${Date.now()}`,
    shopId: req.shopId,
    opType: req.opType,
    dryRun: req.dryRun,
    batchSize,
    intervalMs,
    items,
    changedCount,
    skippedCount,
    estimatedQuotaCost: changedCount * 2, // 1 write + 1 read-back verify
    estimatedDurationSec,
    requiresConfirmationCode: req.opType === 'off_shelf' || req.opType === 'set_price',
    warnings,
  };
}

export interface BatchExecutionResult {
  updatedSkus: SkuItem[];
  auditLog: OpAuditLog;
}

export function executeBatchPlan(
  plan: BatchPlan,
  allSkus: SkuItem[],
  nowIso: string,
): BatchExecutionResult {
  const diffMap = new Map(
    plan.items.filter((i) => i.changed).map((i) => [i.skuId, i]),
  );

  let successCount = 0;
  const updatedSkus = allSkus.map((sku) => {
    const diff = diffMap.get(sku.skuId);
    if (!diff || plan.dryRun) return sku;

    successCount += 1;
    if (diff.field === 'stock') {
      return { ...sku, stock: Number(diff.newValue), updateTime: nowIso };
    }
    if (diff.field === 'price') {
      return { ...sku, price: Number(diff.newValue), updateTime: nowIso };
    }
    return {
      ...sku,
      status: diff.newValue as 'on_sale' | 'off_shelf',
      updateTime: nowIso,
    };
  });

  const opLabelMap: Record<BatchOpType, string> = {
    adjust_stock: '批量库存调整',
    set_price: '批量改价',
    off_shelf: '批量下架',
    on_sale: '批量上架',
  };

  const auditLog: OpAuditLog = {
    id: `op_${Date.now()}`,
    shopId: plan.shopId,
    opType: plan.opType,
    dryRun: plan.dryRun,
    targetCount: plan.items.length,
    successCount: plan.dryRun ? 0 : successCount,
    failedCount: 0,
    skippedCount: plan.skippedCount,
    summary: plan.dryRun
      ? `[Dry-Run 干跑] ${opLabelMap[plan.opType]}：预计变更 ${plan.changedCount} 项，跳过 ${plan.skippedCount} 项，未向官方 API 提交写请求。`
      : `[已提交并回读校验] ${opLabelMap[plan.opType]}：成功 ${successCount} 项，跳过 ${plan.skippedCount} 项（分 ${Math.max(1, Math.ceil(successCount / plan.batchSize))} 批执行）。`,
    createdAt: nowIso,
    rollbackAvailable: !plan.dryRun && successCount > 0,
  };

  return { updatedSkus, auditLog };
}
