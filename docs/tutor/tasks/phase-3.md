# Task Phase 3 (Chuyên Toán, Manim là hướng chính)

- **Trạng thái**: Accepted — đã chia đủ 3-0, 3A, 3B, 3C, 3D; số liệu Manim (thời lượng, ngưỡng) là [Inference] tới khi spike 3-0 có kết quả, leader chỉnh card sau 3-0
- **Ngày**: 2026-10-01
- **Người sở hữu**: Chủ dự án (leader điều phối)
- **Liên quan**: [README](README.md), [phase-1](phase-1.md), [phase-2](phase-2.md), [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md), [../decisions/0007-manim-and-math-visualization.md](../decisions/0007-manim-and-math-visualization.md), [../decisions/0014-llm-roles-and-learner-data.md](../decisions/0014-llm-roles-and-learner-data.md)

> **Tóm tắt:** Phase 3 có 86 task, chia theo đợt:
> - **3-0** (6): spike S1–S5 + research curriculum Toán. S1, S2, S4 giao ngay, song song lát 1a.
> - **3A** (18): hạ tầng clip (`lib/clips`, tool, `manim/`, cổng QA, AST allowlist, render CI), vòng LLM tác giả, hiệu chuẩn hội đồng Toán, 3 mẫu đầu.
> - **3B** (40): KaTeX, 3 visualizer, 3 walkthrough Toán, Q&A cho clip, 5 mẫu còn lại của Lô A và 9 mẫu Lô B.
> - **3C** (10): `manim-service` cách ly mạnh + render theo yêu cầu.
> - **3D** (12): mở rộng catalog bằng LLM tác giả (Lô C) và theo dõi RSR.
>
> **Mỗi mẫu clip là hai task:**
> - `T` (cấp `W`): `ClipEntry` TypeScript + `invariants` + `expectedDisplay` + test. Worker yếu làm được, vì card cho sẵn tham số, preset, chapter.
> - `M` (cấp `L`): chạy vòng `manim-author` sinh mã `.py`, qua cổng QA, hội đồng ký, render.
>
> Mã Manim do LLM viết, AST allowlist và sandbox của dịch vụ là phần nhạy cảm bảo mật; leader duyệt.

## 1. Đợt 3-0 — spike và nghiên cứu

### 3-S1 · Spike S1: image Manim và hiệu năng

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | — |
| Sở hữu | `manim/spikes/s1/` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §8 (dòng S1) |

**Làm**
1. Dockerfile thử từ image chính thức Manim CE 0.21.0, ghim TeX Live và font OFL (Noto Sans, Be Vietnam Pro).
2. Đo kích thước giải nén và khởi động lạnh.
3. Viết 3 cảnh mẫu, mỗi cảnh render 15/30/60 s × (720p30, 1080p60) × (2, 4 vCPU, dùng `--cpus`). Đo thời gian, RSS đỉnh, MB của MP4.
4. Ghi `manim/spikes/s1/RESULT.md`: bảng số đo, lệnh tái hiện, cấu hình máy.

**Không làm:** sửa code app; thêm image vào `docker-compose.yml`.

**Xong khi:** đủ bảng số đo; leader so với ngưỡng Phase 3 §8 và ghi vào ADR 0007.

### 3-S2 · Spike S2: tiếng Việt trong Manim

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | — |
| Sở hữu | `manim/spikes/s2/` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §8 (dòng S2) |

**Làm**
1. 200 chuỗi có dấu qua `Text` (Noto Sans / Be Vietnam Pro), `MathTex` (xelatex hoặc `babel-vietnamese`) và `MathTypst`.
2. Script `fontTools` đếm glyph thiếu.
3. Xuất 50 cụm ra ảnh để leader duyệt va chạm dấu.
4. Đếm tỉ lệ biên dịch LaTeX.

**Xong khi:** `manim/spikes/s2/RESULT.md` có số glyph thiếu, tỉ lệ biên dịch, đường dẫn ảnh duyệt, và đề xuất LaTeX hay Typst.

### 3-S4 · Spike S4: tính tất định của render

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | S |
| Phụ thuộc | — |
| Sở hữu | `manim/spikes/s4/` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §8 (dòng S4) |

**Làm:** render cùng cảnh 2 lần trên cùng image, và trên 2 kiến trúc (amd64, arm64) nếu có máy. So bằng `ffmpeg -f framemd5`; khác thì đo SSIM.

**Xong khi:** `manim/spikes/s4/RESULT.md` có tỉ lệ khung giống nhau và SSIM thấp nhất.

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

**Xong khi:** file qua kiểm bất biến như curriculum Tin; có `provenance`. Mọi card `T` dưới đây có id topic để điền vào `curriculumTopics`.

### 3-S5 · Spike S5: topic cần chuyển động liên tục

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | — |
| Phụ thuộc | 3-R1 |
| Sở hữu | — |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §2, §8 |

**Làm:** phân loại mọi topic Toán theo quyết định Z (Manim / walkthrough / slide); chọn 1–4 mẫu Lô B làm ở 3B.

**Xong khi:** ≥ 5 topic Manim; danh sách mẫu Lô B của 3B. Các mẫu Lô B còn lại vẫn dùng card ở §5, chỉ giao sau.

### 3-S3 · Spike S3 + Q11: slide video do tool dựng

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | — |
| Phụ thuộc | I-01 |
| Sở hữu | — |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §8 (dòng S3, Q11); [../ARCHITECTURE](../ARCHITECTURE.md) §12 |

**Làm**
1. Slide có `PPTVideoElement` + `play_video`, dựng qua `validateScene`.
2. Kiểm: adopt vào asset pool; export MP4/ZIP; import trên máy sạch; tua; độ trễ `speech` → clip.

**Xong khi:** kết quả ghi vào RISKS dòng S3, Q11; cập nhật card `3A-02`, `3A-03` nếu cần.

## 2. Đợt 3A — hạ tầng clip

### 3A-01 · `lib/clips`: kiểu `ClipEntry` và cache key

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | I-01 |
| Sở hữu | `lib/clips/types.ts`, `lib/clips/cache-key.ts`, `lib/clips/validate.ts`, `tests/clips/cache-key.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8b (khối `ClipEntry`, gồm `check?`, `sheet`, `expectedDisplay`); [../DATA-MODEL](../DATA-MODEL.md) §4; [README](README.md) §5 D12, D15 |

**Làm**
1. `types.ts`: chép `ClipEntry` ở ARCHITECTURE §8b, gồm `check?` và `sheet`. Thêm kiểu `ClipModule<I> = { entry: ClipEntry<I>; expectedDisplay(input: I): Record<string, number> }`.
2. `validate.ts`: `validateClipInput(entry, raw)`, giống `validateInput` của walkthrough (`parseInput` rồi `check`).
3. `cache-key.ts`: `clipCacheKey({ templateId, templateRev, params, spec, locale, bakedText, profile, imageDigest })`.
   - Kết quả: `'sha256:' + sha256(canonicalJSON([1, templateId, templateRev, paramsCanon, localeOrNull, profile, imageDigest]))`.
   - `paramsCanon`: số lượng tử hoá theo `step` của `InputSpec` rồi chuẩn hoá.
   - `localeOrNull = bakedText ? locale : null`.
   - Dùng `canonicalJSON` của `lib/tutor/catalog/hash.ts`.

**Xong khi:** `pnpm vitest run tests/clips/cache-key.test.ts` xanh. Test phủ:
- ổn định theo thứ tự khoá;
- lượng tử hoá (0.30000000004 ≡ 0.3 với step 0.1);
- khác khi đổi `imageDigest`/`templateRev`;
- `bakedText: false` thì locale không ảnh hưởng.

### 3A-02 · Registry clip, provider clip, `describe` từ `sheet`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 3A-01, 3-S3 |
| Sở hữu | `lib/clips/registry.ts`, `lib/clips/provider.ts`, `lib/clips/describe.ts`, `tests/clips/provider.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8b; [../DATA-MODEL](../DATA-MODEL.md) §4; `packages/@openmaic/dsl/src/slides.ts:736` (`PPTVideoElement`); kết luận S3/Q11 |

**Làm**
1. Provider `id: 'clip'`: nhận slide có phần tử video `name` bắt đầu bằng `clip:`.
2. `build`: **mỗi chapter một slide** (tiêu đề, một `PPTVideoElement` có `name: 'clip:<id>@<hash>#<chapterId>'` và `src`, chú thích).
3. `actions`: `speech(before) → play_video → speech(after)`, cộng `speech(ask)` nếu chapter có `ask`.
4. `describe`: tách `clipId`/`chapterId` từ `name`, tra **`entry.sheet`** (không đọc chữ trong slide).
5. `asset()` trả `null` thì báo lỗi `clip-not-prebuilt`.
6. Registry: trùng `clipId` giữa các gói thì ném lỗi.

