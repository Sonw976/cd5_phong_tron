# Cấu Trúc Riêng Của Chủ Đề 5 — Phiên Bản 2

Tài liệu này mô tả phần phân vùng và hồ sơ riêng của `cd5_ver_2.html`. Phiên bản hiện tại nới hành lang thêm 10 đơn vị về phía cửa vào để chứa đủ danh mục 61 hồ sơ; sảnh cuối giữ nguyên kích thước.

## Tuyến Nội Dung

```text
Bí thư Đoàn Trường → Hiệu trưởng → Bí thư Đảng ủy
```

## 1. Nửa Trước Hành Lang — Bí Thư Đoàn Trường

- Phạm vi nhận diện: `Z = 0.4 .. 39.0` trên cả hai tường `X ≈ ±7.84`.
- Nền xanh nhạt `0xdcebed`, nẹp và dải chân tường xanh teal `0x2c788b`.
- Hai biển tên “BÍ THƯ ĐOÀN TRƯỜNG”, mỗi tường một biển.
- 29 khung palette `youth`, scale `1.5`, đánh số xen kẽ trái–phải: `15 trái + 14 phải`.
- Các hàng bắt đầu tại `Z = 36.5`, cách nhau `2.55`; khung cuối ở tường trái tại `Z = 0.8`.

## 2. Nửa Sau Hành Lang — Hiệu Trưởng

- Phạm vi nhận diện: `Z = -28.0 .. -0.4` trên cả hai tường `X ≈ ±7.84`.
- Nền kem ấm `0xeee5d7`, nẹp và dải chân tường vàng đồng `0xaa8242`.
- Hai biển tên “HIỆU TRƯỞNG QUA CÁC THỜI KỲ”.
- 13 khung palette `principal`, scale `1.55`, đánh số xen kẽ trái–phải: `7 trái + 6 phải`.
- Các hàng chạy từ `Z = -2` đến `Z = -26`, cách nhau `4`.

Khoảng hở `Z = -0.4 .. 0.4` tạo đường phân cách thị giác giữa hai phân vùng hành lang.

## 3. Sảnh Cuối — Bí Thư Đảng Ủy

- Phạm vi kiến trúc: `Z = -30 .. -47`.
- Cả ba mặt tường dùng nền kem đỏ `0xeee1cf`, nẹp và dải chân tường đỏ trầm `0x8a3c35`.
- Biển trung tâm chỉ hiển thị tiêu đề “BÍ THƯ ĐẢNG ỦY”, không có dòng mô tả phụ.
- 19 khung palette `party`, scale `1.5`, chạy theo tuyến chữ U `5 + 9 + 5`:
  - Tường trái: 5 khung từ `Z = -32.4` đến `Z = -44.8`.
  - Tường cuối: 9 khung từ `X = -11.5` đến `X = 11.5`.
  - Tường phải: 5 khung từ `Z = -44.8` trở lại `Z = -32.4`.

Thứ tự hồ sơ đi vào theo tường trái, qua tường cuối rồi trở ra theo tường phải.

## 4. Thành Phần Định Hướng

- `ZONES` chia riêng sảnh trước, nửa trước hành lang, nửa sau hành lang và sảnh cuối.
- Bảng sơ đồ treo tường hiển thị đúng tuyến Đoàn → Hiệu trưởng → Đảng ủy.
- Minimap dùng xanh teal cho nửa trước, vàng đồng cho nửa sau và đỏ trầm cho sảnh cuối.
- Banner chủ đề ở cửa vào được giữ nguyên.

## 5. Thành Phần Giữ Nguyên Về Thiết Kế

- Nguyên lý ánh sáng tổng thể và ba cụm trần; hành lang mở rộng được bổ sung một PointLight cùng cấu hình.
- Kiểu cửa, tường kiến trúc, cột, sàn và trần; riêng các phần phía trước được kéo dài hoặc tịnh tiến theo mốc `Z` mới.
- Tám sofa dọc hành lang được tăng kích thước `1.3×` so với bố trí trước, giữ nguyên vị trí và hướng xoay.
- Collider kiến trúc, collider nội thất và cấu trúc modal hồ sơ.

## 6. Bố Trí Sảnh Trước Và Điểm Chuyển Tiếp

- Hai bên cửa vào dùng hai model chậu cây đơn `house_plant.glb`, thay cho model cụm cây cũ.
- Hành lang được nới thêm 10 đơn vị về phía cửa vào; nút chuyển tiếp sảnh trước chuyển từ `Z = 30` sang `Z = 40`, còn sảnh trước giữ nguyên chiều sâu 17 đơn vị trong khoảng `Z = 40 .. 57`.
- Hai chậu Monstera `monstera_b02.glb` được đặt phía sảnh trước, cạnh hai cột trong tại nút chuyển tiếp `Z = 40`.
- Nửa trái sảnh trước có sofa chữ L xoay ngược 180° so với bố trí trước; sofa hiện bằng 3/4 kích thước phóng lớn trước đó, còn đèn đứng bằng đồng giữ scale gấp đôi.
- Nửa phải có tủ kính dựng bằng Three.js; lịch gỗ vạn niên được đặt trên nóc tủ.
- Logo Đoàn được gắn cạnh biển “BÍ THƯ ĐOÀN TRƯỜNG” trên cả hai tường; logo HNUE được gắn cạnh biển “HIỆU TRƯỞNG NHÀ TRƯỜNG” trên cả hai tường. Bốn logo có bán kính `0.72`, dùng nền tròn màu kem và hai vòng khung kim loại như Chủ đề 4.
- Cờ Đảng được crop giữa đúng tỷ lệ thành mặt logo tròn và gắn bên trái biển “BÍ THƯ ĐẢNG ỦY” ở tường cuối, cùng bán kính `0.72`.
- Tại `Z = 0`, giữa hai phân đoạn hành lang, có một bàn tra cứu thấp dựng bằng Three.js.
- Sofa, đèn, tủ kính, hai chậu cây và bàn tra cứu đều có footprint collision riêng; trục đi bộ hai bên vẫn được giữ thông thoáng.
- Factory của tủ kính và bàn tra cứu đã được tách vào `Chủ đề 5/scripts/objects/object-factories.js`; Ver 2 không còn phụ thuộc thư mục `Phòng trưng bày vật thể` khi xuất bản.

## 7. Dữ Liệu Hồ Sơ Từ Tài Liệu Gốc

- Khung đầu tiên của phân khu Bí thư Đoàn trường: TS. Đinh Minh Hằng, giai đoạn 2019 – 2022.
- Khung đầu tiên của phân khu Hiệu trưởng: GS.TSKH. Lê Văn Thiêm, giai đoạn 1951 – 1954.
- Toàn bộ 13 khung Hiệu trưởng và 19 khung Bí thư Đảng ủy dùng dữ liệu thật, sắp theo thứ tự thời gian của Excel/DOCX và gắn ảnh tương ứng từ thư mục hồ sơ.
- Toàn bộ 29 khung Bí thư Đoàn trường đã được nối với danh mục, nhiệm kỳ và ảnh chân dung thật; nội dung chi tiết đang được biên tập dần từ DOCX/cột G.
- Modal hiển thị nội dung được biên tập từ DOCX; trường còn thiếu căn cứ hiển thị `Đang xác minh...`, còn mâu thuẫn nguồn được lưu trong `verificationNotes`.
- Nhãn đóng góp trong modal đổi theo loại hồ sơ: công tác Đoàn, công tác Đảng hoặc quản lý – xây dựng trường.
