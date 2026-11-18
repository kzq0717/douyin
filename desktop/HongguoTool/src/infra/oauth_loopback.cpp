#include "oauth_loopback.hpp"

#include <QCryptographicHash>
#include <QDesktopServices>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTcpSocket>
#include <QUrlQuery>
#include <QUuid>

namespace hongguo::infra {

OAuthLoopbackFlow::OAuthLoopbackFlow(const QString& relayBaseUrl, QObject* parent)
    : QObject(parent), relayBaseUrl_(relayBaseUrl) {
    connect(&server_, &QTcpServer::newConnection, this, &OAuthLoopbackFlow::onIncomingConnection);
}

bool OAuthLoopbackFlow::startAuthorize(const QString& appKey, const QString& shopHint) {
    if (server_.isListening()) {
        server_.close();
    }
    if (!server_.listen(QHostAddress::LocalHost, 0)) {
        emit authFailed(QStringLiteral("无法绑定本地回环端口接收授权回调"));
        return false;
    }

    expectedState_ = QUuid::createUuid().toString(QUuid::WithoutBraces);
    codeVerifier_ = QUuid::createUuid().toString(QUuid::WithoutBraces) +
                    QUuid::createUuid().toString(QUuid::WithoutBraces);

    const QByteArray challenge = QCryptographicHash::hash(codeVerifier_.toUtf8(), QCryptographicHash::Sha256)
                                     .toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals);

    const QString redirectUri = QStringLiteral("http://127.0.0.1:%1/callback").arg(server_.serverPort());

    QUrl authUrl(QStringLiteral("https://fuwu.jinritemai.com/authorize"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("app_key"), appKey);
    query.addQueryItem(QStringLiteral("response_type"), QStringLiteral("code"));
    query.addQueryItem(QStringLiteral("state"), expectedState_);
    query.addQueryItem(QStringLiteral("code_challenge"), QString::fromUtf8(challenge));
    query.addQueryItem(QStringLiteral("code_challenge_method"), QStringLiteral("S256"));
    query.addQueryItem(QStringLiteral("redirect_uri"), redirectUri);
    if (!shopHint.isEmpty()) {
        query.addQueryItem(QStringLiteral("shop_hint"), shopHint);
    }
    authUrl.setQuery(query);

    return QDesktopServices::openUrl(authUrl);
}

void OAuthLoopbackFlow::onIncomingConnection() {
    QTcpSocket* socket = server_.nextPendingConnection();
    if (!socket) return;

    connect(socket, &QTcpSocket::readyRead, this, [this, socket]() {
        const QByteArray requestBytes = socket->readAll();
        const QString firstLine = QString::fromUtf8(requestBytes.split('\n').value(0)).trimmed();
        const QStringList parts = firstLine.split(' ');
        const QString target = parts.value(1);

        const QUrl reqUrl(QStringLiteral("http://127.0.0.1") + target);
        const QUrlQuery q(reqUrl);
        const QString state = q.queryItemValue(QStringLiteral("state"));
        const QString code = q.queryItemValue(QStringLiteral("code"));

        const QByteArray html =
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n"
            "<html><body style='font-family:sans-serif;padding:32px'>"
            "<h3>授权回调已收到，请返回红果电商商家赋能客户端</h3>"
            "<p>您可以安全关闭此浏览器标签页。</p></body></html>";
        socket->write(html);
        socket->flush();
        socket->disconnectFromHost();
        server_.close();

        if (state != expectedState_ || code.isEmpty()) {
            emit authFailed(QStringLiteral("OAuth state 校验失败或缺少授权码"));
            return;
        }
        exchangeCodeViaRelay(code);
    });
}

void OAuthLoopbackFlow::exchangeCodeViaRelay(const QString& code) {
    auto* nam = new QNetworkAccessManager(this);
    QNetworkRequest req(QUrl(relayBaseUrl_ + QStringLiteral("/api/oauth/exchange")));
    req.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));

    QJsonObject body;
    body.insert(QStringLiteral("code"), code);
    body.insert(QStringLiteral("codeVerifier"), codeVerifier_);

    QNetworkReply* reply = nam->post(req, QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply, nam]() {
        reply->deleteLater();
        nam->deleteLater();

        if (reply->error() != QNetworkReply::NoError) {
            emit authFailed(reply->errorString());
            return;
        }
        const QJsonObject obj = QJsonDocument::fromJson(reply->readAll()).object();
        emit shopAuthorized(
            obj.value(QStringLiteral("shopId")).toString(),
            obj.value(QStringLiteral("shopName")).toString(),
            obj.value(QStringLiteral("accessToken")).toString(),
            obj.value(QStringLiteral("tokenExpiresAt")).toString());
    });
}

} // namespace hongguo::infra
