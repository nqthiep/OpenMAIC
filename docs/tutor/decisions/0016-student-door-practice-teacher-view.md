# ADR 0016: Cửa học sinh, luyện tập không code, màn hình tiến độ cho giáo viên

- **Status**: Accepted (2026-10-10; yêu cầu của chủ dự án sau review chức năng)
- **Date**: 2026-10-10
- **Deciders**: Chủ dự án
- **Thay thế một phần**: [0011](0011-entry-point-workbench-tool.md) (quyết định 1: "chỉ đường agent"); đường agent giữ nguyên
- **Liên quan**: [0003](0003-no-code-execution.md), [0006](0006-deterministic-trace-catalog.md), [0010](0010-no-student-code-enforcement.md), [0014](0014-llm-roles-and-learner-data.md), [../OPERATIONS §2](../OPERATIONS.md), [../SECURITY](../SECURITY.md)

> **Tóm tắt:** thêm ba thứ, không đổi package `@openmaic/*` và không gọi LLM. (1) Trang `/learn`: chọn bài từ catalog, mở thẳng walkthrough, không cần chat với agent. (2) Mỗi bài kèm một scene `quiz` luyện tập dựng từ chính các câu dự đoán của entry; không có code để chạy. (3) Trang `/teacher`: bảng tiến độ đọc từ `tutorLearning` và `quizAttempt`, chỉ mở khi có mã giáo viên.

## Bối cảnh — sự thật ràng buộc

| Sự thật | Nguồn |
| --- | --- |
| Walkthrough chỉ tới được qua tool `generate_walkthrough` của agent; học sinh phải trò chuyện với agent, không có chỗ duyệt catalog. | ADR 0011 quyết định 1; không có UI duyệt trong `app/`, `components/` |
| Tool đó dựng scene bằng `walkthroughProvider.build`, kiểm `assertScenePolicy`, ghi bằng kho tài liệu của owner. Không gọi LLM. | `lib/server/agent-runtime/walkthrough-tools.ts` |
| `POST /api/stages` đã là mặt tạo course theo owner (không cần agent). | `app/api/stages/route.ts` |
| `tutorLearning` được ghi (beat, dự đoán, gợi ý) nhưng không có nơi đọc lại. | `lib/tutor/learning-log.ts` |
| Kho runtime cố ý không có liệt kê xuyên học sinh: mọi lời gọi gắn với `(stageId, learnerKey)`. | `packages/@openmaic/storage/src/runtime/types.ts` |
| Scene `quiz` có sẵn trình chấm cục bộ cho câu một đáp án và ghi `quizAttempt` kèm kết quả từng câu. | `lib/quiz/runtime.ts`, `lib/quiz/grading.ts` |

## Phương án và SWOT

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| A. Giữ chỉ đường agent | Không thêm mặt mới | Học sinh phải biết trò chuyện với agent; không thân thiện | — | Tính năng không được dùng |
| **B. Route riêng dựng course bằng cùng provider (chọn)** | Dùng lại `build` và chính sách; 0 lời gọi LLM; đúng seam owner; tách khỏi workbench | Thêm hai route, hai trang | Cùng mẫu cho môn khác | Hai nơi dựng scene phải giữ khớp |
| C. Đi qua đường classic, gán `walkthroughId` theo từ khoá | Một đường | Classic không có skill; gán theo từ khoá dễ sai (đã loại ở ADR 0011) | — | Chọn nhầm bài |

Luyện tập: (i) LLM sinh câu hỏi → loại, vì đáp án không kiểm được và trái nguyên tắc 3 của README; (ii) **câu dự đoán của entry làm câu hỏi (chọn)**: câu hỏi và đáp án đúng lấy từ `ask` và `predict.answer`, đã có test; (iii) tác giả viết riêng từng bộ câu → đắt, không theo kịp catalog.

## Quyết định

