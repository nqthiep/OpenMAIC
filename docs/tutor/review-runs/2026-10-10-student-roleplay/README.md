# Đánh giá nhập vai học sinh lớp 8, 2026-10-10

- **Trạng thái**: Tham khảo, KHÔNG phải file cổng. Không thay thế G1/G2 hay học sinh thật.
- **Ngày**: 2026-10-10
- **Người đóng vai**: một model (Claude), không phải học sinh. Model này đã đọc mã nguồn trong cùng phiên, nên không thể quên đáp án; điểm bài kiểm tra vì vậy cao hơn một học sinh thật.

> **Tóm tắt:** Ba bài đúng đối tượng (ts10/hsg, tier 1–2: `binary-search`, `bs-answer-mini`, `bs-answer`) đọc được từ đầu đến cuối với lập luận rõ. Điểm yếu lặp lại ở ba chỗ: lời thầy đọc lại chữ trên màn hình, câu hỏi dự đoán lặp nguyên văn, và ký hiệu hoặc thuật ngữ được dùng trước khi định nghĩa. Bốn bài Toán và HSG nâng cao vượt trình độ lớp 8, nên không đánh giá công bằng được. Bài kiểm tra sau bài học chủ yếu đo việc nhớ số trên màn hình, không đo việc hiểu ý tưởng.

## Cách làm

1. Hồ sơ người học: `g8-average-cpp` trong [personas.json](../../../../eval/sim-learner/personas.json): lớp 8, học khá, đang học C++ cơ bản, hay sai chi tiết như cộng trừ 1.
2. Đọc đúng những gì học sinh thấy: lời thầy và mô tả khung hình, lấy từ `buildTranscript` của [transcript.ts](../../../../eval/sim-learner/transcript.ts). Trong bài đọc chỉ dùng transcript. Mình đã đọc mã nguồn `binary-search` trước đó trong phiên nên không tách được hoàn toàn. Bản đầy đủ ở [transcripts-sample-7.txt](transcripts-sample-7.txt).
3. Làm bộ câu hỏi post-test của simulator ([binary-search.json](../../../../eval/sim-learner/questions/binary-search.json), [bs-answer-mini.json](../../../../eval/sim-learner/questions/bs-answer-mini.json)), chỉ dựa vào transcript.
4. Đo cho cả 67 bài: tỉ lệ lời thầy lặp lại chữ trên màn hình, và số lần một câu hỏi lặp nguyên văn. Kết quả ở [metrics-67.csv](metrics-67.csv).

**Không làm:** pre-test (không đo được với mình, vì không còn là người chưa biết), chạy `eval:sim-learner` (cần gán model cho `tutor.sim-learner` và tốn lời gọi model trả phí), và sửa nội dung bài.

## Bài kiểm tra sau bài học

| Bài | Câu | Điểm | Nhận xét |
|---|---|---|---|
| `binary-search` (absent) | 5 | 5/5 | Bốn câu chỉ cần nhớ số trên màn hình: mid = 7, a[7] = 52, 4 lần so sánh, lo > hi. Một câu (post-3) cần suy ra quy tắc hi = mid − 1 cho mảng mới. |
| `bs-answer-mini` (classic) | 5 | 5/5 | Câu post-1 cần quy tắc gỗ trong đề bài (cây cao hơn H bị cắt phần trên), vì lời thầy không nhắc lại. Câu post-5 cần suy ra H = 0 khi m bằng tổng chiều cao. |
| `bs-answer` | — | — | Không có bộ câu hỏi. |

Với 4 lựa chọn, đoán ngẫu nhiên được khoảng 25%. Điểm 5/5 là có thật, nhưng phần lớn chỉ cho thấy học sinh nhớ được những gì vừa nghe. Nó không chứng minh học sinh hiểu vì sao thuật toán đúng.

## Nhận xét: ba bài đúng đối tượng

**`binary-search`.** Các bước đi đều có số cụ thể (lo = 0, hi = 9, mid = 4), khung hình khớp với lời thầy, và có lúc thầy giải thích vì sao phải bỏ nửa mảng. Điểm yếu: câu dự đoán "Theo em, bước tiếp theo lo hay hi đổi?" xuất hiện hai lần trong cùng một lượt. Lời thầy gần như đọc lại màn hình: "Ta lấy phần tử ở giữa: mid = 4, a[mid] = 25" trong khi khung hình ghi "Lấy phần tử ở giữa khoảng [0, 9]: mid = 4, a[mid] = 25". Tỉ lệ dòng lời thầy trùng màn hình là 91%, cao nhất trong ba bài.

**`bs-answer-mini`.** Mạch lập luận đúng: thử từng H thì chậm, nâng H thì gỗ không tăng, nên có thể chặt nhị phân trên H. Đây là một đoạn dẫn vào bài hay. Điểm yếu:
- "wood(H)" chỉ xuất hiện trên khung hình, không được định nghĩa trong lời thầy. Quy tắc gỗ nằm trong đề bài, nên học sinh phải nhớ từ slide đề bài.
- "làm tròn lên" và ⌈(lo + hi)/2⌉ được dùng mà không giải thích vì sao phải làm tròn lên.
- Câu hỏi "có đủ gỗ không?" được hỏi lại nguyên văn hai lần, và "bước tiếp theo lo hay hi đổi?" cũng hai lần.

