# Phase 3 — Chuyên Toán (Manim là hướng chính): SCHEMA

- **Trạng thái**: **Khung** — §1–§3 và §6.1 là định hướng; các chi tiết kỹ thuật (§6, §8–§12) là **dự thảo, sẽ viết lại sau khi 3-0 có kết quả** (ADR 0012, quyết định 5). Sửa 2026-09-30 theo ADR 0007, 0011
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [../CONTENT-DESIGN](../CONTENT-DESIGN.md), [../OPERATIONS](../OPERATIONS.md), [../SECURITY](../SECURITY.md), [../RISKS](../RISKS.md), ADR 0005, 0007, 0009, 0011, 0012

> **Tóm tắt:** Chuyên Toán với **Manim là hướng chính**. Gồm:
> - 21 mẫu clip tham số hoá, chia Lô A/B/C; clip câm, lời thầy chạy riêng; mỗi chapter một slide do tool `generate_clip_scenes` tạo.
> - 3 walkthrough SVG cho phần thủ tục (đợt 3B).
> - Blueprint Toán, cổng QA + hội đồng LLM Toán ký; mẫu do LLM tác giả viết offline (ADR 0014).
> - Spike S1–S9: S1/S2/S4 chạy song song lát 1a.
> - Các đợt 3-0 → 3D; S9 (LLM tác giả) chạy ở 3A.
>
> Không đổi package. Chỉ có ở đường agent (workbench).

> **Lịch sử:** bản viết lại 2026-09-30 theo quyết định của user "Manim là hướng chính" (ADR 0007). Sửa lần 2 cùng ngày theo review: clip qua tool, lời riêng, cách ly dịch vụ, spike sớm.
> - S1/S2/S4 không phụ thuộc Phase 1; S3 và 3A phụ thuộc **1b**; Q&A cho clip phụ thuộc **1c**. **Không phụ thuộc Phase 2.** Không đổi package `@openmaic/*`.
> - Đây là bài kiểm chứng của yêu cầu "thiết kế để sau làm Toán". Phần walkthrough Toán chỉ là thêm môn (thư mục + dòng đăng ký + skill). Phần clip là **thêm một loại phương tiện** (một lần): `lib/clips`, tool `generate_clip_scenes`, `manim/` (ARCHITECTURE §4).

## 1. Mục tiêu

- Bài giảng Toán nâng cao **trực quan, sinh động** bằng **clip Manim** cho nội dung chuyển động liên tục/hình học/đồ thị. Clip câm; thầy giảng bằng TTS **trước và sau** mỗi chapter (user xác nhận "giữ riêng"); dừng-giải thích-hỏi theo chapter.
- **Walkthrough SVG** cho phần thủ tục cần tua/lùi/đổi số/Q&A theo frame; **slide + `wb_latex`** cho chứng minh dài chữ nhiều.
- Không code editor cho học sinh (toàn ứng dụng). Interactive + visualizer là để bài giảng sinh động.
- Ví dụ mong đợi: *"dạy em chứng minh Cauchy–Schwarz"* → slide + clip `cs-projection` (trực giác) + walkthrough `cauchy-schwarz` (chứng minh từng bước, đổi số) + quiz; *"khảo sát y = x³ − 3x"* → clip `secant-tangent` (mở bài) + walkthrough `curve-sketching`; *"dạy em cả chuyên đề Số học"* → chuỗi bài từ curriculum Toán (`curriculum-planner`).

## 2. Phạm vi — phân bổ vai trò (quyết định Z, ADR 0007)

| Loại nội dung | Chính | Bổ trợ | Lý do |
| --- | --- | --- | --- |
| Biến hình, hình học động (điểm chạy, đồng quy, quỹ tích), chứng minh không lời, đại số hình học, hàm số/đạo hàm/giới hạn/tích phân, song ánh đếm, tô màu/lát, đồng dư trên vòng tròn | **Manim clip** | walkthrough (đổi số), slide (phát biểu) | chuyển động liên tục có nghĩa |
| Thủ tục rời rạc cần tua/lùi, đổi số, Q&A theo frame (Cauchy–Schwarz số, khảo sát hàm đa thức, Euclid mở rộng, bảng đồng dư, sàng) | **Walkthrough SVG** | clip mở bài | `customInput` tức thời; Manim không đổi tham số tự do |
| Chứng minh dài chữ nhiều (SOS/Schur, phương trình hàm, bậc/LTE, cực trị tổ hợp), tính toán dài, định nghĩa | **Slide + `wb_latex`** | clip ≤ 25 s cho ý tưởng | chữ quan trọng hơn chuyển động |

