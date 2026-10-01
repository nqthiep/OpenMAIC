# ADR 0014: Dùng LLM thay các vai trò con người (lọc nội dung, giáo viên duyệt, tác giả Manim, học sinh thử) và lưu dữ liệu học sinh

- **Status**: Accepted (2026-10-01; hướng và hai nhà cung cấp do user quyết định; cách hiện thực và phân vai chọn bằng SWOT)
- **Date**: 2026-10-01
- **Deciders**: User ("dùng một LLM khác làm bộ lọc nội dung, … đóng vai trò giáo viên chuyên Tin, … viết Manim; lưu trữ dữ liệu học sinh; mọi thứ đều dùng LLM để giảm thiểu sự invoke của người khác") + Architect panel
- **Thay thế một phần**: [0007](0007-manim-and-math-visualization.md) (người viết/duyệt Manim, giáo viên Toán ký), [0012](0012-audience-scope-pedagogy-gates.md) (giáo viên Tin ký và học sinh thật ở cổng G1/G2), NFR-S6, NFR-S7
- **Liên quan**: [0006](0006-deterministic-trace-catalog.md), [0008](0008-lesson-blueprint-hard-problems.md), [0009](0009-teacher-qa-awareness.md), [../SECURITY](../SECURITY.md), [../OPERATIONS §2](../OPERATIONS.md), [../INTERFACES §8](../INTERFACES.md)

> **Tóm tắt:** mọi vai trò con người trong quy trình được thay bằng **LLM riêng cho từng vai trò**, tốt nhất là **khác nhà cung cấp** với LLM dạy/soạn bài:
> - **bộ lọc nội dung** chặn vào/ra của chat, mặc định chặn khi lọc lỗi (fail-closed);
> - **hội đồng LLM** đóng vai giáo viên chuyên Tin và chuyên Toán, duyệt nội dung;
> - **LLM tác giả Manim** viết mẫu clip offline, qua cổng tự động;
> - **học sinh mô phỏng** chạy cổng G1/G2, rồi thay bằng số đo từ **dữ liệu học sinh thật được lưu trữ**.
>
> Mỗi vai trò LLM có **bộ hiệu chuẩn** (lỗi cài sẵn, nội dung độc hại/lành tính mẫu) và **ngưỡng đo được**. Kiểm tất định (test, `invariants`, chạy bản cài đặt) vẫn là lớp đầu. Dữ liệu học sinh lưu trong kho runtime phía server (Postgres) sẵn có, **không thêm bảng, không đổi package**, và không tự xoá.

## Bối cảnh — sự thật ràng buộc (đã đọc code)

| Sự thật | Nguồn |
| --- | --- |
| Model được chọn theo **stage**: `MODEL_ROUTES` (JSON, giá trị là chuỗi model hoặc `{model, thinking}`) thắng `x-model` và `DEFAULT_MODEL`. Danh sách stage là hằng ở tầng app | `lib/server/model-routes.ts:132-168`; `lib/server/resolve-model.ts:41-47`; `.env.example:355-365` |
| Chat là SSE không trạng thái; server phát các sự kiện `agent_start`, `text_delta`, `action`, `agent_end`, `thinking` | `app/api/chat/route.ts:44-132`; `lib/types/chat.ts` (`StatelessEvent`) |
| Kho runtime phía server lưu **phiên học** theo `(stageId, learnerKey, kind)` với bản ghi append-only; `kind` là **chuỗi mở**, app tự định nghĩa kind và validator | `packages/@openmaic/storage/src/runtime/types.ts:1-24`; `packages/@openmaic/dsl/src/runtime.ts:152-157,211-212`; `lib/runtime/payload-validators.ts:33-37` (đang có `chat`, `quizAttempt`, `whiteboard`) |
| Chat của lớp học cũng được lưu ở IndexedDB phía trình duyệt | `lib/utils/chat-storage.ts:96-101`; `lib/utils/database.ts:313` |
| Eval hiện có đã dùng model chấm riêng (`EVAL_SCORER_MODEL`) | `eval/whiteboard-layout/runner.ts:17-37` |
| Triển khai này luôn có Postgres (agent runtime cần `DATABASE_URL`) | ADR 0011 |

