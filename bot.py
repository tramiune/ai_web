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

# CREATE_URL đã được chuyển thành dynamic theo modelId trong đơn hàng
DASHBOARD_URL = "https://aidancing.net/dashboard"
WORKER_URL = "https://motionai-upload-api.traderfinn0312.workers.dev"

browser_lock = threading.Lock()

def download_file(url, filename, cookies=None):
    print(f"📥 Tải file: {filename}...")
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        response = requests.get(url, headers=headers, cookies=cookies, timeout=60)
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

# --- PHA 1: NẠP ĐƠN ---
def submit_to_aidancing(order_id):
    with browser_lock:
        doc_ref = db.collection('orders').document(order_id)
        doc = doc_ref.get()
        if not doc.exists: return
        data = doc.to_dict()
        if data.get('status') != 'pending': return

        print(f"\n⚡ [NẠP ĐƠN] {order_id}...")
        doc_ref.update({'status': 'processing', 'updatedAt': firestore.SERVER_TIMESTAMP})

        char_path = None
        vid_path = None

        # Thử tải tối đa 2 lần
        for attempt in range(1, 3):
            if attempt > 1: print(f"🔄 Thử lại lần {attempt}...")
            char_path = download_file(data.get('characterImageLink'), f"char_{order_id}.png")
            vid_path = download_file(data.get('referenceVideoLink'), f"vid_{order_id}.mp4")

            if char_path and vid_path:
                break
            time.sleep(2)

        if not char_path or not vid_path:
            print(f"❌ Không thể tải file sau 2 lần thử cho đơn {order_id}")
            doc_ref.update({
                'status': 'failed',
                'adminNote': 'Ảnh hoặc video quý khách tải lên không tồn tại, hệ thống sẽ xác minh và hoàn tiền.',
                'updatedAt': firestore.SERVER_TIMESTAMP
            })
            if char_path and os.path.exists(char_path): os.remove(char_path)
            if vid_path and os.path.exists(vid_path): os.remove(vid_path)
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
                model_id = data.get('modelId', '34')
                create_url = f"https://aidancing.net/create/general?id={model_id}"
                print(f"🌐 Vào trang tạo: {create_url}")
                page.goto(create_url, timeout=90000)
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