Vai trò mới của 5 walkthrough cũ: `cauchy-schwarz` (proofOutline) **giữ**; `curve-sketching` **giữ** (thế mạnh `customInput`, sau lát 1d); `triangle-altitude` **giữ** cho dựng hình từng bước (clip `concurrency-dynamic` là chính); `cauchy-schwarz-2d` và `am-gm` **chuyển sang clip** (`cs-projection`, `amgm-semicircle`), walkthrough hạ xuống "lab" tuỳ chọn, không làm ở đợt đầu. Visualizer `geometry` vẫn cần (dựng hình + Tin `t4-geometry`).

## 3. Catalog clip Manim (21 mẫu đề xuất; đợt đầu 8)

Độ khó viết (S/M/L) và giá trị sư phạm (GT 1–5) là [Inference]. `s` = độ dài (giây, tổng các chapter). Tham số đặc tả bằng `InputSpec` (ADR 0006; thêm kind `enum`). Mỗi mẫu có 3–5 preset (→ 63–105 clip).

| # | id | Nội dung · tham số | s | Khó / GT | Lô |
| --- | --- | --- | --- | --- | --- |
| 1 | `amgm-semicircle` | AM–GM bằng nửa đường tròn, h=√ab ≤ r · `a,b:int[1,20]` | 30 | S/5 | **A** |
| 2 | `alg-identity-area` | (a+b)², a²−b² bằng diện tích · `id:enum`, `a,b:int[1,9]` | 25 | S/4 | **A** |
| 3 | `figurate-sums` | 1+3+…+(2n−1)=n², gnomon → quy nạp · `series:enum`, `n:int[2,10]` | 30 | S/4 | **A** |
| 4 | `cs-projection` | Cauchy–Schwarz ở ℝ², dấu = khi song song · 4 `int[-9,9]` | 40 | M/5 | **A** |
| 5 | `convex-chord` | Jensen: dây cung trên đồ thị lồi · `f:enum`, `x1,x2:int`, `λ:number[0,1]` | 35 | M/4 | B |
| 6 | `graph-transform` | y=a·f(x−h)+k · `f:enum`, `a,h,k:int` | 35 | S/4 | B |
| 7 | `secant-tangent` | cát tuyến → tiếp tuyến, chế độ MVT · `coeffs:int-array[3,4]`, `x0:int` | 45 | M/5 | **A** |
| 8 | `limit-epsilon` | dải ε, tìm N · `seq:enum`, `ε:number[0.05,0.5]` | 45 | M/4 | B |
| 9 | `riemann-integral` | n hình chữ nhật → tích phân · hệ số bậc ≤3, `[a,b]`, `n:enum` | 45 | M/5 | B |
| 10 | `geometric-series-area` | 1/2+1/4+…=1 · `r:enum` | 25 | S/4 | B |
| 11 | `pythagoras-dissection` | cắt–ghép (a+b)² · `a,b:int[1,9]` | 40 | M/5 | B |
| 12 | `concurrency-dynamic` | đường cao/trung tuyến… đồng quy khi đỉnh chạy · 6 `int[-9,9]`, `center:enum` | 45 | M/5 | **A** |
| 13 | `inscribed-angle` | góc nội tiếp = ½ góc tâm, tứ giác nội tiếp · `arc:int[20,340]` | 35 | M/5 | **A** |
| 14 | `power-of-point` | PA·PB=PC·PD=PT² · `R:int`, `P:2 int` | 40 | M/4 | B |
| 15 | `plane-transform` | quay/đối xứng/vị tự/nhân số phức · tam giác 6 `int`, `mode:enum` | 45 | M/4 | C |
| 16 | `modular-clock` | bảng nhân mod n trên vòng tròn, chu kỳ aᵏ · `n:int[5,31]`, `a:int` | 40 | M/4 | B |
| 17 | `euclid-rectangle` | gcd bằng lát hình vuông · `a,b:int[1,60]` | 35 | S/4 | B |
| 18 | `lattice-paths` | đường đi lưới = C(m+n,n), Pascal, phản chiếu · `m,n:int[1,6]` | 45 | L/5 | C |
| 19 | `inclusion-exclusion` | Venn 3 tập · 7 `int` nhất quán | 35 | M/4 | C |
| 20 | `tiling-coloring` | bàn cờ bỏ 2 ô, tô màu, domino · `n:int{4,6,8}` | 40 | M/5 | **A** |
| 21 | `induction-fallacy` | nguỵ biện quy nạp · `n:int[3,8]`, `kind:enum` | 30 | S/4 | C |

