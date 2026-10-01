# Bảng task cho worker

- **Trạng thái**: Accepted — kế hoạch chia việc (2026-10-01); chưa giao task nào, chưa có mã tính năng
- **Ngày**: 2026-10-01
- **Người sở hữu**: Chủ dự án (leader điều phối)
- **Liên quan**: [../README](../README.md), [../ONBOARDING](../ONBOARDING.md), [Phase 1](phase-1.md), [Phase 2](phase-2.md), [Phase 3](phase-3.md), [../INTERFACES](../INTERFACES.md), [../TEST-STRATEGY](../TEST-STRATEGY.md)

> **Tóm tắt:** thiết kế được chia thành **211 task** để giao cho worker dùng model yếu hơn: 90 `W`, 62 `W+`, 55 `L`, 4 `U`. Phase 1 có 70 task, Phase 2 có 55, Phase 3 có 86.
> - Mỗi task **sở hữu một tập file riêng**, có hợp đồng và lệnh nghiệm thu cụ thể. Mỗi mô-đun Tin và mỗi mẫu clip Toán có card riêng ghi sẵn input, preset, beat/chapter và oracle.
> - Cấp task: `W` worker yếu làm được; `W+` worker khá, phải sửa code lớn có sẵn; `L` leader hoặc model mạnh (spike, bảo mật, quyết định); `U` user (khoá API, commit, quyết định).
> - Hai task chạy song song **không bao giờ** sửa chung file. Điểm đăng ký chung (pack, `package.json`, CI) do task tích hợp `I-*` của leader giữ.
> - `tools/check_docs.py` kiểm bốn điều: id duy nhất; phụ thuộc tồn tại và không vòng; task song song không chung file; bảng đợt (§7) khớp phụ thuộc.
> - Các quyết định chốt thêm khi chia việc ở §5. Card lệch với [INTERFACES](../INTERFACES.md) thì INTERFACES thắng.

## 1. Cách giao một task

1. Chọn task ở đợt sớm nhất còn việc (§7), với mọi `Phụ thuộc` đã xong.
2. Tạo worktree từ nhánh tích hợp `feat/tutor` (task `0-01`):
   ```bash
   git worktree add ../tutor-1a-01 -b feat/tutor-1a-01 feat/tutor
   ```
3. Gửi cho worker ba thứ:
   - khối **Luật chung** (§3), nguyên văn;
   - **nguyên văn card** của task;
   - đường dẫn các tài liệu ở dòng `Đọc`.
4. Nghiệm thu:
   - chạy mục **Xong khi** của card và kiểm chung ở §3;
   - `git diff --name-only feat/tutor` chỉ được chứa file trong `Sở hữu`.
5. Merge local vào `feat/tutor` (không push lên upstream), rồi làm task `I-*` nếu card yêu cầu đăng ký.

Task `L` và `U` không giao cho worker yếu. Task `W+` chỉ giao cho worker đọc được code lớn; leader duyệt diff kỹ hơn.

## 2. Cấp và cỡ

| Ký hiệu | Nghĩa |
| --- | --- |
| `W` | Spec đầy đủ trong card; phần lớn là file mới; test tất định |
| `W+` | Phải đọc và sửa file lớn có sẵn của OpenMAIC (tool agent, component host); card chỉ rõ chỗ sửa và tiền lệ |
| `L` | Spike, quyết định, phần nhạy cảm bảo mật, hoặc cần LLM/khoá API thật |
| `U` | Việc của user: commit, khoá API, quyết định sản phẩm |
| `S` | ≤ ~150 dòng thay đổi |
| `M` | ≤ ~400 dòng thay đổi; lớn hơn thì leader chia tiếp |

## 3. Luật chung (dán nguyên văn vào đầu prompt của worker)

