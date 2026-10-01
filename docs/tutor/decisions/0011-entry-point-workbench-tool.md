# ADR 0011: Điểm vào — chỉ đường agent (workbench); walkthrough và clip do tool tất định tạo

- **Status**: Accepted (2026-09-30; điểm vào do user quyết định, cách hiện thực chọn bằng SWOT)
- **Date**: 2026-09-30
- **Deciders**: User ("tính năng chỉ có khi bật workbench") + Architect panel (review 2026-09-30, phát hiện A1, A4, A5)
- **Thay thế một phần**: [0005](0005-widget-hosting-model.md) (hàm bọc `generateSceneContent`, `SceneEnricher`, call site classic), [0007](0007-manim-and-math-visualization.md) (đường chèn clip)
- **Liên quan**: [0006](0006-deterministic-trace-catalog.md), [0010](0010-no-student-code-enforcement.md), [0013](0013-provider-scene-lifecycle.md), [../INTERFACES §3](../INTERFACES.md), [../OPERATIONS §2](../OPERATIONS.md)

> **Tóm tắt:** walkthrough (và clip Manim ở Phase 3) **chỉ có ở đường agent** — cần bật workbench. Agent tạo scene walkthrough bằng một **tool riêng `generate_walkthrough`**: schema liệt kê sẵn `walkthroughId` sinh từ catalog, tool dựng HTML và kịch bản thầy **không gọi LLM**. Clip dùng tool `generate_clip_scenes` theo cùng mẫu. Bỏ hàm bọc ở đường classic và bỏ `SceneEnricher`. Đường classic vẫn chặn widget `code` (ADR 0010).

## Bối cảnh — sự thật ràng buộc (đã đọc code)

| Sự thật | Nguồn |
| --- | --- |
| Workbench cần **ba** điều kiện: `OPENMAIC_AGENT_RUNTIME_ENABLED=true`, `DATABASE_URL` khác rỗng, và cờ build-time `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true`. Thiếu một điều kiện thì `/workbench` trả 404. | `lib/config/feature-flags.ts:18-25,49-51`; `middleware.ts:55-58`; `.env.example:310,347,353` |
| Trang chủ hỏi `/api/agent/runtime` để biết runtime có bật không. | `app/page.tsx:138-147` |
| `Dockerfile` (stage builder) và `docker-compose.yml` (`build.args`) **không** truyền `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED`, nên image dựng bằng compose không bao giờ có workbench. | `Dockerfile:51-72`; `docker-compose.yml:5-22` |
| Tool của agent được đăng ký ở `buildDslCourseToolset` và phải có trong `buildCourseAllowlist`; tool **ghi tài liệu** còn phải có trong `STAGE_WRITER_TOOL_NAMES` để chạy tuần tự và được workbench cấp quyền ghi. Đã có tiền lệ đăng ký có điều kiện: `generate_video`. | `lib/server/agent-runtime/course-tools.ts:204-237`; `lib/agent-runtime/stage-writer-tools.ts:20` |
| `generate_scene` gọi LLM sinh nội dung (`:387`), rồi gọi LLM sinh action (`:445`), rồi mới dựng `Scene` (`:450`). | `lib/server/agent-runtime/generation-tools.ts` |
| `generate_actions` dựng lại outline từ scene. Outline này không có `walkthroughId` vì `generate_scene` không lưu outline. | `lib/server/agent-runtime/generation-tools.ts:130-143,513-537` |
| `duplicate_scene` chép một trang sang vị trí mới, không kèm action. | `lib/server/agent-runtime/generation-tools.ts:581-600` |
| `generate_video` trả tham chiếu ngay, video dựng nền. Tool đó "never edits a page itself"; agent phải tự vá `mediaRef` bằng `patch_stage`. | `lib/server/agent-runtime/generate-video.ts:480-483` |
| Đường classic (`scene-outlines-stream` → `scene-content`) không nhận skill. Route `scene-content` nhận outline do client gửi lên. | `app/api/generate/scene-content/route.ts:65-105` |

