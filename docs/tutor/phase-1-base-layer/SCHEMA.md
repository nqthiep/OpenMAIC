# Phase 1 — Base Layer + lát cắt dọc (1a, 1b, 1c, cổng G1, 1d): SCHEMA

- **Trạng thái**: Đặc tả triển khai (đang chờ thực hiện; sửa 2026-09-30 theo review: ADR 0010–0013)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [../ARCHITECTURE](../ARCHITECTURE.md), [../INTERFACES](../INTERFACES.md), [../DATA-MODEL](../DATA-MODEL.md), [../TEST-STRATEGY](../TEST-STRATEGY.md), ADR 0001, 0005, 0006, 0008–0013

> **Tóm tắt:** nền dùng chung của cả hai môn:
> - engine, player, runtime (có CSP và bắt tay `widget-ready`), provider;
> - **tool `generate_walkthrough`**;
> - chặn `code` nhiều lớp (mặc định chặn);
> - Q&A biết frame, có thang gợi ý;
> - **một walkthrough thật `binary-search`** (pseudocode + C++ + Python) chạy trọn vòng.
>
> MVP = **1a–1c + cổng sư phạm G1**; 1d (nhập input) chỉ mở khi "preset chạy ổn" theo tiêu chí đo được. Chỉ chạy khi bật workbench. **Không đổi package.**

> **Lịch sử:** bản viết lại 2026-09-29; sửa 2026-09-30 theo giải thích của user; sửa lần 2 ngày 2026-09-30 theo 4 quyết định của user và review 4 chuyên gia (REVIEW §Vòng 6). **Không đổi package `@openmaic/*` nào** (không bump, không publish).

## 1. Mục tiêu

Kết thúc Phase 1 (tới G1), **một walkthrough thật chạy trọn vòng đời trên workbench**:

- *"dạy em Binary Search"*:
  1. Agent gọi `generate_walkthrough{walkthroughId:'binary-search', presetId}`, rồi soạn slide quanh walkthrough từ `lessonKit`.
  2. Thầy dẫn theo beat **của đúng preset** (kịch bản tất định), có câu hỏi dự đoán **chờ học sinh trả lời**.
  3. Học sinh tự tua, đổi preset, xem tab C++ hoặc Python.
  4. Học sinh **hỏi thầy**; thầy biết frame hiện tại và gợi ý theo bậc.
- Không có code editor cho học sinh: widget `code` **mặc định bị chặn** ở hiển thị, ghi và sinh (ADR 0010). Các widget tương tác khác vẫn dùng bình thường.
- **1d** (sau cổng): học sinh nhập input của mình (trong giới hạn `inputSpec`) để quan sát, không phải viết code.
- Thêm một môn dùng lại phương tiện sẵn có chỉ cần thêm thư mục + một dòng đăng ký.

| Lát | Nội dung | Kiểm chứng bằng | Cỡ [Inference] |
| --- | --- | --- | --- |
| **1a** | Engine (`tick`/`maxSteps`), player, guard message, `InputSpec`, `WalkthroughEntry` (`beatDefs`, `problem?`, C++ + Python), `binary-search` | vitest môi trường node | M |
| **1b** | Runtime/shell + CSP, bắt tay, registry + provider, **tool `generate_walkthrough`**, khoá `patch_stage`, chặn `code` nhiều lớp, điều kiện workbench (Dockerfile/compose), skill tối thiểu, i18n | vitest + Playwright | L |
| **1c** | Q&A biết frame (digest + `widget-state`), thang gợi ý + hiểu lầm, ngân sách lời "tutor", chế độ dự đoán (Q9), spike S2b, bài giải đề nhỏ `bs-answer-mini` | vitest + Playwright + eval | M |
| **G1** | Cổng sư phạm (ADR 0012 §6, ADR 0014): hội đồng LLM Tin ký + học sinh mô phỏng; bộ hiệu chuẩn đạt | review JSON + eval | — |
| **1d** | Nhập input tuỳ chỉnh (preset `student`/`llm`, module `run` trong iframe, Q&A tính lại). **Cổng: ADR 0012 §7** | vitest + Playwright | M |

**Song song với 1a:** spike Manim S1, S2, S4 (Phase 3 §8), vì chúng không cần 1b.

## 2. Thay đổi trong code hiện có (không chạm package)

