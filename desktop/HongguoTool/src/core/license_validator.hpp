#pragma once

#include "types.hpp"
#include <string>

namespace hongguo::core {

enum class LicenseStatus {
    Active,
    GraceReadonly,
    Expired,
    InvalidSignature,
    MachineMismatch
};

struct LicenseCheckResult {
    bool valid{false};
    LicenseStatus status{LicenseStatus::InvalidSignature};
    int matchedHardwareCount{0};
    int daysRemaining{0};
    LicensePayload payload;
};

class LicenseValidator {
public:
    static std::string sign(const LicensePayload& payload, const std::string& secret);

    static LicenseCheckResult verify(
        const std::string& licenseKey,
        const std::string& localBoardHash,
        const std::string& localDiskHash,
        const std::string& localCpuHash,
        const std::string& secret,
        const std::string& todayDateYmd);
};

} // namespace hongguo::core
