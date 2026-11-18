#pragma once

#include "types.hpp"
#include <vector>

namespace hongguo::core {

class AlertEngine {
public:
    static std::vector<AlertRule> defaultRules();

    static bool isQuietHour(int localHour24);

    static std::vector<AlertRecord> evaluate(
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
        bool quietHoursEnabled);
};

} // namespace hongguo::core
