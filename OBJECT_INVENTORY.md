# Danh Sách Vật Thể Trong Scene Chủ Đề 5

> Các số lượng dưới đây thuộc bố cục nền của `cd5_ver_1.html` và `cd5_ver_3.html`. Những thay đổi riêng của `cd5_ver_2.html` được kiểm kê trong `OBJECT_INVENTORY_ver_2.md`.

Tài liệu này kiểm kê các vật thể được tạo hoặc tải vào scene Three.js của **Chủ đề 5 — Nhân vật tiêu biểu**. Danh sách được đối chiếu với `cd5_1.html`, `scripts/config/assets.js` và `scripts/collision/collision-world.js`.

## Quy Ước Nguồn Vật Thể

| Nhãn | Ý nghĩa |
|---|---|
| **`[JS]`** | Vật thể được dựng bằng code JavaScript với geometry, material, texture hoặc light của Three.js. Không cần file mô hình bên ngoài. |
| **`[GLB]`** | Hình học và material chính được đọc từ một file `.glb` bằng `GLTFLoader`. |
| **`[JS + GLB]`** | JavaScript tạo group/holder, transform hoặc collider; nội dung nhìn thấy bên trong được tải từ GLB. |
| **`[DEBUG]`** | Chỉ được tạo khi bật chế độ kiểm tra, không xuất hiện trong chế độ xem bình thường. |

Phạm vi tài liệu là các đối tượng trong scene 3D và các cấu trúc kỹ thuật trực tiếp phục vụ chúng. Các thành phần HTML như màn hình tải, HUD, modal và canvas minimap không được tính là vật thể 3D.

## Tổng Quan Số Lượng

Các số lượng dưới đây phản ánh source hiện tại:

| Nhóm | Số lượng/cụm chính | Nguồn |
|---|---:|---|
| Sàn | 3 mesh | `[JS]` |
| Trần nền | 3 mesh | `[JS]` |
| Cụm trần thả | 3 group, 15 mesh, 3 PointLight ẩn | `[JS]` |
| Tường kiến trúc | 14 mesh tường, 14 nẹp trên | `[JS]` |
| Ốp chân tường | 17 group, tổng 290 mesh | `[JS]` |
| Cột chuyển tiếp | 8 cột, tổng 24 mesh | `[JS]` |
| Cửa đôi | 9 mesh cửa và khung | `[JS]` |
| Banner và bảng chỉ dẫn | 2 mesh | `[JS]` |
| Mảng nền nhận diện khu trưng bày | 20 mesh | `[JS]` |
| Khung hồ sơ nhân vật | 51 group, 918 mesh hiển thị và 51 hitbox ẩn | `[JS]` |
| Nội thất/mô hình tải ngoài | 11 instance từ 3 đường dẫn GLB | `[JS + GLB]` |
| Ánh sáng tổng thể | 10 light | `[JS]` |
| Collider hiển thị debug | tối đa 33 mesh và 1 group | `[JS] [DEBUG]` |

Số lượng GLB thực tế phụ thuộc việc tải file thành công. Collider của nội thất GLB chỉ được đăng ký sau khi model tải thành công.

## 1. Scene, Camera Và Bộ Render

### 1.1 Scene chính — `[JS]`

- Loại: `THREE.Scene`.
- Số lượng: 1.
- Màu nền: `0xbec8d2`.
- Sương: `THREE.FogExp2(0xbec8d2, 0.011)`.
- Vai trò: chứa toàn bộ kiến trúc, hiện vật, nội thất, ánh sáng và group debug.

### 1.2 Camera người xem — `[JS]`

- Loại: `THREE.PerspectiveCamera`.
- Số lượng: 1.
- FOV: `70°`.
- Near/Far: `0.1 / 140`.
- Vị trí ban đầu: `(0, 2.15, 43)`.
- Chiều cao khi di chuyển luôn được cố định tại `Y = 2.15`.
- Collision: hình tròn trên mặt phẳng XZ, bán kính `0.38`.

