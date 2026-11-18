#pragma once

#include "types.hpp"
#include <map>
#include <vector>

namespace hongguo::core {

class MetricCalculator {
public:
    static std::vector<ChannelMetric> calculateChannelMetrics(
        const std::vector<NormalizedOrder>& orders,
        int64_t nowEpochSec,
        const std::map<Channel, double>& baselineSameHour7d);
};

} // namespace hongguo::core
