---
name: competitive-programming
title: "信息学竞赛"
description: Competitive-programming and informatics-olympiad lessons (Vietnamese ts10 and hsg tracks) - algorithms, data structures and problem solving. Plans the course as a hard-problem blueprint with a deterministic step-by-step walkthrough instead of a code-practice page. Use when the requirement is to teach an algorithm or a contest problem to a student who will read the idea and the C++/Python code, not write it in the app.
---

# Competitive programming course design

Dạy một thuật toán hoặc một bài thi tin học theo hướng **hiểu ý tưởng, quan sát từng bước, đọc code**.
Học sinh không viết hay chạy code trong ứng dụng.

## Nguyên tắc

- **Không tạo bài luyện code và không dùng widget `code`.** Luyện tập là câu hỏi dự đoán, điền bảng trace, chọn độ phức tạp (quiz).
- **Trace số liệu thì gọi `generate_walkthrough`** với một `walkthroughId` trong bảng bên dưới. Công cụ dựng scene và lời thầy tất định, không gọi LLM. Sau đó soạn các slide quanh nó từ `lessonKit` (đề, giới hạn, subtask, bẫy, gợi ý); đưa các mục đó vào `materialFacts` của `generate_scene`, đừng tự bịa số liệu.
- `generate_walkthrough` nhận `{stageId, order, title, walkthroughId, presetId?, panel?, locale?}`. Bỏ `presetId` thì dùng preset đầu tiên. `panel` là `pseudo`, `cpp` hoặc `py`. Gặp lỗi `invalid-walkthrough-id` hoặc `invalid-preset-id` thì dùng `validIds` / `validPresetIds` trong kết quả.
- Không dùng `generate_scene` với `widgetOutline.walkthroughId` hay tự mô phỏng thuật toán bằng widget `simulation` khi đã có walkthrough cho topic đó.
- **Topic chưa có walkthrough**: dùng storyboard, hoặc widget tương tác do LLM sinh (`simulation`, `diagram`, `game`, `visualization3d`) cho khái niệm và mô hình định tính. Đừng dùng widget LLM sinh để trace số liệu từng bước.
- Thứ tự dựng trang vẫn theo skill `stage-design`: lập kế hoạch, `create_stage`, `set_roster`, rồi từng trang theo thứ tự tăng dần.

## Luồng

1. Hỏi, hoặc suy ra từ yêu cầu, học sinh thuộc luồng **`ts10`** (thi vào lớp 10 chuyên Tin, lớp 8-9) hay **`hsg`** (học sinh giỏi tỉnh/TP, quốc gia, đội tuyển). Chưa rõ thì hỏi một câu; đừng đoán.
   - `ts10`: mặc định tier 1, tier 2 và `t3-greedy`.
   - `hsg`: mặc định tier 2, tier 3, tier 4.
   - Nhãn `tracks` của từng topic nằm ở `references/curriculum/index.json`; theo curriculum, nhãn đó là [Inference] và còn chờ hội đồng Tin duyệt.
   - Topic có cả hai nhãn thì dùng chung blueprint; độ sâu (số ví dụ, chứng minh, biến thể) chọn theo luồng của học sinh.
2. Chọn ngôn ngữ panel: `cpp` hoặc `py`. Mặc định `cpp` cho `hsg`; với `ts10` chọn theo khoá học. Hỏi học sinh nếu chưa biết.
3. Chọn recipe: **bài thuật toán** (Blueprint dưới đây) hay **bài giải đề** (mục sau) khi học sinh muốn giải một đề cụ thể.
4. Dựng bài theo recipe, rồi gọi `generate_walkthrough` cho các trang interactive.

## Blueprint bài khó (ADR 0008)

Bài khó đi qua 12 giai đoạn: đề bài, ví dụ nhỏ, vét cạn và điểm nghẽn, quan sát then chốt, ý tưởng/bất biến/chứng minh, chạy tay, độ phức tạp, cài đặt C++/Python (đọc hiểu), biến thể, bẫy, kiểm tra, tổng kết. Gộp thành **6–8 scene**, trang đầu là `slide`:

