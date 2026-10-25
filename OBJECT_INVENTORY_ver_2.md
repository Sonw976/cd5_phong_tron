# Kiểm Kê Thay Đổi Vật Thể — Chủ Đề 5 Phiên Bản 2

Tài liệu này chỉ ghi những số lượng khác với bố cục nền. Các vật thể kiến trúc, nội thất, ánh sáng và collider giữ nguyên như `OBJECT_INVENTORY.md`.

## Tổng Quan Phần Thay Đổi

| Nhóm | Số lượng trong ver 2 | Nguồn |
|---|---:|---|
| Khung hồ sơ nhân vật | 61 group, 1098 mesh hiển thị, 61 hitbox ẩn | `[JS]` |
| Cụm nhận diện hành lang | 4 cụm, 20 mesh | `[JS]` |
| Cụm nhận diện sảnh cuối | 1 cụm ba mặt tường, 13 mesh | `[JS]` |
| Tổng mesh nhận diện phân vùng | 33 mesh | `[JS]` |

## 1. Khung Hồ Sơ

| Loại hồ sơ | Số lượng | Phân bố |
|---|---:|---|
| Bí thư Đoàn Trường | 29 | Nửa trước hành lang, `15 trái + 14 phải` |
| Hiệu trưởng | 13 | Nửa sau hành lang, `7 trái + 6 phải` |
| Bí thư Đảng ủy | 19 | Sảnh cuối, `5 trái + 9 cuối + 5 phải` |
| Tổng | 61 |  |

Mỗi `ProceduralFrame3D` tạo 18 mesh hiển thị và được gắn một hitbox ẩn. Toàn scene có `61 × 18 = 1098` mesh khung và 61 hitbox raycast.

## 2. Nhận Diện Hai Nửa Hành Lang

Mỗi cụm gồm 1 mảng nền, 2 nẹp ngang, 1 dải chân tường và 1 biển tên. Bốn cụm tạo tổng cộng 20 mesh. Khoảng hở nhỏ tại `Z = 0` ngăn hai hệ màu chạm nhau.

## 3. Nhận Diện Sảnh Cuối

- Hai tường bên: mỗi tường có 1 nền, 2 nẹp và 1 dải chân tường, tổng 8 mesh.
- Tường cuối: 1 nền, 2 nẹp và 1 dải chân tường, tổng 4 mesh.
- Biển tên trung tâm: 1 mesh.
- Tổng cộng: 13 mesh.

## 4. Canvas Texture Liên Quan

| Hàm | Số lần sử dụng |
|---|---:|
| `portraitTex()` | 61 |
| `plaqueTexture()` | 61 |
| `wallTitleTex()` | 5 |
| `orientTex()` | 1 |
| `titleBannerTex()` | 1 |

## 5. Thành Phần Giữ Nguyên

- 3 sàn, 3 trần nền và 3 cụm trần trang trí.
- Hệ tường, nẹp kiến trúc, cột và cửa.
- 8 sofa văn phòng dọc hành lang.
- 11 light tổng thể và 3 PointLight trong cụm trần.
- Collider kiến trúc và collider nội thất.

## 6. Nội Thất Bổ Sung Và Thay Thế

| Vật thể | Số lượng | Nguồn |
|---|---:|---|
| Chậu cây đơn hai bên cửa | 2 | `house_plant.glb` |
| Chậu Monstera cạnh hai cột chuyển tiếp | 2 | `monstera_b02.glb` |
| Sofa chữ L sảnh trước | 1 | `L_sofa.glb` |
| Đèn đứng sảnh trước | 1 | `brass_lamp_rose.glb` |
| Tủ kính sảnh trước | 1 group, 19 mesh | `OBJECT_FACTORIES.glassShowcase()` |
| Lịch gỗ trên nóc tủ | 1 | `wooden-perpetual-desk-calendar.glb` |
| Bàn tra cứu tại `Z = 0` | 1 group, 7 mesh | `OBJECT_FACTORIES.researchKiosk()` |
| Panel logo HNUE, logo Đoàn và biểu trưng Đảng cạnh biển phân khu | 5 group, 20 mesh | `createFramedLogoPanel()` |

Model cụm cây `house_plants.glb` không còn được dùng trong ver 2. Tổng nội thất GLB của ver 2 gồm 15 instance từ 6 đường dẫn model; hai vật thể mới còn lại được dựng trực tiếp bằng Three.js.