**Giới hạn đã biết (không phải sự thật về code):**
- [Inference] Các LLM có thể **sai giống nhau** (lỗi tương quan), nên hội đồng nhiều model không bảo đảm đúng như một giáo viên thật.
- [Inference] Học sinh mô phỏng **không** đo được việc học thật; nó chỉ là tín hiệu thay thế tới khi có dữ liệu học sinh thật.
- LLM không thay được rà soát pháp lý về dữ liệu trẻ vị thành niên. Mục này ghi là rủi ro dư.

## Phương án và SWOT

**1. Duyệt nội dung (thay giáo viên chuyên Tin/Toán):**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Giáo viên thật (bản trước) | Hiểu đề thi, sư phạm thật. | Phải mời người; chậm; là nút thắt (R26). | — | Không có người thì dự án dừng. |
| Một LLM (cùng model soạn bài) | Rẻ, nhanh. | **Tự chấm bài của mình**, dễ bỏ qua lỗi của chính nó [Inference]. | — | Dạy sai không ai biết. |
| **Hội đồng ≥ 2 LLM khác nhà cung cấp + kiểm tất định + bộ hiệu chuẩn (chọn)** | Không cần người; hai model độc lập giảm lỗi tương quan [Inference]; đo được năng lực bắt lỗi bằng lỗi cài sẵn. | Tốn token; model vẫn có thể cùng sai; không xác minh được dữ kiện thi cử nếu không có nguồn. | Chạy lại mỗi khi nội dung đổi; mở rộng sang Toán, Manim cùng khuôn. | "Duyệt cho qua" nếu prompt yếu → giữ ngưỡng hiệu chuẩn. |

**2. Lọc nội dung cho học sinh vị thành niên:**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Chỉ dựa chính sách an toàn của nhà cung cấp (bản trước) | Không tốn thêm. | Không kiểm được; mỗi nhà cung cấp một khác. | — | Lời không phù hợp tới học sinh (R28). |
| Danh sách từ khoá | Rẻ, tất định. | Chặn nhầm nội dung Tin học ("kill", "attack", "hack"); bỏ sót nghĩa. | — | Phiền học sinh. |
| **LLM lọc riêng, kiểm cả vào lẫn ra, mặc định chặn khi lỗi (chọn)** | Hiểu ngữ cảnh; đo được bằng bộ hiệu chuẩn; model riêng nên độc lập với model dạy. | Thêm độ trễ (phải giữ trọn câu trả lời trước khi hiện); tốn token. | Ghi nhãn vi phạm vào dữ liệu học sinh để theo dõi. | Chặn nhầm; bị tiêm prompt (xử lý nội dung như dữ liệu, không như chỉ dẫn). |

**3. Viết mẫu Manim (thay người biết Manim):**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Người viết + người duyệt (bản trước) | Chất lượng cao. | Phải có người (R01). | — | Không có người → Manim thành hướng phụ. |
| **LLM viết offline trong CI + cổng tự động + hội đồng LLM duyệt (chọn)** | Không cần người; đường phục vụ vẫn chỉ chạy mẫu đã commit; RSR và đúng-toán đo được. | Mã do LLM viết chạy trong CI và `manim-service` mà **không có người đọc**; RSR 77–94% tuỳ model [Unverified]. | Mở rộng catalog nhanh. | Mã độc hại hoặc sai → AST allowlist + sandbox + `invariants` + hội đồng. |
| LLM viết Manim ngay khi phục vụ | Phủ mọi yêu cầu. | Thực thi mã tuỳ ý trên server. | — | RCE (T9). **Vẫn bị loại.** |

