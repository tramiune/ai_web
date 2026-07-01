#!/usr/bin/env python3
"""Probe Aidancing endpoints for wallet/balance JSON (dev helper)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from project_env import load_project_env, get_env  # noqa: E402

load_project_env()

cookie = (get_env("AIDANCING_COOKIE") or "").strip()
if not cookie:
    print("No AIDANCING_COOKIE")
    sys.exit(1)

origin = (get_env("AIDANCING_ORIGIN") or "https://aidancing.net").rstrip("/")
headers = {
    "Cookie": cookie,
    "Accept": "application/json, text/plain, */*",
    "Referer": f"{origin}/dashboard",
    "Origin": origin,
    "User-Agent": get_env(
        "AIDANCING_USER_AGENT",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    ),
}

paths = [
    "/api/proxy/user",
    "/api/proxy/me",
    "/api/proxy/account",
    "/api/proxy/wallet",
    "/api/proxy/balance",
    "/api/proxy/profile",
    "/api/proxy/users/me",
    "/api/proxy/users/current",
    "/api/proxy/session",
    "/api/proxy/auth/me",
    "/api/user",
    "/api/me",
    "/api/proxy/credits",
    "/api/proxy/jobs?page=0&size=1",
    "/api/proxy/payment/balance",
    "/api/proxy/payments/balance",
    "/api/proxy/billing/balance",
    "/api/proxy/customer",
    "/api/proxy/customers/me",
]

print("=== DASHBOARD HTML ===")
r = requests.get(f"{origin}/dashboard", headers=headers, timeout=30)
html = r.text or ""
print("status", r.status_code, "len", len(html))
for pat in (
    r'"balance"\s*:\s*([\d.]+)',
    r'"coinBalance"\s*:\s*([\d.]+)',
    r'"walletBalance"\s*:\s*([\d.]+)',
    r'"remainingCoins"\s*:\s*([\d.]+)',
    r'coinBalance["\']?\s*[:=]\s*([\d.]+)',
):
    ms = re.findall(pat, html, re.I)
    if ms:
        print("regex", pat, "->", ms[:5])

srcs = re.findall(r'src="([^"]+\.js[^"]*)"', html)
print("script tags", len(srcs))

print("\n=== ENDPOINTS ===")
for p in paths:
    url = origin + p
    try:
        r = requests.get(url, headers=headers, timeout=20)
        text = (r.text or "")[:500]
        print(f"\n=== {r.status_code} {p} ===")
        print(text)
        if r.ok and "application/json" in (r.headers.get("content-type") or ""):
            try:
                data = r.json()
                print("keys:", list(data.keys()) if isinstance(data, dict) else type(data))
                blob = json.dumps(data, ensure_ascii=False)[:800]
                for kw in ("balance", "coin", "credit", "wallet", "point"):
                    if kw in blob.lower():
                        print("HIT keyword", kw, "in JSON")
            except Exception:
                pass
    except Exception as e:
        print(f"ERR {p}: {e}")