**Xong khi:** `pnpm vitest run tests/clips/provider.test.ts` xanh. Test dùng một `ClipEntry` giả: slide qua `validateScene`; `name` đúng; action tuần tự; `describe` không bị chữ tiêm trong slide ảnh hưởng.

### 3A-03 · Tool `generate_clip_scenes{clipId, presetId}`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 3A-02 |
| Sở hữu | `lib/server/agent-runtime/clip-tools.ts`, `tests/clips/clip-tool.test.ts` |
| Đọc | [../INTERFACES](../INTERFACES.md) §3 (mục 3b, dòng 3A); card `1b-18` làm mẫu |

**Làm**
1. Tham số `{ stageId, afterOrder, clipId, presetId }`; `clipId` là union literal sinh từ registry clip.
2. Lỗi: `invalid-clip-id` (kèm `validIds`), `invalid-preset-id`, `clip-not-prebuilt`.
3. Idempotent theo `callId`; `assertScenePolicy`; không gọi LLM.

**Không làm:** đăng ký vào toolset (`I-08`).

**Xong khi:** `pnpm vitest run tests/clips/clip-tool.test.ts` xanh.

### 3A-04 · `manim/`: image ghim và lớp cơ sở cho mẫu

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 3-S1, 3-S2, 3-S4 |
| Sở hữu | `manim/Dockerfile`, `manim/requirements.txt`, `manim/templates/_base.py` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §6; kết quả S1, S2, S4 |

**Làm**
1. Image chốt từ S1: Manim CE 0.21.0, TeX Live, font; ghim theo digest.
2. `_base.py`: lớp cơ sở `ClipScene` cho mẫu tham số hoá:
   - đọc `params` JSON từ biến môi trường;
   - API `chapter(id)` đánh dấu ranh giới chapter;
   - `record(key, value)` ghi số liệu hiển thị vào `manifest.json`;
   - palette cố định; giữ khung chốt ≥ 1,5 s cuối mỗi chapter.

**Xong khi:** image dựng được; một cảnh mẫu dùng `ClipScene` render ra mp4 theo chapter + `manifest.json`.

### 3A-05 · Cổng QA tự động (video, bbox chữ, SSIM, manifest)

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 3A-04 |
| Sở hữu | `manim/qa/check_video.py`, `manim/qa/check_bbox.py`, `manim/qa/check_ssim.py`, `manim/qa/test_gates.py` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §6 (mục 6.1, bước 3); ADR 0007 quyết định 7 |

**Làm**
1. `ffprobe`: h264/yuv420p, kích thước, fps; độ dài clip 20–90 s, chapter 8–25 s, ±5% so với manifest.
2. bbox mọi `Text`/`MathTex` nằm trong khung có lề; không chồng chữ; ≤ 12 token/khung.
3. SSIM với golden frame; loại khung đen/đứng yên.
4. `manifest.json` có đủ chapter của `entry.chapters`.

**Xong khi:** `pytest manim/qa/test_gates.py` xanh trên cảnh mẫu, và đỏ đúng chỗ trên cảnh cố ý sai.

### 3A-06 · AST allowlist cho mã Manim

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | S |
| Phụ thuộc | 3A-04 |
| Sở hữu | `manim/qa/allowlist.py`, `manim/qa/test_allowlist.py` |
| Đọc | ADR 0014 quyết định 4; [../SECURITY](../SECURITY.md) (mục Manim) |

**Làm**
1. Duyệt AST tệp mẫu. Chỉ cho import `manim`, `numpy`, `math` và `_base`.
2. Cấm các tên `os`, `subprocess`, `socket`, `open`, `eval`, `exec`, `compile`, `__import__`, `globals`, `locals`, `vars`, `getattr`/`setattr` với tên động, và mọi thuộc tính bắt đầu bằng `__`.
3. Từ chối thì in dòng và lý do; mã thoát 1.

**Xong khi:** `pytest manim/qa/test_allowlist.py` xanh. Test phủ: mẫu sạch qua; mỗi dạng cấm bị bắt, gồm `__import__('os')`, `getattr(__builtins__, 'ev' + 'al')`, `from os import system`, `().__class__.__bases__`. Leader duyệt diff.