## Phương án và SWOT

**Điểm vào** do user chốt (2026-09-30): chỉ khi bật workbench. Phương án (C) "chạy cả đường classic bằng bộ gán `walkthroughId` tất định" bị loại theo quyết định đó. Còn lại là chọn cách hiện thực trong đường agent:

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| (A) Bọc `generate_scene`: `widgetOutline.walkthroughId` + hàm bọc `generateSceneContentWithWidgets` (bản cũ) | Không thêm tool; agent quen `generate_scene`. | Nạp nghĩa mới vào `widgetOutline: Unknown`, nên LLM không thấy id hợp lệ trong schema; phải bọc 3–4 call site (gồm classic, dù classic không bao giờ sinh walkthrough); action LLM vẫn chạy trước khi provider kịp thay; `generate_actions` mất `walkthroughId`. | — | Lời thầy do LLM lẫn với kịch bản; call site mới quên bọc. |
| **(B) Tool riêng `generate_walkthrough` (chọn)** | Schema là union literal id **sinh từ catalog**, nên LLM thấy ngay lựa chọn hợp lệ; tool tự dựng scene, kịch bản thầy tất định, **0 lời gọi LLM**; idempotent theo `callId` như `duplicate_scene`; đúng tiền lệ đăng ký tool (`generate_video`); không đụng classic. | Thêm một tool vào allowlist; schema dài dần theo catalog; `SKILL.md` phải dạy agent dùng tool này. | Mẫu dùng lại cho clip (`generate_clip_scenes`) và môn khác. | Agent vẫn gọi `generate_scene` với "simulation" để tự mô phỏng thay vì walkthrough → trả lỗi `use-generate-walkthrough` khi thấy `walkthroughId`. |
| (C) Cả đường classic (gán `walkthroughId` tại `scene-outlines-stream/route.ts:589`) | Triển khai mặc định cũng có walkthrough. | Classic không có skill/blueprint; gán theo từ khoá dễ sai; thêm một đường cần bảo trì. | — | **Trái quyết định của user**. |

**Clip Manim (Phase 3)** — chọn cách chèn clip vào slide:

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| (i) `SceneEnricher` chèn video sau khi sinh nội dung (bản cũ, ADR 0005) | Một slide do LLM dàn trang có thêm clip. | Không khớp pipeline: action sinh **trước** khi có `Scene` (`generation-tools.ts:445,450`); N phần tử video (mỗi chapter một phần tử) chồng lên bố cục LLM. | — | Phải viết lại hợp đồng ở 3A. |
| (ii) Tool trả `src`, agent tự `patch_stage add_element` (tiền lệ `generate_video`) | Không có hợp đồng mới. | Agent dàn trang video; lời thầy cho chapter vẫn do LLM. | — | Bố cục và thứ tự chapter phụ thuộc LLM. |
| **(iii) Tool tất định `generate_clip_scenes` (chọn)** | **Mỗi chapter một slide** với bố cục cố định (tiêu đề, video, chú thích); kịch bản `speech → play_video → speech` lấy từ `ClipEntry`; cùng mẫu với (B). | Tool phải dựng slide hợp lệ theo DSL (spike Q11). | Render theo yêu cầu (3C) chỉ thêm nhánh bất đồng bộ như `generate_video`. | Slide dựng tay trông khác slide LLM (chấp nhận: đồng nhất trong một bài). |

## Quyết định