1. **`/learn`** liệt kê entry của `widgetRegistry` (nên cổng review `OPENMAIC_REQUIRE_REVIEW` vẫn có hiệu lực), gom theo môn và mức của curriculum. **`POST /api/learn/start`** dựng một stage `{scene walkthrough, scene quiz}` hoặc chỉ `{quiz}` rồi lưu qua kho tài liệu của owner (cùng seam với `POST /api/stages`). Cần `DATABASE_URL`; không cần workbench. Stage mang `producer: 'server-job'` để trình duyệt không sinh thêm trang.
2. **Luyện tập** (`lib/tutor/door/practice.ts`): mỗi câu là một beat có `ask.predict` của entry. Ngữ cảnh là văn bản của khung hình học sinh sẽ thấy: lời giải thích, mảng hoặc JSON trạng thái (bảng, đồ thị, cây), biến, danh sách phụ. Câu bị **bỏ** nếu trạng thái không vừa 600 ký tự hoặc ngữ cảnh đã nói nguyên văn đáp án đúng. Thứ tự theo hạt giống; mỗi beat một câu trước. Entry không còn câu nào thì không có nút "Chỉ luyện tập".
3. **`/teacher`** và `/api/teacher/{login,progress}`: bật khi `TUTOR_TEACHER_CODE` đặt và dài ≥ 16 ký tự, nếu không thì 403 (đóng theo mặc định). Cookie `openmaic_teacher` ký HMAC bằng khoá gồm `OPENMAIC_ACCESS_SECRET` nối mã đó, cùng quy tắc khoá với `openmaic_access` (không đặt secret thì khoá chỉ là mã), có giới hạn thử riêng. Báo cáo đọc thẳng `runtime_sessions`/`runtime_records` của course còn sống, tối đa 50 000 bản ghi mới nhất.
4. **Tên học sinh** là biệt danh tuỳ chọn, ghi vào `stage.description` ("Học sinh: …"); không có tài khoản. Không gửi tên cho LLM nào (route không gọi LLM).
5. Đường agent và ADR 0010 (chặn `code`) không đổi: route cửa học sinh cũng chạy `assertScenePolicy`.
6. **Lộ trình và trạng thái** (`/learn`): bài xếp theo `sequencing` của curriculum (đọc theo số trong khoá `grade_8`, `tier_2`, …), khối "Học tiếp" chỉ bài đầu tiên chưa mở. "Đã mở" lưu ở `localStorage` của trình duyệt (`stageId` của lần mở gần nhất), nên "Tiếp tục" mở lại lớp cũ nếu còn, và "Học lại" tạo lớp mới.
7. **Lối vào**: `OPENMAIC_HOME=learn` làm `/` chuyển sang `/learn` (ở `proxy.ts`); ở triển khai thường `/?classic=1` vẫn tới trình tạo khoá học (triển khai học sinh: xem mục 10). Mặc định không đặt thì `/` không đổi.
8. **Lớp chỉ có thầy AI**: stage của cửa học sinh đặt `agentIds: ['default-1']`; lựa chọn tường minh của học sinh trong lớp vẫn thắng (`restoreAgentSelection`).
9. **Câu luyện đọc được như văn bản**: bảng DP, đồ thị, cây và mảng được viết ra từng dòng (`lib/tutor/door/state-text.ts`); khung nào không viết ra được thì câu bị bỏ. `quiz-view.tsx` thêm `whitespace-pre-line` để xuống dòng giữ nguyên (một lớp CSS ở file upstream).
10. **Chế độ học sinh** (`OPENMAIC_HOME=learn`): `/?classic=1` cũng chuyển sang `/learn`, nên không còn mở trình tạo khoá từ cửa học sinh. Ở server, `proxy.ts` trả 404 cho mọi route `/api/` không nằm trong danh sách cho phép (`lib/server/learn-api-gate.ts`, từ chối mặc định): tạo khoá (`/api/generate-classroom`, `/api/generation-runs`), sinh media và giọng đọc, PBL, xuất file, kiểm nhà cung cấp, workbench và cấu hình. Danh sách chỉ giữ route của luồng học. Muốn tạo bài, giáo viên dùng triển khai không đặt `OPENMAIC_HOME`. Khi `OPENMAIC_ACCOUNTS=true`, cổng tài khoản chạy trước mọi trang: khách chưa có phiên được chuyển tới `/login` khi mở `/`, `/learn` hay bất kỳ trang nào, và học sinh đã đăng nhập vẫn cần mã truy cập của lớp (`ACCESS_CODE`) cho các route `/api/`, vì cổng mã truy cập chạy sau cổng tài khoản.

## Hệ quả

- Tốt: học sinh mở bài trong hai cú nhấp; giáo viên thấy bước đã xem, tỉ lệ dự đoán đúng, gợi ý, điểm luyện tập, và các beat nhiều học sinh trả lời sai (tín hiệu "đo giá trị dạy" cho cổng G1).
- Xấu:
  - Màn hình giáo viên **đọc xuyên owner**, đi vòng chính sách phân vùng của kho runtime; chỉ một mã dùng chung bảo vệ.
  - Biến thể câu luyện bị giới hạn bởi số preset của entry (nhập input tuỳ chỉnh vẫn chờ lát 1d).
  - Entry hình học không có hình trong câu luyện, chỉ có lời giải thích và biến.
  - **Chỉ hỗ trợ màn hình rộng** (máy tính, máy tính bảng; quyết định của chủ dự án 2026-10-10). Khung lớp học của upstream không dùng được trên điện thoại (đo ở 375 px: thanh scene chiếm một nửa, widget co còn chữ ~6 px, lời thầy bị cắt), và sẽ **không** làm trình xem cho điện thoại. `/learn` chỉ báo điều này trên màn hình hẹp bằng một dòng chữ.
  - Học sinh ẩn danh theo trình duyệt: cùng một em dùng hai máy là hai dòng.
- Việc theo sau: ghi `tutorLearning` kiểu `moderation` (chưa làm); phân trang báo cáo khi quá 50 000 bản ghi.

## Điều kiện đổi (trigger)

- Có tài khoản (owner auth) → thay mã dùng chung bằng vai giáo viên/phụ huynh theo lớp.
- Lát 1d mở → luyện tập sinh input mới từ `inputSpec` thay vì chỉ preset.
- Báo cáo chậm (> 2 s p95) hoặc chạm 50 000 bản ghi → tổng hợp sẵn theo ngày.
- Mã giáo viên lộ → đổi `TUTOR_TEACHER_CODE` (cookie cũ hết hiệu lực vì ký bằng mã).
