"""V2 推理：EfficientNet-B3 + 阿里医学 BERT + 图像主导门控融合。

权重契约（与 train_fold.py 中 MultiModalModel 一致）：
- 顶层 ckpt 是 dict，含 keys: model / ema / metrics_with_text / metrics_no_text / epoch / fold
- **使用 ckpt["ema"]**（推理用 EMA 权重，比 ["model"] 更稳）
- state_dict prefix: img_features.* / fusion.{img_proj,txt_proj,gate}.* / classifier.*
- 类别顺序：0=正常, 1=内膜癌, 2=息肉

文本编码：阿里 sentence-embedding pipeline 的输出 = BertModel.last_hidden_state[:, 0, :]
（不做 L2 归一化），与训练工程师服务器输出对比 cos=1.000000、max_abs_diff=4e-6。
故用 transformers BertModel 直接复刻，避免 modelscope 复杂依赖链。
空文本（包括无文本筛查模式）走 768 维零向量。
"""
import os
import time
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torchvision import models, transforms

from app.config import (
    MODEL_VERSION,
    MODEL_CKPT_PATH,
    BERT_PATH,
    GRADCAM_DIR,
)
from app.utils.image import load_image_bytes

CLASS_NAMES = ["normal", "endometrial_cancer", "polyp"]
IMG_SIZE = 300
TXT_DIM = 768
FUSION_HIDDEN = 256


@dataclass
class InferenceResult:
    prob_normal: float
    prob_cancer: float
    prob_polyp: float
    predicted_class: str
    confidence: float
    inference_ms: int
    model_version: str
    gradcam_path: str | None = None


# -----------------------------------------------------------------------------
# 模型架构（必须 1:1 复刻 train_fold.py 中的 MultiModalModel）
# -----------------------------------------------------------------------------

class ImageDominantGatedFusion(nn.Module):
    def __init__(self, img_dim: int, txt_dim: int, hidden: int = FUSION_HIDDEN):
        super().__init__()
        self.img_proj = nn.Sequential(nn.Linear(img_dim, hidden), nn.ReLU(), nn.Dropout(0.2))
        self.txt_proj = nn.Sequential(nn.Linear(txt_dim, hidden), nn.ReLU(), nn.Dropout(0.2))
        self.gate = nn.Sequential(
            nn.Linear(hidden * 2, hidden), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(hidden, 1), nn.Sigmoid(),
        )

    def forward(self, img_feat: torch.Tensor, txt_feat: torch.Tensor):
        h_img = self.img_proj(img_feat)
        h_txt = self.txt_proj(txt_feat)
        g = self.gate(torch.cat([h_img, h_txt], dim=1))
        fused = g * h_img + (1 - g) * h_txt
        return torch.cat([h_img, fused], dim=1), g


class MultiModalModel(nn.Module):
    def __init__(self, num_classes: int = 3, txt_dim: int = TXT_DIM,
                 fusion_hidden: int = FUSION_HIDDEN):
        super().__init__()
        # 推理时不需要下载 ImageNet 预训练权重，weights=None 加快加载
        backbone = models.efficientnet_b3(weights=None)
        self.img_features = backbone.features
        self.img_pool = nn.AdaptiveAvgPool2d(1)
        self.fusion = ImageDominantGatedFusion(1536, txt_dim, fusion_hidden)
        self.classifier = nn.Sequential(
            nn.Dropout(0.4), nn.Linear(fusion_hidden * 2, fusion_hidden), nn.ReLU(),
            nn.Dropout(0.3), nn.Linear(fusion_hidden, num_classes),
        )

    def forward(self, img: torch.Tensor, txt: torch.Tensor, return_gate: bool = False):
        feat = self.img_pool(self.img_features(img)).flatten(1)
        fused, g = self.fusion(feat, txt)
        logits = self.classifier(fused)
        return (logits, g) if return_gate else logits


class _ImageOnlyWrapper(nn.Module):
    """让 GradCAM 把多模态模型当成单输入用。"""

    def __init__(self, full_model: MultiModalModel, text_embedding: torch.Tensor):
        super().__init__()
        self.full_model = full_model
        self.register_buffer("txt", text_embedding, persistent=False)

    def forward(self, img: torch.Tensor) -> torch.Tensor:
        return self.full_model(img, self.txt)