```text
Bạn là worker làm MỘT task trong repo OpenMAIC (Next.js + TypeScript, pnpm).
1. Chỉ sửa/tạo file trong dòng "Sở hữu" của card. Cần đụng file khác thì DỪNG và báo:
   "cần sửa <file>: <lý do>". Đừng tự sửa.
2. Không sửa packages/@openmaic/*, không thêm dependency (package.json), không sửa vitest.config.ts.
3. Test đặt ở tests/**/*.test.ts (vitest chỉ thu thập pattern này), môi trường node, không .tsx,
   không gọi mạng, không gọi LLM thật.
4. Trong lib/subjects/**/catalog/** không dùng Intl, Date, Math.random, Math.sin/cos/exp/log/pow,
   toLocaleString, localeCompare.
5. Thiếu thông tin hoặc spec mâu thuẫn: DỪNG và hỏi; không đoán, không bịa số liệu.
   Điều chưa kiểm chứng ghi [Unverified].
6. Không đưa khoá API/bí mật vào code, test, log.
7. Không commit lên main, không push. Làm trên nhánh worktree đã cho.
8. Theo phong cách code xung quanh (tên, comment, định dạng). Dùng alias import "@/".
9. Trước khi báo xong, chạy:
   - các lệnh ở mục "Xong khi" của card;
   - pnpm exec prettier --check <các file đã sửa>
   - pnpm exec eslint <các file .ts/.tsx đã sửa>
   - npx tsc --noEmit
   - git diff --name-only origin/main -- packages/@openmaic   (phải rỗng)
10. Báo cáo theo mẫu: file đã sửa; lệnh đã chạy + kết quả (dán dòng tổng kết);
    điều chưa chắc hoặc lệch spec; dòng cần leader thêm ở file đăng ký (nếu có).
```

## 4. Mẫu card

Mỗi card là một mục `### <id> · <tên>`, theo sau là bảng trường và ba phần:

| Trường | Ý nghĩa |
| --- | --- |
| `Cấp` | `W`, `W+`, `L`, `U` (§2) |
| `Cỡ` | `S`, `M`, hoặc `—` cho spike/cổng |
| `Phụ thuộc` | id task phải xong trước; `—` nếu không có |
| `Sở hữu` | file task được tạo/sửa (đường dẫn trong dấu backtick); `—` nếu không sửa file |
| `Đọc` | tài liệu cần đọc trước, càng hẹp càng tốt |

- **Làm**: hợp đồng và bước làm.
- **Không làm**: ranh giới.
- **Xong khi**: lệnh và tiêu chí nghiệm thu.

Task hàng loạt (mô-đun Phase 2) dùng một card mẫu + một bảng có các cột `ID`, `Phụ thuộc`, `Sở hữu`; mỗi dòng là một task.

## 5. Quyết định chốt thêm khi chia việc (2026-10-01)

Các chỗ tài liệu chưa đủ để worker yếu làm mà không phải đoán. Leader chốt như sau, đảo được bằng cách sửa card + tài liệu nguồn.

