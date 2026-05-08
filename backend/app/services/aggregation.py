"""Per-patient aggregation strategies.

Given a list of per-image probability distributions, produce a single
patient-level distribution and predicted class. Strategy is pluggable and
selected via environment variable ``AGGREGATION_STRATEGY``.
"""
from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass
from typing import Protocol

import numpy as np

CLASS_NAMES = ["normal", "endometrial_cancer", "polyp"]


@dataclass
class PerImageResult:
    prob_normal: float
    prob_cancer: float
    prob_polyp: float
    predicted_class: str
    confidence: float

    def as_array(self) -> np.ndarray:
        return np.array([self.prob_normal, self.prob_cancer, self.prob_polyp], dtype=np.float64)


@dataclass
class AggregatedResult:
    prob_normal: float
    prob_cancer: float
    prob_polyp: float
    predicted_class: str
    confidence: float
    image_count: int
    strategy: str
    threshold: float


class AggregationStrategy(Protocol):
    name: str
    threshold: float

    def aggregate(self, results: list[PerImageResult]) -> AggregatedResult: ...


def _to_aggregated(probs: np.ndarray, image_count: int, name: str, threshold: float) -> AggregatedResult:
    probs = np.clip(probs, 0.0, 1.0)
    s = float(probs.sum())
    if s > 0:
        probs = probs / s
    idx = int(np.argmax(probs))
    return AggregatedResult(
        prob_normal=round(float(probs[0]), 4),
        prob_cancer=round(float(probs[1]), 4),
        prob_polyp=round(float(probs[2]), 4),
        predicted_class=CLASS_NAMES[idx],
        confidence=round(float(probs[idx]), 4),
        image_count=image_count,
        strategy=name,
        threshold=threshold,
    )


class MeanAggregation:
    name = "mean"
    threshold = 0.0

    def aggregate(self, results: list[PerImageResult]) -> AggregatedResult:
        if not results:
            raise ValueError("Cannot aggregate an empty result list.")
        stacked = np.stack([r.as_array() for r in results], axis=0)
        mean = stacked.mean(axis=0)
        return _to_aggregated(mean, len(results), self.name, self.threshold)


class MaxSeverityAggregation:
    """If any image's cancer probability >= threshold, the patient is labelled
    cancer (confidence = max cancer prob). Otherwise falls back to mean.
    """

    name = "max_severity"

    def __init__(self, threshold: float = 0.6):
        self.threshold = float(threshold)

    def aggregate(self, results: list[PerImageResult]) -> AggregatedResult:
        if not results:
            raise ValueError("Cannot aggregate an empty result list.")
        max_cancer = max(r.prob_cancer for r in results)
        if max_cancer >= self.threshold:
            # Use the worst image's full distribution as the patient result.
            worst = max(results, key=lambda r: r.prob_cancer)
            probs = worst.as_array()
            return _to_aggregated(probs, len(results), self.name, self.threshold)
        stacked = np.stack([r.as_array() for r in results], axis=0)
        return _to_aggregated(stacked.mean(axis=0), len(results), self.name, self.threshold)


class MajorityVoteAggregation:
    name = "majority_vote"
    threshold = 0.0

    def aggregate(self, results: list[PerImageResult]) -> AggregatedResult:
        if not results:
            raise ValueError("Cannot aggregate an empty result list.")
        votes = Counter(r.predicted_class for r in results)
        winner, _ = votes.most_common(1)[0]
        same = [r for r in results if r.predicted_class == winner]
        probs = np.stack([r.as_array() for r in same], axis=0).mean(axis=0)
        # Force predicted class to winner even if mean argmax disagrees.
        idx = CLASS_NAMES.index(winner)
        probs = np.clip(probs, 0.0, 1.0)
        s = float(probs.sum())
        if s > 0:
            probs = probs / s
        return AggregatedResult(
            prob_normal=round(float(probs[0]), 4),
            prob_cancer=round(float(probs[1]), 4),
            prob_polyp=round(float(probs[2]), 4),
            predicted_class=winner,
            confidence=round(float(probs[idx]), 4),
            image_count=len(results),
            strategy=self.name,
            threshold=self.threshold,
        )


_STRATEGIES: dict[str, AggregationStrategy] = {
    "mean": MeanAggregation(),
    "max_severity": MaxSeverityAggregation(
        threshold=float(os.getenv("MAX_SEVERITY_THRESHOLD", "0.6"))
    ),
    "majority_vote": MajorityVoteAggregation(),
}


def get_strategy(name: str | None = None) -> AggregationStrategy:
    key = (name or os.getenv("AGGREGATION_STRATEGY", "mean") or "mean").lower()
    return _STRATEGIES.get(key, _STRATEGIES["mean"])
