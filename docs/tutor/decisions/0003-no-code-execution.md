# ADR 0003: Không có trình soạn code cho học sinh — bài giảng tương tác và visualizer thì có

- **Status**: Accepted (làm rõ 2026-09-30 theo giải thích của user; cơ chế chặn ở ADR 0010)
- **Date**: 2026-09-28; sửa 2026-09-29 và 2026-09-30
- **Deciders**: User + Architect panel
- **Liên quan**: [0008](0008-lesson-blueprint-hard-problems.md), [0010](0010-no-student-code-enforcement.md), [../SECURITY](../SECURITY.md)

> **Tóm tắt:** "không cho học sinh chạy code" nghĩa là **không có code editor / bài luyện code / chấm code**; **giữ và khuyến khích** interactive, visualizer, đổi input để quan sát, code chỉ-đọc để đọc hiểu.

## Context

Yêu cầu gốc:

> "tôi nghĩ rằng hệ thống này sẽ không cho phép học sinh chạy code, nó chỉ giảng dạy, giải thích, trả lời, hướng dẫn mà thôi."

**User giải thích lại nghĩa (2026-09-30):**

> "không cho học sinh chạy code" = ứng dụng này thuần về giảng dạy, giảng giải, **không có chức năng code editor** để học sinh làm bài, viết code và run trên đó. Còn tính năng bài giảng **interactive** và **visualizer** là để bài giảng trực quan, sinh động, giúp học sinh nhìn vào đó dễ hiểu bài hơn.

**Ghi nhận sai sót của các bản trước (2026-09-29):** tôi đã hiểu quá hẹp — coi cả "học sinh đổi input để xem visualizer", "widget tương tác do LLM sinh (simulation/diagram/game/3D)" là vi phạm, nên đặt allowlist chỉ cho phép widget do provider sinh, chỉ cho chọn preset, và xếp widget LLM sau storyboard. Các hạn chế đó không có trong yêu cầu và đã được gỡ (ADR 0006, 0008, 0010).

## Decision

**Loại bỏ**: mọi chức năng để học sinh *viết và chạy code / làm bài code trong ứng dụng*:
1. Không có widget `code` (trình soạn + chạy Python/JS/TS + chấm test case) — bị chặn (ADR 0010).
2. Không có scene/bài "luyện code" (đã bỏ "Cảnh 6 – code" và `"code"` khỏi `scene_mix` trong curriculum), không chấm code của học sinh.

**Giữ và khuyến khích** (đây là mục đích của tính năng):
3. Bài giảng **tương tác**: walkthrough từng bước (chạy tay thuật toán), simulation, diagram, game, 3D do LLM sinh, quiz.
4. **Visualizer**: mảng/cây/đồ thị/bảng DP/hình học/đồ thị hàm.
5. Học sinh **đổi tham số/input để quan sát** (preset và nhập input tuỳ chỉnh trong giới hạn — ADR 0008): đây là tương tác với *visualizer của thuật toán có sẵn*, không phải viết code.
6. **Hiển thị** code (pseudocode, C++ và Python highlight theo bước, phần tử `code` trên slide, `wb_draw_code`) để học sinh *đọc hiểu* lời giải. Học sinh có thể **sắp lại dòng** hoặc **chọn dòng sai** trong code chỉ-đọc (ADR 0008 Decision 5); không viết, không chạy.
7. Thầy giảng, giải thích, **trả lời** (biết frame hiện tại — ADR 0009), hướng dẫn (quiz dự đoán bước kế, câu tự luận do AI chấm `aiComment` — chấm lời giải thích, không chạy code).

## SWOT

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Có code editor + chạy code cho học sinh | Học qua thử–sửa. | Ngoài phạm vi "thuần giảng dạy"; cần runtime, guard vòng lặp vô hạn, chấm bài. | — | Bề mặt tấn công; trái ý user. |
| Cấm mọi tương tác của học sinh với visualizer (cách hiểu cũ) | Đơn giản. | Bài giảng một chiều, kém sinh động; trái mục đích "interactive & visualizer". | — | Học sinh khó hiểu bài khó. |
| **Không editor/không chấm code; giữ interactive + visualizer + đổi input (chọn)** | Đúng ý user; bài giảng trực quan, sinh động; không cần sandbox chạy code học sinh. | Cần chặn widget `code` bằng cơ chế thật (ADR 0010). | Mở rộng nhập input tự do có kiểm soát (ADR 0008). | Widget LLM sinh có thể sai về nội dung — giảm bằng ưu tiên walkthrough tất định cho trace số liệu (ADR 0006). |

## Future (ngoài phạm vi)

Nếu sau này muốn thêm luyện code cho học sinh: một phase riêng với sandbox, chấm bài — ADR riêng.

## Implications

- Cờ triển khai chặn widget `code` (ADR 0010).
- `SKILL.md` của các môn nêu rõ: không tạo bài luyện code; được dùng walkthrough/simulation/diagram/game/3D.
- Curriculum: `course_shape` không còn cảnh code (ADR 0008).