Tổng: 7 S + 13 M + 1 L. **Lô A** gồm 8 mẫu (**1, 2, 3, 4, 7, 12, 13, 20**); Lô B = mẫu 5, 6, 8, 9, 10, 11, 14, 16, 17; Lô C = 15, 18, 19, 21. **Đợt 1 (3A) dựng 3 mẫu của Lô A** (`amgm-semicircle`, `cs-projection`, `secant-tangent`); 3B hoàn thành Lô A và làm 1–4 mẫu Lô B (sau 3B tổng 9–12 mẫu). Lô A phủ 4 kỹ thuật Manim (hình tĩnh/cắt–ghép, `ValueTracker` + updater, `Axes` + đồ thị, lưới rời rạc). Tái dùng cho Tin: #4, #12 (`t4-geometry`), #16–#20 (số học, DP lưới, đếm, grid) [Inference: 7/21].

## 4. Walkthrough SVG còn lại

`cauchy-schwarz` (`proofOutline`: cây cho/có/do/suy ra + minh hoạ số, `customInput` sau 1d), `curve-sketching` (`functionPlotter`: đạo hàm, cực trị, điểm uốn, đồ thị từng bước; `customInput` đổi hệ số, `ui:'slider'`), `triangle-altitude` (`geometry`: dựng đường cao từng bước). `functionPlotter` **không nhận biểu thức** (server tính điểm mẫu từ **hệ số đa thức**, không parser/`eval`); `proofOutline` dùng KaTeX qua asset **inline** (không `postProcessInteractiveHtml`; spike Q8: KaTeX inline, kiểm export HTML/MP4/ZIP); input của LLM chỉ là số nguyên.

## 5. Blueprint bài giảng Toán (8 giai đoạn)

| # | Giai đoạn | Scene · phương tiện | Hành động thầy |
| --- | --- | --- | --- |
| 1 | Động cơ / bài toán | slide, hình tĩnh | speech; hỏi mở, học sinh dự đoán |
| 2 | Trực giác bằng hình động | slide + clip (20–45 s) | speech ≤2 câu → `play_video` chapter 1 → hold, hỏi dự đoán → chapter 2 → giải thích |
| 3 | Phát biểu | slide LaTeX (điều kiện, dấu =) | spotlight vào điều kiện |
| 4 | Chứng minh từng bước | clip khung (45–90 s) hoặc walkthrough `proofOutline`; dòng đại số ở slide/`wb_latex` | speech từng bước; `widget_setState{frame}` |
| 5 | Ví dụ mẫu | slide + wb; walkthrough "lab" đổi số | speech, `discussion` |
| 6 | Biến thể + sai lầm | clip phản mẫu (10–25 s) + quiz "sai ở bước nào?" | phản hồi `aiComment` |
| 7 | Kiểm tra | quiz single/short_answer, ≥1 câu dự đoán | — |
| 8 | Tổng kết + mở rộng | slide | speech |

Recipe: 6–8 scene, scene 1 là slide, 1–3 clip/bài, tổng clip ≤ ~4 phút [Inference]; clip nằm trong slide nên `scene_mix` giữ slide/interactive/quiz.

**Quy tắc clip** [Inference — chưa có dữ liệu thử]: 1 clip = 1 ý (takeaway ≤1 câu); trực giác 20–45 s, khung chứng minh 45–90 s, phản mẫu 10–25 s, trần liên tục 90 s; chia chapter 8–25 s, **mỗi chapter một file** (vì `play_video` không có offset) + file master; cuối chapter hold ≥1,5 s ở khung "chốt" (cũng là `poster`); chữ trên màn ≤12 token; ≥1 câu hỏi dự đoán sau mỗi 2 chapter; luôn nói rõ "đây là trực giác, chứng minh chặt ở bước sau" để tránh "chứng minh bằng hình đặc biệt".

