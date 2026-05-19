import time
import os
import requests
import base64
from playwright.sync_api import sync_playwright

# --- CONFIGURATION ---
# Bot này sử dụng chung profile Chrome với bot.py của bạn để giữ đăng nhập
CHROME_PROFILE_PATH = os.path.abspath("bot_chrome_profile")

def download_image_via_browser(page, url, filename):
    """Sử dụng trình duyệt để tải ảnh về (vượt qua các lớp bảo mật/session)"""
    print(f"📥 Đang tải ảnh: {filename}...")
    try:
        content = page.evaluate(f"""
            async () => {{
                const response = await fetch("{url}");
                const blob = await response.blob();
                return new Promise((resolve) => {{
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                }});
            }}
        """)
        header, encoded = content.split(",", 1)
        data = base64.b64decode(encoded)
        with open(filename, "wb") as f:
            f.write(data)
        print(f"✅ Đã lưu file: {os.path.abspath(filename)}")
        return True
    except Exception as e:
        print(f"❌ Lỗi tải ảnh: {e}")
        # Phương án dự phòng: Chụp ảnh phần tử
        return False

def generate_image_chatgpt(prompt, output_filename="result_image.png"):
    """Vào ChatGPT, nhập prompt gen ảnh và tải về"""
    with sync_playwright() as p:
        print("🚀 Đang khởi động trình duyệt...")
        browser = p.chromium.launch_persistent_context(
            user_data_dir=CHROME_PROFILE_PATH,
            channel="chrome",
            headless=False, # Để False để bạn thấy quá trình chạy
            slow_mo=500,
            args=["--disable-blink-features=AutomationControlled"]
        )
        page = browser.new_page()

        try:
            print("🌐 Truy cập ChatGPT...")
            page.goto("https://chatgpt.com", timeout=90000)

            # Kiểm tra xem đã đăng nhập chưa bằng cách tìm ô nhập liệu
            try:
                page.wait_for_selector("#prompt-textarea", timeout=5000)
            except:
                print("⚠️ Không tìm thấy ô nhập liệu. Có thể bạn chưa đăng nhập.")
                print("👉 Vui lòng đăng nhập trên cửa sổ trình duyệt đang mở...")
                # Đợi cho đến khi đăng nhập xong và ô prompt xuất hiện (đợi tối đa 5 phút)
                page.wait_for_selector("#prompt-textarea", timeout=300000)
                print("✅ Đã phát hiện đăng nhập thành công!")

            # Đợi ô nhập liệu sẵn sàng
            print(f"⌨️ Đang nhập prompt: {prompt}")
            textarea = page.wait_for_selector("#prompt-textarea")
            textarea.fill(prompt)
            time.sleep(1)
            page.keyboard.press("Enter")

            print("⏳ AI đang xử lý (vẽ ảnh)...")

            # Đợi cho đến khi ảnh xuất hiện (ChatGPT gen ảnh DALL-E thường mất 20-40s)
            # Selector này tìm ảnh được gen bởi DALL-E
            img_selector = 'img[alt*="Generated image"], img[src*="files.oaiusercontent.com"]'

            # Đợi tối đa 2 phút cho việc gen ảnh
            try:
                page.wait_for_selector(img_selector, timeout=120000)
                print("✨ Đã thấy ảnh xuất hiện!")
            except:
                print("❌ Quá thời gian chờ mà không thấy ảnh. Có thể prompt không gen được ảnh hoặc lỗi.")
                return None

            # Đợi thêm vài giây để ảnh load xong chất lượng cao
            time.sleep(10)

            # Lấy ảnh cuối cùng (mới nhất)
            images = page.locator(img_selector).all()
            last_image = images[-1]

            # Thử lấy link tải trực tiếp nếu có nút download (thường hiện khi di chuột vào)
            # Hoặc click vào ảnh để mở to rồi tìm nút tải
            img_src = last_image.get_attribute("src")

            if img_src:
                if img_src.startswith("http"):
                    success = download_image_via_browser(page, img_src, output_filename)
                    if not success:
                        # Nếu tải link fail, chụp màn hình element đó làm dự phòng
                        last_image.screenshot(path=output_filename)
                        print("📸 Đã chụp màn hình ảnh vì không tải được file trực tiếp.")
                else:
                    # Link dạng blob hoặc khác
                    last_image.screenshot(path=output_filename)
                    print("📸 Đã chụp màn hình ảnh (dạng Blob).")
            else:
                print("❌ Không lấy được thuộc tính src của ảnh.")

        except Exception as e:
            print(f"❌ Lỗi trong quá trình chạy: {e}")
        finally:
            print("🏁 Đóng trình duyệt sau 5 giây...")
            time.sleep(5)
            browser.close()

if __name__ == "__main__":
    user_prompt = input("Nhập nội dung muốn vẽ (Prompt): ")
    if not user_prompt:
        user_prompt = "Vẽ một con mèo phi hành gia trên mặt trăng, phong cách digital art"

    # Tạo tên file theo thời gian
    filename = f"gen_{int(time.time())}.png"
    generate_image_chatgpt(user_prompt, filename)
