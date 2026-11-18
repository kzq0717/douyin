#include "sqlite_writer.hpp"

#include <QDateTime>
#include <QMutexLocker>
#include <QSqlDatabase>
#include <QSqlError>
#include <QSqlQuery>

namespace hongguo::infra {

SqliteWriter::SqliteWriter(const QString& dbPath, QObject* parent)
    : QObject(parent), dbPath_(dbPath) {}

SqliteWriter::~SqliteWriter() {
    stop();
}

bool SqliteWriter::start() {
    stopping_ = false;
    QObject::connect(&workerThread_, &QThread::started, [this]() { workerLoop(); });
    workerThread_.start();
    return true;
}

void SqliteWriter::stop() {
    {
        QMutexLocker locker(&mutex_);
        stopping_ = true;
        cv_.wakeAll();
    }
    if (workerThread_.isRunning()) {
        workerThread_.quit();
        workerThread_.wait(3000);
    }
}

void SqliteWriter::enqueueUpsertOrders(const std::vector<hongguo::core::NormalizedOrder>& orders) {
    QMutexLocker locker(&mutex_);
    queue_.enqueue([this, orders]() {
        QSqlDatabase db = QSqlDatabase::database(QStringLiteral("hongguo_writer"));
        if (!db.isOpen()) return;
        db.transaction();
        QSqlQuery q(db);
        q.prepare(QStringLiteral(
            "INSERT INTO orders (order_id, shop_id, channel, channel_raw, pay_amount, item_count, "
            "order_status, pay_time, ship_deadline, refund_amount, update_time) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(order_id) DO UPDATE SET "
            "channel=excluded.channel, channel_raw=excluded.channel_raw, "
            "order_status=excluded.order_status, refund_amount=excluded.refund_amount, "
            "update_time=excluded.update_time"
        ));

        for (const auto& o : orders) {
            q.addBindValue(QString::fromStdString(o.orderId));
            q.addBindValue(QString::fromStdString(o.shopId));
            q.addBindValue(QString::fromStdString(hongguo::core::channelToString(o.channel)));
            q.addBindValue(QString::fromStdString(o.channelRaw));
            q.addBindValue(o.payAmount);
            q.addBindValue(o.itemCount);
            q.addBindValue(static_cast<int>(o.status));
            q.addBindValue(o.payEpochSec);
            q.addBindValue(o.shipDeadlineEpochSec);
            q.addBindValue(o.refundAmount);
            q.addBindValue(o.updateEpochSec);
            if (!q.exec()) {
                emit writeError(q.lastError().text());
                db.rollback();
                return;
            }
        }
        db.commit();
        emit ordersPersisted(static_cast<int>(orders.size()));
    });
    cv_.wakeOne();
}

void SqliteWriter::enqueueUpdateCursor(const QString& jobName, const QString& shopId, const QString& cursorVal) {
    QMutexLocker locker(&mutex_);
    queue_.enqueue([this, jobName, shopId, cursorVal]() {
        QSqlDatabase db = QSqlDatabase::database(QStringLiteral("hongguo_writer"));
        if (!db.isOpen()) return;
        QSqlQuery q(db);
        q.prepare(QStringLiteral(
            "INSERT INTO sync_cursor (job_name, shop_id, cursor_value, updated_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(job_name, shop_id) DO UPDATE SET "
            "cursor_value=excluded.cursor_value, updated_at=excluded.updated_at"
        ));
        q.addBindValue(jobName);
        q.addBindValue(shopId);
        q.addBindValue(cursorVal);
        q.addBindValue(QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
        if (!q.exec()) {
            emit writeError(q.lastError().text());
        }
    });
    cv_.wakeOne();
}

void SqliteWriter::workerLoop() {
    {
        QSqlDatabase db = QSqlDatabase::addDatabase(QStringLiteral("QSQLITE"), QStringLiteral("hongguo_writer"));
        db.setDatabaseName(dbPath_);
        if (!db.open() || !initSchema()) {
            emit writeError(QStringLiteral("SQLite 初始化失败: ") + db.lastError().text());
            return;
        }
    }

    while (true) {
        std::function<void()> task;
        {
            QMutexLocker locker(&mutex_);
            while (queue_.isEmpty() && !stopping_) {
                cv_.wait(&mutex_);
            }
            if (stopping_ && queue_.isEmpty()) break;
            task = queue_.dequeue();
        }
        if (task) task();
    }

    QSqlDatabase::removeDatabase(QStringLiteral("hongguo_writer"));
}

bool SqliteWriter::initSchema() {
    QSqlDatabase db = QSqlDatabase::database(QStringLiteral("hongguo_writer"));
    QSqlQuery q(db);

    const QStringList statements = {
        QStringLiteral("PRAGMA journal_mode = WAL;"),
        QStringLiteral("PRAGMA synchronous = NORMAL;"),
        QStringLiteral("PRAGMA busy_timeout = 5000;"),
        QStringLiteral("CREATE TABLE IF NOT EXISTS shop ("
                       "shop_id TEXT PRIMARY KEY, shop_name TEXT NOT NULL, auth_status INTEGER DEFAULT 0, "
                       "token_expire TEXT, last_sync_at TEXT, created_at TEXT NOT NULL);"),
        QStringLiteral("CREATE TABLE IF NOT EXISTS orders ("
                       "order_id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, channel TEXT NOT NULL, "
                       "channel_raw TEXT, pay_amount REAL DEFAULT 0, item_count INTEGER DEFAULT 1, "
                       "order_status INTEGER NOT NULL, pay_time INTEGER, ship_deadline INTEGER, "
                       "refund_amount REAL DEFAULT 0, update_time INTEGER NOT NULL);"),
        QStringLiteral("CREATE INDEX IF NOT EXISTS idx_orders_shop_ch ON orders(shop_id, channel, pay_time);"),
        QStringLiteral("CREATE TABLE IF NOT EXISTS sync_cursor ("
                       "job_name TEXT NOT NULL, shop_id TEXT NOT NULL, cursor_value TEXT, updated_at TEXT, "
                       "PRIMARY KEY(job_name, shop_id));"),
        QStringLiteral("CREATE TABLE IF NOT EXISTS op_log ("
                       "id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id TEXT, op_type TEXT, "
                       "target_cnt INTEGER, plan_json TEXT, result_json TEXT, created_at TEXT NOT NULL);")
    };

    for (const QString& sql : statements) {
        if (!q.exec(sql)) return false;
    }
    return true;
}

} // namespace hongguo::infra
