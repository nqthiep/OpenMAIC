# Task Phase 3 (Chuyên Toán, walkthrough tương tác)

- **Trạng thái**: Accepted — các card dưới đây đã làm xong, trừ `3A-17` (chờ hai model mạnh). Viết lại 2026-10-09 theo [ADR 0015](../decisions/0015-math-interactive-web-ui-not-video.md): các card clip và Manim của bản trước (hạ tầng clip, `manim/`, `manim-service`, vòng LLM tác giả, các mẫu clip, tích hợp I-08…I-11) đã bỏ cùng mã của chúng; có thể xem lại trong lịch sử git và thẻ `manim-clips-final`.
- **Ngày**: 2026-10-01 (viết lại 2026-10-09)
- **Người sở hữu**: Chủ dự án (leader điều phối)
- **Liên quan**: [README](README.md), [phase-1](phase-1.md), [phase-2](phase-2.md), [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md), [../decisions/0014-llm-roles-and-learner-data.md](../decisions/0014-llm-roles-and-learner-data.md), [../decisions/0015-math-interactive-web-ui-not-video.md](../decisions/0015-math-interactive-web-ui-not-video.md)

> **Tóm tắt:** Phase 3 còn 14 card:
> - **Nghiên cứu** (1): `3-R1` curriculum Toán kèm nguồn.
> - **Skill và hội đồng** (3): `3A-13` tên skill ở 12 locale, `3A-12` skill `olympiad-math`, `3A-17` hiệu chuẩn hội đồng LLM Toán.
> - **KaTeX, visualizer, walkthrough** (10): `3B-00` chia curriculum, `3B-Q8`/`3B-K1` KaTeX phía server, `3B-V1…V3` visualizer `geometry`/`functionPlotter`/`proofOutline`, `3B-W1…W3` ba walkthrough đầu, `3B-E1` eval Toán.
>
> Các walkthrough Toán còn lại (24 entry, SCHEMA §3) không có card riêng: mỗi entry là một file `lib/subjects/math/catalog/<id>.ts` kèm `tests/subjects/math/<id>.test.ts`, làm theo card mẫu Phase 2 (§2 của [phase-2](phase-2.md)) và quy ước ở SCHEMA §4.

## 1. Nghiên cứu

### 3-R1 · Nghiên cứu curriculum Toán

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | — |
| Phụ thuộc | 0-01 |
| Sở hữu | `docs/tutor/curriculum/curriculum-math-vn.json` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §7; [../DATA-MODEL](../DATA-MODEL.md) §5 |

**Làm**
1. Khung tier × topic có `primary_medium`, cùng hình dạng file Tin. Dùng khung 28 topic ở Phase 3 §7 làm điểm xuất phát; id dạng `m<tier>-<tên>` (ví dụ `m1-inequality-basic`).
2. Mọi tên kỳ thi/tài liệu phải có nguồn; không có thì ghi [Unverified]. Hội đồng LLM Toán duyệt kèm nguồn.

**Xong khi:** file qua kiểm bất biến như curriculum Tin; có `provenance`. Mỗi walkthrough Toán lấy id topic ở đây để điền vào `curriculumTopics`.

## 2. Skill và hội đồng Toán

### 3A-13 · Tên skill Toán ở workbench (12 locale)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | 1b-24 |
| Sở hữu | `lib/i18n/workbench.ts`, `lib/i18n/workbench-locales/*.json` |
| Đọc | card `1b-24` |

**Làm:** thêm `skill.title.olympiad-math` (ví dụ tiếng Việt: "Chuyên Toán").

**Xong khi:** `pnpm vitest run tests/workbench/workbench-i18n.test.ts` và `pnpm check:i18n-keys` xanh.

### 3A-12 · Skill `olympiad-math`

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | 3A-13 |
| Sở hữu | `skills/agent-runtime/olympiad-math/SKILL.md`, `skills/agent-runtime/olympiad-math/outline-constraints.json` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §5, §7 |

**Làm**
1. Frontmatter: `title` có chữ Hán (ví dụ `数学奥林匹克`).
2. Nội dung:
   - không bài luyện code; blueprint 8 giai đoạn;
   - "mỗi định lý có ≥ 1 hình minh hoạ";
   - các bước "cho / có / do / suy ra";
   - khối id sinh ra (để trống giữa marker; sinh bằng `scripts/generate-skill-catalog.ts`).
3. `outline-constraints.json`: `allowedTypes`, `firstSceneType: "slide"` (không `sceneCount`, như skill Tin).

