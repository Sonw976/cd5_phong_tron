# Dữ liệu hiển thị

`profiles.js` là nguồn dữ liệu được giao diện sử dụng. Mỗi bản ghi nên được đối chiếu với một thư mục hồ sơ gốc trước khi xuất bản.

Mỗi bản ghi chính thức có `code`, `image`, `bio`, `contributions`, `memories` và `sources`. `sources.docx` và `sources.portrait` dùng đường dẫn tương đối từ thư mục `Chủ đề 5`; `sources.references` lưu mã dòng Excel và các liên kết tham khảo ở cột G. Mâu thuẫn ngay trong nguồn được giữ tại `sources.verificationNotes`, không tự động sửa theo suy đoán.

`PROFILE_DATA` hiện chứa đủ 13 hồ sơ Hiệu trưởng `HT-01`–`HT-13`, 19 hồ sơ Bí thư Đảng ủy `DU-01`–`DU-19` và danh mục nền 29 Bí thư Đoàn trường `DT-01`–`DT-29`. Cả ba nhóm theo thứ tự Excel, dùng ảnh chân dung tương ứng trong thư mục hồ sơ. Hiệu trưởng và Bí thư Đảng ủy đã được biên tập nội dung; nhóm Bí thư Đoàn đang được bổ sung dần từ DOCX/cột G, trường chưa xử lý hiển thị `Đang xác minh...`.

`DEMO_PROFILE_DATA` chỉ còn phục vụ đối chiếu trong thời gian chuyển đổi. Ver 2 không còn dùng dữ liệu mẫu để dựng ba phân khu; toàn bộ 61 khung lấy từ `PROFILE_DATA`.