**`bs-answer`.** Có câu hay: "Nâng H lên thì mỗi cây cao hơn H mất bớt gỗ, nên gỗ chỉ giảm hoặc giữ nguyên: một H đủ gỗ thì mọi H thấp hơn cũng đủ." Đây là chỗ giải thích tại sao có thể tìm nhị phân. Điểm yếu: "check(mid)" là tên hàm trong câu hỏi nhưng không được định nghĩa, và cùng một câu hỏi về "bên trái hay bên phải mid" được hỏi hai lần.

## Nhận xét: bốn bài vượt trình độ lớp 8

Các bài này nhắm học sinh HSG hoặc Toán lớp 12. Đánh giá dưới đây cho thấy học sinh lớp 8 sẽ vướng ở đâu. Không nên dùng nó làm thước đo cho đối tượng đích.

- **`riemann-integral`** (Toán, tag `m4-integral`, curriculum ghi Lớp 12). Lời thầy: "Ta cũng tính được nó từ nguyên hàm" và "Tổng Riemann Lₙ tiến tới tích phân I = F(b) − F(a)". Nguyên hàm và F chưa từng được định nghĩa. Khung hình 2/6 viết "cao bằng f" nhưng không có chỗ nào nói f là hàm nào. Lời thầy có câu "Đổi mẫu để thấy hằng số cho tổng đúng ngay", câu này không rõ nghĩa: trong tiếng Việt "đổi mẫu" là quy đồng mẫu số.
- **`cauchy-schwarz`** (Toán, `m2-inequality-classic`, bồi dưỡng chuyên). Có lỗi bắc cầu rõ nhất trong các bài đã đọc: khung hình hỏi "Hiệu này là bình phương của biểu thức nào?", lời thầy nói "Chúng gộp thành bình phương của một biểu thức", nhưng biểu thức đó không có trong lời thầy hay khung hình. Nó chỉ nằm ở các lựa chọn của câu trắc nghiệm, mà transcript của mô phỏng không đưa vào (xem mục cập nhật). Biến k = −2 xuất hiện trên khung hình mà không được giải thích. Cách đưa số cụ thể a = (1, 2), b = (3, 4) trước rồi mới tổng quát là hợp lý.
- **`convex-hull-trick`** (HSG tier 4, `t4-dp-optimize`). Dày đặc nhất trong các bài đã đọc: "bao lồi", "deque", "độ dốc", "che mất" đều không được định nghĩa, và có đoạn "bất kể x thế nào, một trong hai đường kia không lớn hơn".
- **`dijkstra`** (HSG tier 4, `t4-shortest-path`). Mạch theo heap rõ, nhưng "heap", "dist[A]" và "∞" chưa được giải thích. Lời thầy "Heap luôn trả về cặp có d nhỏ nhất" được nói hai lần trong bài.

## Số liệu trên toàn bộ 67 bài

- Lời thầy trùng màn hình (độ giống ≥ 0,5): **37,8%** trên 587 dòng lời thầy. Đây là ước lượng bằng `difflib`, không phải số đo chất lượng.
- Có ít nhất một câu hỏi lặp nguyên văn: **34/67 bài**.
- Bài có hơn một nửa lời thầy trùng màn hình: **25/67 bài**.
- Chi tiết từng bài ở [metrics-67.csv](metrics-67.csv).

Một phần trùng lặp có thể là chủ ý, vì thiết kế yêu cầu lời thầy trỏ vào hình và số trong lời phải có trên màn hình ([CONTENT-DESIGN §4](../../CONTENT-DESIGN.md)). Vấn đề là học sinh nghe cùng một ý hai lần, và chưa có ai đo xem điều đó có làm học sinh chán không.

## Việc nên làm, theo thứ tự ưu tiên

1. Thêm định nghĩa ngắn trước lần dùng đầu tiên: "wood(H)", "check(mid)", "làm tròn lên", "nguyên hàm", "deque", "heap", "bao lồi", "f" và "F".
2. Viết biểu thức bị thiếu trong `cauchy-schwarz` và đổi câu "đổi mẫu" trong `riemann-integral`.
3. Với mỗi câu hỏi dự đoán lặp lại, đổi câu chữ hoặc đổi câu hỏi ở lần thứ hai.
4. Chạy `eval:sim-learner` với `tutor.sim-learner` được gán model khác model dạy, rồi thêm các bài ts10 vào bộ hai bài hiện có. Đây là việc cần xác nhận chi phí trước.
5. Đo với học sinh thật, theo cổng G1/G2 của ADR 0012. Đây là loại bằng chứng duy nhất đủ để kết luận "dễ hiểu".

## Cập nhật: ba bước sau báo cáo

### (a) Học sinh mô phỏng (`eval:sim-learner`): CHƯA CHẠY, cần bạn chạy