**Xong khi:** `pnpm vitest run tests/agent-runtime/skills.test.ts tests/workbench/workbench-i18n.test.ts` xanh.

### 3A-17 · Hiệu chuẩn hội đồng LLM Toán

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 1c-18 |
| Sở hữu | — |
| Đọc | ADR 0014 quyết định 7; card `1c-18`; `eval/tutor-review/runner.ts` |

**Làm**
1. Chạy `pnpm exec tsx eval/tutor-review/runner.ts --panel math --calibrate` với hai model mạnh khác nhà cung cấp (`MODEL_ROUTES`: `tutor-review-math`, `tutor-review-math-2`). Bộ lỗi gieo là `eval/tutor-review/seed-errors.ts` (với Toán áp dụng các loại `explanation`, `narration`, `hint`) cùng ≥ 10 bản đúng.
2. Hội đồng phải bắt ≥ 90% lỗi gieo và chặn nhầm ≤ 10%.

**Xong khi:** đạt ngưỡng, ghi vào RISKS (R34); không đạt thì dừng ký entry Toán. Hạ tầng đã có; còn chờ hai model mạnh (model miễn phí đã thử, không dùng được làm cổng: HANDOFF §3b).

## 3. KaTeX, visualizer và walkthrough Toán

### 3B-00 · Chia curriculum Toán vào `references/` của skill

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | 3-R1, 3A-12 |
| Sở hữu | `skills/agent-runtime/olympiad-math/references/curriculum/`, `scripts/split-curriculum-math.ts`, `tests/tutor/curriculum-math.test.ts` |
| Đọc | card `2-00` (cùng cách làm); [../DATA-MODEL](../DATA-MODEL.md) §5 |

**Làm:** như `2-00`, đọc `docs/tutor/curriculum/curriculum-math-vn.json`. `index.json` thêm trường `primary_medium`.

**Xong khi:** `pnpm vitest run tests/tutor/curriculum-math.test.ts tests/agent-runtime/skills.test.ts` xanh.

### 3B-Q8 · Spike Q8: KaTeX dựng sẵn trong walkthrough

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | — |
| Phụ thuộc | I-01 |
| Sở hữu | — |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §8 (kết quả Q8); tiền lệ `lib/video-export/emit-hyperframes/katex-assets.ts`; ADR 0010 quyết định 7 |

**Làm**
1. Chốt cách HTML của KaTeX vào iframe mà vẫn giữ quy tắc "chỉ `textContent` cho dữ liệu". Đề xuất:
   - server render mọi đoạn `\( … \)` trong chữ của catalog thành bảng `math: { [hash]: html }` trong `walkthrough-data`;
   - runtime chèn đúng các mảnh đó qua `<template>` (nguồn là tác giả catalog, không phải input).
2. Đo kích thước CSS + font inline (≤ ~300 KB); kiểm qua export HTML/MP4/ZIP.
3. Cập nhật card `3B-K1`, `3B-V3` và SECURITY.

**Xong khi:** quyết định ghi vào ADR 0010 (L5) và Phase 3 §8.

### 3B-K1 · KaTeX phía server cho walkthrough

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 3B-Q8 |
| Sở hữu | `lib/tutor/build/katex.ts`, `lib/tutor/build/build-html.ts`, `tests/tutor/build/katex.test.ts` |
| Đọc | kết luận `3B-Q8`; `lib/video-export/emit-hyperframes/katex-assets.ts`; card `1b-10` |

**Làm** theo hợp đồng của `3B-Q8`:
1. `renderMathSegments(text)`: tìm `\( … \)` và render bằng `katex.renderToString` (`throwOnError: false`, `trust: false`).
2. Nhúng CSS + font KaTeX inline (data URI) vào HTML khi entry có công thức.
3. Không đổi HTML của entry không có công thức (test so byte).

**Xong khi:** `pnpm vitest run tests/tutor/build/katex.test.ts tests/tutor/build/build-html.test.ts` xanh. HTML vẫn có CSP; không `<script src`.

### 3B-V1 · Visualizer `geometry`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/tutor/runtime/visualizers/geometry.ts`, `lib/tutor/runtime/entries/geometry.ts`, `lib/tutor/build/generated/runtime-geometry.ts`, `tests/tutor/runtime/geometry-layout.test.ts`, `tests/tutor/runtime/geometry.browser.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8 (dòng `geometry`); card `2-V2` làm mẫu |

