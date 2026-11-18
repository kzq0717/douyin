#include "license_validator.hpp"
#include <cstdio>
#include <ctime>
#include <iomanip>
#include <sstream>

namespace hongguo::core {

namespace {
std::string fnvSignature(const std::string& data, const std::string& secret) {
    const std::string combined = secret + "::" + data + "::" + std::to_string(secret.size());
    uint32_t h1 = 0x811c9dc5u;
    for (unsigned char c : combined) {
        h1 ^= c;
        h1 *= 0x01000193u;
    }
    uint32_t h2 = 0x9e3779b9u;
    for (auto it = combined.rbegin(); it != combined.rend(); ++it) {
        h2 ^= static_cast<unsigned char>(*it);
        h2 *= 0x85ebca6bu;
    }
    std::ostringstream oss;
    oss << std::hex << std::setfill('0') << std::setw(8) << h1 << std::setw(8) << h2;
    return oss.str();
}

bool parseYmdToDays(const std::string& ymd, int64_t& outDays) {
    int y = 0, m = 0, d = 0;
    if (std::sscanf(ymd.c_str(), "%d-%d-%d", &y, &m, &d) != 3) return false;
    std::tm tmVal{};
    tmVal.tm_year = y - 1900;
    tmVal.tm_mon = m - 1;
    tmVal.tm_mday = d;
    tmVal.tm_hour = 12;
    std::time_t t = std::mktime(&tmVal);
    if (t == -1) return false;
    outDays = static_cast<int64_t>(t) / 86400;
    return true;
}

std::string serializePayload(const LicensePayload& p) {
    return p.boardHash + "|" + p.diskHash + "|" + p.cpuHash + "|" +
           p.expireDate + "|" + p.plan + "|" + std::to_string(p.maxShops);
}

bool deserializePayload(const std::string& raw, LicensePayload& out) {
    std::vector<std::string> parts;
    std::stringstream ss(raw);
    std::string item;
    while (std::getline(ss, item, '|')) {
        parts.push_back(item);
    }
    if (parts.size() != 6) return false;
    out.boardHash = parts[0];
    out.diskHash = parts[1];
    out.cpuHash = parts[2];
    out.expireDate = parts[3];
    out.plan = parts[4];
    out.maxShops = std::stoi(parts[5]);
    return true;
}
} // namespace

std::string LicenseValidator::sign(const LicensePayload& payload, const std::string& secret) {
    const std::string body = serializePayload(payload);
    return body + "." + fnvSignature(body, secret);
}

LicenseCheckResult LicenseValidator::verify(
    const std::string& licenseKey,
    const std::string& localBoardHash,
    const std::string& localDiskHash,
    const std::string& localCpuHash,
    const std::string& secret,
    const std::string& todayDateYmd) {
    LicenseCheckResult res;
    const size_t dotPos = licenseKey.rfind('.');
    if (dotPos == std::string::npos) return res;

    const std::string body = licenseKey.substr(0, dotPos);
    const std::string sig = licenseKey.substr(dotPos + 1);
    if (sig != fnvSignature(body, secret)) {
        res.status = LicenseStatus::InvalidSignature;
        return res;
    }

    if (!deserializePayload(body, res.payload)) {
        res.status = LicenseStatus::InvalidSignature;
        return res;
    }

    int matches = 0;
    if (!res.payload.boardHash.empty() && res.payload.boardHash == localBoardHash) matches++;
    if (!res.payload.diskHash.empty() && res.payload.diskHash == localDiskHash) matches++;
    if (!res.payload.cpuHash.empty() && res.payload.cpuHash == localCpuHash) matches++;
    res.matchedHardwareCount = matches;

    if (matches < 2) {
        res.status = LicenseStatus::MachineMismatch;
        return res;
    }

    int64_t expireDays = 0;
    int64_t todayDays = 0;
    if (!parseYmdToDays(res.payload.expireDate, expireDays) ||
        !parseYmdToDays(todayDateYmd, todayDays)) {
        res.status = LicenseStatus::InvalidSignature;
        return res;
    }

    res.daysRemaining = static_cast<int>(expireDays - todayDays);
    if (res.daysRemaining >= 0) {
        res.valid = true;
        res.status = LicenseStatus::Active;
    } else if (res.daysRemaining >= -7) {
        res.valid = true;
        res.status = LicenseStatus::GraceReadonly;
    } else {
        res.valid = false;
        res.status = LicenseStatus::Expired;
    }
    return res;
}

} // namespace hongguo::core
