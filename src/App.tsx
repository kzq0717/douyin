import { useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  FileCode2,
  Image as ImageIcon,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ChannelDashboard } from './components/ChannelDashboard';
import { FeasibilityReport } from './components/FeasibilityReport';
import { MarkdownSpecViewer } from './components/MarkdownSpecViewer';
import { OperationsWorkbench } from './components/OperationsWorkbench';
import { VisionLab } from './components/VisionLab';
import { DEFAULT_ALERT_RULES, evaluateAlertRules } from './core/alertEngine';
import { executeBatchPlan } from './core/batchPlanner';
import { normalizeOrders } from './core/channelResolver';
import {
  calculateChannelMetrics,
  calculateHourlyBurstSeries,
  calculateQianchuanRoi,
} from './core/metricEngine';
import type {
  AlertRecord,
  AlertRule,
  BatchPlan,
  NormalizedOrder,
  OpAuditLog,
  RawDoudianOrder,
  Shop,
  SkuItem,
} from './core/types';
import {
  BASELINE_7D_BY_HOUR,
  SEED_AUDIT_LOGS,
  SEED_CAMPAIGNS,
  SEED_NOW_ISO,
  SEED_ORDERS,
  SEED_SHOPS,
  SEED_SKUS,
} from './data/seedData';

