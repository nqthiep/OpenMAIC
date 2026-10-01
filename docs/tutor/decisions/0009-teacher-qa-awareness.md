# ADR 0009: Thầy trả lời khi học sinh đang xem walkthrough — báo trạng thái widget về host

- **Status**: Accepted (quyết định bằng SWOT; sửa 2026-09-30 theo ADR 0013)
- **Date**: 2026-09-29; sửa 2026-09-30
- **Deciders**: User (yêu cầu gốc: "giảng dạy, giải thích, **trả lời**, hướng dẫn") + Architect panel
- **Liên quan**: [0005](0005-widget-hosting-model.md), [0007](0007-manim-and-math-visualization.md), [0008](0008-lesson-blueprint-hard-problems.md), [0013](0013-provider-scene-lifecycle.md), [../INTERFACES §2](../INTERFACES.md), [../SECURITY](../SECURITY.md)

> **Tóm tắt:** thầy phải biết học sinh đang ở bước nào. Bước 0 là **digest** của scene; sau đó iframe báo **`widget-state`** (sau khi đã `widget-ready`). Server chỉ lấy **id và số** từ scene/iframe; **mọi chữ lấy từ catalog** (ADR 0013 §8). Kèm thang gợi ý và hiểu lầm của beat (ADR 0008 Decision 6). Với clip: `clip-sheet` (L0) và `currentTime` (L1).

## Context — hiện tại thầy không thấy walkthrough (đã đọc code)

Học sinh tua tới bước 7 và hỏi "vì sao chọn pivot này?". Thầy thấy gì hôm nay:

- Đường mặc định: `buildStateContext` mô tả slide và quiz; scene `interactive` chỉ có **title/type/id** — không html, `widgetConfig`, hay vị trí phát (`lib/orchestration/summarizers/state-context.ts:159-243`).
- Đường Pi: `read_scene` cố tình bỏ payload interactive (`lib/chat/pi/tools/read-scene.ts:60-63`, trần 24k ký tự).
- `buildCourseContext` chỉ dùng lúc *sinh* nội dung, không vào chat (`prompt-formatters.ts:8`).
- `ROLE_ACTIONS` không có `widget_*` (`lib/orchestration/registry/types.ts:83-87`) → thầy lúc Q&A không nhảy frame được; "thầy điều khiển widget" chỉ đúng với action sinh sẵn lúc soạn bài.
- Tài liệu cũ ghi "không có message chiều iframe→host" — **sai**: đã có `__maicInteractive` (`components/scene-renderers/InteractiveIframeHost.tsx:207-225`; `lib/utils/iframe.ts`), chỉ chưa có kind chứa trạng thái widget.

## SWOT

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| (a) Không báo ngược (chỉ digest tĩnh: title, keyPoints, beats) | Không sửa client. | Mù vị trí; "bước 7" mơ hồ; học sinh tự kéo thanh trượt thì thầy không biết. | Làm được ngay (nhánh digest trong `lib/orchestration/summarizers/state-context.ts`). | Thầy đoán sai frame → dạy sai trong môn chuyên. |
| **(b) `widget-state` iframe → host → store → ngữ cảnh chat (chọn)** | Đúng frame; payload là số nguyên; tái dùng kênh, store, builder có sẵn; server lấy khoá (`walkthroughId`, `entryRev`, `presetId`) và số (`frame`) từ scene/iframe, rồi tra `explanation/codeLine/pointers` **từ catalog**. Không nhận chữ từ iframe hay HTML (tránh prompt-injection qua lớp học import; sửa 2026-09-30). | Sửa ~7 file lõi; mất khi iframe reload hoặc bị đẩy khỏi pool nếu không xoá store. | Mọi provider dùng chung; sau này đo tiến độ học. | Flood (chỉ giữ giá trị cuối); iframe giả mạo (chỉ nhận số nguyên đã kẹp). |
| (c) Nhét toàn bộ frames vào ngữ cảnh | Không sửa client. | Tới 500 frame vượt trần 24k của `read_scene` (`too_large`); tốn token mỗi lượt; vẫn không biết vị trí. | Chỉ hợp với trace ≤30 frame. | Pha loãng ngữ cảnh. |

## Decision

Chọn **(b)**, làm theo hai bước:

**Bước 0 (không phụ thuộc iframe)** — `lib/orchestration/summarizers/state-context.ts`: thêm nhánh `interactive` gọi `provider.describe(scene)` khi `claimsScene(scene)` (ADR 0005, 0013). Thầy thấy *title, beats (id/label), gợi ý và hiểu lầm của beat, bẫy theo ngôn ngữ* **lấy từ catalog** theo `walkthroughId` + `entryRev`. `lib/chat/pi/tools/read-scene.ts:60-63` giữ ranh giới cho widget không có provider.