| # | Chỗ thiếu | Chốt | Tài liệu đã sửa |
| --- | --- | --- | --- |
| D1 | `run(input, emit, tick)` không nhận `locale`, nhưng `explanation` phải theo locale | `WalkthroughEntry.run` nhận thêm `ctx: { locale }`; `steps(entry, input, {locale})` bọc `generateSteps`, còn `generateSteps` (ADR 0001) giữ nguyên. Hệ quả: `framesHash` tính theo **(preset, locale)**. Phương án khác là `explanation` thành khoá + bảng chữ, bị loại vì tác giả phải giữ thêm một bảng và Q&A phải tra thêm một tầng | ADR 0006 quyết định 7, DATA-MODEL §3, CONTENT-DESIGN §5.1, TEST-STRATEGY §3, Phase 1 §5 |
| D2 | Player chưa có nhịp phát và thao tác đổi preset | `BASE_FRAME_MS = 1200` [Inference], mỗi bước chờ `BASE_FRAME_MS / speed`; thêm `setTotal(total)` cho đổi preset; `play({restart})` mang ngữ nghĩa INTERFACES §1 điều 5 | — (card `1a-02`) |
| D3 | Client "hỏi server" cờ chặn `code` qua route nào | Route mới `GET /api/widgets/policy` → `{ codeWidgetAllowed: boolean }`, theo mẫu `/api/agent/runtime` | — (card `1b-02`) |
| D4 | Classic coerce `code` sang `diagram` hay `simulation` | Luôn sang `simulation` (vẫn tương tác được, không có ô chạy code) | — (card `1b-03`) |
| D5 | Kiểu JSON trong HTML, danh sách id DOM và `VisualizerRenderer` nằm đâu để builder, runtime và host dùng chung | Một module hợp đồng `lib/tutor/protocol/widget-data.ts` (chỉ kiểu + hằng) | — (card `1a-03`) |
| D6 | Builder lấy runtime của visualizer thế nào | `buildWalkthroughHtml` nhận chuỗi `runtimeJs`; provider tra qua `lib/tutor/build/runtimes.ts`. Visualizer mới thì test được mà không cần đăng ký trước | — (card `1b-10`, `1b-13`) |
| D7 | Cơ chế "hash đổi mà `entryRev` không tăng thì đỏ" | Tệp khoá `tests/subjects/catalog-lock.json` + cờ `UPDATE_CATALOG_LOCK=1`; chỉ leader cập nhật khoá (task `I-*`) | — (card `1b-17`) |
| D8 | Test trình duyệt cho runtime/visualizer cần dev server không | Không: dùng vitest + `chromium` của `@playwright/test`, bật bằng `TUTOR_BROWSER=1` (mẫu `tests/video-export/cover-card-layout.browser.test.ts`). Playwright e2e (`e2e/tests`) chỉ cho luồng trong app | — |
| D9 | `widget-state` ở host làm ở 1b hay 1c | Làm luôn ở `1b-22` (chỉ ghi store), để `InteractiveIframeHost.tsx` không bị sửa hai lần | — |
| D10 | Hình dạng thô của `InputSpec` kind `edge-list` | `{ n: int, edges: [from, to, weight?][] }`, chỉ số node từ 0, `from ≠ to`; có `weight` khi và chỉ khi spec có `weight` | — (card `1a-05`) |
| D11 | Đối chiếu C++/Python gọi hàm thế nào | Mỗi entry một harness ở `tests/subjects/cp/impl/<id>.ts` (`cppPrelude`, `cppMain`, `pyMain`, `stdin`, `expected`); kết quả so với oracle độc lập. Task mô-đun tự viết harness của mình | — (card `2-I1`) |
| D12 | Nội dung `clip-sheet.json` (Q&A cho clip) nằm đâu | Trong `ClipEntry.sheet` (mã); CI chép ra `clip-sheet.json`; Q&A tra từ entry | ARCHITECTURE §8b, DATA-MODEL §4 |
| D13 | Ràng buộc giữa các trường input (`l ≤ r < n`, nguồn < số đỉnh, input là cây) | `WalkthroughEntry.check?` và `ClipEntry.check?`: hàm thuần chạy sau `parseInput` ở mọi đường input, qua `validateInput` | ADR 0006 quyết định 7, INTERFACES §3, ARCHITECTURE §8b |
| D14 | `stack-queue` và `string-scan` mỗi cái gộp hai ý | `stack-queue` chỉ phần stack (ngoặc); hàng đợi dạy ở `bfs`. `string-scan` chỉ phần đối xứng; đếm tần suất ở `hash-count` | — (card `2A-03`, `2B-05`) |
| D15 | CI đối chiếu số liệu trong `manifest.json` với gì | Module clip export `expectedDisplay(input)` (hàm thuần); `tests/clips/manifest-check.test.ts` so | ARCHITECTURE §8b |
| D16 | Bài giải đề P2/P3 và 4 mô-đun 2D "do hội đồng chọn" | Leader đề xuất cụ thể ([Inference]): P2 `min-total-wait`, P3 `dijkstra-coupon`; 2D chạy thuật toán thật trên input rất nhỏ (`hld`, `max-flow`, `aho-corasick`, `convex-hull-trick`). Hội đồng duyệt ở `I-05`/`I-06`, trượt thì thay | — |
| D17 | Visualizer cần thêm gì cho các mô-đun Phase 2 | `array`: `rows` có nhãn, `intervals`; `tree`: `note`, `edgeLabel`; `graph`: `label` cho node/cạnh; mọi visualizer: kind `group-0`…`group-5` | — (card `2-V*`; leader chép vào ARCHITECTURE §8 ở `I-03`) |
| D18 | Giới hạn kích thước làm vỡ lưới/frame | `n-queens` nhận `n ∈ {1,3,4,5,6}` (thêm biên); `dp-bitmask` giới hạn n ≤ 4 (n = 5 cần 32 hàng, vượt lưới 16 × 13) | — |
| D19 | Walkthrough Toán không có mã C++/Python | `code.impl`/`map` rỗng, chỉ có `pseudo` (các bước); shell chỉ dựng tab có nội dung | ADR 0006 quyết định 7; card `1b-10`, `1b-11`, `1b-16` |