| File | Thay đổi | Lát |
| --- | --- | --- |
| `lib/config/feature-flags.ts` | `isCodeWidgetAllowed()` đọc `OPENMAIC_ALLOW_CODE_WIDGET` (mẫu `readBoolean`): **không đặt = chặn**. `isWidgetProvidersDisabled()` đọc `OPENMAIC_DISABLE_WIDGET_PROVIDERS` (kill-switch). | 1b |
| `lib/server/agent-runtime/walkthrough-tools.ts` (mới) | Tool `generate_walkthrough` (INTERFACES §3): schema union id sinh từ catalog; kiểm → `provider.build()` → `assertScenePolicy` → `putSceneBringingCurrent` (`lib/server/agent-runtime/document-writes.ts:32`); idempotent theo `callId`. | 1b |
| `lib/server/agent-runtime/course-tools.ts` (`:204-237`), `lib/agent-runtime/stage-writer-tools.ts` (`:20`) | Đăng ký tool trong `buildDslCourseToolset` + `buildCourseAllowlist` (bỏ qua khi kill-switch bật); thêm `generate_walkthrough` vào `STAGE_WRITER_TOOL_NAMES` (chạy tuần tự, quyền ghi workbench). | 1b |
| `lib/server/agent-runtime/generation-tools.ts` | `generate_scene`: union `widgetType` dựng động, không có `code` khi bị chặn; kiểm scene cuối (cả hai trường); gặp `widgetOutline.walkthroughId` → `use-generate-walkthrough`. `generate_actions` (`:513-537`) và `duplicate_scene` (`:581-600`): scene walkthrough → `provider.actions()`; nguồn `code` → `code-widget-blocked`. | 1b |
| `lib/server/agent-runtime/dsl-tools.ts` (`:811-836`) | `patch_stage`: kiểm trạng thái cuối → `code-widget-blocked`, `walkthrough-locked` (ADR 0013 §7). | 1b |
| `components/scene-renderers/interactive-renderer.tsx` (`:34-37`), `components/slide-renderer/components/ThumbnailInteractive/index.tsx` (`:49-53,82-88`) | **L1 chặn hiển thị** ở **cả hai** nơi dựng iframe `srcDoc`: `isCodeWidget(content)` và chưa được phép → khung thông báo tĩnh (thumbnail: ảnh tĩnh), không mount iframe. Cờ hỏi từ server; chưa biết thì coi là chặn. | 1b |
| `lib/export/use-export-pptx.ts` (`:1263-1276`) | Gói tài nguyên xuất HTML interactive thành tệp độc lập: bỏ HTML của scene `code` khi bị chặn (ghi tệp thông báo thay thế). | 1b |
| `lib/utils/iframe.ts` (`:288`, `patchHtmlForIframe`) | Chèn CSP cho **widget LLM** (ADR 0010 L5), chỉ bật sau spike Q10. CSP của walkthrough do builder nhúng sẵn (`lib/tutor/build/csp.ts`), không phụ thuộc hàm này. | 1b |
| `components/scene-renderers/InteractiveIframeHost.tsx` (`:175-181`, `:207-225`) | Bắt tay: giữ `desired[sceneId]`, gửi lại khi `widget-ready`; nhận `widget-ready`/`widget-state` (kiểm `e.source`, `walkthroughId`), kẹp số. | 1b (bắt tay), 1c (`widget-state`) |
| `lib/store/widget-runtime-state.ts` (mới) | Store `{ready, desired, state}` theo mẫu `scene-runtime-errors.ts`. | 1b |
| `app/api/generate/scene-outlines-stream/route.ts` (~`:589`), `app/api/generate/scene-content/route.ts` (`:65-105`) | Classic: coerce `code` → `diagram`/`simulation` (mẫu `sanitizeNonTaskEngineOutline`); áp cả legacy `interactiveConfig`; **không trả null**. | 1b |
| `app/api/classroom/route.ts` (`:80-81`), `app/api/persistence/[...path]/route.ts`, `app/api/stages/[id]/route.ts` (`:118`, `PUT`) | Không từ chối lớp học có `code` (giữ dữ liệu), ghi log `code-widget-stored`; chặn ở L1. | 1b |
| `components/generation/outlines-editor.tsx` (`:1136-1176`) | Ẩn lựa chọn `code` khi bị chặn. | 1b |
| `skills/agent-runtime/deep-interactive/SKILL.md` (`:4,30,42`), `skills/agent-runtime/workshop-style/SKILL.md` (`:54`), `outline-constraints.json` của hai skill đó (`allowedWidgetTypes`), `skills/agent-runtime/stage-dsl/references/widget.md` (`:122`, mục `code`) | Bỏ `code` ("code they run") khỏi danh sách widget; ghi chú mục `code` trong `widget.md` là "bị chặn trên triển khai này". | 1b |
| `Dockerfile` (`:51-72`), `docker-compose.yml` (`:5-22`) | Thêm `ARG`/`ENV NEXT_PUBLIC_PRO_WORKBENCH_ENABLED` vào stage builder và `build.args` (ADR 0011). | 1b |
| `.env.example` | Ghi chú: tính năng cần `OPENMAIC_AGENT_RUNTIME_ENABLED=true`, `DATABASE_URL`, `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true`; `# OPENMAIC_ALLOW_CODE_WIDGET=` (để trống = chặn). | 1b |
| `eslint.config.mjs` | Luật cấm `Intl`/`Date`/`Math.random`/hàm `Math` siêu việt/`toLocaleString`/`localeCompare` trong `lib/subjects/**/catalog/**` (ADR 0006 §7). | 1a |
| `lib/i18n/locales/*.json` (**12 file**) | `subject.tutor.*` (§6). | 1b |
| `lib/i18n/workbench.ts` (`workbenchEn`, `workbenchZh`) + 10 file `lib/i18n/workbench-locales/*.json` | `skill.title.competitive-programming`. | 1b |
| `skills/agent-runtime/competitive-programming/SKILL.md` | Skill tối thiểu: blueprint (ADR 0008), dùng `generate_walkthrough` cho trace, bảng id (sinh từ catalog), không bài luyện code; 1c thêm "khi học sinh hỏi" (thang gợi ý). `title` chứa chữ Hán (`tests/agent-runtime/skills.test.ts:255-268`). | 1b, 1c |
| `components/chat/use-chat-sessions.ts` (`:183-208`), `lib/types/chat.ts` (`:318-352`), `agent-loop.ts` (`:23-45`) | Thêm `widgetState` cho scene hiện tại. | 1c |
| `lib/orchestration/summarizers/state-context.ts` (`:159-243`), `lib/chat/pi/tools/read-scene.ts` (`:60-63`) | Nhánh `interactive` → `provider.describe()` (chữ từ catalog); scope `widgetState` theo `sceneId`. | 1c |
| `lib/orchestration/prompt-builder.ts` (`:180-190`) | Ngân sách lời "tutor" (~300 ký tự) khi scene hiện tại là walkthrough (ADR 0008 Decision 6). | 1c |
| `lib/server/model-routes.ts` (`:132-154`) | Thêm stage `tutor-moderation`, `tutor-review-cp`, `tutor-review-cp-2`, `tutor-review-code`, `sim-learner`, `tutor-analyst` vào `LLM_STAGES` (Toán thêm ở Phase 3). Tính năng kiểm route tường minh, thiếu thì tắt (ADR 0014). | 1c |
| `app/api/chat/route.ts` (`:44-132`), `lib/tutor/moderation.ts` (mới) | Bộ lọc vào/ra (INTERFACES §8.1): lọc tin nhắn học sinh trước `statelessGenerate`; giữ `text_delta` theo `messageId` tới `agent_end` rồi lọc; fail-closed. | 1c |
| `lib/runtime/payload-validators.ts` (`:33-37`) | Thêm kind `tutorLearning` + validator (INTERFACES §8.3); host ghi beat/dự đoán/gợi ý/đánh giá. | 1c |
| `eval/tutor-review/`, `eval/sim-learner/`, `eval/tutor-moderation/` (mới) | Hội đồng LLM, học sinh mô phỏng, bộ hiệu chuẩn (ADR 0014). | 1c |
| `lib/action/engine.ts` (`:881-886`) | `executeWidgetSetState`: nếu `state.predict` thì chờ `widget-state.prediction` tối đa 20 s hoặc "Bỏ qua"; silent/export không chờ (spike Q9). | 1c |

