# Deploy lên VPS bằng image build sẵn

Thay vì build 9 phút ngay trên VPS (tốn RAM, tốn đĩa, ứng dụng chậm trong lúc build), GitHub build
sẵn rồi VPS chỉ tải về và chạy: khoảng **1 phút** mỗi lần deploy.

```
  bạn đẩy code lên it-math
          │
          ▼
  GitHub Actions "Build image"      (tự chạy, ~10 phút lần đầu, vài phút những lần sau)
          │   đẩy lên ghcr.io/nqthiep/openmaic:sha-<7 ký tự của commit>
          ▼
  trên VPS:  ops/deploy/deploy.sh   (bạn gõ 1 lệnh)
          │   sao lưu DB → tải image → chỉ khởi động lại ứng dụng → kiểm tra → quay lui nếu lỗi
          ▼
  ứng dụng mới đang chạy
```

Workflow **không** đụng tới VPS và không giữ khoá nào của VPS. Việc deploy luôn do bạn bấm.
Đó là chủ ý: một lần deploy sai có thể làm hỏng dữ liệu người học, nên người quyết định phải là bạn.

## Làm một lần (cài đặt ban đầu)

1. **Đẩy nhánh lên GitHub.** Workflow tự chạy khi có push lên `it-math` (hoặc nhánh `ci/...`).
   Xem kết quả ở tab **Actions** → "Build image". Chờ dấu tích xanh.
2. **Để package ở chế độ Public** (chỉ lần đầu, vì image không chứa mật khẩu hay khoá nào; mã nguồn
   vốn đã công khai). GitHub → ảnh đại diện → **Your profile** → tab **Packages** → `openmaic` →
   **Package settings** → **Change visibility** → **Public**.
   Nhờ vậy VPS tải được mà không cần đăng nhập.
   - Muốn giữ Private thì trên VPS chạy một lần `docker login ghcr.io -u nqthiep` với một
     *Personal access token* chỉ có quyền `read:packages`.
3. **Trên VPS**, lấy các file mới (script và `docker-compose.image.yml`):
   ```bash
   cd ~/OpenMAIC && git pull
   ```

## Mỗi lần deploy

1. Đẩy code lên `it-math`, chờ workflow **Build image** xanh trên GitHub.
2. SSH vào VPS và chạy:
   ```bash
   ~/OpenMAIC/ops/deploy/deploy.sh
   ```
   Script lần lượt: `git pull` → sao lưu DB vào `~/backups/` (không sao lưu được thì **dừng**, không
   deploy) → tải image của đúng commit đó → khởi động lại **chỉ** ứng dụng (DB và các dịch vụ khác giữ
   nguyên) → đợi `/api/health` trả 200 → dọn bớt image cũ.
3. Nếu ứng dụng không lên trong 3 phút, script **tự quay lại bản trước** và báo lỗi kèm 40 dòng log.

Muốn xem trước mà không đổi gì: `DRY_RUN=1 ~/OpenMAIC/ops/deploy/deploy.sh`.

## Quay lại bản cũ

Mỗi image có tên theo commit, ví dụ `sha-1a2b3c4`. Quay lại bản đó:
```bash
~/OpenMAIC/ops/deploy/deploy.sh sha-1a2b3c4
```
(Thêm `SKIP_GIT=1` phía trước nếu không muốn `git pull`.) Lưu ý: DB không tự quay lui. Các thay đổi
schema của bản v1.2.1 chỉ *thêm* bảng và cột nên bản cũ vẫn đọc được; nếu cần khôi phục dữ liệu thì
dùng file `~/backups/pre-deploy-*.sql.gz` (script giữ 10 bản gần nhất) hoặc `ops/backup/RESTORE.md`.

## Khi có lỗi

| Thấy gì | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `không tải được ...:sha-xxxx` | Workflow chưa chạy xong, hoặc package còn Private | Chờ xanh ở tab Actions; làm bước 2 ở trên |
| `ổ đĩa còn ... MB` | Image cũ chất đống | `docker image prune -a` rồi chạy lại |
| `máy này là aarch64` | VPS không phải x86-64 | Báo lại để đổi `platforms` trong workflow |
| `sao lưu thất bại` | Container postgres không chạy | `docker compose ps`; không deploy khi chưa sao lưu được |
| Nút Đăng nhập biến mất sau deploy | Cờ `NEXT_PUBLIC_*` đóng cứng lúc build | Sửa `build-args` trong `build-image.yml`, không sửa trên VPS |

## Điều cần biết

- **Biến `NEXT_PUBLIC_*` được đóng cứng vào image lúc build** (nằm trong mã chạy trên trình duyệt).
  Chúng đặt trong `.github/workflows/build-image.yml`, mục `build-args`; mặc định để trống như VPS vẫn
  build từ trước. Sửa `.env` trên VPS **không** đổi được chúng nữa. Còn mọi thứ khác (`DATABASE_URL`,
  `PROVIDER_SECRET_KEY`, `ACCESS_CODE`...) vẫn đọc từ `.env.local` trên VPS lúc chạy, không đổi.
- Tên image: `ghcr.io/nqthiep/openmaic`. Hai loại tag: `sha-<commit>` (cố định, dùng để deploy và quay
  lui) và `it-math` (luôn trỏ vào bản build mới nhất của nhánh).
- Image build cho x86-64. Nếu sau này đổi VPS sang ARM, sửa `platforms` trong workflow.
- Dịch vụ `render-service` (xuất MP4) và OmniRoute không nằm trong luồng này: render-service chưa chạy
  trên VPS, OmniRoute dùng image của bên thứ ba.
- Sau lần deploy đầu tiên, image tự build cũ trên VPS (`openmaic-openmaic`) không còn dùng;
  `docker image prune -a` sẽ giải phóng vài GB đĩa.
- Muốn deploy tự động sau khi build xanh (không cần SSH tay) thì cần đặt khoá SSH của VPS vào
  *GitHub Secrets*. Làm được, nhưng ai có quyền ghi vào repo khi đó có thể chạy lệnh trên VPS, nên
  chỉ làm khi bạn thấy cần.
