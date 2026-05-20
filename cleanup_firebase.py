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

def delete_old_docs(collection_name, status_field=None, status_values=None):
    print(f"\n🧹 Bắt đầu dọn dẹp collection [{collection_name}] cũ hơn {DAYS_TO_KEEP} ngày...")
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=DAYS_TO_KEEP)
    
    col_ref = db.collection(collection_name)
    
    # Ưu tiên dùng trường updatedAt nếu có, nếu không thì duyệt stream (firebase python API cho phép lấy theo metadata nhưng chậm hơn)
    # Tuy nhiên để chắc ăn và áp dụng được index, ta dùng updatedAt/createdAt.
    # Trong code webhook, thường có createdAt hoặc updatedAt. 
    # Nếu hệ thống không có trường này, đoạn code where() có thể lỗi index.
    # Giải pháp an toàn nhất: lấy tất cả doc, duyệt và kiểm tra doc.update_time (built-in)
    
    docs = col_ref.stream()
    docs_to_delete = []
    
    for doc in docs:
        data = doc.to_dict()
        
        # Nếu có lọc theo status
        if status_field and status_values:
            if data.get(status_field) not in status_values:
                continue
                
        # Lấy thời gian update cuối cùng của document (chính xác 100% từ Firestore metadata)
        update_time = doc.update_time
        if update_time and update_time < cutoff_time:
            docs_to_delete.append(doc.reference)
            
    if not docs_to_delete:
        print(f"✅ Không có document rác nào cần xóa trong [{collection_name}].")
        return
        
    print(f"🗑️ Tìm thấy {len(docs_to_delete)} document cũ trong [{collection_name}]. Bắt đầu xóa...")
    
    # Xóa theo mẻ (tối đa 500 doc mỗi mẻ theo limit của Firestore batch)
    total_deleted = 0
    for i in range(0, len(docs_to_delete), BATCH_SIZE):
        batch = db.batch()
        batch_refs = docs_to_delete[i:i + BATCH_SIZE]
        for ref in batch_refs:
            batch.delete(ref)
        batch.commit()
        total_deleted += len(batch_refs)
        print(f"   -> Đã xóa {total_deleted}/{len(docs_to_delete)}...")
        time.sleep(1)
        
    print(f"🎉 Hoàn tất dọn dẹp [{collection_name}]! Đã xóa {total_deleted} bản ghi.")

if __name__ == "__main__":
    print(f"=== BẮT ĐẦU CHƯƠNG TRÌNH DỌN RÁC (Giữ lại {DAYS_TO_KEEP} ngày) ===")
    
    # 1. Dọn dẹp đơn hàng (chỉ xóa đơn đã xong hoặc lỗi)
    delete_old_docs('orders', status_field='status', status_values=['completed', 'failed'])
    
    # 2. Dọn dẹp lịch sử nạp coin (topups) - thường thì giữ lại lịch sử cũng tốt, nhưng nếu bạn muốn dọn thì bật
    delete_old_docs('topups', status_field='status', status_values=['approved', 'rejected', 'failed', 'pending'])
    
    # 3. Dọn dẹp Users (Người dùng không hoạt động / không nạp thẻ trong 7 ngày)
    # LƯU Ý: Xóa user có thể làm mất số coin còn dư của họ nếu họ không đăng nhập sau 7 ngày!
    delete_old_docs('users')
    
    print("\n✅ TẤT CẢ QUÁ TRÌNH DỌN DẸP ĐÃ HOÀN TẤT!")
