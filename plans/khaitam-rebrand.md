# Kế hoạch: áp dụng bộ nhận diện KHAITAM (khaitam.ai.vn)

Trạng thái: P1 đến P4 đã làm xong trong working tree (chưa commit), xem mục 10. Triển khai lên VPS là việc của chủ dự án.
Nhãn: `[Inference]` là suy luận, `[Unverified]` là chưa kiểm chứng. Số liệu không nhãn đã đo bằng lệnh ghi bên cạnh.

## 1. Mục tiêu và phạm vi

- Thay nhận diện ÔN THI (áp ngày 2026-10-18, commit `e7d05856`) bằng KHAITAM: màu, logo, tên, slogan, hero, phong cách thẻ và icon.
- Domain `khaitam.ai.vn` đã chạy (Cloudflare Tunnel, `PUBLIC_APP_ORIGIN` đã đặt trên VPS, xem `HANDOFF.md`, mục "Deploy OpenMAIC to the OVHcloud VPS", hàng 7). Phần còn lại là giao diện đuổi kịp domain.
- Chỉ kiểm ở màn hình ≥ 768 px (quyết định 2026-10-10: không làm điện thoại).
- Giữ chi phí merge upstream thấp: sửa token và file của mình, không sửa hàng loạt file upstream (quyết định "merge upstream liên tục").
- Không gồm: luồng sản phẩm, giao diện điện thoại, bộ theme của slide do AI sinh, README.

## 2. Đầu vào: hai ảnh tham chiếu

Bảng màu ghi trong ảnh 1 (đã lấy mẫu pixel bằng `magick`, khớp nhãn hex trong sai số nén ảnh):

| Tên | Hex | Vai trò theo ảnh |
|---|---|---|
| Xanh đêm | `#102541` | chiều sâu, tin cậy |
| Vàng khai mở | `#F4C66D` | ánh sáng, khám phá |
| Xanh ngọc | `#2E8278` | cân bằng, phát triển |
| Trắng giấy | `#F3F0E8` | gần gũi, dễ đọc |

Màu phụ lấy mẫu từ ảnh 2 (không có hex trong ảnh, `[Inference]` chỉ là mẫu pixel): xanh thép `#6D9CB6`, xanh lá ngọc `#66B4A4`, bạc hà (chữ "Làm tới") `#76D5C1`, hồng đào `#F4CAB1`, vàng kem `#F0D6A5`.

Tính cách thương hiệu (ảnh 1): Sâu sắc (không phô trương), Hệ thống (không rời rạc), Nhân văn (không thay thế con người).

Ảnh 2 tự ghi: "hướng định vị và hình tượng sơ bộ, chưa phải bộ nhận diện hoàn chỉnh". Còn thiếu: file logo gốc, font, quy tắc cho giao diện sáng. Ảnh chỉ có nền tối.

Hai cách đặt tên trong ảnh không trùng nhau: ảnh 1 có "KHAITAM Learn"; ảnh 2 có "KHAI = AI Learning Platform" và "TAM = AI Ecosystem Platform". Ứng dụng này là nền tảng học nên gần KHAI / KHAITAM Learn.

## 3. Hiện trạng đã kiểm tra

- Token tập trung: `app/brand.css` (`@theme`, dải `brand-50..950`, `brand-yellow`, `brand-ink/mute/line/page`) và `app/globals.css` (`:root`, `.dark`).
- `brand.css` ánh xạ `violet-*`, `purple-*`, `indigo-*` vào dải brand. Đếm bằng `grep`: 665 + 364 + 79 lần dùng trong `app components lib` đi theo token, không cần sửa file.
- `brand-yellow`: 30 lần, 16 file. `bg-primary`: 120 lần, 41 file. `dark:`: 1818 lần, 140 file (chế độ tối đã được dùng rộng).
- Màu không đi theo token: `blue-*` 220 lần / 24 file, trong đó 22 file có trong upstream. Hex thô 383 lần / 62 file, 58 file có trong upstream (`git ls-tree upstream/main`).
- Chuỗi "ÔN THI": 3 khóa i18n × 12 ngôn ngữ, `lib/brand/brand-config.ts`, `app/layout.tsx` (comment), `app/globals.css` / `app/brand.css` (comment), `tests/lib/brand/brand-config.test.ts`.
- Logo: `public/brand/{logo-horizontal,mark}.png`, `app/{icon,apple-icon}.png`, `app/favicon.ico`. Render qua `useBrand()` ở 6 nơi (`site-shell`, `app/page.tsx`, `SlideNavRail`, `WorkspaceRail`, PBL `workspace`, `access-code-modal`).
- Trang trí hero: `components/home/brand-band.tsx` (`BrandBand`, `BrandDecor`, `BRAND_GRADIENT`, `Slogan` tách slogan ở ` · ` và tô nửa sau màu vàng). Cấu trúc này khớp với "Khai mở tri thức. **Kiến tạo tương lai.**" trong ảnh.
- Chủ đề sáng/tối: `lib/hooks/use-theme.tsx`, mặc định theo hệ thống, lưu `localStorage`.
- Font: Be Vietnam Pro + Inter, đã cài, có đủ subset tiếng Việt.

