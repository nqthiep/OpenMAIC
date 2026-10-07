---
name: olympiad-math
title: "数学奥林匹克"
description: Olympiad and specialised-math lessons for Vietnamese students (grade 8-12) - inequalities, geometry, number theory, counting, sequences and calculus ideas. Plans the course as an eight-stage proof blueprint built around short silent Manim clips (visual intuition) plus slides, walkthroughs and quizzes, with no code-practice pages. Use when the requirement is to teach a mathematical idea or a proof to a student who watches the figure, follows the steps and answers prediction questions.
---

# Olympiad math course design

Dạy một ý tưởng hoặc một chứng minh Toán theo hướng **thấy hình, theo từng bước, tự dự đoán**. Hình động là trực giác; chứng minh chặt nằm ở bước sau.

## Nguyên tắc

- **Không tạo bài luyện code và không dùng widget `code`.** Luyện tập là câu hỏi dự đoán, điền bước chứng minh, chỉ chỗ sai (quiz).
- **Hình động thì gọi `generate_clip_scenes`** với một `clipId` trong bảng bên dưới. Công cụ chèn mỗi chapter của clip thành một trang, kèm lời thầy dựng sẵn, không gọi LLM. Tham số: `{stageId, afterOrder, clipId, presetId?, locale?}`; các trang phía sau tự dời xuống. Lỗi `invalid-clip-id` hoặc `invalid-preset-id` thì dùng `validIds` / `validPresetIds`; lỗi `clip-not-prebuilt` nghĩa là clip chưa được dựng, chuyển sang slide hoặc `wb_*` và nói rõ với user.
- **Chứng minh, dựng hình hoặc khảo sát hàm từng bước thì gọi `generate_walkthrough`** với một `walkthroughId` trong bảng "Walkthrough có sẵn". Công cụ dựng trang và lời thầy tất định, không gọi LLM; tham số `{stageId, order, title, walkthroughId, presetId?, locale?}`. Gặp lỗi `invalid-walkthrough-id` hoặc `invalid-preset-id` thì dùng `validIds` / `validPresetIds` trong kết quả. Đừng tự mô phỏng bằng widget `simulation` khi đã có walkthrough cho topic đó.
- **Mọi định lý có ít nhất một hình minh hoạ** (clip, walkthrough hoặc `wb_*`). Không phát biểu một định lý chỉ bằng chữ.
- **Mọi bước chứng minh theo bốn phần**: cho (giả thiết đang dùng), có (kết quả đã biết), do (lý do, định lý hoặc phép biến đổi), suy ra (kết luận của bước). Không nhảy bước.
- **Đừng chứng minh bằng một hình đặc biệt.** Clip chỉ cho trực giác; luôn nói "đây là trực giác, chứng minh chặt ở bước sau".
- Số liệu và công thức trong lời nói phải có trên màn hình và đúng. Không bịa số, không bịa nguồn, không bịa tên đề thi hay tài liệu.
- **Topic chưa có clip hoặc walkthrough**: dùng slide có công thức và `wb_*`, hoặc widget tương tác do LLM sinh cho khái niệm định tính (`simulation`, `diagram`). Nói rõ với user rằng topic đó chưa có hình động dựng sẵn.
- Thứ tự dựng trang vẫn theo skill `stage-design`: lập kế hoạch, `create_stage`, `set_roster`, rồi từng trang theo thứ tự tăng dần.

## Luồng

1. Hỏi, hoặc suy ra từ yêu cầu, học sinh ở lớp nào và mục tiêu gì (thi vào lớp 10 chuyên, học sinh giỏi tỉnh/TP, đội tuyển). Chưa rõ thì hỏi một câu; đừng đoán.
2. Khi user muốn học cả một chuyên đề, dùng skill `curriculum-planner` và `references/curriculum/index.json` nếu thư mục đó đã có; chưa có thì lập kế hoạch theo yêu cầu của user và nói rõ chưa có curriculum chuẩn.
3. Dựng bài theo blueprint dưới đây; gọi `generate_clip_scenes` cho các trang hình động.

## Blueprint bài giảng Toán (8 giai đoạn)

Gộp thành **6–8 scene**, trang đầu là `slide`. Một bài dùng 1–3 clip, tổng thời lượng clip khoảng 4 phút trở xuống.

