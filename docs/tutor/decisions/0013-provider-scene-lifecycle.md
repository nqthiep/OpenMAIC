# ADR 0013: Vòng đời scene do provider sở hữu — bắt tay `widget-ready`, beat theo từng preset, phiên bản entry, khoá sửa, một nguồn chữ cho Q&A

- **Status**: Accepted (2026-09-30; quyết định bằng SWOT sau review thiết kế chi tiết)
- **Date**: 2026-09-30
- **Deciders**: Architect panel (review 2026-09-30, phát hiện B1, B2, M1–M8, A2, A3, A8, A9, m4, m6)
- **Liên quan**: [0001](0001-step-engine-immutable.md), [0005](0005-widget-hosting-model.md), [0006](0006-deterministic-trace-catalog.md), [0009](0009-teacher-qa-awareness.md), [0011](0011-entry-point-workbench-tool.md), [../INTERFACES](../INTERFACES.md), [../DATA-MODEL](../DATA-MODEL.md)

> **Tóm tắt:** scene walkthrough là **scene do provider sở hữu**: sinh, sửa, nhân bản và hỏi đáp đều đi qua provider (nhận diện theo `widgetConfig.kind`).
> - Iframe báo `widget-ready`; host giữ **trạng thái mong muốn cuối** của mỗi scene và gửi lại khi iframe sẵn sàng.
> - Beat tính **theo từng preset**.
> - `widgetConfig` mang `entryRev`, `presetId`, `locale`, `panel` và tổng frame mỗi preset.
> - `patch_stage` không sửa được HTML của walkthrough.
> - Q&A **chỉ lấy id và số** từ scene/iframe; mọi chữ lấy từ catalog.

## Bối cảnh — sự thật ràng buộc (đã đọc code)

| Sự thật | Nguồn |
| --- | --- |
| Host gửi vào iframe kiểu "gửi rồi quên": `postMessage` thẳng vào `contentWindow`, không có ack hay `ready`. | `components/scene-renderers/InteractiveIframeHost.tsx:175-181` |
| Chiều ngược lại đã phải có bộ đệm phát lại cho lỗi đồng bộ lúc `srcDoc` parse (`__maicErrorReplayRequest`). Đây là tiền lệ cho bắt tay. | `lib/utils/iframe.ts:45-80` |
| Pool chỉ giữ 3 iframe; iframe bị đẩy ra thì dựng lại từ đầu. | `lib/store/interactive-iframe-pool.ts:21` |
| `executeWidgetSetState` gửi rồi chờ cố định `WIDGET_MS`. | `lib/action/engine.ts:881-886` |
| `widget_setState`, `widget_highlight`, `widget_annotation`, `widget_reveal` là action "không an toàn" khi resume/nhảy; resume với loại này quay về action 0. Chế độ silent bỏ qua `widget_*`. | `lib/playback/action-navigation.ts:16-23`; `lib/playback/action-resume.ts:101-111`; `lib/action/engine.ts:222-224` |
| `patch_stage` ghi được `/content/html` và `widgetConfig`. Nó có sẵn tiền lệ kiểm **trạng thái cuối** của scene trước khi ghi. | `lib/server/agent-runtime/dsl-tools.ts:504-509,815-836` |
| `WidgetConfigBase` là túi mở có `type: WidgetType`. `scene-builder` chép nguyên `widgetConfig`. | `packages/@openmaic/dsl/src/interactive.ts:37-40`; `packages/@openmaic/generation/src/scene-builder.ts:92-93` |
| Chat gửi `storeState.scenes` (kể cả HTML) từ client lên mỗi lượt. Chữ trong scene là **dữ liệu do client cấp**. | `lib/types/chat.ts:318-330`; `components/chat/use-chat-sessions.ts:183-208` |
| Tiền lệ registry trong repo ghi đè kèm cảnh báo khi trùng khoá. | `lib/edit/scene-editor-registry.ts:7-19` |

## Phương án và SWOT

**1. Đồng bộ host → iframe:**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Không bắt tay (bản cũ; chờ spike Q6) | Không sửa host. | Lệnh đầu có thể mất khi `srcDoc` chưa chạy [Inference]; iframe bị đẩy khỏi pool quay về frame 0 trong khi lời thầy ở beat k. | — | Lời thầy lệch hình. |
| Ack từng message | Chắc chắn từng lệnh. | Phức tạp; engine phải chờ ack (sửa `lib/action`). | — | Treo khi iframe chết. |
| **`widget-ready` + host gửi lại trạng thái mong muốn cuối (chọn)** | Trạng thái walkthrough là **tuyệt đối** (`{preset, frame}`), nên chỉ cần gửi lại bản cuối; giống cơ chế replay đã có; hồi phục được cả khi bị đẩy khỏi pool. | Sửa `InteractiveIframeHost` + store. | Dùng được cho resume: gửi lại `setState` cuối khi phát tiếp. | Iframe giả mạo gửi `ready` → chỉ chấp nhận khi `e.source` đúng và `walkthroughId` khớp `widgetConfig`. |

