# Thiết kế nội dung dạy

- **Trạng thái**: Accepted — rubric và ngưỡng là đề xuất (`[Inference]`) cho tới khi có eval đầu tiên và cổng G1 (sửa 2026-09-30 theo review sư phạm và quyết định của user: hai luồng, bài giải đề, C++ + Python, lời thầy riêng với clip)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án (nội dung)
- **Liên quan**: [ADR 0006](decisions/0006-deterministic-trace-catalog.md), [ADR 0007](decisions/0007-manim-and-math-visualization.md), [ADR 0008](decisions/0008-lesson-blueprint-hard-problems.md), [ADR 0012](decisions/0012-audience-scope-pedagogy-gates.md), [Phase 2 §2](phase-2-competitive-programming/SCHEMA.md), [Phase 3 §3–§6](phase-3-olympiad-math/SCHEMA.md), [TEST-STRATEGY §6](TEST-STRATEGY.md)

> **Tóm tắt:** tài liệu miền: **dạy thế nào** để bài khó thành *rõ ràng, chi tiết, dễ hiểu, trực quan, sinh động* mà học sinh **không viết/chạy code**. Gồm:
> - hai luồng học sinh (`ts10`, `hsg`);
> - khung bài **thuật toán** và bài **giải đề** cho Tin, khung bài Toán;
> - học chủ động (dự đoán, luyện tập không editor) và dạy kèm theo thang gợi ý;
> - quy tắc viết lời thầy; quy ước code chỉ-đọc C++ và Python;
> - hướng dẫn tác giả, rubric và quy trình duyệt bằng **hội đồng LLM** và cổng G1/G2 (ADR 0014).
>
> Đây là tài liệu **tác giả nội dung** dùng hằng ngày.

## 1. Đối tượng và mục tiêu

| Mục | Nội dung |
| --- | --- |
| Người học | Hai luồng (ADR 0012). `ts10`: học sinh lớp 8–9 thi vào lớp 10 chuyên Tin (tier 1, tier 2, `t3-greedy`). `hsg`: học sinh ôn HSG tỉnh/QG, đội tuyển (tier 2–4). Toán: tương tự theo curriculum Toán |
| Đã biết | Tin: một ngôn ngữ lập trình, C++17 **hoặc Python 3** (biến, vòng lặp, mảng, hàm). Toán: chương trình THCS/THPT tương ứng tier |
| Mục tiêu | Hiểu **ý tưởng**, **vì sao đúng**, **độ phức tạp/độ khó**, **bẫy thường gặp**; biết **quy trình giải một đề khó** (đọc giới hạn → subtask → vét cạn → tối ưu); đọc hiểu lời giải (Tin: C++/Python chỉ đọc; Toán: chứng minh hoàn chỉnh) |
| Ngôn ngữ | Tiếng Việt là chính (`vi-VN`), có `en-US`; locale khác dùng `en-US` |
| **Không nằm trong mục tiêu** | Học sinh viết/chạy code hoặc nộp bài để chấm trong ứng dụng ([ADR 0003](decisions/0003-no-code-execution.md)) |
| Thể thức thi vào 10 chuyên Tin | `[Unverified]`; hội đồng LLM research **kèm nguồn**, không nguồn thì giữ `[Unverified]` (`exam_profile.ts10_format_vi`) |

## 2. Nguyên tắc sư phạm (cụ thể hoá yêu cầu gốc)

| Yêu cầu | Nghĩa là gì khi soạn bài | Cách kiểm |
| --- | --- | --- |
| **Rõ ràng** | Mỗi cảnh một ý; quan sát then chốt nói trong ≤ 2 câu; nêu điều kiện/giới hạn ngay từ đầu | rubric "Rõ ràng ≥ 4" |
| **Chi tiết** | Có "vì sao đúng" (bất biến/chứng minh), ví dụ số, trường hợp biên, bẫy theo ngôn ngữ | rubric "Chi tiết ≥ 4" |
| **Dễ hiểu** | Định nghĩa thuật ngữ **trước** khi dùng; chỉ dùng khái niệm thuộc `prerequisites`; ví dụ nhỏ trước, tổng quát sau | rubric "Dễ hiểu ≥ 4"; G1 phiếu "dễ hiểu" |
| **Trực quan** | Mỗi ý quan trọng có một hình động/khung hình chỉ đúng chỗ; lời thầy **trỏ** vào khung hình | rubric "Trực quan ≥ 4" |
| **Sinh động** | Câu hỏi dự đoán **có chờ học sinh trả lời** trước khi tiết lộ; học sinh đổi preset/input để quan sát; luyện tập ngắn ngay trong widget | rubric "Sinh động ≥ 3,5"; ≥ 1 dự đoán có chờ mỗi 3 scene |
| **Trả lời, hướng dẫn** | Thầy biết frame hiện tại; gợi ý theo bậc, không đưa lời giải ngay; dùng hiểu lầm đã biết | `eval:tutor-qa` (Đúng, Bám frame, Gợi ý trước) |
| **Không code editor** | Không bài luyện code. Code chỉ để đọc hiểu. Luyện bằng dự đoán, điền bảng trace, sắp dòng, tìm dòng sai, quiz tự luận AI chấm | [ADR 0010](decisions/0010-no-student-code-enforcement.md) |