| #   | Giai đoạn                    | Trang                                              | Lời thầy                                                             |
| --- | ---------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Động cơ, bài toán            | `slide` (hình tĩnh)                                | nêu bài toán, hỏi mở, học sinh dự đoán                               |
| 2   | Trực giác bằng hình động     | `slide` từ `generate_clip_scenes` (clip 20–45 s)   | ≤ 2 câu, xem chapter 1, dừng hỏi dự đoán, chapter 2, giải thích      |
| 3   | Phát biểu                    | `slide` (công thức, điều kiện, dấu bằng)           | chỉ vào điều kiện                                                    |
| 4   | Chứng minh từng bước         | clip khung (45–90 s) hoặc `interactive`            | từng bước cho / có / do / suy ra                                     |
| 5   | Ví dụ mẫu                    | `slide` và `wb_*`                                  | giải từng dòng, có thể một `discussion`                              |
| 6   | Biến thể và sai lầm          | clip phản mẫu (10–25 s) và `quiz` "sai ở bước nào" | phản hồi theo câu trả lời                                            |
| 7   | Kiểm tra                     | `quiz` (single, short_answer), ≥ 1 câu dự đoán     | —                                                                    |
| 8   | Tổng kết và mở rộng          | `slide`                                            | nhắc ý chính, gợi ý bài mở rộng                                      |

- Trang có `discussion` thì `discussion` phải là action cuối của trang.
- **Tên scene** là hành động hoặc kết quả ("Nửa đường tròn cho h² = ab"), không phải tên chủ đề ("Bất đẳng thức AM-GM").
- Lời thầy trỏ vào hình ("nhìn đoạn màu cam", "để ý điểm H"); khái niệm chỉ dùng khi đã định nghĩa hoặc thuộc kiến thức nền của lớp đó.

## Quy tắc clip

Các con số dưới đây là [Inference] cho tới khi có dữ liệu thử:

- Một clip một ý (kết luận ≤ 1 câu). Trực giác 20–45 s; khung chứng minh 45–90 s; phản mẫu 10–25 s.
- Mỗi chapter một trang và một file; cuối chapter giữ khung chốt ≥ 1,5 s. Chữ trên màn ≤ 12 token.
- Sau mỗi 2 chapter có ít nhất một câu hỏi dự đoán (chapter có `ask` đã có sẵn trong lời thầy dựng sẵn).
- Học sinh đổi biến thể bằng cách chọn preset dựng sẵn (3–5 preset); tham số tự do chưa bật.

## Khi học sinh hỏi (Q&A)

Skill này chỉ tới agent workbench lúc soạn bài, **không tới chat agent**. Khi học sinh dừng giữa clip, phần trả lời lấy từ `describe()` của clip (chapter, cái đang hiện, công thức, hiểu lầm hay gặp) chứ không đọc chữ trong slide. Bài soạn chỉ cần dùng đúng `generate_clip_scenes` để phần đó chạy được.

## Walkthrough có sẵn

Bảng sinh từ catalog bằng `pnpm exec tsx scripts/generate-skill-catalog.ts`; không sửa tay giữa hai dấu.

<!-- BEGIN GENERATED: walkthrough-ids -->
| walkthroughId | Title | presetId | Curriculum topics |
| --- | --- | --- | --- |
| `cauchy-schwarz` | The Cauchy–Schwarz inequality (two pairs) | `generic`, `proportional`, `zero`, `negative` | `inequality-classic` |
| `curve-sketching` | Sketching a polynomial graph (degree at most 3) | `cubic`, `square`, `pure-cubic`, `neg-cubic` | `derivative-graphs` |
| `triangle-altitude` | The three altitudes of a triangle and the orthocenter | `acute`, `obtuse`, `right`, `isosceles` | `triangle-geometry` |
<!-- END GENERATED: walkthrough-ids -->

## Clip có sẵn

Bảng sinh từ catalog bằng `pnpm exec tsx scripts/generate-skill-catalog.ts`; không sửa tay giữa hai dấu. Clip chỉ dùng được sau khi đã được dựng (render); chưa dựng thì công cụ trả `clip-not-prebuilt`.

<!-- BEGIN GENERATED: clip-ids -->
| clipId | Title | presetId | Chapters | Curriculum topics |
| --- | --- | --- | --- | --- |
| `alg-identity-area` | Algebraic identities as areas | `sum-3-2`, `sum-1-1`, `diff-5-2`, `diff-9-1` | `figure`, `decompose`, `rearrange`, `formula` | `alg-identities` |
| `amgm-semicircle` | AM–GM on a semicircle | `two-eight`, `equal`, `far`, `nine-sixteen` | `setup`, `height`, `compare`, `equality` | `inequality-basic` |
| `cs-projection` | Cauchy–Schwarz by projection | `generic`, `parallel`, `perpendicular`, `opposite` | `vectors`, `projection`, `inequality`, `equality` | `inequality-classic` |
| `figurate-sums` | Sums with dots: odd and triangular numbers | `odd-4`, `odd-2`, `natural-5`, `natural-10` | `dots`, `grow`, `count`, `induction` | `induction` |
| `secant-tangent` | From the secant to the tangent | `square-at-1`, `cubic-at-0`, `stationary`, `quad-at-minus-1` | `curve`, `secant`, `limit`, `tangent` | `derivative-graphs` |
<!-- END GENERATED: clip-ids -->
