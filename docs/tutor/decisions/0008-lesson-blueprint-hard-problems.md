# ADR 0008: Khung bài giảng cho bài khó — blueprint 12 giai đoạn, học sinh dự đoán và đổi input để quan sát, C++ và Python chỉ-đọc

- **Status**: Accepted (sửa 2026-09-30 theo giải thích của user; sửa lần 2 ngày 2026-09-30 sau review sư phạm; quyết định bằng SWOT)
- **Date**: 2026-09-29; sửa 2026-09-30
- **Deciders**: User (yêu cầu gốc: bài rất khó → "rõ ràng, chi tiết, dễ hiểu, trực quan, sinh động"; giải thích: không có code editor, nhưng **interactive + visualizer** là để dễ hiểu; chọn "C++ và Python") + Architect panel
- **Liên quan**: [0003](0003-no-code-execution.md), [0006](0006-deterministic-trace-catalog.md), [0012](0012-audience-scope-pedagogy-gates.md), [0013](0013-provider-scene-lifecycle.md), [../CONTENT-DESIGN](../CONTENT-DESIGN.md), [../TEST-STRATEGY](../TEST-STRATEGY.md)

> **Tóm tắt:**
> - Khung dạy bài khó gồm 12 giai đoạn (8 hàng scene), có thêm **bài giải đề** (ADR 0012).
> - Học sinh **đổi input để quan sát**: preset trước, nhập tuỳ chỉnh sau khi preset chạy ổn.
> - Học sinh **học chủ động**: chế độ dự đoán trong widget, luyện tập không cần editor (điền bảng trace, sắp dòng code, tìm dòng sai).
> - Thầy dạy kèm bằng **thang gợi ý** và danh sách hiểu lầm cho từng beat.
> - Code **C++ và Python** để đọc hiểu.
> - Rubric đo được cho "rõ ràng, chi tiết, dễ hiểu, trực quan, sinh động"; eval Q&A chấm "gợi ý trước, bám đúng frame".

## Context

Bản trước chỉ có *hạ tầng widget*, không có khung *cách dạy* một bài khó (kiểm toán R1: "Đạt một phần"). `curriculum-map.json` có `course_shape.scene_recipe_vi`; đối chiếu với yêu cầu (đã làm rõ ở ADR 0003):

- **Trái yêu cầu (đã sửa):** "Cảnh 6 – code: luyện bài chuẩn mực đầu tiên có gợi ý" và `scene_mix` chứa `"code"` — đó là bài luyện code trong ứng dụng. Ngoài ra `code` **không phải `SceneType`** (`packages/@openmaic/dsl/src/stage.ts:22`: chỉ `slide|quiz|interactive|pbl`) và không có code nào đọc `course_shape` (grep toàn repo) nên chỉ là gợi ý.
- **Đúng ý user (giữ, trước đây tôi hiểu nhầm là vi phạm):** "Cảnh 3 – interactive: mô phỏng từng bước thuật toán, cho học sinh **đổi tham số và quan sát**".
- Cảnh 4 nhồi cài đặt + độ phức tạp + biến thể vào một slide (tách ra).

Dữ liệu curriculum (đếm bằng script): 64 `interactive_ideas` (37 chỉ xem, 16 chọn trong tập hữu hạn, 11 nhập tự do — [Inference] phân loại thủ công); ≥28/127 `pitfalls` (22%, 20/32 topic; đếm bằng regex) là mức C++/judge (tràn int, `1<<n`, `priority_queue` là max-heap, comparator, `lower_bound`…); `audience.assumed_prior` giả định C++17.

## Decision 1 — Blueprint bài giảng (problem-centric)

12 giai đoạn dạy: đề bài → ví dụ nhỏ → vét cạn và điểm nghẽn → quan sát then chốt → ý tưởng/bất biến/chứng minh → chạy tay → độ phức tạp → cài đặt C++/Python (đọc hiểu) → biến thể → bẫy → kiểm tra → tổng kết. Chúng được **gộp thành 8 hàng scene** trong bảng dưới. **Bài giải đề** (ADR 0012) dùng biến thể có thang subtask: [CONTENT-DESIGN §3.2](../CONTENT-DESIGN.md).

