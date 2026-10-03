"""Progress parsing and historical ETA estimation."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any


@dataclass(frozen=True)
class LineInfo:
    progress: float | None = None
    phase: str = "準備中"


@dataclass(frozen=True)
class ProgressSnapshot:
    percent: float
    actual: bool
    phase: str
    elapsed_seconds: float
    remaining_seconds: float | None
    finish_at: datetime | None


class ProgressParser:
    """Parse actual progress only from explicit machine-readable JSON."""

    def __init__(self) -> None:
        self.actual_progress: float | None = None
        self.phase = "準備中"

    def feed(self, line: str) -> LineInfo:
        progress = self._json_progress(line)
        if progress is not None and 0 <= progress <= 100:
            self.actual_progress = progress
        else:
            progress = None
        phase = self._phase(line)
        if phase:
            self.phase = phase
        return LineInfo(progress=progress, phase=self.phase)

    @staticmethod
    def _json_progress(line: str) -> float | None:
        try:
            value: Any = json.loads(line.strip())
        except json.JSONDecodeError:
            return None
        if not isinstance(value, dict):
            return None
        raw = value.get("progress", value.get("percent", value.get("percentage")))
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _phase(line: str) -> str | None:
        text = line.casefold()
        rules = (
            (("prepare", "preparing", "initializ", "準備"), "準備中"),
            (("geometry", "load", "読み込", "loading"), "Geometry読込"),
            (("slice", "slicing"), "Slicing"),
            (("toolpath", "g-code", "gcode"), "G-code生成"),
            (("write", "export", "output", "書き出"), "書き出し"),
            (("complete", "finished", "success", "完了"), "完了確認"),
        )
        for needles, phase in rules:
            if any(needle in text for needle in needles):
                return phase
        return None


class ProgressEstimator:
    def __init__(self, reference_seconds: float = 2971.0) -> None:
        self.reference_seconds = max(1.0, reference_seconds)

    def snapshot(self, parser: ProgressParser, elapsed_seconds: float, now: datetime | None = None) -> ProgressSnapshot:
        now = now or datetime.now().astimezone()
        if parser.actual_progress is not None:
            percent = parser.actual_progress
            actual = True
            if percent > 0:
                remaining = max(0.0, elapsed_seconds * (100.0 - percent) / percent)
            else:
                remaining = self.reference_seconds
        else:
            percent = min(99.0, max(0.0, elapsed_seconds / self.reference_seconds * 100.0))
            actual = False
            remaining = max(0.0, self.reference_seconds - elapsed_seconds)
        return ProgressSnapshot(
            percent=percent,
            actual=actual,
            phase=parser.phase,
            elapsed_seconds=elapsed_seconds,
            remaining_seconds=remaining,
            finish_at=now + timedelta(seconds=remaining) if remaining is not None else None,
        )


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "--:--"
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}" if hours else f"{minutes:02d}:{secs:02d}"


def format_remaining(seconds: float | None) -> str:
    if seconds is None:
        return "計測中"
    minutes = max(0, int(round(seconds / 60.0)))
    return f"約{minutes}分"