- Đã làm: thêm `tutor.sim-learner: deepseek:deepseek-v4-flash` vào `openmaic.local.yml` (file gitignored, bản sao lưu nằm trong scratchpad). Với `OPENMAIC_CONFIG=openmaic.local.yml`, runner đọc được cấu hình.
- Chặn: runner cần biến môi trường `DEEPSEEK_API_KEY` trong shell. Script không tự nạp `.env.local`, và agent không đọc khoá (yêu cầu đọc bị từ chối, và không thử lại). Một lần kiểm số dư trước đó đã đọc khoá từ `openmaic.local.yml` và nhận 401, nên chưa rõ khoá còn hiệu lực hay không. Lệnh để bạn chạy trong terminal:

```bash
cd /Users/quangthiep/Projects/OpenMAIC && set -a && source .env.local && set +a && OPENMAIC_CONFIG=openmaic.local.yml NODE_OPTIONS=--conditions=import pnpm eval:sim-learner
```

- Phạm vi: 2 bài (`binary-search`, `bs-answer-mini`), 6 persona, mỗi bài 3 nhánh (trước, có bài, đối chứng không bài, bài làm xấu), 3 mẫu mỗi nhánh. Cổng: có bài hơn đối chứng ≥ 20 điểm, hơn bài xấu ≥ 10 điểm, ≥ 70% persona chấm "dễ hiểu" ≥ 4, lỗi mẫu ≤ 10%.
- Lỗ hổng của công cụ: transcript mô phỏng chỉ có câu hỏi, không có các lựa chọn của câu trắc nghiệm dự đoán. Học sinh thật thấy các lựa chọn, còn mô phỏng thì không, nên kết quả đánh giá thấp các câu dự đoán. Chưa sửa vì sẽ đổi định nghĩa của cổng.

### (b) Sửa nội dung: ĐÃ LÀM, cho 5 bài chưa có review

| Bài | Thay đổi | entryRev |
|---|---|---|
| `cauchy-schwarz` | Lời thầy nêu biểu thức (a₁b₂ − a₂b₁)²; khung 7 hiện (−2)² = 4 | 3 → 4 |
| `riemann-integral` | Khung 1 nói "đồ thị hàm f"; nguyên hàm F được định nghĩa là hàm có đạo hàm bằng f; câu "Đổi mẫu..." sửa thành "Thử preset hàm hằng..." | 1 → 2 |
| `convex-hull-trick` | k là độ dốc; deque là hàng đợi hai đầu; bỏ "bao lồi" | 2 → 3 |
| `dijkstra` | Heap là hàng đợi ưu tiên | 1 → 2 |
| `bs-answer` | "check(mid)" đổi thành "kết quả cưa ở mid này"; làm tròn lên được giải thích | 3 → 4 |

Không sửa:
- `binary-search` (review@3 đạt) và `bs-answer-mini` (review@4 đạt). HANDOFF cấm sửa hai bài này, vì sửa nội dung làm file review mất hiệu lực theo contentHash. Các lỗi đã nêu ở hai bài vẫn còn: lời thầy trùng màn hình, câu hỏi lặp, và "wood(H)" chỉ có trong đề bài. Sửa cần hội đồng review lại, mà hạn mức OpenCode Go đã hết. Đây là quyết định của bạn.
- Câu hỏi dự đoán lặp lại: là lỗi chung ở mã (cùng một câu hỏi qua các vòng lặp). Chưa đổi.

Kiểm tra:
- Đã cập nhật `tests/subjects/catalog-lock.json` bằng `UPDATE_CATALOG_LOCK=1`.
- Test riêng 5 bài đã sửa: 5 file, 134 đạt, 4 bỏ qua.
- Toàn bộ `tests/subjects` và `tests/tutor`: 2667 đạt. Một lỗi là timeout 60 giây ở `runtime-fresh`. Chạy trực tiếp `scripts/generate-tutor-runtime.mjs --check` cho kết quả "up to date", exit 0.
- Đo transcript: chỉ 5 bài đổi, 62 bài còn lại giữ nguyên.

### (c) Báo cáo: ĐÃ CẬP NHẬT

- Sửa nhận định về `cauchy-schwarz`: biểu thức có trong các lựa chọn của câu trắc nghiệm, nhưng không có trong lời thầy hay khung hình.
- Ghi nhận lỗ hổng của transcript mô phỏng (không có lựa chọn của câu dự đoán).

### Mức độ "khách quan" hiện tại

- Có sẵn: số đo cơ học (độ dài, câu hỏi lặp, lời thầy trùng màn hình) và kiểm thử tự động. Không cái nào đo mức hiểu.
- Chưa có: đo mức hiểu bằng học sinh mô phỏng. Đây là đánh giá khách quan duy nhất về "dễ hiểu" mà repo có, ngoài học sinh thật, và sẽ có khi bạn chạy lệnh ở (a).

### (a) Kết quả thật: đã chạy, KẾT QUẢ: FAIL (mã thoát 1)

Đây là kết quả của cổng, không phải lỗi chạy. Runner trả mã 1 khi không đạt mục tiêu (0 đạt, 1 không đạt, 2 không chạy được). `ELIFECYCLE` là thông báo của pnpm khi script thoát khác 0.

