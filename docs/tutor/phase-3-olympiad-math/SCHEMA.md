# Phase 3 — Chuyên Toán (walkthrough tương tác): SCHEMA

- **Trạng thái**: Đã cài đặt phần nội dung (27 walkthrough, curriculum, skill, e2e); còn lại review LLM bằng hai model mạnh và kiểm chứng chi tiết thi cử (xem §10). Viết lại 2026-10-09 theo [ADR 0015](../decisions/0015-math-interactive-web-ui-not-video.md); bản trước (clip Manim, ADR 0007) đã bị thay.
- **Ngày**: 2026-09-30 (viết lại 2026-10-09)
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [../CONTENT-DESIGN](../CONTENT-DESIGN.md), [../OPERATIONS](../OPERATIONS.md), [../SECURITY](../SECURITY.md), [../RISKS](../RISKS.md), [../HANDOFF §3b](../HANDOFF.md), ADR 0005, 0009, 0011, 0012, 0014, 0015

> **Tóm tắt:** Chuyên Toán dùng **walkthrough tương tác** trên cùng khuôn với Tin: SVG/DOM tự viết trong iframe, preset, tua khung, câu hỏi dự đoán có chờ, Q&A theo frame. Không video, không thư viện đồ hoạ ngoài (ADR 0002, 0015).
> - 27 walkthrough ở `lib/subjects/math/catalog/`, hầu hết dùng visualizer `geometry`; thêm `functionPlotter` và `proofOutline`.
> - Curriculum 28 topic (18 có walkthrough, 10 dùng slide), skill `olympiad-math`, hội đồng review Toán.
> - Không đổi package. Chỉ có ở đường agent (workbench).

## 1. Mục tiêu

- Bài giảng Toán nâng cao **trực quan, sinh động** bằng walkthrough: học sinh tự tua, chọn biến thể (preset), đoán bước kế rồi xem kết quả; thầy giảng theo beat của đúng preset.
- **Slide + `wb_latex`** cho chứng minh dài chữ nhiều.
- Không code editor cho học sinh (toàn ứng dụng). Interactive + visualizer là để bài giảng sinh động.
- Ví dụ: *"dạy em chứng minh Cauchy–Schwarz"* → slide + walkthrough `cs-projection` (trực giác) + `cauchy-schwarz` (chứng minh từng bước) + quiz; *"khảo sát y = x³ − 3x"* → `secant-tangent` + `curve-sketching`; *"dạy em cả chuyên đề Số học"* → chuỗi bài từ curriculum Toán (`curriculum-planner`).

## 2. Phạm vi — phân bổ vai trò

| Loại nội dung | Chính | Bổ trợ |
| --- | --- | --- |
| Hình học động, cắt–ghép, diện tích, đường tròn, biến hình, đếm trên lưới, giới hạn, tích phân | Walkthrough `geometry` | slide (phát biểu) |
| Khảo sát hàm đa thức | Walkthrough `functionPlotter` | slide |
| Chứng minh có cấu trúc (cho / có / do / suy ra) | Walkthrough `proofOutline` | slide |
| Chứng minh dài chữ nhiều (SOS/Schur, phương trình hàm, bậc/LTE, cực trị tổ hợp), định nghĩa | **Slide + `wb_latex`** | — |

## 3. Catalog walkthrough Toán (27 entry)

Nguồn gốc: 3 entry có từ đầu (`cauchy-schwarz`, `triangle-altitude`, `curve-sketching`), 21 entry viết lại từ các mẫu clip của thiết kế cũ (cùng id), 3 entry viết mới (`mvt-lagrange`, `inversion-circle`, `subtraction-game`). Mỗi entry có 3–5 preset.