**4. Đo hiệu quả dạy (thay học sinh thử):**

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Mời 5–10 học sinh (bản trước) | Đo việc học thật. | Phải mời người (R27). | — | Chậm. |
| **Học sinh mô phỏng trước khi phát hành + số đo từ học sinh thật sau khi phát hành (chọn)** | Không cần mời ai; dữ liệu thật tự đến từ người dùng. | Mô phỏng chỉ là tín hiệu thay thế [Inference]; số đo thật đến muộn. | Dữ liệu lưu trữ cho phép theo dõi liên tục và đưa phản hồi vào catalog. | Tin vào mô phỏng quá mức → có trigger dựa trên số đo thật. |

**5. Dữ liệu học sinh:** user chọn **lưu trữ**. Cách lưu:

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| Chỉ IndexedDB trình duyệt (hiện trạng cho chat lớp học) | Không cần server. | Mất khi xoá trình duyệt; không phân tích được. | — | Không đo được việc học thật. |
| Bảng mới trong Postgres | Truy vấn linh hoạt. | Đổi schema, có thể phải đổi package storage. | — | Trái ADR 0005. |
| **Kind mới trong kho runtime sẵn có (chọn)** | Không thêm bảng, không đổi package (`kind` là chuỗi mở); có sẵn phân vùng theo học sinh và lớp học. | Truy vấn tổng hợp phải quét theo phân vùng. | Hội đồng LLM đọc để viết báo cáo định kỳ. | Dữ liệu trẻ vị thành niên → bảo mật, sao lưu, xoá theo yêu cầu. |

## Quyết định

1. **Vai trò LLM và stage.** Thêm vào `LLM_STAGES` (`lib/server/model-routes.ts:132-154`); cấu hình bằng `MODEL_ROUTES`:

   | Stage | Vai trò | Ràng buộc |
   | --- | --- | --- |
   | `tutor-moderation` | Bộ lọc nội dung vào/ra | Khác nhà cung cấp với `chat-adapter`/`maic-agent` (khuyến nghị) |
   | `tutor-review-cp`, `tutor-review-cp-2` | Hội đồng "giáo viên chuyên Tin" (2 model) | Hai nhà cung cấp khác nhau; khác model soạn bài |
   | `tutor-review-math`, `tutor-review-math-2` | Hội đồng "giáo viên chuyên Toán" (2 model) | như trên |
   | `tutor-review-code` | Duyệt mã (C++/Python chỉ-đọc, mẫu Manim) | khác `manim-author` |
   | `manim-author` | Viết mẫu Manim offline | chỉ chạy trong CI |
   | `sim-learner` | Học sinh mô phỏng (G1/G2) | khác model dạy |
   | `tutor-analyst` | Đọc dữ liệu học sinh, viết báo cáo định kỳ | chỉ đọc |

   Thiếu route thì tính năng phụ thuộc bị **tắt**, không rơi về model mặc định: lọc nội dung thiếu thì chat học sinh bị chặn (fail-closed); hội đồng thiếu thì nội dung mới không được phát hành. Đây là lệch có chủ đích so với cách `resolveModel` rơi về `DEFAULT_MODEL` (`lib/server/resolve-model.ts:41-47`), nên tính năng này kiểm route tường minh.
2. **Bộ lọc nội dung** (INTERFACES §8.1):
   - **Vào:** tin nhắn học sinh được lọc trước khi tới agent. Vi phạm thì trả lời an toàn soạn sẵn, không gọi agent.
   - **Ra:** `/api/chat` giữ `text_delta` theo từng `messageId` tới `agent_end`, lọc trọn câu trả lời, rồi mới gửi xuống client. Vi phạm hoặc lọc lỗi/quá hạn thì thay bằng câu an toàn và ghi nhãn. Hệ quả: câu trả lời hiện ra **cả khối**, không chảy dần.
   - **Nội dung bài sinh sẵn** (chữ trong slide/quiz do LLM sinh) được lọc khi tool ghi scene; vi phạm thì tool trả lỗi `content-blocked`.
   - Nhóm vi phạm: tình dục, bạo lực, tự hại, thù ghét, xin/tiết lộ dữ liệu cá nhân, lạc đề nguy hiểm. Với tự hại, câu an toàn khuyên học sinh tìm người lớn tin cậy và nêu đường dây hỗ trợ trẻ em 111 [Unverified: kiểm lại số trước khi phát hành].
   - Nội dung được lọc coi là **dữ liệu**, không phải chỉ dẫn.