| Chỉ số | binary-search | bs-answer-mini |
|---|---|---|
| Trước khi đọc (pre) | 100% | 73,3% |
| Sau khi đọc bài (lesson) | 100% | 93,3% |
| Đối chứng không bài (control) | 90% | 63,3% |
| Bài làm xấu (degraded) | 60% | 100% |
| Lesson − control (≥ 20) | 10,0 — FAIL | 30,0 — PASS |
| Lesson − degraded (≥ 10) | 40,0 — PASS | −6,7 — FAIL |
| Dễ hiểu ≥ 4 (≥ 70%) | 83,3% — PASS | 66,7% — FAIL |
| Lỗi mẫu (≤ 10%) | 0% — PASS | 0% — PASS |

Điểm dễ hiểu của bs-answer-mini theo từng persona: g8-weak 3, g8-average 4, g8-strong 5, g9-strong 5, g9-weak 3, g9-average 4. Hai persona yếu chấm 3.

### Vì sao kết quả này chưa thể dùng làm phán quyết về bài

1. **Persona đã biết chủ đề.** Pre-test của binary-search đạt 100%, và control đạt 90%. Prompt yêu cầu persona "chỉ dùng những gì học sinh đã biết", nhưng mô hình vẫn có kiến thức chuyên gia về tìm kiếm nhị phân. Vì vậy control không phải mức "chưa biết gì", và phần tăng do bài học bị ép xuống 10 điểm.
2. **Câu hỏi post-test tự chứa đáp án.** Ví dụ `bs-answer-mini` post-2 cho sẵn lo = 15, hi = 20 và chỉ cần tính làm tròn lên. Post-3 cho sẵn mid = 16, gỗ 5 mét, cần 7, nên post-4 (đáp án 15) suy ra được từ chính đề. `binary-search` post-1 chỉ là phép tính (lo = 5, hi = 9). Chỉ `binary-search` post-2 (a[7] = 52) cần đọc bài, vì mảng không có trong câu hỏi.
3. **Bài làm xấu không xấu hơn trên thang đo này.** Bài xấu giữ nguyên các con số và chỉ xáo trộn, bỏ bớt dòng. Vì câu hỏi tự chứa đáp án, nó vẫn đạt 100%, cao hơn bài thật (93,3%). Cổng "bài tốt hơn bài xấu" không thể đạt với bộ câu hỏi này.
4. **Chưa hiệu chuẩn.** ADR 0014 quyết định 7 yêu cầu bộ hiệu chuẩn cho từng vai trò LLM. Cờ `--calibrate` bị bỏ qua, nên bộ đo này chưa được kiểm định. FAIL ở đây phản ánh cả bài lẫn công cụ đo.

Điều đáng giữ lại: bs-answer-mini có hai persona yếu chấm dễ hiểu 3. Đây là tín hiệu nhất quán với nhận định về lời thầy và thuật ngữ, nhưng chỉ dựa trên sáu persona và ngưỡng 70% chỉ hụt một mẫu.

### Đề xuất bước tiếp theo (chờ bạn quyết định)

- Viết lại post-test để mỗi câu cần một chi tiết chỉ có trong transcript của bài (số, bước, nhãn), không tự suy ra được từ đề. Bỏ các câu chỉ là phép tính.
- Chạy lại cổng sau khi sửa câu hỏi. Lần này phải có ít nhất một bài tốt đã biết và một bài xấu đã biết để xác nhận bộ đo tách được hai loại. Đây là bước hiệu chuẩn mà ADR yêu cầu.
- Lần chạy lại tốn thêm chi phí DeepSeek và cần bạn xác nhận.
- Các lỗi nội dung đã nêu ở `binary-search` và `bs-answer-mini` vẫn chưa sửa, vì hai bài này đang có review đạt. Phần đó vẫn là quyết định của bạn.

### Bước 1: viết lại post-test (v2), chờ chạy lại

- Mỗi câu post-test chỉ trả lời được bằng chi tiết nằm trong transcript của bài: chỉ số mid, giá trị a[mid], số mét gỗ ở một mức H, thứ tự thử H, kết luận cuối. Đề câu hỏi không chứa đáp án.
- Kiểm tra tự động: mỗi đáp án phải xuất hiện trong transcript thật (`buildTranscript`, cùng preset), và không lộ trong đề. Cả 10 câu đều đạt. Parser `parseQuestionSet` đọc được cả hai file.
- Phần `pre` và các trường `entryId`, `presetId`, `locale` giữ nguyên.
- Bản gốc được lưu trong scratchpad để so sánh.
- Điểm yếu còn lại: đáp án "4, 5, 6, 7" trong `binary-search` post-1 là một phương án đoán theo mẫu tăng dần, nên đối chứng có thể đạt trên 25% ở câu này.
- Chưa chạy lại cổng vì cần khoá trong shell của người dùng. Lệnh:

```bash
cd /Users/quangthiep/Projects/OpenMAIC && set -a && source .env.local && set +a && OPENMAIC_CONFIG=openmaic.local.yml NODE_OPTIONS=--conditions=import pnpm eval:sim-learner
```

- Kỳ vọng nếu bộ đo tốt: bài thật đạt gần 100%, đối chứng gần mức đoán 25%, bài xấu thấp hơn rõ rệt. Nếu đối chứng vẫn cao, câu hỏi còn lộ thông tin và cần viết lại thêm.

