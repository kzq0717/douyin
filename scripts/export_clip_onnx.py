#!/usr/bin/env python3
"""
Export CLIP ViT-B/32 Vision Encoder to ONNX (FP32 + INT8 quantized)
and precompute 4 zero-shot anchor text embeddings for white-bg/scene classification.

Usage:
  pip install torch transformers onnx onnxruntime
  python scripts/export_clip_onnx.py --output-dir desktop/HongguoTool/resources/models
"""

import argparse
import json
from pathlib import Path
import torch
from transformers import CLIPModel, CLIPProcessor
from onnxruntime.quantization import QuantType, quantize_dynamic


class VisionTowerWrapper(torch.nn.Module):
    def __init__(self, clip_model: CLIPModel):
        super().__init__()
        self.vision_model = clip_model.vision_model
        self.visual_projection = clip_model.visual_projection

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        outputs = self.vision_model(pixel_values=pixel_values)
        pooled = outputs.pooler_output
        embeds = self.visual_projection(pooled)
        return torch.nn.functional.normalize(embeds, p=2, dim=-1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-id", default="openai/clip-vit-base-patch32")
    parser.add_argument("--output-dir", default="desktop/HongguoTool/resources/models")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading {args.model_id}...")
    model = CLIPModel.from_pretrained(args.model_id)
    processor = CLIPProcessor.from_pretrained(args.model_id)
    model.eval()

    wrapper = VisionTowerWrapper(model)
    wrapper.eval()

    dummy_input = torch.randn(1, 3, 224, 224, dtype=torch.float32)
    fp32_path = out_dir / "clip_vit_b32_vision_fp32.onnx"
    int8_path = out_dir / "clip_vit_b32_vision_int8.onnx"

    print(f"Exporting ONNX FP32 -> {fp32_path}")
    torch.onnx.export(
        wrapper,
        dummy_input,
        str(fp32_path),
        input_names=["pixel_values"],
        output_names=["image_embeds"],
        dynamic_axes={"pixel_values": {0: "batch"}, "image_embeds": {0: "batch"}},
        opset_version=14,
    )

    print(f"Quantizing dynamic INT8 -> {int8_path}")
    quantize_dynamic(
        model_input=str(fp32_path),
        model_output=str(int8_path),
        weight_type=QuantType.QInt8,
    )

    # Precompute 4 offline text anchors (0 runtime text-encoder cost on client)
    anchors = {
        "white_bg": "ecommerce product photo isolated on pure solid white studio background",
        "flat_lay": "overhead flat lay product photography on clean plain wooden tabletop",
        "lifestyle_wear": "person wearing apparel in natural outdoor sunlight daily lifestyle scene",
        "lifestyle_home": "home decor or kitchenware item placed in warm cozy living room interior",
    }
    text_inputs = processor(text=list(anchors.values()), return_tensors="pt", padding=True)
    with torch.no_grad():
        text_feats = model.get_text_features(**text_inputs)
        text_feats = torch.nn.functional.normalize(text_feats, p=2, dim=-1)

    anchor_payload = {
        key: text_feats[idx].cpu().tolist()
        for idx, key in enumerate(anchors.keys())
    }
    anchor_path = out_dir / "clip_text_anchors.json"
    anchor_path.write_text(json.dumps(anchor_payload, indent=2), encoding="utf-8")
    print(f"Saved text anchors -> {anchor_path}")
    print("Done.")


if __name__ == "__main__":
    main()
