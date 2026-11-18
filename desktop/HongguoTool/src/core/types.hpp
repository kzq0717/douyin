#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace hongguo::core {

enum class Channel {
    Hongguo,
    Mall,
    Live,
    Video,
    Search,
    Other,
    Unknown
};

inline std::string channelToString(Channel c) {
    switch (c) {
        case Channel::Hongguo: return "hongguo";
        case Channel::Mall: return "mall";
        case Channel::Live: return "live";
        case Channel::Video: return "video";
        case Channel::Search: return "search";
        case Channel::Other: return "other";
        default: return "unknown";
    }
}

inline std::string channelToLabel(Channel c) {
    switch (c) {
        case Channel::Hongguo: return "红果短剧";
        case Channel::Mall: return "抖店商城";
        case Channel::Live: return "直播间";
        case Channel::Video: return "短视频";
        case Channel::Search: return "泛搜索";
        case Channel::Other: return "其他渠道";
        default: return "未识别";
    }
}

struct ChannelRule {
    std::string id;
    Channel channel{Channel::Other};
    int priority{100};
    std::string field; // "sceneType", "appSource", "themeType", "bType", "subBType"
    std::vector<std::string> matchValues;
};

enum class OrderStatus {
    PaidUnshipped,
    Shipped,
    Completed,
    ClosedUnpaid,
    Refunded
};

struct RawOrder {
    std::string orderId;
    std::string shopId;
    std::string bType;
    std::string subBType;
    std::string sceneType;
    std::string themeType;
    std::string appSource;
    double payAmount{0.0};
    double refundAmount{0.0};
    int itemCount{1};
    std::string skuId;
    std::string productTitle;
    OrderStatus status{OrderStatus::PaidUnshipped};
    int64_t payEpochSec{0};
    int64_t shipDeadlineEpochSec{0};
    int64_t updateEpochSec{0};
};

struct NormalizedOrder : public RawOrder {
    Channel channel{Channel::Unknown};
    std::string channelRaw;
    std::string matchedRuleId;
};

struct SkuItem {
    std::string skuId;
    std::string shopId;
    std::string productId;
    std::string title;
    int stock{0};
    int safetyThreshold{20};
    double price{0.0};
    double costEstimate{0.0};
    bool onSale{true};
    std::string imgMain;
};

struct ChannelMetric {
    Channel channel{Channel::Hongguo};
    double gmvGross{0.0};
    double refundAmount{0.0};
    double gmvNet{0.0};
    int orderCount{0};
    int validCount{0};
    double aov{0.0};
    double refundRate{0.0};
    int shipTimeoutRiskCount{0};
    double burstIndex{0.0};
};

enum class AlertLevel {
    Warning,
    Critical
};

struct AlertRule {
    std::string id;
    std::string name;
    std::string metric; // "order_count_1h", "sku_stock", "risk_order_count", "shop_score"
    std::string op;     // ">=" or "<="
    double value{0.0};
    AlertLevel level{AlertLevel::Warning};
    int cooldownMin{30};
    bool enabled{true};
};

struct AlertRecord {
    std::string id;
    std::string shopId;
    std::string ruleId;
    AlertLevel level{AlertLevel::Warning};
    std::string subject;
    std::string detail;
    int64_t createdEpochSec{0};
    bool acked{false};
};

enum class ImageKind {
    WhiteBg,
    FlatLay,
    LifestyleScene
};

struct ImageMetrics {
    double borderWhitenessRatio{0.0};
    double edgeDensity{0.0};
    double colorEntropy{0.0};
    double foregroundCoverage{0.0};
    ImageKind kind{ImageKind::LifestyleScene};
};

struct VisionMatch {
    std::string skuId;
    std::string imagePath;
    ImageKind kind{ImageKind::LifestyleScene};
    float score{0.0f};
};

struct LicensePayload {
    std::string boardHash;
    std::string diskHash;
    std::string cpuHash;
    std::string expireDate; // YYYY-MM-DD
    std::string plan;
    int maxShops{1};
};

} // namespace hongguo::core
