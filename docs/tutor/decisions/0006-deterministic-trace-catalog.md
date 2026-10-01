# ADR 0006: Nguồn nội dung walkthrough — dữ kiện do hàm thuần sinh; lời thầy kịch bản hoá; LLM chỉ chọn `walkthroughId` + `presetId` (từ 1d: hoặc `input`)

- **Status**: Accepted (viết lại 2026-09-29; sửa 2026-09-30 theo ADR 0011–0013; quyết định bằng SWOT)
- **Date**: 2026-09-29; sửa 2026-09-30
- **Deciders**: User + Architect panel
- **Liên quan**: [0001](0001-step-engine-immutable.md), [0005](0005-widget-hosting-model.md), [0008](0008-lesson-blueprint-hard-problems.md), [0011](0011-entry-point-workbench-tool.md), [0012](0012-audience-scope-pedagogy-gates.md), [0013](0013-provider-scene-lifecycle.md), [../INTERFACES](../INTERFACES.md), [../TEST-STRATEGY](../TEST-STRATEGY.md)

> **Tóm tắt:**
> - **Dữ kiện do hàm thuần sinh và có test.**
> - Lời thầy là **kịch bản tất định** đi theo các beat **thật sự xảy ra ở từng preset** (ADR 0013).
> - **LLM chỉ chọn `walkthroughId` + `presetId`** qua tool `generate_walkthrough` (ADR 0011). Từ 1d LLM có thể cấp `input`, được kiểm bằng `InputSpec`.
> - Entry có code chỉ-đọc **C++ và Python**, và có thể là **bài giải đề** (ADR 0012).
> - Topic chưa có mẫu thì dùng storyboard hoặc widget LLM sinh (được phép).
> - Eval quyết định khi nào bật lời thầy do LLM.

## Context

Yêu cầu: bài giảng cho bài khó phải *rõ ràng, chi tiết, dễ hiểu, trực quan, sinh động*, và thầy "giải thích, trả lời, hướng dẫn". Câu hỏi thiết kế: **ai sinh ra nội dung từng bước** — hàm thuần, LLM, hay kết hợp?

Sự thật liên quan (đã đọc code / đếm):

- Stage sinh action của scene interactive chỉ cho 4 action `widget_*` và **3–8 mục** (`packages/@openmaic/generation/templates/interactive-actions/system.md:59,109`) → LLM chỉ nhảy được 3–4 frame trên 30–90 frame. Element Inventory chỉ có id/tag/class/aria-label, không có văn bản (`packages/@openmaic/generation/src/scene-generator.ts:1370-1383`) nên thầy không thấy nội dung frame.
- `null` từ content generation không gọi `onFailure` (chỉ 2 mã lỗi, `packages/@openmaic/generation/src/scene-generator.ts:75`); route trả 500 và client thử lại.
- Độ phủ curriculum (đếm bằng script trên `curriculum-map.json`, 32 topic): bản 7-walkthrough phủ 7/32 (21,9%); tier 1: 0/6; topic độ khó 5: 0/8; độ khó ≥4: 2/15.
- 64 `interactive_ideas`: 37 chỉ xem, 16 chọn trong tập hữu hạn, 11 nhập tự do ([Inference] phân loại thủ công).
- Kích thước (đo trên frame tổng hợp, [Inference]): 30 frame `array` ≈ 8 KB ký tự; 40 frame đồ thị ≈ 46 KB; 500 frame đồ thị ≈ 578 KB HTML.
- LLM mô phỏng thuật toán dễ sai và 500 frame có thể vượt ngân sách output: **[Inference], chưa đo** — cờ `--baseline` của eval (dưới) biến nó thành số đo.

## SWOT — nguồn nội dung cho bài khó

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| **A. Hàm thuần + lời viết tay** (catalog tác giả viết, vi/en) | Đúng theo test; xác định; cache được; kiểm soát sư phạm (bất biến, bẫy, độ phức tạp). | Tốn công viết vi/en; giọng có thể cứng; số bài hữu hạn. | LLM soạn nháp **offline**, người duyệt rồi commit. | Sửa pseudocode thì lời lệch (giảm bằng test đối chiếu). |
| **B. Lai**: hàm thuần sinh state, LLM sinh lời thầy theo state | Giọng tự nhiên; hợp pipeline (stage action vốn do LLM viết speech). | LLM chọn sai frame/nói sai số; tốn token mỗi lần; không cache; không test được tất định. | Bật dần sau khi eval đạt ngưỡng. | Suy diễn sai ở bài khó → học sinh học sai. |
| **C. LLM sinh toàn bộ** | Rẻ viết. | Trace sai, không test được; token lớn; vượt ngân sách output ở 500 frame [Inference]. | — | Dạy sai trong môn chuyên. |

