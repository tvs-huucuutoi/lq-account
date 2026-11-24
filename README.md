# LQ Account Tool — Web

Ứng dụng Flask giao diện dark mode để sinh **chuỗi dữ liệu thử nghiệm** theo định dạng `tk:mk`, tải TXT và xem lịch sử tạo dữ liệu trong trang quản trị.

> Các chuỗi được sinh ngẫu nhiên, không phải tài khoản Liên Quân thật, không được kiểm tra trên máy chủ game và không có chức năng dò/đăng nhập tài khoản.

## Chạy local

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Thiết lập biến môi trường quản trị trước khi chạy:

**Windows CMD**
```bat
set SECRET_KEY=thay-bang-chuoi-bi-mat-dai-va-ngau-nhien
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=thay-bang-mat-khau-manh
python app.py
```

Mở http://127.0.0.1:5000

## Deploy Render Free

1. Push toàn bộ repository lên GitHub.
2. Vào https://render.com và đăng nhập bằng GitHub.
3. Chọn **New → Blueprint** (hoặc tạo Web Service thủ công).
4. Chọn repository `lq-account`; Render đọc cấu hình `render.yaml`.
5. Khi được hỏi `ADMIN_PASSWORD`, nhập một mật khẩu quản trị mạnh. Có thể đổi `ADMIN_USERNAME`.
6. Deploy. Địa chỉ website sẽ có dạng `https://lq-account-tool.onrender.com`.

Nếu tạo Web Service thủ công:
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`
- Health Check Path: `/health`
- Environment Variables: `SECRET_KEY` (giá trị ngẫu nhiên dài), `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

## Chức năng

- Sinh từ 1 đến 5.000 cặp mỗi lần.
- Độ dài tài khoản: 3–32; mật khẩu: 4–64.
- Tải kết quả `.txt` theo định dạng `tk:mk`, mỗi dòng một cặp.
- Trang quản trị tại `/login`, xem 100 lượt tạo gần nhất và tổng số dòng đã tạo.
- Lịch sử chỉ lưu thời gian, thông số và số lượng; không lưu tài khoản hoặc mật khẩu được tạo.

## Lưu ý về Render Free

Render Free không cung cấp đĩa bền vững mặc định cho dịch vụ web. Cơ sở dữ liệu SQLite đặt trong `/tmp` có thể bị xóa khi dịch vụ khởi động lại hoặc triển khai lại. Vì vậy lịch sử trong bản Free chỉ mang tính tạm thời. Muốn lưu lịch sử lâu dài, cần gắn dịch vụ cơ sở dữ liệu bền vững hoặc dùng dịch vụ lưu trữ ngoài.

## Bảo mật

- Đổi `ADMIN_PASSWORD` và không đưa mật khẩu vào mã nguồn.
- Giữ `SECRET_KEY` ổn định, ngẫu nhiên và bí mật trên Render.
- Không dùng công cụ để tạo hoặc thử thông tin đăng nhập trên dịch vụ của bên thứ ba.