**2. Beat:**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Beat khai báo cho cả entry, mỗi preset một frame/beat (bản cũ) | Đơn giản. | Preset `mid-hit` không bao giờ có `go-left`; beat trong vòng lặp xuất hiện nhiều lần; `beatFrames[id]` có thể thiếu. | — | Kịch bản không định nghĩa được. |
| **`beatDefs` ở entry + `sets[p].beats` có thứ tự, cho phép lặp (chọn)** | Kịch bản đi đúng các beat thật sự xảy ra ở preset đó; lời thầy có tham số từ `vars` của frame ("mid = 4"). | Test phải kiểm từng preset. | Gắn gợi ý/hiểu lầm theo beat (ADR 0008). | Quá nhiều beat ở preset dài → trần số beat được kể ≤ 12 [Inference]. |

**3. Phiên bản và sửa scene:**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Không phiên bản; cho `patch_stage` sửa HTML (bản cũ) | Linh hoạt. | Q&A tính lại từ catalog **hiện tại** trong khi HTML mang frame cũ → thầy mô tả sai frame mà không ai biết. | — | Dạy sai trong môn chuyên. |
| **`entryRev` + `framesHash`; khoá HTML/`widgetConfig` với `patch_stage` (chọn)** | Phát hiện lệch catalog; khi lệch thì `describe()` chỉ trả digest tĩnh. Muốn đổi nội dung thì sinh lại bằng `generate_walkthrough`. | Agent không "sửa nhẹ" được walkthrough. | Snapshot test buộc tăng `entryRev` khi frame đổi. | Tác giả quên tăng `entryRev` → test snapshot `framesHash` đỏ. |

## Quyết định

1. **Nhận diện theo nội dung:**
   - Provider nhận scene bằng `claimsScene(scene)` khi `content.widgetConfig.kind === 'walkthrough'`, không dựa vào outline.
   - Registry assert rằng: mỗi scene **đúng một** provider nhận; `walkthroughId` **duy nhất trên mọi gói môn**; lúc khởi động có trùng thì ném lỗi (khác tiền lệ ghi đè kèm cảnh báo). Có test.
2. **Bắt tay:**
   - Runtime gửi `widget-ready {v, walkthroughId, entryRev, presets:[{id,total}]}` khi khởi tạo xong.
   - **Chỉ áp cho scene walkthrough** (`widgetConfig.kind === 'walkthrough'`); widget khác gửi ngay như hiện tại, vì chúng không bao giờ báo `ready`.
   - Host giữ `desired[sceneId]` là `SET_WIDGET_STATE` cuối cùng. Nếu iframe chưa ready thì giữ lại; khi nhận `ready` thì gửi lại.
   - Host **chỉ ghi `widget-state` sau `ready`**.
   - Runtime tự khởi tạo ở `widgetConfig.presetId` + frame 0 nếu chưa nhận lệnh nào.
   - Hiện thực ở `InteractiveIframeHost.tsx` và `lib/store/widget-runtime-state.ts` (tầng app). Spike Q6 đóng bằng thiết kế này; e2e kiểm chứng.
3. **Resume/nhảy:**
   - **Pha 1b** chấp nhận hành vi hiện có: resume scene walkthrough bắt đầu lại từ action 0 (`action-resume.ts:101-111`).
   - **1c:** khi phát tiếp, host gửi lại `desired[sceneId]`. Xét thêm việc coi `widget_setState` tuyệt đối là "dựng lại được", là một sửa đổi trong `lib/playback` (tầng app, backlog Q13).
4. **Beat theo từng preset:**
   - Entry khai báo `beatDefs[]` gồm `{id, label, narration, ask?, hints?, misconceptions?, required?}`.
   - `narration` là `MessageTemplate` có tham số `{var}` lấy từ `frame.meta.vars`.
   - Lúc dựng, mỗi preset có `sets[p].beats = [{id, occurrence, frame}]` theo thứ tự xuất hiện của tag `beat:<id>`.
   - `actions()` duyệt `sets[presetId].beats`, nhưng chỉ kể tối đa 12 beat mỗi scene [Inference]; các beat còn lại vẫn tua tới được.
   - Test: mọi preset có beat `required`; mọi `beatDef` được dùng ở ≥1 preset.
