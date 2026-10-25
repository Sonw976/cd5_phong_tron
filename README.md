# Chủ đề 5 — Nhân vật tiêu biểu

## Cấu trúc

- `cd5_1.html`: khung HTML và thứ tự nạp tài nguyên.
- `Structure.md`: mô tả mặt bằng, vùng không gian và các ràng buộc cấu trúc.
- `OBJECT_INVENTORY.md`: kiểm kê vật thể trong scene, phân biệt rõ vật thể dựng bằng JavaScript và mô hình GLB.
- `styles/chu-de-5.css`: điểm vào CSS mới; stylesheet cũ vẫn còn nội tuyến trong HTML trong giai đoạn chuyển đổi.
- `scripts/config/assets.js`: cấu hình mô hình 3D.
- `scripts/collision/collision-world.js`: collision 2D hình tròn–hình chữ nhật cho camera, tường và nội thất lớn.
- `../Đồ 3D JS/frame3d.js`: nguồn khung chân dung `ProceduralFrame3D` nguyên bản; được import trực tiếp và dùng chung Three.js r180 với scene.
- `scripts/data/profiles.js`: nguồn dữ liệu hiển thị chuẩn của các nhân vật.
- Ba thư mục `Hồ sơ...`: tư liệu gốc; không phải mã chạy.

## Bảo trì nội dung

Khi thêm hoặc sửa nhân vật, cập nhật `scripts/data/profiles.js` và đối chiếu với hồ sơ DOCX/ảnh gốc. Không đặt dữ liệu mới trực tiếp trong HTML. Mảng dữ liệu cũ trong HTML chỉ được giữ làm phương án khôi phục tạm thời.

Modal hỗ trợ ảnh qua `image`, `photo`, `portrait` hoặc `imageUrl`; đóng góp có thể dùng `contributions.union`, `contributions.school`, `contributions.society`; tư liệu dùng mảng `memories` với các loại `text`, `quote`, `image`, `audio`, `video`.

Các bản ZIP chỉ là bản lưu nguồn. Không sử dụng ZIP làm asset cho trình duyệt.

## Chạy cục bộ

Mở qua HTTP server để tránh giới hạn của ES module và khi tải mô hình 3D. Dự án hiện dùng Three.js r180 cùng `GLTFLoader` dạng module từ CDN, nên cần Internet khi chạy.

Thêm `?collisionDebug=1` vào URL để hiển thị các collider trên mặt sàn khi kiểm tra scene.
