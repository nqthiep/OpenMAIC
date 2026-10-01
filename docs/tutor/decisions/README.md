# Nhật ký quyết định kiến trúc (ADR)

- **Trạng thái**: Living document
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [../README](../README.md), [../REQUIREMENTS §4](../REQUIREMENTS.md), [../RISKS](../RISKS.md)

> **Tóm tắt:** mỗi quyết định kiến trúc một file, có bối cảnh (sự thật kèm nguồn), phương án + SWOT, quyết định, hệ quả và **điều kiện đổi**. Bảng dưới là chỉ mục; khi hai ADR mâu thuẫn, ADR có số lớn hơn và ngày mới hơn thắng, và ADR cũ phải được sửa hoặc đánh dấu *Superseded*.

## 1. Chỉ mục

| ADR | Quyết định | Phương án được chọn | Trigger đổi chính | Trạng thái |
| --- | --- | --- | --- | --- |
| [0001](0001-step-engine-immutable.md) | Cách biểu diễn từng bước | `Frame{state, meta}[]` tính sẵn, bất biến, serialize được; `vars/aux`; trần 500 frame + 10 000 `tick()` | Cần tween liên tục → ADR 0002 T1 | Accepted |
| [0002](0002-no-new-deps.md) | Công nghệ trực quan hoá giải thuật | SVG/DOM tự viết theo mô hình *trace + renderer*; không dependency; có danh sách nên tham khảo | GSAP/d3-hierarchy inline khi chạm T1–T3 | Accepted |
| [0003](0003-no-code-execution.md) | Ý nghĩa "không chạy code" | Không code editor/chấm code; giữ interactive + visualizer + đổi input; code chỉ-đọc | Luyện code = phase riêng | Accepted |
| [0004](0004-three-phase-plan.md) | Kế hoạch triển khai | 1a–1c → G1 → 1d ‖ Tin 2A–2E ‖ Toán 3-0 → 3A–3D; S1/S2/S4 song song 1a | Đổi API base khi hai môn đã dùng | Accepted |
| [0005](0005-widget-hosting-model.md) | Tích hợp và mở rộng | HTML tự chứa + registry `WidgetProvider`/`SubjectPack` trên vỏ `simulation`; không đổi package (một phần bị 0011 thay) | Upstream nhận → E2; consumer ngoài → E4 | Accepted |
| [0006](0006-deterministic-trace-catalog.md) | Nguồn nội dung walkthrough | Hàm thuần sinh dữ kiện; lời thầy kịch bản theo beat từng preset; LLM chỉ chọn `id + preset`; `InputSpec`; C++ + Python | >20% speech trượt khi bật lời do LLM | Accepted |
| [0007](0007-manim-and-math-visualization.md) | Trực quan hoá Toán | Manim hướng chính: M3 trên M1; phân bổ Z; clip câm, lời riêng; mỗi chapter một slide; `manim-service` cứng hoá | <5 topic cần chuyển động / render chậm / tiếng Việt hỏng | Accepted |
| [0008](0008-lesson-blueprint-hard-problems.md) | Cách dạy bài khó | Blueprint 12 giai đoạn; preset + nhập input (sau preset); dự đoán + luyện không editor; thang gợi ý; C++/Python đọc hiểu; rubric | Tính nặng không chạy được ở client → (4) | Accepted |
| [0009](0009-teacher-qa-awareness.md) | Thầy trả lời theo vị trí | Digest (bước 0) + `widget-state` sau `widget-ready`; chữ từ catalog; clip: `clip-sheet` L0, `currentTime` L1 | Cần thầy Q&A nhảy frame | Accepted |
| [0010](0010-no-student-code-enforcement.md) | Chặn code editor | **Mặc định chặn** (`OPENMAIC_ALLOW_CODE_WIDGET` để mở); chặn nhiều lớp: hiển thị, ghi, sinh, CSP | Cần `code` ở nơi khác → chính sách theo gói | Accepted |
| [0011](0011-entry-point-workbench-tool.md) | Điểm vào | Chỉ đường agent (workbench); tool tất định `generate_walkthrough`, `generate_clip_scenes` | Cần tính năng khi không bật workbench | Accepted |
| [0012](0012-audience-scope-pedagogy-gates.md) | Đối tượng, MVP, cổng sư phạm | Hai luồng `ts10`/`hsg` xen kẽ; bài giải đề; C++ + Python; MVP 1a–1c + G1 | G1 trượt 2 vòng → xem lại blueprint | Accepted |
| [0013](0013-provider-scene-lifecycle.md) | Vòng đời scene do provider sở hữu | `widget-ready` + gửi lại trạng thái cuối; beat theo preset; `entryRev`; khoá `patch_stage`; một nguồn chữ | Vẫn mất lệnh sau `ready` → ack từng message | Accepted |
| [0014](0014-llm-roles-and-learner-data.md) | Vai trò con người và dữ liệu học sinh | LLM riêng cho từng vai trò: lọc nội dung (fail-closed), hội đồng giáo viên Tin/Toán, tác giả Manim, học sinh mô phỏng; bộ hiệu chuẩn; lưu dữ liệu học sinh trong kho runtime | Hiệu chuẩn dưới ngưỡng 2 lần; số đo thật lệch mô phỏng | Accepted |

