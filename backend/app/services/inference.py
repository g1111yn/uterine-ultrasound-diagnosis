import time
import random
import numpy as np
from dataclasses import dataclass

from app.config import MODEL_VERSION

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


class MockInferencer:
    def __init__(self):
        self.model_version = MODEL_VERSION
        self._loaded = True

    @property
    def loaded(self) -> bool:
        return self._loaded

    def predict(self, image_bytes: bytes, clinical_text: str) -> InferenceResult:
        start = time.perf_counter_ns()

        probs = np.random.dirichlet([1, 1, 1]).tolist()
        idx = int(np.argmax(probs))

        fake_delay_ms = random.randint(200, 800)
        elapsed_ms = (time.perf_counter_ns() - start) // 1_000_000
        total_ms = max(fake_delay_ms, elapsed_ms)

        return InferenceResult(
            prob_normal=round(probs[0], 4),
            prob_cancer=round(probs[1], 4),
            prob_polyp=round(probs[2], 4),
            predicted_class=CLASS_NAMES[idx],
            confidence=round(probs[idx], 4),
            inference_ms=total_ms,
            model_version=self.model_version,
        )


inferencer = MockInferencer()