3. **Hội đồng LLM thay giáo viên** (INTERFACES §8.2):
   - **Đầu vào:** mỗi entry (walkthrough, bài giải đề, clip), `SKILL.md`, nhãn `tracks` curriculum.
   - **Cách duyệt:** hai model chấm độc lập theo rubric ADR 0008 và trả JSON có cấu trúc. **Đạt** khi cả hai chấm mọi tiêu chí ≥ 4/5 và không có lỗi "Đúng". Hai model bất đồng thì gọi model thứ ba nếu có một nhà cung cấp thứ ba; **với cấu hình hiện tại chỉ có hai nhà cung cấp (quyết định 8), bất đồng nghĩa là trượt**. Trượt thì **không phát hành** entry.
   - **Dữ kiện thi cử** (thể thức thi vào 10 chuyên Tin, kỳ thi, tài liệu): hội đồng phải **dẫn nguồn** (URL). Không có nguồn thì dữ kiện giữ `[Unverified]`, không được đưa vào lời thầy như sự thật.
   - **Kiểm tất định vẫn chạy trước và là cổng cứng:** test đối chiếu độc lập, `invariants`, chạy bản cài đặt C++/Python, lint. Hội đồng không vượt qua được một test đỏ.
4. **LLM tác giả Manim** (thay đổi ADR 0007 Decision 2):
   - Vòng `manim-author` offline trong CI: brief → mẫu `.py` + `ClipEntry` → sửa lỗi tối đa 3 vòng.
   - **Cổng tự động bắt buộc:**
     - AST allowlist: chỉ `manim`, `numpy`, `math`; cấm `os`, `subprocess`, `socket`, `open`, `eval`, `exec`, `__import__`, truy cập tệp/mạng.
     - Render trong sandbox không mạng.
     - `ffprobe`, bbox chữ, SSIM, `invariants` + số liệu manifest đối chiếu hàm TS độc lập.
     - Hội đồng `tutor-review-math` chấm keyframe + manifest; `tutor-review-code` duyệt mã.
   - Qua hết thì PR được gộp tự động.
   - **Đường phục vụ không đổi:** chỉ mẫu đã commit chạy trong `manim-service`; LLM **không** viết Manim khi phục vụ.
5. **Cổng G1/G2** (thay đổi ADR 0012 quyết định 6):
   - **(a)** Hội đồng `tutor-review-cp` đạt.
   - **(b)** **Học sinh mô phỏng:** 6 persona (lớp 8/9; yếu/khá/giỏi; học C++ hoặc Python) làm bài kiểm tra 5 câu trước, "học" bằng bản ghi bài giảng (transcript lời thầy + mô tả frame), rồi làm bài sau. Ngưỡng: điểm sau – điểm trước ≥ 20 điểm %, và ≥ 70% persona chấm "dễ hiểu" ≥ 4/5. Đây là tín hiệu thay thế [Inference].
   - **(c)** Sau khi phát hành, **số đo thật** từ dữ liệu học sinh (quyết định 6) được theo dõi liên tục bằng `tutor-analyst`: tỉ lệ đúng quiz, tỉ lệ đúng câu dự đoán, số lần xin gợi ý mức 3, đánh giá "dễ hiểu" trong app.
   - Các ngưỡng trên là **giá trị áp dụng**, không còn chờ chủ dự án chốt.
