# Chi tiết dự án: App Android (Web View) Sáng tác & Đọc truyện

## 1. Yêu cầu gốc
tôi muốn viết 1 app android dạng web view để viết truyện có chức năng như sau:
tap viết truyện
+ viết truyện có tính năng có ô nhập để viết truyện và có nút nhấn sẽ tự động viết vào trang giấy ảo bên dưới ( đó là trang truyện)
+ khi viết có phần chọn nhân vật để biết ai là người nói và người nói mình sẽ app vào lúc đầu hoặc có thể thêm vào trong khi đang viết thấy cần nhân vật đó
+ cho phép chèn hình ảnh hình ảnh sẽ nằm vị trí tự do có thể kéo thả điều chỉnh kích thước hình ảnh nhưng ảnh sẽ dưới chữ và khi lưu nó sẽ cố định vào trang đọc sẽ dễ dàng
+ khi viết xong thì có nút lưu sẽ lưu vào database của app và được làm ảnh bìa truyện tải lên từ máy

tap đọc truyện
+ có thanh tìm kiếm truyện có bộ lọc truyện theo thể loại, tác giả, trạng thái, năm phát hành, và từng truyện sẽ hiện danh sách và khi chạm vô thì hiển cả cuốn truyện full màn hình và có hiệu ứng lật trang

tap chỉnh sửa truyện
+ chỉnh sửa tên truyện, mô tả truyện, thể loại, tác giả, trạng thái, năm phát hành, ảnh đại diện truyện
+ chỉnh sửa nội dung truyện đã viết
+ chỉnh sửa ảnh đã chèn trong truyện
+ chỉnh sửa danh sách nhân vật
+ chỉnh ảnh

## 2. Yêu cầu chi tiết đã thống nhất qua Q&A
- **Khung giấy ảo (Tab Viết truyện):** Khung có kích thước bằng màn hình điện thoại cố định. Tự động thêm trang mới nếu văn bản nhập vào bị dài quá trang hiện tại.
- **Hiển thị thoại nhân vật:** Định dạng cơ bản bằng chữ: `Tên nhân vật: Nội dung thoại`.
- **Thứ tự lớp ảnh/chữ (Z-index):** Khi ảnh bị chèn đè lên chữ, **chữ sẽ luôn được ưu tiên hiển thị ở trên** (z-index của chữ cao hơn ảnh).
- **Lưu trữ Database:** Văn bản và thông tin truyện được lưu trên cơ sở dữ liệu **Firebase**, còn hình ảnh sẽ được lưu trữ qua **Google Drive**.
- **Hiệu ứng lật trang:** Hiệu ứng lật trang ở Tab Đọc truyện phải là hiệu ứng 3D như lật một trang sách ngoài đời thật.
- **Tính năng Chỉnh ảnh:** Có đầy đủ công cụ kéo thả, thay đổi kích thước. Đặc biệt phải có nút **Đổi ảnh**, khi đổi thì ảnh mới sẽ thay thế vào đúng vị trí và giữ nguyên kích thước của ảnh cũ (không làm lệch trang truyện).

## 3. Lịch sử chỉnh sửa và Xây dựng
- **[13/07/2026] Khởi tạo dự án:**
  + Tạo cấu trúc dự án React + Vite (JS) + CapacitorJS cho môi trường Android Web View.
  + Thiết lập CSS Dark mode, UI Glassmorphism hiện đại.
- **[13/07/2026] Phát triển Tab Viết Truyện:**
  + Tạo `WriteTab.jsx`.
  + Tích hợp thư viện `react-rnd` để chèn ảnh có thể kéo thả tự do và thay đổi kích thước bằng thao tác cảm ứng/chuột.
  + Cài đặt logic xếp lớp: Text luôn hiển thị đè lên trên hình ảnh.
  + Thêm logic tự động phân trang khi chữ đầy khung dọc.
  + Thêm tính năng "Thay thế ảnh" để chèn ảnh mới đè vào tọa độ/kích thước ảnh hiện tại.
- **[13/07/2026] Phát triển Tab Đọc Truyện:**
  + Tạo `ReadTab.jsx`.
  + Tích hợp thư viện `react-pageflip` để tạo hiệu ứng lật trang sách 3D vật lý toàn màn hình.
  + Xây dựng lưới danh sách truyện với thanh tìm kiếm và nút bộ lọc.
- **[13/07/2026] Phát triển Tab Chỉnh Sửa:**
  + Tạo `EditTab.jsx`.
  + Bổ sung tính năng thay đổi ảnh bìa truyện, cập nhật tên truyện.
  + Viết logic liên kết: Nhấn sửa nội dung sẽ tự động đưa người dùng và dữ liệu truyện đó quay trở lại giao diện Tab Viết Truyện để làm việc.
- **[13/07/2026] Hoàn thiện State & Chạy thử:**
  + Xây dựng `StoryContext.jsx` để mô phỏng Database của Firebase & Google Drive (Lưu trữ tạm trạng thái).
  + Khởi chạy thành công local dev server tại `http://localhost:5173`.