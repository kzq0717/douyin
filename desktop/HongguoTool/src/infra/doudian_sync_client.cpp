#include "doudian_sync_client.hpp"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>

namespace hongguo::infra {

namespace {
hongguo::core::Channel parseChannel(const QString& s) {
    if (s == QLatin1String("hongguo")) return hongguo::core::Channel::Hongguo;
    if (s == QLatin1String("mall")) return hongguo::core::Channel::Mall;
    if (s == QLatin1String("live")) return hongguo::core::Channel::Live;
    if (s == QLatin1String("video")) return hongguo::core::Channel::Video;
    if (s == QLatin1String("search")) return hongguo::core::Channel::Search;
    return hongguo::core::Channel::Other;
}
} // namespace

DoudianSyncClient::DoudianSyncClient(const QString& relayBaseUrl, QObject* parent)
    : QObject(parent), relayBaseUrl_(relayBaseUrl) {}

void DoudianSyncClient::fetchHotChannelRules() {
    if (rulesInFlight_) return; // single-flight
    rulesInFlight_ = true;

    QNetworkRequest req(QUrl(relayBaseUrl_ + QStringLiteral("/api/rules/channel")));
    QNetworkReply* reply = nam_.get(req);

    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        rulesInFlight_ = false;
        reply->deleteLater();

        if (reply->error() != QNetworkReply::NoError) {
            emit syncError(QStringLiteral("渠道规则热更新拉取失败: ") + reply->errorString());
            return;
        }

        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const QString version = root.value(QStringLiteral("version")).toString();
        const QJsonArray arr = root.value(QStringLiteral("rules")).toArray();

        std::vector<hongguo::core::ChannelRule> parsed;
        for (const QJsonValue& val : arr) {
            const QJsonObject obj = val.toObject();
            hongguo::core::ChannelRule rule;
            rule.id = obj.value(QStringLiteral("id")).toString().toStdString();
            rule.channel = parseChannel(obj.value(QStringLiteral("channel")).toString());
            rule.priority = obj.value(QStringLiteral("priority")).toInt(100);
            rule.field = obj.value(QStringLiteral("field")).toString().toStdString();
            for (const QJsonValue& mv : obj.value(QStringLiteral("matchValues")).toArray()) {
                rule.matchValues.push_back(mv.toString().toStdString());
            }
            parsed.push_back(std::move(rule));
        }

        if (!parsed.empty()) {
            emit channelRulesUpdated(version, parsed);
        }
    });
}

} // namespace hongguo::infra