### 1.3 Renderer — `[JS]`

- Loại: `THREE.WebGLRenderer`.
- Antialias: bật.
- Pixel ratio: giới hạn tối đa 2.
- Tone mapping: `ACESFilmicToneMapping`, exposure `1.08`.
- Shadow map: đang tắt, dù một số mesh GLB vẫn được đánh dấu cast/receive shadow.
- Renderer không phải `Object3D` trong scene nhưng là thành phần tạo hình ảnh cuối cùng.

## 2. Sàn

Tất cả sàn được tạo bởi helper `floorPlane()` với `THREE.PlaneGeometry`, xoay `-90°` quanh trục X và đặt tại `Y = 0`.

### 2.1 Sàn hành lang — `[JS]`

- Số lượng: 1.
- Kích thước: `16 × 60`.
- Tâm: `(X = 0, Z = 0)`.
- Phạm vi: `X = -8..8`, `Z = -30..30`.
- Material: `MeshStandardMaterial`, màu `0xd8ccb8`, roughness `0.52`.
- Collision: không dùng mesh sàn; vùng tổng quát được kiểm tra bởi `canMoveTo()`.

### 2.2 Sàn sảnh trước — `[JS]`

- Số lượng: 1.
- Kích thước: `30 × 17`.
- Tâm: `(0, 0, 38.5)`.
- Phạm vi: `X = -15..15`, `Z = 30..47`.
- Material: dùng chung với sàn hành lang.

### 2.3 Sàn sảnh sau — `[JS]`

- Số lượng: 1.
- Kích thước: `30 × 17`.
- Tâm: `(0, 0, -38.5)`.
- Phạm vi: `X = -15..15`, `Z = -47..-30`.
- Material: dùng chung với hai sàn còn lại.

## 3. Trần

Mỗi vùng có một trần nền do `ceilPlane()` tạo và một group trần trang trí do `createDropCeiling()` tạo.

### 3.1 Ba mặt trần nền — `[JS]`

- Số lượng: 3 mesh `PlaneGeometry`.
- Kích thước và tâm XZ trùng với ba mặt sàn.
- Cao độ: `Y = H + 0.5 = 11`.
- Hướng mặt: quay xuống dưới; material dùng `DoubleSide`.
- Màu: `0xf1f0ec`, roughness `0.95`.

### 3.2 Ba cụm trần thả giật cấp — `[JS]`

Mỗi group gồm:

- 4 khối viền `BoxGeometry`.
- 1 khối lõi trần `BoxGeometry`.
- 1 `PointLight` vô hình màu `0xfff1ce`, cường độ `48`, decay `1.6`.

Tổng cho ba vùng: 15 mesh kiến trúc và 3 PointLight vô hình. Các dải glow, vòng `TorusGeometry` và đĩa sáng `CircleGeometry` đã được loại khỏi scene; trần vẫn chiếu sáng nhưng không còn vật thể đèn nhìn thấy. Đây hoàn toàn là geometry dựng bằng JavaScript, không phải GLB.

## 4. Tường Và Nẹp Tường

Chiều cao tường chung là `10.5`; độ dày tường là `WALL_THICKNESS = 0.22`.

### 4.1 Tường dọc hành lang — `[JS]`

- Số lượng: 2.
- Geometry: `BoxGeometry(0.22, 10.5, 60)`.
- Vị trí: `X = -8` và `X = 8`, tâm `Z = 0`.
- Mỗi tường có một nẹp vàng phía trên kích thước `0.26 × 0.14 × 60`.
- Material tường hiện tại: trắng ngà `0xf5f0e6`.
- Collider: có, được đăng ký tự động từ cùng kích thước tường.
- Có ốp gạch chân tường ở mặt hướng vào hành lang.

### 4.2 Tường dọc sảnh trước — `[JS]`

- Số lượng: 2.
- Geometry mỗi tường: `BoxGeometry(0.22, 10.5, 17)`.
- Vị trí: `X = ±15`, `Z = 38.5`.
- Có nẹp vàng phía trên, ốp chân tường và collider.