Không sửa: `packages/@openmaic/*`, template prompt trong package, `vitest.config.ts`.

## 3. File layout mới

```
lib/widgets/
  types.ts  registry.ts  policy.ts (isCodeWidget, assertScenePolicy)  describe.ts  index.ts
lib/server/agent-runtime/walkthrough-tools.ts   # tool generate_walkthrough
lib/tutor/
  engine/    types.ts  generate.ts  player.ts
  protocol/  messages.ts                       # guard host→iframe + widget-ready/widget-state (viết tay, không zod)
  runtime/   core.ts  layout.ts  panels.ts  predict.ts  exercise.ts  visualizers/{types.ts,array.ts}  entries/array.ts
  build/     build-html.ts  shell.ts  csp.ts  generated/runtime-array.ts (GENERATED)  # + script sinh + test độ mới
             generated/entry-binary-search.ts (GENERATED, lát 1d: run + inputSpec + Messages)
  input-spec.ts                               # InputSpec + parseInput (lát 1a; iframe dùng ở 1d)
  catalog/   types.ts                          # WalkthroughEntry, BeatDef, ProblemSpec (ADR 0006, INTERFACES §5)
  provider.ts                                  # WidgetProvider 'walkthrough'
lib/subjects/
  index.ts
  cp/  pack.ts  catalog/{binary-search.ts, bs-answer-mini.ts}  messages/{vi-VN,en-US}.ts
scripts/generate-tutor-runtime.mjs             # sinh module runtime (tiền lệ generate-video-export-katex.mjs)
tests/widgets/  tests/tutor/  tests/subjects/cp/
```