**Tương tác của học sinh với clip:** L0 dừng/tua gốc; L1 chọn biến thể = preset dựng sẵn (3–5, tức thì); L2 tham số tự do → ưu tiên walkthrough (chạy client, tức thời); render mới từ `inputSpec` (cache) là phương án cuối, làm sau L1 (đợt 3).

**Q&A khi học sinh dừng giữa clip:** L0 — `clip-sheet` (chapter, cái đang hiện, công thức, hiểu lầm hay gặp, gợi ý theo bậc) vào digest của thầy (ADR 0009 bước 0) + `name` tag của phần tử video; thầy hỏi "em đang ở đoạn nào?" (nút chapter) rồi vẽ lại khung `poster` bằng `wb_draw_latex/shape`. L1 — host báo `currentTime`→chapter (đợt sau).

## 6. Kiến trúc clip (ADR 0007, ADR 0005)

```
manim/                           # Python; loại khỏi eslint/tsc/Docker app (như render-service)
  templates/<clipId>.py          # Scene tham số hoá (Manim CE pin 0.21.0)
  qa/                            # cổng QA (bbox chữ, ffprobe, SSIM), pytest bất biến
  Dockerfile                     # từ manimcommunity/manim + TeX bổ sung + font OFL (pin)
  service/                       # (đợt 3) manim-service: submit→poll→download→cancel, 429, opt-in
lib/clips/                       # lõi TS (làm một lần)
  types.ts  registry.ts  cache-key.ts  provider.ts  describe.ts  adopt.ts
lib/subjects/math/
  pack.ts  catalog/*.ts (walkthrough)  clips/index.ts  clips/<clipId>.ts  clips/messages/{vi-VN,en-US}.ts
scripts/render-clips.mjs         # CI: dựng preset, đẩy asset
tests/clips/   tests/subjects/math/
```

- **Loại `manim/` khỏi công cụ JS** (như `render-service`): `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs`, `.dockerignore` (OPERATIONS §3).
- **`ClipEntry`** (hình dạng ở ARCHITECTURE §8b): `id`, `kind:'prebuilt'|'template'`, `curriculumTopics`, `title: Messages`, `inputSpec`, `presets`, `engine{name:'manim-ce',version,templateRev}`, `render{w:1280,h:720,fps:30}`, `chapters[{id,startSec,endSec,label,before,after,caption?,ask?}]`, `bakedText`, `invariants(params)`, `cacheKeyInput(input, locale)`, `asset(input, locale)`. `silent: true`.
- **Tạo slide clip** bằng tool `generate_clip_scenes{stageId, afterOrder, clipId, presetId}` (ADR 0011; `lib/server/agent-runtime/clip-tools.ts`):
  - **mỗi chapter một slide** với bố cục cố định: tiêu đề, một `PPTVideoElement` (`name:'clip:<id>@<hash>#<chapterId>'`, `src` là URL cụ thể), text chú thích;
  - kịch bản tất định `speech(before) → play_video → speech(after)` (+ `ask`).

  **Không** thêm tham số `clip` vào `generate_scene`, và **không** dùng `SceneEnricher`: bản trước muốn chèn giữa `generation-tools.ts:387` và `:445`, không khớp pipeline. Spike **Q11**: slide do tool dựng qua `validateScene`.