## 4. Phát hiện làm thay đổi thiết kế

Contrast tính bằng công thức WCAG (script `node`, chạy trong phiên này):

| Cặp | Tỉ lệ | Hệ quả |
|---|---|---|
| trắng trên navy `#102541` | 15,41 | nút navy chữ trắng ổn |
| navy trên vàng `#F4C66D` | 9,64 | nút vàng chữ navy ổn (chế độ tối) |
| vàng trên trắng giấy | 1,40 | **không dùng vàng làm chữ trên nền sáng**, chỉ làm nền, gạch chân, huy hiệu |
| teal `#2E8278` trên trắng giấy | 4,03 | **không dùng làm chữ thường**, chỉ làm nền (chữ trắng trên teal 4,58) |
| teal `#23695F` trên trắng giấy | 5,66 | màu chữ teal cho nền sáng `[Inference]` do mình đặt |
| bạc hà `#76D5C1` trên navy | 8,85 | màu chữ teal cho nền tối |
| `#667085` (mute cũ) trên trắng giấy | 4,37 | dưới 4,5, đổi sang `#586274` (5,40) |
| bước 600 dải navy suy ra `#2C5688` trên nền tối `#08162B` | 2,41 | **dải tĩnh không được để bước giữa quá tối** |
| bước 600 đề xuất `#4272AB` | trắng trên nó 4,97; trên nền tối 3,64; trên thẻ navy 3,10 | đạt cả hai chế độ |

Hệ quả:

1. Dải `brand-*` là biến tĩnh, không đổi theo `.dark`. `[Inference]` nhiều trong 665+364+79 chỗ dùng `violet/purple/indigo` kiểu `bg-violet-600 text-white` không có biến thể `dark:` (chưa đếm). Bước 600 phải đủ sáng để thấy trên cả nền giấy lẫn nền navy. Nên dải gồm: 50-400 nhạt, **500-600 xanh thép**, 700-950 navy. Chọn "primary" theo chế độ nằm ở token ngữ nghĩa (`--primary`), không ở dải.
2. `app/brand.css` hiện có `.dark img[src='/brand/logo-horizontal.png'] { filter: brightness(0) invert(1) }` và `.logo-on-brand`. Bộ lọc này biến logo thành một màu trắng, **làm mất chấm vàng** của logo KHAITAM. Phải thay bằng hai biến thể ảnh (sáng/tối).
3. 22 trong 24 file dùng `blue-*` là file upstream. Có hai lối: không đụng (chấp nhận vài chỗ xanh lạc tông), hoặc thêm `blue-*` vào khối remap trong `brand.css` (không sửa file nào, đổi nghĩa "xanh thông tin" sang xanh thương hiệu). Khuyến nghị: quyết sau khi chụp kiểm kê ở pha 3.
4. Thử trực tiếp: ghi đè biến CSS trên trang khách `/` đang chạy ở `:3002` (không lưu vào file). Kết quả quan sát: hero chuyển sang navy sâu, mặt trời và sao thành vàng `#F4C66D`, nền giấy ấm `#F3F0E8` ở chế độ sáng đọc tốt, thẻ tính năng có biểu tượng nhiều màu pastel (emerald, hổ phách, hồng, trời) lệch tông; khối demo bên phải vẫn xanh vì dùng `blue-*`. `[Unverified]` chưa xem nút `bg-primary` navy ở các màn hình khác.

## 5. Quyết định