### 4.3 Tường dọc sảnh sau — `[JS]`

- Số lượng: 2.
- Geometry mỗi tường: `BoxGeometry(0.22, 10.5, 17)`.
- Vị trí: `X = ±15`, `Z = -38.5`.
- Có nẹp vàng phía trên, ốp chân tường và collider.
- Mặt tường trùng cũ tại `X = -14.78` đã được loại bỏ.

### 4.4 Tường ngang chuyển tiếp tại Z = 30 — `[JS]`

- Số lượng: 2 đoạn.
- Kích thước mỗi đoạn: `7 × 10.5 × 0.22`.
- Tâm X: `-11.5` và `11.5`.
- Chừa khoảng mở hành lang ở giữa từ `X = -8..8`.
- Có nẹp trên, ốp chân tường ở cả hai mặt và collider.

### 4.5 Tường ngang chuyển tiếp tại Z = -30 — `[JS]`

- Số lượng: 2 đoạn.
- Kích thước và tâm X giống cặp tường tại `Z = 30`.
- Có nẹp trên, ốp chân tường ở cả hai mặt và collider.

### 4.6 Tường trước hai bên cửa tại Z = 47 — `[JS]`

- Số lượng: 2 đoạn.
- Kích thước mỗi đoạn: `13 × 10.5 × 0.22`.
- Tâm X: `-8.5` và `8.5`.
- Chừa khoảng cửa rộng 4 ở giữa.
- Có nẹp trên, ốp chân tường và collider.

### 4.7 Tường cuối sảnh sau — `[JS]`

- Số lượng: 1.
- Kích thước: `30 × 10.5 × 0.22`.
- Vị trí: `(0, 5.25, -47)`.
- Có nẹp trên, ốp chân tường và collider.

## 5. Ốp Gạch Chân Tường

Các cụm được tạo bởi `createBaseboardTiles()` — `[JS]`.

Mỗi group gồm:

- 1 tấm nền/vữa.
- Nhiều viên gạch `BoxGeometry`, số viên bằng `floor(length / 1.15)` nhưng tối thiểu 4.
- 1 thanh nẹp vàng phía trên.

Source hiện tạo:

| Chiều dài đoạn | Số group | Số viên/group | Tổng mesh/group |
|---:|---:|---:|---:|
| 60 | 2 | 52 | 54 |
| 17 | 4 | 14 | 16 |
| 7 | 8 | 6 | 8 |
| 13 | 2 | 11 | 13 |
| 30 | 1 | 26 | 28 |

Tổng cộng 17 group và 290 mesh. Đây là chi tiết trang trí, không có collider riêng; collider tường bao phía sau chịu trách nhiệm ngăn camera.

## 6. Cột Chuyển Tiếp

### Cột tại Z = ±30 — `[JS]`

- Số lượng: 8 cột.
- Vị trí X: `-15, -8, 8, 15` tại mỗi mốc `Z = 30` và `Z = -30`.
- Mỗi cột gồm:
  - 1 thân `BoxGeometry(0.38, 10.5, 0.38)`.
  - 1 chân cột `BoxGeometry(0.52, 0.28, 0.52)`.
  - 1 đầu cột cùng kích thước.
- Material: vàng kim `0xd4af37`.
- Collider: `0.52 × 0.52`, lấy theo phần lớn nhất của cột.
- Tổng: 24 mesh.

## 7. Cửa Đôi Sảnh Trước

### Cửa tại Z = 47 — `[JS]`

- Số lượng: 1 cụm cửa, gồm 9 mesh cửa/khung và 2 mesh lấp tường phía trên.
- Kích thước tổng: rộng 4, cao 4.6.
- Thành phần:
  - 2 jamb/cột cửa bằng `BoxGeometry`.
  - 1 lintel/dầm ngang bằng `BoxGeometry`.
  - 2 cánh cửa bằng `BoxGeometry`.
  - 2 tay nắm bằng `CylinderGeometry`.
  - 1 tấm nền tối lùi sau cánh để che khe.
  - 1 nẹp đứng giữa hai cánh.