- **Cache key**: định nghĩa duy nhất ở [DATA-MODEL §4](../DATA-MODEL.md), gồm `templateRev`, `paramsCanon` lượng tử hoá, `locale` hoặc `null`, `profile`, `imageDigest`. Trúng → trả `src` ngay. Trượt → 3A trả `clip-not-prebuilt`; 3C tạo job + placeholder.
- **Lưu asset**: ≤10 clip băm tên vào `public/clips/` (ngân sách ≤30 MB, có test); nhiều hơn → volume `data/clips` hoặc S3 (`ASSET_S3_BUCKET` đã có) phục vụ bằng route Range theo mẫu classroom-media; tên băm nội dung + `immutable`. **Adopt vào asset pool** khi dùng lần đầu để ZIP/MP4/import hoạt động (spike S3).
- **Định dạng**:
  - MP4 H.264 yuv420p faststart, 720p30, ≤ ~3 MB/chapter [Unverified].
  - Mỗi chapter ≤25 s, master (tuỳ chọn) ≤90 s, ≤6 clip/bài.
  - Poster mỗi chapter; `captions.{vi,en}` (WebVTT chỉ dùng được nếu sửa được video element; nếu không thì caption là text slide); `clip-sheet.json`.
  - Manifest theo DATA-MODEL §4 (`chapters[]`, `durationSec`, `imageDigest`, `profile`); test khẳng định `entry.chapters` khớp `manifest.chapters`.
  - **Asset đã phát hành không bao giờ bị xoá** (OPERATIONS §5).
- **Không nướng chữ tự nhiên vào video**: chỉ ký hiệu, số, nhãn hình, chú giải màu. Lời là TTS từ `chapters[].before/after`; phụ đề là text slide. Một video dùng cho cả vi và en (`bakedText:false` → `locale = null` trong cache key).
- **Lời và hình chạy tuần tự** (user xác nhận "giữ riêng", ADR 0007 Decision 3):
  - `play_video` chặn, nên thứ tự là speech → clip → speech. **Không có `cues.json`**; sửa lời không cần render lại.
  - Bù cho việc lời không chạy cùng hình: chapter ngắn; lời trước nói cần để ý gì; nhãn/giá trị then chốt hiện trong hình; câu hỏi dự đoán sau chapter.
  - Không dùng `manim-voiceover`.

### 6.1. Quy trình sản xuất và đảm bảo đúng toán

1. LLM tác giả (`manim-author`) nhận **brief** do hội đồng LLM Toán soạn từ curriculum: topic, 1 câu takeaway, hiểu lầm hay gặp.
2. **LLM tác giả viết offline trong CI**: `storyboard` (chapter, lời `before`/`after` vi/en, preset) và mẫu `.py` tham số hoá; qua **AST allowlist** và sandbox; sửa lỗi tối đa 3 vòng (ADR 0014). Không bao giờ chạy khi phục vụ.
3. **Cổng tự động không LLM**: `invariants()` chạy trên mọi preset và biên; scene ghi `manifest.json` (số/toạ độ hiển thị), vitest đối chiếu với hàm TS độc lập (AM–GM h≤r; ba đường cao đồng quy |det|<ε; Riemann so với tích phân giải tích theo hệ số; gcd so với Euclid; aᵏ mod n so với `pow`); render smoke + độ dài (clip 20–90 s, chapter 8–25 s, hold ≥1,5 s); lint (chữ tự nhiên = 0, ≤12 token/khung, bbox trong khung, palette cố định).
4. **Hội đồng LLM Toán ký** (cổng cứng; `tutor-review-math` + `-2`): đúng, đủ điều kiện, không suy ngược từ hình đặc biệt. `tutor-review-code` duyệt code; AST allowlist bắt buộc (ADR 0014).
5. **LLM-judge vision** trên keyframe: chỉ tư vấn.
6. **Đóng gói**: mp4 theo chapter (+ master tuỳ chọn) + poster mỗi chapter + captions + `clip-sheet.json`; đánh phiên bản bằng hash.

**Rubric** (ngưỡng [Inference]): Đúng toán — 0 lỗi, `invariants` 100%, hội đồng LLM ký (cổng cứng); Rõ — 1 ý/chapter, ≤3 đối tượng mới/chapter, judge ≥4; Không tràn chữ — 0 vi phạm bbox; Nhịp — độ dài đúng khoảng, không >1 thay đổi chính đồng thời; Tương phản/a11y — ≥4,5:1, không phân biệt chỉ bằng màu, không nhấp nháy >3 lần/s; Sư phạm — ≥1 câu hỏi dự đoán sau mỗi 2 chapter, nêu điều kiện + dấu =. Judge: N=3, đạt khi ≥70% mẫu (`EVAL_PASS_THRESHOLD` 0,7).

## 7. Skill và curriculum Toán

