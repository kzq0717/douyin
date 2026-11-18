#include "onnx_clip_embedder.hpp"
#include "../core/exact_cosine_index.hpp"

#include <QFileInfo>
#include <algorithm>
#include <array>
#include <cmath>

#ifdef HAVE_ONNXRUNTIME
#include <onnxruntime_cxx_api.h>
#endif

namespace hongguo::infra {

struct OnnxClipEmbedder::Impl {
#ifdef HAVE_ONNXRUNTIME
    Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "HongguoClip"};
    std::unique_ptr<Ort::Session> session;
#endif
};

OnnxClipEmbedder::OnnxClipEmbedder() : impl_(std::make_unique<Impl>()) {}
OnnxClipEmbedder::~OnnxClipEmbedder() = default;

bool OnnxClipEmbedder::loadModel(const QString& onnxModelPath) {
    if (!QFileInfo::exists(onnxModelPath)) {
        modelLoaded_ = false;
        return false;
    }

#ifdef HAVE_ONNXRUNTIME
    try {
        Ort::SessionOptions opts;
        opts.SetIntraOpNumThreads(4);
        opts.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
#ifdef _WIN32
        std::wstring wpath = onnxModelPath.toStdWString();
        impl_->session = std::make_unique<Ort::Session>(impl_->env, wpath.c_str(), opts);
#else
        std::string spath = onnxModelPath.toStdString();
        impl_->session = std::make_unique<Ort::Session>(impl_->env, spath.c_str(), opts);
#endif
        modelLoaded_ = true;
        return true;
    } catch (...) {
        modelLoaded_ = false;
        return false;
    }
#else
    Q_UNUSED(onnxModelPath);
    modelLoaded_ = false;
    return false;
#endif
}

std::vector<float> OnnxClipEmbedder::preprocessToNchwFloat(const QImage& image) {
    constexpr int kTarget = 224;
    constexpr float kMean[3] = {0.48145466f, 0.4578275f, 0.40821073f};
    constexpr float kStd[3] = {0.26862954f, 0.26130258f, 0.27577711f};

    QImage rgb = image.convertToFormat(QImage::Format_RGB888);
    const int w = rgb.width();
    const int h = rgb.height();
    QImage scaled = (w < h)
        ? rgb.scaledToWidth(kTarget, Qt::SmoothTransformation)
        : rgb.scaledToHeight(kTarget, Qt::SmoothTransformation);

    const int cropX = std::max(0, (scaled.width() - kTarget) / 2);
    const int cropY = std::max(0, (scaled.height() - kTarget) / 2);
    QImage cropped = scaled.copy(cropX, cropY, kTarget, kTarget);

    std::vector<float> tensor(3 * kTarget * kTarget, 0.0f);
    for (int y = 0; y < kTarget; ++y) {
        const uchar* row = cropped.constScanLine(y);
        for (int x = 0; x < kTarget; ++x) {
            const float r = row[x * 3 + 0] / 255.0f;
            const float g = row[x * 3 + 1] / 255.0f;
            const float b = row[x * 3 + 2] / 255.0f;
            const int idx = y * kTarget + x;
            tensor[0 * kTarget * kTarget + idx] = (r - kMean[0]) / kStd[0];
            tensor[1 * kTarget * kTarget + idx] = (g - kMean[1]) / kStd[1];
            tensor[2 * kTarget * kTarget + idx] = (b - kMean[2]) / kStd[2];
        }
    }
    return tensor;
}

std::vector<float> OnnxClipEmbedder::fallbackSpatialDescriptor(const QImage& image) {
    QImage img = image.scaled(128, 128, Qt::IgnoreAspectRatio, Qt::SmoothTransformation)
                      .convertToFormat(QImage::Format_RGB888);
    std::vector<float> vec(512, 0.0f);
    // 4x4 RGB means (48) + 16 lum histogram bins (16) -> padded to 512d for structural continuity
    std::array<double, 48> gridSums{};
    std::array<int, 16> gridCounts{};
    std::array<int, 16> lumBins{};

    for (int y = 0; y < 128; ++y) {
        const int gy = y / 32;
        const uchar* row = img.constScanLine(y);
        for (int x = 0; x < 128; ++x) {
            const int gx = x / 32;
            const int cell = gy * 4 + gx;
            const double r = row[x * 3 + 0] / 255.0;
            const double g = row[x * 3 + 1] / 255.0;
            const double b = row[x * 3 + 2] / 255.0;
            gridSums[cell * 3 + 0] += r;
            gridSums[cell * 3 + 1] += g;
            gridSums[cell * 3 + 2] += b;
            gridCounts[cell] += 1;

            const double lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const int bin = std::min(15, std::max(0, static_cast<int>(lum * 16.0)));
            lumBins[bin] += 1;
        }
    }
    for (int c = 0; c < 16; ++c) {
        const double cnt = std::max(1, gridCounts[c]);
        vec[c * 3 + 0] = static_cast<float>(gridSums[c * 3 + 0] / cnt - 0.5);
        vec[c * 3 + 1] = static_cast<float>(gridSums[c * 3 + 1] / cnt - 0.5);
        vec[c * 3 + 2] = static_cast<float>(gridSums[c * 3 + 2] / cnt - 0.5);
    }
    for (int b = 0; b < 16; ++b) {
        vec[48 + b] = static_cast<float>(lumBins[b] / 16384.0);
    }
    hongguo::core::ExactCosineIndex::l2Normalize(vec);
    return vec;
}

