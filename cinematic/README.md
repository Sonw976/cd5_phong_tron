# Camera di chuyển liên tục — Chủ đề 5

Mở lại `cd5_tron/index.html` trên web, chờ tải tài nguyên rồi bấm **VÀO PHÒNG**. Sau khi màn hình chào đóng, camera tự bắt đầu hành trình. Không cần Python và không cần thêm tham số URL.

Camera bắt đầu tại vị trí và hướng nhìn hiện tại của người dùng, sau đó vừa di chuyển vào đường vòng vừa xoay ngang. Giữ nguyên độ cao, độ nghiêng và góc rộng ống kính của người dùng trong suốt hành trình. Camera đi theo cung tròn qua 19 chân dung Bí thư Đảng ủy và 13 Hiệu trưởng trên tường ngoài, rồi chuyển hướng nhìn để đi quanh 29 chân dung Bí thư Đoàn trên trụ giữa. Không dừng hoặc giảm tốc ở từng ảnh. Chỉ đoạn đổi từ tường ngoài sang trụ giữa dùng chuyển động tăng/giảm tốc để xoay hướng nhìn nhẹ hơn.

- **Escape**: kết thúc hành trình và trở về điều khiển thủ công.
- Thêm `?cinematic=0` để tắt tự chạy.
- Thêm `?speed=2` để chạy nhanh gấp đôi.
- `cameraTour.pause()`, `cameraTour.resume()`, `cameraTour.stop()` dùng trong console để điều khiển.

## Chỉnh kịch bản JSON

Sửa `tour.json` rồi reload. JSON luôn được tải lại, không dùng cache.

```json
"defaults": {
  "distance": 7,
  "speed": 2.5,
  "hold": 0,
  "lookAhead": 0,
  "easing": "linear"
}
```

- `speed`: tốc độ di chuyển trong không gian (đơn vị cảnh/giây). Thời lượng mỗi đoạn được tính từ độ dài đường đi, không gán đều thời gian cho các ảnh cách nhau khác nhau.
- `hold: 0`: không dừng ở ảnh.
- `easing: "linear"`: không khởi động/phanh ở từng ảnh.
- `distance`: khoảng cách từ camera đến mặt ảnh theo bán kính.
- `preserveUserView: true` ở cấp gốc của JSON: giữ nguyên camera người dùng; các thiết lập `cameraY`, `lookY`, `fov` trong kịch bản không thay thế góc máy người dùng.
- `lookAhead`: góc nhìn chếch theo hướng di chuyển, tính bằng độ.
- Camera chỉ tự thay đổi vị trí ngang và hướng xoay ngang, không tự zoom hoặc nâng/hạ máy.

Từng mục trong `shots` có thể ghi đè các thuộc tính trên. Thứ tự ảnh lấy theo bố cục thực tế trong source, kể cả thứ tự mã nhân vật khác số thứ tự. Tổng cộng đủ 61 hồ sơ.

Nếu bỏ `speed`, bộ chạy dùng `move` (giây) cho từng đoạn. Có thể thêm `actions` ở một điểm như `{"type":"open-profile","target":"DU-01"}`, `{"type":"close-profile"}` hoặc `{"type":"click","selector":".tb[data-t=\"bio\"]"}`. Kịch bản hiện tại không mở popup.

## Kiểm tra

```powershell
node cd5_tron/tests/camera-tour.test.mjs
```

Kiểm tra đường đi luôn ở trên cung tròn, thời gian theo tốc độ, không chậm lại tại ranh giới hai ảnh, qua góc nối và đủ 61 nhân vật.

## Script quay tùy chọn

`record.py` vẫn được giữ lại nếu sau này cần quay tự động bằng Playwright; luồng sử dụng web hiện tại không phụ thuộc script này. Khi chạy, script chờ tài nguyên, click VÀO PHÒNG rồi bắt đầu tour. Video WebM có cả phần tải cảnh; nếu máy có FFmpeg trên PATH sẽ xuất thêm MP4 cắt phần đầu. Đây là ghi hình thời gian thực, chưa thu âm thanh.