| # | Quyết định | Kết quả | Ghi chú |
|---|---|---|---|
| D1 | Tên hiển thị | **`KHAITAM`** (chủ dự án chọn 2026-10-22) | Khớp domain và logo ảnh 1. Chừa chỗ thêm "Learn" sau |
| D2 | File logo | **Chủ dự án chưa có file; yêu cầu vẽ lại cho giống ảnh.** Đã vẽ 4 file SVG trong `public/brand/`: `mark.svg`, `mark-dark.svg`, `logo-horizontal.svg`, `logo-horizontal-dark.svg` | Xem "Logo đã vẽ" bên dưới. Chưa nối vào ứng dụng |
| D3 | Màu hành động chính | **Navy ở chế độ sáng, vàng ở chế độ tối** (chủ dự án chọn 2026-10-22) | Navy chữ trắng 15,4:1; vàng chữ navy 9,6:1. Teal dành cho tiến độ, thành công |
| D4 | Tranh hero | Không hỏi; mặc định: dựng bằng SVG trong mã (lớp núi, quầng mặt trời, sao), không dùng ảnh | Không cần giấy phép ảnh, nhẹ, đổi theo theme. Muốn tranh như ảnh 1 thì chủ dự án cấp file và nguồn gốc |

**Logo đã vẽ** (`[Inference]` bản dựng lại theo ảnh, không trùng từng điểm ảnh với bản gốc của thương hiệu):

- Dấu: thanh đứng cắt chéo ở đáy, chữ Λ (mái nhà) đỉnh bo tròn, chấm vàng. Chữ KHAITAM vẽ bằng đa giác, không dùng font: chữ A không có gạch ngang, chấm vàng nằm trong chữ A đầu. Dòng `.AI.VN` bên dưới.
- Bản sáng: chữ và dấu `#102541`, chấm `#ECAC30` (màu mẫu từ ô logo nền sáng trong ảnh), dòng phụ `#4272AB`. Bản tối: `#F3F0E8`, chấm `#F4C66D`, dòng phụ `#9FC9D8` (màu mẫu từ ảnh, chỉ dùng trong logo).
- Đã xem trong trình duyệt (`:3002`) ở cỡ lớn, cỡ ô app 72 px và 32 px, trên nền tối và nền giấy: chấm tròn, nét đọc được. Chưa xem trong tab thật, chưa xuất `favicon.ico`, `app/icon.png`, `app/apple-icon.png` (việc của P1).
- Script sinh SVG chỉ nằm trong thư mục tạm của phiên, không lưu vào repo; chỉnh logo thì sửa trực tiếp SVG.
- Chủ dự án có thể thay bằng file gốc bất kỳ lúc nào: giữ đúng 4 tên file thì không phải sửa mã.

## 6. Thiết kế token (ví dụ)

```css
/* app/brand.css — một nơi duy nhất nêu tên màu */
@theme {
  /* 500-600 phải thấy rõ trên cả nền giấy lẫn nền navy (bảng mục 4). Các bước còn lại nội suy cùng sắc độ ~212°, chốt bằng test ở pha 1. */
  --color-brand-600: #4272ab;
  --color-brand-900: #102541;               /* Xanh đêm */
  --color-brand-yellow: #f4c66d;            /* Vàng khai mở; giữ tên để 30 chỗ dùng không phải sửa */
  --color-brand-teal: #2e8278;              /* chỉ làm nền; chữ dùng teal-ink / mint */
  --color-brand-teal-ink: #23695f;
  --color-brand-mint: #76d5c1;
  --color-brand-page: #f3f0e8;              /* Trắng giấy */
  --color-brand-ink: #102541;
  --color-brand-mute: #586274;
  /* khối remap violet/purple/indigo giữ nguyên, tự trỏ vào dải mới */
}
```

```css
/* app/globals.css */
:root {
  --background: var(--color-brand-page);
  --primary: var(--color-brand-900);             /* chữ trắng 15,4:1 */
  --primary-foreground: #fff;
  --ring: var(--color-brand-teal);
}
.dark {
  --background: #08162b;
  --card: var(--color-brand-900);
  --primary: var(--color-brand-yellow);          /* chữ navy 9,6:1 */
  --primary-foreground: var(--color-brand-900);
  --ring: var(--color-brand-mint);
}
```

```ts
// lib/brand/brand-config.ts
export const DEFAULT_BRAND: BrandConfig = {
  productName: 'KHAITAM',
  shortName: 'KHAITAM',
  domain: 'khaitam.ai.vn',
  logoSrc: '/brand/logo-horizontal.svg',          // K navy, chấm vàng
  logoSrcOnDark: '/brand/logo-horizontal-dark.svg', // K trắng, chấm vàng (trường mới)
  markSrc: '/brand/mark.svg',
  themeColor: '#102541',
  // description: câu mô tả mới, chốt ở D1
};
```