| id | Nội dung | Visualizer | Topic |
| --- | --- | --- | --- |
| `alg-identity-area` | Hằng đẳng thức bằng diện tích | geometry | m1-alg-identities |
| `amgm-semicircle` | AM–GM bằng nửa đường tròn | geometry | m1-inequality-basic |
| `graph-transform` | Biến đổi đồ thị y = a·f(x − h) + k | geometry | m1-quadratic-vieta |
| `triangle-altitude` | Ba đường cao và trực tâm | geometry | m1-triangle-geometry |
| `concurrency-dynamic` | Các đường đồng quy khi đỉnh chạy | geometry | m1-triangle-geometry |
| `pythagoras-dissection` | Pythagore bằng cắt ghép | geometry | m1-triangle-geometry |
| `inscribed-angle` | Góc nội tiếp | geometry | m1-circle-angles |
| `cauchy-schwarz` | Cauchy–Schwarz (hai cặp số) | proofOutline | m2-inequality-classic |
| `cs-projection` | Cauchy–Schwarz bằng hình chiếu | geometry | m2-inequality-classic |
| `convex-chord` | Dây cung trên đồ thị lồi (Jensen) | geometry | m2-inequality-classic |
| `modular-clock` | Nhân modulo trên mặt đồng hồ | geometry | m2-modular-arith |
| `euclid-rectangle` | Euclid bằng lát hình vuông | geometry | m2-euclid-diophantine |
| `power-of-point` | Phương tích của một điểm | geometry | m2-circle-power |
| `tiling-coloring` | Bàn cờ bỏ hai ô, lát domino | geometry | m2-pigeonhole-invariants |
| `figurate-sums` | Tổng bằng chấm: số lẻ, số tam giác | geometry | m2-induction |
| `induction-fallacy` | Ngụy biện quy nạp | geometry | m2-induction |
| `geometric-series-area` | Chuỗi hình học bằng diện tích | geometry | m3-sequences-limits |
| `limit-epsilon` | Giới hạn dãy: dải ε và số N | geometry | m3-sequences-limits |
| `curve-sketching` | Khảo sát và vẽ đồ thị đa thức (bậc ≤ 3) | functionPlotter | m3-derivative-graphs |
| `secant-tangent` | Từ cát tuyến đến tiếp tuyến | geometry | m3-derivative-graphs |
| `inclusion-exclusion` | Bao hàm – loại trừ cho ba tập | geometry | m3-counting-advanced |
| `lattice-paths` | Đường đi trên lưới, tam giác Pascal | geometry | m3-counting-advanced |
| `plane-transform` | Phép biến hình và nhân số phức | geometry | m3-vector-transform-complex |
| `riemann-integral` | Tổng Riemann và tích phân | geometry | m4-integral |
| `mvt-lagrange` | Định lý giá trị trung bình (Lagrange) | geometry | m4-limits-mvt |
| `inversion-circle` | Phép nghịch đảo đối với đường tròn | geometry | m4-projective-inversion |
| `subtraction-game` | Trò chơi lấy que: vị trí thắng, thua | geometry | m4-games-invariants |

## 4. Quy ước chung của walkthrough Toán

- `customInput: false` (lát 1d chưa mở): tương tác là preset, bước/phát/tua và dự đoán. "Thanh trượt" là chuỗi khung tua được.
- Mọi con số trên màn hình là số nguyên hoặc phân số chính xác. Tham số thập phân đổi thành số nguyên (ví dụ `tn` = t tính bằng phần mười, `e` = ε tính bằng 1/20); lời giải thích không có số thập phân.
- Hình dựng bằng `lib/subjects/math/figure.ts` (`Figure`, `boundsOf`, `curvePieces`, `upperSemicircle`, `circlePoint`, `gcd`, `frac`, `framePut`). Đường tròn dùng hằng số xoay, **không lượng giác** (catalog lint cấm trig, `Date`, `Intl`, `Math.random` trong `lib/subjects/**`).
- Giới hạn của `geometry`: 160 điểm, 120 đoạn, 140 đa giác, 12 polyline ≤ 200 điểm; trục y hướng lên, một tỉ lệ cho cả hai trục (ARCHITECTURE §8).
- `functionPlotter` **không nhận biểu thức**: server tính điểm mẫu từ hệ số đa thức, không parser/`eval`. `proofOutline` dùng KaTeX dựng sẵn trên server (kết quả Q8, §8).
- Lời giải thích ≤ 160 ký tự; số trong lời chỉ lấy từ input, state hoặc `vars` khai báo (contract chung của catalog, `tests/subjects/cp/contract.ts`).