**Skill** `olympiad-math`: `SKILL.md` (`name`, `title` chứa chữ Hán — ví dụ `数学奥林匹克` — do `tests/agent-runtime/skills.test.ts:255-268`; nguyên tắc không tạo bài luyện code; bảng `clipId`/`walkthroughId` **sinh từ catalog** + snapshot test; blueprint §5; quy tắc clip §5; "mỗi định lý có ≥1 hình minh hoạ (clip, walkthrough hoặc `wb_*`)"; "các bước chứng minh (cho / có / do / suy ra)"; khi user hỏi cả chuyên đề → `references/curriculum/index.json` + `curriculum-planner`). `outline-constraints.json` chỉ cảnh báo: `allowedTypes`, `firstSceneType:"slide"`, `sceneCount {6,8}`. i18n: `skill.title.olympiad-math` ở `workbenchEn`, `workbenchZh` và 10 overlay `workbench-locales/*.json`. Không thêm `subject.math.*`.

**Curriculum** `references/curriculum/{index.json, tier-N.json}` — **dữ liệu**, cần research nội dung riêng (chưa viết); hình dạng như file Tin (`version, locale, subject, title_vi, title_en, exam_targets, audience, course_shape, difficulty_scale, tiers, sequencing, sources, exam_profile`; topic: `id, name_vi, name_en, difficulty, est_scenes, prerequisites, subtopics, typical_problems, pitfalls, interactive_ideas, vn_sources, exam_relevance`); thêm cột **`primary_medium`** (`manim` | `walkthrough` | `slide`). `course_shape` theo blueprint §5 (không `code`). Khung đề xuất (28 topic = 4 tier × 7; **[Inference], hội đồng LLM Toán duyệt kèm nguồn; mọi tên kỳ thi/tài liệu [Unverified] tới khi có nguồn**):

| Tier (lớp) | Topic → phương tiện chính (số = mẫu clip §3; W = walkthrough; S = slide + `wb`) |
| --- | --- |
| T1 Cơ sở (8–9) | alg-identities→M#2·S; divisibility-primes→S·W(sàng); inequality-basic→M#1·S; quadratic-vieta→S·M#6; triangle-geometry→M#11,12·W(triangle-altitude); circle-angles→M#13·S; counting-basic→S |
| T2 Trung cấp (9–10) | inequality-classic→M#4,5·W(cauchy-schwarz); equations-systems→S; modular-arith→M#16·W; euclid-diophantine→M#17·W; circle-power→M#14·S; pigeonhole-invariants→M#20·S; induction→M#3,21·S |
| T3 Nâng cao (10–11) | polynomials→S·W; sequences-limits→M#8,10·S; derivative-graphs→M#7,6·W(curve-sketching); inequality-advanced→S; number-theory-adv→S; counting-advanced→M#18,19·S; vector-transform-complex→M#15·S |
| T4 Chuyên sâu (11–12) | functional-equations→S; integral→M#9·S; limits-mvt→M#7,8·S; projective-inversion→M(backlog)·S; number-theory-olympiad→S; combinatorics-olympiad→S·M(backlog); games-invariants→W(cây trò chơi)·S |

Đếm thủ công theo cột đầu tiên [Inference]: Manim chính 17/28, slide chính 10, walkthrough chính 1; walkthrough xuất hiện ở 8 topic; slide-only 6 topic. Cần research thêm (không bịa nguồn): đề cương thực tế chuyên Toán 10/HSG tỉnh/VMO/đội tuyển; khối lớp nào học chủ đề nào (đối chiếu chương trình hiện hành); trọng số topic trong đề; danh mục tài liệu tiếng Việt và `provenance`/bản quyền.

## 8. Spike

