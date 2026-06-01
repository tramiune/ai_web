# Bot Pure HTTP (nhánh `feat/pure-http-aidancing`)

Không cần Chrome, CDP, Playwright khi chạy `--mode api` hoặc `--mode http`.

## Cấu hình cookie (làm sau)

```bash
cp .env.example .env
# Sửa AIDANCING_COOKIE=JSESSIONID=...
```

Hoặc export:

```bash
export AIDANCING_COOKIE='JSESSIONID=...'
```

## Chạy

```bash
pip install -r requirements.txt
python bot.py --name motionai_vps_bot --mode http
```

Bật bot trên Admin → Bots.

## Flow

1. `POST /create/general` — multipart (ảnh + video)
2. `GET /api/proxy/jobs` — poll (mặc định theo `BOT_POLL_*`, ~20–120s)
3. `COMPLETED` → `GET /api/proxy/files/{id}` → upload R2
4. `FAILED` / `ERROR` / `CANCELLED` → hoàn coin + Telegram

## So với nhánh main

| | main (`--mode api`) | nhánh này (`--mode http`) |
|---|---|---|
| Chrome/CDP | Bắt buộc | Không |
| Auth | Cookie trong Chrome | `AIDANCING_COOKIE` trong `.env` |
| Poll | fetch in-page | `requests` |

`--mode browser` vẫn dùng Playwright scrape dashboard (không đổi).
