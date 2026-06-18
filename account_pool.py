"""
Pool nick RoboNeo — ước tính credit theo giây, chọn / mua nick phù hợp.

Quy ước user: 15 giây video ≈ 115 credit → ~7.67 credit/giây.
"""

from __future__ import annotations

import json
import math
import subprocess
import time
from pathlib import Path
from typing import Any

from project_env import get_env, load_project_env
from huanaihub import HuanAiHubError, buy_roboneo_account, default_product_id
from roboneo_proxy import proxy_dict_from_key, roboneo_login
from roboneo_web import RoboNeoWebClient, RoboNeoError

POOL_FILE = Path(__file__).resolve().parent / "account_pool.json"


def credits_per_15s() -> float:
    load_project_env()
    return float(get_env("ROBONEO_CREDITS_PER_15S", "115") or "115")


def proxy_rotate_cooldown_sec() -> int:
    load_project_env()
    return int(get_env("PROXY_ROTATE_COOLDOWN_SEC", "60") or "60")


def estimate_credits(duration_sec: float, *, buffer_pct: float = 0.05) -> int:
    """Credit dự kiến cho 1 job motion theo độ dài video mẫu (giây)."""
    if duration_sec <= 0:
        duration_sec = 5.0
    raw = duration_sec * credits_per_15s() / 15.0
    need = math.ceil(raw * (1.0 + buffer_pct))
    return max(need, 1)


def video_duration_sec(path: str | Path) -> float:
    path = Path(path)
    try:
        out = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        )
        data = json.loads(out.stdout)
        return float(data["format"]["duration"])
    except Exception:
        return float(get_env("ROBONEO_DEFAULT_VIDEO_SEC", "5") or "5")


def _load_pool() -> dict[str, Any]:
    if POOL_FILE.is_file():
        return json.loads(POOL_FILE.read_text(encoding="utf-8"))
    return {"accounts": [], "last_proxy_rotate_at": 0}


def _save_pool(data: dict[str, Any]) -> None:
    POOL_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def list_accounts() -> list[dict[str, Any]]:
    return list(_load_pool().get("accounts") or [])


def upsert_account(
    email: str,
    password: str,
    *,
    credits: int | None = None,
    status: str = "active",
    source: str = "manual",
    trans_id: str = "",
    uid: int | None = None,
) -> dict[str, Any]:
    data = _load_pool()
    accounts: list[dict[str, Any]] = data.setdefault("accounts", [])
    email = email.strip().lower()
    row = next((a for a in accounts if a.get("email", "").lower() == email), None)
    if row is None:
        row = {"email": email, "password": password, "status": status, "source": source}
        accounts.append(row)
    row["password"] = password
    row["status"] = status
    row["source"] = source or row.get("source", "manual")
    if trans_id:
        row["trans_id"] = trans_id
    if uid is not None:
        row["uid"] = uid
    if credits is not None:
        row["credits"] = int(credits)
    row["updated_at"] = int(time.time())
    _save_pool(data)
    return row


def mark_account(email: str, *, status: str, note: str = "") -> None:
    data = _load_pool()
    for row in data.get("accounts") or []:
        if row.get("email", "").lower() == email.strip().lower():
            row["status"] = status
            if note:
                row["note"] = note
            row["updated_at"] = int(time.time())
            break
    _save_pool(data)


def pick_account(credits_needed: int, *, prefer_higher: bool = False) -> dict[str, Any] | None:
    """Chọn nick active đủ credit. Mặc định: nick nhỏ nhất vẫn đủ (tiết kiệm nick lớn)."""
    candidates = [
        a
        for a in list_accounts()
        if a.get("status") == "active" and int(a.get("credits") or 0) >= credits_needed
    ]
    if not candidates:
        return None
    if prefer_higher:
        return max(candidates, key=lambda a: int(a.get("credits") or 0))
    return min(candidates, key=lambda a: int(a.get("credits") or 0))


def _wait_proxy_rotate_cooldown(data: dict[str, Any]) -> None:
    cooldown = proxy_rotate_cooldown_sec()
    last = float(data.get("last_proxy_rotate_at") or 0)
    wait = cooldown - (time.time() - last)
    if wait > 0:
        print(f"⏱ Đợi {wait:.0f}s (VNsProxy 1 lần/60s)…")
        time.sleep(wait)


def _roboneo_account_id(email: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (email or "").strip().lower()).strip("_") or "default"


