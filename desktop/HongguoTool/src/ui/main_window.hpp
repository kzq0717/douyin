#pragma once

#include "../core/channel_resolver.hpp"
#include "../core/exact_cosine_index.hpp"
#include "../infra/doudian_sync_client.hpp"
#include "../infra/oauth_loopback.hpp"
#include "../infra/onnx_clip_embedder.hpp"
#include "../infra/sqlite_writer.hpp"

#include <QLabel>
#include <QListWidget>
#include <QMainWindow>
#include <QStackedWidget>
#include <QTableWidget>

namespace hongguo::ui {

class MainWindow : public QMainWindow {
    Q_OBJECT
public:
    explicit MainWindow(const QString& relayBaseUrl, QWidget* parent = nullptr);
    ~MainWindow() override = default;

private slots:
    void onSimulateBurstClicked();
    void onSelectVisionImageClicked();
    void onAuthorizeShopClicked();
    void onVerifyLicenseClicked();

private:
    void setupUi();
    QWidget* createDashboardPage();
    QWidget* createAlertsPage();
    QWidget* createVisionPage();
    QWidget* createSettingsPage();
    void refreshDashboardMetrics();

    QString relayBaseUrl_;
    hongguo::core::ChannelResolver resolver_;
    hongguo::core::ExactCosineIndex visionIndex_{512};
    hongguo::infra::OnnxClipEmbedder embedder_;
    hongguo::infra::OAuthLoopbackFlow* oauthFlow_{nullptr};
    hongguo::infra::DoudianSyncClient* syncClient_{nullptr};
    hongguo::infra::SqliteWriter* dbWriter_{nullptr};

    std::vector<hongguo::core::NormalizedOrder> orders_;
    std::vector<hongguo::core::SkuItem> skus_;

    QListWidget* navList_{nullptr};
    QStackedWidget* pages_{nullptr};

    QLabel* kpiGmvLabel_{nullptr};
    QLabel* kpiOrdersLabel_{nullptr};
    QLabel* kpiRiskLabel_{nullptr};
    QLabel* kpiBurstLabel_{nullptr};
    QTableWidget* channelTable_{nullptr};
    QTableWidget* alertTable_{nullptr};

    QLabel* visionResultLabel_{nullptr};
    QLabel* visionMetricsLabel_{nullptr};
    QTableWidget* visionMatchesTable_{nullptr};

    QLabel* statusFooterLabel_{nullptr};
};

} // namespace hongguo::ui
