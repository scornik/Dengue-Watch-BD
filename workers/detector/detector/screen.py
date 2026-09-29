"""Turn class probabilities into the screening verdict shared with the web app.

JSON contract (same as the web app's paid-API providers; provider name "model"):

    {"label": "likely" | "unclear" | "not_relevant", "score": float, "site_type": str | null}

`score` is the model's probability that the photo shows a potential breeding site,
i.e. 1 - P(not_relevant), in [0, 1]. `site_type` is the most probable site class (one of
reports.site_type) unless the label is "not_relevant".
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from PIL import Image

from .labels import NOT_RELEVANT, SITE_CLASSES


class Classifier(Protocol):
    def predict(self, image: Image.Image) -> Mapping[str, float]:
        """Class name -> probability (summing to ~1)."""
        ...


@dataclass(frozen=True, slots=True)
class Thresholds:
    likely: float = 0.7  # P(site) >= this -> "likely"
    not_relevant: float = 0.7  # P(not_relevant) >= this -> "not_relevant"


def decide(probs: Mapping[str, float], th: Thresholds | None = None) -> dict[str, object]:
    th = th or Thresholds()
    total = sum(max(0.0, p) for p in probs.values()) or 1.0
    p = {k: max(0.0, v) / total for k, v in probs.items()}
    p_nr = p.get(NOT_RELEVANT, 0.0)
    p_site = 1.0 - p_nr
    sites = {k: v for k, v in p.items() if k in SITE_CLASSES}
    best_site = max(sites, key=lambda k: sites[k]) if sites else None
    if p_nr >= th.not_relevant:
        label, site_type = "not_relevant", None
    elif p_site >= th.likely:
        label, site_type = "likely", best_site
    else:
        label, site_type = "unclear", best_site
    return {"label": label, "score": round(p_site, 4), "site_type": site_type}


class UltralyticsClassifier:
    """YOLO classification model (requires requirements-train.txt)."""

    def __init__(self, weights: str, imgsz: int = 224) -> None:
        from ultralytics import YOLO  # AGPL-3.0, optional dependency

        self.model = YOLO(weights)
        self.imgsz = imgsz

    def predict(self, image: Image.Image) -> Mapping[str, float]:
        result = self.model.predict(image, imgsz=self.imgsz, verbose=False)[0]
        probs = result.probs.data.tolist()
        return {str(result.names[i]): float(v) for i, v in enumerate(probs)}
