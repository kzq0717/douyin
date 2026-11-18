#pragma once

#include "../core/channel_resolver.hpp"
#include <QNetworkAccessManager>
#include <QObject>
#include <QTimer>

namespace hongguo::infra {

/**
 * Official Doudian Open API sync client & Thin-Relay hot-rule fetcher.
 * Enforces single-flight execution, token-bucket rate limiting, and exponential backoff.
 */
class DoudianSyncClient : public QObject {
    Q_OBJECT
public:
    explicit DoudianSyncClient(const QString& relayBaseUrl, QObject* parent = nullptr);

    void fetchHotChannelRules();

signals:
    void channelRulesUpdated(const QString& version, const std::vector<hongguo::core::ChannelRule>& rules);
    void syncError(const QString& message);

private:
    QString relayBaseUrl_;
    QNetworkAccessManager nam_;
    bool rulesInFlight_{false};
};

} // namespace hongguo::infra