1. **Điểm vào: chỉ đường agent** khi bật workbench. Đường classic **không** sinh walkthrough hay clip. Nó vẫn chịu ADR 0010: coerce `code`, chặn lúc hiển thị.
2. **Tool `generate_walkthrough`** ở `lib/server/agent-runtime/walkthrough-tools.ts`, đăng ký trong `buildDslCourseToolset` + `buildCourseAllowlist` (`lib/server/agent-runtime/course-tools.ts:204-237`) và `STAGE_WRITER_TOOL_NAMES` (`lib/agent-runtime/stage-writer-tools.ts:20`). Hợp đồng ở [INTERFACES §3](../INTERFACES.md). Tool làm các bước:
   1. Kiểm `walkthroughId` + `presetId`. Từ lát 1d mới nhận thêm `input`.
   2. `provider.build()` dựng `InteractiveContent` và `actions` kịch bản.
   3. Chạy guard ở ADR 0010 và ADR 0013.
   4. Ghi scene bằng đường ghi hiện có (`putSceneBringingCurrent`, `document-writes.ts:32`).
   5. Trả `{sceneId, beats, lessonKit}`. `lessonKit` gồm đề, giới hạn, subtask, bẫy, gợi ý do tác giả viết, để agent soạn các slide quanh walkthrough cho khớp (ADR 0012).
3. **`generate_scene` gặp `widgetOutline.walkthroughId`** thì trả lỗi `use-generate-walkthrough` (kèm `validIds`), không tự sinh.
4. **Scene walkthrough đã có:**
   - `generate_actions` lấy action từ `provider.actions(scene)` (nhận diện theo `widgetConfig.kind`), không gọi LLM.
   - `duplicate_scene` chép nguyên nội dung, rồi sinh lại action bằng provider.
   - `patch_stage` bị khoá ở `/content/html` và `/content/widgetConfig` (ADR 0013).
5. **Clip (Phase 3):** tool `generate_clip_scenes`, cùng mẫu. 3A chỉ nhận `presetId` (clip dựng sẵn). 3C thêm `params` và nhánh bất đồng bộ (placeholder, `media_ready`). **Bỏ `SceneEnricher`** khỏi hợp đồng.
6. **Điều kiện triển khai:**
   - Bật đủ ba điều kiện của workbench ở bảng Bối cảnh.
   - Thêm `ARG`/`ENV NEXT_PUBLIC_PRO_WORKBENCH_ENABLED` vào stage builder của `Dockerfile`, và thêm dòng tương ứng vào `build.args` của compose.
   - Vì runtime cần `DATABASE_URL`, triển khai này **luôn có server persistence** (Postgres + kho asset), nên sao lưu là bắt buộc ([OPERATIONS §5](../OPERATIONS.md)).

**Không thuộc quyết định này:** nội dung catalog (ADR 0006), cách dạy (ADR 0008, 0012), chặn `code` (ADR 0010).

## Hệ quả

**Tốt:**
- Không còn hàm bọc ở call site classic (`classroom-generation.ts:596`, `scene-content/route.ts:324`).
- Lời thầy trong walkthrough luôn là kịch bản, không lẫn với action của LLM.
- LLM thấy id hợp lệ ngay trong schema.
- Q&A và `generate_actions` luôn biết `walkthroughId`, vì nó nằm trong `widgetConfig` (ADR 0013).

**Xấu:**
- Triển khai mặc định (không workbench) không có walkthrough.
- Người vận hành phải bật persistence và runtime agent.
- Thêm một tool (Phase 3 thêm một nữa).

**Việc theo sau:**
- Sửa ADR 0005 (bỏ hàm bọc và `SceneEnricher`), ADR 0007 (đường chèn clip), INTERFACES §3, Phase 1 §2, OPERATIONS §2.
- Spike Q11: tool tự dựng slide video hợp lệ theo `validateScene`.

## Điều kiện đổi (trigger)

- Có yêu cầu dùng tính năng trên triển khai **không** bật workbench → ADR mới, xét lại phương án (C).
- Catalog vượt ~60 id (schema tool dài, tốn token mỗi lượt [Inference]) → đổi `walkthroughId` thành `string` kèm `validIds` trong lỗi, và khối id vẫn nằm ở `SKILL.md`.
