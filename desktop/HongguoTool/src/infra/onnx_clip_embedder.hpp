#pragma once

#include "../core/types.hpp"
#include <QImage>
#include <QString>
#include <memory>
#include <vector>

namespace hongguo::infra {

/**
 * v2.0 Optimization: Uses QImage directly (zero OpenCV dependency) for CLIP preprocessing
 * (shortest-side 224 resize + 224x224 center crop + ImageNet normalize), plus ONNX Runtime C++
 * when HAVE_ONNXRUNTIME is enabled (gracefully falling back to 64-d spatial descriptor when model absent).
 */
class OnnxClipEmbedder {
public:
    OnnxClipEmbedder();
    ~OnnxClipEmbedder();

    bool loadModel(const QString& onnxModelPath);
    bool isModelLoaded() const { return modelLoaded_; }

    std::vector<float> embed(const QImage& image) const;
    static hongguo::core::ImageMetrics analyzeImageStructure(const QImage& image);

private:
    static std::vector<float> preprocessToNchwFloat(const QImage& image);
    static std::vector<float> fallbackSpatialDescriptor(const QImage& image);

    struct Impl;
    std::unique_ptr<Impl> impl_;
    bool modelLoaded_{false};
};

} // namespace hongguo::infra