## 4. API công khai

- **Engine**: ADR 0001 (`Frame`, `FrameMeta` gồm `vars/aux/tags`, `Emit`, `generateSteps(input, run, {maxFrames, maxSteps})`, `DEFAULT_MAX_FRAMES`, `DEFAULT_MAX_STEPS`).
- **Player**: `createPlayer({ total, speed?, setTimer?, clearTimer? })` (ARCHITECTURE §6).
- **Entry / registry / provider / tool / chặn `code`**: INTERFACES §3, §5; ADR 0005, 0006, 0010, 0011, 0013.
- **Widget config** và **walkthrough data**: [DATA-MODEL §3](../DATA-MODEL.md).
- **Shell DOM**: ARCHITECTURE §6 (~22 id tĩnh; `data-line`, không id từng dòng code).
- **Messages**: `parseInbound(data) → InboundMessage | null` cho `SET_WIDGET_STATE` và `HIGHLIGHT_ELEMENT` theo ngữ nghĩa ở INTERFACES §1. Chiều ra: `widget-ready`, `widget-state` (INTERFACES §2).
- **Locale**: tham số `locale` của tool; nếu thiếu thì `resolveLocale(languageDirective)`: có dấu tiếng Việt hoặc "Vietnamese" ⇒ `vi-VN`; nói tiếng Anh ⇒ `en-US`; mặc định `vi-VN`.

### 4.1. Entry tham chiếu: `binary-search`

- `subject:'cp'`, `visualizer:'array'` (`mode:'bars'`), `curriculumTopics:['t2-binary-search']`, `entryRev: 1`.
- `inputSpec`: `record{ values: int-array(len 1–12, range [-999,999], strictlyIncreasing), target: int([-999,999]) }`; `customInput: true` (chỉ có hiệu lực từ lát 1d).
- **Presets (≥4, gồm ≥1 biên)**: `mid-hit` (10 phần tử, target ở `mid` đầu tiên); `first` (target = phần tử đầu); `absent` (target vắng mặt); `single` (n=1).
- **Pseudocode (7 dòng)**:
  ```
  1  lo ← 0; hi ← n − 1
  2  while lo ≤ hi:
  3      mid ← ⌊(lo + hi) / 2⌋
  4      if a[mid] = target: return mid
  5      if a[mid] < target: lo ← mid + 1
  6      else: hi ← mid − 1
  7  return −1
  ```
- **C++ chỉ-đọc (9 dòng)**, `map.cpp`: 1→[2], 2→[3], 3→[4], 4→[5], 5→[6], 6→[7], 7→[9]:
  ```cpp
  int binary_search(const std::vector<int>& a, int target) {   // 1
      int lo = 0, hi = (int)a.size() - 1;                      // 2
      while (lo <= hi) {                                       // 3
          int mid = lo + (hi - lo) / 2;                        // 4  (tránh tràn số)
          if (a[mid] == target) return mid;                    // 5
          if (a[mid] < target) lo = mid + 1;                   // 6
          else hi = mid - 1;                                   // 7
      }                                                        // 8
      return -1;                                               // 9
  }
  ```
- **Python chỉ-đọc (10 dòng)**, `map.py`: 1→[2], 2→[3], 3→[4], 4→[5,6], 5→[7,8], 6→[9], 7→[10]:
  ```python
  def binary_search(a, target):          # 1
      lo, hi = 0, len(a) - 1             # 2
      while lo <= hi:                    # 3
          mid = (lo + hi) // 2           # 4  (Python không tràn số)
          if a[mid] == target:           # 5
              return mid                 # 6
          if a[mid] < target:            # 7
              lo = mid + 1               # 8
          else: hi = mid - 1             # 9
      return -1                          # 10
  ```
  Test kiểm `map.cpp` và `map.py` toàn phần theo số dòng thật.
- **Bẫy theo ngôn ngữ**:
  - `lang:'cpp'`: "tràn số khi `(lo+hi)/2`" ở beat `mid`.
  - `lang:'py'`: "`/` cho số thực; phải dùng `//`".
  - Chung: "`lo ≤ hi` hay `lo < hi`".