Quy tắc dùng màu (đưa vào comment của `brand.css`):

- Vàng: nền, gạch chân, huy hiệu, nửa sau slogan trên nền tối. Không làm chữ trên nền sáng.
- Teal: tiến độ, thành công, trạng thái "đạt". Chữ dùng `teal-ink` (sáng) hoặc `mint` (tối).
- Bốn màu thẻ tính năng giới hạn theo ảnh 2: vàng, xanh thép, teal, hồng đào. Thay danh sách `TINTS` trong `components/home/guest-home.tsx`.

## 7. Các pha

| Pha | Việc | File chính | Nghiệm thu |
|---|---|---|---|
| P0 | Chốt D1 đến D4; logo | owner + agent | xong (mục 5); 4 file SVG logo đã có |
| P1 | Token, tên, logo, icon, i18n. Nối 4 SVG vào `brand-config` (`logoSrcOnDark` mới); xóa `public/brand/{logo-horizontal,mark}.png` và hai quy tắc `filter` trong `brand.css`; xuất `favicon.ico`, `icon.png` 512, `apple-icon.png` 180 từ dấu (ô navy, dấu kem, chấm vàng) | `app/brand.css`, `app/globals.css`, `lib/brand/brand-config.ts`, `public/brand/*`, `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`, 12 file `lib/i18n/locales/*.json` (3 khóa + `home.slogan`), `tests/lib/brand/*`, `tests/pbl/v2/assets.test.ts` | `pnpm vitest run tests/lib/brand tests/pbl/v2/assets.test.ts tests/i18n`; `npx tsc --noEmit`; `pnpm check:i18n-keys`; trang `/` sáng và tối ở 1280 px |
| P2 | Thành phần dùng chung | `components/home/brand-band.tsx` (giữ tên export, đổi thân: lớp núi SVG, quầng mặt trời, sao), `components/home/site-shell.tsx` (`GLASS`: thẻ bán trong suốt, viền 1 px), `components/home/section-title.tsx`, lớp `.eyebrow` (chữ hoa, giãn chữ) trong `brand.css`, `TINTS` | `pnpm vitest run tests/home tests/lib/brand`; ảnh chụp sáng/tối |
| P3 | Quét màn hình, vá tối thiểu | trang khách, `/` học viên, `/catalog`, đăng nhập, `/admin`, rồi `/classroom/[id]` (header, sidebar, roundtable), `/workspace`, `/generation-preview`, hộp thoại cài đặt. Kiểm kê `blue-*` và hex lệch tông trên các màn hình này, lập danh sách patch và lý do từng file upstream | ảnh chụp 1280 px và 768 px, sáng và tối; danh sách patch point ghi vào `HANDOFF.md` |
| P4 | Hoàn thiện và triển khai | xóa sạch "ÔN THI" còn sót (`grep -rIn "ÔN THI\|onthi" . --exclude-dir=node_modules --exclude-dir=.next` chỉ còn lịch sử trong `HANDOFF.md`); ảnh chia sẻ `app/opengraph-image.png` (tùy chọn) `[Unverified: chưa kiểm tra có sẵn hay chưa]`; deploy lên VPS | `curl https://khaitam.ai.vn/api/health` trả 200; mở tab thật xem favicon |

Mỗi pha là một commit riêng. Theo AGENTS.md chỉ commit và push khi chủ dự án yêu cầu.

Việc có thể giao song song cho worker OpenCode: dịch 11 ngôn ngữ của slogan mới (P1) và kiểm kê `blue-*` / hex (P3). Cần chủ dự án đồng ý trước (quy tắc ủy quyền).

## 8. Rủi ro và điểm chưa kiểm chứng

- `[Unverified]` Font trong ảnh. Be Vietnam Pro có thể không phải font gốc của thương hiệu. Chữ "KHAITAM" trong logo là chữ vẽ tay (chữ A không có gạch ngang, chấm vàng), phải là ảnh, không dựng bằng font.
- `[Unverified]` Giao diện nút navy ở chế độ sáng trên các màn hình học, vì chỉ mới thử trang khách.
- `[Inference]` Nhiều file upstream vẫn còn xanh lạc tông nếu chọn không remap `blue-*`; mức độ chỉ biết sau kiểm kê P3.
- Chủ đề tối hiện dùng `#0b1220`; tối mới `#08162b` gần với nền các ảnh (`#000D22` đến `#042338`) nhưng ảnh có nền gradient, không phải một màu `[Inference]`.
- Viền input trên nền giấy `#DDD8CB` chỉ 1,25:1 so với nền, thấp hơn mức 3:1 cho ranh giới thành phần; cũng đúng với `#E5E7EB` hiện nay, chưa phải lỗi mới.
- Slogan 11 ngôn ngữ ngoài tiếng Việt là bản nháp, cần người đọc lại `[Unverified wording]`.

