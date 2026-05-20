import time
from datetime import datetime, timedelta, timezone
import firebase_admin
from firebase_admin import credentials, firestore

# --- CONFIGURATION ---
DAYS_TO_KEEP = 7  # Số ngày giữ lại dữ liệu
BATCH_SIZE = 100  # Số lượng xóa mỗi mẻ

cred = credentials.Certificate("serviceAccountKey.json")
try:
    firebase_admin.get_app()
except ValueError:
    firebase_admin.initialize_app(cred)
    
db = firestore.client()

def delete_old_orders():
    print(f"🧹 Bắt đầu dọn dẹp các đơn hàng cũ hơn {DAYS_TO_KEEP} ngày...")
    
    # Tính thời điểm chốt (cutoff time)
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=DAYS_TO_KEEP)
    
    # Lấy reference đến collection orders
    orders_ref = db.collection('orders')
    
    # Lọc các đơn hàng có trường updatedAt cũ hơn cutoff_time
    # Chỉ xóa các đơn hàng đã xong (completed) hoặc lỗi (failed) để tránh xóa nhầm đơn đang xử lý
    query = orders_ref.where('status', 'in', ['completed', 'failed']).where('updatedAt', '<', cutoff_time).limit(BATCH_SIZE)
    
    deleted_count = 0
    while True:
        docs = list(query.stream())
        if not docs:
            break
            
        # Xóa theo mẻ (batch delete)
        batch = db.batch()
        for doc in docs:
            print(f"🗑️ Đang xóa đơn hàng: {doc.id}")
            batch.delete(doc.reference)
            
        batch.commit()
        deleted_count += len(docs)
        print(f"✅ Đã xóa {len(docs)} đơn hàng.")
        
        # Nghỉ 1 giây để tránh quá tải API của Firebase
        time.sleep(1)
        
    print(f"🎉 Hoàn tất! Tổng cộng đã dọn dẹp được {deleted_count} đơn hàng.")

if __name__ == "__main__":
    delete_old_orders()