- **`beatDefs` (5)**:
  - `start` (`required`), `mid`, `go-right`, `go-left`, `done` (`required`).
  - Mỗi beat có `label`, `narration` (tham số `{lo}`, `{hi}`, `{mid}`), `hints[3]`, `misconceptions`.
  - `mid` có `ask.predict` ("bước tiếp theo `lo` hay `hi` đổi?").
  - Tuỳ preset, `sets[p].beats` có số lần lặp khác nhau. Ví dụ `mid-hit` = `start, mid, done`; `absent` có `go-left`/`go-right` lặp.
- Ngưỡng frame: ≤ 4·(⌊log₂ n⌋+1)+2 với n ≤ 12 [Unverified — chốt khi viết test]; `maxFrames` ≤ 60; `maxBytes` theo entry.
- Không dùng `postProcessInteractiveHtml` (entry không có toán).

### 4.2. Bài giải đề nhỏ `bs-answer-mini` (1c; phục vụ G1)

Đề do tác giả tự viết, dạng "cắt gỗ": cho `n` cây cao `h[i]` và nhu cầu `M`; tìm chiều cao cưa `H` lớn nhất để tổng `max(0, h[i]−H) ≥ M`.
- `problem.subtasks`:
  - `n ≤ 100, h ≤ 100`: thử mọi `H`, O(n·maxH).
  - `n ≤ 10^5, h ≤ 10^9`: chặt nhị phân trên `H`, vì hàm `check(H)` đơn điệu; O(n log maxH).
- Visualizer `array` (bars) với vạch `H`; `beatDefs`: `brute`, `monotonic`, `check`, `narrow`, `done`.
- Bản đầy đủ `bs-answer` thuộc Phase 2A.

## 5. Kiểm thử

`vitest.config.ts` chỉ thu thập `tests/**/*.test.ts` → test ở `tests/widgets`, `tests/tutor`, `tests/subjects/cp`; môi trường node; không `.tsx`.