## 5. Blueprint bài giảng Toán (8 giai đoạn)

| # | Giai đoạn | Scene · phương tiện | Hành động thầy |
| --- | --- | --- | --- |
| 1 | Động cơ / bài toán | slide, hình tĩnh | speech; hỏi mở, học sinh dự đoán |
| 2 | Trực giác bằng hình động | walkthrough `geometry` / `functionPlotter` | hỏi dự đoán → `widget_setState{preset, frame}` → giải thích |
| 3 | Phát biểu | slide LaTeX (điều kiện, dấu =) | spotlight vào điều kiện |
| 4 | Chứng minh từng bước | walkthrough `proofOutline`; dòng đại số ở slide/`wb_latex` | speech từng bước; `widget_setState{frame}` |
| 5 | Ví dụ mẫu | slide + wb; walkthrough đổi preset | speech, `discussion` |
| 6 | Biến thể + sai lầm | walkthrough phản mẫu (`induction-fallacy`, `tiling-coloring`) + quiz "sai ở bước nào?" | phản hồi `aiComment` |
| 7 | Kiểm tra | quiz single/short_answer, ≥ 1 câu dự đoán | — |
| 8 | Tổng kết + mở rộng | slide | speech |

Recipe: 6–8 scene, scene 1 là slide, 1–3 walkthrough mỗi bài. Một walkthrough một ý (takeaway ≤ 1 câu); luôn nói rõ "đây là trực giác, chứng minh chặt ở bước sau" để tránh "chứng minh bằng hình đặc biệt".

**Tương tác của học sinh:** chọn preset (3–5 biến thể dựng sẵn, tức thì), bước/phát/tua, trả lời dự đoán có chờ. Tham số tự do (`customInput`) chỉ mở sau lát 1d.

**Q&A theo frame:** `describe()` tra catalog theo `walkthroughId`, `entryRev`, preset, frame; thầy dùng `hints` (3 bậc) và `misconceptions` của beat hiện tại (ADR 0009, 0013).

## 6. Cấu trúc mã

```
lib/subjects/math/
  pack.ts            # SubjectPack 'math' (27 walkthrough)
  figure.ts          # bộ dựng hình dùng chung
  catalog/<id>.ts    # một entry mỗi file
  reviews/           # file review của hội đồng LLM (chưa có file nào)
lib/tutor/runtime/visualizers/{geometry,function-plotter,proof-outline}.ts
tests/subjects/math/<id>.test.ts
skills/agent-runtime/olympiad-math/{SKILL.md, outline-constraints.json, references/curriculum/}
```

Tạo scene bằng tool `generate_walkthrough` như Tin (ADR 0011); chặn `code`, CSP và bắt tay `widget-ready` dùng nguyên hạ tầng Phase 1.

### 6.1. Quy trình sản xuất và đảm bảo đúng toán

1. **Brief** do hội đồng LLM Toán soạn từ curriculum: topic, takeaway (1 câu), hiểu lầm hay gặp.
2. **Viết entry** (LLM soạn nháp offline được, hoặc người): `inputSpec`, 3–5 `presets`, 5–10 `beatDefs` (3 gợi ý + hiểu lầm mỗi beat), `run` dựng hình bằng `figure.ts`.
3. **Cổng tự động không LLM**:
   - test oracle `tests/subjects/math/<id>.test.ts` đối chiếu số liệu và toạ độ với công thức độc lập;
   - contract chung của catalog (§4) và catalog lock (`UPDATE_CATALOG_LOCK=1` khi đổi nội dung; bắt buộc tăng `entryRev`);
   - quét trình duyệt thật (`tests/tutor/runtime/catalog-sweep.browser.test.ts`): mọi preset render đúng lời giải thích, không lỗi, không request ra ngoài.
4. **Hội đồng LLM Toán ký** (`tutor-review-math` + `-2`, hai nhà cung cấp): đúng, đủ điều kiện, không suy ngược từ hình đặc biệt; prompt reviewer riêng cho Toán (`buildMathReviewSystem`); bộ hiệu chuẩn chạy bằng `eval/tutor-review/runner.ts --calibrate`.
5. **Phát hành**: `OPENMAIC_REQUIRE_REVIEW=true` chỉ lộ entry có file review đạt ở đúng `entryRev` (INTERFACES §8.2).