| #   | Giai đoạn                                                               | Trang                                         |
| --- | ----------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Đề bài, giới hạn, ví dụ nhỏ                                             | `slide`                                       |
| 2   | Vét cạn và điểm nghẽn (đếm số phép tính)                                | `slide`                                       |
| 3   | Quan sát then chốt, ý tưởng, bất biến, chứng minh                       | `slide`                                       |
| 4   | Chạy tay từng bước; học sinh dự đoán rồi đổi preset để quan sát         | `interactive` (`generate_walkthrough`)        |
| 5   | Đọc C++/Python từng dòng theo bước (chỉ đọc)                            | `interactive` (`generate_walkthrough`, `panel`) |
| 6   | Độ phức tạp và biến thể                                                 | `slide`                                       |
| 7   | Bẫy thường gặp, dự đoán bước kế, kiểm tra                               | `quiz`                                        |
| 8   | Tổng kết, bài mở rộng (tuỳ chọn)                                        | `slide`                                       |

- Có 1–3 trang interactive tuỳ bài; không cố định "đúng 2".
- Trang 3 có tối đa 1 `discussion`, và `discussion` phải là action cuối của trang.
- **Tên scene** là hành động hoặc kết quả ("Chia đôi mảng, mid = 4"), không phải tên chủ đề ("Binary search"). **keyPoints** nêu điều học sinh cần để ý ("thấy `lo` và `hi` thu hẹp"), không phải định nghĩa.
- Lời thầy trỏ vào hình ("nhìn thanh màu cam", "để ý `mid`"); số trong lời nói phải có trên màn hình. Khái niệm chỉ dùng khi thuộc `prerequisites` của topic hoặc đã được định nghĩa trước đó trong bài.
- Trang quiz: câu dự đoán bước kế, điền bảng trace, chọn độ phức tạp, và 1 câu tự luận (AI chấm) về bẫy. Bẫy lấy từ `lessonKit.pitfalls`; bẫy có `lang` chỉ nói khi học sinh đang xem đúng ngôn ngữ đó (ví dụ tràn số chỉ cho `cpp`).
- Bài về nhà lấy từ `lessonKit.homework`. Đừng tự bịa id bài hay URL trên online judge.

## Bài giải đề

Khi học sinh muốn giải **một đề cụ thể** (walkthrough có `lessonKit.statement` và `subtasks`, ví dụ `bs-answer-mini`), dạy cách giải đề chứ không chỉ thuật toán. Đề là đề tự viết của catalog, không chép đề thi. Cũng 6-8 scene, trang đầu là `slide`:

| #   | Giai đoạn                                                        | Trang                                    | Nguồn                         |
| --- | ---------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| 1   | Đề, giới hạn, ví dụ; "đọc giới hạn trước"                        | `slide`                                  | `statement`, `constraints`    |
| 2   | **Thang subtask**: mỗi subtask một ý tưởng và độ phức tạp        | `slide` (bảng)                           | `subtasks`                    |
| 3   | Vét cạn cho subtask nhỏ; học sinh dự đoán, đếm phép tính         | `interactive` (preset nhỏ)               | `generate_walkthrough`        |
| 4   | Quan sát then chốt (đơn điệu, bất biến, cấu trúc con)            | `interactive` (panel `check`) hoặc `slide` | `generate_walkthrough`      |
| 5   | Lời giải đầy đủ chạy tay                                         | `interactive` (preset lớn)               | `generate_walkthrough`        |
| 6   | Vì sao đúng, điều kiện và biên                                   | `slide` (LaTeX)                          | `hints`, ý tưởng của subtask  |
| 7   | Đọc C++/Python và bẫy theo ngôn ngữ                              | `interactive` (`panel`: `cpp`/`py`)      | `generate_walkthrough`        |
| 8   | Kiểm tra (subtask nào vét cạn được? tự thiết kế test biên) và bài về nhà | `quiz`                           | `pitfalls`, `homework`        |

- Nếu có nhiều trang interactive thì mỗi trang là một lần `generate_walkthrough` (cùng `walkthroughId`, khác `presetId` hoặc `panel`); giữ tổng 6-8 scene, gộp cảnh 3-5 khi chỉ có một preset phù hợp.
- Cảnh 2 chép đúng `lessonKit.subtasks` (giới hạn, ý tưởng, độ phức tạp); đừng thêm subtask hay mốc điểm không có trong đó.
- `discussion` (nếu dùng) phải là action cuối của trang, như blueprint thuật toán.

## Topic chưa có walkthrough

Chỉ có walkthrough cho id trong bảng dưới. Với topic khác trong curriculum:

- Cảnh 4-5 của blueprint thay bằng **storyboard** (vài frame viết tay, mỗi frame một trạng thái, kiểm bất biến bằng tay) hoặc widget LLM sinh cho khái niệm định tính.
- Không bịa số liệu trace bằng widget LLM sinh; tính từng bước ra slide hoặc `wb_*` rồi tự đối chiếu bất biến.
- Nói rõ với user rằng topic đó chưa có bài trace tất định.