### Lần chạy lại v2: KHÔNG CÓ DỮ LIỆU

- Kết quả: 72/72 mẫu lỗi với `Insufficient Balance` từ DeepSeek (`deepseek:deepseek-v4-flash`). Runner không có điểm nào để tính, nên các dòng "FAIL" trong bản ghi này là vì thiếu dữ liệu, không phải kết quả đo về bài hay về bộ câu hỏi.
- Không kết luận được gì về post-test v2. Lần chạy v1 vẫn là lần đo thật duy nhất.
- Nguyên nhân rất có thể là số dư DeepSeek đã dùng hết sau các lần chạy trước. Mình không kiểm tra được số dư, vì không được đọc khoá.
- Cần làm: nạp thêm số dư DeepSeek rồi chạy lại đúng lệnh ở trên, hoặc chuyển slot `tutor.sim-learner` sang nhà cung cấp khác còn hạn mức.

### Lần chạy với claude-haiku-5-5: KHÔNG CÓ DỮ LIỆU

- Route đã đúng (`anthropic:claude-haiku-5-5`), khoá đã nạp được. Mọi mẫu (72/72) bị Anthropic từ chối với lỗi: khoá không thuộc workspace nào và yêu cầu header `anthropic-workspace-id`.
- Ứng dụng hiện không hỗ trợ đặt header này trong cấu hình, nên không sửa được bằng `openmaic.local.yml`.
- Cách sửa: tạo khoá Anthropic có gắn workspace trong console, rồi thay giá trị `ANTHROPIC_API_KEY` trong `.env.local`. Nếu muốn dùng khoá không thuộc workspace, cần thêm code để gửi header, việc này cần bạn đồng ý trước.
- Các lần chạy trước (v1) vẫn là lần đo thật duy nhất.

### Lần chạy hợp lệ với claude-haiku-5-5 (post-test v2): FAIL ở tiêu chí dễ hiểu

Output đầy đủ: [sim-learner-haiku-5-5.txt](sim-learner-haiku-5-5.txt). Có 0/144 mẫu lỗi, 144 lời gọi tới Anthropic.

| Chỉ số | binary-search | bs-answer-mini |
|---|---|---|
| Trước khi đọc (pre) | 90,0% | 93,3% |
| Sau khi đọc bài (lesson) | 100% | 100% |
| Đối chứng không bài (control) | 56,7% | 56,7% |
| Bài làm xấu (degraded) | 56,7% | 76,7% |
| Lesson − control (≥ 20) | 43,3 — PASS | 43,3 — PASS |
| Lesson − degraded (≥ 10) | 43,3 — PASS | 23,3 — PASS |
| Dễ hiểu ≥ 4 (≥ 70%) | 66,7% — FAIL | 33,3% — FAIL |
| Lỗi mẫu (≤ 10%) | 0% — PASS | 0% — PASS |

- Điểm dễ hiểu từng persona: `binary-search` 3, 4, 4, 3, 4, 4. `bs-answer-mini` 3, 4, 3, 3, 3, 4 (hai persona yếu hơn đều chấm 3).
- Kết quả: cả hai bài đạt hai tiêu chí so với đối chứng và bài xấu, nhưng đều không đạt tiêu chí dễ hiểu. Đây là tiêu chí trực tiếp nhất về mức dễ hiểu.
- Đối chứng 56,7% vẫn cao hơn mức đoán 25%, vì persona là mô hình có kiến thức nền. Điều này làm giảm độ tin cậy của phần "bài hơn đối chứng".
- Chưa hiệu chuẩn chính thức (ADR 0014 quyết định 7). Bài xấu có thấp hơn, nên bộ đo phân biệt được ở mức thô.

**Thay đổi trong `eval/sim-learner/runner.ts` để chạy được với Haiku 5.5:**
1. Không gửi `temperature` cho route Claude 5, vì API từ chối tham số này. Các route khác vẫn giữ 0,3, nên đây là sai lệch so với thiết kế gốc, chỉ áp dụng cho Haiku 5.5.
2. Tăng `maxOutputTokens` từ 300 lên 2000 cho mọi route. Haiku 5.5 dùng token suy luận ẩn từ cùng ngân sách, nên 300 không để lại chữ nào để đọc. Tham số tắt thinking trong cấu hình không làm mất phần suy luận này (đo được khoảng 400–500 token suy luận mỗi lời gọi). Thay đổi này cũng áp dụng cho DeepSeek, nhưng chỉ nâng trần, không đổi câu trả lời.

**Các lần chạy trước không có dữ liệu:** số dư DeepSeek cạn; khoá Anthropic chưa gắn workspace; `temperature` bị từ chối; ngân sách đầu ra quá nhỏ làm mọi trả lời bị rỗng.

### Sửa `bs-answer-mini` (entryRev 4 → 5) để tăng mức dễ hiểu