| # | Đo | Đạt khi ([Inference]) |
| --- | --- | --- |
| **S1** Image & hiệu năng | Build image (bản chính thức v0.21.0 + pin TeX Live + font). Đo kích thước giải nén, khởi động lạnh. Render 3 cảnh × 15/30/60 s × (720p30, 1080p60) trên 2 và 4 vCPU: thời gian, RSS đỉnh, MB của MP4. | 30 s@720p30 ≤3 phút (2 vCPU); RSS ≤2 GiB; MP4 ≤15 MB/30 s |
| **S2** Tiếng Việt | 200 chuỗi có dấu (ệ, ữ, ậ…) qua `Text` (Noto Sans / Be Vietnam Pro), `MathTex` (xelatex hoặc `babel-vietnamese`), và `Typst`/`MathTypst`. | 0 ô vuông (fontTools); 0 va chạm dấu ở 50 cụm duyệt tay; LaTeX biên dịch 100% |
| **S3** Tích hợp slide video | `PPTVideoElement` + `play_video`; adopt vào pool; export MP4/ZIP; import máy sạch; tua; độ trễ `speech`→clip; MP4 kiểm dwell và có clip. | Không lỗi; ZIP tăng ≈ tổng MP4; trễ ≤0,5 s |
| **S4** Tất định | Render 2 lần cùng image, trên 2 kiến trúc; `ffmpeg -f framemd5`. | Cùng image+host giống 100% hoặc SSIM ≥0,99 (cache key tất định nên không đo "tỉ lệ trúng cache") |
| **S5** Kiểm kê topic | Phân loại mọi topic Toán: có cần chuyển động liên tục không (cần curriculum Toán research trước). | ≥5 topic |
| **S6** Sandbox (đợt 3C) | Red-team container dài hạn đã cứng hoá + tiến trình con mỗi job (ADR 0007 Decision 5): `\input /etc/passwd`, `\write18`, `os.system`, socket, fork bomb, mem bomb, vòng lặp vô hạn (mã mẫu + đường LaTeX), với canary file/mạng. | 0 thoát; canary không bị đọc; bị kill ≤ timeout+5 s; không ảnh hưởng job khác |
| S7 Clip widget (chỉ nếu cần (ii)) | `blob:`/URL trong iframe null-origin: cross-browser, có `ACCESS_CODE` (cookie), seek, Range. | Phát được, seek được |
| S8 `generate_clip_scenes{params}` (đợt 3C) | Placeholder, timeout→failed, trúng cache, gộp job trùng khoá. | Không placeholder mãi; trúng cache trả `src` ngay |
| S9 LLM tác giả Manim (đợt 3A, ADR 0014) | 20 brief Việt: RSR@1/@3, qua cổng QA + AST allowlist, đúng-toán do hội đồng LLM | RSR@3 ≥90% và đúng-toán ≥90% |
| Q8 KaTeX dựng sẵn (Phase 3B, cho walkthrough Toán) | Công thức dựng trên server bằng `katex.renderToString`; iframe chỉ có CSS + font inline (tiền lệ `lib/video-export/emit-hyperframes/katex-assets.ts`); đo kích thước; qua export HTML/MP4/ZIP | Công thức đúng ở cả ba đường; CSS + font ≤ ~300 KB [Inference] |
| Q11 Slide do tool dựng | Slide clip do `generate_clip_scenes` dựng qua `validateScene`, render, export | Không lỗi |

## 9. Kiểm thử và eval

Node: từng entry (`invariants`, manifest↔`chapters`, cache key ổn định và lượng tử hoá, `inputSpec` biên), `tests/agent-runtime/skills.test.ts`, catalog↔SKILL.md (snapshot), `curriculum-map`, `workbench-i18n`, tool `generate_clip_scenes` (mỗi chapter một slide, `name`/`src` đúng, `actions()` tuần tự, `clip-not-prebuilt`, không đổi package), walkthrough còn lại (như Phase 1/2). Python (`manim/`): pytest bất biến + bbox + `ffprobe`. Trình duyệt: Playwright nạp slide có clip, `play_video` chạy hết, export MP4/ZIP (S3). Eval: `eval:tutor-lesson` ≥3 scenario Toán; judge vision (tư vấn).

## 10. Acceptance criteria

Đối chiếu tên đợt: Đợt 0 = 3-0, Đợt 1 = 3A, Đợt 2 = 3B, Đợt 3 = 3C, Đợt 4 = 3D (ADR 0004).

**Đợt 0** — S1, S2, S4 có kết luận (chạy song song lát 1a); S3 (sau 1b) và S5 có kết luận; ghi vào ADR 0007; research curriculum Toán xong (ít nhất khung tier × topic + `primary_medium`).