**Còn mở, chốt khi tới task (cấp `L`):**
- Cơ chế "entry chưa có review đạt thì không phát hành" (`1c-20`).
- CSP cho widget LLM (`1b-26`, sau spike Q10).
- Cách chấm câu dự đoán (`1c-05`); điểm ghi `hint`/`rating` (`1c-13`); phạm vi lọc chữ khi ghi scene (`1c-15`).
- Cách đưa HTML của KaTeX vào iframe (`3B-Q8`); cấu hình TeX trong sandbox (`3C-02`).
- Mẫu Lô B nào làm ở 3B (`3-S5`).

## 6. Điểm đăng ký chung (leader giữ)

Worker **không** sửa các file dưới đây. Card ghi "báo leader dòng cần thêm"; leader thêm ở task `I-*`.

| File | Vì sao chung | Ai sửa |
| --- | --- | --- |
| `lib/subjects/cp/pack.ts`, `lib/subjects/index.ts` | Mọi entry/môn mới phải đăng ký | `1b-15` tạo; sau đó `I-*` |
| `tests/subjects/catalog-lock.json` | Đổi theo mỗi entry | `I-*` (`UPDATE_CATALOG_LOCK=1`) |
| `lib/tutor/build/runtimes.ts` | Mỗi visualizer một dòng | `1b-13` tạo; sau đó `I-*` |
| Khối id sinh ra trong `skills/agent-runtime/competitive-programming/SKILL.md` | Sinh lại khi catalog đổi | `I-*` (`pnpm exec tsx scripts/generate-skill-catalog.ts`) |
| `package.json` (scripts) | Mọi script mới | `I-*` |
| `.github/workflows/ci.yml` | Mỗi browser test một step (TEST-STRATEGY §3) | `I-*` |
| `lib/subjects/math/pack.ts`, khối id trong `skills/agent-runtime/olympiad-math/SKILL.md` | Mọi clip/walkthrough Toán phải đăng ký | `I-08` tạo; sau đó `I-09`, `I-11` |
| `lib/clips/generated/asset-index.json` và asset trong `public/clips/` | Mỗi lần render mẫu đều cập nhật | `3A-07` tạo; task `M` chạy render, leader commit |

## 7. Đợt (tính từ phụ thuộc)

Đợt N = task có chuỗi phụ thuộc dài nhất bằng N. Trong một đợt, các task chạy song song được. `check_docs.py` tính lại bảng này và báo lỗi nếu lệch.