# --- PHA 2: RÌNH KẾT QUẢ ---
def check_finished_orders():
    try:
        # Nếu đang nạp đơn thì không check dashboard để tránh khóa profile
        if browser_lock.locked(): return

        now = datetime.now(timezone.utc)
        processing_orders = db.collection('orders').where(filter=FieldFilter("status", "==", "processing")).stream()

        orders_to_check = []
        for doc in processing_orders:
            d = doc.to_dict()
            job_id = d.get('aidancingJobId')
            submitted_at = d.get('submittedAt')

            if not job_id or job_id == "MANUAL": continue

            # Chỉ check nếu đã nạp > 10 phút
            if submitted_at:
                if (now - submitted_at).total_seconds() > 600:
                    orders_to_check.append(doc)
            else:
                orders_to_check.append(doc)

        if not orders_to_check: return

        print(f"\n🔍 [MONITOR] Đang rình kết quả cho {len(orders_to_check)} đơn đủ 10p...")
        with browser_lock:
            with sync_playwright() as p:
                browser = p.chromium.launch_persistent_context(
                    user_data_dir=os.path.abspath("bot_chrome_profile"),
                    headless=False, # Đổi thành True nếu chạy trên VPS/Ubuntu Server
                    ignore_default_args=["--enable-automation"],
                    args=["--disable-blink-features=AutomationControlled"]
                )
                page = browser.new_page()
                page.goto(DASHBOARD_URL, timeout=60000)
                print(f"🌐 Đang ở: {page.url}")
                time.sleep(10)

                # Nếu bị đá ra trang chủ/login thì dừng để bạn đăng nhập
                if "dashboard" not in page.url:
                    print(f"⚠️ Bot chưa đăng nhập! Bạn hãy đăng nhập trên cửa sổ Chrome đang mở này, sau đó chạy lại bot.")
                    time.sleep(60) # Để trình duyệt mở trong 1 phút cho bạn nhìn
                    browser.close()
                    return

                for doc in orders_to_check:
                    job_id = str(doc.to_dict().get('aidancingJobId'))
                    print(f"🧐 Đang tìm Job {job_id}...")

                    # Thử tìm text trong toàn bộ trang
                    if job_id not in page.content():
                        print(f"❌ Không thấy mã {job_id} trên trang này. Kiểm tra xem Job có ở trang 2 không?")
                        continue

                    # Tìm card bằng cách rộng hơn
                    card = page.locator(f'div:has-text("{job_id}")').last

                    if card.is_visible():
                        text = card.inner_text()
                        if any(x in text for x in ["Đã xong", "Tải Xuống", "Download", "Success"]):
                            print(f"🎉 Job {job_id} HOÀN TẤT! Đang xử lý...")
                            # ... (giữ nguyên logic xử lý thành công)
                            try:
                                # Bước 1: Thử lấy link trực tiếp từ nút Tải
                                download_link = card.locator('a[href*="download"], a:has-text("Tải"), a:has-text("Download")').first
                                ext_url = None
                                if download_link.is_visible():
                                    ext_url = download_link.get_attribute('href', timeout=3000)

                                # Bước 2 (Dự phòng): Click vào card để vào trang chi tiết lấy video
                                if not ext_url:
                                    try:
                                        print(f"🖱️ Click vào Job {job_id} để lấy link video...")
                                        card.click()
                                        page.wait_for_timeout(5000)
                                        video_element = page.locator('video source, video[src]').first
                                        ext_url = video_element.get_attribute('src')
                                        page.goto(DASHBOARD_URL) # Quay lại Dashboard
                                        time.sleep(3)
                                    except Exception as e:
                                        print(f"❌ Lỗi khi vào trang chi tiết cho Job {job_id}: {e}")

                                # Bước 3: Tải file nếu đã có link (kèm cookies)
                                if ext_url:
                                    if not ext_url.startswith('http'): ext_url = "https://aidancing.net" + ext_url

                                    # Lấy cookies từ trình duyệt để vượt qua lỗi 401
                                    browser_cookies = {c['name']: c['value'] for c in browser.cookies()}

                                    local_vid = download_file(ext_url, f"res_{doc.id}.mp4", cookies=browser_cookies)
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
                            except Exception as e:
                                print(f"⚠️ Lỗi xử lý Job {job_id}: {e}")
                                if page.url != DASHBOARD_URL:
                                    page.goto(DASHBOARD_URL)
                        elif any(x in text for x in ["Chưa thành công", "Thất bại", "Failed", "Error"]):
                            print(f"❌ Job {job_id} THẤT BẠI TRÊN AIDANCING!")
                            db.collection('orders').document(doc.id).update({
                                'status': 'failed',
                                'adminNote': 'Ảnh hoặc video quý khách tải lên không hợp lệ.',
                                'updatedAt': firestore.SERVER_TIMESTAMP
                            })
                        else:
                            print(f"⏳ Job {job_id} vẫn đang render...")
                browser.close()
    except Exception as e:
        print(f"❌ Lỗi monitor: {e}")

def start_bot():
    print("📡 MotionAI REAL-TIME BOT (v3.1 - Fix Link) IS ONLINE!")

    def monitor_loop():
        while True:
            check_finished_orders()
            time.sleep(30)

    threading.Thread(target=monitor_loop, daemon=True).start()

    # Listener đơn mới
    db.collection('orders').where(filter=FieldFilter("status", "==", "pending")).on_snapshot(
        lambda col_snapshot, changes, read_time: [
            threading.Thread(target=submit_to_aidancing, args=(ch.document.id,), daemon=True).start()
            for ch in changes if ch.type.name in ['ADDED', 'MODIFIED']
        ]
    )

    print("🟢 Đang trực chiến...")
    while True: time.sleep(1)

if __name__ == "__main__":
    start_bot()
