import time
import os
import requests
import firebase_admin
import re
import threading
from datetime import datetime, timezone
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from playwright.sync_api import sync_playwright

# --- CONFIGURATION ---
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

CREATE_URL = "https://aidancing.net/create/general?id=34"
DASHBOARD_URL = "https://aidancing.net/dashboard"
WORKER_URL = "https://motionai-upload-api.traderfinn0312.workers.dev"

# Khóa luồng để tránh mở nhiều trình duyệt dùng chung 1 Profile gây lỗi
browser_lock = threading.Lock()

def download_file(url, filename):
    print(f"📥 Tải file: {filename}...")
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=60)
        response.raise_for_status()
        with open(filename, 'wb') as f:
            f.write(response.content)
        return os.path.abspath(filename)
    except Exception as e:
        print(f"❌ Lỗi tải file: {e}")
        return None

def upload_to_r2(file_path, folder="results"):
    print(f"📤 Đang upload lên R2...")
    try:
        file_name = f"{folder}/{int(time.time() * 1000)}_{os.path.basename(file_path)}"
        url = f"{WORKER_URL}/?file={requests.utils.quote(file_name)}&t={int(time.time() * 1000)}"
        with open(file_path, 'rb') as f:
            response = requests.post(url, data=f, headers={'Content-Type': 'video/mp4'}, timeout=120)
            if response.status_code == 200:
                return response.json().get('url')
    except Exception as e:
        print(f"❌ Lỗi R2: {e}")
    return None

# --- PHA 1: NẠP ĐƠN (HÀNG ĐỢI TUẦN TỰ) ---
def submit_to_aidancing(order_id):
    # Đảm bảo chỉ 1 trình duyệt mở tại 1 thời điểm
    with browser_lock:
        doc_ref = db.collection('orders').document(order_id)
        doc = doc_ref.get()
        if not doc.exists: return
        data = doc.to_dict()

        if data.get('status') != 'pending': return

        print(f"\n⚡ [NẠP ĐƠN] {order_id}...")
        doc_ref.update({'status': 'processing', 'updatedAt': firestore.SERVER_TIMESTAMP})

        char_path = download_file(data.get('characterImageLink'), f"char_{order_id}.png")
        vid_path = download_file(data.get('referenceVideoLink'), f"vid_{order_id}.mp4")

        if not char_path or not vid_path:
            doc_ref.update({'status': 'pending'})
            return

        with sync_playwright() as p:
            browser = p.chromium.launch_persistent_context(
                user_data_dir=os.path.abspath("bot_chrome_profile"),
                channel="chrome", headless=False, slow_mo=500,
                ignore_default_args=["--enable-automation"],
                args=["--disable-blink-features=AutomationControlled"]
            )
            page = browser.new_page()
            try:
                page.goto(CREATE_URL, timeout=90000)
                page.set_input_files('input[name="image"]', char_path)
                page.set_input_files('input[name="video"]', vid_path)
                page.locator('button.neon-ai-2').first.click()

                page.wait_for_url("**/dashboard**", timeout=60000)
                time.sleep(5)

                job_ids = re.findall(r'\b\d{6}\b', page.content())
                if job_ids:
                    job_id = job_ids[0]
                    print(f"🆔 LẤY ĐƯỢC JOB ID: {job_id}")
                    doc_ref.update({'aidancingJobId': job_id, 'submittedAt': firestore.SERVER_TIMESTAMP})

            except Exception as e:
                print(f"❌ Lỗi nạp: {e}")
                doc_ref.update({'adminNote': f"Bot nạp lỗi: {str(e)}"})
            finally:
                browser.close()
                if os.path.exists(char_path): os.remove(char_path)
                if os.path.exists(vid_path): os.remove(vid_path)

