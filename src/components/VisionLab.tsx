import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, ShieldCheck, Upload } from 'lucide-react';
import { queryTopSimilar } from '../core/visionMath';
import type {
  ImageAnalysisMetrics,
  SkuItem,
  VisionIndexEntry,
  VisionMatchResult,
} from '../core/types';
import { VISION_SAMPLE_LIBRARY } from '../data/seedData';
import { extractImageFeaturesFromUrl } from '../utils/canvasVision';

interface VisionLabProps {
  skus: SkuItem[];
}

export const VisionLab: React.FC<VisionLabProps> = ({ skus }) => {
  const [indexEntries, setIndexEntries] = useState<VisionIndexEntry[]>([]);
  const [indexing, setIndexing] = useState(true);
  const [selectedUrl, setSelectedUrl] = useState<string>(VISION_SAMPLE_LIBRARY[0].imagePath);
  const [selectedLabel, setSelectedLabel] = useState<string>(VISION_SAMPLE_LIBRARY[0].label);
  const [analyzing, setAnalyzing] = useState(false);
  const [metrics, setMetrics] = useState<ImageAnalysisMetrics | null>(null);
  const [matches, setMatches] = useState<VisionMatchResult[]>([]);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Build local exact-cosine vector index from SKU images in browser memory
  useEffect(() => {
    let cancelled = false;
    async function buildIndex() {
      setIndexing(true);
      const uniqueBySku: VisionIndexEntry[] = [];
      for (const sku of skus) {
        if (!sku.imgMain) continue;
        try {
          const extracted = await extractImageFeaturesFromUrl(sku.imgMain);
          uniqueBySku.push({
            skuId: sku.skuId,
            productTitle: sku.title,
            category: sku.category,
            imagePath: sku.imgMain,
            kind: extracted.metrics.kind,
            embedding: extracted.embedding,
          });
        } catch {
          // Skip unavailable image smoothly
        }
      }
      if (!cancelled) {
        setIndexEntries(uniqueBySku);
        setIndexing(false);
      }
    }
    buildIndex();
    return () => {
      cancelled = true;
    };
  }, [skus]);

  // Run pixel analysis + exact cosine search whenever query image or index updates
  useEffect(() => {
    let cancelled = false;
    async function runQuery() {
      if (!selectedUrl) return;
      setAnalyzing(true);
      setErrorMsg('');
      const start = performance.now();
      try {
        const res = await extractImageFeaturesFromUrl(selectedUrl);
        const topMatches =
          indexEntries.length > 0 ? queryTopSimilar(res.embedding, indexEntries, 5, -1) : [];
        const elapsed = Math.max(1, Math.round(performance.now() - start));
        if (!cancelled) {
          setMetrics(res.metrics);
          setMatches(topMatches);
          setLatencyMs(elapsed);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : '图像特征提取失败');
        }
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    }
    runQuery();
    return () => {
      cancelled = true;
    };
  }, [selectedUrl, indexEntries]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setSelectedUrl(objectUrl);
    setSelectedLabel(`本地上传：${file.name}`);
  };

  return (
    <div className="space-y-6">
      {/* Mandatory Compliance Banner (§7.1) */}
      <div className="rounded-xl border border-slate-200 bg-slate-100/80 px-5 py-3.5 text-xs text-slate-700 flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-slate-700 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="font-semibold text-slate-900">合规边界声明：</strong>
          本结果由本地/浏览器离线模型计算，仅用于评估自家商品图的构图、白底占比与场景丰富度，
          <strong>与平台识图算法无任何关联</strong>，不代表任何曝光、流量或成交结果承诺。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left: Sample / Upload + Structural Metrics */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">待评估输入图像</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                支持商家自持剧集参考帧或商品主图，图像不上传至任何云端服务器
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0">
              <Upload className="h-3.5 w-3.5" />
              上传图片
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
          </div>

          {/* Sample buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            {VISION_SAMPLE_LIBRARY.map((item) => {
              const active = selectedUrl === item.imagePath;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedUrl(item.imagePath);
                    setSelectedLabel(item.label);
                  }}
                  className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-900 truncate">{item.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500 truncate">{item.subtitle}</div>
                </button>
              );
            })}
          </div>

          {/* Preview Frame */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 aspect-4/3 flex items-center justify-center">
            {selectedUrl ? (
              <img
                src={selectedUrl}
                alt={selectedLabel}
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <ImageIcon className="h-8 w-8" />
                <span className="text-xs">暂无预览图</span>
              </div>
            )}
          </div>

          {errorMsg && <p className="text-xs text-rose-600">{errorMsg}</p>}

          {/* Real Pixel Metrics */}
          {metrics && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">图像结构判定</span>
                <span
                  className={`text-xs font-semibold ${
                    metrics.kind === 'white_bg'
                      ? 'text-amber-700'
                      : metrics.kind === 'flat_lay'
                        ? 'text-slate-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {metrics.kindLabel}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-slate-500">边缘纯白占比</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {(metrics.borderWhitenessRatio * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-slate-500">前景主体覆盖率</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {(metrics.foregroundCoverage * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-slate-500">边缘梯度密度</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {metrics.edgeDensity.toFixed(3)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-slate-500">亮度色阶熵</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {metrics.colorEntropy.toFixed(3)}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 leading-relaxed pt-1">
                {metrics.suggestions.map((tip, i) => (
                  <p key={i}>• {tip}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Top-N Exact Cosine Matches */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                本地向量库 Top-N 相似商品检索（精确余弦点积）
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                v2.0 优化验证：N ≤ 5,000 时替代 FAISS HNSW，100% 精确召回、无墓碑删除开销
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {indexing || analyzing
                ? '计算向量中...'
                : `库内 ${indexEntries.length} 图 · 检索耗时 ${latencyMs} ms`}
            </span>
          </div>

          {matches.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              {indexing ? '正在为本地 SKU 建库...' : '当前阈值（0.35）下无匹配商品，可更换参考图测试。'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {matches.map((match, idx) => (
                <div
                  key={`${match.skuId}-${idx}`}
                  className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img
                      src={match.imagePath}
                      alt={match.productTitle}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        #{idx + 1} · {match.productTitle}
                      </h3>
                      <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums shrink-0">
                        cos {match.score.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {match.skuId} · {match.category} ·{' '}
                      {match.kind === 'white_bg'
                        ? '白底图'
                        : match.kind === 'flat_lay'
                          ? '平铺图'
                          : '场景图'}
                    </p>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-slate-900 transition-all"
                        style={{
                          width: `${Math.max(4, Math.min(100, Math.round(((match.score + 1) / 2) * 100)))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
