# ADR 0010: Không có code editor cho học sinh — mặc định chặn (fail-closed), chặn nhiều lớp: hiển thị, ghi, sinh

- **Status**: Accepted (viết lại lần 2 ngày 2026-09-30 sau review: đảo mặc định, thêm chặn lúc hiển thị và lúc ghi; quyết định bằng SWOT)
- **Date**: 2026-09-29; viết lại 2026-09-30 (hai lần)
- **Deciders**: User ("không có chức năng code editor để học sinh viết code và run", "trên toàn bộ ứng dụng") + Architect panel (review 2026-09-30: phát hiện F1, F2, F6, A6)
- **Liên quan**: [0003](0003-no-code-execution.md), [0011](0011-entry-point-workbench-tool.md), [../SECURITY §3](../SECURITY.md), [../OPERATIONS §2](../OPERATIONS.md)

> **Tóm tắt:** widget `code` bị chặn **toàn ứng dụng**, **mặc định**: không đặt biến gì cũng là chặn; chỉ `OPENMAIC_ALLOW_CODE_WIDGET=true` mới mở. Nhận diện qua **cả hai** trường `widgetType` và `widgetConfig.type`. Lớp chính là **chặn lúc hiển thị** (một điểm dispatch, phủ cả lớp học cũ và bài import). Sau đó là **chặn ghi mới** ở mọi tool agent và route ghi, **chặn lúc sinh** (schema không có `code`, coerce ở classic) và **CSP** cho iframe. Rủi ro dư: một widget "simulation" do LLM sinh vẫn có thể tự dựng ô nhập + `eval`, nên CSP chặn `eval`/WASM và có quy tắc kiểm.

## Bối cảnh — sự thật (đã đọc code)

| Sự thật | Nguồn |
| --- | --- |
| Widget `code` là HTML editor cho học sinh chạy Python (Pyodide), JS, TS (Babel) và chấm bằng test case. | `packages/@openmaic/generation/templates/code-content/system.md` |
| Có **hai** trường chỉ loại widget: `InteractiveContent.widgetType` và `widgetConfig.type` (cả hai là `WidgetType`). Code đọc cả hai, ưu tiên `widgetConfig.type`. | `packages/@openmaic/dsl/src/interactive.ts:38,56,75`; `lib/server/agent-runtime/dsl-tools.ts:211` |
| `code` là một `widgetType` của scene `interactive`, không phải một `SceneType`. | `packages/@openmaic/dsl/src/stage.ts:22`; `packages/@openmaic/dsl/src/interactive.ts:5` |
| Scene interactive được dựng iframe `srcDoc` ở **hai** nơi: `InteractiveRenderer` (sân khấu chính, qua nhánh dispatch) và `ThumbnailInteractive` (thumbnail ở sidebar lúc phát; script vẫn chạy). Ngoài ra gói tài nguyên xuất HTML interactive thành **tệp độc lập**. (Sửa 2026-09-30: bản trước ghi "một nhánh dispatch", sai.) | `components/stage/scene-renderer.tsx:38`; `components/scene-renderers/interactive-renderer.tsx:34-37`; `components/slide-renderer/components/ThumbnailInteractive/index.tsx:49-53,82-88`; `lib/export/use-export-pptx.ts:1263-1276`; `lib/utils/iframe.ts:288` |
| Các đường **ghi** scene có thể mang `code`: `generate_scene` (union có `code`, `generation-tools.ts:48-58`); `patch_stage` (ghi được `widgetType`/HTML tuỳ ý, `dsl-tools.ts:504-509,827`); `duplicate_scene` (`generation-tools.ts:581`); `POST /api/classroom` (đã có `sanitizeSceneContent` nhưng không lọc `code`, `app/api/classroom/route.ts:80-81`); autosave của server persistence (`app/api/persistence/[...path]/route.ts`); import ZIP (chỉ kiểm cấu trúc, `lib/import/use-import-classroom.ts:390`); `PUT /api/stages/[id]` (ghi cả `scenes` từ client, `app/api/stages/[id]/route.ts:118`); route `scene-content` (nhận outline từ client, `app/api/generate/scene-content/route.ts:65-105`). | như cột trái |
| Classic mặc định gán "Programming concepts, algorithms" → `code`; `inferWidgetType` cũng ra `code`. | `packages/@openmaic/generation/templates/requirements-to-outlines/system.md:163`; `packages/@openmaic/generation/src/scene-generator.ts:178` |
| Skill có sẵn `deep-interactive` và `workshop-style` **hướng dẫn** dùng `code` ("code they run"), và `allowedWidgetTypes` của chúng có `code`; tài liệu `stage-dsl` có mục `code`. | `skills/agent-runtime/deep-interactive/SKILL.md:4,30,42`; `skills/agent-runtime/workshop-style/SKILL.md:54`; `skills/agent-runtime/stage-dsl/references/widget.md:122` |
| Outline editor cho chọn loại widget, gồm `code`. | `components/generation/outlines-editor.tsx:1136-1176` |
| Ràng buộc skill chỉ cảnh báo sau khi ghi. Skill do user tạo luôn có `constraints: null`. | `lib/server/agent-runtime/generation-tools.ts:458-461`; `lib/server/agent-runtime/skills.ts:227,879-890` |
| CSP của app chỉ có `frame-ancestors`. Iframe widget không có CSP và được tải script từ CDN (KaTeX từ jsdelivr, three từ unpkg). | `next.config.ts:62-66`; `packages/@openmaic/generation/src/interactive-post-processor.ts:72-74`; `packages/@openmaic/generation/templates/visualization3d-content/system.md:358` |

