#include "exact_cosine_index.hpp"
#include <algorithm>
#include <cmath>
#include <fstream>

namespace hongguo::core {

namespace {
float dotProductContiguous(const float* a, const float* b, size_t len) {
    float sum = 0.0f;
    for (size_t i = 0; i < len; ++i) {
        sum += a[i] * b[i];
    }
    return sum;
}
} // namespace

ExactCosineIndex::ExactCosineIndex(size_t dim) : dim_(dim) {}

void ExactCosineIndex::l2Normalize(std::vector<float>& vec) {
    double normSq = 0.0;
    for (float v : vec) {
        normSq += static_cast<double>(v) * static_cast<double>(v);
    }
    const double norm = std::sqrt(normSq);
    if (norm < 1e-12) {
        std::fill(vec.begin(), vec.end(), 0.0f);
        return;
    }
    const float invNorm = static_cast<float>(1.0 / norm);
    for (float& v : vec) {
        v *= invNorm;
    }
}

void ExactCosineIndex::add(const std::string& skuId,
                           const std::string& imagePath,
                           ImageKind kind,
                           std::vector<float> embedding) {
    if (embedding.size() != dim_) return;
    l2Normalize(embedding);

    for (size_t i = 0; i < meta_.size(); ++i) {
        if (meta_[i].skuId == skuId) {
            meta_[i].imagePath = imagePath;
            meta_[i].kind = kind;
            std::copy(embedding.begin(), embedding.end(), flatVectors_.begin() + static_cast<ptrdiff_t>(i * dim_));
            return;
        }
    }

    meta_.push_back({skuId, imagePath, kind});
    flatVectors_.insert(flatVectors_.end(), embedding.begin(), embedding.end());
}

bool ExactCosineIndex::removeBySkuId(const std::string& skuId) {
    for (size_t i = 0; i < meta_.size(); ++i) {
        if (meta_[i].skuId == skuId) {
            const size_t last = meta_.size() - 1;
            if (i != last) {
                meta_[i] = std::move(meta_[last]);
                std::copy_n(flatVectors_.data() + last * dim_, dim_, flatVectors_.data() + i * dim_);
            }
            meta_.pop_back();
            flatVectors_.resize(meta_.size() * dim_);
            return true;
        }
    }
    return false;
}

std::vector<VisionMatch> ExactCosineIndex::query(std::vector<float> queryEmbedding,
                                                 size_t topN,
                                                 float minScore) const {
    if (queryEmbedding.size() != dim_ || meta_.empty()) return {};
    l2Normalize(queryEmbedding);

    std::vector<VisionMatch> results;
    results.reserve(meta_.size());

    for (size_t i = 0; i < meta_.size(); ++i) {
        const float score = dotProductContiguous(queryEmbedding.data(), flatVectors_.data() + i * dim_, dim_);
        if (score >= minScore) {
            results.push_back({meta_[i].skuId, meta_[i].imagePath, meta_[i].kind, score});
        }
    }

    std::sort(results.begin(), results.end(),
              [](const VisionMatch& a, const VisionMatch& b) { return a.score > b.score; });

    if (results.size() > topN) {
        results.resize(topN);
    }
    return results;
}

bool ExactCosineIndex::saveBinary(const std::string& filePath) const {
    std::ofstream ofs(filePath, std::ios::binary | std::ios::trunc);
    if (!ofs) return false;

    const uint32_t magic = 0x48475632; // "HGV2"
    const uint64_t count = meta_.size();
    const uint64_t dim = dim_;
    ofs.write(reinterpret_cast<const char*>(&magic), sizeof(magic));
    ofs.write(reinterpret_cast<const char*>(&count), sizeof(count));
    ofs.write(reinterpret_cast<const char*>(&dim), sizeof(dim));

    for (const auto& m : meta_) {
        const uint32_t skuLen = static_cast<uint32_t>(m.skuId.size());
        const uint32_t pathLen = static_cast<uint32_t>(m.imagePath.size());
        const uint8_t kindVal = static_cast<uint8_t>(m.kind);
        ofs.write(reinterpret_cast<const char*>(&skuLen), sizeof(skuLen));
        ofs.write(m.skuId.data(), skuLen);
        ofs.write(reinterpret_cast<const char*>(&pathLen), sizeof(pathLen));
        ofs.write(m.imagePath.data(), pathLen);
        ofs.write(reinterpret_cast<const char*>(&kindVal), sizeof(kindVal));
    }

    if (!flatVectors_.empty()) {
        ofs.write(reinterpret_cast<const char*>(flatVectors_.data()),
                  static_cast<std::streamsize>(flatVectors_.size() * sizeof(float)));
    }
    return ofs.good();
}

bool ExactCosineIndex::loadBinary(const std::string& filePath) {
    std::ifstream ifs(filePath, std::ios::binary);
    if (!ifs) return false;

    uint32_t magic = 0;
    uint64_t count = 0;
    uint64_t dim = 0;
    ifs.read(reinterpret_cast<char*>(&magic), sizeof(magic));
    ifs.read(reinterpret_cast<char*>(&count), sizeof(count));
    ifs.read(reinterpret_cast<char*>(&dim), sizeof(dim));
    if (magic != 0x48475632 || dim == 0 || count > 200000) return false;

    dim_ = static_cast<size_t>(dim);
    meta_.clear();
    meta_.reserve(static_cast<size_t>(count));

    for (uint64_t i = 0; i < count; ++i) {
        uint32_t skuLen = 0;
        uint32_t pathLen = 0;
        uint8_t kindVal = 0;
        ifs.read(reinterpret_cast<char*>(&skuLen), sizeof(skuLen));
        std::string skuId(skuLen, '\0');
        ifs.read(skuId.data(), skuLen);
        ifs.read(reinterpret_cast<char*>(&pathLen), sizeof(pathLen));
        std::string imgPath(pathLen, '\0');
        ifs.read(imgPath.data(), pathLen);
        ifs.read(reinterpret_cast<char*>(&kindVal), sizeof(kindVal));
        meta_.push_back({std::move(skuId), std::move(imgPath), static_cast<ImageKind>(kindVal)});
    }

    flatVectors_.resize(static_cast<size_t>(count * dim_));
    if (!flatVectors_.empty()) {
        ifs.read(reinterpret_cast<char*>(flatVectors_.data()),
                 static_cast<std::streamsize>(flatVectors_.size() * sizeof(float)));
    }
    return ifs.good();
}

} // namespace hongguo::core
