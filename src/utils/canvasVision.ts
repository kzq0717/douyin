import { analyzeImagePixels } from '../core/visionMath';
import type { ImageAnalysisMetrics } from '../core/types';

export interface BrowserVisionExtraction {
  embedding: number[];
  metrics: ImageAnalysisMetrics;
  width: number;
  height: number;
}

export async function extractImageFeaturesFromUrl(url: string): Promise<BrowserVisionExtraction> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`无法加载图片: ${url}`));
    el.src = url;
  });

  const targetSize = 128;
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D 上下文初始化失败');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(img, 0, 0, targetSize, targetSize);

  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  const { embedding, metrics } = analyzeImagePixels({
    width: targetSize,
    height: targetSize,
    rgba: imageData.data,
  });

  return {
    embedding,
    metrics,
    width: img.naturalWidth || targetSize,
    height: img.naturalHeight || targetSize,
  };
}
