// Cấu hình dự án Firebase "giao-tien-smart" (Phương án B).
// Các giá trị này là định danh công khai của ứng dụng web (không phải mật khẩu);
// quyền truy cập dữ liệu do Firestore Security Rules quyết định.
// Chỉ dùng ở chế độ Firestore (js/fbmode.js – bật riêng từng máy bằng ?fb=1) và trang thử fb-test.html.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA8rq4LIo3uFHnlIskOxh-A0GDH6oUx4UI',
  authDomain: 'giaotien-smart.firebaseapp.com',
  projectId: 'giaotien-smart',
  storageBucket: 'giaotien-smart.firebasestorage.app',
  messagingSenderId: '166510352913',
  appId: '1:166510352913:web:98815e3c7d400c9157efb0'
};

// Cơ sở dữ liệu Firestore có mã "default" (KHÔNG phải "(default)") → getFirestore(app, FIRESTORE_DB).
// REST: https://firestore.googleapis.com/v1/projects/giaotien-smart/databases/default/documents/...
export const FIRESTORE_DB = 'default';

// Web app liên kết tài khoản (dự án Apps Script "GTS Firebase Sync" – Link.gs), triển khai 27/11/2026 (Phiên bản 4).
// Khi sửa Link.gs: Triển khai → Quản lý → bút chì → Phiên bản mới (giữ nguyên địa chỉ này).
export const LINK_URL = 'https://script.google.com/macros/s/AKfycbxrcK-R7GED3sIYWwovFI1OOjCm4JTWSV4hbUoHs8f34qpUyeyL6KGpT0oBUORH9A8krQ/exec';

// Phiên bản mã bộ máy đọc (engine.html trong dự án đồng bộ = frontend/js/engine/backend.js). Đổi khi cập nhật mã backend
// để mọi máy tải lại bản mới (ví dụ 'be-1.5.7-1': backend 1.5.7, lần gộp thứ 1).
export const ENGINE_VERSION = 'be-1.5.7-1';

// Tài khoản tên đăng nhập + mật khẩu dùng email nội bộ <tên>@gts.local trên Firebase.
export const PW_EMAIL_DOMAIN = 'gts.local';
