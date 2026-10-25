# Cấu Trúc Tổng Quan Chủ Đề 5

> Tài liệu này mô tả bố cục nền đang được giữ ở `cd5_ver_1.html` và `cd5_ver_3.html`. Bố cục phân cấp mới của `cd5_ver_2.html` được mô tả riêng trong `Structure_ver_2.md`.

Tài liệu này mô tả cấu trúc không gian của **Chủ đề 5 — Nhân vật tiêu biểu**, với tuyến nội dung “Từ Đoàn viên đến Nhà giáo — Người truyền lửa”. Mục tiêu là giúp các lần chỉnh sửa sau giữ đúng logic kiến trúc, tuyến tham quan và quan hệ giữa hiện vật với hồ sơ nhân vật.

Tài liệu mô tả cả nguyên lý và các mốc đang được sử dụng trong source. Source vẫn là nguồn thông số cuối cùng. Khi thay đổi kích thước, phải cập nhật đồng bộ hình học, vùng di chuyển và minimap; không xem các con số trong tài liệu này là cấu hình độc lập.

## Ý Tưởng Mặt Bằng

Toàn bộ không gian được tổ chức thành một tuyến tham quan thẳng, đối xứng tương đối qua trục giữa `X = 0`. Người xem bắt đầu trong sảnh trước, đi dọc theo chiều giảm của trục `Z`, qua hành lang lịch sử và kết thúc tại sảnh sau.

```text
Phía trước / cửa vào                         Z dương
        +--------------------------------+
        | SẢNH TRƯỚC                     |  Z = +47 đến +30
        | Tiêu đề, bảng định hướng       |
        +-----------+        +-----------+
                    |        |
                    | HÀNH LANG LỊCH SỬ  |  Z = +30 đến -30
                    | Trái: Hiệu trưởng  |
                    | Phải: Bí thư       |
                    |        ↓           |
        +-----------+        +-----------+
        | SẢNH SAU                       |  Z = -30 đến -47
        | KHÔNG GIAN HIỆU TRƯỞNG         |
        +--------------------------------+
Phía cuối tuyến                              Z âm
```

Đây không phải ba phòng độc lập. Ba vùng là các đoạn nối tiếp của cùng một trục tham quan, trong đó hai sảnh rộng hơn hành lang chính.

## Hệ Tọa Độ Và Mốc Chuẩn

Scene sử dụng quy ước:

```text
X: chiều ngang, âm về tường trái, dương về tường phải.
Y: chiều cao, sàn tại Y = 0.
Z: chiều dọc tuyến tham quan, cửa vào ở phía Z dương.
```

Các mốc hiện tại trong `buildScene()`:

```text
Chiều cao tường: H = 10.5
Sàn hành lang:   X = -8 đến +8;   Z = -30 đến +30
Sàn sảnh trước:  X = -15 đến +15; Z = +30 đến +47
Sàn sảnh sau:    X = -15 đến +15; Z = -47 đến -30
Vị trí camera đầu: (0, 2.15, 43)
```

Không thay đổi ý nghĩa các trục bằng cách xoay toàn bộ scene. Các bảng, khung ảnh, minimap, phân vùng và giới hạn camera đều đang dựa vào hệ tọa độ này.

## Các Thành Phần Chính

Không gian gồm các thành phần cấu trúc sau:

```text
1. Sảnh trước và cửa vào
2. Hành lang lịch sử trung tâm
3. Sảnh sau
4. Hai nút chuyển tiếp tại Z = +30 và Z = -30
5. Hệ tường dọc, tường ngang và cột giao
6. Hệ sàn và trần theo từng vùng
7. Vùng di chuyển camera
8. Minimap phản ánh ba vùng
```

Khung ảnh, bảng nội dung, sofa, đèn, cây và mô hình trang trí là lớp nội thất. Chúng không được dùng để thay thế tường, che lỗi sàn hoặc xác định biên đi lại.

## Sảnh Trước