## 9. Không làm

- Giao diện điện thoại.
- Đổi màu theme slide do AI sinh và bảng màu agent (`lib/constants/agent-defaults.ts`).
- Dựng lại thương hiệu TAM (teal làm màu chính); nếu sau này có trang hệ sinh thái, thêm phạm vi token riêng khi đó.

## 10. Kết quả (2026-10-22)

Đã làm, theo thứ tự pha. Bằng chứng từng bước ở `HANDOFF.md`, hàng 6 đến 13.

- **P1**: token, tên, logo (2 bản sáng/tối qua `BrandImage`), icon, i18n 12 ngôn ngữ, test.
- **P2**: màu hex cũ của giao diện (31 file) đổi sang bảng mới; `blue-*` thêm vào khối remap; hero mới (mặt trời có vòng, ba lớp núi, quầng teal); `BrandArch` (họa tiết "cổng mở"); thẻ kính (`GLASS`); bốn màu thẻ (xanh thép, vàng, teal, hồng đào); chân trang `KHAITAM.AI.VN`.
- **Nội dung theo bảng thương hiệu** (chủ dự án yêu cầu giữa chừng): slogan hai nửa màu, dòng ba trụ cột, mục "Câu chuyện thương hiệu" với ba giá trị (Khai mở, Trí tuệ, Cái tâm) và ba tính cách (Sâu sắc, Hệ thống, Nhân văn). **Không dựng** phần hệ sinh thái sản phẩm (KHAITAM AI, Learn, Work, Finance, Create, Connect), thẻ KHAI/TAM và các khung giới thiệu bộ nhận diện: chủ dự án chưa có hệ sinh thái.
- **P3**: quét `/`, `/catalog`, `/community`, `/workspace`, `/admin`, `/classroom/*`, `/generation-preview`, hộp thoại đăng nhập và cài đặt, sáng và tối, 1280 px. Sửa: mặt trời đè logo ở hộp thoại đăng nhập, mặt trời bị nhóm nút che ở thanh lớp học, nền workspace lạnh, viền dải "Vận hành" ở chế độ tối.
- **Thay đổi so với kế hoạch gốc**: thêm remap `gray-*`/`slate-*` sang thang "giấy đến navy" (cùng độ sáng với Tailwind, giữ contrast chữ); `.eyebrow` được dùng (nhãn mục câu chuyện, chân trang); thêm `metadataBase` và ảnh chia sẻ `app/opengraph-image.png` 1200 x 630 (production dùng `https://khaitam.ai.vn`, dev dùng localhost, theo mã nguồn Next).
- **Chưa làm / chưa kiểm**: triển khai VPS; phần trình bày PBL, bảng quản trị admin (tài khoản `rv_admin` trong DB dev không có quyền nhân viên, chỉ xem bằng `rv_operator`); màn hình dưới 768 px (chủ dự án chỉ cần màn rộng); ảnh chia sẻ chưa xem trên Zalo hay Facebook.

### Sau review (2026-10-23)

Một người review độc lập (agent chỉ đọc, được đưa diff chứ không đưa kết luận) và tự review từng màn hình tìm ra 12 điểm; đã sửa, bằng chứng ở `HANDOFF.md` hàng 13 và 14. Hai điều đáng nhớ:

- Phép thay hex hàng loạt của chính tôi đã làm hỏng 34 lớp Tailwind (`rgba(66, 114, 171,0.3)` có dấu cách), nên bóng và gradient của chúng không bao giờ được sinh ra. Test `tests/lib/brand/tailwind-classes.test.ts` chặn dạng này.
- Giới hạn còn lại, đã biết: chữ nhỏ `text-violet-600` / `text-blue-600` trên nền giấy chỉ 4,4:1 (dưới AA 4,5); mã mới dùng `brand-700` (6,4:1). `gray-500` trên nền tối chỉ 3,4:1 (dùng cho chi tiết phụ). Mười ngôn ngữ không phải vi và en vẫn mang tiếng Anh ở mục "Câu chuyện". Slogan 11 ngôn ngữ ngoài tiếng Việt là bản nháp.
