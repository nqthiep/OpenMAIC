---
name: olympiad-math
title: "数学奥林匹克"
description: Olympiad and specialised-math lessons for Vietnamese students (grade 8-12) - inequalities, geometry, number theory, counting, sequences and calculus ideas. Plans the course as an eight-stage proof blueprint built around interactive walkthroughs (a figure the student can change with sliders, step by step, with prediction questions) plus slides and quizzes, with no code-practice pages. Use when the requirement is to teach a mathematical idea or a proof to a student who sees the figure, follows the steps, changes the numbers and answers prediction questions.
---

# Olympiad math course design

Dạy một ý tưởng hoặc một chứng minh Toán theo hướng **thấy hình, theo từng bước, tự đổi số và tự dự đoán**. Hình tương tác là trực giác; chứng minh chặt nằm ở bước sau.

## Nguyên tắc

- **Không tạo bài luyện code và không dùng widget `code`.** Luyện tập là câu hỏi dự đoán, điền bước chứng minh, chỉ chỗ sai (quiz).
- **Chứng minh, dựng hình, khảo sát hàm hoặc trực giác bằng hình thì gọi `generate_walkthrough`** với một `walkthroughId` trong bảng "Walkthrough có sẵn". Công cụ dựng trang và lời thầy tất định, không gọi LLM; tham số `{stageId, order, title, walkthroughId, presetId?, locale?}`. Gặp lỗi `invalid-walkthrough-id` hoặc `invalid-preset-id` thì dùng `validIds` / `validPresetIds` trong kết quả. Đừng tự mô phỏng bằng widget `simulation` khi đã có walkthrough cho topic đó.
- **Mọi định lý có ít nhất một hình minh hoạ** (walkthrough hoặc `wb_*`). Không phát biểu một định lý chỉ bằng chữ.
- **Mọi bước chứng minh theo bốn phần**: cho (giả thiết đang dùng), có (kết quả đã biết), do (lý do, định lý hoặc phép biến đổi), suy ra (kết luận của bước). Không nhảy bước.
- **Đừng chứng minh bằng một hình đặc biệt.** Hình chỉ cho trực giác; luôn nói "đây là trực giác, chứng minh chặt ở bước sau", và cho học sinh đổi số để thấy điều đó đúng ở nhiều trường hợp.
- Số liệu và công thức trong lời nói phải có trên màn hình và đúng. Không bịa số, không bịa nguồn, không bịa tên đề thi hay tài liệu.
- **Topic chưa có walkthrough**: dùng slide có công thức và `wb_*`, hoặc widget tương tác do LLM sinh cho khái niệm định tính (`simulation`, `diagram`). Nói rõ với user rằng topic đó chưa có hình tương tác dựng sẵn.
- Thứ tự dựng trang vẫn theo skill `stage-design`: lập kế hoạch, `create_stage`, `set_roster`, rồi từng trang theo thứ tự tăng dần.

## Luồng

1. Hỏi, hoặc suy ra từ yêu cầu, học sinh ở lớp nào và mục tiêu gì (thi vào lớp 10 chuyên, học sinh giỏi tỉnh/TP, đội tuyển). Chưa rõ thì hỏi một câu; đừng đoán.
2. Khi user muốn học cả một chuyên đề, dùng skill `curriculum-planner` và `references/curriculum/index.json` nếu thư mục đó đã có; chưa có thì lập kế hoạch theo yêu cầu của user và nói rõ chưa có curriculum chuẩn.
3. Dựng bài theo blueprint dưới đây; gọi `generate_walkthrough` cho các trang hình tương tác.

## Blueprint bài giảng Toán (8 giai đoạn)

Gộp thành **6–8 scene**, trang đầu là `slide`. Một bài dùng 1–3 walkthrough.

