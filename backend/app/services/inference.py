import os
import time
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from io import BytesIO

import numpy as np
import torch
import torch.nn as nn
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
# Model architecture (must match training)
# -----------------------------------------------------------------------------

class MultiModalNet(nn.Module):
    def __init__(self, text_dim: int = 768, num_classes: int = 3):
        super().__init__()
        backbone = models.resnet18(weights=None)
        for p in backbone.parameters():
            p.requires_grad = False
        self.img_features = nn.Sequential(*list(backbone.children())[:-1])

        self.text_proj = nn.Sequential(
            nn.Linear(text_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.5),
        )
        self.classifier = nn.Sequential(
            nn.Dropout(0.5),
            nn.Linear(512 + 64, 32),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(32, num_classes),
        )

    def forward(self, img: torch.Tensor, txt: torch.Tensor) -> torch.Tensor:
        img_feat = self.img_features(img).flatten(1)
        txt_feat = self.text_proj(txt)
        return self.classifier(torch.cat([img_feat, txt_feat], dim=1))


class _ImageOnlyWrapper(nn.Module):
    """Adapter that fixes the text embedding so GradCAM can treat the model
    as single-input (image-only)."""

    def __init__(self, full_model: MultiModalNet, text_embedding: torch.Tensor):
        super().__init__()
        self.full_model = full_model
        # text_embedding shape: (1, 768)
        self.register_buffer("txt", text_embedding, persistent=False)

    def forward(self, img: torch.Tensor) -> torch.Tensor:
        return self.full_model(img, self.txt)


# -----------------------------------------------------------------------------
# Preprocessing (must match training)
# -----------------------------------------------------------------------------

_NORM = transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
_VAL_TF = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    _NORM,
])


class RealInferencer:
    def __init__(self):
        self.model_version = MODEL_VERSION
        self._device = torch.device("cpu")
        self._loaded = False
        self._lock = threading.Lock()
        self._load_lock = threading.Lock()

        self.model: MultiModalNet | None = None
        self.tokenizer = None
        self.bert = None

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
        from transformers import AutoTokenizer, AutoModel

        ckpt_path = Path(MODEL_CKPT_PATH)
        bert_path = Path(BERT_PATH)
        if not ckpt_path.is_file():
            raise FileNotFoundError(f"Model checkpoint not found: {ckpt_path}")
        if not bert_path.is_dir():
            raise FileNotFoundError(f"BERT directory not found: {bert_path}")

        # Multimodal classifier
        model = MultiModalNet(text_dim=768, num_classes=len(CLASS_NAMES))
        state = torch.load(str(ckpt_path), map_location=self._device)
        if isinstance(state, dict) and "state_dict" in state and not any(
            k.startswith("img_features") or k.startswith("text_proj") or k.startswith("classifier")
            for k in state.keys()
        ):
            state = state["state_dict"]
        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing:
            # Non-fatal; log for diagnostics.
            print(f"[inference] load_state_dict missing keys: {missing}")
        if unexpected:
            print(f"[inference] load_state_dict unexpected keys: {unexpected}")
        model.to(self._device).eval()

        # BERT encoder for clinical text
        tokenizer = AutoTokenizer.from_pretrained(str(bert_path))
        bert = AutoModel.from_pretrained(str(bert_path))
        bert.to(self._device).eval()

        self.model = model
        self.tokenizer = tokenizer
        self.bert = bert
        self._loaded = True

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _encode_text(self, clinical_text: str) -> torch.Tensor:
        """Returns a (1, 768) CLS embedding."""
        text = clinical_text if clinical_text is not None else ""
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=256,
            padding=True,
        )
        inputs = {k: v.to(self._device) for k, v in inputs.items()}
        with torch.no_grad():
            outputs = self.bert(**inputs)
        cls = outputs.last_hidden_state[:, 0, :]  # (1, 768)
        return cls

    def _preprocess_image(self, pil_img: Image.Image) -> torch.Tensor:
        tensor = _VAL_TF(pil_img).unsqueeze(0).to(self._device)
        return tensor

    def _write_gradcam(
        self,
        pil_img: Image.Image,
        img_tensor: torch.Tensor,
        txt_embed: torch.Tensor,
        predicted_idx: int,
    ) -> str:
        """Produce a Grad-CAM overlay PNG and return its path relative to DATA_DIR."""
        from pytorch_grad_cam import GradCAM
        from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
        from pytorch_grad_cam.utils.image import show_cam_on_image

        # ResNet18 was split as Sequential(*list(backbone.children())[:-1])
        # so img_features[7] corresponds to layer4 (2 BasicBlocks); the last
        # BasicBlock's final conv is what we visualize.
        target_layer = self.model.img_features[7][-1]

        wrapper = _ImageOnlyWrapper(self.model, txt_embed).to(self._device)
        wrapper.eval()

        # GradCAM needs gradients, but backbone params are frozen. Enable grad
        # just on the target layer's parameters so backprop reaches activations.
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
            # Restore requires_grad state and re-raise to the caller; the
            # calling code will surface a Grad-CAM failure but keep prediction.
            for p, req in restore:
                p.requires_grad_(req)
            raise RuntimeError(f"Grad-CAM failed: {exc}") from exc
        finally:
            for p, req in restore:
                p.requires_grad_(req)

        # Prepare base image at 224x224 in [0, 1] float for overlay.
        base = pil_img.convert("RGB").resize((224, 224))
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

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def predict(self, image_bytes: bytes, clinical_text: str) -> InferenceResult:
        self.ensure_loaded()

        start = time.perf_counter_ns()

        pil_img = load_image_bytes(image_bytes)
        img_tensor = self._preprocess_image(pil_img)
        txt_embed = self._encode_text(clinical_text or "")

        # Forward pass (serialized so concurrent requests don't fight over
        # the shared model state).
        with self._lock:
            with torch.no_grad():
                logits = self.model(img_tensor, txt_embed)
                probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()

            predicted_idx = int(np.argmax(probs))

            # Generate Grad-CAM overlay. If it fails, log and fall back to a
            # blank overlay path so the API contract stays intact; the
            # prediction itself is still valid.
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

    def _write_fallback_image(self, pil_img: Image.Image) -> str:
        """Write the resized base image as the overlay when CAM fails."""
        base = pil_img.convert("RGB").resize((224, 224))
        now = datetime.now(timezone.utc)
        date_dir = now.strftime("%Y/%m/%d")
        dest_dir = GRADCAM_DIR / date_dir
        dest_dir.mkdir(parents=True, exist_ok=True)
        import secrets
        filename = f"gradcam_{secrets.token_hex(6)}.png"
        dest_path = dest_dir / filename
        base.save(dest_path, "PNG")
        return f"gradcam/{date_dir}/{filename}"


inferencer = RealInferencer()