- Phần tường hở phía trên được đóng bằng 1 `BoxGeometry`; nẹp đỉnh tường cũng được nối kín bằng 1 mesh riêng.
- Dầm ngang được hạ sát đỉnh cánh cửa, không còn khe ngang màu đen.
- Hai cánh, tấm nền và nẹp giữa được đặt ở các cao độ Z khác nhau để tránh z-fighting.
- Tay nắm được chuyển về gần mép giữa hai cánh và đặt phía người xem.
- Texture cánh cửa: `CanvasTexture` mô phỏng gỗ óc chó, do `walnutDoorTex()` vẽ bằng JavaScript.
- Collider: hai cánh cửa có collider riêng; tường hai bên cửa có collider tường.
- Không phải GLB.

## 8. Banner Và Bảng Chỉ Dẫn

Tất cả các mục trong nhóm này dùng `PlaneGeometry` và `CanvasTexture` do JavaScript vẽ.

### 8.1 Banner chủ đề tại cửa — `[JS]`

- Số lượng: 1.
- Geometry: `PlaneGeometry(22, 3)`.
- Vị trí: `(0, 8.6, 46.7)`.
- Nội dung: “Từ Đoàn viên đến Nhà giáo — Người truyền lửa”.
- Tương tác/collider: không.

### 8.2 Bảng định hướng — `[JS]`

- Số lượng: 1.
- Geometry: `PlaneGeometry(5.8, 2)`.
- Vị trí: `(-14.75, 4.2, 37)`.
- Xoay: `Math.PI / 2` quanh Y để áp vào tường trái.
- Texture: tạo bởi `orientTex()`.
- Tương tác/collider: không.

## 9. Khung Hồ Sơ Nhân Vật

### 9.1 Cấu trúc một khung — `[JS]`

Khung đang hiển thị được tạo trực tiếp bởi class `ProceduralFrame3D` trong `../Đồ 3D JS/frame3d.js`. Scene và khung cùng import một instance Three.js r180:

- 1 `THREE.Group` giữ toàn bộ cụm.
- 9 lớp khung `ExtrudeGeometry`: thân, gờ ngoài, gờ sáng, rãnh tối, gờ gỗ phụ, nẹp vàng, mép trong, rãnh chạm và đường vàng mảnh.
- 1 nền ảnh, 1 mặt ảnh và 1 lớp kính.
- Bảng tên giữ nguyên thân tạo hình, lớp viền, mặt kim loại, 2 đinh tán và mặt chữ.
- Tổng cộng 18 mesh hiển thị cho mỗi khung.
- 1 hitbox ẩn `BoxGeometry(1.42, 2.12, 0.34)` để raycast.
- Geometry, material và texture gỗ được cache dùng chung giữa các instance mà không thay đổi hình dáng.
- Texture chân dung và bảng tên được vẽ bằng Canvas; bảng tên dùng kích thước `1024 × 192`.
- Tương tác: có; click mở modal hồ sơ.
- Collision vật lý: không; tường phía sau giới hạn camera.
- Không có `SpotLight` gắn vào khung.

### 9.2 Tường Bí thư Đảng ủy — `[JS]`

- Số lượng: 19 khung placeholder.
- Vị trí: `X = -7.72`, `Y = 4.05`.
- Z chạy đều từ `26.5` đến `-26.5`, bước `53 / 18`.
- Xoay: `Math.PI / 2`; scale `1.5`; palette `party`.
- Thứ tự: hồ sơ số 01 gần cửa, số 19 gần sảnh sau.

### 9.3 Tường Bí thư Đoàn trường — `[JS]`

- Số lượng: 19 khung placeholder.
- Vị trí: `X = 7.72`, `Y = 4.05`.
- Z và chiều thời gian giống tường Bí thư Đảng ủy.
- Xoay: `-Math.PI / 2`; scale `1.5`; palette `youth`.

### 9.4 Sảnh Hiệu trưởng — `[JS]`

