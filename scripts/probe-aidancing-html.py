#!/usr/bin/env python3
"""Search Aidancing dashboard HTML for balance markers."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from project_env import load_project_env, get_env  # noqa: E402

load_project_env()

cookie = (get_env("AIDANCING_COOKIE") or "").strip()
origin = (get_env("AIDANCING_ORIGIN") or "https://aidancing.net").rstrip("/")
headers = {
    "Cookie": cookie,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
    "Referer": f"{origin}/dashboard",
}
r = requests.get(f"{origin}/dashboard", headers=headers, timeout=30)
html = r.text or ""
print("status", r.status_code, "len", len(html))

for kw in ("coin", "balance", "wallet", "credit", "xu", "Coin", "remaining"):
    idx = 0
    hits = 0
    while hits < 5:
        i = html.lower().find(kw.lower(), idx)
        if i < 0:
            break
        snippet = html[max(0, i - 80) : i + 120].replace("\n", " ")
        print(f"\n--- {kw} @ {i} ---")
        print(snippet)
        idx = i + len(kw)
        hits += 1

# Thymeleaf / inline numbers near header
for pat in (
    r"([\d]{1,6}(?:\.\d+)?)\s*</[^>]{0,40}>\s*<[^>]{0,40}>\s*Coin",
    r"Coin[^<]{0,30}([\d]{1,6}(?:\.\d+)?)",
    r'id="[^"]*coin[^"]*"[^>]*>([^<]+)<',
    r'class="[^"]*coin[^"]*"[^>]*>([^<]+)<',
):
    ms = re.findall(pat, html, re.I)
    if ms:
        print("\nPATTERN", pat[:50], ms[:10])

# fetch common static js and grep api paths
for js_path in ("/js/dashboard.js", "/js/app.js", "/js/main.js", "/static/js/main.js"):
    try:
        jr = requests.get(origin + js_path, headers=headers, timeout=15)
        if jr.status_code != 200:
            continue
        body = jr.text
        apis = sorted(set(re.findall(r"/api/proxy/[a-zA-Z0-9_/\-]+", body)))
        if apis:
            print(f"\nJS {js_path} api paths ({len(apis)}):")
            for a in apis[:30]:
                print(" ", a)
    except Exception as e:
        print("js err", js_path, e)