Sảnh trước nằm trong khoảng `Z = +30` đến `Z = +47`, rộng 30 đơn vị. Đây là vùng mở đầu và vùng xuất phát của người xem.

Các thành phần chính:

```text
- Cửa đôi tại (X = 0, Z = 47), rộng 4, cao 4.6.
- Mảng tường phía trên cửa được lấp kín từ đỉnh khung đến trần; nẹp đỉnh nối liên tục với hai đoạn tường bên.
- Banner chủ đề tại gần tường trước, Z = 46.7.
- Bảng định hướng trên tường trái, gần X = -14.75, Z = 37.
- Hai chậu cây hai bên cửa.
- Vật trang trí nhỏ gần tường trái.
- Camera bắt đầu tại (0, 2.15, 43), tức ở bên trong sảnh.
```

Cửa tại `Z = 47` hiện là giới hạn thị giác của scene, không phải một cổng mà camera đi xuyên ra ngoài. Nếu muốn bổ sung tiền sảnh ngoài, phải mở rộng đồng thời sàn, tường, trần, vùng `canMoveTo()`, minimap và vị trí xuất phát.

## Hành Lang Lịch Sử

Hành lang chính nằm trong khoảng `Z = -30` đến `Z = +30`, rộng 16 đơn vị. Hai tường dọc đặt tại `X = -8` và `X = +8`; vùng camera được thu vào trong mép tường để tránh xuyên hình học.

Hành lang có hai tuyến nội dung song song:

```text
Tường trái, X ≈ -7.72:
  19 Bí thư Đảng ủy.
  Khung quay vào lòng hành lang.

Tường phải, X ≈ +7.72:
  19 Bí thư Đoàn trường.
  Khung quay vào lòng hành lang.
```

Mỗi bên có 19 khung đặt đều từ `Z = 26.5` đến `Z = -26.5`, bước `53 / 18`. Cả hai bên cùng đi từ hồ sơ sớm nhất gần cửa vào đến hồ sơ gần nhất ở cuối hành lang. Khung có scale `1.5`, tâm cao `Y = 4.05`.

Không đặt hiện vật lớn chắn trục `X = 0`, vì đây là trục di chuyển và quan sát chính.

## Hai Nút Chuyển Tiếp

Tại `Z = +30` và `Z = -30`, bề rộng không gian thay đổi từ 30 đơn vị ở sảnh xuống 16 đơn vị ở hành lang. Mỗi nút chuyển tiếp được tạo bằng:

```text
- Các đoạn tường ngang hai bên khoảng mở trung tâm.
- Cột tại X = ±8 và X = ±15.
- Sàn và trần của hai vùng tiếp giáp.
```

Khoảng mở trung tâm phải giữ thông suốt. Không kéo tường ngang qua toàn bộ chiều rộng tại hai mốc này. Nếu thay đổi bề rộng hành lang hoặc sảnh, phải tính lại đồng thời các đoạn tường ngang và vị trí bốn cột giao.

## Sảnh Sau

Sảnh sau nằm trong khoảng `Z = -30` đến `Z = -47`, rộng 30 đơn vị. Đây là điểm kết thúc tuyến nội dung và được dành cho không gian ảnh các Hiệu trưởng.

```text
Trạng thái bố trí thử hiện tại:
  - 13 khung Hiệu trưởng dựng bằng JavaScript theo bố cục 4 + 5 + 4.
  - Bốn khung trên tường trái, năm khung trên tường cuối và bốn khung trên tường phải.
  - Có mảng nền trung tính và nẹp vàng liên tục trên cả ba mặt tường.
  - Không còn khung Gương mặt trẻ, Bảng vàng, sofa chữ L hoặc đèn đứng.
  - Không sử dụng spotlight riêng.
```

Không đặt nội thất hoặc hiện vật lớn che khuất 13 vị trí ảnh Hiệu trưởng ở sảnh sau.

## Hệ Tường Và Cột

Tường có hai hướng cơ bản:

```text
Tường dọc theo Z:
  Hai tường hành lang tại X = ±8.
  Hai tường ngoài của mỗi sảnh tại X = ±15.

Tường ngang theo X:
  Các đoạn thu bề rộng tại Z = ±30.
  Hai đoạn hai bên cửa tại Z = +47.
  Tường cuối toàn phần tại Z = -47.
```

Cột đặt tại bốn mốc ngang `X = -15, -8, +8, +15` ở mỗi nút `Z = ±30`. Cột có vai trò kết thúc tường và làm rõ nhịp chuyển không gian; không di chuyển cột độc lập khỏi tường tương ứng.

Màu vật liệu thực tế phải đọc từ source. Không dựa vào các chú thích cũ như “xám than” hoặc “đỏ trầm”, vì hai tường hành lang hiện đều dùng màu trắng ngà.

## Hệ Sàn Và Trần

Sàn được chia thành đúng ba mặt phẳng tương ứng với ba vùng:

```text
- Sàn sảnh trước: 30 × 17
- Sàn hành lang: 16 × 60
- Sàn sảnh sau: 30 × 17
```

Trần cũng được dựng theo ba vùng này. Mỗi vùng có một mặt trần nền và một cụm trần thả giật cấp. Không tạo một mặt phẳng trần toàn cục phủ vượt ra ngoài vỏ kiến trúc.

Khi xuất hiện khe ở `Z = ±30`, cần sửa biên của vùng hoặc tạo patch đúng theo khe. Không dùng một mặt sàn/trần lớn để che toàn bộ scene.

## Vùng Di Chuyển Camera

Hàm `canMoveTo(x, z)` xác định vùng sàn tổng quát. Sau đó `collisionWorld` kiểm tra hình tròn người chơi với collider của tường, cột, cửa và nội thất lớn:

```text
Nếu |Z| ≤ 30:
  -7.55 ≤ X ≤ 7.55

Nếu 30 < |Z| ≤ 47:
  -14.55 ≤ X ≤ 14.55

Ngoài |Z| > 47:
  Không được di chuyển.
```

Chiều cao mắt được cố định tại `Y = 2.15`. Người chơi có bán kính `0.38`; chuyển động lớn được chia thành các bước nhỏ và giải quyết riêng theo X/Z để vừa chống xuyên vật thể vừa cho phép trượt dọc tường.

Các helper tạo tường/cột/cửa phải đăng ký collider từ cùng thông số hình học. Mọi thay đổi mặt bằng vẫn phải cập nhật vùng sàn tổng quát. Một vùng có sàn nhưng camera không vào được, hoặc camera đi được ra ngoài sàn, đều là lỗi cấu trúc.

## Minimap

Minimap biểu diễn ba hình chữ nhật tương ứng với ba vùng, trong miền hiển thị gần đúng `X = -20..20`, `Z = -50..50`. Minimap còn hiển thị vị trí và hướng nhìn của camera.

Khi chỉnh mặt bằng, cần kiểm tra đồng bộ:

```text
- Biên sảnh trước
- Biên hành lang
- Biên sảnh sau
- Tỷ lệ chuyển đổi tọa độ thế giới sang canvas
- Vị trí và hướng người xem
```

Các nhãn vùng trên HUD hiện được xác định bằng trục `Z`: sảnh trước `29..48`, hành lang `-30..29`, sảnh sau `-50..-30`. Nếu đổi ranh giới kiến trúc, phải sửa cả `ZONES` và minimap.

## Bố Trí Nội Dung Và Tương Tác

Dữ liệu hiển thị chuẩn nằm trong `scripts/data/profiles.js`. Mỗi khung trưng bày nhận một đối tượng dữ liệu và tạo hitbox raycast để mở modal.

Các nhóm dữ liệu hiện có:

```text
ht:  Hiệu trưởng
bt:  Bí thư Đoàn trường
du:  Bí thư Đảng ủy
gmt: Gương mặt trẻ tiêu biểu
gt:  Giải thưởng và danh hiệu
```

