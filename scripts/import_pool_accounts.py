#!/usr/bin/env python3
"""Import email|password lines vào account_pool.json (RoboNeo motion bot)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if not (ROOT / "account_pool.py").is_file():
    ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from account_pool import upsert_account  # noqa: E402
from huanaihub import parse_roboneo_account  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Import nick vào account_pool.json")
    p.add_argument("file", help="File text: mỗi dòng email|password hoặc email:password")
    p.add_argument("--trans-id", default="", help="Mã đơn huanaihub (optional)")
    p.add_argument("--reset-status", action="store_true", help="Set status=active cho nick import")
    args = p.parse_args()

    path = Path(args.file)
    if not path.is_file():
        print(f"❌ Không thấy file: {path}")
        return 1

    lines = [
        ln.strip()
        for ln in path.read_text(encoding="utf-8").splitlines()
        if ln.strip() and not ln.strip().startswith("#")
    ]
    added = 0
    for raw in lines:
        email, password = parse_roboneo_account(raw)
        upsert_account(
            email,
            password,
            status="active" if args.reset_status else "active",
            source="huanaihub",
            trans_id=args.trans_id,
        )
        added += 1
        print(f"  + {email}")

    print(f"✅ Import {added} nick → {ROOT / 'account_pool.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