**Làm**
1. State:
   ```ts
   {
     bounds: { xmin: number; xmax: number; ymin: number; ymax: number }
     points: { id: string; x: number; y: number; label?: string }[]
     segments?: { id: string; from: string; to: string; dashed?: boolean }[]
     lines?: { id: string; through: [string, string] }[]          // đường thẳng kéo dài hết khung
     circles?: { id: string; center: string; r: number }[]
     angles?: { id: string; at: string; from: string; to: string; label?: string }[]
   }
   ```
2. Khoá `highlights` là id đối tượng; kind dùng chung như `2-V1`.
3. Hàm thuần `toScreen(bounds, width, height)` (giữ tỉ lệ, trục y hướng lên), có test.
4. Dùng chung cho Tin (`graham-scan`) và Toán.

**Xong khi:** như `2-V2`, với `geometry-layout` và `geometry.browser`.

### 3B-V2 · Visualizer `functionPlotter`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/tutor/runtime/visualizers/function-plotter.ts`, `lib/tutor/runtime/entries/function-plotter.ts`, `lib/tutor/build/generated/runtime-function-plotter.ts`, `tests/tutor/runtime/function-plotter-layout.test.ts`, `tests/tutor/runtime/function-plotter.browser.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8 (dòng `functionPlotter`); card `2-V2` làm mẫu |

**Làm**
1. State:
   ```ts
   {
     bounds: { xmin: number; xmax: number; ymin: number; ymax: number }
     curves: { id: string; points: [number, number][] }[]   // điểm mẫu do run() tính sẵn
     marks?: { id: string; x: number; y: number; label: string }[]
     vlines?: { id: string; x: number; label?: string }[]
   }
   ```
2. **Không** nhận biểu thức, không parser/`eval`: chỉ nối các điểm đã tính.
3. Trục, vạch chia, nhãn; đường cắt ở mép khung. Hàm thuần `niceTicks(min, max)` có test.

**Xong khi:** như `2-V2`, với `function-plotter-layout` và `function-plotter.browser`.