## Phương án và SWOT

**1. Mặc định của cờ:**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Mặc định mở, cờ `OPENMAIC_BLOCK_CODE_WIDGET=true` để chặn (bản trước) | Giữ hành vi upstream khi không đặt gì. | Chạy `pnpm start`, `docker run` hay Vercel mà quên đặt cờ thì **không chặn** (fail-open). | — | Yêu cầu "toàn ứng dụng" hỏng lặng lẽ. |
| **Mặc định chặn; `OPENMAIC_ALLOW_CODE_WIDGET=true` để mở (chọn)** | Đúng yêu cầu ở mọi cách chạy; không phải nhớ đặt cờ. | Lệch hành vi upstream (repo là fork riêng — RISKS giả định GĐ1). | Upstream muốn giữ hành vi cũ thì đặt một biến. | Ai đó đặt nhầm `ALLOW=true` → smoke test kiểm lại (OPERATIONS §9). |

**2. Nơi chặn:**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| (a) Chỉ chỉ dẫn trong `SKILL.md` | Không sửa code. | LLM bỏ qua được; classic không có skill. | — | Vẫn sinh `code`. |
| (b) Guard ở từng điểm **sinh** (bản trước: `generate_scene`, `patch_stage`, classic, outline editor) | Lỗi sớm, có hướng dẫn cho agent. | Bỏ sót `duplicate_scene`, `/api/classroom`, autosave, import, `scene-content`; chỉ kiểm `widgetType`. | — | Mỗi đường ghi mới là một lỗ mới. |
| (c) Chỉ chặn lúc hiển thị | **Một** điểm phủ mọi nguồn (sinh mới, cũ, import). | Agent vẫn tạo ra scene vô dụng; không có lỗi hướng dẫn. | — | Dữ liệu `code` nằm trong kho. |
| **(d) Nhiều lớp: hiển thị (chính) + ghi mới + sinh + CSP (chọn)** | Hiển thị bảo đảm học sinh **không bao giờ thấy** editor; ghi/sinh cho lỗi sớm; CSP giảm rủi ro "editor trá hình". | Nhiều chỗ sửa (~10 file, đều ở tầng app); cần test kiểm kê đường ghi. | Test kiểm kê bắt được đường ghi mới trong tương lai. | CSP làm vỡ widget LLM hiện có → spike Q10 đo trước khi bật cho widget LLM. |
| (e) Xoá hẳn `code` khỏi package | Triệt để. | Đổi `@openmaic/dsl` + `generation` (bump/publish), lệch upstream. | — | Không đảo ngược được. |

## Quyết định

Chọn **cờ mặc định chặn** và **(d)**. Phạm vi là **toàn ứng dụng** (user xác nhận 2026-09-30).

1. **Cờ:** `isCodeWidgetAllowed()` trong `lib/config/feature-flags.ts` đọc `OPENMAIC_ALLOW_CODE_WIDGET` theo mẫu `readBoolean`. Không đặt thì trả `false`, tức là **chặn**. Client **hỏi server** (qua route cấu hình dưới `/api/`, như `/api/agent/runtime` ở `app/page.tsx:138-147`); khi chưa có câu trả lời thì coi là chặn. Không có cờ `NEXT_PUBLIC_*` riêng, nên client và server không lệch nhau.
2. **Nhận diện:** `isCodeWidget(content) = content.type==='interactive' && (content.widgetType==='code' || content.widgetConfig?.type==='code')`. Hàm nằm ở `lib/widgets/policy.ts` và mọi lớp dưới đều dùng nó.
3. **L1 — hiển thị (lớp chính):** **mọi** nơi dựng iframe `srcDoc` cho scene interactive kiểm `isCodeWidget` **trước** khi mount: `InteractiveRenderer` (khung thông báo tĩnh) và `ThumbnailInteractive` (ảnh tĩnh). Gói tài nguyên xuất (`use-export-pptx.ts`) bỏ HTML của scene `code`. Lớp này phủ lớp học cũ, bài import, autosave và mọi đường ghi chưa biết. Test kiểm kê liệt kê mọi chỗ có `srcDoc=` để điểm hiển thị mới không lọt.
4. **L2 — ghi mới (server):** hàm `assertScenePolicy(scene)` được gọi:
   - **Tool agent** (`generate_scene`, `patch_stage`, `duplicate_scene`, `generate_walkthrough`): kiểm trên **trạng thái cuối** của scene, theo tiền lệ `dsl-tools.ts:811-836`. Vi phạm thì trả lỗi `code-widget-blocked` có gợi ý.
   - **`POST /api/classroom` và autosave persistence:** **không từ chối**, vì làm vậy sẽ mất dữ liệu của lớp học import. Dữ liệu được giữ nguyên và L1 chặn lúc hiển thị. Ghi log `code-widget-stored`.