## 3. Khung bài giảng

### 3.1. Chuyên Tin — bài thuật toán (blueprint ADR 0008)

12 giai đoạn dạy gộp thành 6–8 scene, scene đầu là slide, 1–3 scene interactive:

| Cảnh | Giai đoạn | Phương tiện | Thầy làm gì |
| --- | --- | --- | --- |
| 1 | Đề bài + giới hạn + ví dụ nhỏ | slide | Hỏi mở: "n ≤ 10⁵ gợi ý gì?" |
| 2 | Vét cạn và điểm nghẽn | slide (biểu đồ) | Đếm số phép tính |
| 3 | Quan sát then chốt → ý tưởng, bất biến | slide (LaTeX) | Câu hỏi mở trong lời thầy; `discussion` là action cuối; nguồn cho phép 1–2 lần mỗi khoá, recipe chọn tối đa 1 |
| 4 | Chạy tay từng bước; **học sinh dự đoán rồi đổi preset** | walkthrough (`generate_walkthrough`) | `[ask/predict] → widget_setState{preset,frame} → lời thầy` theo beat |
| 5 | Đọc C++/Python từng dòng theo bước (chỉ đọc); sắp dòng hoặc tìm dòng sai | walkthrough, tab code | Chỉ đúng dòng đang chạy; nói bẫy của ngôn ngữ đang xem |
| 6 | Độ phức tạp + biến thể | slide | — |
| 7 | Bẫy (từ `pitfalls`) + điền bảng trace + kiểm tra | quiz (AI chấm tự luận) | Phản hồi sau khi nộp |
| 8 | Tổng kết + bài về nhà (`lessonKit.homework`) | slide | — |

Topic chưa có walkthrough: cảnh 4–5 thay bằng **storyboard** (frame viết tay có kiểm bất biến), rồi tới **widget LLM sinh** cho khái niệm định tính. Trace số liệu từng bước ưu tiên walkthrough/storyboard (ADR 0006 §5).

### 3.2. Chuyên Tin — bài giải đề (ADR 0012)

Dạy **cách giải một đề khó**, không chỉ một thuật toán. Nguồn nội dung là `ProblemSpec` + `lessonKit` do tác giả viết. **Đề tự viết, không chép đề thi.**

| Cảnh | Giai đoạn | Phương tiện | Thầy làm gì |
| --- | --- | --- | --- |
| 1 | Đề + giới hạn + ví dụ | slide | "Đọc giới hạn trước: n tới đâu, giá trị tới đâu?" |
| 2 | **Thang subtask** (từ `problem.subtasks`) | slide (bảng) | Mỗi subtask một ý tưởng + độ phức tạp; "subtask nhỏ lấy điểm chắc" |
| 3 | Vét cạn cho subtask nhỏ | walkthrough preset nhỏ | Dự đoán kết quả; đếm phép tính |
| 4 | Quan sát then chốt (đơn điệu, bất biến, cấu trúc con) | walkthrough panel `check` / slide | Hỏi "nếu H tăng thì tổng gỗ tăng hay giảm?" (dự đoán có chờ) |
| 5 | Lời giải đầy đủ chạy tay | walkthrough | Beat theo preset lớn |
| 6 | Chứng minh / vì sao đúng + biên | slide (LaTeX) | Nêu điều kiện và biên (H = 0, M = tổng) |
| 7 | Đọc code C++/Python + bẫy | walkthrough tab code | Tràn số (C++), `//` (Python) |
| 8 | Kiểm tra + bài về nhà | quiz | "Subtask nào dùng được vét cạn?"; tự thiết kế test biên (AI chấm) |

