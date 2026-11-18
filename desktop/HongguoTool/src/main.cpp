#include "ui/main_window.hpp"

#include <QApplication>
#include <QDir>
#include <QStandardPaths>

int main(int argc, char* argv[]) {
    QApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("HongguoTool"));
    app.setOrganizationName(QStringLiteral("HongguoMerchantTools"));

    const QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dataDir);

    const QString relayUrl = qEnvironmentVariable("HONGGUO_RELAY_URL", QStringLiteral("http://127.0.0.1:3000"));
    hongguo::ui::MainWindow window(relayUrl);
    window.show();

    return app.exec();
}