5. **`widgetConfig` bắt buộc có:** `type:'simulation'`, `kind:'walkthrough'`, `walkthroughId`, `entryRev`, `contentHash`, `subject`, `visualizer`, `locale`, `presetId`, `panel`, `presets:[{id,label,total,framesHash}]`, `beats` (của `presetId`), `runtimeVersion`. Từ 1d: `llmInput?`, và nếu có thì `presets[]` có thêm mục `llm`. Hình dạng ở [DATA-MODEL §3](../DATA-MODEL.md).
6. **Phiên bản entry:**
   - `entryRev` là số nguyên, tăng khi frame, lời thầy, preset, code hoặc `problem` đổi.
   - Test snapshot giữ `framesHash` của mọi preset **và** `contentHash` (băm `code`, `beatDefs`, `presets[].input`, `problem`) ở `entryRev` hiện tại. Hash nào đổi mà `entryRev` không tăng thì test đỏ. `contentHash` lưu trong `widgetConfig`.
   - **Lệch catalog** (`entryRev`/`framesHash`/`contentHash` khác): `describe()` chỉ trả digest tĩnh; `generate_actions` trả `walkthrough-stale` và không ghi; `duplicate_scene` chép cả `actions` cũ.
   - `describe()`: nếu `scene.entryRev ≠ entry.entryRev` hoặc `framesHash` lệch, chỉ trả digest tĩnh (title, beats), không mô tả frame.
7. **Khoá sửa:**
   - `patch_stage` từ chối batch làm đổi `/content/html` hoặc `/content/widgetConfig` (so sánh deep-equal) khi scene là walkthrough **ở trạng thái trước hoặc sau** (`walkthrough-locked`, gợi ý `generate_walkthrough`). Như vậy không "biến" một scene thường thành walkthrough bằng tay được. Kiểm trên **trạng thái cuối**, theo tiền lệ `dsl-tools.ts:811-836`.
   - Sửa `actions` vẫn được phép.
   - `generate_actions` và `duplicate_scene` đi qua provider (ADR 0011).
8. **Một nguồn chữ cho Q&A:**
   - Từ scene và iframe **chỉ lấy khoá và số**: `walkthroughId`, `entryRev`, `presetId`, `frame` (kẹp), `input` (1d, kiểm lại bằng `parseInput`).
   - **Mọi chữ** (explanation, pseudocode, C++/Python, gợi ý) lấy từ catalog phía server.
   - Không dùng chữ trong HTML, `walkthrough-data` hay `widgetConfig`. Các câu trái quy tắc này ở tài liệu cũ đã được sửa.
9. **Id input tuỳ chỉnh (1d):** tách hai loại, `'custom'` bị bỏ.
   - `sets.llm` là input do LLM cấp khi sinh bài; được lưu và được kể chuyện.
   - `'student'` là input học sinh nhập lúc học; chỉ ở runtime, không lưu, không có kịch bản.
10. **Ngữ nghĩa `SET_WIDGET_STATE`:**
    - Áp theo thứ tự `preset → frame → panel → speed → playing`.
    - `preset` lạ thì **bỏ cả message**.
    - `frame` kẹp theo tổng frame của bộ mới.
    - `playing:true` là idempotent: đang phát thì không làm gì; ở frame cuối thì đứng yên, chỉ quay về 0 khi có `restart:true`.

## Hệ quả

**Tốt:**
- Lời thầy khớp hình kể cả khi iframe tải chậm hoặc bị đẩy khỏi pool.
- Kịch bản đúng theo từng preset.
- Q&A không bị tiêm chữ từ lớp học import.
- Sửa catalog không làm thầy mô tả sai scene cũ.

**Xấu:**
- Sửa host (`InteractiveIframeHost`, store) và `patch_stage`.
- Agent không sửa nhẹ HTML walkthrough được.
- Tác giả phải quản `entryRev`.

**Việc theo sau:**
- Cập nhật INTERFACES §1–2, §5; DATA-MODEL §3, §7; ADR 0005, 0006, 0009; Phase 1 §2, §5, §8; TEST-STRATEGY.

## Điều kiện đổi (trigger)

- e2e cho thấy vẫn mất lệnh sau khi có `ready` → chuyển sang ack từng message.
- Tác giả cần sửa nhỏ walkthrough trong lớp đã sinh (ví dụ đổi chú thích) → mở khoá có chọn lọc cho `/content/widgetConfig/panel`, qua ADR mới.
