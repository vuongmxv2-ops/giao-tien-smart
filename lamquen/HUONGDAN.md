# Làm quen thầy cô — Hướng dẫn

Ứng dụng web giúp thầy cô phân hiệu **Giao Tiến** nhận mặt thầy cô phân hiệu **Hoành Sơn** (và ngược lại) ngay trên điện thoại.

## Các chức năng
| Mục | Công dụng |
|---|---|
| 🃏 **Thẻ học** | Hiện ảnh → chạm để lật xem tên, môn dạy. Bấm "Đã nhớ"/"Chưa nhớ". Người chưa nhớ sẽ hiện lại nhiều hơn. |
| 🎯 **Đố vui** | Hai kiểu: *nhìn ảnh đoán tên* (4 đáp án) và *nghe tên tìm ảnh* (4 ảnh). Có điểm và chuỗi đúng. |
| 📺 **Thi đấu nhiều máy (5 ô)** | Trong Đố vui. Màn hình chính (máy chiếu) hiện 5 ảnh + mã QR. Mọi người quét QR bằng điện thoại, nhập tên, chọn tên cho từng ô rồi nộp. Màn hình chính công bố đáp án và bảng xếp hạng. **Cần mạng Internet và phần mềm phải được đưa lên mạng** thì điện thoại mới vào được. |
| 👥 **Danh bạ** | Xem tất cả ảnh, tìm theo tên/môn, chạm để phóng to. Dấu ✅ = đã nhớ. |
| ⚙️ **Cài đặt** | Chọn phân hiệu cần học, xem tiến độ, nhập ảnh, xuất tệp dữ liệu. |

Tiến độ học lưu riêng trên điện thoại của từng người (không cần đăng nhập).

## Đưa 90 ảnh vào (cách dễ nhất)
1. Đổi tên từng ảnh theo mẫu: `Họ tên - Môn dạy.jpg` — ví dụ `Nguyễn Thị Hoa - Ngữ văn.jpg`.
   Gom ảnh Hoành Sơn vào một thư mục, ảnh Giao Tiến vào thư mục khác.
2. Mở ứng dụng trên máy tính → **⚙️ Cài đặt** → ô *"Các ảnh này thuộc phân hiệu"* gõ `Hoành Sơn` → **Chọn ảnh** → chọn hết ảnh Hoành Sơn.
3. Đổi ô phân hiệu thành `Giao Tiến` → chọn ảnh Giao Tiến.
4. Bấm **⬇️ Xuất danhsach.js** → tệp tải về đã chứa sẵn cả ảnh (ảnh tự thu nhỏ còn ~40 KB/ảnh).
5. Thay tệp `danhsach.js` trong thư mục này bằng tệp vừa tải, rồi đưa thư mục lên mạng (xem dưới).

Cách khác: tự sửa `danhsach.js` và chép ảnh vào thư mục `anh/`.

## Đưa lên mạng để thầy cô mở bằng điện thoại
Tải 2 tệp `index.html` và `danhsach.js` lên một thư mục mới (ví dụ `nhandien/`) trong kho GitHub Pages đang dùng cho GIAO TIẾN SMART.
Đường dẫn sẽ là `https://<tài-khoản>.github.io/<kho>/nhandien/` — gửi link (hoặc mã QR) cho thầy cô.
Trên điện thoại: mở link → menu trình duyệt → **Thêm vào màn hình chính** để dùng như ứng dụng.

> Lưu ý quyền riêng tư: link công khai thì ai có link cũng xem được ảnh. Nên xin phép thầy cô trước khi dùng ảnh.