Hai nhóm `gmt` và `gt` vẫn còn trong dữ liệu lưu trữ nhưng hiện không tạo vật thể trong scene.

Scene hiện tạo 19 placeholder Bí thư Đảng ủy, 19 placeholder Bí thư Đoàn trường và 13 placeholder Hiệu trưởng. Placeholder chỉ giữ chỗ bố cục, được đánh số tuần tự và không dùng tên nhân vật chưa kiểm chứng. Khi có dữ liệu thật, thay nội dung trên đúng các vị trí này mà không thay đổi tọa độ khung.

Hai hàng hành lang cùng chạy theo một chiều thời gian: vị trí số 01 ở gần cửa vào (`Z = 26.5`), vị trí số 19 ở gần sảnh sau (`Z = -26.5`).

### Modal hồ sơ cá nhân

Click trực tiếp vào một khung sẽ mở modal hai cột theo đúng dạng thức minh họa tại mục IV của `Kế hoạch chủ đề 5.docx`:

```text
Cột trái cố định:
  - Ảnh chân dung hoặc biểu tượng placeholder
  - Họ tên
  - Chức vụ
  - Thời gian công tác

Cột phải — Trang 1:
  - Ba nút dạng viên thuốc: Tiểu sử, Đóng góp, Hồi ức

Cột phải — Trang 2:
  - Nội dung của mục vừa chọn trong một bảng trắng bo góc
  - Nút Quay lại để trở về Trang 1
```

Modal dùng thống nhất nền xanh nhạt HNUE, logo HNUE ở góc trên trái, thẻ chân dung viền xanh, nút trắng bo tròn và bảng nội dung trắng. Màu không đổi theo nhóm hồ sơ để giữ đúng thiết kế mẫu. Màn hình Đóng góp chia thành ba dải ngang: Công tác Đoàn, Nhà trường và Xã hội. Màn hình Hồi ức dùng lưới thẻ trắng viền nét đứt và nhận danh sách linh hoạt gồm trích dẫn, văn bản, ảnh, audio hoặc video. Trên màn hình nhỏ, hai cột tự chuyển thành bố cục dọc nhưng vẫn giữ thứ tự và hệ màu trên.

Ảnh chân dung hiện được tạo dưới dạng Canvas Texture từ dữ liệu, chưa liên kết đầy đủ với ảnh trong các thư mục `Hồ sơ...`. Việc kết nối ảnh và DOCX là thay đổi ở lớp nội dung; không cần thay đổi hình học phòng nếu kích thước khung giữ nguyên.

## Nội Thất Và Đồ Trang Trí

Các asset trang trí hiện được tải từ thư mục `../Đồ 3D decord/`, gồm sofa hành lang, lịch bàn và cây cảnh.

Đáng chú ý, bốn cặp sofa được đặt dọc trục giữa tại `Z = -20, -8, 8, 20`. Sofa, cây và đèn lớn có footprint collider đơn giản. Khi thay model hoặc đổi tỷ lệ, phải chỉnh footprint tương ứng và thử di chuyển thực tế.

Quy tắc:

```text
Nội thất không được chắn hoàn toàn trục đi chính.
Không đặt nội thất xuyên tường hoặc che khung tương tác.
Không dùng đồ trang trí để vá khe kiến trúc.
Asset dùng chung phải giữ đường dẫn ổn định hoặc cập nhật tại một nơi cấu hình.
```

## Hệ Chiếu Sáng

Scene sử dụng ánh sáng môi trường, ánh sáng bán cầu, các đèn điểm dọc hành lang và đèn điểm tại hai sảnh. Cường độ PointLight dùng thang ánh sáng vật lý của Three.js r180, không dùng lại thang giá trị nhỏ từ r128. Các PointLight trên trần không có mesh đèn đại diện; vòng tròn, đĩa sáng và dải glow đã được ẩn khỏi scene. Hiện không sử dụng đèn rọi riêng (`SpotLight`) tại cửa vào hoặc tại khung ảnh.