| File | Kiểm |
| --- | --- |
| `tutor/engine/generate.test.ts` | Deterministic; input bị freeze; vượt `maxFrames` ⇒ `RangeError`; `run` lặp vô hạn **không emit** ⇒ `RangeError` qua `tick` (`maxSteps`); JSON round-trip; `index` liên tục. |
| `tutor/engine/player.test.ts` | Fake timer: play/pause/step/jump/kẹp biên; speed kẹp; tự pause ở frame cuối; nút Phát ở cuối quay về 0; `dispose`; `subscribe`. |
| `tutor/protocol/messages.test.ts` | Mỗi message hợp lệ; thứ tự áp `preset → frame → panel → speed → playing`; `preset` lạ ⇒ bỏ cả message; `frame` kẹp theo bộ mới; `playing:true` idempotent, chỉ về 0 với `restart:true`; `frame`=1.5/NaN/chuỗi ⇒ bỏ trường; kiểu lạ/`null`/mảng ⇒ `null`; không ném lỗi. |
| `tutor/build/build-html.test.ts` | Hai khối JSON parse được; `widget-config` đủ trường ADR 0013 §5 và không chứa `frames`; `extractInteractiveElements` liệt kê `#wt-*` và ≤60 id; HTML không chứa `<script src`, `</script` lạ, `<!--`; có meta CSP; `<` trong JSON được thoát; không `localStorage`; kích thước ≤ `maxBytes` (byte UTF-8). |
| `tutor/build/runtime-fresh.test.ts` | Module runtime sinh sẵn khớp bản build lại. |
| `subjects/cp/binary-search.test.ts` | Frame cuối đúng (đối chiếu `indexOf`); target vắng; `n=1`; input không tăng ngặt bị từ chối; `map.cpp`, `map.py` toàn phần; 4 preset; mọi preset có beat `required`; mọi `beatDef` dùng ở ≥1 preset; ngưỡng frame; không mutate input; số/nhãn trong `explanation` thuộc state. |
| `subjects/ids-snapshot.test.ts` | Snapshot `id` + `entryRev` + `framesHash` mỗi (preset, locale) + `contentHash`; hash nào đổi mà `entryRev` không tăng ⇒ đỏ; `id` duy nhất trên mọi gói. |
| `widgets/registry.test.ts`, `widgets/walkthrough-tool.test.ts` | `claimsScene` theo `widgetConfig.kind`; đúng một provider/scene; tool: id/preset sai ⇒ lỗi kèm `validIds`; `input` trước 1d ⇒ `invalid-input`; idempotent theo `callId`; **không gọi LLM** (`aiCall` giả ném lỗi nếu bị gọi); actions theo `sets[presetId].beats` với thứ tự `[ask] → setState{preset,frame} → speech`; `generate_scene` + `walkthroughId` ⇒ `use-generate-walkthrough`. |
| `widgets/policy.test.ts` | Mặc định (không đặt biến) ⇒ chặn; `ALLOW=true` ⇒ không chặn. Chặn theo **cả** `widgetType` và `widgetConfig.type`; `generate_scene` (schema không có `code`), `patch_stage`, `duplicate_scene` (scene cuối) ⇒ `code-widget-blocked`; classic và `scene-content` coerce; **widget khác không bị chặn**. |
| `widgets/render-block.test.ts` | Hàm quyết định của `InteractiveRenderer` (tách thuần, test node): scene `code` ⇒ không mount iframe khi bị chặn hoặc khi chưa biết cờ. |
| `widgets/write-paths.test.ts` | Kiểm kê: grep `putScene`/`saveDocument`/route ghi scene **và mọi chỗ có `srcDoc=`**; mỗi đường/điểm hiển thị phải nằm trong danh sách đã phân loại (L2 chặn, L1 chặn hiển thị); đường mới ⇒ đỏ. |
| `widgets/patch-lock.test.ts` | `patch_stage` làm đổi `/content/html`/`/content/widgetConfig` của walkthrough (trước **hoặc** sau) ⇒ `walkthrough-locked`; biến scene thường thành walkthrough bằng tay ⇒ bị chặn; sửa `/actions` được phép; `generate_actions` trên scene lệch catalog ⇒ `walkthrough-stale`. |
| `tutor/input-spec.test.ts` (1a) | `parseInput`: từng `kind`, khoá lạ bị từ chối, biên, `strictlyIncreasing`, JSON > 2048 byte ⇒ `too-large`, không ném lỗi với kiểu lạ. |
| `widgets/describe.test.ts` (1c) | `describe` trả title/beats/gợi ý **tra từ catalog**; có `widgetState` ⇒ explanation/codeLine/vars/pseudo+C++/Python của frame k; `entryRev` lệch ⇒ chỉ digest tĩnh; **chữ trong HTML/`widgetConfig` bị bỏ qua** (HTML có chữ tiêm vào vẫn cho cùng kết quả). |
| `subjects/cp/custom-input.test.ts` (1d) | `run` chạy trong bundle iframe cho ra frame **giống** server với cùng input; input vượt trần ⇒ `RangeError` được bắt và báo lỗi, không treo. |
| e2e `e2e/tests/walkthrough-widget.spec.ts` | Iframe `srcdoc` với `sandbox="allow-scripts allow-forms allow-popups"`: `widget-ready` được gửi; `SET_WIDGET_STATE{preset,frame:3}` gửi **trước** khi ready vẫn được áp ⇒ `data-frame-index="3"`; message từ nguồn khác parent bị bỏ; **0 request ra ngoài**; dựng lại iframe (giả lập bị đẩy khỏi pool) ⇒ về đúng frame mong muốn. |
| e2e `e2e/tests/code-widget-blocked.spec.ts` | Nạp lớp học có scene `code` ⇒ không có iframe editor, có khung thông báo. |

## 6. i18n

`subject.tutor.*` trong cả 12 `lib/i18n/locales/*.json`: `play`, `pause`, `prev`, `next`, `reset`, `speed`, `explanation`, `pseudocode`, `cpp`, `python`, `beats`, `preset`, `variables`, `predict`, `skip`, `blocked`. Bộ đếm frame do runtime ghép. Thêm `tests/i18n/tutor-locales.test.ts` (`check:i18n-keys` chỉ so với `en-US`, không bắt thiếu key ở `en-US`). Tên skill: xem §2. `ar-SA` là RTL: layout shell dùng thuộc tính logic (`margin-inline-*`) [Inference: cần kiểm tay].

## 7. Spike (đầu mỗi lát; ghi kết quả tại đây)