| Đợt | Task |
| --- | --- |
| 1 | 0-01, 0-02, 0-03, 0-04, 0-05, 1a-01, 1a-02, 1a-03, 1a-05, 1a-06, 1a-08, 1b-01, 1b-02, 1b-03, 1b-08, 1b-09, 1b-24, 1c-05, 1c-08, 1c-10, 1c-12, 1c-13, 3-S1, 3-S2, 3-S4 |
| 2 | 1a-04, 1b-04, 1b-06, 1b-10, 1b-11, 1b-21, 1b-22, 1b-26, 1c-09, 3-R1, 3A-04, 3A-13 |
| 3 | 1a-07, 1b-05, 1b-07, 1b-12, 1c-01, 1c-06, 1c-07, 1c-11, 1c-14, 1c-17, 3-S5, 3A-05, 3A-06 |
| 4 | 1b-13, 1b-15 |
| 5 | 1b-16, 1b-17, 1b-23 |
| 6 | 1b-14, 1b-18, 1b-20, 1b-25, 1c-02, 1c-18, 1c-19, 1c-22, 2-00 |
| 7 | 1b-19, 1c-03, 1c-04, 1c-15, 1c-20, 3A-08 |
| 8 | 1c-16, 1c-21, I-01, 3A-17 |
| 9 | I-02, 3-S3, 3A-01 |
| 10 | G1-01, 3A-02, 3A-07, 3A-T1, 3A-T2, 3A-T3 |
| 11 | 1d-00, 2-E1, 2-I1, 2-IS1, 2-S1, 2-V1, 2-V2, 2-V3, 2-V4, 2A-01, 2A-02, 2A-04, 2A-05, 2A-06, 2A-07, 2A-08, 2A-09, 3A-03, 3A-M1, 3A-M2, 3A-M3, 3B-V1, 3B-V2 |
| 12 | 1d-01, 1d-03, I-03, 2A-03, 3A-12, 3B-W2, 3B-W3 |
| 13 | 1d-02, 1d-04, I-04, I-08, 3B-00 |
| 14 | 1d-05, 2-G2, 3B-E1, 3B-Q8, 3B-QA, 3B-T1, 3B-T10, 3B-T11, 3B-T12, 3B-T13, 3B-T14, 3B-T2, 3B-T3, 3B-T4, 3B-T5, 3B-T6, 3B-T7, 3B-T8, 3B-T9 |
| 15 | 2B-01, 2B-02, 2B-03, 2B-04, 2B-05, 2B-06, 2B-07, 2B-08, 2B-09, 2B-10, 2B-11, 2B-12, 3B-K1, 3B-M1, 3B-M10, 3B-M11, 3B-M12, 3B-M13, 3B-M14, 3B-M2, 3B-M3, 3B-M4, 3B-M5, 3B-M6, 3B-M7, 3B-M8, 3B-M9 |
| 16 | I-05, 3B-V3 |
| 17 | 2C-01, 2C-02, 2C-03, 2C-04, 2C-05, 2C-06, 2C-07, 2C-08, 2D-01, 2D-02, 2D-03, 2D-04, 3B-W1 |
| 18 | I-06, I-09 |
| 19 | 2E-01, 2E-02, 2E-03, 2E-04, 2E-05, 3C-01, 3C-05, 3C-06, 3C-07, 3D-01, 3D-T1, 3D-T2, 3D-T3, 3D-T4 |
| 20 | I-07, I-12, 3C-02, 3C-08, 3D-02 |
| 21 | 2-CI1, 3C-03, 3D-03, 3D-M1, 3D-M2, 3D-M3, 3D-M4 |
| 22 | I-11, 3C-04 |
| 23 | 3C-09 |
| 24 | I-10 |

Đợt là thứ tự **sớm nhất có thể**. Leader vẫn có thể dời task cùng đợt để giới hạn số worker chạy cùng lúc.

- Phase 1 đi hết đợt 1–10 (tới `G1-01`), rồi lát 1d ở đợt 11–14.
- Phase 2 bắt đầu từ đợt 11, vì mọi task Phase 2 cần `G1-01`.
- Phase 3 chạy theo chuỗi riêng 3-0 → 3A → 3B → 3C/3D. 3-0 và 3A không chờ G1: chỉ cần lát 1b (`I-01`) và một phần 1c (`1c-08`, `1c-18`). Từ 3B trở đi chờ `G1-01` qua visualizer `3B-V1`, `3B-V2`, và chờ `I-02` qua `3B-QA`. Mô-đun Tin `2E-05` chờ `3B-V1`.
- Đợt 1 có 18 task cấp `W`/`W+` giao được ngay sau `0-01`, chủ yếu là lát 1a và các lớp chặn `code` độc lập.

## 8. Việc đang chờ user trước khi giao

| Việc | Vì sao chặn | Task |
| --- | --- | --- |
| Commit `docs/tutor/` (và curriculum) lên nhánh `feat/tutor` | Worktree của worker chỉ thấy file đã commit; tài liệu đang untracked (RISKS R18, user để "Hoãn") | `0-01` |
| Điền khoá API, xác nhận tên model chính xác (spike Q16) | Eval, hội đồng LLM, bộ lọc và cổng G1 cần gọi model thật | `0-02` |
| Đồng ý giao việc cho worker OpenCode (tốn quota) | Quy tắc giao việc của user: hỏi trước mỗi kế hoạch | khi bắt đầu đợt 1 |