- Số lượng: 13 khung placeholder, scale `1.55`, palette `principal`.
- Tường trái: 4 khung tại `X = -14.72`.
- Tường cuối: 5 khung tại `Z = -46.72`.
- Tường phải: 4 khung tại `X = 14.72`.
- Phân bố tổng thể: `4 + 5 + 4`.

Tất cả 51 khung đang hiển thị đều là **vật thể dựng bằng JavaScript, không phải GLB**. Hàm `legacyMakeFrame()` cũ còn trong source để đối chiếu trong giai đoạn thử nghiệm nhưng không còn lời gọi nào tạo vật thể.

## 10. Nội Thất Và Mô Hình GLB

Mỗi lần gọi `loadDecorModel()` tạo một `THREE.Group` bằng JavaScript, sau đó nạp `gltf.scene` từ GLB, scale, xoay, căn tâm và đặt đáy model về `Y = 0`. Vì vậy các mục này được đánh dấu **`[JS + GLB]`**.

### 10.1 Lịch bàn trang trí — `[JS + GLB]`

- Số instance: 1.
- File: `../Đồ 3D decord/Đồ trang chí trên bàn/source/wooden-perpetual-desk-calendar.glb`.
- Vị trí holder: `(-12.8, 1.55, 37.8)`.
- Scale: `0.34`.
- Xoay Y: `-Math.PI / 2`.
- Collider: không, vì đây là vật nhỏ đặt cao khỏi sàn.
- Tương tác: không.

### 10.2 Sofa đôi dọc hành lang — `[JS + GLB]`

- Số instance: 8, tạo thành 4 cặp.
- File dùng chung: `../Đồ 3D decord/ghế sofa cũ/office_sofa_-25mb.glb`.
- Các mốc Z: `-20, -8, 8, 20`.
- Mỗi cặp:
  - Sofa trái tại `X = -1.2`, xoay `-Math.PI / 2`.
  - Sofa phải tại `X = 1.2`, xoay `Math.PI / 2`.
- Scale: `1.76`.
- Footprint khai báo trước xoay: `2.8 × 1.1`.
- AABB thế giới sau xoay 90°: xấp xỉ `1.1 × 2.8`.
- Collider: có.

### 10.3 Hai chậu cây cạnh cửa — `[JS + GLB]`

- Số instance: 2.
- File dùng chung: `../Đồ 3D decord/House plant/house_plants.glb`.
- Vị trí:
  - Cây trái: `(-11.5, 0, 46.2)`, xoay `Math.PI / 2`.
  - Cây phải: `(11.5, 0, 46.2)`, xoay `-Math.PI / 2`.
- Scale: `3.6`.
- Collider footprint: `1.8 × 1.8` mỗi cây.
- Tương tác: không.

## 11. Ánh Sáng Tổng Thể

Tất cả ánh sáng trong mục này được tạo bằng JavaScript.

### 11.1 AmbientLight — `[JS]`

- Số lượng: 1.
- Màu: `0xfff0dd`.
- Cường độ: `0.78`.

### 11.2 HemisphereLight — `[JS]`

- Số lượng: 1.
- Màu trời: `0xfff8e8`.
- Màu đất: `0x5a4025`.
- Cường độ: `0.62`.

### 11.3 PointLight hành lang — `[JS]`

- Số lượng: 6.
- Vị trí Y: `9.4`, X: `0`.
- Các mốc Z: `-22, -12, -2, 8, 18, 28`.
- Màu: `0xffd080`, cường độ `55`, khoảng chiếu 18, decay `2`.

### 11.4 PointLight hai sảnh — `[JS]`

- Số lượng: 2.
- Vị trí: `(0, 9.4, 39)` và `(0, 9.4, -39)`.
- Màu: `0xffeedd`, cường độ `70`, khoảng chiếu 24, decay `2`.

Ngoài 10 light tổng thể còn có 3 PointLight trong các cụm trần. Các cường độ đã được hiệu chỉnh cho hệ ánh sáng vật lý của Three.js r180. Scene hiện không sử dụng `SpotLight` tại cửa vào hoặc tại các khung nhân vật.

