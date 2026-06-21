#!/usr/bin/env python3
"""Lấy nick từ lịch sử đơn huanaihub (client session) → file text."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from project_env import get_env, load_project_env  # noqa: E402


def _session() -> requests.Session:
    load_project_env()
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "https://huanaihub.com/",
        }
    )
    return s


def login(s: requests.Session) -> None:
    username = (get_env("HUANAIHUB_USERNAME") or get_env("HUANAIHUB_EMAIL") or "").strip()
    password = (get_env("HUANAIHUB_PASSWORD") or get_env("HUANAIHUB_API_KEY") or "").strip()
    if not username or not password:
        raise RuntimeError("Thiếu HUANAIHUB_USERNAME + HUANAIHUB_PASSWORD trong .env")

    r = s.post(
        "https://huanaihub.com/ajaxs/client/login.php",
        data={"username": username, "password": password},
        timeout=60,
    )
    if r.status_code == 403:
        raise RuntimeError("huanaihub 403 — chạy script trên VPS hoặc VPN VN")
    try:
        data = r.json()
    except ValueError as e:
        raise RuntimeError(f"Login response lạ: {r.text[:200]}") from e
    if data.get("status") != "success":
        raise RuntimeError(f"Login fail: {data.get('msg') or data}")
    print(f"✅ Login OK — {username}")


def _client_token(s: requests.Session) -> str:
    r = s.get("https://huanaihub.com/client/home", timeout=60)
    r.raise_for_status()
    m = re.search(r"token['\"]\s*:\s*['\"]([a-f0-9]{32,})['\"]", r.text, re.I)
    if not m:
        m = re.search(r'name="token"\s+value="([a-f0-9]{32,})"', r.text, re.I)
    if not m:
        raise RuntimeError("Không tìm thấy client token trên /client/home")
    return m.group(1)


def list_orders(s: requests.Session) -> list[dict]:
    r = s.get("https://huanaihub.com/client/orders", timeout=60)
    r.raise_for_status()
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", r.text, re.S | re.I):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)
        if len(cells) < 4:
            continue
        plain = [re.sub(r"<[^>]+>", " ", c) for c in cells]
        plain = [re.sub(r"\s+", " ", c).strip() for c in plain]
        onclick = re.search(r"downloadFile\s*\(\s*['\"]([^'\"]+)['\"]", tr, re.I)
        trans_id = onclick.group(1) if onclick else ""
        if not trans_id:
            m = re.search(r"/client/order/([A-Z0-9]+)", tr, re.I)
            trans_id = m.group(1) if m else ""
        if not trans_id:
            continue
        rows.append(
            {
                "trans_id": trans_id,
                "product": plain[1] if len(plain) > 1 else "",
                "amount": plain[2] if len(plain) > 2 else "",
                "price": plain[3] if len(plain) > 3 else "",
                "date": plain[4] if len(plain) > 4 else "",
                "row": " | ".join(plain),
            }
        )
    return rows


def download_order(s: requests.Session, trans_id: str, token: str) -> str:
    r = s.post(
        "https://huanaihub.com/ajaxs/client/downloadOrder.php",
        data={"transid": trans_id, "token": token},
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    if data.get("status") != "success":
        raise RuntimeError(f"Download {trans_id} fail: {data.get('msg') or data}")
    accounts = (data.get("accounts") or "").replace("\r\n", "\n").strip()
    if not accounts:
        raise RuntimeError(f"Download {trans_id} — accounts rỗng")
    return accounts


def main() -> int:
    p = argparse.ArgumentParser(description="Tải nick từ lịch sử huanaihub")
    p.add_argument("--trans-id", help="Mã đơn (vd EWOA1781851337). Bỏ trống = đơn mới nhất")
    p.add_argument("--amount", type=int, default=0, help="Lọc đơn theo số lượng nick (vd 100)")
    p.add_argument("-o", "--output", required=True, help="File output email|pass mỗi dòng")
    p.add_argument("--list", action="store_true", help="Chỉ liệt kê đơn, không tải")
    args = p.parse_args()

    s = _session()
    login(s)
    token = _client_token(s)
    orders = list_orders(s)
    if not orders:
        print("❌ Không parse được đơn hàng từ /client/orders")
        return 1

    print(f"📋 {len(orders)} đơn gần nhất:")
    for o in orders[:15]:
        print(f"  {o['trans_id']} | {o.get('amount','?')} nick | {o.get('product','')[:40]} | {o.get('date','')}")

    if args.list:
        return 0

    chosen = None
    if args.trans_id:
        tid = args.trans_id.strip().upper()
        for o in orders:
            if o["trans_id"].upper() == tid:
                chosen = o
                break
        if not chosen:
            chosen = {"trans_id": tid}
    else:
        if args.amount:
            for o in orders:
                amt = re.sub(r"\D", "", o.get("amount") or "")
                if amt == str(args.amount):
                    chosen = o
                    break
        if not chosen:
            chosen = orders[0]

    trans_id = chosen["trans_id"]
    print(f"⬇️  Tải đơn {trans_id} ...")
    accounts = download_order(s, trans_id, token)
    lines = [ln.strip() for ln in accounts.splitlines() if ln.strip()]
    out = Path(args.output)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✅ {len(lines)} nick → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