- **Đã sửa (chỉ câu chữ, số liệu giữ nguyên):** định nghĩa `wood(H)` ngay ở lời thầy đầu tiên; sửa câu "mỗi cây cao hơn H mất bớt gỗ", vì nó đảo ý chính; giải thích chặt nhị phân và làm tròn lên bằng lời thường; bỏ "bất biến" và "wood(mid) ≥ m" khỏi lời thầy và câu hỏi; mô tả rõ hai nhánh đủ gỗ / thiếu gỗ. 17 chỗ thay thế.
- **Giữ nguyên có chủ đích:** các cụm mà post-test dựa vào ("Cưa ở H = X được Y mét", "Thử cưa ở H = …", "m = 7", "H lớn nhất là 15"). Đã kiểm tra lại bằng script: cả 5 sự kiện post-test vẫn có trong transcript mới; mọi khung hình ≤ 160 ký tự.
- **Kiểm thử:** `tests/subjects/cp/bs-answer-mini.test.ts` đạt 45/45 sau khi cập nhật ghim `entryRev` từ 4 lên 5; lock đã được làm mới.
- **Trạng thái review:** review đạt `bs-answer-mini@4` không còn áp dụng cho `entryRev` 5 (không có file tương ứng). Entry tạm thời chưa được phát hành cho tới khi hội đồng review lại.

**Kết quả cổng (Haiku 5.5, 0/72 mẫu lỗi)** — output tại [sim-learner-haiku-5-5-bs-answer-mini-v5.txt](docs/tutor/review-runs/2026-10-10-student-roleplay/sim-learner-haiku-5-5-bs-answer-mini-v5.txt):

| Chỉ số | Trước sửa (v2) | Sau sửa (v5) |
|---|---|---|
| Dễ hiểu ≥ 4 (≥ 70%) | 33,3% — FAIL | 33,3% — FAIL |
| Điểm dễ hiểu từng persona | 3, 4, 3, 3, 3, 4 | 3, 3, 4, 3, 3, 4 |
| Đối chứng không bài | 56,7% | 36,7% |
| Bài xấu | 76,7% | 73,3% |

- **Không có cải thiện đo được về mức dễ hiểu.** Số persona chấm từ 4 trở lên vẫn là 2/6, và hai persona yếu vẫn chấm 3.
- **Dao động của cổng lớn hơn hiệu quả đo được.** Nhánh đối chứng không dùng bài nào, nhưng điểm của nó đổi từ 56,7% sang 36,7%. Với 6 persona và 30 câu hỏi mỗi nhánh, chênh lệch dưới khoảng 20 điểm không đáng tin. Vì vậy hiệu số 63,3 so với 43,3 ở lần này không có ý nghĩa.
- **Gợi ý:** nếu sửa câu chữ không đủ, vấn đề có thể nằm ở cấu trúc bài: thiếu một ví dụ nhỏ có số liệu đi từ đầu đến cuối (ví dụ 3 cây, từng bước cưa), hoặc quá nhiều bước trong một beat. Để phân biệt được các thay đổi nhỏ, cần nhiều persona hơn hoặc chạy lặp lại nhiều lần.

### Việc 1: thêm ví dụ có số liệu cho `bs-answer-mini` (entryRev 7)

- **Đã làm:** lời thầy của beat `monotonic` (đã có khung hình tại H = ⌊top/2⌋ với dòng gỗ theo từng cây) giờ có ví dụ đi từ đầu đến cuối: "mỗi cây cao hơn H cho phần trên H, cây thấp hơn cho 0. Các cây cho lần lượt 10, 5, 0, 7 mét." Định nghĩa `wood(H)` được giữ ở lời thầy đầu tiên. Cụm "Cưa ở H = 10 được 22 mét" được giữ nguyên.
- **Đã thử và bỏ:** thêm một beat `example` riêng với hai khung hình. Hai ràng buộc có sẵn trong test chặn việc này: thứ tự beat theo SCHEMA 4.2, và ngân sách số khung hình `3·(⌊log₂ max h⌋+1)+7` (một preset vượt 25 khi có thêm khung hình). Mình không nới ràng buộc khi chưa được phép.
- **Kiểm thử:** `bs-answer-mini` đạt 45/45; lock đã làm mới; 5 sự kiện post-test vẫn có trong transcript; mọi khung hình ≤ 160 ký tự; không còn placeholder chưa điền.
- **Trạng thái review:** entryRev 7 chưa có review. Review đạt `@4` không còn áp dụng.

**Kết quả cổng (Haiku 5.5, 0/72 mẫu lỗi)** — output tại [sim-learner-haiku-5-5-bs-answer-mini-v7.txt](docs/tutor/review-runs/2026-10-10-student-roleplay/sim-learner-haiku-5-5-bs-answer-mini-v7.txt):

| Chỉ số | v2 (trước) | v5 (câu chữ) | v7 (có ví dụ) |
|---|---|---|---|
| Dễ hiểu ≥ 4 | 2/6 — FAIL | 2/6 — FAIL | 2/6 — FAIL |
| Điểm dễ hiểu từng persona | 3, 4, 3, 3, 3, 4 | 3, 3, 4, 3, 3, 4 | 3, 3, 4, 3, 4, 3 |
| Đối chứng không bài | 56,7% | 36,7% | 46,7% |

