#pragma once

#include <QObject>
#include <QTcpServer>
#include <QUrl>

namespace hongguo::infra {

/**
 * v2.0 Thin-Relay OAuth Flow:
 * - Listens on 127.0.0.1:<ephemeral_port> for Doudian OAuth callback.
 * - Generates CSRF state + PKCE code_verifier.
 * - Sends code to our Thin-Relay Backend (/api/oauth/exchange) so app_secret NEVER lives in the Qt binary.
 */
class OAuthLoopbackFlow : public QObject {
    Q_OBJECT
public:
    explicit OAuthLoopbackFlow(const QString& relayBaseUrl, QObject* parent = nullptr);

    bool startAuthorize(const QString& appKey, const QString& shopHint = {});

signals:
    void shopAuthorized(const QString& shopId,
                        const QString& shopName,
                        const QString& accessToken,
                        const QString& expiresAtIso);
    void authFailed(const QString& errorMessage);

private slots:
    void onIncomingConnection();

private:
    void exchangeCodeViaRelay(const QString& code);

    QString relayBaseUrl_;
    QTcpServer server_;
    QString expectedState_;
    QString codeVerifier_;
};

} // namespace hongguo::infra
