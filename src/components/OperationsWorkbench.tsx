import React, { useMemo, useState } from 'react';
import { BellOff, Check, Play, ShieldAlert } from 'lucide-react';
import { createBatchPlan } from '../core/batchPlanner';
import type {
  AlertRecord,
  AlertRule,
  BatchOpType,
  BatchPlan,
  OpAuditLog,
  SkuItem,
} from '../core/types';

interface OperationsWorkbenchProps {
  selectedShopId: string;
  skus: SkuItem[];
  alerts: AlertRecord[];
  rules: AlertRule[];
  quietHoursEnabled: boolean;
  auditLogs: OpAuditLog[];
  onToggleQuietHours: () => void;
  onToggleRule: (ruleId: string) => void;
  onAckAlert: (alertId: string) => void;
  onCommitBatchPlan: (plan: BatchPlan) => void;
}

export const OperationsWorkbench: React.FC<OperationsWorkbenchProps> = ({
  selectedShopId,
  skus,
  alerts,
  rules,
  quietHoursEnabled,
  auditLogs,
  onToggleQuietHours,
  onToggleRule,
  onAckAlert,
  onCommitBatchPlan,
}) => {
  const shopSkus = useMemo(
    () => skus.filter((s) => s.shopId === selectedShopId),
    [skus, selectedShopId],
  );

  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>(() =>
    shopSkus.slice(0, 2).map((s) => s.skuId),
  );
  const [opType, setOpType] = useState<BatchOpType>('adjust_stock');
  const [deltaStock, setDeltaStock] = useState<number>(50);
  const [newPrice, setNewPrice] = useState<number>(178);
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [confirmCode, setConfirmCode] = useState<string>('');
  const [activePlan, setActivePlan] = useState<BatchPlan | null>(null);
  const [planError, setPlanError] = useState<string>('');

  const effectiveSelectedIds = useMemo(() => {
    const validSet = new Set(shopSkus.map((s) => s.skuId));
    const filtered = selectedSkuIds.filter((id) => validSet.has(id));
    return filtered.length > 0 ? filtered : shopSkus.slice(0, 1).map((s) => s.skuId);
  }, [shopSkus, selectedSkuIds]);

  const toggleSku = (skuId: string) => {
    setSelectedSkuIds((prev) =>
      prev.includes(skuId) ? prev.filter((id) => id !== skuId) : [...prev, skuId],
    );
    setActivePlan(null);
  };

  const handleGeneratePlan = () => {
    const targets = shopSkus.filter((s) => effectiveSelectedIds.includes(s.skuId));
    if (targets.length === 0) {
      setPlanError('请至少选择一个目标 SKU。');
      return;
    }
    setPlanError('');
    const plan = createBatchPlan({
      shopId: selectedShopId,
      opType,
      targetSkus: targets,
      deltaStock,
      newPrice,
      dryRun,
      batchSize: 20,
      intervalMs: 2000,
    });
    setActivePlan(plan);
  };

  const handleExecutePlan = () => {
    if (!activePlan) return;
    if (!activePlan.dryRun && activePlan.requiresConfirmationCode) {
      if (confirmCode.trim() !== String(activePlan.changedCount)) {
        setPlanError(
          `高风险操作需输入变更数量确认码「${activePlan.changedCount}」后方可执行。`,
        );
        return;
      }
    }
    setPlanError('');
    onCommitBatchPlan(activePlan);
    setConfirmCode('');
    setActivePlan(null);
  };

  const shopAlerts = alerts.filter((a) => a.shopId === selectedShopId);

  return (
    <div className="space-y-8">
      {/* Section 1: Alert Rules & Live Queue */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              告警规则引擎（冷却去重 + 静默时段）
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              同一规则与对象在冷却期内自动合并去重；23:00–08:00 仅放行严重级别告警
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleQuietHours}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              quietHoursEnabled
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <BellOff className="h-3.5 w-3.5" />
            夜间静默保护：{quietHoursEnabled ? '已开启' : '已关闭'}
          </button>
        </div>

        {/* Rule switches */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {rules.map((rule) => (
            <button
              key={rule.id}
              type="button"
              onClick={() => onToggleRule(rule.id)}
              className={`flex flex-col justify-between rounded-lg border p-3.5 text-left transition-colors cursor-pointer ${
                rule.enabled
                  ? 'border-slate-300 bg-slate-50/70'
                  : 'border-slate-200 bg-white opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">{rule.name}</span>
                <span
                  className={`text-[11px] font-medium ${
                    rule.enabled ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {rule.enabled ? '启用中' : '已停用'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                阈值 {rule.op} {rule.value} · 冷却 {rule.cooldownMin}m ·{' '}
                {rule.level === 'critical' ? '严重' : '提醒'}
              </p>
            </button>
          ))}
        </div>

        {/* Triggered Alert List */}
        <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
          {shopAlerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              当前店铺暂无活跃告警，所有指标处于基线安全范围。
            </p>
          ) : (
            shopAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        alert.level === 'critical' ? 'text-rose-600' : 'text-amber-700'
                      }`}
                    >
                      {alert.level === 'critical' ? '[严重]' : '[提醒]'}
                    </span>
                    <span className="font-medium text-slate-900">{alert.subject}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {alert.createdAt.replace('T', ' ').slice(0, 19)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{alert.detail}</p>
                </div>

                <div className="shrink-0">
                  {alert.acked ? (
                    <span className="text-xs text-slate-400">已确认处理</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAckAlert(alert.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" />
                      确认告警
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Section 2: 4-Stage Batch Operation Planner */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            四阶段安全批量操作台（计划 → 预检 → 分批 → 回读校验）
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            先选中商品生成差异计划（支持 Dry-Run 干跑模式），仅提交变更字段并记录完整审计日志
          </p>
        </div>

        {/* SKU Table Selection */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4 w-10">选择</th>
                <th className="py-2.5 px-4">SKU 与商品名称</th>
                <th className="py-2.5 px-4">类目</th>
                <th className="py-2.5 px-4 text-right">当前库存</th>
                <th className="py-2.5 px-4 text-right">安全阈值</th>
                <th className="py-2.5 px-4 text-right">当前售价</th>
                <th className="py-2.5 px-4 text-right">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {shopSkus.map((sku) => {
                const checked = effectiveSelectedIds.includes(sku.skuId);
                return (
                  <tr key={sku.skuId} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
                      <input
                        type="checkbox"
                        aria-label={`选择 ${sku.title}`}
                        checked={checked}
                        onChange={() => toggleSku(sku.skuId)}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{sku.title}</div>
                      <div className="font-mono text-xs text-slate-500">{sku.skuId}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">{sku.category}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-medium ${
                        sku.stock <= sku.safetyThreshold ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {sku.stock}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                      {sku.safetyThreshold}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                      ¥{sku.price.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-xs text-slate-600">
                      {sku.status === 'on_sale' ? '在售中' : '已下架'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Batch Controls */}
        <div className="flex flex-wrap items-end gap-4 rounded-lg bg-slate-50 p-4 border border-slate-200">
          <div>
            <label htmlFor="batch-op-type" className="block text-xs font-medium text-slate-700">
              操作类型
            </label>
            <select
              id="batch-op-type"
              value={opType}
              onChange={(e) => {
                setOpType(e.target.value as BatchOpType);
                setActivePlan(null);
              }}
              className="mt-1.5 h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              <option value="adjust_stock">批量补货 / 改库存</option>
              <option value="set_price">批量统一改价</option>
              <option value="off_shelf">批量下架</option>
              <option value="on_sale">批量上架</option>
            </select>
          </div>

          {opType === 'adjust_stock' && (
            <div>
              <label htmlFor="delta-stock" className="block text-xs font-medium text-slate-700">
                库存增减量（件）
              </label>
              <input
                id="delta-stock"
                type="number"
                value={deltaStock}
                onChange={(e) => {
                  setDeltaStock(Number(e.target.value));
                  setActivePlan(null);
                }}
                className="mt-1.5 h-9 w-32 rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900"
              />
            </div>
          )}

          {opType === 'set_price' && (
            <div>
              <label htmlFor="new-price" className="block text-xs font-medium text-slate-700">
                目标售价（元）
              </label>
              <input
                id="new-price"
                type="number"
                min="1"
                value={newPrice}
                onChange={(e) => {
                  setNewPrice(Number(e.target.value));
                  setActivePlan(null);
                }}
                className="mt-1.5 h-9 w-32 rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900"
              />
            </div>
          )}

          <label className="inline-flex h-9 items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => {
                setDryRun(e.target.checked);
                setActivePlan(null);
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            Dry-Run 干跑模式（只预览不写入）
          </label>

          <button
            type="button"
            onClick={handleGeneratePlan}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            生成差异计划与预检
          </button>
        </div>

        {planError && <p className="text-xs font-medium text-rose-600">{planError}</p>}

        {/* Diff Plan Preview */}
        {activePlan && (
          <div className="rounded-lg border border-slate-300 bg-slate-50/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-700 tabular-nums">
                <span className="font-semibold text-slate-900">差异预检报告</span> · 变更{' '}
                {activePlan.changedCount} 项 · 跳过 {activePlan.skippedCount} 项 · 预计消耗配额{' '}
                {activePlan.estimatedQuotaCost} 次 · 预计耗时 {activePlan.estimatedDurationSec}s
              </div>
              <span className="text-xs font-medium text-slate-600">
                模式：{activePlan.dryRun ? 'Dry-Run 干跑' : '实盘分批写入'}
              </span>
            </div>

            {activePlan.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1">
                {activePlan.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {activePlan.items.map((item) => (
                <div
                  key={item.skuId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-medium text-slate-900">{item.title}</span>
                    <span className="ml-2 font-mono text-slate-400">{item.skuId}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-slate-500">{String(item.oldValue)}</span>
                    <span className="text-slate-400">→</span>
                    <span className={item.changed ? 'font-semibold text-slate-900' : 'text-slate-400'}>
                      {String(item.newValue)}
                    </span>
                    {item.riskFlag && <span className="text-amber-700">({item.riskFlag})</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {!activePlan.dryRun && activePlan.requiresConfirmationCode && (
                <div className="flex items-center gap-2">
                  <label htmlFor="confirm-code" className="text-xs text-slate-600">
                    输入变更数「{activePlan.changedCount}」确认：
                  </label>
                  <input
                    id="confirm-code"
                    type="text"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    className="h-8 w-20 rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleExecutePlan}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white hover:bg-rose-700 whitespace-nowrap cursor-pointer"
              >
                {activePlan.dryRun ? '记录干跑测试日志' : '确认执行分批任务'}
              </button>
            </div>
          </div>
        )}

        {/* Audit Logs */}
        <div className="pt-2">
          <h3 className="text-xs font-semibold text-slate-700">操作审计日志（op_log）</h3>
          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between text-xs"
              >
                <span className="text-slate-800">{log.summary}</span>
                <span className="font-mono text-slate-400 tabular-nums shrink-0">
                  {log.createdAt.replace('T', ' ').slice(0, 19)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