**Bước 1 (biết frame hiện tại):**
1. Runtime gửi `widget-ready` một lần khi khởi tạo xong (ADR 0013 §2). Sau đó gửi `{ __maicInteractive: true, kind: 'widget-state', v: 1, walkthroughId, preset, frame, input?, prediction? }` mỗi lần đổi frame/preset (INTERFACES §2). `input` chỉ có khi học sinh **nhập input tuỳ chỉnh** (preset `'student'`, lát 1d) và đã qua `inputSpec` (JSON ≤ 2048 byte).
2. `components/scene-renderers/InteractiveIframeHost.tsx:207-225`:
   - Nhận kind mới **chỉ sau `widget-ready`** và chỉ khi `walkthroughId` khớp `widgetConfig`.
   - Ép `frame` là số nguyên trong `[0, total-1]` (`total` lấy từ `widgetConfig.presets`, gồm cả mục `llm` từ 1d); với preset `student` chỉ ép số nguyên ≥ 0, server kẹp sau khi tính lại; giữ `input` chỉ khi ≤ trần kích thước.
   - Ghi vào store mới `lib/store/widget-runtime-state.ts` (theo mẫu `scene-runtime-errors.ts`).
   - Khi `srcDoc` đổi hoặc iframe bị đẩy khỏi pool (`IFRAME_POOL_CAP=3`, `lib/store/interactive-iframe-pool.ts:21`): xoá trạng thái học sinh, nhưng giữ `desired` để gửi lại khi iframe ready.
3. `components/chat/use-chat-sessions.ts:183-208` (`buildFreshAgentLoopStoreState`, dựng mới mỗi lượt): thêm `widgetState` chỉ cho scene hiện tại (như `quizResults`); thêm kiểu ở `agent-loop.ts:23-45` và `lib/types/chat.ts:322-352`.
4. `lib/orchestration/summarizers/state-context.ts`: `describe(scene, {preset, frame, input?})` — **server tính lại từ catalog**:
   - Kiểm: `preset` phải ∈ `presets[].id` hoặc là `llm`/`student`; `entryRev` phải khớp. Lệch thì chỉ trả digest tĩnh (ADR 0013 §6).
   - Lấy `explanation`, `codeLine`, `pointers`, `vars`, dòng pseudo/C++/Python và gợi ý/hiểu lầm của beat gần nhất tại frame `k`.
   - Với `preset:'student'` (lát 1d): **kiểm lại `input` bằng `parseInput(entry.inputSpec, input)`** rồi `steps(input, {locale})` (hàm thuần, có trần).
   - Không dùng chữ do iframe gửi, và **không dùng chữ nằm trong HTML/`walkthrough-data`/`widgetConfig`** của scene.
5. `lib/chat/pi/tools/read-scene.ts`: scope `widgetState` theo `sceneId`.

**Tuỳ chọn về sau:** cho thầy Q&A nhảy frame: thêm `widget_setState` vào `ROLE_ACTIONS` (`registry/types.ts:83`), `getActionDescriptions` (`tool-schemas.ts:31`), và callback widget của `ActionEngine` chat (`components/chat/use-chat-sessions.ts:1019`, đối chiếu `PlaybackChromeRoot.tsx:752`). Chưa bắt buộc cho Phase 1.

**Q&A cho clip Manim (ADR 0007, Toán):** `play_video` chỉ có `elementId` và học sinh tự tua bằng `<video controls>`; engine không biết học sinh dừng ở đâu. L0 (làm được ngay): mỗi clip có `clip-sheet` (chapter, cái đang hiện, công thức, hiểu lầm hay gặp, gợi ý theo bậc) đưa vào digest của thầy (bước 0) và được tra qua `PPTBaseElement.name` (`clip:<id>@<hash>`) trong `state-context.ts` (nhánh `case 'video'`, hiện chỉ in `video at (x,y)`); thầy hỏi "em đang ở đoạn nào?" (nút chapter) rồi vẽ lại khung `poster` bằng `wb_draw_latex/shape`. L1 (sau): host đọc `currentTime` của thẻ `<video>` → chapter, lưu store như `widget-state`.

Lời thầy khi Q&A bị giới hạn khoảng 100 ký tự (`lib/orchestration/prompt-builder.ts:186`); action không tính vào giới hạn (`:182`). **Sửa 2026-09-30** (ADR 0008 Decision 6): khi scene hiện tại là walkthrough, `buildLengthGuidelines` dùng ngân sách "tutor" khoảng 300 ký tự, và quy tắc "gợi ý trước" nằm trong `SKILL.md`. Spike S2b (skill có tới chat agent không) chạy ở lát 1c.

## Consequences

**Positive:** thoả yêu cầu "trả lời, hướng dẫn": thầy biết học sinh đang ở bước nào và lời đáp bám dữ kiện đã kiểm chứng.

**Negative:** thay đổi ~8 file ở tầng app (không phải package): host, store, chat store, kiểu, `state-context`, `read-scene`, `prompt-builder`. Cần test kẹp số nguyên, bắt tay, xoá store. `widget_setState` trong Q&A để sau.

**Test/Eval:** `tests/widgets/describe.test.ts`; `eval:tutor-qa` (ADR 0008).