| # | Câu hỏi | Trạng thái |
| --- | --- | --- |
| Q1 | Công cụ build runtime → module TS sinh sẵn (Rollup + `rollup-plugin-typescript2` root, hoặc công cụ khác); IIFE theo tsconfig riêng. | Chưa làm (quyết định phân phối: đã chốt ở ADR 0005) |
| Q2 | `widgetConfig` có bị ghi đè? | **Đã trả lời: không** (`packages/@openmaic/generation/src/scene-builder.ts:92-93`); tool tự dựng scene nên không còn phụ thuộc |
| Q3 | Locale. | **Đã chốt**: tham số tool + heuristic, mặc định `vi-VN` (ADR 0005) |
| Q4 | LLM có dùng `frame` đúng không. | **Thay bằng kịch bản tất định** (ADR 0006) |
| Q5 | Điểm sinh action cho scene walkthrough | **Đã chốt bằng thiết kế** (ADR 0011): tool tự sinh action; `generate_actions` (`lib/server/agent-runtime/generation-tools.ts:513-537`) và `duplicate_scene` đi qua provider; classic không gặp walkthrough |
| Q6 | Message tới trước khi iframe load; iframe bị đẩy khỏi pool | **Đã chốt bằng thiết kế** (ADR 0013 §2: `widget-ready` + gửi lại `desired`); e2e kiểm chứng |
| Q7 | Runtime nhận diện cờ chụp tĩnh của video-export để nhảy tới `posterBeat`? | Chưa làm (ARCHITECTURE §12) |
| Q9 | Engine chờ dự đoán: tương tác với tạm dừng/tua, resume, chat mở giữa chừng, silent mode | Chưa làm (1c) |
| Q10 | CSP cho widget LLM: bao nhiêu widget mẫu (≥ 30 widget sinh cho 6 chủ đề) bị vỡ | Chưa làm (1b; chỉ bật cho widget LLM nếu ≤ 10% vỡ) |
| Q12 | Liệt kê chính xác mọi route ghi scene cho `write-paths.test.ts` | Chưa làm (1b) |
| Q13 | Resume scene walkthrough: coi `widget_setState` tuyệt đối là "dựng lại được" trong `lib/playback` | Backlog sau 1c |
| S2b | Skill có tới chat agent Q&A không (để quy tắc "khi học sinh hỏi" có tác dụng) | Chưa làm (1c) |

## 8. Acceptance criteria

**1a**
- [ ] Engine/player/messages/`input-spec`/entry `binary-search` có test §5 và pass: `pnpm vitest run tests/tutor tests/subjects/cp`.
- [ ] `pnpm lint` pass với luật tất định mới cho `lib/subjects/**/catalog/**`.

**1b**
- [ ] `pnpm vitest run tests/widgets tests/tutor tests/subjects` pass; toàn bộ `pnpm test` pass (gồm `tests/agent-runtime/skills.test.ts`, `workbench-i18n.test.ts`).
- [ ] `pnpm build`, `pnpm lint`, `pnpm check` (prettier), `npx tsc --noEmit`, `pnpm check:i18n-keys`, `tests/i18n/tutor-locales.test.ts` pass.
- [ ] **Không đổi package**: `git diff --name-only origin/main -- packages/@openmaic` rỗng.
- [ ] Không đặt biến gì: tạo lớp học có scene `code` (import) ⇒ không hiện editor (e2e `code-widget-blocked.spec.ts`).
- [ ] e2e `walkthrough-widget.spec.ts` pass (bắt tay, 0 request ra ngoài, hồi phục sau khi dựng lại iframe).
- [ ] Image dựng bằng `docker compose build` với `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true` có `/workbench`.
- [ ] Demo có ghi chép trên workbench: *"dạy em Binary Search"* sinh khoá phát được; kịch bản đúng beat của preset; đổi preset; tua; tab C++/Python.
- [ ] Skill `competitive-programming` hiện trong menu với tên đúng ở cả 12 locale.

**1c**
- [ ] Thầy Q&A thấy digest và **frame hiện tại** (test `describe` + e2e `widget-state`); chữ lấy từ catalog.
- [ ] Câu hỏi dự đoán có chờ: engine dừng tới khi học sinh trả lời, bấm "Bỏ qua" hoặc hết 20 s (e2e).
- [ ] `eval:tutor-qa` chạy lần đầu với chỉ số ADR 0008 (Đúng, Bám frame, Gợi ý trước); ghi kết quả.
- [ ] Spike S2b, Q14, Q15 có kết luận.
- [ ] Bộ lọc vào/ra hoạt động: tin nhắn độc hại bị chặn; câu trả lời chỉ hiện sau khi lọc; model lọc lỗi → câu an toàn (fail-closed); thiếu route → chat bị chặn (test `tests/tutor/moderation.test.ts`).
- [ ] `tutorLearning` được ghi cho beat/dự đoán/gợi ý/đánh giá (test validator + e2e).