### 3.3. Chuyên Toán (blueprint Phase 3 §5)

| Cảnh | Giai đoạn | Phương tiện | Thầy làm gì |
| --- | --- | --- | --- |
| 1 | Động cơ / bài toán | slide, hình tĩnh | Học sinh dự đoán |
| 2 | Trực giác bằng hình động | slide clip (mỗi chapter một slide, 8–25 s) | Nói ≤ 2 câu **trước** chapter (cần để ý gì) → chapter 1 → hỏi dự đoán → chapter 2 → giải thích **sau** |
| 3 | Phát biểu | slide LaTeX | Chỉ vào điều kiện và dấu "=" |
| 4 | Chứng minh từng bước | clip khung (45–90 s, chia chapter) hoặc walkthrough `proofOutline` | Từng bước; nhảy frame |
| 5 | Ví dụ mẫu | slide + bảng trắng; walkthrough "lab" đổi số | Câu hỏi mở |
| 6 | Biến thể + sai lầm | clip phản mẫu (10–25 s) + quiz "sai ở bước nào?" | Phản hồi AI |
| 7 | Kiểm tra | quiz, ≥ 1 câu dự đoán | — |
| 8 | Tổng kết + mở rộng | slide | — |

Phân vai: **Manim** cho chuyển động liên tục/hình học/đồ thị; **walkthrough SVG** cho thủ tục cần tua/đổi số; **slide + `wb_latex`** cho chứng minh dài chữ (ADR 0007). **Lời thầy chạy riêng, trước và sau mỗi chapter** (user xác nhận); nhãn và giá trị then chốt phải hiện ngay trong hình để lời và hình không xa nhau.

### 3.4. Ví dụ: khung bài Binary Search

| Cảnh | Nội dung cụ thể | Ghi chú |
| --- | --- | --- |
| 1 slide | "Tìm số 23 trong 10^5 số đã sắp: đọc từng số mất bao lâu?" | Câu hỏi mở, nêu giới hạn |
| 2 slide | Vét cạn O(n) → n=10^5 ≈ 10^5 phép so sánh; ta cần hơn thế | Biểu đồ đếm phép tính |
| 3 slide | Quan sát: mảng đã sắp → loại một nửa mỗi lần; bất biến `a[lo..hi]` chứa target nếu tồn tại | Hỏi "cần mấy bước với 10^5 số?" |
| 4 walkthrough | Preset `mid-hit`/`first`/`absent`/`single`; beat thật sự xảy ra của preset, ví dụ `absent`: `start`, `mid`, `go-right`, `mid`, `go-left`…, `done` | Dự đoán có chờ ở beat `mid` |
| 5 walkthrough (tab C++ / Python) | C++: `mid = lo + (hi - lo) / 2` và vì sao không viết `(lo + hi) / 2`. Python: `//` thay vì `/` | Bẫy theo ngôn ngữ |
| 6 slide | O(log n); biến thể: tìm biên trái/phải | — |
| 7 quiz | "`lo`, `hi` sau bước này là gì?" (điền bảng); tự luận: vì sao vòng lặp dừng | AI chấm |

### 3.5. Ví dụ: bài giải đề "cắt gỗ" (`bs-answer`)

Đề tự viết: `n` cây cao `h[i]`, cần ít nhất `M` mét gỗ; cưa ngang ở độ cao `H`, mỗi cây cao hơn `H` cho `h[i] − H` mét. Tìm `H` lớn nhất.

| Cảnh | Nội dung |
| --- | --- |
| 1 | Đọc giới hạn: `n ≤ 10^5`, `h ≤ 10^9` → không thử mọi `H` được |
| 2 | Thang subtask: `h ≤ 100` → thử mọi `H`, O(n·maxH); đầy đủ → chặt nhị phân trên `H`, O(n log maxH) |
| 3 | Walkthrough preset nhỏ: thử `H` từ cao xuống thấp, đếm gỗ |
| 4 | Dự đoán: "`H` tăng thì tổng gỗ tăng hay giảm?" → hàm `check(H)` **đơn điệu** |
| 5 | Walkthrough: chặt nhị phân trên `H`, vạch `H` di chuyển, bảng `lo/hi/mid/check` |
| 6 | Vì sao đúng: đơn điệu ⇒ tồn tại ngưỡng; biên `H = 0` |
| 7 | Code: tổng gỗ có thể vượt `int` (C++ dùng `long long`); Python không tràn |
| 8 | Quiz + bài về nhà (hội đồng LLM đề xuất id bài trên online judge, kèm URL) |