**Đợt 1**
- [ ] Image Manim pin (0.21.0 + TeX Live + font) dựng được trong CI; `scripts/render-clips.mjs` dựng 3 mẫu × preset.
- [ ] Cổng QA (§6.1) chạy tự động; hội đồng LLM Toán ký ≥ 3 mẫu; bộ hiệu chuẩn hội đồng Toán đạt.
- [ ] Tool `generate_clip_scenes{clipId, presetId}` tạo mỗi chapter một slide có `PPTVideoElement` và kịch bản `speech(before)`→`play_video`→`speech(after)`; không đổi package (`git diff --name-only origin/main -- packages/@openmaic` rỗng).
- [ ] **S9**: 3 mẫu đầu do `manim-author` viết qua vòng sửa ≤ 3; RSR@3 và đúng-toán ghi vào ADR 0007; chi phí token/mẫu; đi tiếp/dừng theo trigger ADR 0007.
- [ ] Export MP4/ZIP/import trọn vòng có clip (S3).
- [ ] Skill `olympiad-math` hiện ở menu, tên đúng 12 locale; `pnpm vitest run tests/clips tests/subjects tests/tutor tests/widgets tests/workbench tests/agent-runtime/skills.test.ts`, `pnpm build`, `pnpm lint`, `pnpm check`, `npx tsc --noEmit`, `pnpm check:i18n-keys` pass.
- [ ] *"dạy em chứng minh Cauchy–Schwarz"* → khoá có clip `cs-projection` + slide chứng minh (walkthrough `cauchy-schwarz` ở đợt 3B).

**Đợt 2** — sau 3B tổng 9–12 mẫu (đủ Lô A + 1–4 mẫu Lô B, chọn theo S5); vi/en; `describe()`/`clip-sheet` cho Q&A; rubric đạt; **3 walkthrough SVG** (`cauchy-schwarz`, `triangle-altitude`, `curve-sketching`) + visualizer `geometry`/`functionPlotter`/`proofOutline`; *"khảo sát y = x³ − 3x"* → clip `secant-tangent` + `curve-sketching`. Thêm các mẫu/walkthrough này chỉ là *thêm file* (hạ tầng clip đã có từ 3A).

**Đợt 3** — `manim-service` (cách ly theo ADR 0007 Decision 5) + `generate_clip_scenes{params}` (S6, S8 đạt); placeholder/timeout; cache; asset không bao giờ xoá.

**Đợt 4** — trợ lý soạn nháp offline + số đo RSR (S9).

## 11. Ngoài phạm vi và backlog

Desmos/GeoGebra; manim-web; **LLM viết mã Manim chạy trên server phục vụ** (chỉ mở bằng ADR mới sau trigger ADR 0007); `manim-voiceover`, `manim-slides`; visualizer `vector`/3D (trigger: ≥2 topic hình không gian → thêm `visualization3d`); kéo điểm trực tiếp trên hình (JSXGraph LGPL-3.0, ADR riêng); clip widget (ii) trừ khi S7 đạt và có nhu cầu; `currentTime` reporting (Q&A L1).

## 12. Thứ tự cho coding agent

| Bước | Module | Song song |
| ---: | --- | --- |
| 0 | Spike S1, S2, S4 (Docker/Manim) **song song lát 1a** + research curriculum Toán (agent research riêng) | Phase 1a |
| 1 | S3 (tích hợp slide video, adopt, export) | 2 |
| 2 | `lib/clips/*` + `InputSpec.enum` + provider clip + tool `generate_clip_scenes` + test | 1, 3 |
| 3 | `manim/` (image, khung mẫu, cổng QA) + 3 mẫu đầu + CI render | 1, 2 |
| 4 | Skill `olympiad-math` + i18n title + sinh khối id | phụ thuộc 2 |
| 5 | Đợt 1 tích hợp + smoke §10 + S9 (LLM tác giả) | phụ thuộc 1–4 |
| 6 | (Đợt 2) Walkthrough SVG: `cauchy-schwarz`, `triangle-altitude`, `curve-sketching` (customInput sau 1d) + visualizer `geometry`/`functionPlotter`/`proofOutline` | sau 5 |
| 7 | Đợt 2 → 3 → 4 theo cổng | tuần tự theo đợt |

Điểm chung duy nhất giữa các agent: `lib/subjects/math/pack.ts`, `lib/clips/registry.ts`, dòng đăng ký ở `lib/subjects/index.ts`.