### 3A-07 · `scripts/render-clips.mjs`, chỉ mục asset, kiểm manifest

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 3A-01, 3A-04 |
| Sở hữu | `scripts/render-clips.mjs`, `lib/clips/asset-index.ts`, `lib/clips/generated/asset-index.json`, `tests/clips/render-plan.test.ts`, `tests/clips/manifest-check.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8b (đoạn "Dựng"); [../DATA-MODEL](../DATA-MODEL.md) §4; [../OPERATIONS](../OPERATIONS.md) §3 |

**Làm**
1. Lập kế hoạch render mọi preset chưa có trong `asset-index.json` (theo cache key). Hàm lập kế hoạch thuần, có test.
2. Mỗi job:
   - chạy allowlist → render trong image (không mạng) → cổng QA;
   - đặt asset tên băm nội dung vào `public/clips/` (≤ 10 clip, ≤ 30 MB) hoặc thư mục ra;
   - ghi `clip-sheet.json` chép từ `entry.sheet`;
   - cập nhật `asset-index.json` (`cacheKey → { chapters: [{id, url, poster}], master? }`).
3. `asset-index.ts`: `lookupClipAsset(cacheKey)`; `ClipEntry.asset()` gọi hàm này.
4. `manifest-check.test.ts`: với mỗi asset trong chỉ mục, số trong `manifest.json` khớp `expectedDisplay(preset)` (sai số 1e-3). Chưa có asset thì bỏ qua.

**Xong khi:** `pnpm vitest run tests/clips/render-plan.test.ts tests/clips/manifest-check.test.ts` xanh. Chạy thử một mẫu tạo được mp4 + poster + manifest + clip-sheet.

### 3A-08 · Vòng LLM tác giả Manim (S9) + stage Toán

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 1c-08, 1c-18, 3A-05, 3A-06 |
| Sở hữu | `eval/manim-author/runner.ts`, `eval/manim-author/briefs.json`, `lib/server/model-routes.ts` |
| Đọc | ADR 0014 quyết định 4, 7; [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §6 (mục 6.1) |

**Làm**
1. Thêm stage `manim-author`, `tutor-review-math`, `tutor-review-math-2` vào `LLM_STAGES`.
2. Vòng làm việc:
   - đầu vào: brief + module `T` (ClipEntry, chapter, `expectedDisplay`);
   - đầu ra: mẫu `.py`;
   - mỗi lần thử: allowlist → render sandbox không mạng → cổng QA → `manifest-check`;
   - sửa lỗi tối đa 3 vòng.
3. Đo RSR@1/@3 và chi phí token trên 20 brief Việt.

**Xong khi:** số đo S9 ghi vào ADR 0007; quyết định đi tiếp/dừng theo trigger.

### 3A-17 · Hiệu chuẩn hội đồng LLM Toán

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 1c-18, 3A-08 |
| Sở hữu | `eval/tutor-review/seed-errors-math.ts` |
| Đọc | ADR 0014 quyết định 7; card `1c-18` |

**Làm**
1. ≥ 30 bản cài lỗi có nhãn (thiếu điều kiện, sai dấu bằng, suy từ hình đặc biệt, sai số trong manifest, lời `before`/`after` sai) + ≥ 10 bản đúng.
2. Chạy `tutor-review-math` + `-2`: bắt ≥ 90% lỗi, chặn nhầm ≤ 10%.

**Xong khi:** đạt ngưỡng, ghi vào RISKS; không đạt thì dừng ký mẫu Toán.

### 3A-12 · Skill `olympiad-math`

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | 3A-03, 3A-13 |
| Sở hữu | `skills/agent-runtime/olympiad-math/SKILL.md`, `skills/agent-runtime/olympiad-math/outline-constraints.json` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §5, §7 |

**Làm**
1. Frontmatter: `title` có chữ Hán (ví dụ `数学奥林匹克`).
2. Nội dung:
   - không bài luyện code; blueprint 8 giai đoạn; quy tắc clip;
   - "mỗi định lý có ≥ 1 hình minh hoạ";
   - các bước "cho / có / do / suy ra";
   - khối id sinh ra (để trống giữa marker; `I-08` sinh).
3. `outline-constraints.json`: `allowedTypes`, `firstSceneType: "slide"`, `sceneCount {6, 8}`.

**Xong khi:** `pnpm vitest run tests/agent-runtime/skills.test.ts tests/workbench/workbench-i18n.test.ts` xanh.

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

## 3. Card mẫu cho mẫu clip

### 3.1. Task `T` (TypeScript, cấp `W`)

| Trường | Giá trị chung |
| --- | --- |
| Sở hữu | `lib/subjects/math/clips/<id>.ts`, `tests/clips/<id>.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8b; [../CONTENT-DESIGN](../CONTENT-DESIGN.md) §4 (quy tắc clip); [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §3 (dòng của mẫu), §5; curriculum Toán của `3-R1` |

**Làm** module export `default` kiểu `ClipModule`:
1. `entry: ClipEntry`:
   - `id` đúng card; `kind: 'template'`; `curriculumTopics` lấy id topic ở dòng **Topic** trong curriculum Toán;
   - `title` vi/en; `inputSpec` và `check` đúng card; `presets` đúng card (3–5);
   - `engine: { name: 'manim-ce', version: '0.21.0', templateRev: 1 }`; `render: { w: 1280, h: 720, fps: 30 }`; `silent: true`; `bakedText: false`.
2. `chapters` đúng card:
   - mỗi chapter 8–25 s, tổng 20–90 s;
   - `label`, `before`, `after` vi/en: lời thầy nói **trước** và **sau** chapter (clip câm), ≤ 2 câu mỗi đoạn;
   - ≥ 1 `ask` (câu hỏi dự đoán) sau mỗi 2 chapter.
3. `sheet.chapters`: mỗi chapter có `shows`, `formulas` (LaTeX với `\( \)`), `misconceptions` (gồm ý ở card), `hints[3]`.
4. `invariants(input)`: hàm thuần đúng card.
5. `expectedDisplay(input)`: số cảnh phải ghi vào manifest (đúng khoá ở card), tính bằng công thức độc lập.
6. `cacheKeyInput` dùng `clipCacheKey`; `asset` dùng `lookupClipAsset`.
7. Chữ trên hình chỉ là ký hiệu, số, nhãn; không câu tự nhiên (CONTENT-DESIGN §4).

**Không làm:** viết mã Manim `.py` (task `M`); sửa `lib/subjects/math/pack.ts` (báo leader).

**Xong khi:** `pnpm vitest run tests/clips/<id>.test.ts` xanh. Test phủ:
- mọi preset qua `validateClipInput`; input vi phạm `check` bị từ chối;
- `invariants` đúng trên mọi preset và trên biên của `inputSpec`;
- `expectedDisplay` khớp phép tính lại trong test;
- tổng/từng chapter trong khoảng thời lượng; `sheet` có đúng các id chapter;
- đủ `vi-VN`/`en-US`; cache key ổn định.

### 3.2. Task `M` (Manim qua LLM tác giả, cấp `L`)

| Trường | Giá trị chung |
| --- | --- |
| Sở hữu | `manim/templates/<id_snake>.py`, `lib/subjects/math/reviews/<id>@1.json` |
| Đọc | ADR 0014 quyết định 4; card `3A-08`; module `T` của mẫu |

**Làm**
1. Hội đồng LLM Toán viết brief: topic, takeaway 1 câu, hiểu lầm hay gặp.
2. Chạy vòng `manim-author` với brief + module `T`. Qua đủ: allowlist, render sandbox mọi preset, cổng QA, `manifest-check` (`expectedDisplay`).
3. `tutor-review-math` + `-2` ký keyframe + manifest; `tutor-review-code` duyệt mã; ghi review JSON.
4. Chạy `scripts/render-clips.mjs` cho mẫu; leader commit asset + chỉ mục.

**Xong khi:** review đạt (cả hai model, mọi điểm ≥ 4, không lỗi "Đúng"); asset có trong chỉ mục; `manifest-check` xanh. Sau 3 vòng không đạt thì ghi vào ADR 0007 (đếm RSR) và chuyển mẫu sang slide.

## 4. Đợt 3A — 3 mẫu đầu

### 3A-T1 · Mẫu `amgm-semicircle` (AM–GM bằng nửa đường tròn)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 3A-01, 3-R1 |
| Sở hữu | `lib/subjects/math/clips/amgm-semicircle.ts`, `tests/clips/amgm-semicircle.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** bất đẳng thức cơ bản (AM–GM), tier 1.
- **Input:** `record { a: int[1,20], b: int[1,20] }`.
- **Preset:** `two-eight` (2, 8); `equal` (4, 4); `far` (1, 20); `nine-sixteen` (9, 16).
- **Chapter:**
  - `setup` (8–12 s): đoạn AB = a + b, điểm C chia a | b, nửa đường tròn đường kính AB;
  - `height` (10–15 s): dựng CD ⊥ AB, có `h² = ab`. `ask`: "h lớn nhất khi C ở đâu?";
  - `compare` (8–12 s): bán kính `r = (a + b)/2`, so `h ≤ r`;
  - `equality` (10–15 s): C trượt về tâm; `h = r` khi và chỉ khi `a = b`.
- **invariants:** `h = √(ab) ≤ r + 1e-9`; `|h − r| < 1e-9` khi và chỉ khi `a = b`.
- **expectedDisplay:** `{ a, b, r, h }` (`h` làm tròn 3 chữ số).
- **Hiểu lầm:** "h là trung bình cộng"; "chỉ đúng khi a, b nguyên".

**Xong khi:** như card mẫu §3.1, với `<id>` = `amgm-semicircle`.

### 3A-T2 · Mẫu `cs-projection` (Cauchy–Schwarz bằng hình chiếu)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 3A-01, 3-R1 |
| Sở hữu | `lib/subjects/math/clips/cs-projection.ts`, `tests/clips/cs-projection.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** bất đẳng thức cổ điển, tier 2.
- **Input:** `record { ux, uy, vx, vy: int[-9,9] }`. **check:** `u ≠ 0`, `v ≠ 0`.
- **Preset:** `generic` (3, 1, 1, 2); `parallel` (2, 1, 4, 2); `perpendicular` (1, 0, 0, 1); `opposite` (1, 1, −2, −2).
- **Chapter:**
  - `vectors` (8–12 s): vẽ u, v;
  - `projection` (10–15 s): hình chiếu của v lên u, độ dài `|u·v| / |u|`;
  - `inequality` (10–15 s): hình chiếu không dài hơn v, suy ra `|u·v| ≤ |u||v|`. `ask`: "khi nào hình chiếu dài bằng v?";
  - `equality` (8–12 s): quay v tới song song u; dấu bằng.
- **invariants:** `|u·v| ≤ |u||v| + 1e-9`; dấu bằng khi và chỉ khi `ux·vy − uy·vx = 0`.
- **expectedDisplay:** `{ dot, normU, normV, proj }`.
- **Hiểu lầm:** "dấu bằng chỉ khi u = v"; "chỉ đúng với vector dương".

**Xong khi:** như card mẫu §3.1, với `<id>` = `cs-projection`.

### 3A-T3 · Mẫu `secant-tangent` (cát tuyến → tiếp tuyến)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 3A-01, 3-R1 |
| Sở hữu | `lib/subjects/math/clips/secant-tangent.ts`, `tests/clips/secant-tangent.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** đạo hàm và đồ thị, tier 3.
- **Input:** `record { c: int-array(len[3,4], range[-3,3]), x0: int[-2,2] }`, `c` là hệ số theo bậc tăng (`c[0] + c[1]x + …`). **check:** hệ số bậc cao nhất ≠ 0.
- **Preset:**
  - `square-at-1` (`[0,0,1]`, 1);
  - `cubic-at-0` (`[0,-3,0,1]`, 0);
  - `stationary` (`[0,-3,0,1]`, 1: tiếp tuyến nằm ngang);
  - `quad-at-minus-1` (`[1,-1,2]`, −1).
- **Chapter:**
  - `curve` (8–12 s): vẽ đồ thị trên trục toạ độ;
  - `secant` (10–15 s): cát tuyến qua `x0` và `x0 + h` với `h = 1`; hệ số góc `(f(x0+h) − f(x0))/h`;
  - `limit` (12–20 s): `h → 0`; cát tuyến tiến tới tiếp tuyến. `ask`: "hệ số góc tiến tới số nào?";
  - `tangent` (8–12 s): hệ số góc bằng `f'(x0)`.
- **invariants:** `|slope(0.01) − f'(x0)| < 0.1`; `f'` tính từ hệ số.
- **expectedDisplay:** `{ f0, fprime, slope1, slope01 }`.
- **Hiểu lầm:** "tiếp tuyến chỉ chạm đồ thị tại một điểm"; "đạo hàm bằng 0 thì là cực trị".

**Xong khi:** như card mẫu §3.1, với `<id>` = `secant-tangent`.

**Task `M` của 3A** (theo card mẫu §3.2):

| ID | Cấp | Mẫu | Phụ thuộc | Sở hữu |
| --- | --- | --- | --- | --- |
| 3A-M1 | L | `amgm-semicircle` | 3A-T1, 3A-07, 3A-08, 3A-17 | `manim/templates/amgm_semicircle.py`, `lib/subjects/math/reviews/amgm-semicircle@1.json` |
| 3A-M2 | L | `cs-projection` | 3A-T2, 3A-07, 3A-08, 3A-17 | `manim/templates/cs_projection.py`, `lib/subjects/math/reviews/cs-projection@1.json` |
| 3A-M3 | L | `secant-tangent` | 3A-T3, 3A-07, 3A-08, 3A-17 | `manim/templates/secant_tangent.py`, `lib/subjects/math/reviews/secant-tangent@1.json` |

### I-08 · Tích hợp đợt 3A (leader)

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 3A-03, 3A-12, 3A-M1, 3A-M2, 3A-M3 |
| Sở hữu | `lib/widgets/index.ts`, `lib/server/agent-runtime/course-tools.ts`, `lib/agent-runtime/stage-writer-tools.ts`, `lib/subjects/index.ts`, `lib/subjects/math/pack.ts`, `tests/widgets/write-paths.test.ts`, `eslint.config.mjs`, `package.json`, `.github/workflows/ci.yml` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §10 (Đợt 1) |

**Làm**
1. Đăng ký:
   - provider clip trong `lib/widgets/index.ts`;
   - tool `generate_clip_scenes` trong toolset và `STAGE_WRITER_TOOL_NAMES`;
   - gói `math` (3 clip) trong `lib/subjects/index.ts`; sinh khối id của skill Toán.
2. Loại `manim/` khỏi `eslint.config.mjs`, `tsconfig.json`, `tsconfig.build.json`, `.dockerignore`.
3. Thêm job CI `manim` (image, pytest, render preset trượt cache, kích thước `public/clips`); bỏ `planned` của `clip-tools.ts` trong `write-paths.test.ts`.
4. Chạy export MP4/ZIP/import trọn vòng có clip (S3).

**Xong khi:** mọi mục Đợt 1 ở Phase 3 §10 đạt.

## 5. Đợt 3B — KaTeX, visualizer Toán, walkthrough Toán, Lô A còn lại, Lô B

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
| Phụ thuộc | I-08 |
| Sở hữu | — |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §8 (dòng Q8); tiền lệ `lib/video-export/emit-hyperframes/katex-assets.ts`; ADR 0010 quyết định 7 |

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

### 3B-QA · Q&A cho clip trong ngữ cảnh chat

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | S |
| Phụ thuộc | I-02, I-08 |
| Sở hữu | `lib/orchestration/summarizers/state-context.ts`, `lib/chat/pi/tools/read-scene.ts`, `tests/clips/clip-qa-context.test.ts` |
| Đọc | ADR 0007 quyết định 11; card `1c-03` |

**Làm**
1. Với slide có phần tử video `name` bắt đầu bằng `clip:`, đưa `clipProvider.describe(scene)` vào ngữ cảnh: chapter, cái đang hiện, công thức, hiểu lầm, gợi ý.
2. Chữ lấy từ `entry.sheet`, không đọc chữ trong slide.

**Xong khi:** `pnpm vitest run tests/clips/clip-qa-context.test.ts tests/orchestration tests/chat` xanh.

### 3B-E1 · Eval bài giảng Toán

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | 2-E1, I-08 |
| Sở hữu | `eval/tutor-lesson/scenarios-math.json` |
| Đọc | card `2-E1`; [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §9 |

**Làm:** ≥ 3 scenario Toán: "dạy em chứng minh Cauchy–Schwarz", "khảo sát y = x³ − 3x", "AM–GM cho học sinh lớp 9". Runner của `2-E1` đọc thêm file này.

**Xong khi:** `pnpm exec tsx eval/tutor-lesson/runner.ts --dry-run` liệt kê cả scenario Toán.

### Mẫu Lô A còn lại (giao ngay sau `I-08`)

### 3B-T1 · Mẫu `alg-identity-area` (hằng đẳng thức bằng diện tích)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/alg-identity-area.ts`, `tests/clips/alg-identity-area.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** hằng đẳng thức, tier 1.
- **Input:** `record { id: enum['square-sum','diff-squares'], a: int[1,9], b: int[1,9] }`. **check:** `diff-squares` thì `a > b`.
- **Preset:** `sum-3-2`; `sum-1-1` (biên); `diff-5-2`; `diff-9-1`.
- **Chapter:**
  - `figure`: hình vuông cạnh a + b, hoặc cạnh a;
  - `decompose`: chia thành a², 2ab, b², hoặc cắt bỏ b²;
  - `rearrange`: ghép lại. `ask`: "phần còn lại ghép thành hình gì?";
  - `formula`: viết công thức.
- **invariants:** `(a+b)² = a² + 2ab + b²`; `a² − b² = (a+b)(a−b)`; mọi diện tích dương.
- **expectedDisplay:** `square-sum` → `{ total, a2, ab, b2 }`; `diff-squares` → `{ a2, b2, diff, prod }`.
- **Hiểu lầm:** `(a+b)² = a² + b²`.

**Xong khi:** như card mẫu §3.1, với `<id>` = `alg-identity-area`.

### 3B-T2 · Mẫu `figurate-sums` (tổng số lẻ, số tam giác)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/figurate-sums.ts`, `tests/clips/figurate-sums.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** quy nạp, tier 2.
- **Input:** `record { series: enum['odd','natural'], n: int[2,10] }`.
- **Preset:** `odd-4`; `odd-2` (biên); `natural-5`; `natural-10`.
- **Chapter:**
  - `dots`: xếp chấm;
  - `grow`: thêm "gnomon" chữ L (`odd`) hoặc bậc thang ghép đôi (`natural`);
  - `count`: đếm tổng. `ask`: "thêm một lớp nữa thì tổng là bao nhiêu?";
  - `induction`: nối sang bước quy nạp k → k + 1.
- **invariants:** `Σ(2i − 1) = n²`; `Σ i = n(n + 1)/2`.
- **expectedDisplay:** `{ n, sum }`.
- **Hiểu lầm:** "đúng với vài n đầu là đã chứng minh xong".

**Xong khi:** như card mẫu §3.1, với `<id>` = `figurate-sums`.

### 3B-T3 · Mẫu `concurrency-dynamic` (các đường đồng quy khi đỉnh chạy)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/concurrency-dynamic.ts`, `tests/clips/concurrency-dynamic.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** hình học tam giác, tier 1.
- **Input:** `record { x1, y1, x2, y2, x3, y3: int[-9,9], center: enum['orthocenter','centroid','circumcenter','incenter'] }`. **check:** tam giác không suy biến.
- **Preset:**
  - `acute-ortho` (0, 0, 6, 0, 2, 5, orthocenter);
  - `obtuse-ortho` (0, 0, 6, 0, −2, 2, orthocenter: nằm ngoài);
  - `right-ortho` (0, 0, 4, 0, 0, 3, orthocenter: tại đỉnh);
  - `scalene-centroid` (0, 0, 7, 1, 2, 6, centroid);
  - `acute-circum` (0, 0, 6, 0, 2, 5, circumcenter).
- **Chapter:**
  - `triangle`;
  - `lines`: ba đường của tâm đã chọn;
  - `meet`: chúng gặp nhau tại một điểm;
  - `move`: đỉnh C chạy trên một đường thẳng, vẫn đồng quy. `ask`: "tâm có còn nằm trong tam giác không?";
  - `special`: trường hợp riêng của preset (ngoài tam giác, tại đỉnh).
- **invariants:**
  - ba đường đồng quy (`|det| < 1e-6`) tại input và tại 5 vị trí mẫu khi C chạy;
  - toạ độ tâm khớp công thức độc lập.
- **expectedDisplay:** `{ cx, cy }`.
- **Hiểu lầm:** "trực tâm luôn nằm trong tam giác".

**Xong khi:** như card mẫu §3.1, với `<id>` = `concurrency-dynamic`.

### 3B-T4 · Mẫu `inscribed-angle` (góc nội tiếp)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/inscribed-angle.ts`, `tests/clips/inscribed-angle.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** góc với đường tròn, tier 1.
- **Input:** `record { arc: int[20,340] }` (số đo góc ở tâm, độ).
- **Preset:** `arc-100`; `arc-60`; `arc-180` (biên: góc vuông); `arc-300` (cung lớn).
- **Chapter:**
  - `circle`;
  - `central`: góc ở tâm chắn cung;
  - `inscribed`: điểm chạy trên cung còn lại, góc nội tiếp không đổi bằng nửa góc ở tâm. `ask`: "điểm chạy thì góc có đổi không?";
  - `cyclic`: tứ giác nội tiếp, tổng hai góc đối bằng 180°.
- **invariants:** góc nội tiếp = `arc / 2`; tổng hai góc đối = 180.
- **expectedDisplay:** `{ central, inscribed }`.
- **Hiểu lầm:** "góc nội tiếp bằng góc ở tâm".

**Xong khi:** như card mẫu §3.1, với `<id>` = `inscribed-angle`.

### 3B-T5 · Mẫu `tiling-coloring` (bàn cờ bỏ hai ô, lát domino)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/tiling-coloring.ts`, `tests/clips/tiling-coloring.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** bất biến và nguyên lý Dirichlet, tier 2.
- **Input:** `record { n: enum[4,6,8], removed: enum['opposite-corners','adjacent'] }`.
- **Preset:** `n8-opposite`; `n4-opposite`; `n6-adjacent`; `n8-adjacent`.
- **Chapter:**
  - `board`;
  - `color`: tô đen trắng xen kẽ;
  - `count`: đếm ô đen và ô trắng còn lại. `ask`: "một domino luôn phủ mấy ô đen?";
  - `conclude`: bỏ hai góc đối thì không lát được; bỏ hai ô kề thì chỉ ra một cách lát.
- **invariants:** số ô đen/trắng; không lát được khi và chỉ khi hai số khác nhau; với `adjacent`, cách lát tính trong TS là hợp lệ.
- **expectedDisplay:** `{ black, white }`.
- **Hiểu lầm:** "thử vài cách không được nghĩa là không thể".

**Xong khi:** như card mẫu §3.1, với `<id>` = `tiling-coloring`.

### Mẫu Lô B (giao các mẫu `3-S5` chọn cho 3B; mẫu còn lại giao ở 3D)

### 3B-T6 · Mẫu `convex-chord` (Jensen: dây cung trên đồ thị lồi)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/convex-chord.ts`, `tests/clips/convex-chord.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** bất đẳng thức cổ điển, tier 2.
- **Input:** `record { f: enum['x2','abs','x4'], x1: int[-3,3], x2: int[-3,3], t: number[0,1] step 0.1 }`. **check:** `x1 ≠ x2`.
- **Preset:** `x2-mid` (x2, −2, 2, 0.5); `abs-skew` (abs, −3, 1, 0.3); `x4` (x4, −1, 2, 0.5); `t-zero` (x2, −1, 3, 0) (biên).
- **Chapter:**
  - `graph`; `chord`;
  - `point`: t chạy từ 0 tới 1. `ask`: "điểm trên dây cung nằm trên hay dưới đồ thị?";
  - `inequality`: `f(t·x1 + (1−t)·x2) ≤ t·f(x1) + (1−t)·f(x2)`.
- **invariants:** bất đẳng thức trên đúng (sai số 1e-9).
- **expectedDisplay:** `{ lhs, rhs }`.
- **Hiểu lầm:** "Jensen đúng với mọi hàm".

**Xong khi:** như card mẫu §3.1, với `<id>` = `convex-chord`.

### 3B-T7 · Mẫu `graph-transform` (y = a·f(x − h) + k)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/graph-transform.ts`, `tests/clips/graph-transform.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** hàm số và đồ thị (phương trình bậc hai, Viète), tier 1.
- **Input:** `record { f: enum['x2','abs','x3'], a: int[-3,3], h: int[-4,4], k: int[-4,4] }`. **check:** `a ≠ 0`.
- **Preset:** `shift` (x2, 1, 2, −1); `stretch` (x2, 2, 0, 0); `reflect` (abs, −1, 1, 2); `identity` (x3, 1, 0, 0) (biên).
- **Chapter:**
  - `base`;
  - `shift-h`: dời ngang. `ask`: "x − h với h > 0 dời sang trái hay phải?";
  - `scale`: co giãn/lật theo a;
  - `shift-k`: dời dọc.
- **invariants:** điểm `(x0, f(x0))` biến thành `(x0 + h, a·f(x0) + k)` với 5 giá trị `x0`.
- **expectedDisplay:** `{ x: h, y: k }` (ảnh của điểm gốc).
- **Hiểu lầm:** "f(x − 2) dời sang trái 2 đơn vị".

**Xong khi:** như card mẫu §3.1, với `<id>` = `graph-transform`.

### 3B-T8 · Mẫu `limit-epsilon` (dải ε, tìm N)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/limit-epsilon.ts`, `tests/clips/limit-epsilon.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** dãy số và giới hạn, tier 3.
- **Input:** `record { seq: enum['inv-n','n1-over-n','alt-inv-n'], eps: number[0.05,0.5] step 0.05 }`. Các dãy là `1/n`, `(n+1)/n`, `(−1)ⁿ/n`.
- **Preset:** `inv-0.2`; `inv-0.05` (biên); `n1-0.1`; `alt-0.25`.
- **Chapter:**
  - `sequence`: vẽ các số hạng;
  - `band`: dải `(L − ε, L + ε)`;
  - `find-n`: tìm N để mọi n ≥ N nằm trong dải. `ask`: "ε nhỏ đi thì N lớn lên hay nhỏ đi?";
  - `shrink`: thu nhỏ ε.
- **invariants:** N nhỏ nhất thoả `|aₙ − L| < ε` với mọi `n ≥ N` (kiểm số tới n = 1000).
- **expectedDisplay:** `{ L, N }`.
- **Hiểu lầm:** "dãy tiến tới L nghĩa là có số hạng bằng L".

**Xong khi:** như card mẫu §3.1, với `<id>` = `limit-epsilon`.

### 3B-T9 · Mẫu `riemann-integral` (tổng Riemann → tích phân)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/riemann-integral.ts`, `tests/clips/riemann-integral.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** tích phân, tier 4.
- **Input:** `record { c: int-array(len[1,4], range[-3,3]), a: int[-3,2], b: int[-2,3], n: enum[4,8,16] }`. **check:** `a < b`.
- **Preset:** `x2-4` (`[0,0,1]`, 0, 2, 4); `x2-16` (cùng hàm, n = 16); `const` (`[2]`, −1, 2, 4); `cubic` (`[0,-1,0,1]`, −1, 2, 8).
- **Chapter:**
  - `area`: diện tích dưới đồ thị;
  - `rectangles`: n hình chữ nhật (điểm trái);
  - `refine`: tăng n. `ask`: "n tăng thì sai số tăng hay giảm?";
  - `limit`: tới tích phân đúng.
- **invariants:** `|Lₙ − I| ≤ (b−a)² · max|f'| / (2n)`; `I` tính từ nguyên hàm theo hệ số.
- **expectedDisplay:** `{ sum, exact }`.
- **Hiểu lầm:** "diện tích dưới trục cũng cộng dương".

**Xong khi:** như card mẫu §3.1, với `<id>` = `riemann-integral`.

### 3B-T10 · Mẫu `geometric-series-area` (1/2 + 1/4 + … = 1)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/geometric-series-area.ts`, `tests/clips/geometric-series-area.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** dãy số và giới hạn, tier 3.
- **Input:** `record { r: enum['1/2','1/3','1/4'] }`.
- **Preset (3):** `half`; `third`; `quarter`.
- **Chapter:**
  - `square`: hình vuông đơn vị;
  - `cut`: cắt phần r;
  - `repeat`: lặp với phần còn lại. `ask`: "tổng có vượt quá 1 không?";
  - `sum`: tổng bằng `r / (1 − r)`.
- **invariants:** tổng riêng `Sₖ` tăng và nhỏ hơn `r / (1 − r)`; `S₂₀` cách giới hạn < 1e-6.
- **expectedDisplay:** `{ limit, s5 }`.
- **Hiểu lầm:** "cộng vô hạn số dương thì ra vô hạn".

**Xong khi:** như card mẫu §3.1, với `<id>` = `geometric-series-area`.

### 3B-T11 · Mẫu `pythagoras-dissection` (Pythagore bằng cắt ghép)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/pythagoras-dissection.ts`, `tests/clips/pythagoras-dissection.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** hình học tam giác, tier 1.
- **Input:** `record { a: int[1,9], b: int[1,9] }`.
- **Preset:** `three-four` (3, 4); `equal` (2, 2); `thin` (1, 9); `six-eight` (6, 8).
- **Chapter:**
  - `triangles`: 4 tam giác vuông cạnh a, b;
  - `big-square`: xếp trong hình vuông cạnh a + b;
  - `rearrange`: xếp lại. `ask`: "phần trống bây giờ là những hình gì?";
  - `conclude`: `c² = a² + b²`.
- **invariants:** `(a+b)² = 4 · (ab/2) + c²`; `c² = a² + b²`.
- **expectedDisplay:** `{ c2, c }`.
- **Hiểu lầm:** "chỉ đúng với bộ 3-4-5".

**Xong khi:** như card mẫu §3.1, với `<id>` = `pythagoras-dissection`.

### 3B-T12 · Mẫu `power-of-point` (phương tích)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/power-of-point.ts`, `tests/clips/power-of-point.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** phương tích, tier 2.
- **Input:** `record { R: int[2,6], px: int[-9,9], py: int[-9,9] }`.
- **Preset:** `outside` (5, 8, 0); `inside` (5, 1, 2); `on-circle` (5, 3, 4) (biên: phương tích 0); `far` (2, 9, 9).
- **Chapter:**
  - `circle`;
  - `secant-1`: một cát tuyến qua P, tích `PA · PB`;
  - `secant-2`: cát tuyến khác, tích không đổi. `ask`: "quay cát tuyến thì tích có đổi không?";
  - `tangent`: bằng `PT²` (chỉ khi P ở ngoài; preset khác thì chapter này nói "không có tiếp tuyến").
- **invariants:** `PA · PB = |OP² − R²|` với 6 hướng mẫu.
- **expectedDisplay:** `{ power }`.
- **Hiểu lầm:** "phương tích luôn dương".

**Xong khi:** như card mẫu §3.1, với `<id>` = `power-of-point`.

### 3B-T13 · Mẫu `modular-clock` (phép nhân modulo trên vòng tròn)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/modular-clock.ts`, `tests/clips/modular-clock.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** đồng dư, tier 2.
- **Input:** `record { n: int[5,31], a: int[2,30] }`. **check:** `a < n`.
- **Preset:** `n10-a2`; `n7-a3` (3 sinh mọi số khác 0); `n12-a5`; `n5-a4`.
- **Chapter:**
  - `clock`: n điểm trên vòng tròn;
  - `multiply`: dây nối k → a·k mod n;
  - `powers`: aᵏ mod n. `ask`: "dãy luỹ thừa có lặp lại không?";
  - `cycle`: độ dài chu kỳ.
- **invariants:** độ dài chu kỳ của aᵏ mod n bằng giá trị tính độc lập (bậc của a khi `gcd(a, n) = 1`, chu kỳ cuối khi không).
- **expectedDisplay:** `{ period }`.
- **Hiểu lầm:** "mọi a đều có chu kỳ n − 1".

**Xong khi:** như card mẫu §3.1, với `<id>` = `modular-clock`.

### 3B-T14 · Mẫu `euclid-rectangle` (gcd bằng lát hình vuông)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-08, 3-S5 |
| Sở hữu | `lib/subjects/math/clips/euclid-rectangle.ts`, `tests/clips/euclid-rectangle.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** thuật toán Euclid và phương trình Diophantine, tier 2.
- **Input:** `record { a: int[1,60], b: int[1,60] }`.
- **Preset:** `48-18`; `equal` (12, 12); `coprime` (13, 8); `one` (1, 60).
- **Chapter:**
  - `rectangle`;
  - `squares`: cắt hình vuông lớn nhất;
  - `repeat`: lặp với phần còn lại. `ask`: "hình vuông cuối cùng có cạnh bao nhiêu?";
  - `gcd`.
- **invariants:** cạnh hình vuông cuối = `gcd(a, b)`; số hình vuông = tổng các thương trong Euclid.
- **expectedDisplay:** `{ gcd, squares }`.
- **Hiểu lầm:** "gcd luôn là số nhỏ hơn trong hai số".

**Xong khi:** như card mẫu §3.1, với `<id>` = `euclid-rectangle`.

**Task `M` của 3B** (theo card mẫu §3.2; với Lô B chỉ giao các mẫu `3-S5` chọn):

| ID | Cấp | Mẫu | Phụ thuộc | Sở hữu |
| --- | --- | --- | --- | --- |
| 3B-M1 | L | `alg-identity-area` | 3B-T1 | `manim/templates/alg_identity_area.py`, `lib/subjects/math/reviews/alg-identity-area@1.json` |
| 3B-M2 | L | `figurate-sums` | 3B-T2 | `manim/templates/figurate_sums.py`, `lib/subjects/math/reviews/figurate-sums@1.json` |
| 3B-M3 | L | `concurrency-dynamic` | 3B-T3 | `manim/templates/concurrency_dynamic.py`, `lib/subjects/math/reviews/concurrency-dynamic@1.json` |
| 3B-M4 | L | `inscribed-angle` | 3B-T4 | `manim/templates/inscribed_angle.py`, `lib/subjects/math/reviews/inscribed-angle@1.json` |
| 3B-M5 | L | `tiling-coloring` | 3B-T5 | `manim/templates/tiling_coloring.py`, `lib/subjects/math/reviews/tiling-coloring@1.json` |
| 3B-M6 | L | `convex-chord` | 3B-T6 | `manim/templates/convex_chord.py`, `lib/subjects/math/reviews/convex-chord@1.json` |
| 3B-M7 | L | `graph-transform` | 3B-T7 | `manim/templates/graph_transform.py`, `lib/subjects/math/reviews/graph-transform@1.json` |
| 3B-M8 | L | `limit-epsilon` | 3B-T8 | `manim/templates/limit_epsilon.py`, `lib/subjects/math/reviews/limit-epsilon@1.json` |
| 3B-M9 | L | `riemann-integral` | 3B-T9 | `manim/templates/riemann_integral.py`, `lib/subjects/math/reviews/riemann-integral@1.json` |
| 3B-M10 | L | `geometric-series-area` | 3B-T10 | `manim/templates/geometric_series_area.py`, `lib/subjects/math/reviews/geometric-series-area@1.json` |
| 3B-M11 | L | `pythagoras-dissection` | 3B-T11 | `manim/templates/pythagoras_dissection.py`, `lib/subjects/math/reviews/pythagoras-dissection@1.json` |
| 3B-M12 | L | `power-of-point` | 3B-T12 | `manim/templates/power_of_point.py`, `lib/subjects/math/reviews/power-of-point@1.json` |
| 3B-M13 | L | `modular-clock` | 3B-T13 | `manim/templates/modular_clock.py`, `lib/subjects/math/reviews/modular-clock@1.json` |
| 3B-M14 | L | `euclid-rectangle` | 3B-T14 | `manim/templates/euclid_rectangle.py`, `lib/subjects/math/reviews/euclid-rectangle@1.json` |

### I-09 · Tích hợp đợt 3B (leader)

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 3B-00, 3B-K1, 3B-V1, 3B-V2, 3B-V3, 3B-W1, 3B-W2, 3B-W3, 3B-QA, 3B-E1, 3B-M1, 3B-M2, 3B-M3, 3B-M4, 3B-M5 |
| Sở hữu | `lib/subjects/math/pack.ts`, `lib/tutor/build/runtimes.ts`, `tests/subjects/catalog-lock.json`, `skills/agent-runtime/olympiad-math/SKILL.md`, `.github/workflows/ci.yml` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §10 (Đợt 2) |

**Làm**
1. Đăng ký `geometry`, `functionPlotter`, `proofOutline` vào `runtimes.ts`; thêm step CI cho browser test.
2. Đăng ký 3 walkthrough Toán và 5 mẫu Lô A vào gói `math`, cùng các mẫu Lô B đã xong; khoá catalog; sinh khối id.
3. Chạy hội đồng Toán cho walkthrough; chạy `eval:tutor-lesson` phần Toán.
4. Demo *"khảo sát y = x³ − 3x"* → clip `secant-tangent` + walkthrough `curve-sketching`.

**Xong khi:** mục Đợt 2 ở Phase 3 §10 đạt: tổng 9–12 mẫu.

## 6. Đợt 3C — `manim-service` và render theo yêu cầu

### 3C-01 · `manim-service`: HTTP API, hàng đợi, xác thực

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | I-09 |
| Sở hữu | `manim/service/server.py`, `manim/service/jobs.py`, `manim/service/test_server.py` |
| Đọc | [../INTERFACES](../INTERFACES.md) §6; [../OPERATIONS](../OPERATIONS.md) §2, §8 (`MANIM_*`); `render-service/README.md` (khuôn API) |

**Làm** (Python stdlib, `http.server.ThreadingHTTPServer`; không thêm gói):
1. Endpoint đúng INTERFACES §6: `POST /render`, `GET /render/:jobId`, `GET /render/:jobId/download?chapter=`, `DELETE /render/:jobId`, `GET /health`.
2. Xác thực: header `x-manim-token` so khớp `MANIM_SERVICE_TOKEN` bằng so sánh hằng thời gian; sai thì `401`.
3. Kiểm `params` bằng `inputSpec` của mẫu (bản JSON xuất từ registry clip):
   - sai → `400`; `templateId` lạ → `404`;
   - `templateRev` lệch → `409 { error: 'template-rev-mismatch', current }`.
4. Nhận job:
   - `429 { error, reason }` với `queue_full` | `per_identity_limit` (theo `x-openmaic-client`) | `global_limit`;
   - hai POST cùng cache key nhận cùng `jobId` (gộp job trùng).
5. TTL job (`MANIM_JOB_TTL_MS`), deadline (`MANIM_JOB_DEADLINE_MS`) → `failed { error: 'deadline' }`.
6. Bộ chạy job tiêm vào được: `3C-02` cung cấp bộ thật, test dùng bộ giả.

**Xong khi:** `pytest manim/service/test_server.py` xanh. Test phủ: mọi mã trạng thái; gộp job; 429 ba lý do; TTL; huỷ job.

### 3C-02 · Bộ chạy job cách ly (tiến trình con có giới hạn)

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 3C-01 |
| Sở hữu | `manim/service/runner.py`, `manim/service/test_runner.py` |
| Đọc | ADR 0007 quyết định 5; [../SECURITY](../SECURITY.md) (T9, T22); [../OPERATIONS](../OPERATIONS.md) §2 (mẫu compose) |

**Làm**
1. Mỗi job một tiến trình con:
   - `preexec_fn` đặt `setsid` + `RLIMIT_CPU`, `RLIMIT_AS`, `RLIMIT_FSIZE`, `RLIMIT_NPROC`;
   - timeout; hết giờ thì kill **cả process group**;
   - thư mục làm việc riêng dưới `/work` (tmpfs), xoá sau job.
2. Chỉ chạy mẫu đã commit trong `manim/templates/` với `params` JSON. Không nhận mã.
3. TeX: `shell_escape=f`, `openin_any=p`, `openout_any=p` (cách đặt là [Unverified], kiểm trong task).
4. Sau render: chạy cổng QA của `manim/qa/`; trượt thì job `failed`.

**Xong khi:** `pytest manim/service/test_runner.py` xanh. Test phủ: vòng lặp vô hạn bị kill ≤ timeout + 5 s; vượt RAM bị chặn; process group không còn tiến trình con.

### 3C-03 · Image dịch vụ đã cứng hoá + compose

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | S |
| Phụ thuộc | 3C-02 |
| Sở hữu | `manim/service/Dockerfile`, `docker-compose.yml` |
| Đọc | [../OPERATIONS](../OPERATIONS.md) §2 (khối "Mẫu compose cho `manim-service`"), §10 |

**Làm**
1. Dockerfile từ image của `3A-04`: user 10001, không root.
2. Compose: profile `manim`, mạng internal riêng `manim`; `read_only`, tmpfs, `cap_drop: ALL`, `no-new-privileges`, `pids_limit`, `mem_limit`, `cpus` đúng mẫu OPERATIONS. Không mount `docker.sock`. Gắn service `openmaic` vào mạng `manim`.

**Xong khi:** `docker compose --profile manim config` hợp lệ; container chạy được và `GET /health` trả `200` khi gọi từ mạng `manim`.

### 3C-04 · Spike S6: red-team sandbox

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | — |
| Phụ thuộc | 3C-03 |
| Sở hữu | `manim/service/redteam/` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §8 (dòng S6) |

**Làm**
1. Đặt canary file và canary mạng.
2. Thử qua mẫu thử và đường LaTeX: `\input /etc/passwd`, `\write18`, `os.system`, socket, fork bomb, mem bomb, vòng lặp vô hạn.

**Xong khi:** 0 thoát; canary không bị đọc; bị kill ≤ timeout + 5 s; job khác không bị ảnh hưởng. Ghi kết quả vào RISKS dòng S6. Không đạt thì dừng 3C.

### 3C-05 · Client `manim-service` phía app

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | I-09 |
| Sở hữu | `lib/clips/service-client.ts`, `tests/clips/service-client.test.ts` |
| Đọc | [../INTERFACES](../INTERFACES.md) §6 |

**Làm**
1. `createManimClient({ url, token, fetch })` với `submit`, `status`, `download(jobId, chapter)`, `cancel`, `health`.
2. Header `x-manim-token` và `x-openmaic-client` (owner id của phiên).
3. `409` → đọc `/health`, trả `{ kind: 'template-rev-mismatch', current }`. `429` → `{ kind: 'busy', reason }`.
4. Timeout từng request; không ném lỗi ra ngoài: mọi lỗi thành giá trị có `kind`.

**Xong khi:** `pnpm vitest run tests/clips/service-client.test.ts` xanh (fetch giả).

### 3C-06 · Kho asset clip + route phục vụ có Range

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | I-09 |
| Sở hữu | `lib/clips/asset-store.ts`, `app/api/clips/[...path]/route.ts`, `tests/clips/asset-store.test.ts` |
| Đọc | [../DATA-MODEL](../DATA-MODEL.md) §4 (dòng "Lưu giữ"); tiền lệ `app/api/classroom-media/[classroomId]/[...path]/route.ts`, `tests/api/classroom-media-range.test.ts` |

**Làm**
1. `putClipAsset(bytes, ext)`: tên là băm nội dung; ghi vào `data/clips` (hoặc S3 nếu đã cấu hình theo cách hiện có); đã có thì không ghi lại.
2. **Không có hàm xoá.**
3. Route `GET` hỗ trợ Range, `Cache-Control: immutable`, đi qua access-code như route `/api/` khác. Tên tệp chỉ nhận dạng băm hex + phần mở rộng cho phép, chặn path traversal.

**Xong khi:** `pnpm vitest run tests/clips/asset-store.test.ts` xanh. Test phủ: Range, tên lạ bị từ chối, ghi trùng không đổi tệp.

### 3C-07 · Cờ `MANIM_SERVICE_URL`, `MANIM_SERVICE_TOKEN`

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | I-09 |
| Sở hữu | `lib/config/feature-flags.ts`, `.env.example`, `tests/clips/service-flags.test.ts` |
| Đọc | [../INTERFACES](../INTERFACES.md) §4; [../OPERATIONS](../OPERATIONS.md) §2 |

**Làm:** `getManimServiceConfig(): { url, token } | null`; thiếu một trong hai thì `null`. Trong `.env.example` thêm comment cho hai biến và các `MANIM_*` của compose; không có giá trị thật.

**Xong khi:** `pnpm vitest run tests/clips/service-flags.test.ts tests/widgets/flags.test.ts` xanh.

### 3C-08 · `generate_clip_scenes{params}`: nhánh bất đồng bộ

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 3C-05, 3C-06, 3C-07 |
| Sở hữu | `lib/server/agent-runtime/clip-tools.ts`, `tests/clips/clip-tool-params.test.ts` |
| Đọc | [../INTERFACES](../INTERFACES.md) §3 (mục 3b, dòng 3C); tiền lệ `lib/server/agent-runtime/generate-video.ts` (`buildGenerateVideoTool`), `lib/server/agent-runtime/pending-media.ts` |

**Làm**
1. Nhận `params` thay cho `presetId`; kiểm bằng `validateClipInput`; tính cache key.
2. Trúng cache: như 3A.
3. Trượt:
   - không có cấu hình → `clip-render-unavailable`;
   - có cấu hình → `submit`, tạo slide với video placeholder (ref đang chờ như `generate_video`), poll ở nền;
   - xong → lưu asset (`3C-06`), cập nhật chỉ mục, phát `media_ready`;
   - `failed`/timeout → trạng thái `failed`, kèm gợi ý preset gần nhất (khoảng cách tham số nhỏ nhất).
4. Không chờ đồng bộ trong tool; không retry khi ref đang chờ.

**Xong khi:** `pnpm vitest run tests/clips/clip-tool-params.test.ts tests/clips/clip-tool.test.ts` xanh. Client giả phủ: trúng cache, thành công, thất bại, timeout, không cấu hình.

### 3C-09 · Spike S8: kiểm luồng render theo yêu cầu

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | — |
| Phụ thuộc | 3C-04, 3C-08 |
| Sở hữu | — |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §8 (dòng S8) |

**Làm:** trên compose thật, đo bốn trường hợp: placeholder; timeout → failed; trúng cache; gộp job trùng khoá.

**Xong khi:** không có placeholder tồn tại mãi; trúng cache trả `src` ngay; kết quả ghi vào RISKS.

### I-10 · Tích hợp đợt 3C (leader)

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | S |
| Phụ thuộc | 3C-09 |
| Sở hữu | `.github/workflows/ci.yml`, `package.json` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §10 (Đợt 3); [../OPERATIONS](../OPERATIONS.md) §7, §9 |

**Làm:** job CI chạy `pytest manim/service`; cập nhật runbook và smoke ở OPERATIONS; kiểm kill-switch (bỏ `MANIM_SERVICE_URL` thì chỉ dùng clip dựng sẵn).

**Xong khi:** mục Đợt 3 ở Phase 3 §10 đạt.

## 7. Đợt 3D — mở rộng catalog bằng LLM tác giả

### 3D-01 · Brief hàng loạt từ curriculum

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | — |
| Phụ thuộc | I-09 |
| Sở hữu | `eval/manim-author/briefs-3d.json` |
| Đọc | ADR 0007 (đợt 4); ADR 0014 quyết định 4 |

**Làm:** hội đồng LLM Toán soạn brief cho mẫu Lô B còn lại, Lô C và các topic `primary_medium: manim` chưa có mẫu. Mỗi brief có topic, takeaway, hiểu lầm, đề xuất tham số.

**Xong khi:** mỗi mẫu dự kiến có brief; leader viết card `T` cho topic mới theo card mẫu §3.1.

### 3D-02 · Luồng CI "brief → PR" tự gộp

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 3D-01 |
| Sở hữu | `.github/workflows/manim-author.yml`, `scripts/manim-author-pr.mjs` |
| Đọc | ADR 0014 quyết định 4 (đoạn "Qua hết thì PR được gộp tự động") |

**Làm**
1. Khi `briefs-3d.json` hoặc module `T` đổi: chạy vòng `manim-author` trong job không có secret ghi repo ở bước sinh mã.
2. Mở PR riêng cho mỗi mẫu.
3. Chỉ bật auto-merge khi đủ bốn điều kiện: allowlist đạt, render + QA đạt, `manifest-check` đạt, review Toán + code đạt.

**Xong khi:** chạy thử trên một brief ra PR có đủ kết quả cổng; PR trượt cổng không được gộp.

### 3D-03 · Theo dõi RSR và chi phí

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | — |
| Phụ thuộc | 3D-02 |
| Sở hữu | — |
| Đọc | ADR 0007 (trigger); [../TEST-STRATEGY](../TEST-STRATEGY.md) §6 (dòng `eval:manim-author`) |

**Làm:** sau mỗi lô, ghi RSR@1/@3, tỉ lệ đúng-toán, token/mẫu, thời gian render vào ADR 0007. Chạm trigger thì dừng mở rộng.

**Xong khi:** có bảng số đo cho mỗi lô.

### 3D-T1 · Mẫu `plane-transform` (phép biến hình, nhân số phức)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-09 |
| Sở hữu | `lib/subjects/math/clips/plane-transform.ts`, `tests/clips/plane-transform.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** vector, phép biến hình, số phức, tier 3.
- **Input:** `record { x1, y1, x2, y2, x3, y3: int[-6,6], mode: enum['rotate90','reflect-x','homothety2','mult-i'] }`. **check:** tam giác không suy biến.
- **Preset:** mỗi `mode` một preset trên tam giác (1, 0, 4, 1, 2, 3).
- **Chapter:**
  - `shape`; `transform`;
  - `invariants`: độ dài/góc giữ hay đổi. `ask`: "phép này có giữ độ dài không?";
  - `complex`: nhân i bằng quay 90°.
- **invariants:** quay giữ khoảng cách; vị tự nhân khoảng cách với 2; `mult-i` trùng `rotate90`.
- **expectedDisplay:** `{ areaBefore, areaAfter }`.
- **Hiểu lầm:** "đối xứng trục giữ chiều quay".

**Xong khi:** như card mẫu §3.1, với `<id>` = `plane-transform`.

### 3D-T2 · Mẫu `lattice-paths` (đường đi trên lưới)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-09 |
| Sở hữu | `lib/subjects/math/clips/lattice-paths.ts`, `tests/clips/lattice-paths.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** tổ hợp nâng cao, tier 3.
- **Input:** `record { m: int[1,6], n: int[1,6] }`.
- **Preset:** `2-2`; `3-2`; `1-6` (biên); `4-4`.
- **Chapter:**
  - `grid`; `paths`: vẽ vài đường;
  - `pascal`: số đường tới mỗi điểm = tổng trái + dưới. `ask`: "số ở ô này bằng tổng của những ô nào?";
  - `binomial`: `C(m + n, n)`.
- **invariants:** số đường tính bằng DP = `C(m + n, n)`.
- **expectedDisplay:** `{ count }`.
- **Hiểu lầm:** "số đường = m · n".

**Xong khi:** như card mẫu §3.1, với `<id>` = `lattice-paths`.

### 3D-T3 · Mẫu `inclusion-exclusion` (bao hàm – loại trừ, ba tập)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-09 |
| Sở hữu | `lib/subjects/math/clips/inclusion-exclusion.ts`, `tests/clips/inclusion-exclusion.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** tổ hợp nâng cao, tier 3.
- **Input:** `record { r: int-array(len[7,7], range[0,9]) }`: 7 miền Venn theo thứ tự A, B, C, AB, AC, BC, ABC (miền "chỉ thuộc").
- **Preset:** `generic` (`[3,2,4,1,2,1,1]`); `empty-center` (ABC = 0); `disjoint` (chỉ ba miền đơn khác 0); `nested` (C nằm trong A ∩ B).
- **Chapter:**
  - `venn`; `add`: cộng `|A| + |B| + |C|`;
  - `subtract`: trừ các giao đôi. `ask`: "miền giữa giờ được đếm mấy lần?";
  - `add-back`: cộng lại `|A ∩ B ∩ C|`.
- **invariants:** công thức bao hàm – loại trừ bằng tổng 7 miền.
- **expectedDisplay:** `{ union, A, B, C }`.
- **Hiểu lầm:** "chỉ cần trừ các giao đôi".

**Xong khi:** như card mẫu §3.1, với `<id>` = `inclusion-exclusion`.

### 3D-T4 · Mẫu `induction-fallacy` (nguỵ biện quy nạp)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-09 |
| Sở hữu | `lib/subjects/math/clips/induction-fallacy.ts`, `tests/clips/induction-fallacy.test.ts` |
| Đọc | card mẫu §3.1 |

**Làm** theo card mẫu §3.1, với:
- **Topic:** quy nạp, tier 2.
- **Input:** `record { n: int[3,8], kind: enum['all-same-color','missing-base'] }`.
- **Preset:** `colors-4`; `colors-8`; `base-3`; `base-6`.
- **Chapter:**
  - `claim`: phát biểu sai;
  - `step`: bước quy nạp có vẻ đúng;
  - `crack`: chỗ hỏng (k = 1 → 2 không có phần chung; hoặc thiếu bước cơ sở). `ask`: "bước nào không còn đúng?";
  - `fix`: điều kiện cần cho quy nạp đúng.
- **invariants:**
  - `all-same-color`: phần chung của hai nhóm rỗng đúng khi k = 1;
  - `missing-base`: mệnh đề sai ở n = 1 trong khi bước k → k + 1 vẫn "đúng" về hình thức.
- **expectedDisplay:** `{ failAt }`.
- **Hiểu lầm:** "bước quy nạp đúng là đủ".

**Xong khi:** như card mẫu §3.1, với `<id>` = `induction-fallacy`.

**Task `M` của 3D** (theo card mẫu §3.2, qua luồng `3D-02`):

| ID | Cấp | Mẫu | Phụ thuộc | Sở hữu |
| --- | --- | --- | --- | --- |
| 3D-M1 | L | `plane-transform` | 3D-T1, 3D-02 | `manim/templates/plane_transform.py`, `lib/subjects/math/reviews/plane-transform@1.json` |
| 3D-M2 | L | `lattice-paths` | 3D-T2, 3D-02 | `manim/templates/lattice_paths.py`, `lib/subjects/math/reviews/lattice-paths@1.json` |
| 3D-M3 | L | `inclusion-exclusion` | 3D-T3, 3D-02 | `manim/templates/inclusion_exclusion.py`, `lib/subjects/math/reviews/inclusion-exclusion@1.json` |
| 3D-M4 | L | `induction-fallacy` | 3D-T4, 3D-02 | `manim/templates/induction_fallacy.py`, `lib/subjects/math/reviews/induction-fallacy@1.json` |

### I-11 · Tích hợp đợt 3D và Lô B còn lại (leader)

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 3D-03, 3D-M1, 3D-M2, 3D-M3, 3D-M4, 3B-M6, 3B-M7, 3B-M8, 3B-M9, 3B-M10, 3B-M11, 3B-M12, 3B-M13, 3B-M14 |
| Sở hữu | `lib/subjects/math/pack.ts`, `tests/subjects/catalog-lock.json`, `skills/agent-runtime/olympiad-math/SKILL.md` |
| Đọc | [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md) §3, §10 (Đợt 4) |

**Làm:** đăng ký các mẫu Lô B/Lô C đã qua cổng; sinh khối id; cập nhật bảng độ phủ topic Toán.

**Xong khi:** mục Đợt 4 ở Phase 3 §10 đạt; mẫu trượt cổng đã chuyển sang slide và ghi lại.
