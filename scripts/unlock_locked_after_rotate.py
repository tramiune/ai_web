#!/usr/bin/env python3
"""Login lại nick locked — xoay VNsProxy mỗi PROXY_ACCOUNTS_PER_IP nick."""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from account_pool import (  # noqa: E402
    _load_pool,
    _login_once,
    _rotate_proxy_if_needed,
    _save_pool,
    _should_force_rotate_on_error,
    list_accounts,
    mark_account,
    proxy_rotate_cooldown_sec,
    update_account_after_job,
)
from roboneo_web import RoboNeoError  # noqa: E402


def _bump_ip_counter() -> None:
    data = _load_pool()
    data["accounts_on_current_ip"] = int(data.get("accounts_on_current_ip") or 0) + 1
    _save_pool(data)


def _safe_rotate(*, force: bool, retries: int = 5) -> bool:
    for attempt in range(1, retries + 1):
        try:
            return bool(_rotate_proxy_if_needed(_load_pool(), force=force))
        except RoboNeoError as e:
            wait = proxy_rotate_cooldown_sec() + 5
            print(f"⚠ Xoay IP lỗi ({e}) — đợi {wait}s rồi thử lại ({attempt}/{retries})", flush=True)
            time.sleep(wait)
    print("⚠ Bỏ qua xoay IP sau nhiều lần thử", flush=True)
    return False


def main() -> None:
    locked = [a for a in list_accounts() if a.get("status") == "locked"]
    print(f"Unlock {len(locked)} locked nick (xoay IP mỗi batch)", flush=True)
    ok = fail = 0
    for i, row in enumerate(locked, 1):
        email = (row.get("email") or "").strip()
        password = row.get("password") or ""
        if not email or not password:
            continue

        _safe_rotate(force=False)
        print(f"[{i}/{len(locked)}] {email}…", end=" ", flush=True)
        try:
            _client, info = _login_once(email, password, rotate=False)
            cr = int(info.get("credits") or 0)
            update_account_after_job(email, cr)
            _bump_ip_counter()
            print(f"OK {cr} credit", flush=True)
            ok += 1
        except RoboNeoError as e:
            mark_account(email, status="locked", note=str(e), credits=0)
            print(f"LOCK ({e})", flush=True)
            fail += 1
            if _should_force_rotate_on_error(e):
                _safe_rotate(force=True)
        except Exception as e:
            mark_account(email, status="locked", note=str(e))
            print(f"ERR ({e})", flush=True)
            fail += 1
            if _should_force_rotate_on_error(e):
                _safe_rotate(force=True)

        if i < len(locked):
            time.sleep(1.5)

    print(f"DONE ok={ok} fail={fail}", flush=True)


if __name__ == "__main__":
    main()
