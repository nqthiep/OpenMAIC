# ADR 0012: Đối tượng, phạm vi MVP và cổng sư phạm — hai luồng (thi vào 10 chuyên Tin, HSG), bài giải đề, C++ và Python

- **Status**: Accepted (2026-09-30; đối tượng và ngôn ngữ do user quyết định, phạm vi và cổng chọn bằng SWOT; cổng G1/G2 sửa 2026-10-01 theo ADR 0014)
- **Date**: 2026-09-30
- **Deciders**: User ("cả hai" đối tượng; "C++ và Python") + Architect panel (review 2026-09-30, phát hiện F1–F5, F10, A13)
- **Liên quan**: [0004](0004-three-phase-plan.md), [0006](0006-deterministic-trace-catalog.md), [0008](0008-lesson-blueprint-hard-problems.md), [../CONTENT-DESIGN](../CONTENT-DESIGN.md), [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md)

> **Tóm tắt:** phục vụ **cả hai** đối tượng bằng hai luồng gắn vào topic: `ts10` (thi vào lớp 10 chuyên Tin, lớp 8–9) và `hsg` (HSG tỉnh/QG). Phase 2 **xen kẽ** hai luồng: đợt đầu phủ phần nền chung (tier 1–2), sau đó mới tới HSG nặng. Ngoài bài "thuật toán" có thêm loại **bài giải đề** (subtask → vét cạn → quan sát → lời giải). Code chỉ-đọc có **C++ và Python**. MVP là **1a–1c + cổng sư phạm G1**; Phase 3 chỉ giữ ở mức khung cho tới khi có kết quả 3-0.

## Bối cảnh

| Sự thật | Nguồn |
| --- | --- |
| Curriculum có 4 tier. Tier 1 là "Lớp 8–9 (THCS → thi vào 10 chuyên Tin)"; tier 2 là "Lớp 9–10 (ôn thi vào 10 chuyên, HSG tỉnh lớp 9/10)"; tier 3–4 là HSG tỉnh/QG, đội tuyển. | `curriculum/curriculum-informatics-vn.json` (`tiers[].grade_band`) |
| `exam_targets` liệt kê cả tuyển sinh 10 chuyên Tin và HSG các cấp; nhưng `exam_profile` chỉ mô tả thể thức HSG QG. | cùng file (`exam_targets`, `exam_profile`) |
| Kế hoạch Phase 2 cũ đẩy `t1-string`, `t1-stack-queue`, `t1-hash`, `t2-brute-force`, `t2-bitwise`, `t2-number-basics`, `t3-greedy` vào backlog, trong khi đợt 2B làm dp-bitmask, segment tree, Dijkstra, DP cây. | Phase 2 SCHEMA (bản trước) §2.1–2.2 |
| Mọi mô-đun là bài **thuật toán**; không có loại bài **giải một đề** (mô hình hoá, subtask, kết hợp kỹ thuật). | ADR 0006 §7, Phase 1 §4.1 (bản trước) |
| Nghiệm thu 1b–2D chỉ có "demo thủ công" và "chạy eval lần đầu"; chưa có cổng nào về chất lượng dạy với giáo viên hay học sinh thật. | Phase 1 §8, Phase 2 §8 (bản trước) |
| Thể thức đề tuyển sinh 10 chuyên Tin từng trường, và việc có chấp nhận Python hay không | **[Unverified]** — chưa có nguồn chính thức; hội đồng LLM research kèm nguồn (ADR 0014) |

## Phương án và SWOT

**1. Đối tượng** — user chọn "cả hai". Bảng dưới ghi lại hệ quả để chọn **cách** phục vụ:

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Thi vào 10 chuyên Tin trước | Đúng nhóm user nêu đầu tiên; topic dễ vẽ, ít frame. | HSG phải chờ; ít "bài rất khó". | — | Không chứng minh được bài khó. |
| HSG trước (bản cũ) | Nhiều bài khó. | Lệch nhóm lớp 8–9; người mới thiếu nền. | — | MVP không phục vụ người dùng chính. |
| **Xen kẽ hai luồng, nền chung trước (chọn)** | Tier 1–2 phục vụ cả hai luồng, nên làm trước có lợi kép; mỗi đợt 2A–2C có ít nhất một bài giải đề khó. | Phải gắn nhãn luồng cho topic và đo độ phủ theo từng luồng. | Người học đi tiếp từ `ts10` sang `hsg` theo `prerequisites`. | Nhãn luồng sai → cần giáo viên Tin duyệt. |