## Decision

1. **Dữ kiện = A, luôn luôn.** Mọi thứ có thể sai một cách kiểm chứng được (giá trị từng bước, `explanation`, bất biến, độ phức tạp, bẫy) do hàm thuần và văn bản tác giả cung cấp. LLM không bao giờ sinh frame.
2. **Lời thầy = kịch bản tất định (A) là mặc định.** `provider.actions()` duyệt `sets[presetId].beats`: danh sách **có thứ tự, cho phép lặp**, gồm các beat thật sự xảy ra ở preset đó (ADR 0013 §4), tối đa 12 beat được kể. Mỗi beat sinh theo thứ tự:
   1. `beatDef.ask` (câu hỏi dự đoán), nói **trước khi nhảy**, nếu có. Từ 1c, `ask` có chế độ chờ học sinh trả lời (ADR 0008 Decision 5).
   2. `widget_setState{preset, frame, playing:false}`.
   3. `speech(fill(beatDef.narration, frame.meta.vars))`.

   Không bị giới hạn 3–8 action của LLM; không phụ thuộc LLM dùng đúng `frame`/`preset`.
3. **B (LLM viết lời thầy) chỉ bật cho từng entry sau khi eval đạt ngưỡng** (dưới), kèm kiểm tra tự động: `frame ∈ [0,N)`; chỉ tham chiếu `beats`; mọi số trong speech phải thuộc text hoặc state của frame vừa nhảy tới. **C bị loại.**
4. **LLM chỉ chọn `walkthroughId` và `presetId`** (lát 1b) qua tool `generate_walkthrough` (ADR 0011). Schema của tool liệt kê sẵn id sinh từ catalog.
   - `input` do LLM cấp (lưu ở `sets.llm`, ADR 0013 §9) chỉ mở từ lát 1d, kèm `parseInput` phía server.
   - Tool **kiểm trước** và trả lỗi `{error, validIds, issues≤5}` với mã kebab-case: `invalid-walkthrough-id`, `invalid-preset-id`, `invalid-input` (INTERFACES §3). Provider giữ vai trò lớp phòng thủ thứ hai.
   - Đường classic không có walkthrough.
5. **Topic không có walkthrough tất định hợp lý — thứ tự ưu tiên** (mọi mức đều là bài giảng trực quan; user muốn interactive và visualizer, ADR 0003):
   1. **Storyboard**: `steps()` trả 6–15 frame viết tay (kèm test bất biến: bảo toàn luồng, liệt kê xâu con…) — cùng widget, không đổi engine; đúng và kiểm thử được.
   2. **Widget LLM sinh** (`simulation`, `diagram`, `game`, `visualization3d`): **được phép** để minh hoạ khái niệm/mô hình. Đánh đổi: không có kiểm tra đúng/sai tất định → `SKILL.md` hướng dẫn dùng cho khái niệm và mô hình định tính; trace số liệu từng bước ưu tiên walkthrough/storyboard.
   3. Slide + `wb_*` khi Q&A.
   (Bản 2026-09-29 xếp widget LLM cuối cùng và cấm trong skill — bỏ, vì user muốn interactive/visualizer.)