type ActiveTab = 'dashboard' | 'operations' | 'vision' | 'feasibility' | 'spec';

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; icon: typeof BarChart3 }> = [
  { id: 'dashboard', label: '渠道经营看板', icon: BarChart3 },
  { id: 'operations', label: '告警与批量执行', icon: Bell },
  { id: 'vision', label: '离线识图评估', icon: ImageIcon },
  { id: 'feasibility', label: '可行性评审与优化', icon: ShieldCheck },
  { id: 'spec', label: '技术方案 v2.0', icon: FileCode2 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [shops, setShops] = useState<Shop[]>(SEED_SHOPS);
  const [selectedShopId, setSelectedShopId] = useState<string>(SEED_SHOPS[0].shopId);
  const [orders, setOrders] = useState<NormalizedOrder[]>(SEED_ORDERS);
  const [skus, setSkus] = useState<SkuItem[]>(SEED_SKUS);
  const [rules, setRules] = useState<AlertRule[]>(DEFAULT_ALERT_RULES);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(true);
  const [auditLogs, setAuditLogs] = useState<OpAuditLog[]>(SEED_AUDIT_LOGS);
  const [nowIso, setNowIso] = useState<string>(SEED_NOW_ISO);
  const [ackedAlertIds, setAckedAlertIds] = useState<string[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<AlertRecord[]>(() => {
    const shop = SEED_SHOPS[0];
    const shopOrders = SEED_ORDERS.filter((o) => o.shopId === shop.shopId);
    const metrics = calculateChannelMetrics(shopOrders, {
      nowIso: SEED_NOW_ISO,
      baselineSameHour7dOrders: {
        hongguo: 4,
        mall: 4,
        live: 3,
        video: 3,
        search: 2,
        other: 1,
        unknown: 1,
      },
    });
    return evaluateAlertRules({
      shop,
      channelMetrics: metrics,
      skus: SEED_SKUS,
      rules: DEFAULT_ALERT_RULES,
      existingAlerts: [],
      nowIso: SEED_NOW_ISO,
      quietHoursEnabled: true,
    });
  });

  const currentShop = shops.find((s) => s.shopId === selectedShopId) ?? shops[0];

  const shopOrders = useMemo(
    () => orders.filter((o) => o.shopId === selectedShopId),
    [orders, selectedShopId],
  );

  const channelMetrics = useMemo(
    () =>
      calculateChannelMetrics(shopOrders, {
        nowIso,
        baselineSameHour7dOrders: {
          hongguo: 3,
          mall: 4,
          live: 3,
          video: 3,
          search: 2,
          other: 1,
          unknown: 1,
        },
      }),
    [shopOrders, nowIso],
  );

  const hourlySeries = useMemo(
    () => calculateHourlyBurstSeries(shopOrders, nowIso, BASELINE_7D_BY_HOUR),
    [shopOrders, nowIso],
  );

  const qianchuanRoi = useMemo(() => {
    const shopCampaigns = SEED_CAMPAIGNS.filter((c) => c.shopId === selectedShopId);
    return calculateQianchuanRoi(shopCampaigns, shopOrders, skus);
  }, [selectedShopId, shopOrders, skus]);

  const mergedAlerts = useMemo(
    () =>
      triggeredAlerts.map((a) => ({
        ...a,
        acked: a.acked || ackedAlertIds.includes(a.id),
      })),
    [triggeredAlerts, ackedAlertIds],
  );

  const activeAlertCount = mergedAlerts.filter(
    (a) => a.shopId === selectedShopId && !a.acked,
  ).length;

  const handleSimulateBurst = () => {
    const baseMs = new Date(nowIso).getTime();
    const targetSku = skus.find((s) => s.shopId === selectedShopId) ?? skus[0];
    const burstRaw: RawDoudianOrder[] = Array.from({ length: 6 }, (_, i) => {
      const payTime = new Date(baseMs - (i * 5 + 2) * 60 * 1000).toISOString();
      return {
        orderId: `HG-BURST-${Date.now()}-${i}`,
        shopId: selectedShopId,
        bType: 'mall',
        sceneType: 'hongguo_search_same',
        appSource: 'hongguo',
        payAmount: targetSku.price,
        refundAmount: 0,
        itemCount: 1,
        skuId: targetSku.skuId,
        productTitle: targetSku.title,
        orderStatus: 'paid_unshipped',
        payTime,
        shipDeadline: new Date(baseMs + 2.5 * 3600 * 1000).toISOString(),
        updateTime: payTime,
      };
    });

    const normalizedBurst = normalizeOrders(burstRaw);
    const nextOrders = [...normalizedBurst, ...orders];
    setOrders(nextOrders);

    // Advance clock by 2 minutes & re-evaluate alert rules
    const nextNow = new Date(baseMs + 2 * 60 * 1000).toISOString();
    setNowIso(nextNow);

    const nextShopOrders = nextOrders.filter((o) => o.shopId === selectedShopId);
    const nextMetrics = calculateChannelMetrics(nextShopOrders, {
      nowIso: nextNow,
      baselineSameHour7dOrders: {
        hongguo: 3,
        mall: 4,
        live: 3,
        video: 3,
        search: 2,
        other: 1,
        unknown: 1,
      },
    });
    const newAlerts = evaluateAlertRules({
      shop: currentShop,
      channelMetrics: nextMetrics,
      skus,
      rules,
      existingAlerts: triggeredAlerts,
      nowIso: nextNow,
      quietHoursEnabled,
    });
    if (newAlerts.length > 0) {
      setTriggeredAlerts((prev) => [...newAlerts, ...prev]);
    }
  };

  const handleAuthorizeShop = async (shopName: string, code: string) => {
    const resp = await fetch('/api/oauth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopName, code }),
    });
    if (!resp.ok) {
      const errData = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'OAuth 令牌交换失败');
    }
    const created = (await resp.json()) as {
      shopId: string;
      shopName: string;
      authStatus: 'valid';
      tokenExpiresAt: string;
    };
    const newShop: Shop = {
      shopId: created.shopId,
      shopName: created.shopName,
      authStatus: 'valid',
      tokenExpiresAt: created.tokenExpiresAt,
      experienceScore: 4.9,
      yesterdayScore: 4.9,
      lastSyncAt: nowIso,
    };
    setShops((prev) => [...prev, newShop]);
    setSelectedShopId(newShop.shopId);
  };

  const handleToggleRule = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const handleAckAlert = (alertId: string) => {
    setAckedAlertIds((prev) => [...prev, alertId]);
  };

  const handleCommitBatchPlan = (plan: BatchPlan) => {
    const res = executeBatchPlan(plan, skus, nowIso);
    setSkus(res.updatedSkus);
    setAuditLogs((prev) => [res.auditLog, ...prev]);
  };

  const currentNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? '';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar (240px) */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="h-16 flex items-center px-5 border-b border-slate-200">
          <span className="font-display text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap">
            红果电商商家赋能台
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </span>
                {item.id === 'operations' && activeAlertCount > 0 && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      active ? 'text-rose-300' : 'text-rose-600 font-semibold'
                    }`}
                  >
                    {activeAlertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 text-[11px] text-slate-500 leading-relaxed">
          仅接入官方授权 API · 不抓取平台内容 · 离线模型结果仅作构图参考
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-full bg-white h-full border-r border-slate-200 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200">
              <span className="font-display text-sm font-bold text-slate-900">
                红果电商商家赋能台
              </span>
              <button
                type="button"
                aria-label="关闭菜单"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="打开导航菜单"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-400 hidden sm:inline">工作台</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {currentNavLabel}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('spec')}
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            查看 v2.0 技术方案
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1280px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <ChannelDashboard
              shops={shops}
              selectedShopId={selectedShopId}
              onSelectShop={setSelectedShopId}
              channelMetrics={channelMetrics}
              hourlySeries={hourlySeries}
              qianchuanRoi={qianchuanRoi}
              activeAlertCount={activeAlertCount}
              onSimulateBurst={handleSimulateBurst}
              onAuthorizeShop={handleAuthorizeShop}
              onJumpToAlerts={() => setActiveTab('operations')}
            />
          )}

          {activeTab === 'operations' && (
            <OperationsWorkbench
              selectedShopId={selectedShopId}
              skus={skus}
              alerts={mergedAlerts}
              rules={rules}
              quietHoursEnabled={quietHoursEnabled}
              auditLogs={auditLogs}
              onToggleQuietHours={() => setQuietHoursEnabled((v) => !v)}
              onToggleRule={handleToggleRule}
              onAckAlert={handleAckAlert}
              onCommitBatchPlan={handleCommitBatchPlan}
            />
          )}

          {activeTab === 'vision' && <VisionLab skus={skus} />}

          {activeTab === 'feasibility' && <FeasibilityReport />}

          {activeTab === 'spec' && <MarkdownSpecViewer />}
        </main>
      </div>
    </div>
  );
}
