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

1. Hỏi, hoặc suy ra từ yêu cầu, học sinh thuộc luồng **`ts10`** (thi vào lớp 10 chuyên Tin) hay **`hsg`** (học sinh giỏi). Chọn topic và độ sâu theo luồng đó.
2. Chọn ngôn ngữ panel: `cpp` hoặc `py`. Mặc định `cpp` cho `hsg`; với `ts10` chọn theo khoá học.
3. Dựng bài theo blueprint dưới đây, rồi gọi `generate_walkthrough` cho các trang interactive.

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
- **Bài giải đề** (đề thi cụ thể): dùng biến thể có thang subtask, lấy từ `lessonKit.subtasks`.
- **Tên scene** là hành động hoặc kết quả ("Chia đôi mảng, mid = 4"), không phải tên chủ đề. **keyPoints** nêu điều học sinh cần để ý ("thấy `lo` và `hi` thu hẹp"), không phải định nghĩa.

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