### 3.6. Quy ước code chỉ đọc (C++ và Python)

| | C++ | Python |
| --- | --- | --- |
| Phiên bản | C++17 | Python 3 |
| Tên biến | trùng pseudocode (`lo`, `hi`, `mid`) | trùng pseudocode, `snake_case` cho hàm |
| Thư viện | không `using namespace std` trong đoạn hiển thị (ghi `std::`) | chỉ thư viện chuẩn |
| Chia nguyên | `/` với số nguyên | `//` (bẫy: `/` cho số thực) |
| Tràn số | nêu rõ (`long long`, `lo + (hi-lo)/2`) | không tràn; không nói bẫy tràn số |
| Đệ quy sâu | — | nêu `sys.setrecursionlimit` khi cần |
| Ánh xạ | mọi dòng pseudo có trong `code.map.cpp` | mọi dòng pseudo có trong `code.map.py` |

Chung cho cả hai: bình luận ≤ 1 câu và **cùng ngôn ngữ** với lời thầy. Đoạn code là **ví dụ đọc hiểu**, không chạy trên máy học sinh. CI có thể chạy thử trên preset để đối chiếu (`TUTOR_IMPL_CHECK`, `g++`/`python3` trên runner: [Unverified]).

## 4. Quy tắc viết lời thầy và chữ trên màn hình

1. **Câu ngắn, gợi mở**: hỏi trước, giải thích sau ("Theo em bước tiếp theo `lo` hay `hi` đổi?"), không đọc lại định nghĩa dài.
2. **Trỏ vào hình**: "nhìn thanh màu cam", "để ý `mid`"; mỗi câu nói gắn một frame/chapter.
3. **Số trong lời nói phải có trên màn hình** (state hoặc `vars`/`pointers` của frame vừa nhảy tới). Dùng tham số `{mid}`, `{lo}` trong `narration` thay vì viết cứng số. Kiểm tự động.
4. **Thứ tự hành động cho mỗi beat**, trong đó hình luôn xuất hiện trước lời giải thích:
   1. `ask`: câu hỏi dự đoán, nói **trước khi nhảy**, có chờ trả lời nếu có `predict`.
   2. `widget_setState{preset, frame}`: hình xuất hiện.
   3. Lời giải thích.
5. **Clip câm, lời riêng**: lời **trước** chapter nói cần để ý gì; lời **sau** giải thích. Muốn dừng giữa chừng thì phải có chapter riêng.
6. **Chữ trên màn hình**: chỉ ký hiệu, số, nhãn hình, chú giải màu; **không nướng câu tự nhiên** vào video; ≤ 12 token mỗi khung.
7. **Ký hiệu LaTeX chuẩn**, dùng delimiter `\( … \)`; đại lượng trong lời nói phải trùng ký hiệu trên hình.
8. **Không dùng màu làm cách phân biệt duy nhất**; tương phản ≥ 4,5:1; không nhấp nháy > 3 lần/s.
9. **Nói rõ mức chặt chẽ**: hình cho trực giác thì ghi "đây là trực giác, chứng minh chặt ở bước sau".
10. **Khi học sinh hỏi** (thang gợi ý, ADR 0008 Decision 6):
    1. Hỏi lại học sinh đang nghĩ gì.
    2. Đưa gợi ý mức 1 (`hints[0]`), rồi mức 2, mức 3.
    3. Chỉ đưa lời giải khi học sinh yêu cầu.
    4. Nếu câu hỏi khớp một `misconception` thì gọi tên hiểu lầm và cho phản ví dụ.
    5. Phần dài dùng `wb_*`.

## 5. Hướng dẫn tác giả

### 5.1. Viết một walkthrough (Tin hoặc Toán thủ tục)

