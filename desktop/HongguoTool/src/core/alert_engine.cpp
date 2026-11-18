#include "alert_engine.hpp"
#include <algorithm>
#include <sstream>

namespace hongguo::core {

namespace {
bool matchesThreshold(double actual, const std::string& op, double target) {
    return op == ">=" ? (actual >= target) : (actual <= target);
}

bool inCooldown(const std::vector<AlertRecord>& existing,
                const std::string& ruleId,
                const std::string& subject,
                int cooldownMin,
                int64_t nowEpochSec) {
    const int64_t cooldownSec = static_cast<int64_t>(cooldownMin) * 60;
    for (const auto& a : existing) {
        if (a.ruleId == ruleId && a.subject == subject &&
            (nowEpochSec - a.createdEpochSec) < cooldownSec) {
            return true;
        }
    }
    return false;
}
} // namespace

std::vector<AlertRule> AlertEngine::defaultRules() {
    return {
        {"burst_order", "红果渠道爆单指数预警", "order_count_1h", ">=", 3.0, AlertLevel::Critical, 30, true},
        {"low_stock", "SKU 安全库存阈值告警", "sku_stock", "<=", 20.0, AlertLevel::Warning, 60, true},
        {"ship_timeout_risk", "超时发货风险单积压", "risk_order_count", ">=", 3.0, AlertLevel::Critical, 15, true},
        {"score_drop", "店铺体验分单日下跌", "shop_score", "<=", -0.15, AlertLevel::Warning, 180, true},
    };
}

bool AlertEngine::isQuietHour(int localHour24) {
    return localHour24 >= 23 || localHour24 < 8;
}

std::vector<AlertRecord> AlertEngine::evaluate(
    const std::string& shopId,
    const std::string& shopName,
    double todayScore,
    double yesterdayScore,
    const std::vector<ChannelMetric>& metrics,
    const std::vector<SkuItem>& skus,
    const std::vector<AlertRule>& rules,
    const std::vector<AlertRecord>& existingAlerts,
    int64_t nowEpochSec,
    int localHour24,
    bool quietHoursEnabled) {
    std::vector<AlertRecord> generated;
    const bool quietNow = quietHoursEnabled && isQuietHour(localHour24);

    for (const auto& rule : rules) {
        if (!rule.enabled) continue;

        if (rule.metric == "order_count_1h") {
            for (const auto& m : metrics) {
                if (m.channel != Channel::Hongguo) continue;
                if (matchesThreshold(m.burstIndex, rule.op, rule.value)) {
                    const std::string subject = shopName + " · 红果短剧";
                    if (inCooldown(existingAlerts, rule.id, subject, rule.cooldownMin, nowEpochSec)) continue;
                    if (quietNow && rule.level != AlertLevel::Critical) continue;

                    std::ostringstream detail;
                    detail << "近1小时爆单指数 " << m.burstIndex << "x（阈值 " << rule.value << "x）";
                    generated.push_back({
                        "al_" + rule.id + "_" + std::to_string(nowEpochSec),
                        shopId, rule.id, rule.level, subject, detail.str(), nowEpochSec, false
                    });
                }
            }
        } else if (rule.metric == "sku_stock") {
            for (const auto& sku : skus) {
                if (sku.shopId != shopId || !sku.onSale) continue;
                const double threshold = std::min(rule.value, static_cast<double>(sku.safetyThreshold));
                if (matchesThreshold(static_cast<double>(sku.stock), rule.op, threshold)) {
                    const std::string subject = sku.skuId + " · " + sku.title;
                    if (inCooldown(existingAlerts, rule.id, subject, rule.cooldownMin, nowEpochSec)) continue;
                    AlertLevel lvl = sku.stock <= 5 ? AlertLevel::Critical : rule.level;
                    if (quietNow && lvl != AlertLevel::Critical) continue;

                    generated.push_back({
                        "al_" + rule.id + "_" + sku.skuId + "_" + std::to_string(nowEpochSec),
                        shopId, rule.id, lvl, subject,
                        "当前库存 " + std::to_string(sku.stock) + " 件，低于安全阈值",
                        nowEpochSec, false
                    });
                }
            }
        } else if (rule.metric == "risk_order_count") {
            int totalRisk = 0;
            for (const auto& m : metrics) totalRisk += m.shipTimeoutRiskCount;
            if (matchesThreshold(static_cast<double>(totalRisk), rule.op, rule.value)) {
                const std::string subject = shopName + " · 履约时效";
                if (inCooldown(existingAlerts, rule.id, subject, rule.cooldownMin, nowEpochSec)) continue;
                if (quietNow && rule.level != AlertLevel::Critical) continue;

                generated.push_back({
                    "al_" + rule.id + "_" + shopId + "_" + std::to_string(nowEpochSec),
                    shopId, rule.id, rule.level, subject,
                    "存在 " + std::to_string(totalRisk) + " 笔即将超时发货风险单",
                    nowEpochSec, false
                });
            }
        } else if (rule.metric == "shop_score") {
            const double delta = todayScore - yesterdayScore;
            if (matchesThreshold(delta, rule.op, rule.value)) {
                const std::string subject = shopName + " · 体验分";
                if (inCooldown(existingAlerts, rule.id, subject, rule.cooldownMin, nowEpochSec)) continue;
                if (quietNow && rule.level != AlertLevel::Critical) continue;

                generated.push_back({
                    "al_" + rule.id + "_" + shopId + "_" + std::to_string(nowEpochSec),
                    shopId, rule.id, rule.level, subject,
                    "店铺体验分日环比下跌",
                    nowEpochSec, false
                });
            }
        }
    }

    return generated;
}

} // namespace hongguo::core
