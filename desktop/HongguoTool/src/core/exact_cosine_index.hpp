#pragma once

#include "types.hpp"
#include <cstddef>
#include <string>
#include <vector>

namespace hongguo::core {

/**
 * v2.0 Optimization: Replaces FAISS HNSW for N <= 5,000 SKUs.
 * Stores contiguous L2-normalized Float32 embeddings (~10MB for 5,000 x 512d)
 * enabling <2ms exact cosine dot-product retrieval and O(1) swap-and-pop removal.
 */
class ExactCosineIndex {
public:
    explicit ExactCosineIndex(size_t dim = 512);

    static void l2Normalize(std::vector<float>& vec);

    void add(const std::string& skuId,
             const std::string& imagePath,
             ImageKind kind,
             std::vector<float> embedding);

    bool removeBySkuId(const std::string& skuId);

    std::vector<VisionMatch> query(std::vector<float> queryEmbedding,
                                   size_t topN = 10,
                                   float minScore = 0.45f) const;

    bool saveBinary(const std::string& filePath) const;
    bool loadBinary(const std::string& filePath);

    size_t size() const { return meta_.size(); }
    size_t dim() const { return dim_; }

private:
    struct EntryMeta {
        std::string skuId;
        std::string imagePath;
        ImageKind kind{ImageKind::LifestyleScene};
    };

    size_t dim_;
    std::vector<EntryMeta> meta_;
    std::vector<float> flatVectors_; // size == meta_.size() * dim_
};

} // namespace hongguo::core
