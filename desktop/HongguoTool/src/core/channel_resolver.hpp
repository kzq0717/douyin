#pragma once

#include "types.hpp"
#include <map>
#include <vector>

namespace hongguo::core {

class ChannelResolver {
public:
    explicit ChannelResolver(std::vector<ChannelRule> rules = defaultRules());

    static std::vector<ChannelRule> defaultRules();

    NormalizedOrder resolve(const RawOrder& order) const;
    std::vector<NormalizedOrder> normalizeBatch(const std::vector<RawOrder>& orders) const;
    static std::map<std::string, int> analyzeDistribution(const std::vector<RawOrder>& orders);

    void updateRules(std::vector<ChannelRule> newRules);

private:
    std::vector<ChannelRule> rules_;
};

} // namespace hongguo::core
