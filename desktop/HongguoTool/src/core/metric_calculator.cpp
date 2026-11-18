#include "metric_calculator.hpp"
#include <algorithm>
#include <array>

namespace hongguo::core {

std::vector<ChannelMetric> MetricCalculator::calculateChannelMetrics(
    const std::vector<NormalizedOrder>& orders,
    int64_t nowEpochSec,
    const std::map<Channel, double>& baselineSameHour7d) {
    constexpr int64_t kFourHoursSec = 4 * 3600;
    constexpr int64_t kOneHourSec = 3600;
    const std::array<Channel, 6> channels = {
        Channel::Hongguo, Channel::Mall, Channel::Live,
        Channel::Video,   Channel::Search, Channel::Other
    };

    std::vector<ChannelMetric> out;
    for (Channel ch : channels) {
        ChannelMetric m;
        m.channel = ch;
        int recent1h = 0;

        for (const auto& o : orders) {
            if (o.channel != ch) continue;
            m.orderCount += 1;
            if (o.status != OrderStatus::ClosedUnpaid) {
                m.gmvGross += o.payAmount;
                m.refundAmount += o.refundAmount;
                if (o.payEpochSec >= nowEpochSec - kOneHourSec && o.payEpochSec <= nowEpochSec) {
                    recent1h += 1;
                }
            }
            if (o.status != OrderStatus::ClosedUnpaid && o.status != OrderStatus::Refunded) {
                m.validCount += 1;
            }
            if (o.status == OrderStatus::PaidUnshipped &&
                (o.shipDeadlineEpochSec - nowEpochSec) <= kFourHoursSec) {
                m.shipTimeoutRiskCount += 1;
            }
        }

        if (m.orderCount == 0 && ch != Channel::Hongguo) {
            continue;
        }

        m.gmvNet = std::max(0.0, m.gmvGross - m.refundAmount);
        m.aov = m.validCount > 0 ? (m.gmvNet / m.validCount) : 0.0;
        m.refundRate = m.gmvGross > 0.0 ? (m.refundAmount / m.gmvGross) : 0.0;

        double baseline = 3.0;
        auto it = baselineSameHour7d.find(ch);
        if (it != baselineSameHour7d.end() && it->second > 0.0) {
            baseline = it->second;
        }
        m.burstIndex = static_cast<double>(recent1h) / baseline;
        out.push_back(m);
    }

    return out;
}

} // namespace hongguo::core