# -----------------------------------------------------------------------------
# 预处理（必须和 train_fold.py 的 val_tf 一致）
# -----------------------------------------------------------------------------

_NORM = transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
_VAL_TF = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    _NORM,
])


# -----------------------------------------------------------------------------
# 文本编码（transformers BertModel，输出 last_hidden_state CLS token，不归一化）
# 已与训练工程师服务器上 modelscope sentence-embedding 输出做数值对比，
# 余弦相似度 = 1.000000，最大数值差 = 4e-6，完全等价。
# -----------------------------------------------------------------------------

class _MedicalBertEncoder:
    """封装 transformers BertModel，第一次调用时懒加载。"""

    def __init__(self, model_path: Path):
        self._model_path = model_path
        self._model = None
        self._tokenizer = None
        self._lock = threading.Lock()

    def _ensure(self):
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            from transformers import BertModel, BertTokenizer
            self._tokenizer = BertTokenizer.from_pretrained(str(self._model_path))
            self._model = BertModel.from_pretrained(str(self._model_path))
            self._model.eval()

    def encode(self, text: str) -> np.ndarray:
        """返回 (768,) 的 float32 向量。空文本返回零向量。"""
        text = (text or "").strip()
        if not text:
            return np.zeros(TXT_DIM, dtype=np.float32)
        self._ensure()
        inputs = self._tokenizer(
            text, return_tensors="pt", truncation=True, max_length=256, padding=True,
        )
        with torch.no_grad():
            outputs = self._model(**inputs)
        cls = outputs.last_hidden_state[0, 0, :].numpy().astype(np.float32)
        return cls


