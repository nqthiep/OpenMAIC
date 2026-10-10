# Review-panel run, 2026-10-10 (DeepSeek v4-pro + v4-flash, một nhà cung cấp)

- **Trạng thái**: Tham khảo, KHÔNG phải file cổng
- **Ngày**: 2026-10-10

> **Tóm tắt:** 10 entry cốt lõi chưa từng được review trên bản văn hiện tại (4 Tin, 6 Toán) chạy qua hội đồng một nhà cung cấp. Không có entry nào đạt cổng, vì hai reviewer cùng nhà cung cấp (ADR 0014 quyết định 8) và vì reviewer nhiễu. Phân loại tay tìm ra **2 lỗi chữ thật** (đã sửa, `entryRev` tăng); phần còn lại là lỗi của reviewer.

## Vì sao một nhà cung cấp

Cổng OpenCode Go báo `GoUsageLimitError` (`limitName: monthly`) cho `deepseek-v4-pro`, `kimi-k3` và `glm-5.3`, nên không còn nhà cung cấp thứ hai. DeepSeek trực tiếp còn dùng được (số dư 6,92 USD lúc chạy). Cặp chạy: `tutor-review-*` = `deepseek:deepseek-v4-pro`, `tutor-review-*-2` = `deepseek:deepseek-v4-flash`, cả hai thinking tắt, `--allow-same-provider`.

Các file `*.json` ở đây là kết quả thô của runner. Chúng không nằm trong `lib/subjects/*/reviews/` vì cổng phát hành chấm lại bằng `panelVerdict` mặc định (từ chối hai reviewer cùng nhà cung cấp). Chạy lại khi có hạn mức hoặc một khoá nhà cung cấp thứ hai.

## Kết quả

| Entry | Pro | Flash | Ghi chú |
| --- | --- | --- | --- |
| `quick-sort@2` | 0 lỗi dữ kiện | 9 | Flash: "kịch bản nhảy" là chủ ý (kể tối đa 12 beat) |
| `knapsack-01@2` | 6 | 19 | Đã kiểm khung 3–6: ô `bỏ` và `lấy` đều được tô đúng; các mục "No error" bị ghi nhầm vào `factErrors` |
| `n-queens@2` | 47 | 10 | Đã kiểm khung 4–9 của `n3-none`: ô đang thử là `active`, ô khác bị tấn công là `muted`; khớp lời giảng |
| `induction-fallacy@1` | 0 | 3 | Giả thiết "k² + k lẻ" sai là chủ ý của bài (bước quy nạp đúng, bước cơ sở sai) |
| `lattice-paths@2` | 0 | 5 | Chỉ là nhận xét về quy ước lưới; không sai dữ kiện |
| `modular-clock@3` | 6 | 4 | **Lỗi thật**: "chu kỳ chia hết φ(n)" dễ đọc ngược; `tail = 1` là đúng vì dãy bắt đầu từ a⁰ = 1 |
| `triangle-altitude@1` | 55 | 5 | **Lỗi thật** ở câu hiểu lầm; các toạ độ Pro nêu đều sai (chân đường cao từ A(0,0) xuống BC là (3, 3), trực tâm là (2, 2)) |
| `sieve@3` | Pro: output hỏng | 31 | Không đủ hai review; không ghi file |
| `inclusion-exclusion@1` | Pro: output hỏng | 10 | như trên |
| `inscribed-angle@1` | Pro: output hỏng | 9 | như trên |

## Đã sửa (có `entryRev` mới, `catalog-lock.json` sinh lại)

- `modular-clock@4`: gợi ý bậc 3 của beat `cycle` (bản tiếng Việt) viết "chu kỳ chia hết φ(n)", nghĩa đen là chu kỳ chia hết cho φ(n), ngược với điều muốn nói. Đổi thành "chu kỳ là một ước của φ(n)"; bản tiếng Anh vốn đúng.
- `triangle-altitude@2`: câu hiểu lầm của beat `altitude-a` nói chân đường cao "nằm trên phần kéo dài của BC" ở tam giác tù; chân hạ từ đỉnh A thường nằm trong BC, còn chân của hai đường cao kia mới nằm trên phần kéo dài. Viết lại cho khớp câu ở `pitfalls`.

## Điều rút ra

- Reviewer Pro cùng một nhà cung cấp với Flash vẫn bịa dữ kiện ở hình học (55 mục ở `triangle-altitude`, phần lớn tự mâu thuẫn). Tỉ lệ "lỗi thật / lỗi báo" ở lần chạy này là 2 / ~220. Không dùng làm cổng; chỉ dùng để gợi ý chỗ cần đọc lại.
- Reviewer Flash chấm `dung: 3` cho mọi entry, bất kể nội dung: không phân biệt được bài tốt và kém.
- Ba entry của Pro trả JSON hỏng với `TUTOR_REVIEW_MAX_OUTPUT_TOKENS=8000` và thinking tắt; chưa rõ do cắt hay do định dạng.
- Sau lần merge upstream 2026-10-10, `tsx` (CJS) không nạp được `@openmaic/dsl` (chỉ có điều kiện `import`) qua `lib/tutor/build/katex.ts`. Chạy runner với `NODE_OPTIONS=--conditions=import` để qua lỗi `ERR_PACKAGE_PATH_NOT_EXPORTED`.