Khi thay đổi chiều cao trần, chiều dài hành lang hoặc vị trí hiện vật, cần rà soát lại:

```text
- Độ cao đèn
- Phạm vi chiếu sáng
- Độ đồng đều ánh sáng trên hai mặt tường trưng bày
- Hiện tượng vùng tối tại hai nút chuyển tiếp
```

## Những Gì Không Thuộc Cấu Trúc

Các phần sau không được dùng để định nghĩa lại mặt bằng:

```text
- Khung ảnh và ảnh chân dung
- Bảng danh hiệu
- Banner và bảng chỉ dẫn
- Modal hồ sơ
- Sofa, đèn, cây, lịch bàn
- Dữ liệu tiểu sử và thành tích
- Hitbox tương tác
```

Nếu cần thay đổi không gian, hãy chỉnh các thành phần kiến trúc: vùng, sàn, tường, cột, trần, giới hạn camera và minimap.

## Quan Hệ Phụ Thuộc Khi Chỉnh Sửa

```text
Thay đổi chiều dài vùng theo Z
  -> sàn
  -> tường dọc và tường cuối
  -> trần
  -> ZONES
  -> canMoveTo()
  -> minimap
  -> vị trí banner và hiện vật

Thay đổi chiều rộng theo X
  -> sàn
  -> tường dọc
  -> tường ngang tại Z = ±30
  -> cột giao
  -> canMoveTo()
  -> minimap
  -> khoảng lùi của khung và nội thất

Thay đổi số lượng hiện vật
  -> mảng dữ liệu
  -> dãy vị trí trưng bày
  -> khoảng cách khung
  -> hitbox/raycast
  -> loại bỏ placeholder nếu đã đủ dữ liệu thật
```

## Quy Trình Khi Chỉnh Cấu Trúc

```text
1. Xác định vùng thay đổi: sảnh trước, hành lang, nút chuyển tiếp hay sảnh sau.
2. Chỉnh mốc và kích thước hình học của vùng.
3. Chỉnh sàn.
4. Chỉnh tường và cột giao.
5. Chỉnh trần.
6. Chỉnh canMoveTo() và vị trí camera đầu.
7. Chỉnh ZONES và minimap.
8. Đặt lại banner, khung và nội thất.
9. Kiểm tra raycast và modal của từng hiện vật.
10. Đi thử toàn tuyến từ Z dương đến Z âm.
```

## Nguyên Tắc Rà Soát Sau Khi Chỉnh

```text
Ba mặt sàn có nối kín tại Z = ±30 không?
Tường ngang có chặn nhầm khoảng mở trung tâm không?
Cột có còn nằm đúng đầu tường không?
Trần có bám theo từng vùng không?
Camera có đi ra ngoài sàn hoặc xuyên tường không?
Minimap và nhãn vùng có khớp vị trí thật không?
Sofa có chặn lối đi hoặc điểm đứng xem tranh không?
Các khung có quay mặt vào phía người xem không?
Hitbox có trùng với khung/bảng tương ứng không?
Còn hồ sơ `(Demo)` nào xuất hiện trong bản công bố không?
```

## Mục Tiêu Cấu Trúc

Mục tiêu cuối cùng của Chủ đề 5 là một tuyến tham quan tuyến tính, dễ định hướng và dễ mở rộng dữ liệu:

```text
Sảnh trước
-> Hành lang lịch sử hai phía
-> Sảnh sau
-> Không gian ảnh các Hiệu trưởng
```

Mọi chỉnh sửa sau này cần giữ ba lớp đồng bộ:

```text
Kiến trúc: sàn, tường, cột, trần
Điều hướng: camera, vùng di chuyển, minimap, nhãn vùng
Nội dung: dữ liệu hồ sơ, khung trưng bày, hitbox, modal
```

Nếu một thay đổi chỉ đúng ở một lớp nhưng làm lệch hai lớp còn lại, thay đổi đó chưa hoàn chỉnh.