Rubric: CONTENT-DESIGN §6. Judge N=3, đạt khi ≥ 70% mẫu (`EVAL_PASS_THRESHOLD` 0,7).

## 7. Skill và curriculum Toán

**Skill** `olympiad-math`: `SKILL.md` (`title` chứa chữ Hán, do `tests/agent-runtime/skills.test.ts`; không tạo bài luyện code; bảng `walkthroughId` **sinh từ catalog** bằng `pnpm exec tsx scripts/generate-skill-catalog.ts` và có snapshot test; blueprint §5; "mỗi định lý có ≥ 1 hình minh hoạ (walkthrough hoặc `wb_*`)"; khi user hỏi cả chuyên đề → `references/curriculum/index.json` + `curriculum-planner`). `outline-constraints.json` chỉ cảnh báo: `allowedTypes` (`slide`, `quiz`, `interactive`), `firstSceneType: "slide"`. i18n: `skill.title.olympiad-math` ở `workbenchEn`, `workbenchZh` và 10 overlay `workbench-locales/*.json`.

**Curriculum** `docs/tutor/curriculum/curriculum-math-vn.json` (nguồn chính), tách bằng `scripts/split-curriculum-math.ts` thành `references/curriculum/{index.json, tier-N.json}`. Hình dạng như file Tin, thêm `primary_medium` (`walkthrough` | `slide`), `walkthrough_ids[]` và `vn_sources[]`; 28 topic = 4 tier × 7. Test: `tests/tutor/curriculum-math.test.ts`.

| Tier (lớp) | Topic có walkthrough (id) | Topic dùng slide |
| --- | --- | --- |
| T1 Cơ sở (8–9) | alg-identities, inequality-basic, triangle-geometry, circle-angles | divisibility-primes, quadratic-vieta (kèm `graph-transform`), counting-basic |
| T2 Trung cấp (9–10) | inequality-classic, modular-arith, euclid-diophantine, circle-power, pigeonhole-invariants, induction | equations-systems |
| T3 Nâng cao (10–11) | sequences-limits, derivative-graphs, counting-advanced, vector-transform-complex | polynomials, inequality-advanced, number-theory-adv |
| T4 Chuyên sâu (11–12) | integral, limits-mvt, projective-inversion, games-invariants | functional-equations, number-theory-olympiad, combinatorics-olympiad |

Nguồn: 6 nguồn (đã thêm 2026-10-09; cấu trúc VMO 2026 lấy từ nguồn thứ cấp) cho `exam_profile` (đề cương VMO, thi vào 10 chuyên Toán, IMO, chương trình GDPT 2018) và `vn_sources` của 18 topic. **Vẫn `[Unverified]`**: đề VMO các năm khác và văn bản gốc của Bộ, quy chế chuyên-10 từng tỉnh, đối chiếu công báo gốc, trọng số topic trong đề.

## 8. Kết quả đo và kiểm

**Q8 — KaTeX dựng sẵn (2026-10-07, đã làm trong 3B-K1):** server dựng mỗi `\\( tex \\)` bằng `katex.renderToString` (`throwOnError`, `trust:false`, `maxExpand:100`; công thức hỏng hoặc quá dài giữ nguyên dạng chữ) thành bảng `walkthrough-data.math` (khoá là chính `tex`). Runtime cắt chuỗi bằng cùng hàm `splitMath` và chèn HTML đã dựng qua `<template>`; phần chữ khác vẫn `textContent`. CSS KaTeX kèm 10 font WOFF2 nhúng data URI (AMS, Caligraphic-Regular, Main-Regular/Bold/Italic, Math-Italic/BoldItalic, SansSerif-Regular, Size1, Size2) ≈ 230 KB ≤ 300 KB; chỉ thêm vào trang khi entry có công thức. Font ngoài danh sách (Fraktur, Script, Typewriter, Size3-4) rơi về font hệ thống [Inference: chưa có topic nào cần]. Đã kiểm trong Chromium: công thức hiện, font nạp từ data URI, 0 request ra ngoài, markup trong text không được parse. **Chưa kiểm** export HTML/MP4/ZIP của trang có công thức [Unverified]. Beat label và tuỳ chọn dự đoán chưa hỗ trợ công thức (chỉ `explanation` và `state`).