**2. Loại bài**:

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Chỉ bài thuật toán (bản cũ) | Đơn giản. | Không dạy cách **giải một đề khó**, là thứ đề thi đòi hỏi. | — | Lời hứa "bài rất khó → rõ ràng" không được kiểm chứng. |
| **Thuật toán + bài giải đề (chọn)** | Dạy đúng quy trình thi: đọc giới hạn → subtask → vét cạn → quan sát → lời giải → bẫy. | Thêm trường `problem` và `lessonKit` cho entry; thêm công viết. | Dùng lại visualizer sẵn có (ví dụ `array` cho chặt nhị phân đáp án). | Đề mẫu vướng bản quyền → tự viết đề, không chép đề thi. |

**3. Phạm vi MVP** (A13: 3.382 dòng tài liệu, 0 dòng mã):

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| 1a–1d + đặc tả chi tiết Phase 3 ngay (bản cũ) | Đầy đủ trên giấy. | Nhiều chi tiết sẽ lỗi thời khi có kết quả spike. | — | Tốn công bảo trì tài liệu. |
| **1a–1c + cổng G1; Phase 3 ở mức khung tới khi xong 3-0 (chọn)** | Chứng minh giá trị dạy trước khi mở rộng. | 1d và Phase 2 phải chờ G1. | Spike Manim S1/S2/S4 chạy song song với 1a (không cần 1b). | Cổng G1 chậm nếu thiếu học sinh thử. |
| Chỉ 1a–1b | Nhỏ nhất. | Không có Q&A, tức là chưa có "trả lời, hướng dẫn". | — | Trái yêu cầu R5. |

**4. Ngôn ngữ code chỉ-đọc** — user chọn "C++ và Python":

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Chỉ C++ | Một bản để khớp; thi HSG dùng C++. | Rào cản cho học sinh THCS học Python [Unverified]. | — | — |
| **C++ và Python (chọn)** | Phục vụ cả hai nhóm; một pseudocode, hai bản cài đặt. | Hai `map` phải khớp; bẫy khác nhau theo ngôn ngữ (Python không tràn số). | CI chạy thử hai bản cài đặt trên preset để đối chiếu (nếu có `g++`/`python3` trong CI [Unverified]). | Hai bản lệch nhau → `map` toàn phần + test. |

## Quyết định

1. **Luồng:** mỗi topic curriculum có `tracks: ('ts10' | 'hsg')[]`. Mặc định theo tier [Inference], hội đồng LLM duyệt:
   - tier 1 → `["ts10"]`
   - tier 2 và `t3-greedy` → `["ts10","hsg"]`
   - các topic còn lại của tier 3–4 → `["hsg"]`

   Thêm `exam_profile.ts10_format_vi`, ghi `[Unverified]` tới khi có nguồn. Độ phủ báo **theo từng luồng** (REQUIREMENTS R12).
2. **Phase 2 xen kẽ** (chi tiết ở Phase 2 §2):
   - 2A: nền chung tier 1–2 + bài giải đề đầu tiên.
   - 2B: phần `ts10` còn lại + HSG cốt lõi (BFS/DFS, DP cơ bản).
   - 2C: HSG cấu trúc dữ liệu/đồ thị.
   - 2D: storyboard.
   - 2E: độ khó 5.
3. **Bài giải đề:**
   - `WalkthroughEntry.problem?` gồm `statement`, `constraints`, `subtasks[{id, limit, idea, complexity}]` và `lessonKit` (ADR 0011).
   - Blueprint riêng ở [CONTENT-DESIGN §3.2](../CONTENT-DESIGN.md).
   - Mỗi đợt 2A–2C có ≥1 bài giải đề (P1–P3); 2D (storyboard) và 2E thêm khi hội đồng LLM chọn được đề phù hợp. Đề do tác giả tự viết, **không chép đề thi**.
   - Bài giải đề đầu tiên: `bs-answer` (chặt nhị phân đáp án, dạng "cắt gỗ"), dùng visualizer `array`.
