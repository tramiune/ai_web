"""Aidancing.net HTTP helpers — gọi API qua session Chrome (fetch in-page).

Cần Playwright BrowserContext đã login (CDP hoặc persistent profile).
Không dùng requests thuần — Cloudflare chặn 503.
"""

import base64
import os
import time

AIDANCING_ORIGIN = os.environ.get("AIDANCING_ORIGIN", "https://aidancing.net")
DASHBOARD_URL = f"{AIDANCING_ORIGIN}/dashboard"


class AidancingApiClient:
    """Một tab nền + fetch API — không scrape DOM dashboard."""

    def __init__(self, context, warmup=True):
        self.context = context
        self._page = None
        if warmup:
            self.warmup()

    def _page_alive(self):
        return self._page is not None and not self._page.is_closed()

    def warmup(self):
        page = self._page if self._page_alive() else self.context.new_page()
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(1500)
        self._page = page
        return page

    def close(self):
        if self._page_alive():
            try:
                self._page.close()
            except Exception:
                pass
        self._page = None

    def _fetch_json(self, path):
        page = self.warmup()
        result = page.evaluate(
            """async (path) => {
                const r = await fetch(path, { credentials: 'include' });
                const text = await r.text();
                return { ok: r.ok, status: r.status, text };
            }""",
            path,
        )
        if not result.get("ok"):
            raise RuntimeError(f"Aidancing API {path} → HTTP {result.get('status')}: {result.get('text', '')[:200]}")
        import json
        return json.loads(result["text"])

    def list_jobs(self, page=0, size=50):
        return self._fetch_json(f"/api/proxy/jobs?page={page}&size={size}")

    def find_job(self, job_id):
        job_id = int(job_id)
        for p in range(3):
            data = self.list_jobs(page=p, size=50)
            for item in data.get("items", []):
                if int(item.get("id", 0)) == job_id:
                    return item
        return None

    def create_job(self, model_id, image_path, video_path, quality_mode="2", aspect_ratio="9:16"):
        """Upload qua form create (multipart) — vẫn cần 1 lần mở trang create."""
        page = self.context.new_page()
        try:
            create_url = f"{AIDANCING_ORIGIN}/create/general?id={model_id}"
            page.goto(create_url, wait_until="domcontentloaded", timeout=90000)
            page.set_input_files('input[name="image"]', image_path)
            page.set_input_files('input[name="video"]', video_path)
            page.evaluate(
                """({qualityMode, aspectRatio}) => {
                    const q = document.querySelector('[name=qualityMode]');
                    const a = document.querySelector('[name=aspectRatio]');
                    if (q) q.value = qualityMode;
                    if (a) a.value = aspectRatio;
                }""",
                {"qualityMode": str(quality_mode), "aspectRatio": aspect_ratio},
            )
            before_ids = {j["id"] for j in self.list_jobs(page=0, size=30).get("items", [])}
            page.locator("button.neon-ai-2").first.click()
            page.wait_for_url("**/dashboard**", timeout=120000)
            page.wait_for_timeout(3000)
            for _ in range(10):
                data = self.list_jobs(page=0, size=30)
                for item in data.get("items", []):
                    if item["id"] not in before_ids:
                        return str(item["id"])
                page.wait_for_timeout(2000)
            raise RuntimeError("Đã submit nhưng không thấy job mới trên API")
        finally:
            try:
                page.close()
            except Exception:
                pass
            self.warmup()

    def download_file(self, file_id, dest_path):
        """Tải /api/proxy/files/{id} qua fetch (credentials include)."""
        page = self.warmup()
        file_id = str(file_id).split("/")[-1]
        result = page.evaluate(
            """async (fileId) => {
                const r = await fetch('/api/proxy/files/' + fileId, { credentials: 'include' });
                if (!r.ok) return { ok: false, status: r.status };
                const buf = await r.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                const chunk = 0x8000;
                for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                }
                return { ok: true, b64: btoa(binary), size: bytes.length };
            }""",
            file_id,
        )
        if not result.get("ok"):
            raise RuntimeError(f"Download file {file_id} failed: HTTP {result.get('status')}")
        with open(dest_path, "wb") as f:
            f.write(base64.b64decode(result["b64"]))
        return os.path.abspath(dest_path)