- Ba vòng liên tiếp, số persona chấm từ 4 trở lên vẫn là 2/6. Không có tín hiệu cải thiện nào vượt được dao động của cổng.
- Nhánh đối chứng (không đọc bài) dao động 37–57% giữa các lần chạy, nên hiệu số "bài hơn đối chứng" không đáng tin.
- Hướng tiếp theo: giảm dao động bằng nhiều persona hoặc nhiều mẫu hơn, hoặc xem lại liệu tiêu chí "dễ hiểu ≥ 4 của cả 6 persona" có phù hợp với nhóm lớp 8–9 yếu hay không.

### Xem lại tiêu chí "dễ hiểu ≥ 4 của ≥ 70% persona"

**Nguồn gốc.** ADR 0014 quyết định 5(b): hội đồng đặt ngày 2026-10-01, gắn nhãn "tín hiệu thay thế [Inference]". Ngưỡng này chưa từng được hiệu chuẩn bằng dữ liệu. Số đo thật từ học sinh (quyết định 5(c)) là thứ được dự kiến thay thế nó.

**Ý nghĩa với 6 persona.** 70% của 6 là 4,2, nên phải có ít nhất 5/6 persona chấm ≥ 4. Chỉ được phép một persona chấm ≤ 3. Bộ persona gồm 2 yếu, 2 khá, 2 giỏi, nên muốn đạt phải có ít nhất một persona yếu chấm "dễ" (≥ 4).

**Dữ liệu (3 lần chạy Haiku 5.5 × 2 bài × 6 persona = 36 điểm, bài tốt):**

| Nhóm persona | Điểm | Ghi chú |
|---|---|---|
| Yếu (12 điểm) | 3 cả 12 lần | không đổi qua 3 lần chạy và 2 bài |
| Khá (12 điểm) | 4 ở `binary-search`, 3 ở `bs-answer-mini` | phân biệt được hai bài |
| Giỏi (12 điểm) | 4 cả 12 lần | |

- Điểm từng persona giống hệt nhau qua cả ba lần chạy, kể cả khi nội dung `bs-answer-mini` đã được sửa hai lần. Mỗi ô là trung vị của 3 mẫu, và không có ô nào đổi.
- Cùng bài `binary-search`, dưới mô hình DeepSeek v4-flash đạt 5/6 (một persona yếu chấm 4), dưới Haiku 5.5 đạt 4/6. Kết quả đổi theo mô hình chấm, không đổi theo bài.

**Phép thăm dò bài xấu** ([clarity-degraded-probe.txt](clarity-degraded-probe.txt), 36 lời gọi): cho mỗi persona chấm dễ hiểu trên bản bài bị làm xấu.

| Bài | Yếu (tốt → xấu) | Khá (tốt → xấu) | Giỏi (tốt → xấu) |
|---|---|---|---|
| `binary-search` | 3 → 2, 3 → 2 | 4 → 3, 4 → 3 | 4 → 3, 4 → 3 |
| `bs-answer-mini` | 3 → 2, 3 → 3 | 3 → 3, 3 → 3 | 4 → 4, 4 → 4 |

- Ở `binary-search`, cả 6 persona đều chấm bài xấu thấp hơn đúng 1 điểm. Điểm dễ hiểu **có phản ứng** với hư hỏng rõ ràng.
- Ở `bs-answer-mini`, bài xấu hầu như không bị chấm thấp hơn (chỉ 1/6 persona tụt). Nhánh bài xấu của bài này không đủ xấu, điều khớp với việc nó đạt 73–77% đúng ở post-test.

**Kết luận về độ phù hợp:**
1. Với persona yếu, bài tốt được chấm 3 và bài hỏng được chấm 2. Ngưỡng ≥ 4 đòi hỏi bài phải "dễ" với nhóm yếu, mà dữ liệu cho thấy nhóm yếu ở mức nền 3 với cả bài sạch. Ngưỡng đo cấu trúc bộ persona nhiều hơn đo bài.
2. Điểm dễ hiểu không vô nghĩa (có phản ứng với hư hỏng), nhưng thô: thang nguyên 1–5, trung vị 3 mẫu, 6 người chấm. Một bậc là cả thang.
3. Kết quả phụ thuộc mô hình chấm, nên cần hiệu chuẩn lại mỗi khi đổi mô hình, đúng như ADR 0014 quyết định 7 đã nêu.

**Đề xuất (đặt trước, độc lập với kết quả hiện tại):**
- **Phán quyết về bài:** không persona nào chấm ≤ 2 trên bài tốt; ≥ 70% persona *khá và giỏi* chấm ≥ 4; persona yếu chỉ cần ≥ 3 ("không khó").
- **Kiểm tra công cụ:** bản bài xấu phải bị chấm thấp hơn ≥ 1 điểm ở ít nhất một nửa số persona. Nếu không, kết luận là "không kết luận được", không phải "bài không đạt".

**Áp dụng quy tắc đề xuất lên dữ liệu hiện có (không dùng để đổi phán quyết đã ghi):**

| Bài | Sàn (không ≤ 2) | Khá + giỏi ≥ 4 | Công cụ hợp lệ | Kết quả |
|---|---|---|---|---|
| `binary-search` | đạt | 4/4 | 6/6 persona tụt | ĐẠT |
| `bs-answer-mini` | đạt | 2/4 (50%) | 1/6 persona tụt | KHÔNG ĐẠT, công cụ chưa đủ nhạy |