| #   | Giai đoạn                    | Trang                                                  | Lời thầy                                                             |
| --- | ---------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | Động cơ, bài toán            | `slide` (hình tĩnh)                                    | nêu bài toán, hỏi mở, học sinh dự đoán                               |
| 2   | Trực giác bằng hình tương tác | `interactive` từ `generate_walkthrough` (hình + preset) | ≤ 2 câu, xem hình, dừng hỏi dự đoán, đổi số, giải thích              |
| 3   | Phát biểu                    | `slide` (công thức, điều kiện, dấu bằng)               | chỉ vào điều kiện                                                    |
| 4   | Chứng minh từng bước         | `interactive` (walkthrough chứng minh)                 | từng bước cho / có / do / suy ra                                     |
| 5   | Ví dụ mẫu                    | `slide` và `wb_*`                                      | giải từng dòng, có thể một `discussion`                              |
| 6   | Biến thể và sai lầm          | `interactive` (phản ví dụ) và `quiz` "sai ở bước nào"  | phản hồi theo câu trả lời                                            |
| 7   | Kiểm tra                     | `quiz` (single, short_answer), ≥ 1 câu dự đoán         | —                                                                    |
| 8   | Tổng kết và mở rộng          | `slide`                                                | nhắc ý chính, gợi ý bài mở rộng                                      |

- Trang có `discussion` thì `discussion` phải là action cuối của trang.
- **Tên scene** là hành động hoặc kết quả ("Nửa đường tròn cho h² = ab"), không phải tên chủ đề ("Bất đẳng thức AM-GM").
- Lời thầy trỏ vào hình ("nhìn đoạn màu cam", "để ý điểm H"); khái niệm chỉ dùng khi đã định nghĩa hoặc thuộc kiến thức nền của lớp đó.

## Quy tắc hình tương tác

- Một walkthrough một ý. Mỗi bước (beat) có lời thầy, một câu hỏi dự đoán khi hợp lý, và ba gợi ý từ nhẹ tới gần lời giải.
- Học sinh đổi biến thể bằng preset dựng sẵn hoặc bằng thanh trượt trong giới hạn của entry; đổi số là cách kiểm tra trực giác, không phải bằng chứng.
- Chữ trong hình ngắn (nhãn, công thức); lời giải thích nằm ở lời thầy.

## Khi học sinh hỏi (Q&A)

Skill này chỉ tới agent workbench lúc soạn bài, **không tới chat agent**. Khi học sinh dừng ở một bước, phần trả lời lấy từ `describe()` của walkthrough (bước, cái đang hiện, công thức, hiểu lầm hay gặp) chứ không đọc chữ trong slide. Bài soạn chỉ cần dùng đúng `generate_walkthrough` để phần đó chạy được.

## Walkthrough có sẵn

Bảng sinh từ catalog bằng `pnpm exec tsx scripts/generate-skill-catalog.ts`; không sửa tay giữa hai dấu.

<!-- BEGIN GENERATED: walkthrough-ids -->
| walkthroughId | Title | presetId | Curriculum topics |
| --- | --- | --- | --- |
| `alg-identity-area` | Algebraic identities as areas | `sum-3-2`, `sum-1-1`, `diff-5-2`, `diff-9-1` | `m1-alg-identities` |
| `amgm-semicircle` | AM–GM on a semicircle | `two-eight`, `equal`, `far`, `nine-sixteen` | `m1-inequality-basic` |
| `cauchy-schwarz` | The Cauchy–Schwarz inequality (two pairs) | `generic`, `proportional`, `zero`, `negative` | `m2-inequality-classic` |
| `cs-projection` | Cauchy–Schwarz by projection | `generic`, `parallel`, `perpendicular`, `opposite` | `m2-inequality-classic` |
| `curve-sketching` | Sketching a polynomial graph (degree at most 3) | `cubic`, `square`, `pure-cubic`, `neg-cubic` | `m3-derivative-graphs` |
| `euclid-rectangle` | The Euclidean algorithm with squares | `48-18`, `equal`, `coprime`, `one` | `m2-euclid-diophantine` |
| `geometric-series-area` | A geometric series as areas | `half`, `third`, `quarter` | `m3-sequences-limits` |
| `pythagoras-dissection` | The Pythagorean theorem by dissection | `three-four`, `equal`, `thin`, `six-eight` | `m1-triangle-geometry` |
| `secant-tangent` | From the secant to the tangent | `square-at-1`, `cubic-at-0`, `stationary`, `quad-at-minus-1` | `m3-derivative-graphs` |
| `triangle-altitude` | The three altitudes of a triangle and the orthocenter | `acute`, `obtuse`, `right`, `isosceles` | `m1-triangle-geometry` |
<!-- END GENERATED: walkthrough-ids -->