## Walkthrough có sẵn

Bảng sinh từ catalog bằng `pnpm exec tsx scripts/generate-skill-catalog.ts`; không sửa tay giữa hai dấu.

<!-- BEGIN GENERATED: walkthrough-ids -->
| walkthroughId | Title | presetId | Curriculum topics |
| --- | --- | --- | --- |
| `binary-search` | Binary search | `absent`, `mid-hit`, `first`, `single` | `t2-binary-search` |
| `bs-answer-mini` | Problem walkthrough: cutting wood (mini) | `classic`, `all-equal`, `one-tree`, `take-all`, `tiny-need` | `t2-binary-search` |
<!-- END GENERATED: walkthrough-ids -->

## Khi học sinh hỏi (Q&A)

Skill này chỉ tới agent workbench lúc soạn bài, **không tới chat agent**. Hành vi trả lời câu hỏi của học sinh nằm ở `describe()` của walkthrough (hints, misconceptions theo từng beat) và prompt chat (`lib/orchestration/prompt-builder.ts`, `lib/chat/pi/prompts.ts`), không cài trong skill này. Mục này chỉ nói bài soạn phải mang gì để phần đó chạy được.

Chat agent được dặn ở nơi khác (ADR 0008 Decision 6, CONTENT-DESIGN §4 điều 10) trả lời theo thang gợi ý:

1. Hỏi lại học sinh đang nghĩ gì.
2. Đưa `hints[0]`, rồi `hints[1]`, rồi `hints[2]`; chỉ đưa lời giải khi học sinh yêu cầu.
3. Câu hỏi khớp một `misconception` thì gọi tên hiểu lầm và cho phản ví dụ.
4. Phần dài dùng `wb_*`.

Vì vậy khi soạn bài:

- Mỗi beat của catalog đã có sẵn 3 `hints` theo mức tăng dần (gợi hướng, gợi bước, gần đáp án) và các `misconceptions`; Q&A dùng chúng qua `describe()`. `lessonKit.hints` là gợi ý nhẹ của từng beat để bạn tham khảo; đừng tự bịa gợi ý khác trong slide.
- **Không dán lời giải đầy đủ vào slide đầu** (trang 1-3 của blueprint): để học sinh còn gì để dự đoán và hỏi.
- Beat có câu hỏi dự đoán thì chạy tự động khi phát lời thầy (mỗi beat hỏi tối đa 2 lần đầu); bạn không cần dựng thêm trang để hỏi lại.
- `materialFacts` chỉ lấy từ `lessonKit` và catalog; hints và misconceptions do `describe()` cung cấp cho chat nên không cần chép lại thành lời giải trong slide.
- Phần dài (bảng trace, chứng minh, so sánh code) dùng whiteboard thay vì dán vào lời nói: `wb_draw_table`, `wb_draw_latex`, `wb_draw_shape`, `wb_draw_line`, `wb_draw_code`, `wb_draw_text`, `wb_draw_chart`. `wb_draw_code` chỉ để hiển thị cho đọc, không có chạy code.

## Khi user hỏi cả chuyên đề

Ví dụ "dạy em cả chuyên đề Quy hoạch động": đây là một **chuỗi bài**, không phải một stage.

1. Đọc `references/curriculum/index.json`. File này nhỏ: mỗi topic có `id`, `name_vi`, `name_en`, `tier`, `tracks`, `difficulty`, `prerequisites`; kèm `course_shape` (mỗi topic là một course 6-8 scene), `sequencing` (thứ tự đề xuất theo lớp) và `tracks_def`. Cần chi tiết một topic (subtopics, typical_problems, pitfalls, interactive_ideas) thì đọc `references/curriculum/tier-<N>.json` của đúng tier đó, đừng đọc cả bốn file.
2. Chọn topic theo chuỗi `prerequisites` (không chỉ theo tier: chuyên đề DP gồm `t3-dp-basic` và các topic `t4-dp-*`), lọc theo `tracks` của học sinh, sắp theo `sequencing`.
3. Làm theo skill `curriculum-planner`: hỏi làm rõ, đưa danh sách bài cho user duyệt trước khi dựng, rồi dựng từng stage theo skill này. Một topic = một stage.
4. Topic có `id` khớp cột "Curriculum topics" của bảng walkthrough thì dùng `generate_walkthrough`; topic khác theo mục "Topic chưa có walkthrough".
