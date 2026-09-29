"""Pure scoring: standardise ward features, weight them, map scores to alert levels.

Method (see README):

1. For each feature, z-score across all wards in this run: z = (x - mean) / std, using the
   population std (ddof=0). Missing values (None/NaN) get z = 0 (the neutral city average) and
   do not count toward mean/std. If std == 0 (or fewer than 2 values), every z is 0.
   z-scores are optionally clipped to +/- z_clip so one extreme ward cannot dominate.
2. score = sum_i w_i * z_i, divided by sum_i |w_i| when `normalize` is on. With normalisation
   the score is a weighted average of z-scores, so thresholds read in "standard deviations".
3. Sign convention: a positive weight means "higher value = higher risk". NDVI has a negative
   weight (more vegetation = lower risk in the Dhaka study); MNDWI, NDBI, LST, rain, report
   density and case counts have positive weights.
4. Levels, from `weights.yaml`:
   * thresholds: green < yellow_min <= yellow < orange_min <= orange < red_min <= red
   * percentiles: the same cut-offs, applied to each ward's percentile rank within the run
     (ties share the mid-rank, so identical scores get identical levels).
"""

from __future__ import annotations

import bisect
import itertools
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import yaml

FEATURES: tuple[str, ...] = (
    "ndvi",
    "ndwi",  # stores MNDWI (green/SWIR1), see README
    "ndbi",
    "lst_c",
    "rain_14d_mm",
    "report_density",
    "cases_area",
)
LEVELS: tuple[str, ...] = ("green", "yellow", "orange", "red")
LevelMode = Literal["thresholds", "percentiles"]


@dataclass(frozen=True, slots=True)
class ScoreConfig:
    version: str
    weights: Mapping[str, float]
    normalize: bool = True
    z_clip: float | None = 3.0
    level_mode: LevelMode = "thresholds"
    # Lower bounds of yellow, orange, red.
    thresholds: tuple[float, float, float] = (-0.5, 0.25, 1.0)
    percentiles: tuple[float, float, float] = (0.5, 0.75, 0.9)

    def __post_init__(self) -> None:
        unknown = set(self.weights) - set(FEATURES)
        if unknown:
            raise ValueError(f"unknown feature(s) in weights: {sorted(unknown)}")
        if not any(w != 0 for w in self.weights.values()):
            raise ValueError("at least one weight must be non-zero")
        if self.level_mode not in ("thresholds", "percentiles"):
            raise ValueError(f"unknown level mode {self.level_mode!r}")
        if not _increasing(self.thresholds):
            raise ValueError("thresholds must be strictly increasing (yellow < orange < red)")
        if not _increasing(self.percentiles) or not all(0 < p < 1 for p in self.percentiles):
            raise ValueError("percentiles must be strictly increasing and within (0, 1)")
        if self.z_clip is not None and self.z_clip <= 0:
            raise ValueError("z_clip must be positive or null")


def _increasing(xs: Sequence[float]) -> bool:
    return len(xs) == 3 and all(a < b for a, b in itertools.pairwise(xs))


def _cuts(raw: Any, name: str) -> tuple[float, float, float]:
    if not isinstance(raw, Mapping):
        raise ValueError(f"levels.{name} must be a mapping with yellow/orange/red")
    try:
        return (float(raw["yellow"]), float(raw["orange"]), float(raw["red"]))
    except KeyError as exc:
        raise ValueError(f"levels.{name} is missing {exc.args[0]!r}") from None


def config_from_dict(data: Mapping[str, Any]) -> ScoreConfig:
    levels = data.get("levels") or {}
    z_clip = data.get("z_clip", 3.0)
    kwargs: dict[str, Any] = {
        "version": str(data["version"]),
        "weights": {str(k): float(v) for k, v in (data.get("weights") or {}).items()},
        "normalize": bool(data.get("normalize", True)),
        "z_clip": None if z_clip is None else float(z_clip),
        "level_mode": levels.get("mode", "thresholds"),
    }
    if "thresholds" in levels:
        kwargs["thresholds"] = _cuts(levels["thresholds"], "thresholds")
    if "percentiles" in levels:
        kwargs["percentiles"] = _cuts(levels["percentiles"], "percentiles")
    return ScoreConfig(**kwargs)


def load_config(path: str | Path) -> ScoreConfig:
    with open(path, encoding="utf-8") as fh:
        return config_from_dict(yaml.safe_load(fh))


def _present(x: float | None) -> bool:
    return x is not None and math.isfinite(x)  # None and NaN both mean "missing"


def zscores(values: Sequence[float | None], clip: float | None = None) -> list[float]:
    """Population z-scores; missing values and zero spread both map to 0."""
    xs = [float(v) for v in values if _present(v)]
    if len(xs) < 2:
        return [0.0] * len(values)
    mean = sum(xs) / len(xs)
    std = math.sqrt(sum((x - mean) ** 2 for x in xs) / len(xs))
    if std <= 1e-12 * max(1.0, abs(mean)):
        return [0.0] * len(values)
    out: list[float] = []
    for v in values:
        if v is None or not _present(v):
            out.append(0.0)
            continue
        z = (float(v) - mean) / std
        if clip is not None:
            z = max(-clip, min(clip, z))
        out.append(z)
    return out


def level_for(value: float, cuts: tuple[float, float, float]) -> str:
    """Map a value to a level given the lower bounds of yellow, orange and red."""
    for level, cut in zip(reversed(LEVELS[1:]), reversed(cuts), strict=True):
        if value >= cut:
            return level
    return "green"


def percentile_ranks(scores: Sequence[float]) -> list[float]:
    """Mid-rank percentile in [0, 1): (#below + 0.5 * #equal) / n."""
    n = len(scores)
    ordered = sorted(scores)
    out: list[float] = []
    for s in scores:
        below = bisect.bisect_left(ordered, s)
        equal = bisect.bisect_right(ordered, s) - below
        out.append((below + 0.5 * equal) / n)
    return out


@dataclass(frozen=True, slots=True)
class WardScore:
    score: float
    level: str
    z: dict[str, float] = field(default_factory=dict)


def score_wards(
    features: Mapping[int, Mapping[str, float | None]], cfg: ScoreConfig
) -> dict[int, WardScore]:
    """Score every ward. `features[ward_id][name]` may be missing or None."""
    ward_ids = list(features)
    if not ward_ids:
        return {}
    z_by_feature: dict[str, list[float]] = {}
    for name in FEATURES:
        if cfg.weights.get(name, 0.0) == 0.0:
            continue
        z_by_feature[name] = zscores([features[w].get(name) for w in ward_ids], cfg.z_clip)

    denom = sum(abs(cfg.weights[n]) for n in z_by_feature) if cfg.normalize else 1.0
    raw: list[float] = []
    zs: list[dict[str, float]] = []
    for i in range(len(ward_ids)):
        z = {n: vals[i] for n, vals in z_by_feature.items()}
        zs.append(z)
        raw.append(sum(cfg.weights[n] * z[n] for n in z) / denom)

    if cfg.level_mode == "percentiles":
        ranks = percentile_ranks(raw)
        levels = [level_for(p, cfg.percentiles) for p in ranks]
    else:
        levels = [level_for(s, cfg.thresholds) for s in raw]

    return {w: WardScore(score=raw[i], level=levels[i], z=zs[i]) for i, w in enumerate(ward_ids)}