### 3B-V3 · Visualizer `proofOutline`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 3B-K1 |
| Sở hữu | `lib/tutor/runtime/visualizers/proof-outline.ts`, `lib/tutor/runtime/entries/proof-outline.ts`, `lib/tutor/build/generated/runtime-proof-outline.ts`, `tests/tutor/runtime/proof-outline.browser.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8 (dòng `proofOutline`); kết luận `3B-Q8` |

**Làm**
1. State `{ nodes: { id: string; kind: 'given' | 'goal' | 'have' | 'because' | 'therefore'; text: string; parent?: string; status?: 'pending' | 'done' }[] }`.
2. Hiển thị cây "cho / cần chứng minh / có / do / suy ra" thụt lề theo `parent`.
3. Công thức trong `text` hiện theo cách `3B-Q8` chốt.

**Xong khi:** `TUTOR_BROWSER=1 pnpm exec vitest run tests/tutor/runtime/proof-outline.browser.test.ts` xanh. Kiểm công thức hiện đúng, 0 request ra ngoài.

### 3B-W1 · Walkthrough Toán `cauchy-schwarz` (chứng minh từng bước)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 3B-V3, 3-R1 |
| Sở hữu | `lib/subjects/math/catalog/cauchy-schwarz.ts`, `tests/subjects/math/cauchy-schwarz.test.ts` |
| Đọc | card mẫu Phase 2 ([phase-2](phase-2.md) §2), trừ phần C++/Python và harness; [README](README.md) §5 D19 |

**Làm** theo card mẫu Phase 2 (`subject: 'math'`, không có harness), với:
- **Bài:** `(a₁b₁ + a₂b₂)² ≤ (a₁² + a₂²)(b₁² + b₂²)`, chứng minh bằng đẳng thức Lagrange.
- **Code:** chỉ `pseudo` (các bước chứng minh); `impl.cpp = impl.py = []`; `map` rỗng.
- **Visualizer:** `proofOutline`; `vars` hiện hai vế và hiệu tính bằng số của input.
- **Input:** `record { a1, a2, b1, b2: int[-5,5] }`.
- **Preset:** `generic` (1, 2, 3, 4); `proportional` (1, 2, 2, 4: dấu bằng); `zero` (0, 0, 3, 4); `negative` (−1, 3, 2, −2).
- **Beat:**
  - `start`*; `given`; `expand` (khai triển hai vế);
  - `lagrange`, dự đoán: "hiệu hai vế bằng bình phương của biểu thức nào?", chọn `a₁b₂ − a₂b₁` / `a₁b₁ − a₂b₂`;
  - `conclude`; `equality`; `done`*.
- **Oracle:** tính số hai vế; hiệu bằng `(a₁b₂ − a₂b₁)²`.
- **Ngưỡng:** 20.

**Xong khi:** như card mẫu Phase 2, với test ở `tests/subjects/math/cauchy-schwarz.test.ts`.

### 3B-W2 · Walkthrough Toán `triangle-altitude` (dựng ba đường cao)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 3B-V1, 3-R1 |
| Sở hữu | `lib/subjects/math/catalog/triangle-altitude.ts`, `tests/subjects/math/triangle-altitude.test.ts` |
| Đọc | card mẫu Phase 2 ([phase-2](phase-2.md) §2), trừ phần C++/Python và harness; [README](README.md) §5 D19 |

**Làm** theo card mẫu Phase 2 (`subject: 'math'`), với:
- **Code:** chỉ `pseudo` (các bước dựng hình).
- **Visualizer:** `geometry`; chân đường cao `Ha`, `Hb`, `Hc`; trực tâm `H`.
- **Input:** `record { x1, y1, x2, y2, x3, y3: int[-6,6] }`. **check:** tam giác không suy biến.
- **Preset:** `acute` (0, 0, 6, 0, 2, 4); `obtuse` (0, 0, 6, 0, −2, 2); `right` (0, 0, 4, 0, 0, 3); `isosceles` (−3, 0, 3, 0, 0, 4).
- **Beat:**
  - `start`*; `altitude-a`; `altitude-b`;
  - `predict-meet`, dự đoán: "đường cao thứ ba có đi qua giao điểm của hai đường đầu không?", chọn có / không;
  - `altitude-c`; `orthocenter`; `done`*.
- **Oracle:**
  - tích vô hướng tại chân đường cao bằng 0 (sai số 1e-9);
  - ba đường đồng quy (`|det| < 1e-9`);
  - trực tâm khớp công thức độc lập.
- **Ngưỡng:** 20.

**Xong khi:** như card mẫu Phase 2, với test ở `tests/subjects/math/triangle-altitude.test.ts`.

### 3B-W3 · Walkthrough Toán `curve-sketching` (khảo sát đa thức bậc ≤ 3)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 3B-V2, 3-R1 |
| Sở hữu | `lib/subjects/math/catalog/curve-sketching.ts`, `tests/subjects/math/curve-sketching.test.ts` |
| Đọc | card mẫu Phase 2 ([phase-2](phase-2.md) §2), trừ phần C++/Python và harness; [README](README.md) §5 D19 |

**Làm** theo card mẫu Phase 2 (`subject: 'math'`), với:
- **Code:** chỉ `pseudo` (các bước khảo sát).
- **Visualizer:** `functionPlotter`. Điểm mẫu tính bằng Horner (lint cấm `Math.pow`); cực trị và điểm uốn là `marks`.
- **Input:** `record { c: int-array(len[2,4], range[-3,3]) }`, hệ số theo bậc tăng. **check:** hệ số bậc cao nhất ≠ 0.
- **Preset:** `cubic` (`[0,-3,0,1]`: x³ − 3x); `square` (`[0,0,1]`); `pure-cubic` (`[0,0,0,1]`: có điểm uốn, không cực trị); `neg-cubic` (`[0,0,3,-1]`).
- **Beat:**
  - `start`*;
  - `derivative`;
  - `roots` (nghiệm của `f'` bằng công thức bậc hai, `Math.sqrt` được phép);
  - `sign`, dự đoán: "f' đổi dấu từ dương sang âm thì đó là cực đại hay cực tiểu?", chọn cực đại / cực tiểu;
  - `extrema`; `inflection`; `sketch`; `done`*.
- **Oracle:** `f'(x) = 0` tại nghiệm (sai số 1e-9); phân loại cực trị bằng dấu `f'` ở hai bên.
- **Ngưỡng:** 20.

**Xong khi:** như card mẫu Phase 2, với test ở `tests/subjects/math/curve-sketching.test.ts`.

### 3B-E1 · Eval bài giảng Toán

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | 2-E1, 3A-12 |
| Sở hữu | `eval/tutor-lesson/scenarios-math.json` |
| Đọc | card `2-E1`; [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §9 |

**Làm:** ≥ 3 scenario Toán: "dạy em chứng minh Cauchy–Schwarz", "khảo sát y = x³ − 3x", "AM–GM cho học sinh lớp 9". Runner của `2-E1` đọc thêm file này.

**Xong khi:** `pnpm exec tsx eval/tutor-lesson/runner.ts --dry-run` liệt kê cả scenario Toán.
