# Bảng thuật ngữ

- **Trạng thái**: Accepted (sửa 2026-09-30 theo ADR 0010–0013)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [README](README.md), [ARCHITECTURE](ARCHITECTURE.md), [INTERFACES](INTERFACES.md)

> **Tóm tắt:** thuật ngữ dùng thống nhất trong bộ tài liệu `docs/tutor/`, sắp theo chữ cái, mỗi từ một dòng kèm nơi định nghĩa chính thức. Cuối file có mục "từ dễ nhầm".

## 1. Thuật ngữ

| Thuật ngữ | Nghĩa | Định nghĩa chính thức |
| --- | --- | --- |
| **ADR** | Architecture Decision Record: một quyết định kiến trúc, có bối cảnh, phương án, SWOT, hệ quả, điều kiện đổi. | [decisions/README](decisions/README.md) |
| **adopt** (vào asset pool) | Nhập một clip/asset thành blob trong kho asset cục bộ khi dùng lần đầu để export/import/MP4 hoạt động. | [ADR 0007](decisions/0007-manim-and-math-visualization.md), [DATA-MODEL](DATA-MODEL.md) |
| **asset pool** | Kho asset cục bộ của trình duyệt (IndexedDB `maic-asset-pool`), thuê URL `blob:` cho slide. | [DATA-MODEL](DATA-MODEL.md) |
| **aux** | Danh sách có nhãn hiển thị cấu trúc phụ của giải thuật (heap, stack, queue…) trong một frame. | [ADR 0001](decisions/0001-step-engine-immutable.md) |
| **bài giải đề** (problem lesson) | Bài dạy cách giải **một đề** khó: đọc giới hạn → thang subtask → vét cạn → quan sát → lời giải → bẫy. Dữ liệu ở `ProblemSpec` + `lessonKit`. | [ADR 0012](decisions/0012-audience-scope-pedagogy-gates.md), [CONTENT-DESIGN §3.2](CONTENT-DESIGN.md) |
| **bắt tay** (`widget-ready`) | Iframe báo đã sẵn sàng; host gửi lại trạng thái mong muốn cuối (`desired`). | [ADR 0013](decisions/0013-provider-scene-lifecycle.md), [INTERFACES §2](INTERFACES.md) |
| **beat** / **beatDef** | `beatDef`: định nghĩa mốc dạy ở entry (nhãn, lời thầy, câu hỏi, gợi ý, hiểu lầm). `beat`: lần xuất hiện thật của mốc đó trong frame của **một preset** (`sets[p].beats`, có `occurrence`). | [ADR 0013](decisions/0013-provider-scene-lifecycle.md) |
| **catalog** | Danh sách các entry (walkthrough hoặc clip) do ta viết và kiểm thử; LLM chỉ chọn trong đó. | [ADR 0006](decisions/0006-deterministic-trace-catalog.md) |
| **chapter** | Đoạn của một clip Manim (8–25 s), mỗi chapter là một file video riêng. | [Phase 3 §5](phase-3-olympiad-math/SCHEMA.md) |
| **clip** | Video Manim câm, dựng từ mẫu tham số hoá; nhúng vào slide. | [ADR 0007](decisions/0007-manim-and-math-visualization.md) |
| **clip-sheet** | Tệp mô tả clip cho thầy Q&A: chapter, cái đang hiện, công thức, hiểu lầm hay gặp, gợi ý. | [ADR 0009](decisions/0009-teacher-qa-awareness.md) |
| **`code` widget** | Widget OpenMAIC có sẵn cho học sinh viết và chạy code; nhận diện qua `widgetType` **hoặc** `widgetConfig.type`. **Mặc định bị chặn**; chỉ mở khi `OPENMAIC_ALLOW_CODE_WIDGET=true`. | [ADR 0010](decisions/0010-no-student-code-enforcement.md) |
| **cổng G1 / G2** | Cổng sư phạm: hội đồng LLM ký rubric + học sinh mô phỏng (trước/sau) + bộ hiệu chuẩn. G1 sau lát 1c; G2 cuối đợt 2A. | [ADR 0012](decisions/0012-audience-scope-pedagogy-gates.md), [ADR 0014](decisions/0014-llm-roles-and-learner-data.md) |
| **bộ hiệu chuẩn** (calibration set) | Tập mẫu có đáp án biết trước (lỗi cài sẵn, nội dung độc hại/lành tính, brief Manim) để đo năng lực một vai trò LLM. | [ADR 0014](decisions/0014-llm-roles-and-learner-data.md) |
| **bộ lọc nội dung** (`tutor-moderation`) | LLM riêng lọc tin nhắn vào và câu trả lời ra; lỗi hoặc quá hạn thì chặn. | [INTERFACES §8](INTERFACES.md) |
| **hội đồng LLM** | Hai (khi bất đồng: ba) LLM khác nhà cung cấp đóng vai giáo viên chuyên Tin/Toán để duyệt nội dung. | [ADR 0014](decisions/0014-llm-roles-and-learner-data.md) |
| **học sinh mô phỏng** (`sim-learner`) | Persona LLM làm bài trước/sau để đo bài giảng khi chưa có học sinh thật. | [ADR 0014](decisions/0014-llm-roles-and-learner-data.md) |
| **LLM tác giả Manim** (`manim-author`) | LLM viết mẫu Manim offline trong CI, qua allowlist + sandbox + hội đồng. | [ADR 0014](decisions/0014-llm-roles-and-learner-data.md) |
| **`tutorLearning`** | Kind dữ liệu học sinh trong kho runtime: beat, dự đoán, gợi ý, đánh giá, nhãn lọc. | [INTERFACES §8.3](INTERFACES.md) |
| **curriculum-map** | Dữ liệu 4 tier × topic (id, độ khó, prerequisite, bẫy, ý tưởng tương tác…). | [DATA-MODEL §5](DATA-MODEL.md) |
| **customInput** | Cờ của entry cho phép học sinh nhập input của mình trong giới hạn `InputSpec`. Làm ở lát 1d. | [ADR 0008](decisions/0008-lesson-blueprint-hard-problems.md) |
| **dự đoán có chờ** (`predict`) | Câu hỏi dự đoán mà engine dừng chờ học sinh trả lời (tối đa 20 s hoặc "Bỏ qua") trước khi tiết lộ. | [ADR 0008](decisions/0008-lesson-blueprint-hard-problems.md) |
| **describe()** | Hook của provider trả mô tả scene cho thầy Q&A; **mọi chữ lấy từ catalog**, không từ HTML/iframe. | [INTERFACES §5](INTERFACES.md) |
| **entryRev / framesHash** | Phiên bản nội dung của entry và băm frame từng preset; lệch thì Q&A chỉ dùng digest tĩnh. | [ADR 0013](decisions/0013-provider-scene-lifecycle.md) |
| **Element Inventory** | Danh sách id/lớp/nhãn của widget mà stage sinh action đưa cho LLM; bỏ `<script>`/`<style>`. | [ADR 0005](decisions/0005-widget-hosting-model.md) |
| **entry** | Một mục của catalog: `WalkthroughEntry` hoặc `ClipEntry`. | [INTERFACES §5](INTERFACES.md) |
| **frame** | Một trạng thái trực quan bất biến của walkthrough: `{state, meta}`. | [ADR 0001](decisions/0001-step-engine-immutable.md) |
| **fail-closed** | Mặc định an toàn: không đặt cấu hình thì chặn (ví dụ widget `code`). | [ADR 0010](decisions/0010-no-student-code-enforcement.md) |
| **generate_walkthrough / generate_clip_scenes** | Tool agent tất định (không gọi LLM) tạo scene walkthrough / slide clip từ catalog. | [ADR 0011](decisions/0011-entry-point-workbench-tool.md), [INTERFACES §3](INTERFACES.md) |
| **guard / lớp chặn L1–L5** | Kiểm tra cứng chặn widget `code`: L1 hiển thị, L2 ghi mới, L3 sinh, L4 chỉ dẫn skill, L5 CSP. | [ADR 0010](decisions/0010-no-student-code-enforcement.md) |
| **Hyperframes** | Công cụ HTML→MP4 đã có trong repo (dùng ở `render-service`). | [ADR 0007](decisions/0007-manim-and-math-visualization.md) |
| **InputSpec** | Khai báo JSON kiểu và miền của input; một validator dùng chung server và iframe. | [ADR 0006](decisions/0006-deterministic-trace-catalog.md) |
| **invariants** | Hàm thuần kiểm bất biến toán của một clip, chạy trên mọi preset và biên. | [Phase 3 §6.1](phase-3-olympiad-math/SCHEMA.md) |
| **kind** (`widgetConfig.kind`) | Bộ phân biệt ổn định của widget trên vỏ `simulation` (`'walkthrough'`); provider nhận scene theo trường này. | [ADR 0005](decisions/0005-widget-hosting-model.md) |
| **lessonKit** | Gói nội dung tác giả viết (đề, giới hạn, subtask, bẫy, gợi ý, bài về nhà) mà `generate_walkthrough` trả cho agent để soạn slide quanh walkthrough. | [ADR 0011](decisions/0011-entry-point-workbench-tool.md) |
| **manim-service** | Container dịch vụ render Manim theo yêu cầu (đợt 3), theo hợp đồng của `render-service`. | [OPERATIONS](OPERATIONS.md) |
| **M1–M4** | Bốn chiến lược sinh clip: dựng sẵn, LLM viết mã, mẫu tham số hoá, lai. Chọn **M3 trên M1**. | [ADR 0007](decisions/0007-manim-and-math-visualization.md) |
| **null-origin iframe** | iframe `sandbox` không có `allow-same-origin`: không cookie/`localStorage` của host. | [SECURITY](SECURITY.md) |
| **OutlineConstraints** | Ràng buộc cấu trúc của skill (`outline-constraints.json`); chỉ cảnh báo sau ghi. | [ADR 0005](decisions/0005-widget-hosting-model.md) |
| **pointers / highlights / vars** | Dấu đánh dấu của frame: con trỏ, phần tử được tô, bảng biến. | [ADR 0001](decisions/0001-step-engine-immutable.md) |
| **poster** | Khung hình "chốt" cuối chapter, dùng làm ảnh đại diện và để thầy vẽ lại khi Q&A. | [Phase 3 §5](phase-3-olympiad-math/SCHEMA.md) |
| **preset** | Bộ input tính sẵn (≥4, có trường hợp biên) để học sinh chọn. Id dành riêng: `llm` (input LLM cấp khi sinh bài, lưu), `student` (input học sinh nhập, không lưu), từ lát 1d. | [ADR 0008](decisions/0008-lesson-blueprint-hard-problems.md), [ADR 0013](decisions/0013-provider-scene-lifecycle.md) |
| **provider** | `WidgetProvider` đăng ký ở `lib/widgets`: `build` (tool gọi), `actions`, `describe`; nhận scene theo nội dung. Mỗi scene đúng một provider. | [ADR 0005](decisions/0005-widget-hosting-model.md), [ADR 0013](decisions/0013-provider-scene-lifecycle.md) |
| **Q&A** | Học sinh hỏi thầy giữa bài; thầy cần biết học sinh đang xem gì. | [ADR 0009](decisions/0009-teacher-qa-awareness.md) |
| **render-service** | Dịch vụ MP4 export có sẵn của OpenMAIC (Node + Chromium + FFmpeg). | [OPERATIONS](OPERATIONS.md) |
| **RSR** | Render Success Rate: tỉ lệ mã Manim do LLM sinh render được. | [ADR 0007](decisions/0007-manim-and-math-visualization.md) |
| **SceneEnricher** | *(Đã bỏ 2026-09-30)* Provider sửa scene đã sinh; thay bằng tool `generate_clip_scenes`. | [ADR 0011](decisions/0011-entry-point-workbench-tool.md) |
| **shell** (vỏ) | `widgetType:'simulation'` dùng làm vỏ cho walkthrough để không đổi package. | [ADR 0005](decisions/0005-widget-hosting-model.md) |
| **skill** | Thư mục `skills/agent-runtime/<id>/` có `SKILL.md`; kênh chỉ dẫn LLM về cách dạy. | [ONBOARDING](ONBOARDING.md) |
| **spike** | Thử nghiệm ngắn để trả lời một câu hỏi kỹ thuật; có tiêu chí "đạt khi…". | [RISKS](RISKS.md) |
| **storyboard** | Walkthrough có 6–15 frame viết tay cho topic không có hàm thuần tự nhiên. | [ADR 0006](decisions/0006-deterministic-trace-catalog.md) |
| **SubjectPack** | Gói môn học: entry (walkthrough, clip), skill, curriculum, nhãn; thêm môn dùng phương tiện có sẵn = thêm gói. | [ADR 0005](decisions/0005-widget-hosting-model.md) |
| **thang gợi ý** | Ba mức gợi ý (nhẹ → vừa → gần lời giải) của mỗi beat; thầy đưa mức 1 trước. | [ADR 0008](decisions/0008-lesson-blueprint-hard-problems.md) |
| **SWOT** | Strengths, Weaknesses, Opportunities, Threats: khung ra quyết định của mọi ADR. | [decisions/README](decisions/README.md) |
| **tier / topic** | Bậc và chuyên đề của curriculum (4 tier, 32 topic cho Tin). | [DATA-MODEL §5](DATA-MODEL.md) |
| **tracks: `ts10` / `hsg`** | Hai luồng học sinh: thi vào lớp 10 chuyên Tin; HSG tỉnh/QG. Gắn vào từng topic. | [ADR 0012](decisions/0012-audience-scope-pedagogy-gates.md) |
| **trigger** | Điều kiện cụ thể làm đổi một quyết định. | [decisions/README](decisions/README.md) |
| **walkthrough** | Widget trình chiếu thuật toán/chứng minh từng bước trong iframe. | [ADR 0005](decisions/0005-widget-hosting-model.md), [ADR 0006](decisions/0006-deterministic-trace-catalog.md) |
| **widget-config / walkthrough-data** | Hai khối JSON trong HTML của widget: nhẹ (vào prompt, lưu scene) và đầy đủ (chỉ runtime đọc). | [DATA-MODEL §3](DATA-MODEL.md) |
| **widget-state** | Thông điệp iframe→host báo frame hiện tại (`__maicInteractive`), chỉ được nhận sau `widget-ready`. | [INTERFACES §2](INTERFACES.md) |
| **workbench** | Giao diện đường agent của OpenMAIC; điều kiện bắt buộc của tính năng. | [ADR 0011](decisions/0011-entry-point-workbench-tool.md) |
| **Phase / đợt / lát** | Phase = 1, 2, 3. Lát = 1a–1d của Phase 1. Đợt = 2A–2E (Tin) và 3-0, 3A–3D (Toán). | [ADR 0004](decisions/0004-three-phase-plan.md) |
| **E1–E4** | Bốn phương án kiến trúc mở rộng: vỏ dữ liệu `simulation`; widget hạng nhất (đổi package); registry app; package mới. Chọn **E3 trên E1**. | [ADR 0005](decisions/0005-widget-hosting-model.md) |
| **X / Y / Z** | Ba cách phân bổ vai trò Toán: Manim-first; walkthrough-first; cân bằng theo loại. Chọn **Z**. | [ADR 0007](decisions/0007-manim-and-math-visualization.md) |
| **L0 / L1** | Mức Q&A cho clip: L0 = `clip-sheet` + chapter; L1 = host báo `currentTime`. | [ADR 0009](decisions/0009-teacher-qa-awareness.md) |
| **Lô A / B / C** | Ba nhóm mẫu clip Manim (8 / 9 / 4 mẫu). | [Phase 3 §3](phase-3-olympiad-math/SCHEMA.md) |
| **templateRev** | Số phiên bản của mẫu Manim; nằm trong cache key. | [DATA-MODEL §4](DATA-MODEL.md) |
| **presetId** | Định danh preset do LLM chọn qua `generate_walkthrough` (`input` tuỳ chỉnh từ lát 1d). | [INTERFACES §3](INTERFACES.md) |