6. **LLM biết `walkthroughId` qua hai kênh, cùng sinh từ catalog:** (a) schema của tool `generate_walkthrough` (union literal id, ADR 0011); (b) khối bảng id + mô tả + hình dạng `input` trong `SKILL.md`, do script sinh, có snapshot test. Ràng buộc `outline-constraints.json` chỉ là cảnh báo sau ghi nên chỉ giữ `allowedTypes`, `firstSceneType`, `sceneCount`; **không** dùng `typeMix` sàn, `allowedWidgetTypes` (widget LLM được phép), `requiredWidgetOutlineFields` (25/32 topic không có walkthrough sẽ luôn vi phạm).
7. **Hình dạng entry** (khai báo TS đầy đủ, nguồn chính thức: [INTERFACES §5](../INTERFACES.md)):
   ```ts
   interface WalkthroughEntry<I = unknown, S = unknown> {
     readonly id: string                            // duy nhất trên mọi gói (ADR 0013 §1)
     readonly entryRev: number                      // tăng khi frame/lời/preset/code đổi (ADR 0013 §6)
     readonly subject: string                       // 'cp' | 'math' | …  (không phải union đóng)
     readonly visualizer: string                    // 'array' | 'tree' | 'graph' | 'grid' | …
     readonly curriculumTopics: readonly string[]
     readonly title: Messages
     readonly code: {                               // ADR 0008 Decision 3: pseudocode + C++ + Python chỉ-đọc
       readonly pseudo: readonly string[]
       readonly impl: { readonly cpp: readonly string[]; readonly py: readonly string[] }
       readonly map: { readonly cpp: LineMap; readonly py: LineMap }   // dòng pseudo → dòng cài đặt (toàn phần, có test); Toán: impl và map rỗng, chỉ có pseudo (các bước chứng minh/khảo sát), tab C++/Python ẩn
     }
     readonly inputSpec: InputSpec                  // khai báo JSON (dưới); validator dùng chung server + iframe
     readonly check?: (input: Readonly<I>) => readonly string[]   // ràng buộc giữa các trường (l ≤ r < n, nguồn < số đỉnh, input là cây…); hàm thuần, chạy sau parseInput ở MỌI đường input; mảng rỗng = hợp lệ (thêm 2026-10-01 khi chia task)
     readonly customInput?: boolean                 // bật ô nhập input của học sinh (ADR 0008 §2), chỉ từ lát 1d
     readonly presets: readonly { id: string; label: Messages; input: I }[]    // ≥4, gồm ≥1 biên; tối đa 6
     readonly beatDefs: readonly BeatDef[]          // ADR 0013 §4: frame mốc tính theo từng preset lúc dựng
     readonly problem?: ProblemSpec                 // bài giải đề (ADR 0012 §3): đề, giới hạn, subtask, lessonKit
     readonly pitfalls?: readonly { text: Messages; lang?: 'cpp' | 'py'; beat?: string }[]
     readonly maxFrames: number                     // trần theo entry (≤ DEFAULT_MAX_FRAMES)
     readonly maxSteps?: number                     // trần số vòng tick (ADR 0001), mặc định 10 000
     readonly maxBytes: number                      // trần số byte UTF-8 của HTML đã dựng
     run(input: Readonly<I>, emit: Emit<S>, tick: () => void, ctx: { readonly locale: Locale }): void   // thuần; frame mốc gắn tag `beat:<id>`; `explanation` viết theo ctx.locale
   }
   ```
   - `Messages` = `Readonly<Record<Locale, string>>` với fallback `en-US`.
   - `MessageTemplate` cho phép tham số `{var}` điền từ `frame.meta.vars`.
   - Thêm locale chỉ cần thêm một khoá, không đổi `run()`.
   - `steps(entry, input, {locale})` là hàm của engine: `generateSteps(input, (i, emit, tick) => entry.run(i, emit, tick, {locale}), {maxFrames, maxSteps})`. `generateSteps` (ADR 0001) giữ nguyên, không biết locale. (Sửa 2026-10-01 khi chia task: bản trước không có đường đưa `locale` vào `run`, trong khi `explanation` phải theo locale.) Hệ quả: frame khác nhau theo locale, nên `framesHash` tính theo **(preset, locale)**.
   **`InputSpec`** — khai báo JSON thay cho zod, để **cùng một validator** (~60 dòng, không dependency) chạy ở server (input do LLM cấp) *và* trong iframe (input do học sinh nhập, ADR 0008 §2):
   ```ts
   type Range = readonly [number, number]
   type InputSpec =
     | { kind: 'int'; range: Range; ui?: 'slider' }                          // ui: hiển thị thanh trượt
     | { kind: 'enum'; values: readonly (string | number)[] }                // chọn một trong tập hữu hạn (vd. loại hàm, loại hằng đẳng thức)
     | { kind: 'number'; range: Range; step: number; ui?: 'slider' }
     | { kind: 'int-array'; len: Range; range: Range; strictlyIncreasing?: boolean }
     | { kind: 'string'; len: Range; alphabet: 'a-z' | '0-9' | 'ab' }
     | { kind: 'edge-list'; nodes: Range; edges: Range; weight?: Range }     // nhãn node tự sinh A, B, C…
     | { kind: 'grid'; rows: Range; cols: Range; cell: 'bit' | 'int'; range?: Range }
     | { kind: 'record'; fields: Readonly<Record<string, InputSpec>> }       // strict: khoá lạ bị từ chối
   declare function parseInput<I>(spec: InputSpec, raw: unknown): { ok: true; value: I } | { ok: false; issues: readonly string[] }
   ```
   `run` phải **thuần, tất định và chạy được trên trình duyệt** (không API Node), vì với `customInput` nó được biên dịch vào runtime của widget (module nhỏ theo entry; ADR 0005 Q1). **Lint cấm** trong `lib/subjects/**/catalog/**`: `Intl`, `Date`, `Math.random`, hàm `Math` siêu việt (`sin`, `cos`, `exp`, `log`, `pow` với số không nguyên), `toLocaleString`, `localeCompare`. Luật `no-restricted-properties`/`no-restricted-globals` trong `eslint.config.mjs`, không thêm dependency. Mục đích: server và trình duyệt cho cùng frame.