6. **Lưu dữ liệu học sinh** (DATA-MODEL §8, INTERFACES §8.3):
   - **Nơi lưu:** kho runtime phía server, gồm các kind `chat`, `quizAttempt` đã có, cộng kind mới **`tutorLearning`**. Validator ở `lib/runtime/payload-validators.ts`.
   - **Nội dung `tutorLearning`:** beat đã tới, câu trả lời dự đoán (đúng/sai), mức gợi ý đã xin, preset/input đã thử, nhãn lọc nội dung (chỉ nhóm vi phạm, không lưu lại nguyên văn nội dung bị chặn), đánh giá "dễ hiểu".
   - **Lưu giữ:** không tự xoá. Xoá theo yêu cầu bằng công cụ vận hành, xoá toàn bộ phiên của một `learnerKey`. Có sao lưu cùng Postgres (OPERATIONS §5).
   - **Không lưu:** khoá API, dữ liệu định danh ngoài những gì tài khoản đã có.
   - **Truy cập:** theo owner (cơ chế hiện có). `tutor-analyst` chỉ đọc bản tổng hợp đã bỏ định danh.
7. **Bộ hiệu chuẩn** cho mỗi vai trò LLM (TEST-STRATEGY §6), chạy mỗi khi đổi model hoặc prompt:

   | Vai trò | Bộ hiệu chuẩn | Ngưỡng [Inference] |
   | --- | --- | --- |
   | Hội đồng Tin/Toán | ≥ 30 entry **cài lỗi**: sai `explanation`, sai lời thầy, off-by-one trong C++/Python, bẫy sai ngôn ngữ, sai bất biến; + ≥ 10 entry đúng | bắt ≥ 90% lỗi; chặn nhầm ≤ 10% entry đúng |
   | Lọc nội dung | ≥ 100 mẫu độc hại/nhạy cảm + ≥ 200 mẫu giáo dục lành tính (gồm thuật ngữ Tin học dễ nhầm như "kill", "attack", "exploit") | chặn ≥ 99% mẫu độc hại; chặn nhầm ≤ 2% mẫu lành tính |
   | LLM tác giả Manim | 20 brief (S9) | RSR@3 ≥ 90%; đúng-toán (hội đồng) ≥ 90% |
   | Học sinh mô phỏng | bài giảng tốt và bài giảng **cố ý kém** (bỏ bước, sai thứ tự) | bài kém phải có điểm tăng thấp hơn bài tốt ≥ 10 điểm % |