# --- PHA 2: RÌNH KẾT QUẢ (30 GIÂY/LẦN, CHỈ ĐƠN > 10 PHÚT) ---
def result_monitor_thread():
    print("🕵️ Luồng rình kết quả đã kích hoạt (Chu kỳ 30s)...")
    while True:
        try:
            # Nếu trình duyệt nạp đơn đang bận thì bỏ qua lần rình này
            if not browser_lock.locked():
                now = datetime.now(timezone.utc)
                processing_orders = db.collection('orders').where(filter=FieldFilter("status", "==", "processing")).stream()

                orders_to_check = []
                for doc in processing_orders:
                    d = doc.to_dict()
                    job_id = d.get('aidancingJobId')
                    submitted_at = d.get('submittedAt') # Thời điểm bấm nút Tạo thật sự

                    if not job_id or job_id == "MANUAL": continue

                    # Kiểm tra nếu đã trôi qua ít nhất 600 giây (10 phút)
                    if submitted_at:
                        diff = (now - submitted_at).total_seconds()
                        if diff > 600:
                            orders_to_check.append(doc)
                        else:
                            print(f"⏳ Đơn {job_id} mới nạp được {int(diff)}s, chưa tới 10p, bỏ qua.")
                    else:
                        # Trường hợp đơn cũ không có submittedAt, cứ check cho chắc
                        orders_to_check.append(doc)

                if orders_to_check:
                    print(f"\n🔍 [MONITOR] Đang rình kết quả cho {len(orders_to_check)} đơn đủ tuổi...")
                    with browser_lock: # Dùng lock để không xung đột profile
                        with sync_playwright() as p:
                            browser = p.chromium.launch_persistent_context(
                                user_data_dir=os.path.abspath("bot_chrome_profile"),
                                channel="chrome", headless=True, # Rình ẩn danh cho nhẹ
                                ignore_default_args=["--enable-automation"],
                                args=["--disable-blink-features=AutomationControlled"]
                            )
                            page = browser.new_page()
                            page.goto(DASHBOARD_URL, timeout=60000)
                            time.sleep(5)
                            for doc in orders_to_check:
                                job_id = doc.to_dict().get('aidancingJobId')
                                card = page.locator(f'div:has-text("{job_id}")').last
                                if card.is_visible() and ("Đã xong" in card.inner_html() or "Tải Xuống" in card.inner_html()):
                                    print(f"🎉 Job {job_id} HOÀN TẤT! Đang xử lý về R2...")
                                    download_btn = card.locator('a:has-text("Tải Xuống")').first
                                    ext_url = download_btn.get_attribute('href')
                                    if not ext_url.startswith('http'): ext_url = "https://aidancing.net" + ext_url

                                    local_vid = download_file(ext_url, f"res_{doc.id}.mp4")
                                    if local_vid:
                                        r2_url = upload_to_r2(local_vid)
                                        if r2_url:
                                            db.collection('orders').document(doc.id).update({
                                                'status': 'completed',
                                                'resultLink': r2_url,
                                                'updatedAt': firestore.SERVER_TIMESTAMP
                                            })
                                            print(f"✅ ĐÃ TRẢ HÀNG CHO ĐƠN {doc.id}")
                                            os.remove(local_vid)
                            browser.close()

            time.sleep(30) # Chu kỳ rình 30 giây
        except Exception as e:
            print(f"❌ Lỗi monitor: {e}")
            time.sleep(30)

def start_bot():
    print("📡 MotionAI REAL-TIME BOT (v3.0) IS ONLINE!")
    monitor = threading.Thread(target=result_monitor_thread, daemon=True)
    monitor.start()

    orders_ref = db.collection('orders').where(filter=FieldFilter("status", "==", "pending"))

    def on_snapshot(col_snapshot, changes, read_time):
        for change in changes:
            if change.type.name in ['ADDED', 'MODIFIED']:
                threading.Thread(target=submit_to_aidancing, args=(change.document.id,), daemon=True).start()

    orders_ref.on_snapshot(on_snapshot)
    print("🟢 Đang trực chiến đơn hàng mới...")

    while True:
        time.sleep(1)

if __name__ == "__main__":
    start_bot()
