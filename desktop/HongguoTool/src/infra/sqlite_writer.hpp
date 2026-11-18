#pragma once

#include "../core/types.hpp"
#include <QMutex>
#include <QObject>
#include <QQueue>
#include <QThread>
#include <QWaitCondition>
#include <functional>

namespace hongguo::infra {

/**
 * v2.0 Optimization: Single-Writer serialized SQLite engine.
 * Enables WAL mode + busy_timeout=5000ms and routes all writes through one worker thread
 * to eliminate SQLITE_BUSY under concurrent sync & UI actions.
 */
class SqliteWriter : public QObject {
    Q_OBJECT
public:
    explicit SqliteWriter(const QString& dbPath, QObject* parent = nullptr);
    ~SqliteWriter() override;

    bool start();
    void stop();

    void enqueueUpsertOrders(const std::vector<hongguo::core::NormalizedOrder>& orders);
    void enqueueUpdateCursor(const QString& jobName, const QString& shopId, const QString& cursorVal);

signals:
    void writeError(const QString& message);
    void ordersPersisted(int count);

private:
    void workerLoop();
    bool initSchema();

    QString dbPath_;
    QThread workerThread_;
    QMutex mutex_;
    QWaitCondition cv_;
    QQueue<std::function<void()>> queue_;
    bool stopping_{false};
};

} // namespace hongguo::infra