8. **Nhà cung cấp và phân vai** (user chọn 2026-10-01: "Deepseek V4.1 flash và GPT-6-luna"):
   - Cả hai nhà cung cấp đã có trong OpenMAIC: DeepSeek (`deepseek`, OpenAI-compatible, `lib/ai/providers.ts:924-928`; `DEEPSEEK_API_KEY`, `DEEPSEEK_MODELS`, `.env.example:37-40`) và OpenAI (`OPENAI_API_KEY`, `OPENAI_MODELS`, `.env.example:11-13`).
   - **Định danh model:** tạm ghi `deepseek:deepseek-v4.1-flash` và `openai:gpt-6-luna`. Đây là [Unverified]: danh mục trong repo chỉ có `gpt-5.6-luna` (`lib/ai/providers.ts:117`), và ví dụ DeepSeek là `deepseek-v4-flash` (`.env.example:39`). Khi cấu hình phải lấy tên chính xác từ danh sách model của nhà cung cấp (spike Q16), rồi khai báo trong `DEEPSEEK_MODELS`/`OPENAI_MODELS`.
   - **Phân vai** (hội đồng chọn thay user, đảo được; lý do [Inference]: bản "flash" nhanh và rẻ, hợp với việc chạy mỗi lượt; model còn lại dùng cho việc cần chất lượng soạn):

     | Stage | Model | Vì sao |
     | --- | --- | --- |
     | `maic-agent-driver`, `maic-agent`, `chat-adapter`, các stage `scene-*` (dạy và soạn bài) | GPT-6-luna | Chất lượng soạn và giảng |
     | `manim-author` | GPT-6-luna | Viết mã |
     | `tutor-moderation` | DeepSeek V4.1 flash | **Khác nhà cung cấp với model dạy**; chạy mỗi lượt nên cần nhanh |
     | `tutor-review-cp`, `tutor-review-math` (hội đồng #1) | DeepSeek V4.1 flash | Khác model soạn bài |
     | `tutor-review-cp-2`, `tutor-review-math-2` (hội đồng #2) | GPT-6-luna | Nhà cung cấp thứ hai của hội đồng |
     | `tutor-review-code` | DeepSeek V4.1 flash | Khác `manim-author` |
     | `sim-learner` | DeepSeek V4.1 flash | Khác model dạy; chạy nhiều persona |
     | `tutor-analyst` | DeepSeek V4.1 flash | Chỉ đọc số tổng hợp |

   - **Giới hạn của cấu hình hai nhà cung cấp:** hội đồng #2 dùng **cùng model** với model soạn bài, nên có nguy cơ tự chấm bài của mình [Inference]. Cách giảm:
     - bắt buộc **cả hai** model đạt;
     - bất đồng thì trượt;
     - kiểm tất định chạy trước;
     - hiệu chuẩn hội đồng #1 (DeepSeek) phải tự đạt ngưỡng một mình.

     Không có model thứ ba để phân xử (RISKS R40).
   - **Dữ liệu tới nhà cung cấp:** tin nhắn học sinh tới OpenAI (model dạy) và DeepSeek (bộ lọc). Điều khoản dữ liệu của từng nhà cung cấp được xem cùng rà soát pháp lý (R38). User để việc này **sau**, bắt buộc trước khi phát hành cho học sinh thật.

## Hệ quả

**Tốt:**
- Không còn phụ thuộc người thật để chạy quy trình (đóng R01, R26, R27 ở mức quy trình).
- Nội dung tới học sinh được lọc có kiểm chứng.
- Có dữ liệu học thật để cải thiện bài.
- Manim trở lại đúng vai trò "hướng chính" mà không chờ người viết.

**Xấu:**
- Thêm chi phí token và độ trễ: câu trả lời chat hiện cả khối.
- Chất lượng phụ thuộc năng lực model và bộ hiệu chuẩn; lỗi tương quan giữa các LLM không bị loại trừ.
- Mã Manim do LLM viết chạy mà không có người đọc; được giảm bằng allowlist + sandbox.
- Lưu dữ liệu trẻ vị thành niên làm tăng trách nhiệm bảo mật.

**Việc theo sau:**
- Cập nhật ADR 0004, 0007, 0008, 0012; NFR; SECURITY; OPERATIONS; TEST-STRATEGY; RISKS; DATA-MODEL; INTERFACES; CONTENT-DESIGN; Phase 1–3; README; GLOSSARY.

## Điều kiện đổi (trigger)

- **Bộ hiệu chuẩn** của một vai trò dưới ngưỡng 2 lần liên tiếp → vai trò đó tạm dừng phát hành nội dung mới, và cân nhắc đưa người vào lại (ADR mới).
- **Sau phát hành**, số đo thật thấp hơn mô phỏng ≥ 15 điểm % trên ≥ 100 học sinh → học sinh mô phỏng không còn được dùng làm cổng.
- **Bất kỳ** báo cáo nội dung không phù hợp đã tới học sinh → xem lại bộ lọc; thêm mẫu đó vào bộ hiệu chuẩn.
- Có yêu cầu pháp lý về dữ liệu trẻ vị thành niên (đồng ý của phụ huynh, thời hạn lưu) → sửa quyết định 6. Đây **không phải tư vấn pháp lý**.
- Thêm được nhà cung cấp thứ ba → dùng nó cho hội đồng #2 và làm model phân xử, để hội đồng không còn trùng model soạn bài.