std::vector<float> OnnxClipEmbedder::embed(const QImage& image) const {
    if (image.isNull()) return std::vector<float>(512, 0.0f);

#ifdef HAVE_ONNXRUNTIME
    if (modelLoaded_ && impl_->session) {
        std::vector<float> inputTensorData = preprocessToNchwFloat(image);
        std::array<int64_t, 4> inputShape{1, 3, 224, 224};

        Ort::MemoryInfo memInfo = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
        Ort::Value inputTensor = Ort::Value::CreateTensor<float>(
            memInfo, inputTensorData.data(), inputTensorData.size(), inputShape.data(), inputShape.size());

        const char* inputNames[] = {"pixel_values"};
        const char* outputNames[] = {"image_embeds"};
        auto outputs = impl_->session->Run(
            Ort::RunOptions{nullptr}, inputNames, &inputTensor, 1, outputNames, 1);

        const float* outPtr = outputs[0].GetTensorData<float>();
        std::vector<float> embedding(outPtr, outPtr + 512);
        hongguo::core::ExactCosineIndex::l2Normalize(embedding);
        return embedding;
    }
#endif
    return fallbackSpatialDescriptor(image);
}

hongguo::core::ImageMetrics OnnxClipEmbedder::analyzeImageStructure(const QImage& image) {
    hongguo::core::ImageMetrics m;
    if (image.isNull()) return m;

    QImage img = image.scaled(128, 128, Qt::IgnoreAspectRatio, Qt::SmoothTransformation)
                      .convertToFormat(QImage::Format_RGB888);

    constexpr int W = 128;
    constexpr int H = 128;
    constexpr int border = 10; // ~8%

    int borderCount = 0;
    int whiteBorder = 0;
    int nonWhite = 0;
    double edgeSum = 0.0;
    int edgeCount = 0;
    std::array<int, 16> lumBins{};

    for (int y = 0; y < H; ++y) {
        const uchar* row = img.constScanLine(y);
        const uchar* prevRow = y > 0 ? img.constScanLine(y - 1) : row;
        for (int x = 0; x < W; ++x) {
            const int r = row[x * 3 + 0];
            const int g = row[x * 3 + 1];
            const int b = row[x * 3 + 2];
            const int maxC = std::max({r, g, b});
            const int minC = std::min({r, g, b});
            const bool nearWhite = (r >= 235 && g >= 235 && b >= 235 && (maxC - minC) <= 18);

            if (!nearWhite) nonWhite++;
            if (x < border || x >= W - border || y < border || y >= H - border) {
                borderCount++;
                if (nearWhite) whiteBorder++;
            }

            const double lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
            lumBins[std::min(15, std::max(0, static_cast<int>(lum * 16.0)))]++;

            if (x > 0 && y > 0) {
                const int dx = std::abs(r - row[(x - 1) * 3 + 0]) +
                               std::abs(g - row[(x - 1) * 3 + 1]) +
                               std::abs(b - row[(x - 1) * 3 + 2]);
                const int dy = std::abs(r - prevRow[x * 3 + 0]) +
                               std::abs(g - prevRow[x * 3 + 1]) +
                               std::abs(b - prevRow[x * 3 + 2]);
                edgeSum += (dx + dy) / (255.0 * 6.0);
                edgeCount++;
            }
        }
    }

    m.borderWhitenessRatio = static_cast<double>(whiteBorder) / std::max(1, borderCount);
    m.foregroundCoverage = static_cast<double>(nonWhite) / (W * H);
    m.edgeDensity = std::min(1.0, (edgeSum / std::max(1, edgeCount)) * 4.5);

    double entropy = 0.0;
    for (int cnt : lumBins) {
        const double p = static_cast<double>(cnt) / (W * H);
        if (p > 1e-6) entropy -= p * std::log2(p);
    }
    m.colorEntropy = std::min(1.0, entropy / 4.0);

    if (m.borderWhitenessRatio >= 0.65 && m.foregroundCoverage <= 0.72) {
        m.kind = hongguo::core::ImageKind::WhiteBg;
    } else if (m.edgeDensity <= 0.24 && m.colorEntropy <= 0.76) {
        m.kind = hongguo::core::ImageKind::FlatLay;
    } else {
        m.kind = hongguo::core::ImageKind::LifestyleScene;
    }
    return m;
}

} // namespace hongguo::infra