def _login_once(email: str, password: str, *, rotate: bool = False) -> tuple[RoboNeoWebClient, dict[str, Any]]:
    load_project_env()
    account_id = _roboneo_account_id(email)
    key = (get_env("ROBONEO_PROXY_KEY") or "").strip() or None
    province_raw = (get_env("ROBONEO_PROXY_PROVINCE_ID") or "").strip()
    province_id = int(province_raw) if province_raw else None

    proxies = None
    host = ""
    if key:
        proxies, host = proxy_dict_from_key(key, rotate=rotate, province_id=province_id if rotate else None)
        if rotate:
            data = _load_pool()
            data["last_proxy_rotate_at"] = int(time.time())
            _save_pool(data)

    resp = roboneo_login(email, password, proxies=proxies)
    client = RoboNeoWebClient(account_id=account_id)
    if host:
        client._apply_proxies(host)
    uid = resp.get("uid")
    client._state.update(
        {
            "access_token": resp["access_token"],
            "refresh_token": resp.get("refresh_token", ""),
            "uid": uid,
            "gid": client._gid,
            "proxy": host or None,
        }
    )
    client._save_session()
    try:
        client.fetch_token_info()
    except Exception:
        pass
    bal = client.meiye_query()
    credits = int(bal.get("amount") or 0) if isinstance(bal, dict) else 0
    upsert_account(email, password, credits=credits, status="active", uid=int(uid) if uid else None)
    return client, {"email": email, "uid": uid, "credits": credits, "proxy": host}


def refresh_account_credits(client: RoboNeoWebClient, email: str) -> int:
    bal = client.meiye_query()
    credits = int(bal.get("amount") or 0) if isinstance(bal, dict) else 0
    row = next((a for a in list_accounts() if a.get("email") == email), None)
    if row:
        upsert_account(email, row["password"], credits=credits, status=row.get("status", "active"))
    return credits


def buy_and_register_account(*, rotate_ip: bool = True) -> tuple[RoboNeoWebClient, dict[str, Any]]:
    data = _load_pool()
    if rotate_ip:
        _wait_proxy_rotate_cooldown(data)
    account = buy_roboneo_account(product_id=default_product_id(), amount=1)
    print(f"✅ Mua nick {account.email} (trans {account.trans_id})")
    try:
        client, info = _login_once(account.email, account.password, rotate=rotate_ip)
        info["password"] = account.password
        upsert_account(
            account.email,
            account.password,
            credits=info["credits"],
            status="active",
            source="huanaihub",
            trans_id=account.trans_id,
            uid=info.get("uid"),
        )
        return client, info
    except Exception as e:
        upsert_account(
            account.email,
            account.password,
            status="locked",
            source="huanaihub",
            trans_id=account.trans_id,
            credits=0,
        )
        mark_account(account.email, status="locked", note=str(e))
        raise


def acquire_client_for_job(
    credits_needed: int,
    *,
    max_buy_attempts: int = 3,
) -> tuple[RoboNeoWebClient, dict[str, Any]]:
    """
    Chọn nick pool đủ credit, không có thì xoay IP (≥60s) + mua nick mới.
    Lần retry chọn nick có nhiều coin hơn.
    """
    print(f"→ Cần ~{credits_needed} credit (quy đổi {credits_per_15s()}/15s)")

    row = pick_account(credits_needed, prefer_higher=False)
    if row:
        print(f"→ Dùng nick pool {row['email']} ({row.get('credits')} credit)")
        try:
            client, info = _login_once(row["email"], row["password"], rotate=False)
            if info["credits"] < credits_needed:
                print(f"⚠ Credit thực {info['credits']} < cần {credits_needed}")
                raise RoboNeoError("credit không đủ sau login")
            return client, info
        except Exception as e:
            print(f"⚠ Nick pool fail: {e}")
            mark_account(row["email"], status="locked", note=str(e))

    row = pick_account(credits_needed, prefer_higher=True)
    if row:
        print(f"→ Thử nick nhiều coin hơn: {row['email']} ({row.get('credits')})")
        try:
            client, info = _login_once(row["email"], row["password"], rotate=False)
            if info["credits"] >= credits_needed:
                return client, info
        except Exception as e:
            mark_account(row["email"], status="locked", note=str(e))

    last_err: Exception | None = None
    for attempt in range(1, max_buy_attempts + 1):
        print(f"→ Mua nick mới (lần {attempt}/{max_buy_attempts})…")
        try:
            client, info = buy_and_register_account(rotate_ip=True)
            if info["credits"] >= credits_needed:
                return client, info
            print(
                f"⚠ Nick mới {info['email']} chỉ {info['credits']} credit "
                f"< {credits_needed} — mua nick khác…"
            )
            mark_account(info["email"], status="depleted", note="credit thấp sau mua")
        except (HuanAiHubError, Exception) as e:
            last_err = e
            print(f"   ⚠ {e}")
    if last_err:
        raise RoboNeoError(f"Không có nick đủ {credits_needed} credit: {last_err}")
    raise RoboNeoError(f"Không có nick đủ {credits_needed} credit")
