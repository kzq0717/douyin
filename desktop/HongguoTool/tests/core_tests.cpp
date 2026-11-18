#include "../src/core/alert_engine.hpp"
#include "../src/core/channel_resolver.hpp"
#include "../src/core/exact_cosine_index.hpp"
#include "../src/core/license_validator.hpp"
#include "../src/core/metric_calculator.hpp"

#include <cassert>
#include <cmath>
#include <iostream>

using namespace hongguo::core;

int main() {
    // 1. ChannelResolver priority check
    {
        ChannelResolver resolver;
        RawOrder ord;
        ord.orderId = "ORD-1";
        ord.shopId = "SHOP-1";
        ord.bType = "mall";
        ord.sceneType = "hongguo_search_same";
        auto norm = resolver.resolve(ord);
        assert(norm.channel == Channel::Hongguo);
        assert(norm.matchedRuleId == "rule_hg_scene");
    }

    // 2. MetricCalculator dual-basis Net GMV, <4h ship risk, and burst index
    {
        ChannelResolver resolver;
        const int64_t now = 1700000000;
        RawOrder o1{"O1", "S1", "mall", "", "hongguo_drama", "", "", 200.0, 0.0, 1, "SKU1", "Dress",
                    OrderStatus::PaidUnshipped, now - 1200, now + 7200, now - 1200};
        RawOrder o2{"O2", "S1", "mall", "", "hongguo_drama", "", "", 100.0, 40.0, 1, "SKU1", "Dress",
                    OrderStatus::Completed, now - 1800, now + 36000, now - 1800};
        auto normalized = resolver.normalizeBatch({o1, o2});
        auto metrics = MetricCalculator::calculateChannelMetrics(normalized, now, {{Channel::Hongguo, 1.0}});
        assert(metrics.size() == 1);
        assert(std::abs(metrics[0].gmvNet - 260.0) < 1e-6);
        assert(metrics[0].shipTimeoutRiskCount == 1);
        assert(std::abs(metrics[0].burstIndex - 2.0) < 1e-6);
    }

    // 3. AlertEngine cooldown & quiet hours
    {
        const int64_t now = 1700000000;
        ChannelMetric m;
        m.channel = Channel::Hongguo;
        m.burstIndex = 3.5;
        m.shipTimeoutRiskCount = 4;

        SkuItem sku{"SKU-LOW", "S1", "P1", "Dress", 12, 20, 189.0, 60.0, true, ""};
        auto rules = AlertEngine::defaultRules();
        auto alerts = AlertEngine::evaluate("S1", "TestShop", 4.5, 4.8, {m}, {sku}, rules, {}, now, 2, true);
        assert(alerts.size() == 2); // Only 2 Critical alerts during 02:00 quiet hours

        auto dedup = AlertEngine::evaluate("S1", "TestShop", 4.5, 4.8, {m}, {sku}, rules, alerts, now + 300, 2, true);
        assert(dedup.empty());
    }

    // 4. ExactCosineIndex add, query, swap-and-pop remove
    {
        ExactCosineIndex idx(4);
        idx.add("SKU-A", "a.jpg", ImageKind::LifestyleScene, {1.0f, 0.2f, 0.0f, 0.0f});
        idx.add("SKU-B", "b.jpg", ImageKind::WhiteBg, {0.0f, 0.0f, 1.0f, 0.0f});
        auto matches = idx.query({1.0f, 0.0f, 0.0f, 0.0f}, 2, 0.5f);
        assert(matches.size() == 1);
        assert(matches[0].skuId == "SKU-A");
        assert(idx.removeBySkuId("SKU-A") == true);
        assert(idx.size() == 1);
    }

    // 5. LicenseValidator 2-of-3 hardware match & 7-day grace window
    {
        LicensePayload p{"MB-1", "DISK-2", "CPU-3", "2026-11-20", "pro", 5};
        auto key = LicenseValidator::sign(p, "secret-v2");
        auto ok = LicenseValidator::verify(key, "MB-1", "DISK-NEW", "CPU-3", "secret-v2", "2026-11-17");
        assert(ok.valid && ok.status == LicenseStatus::Active);

        auto grace = LicenseValidator::verify(key, "MB-1", "DISK-2", "CPU-3", "secret-v2", "2026-11-24");
        assert(grace.valid && grace.status == LicenseStatus::GraceReadonly);

        auto expired = LicenseValidator::verify(key, "MB-1", "DISK-2", "CPU-3", "secret-v2", "2026-12-01");
        assert(!expired.valid && expired.status == LicenseStatus::Expired);
    }

    std::cout << "All 5 C++17 Hongguo core unit tests passed!\n";
    return 0;
}