8. **Chuỗi trong `input`:**
   - Không nhãn tự do: đồ thị dùng nhãn tự sinh A, B, C…
   - Số nguyên trong miền hẹp.
   - Giới hạn kích thước ở `inputSpec`: JSON thô ≤ 2048 byte UTF-8 của `JSON.stringify`, vượt thì `invalid-input{issues:['too-large']}`.
   - **Đếm bước độc lập với `emit`:** mỗi vòng lặp gọi `tick()`; vượt `maxSteps` thì `RangeError`, nên vòng lặp không emit vẫn bị chặn. `RangeError` ở client thì runtime báo "input quá lớn", không treo.
9. **Ngưỡng frame**: tính theo `n` tối đa và trường hợp xấu nhất (ví dụ sort: n ≤ 8; mô phỏng của chuyên gia cho quick-sort n=8 đã sắp = 72 frame nếu mỗi so sánh/hoán đổi một frame, vượt ngưỡng 60 của bản cũ — [Inference], chốt khi cài đặt).
10. **Skill mới** phải có `title` (frontmatter) chứa chữ Hán, và khoá `skill.title.<handle>` ở `workbenchEn`, `workbenchZh`, 10 overlay `workbench-locales/*.json` (`tests/agent-runtime/skills.test.ts:255-268`, `tests/workbench/workbench-i18n.test.ts:116-137`).

## Eval (đóng spike Q4 và ngưỡng bật B)

`eval/walkthrough-actions/{runner,judge,reporter,types}.ts` + `scenarios/*.json`, script `eval:walkthrough-actions` (mẫu: `eval/outline-language`, `eval/orchestration`).

- Chỉ số tất định: M1 `frame` là số nguyên ∈ [0,N) (=100%); M2 có ≥1 `setState` mang `frame` (≥90%); M3 frame thuộc `beats`; M4 frame không giảm; M5 `target` thuộc id tĩnh của `extractInteractiveElements` (=100%); M6 số trong speech ⊆ text/state của frame vừa nhảy.
- LLM-judge (temperature 0, parse JSON chặt; lỗi parse tính là lỗi): lời thầy cạnh `setState` là *consistent/neutral/contradict* (contradict ≤5%); ngôn ngữ khớp locale.
- Cờ `--baseline`: cho LLM tự trace 20 input × 3 thuật toán, so số frame và frame cuối với hàm thuần → thay nhãn [Inference] bằng số đo.
- Ngưỡng là đề xuất, hiệu chỉnh sau lần chạy đầu.

## Consequences

**Positive:** trace đúng có test; lời thầy không phụ thuộc hành vi LLM; thầy dẫn được 5–10 mốc; đường tới giọng LLM tự nhiên đã mở nhưng có cổng.

**Negative:** chỉ dạy bằng walkthrough những bài có trong catalog (mở rộng = 1 file + 1 entry + 1 test + sinh lại khối id); tốn công viết lời vi/en (LLM soạn nháp offline, người duyệt).

**Trigger đổi:** nếu >20% speech (khi bật B) trượt kiểm tra hoặc reviewer chấm "cứng" → LLM soạn `narration` offline rồi duyệt; nếu log cho thấy phần lớn yêu cầu rơi vào topic chưa có mẫu → tăng tốc mở rộng catalog (ADR 0004), không nới sang C.