Quy ước trích dẫn: "ADR NNNN §k" nghĩa là **mục k của phần Decision/Quyết định** trong ADR đó (ví dụ ADR 0013 §2 = quyết định 2: bắt tay).

Ghi chú: một số lựa chọn trong các ADR **Accepted** do hội đồng chọn thay user (đảo được, ảnh hưởng nhỏ) — xem [../REQUIREMENTS §5.2](../REQUIREMENTS.md).

## 2. Vòng đời trạng thái

`Proposed` → `Accepted` → (`Superseded by NNNN` | `Deprecated`). ADR đã `Accepted` **không sửa lịch sử**: thay đổi ý nghĩa thì viết ADR mới và ghi *Superseded*; chỉ sửa lỗi chính tả/liên kết hoặc ghi chú làm rõ. (Các ADR 0001–0013 hiện được viết lại trong giai đoạn thiết kế, trước khi có mã; từ khi bắt đầu Phase 1 áp dụng quy tắc này.)

## 3. Mẫu ADR

```markdown
# ADR NNNN: <quyết định, một câu>
- **Status**: Proposed | Accepted | Superseded by NNNN
- **Date**: YYYY-MM-DD
- **Deciders**: <tên/vai trò>
- **Liên quan**: <ADR, tài liệu>

> **Tóm tắt:** kết luận trước, 3–5 dòng.

## Bối cảnh — sự thật ràng buộc (kèm nguồn `file:line` hoặc URL)
## Phương án và SWOT — bảng Strengths / Weaknesses / Opportunities / Threats
## Quyết định — chọn gì, phạm vi; điều gì **không** thuộc quyết định
## Hệ quả — tốt / xấu / việc theo sau
## Điều kiện đổi (trigger) — ngưỡng cụ thể
```

Quy tắc viết: nêu **cả phương án bị loại và lý do**; mọi con số có nguồn hoặc nhãn `[Inference]`/`[Unverified]`; trigger phải đo được.

## 4. Khi nào cần ADR mới

- Đổi hoặc bỏ một quyết định ở bảng trên (đặc biệt khi chạm trigger).
- Thêm dependency, đổi package `@openmaic/*`, hoặc chạm ranh giới bảo mật ([../SECURITY](../SECURITY.md)).
- Mở M2 trên đường phục vụ (ADR 0007), mở nhập input tự do phía server (ADR 0008 phương án 4), đổi phạm vi hoặc mặc định của cờ chặn `code` (ADR 0010), hoặc cho tính năng chạy ngoài workbench (ADR 0011).
- Thêm một **loại phương tiện** mới ngoài walkthrough/clip (ADR 0005).