- `bs-answer-mini` vẫn không đạt theo quy tắc mới, vì hai persona *khá* chấm 3. Đó là tín hiệu thật hơn mức nền 3 của nhóm yếu.
- Đổi quy tắc không cứu `bs-answer-mini`. Nó chỉ làm kết quả của `binary-search` phản ánh đúng bài hơn.

**Giới hạn:** 6 persona, một mô hình chấm, điểm do mô hình đóng vai tự báo cáo, chưa đối chiếu với học sinh thật.

### Quy tắc "dễ hiểu" mới đã được cài (2026-10-10)

Chủ dự án quyết định cài quy tắc đề xuất ở mục trên. Thay đổi:

- **Mã:** `eval/sim-learner/score.ts` (hằng số `MAX_HARD_RATING`, `MIN_CLARITY_DROP`, `MIN_CLARITY_DROP_SHARE_PCT`; `PersonaRun` có thêm `level` và `badClarity`; `scoreLesson` trả `hardOk`, `clearShareOk`, `instrumentOk`, `clearVerdict`); `eval/sim-learner/runner.ts` (tiêu đề và dòng log in thêm điểm bài xấu).
- **Quy tắc:** không persona nào chấm ≤ 2; ≥ 70% persona *khá và giỏi* chấm ≥ 4; bài xấu bị chấm thấp hơn ≥ 1 điểm ở ≥ 50% persona. Kết quả: `pass` / `fail` / `inconclusive`.
- **Quyết định thiết kế (cần bạn biết):** nếu bài đạt hai mục đầu mà công cụ không phân biệt được bài xấu, kết quả là `inconclusive` và cổng **không** đạt. Nếu bài trượt một mục đầu, kết quả vẫn là `fail` dù công cụ có nhạy hay không. Lý do: một lần "đạt" từ công cụ không nhạy không đáng tin, còn một điểm thấp thì vẫn là điểm thấp.
- **Tài liệu:** ADR 0014 quyết định 5(b) và bảng ở quyết định 7; TEST-STRATEGY §6; NFR-Q7; REQUIREMENTS; ADR 0012 (con trỏ); SUBAGENT-HANDOFF. `check_docs.py`: 0 vấn đề.
- **Test:** `tests/tutor/sim-learner-score.test.ts` có thêm 8 test cho quy tắc mới (sàn, mẫu số chỉ gồm persona khá và giỏi, ranh giới 70%, công cụ không nhạy, persona thiếu điểm bài xấu, nội dung báo cáo). Hai test cũ bảo vệ post-test v1 (mục post-3 và biên H = 0) đã được thay bằng một test bảo vệ chắc hơn: mỗi đáp án post-test phải được nêu trong transcript và không lộ trong đề.

**Áp dụng quy tắc mới lên dữ liệu thật đã lưu** (lần chạy v7 + [phép thăm dò bài xấu](clarity-degraded-probe.txt), không tốn thêm lời gọi):

| Bài | Sàn (không ≤ 2) | Khá + giỏi ≥ 4 | Công cụ nhạy | Kết quả dễ hiểu |
|---|---|---|---|---|
| `binary-search` | 0/6 — PASS | 4/4 = 100% — PASS | 6/6 — PASS | **PASS** |
| `bs-answer-mini` | 0/6 — PASS | 2/4 = 50% — FAIL | 1/6 — FAIL | **FAIL** |

**Hệ quả cho cổng tổng:** `binary-search` đạt toàn bộ tiêu chí trên dữ liệu thật. `bs-answer-mini` vẫn không đạt, và công cụ chưa đủ nhạy với bài này (bản bài xấu của nó chưa đủ xấu).

**Lưu ý:** việc sửa quy tắc sau khi đã thấy kết quả có nguy cơ "dời cột mốc". Các lý do sửa dựa trên cấu trúc của phép đo (nền điểm theo nhóm persona, phụ thuộc mô hình chấm, tiêu chí chưa từng hiệu chuẩn), không dựa trên việc cho một bài nào đó đạt. Bằng chứng: `bs-answer-mini` vẫn không đạt theo quy tắc mới.

**Hai điều chỉnh phát sinh khi cài (cùng ngày):**
- Bộ test toàn diện bắt được một lỗi số nhiều tiếng Anh do chính các câu mình thêm vào `bs-answer-mini` ("m = 1 meters" ở preset `tiny-need`). Đã sửa bằng cú pháp `{m|meter|meters}`; `entryRev` nay là **8**.
- Khi viết lại post-test v2, mình đã không chạy bộ test của simulator, nên hai test bảo vệ thiết kế post-test cũ báo lỗi cho tới khi được thay thế như mô tả ở trên. Bộ test hiện tại: `tests/tutor` và `tests/subjects` đạt 2677 test.

**Chưa làm:** chưa có lần chạy cổng sống nào với mã chấm điểm mới (phán quyết ở bảng trên được tính từ dữ liệu đã lưu). Lần chạy tiếp theo sẽ in bốn dòng "clear" mới.