Mỗi bài/thuật toán khó đi qua chuỗi giai đoạn sau; mỗi giai đoạn ánh xạ tới scene/widget/hành động có sẵn của OpenMAIC:

| # | Giai đoạn | Scene / widget | Thầy |
| --- | --- | --- | --- |
| 1 | Đề bài + giới hạn + ví dụ nhỏ | slide | speech, spotlight; hỏi mở "n ≤ 10⁵ gợi ý gì?" |
| 2 | Vét cạn và điểm nghẽn (đếm số phép tính) | slide (chart) | speech |
| 3 | Quan sát then chốt → ý tưởng, bất biến, chứng minh | slide (LaTeX) | câu hỏi mở trong speech; `discussion` phải là action cuối; nguồn cho phép 1–2 lần mỗi khoá (`slide-actions/system.md:116-117`), recipe của ta chọn **tối đa 1** |
| 4 | Chạy tay từng bước, **học sinh dự đoán rồi đổi input để quan sát** | interactive `walkthrough` (preset; nhập input từ 1d) | `[ask/predict] → widget_setState{preset,frame} → speech` theo beat (ADR 0006 §2, Decision 5) |
| 5 | Đọc C++/Python từng dòng theo bước (chỉ đọc); sắp dòng/tìm dòng sai | interactive `walkthrough`, tab code | `widget_setState{frame, panel}` |
| 6 | Độ phức tạp + biến thể | slide | speech |
| 7 | Bẫy thường gặp (từ `pitfalls`) + dự đoán bước kế + kiểm tra | quiz (single/short_answer, AI chấm `aiComment`) | phản hồi sau khi nộp |
| 8 | Tổng kết + bài mở rộng (tuỳ chọn) | slide | speech |

**Interactive linh hoạt**: 1–3 scene interactive tuỳ bài (walkthrough là mặc định cho trace số liệu; với topic chưa có walkthrough dùng storyboard hoặc widget `simulation`/`diagram`/`game`/`visualization3d` do LLM sinh — ADR 0006 §5). Không giới hạn cứng "đúng 2".

**Q&A xuyên suốt**: học sinh hỏi bất kỳ lúc nào; thầy thấy frame hiện tại (ADR 0009) và đáp bằng speech + `wb_draw_table/shape/line/latex/code` (`cpp` được hỗ trợ). Lưu ý: trong bài giảng sinh sẵn `wb_*` **không** được kịch bản hoá (scene interactive chỉ có `widget_*`; slide chỉ có spotlight/laser/play_video/discussion) — `wb_*` chỉ xuất hiện ở Q&A trực tiếp hoặc khi agent dùng `patch_stage`.

**Recipe mới** (thay `course_shape` trong curriculum; đã áp dụng ở `docs/tutor/curriculum/`): 6–8 scene, `scene_mix` = `["slide","interactive","quiz"]` (bỏ `code`), cảnh 4–5 là interactive. Topic không có walkthrough: cảnh 4–5 thay bằng storyboard hoặc widget LLM sinh; Q&A dùng `wb_*`.

## Decision 2 — Học sinh đổi input để quan sát (không phải viết code)

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| (1) Input cố định | Đơn giản. | Một chiều; kém sinh động; 27/64 ý tưởng của curriculum có chọn/nhập. | — | Học sinh không thử được trường hợp của mình. |
| **(2) Preset tính sẵn (chọn, mặc định)** | Không cần tính ở client; export/offline chắc chắn; có tiền lệ `presets` (`simulation-content/system.md`); phủ trường hợp điển hình (đã sắp / đảo ngược / ngẫu nhiên / biên). | Payload nhân lên; không thử tuỳ ý. | Câu hỏi "dự đoán bước kế". | Vượt trần payload (≤6 preset, ≤300 frame tổng/entry). |
| **(3) Nhập input tuỳ chỉnh, chạy phía client (chọn, thêm ở lát 1d)** | Đúng ý "đổi tham số và quan sát"; giống mọi trang visualizer giải thuật; chạy trong iframe sandbox không mạng nên an toàn; `steps()` vẫn là hàm thuần có test. | Phải nhúng `steps` của entry vào widget (module nhỏ theo entry); validator phải chạy cả server lẫn iframe; cần test tương đương server/client. | Nhập input tự do cho 11/64 ý tưởng. | Input lớn/độc → chặn bằng `inputSpec` (kích thước, miền), `maxFrames` (`RangeError` → báo "input quá lớn"). |
| (4) Nhập input, server tính | Dùng lại `steps()` trên server. | iframe null-origin gọi API (CORS/auth) hoặc host trung gian; mất export/offline. | — | Bề mặt API mới. |

