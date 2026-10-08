# ADR 0015: Minh hoạ Toán bằng web UI tương tác tự viết, không dùng clip Manim

- **Status**: Accepted (2026-10-08; quyết định của chủ dự án sau khi so sánh hai hướng bằng số đo thật của Phase 3)
- **Date**: 2026-10-08
- **Deciders**: Chủ dự án; tác giả triển khai đã làm đủ cả hai hướng và đưa số đo
- **Liên quan**: [0002](0002-no-new-deps.md), [0006](0006-deterministic-trace-catalog.md), [0007](0007-manim-and-math-visualization.md), [0013](0013-provider-scene-lifecycle.md), [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md)

> **Tóm tắt:** phần *Trực quan hoá Toán* của ADR 0007 (clip Manim là hướng chính) bị **thay thế**. Mọi minh hoạ Toán làm bằng **walkthrough tương tác** (SVG/DOM tự viết trong iframe, thanh trượt đổi tham số, dự đoán theo bước), trên cùng khuôn với walkthrough Tin. Không dùng thêm thư viện đồ hoạ (p5.js, JSXGraph, Three.js, ecmanim): ADR 0002 vẫn có hiệu lực. Mã clip Manim giữ nguyên trong repo nhưng **tắt** (thẻ `manim-clips-final` trỏ tới bản cuối còn chạy được).

## Bối cảnh — sự thật (đo trong Phase 3, 2026-10-08)

| Sự thật | Nguồn |
| --- | --- |
| 21 mẫu Manim dựng được, 84/84 preset qua cổng QA, nhưng chỉ 10 preset (7,5 MB) vào được `public/clips` vì trần 10 thư mục / 30 MB của NFR-P8. | `manim/templates/`, `tests/clips/prebuilt-assets.test.ts` |
| Hạ tầng đi kèm: image 2,33 GB (TeX Live), service, sandbox, hàng đợi. Red-team thử đầu tiên tìm ra TeX đọc được `/etc/passwd` và fork bomb làm service ngừng trả lời. | `manim/Dockerfile`, `manim/service/redteam/` |
| Cổng bố cục chữ của clip đã chạy rỗng (đọc độ mờ của vỏ `MathTex`) và chỉ lộ ra khi tự kiểm; hội đồng review chỉ đọc chữ và số, không thấy hình. | `manim/templates/_base.py`, `lib/clips/review-material.ts` |
| Xuất ZIP lớp học không chứa video clip (URL tĩnh không được đóng gói) cho tới khi sửa `collectMediaFiles`. | e2e `clip-export-roundtrip` (còn ở thẻ `manim-clips-final`) |
| Đổi tham số tự do cần render lại 14–60 s trên 2 vCPU; học sinh chỉ chọn preset. | `manim/spikes/s1/RESULT.md` |
| Walkthrough Toán (3 entry) đã có thanh trượt (`customInput`), frame là dữ liệu thuần kiểm bằng test có oracle, vài trăm KB, chữ là DOM/SVG, KaTeX dựng ở server. | `lib/subjects/math/catalog/`, `lib/tutor/runtime/visualizers/` |

## Phương án và SWOT

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| A. Giữ clip Manim (ADR 0007) | Hoạt hoạ mượt, LaTeX đẹp, chuyển cảnh điện ảnh | Chỉ xem; preset cố định; image nặng; trần dung lượng; review không thấy hình | Chia sẻ mp4 ngoài ứng dụng | Chạy mã Python/TeX trên server; lỗi sandbox |
| B. **Web UI tương tác tự viết (chọn)** | Kéo tham số tức thì; frame là dữ liệu kiểm được; không hạ tầng mới; vài trăm KB; truy cập tốt; đã có 7 visualizer | Hoạt hoạ liên tục kém điện ảnh; mỗi mẫu cần viết TS và có thể cần visualizer mới | Dùng lại `inputSpec`, hint, công thức của các entry clip | Công thức hình học phức tạp tốn công vẽ |
| C. Thư viện ngoài (p5.js, JSXGraph, Three.js, ecmanim) | Vẽ nhanh, kéo điểm tự do, 3D | Thêm dependency (phạm ADR 0002); nhúng vào iframe CSP không mạng làm phình HTML; JSXGraph LGPL-3.0; ecmanim còn non | Kéo điểm trực tiếp, hình không gian | Giấy phép, bảo trì, kích thước, lệch khuôn tất định |

## Quyết định

1. Mọi minh hoạ Toán là **walkthrough** (`WalkthroughEntry`) chạy trên `geometry`, `functionPlotter`, `proofOutline`, `grid`, `graph` và các visualizer mới cần thiết, viết bằng SVG/DOM tự viết, không dependency.
2. Mỗi clip hiện có được **chuyển thành walkthrough** giữ `inputSpec`, hint, hiểu lầm và công thức; đổi tham số bằng thanh trượt; có câu hỏi dự đoán.
3. **Tắt** clip: gói `math` không còn `clips`, tool `generate_clip_scenes` không vào bộ công cụ, `public/clips` và chỉ mục asset bị xoá khỏi cây làm việc. Mã (`lib/clips`, `manim/`, mẫu, service, eval) **giữ** trong repo để đối chiếu và khôi phục; `git checkout manim-clips-final` trả lại hệ thống clip đầy đủ.
4. Service `manim-service`, vòng LLM tác giả Manim (3A-08), luồng CI "brief → PR" (3D-02) và red-team (3C-04) **dừng**; không phát triển thêm.
5. Thư viện đồ hoạ ngoài chỉ vào bằng ADR riêng (xem điều kiện đổi).

## Hệ quả

- ADR 0007 phần trực quan hoá Toán, ADR 0011 (tool `generate_clip_scenes`), ADR 0009 phần `clip-sheet` bị thay thế ở phần clip; các phần khác (walkthrough, Q&A theo `describe`) giữ nguyên.
- Curriculum Toán: `primary_medium: manim` đổi thành `walkthrough`; `clip_ids` thành `walkthrough_ids`.
- Eval và review dùng đường walkthrough đã có (`eval/tutor-review/runner.ts`), hội đồng đọc được trạng thái từng frame.
- Việc còn lại là **công sức chuyển 21 mẫu** (theo lô), không phải hạ tầng.

## Điều kiện đổi

- ≥ 2 topic cần kéo điểm tự do trên hình hoặc hình không gian mà visualizer SVG tự viết làm không nổi: mở ADR cho JSXGraph (LGPL-3.0) hoặc Three.js.
- Một mẫu cần hoạt hoạ điện ảnh mà walkthrough không diễn đạt được: dựng riêng một mp4 dùng widget video có sẵn của slide, không cần `manim-service`.