## 12. Hitbox Tương Tác

Hitbox là mesh được tạo bằng JavaScript với material `visible: false`. Chúng không phải GLB và không phải collider vật lý.

### Hitbox khung nhân vật — `[JS]`

- Số lượng: 51.
- Geometry: `BoxGeometry(1.42, 2.12, 0.34)` nằm trong group đã scale.
- Thuộc `interactables`.
- Dùng raycast từ tâm màn hình để đổi con trỏ và mở modal.

## 13. Collider Vật Lý

Collider được quản lý bởi `scripts/collision/collision-world.js`. Ở chế độ bình thường collider chỉ là dữ liệu AABB, không phải mesh nhìn thấy.

### Collider kiến trúc — `[JS]`

- 6 collider tường dọc.
- 7 collider tường ngang.
- 8 collider cột.
- 2 collider cánh cửa.
- Tổng tĩnh: 23 collider.

### Collider nội thất GLB — `[JS + GLB]`

- 8 sofa hành lang.
- 2 chậu cây.
- Tổng: 10 collider nếu toàn bộ model tương ứng tải thành công.
- Lịch bàn không có collider.

### Mesh debug collider — `[JS] [DEBUG]`

- Chỉ xuất hiện khi URL có `?collisionDebug=1`.
- Mỗi collider sinh một `BoxGeometry` thấp đặt gần mặt sàn.
- Màu đỏ: tường/cửa.
- Màu tím: cột.
- Màu cam: nội thất GLB.
- Nếu mọi GLB tải thành công: 1 debug group và tối đa 33 debug mesh.

## 14. Canvas Texture Được Tạo Bằng JavaScript

Các texture sau không phải ảnh hoặc texture lấy từ GLB:

| Hàm | Nơi sử dụng | Số lần theo scene hiện tại |
|---|---|---:|
| `walnutDoorTex()` | Hai cánh cửa dùng chung một material | 1 |
| `portraitTex()` | 51 khung nhân vật placeholder | 51 |
| `wallTitleTex()` | Tiêu đề gắn trực tiếp lên ba mảng tường trưng bày | 3 |
| `plaqueTexture()` | Bảng tên của 51 khung 3D | 51 |
| `titleBannerTex()` | Banner chủ đề tại cửa | 1 |
| `orientTex()` | Bảng định hướng | 1 |

`createSoftWalkwayTexture()` có định nghĩa trong source nhưng hiện không được gọi, nên không tạo texture hoặc vật thể nào trong scene.

## 15. File GLB Có Trong Thư Mục Nhưng Không Được Dùng

File sau tồn tại trong thư mục Chủ đề 5 nhưng không được tham chiếu bởi code hiện tại:

```text
Meshy_AI_Bust_of_Đặng_Thai__0812151136_texture.glb
```

Do không có lời gọi `gltfLoader.load()` tới file này, tượng không xuất hiện trong scene và không được tính vào 11 instance GLB ở trên.

Hai cấu hình `GLTF_ASSETS.frame1` và `GLTF_ASSETS.frame2` cũng đang rỗng. Vì vậy nhánh khung ảnh GLB chưa hoạt động.

## 16. Quy Tắc Khi Thêm Vật Thể Mới

Khi thêm một vật thể, cần cập nhật tài liệu này với tối thiểu:

```text
Tên vật thể
Nhãn [JS], [GLB] hoặc [JS + GLB]
Hàm tạo/tải
Geometry hoặc đường dẫn GLB
Số lượng
Vị trí, scale và rotation
Material/texture chính
Khu vực trưng bày
Có raycast hay không
Có collider hay không
Kích thước collider nếu có
```

Nếu vật thể được dựng bằng nhiều mesh JS, mô tả cả group và các mesh con. Nếu một model GLB được dùng nhiều lần, ghi rõ số instance và các vị trí thay vì chỉ liệt kê file một lần.