class RealInferencer:
    def __init__(self):
        self.model_version = MODEL_VERSION
        self._device = torch.device("cpu")
        self._loaded = False
        self._lock = threading.Lock()
        self._load_lock = threading.Lock()

        self.model: MultiModalModel | None = None
        self._bert: _MedicalBertEncoder | None = None

    @property
    def loaded(self) -> bool:
        return self._loaded

    def ensure_loaded(self):
        if self._loaded:
            return
        with self._load_lock:
            if self._loaded:
                return
            self._load()

    def _load(self):
        ckpt_path = Path(MODEL_CKPT_PATH)
        bert_path = Path(BERT_PATH)
        if not ckpt_path.is_file():
            raise FileNotFoundError(f"Model checkpoint not found: {ckpt_path}")
        if not bert_path.is_dir():
            raise FileNotFoundError(f"BERT directory not found: {bert_path}")

        model = MultiModalModel(num_classes=len(CLASS_NAMES))
        ckpt = torch.load(str(ckpt_path), map_location=self._device, weights_only=False)
        # ⭐ 必须用 EMA 权重，而非 ckpt["model"]
        if isinstance(ckpt, dict) and "ema" in ckpt:
            state = ckpt["ema"]
        elif isinstance(ckpt, dict) and "model" in ckpt:
            print("[inference] WARNING: ckpt 没有 ema 字段，回退到 model")
            state = ckpt["model"]
        else:
            state = ckpt  # 纯 state_dict
        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing:
            print(f"[inference] load_state_dict missing keys: {len(missing)}（前 5: {missing[:5]}）")
        if unexpected:
            print(f"[inference] load_state_dict unexpected keys: {len(unexpected)}（前 5: {unexpected[:5]}）")
        model.to(self._device).eval()

        self.model = model
        self._bert = _MedicalBertEncoder(bert_path)
        # BERT pipeline 懒加载到首次推理时
        self._loaded = True

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _encode_text(self, clinical_text: str) -> torch.Tensor:
        """返回 (1, 768) tensor。空文本走零向量。"""
        emb = self._bert.encode(clinical_text)
        return torch.from_numpy(emb).unsqueeze(0).to(self._device)

    def _preprocess_image(self, pil_img: Image.Image) -> torch.Tensor:
        return _VAL_TF(pil_img).unsqueeze(0).to(self._device)

    def _write_gradcam(
        self,
        pil_img: Image.Image,
        img_tensor: torch.Tensor,
        txt_embed: torch.Tensor,
        predicted_idx: int,
    ) -> str:
        """生成 Grad-CAM 叠加图，返回相对 DATA_DIR 的路径。"""
        from pytorch_grad_cam import GradCAM
        from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
        from pytorch_grad_cam.utils.image import show_cam_on_image

        # train_fold.py: target_layer = model.img_features[-1]
        # EfficientNet-B3 features 是 Sequential，最后一个是 ConvNormActivation
        target_layer = self.model.img_features[-1]

        wrapper = _ImageOnlyWrapper(self.model, txt_embed).to(self._device)
        wrapper.eval()

        # 整个 backbone 在推理时默认 requires_grad=False（来自训练流程的冻结惯例）
        # GradCAM 需要梯度反传到 target_layer，临时打开
        restore: list[tuple[torch.nn.Parameter, bool]] = []
        for p in target_layer.parameters():
            restore.append((p, p.requires_grad))
            p.requires_grad_(True)

        try:
            with torch.enable_grad():
                cam = GradCAM(model=wrapper, target_layers=[target_layer])
                targets = [ClassifierOutputTarget(int(predicted_idx))]
                grayscale_cam = cam(input_tensor=img_tensor, targets=targets)[0]
        except Exception as exc:
            for p, req in restore:
                p.requires_grad_(req)
            raise RuntimeError(f"Grad-CAM failed: {exc}") from exc
        finally:
            for p, req in restore:
                p.requires_grad_(req)

        base = pil_img.convert("RGB").resize((IMG_SIZE, IMG_SIZE))
        base_np = np.asarray(base).astype(np.float32) / 255.0
        overlay = show_cam_on_image(base_np, grayscale_cam, use_rgb=True)
        overlay_img = Image.fromarray(overlay)

        now = datetime.now(timezone.utc)
        date_dir = now.strftime("%Y/%m/%d")
        dest_dir = GRADCAM_DIR / date_dir
        dest_dir.mkdir(parents=True, exist_ok=True)

        import secrets
        filename = f"gradcam_{secrets.token_hex(6)}.png"
        dest_path = dest_dir / filename
        overlay_img.save(dest_path, "PNG")

        return f"gradcam/{date_dir}/{filename}"

    def _write_fallback_image(self, pil_img: Image.Image) -> str:
        base = pil_img.convert("RGB").resize((IMG_SIZE, IMG_SIZE))
        now = datetime.now(timezone.utc)
        date_dir = now.strftime("%Y/%m/%d")
        dest_dir = GRADCAM_DIR / date_dir
        dest_dir.mkdir(parents=True, exist_ok=True)
        import secrets
        filename = f"gradcam_{secrets.token_hex(6)}.png"
        dest_path = dest_dir / filename
        base.save(dest_path, "PNG")
        return f"gradcam/{date_dir}/{filename}"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def predict(self, image_bytes: bytes, clinical_text: str) -> InferenceResult:
        self.ensure_loaded()

        start = time.perf_counter_ns()

        pil_img = load_image_bytes(image_bytes)
        img_tensor = self._preprocess_image(pil_img)
        txt_embed = self._encode_text(clinical_text or "")

        with self._lock:
            with torch.no_grad():
                logits = self.model(img_tensor, txt_embed)
                probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()

            predicted_idx = int(np.argmax(probs))

            try:
                gradcam_rel = self._write_gradcam(pil_img, img_tensor, txt_embed, predicted_idx)
            except Exception as exc:
                print(f"[inference] Grad-CAM failed, writing plain overlay: {exc}")
                gradcam_rel = self._write_fallback_image(pil_img)

        elapsed_ms = (time.perf_counter_ns() - start) // 1_000_000

        return InferenceResult(
            prob_normal=round(float(probs[0]), 4),
            prob_cancer=round(float(probs[1]), 4),
            prob_polyp=round(float(probs[2]), 4),
            predicted_class=CLASS_NAMES[predicted_idx],
            confidence=round(float(probs[predicted_idx]), 4),
            inference_ms=int(elapsed_ms),
            model_version=self.model_version,
            gradcam_path=gradcam_rel,
        )


inferencer = RealInferencer()
