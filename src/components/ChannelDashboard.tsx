import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  KeyRound,
  Plus,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { CHANNEL_LABELS } from '../core/channelResolver';
import type {
  Channel,
  ChannelMetricSummary,
  HourlyPoint,
  QianchuanRoiResult,
  Shop,
} from '../core/types';

interface ChannelDashboardProps {
  shops: Shop[];
  selectedShopId: string;
  onSelectShop: (shopId: string) => void;
  channelMetrics: ChannelMetricSummary[];
  hourlySeries: HourlyPoint[];
  qianchuanRoi: QianchuanRoiResult[];
  activeAlertCount: number;
  onSimulateBurst: () => void;
  onAuthorizeShop: (shopName: string, code: string) => Promise<void>;
  onJumpToAlerts: () => void;
}

export const ChannelDashboard: React.FC<ChannelDashboardProps> = ({
  shops,
  selectedShopId,
  onSelectShop,
  channelMetrics,
  hourlySeries,
  qianchuanRoi,
  activeAlertCount,
  onSimulateBurst,
  onAuthorizeShop,
  onJumpToAlerts,
}) => {
  const [channelFilter, setChannelFilter] = useState<'all' | Channel>('all');
  const [hoveredHourIdx, setHoveredHourIdx] = useState<number | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [newShopName, setNewShopName] = useState('');
  const [authCode, setAuthCode] = useState('DD_AUTH_CODE_2026');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');

  const currentShop = shops.find((s) => s.shopId === selectedShopId) ?? shops[0];
  const hongguoMetric = channelMetrics.find((m) => m.channel === 'hongguo');

  const filteredMetrics = useMemo(() => {
    if (channelFilter === 'all') return channelMetrics;
    return channelMetrics.filter((m) => m.channel === channelFilter);
  }, [channelMetrics, channelFilter]);

  const totalNetGmv = useMemo(
    () => filteredMetrics.reduce((s, m) => s + m.gmvNet, 0),
    [filteredMetrics],
  );
  const totalValidOrders = useMemo(
    () => filteredMetrics.reduce((s, m) => s + m.validCount, 0),
    [filteredMetrics],
  );
  const totalRiskOrders = useMemo(
    () => filteredMetrics.reduce((s, m) => s + m.shipTimeoutRiskCount, 0),
    [filteredMetrics],
  );

  const maxChartVal = useMemo(() => {
    let max = 8;
    for (const p of hourlySeries) {
      if (p.hongguoOrders > max) max = p.hongguoOrders;
      if (p.baselineAvg7d > max) max = p.baselineAvg7d;
    }
    return max + 2;
  }, [hourlySeries]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShopName.trim() || !authCode.trim()) {
      setAuthError('请填写店铺名称与 OAuth 回调授权码');
      return;
    }
    setAuthError('');
    setAuthSubmitting(true);
    try {
      await onAuthorizeShop(newShopName.trim(), authCode.trim());
      setNewShopName('');
      setShowAuthModal(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '授权交换失败');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const baselinePolyline = useMemo(() => {
    if (hourlySeries.length === 0) return '';
    return hourlySeries
      .map((p, idx) => {
        const x = 42 + idx * 54 + 18;
        const y = 175 - (p.baselineAvg7d / maxChartVal) * 145;
        return `${x},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [hourlySeries, maxChartVal]);

  return (
    <div className="space-y-8">
      {/* Toolbar: Shop Selector + Channel Filter + Burst Simulation */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="shop-select" className="text-xs font-medium text-slate-500 whitespace-nowrap">
            当前店铺
          </label>
          <select
            id="shop-select"
            value={selectedShopId}
            onChange={(e) => onSelectShop(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {shops.map((shop) => (
              <option key={shop.shopId} value={shop.shopId}>
                {shop.shopName}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 tabular-nums">
            体验分 {currentShop.experienceScore.toFixed(2)} · 授权状态{' '}
            {currentShop.authStatus === 'valid' ? '正常' : '即将到期'} · 规则热更新 v2026.11.17
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            添加授权店铺
          </button>
          <button
            type="button"
            onClick={onSimulateBurst}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-rose-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            模拟红果爆单 (+6 单)
          </button>
        </div>
      </div>

      {/* Segmented Channel Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="渠道筛选"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
        >
          {(['all', 'hongguo', 'mall', 'live', 'video', 'search'] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannelFilter(ch)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                channelFilter === ch
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {ch === 'all' ? '全部渠道' : CHANNEL_LABELS[ch]}
            </button>
          ))}
        </div>

        {activeAlertCount > 0 && (
          <button
            type="button"
            onClick={onJumpToAlerts}
            className="inline-flex items-center gap-2 text-xs font-medium text-rose-700 hover:text-rose-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>当前有 {activeAlertCount} 条未确认经营告警</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">净 GMV（已扣退款）</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            ¥{totalNetGmv.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            红果渠道占比{' '}
            {totalNetGmv > 0 && hongguoMetric
              ? `${Math.round((hongguoMetric.gmvNet / Math.max(1, channelMetrics.reduce((s, m) => s + m.gmvNet, 0))) * 100)}%`
              : '0%'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">有效成交单量</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totalValidOrders} 单
          </p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            红果单均客单价 ¥{hongguoMetric ? hongguoMetric.aov.toFixed(2) : '0.00'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">超时发货风险单（&lt; 4h）</p>
          <p
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              totalRiskOrders >= 3 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {totalRiskOrders} 笔
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {totalRiskOrders >= 3 ? '状态：已达严重告警阈值' : '状态：履约时效可控'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">红果近 1h 爆单指数</p>
          <p
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              (hongguoMetric?.burstIndex ?? 0) >= 3 ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {(hongguoMetric?.burstIndex ?? 0).toFixed(2)}x
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            对比 7 日同时段均值 · 阈值 3.00x
          </p>
        </div>
      </div>

      {/* 12-Hour Burst Trend Chart */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              红果渠道近 12 小时订单脉冲 vs 7 日基线
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              柱状为当前小时红果成交单量，虚线为过去 7 天同时段基线均值（用于触发爆单指数规则）
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-rose-600" aria-hidden="true" />
              当前小时单量
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-slate-500" aria-hidden="true" />
              7 日同时段基线
            </span>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <svg
            viewBox="0 0 700 210"
            className="w-full min-w-[620px] h-52"
            role="img"
            aria-label="红果渠道近12小时订单脉冲对比图"
          >
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = 175 - ratio * 145;
              const labelVal = Math.round(ratio * maxChartVal);
              return (
                <g key={ratio}>
                  <line x1="36" y1={y} x2="686" y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text
                    x="28"
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {labelVal}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {hourlySeries.map((pt, idx) => {
              const barH = (pt.hongguoOrders / maxChartVal) * 145;
              const x = 46 + idx * 54;
              const y = 175 - barH;
              const isBurst = pt.baselineAvg7d > 0 && pt.hongguoOrders / pt.baselineAvg7d >= 3;
              return (
                <g
                  key={pt.hourLabel}
                  onMouseEnter={() => setHoveredHourIdx(idx)}
                  onMouseLeave={() => setHoveredHourIdx(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={x}
                    y={y}
                    width="28"
                    height={Math.max(2, barH)}
                    rx="3"
                    fill={isBurst ? '#dc2626' : '#0f172a'}
                    opacity={hoveredHourIdx === null || hoveredHourIdx === idx ? 0.9 : 0.45}
                  />
                  <text
                    x={x + 14}
                    y="194"
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-mono"
                  >
                    {pt.hourLabel}
                  </text>
                </g>
              );
            })}

            {/* Baseline dashed line */}
            {baselinePolyline && (
              <polyline
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
                strokeDasharray="4 3"
                points={baselinePolyline}
              />
            )}
            {hourlySeries.map((pt, idx) => {
              const x = 42 + idx * 54 + 18;
              const y = 175 - (pt.baselineAvg7d / maxChartVal) * 145;
              return <circle key={`dot-${pt.hourLabel}`} cx={x} cy={y} r="3" fill="#475569" />;
            })}
          </svg>
        </div>

        {hoveredHourIdx !== null && hourlySeries[hoveredHourIdx] && (
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600 tabular-nums border-t border-slate-100 pt-3">
            <span className="font-medium text-slate-900">
              时段 {hourlySeries[hoveredHourIdx].hourLabel}
            </span>
            <span>红果成交 {hourlySeries[hoveredHourIdx].hongguoOrders} 单</span>
            <span>7 日基线 {hourlySeries[hoveredHourIdx].baselineAvg7d} 单</span>
            <span>
              净 GMV ¥{hourlySeries[hoveredHourIdx].hongguoGmv.toFixed(2)}
            </span>
          </div>
        )}
      </section>

      {/* Channel Split Table */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">多渠道拆解明细表</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              通过 ChannelResolver 优先级规则自动将抖店订单拆分为红果、商城、直播与短视频来源
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            共 {filteredMetrics.length} 个活跃渠道
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">流量渠道</th>
                <th className="py-3 px-4 text-right">总成交额</th>
                <th className="py-3 px-4 text-right">退款金额</th>
                <th className="py-3 px-4 text-right">净 GMV</th>
                <th className="py-3 px-4 text-right">有效单量</th>
                <th className="py-3 px-4 text-right">客单价</th>
                <th className="py-3 px-4 text-right">退款率</th>
                <th className="py-3 px-6 text-right">超时风险单</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredMetrics.map((m) => (
                <tr key={m.channel} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-6 font-medium text-slate-900">
                    {m.label}
                    {m.channel === 'hongguo' && (
                      <span className="ml-2 text-xs font-normal text-rose-600">核心监测</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    ¥{m.gmvGross.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                    ¥{m.refundAmount.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                    ¥{m.gmvNet.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {m.validCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    ¥{m.aov.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {(m.refundRate * 100).toFixed(1)}%
                  </td>
                  <td
                    className={`py-3 px-6 text-right font-mono tabular-nums font-medium ${
                      m.shipTimeoutRiskCount > 0 ? 'text-amber-700' : 'text-slate-500'
                    }`}
                  >
                    {m.shipTimeoutRiskCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Qianchuan ROI Table (Read-only with explicit attribution note) */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">千川流量包真实 ROI 分析（只读）</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              真实 ROI = (归因成交 − 退款 − SKU 预估成本) / 消耗 · 报表存在 T+1 延迟 · 不支持自动调价写操作
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">数据截至 2026-11-17</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">推广计划</th>
                <th className="py-3 px-4">归因口径</th>
                <th className="py-3 px-4 text-right">消耗</th>
                <th className="py-3 px-4 text-right">归因成交</th>
                <th className="py-3 px-4 text-right">扣除退款/成本</th>
                <th className="py-3 px-4 text-right">名义 ROI</th>
                <th className="py-3 px-6 text-right">真实 ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {qianchuanRoi.map((row) => (
                <tr key={row.campaignId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-6">
                    <div className="font-medium text-slate-900">{row.campaignName}</div>
                    <div className="text-xs text-slate-500 font-mono">{row.targetSkuId}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {row.attributionMode === 'exact_sku' ? '精确 SKU 归因' : '店铺时间窗估算'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    ¥{row.cost.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    ¥{row.attributedGmv.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                    -¥{(row.refundAmount + row.estimatedCogs).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {row.nominalRoi.toFixed(2)}
                  </td>
                  <td
                    className={`py-3 px-6 text-right font-mono tabular-nums font-semibold ${
                      row.trueRoi >= 1.5
                        ? 'text-emerald-700'
                        : row.trueRoi >= 1.0
                          ? 'text-amber-700'
                          : 'text-rose-600'
                    }`}
                  >
                    {row.trueRoi.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Thin-Relay OAuth Modal */}
      {showAuthModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="oauth-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h3 id="oauth-dialog-title" className="text-base font-semibold text-slate-900">
                  OAuth 店铺授权（v2.0 云端中继交换）
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  客户端不持有 app_secret，授权码将发送至 /api/oauth/exchange 由服务端安全换取短期令牌。
                </p>
              </div>
              <KeyRound className="h-5 w-5 text-slate-400 shrink-0" />
            </div>

            <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="new-shop-name" className="block text-xs font-medium text-slate-700">
                  店铺名称
                </label>
                <input
                  id="new-shop-name"
                  type="text"
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  placeholder="例如：拾光织造女装专营店"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="oauth-code" className="block text-xs font-medium text-slate-700">
                  抖店回环回调 Code
                </label>
                <input
                  id="oauth-code"
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {authError && <p className="text-xs text-rose-600">{authError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  {authSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  交换令牌并接入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