1. Chọn topic từ curriculum (ghi `tracks`) và **một câu takeaway**.
2. Chọn visualizer (`array`, `tree`, `graph`, `grid`, `geometry`, `functionPlotter`, `proofOutline`) và nghĩ ra **khoá `highlights/pointers`**.
3. Viết `inputSpec` (miền hẹp, không nhãn tự do) và **4–6 preset** (≥ 1 biên: rỗng, n=1, đã sắp, đảo ngược, target vắng).
4. Viết `run(input, emit, tick, ctx)` (`ctx.locale` chọn ngôn ngữ của `explanation`):
   - gọi `tick()` mỗi vòng lặp;
   - mỗi frame có `explanation` (≤160 ký tự), `codeLine`, `highlights/pointers/vars/aux`;
   - đánh dấu frame mốc bằng tag `beat:<id>`.

   Không dùng `Intl`, `Date`, `Math.random` (lint chặn).
5. Viết pseudocode, **C++ và Python** (nếu Tin), cùng `code.map.cpp`, `code.map.py` **toàn phần**; `pitfalls` có nhãn `lang`.
6. Viết **5–10 `beatDefs`**: `label`, `narration` (vi/en, có tham số `{var}`), `ask` (có `predict` khi hợp), `hints[3]`, `misconceptions`, `required` cho `start`/`done`.
7. Với bài giải đề: `problem` (đề, giới hạn, subtask) và `lessonKit`.
8. Viết test đối chiếu kết quả cuối với **cách tính độc lập**; kiểm mọi preset có beat `required`; kiểm ngưỡng frame/byte.
9. Đặt `entryRev: 1`, và tăng `entryRev` mỗi khi frame/lời/preset/code đổi (test snapshot bắt).
10. Thêm vào `pack.ts`, sinh lại khối id trong `SKILL.md`, chạy `pnpm vitest run …`.

Ví dụ một `beatDef`:

```ts
{ id: 'mid',
  label:     { 'vi-VN': 'Chọn mid', 'en-US': 'Pick mid' },
  narration: { 'vi-VN': 'Ta lấy phần tử ở giữa: mid = {mid}, a[mid] = {amid}.', 'en-US': 'We take the middle: mid = {mid}, a[mid] = {amid}.' },
  ask: { text: { 'vi-VN': 'Theo em, bước tiếp theo lo hay hi đổi?', 'en-US': 'Which changes next, lo or hi?' },
         predict: { kind: 'choice', options: [{ 'vi-VN': 'lo', 'en-US': 'lo' }, { 'vi-VN': 'hi', 'en-US': 'hi' }] } },
  hints: [ { 'vi-VN': 'So a[mid] với target.', 'en-US': '…' },
           { 'vi-VN': 'Nếu a[mid] nhỏ hơn target thì target nằm bên nào?', 'en-US': '…' },
           { 'vi-VN': 'a[mid] < target ⇒ bỏ nửa trái ⇒ lo = mid + 1.', 'en-US': '…' } ],
  misconceptions: [ { 'vi-VN': 'Nghĩ rằng lo = mid (không +1) vẫn dừng được.', 'en-US': '…' } ] }
```

### 5.2. Viết một clip Manim (Toán)

1. **Brief**: topic, takeaway (1 câu), hiểu lầm hay gặp.
2. **Storyboard** (LLM soạn nháp offline được): chapter (8–25 s) với `before`/`after` (lời thầy vi/en) và preset; hold ≥ 1,5 s ở khung "chốt" (cũng là `poster`).
3. **Mẫu tham số hoá** `manim/templates/<id>.py` + `ClipEntry` (`inputSpec`, `presets` 3–5, `invariants`, `bakedText: false` nếu không có chữ theo locale).
4. Chạy **cổng tự động**: `invariants`, số liệu hiển thị đối chiếu độc lập, bbox chữ, `ffprobe`, SSIM khung vàng.
5. **Hội đồng LLM Toán ký** (`tutor-review-math` + `-2`: đúng, đủ điều kiện, không suy ngược từ hình đặc biệt); `tutor-review-code` duyệt mã. Mẫu do **LLM tác giả** (`manim-author`) viết, qua AST allowlist + sandbox (ADR 0014). Ghi chi phí token cho mẫu (3A).
6. Đóng gói: mp4 theo chapter (+ master tuỳ chọn) + poster + `captions.{vi,en}` + `clip-sheet.json`.

### 5.3. Viết `clip-sheet` cho Q&A

Mỗi chapter có: cái đang hiện, công thức, hiểu lầm hay gặp, và 2–3 gợi ý theo bậc (từ nhẹ đến đầy đủ). Thầy dùng thứ này khi học sinh dừng ở slide của chapter đó và hỏi.