**G1 (cổng sư phạm, ADR 0012 §6)**
- [ ] Hội đồng LLM Tin (`tutor-review-cp` + `-2`, hai nhà cung cấp) chấm `binary-search` và `bs-answer-mini` theo rubric ADR 0008: mọi tiêu chí ≥ 4/5, không lỗi "Đúng"; review JSON commit ở `lib/subjects/cp/reviews/`.
- [ ] Học sinh mô phỏng (`sim-learner`, 6 persona): điểm sau – điểm trước ≥ 20 điểm %, ≥ 70% persona chấm "dễ hiểu" ≥ 4/5.
- [ ] Bộ hiệu chuẩn đạt: hội đồng bắt ≥ 90% lỗi cài sẵn; bộ lọc chặn ≥ 99% mẫu độc hại, chặn nhầm ≤ 2%; mô phỏng phân biệt bài tốt/kém (ADR 0014 quyết định 7).

**1d** (chỉ khi cổng ADR 0012 §7 đạt)
- [ ] Học sinh nhập input hợp lệ (`#wt-input`) → visualizer chạy trên input đó (preset `student`); input sai/quá lớn → báo lỗi tại `#wt-input-error`, không treo (e2e).
- [ ] Sau khi nhập tuỳ chỉnh và tua tới frame k, thầy Q&A thấy đúng frame k của input đó (server kiểm lại `input` và tính lại; test `describe`).
- [ ] `input-spec.test.ts`, `custom-input.test.ts` pass; `sets.llm` (LLM cấp input) có kịch bản.

## 9. Không thuộc phạm vi Phase 1

- Visualizer ngoài `array`; entry ngoài `binary-search`, `bs-answer-mini`; nội dung Toán.
- Walkthrough trên đường classic (ADR 0011).
- Cho thầy Q&A nhảy frame (`widget_setState` trong `ROLE_ACTIONS`); tuỳ chọn sau.
- Học sinh mang đề riêng tới để có walkthrough; dependency mới; đổi package `@openmaic/*`.
- MP4 dựng từng bước của walkthrough (ARCHITECTURE §12).

## 10. Thứ tự cho coding agent

| Bước | Module | Song song với |
| ---: | --- | --- |
| 0 | Spike Q1, Q10, Q12 (đọc code + dựng build thử); **S1/S2/S4 của Phase 3** | — |
| 1a-1 | `engine/*` + test | 1a-2, 1a-3 |
| 1a-2 | `protocol/messages.ts` + test | 1a-1, 1a-3 |
| 1a-3 | `catalog/types.ts`, `input-spec.ts` + test, `binary-search` (pseudo, C++, Python, hai map, presets, `beatDefs`, messages vi/en) + test; luật lint | 1a-1, 1a-2 |
| 1b-1 | i18n `subject.tutor.*` (12 file) | mọi bước 1b |
| 1b-2 | `runtime/*` + `build/*` (CSP, bắt tay phía runtime) + script sinh + test | 1b-1 |
| 1b-3 | `lib/widgets/*` (registry, policy) + `provider.ts` + `lib/subjects/cp/pack.ts` + test | phụ thuộc 1a, 1b-2 |
| 1b-4 | Tool `walkthrough-tools.ts`, đăng ký ở `course-tools.ts`; sửa `generation-tools.ts`, `dsl-tools.ts` (khoá + chặn) | phụ thuộc 1b-3 |
| 1b-5 | Chặn hiển thị (`interactive-renderer.tsx`), host + store (bắt tay), classic coerce, outline editor, skill `deep-interactive`, Dockerfile/compose/.env | phụ thuộc 1b-3 |
| 1b-6 | Skill tối thiểu + workbench title + test workbench | 1b-4 |
| 1b-7 | e2e + smoke §8 | phụ thuộc 1b-1…6 |
| 1c-1 | `widget-state` ở host + store + chat store + `state-context` + `read-scene` + `prompt-builder` + test | phụ thuộc 1b |
| 1c-2 | Chế độ dự đoán (runtime `predict.ts` + engine chờ) + e2e; `bs-answer-mini` | phụ thuộc 1b |
| 1c-3 | Bộ lọc `tutor-moderation` + `tutorLearning` + test | phụ thuộc 1b |
| 1c-4 | eval `tutor-qa`, S2b; hội đồng LLM + học sinh mô phỏng + bộ hiệu chuẩn; chạy G1 | phụ thuộc 1c-1…3 |
| 1d-1 | module `entry-<id>` sinh sẵn + `#wt-input` + preset `student`/`llm` + `describe` tính lại + test | sau G1 và cổng ADR 0012 §7 |

Các bước 1a-1…1a-3 và 1b-1 sửa file không giao nhau. Bước 1b-3…1b-5 chạm `lib/widgets` và `lib/server/agent-runtime/*` nên làm tuần tự. `lib/widgets/registry.ts` và `lib/subjects/cp/pack.ts` là điểm chung giữa các agent; để agent điều phối thêm.
