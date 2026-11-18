#include "channel_resolver.hpp"
#include <algorithm>
#include <cctype>

namespace hongguo::core {

namespace {
std::string toLowerAscii(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return s;
}

std::string extractField(const RawOrder& order, const std::string& field) {
    if (field == "sceneType") return order.sceneType;
    if (field == "appSource") return order.appSource;
    if (field == "themeType") return order.themeType;
    if (field == "bType") return order.bType;
    if (field == "subBType") return order.subBType;
    return {};
}
} // namespace

ChannelResolver::ChannelResolver(std::vector<ChannelRule> rules)
    : rules_(std::move(rules)) {
    std::sort(rules_.begin(), rules_.end(),
              [](const ChannelRule& a, const ChannelRule& b) { return a.priority < b.priority; });
}

std::vector<ChannelRule> ChannelResolver::defaultRules() {
    return {
        {"rule_hg_scene", Channel::Hongguo, 1, "sceneType", {"hongguo_drama", "hongguo_search_same", "hg_short_drama", "redfruit_mall"}},
        {"rule_hg_app", Channel::Hongguo, 2, "appSource", {"hongguo", "com.phoenix.read", "redfruit"}},
        {"rule_hg_theme", Channel::Hongguo, 3, "themeType", {"short_drama_same_style", "9001"}},
        {"rule_live_btype", Channel::Live, 4, "bType", {"live", "1", "douyin_live"}},
        {"rule_video_btype", Channel::Video, 5, "bType", {"video", "2", "short_video"}},
        {"rule_search_scene", Channel::Search, 6, "sceneType", {"search_tab", "mall_search"}},
        {"rule_mall_btype", Channel::Mall, 7, "bType", {"mall", "0", "douyin_mall"}},
    };
}

void ChannelResolver::updateRules(std::vector<ChannelRule> newRules) {
    rules_ = std::move(newRules);
    std::sort(rules_.begin(), rules_.end(),
              [](const ChannelRule& a, const ChannelRule& b) { return a.priority < b.priority; });
}

NormalizedOrder ChannelResolver::resolve(const RawOrder& order) const {
    NormalizedOrder out;
    static_cast<RawOrder&>(out) = order;
    out.channelRaw = "scene=" + order.sceneType + ";app=" + order.appSource +
                     ";theme=" + order.themeType + ";b=" + order.bType;

    for (const auto& rule : rules_) {
        const std::string val = toLowerAscii(extractField(order, rule.field));
        if (val.empty()) continue;
        for (const auto& candidate : rule.matchValues) {
            if (val == toLowerAscii(candidate)) {
                out.channel = rule.channel;
                out.matchedRuleId = rule.id;
                return out;
            }
        }
    }

    out.channel = out.channelRaw.empty() ? Channel::Unknown : Channel::Other;
    out.matchedRuleId = "fallback_default";
    return out;
}

std::vector<NormalizedOrder> ChannelResolver::normalizeBatch(const std::vector<RawOrder>& orders) const {
    std::vector<NormalizedOrder> result;
    result.reserve(orders.size());
    for (const auto& o : orders) {
        result.push_back(resolve(o));
    }
    return result;
}

std::map<std::string, int> ChannelResolver::analyzeDistribution(const std::vector<RawOrder>& orders) {
    std::map<std::string, int> dist;
    for (const auto& o : orders) {
        const std::string key = "scene:" + o.sceneType + "|app:" + o.appSource + "|bType:" + o.bType;
        dist[key] += 1;
    }
    return dist;
}

} // namespace hongguo::core