## 6. Rubric chất lượng

| Tiêu chí | Ngưỡng | Cách đo |
| --- | --- | --- |
| Đúng | 0 lỗi sự thật (cổng cứng); `invariants` 100%; bản cài đặt C++/Python cho cùng kết quả | tự động + hội đồng LLM ký |
| Rõ ràng | quan sát then chốt ≤ 2 câu; ≤ 3 đối tượng mới/chapter; judge ≥ 4 | judge |
| Chi tiết | có "vì sao đúng", ví dụ số, biên, bẫy theo ngôn ngữ; judge ≥ 4 | judge |
| Dễ hiểu | thuật ngữ định nghĩa trước khi dùng; chỉ dùng `prerequisites`; judge ≥ 4 | judge + G1/G2 |
| Trực quan | lời thầy trỏ đúng khung hình; judge ≥ 4 | judge + tự động |
| Sinh động | ≥ 1 dự đoán **có chờ**/3 scene; clip: ≥ 1 câu hỏi dự đoán sau mỗi 2 chapter; judge ≥ 3,5 | judge + tự động |
| Dạy kèm | Q&A: Đúng 100%, Bám frame ≥ 90%, Gợi ý trước ≥ 80%; Dùng hiểu lầm đúng: theo dõi, chưa đặt ngưỡng | `eval:tutor-qa` |
| Giải đề (bài giải đề) | có thang subtask; mỗi subtask có độ phức tạp; có bước "đọc giới hạn" | judge + hội đồng LLM |
| Kỹ thuật | ≤ 160 ký tự/`explanation`; 5–10 `beatDefs`; ≥ 4 preset; hai `map` toàn phần; không tràn chữ | tự động |
| Tiếp cận | tương phản, không nhấp nháy, có caption | tự động + kiểm tay |

Ngưỡng là `[Inference]`; hiệu chỉnh sau lần eval đầu (`eval:tutor-lesson`, `eval:tutor-qa`). Với N=3 mẫu và ngưỡng 70%, thực tế phải đạt **3/3** (2/3 = 0,67).

## 7. Quy trình duyệt

| Bước | Ai | Điều kiện qua |
| --- | --- | --- |
| Viết + test tự động | Tác giả | tất cả test xanh |
| Duyệt kỹ thuật | Người biết code/Manim | review PR |
| Duyệt nội dung dạy | **Hội đồng LLM** đóng vai giáo viên chuyên Tin (`tutor-review-cp` + `-2`) / chuyên Toán (`tutor-review-math` + `-2`), hai nhà cung cấp khác nhau (ADR 0014) | cả hai model chấm mọi tiêu chí rubric §6 ≥ 4/5, không lỗi "Đúng"; review JSON commit cạnh entry |
| Eval chất lượng | Tự động (LLM-judge) | đạt ngưỡng (tư vấn) |
| **Cổng sư phạm G1/G2** | Hội đồng LLM + học sinh mô phỏng (`sim-learner`); sau phát hành: số đo học sinh thật | NFR-Q7 (ADR 0012 §6, ADR 0014) |
| Lọc nội dung trước khi tới học sinh | `tutor-moderation` | bộ hiệu chuẩn đạt (NFR-S7) |
| Phát hành | Chủ dự án | checklist [ONBOARDING §6](ONBOARDING.md) |

## 8. Độ phủ nội dung (theo curriculum, đếm theo `tracks`)

- **Tin** (Phase 2 §2.2):
  - `ts10`: 1/14 sau Phase 1 → **8/14** sau 2A → **13/14** sau 2B. `t1-complexity` dùng slide.
  - `hsg`: 1 → 5 → 10 → 17 → 21 → **24/26** sau 2E (25 khi có `geometry`).
  - Tổng 29/32 (30 khi có `geometry`).
  - Đếm bằng script; ánh xạ topic↔mô-đun và nhãn luồng là thủ công (`[Inference]`), hội đồng LLM Tin duyệt.
  - Không có walkthrough theo chủ ý: `t1-complexity`, `t4-number-combinatorics`.
- **Toán:** khung 28 topic với cột `primary_medium` (Phase 3 §7), hội đồng LLM Toán duyệt và research kèm nguồn. Chưa có nguồn chính thức, nên mọi tên kỳ thi/tài liệu là `[Unverified]`.