## 2. Từ dễ nhầm

| Cặp | Khác nhau |
| --- | --- |
| **beat** và **chapter** | Beat thuộc walkthrough (mốc frame); chapter thuộc clip (đoạn video). Cả hai đều là "mốc để thầy dừng-giải thích-hỏi". |
| **preset** và **input tuỳ chỉnh** | Preset: bộ input tính sẵn, không tính ở client. Input tuỳ chỉnh: preset `student` (học sinh nhập, `run` chạy trong iframe) hoặc `llm` (LLM cấp lúc sinh bài), từ lát 1d. |
| **walkthrough** và **clip** | Walkthrough: HTML tương tác, tua/nhảy được, thầy điều khiển bằng `widget_setState`. Clip: video, không tua theo bước, thầy nói trước/sau. |
| **`code` widget** và **hiển thị code** | Widget `code` = trình soạn + chạy (bị chặn). Hiển thị code = slide `code`, `wb_draw_code`, tab C++/Python chỉ đọc, sắp dòng/tìm dòng sai (được phép). |
| **bài thuật toán** và **bài giải đề** | Bài thuật toán dạy một kỹ thuật; bài giải đề dạy quy trình giải một đề cụ thể có thang subtask. |
| **provider** và **SubjectPack** | Provider dựng scene và mô tả cho Q&A; SubjectPack gom entry và dữ liệu của một môn. |
| **thêm môn** và **thêm phương tiện** | Thêm môn dùng walkthrough/clip có sẵn = thêm file. Thêm phương tiện mới (loại widget/video mới) = ADR + tool + provider + trường `SubjectPack`. |
| **skill** và **curriculum** | Skill là thư mục có `SKILL.md` cho agent; curriculum là dữ liệu nằm trong `references/` của skill. |
| **ràng buộc skill** và **guard** | Ràng buộc skill chỉ cảnh báo sau ghi; guard chặn thật (hiển thị, ghi, sinh). |