4. **Code chỉ-đọc:**
   - `code: { pseudo, impl: { cpp, py }, map: { cpp, py } }`, mỗi `map` toàn phần.
   - Panel `'pseudo' | 'cpp' | 'py'`.
   - Bẫy có nhãn ngôn ngữ (`lang?: 'cpp' | 'py'`) để lời thầy không nói "tràn số" khi học sinh đang xem Python.
5. **MVP = 1a–1c + G1.** Chưa làm 1d và Phase 2 cho tới khi G1 đạt. Spike Manim S1/S2/S4 chạy song song với 1a.
6. **Cổng sư phạm** (sửa 2026-10-01 theo ADR 0014: không mời người; mọi vai trò do LLM đảm nhận):
   - **G1** (sau 1c, trên bài `binary-search` và bài giải đề nhỏ `bs-answer-mini`):
     - Hội đồng LLM "giáo viên chuyên Tin" (`tutor-review-cp` + `tutor-review-cp-2`) chấm theo rubric ADR 0008: mỗi tiêu chí ≥ 4/5, không lỗi "Đúng".
     - **Học sinh mô phỏng** (`sim-learner`, 6 persona): bài kiểm tra 5 câu trước và sau khi "học" bản ghi bài giảng. Ngưỡng **áp dụng**: điểm sau – điểm trước ≥ 20 điểm %, và ≥ 70% persona chấm "dễ hiểu" ≥ 4/5. [Inference] Đây là tín hiệu thay thế, không đo việc học thật.
     - Bộ hiệu chuẩn của hội đồng và của học sinh mô phỏng đạt ngưỡng (ADR 0014 quyết định 7).
   - **G2** (cuối 2A): như G1, trên bài giải đề `bs-answer`.
   - **Sau phát hành:** số đo từ học sinh thật (dữ liệu lưu trữ, ADR 0014 quyết định 6) thay dần học sinh mô phỏng.
   - Mọi entry Phase 2/3 phải có review đạt của hội đồng LLM trước khi phát hành (INTERFACES §8.2).
7. **Cổng mở 1d ("preset chạy ổn")**, đo được, số áp dụng [Inference]:
   - e2e walkthrough xanh 20 lần liên tiếp (job `e2e` trên PR vào `main` của fork, hoặc `playwright test --repeat-each=20` có biên bản, vì nhánh tính năng không tự có CI — RISKS R31);
   - ≥ 10 lớp học dùng walkthrough preset trong 14 ngày không có lỗi mức P0/P1 (lớp học do agent sinh tự động theo kịch bản thử, hoặc của người dùng thật);
   - G1 đạt.

## Hệ quả

**Tốt:**
- Người dùng chính (lớp 8–9) có nội dung sớm.
- Có kiểm chứng giá trị dạy trước khi mở rộng.
- Có bài giải đề đúng tinh thần thi.
- Python mở cửa cho học sinh chưa học C++.

**Xấu:**
- Thêm công viết (bản Python, `problem`, `lessonKit`).
- Cổng G1/G2 dựa trên hội đồng LLM và học sinh mô phỏng (ADR 0014); lỗi tương quan giữa các LLM là rủi ro dư (RISKS R34).

**Việc theo sau:**
- Sửa ADR 0004 (thứ tự đợt), ADR 0006 (entry), ADR 0008 (Decision 3, blueprint), Phase 1/2, CONTENT-DESIGN, curriculum (`tracks`, `exam_profile`), REQUIREMENTS R12.

## Điều kiện đổi (trigger)

- G1 không đạt sau 2 vòng sửa → dừng mở rộng, xem lại blueprint (ADR 0008) trước khi làm Phase 2.
- Hội đồng LLM tìm được **nguồn** xác nhận đề thi vào 10 chuyên không dùng Python → giữ Python là tuỳ chọn cho bài mới, không bắt buộc.
- Số liệu sử dụng cho thấy một luồng chiếm < 20% lượt học sau 2 đợt → dồn công cho luồng còn lại.