**Chọn (2) làm nền và (3) làm lớp bổ sung** (lát 1d, ADR 0004) — **user xác nhận 2026-09-30: (3) chỉ làm sau khi phần chọn preset chạy ổn** (cổng: ADR 0012 quyết định 7): học sinh chọn preset hoặc nhập input trong giới hạn của `inputSpec` (ADR 0006 §7). Khi nhập tuỳ chỉnh, runtime báo `widget-state` kèm `input` đã kiểm để server tính lại frame cho Q&A (ADR 0009). Trigger sang (4): cần tính nặng không chạy được ở client → ADR riêng. Ngoại lệ: slider `n → bậc O` của `t1-complexity` là hàm hằng, tính ở client.

## Decision 3 — Hiển thị code (sửa 2026-09-30: user chọn "C++ và Python")

| Phương án | S | W | O | T |
| --- | --- | --- | --- | --- |
| (a) Chỉ pseudocode | Gọn. | ≥22% pitfalls là mức C++; pseudocode không biểu diễn được; học sinh thi bằng C++. | — | Hiểu ý tưởng nhưng vấp cài đặt. |
| (b) Pseudocode + C++, highlight theo bước (bản trước) | Ý tưởng và hiện thực tách bạch; bẫy hiện đúng dòng. | Chỉ một ngôn ngữ cài đặt. | — | Rào cản cho học sinh THCS học Python [Unverified]. |
| **(b') Pseudocode + C++ + Python, highlight theo bước (chọn)** | Như (b), và phục vụ cả học sinh học Python; cùng một pseudocode nên ý tưởng không đổi. | Ba bản phải khớp nhau; bẫy khác nhau theo ngôn ngữ. | CI chạy thử hai bản cài đặt trên preset rồi so kết quả cuối với `steps()`. Job riêng, cần `g++`/`python3` trên runner [Unverified]; nếu không có thì duyệt tay. | Bản cài đặt lệch trace → `map` toàn phần cho từng ngôn ngữ + test. |
| (c) Code thay pseudocode | Một bản. | STL/cú pháp làm mờ ý tưởng; highlight khó hơn. | — | — |

**Chọn (b').**
- `codeLine` của frame vẫn trỏ vào pseudocode. `code.map.cpp` và `code.map.py` ánh xạ dòng pseudo → dòng cài đặt, toàn phần, có test. Không id từng dòng (`data-line`).
- Panel là `'pseudo' | 'cpp' | 'py'`. Mặc định `cpp` cho luồng `hsg`; với luồng `ts10` tác giả chọn theo khoá.
- Bẫy có nhãn `lang` để lời thầy chỉ nói bẫy của ngôn ngữ đang xem. Ví dụ: "tràn số khi `(lo+hi)/2`" chỉ có ở C++; `//` và `sys.setrecursionlimit` chỉ có ở Python.
- Pascal ngoài phạm vi.
- Tab code là **công cụ giải thích** (đọc hiểu): không có ô nhập, không chạy (ADR 0003).

## Decision 4 — Nguồn giải thích: xem ADR 0006 (dữ kiện do hàm thuần sinh; lời thầy kịch bản; LLM chỉ chọn id + input).

## Decision 5 — Học chủ động: dự đoán và luyện tập không cần editor (thêm 2026-09-30)

**Bối cảnh (đã đọc code):**
- `ask` trong kịch bản được đọc lên rồi `widget_setState` hiện đáp án ngay, không chờ học sinh.
- `discussion` phải là action **cuối** và tối đa 1–2 lần mỗi khoá (`packages/@openmaic/generation/templates/slide-actions/system.md:116-117`).
- Không có action "chờ học sinh trả lời"; union action nằm trong package (`packages/@openmaic/dsl/src/action.ts`).
- Engine phát action nằm ở app (`lib/action/engine.ts`).
- Quiz có sẵn `single`, `multiple`, `short_answer` (`packages/@openmaic/dsl/src/stage.ts:198`).

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Hỏi để nói cho có (bản cũ) | Không sửa gì. | Học sinh xem thụ động; rubric đếm câu *được hỏi*, không đếm câu *được trả lời*. | — | "Sinh động" thành trình chiếu. |
| Thêm action mới "chờ trả lời" | Rõ nghĩa. | Đổi union action trong `@openmaic/dsl` (package). | — | Trái ADR 0005. |
| **Chế độ dự đoán trong widget + engine chờ có giới hạn (chọn)** | Không đổi package: dùng `widget_setState{predict}` có sẵn; engine ở app chờ `widget-state{prediction}` hoặc hết giờ. | Sửa `executeWidgetSetState` (`lib/action/engine.ts:881-886`); cần xử lý silent mode/export. | Ghi được kết quả dự đoán để thầy dạy kèm. | Học sinh bỏ qua → nút "Bỏ qua" + hết giờ. |

**Quyết định:**
1. **Dự đoán khi đang giảng (1c):**
   - Beat có `ask.predict = {kind:'choice'|'pointer', options?, answerFrom:'next-frame'}` sinh `widget_setState{preset, frame, predict:{beatId}}`.
   - Runtime hiện lựa chọn (ví dụ "lo hay hi đổi?"), tự chấm bằng frame kế tiếp, rồi báo `widget-state{prediction:{beatId, correct}}`.
   - Engine chờ báo về, **tối đa 20 s** hoặc tới khi học sinh bấm "Bỏ qua", rồi mới phát tiếp. Silent mode và export MP4 không chờ.
   - Spike **Q9**: hành vi với nút tạm dừng/tua, resume, chat mở giữa chừng.
2. **Dự đoán khi tự học:** khi học sinh tự tua, ở mỗi beat có `ask` runtime hiện câu hỏi trước khi cho đi tiếp (tắt được).
3. **Luyện tập không cần editor**, đều không chạy code của học sinh:

   | Dạng | Ở đâu | Chấm |
   | --- | --- | --- |
   | Điền bảng trace (giá trị `lo/hi/mid` sau bước k) | quiz `short_answer` hoặc bảng trong walkthrough | so với frame (tất định) |
   | Sắp lại dòng code (Parsons) | walkthrough panel code, chế độ `order` | so thứ tự với `impl` |
   | Tìm dòng sai trong code chỉ-đọc | walkthrough, chọn dòng | so với dòng bẫy trong `pitfalls` |
   | Chọn độ phức tạp từ giới hạn đề | quiz `single` | đáp án |
   | Tự thiết kế test biên | quiz `short_answer` | AI chấm (`aiComment`) |

4. **Bài tập về nhà:** `lessonKit.homework[]` trỏ tới bài trên online judge (ví dụ VNOJ) theo `typical_problems`. Id bài cụ thể do hội đồng LLM đề xuất kèm nguồn (URL bài); hiện curriculum chưa có id.

## Decision 6 — Dạy kèm khi học sinh hỏi (thêm 2026-09-30)

- **Thang gợi ý:** mỗi `beatDef` có `hints: [nhẹ, vừa, gần lời giải]` và `misconceptions[]`. `describe()` đưa hai thứ này vào ngữ cảnh của thầy (ADR 0009).
- **Quy tắc trong `SKILL.md`** ("khi học sinh hỏi"):
  - Hỏi lại học sinh đang nghĩ gì.
  - Đưa gợi ý mức 1 trước; chỉ đưa lời giải khi học sinh yêu cầu hoặc đã qua mức 3.
  - Luôn bám frame hiện tại.
  - Dùng `wb_*` cho phần dài.
- **Độ dài:** lời thầy khi Q&A bị giới hạn khoảng 100 ký tự (`lib/orchestration/prompt-builder.ts:186`); action không tính vào giới hạn (`:182`). Với scene walkthrough, `buildLengthGuidelines` dùng ngân sách **"tutor"** khoảng 300 ký tự, cộng `wb_*` cho phần dài. Đây là sửa ở tầng app (`lib/orchestration/prompt-builder.ts`), đo bằng `eval:tutor-qa` [Inference].
- **Kênh `wb_*` tới chat agent:** spike S2b chuyển vào lát 1c (trước đây ở Phase 2).
- **Học sinh mang đề riêng tới hỏi:** ngoài phạm vi Phase 1–2. Thầy trả lời bằng chat + `wb_*` như hiện có, không có walkthrough cho đề lạ (ADR 0006 §5).

## Rubric đo được cho "rõ ràng, chi tiết, dễ hiểu, trực quan, sinh động"

**Tự động** (vitest `tests/tutor/`, không LLM):
- Cấu trúc: 6–8 scene; 1–3 interactive; scene đầu là slide; không widget `code`.
- Frame: 100% có `explanation` ≤160 ký tự và `codeLine` hợp lệ; ≥90% có highlights hoặc pointers; số frame trong khoảng entry khai báo (mặc định 8–120; trần cứng 500); 5–10 beats.
- Khớp state: mọi số/nhãn trong `explanation` thuộc state ∪ pointers.
- Kỹ thuật: `code.map` toàn phần; số id ≤ 60 (`extractInteractiveElements`); ≥4 preset gồm ≥1 biên; `steps()` chạy giống nhau trên server và trong runtime (test tương đương) khi `customInput` bật.
- Phủ: 32/32 topic có một loại trực quan (walkthrough, storyboard, widget LLM sinh, hoặc slide + `wb_*`).

**LLM-judge** (`eval/tutor-lesson/`, mẫu `eval/outline-language`), thang 1–5 có mô tả neo, N=3 mẫu, ngưỡng đạt ≥70% mẫu (mặc định `EVAL_PASS_THRESHOLD` 0.7 của repo; với N=3 nghĩa là phải đạt **3/3** vì 2/3 = 0,67): Đúng (cổng cứng, 0 lỗi sự thật so với `materialFacts`); Rõ ràng ≥4 (quan sát then chốt ≤2 câu); Chi tiết ≥4 (có "vì sao đúng", ví dụ số, biên); Dễ hiểu ≥4 (thuật ngữ được định nghĩa trước khi dùng; chỉ dùng khái niệm thuộc `prerequisites`); Trực quan ≥4 (lời thầy trỏ đúng khung hình); Sinh động ≥3,5 (≥1 câu hỏi dự đoán **có chờ trả lời** mỗi 3 scene, Decision 5). Các ngưỡng số là đề xuất [Inference], hiệu chỉnh sau lần chạy đầu.

**Eval Q&A** (`eval:tutor-qa`, sửa 2026-09-30). Bản cũ đo `leads_with_answer ≥ 0,7`, mâu thuẫn với nguyên tắc "hỏi trước, giải thích sau", nên đã bỏ. Học sinh hỏi tại frame k, ví dụ "vì sao bước k…" hoặc "em không hiểu". Chấm:
- **Đúng** (cổng cứng, 0 lỗi sự thật so với frame/catalog).
- **Bám frame** ≥ 90%: nhắc đúng giá trị biến của frame k.
- **Gợi ý trước** ≥ 80% với câu hỏi dạng "làm sao…": lượt đầu không đưa trọn lời giải.
- **Dùng hiểu lầm đúng** khi câu hỏi khớp một `misconception`.
- A/B có và không có `describe()` trong ngữ cảnh.

**Cổng sư phạm G1/G2** bằng hội đồng LLM và học sinh mô phỏng, rồi số đo học sinh thật sau phát hành: ADR 0012 §6, ADR 0014.

## Consequences

**Positive:**
- "Bài khó rõ ràng, chi tiết, trực quan, sinh động" thành một khung dạy có thể kiểm tra.
- Học sinh đổi input để quan sát, dự đoán, và luyện đọc code.
- Có C++ và Python để đọc hiểu.
- Thầy dạy kèm theo thang gợi ý.

**Negative:**
- Thêm công viết: preset, C++, Python, hai `map`, `beatDefs` kèm gợi ý/hiểu lầm, `inputSpec`, bài giải đề.
- Thêm module `run` nhúng theo entry cho chế độ nhập tuỳ chỉnh.
- Sửa engine ở app để chờ dự đoán (Q9).
- `wb_*` không kịch bản hoá được trong bài sinh sẵn.

**Unverified:**
- LLM có tuân recipe/`sceneCount` hay không.
- Kích thước payload.
- `g++`/`python3` có trong CI hay không.
- Chất lượng tiếng Việt khi bật lời thầy do LLM.
- Thể thức đề thi vào 10 chuyên Tin.
