"""Chuẩn hoá / cắt video tham chiếu trên server (bot VPS có ffmpeg)."""

from __future__ import annotations

from pathlib import Path

from account_pool import video_duration_sec
from videoaieasy_web import prepare_motion_video_for_vae_upload

DEFAULT_MAX_SEC = 30.0


def max_reference_video_sec_for_order(order_data: dict | None) -> float:
    if not order_data:
        return DEFAULT_MAX_SEC
    for key in ("maxVideoSec", "vaeDurationSec", "durationSec"):
        val = order_data.get(key)
        if val is not None:
            try:
                return float(val)
            except (TypeError, ValueError):
                pass
    return DEFAULT_MAX_SEC


def trim_reference_video_for_order(vid_path: str | Path, order_data: dict | None) -> str:
    """Cắt video tham chiếu về giới hạn gói nếu dài hơn (mobile upload không cắt được trên browser)."""
    path = Path(vid_path)
    max_sec = max_reference_video_sec_for_order(order_data)
    dur = video_duration_sec(path)
    if dur <= max_sec + 0.15:
        return str(path)
    print(f"✂️ Server cắt video {dur:.1f}s → {max_sec:.0f}s")
    trimmed, _tmp = prepare_motion_video_for_vae_upload(str(path), max_seconds=max_sec)
    return trimmed