5. **L3 — sinh:**
   - Khi bị chặn, schema `generate_scene` được dựng **không có** `code` (union TypeBox động).
   - Classic coerce `code` → `diagram`/`simulation` ở `app/api/generate/scene-outlines-stream/route.ts` (mẫu `sanitizeNonTaskEngineOutline`) **và** ở `app/api/generate/scene-content/route.ts` (vì outline đến từ client). Coerce áp cả cho legacy `interactiveConfig`, và không bao giờ trả `null`.
   - Outline editor ẩn `code`.
6. **L4 — chỉ dẫn:**
   - Sửa `skills/agent-runtime/deep-interactive/SKILL.md` và `workshop-style/SKILL.md`: bỏ `code` khỏi danh sách widget, thay bằng walkthrough/simulation; bỏ `code` khỏi `allowedWidgetTypes` trong `outline-constraints.json` của hai skill; ghi chú mục `code` của `stage-dsl/references/widget.md` là "bị chặn trên triển khai này".
   - `SKILL.md` của các môn nêu rõ: không có bài luyện code.
7. **L5 — CSP cho iframe:**
   - **Walkthrough** (tự chứa hoàn toàn; **builder nhúng sẵn** thẻ `<meta>` CSP vào HTML, `lib/tutor/build/csp.ts`): `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'`.
   - **Widget LLM** (chèn qua `patchHtmlForIframe`, `lib/utils/iframe.ts:288`; hàm này chỉ nhận chuỗi HTML nên không phân biệt walkthrough): CSP không có `'unsafe-eval'`/`'wasm-unsafe-eval'` (chặn Pyodide, Babel runtime, `new Function`); `script-src` theo allowlist CDN đang dùng; `connect-src 'none'`; `form-action 'none'`. [Inference] CSP không chặn được `<script>` inline tự viết một "editor" chạy JS thuần, nên đây vẫn là rủi ro dư. **Chỉ bật cho widget LLM sau spike Q10** (đo số widget mẫu bị vỡ).
8. **Được phép, không bị chặn:**
   - Widget `simulation`, `diagram`, `game`, `visualization3d`; walkthrough; quiz; PBL.
   - Code **chỉ đọc** (phần tử code trên slide, `wb_draw_code`/`wb_edit_code`, tab C++/Python của walkthrough).
   - Học sinh nhập **input** cho visualizer (ADR 0008).
9. **Test:**
   - `tests/widgets/policy.test.ts`: kiểm cả hai trường; mọi tool agent; classic và `scene-content` coerce; khi mở cờ thì không chặn; widget khác không bị chặn.
   - Test render: `InteractiveRenderer` không mount iframe cho `code`.
   - **Test kiểm kê đường ghi** (`tests/widgets/write-paths.test.ts`): grep mọi chỗ gọi `putScene`/`saveDocument` và mọi route ghi scene; đối chiếu với danh sách đã duyệt; đường mới chưa được phân loại thì test đỏ.
   - Smoke sau triển khai: `OPENMAIC_ALLOW_CODE_WIDGET` không được đặt `true` (OPERATIONS §9).

## Hệ quả

**Tốt:**
- "Không code editor trên toàn ứng dụng" đúng ở mọi cách chạy.
- Học sinh không thấy editor kể cả từ bài import.
- Đường ghi mới bị test bắt.
- Không đụng package.

**Xấu:**
- Lệch hành vi upstream (mặc định chặn).
- Khoảng 10 file ở tầng app phải sửa.
- CSP cho widget LLM cần đo trước khi bật (Q10).
- Dữ liệu `code` cũ vẫn nằm trong kho (chỉ bị chặn hiển thị).

**Rủi ro dư:** một widget `simulation` do LLM sinh vẫn có thể tự dựng ô nhập + chạy JS thuần. Cách giảm: CSP (L5); chỉ dẫn skill; e2e mẫu kiểm widget sinh cho chủ đề lập trình không có `textarea` + `eval`/`Function` (heuristic, chỉ cảnh báo). Xem [SECURITY §6](../SECURITY.md).

## Điều kiện đổi (trigger)

- Cần `code` cho một môn/khoá khác → chính sách theo gói môn học (ADR mới); phương án này hiện bị loại vì nguồn policy "khoá nào" không tin cậy (`runner.ts:1184-1202`).
- Spike Q10 cho thấy CSP làm vỡ > 10% widget LLM mẫu → chỉ áp CSP cho walkthrough, và giữ heuristic cảnh báo cho widget LLM.