**Quét toàn catalog:** `tests/tutor/runtime/catalog-sweep.browser.test.ts` (`TUTOR_BROWSER=1`) mở mọi preset của mọi walkthrough trong iframe sandbox thật; Toán được đi từng frame ở `vi-VN` và ở hai đầu ở `en-US` (`TUTOR_SWEEP_FULL=1` đi hết). Bước riêng trong job `e2e` của CI.

## 9. Kiểm thử và eval

- Node: từng entry (oracle độc lập, biên, determinism, trần frame/byte, giới hạn visualizer), bộ kiểm hình dùng chung `tests/subjects/math/_figure-test.ts`, `tests/agent-runtime/skills.test.ts`, catalog↔SKILL.md (snapshot), `tests/tutor/curriculum-math.test.ts`, `tests/tutor/review-math.test.ts` (tài liệu review cho mọi entry; hội đồng giả phát hành được một entry), workbench i18n.
- Trình duyệt: quét catalog (§8) và e2e `e2e/tests/walkthrough-math.spec.ts` (vẽ hình, bước, đổi preset, không egress).
- Eval: `eval:tutor-lesson` với `eval/tutor-lesson/scenarios-math.json` (9 kịch bản Toán, có dữ kiện kiểm được).

## 10. Acceptance criteria

Đã đạt:
- [x] 27 walkthrough Toán, mỗi entry có test oracle; catalog lock và `entryRev`.
- [x] Visualizer `geometry` (đa giác, polyline, mũi tên), `functionPlotter`, `proofOutline`.
- [x] Skill `olympiad-math` (bảng id sinh từ catalog) và tên skill ở 12 locale.
- [x] Curriculum 28 topic với `walkthrough_ids`, 5 nguồn thật, `vn_sources` 18 topic.
- [x] Quét trình duyệt toàn catalog và e2e Toán trong CI; không đổi package (`git diff --name-only origin/main -- packages/@openmaic` rỗng).
- [x] Hạ tầng review Toán: prompt reviewer riêng, panel `math` và `--calibrate` trong `eval/tutor-review/runner.ts`.

Còn lại (cần model mạnh hoặc người):
- [ ] Hội đồng LLM Toán ký 27 entry bằng hai model mạnh khác nhà cung cấp (`MODEL_ROUTES`: `tutor-review-math`, `tutor-review-math-2`) và đạt bộ hiệu chuẩn; chưa có file nào trong `lib/subjects/math/reviews/`. Review bằng model miễn phí đã thử và không dùng được làm cổng (HANDOFF §3b).
- [ ] Kiểm chứng chi tiết thi cử còn `[Unverified]` (§7).
- [ ] Cổng G1/G2 cho Toán (học sinh mô phỏng); `customInput` cho Toán sau lát 1d.

## 11. Ngoài phạm vi và backlog

- Video và Manim: đã bỏ (ADR 0015); mã cũ còn ở thẻ git `manim-clips-final`. Chỉ mở lại bằng ADR mới.
- Desmos/GeoGebra, thư viện đồ hoạ ngoài (p5.js, JSXGraph, Three.js): ADR 0002, 0015.
- Visualizer `vector`/3D (trigger: ≥ 2 topic hình không gian → thêm `visualization3d`); kéo điểm trực tiếp trên hình (JSXGraph LGPL-3.0, cần ADR riêng).

## 12. Việc tiếp theo

Xem [HANDOFF §3b và §6](../HANDOFF.md): chạy review LLM và calibration cho hội đồng Toán; kiểm chứng chi tiết thi cử; mở `customInput` sau lát 1d. Điểm chung duy nhất khi thêm walkthrough: `lib/subjects/math/pack.ts` và khối id trong `SKILL.md` (sinh lại bằng `generate-skill-catalog.ts`).
