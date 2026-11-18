#include "main_window.hpp"
#include "../core/alert_engine.hpp"
#include "../core/license_validator.hpp"
#include "../core/metric_calculator.hpp"

#include <QDateTime>
#include <QFileDialog>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QHeaderView>
#include <QLineEdit>
#include <QMessageBox>
#include <QPushButton>
#include <QStandardPaths>
#include <QVBoxLayout>

namespace hongguo::ui {

MainWindow::MainWindow(const QString& relayBaseUrl, QWidget* parent)
    : QMainWindow(parent), relayBaseUrl_(relayBaseUrl) {
    setWindowTitle(QStringLiteral("红果短剧电商商家赋能桌面端 · v2.0"));
    resize(1240, 820);

    oauthFlow_ = new hongguo::infra::OAuthLoopbackFlow(relayBaseUrl_, this);
    syncClient_ = new hongguo::infra::DoudianSyncClient(relayBaseUrl_, this);

    const QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    dbWriter_ = new hongguo::infra::SqliteWriter(dataDir + QStringLiteral("/hongguo_local.db"), this);
    dbWriter_->start();

    // Seed initial deterministic orders & SKUs for immediate local evaluation
    const int64_t now = QDateTime::currentSecsSinceEpoch();
    std::vector<hongguo::core::RawOrder> rawSeed = {
        {"HG-1001", "SHOP-01", "mall", "", "hongguo_search_same", "", "hongguo", 198.0, 0.0, 1, "SKU-DRESS-101", "碎花茶歇裙", hongguo::core::OrderStatus::PaidUnshipped, now - 1200, now + 7200, now - 1200},
        {"HG-1002", "SHOP-01", "mall", "", "hongguo_drama", "", "hongguo", 208.0, 0.0, 1, "SKU-DRESS-102", "碎花茶歇裙场景款", hongguo::core::OrderStatus::Shipped, now - 2400, now + 36000, now - 2400},
        {"DY-2001", "SHOP-01", "mall", "", "mall_tab", "", "", 189.0, 0.0, 1, "SKU-KETTLE-301", "陶瓷手冲壶", hongguo::core::OrderStatus::Completed, now - 5400, now + 50000, now - 5400},
    };
    orders_ = resolver_.normalizeBatch(rawSeed);
    skus_ = {
        {"SKU-DRESS-101", "SHOP-01", "P1", "法式鼠尾草绿碎花茶歇裙", 16, 25, 198.0, 64.0, true, ""},
        {"SKU-KETTLE-301", "SHOP-01", "P2", "哑光奶白陶瓷鹅颈手冲壶", 14, 30, 249.0, 82.0, true, ""},
    };

    connect(syncClient_, &hongguo::infra::DoudianSyncClient::channelRulesUpdated,
            this, [this](const QString& version, const std::vector<hongguo::core::ChannelRule>& rules) {
                resolver_.updateRules(rules);
                statusFooterLabel_->setText(QStringLiteral("渠道规则已热更新至 ") + version);
            });

    setupUi();
    refreshDashboardMetrics();
    syncClient_->fetchHotChannelRules();
}

void MainWindow::setupUi() {
    auto* central = new QWidget(this);
    auto* rootLayout = new QHBoxLayout(central);
    rootLayout->setContentsMargins(0, 0, 0, 0);
    rootLayout->setSpacing(0);

    navList_ = new QListWidget(central);
    navList_->setFixedWidth(210);
    navList_->addItems({
        QStringLiteral("渠道经营看板"),
        QStringLiteral("告警与爆单监测"),
        QStringLiteral("离线识图评估"),
        QStringLiteral("授权与 License"),
    });
    navList_->setCurrentRow(0);
    navList_->setStyleSheet(QStringLiteral(
        "QListWidget { background: #ffffff; border-right: 1px solid #e2e8f0; padding: 12px 8px; }"
        "QListWidget::item { padding: 10px 12px; border-radius: 6px; margin-bottom: 4px; color: #334155; }"
        "QListWidget::item:selected { background: #0f172a; color: #ffffff; font-weight: 600; }"
    ));

    auto* rightContainer = new QWidget(central);
    auto* rightLayout = new QVBoxLayout(rightContainer);
    rightLayout->setContentsMargins(24, 20, 24, 16);
    rightLayout->setSpacing(16);

    pages_ = new QStackedWidget(rightContainer);
    pages_->addWidget(createDashboardPage());
    pages_->addWidget(createAlertsPage());
    pages_->addWidget(createVisionPage());
    pages_->addWidget(createSettingsPage());

    statusFooterLabel_ = new QLabel(
        QStringLiteral("合规声明：仅通过官方开放 API 获取授权店铺数据，离线图像评估与平台算法无关。"),
        rightContainer);
    statusFooterLabel_->setStyleSheet(QStringLiteral("color: #64748b; font-size: 12px;"));

    rightLayout->addWidget(pages_, 1);
    rightLayout->addWidget(statusFooterLabel_);

    rootLayout->addWidget(navList_);
    rootLayout->addWidget(rightContainer, 1);
    setCentralWidget(central);

    connect(navList_, &QListWidget::currentRowChanged, pages_, &QStackedWidget::setCurrentIndex);
}

QWidget* MainWindow::createDashboardPage() {
    auto* page = new QWidget(this);
    auto* layout = new QVBoxLayout(page);
    layout->setSpacing(16);

    auto* headerRow = new QHBoxLayout();
    auto* title = new QLabel(QStringLiteral("红果渠道经营看板（本地 SQLite WAL）"), page);
    title->setStyleSheet(QStringLiteral("font-size: 18px; font-weight: 700; color: #0f172a;"));
    auto* burstBtn = new QPushButton(QStringLiteral("模拟红果爆单 (+6 单)"), page);
    burstBtn->setStyleSheet(QStringLiteral(
        "QPushButton { background: #dc2626; color: white; padding: 8px 16px; border-radius: 6px; font-weight: 600; }"
    ));
    connect(burstBtn, &QPushButton::clicked, this, &MainWindow::onSimulateBurstClicked);
    headerRow->addWidget(title);
    headerRow->addStretch();
    headerRow->addWidget(burstBtn);
    layout->addLayout(headerRow);

    auto* kpiGrid = new QGridLayout();
    auto makeCard = [page](const QString& labelText, QLabel*& valueOut) {
        auto* card = new QWidget(page);
        card->setStyleSheet(QStringLiteral("background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;"));
        auto* box = new QVBoxLayout(card);
        box->setContentsMargins(16, 14, 16, 14);
        auto* lbl = new QLabel(labelText, card);
        lbl->setStyleSheet(QStringLiteral("color: #64748b; font-size: 12px;"));
        valueOut = new QLabel(QStringLiteral("--"), card);
        valueOut->setStyleSheet(QStringLiteral("color: #0f172a; font-size: 22px; font-weight: 700;"));
        box->addWidget(lbl);
        box->addWidget(valueOut);
        return card;
    };

    kpiGrid->addWidget(makeCard(QStringLiteral("红果渠道净 GMV"), kpiGmvLabel_), 0, 0);
    kpiGrid->addWidget(makeCard(QStringLiteral("红果有效单量"), kpiOrdersLabel_), 0, 1);
    kpiGrid->addWidget(makeCard(QStringLiteral("超时发货风险单 (<4h)"), kpiRiskLabel_), 0, 2);
    kpiGrid->addWidget(makeCard(QStringLiteral("红果 1h 爆单指数"), kpiBurstLabel_), 0, 3);
    layout->addLayout(kpiGrid);

    channelTable_ = new QTableWidget(0, 6, page);
    channelTable_->setHorizontalHeaderLabels({
        QStringLiteral("渠道"), QStringLiteral("净 GMV"), QStringLiteral("有效单量"),
        QStringLiteral("客单价"), QStringLiteral("退款率"), QStringLiteral("超时风险单")
    });
    channelTable_->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    channelTable_->setEditTriggers(QAbstractItemView::NoEditTriggers);
    layout->addWidget(channelTable_, 1);

    return page;
}

QWidget* MainWindow::createAlertsPage() {
    auto* page = new QWidget(this);
    auto* layout = new QVBoxLayout(page);
    auto* title = new QLabel(QStringLiteral("告警规则引擎触发队列（冷却去重 + 夜间静默）"), page);
    title->setStyleSheet(QStringLiteral("font-size: 18px; font-weight: 700; color: #0f172a;"));
    layout->addWidget(title);

    alertTable_ = new QTableWidget(0, 4, page);
    alertTable_->setHorizontalHeaderLabels({
        QStringLiteral("级别"), QStringLiteral("规则"), QStringLiteral("对象"), QStringLiteral("告警详情")
    });
    alertTable_->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    alertTable_->setEditTriggers(QAbstractItemView::NoEditTriggers);
    layout->addWidget(alertTable_, 1);
    return page;
}

QWidget* MainWindow::createVisionPage() {
    auto* page = new QWidget(this);
    auto* layout = new QVBoxLayout(page);
    layout->setSpacing(12);

    auto* disclaimer = new QLabel(
        QStringLiteral("合规提示：本结果由本地离线模型/精确余弦检索计算，仅用于评估自家商品图构图与场景丰富度，与平台识图算法无关。"),
        page);
    disclaimer->setWordWrap(true);
    disclaimer->setStyleSheet(QStringLiteral("background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; color: #334155;"));
    layout->addWidget(disclaimer);

    auto* btn = new QPushButton(QStringLiteral("选择本地商品图 / 自持参考截图评估"), page);
    btn->setStyleSheet(QStringLiteral("QPushButton { background: #0f172a; color: white; padding: 10px 16px; border-radius: 6px; }"));
    connect(btn, &QPushButton::clicked, this, &MainWindow::onSelectVisionImageClicked);
    layout->addWidget(btn);

    visionResultLabel_ = new QLabel(QStringLiteral("等待选择图片..."), page);
    visionResultLabel_->setStyleSheet(QStringLiteral("font-size: 14px; font-weight: 600; color: #0f172a;"));
    visionMetricsLabel_ = new QLabel(QStringLiteral(""), page);
    layout->addWidget(visionResultLabel_);
    layout->addWidget(visionMetricsLabel_);

    visionMatchesTable_ = new QTableWidget(0, 3, page);
    visionMatchesTable_->setHorizontalHeaderLabels({QStringLiteral("SKU ID"), QStringLiteral("相似度"), QStringLiteral("图片路径")});
    visionMatchesTable_->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    layout->addWidget(visionMatchesTable_, 1);

    return page;
}

QWidget* MainWindow::createSettingsPage() {
    auto* page = new QWidget(this);
    auto* layout = new QVBoxLayout(page);
    layout->setSpacing(14);

    auto* authBtn = new QPushButton(QStringLiteral("打开抖店 OAuth 授权（云端瘦中继换取令牌）"), page);
    authBtn->setStyleSheet(QStringLiteral("QPushButton { background: #0f172a; color: white; padding: 10px 16px; border-radius: 6px; }"));
    connect(authBtn, &QPushButton::clicked, this, &MainWindow::onAuthorizeShopClicked);
    layout->addWidget(authBtn);

    auto* licBtn = new QPushButton(QStringLiteral("执行本地 License 硬件指纹自检（2-of-3 容错）"), page);
    connect(licBtn, &QPushButton::clicked, this, &MainWindow::onVerifyLicenseClicked);
    layout->addWidget(licBtn);

    layout->addStretch();
    return page;
}

void MainWindow::onSimulateBurstClicked() {
    const int64_t now = QDateTime::currentSecsSinceEpoch();
    std::vector<hongguo::core::RawOrder> burst;
    for (int i = 0; i < 6; ++i) {
        burst.push_back({
            "HG-BURST-" + std::to_string(now) + "-" + std::to_string(i),
            "SHOP-01", "mall", "", "hongguo_search_same", "", "hongguo",
            198.0, 0.0, 1, "SKU-DRESS-101", "碎花茶歇裙",
            hongguo::core::OrderStatus::PaidUnshipped, now - i * 180, now + 7200, now
        });
    }
    auto normalized = resolver_.normalizeBatch(burst);
    orders_.insert(orders_.end(), normalized.begin(), normalized.end());
    dbWriter_->enqueueUpsertOrders(normalized);
    refreshDashboardMetrics();
}

void MainWindow::refreshDashboardMetrics() {
    const int64_t now = QDateTime::currentSecsSinceEpoch();
    auto metrics = hongguo::core::MetricCalculator::calculateChannelMetrics(
        orders_, now, {{hongguo::core::Channel::Hongguo, 2.5}});

    channelTable_->setRowCount(static_cast<int>(metrics.size()));
    for (int r = 0; r < static_cast<int>(metrics.size()); ++r) {
        const auto& m = metrics[r];
        channelTable_->setItem(r, 0, new QTableWidgetItem(QString::fromStdString(hongguo::core::channelToLabel(m.channel))));
        channelTable_->setItem(r, 1, new QTableWidgetItem(QString::number(m.gmvNet, 'f', 2)));
        channelTable_->setItem(r, 2, new QTableWidgetItem(QString::number(m.validCount)));
        channelTable_->setItem(r, 3, new QTableWidgetItem(QString::number(m.aov, 'f', 2)));
        channelTable_->setItem(r, 4, new QTableWidgetItem(QString::number(m.refundRate * 100.0, 'f', 1) + "%"));
        channelTable_->setItem(r, 5, new QTableWidgetItem(QString::number(m.shipTimeoutRiskCount)));

        if (m.channel == hongguo::core::Channel::Hongguo) {
            kpiGmvLabel_->setText(QStringLiteral("¥") + QString::number(m.gmvNet, 'f', 2));
            kpiOrdersLabel_->setText(QString::number(m.validCount) + QStringLiteral(" 单"));
            kpiRiskLabel_->setText(QString::number(m.shipTimeoutRiskCount) + QStringLiteral(" 笔"));
            kpiBurstLabel_->setText(QString::number(m.burstIndex, 'f', 2) + QStringLiteral("x"));
        }
    }

    auto alerts = hongguo::core::AlertEngine::evaluate(
        "SHOP-01", "默认店铺", 4.82, 4.85, metrics, skus_,
        hongguo::core::AlertEngine::defaultRules(), {}, now,
        QDateTime::currentDateTime().time().hour(), true);

    alertTable_->setRowCount(static_cast<int>(alerts.size()));
    for (int r = 0; r < static_cast<int>(alerts.size()); ++r) {
        const auto& a = alerts[r];
        alertTable_->setItem(r, 0, new QTableWidgetItem(a.level == hongguo::core::AlertLevel::Critical ? QStringLiteral("严重") : QStringLiteral("提醒")));
        alertTable_->setItem(r, 1, new QTableWidgetItem(QString::fromStdString(a.ruleId)));
        alertTable_->setItem(r, 2, new QTableWidgetItem(QString::fromStdString(a.subject)));
        alertTable_->setItem(r, 3, new QTableWidgetItem(QString::fromStdString(a.detail)));
    }
}

void MainWindow::onSelectVisionImageClicked() {
    const QString path = QFileDialog::getOpenFileName(
        this, QStringLiteral("选择商品图或剧集截图"), QString(),
        QStringLiteral("Images (*.png *.jpg *.jpeg *.webp)"));
    if (path.isEmpty()) return;

    QImage img(path);
    if (img.isNull()) {
        QMessageBox::warning(this, QStringLiteral("提示"), QStringLiteral("无法解码所选图片"));
        return;
    }

    const auto st = hongguo::infra::OnnxClipEmbedder::analyzeImageStructure(img);
    const QString kindText = st.kind == hongguo::core::ImageKind::WhiteBg
        ? QStringLiteral("白底图（建议补充生活使用场景副图）")
        : st.kind == hongguo::core::ImageKind::FlatLay
            ? QStringLiteral("纯平铺图（场景信息较弱）")
            : QStringLiteral("生活场景图（构图与语境丰富）");

    visionResultLabel_->setText(QStringLiteral("结构判定：") + kindText);
    visionMetricsLabel_->setText(
        QStringLiteral("边缘纯白占比 %1% · 前景覆盖 %2% · 边缘密度 %3 · 色阶熵 %4")
            .arg(st.borderWhitenessRatio * 100.0, 0, 'f', 1)
            .arg(st.foregroundCoverage * 100.0, 0, 'f', 1)
            .arg(st.edgeDensity, 0, 'f', 3)
            .arg(st.colorEntropy, 0, 'f', 3));

    const auto emb = embedder_.embed(img);
    visionIndex_.add("LOCAL-QUERY-SAMPLE", path.toStdString(), st.kind, emb);
    const auto matches = visionIndex_.query(emb, 5, -1.0f);

    visionMatchesTable_->setRowCount(static_cast<int>(matches.size()));
    for (int r = 0; r < static_cast<int>(matches.size()); ++r) {
        visionMatchesTable_->setItem(r, 0, new QTableWidgetItem(QString::fromStdString(matches[r].skuId)));
        visionMatchesTable_->setItem(r, 1, new QTableWidgetItem(QString::number(matches[r].score, 'f', 3)));
        visionMatchesTable_->setItem(r, 2, new QTableWidgetItem(QString::fromStdString(matches[r].imagePath)));
    }
}

void MainWindow::onAuthorizeShopClicked() {
    oauthFlow_->startAuthorize(QStringLiteral("DEMO_APP_KEY"));
}

void MainWindow::onVerifyLicenseClicked() {
    const hongguo::core::LicensePayload sample{"MB-01", "DISK-02", "CPU-03", "2027-11-16", "pro", 5};
    const std::string key = hongguo::core::LicenseValidator::sign(sample, "hongguo-v2-secret");
    const auto res = hongguo::core::LicenseValidator::verify(
        key, "MB-01", "DISK-REPLACED", "CPU-03", "hongguo-v2-secret", "2026-11-17");

    QMessageBox::information(
        this, QStringLiteral("License 自检"),
        res.valid ? QStringLiteral("授权有效（2/3 硬件指纹匹配，剩余 %1 天）").arg(res.daysRemaining)
                  : QStringLiteral("授权校验失败"));
}

} // namespace hongguo::ui
