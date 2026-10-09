# Đăng ký rủi ro, spike và câu hỏi mở

- **Trạng thái**: Living document — cập nhật mỗi khi đóng một spike hoặc phát sinh rủi ro (sửa 2026-09-30 theo review 4 chuyên gia)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [NFR](NFR.md), [SECURITY](SECURITY.md), [OPERATIONS](OPERATIONS.md), [TEST-STRATEGY](TEST-STRATEGY.md), [ADR 0012](decisions/0012-audience-scope-pedagogy-gates.md), [ADR 0015](decisions/0015-math-interactive-web-ui-not-video.md), [Phase 1 §7](phase-1-base-layer/SCHEMA.md), [Phase 3 §8](phase-3-olympiad-math/SCHEMA.md)

> **Tóm tắt:** gom một chỗ mọi rủi ro, giả định, phụ thuộc và spike còn mở. Ba rủi ro lớn nhất:
> 1. **Chất lượng của các vai trò LLM thay người** (ADR 0014): hội đồng duyệt, bộ lọc, học sinh mô phỏng. Rủi ro là lỗi tương quan và "duyệt cho qua".
> 2. **Chưa chứng minh được giá trị dạy** (G1).
> 3. **Chưa có review LLM thật bằng hai model mạnh** cho 27 walkthrough Toán và các entry Tin (cần hai nhà cung cấp, xem HANDOFF §3b).
>
> Xác suất/tác động là `[Inference]`.

## 1. Đăng ký rủi ro

Mức: **C**ao / **V**ừa / **T**hấp. *Trigger* = tín hiệu để hành động.

| ID | Rủi ro | XS | TĐ | Giảm thiểu | Trigger | Chủ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R05 | LLM chọn sai id/preset; SKILL.md lệch catalog | T | V | Schema tool là union id sinh từ catalog; khối id sinh từ catalog + snapshot test; lỗi kèm `validIds` | sự kiện `walkthrough_invalid_id` tăng | Dev | Mở |
| R06 | Sai toán/sai thuật toán trong walkthrough | T | C | Đối chiếu độc lập + chạy bản cài đặt C++/Python (cổng cứng, tất định) + hội đồng LLM ký | bất kỳ lỗi nào bị báo | Hội đồng LLM | Mở |
| R07 | Học sinh xem thụ động (xem thụ động) | V | V | Chế độ dự đoán có chờ (ADR 0008 Decision 5); lời thầy trước mỗi beat nói cần để ý gì; quiz sau bài; luyện tập không editor | Eval "Sinh động" < 3,5; G1 "dễ hiểu" < 70% | Nội dung | Mở |
| R08 | Khối lượng sản xuất (27 walkthrough Toán; mô-đun Tin kèm hai bản cài đặt) | C | V | Đợt nhỏ; khuôn chung; LLM điền khuôn offline; cắt mẫu GT thấp; đo chi phí token/mẫu; LLM tác giả (ADR 0014) | chậm > 2 đợt liên tiếp | Chủ dự án | Mở |
| R09 | Độ phủ curriculum lệch đối tượng (bản cũ bỏ tier 1–2) | V | C | **Sửa**: hai luồng, tier 1–2 trước (ADR 0012); đếm theo `tracks` | `ts10` < 8/14 sau 2A | Nội dung | Giảm (kế hoạch mới) |
| R10 | Chặn `code` bỏ sót đường hiển thị/ghi | T | C | Mặc định chặn; L1 ở điểm hiển thị duy nhất; cả hai trường; test kiểm kê đường ghi; e2e lớp học import (ADR 0010) | học sinh thấy editor | Dev | Mở |
| R11 | MP4 export walkthrough chỉ là khung tĩnh | C | T | Hạn chế đã biết; `posterBeat` (Q7) | user cần MP4 bài giảng | Dev | Chấp nhận |
| R14 | Giấy phép: curriculum `provenance`, font, đề bài | V | V | Font OFL; rà nguồn curriculum; đề tự viết | trước phát hành | Chủ dự án | Mở (`[Unverified]`) |
| R15 | Lệch nhánh/đẩy nhầm lên upstream (`branch.main.remote=upstream`) | V | V | Làm trên nhánh tạo từ `origin/main`; không đẩy từ `main`; không PR lên upstream | — | Dev | Kiểm soát |
| R16 | Payload walkthrough/entry `customInput` phình; chat gửi mọi scene (cả HTML) mỗi lượt | V | V | `maxBytes`/`maxFrames`/`inputSpec`; module `entry-<id>` nhỏ; đo payload chat (`lib/types/chat.ts:318-330`) | vượt NFR-P2 hoặc chat chậm | Dev | Mở |
| R17 | Iframe pool (`IFRAME_POOL_CAP=3`) reset frame; thông điệp tới trước khi iframe load | V | V | **Đóng bằng thiết kế**: `widget-ready` + gửi lại `desired` (ADR 0013); e2e | lỗi e2e | Dev | Giảm (cần e2e) |
| R18 | Tài liệu/curriculum **chưa commit** → mất công, worktree không thấy | V | V | Commit trên nhánh tính năng (ONBOARDING §6) | trước giao việc cho worktree | Chủ dự án | **Hoãn** (user 2026-10-01: "chưa cần") |
| R19 | Chi tiết thi cử Toán chưa kiểm chứng (đề VMO các năm ngoài 2026, quy chế chuyên-10 từng tỉnh, đối chiếu công báo gốc) | V | V | Curriculum đã có 6 nguồn (2026-10-09; cấu trúc VMO 2026 từ nguồn thứ cấp); chi tiết chưa kiểm chứng giữ `[Unverified]` và lời thầy không nói như sự thật | trước khi phát hành Toán | Hội đồng LLM | Giảm |
| R21 | Widget LLM sinh cho topic chưa có mẫu không kiểm tất định → có thể sai | V | V | Dùng cho khái niệm/mô hình định tính; trace số liệu ưu tiên walkthrough/storyboard | eval "Đúng" < 100% | Nội dung | Chấp nhận |
| R22 | Dữ liệu học sinh (tin nhắn chat, nội dung scene) tới nhà cung cấp LLM/TTS; IP tới CDN | C | C | Người vận hành chọn nhà cung cấp + điều khoản dữ liệu; thông báo người dùng; walkthrough 0 request ra ngoài; NFR-S6 lưu giữ (SECURITY T18) | thay đổi nhà cung cấp; trước phát hành cho học sinh | Chủ dự án | Mở |
| R23 | Cờ chặn `code` bị quên hoặc đặt nhầm | T | C | **Mặc định chặn** (không đặt = chặn); smoke kiểm `OPENMAIC_ALLOW_CODE_WIDGET` không bật (OPERATIONS §9) | học sinh thấy editor | DevOps | Giảm |
| R24 | Tài liệu trôi lệch khỏi code | V | V | `check_docs.py` có **neo nội dung** cho trích dẫn quan trọng; chạy mỗi PR (đề xuất job CI); rà tay khi code đổi | `anchor-content-drift` | Dev | Giảm |
| R26 | Thiếu giáo viên Tin | — | — | **Đóng bằng ADR 0014**: hội đồng LLM `tutor-review-cp`; thay bằng R34 | — | — | Đóng |
| R27 | Không có học sinh thử | — | — | **Đóng bằng ADR 0014**: học sinh mô phỏng + số đo học sinh thật sau phát hành; thay bằng R35 | — | — | Đóng |
| R28 | Nội dung LLM không phù hợp tới trẻ vị thành niên | V | C | Bộ lọc LLM riêng, fail-closed, bộ hiệu chuẩn (NFR-S7, SECURITY T24) | một trường hợp bị báo | Chủ dự án (cấu hình) | Mở |
| R29 | Widget LLM dựng form lừa đảo/gửi dữ liệu ra ngoài; phụ thuộc CDN | V | V | Sandbox; CSP `connect-src 'none'; form-action 'none'` sau spike Q10 (SECURITY T25) | Q10 cho thấy CSP làm vỡ nhiều widget | Dev | Mở |
| R31 | Nhánh tính năng không có CI (trigger chỉ `main`/integration/PR vào danh sách cố định) | C | V | Mở PR vào `main` của fork hoặc chạy đủ TEST-STRATEGY §7 trước merge local; browser test mỗi file một step | test bị bỏ qua lặng lẽ | Dev | Mở |
| R32 | Tính năng chỉ có khi bật workbench (Postgres, agent runtime, build arg) → triển khai phức tạp hơn | C | V | Ghi rõ điều kiện; thêm build arg vào Dockerfile/compose; smoke kiểm `/workbench` (ADR 0011) | người vận hành không bật được | DevOps | Chấp nhận (user chọn) |
| R33 | Thể thức đề thi vào 10 chuyên Tin chưa rõ (ngôn ngữ, subtask) | C | V | Hội đồng LLM research **kèm nguồn**; không nguồn thì `exam_profile.ts10_format_vi` giữ `[Unverified]` và lời thầy không nói như sự thật | trước 2A | Hội đồng LLM | Mở |
| R34 | **Lỗi tương quan** giữa các LLM: hội đồng và model soạn bài cùng hiểu sai → nội dung sai được duyệt | V | C | Hai nhà cung cấp khác nhau; kiểm tất định là cổng cứng trước hội đồng; bộ hiệu chuẩn lỗi cài sẵn (≥ 90% bắt được); số đo học sinh thật | hiệu chuẩn dưới ngưỡng; tỉ lệ đúng quiz thật thấp bất thường ở một entry | Chủ dự án | Mở |
| R35 | Học sinh mô phỏng không phản ánh học sinh thật → G1/G2 đạt nhưng học sinh không hiểu | V | V | Mô phỏng phải phân biệt bài tốt/kém (hiệu chuẩn); theo dõi số đo thật; trigger bỏ mô phỏng khi lệch ≥ 15 điểm % | lệch ≥ 15 điểm % trên ≥ 100 học sinh | `tutor-analyst` | Mở |
| R37 | Bộ lọc chặn nhầm nội dung Tin học ("kill process", "exploit") hoặc làm chậm chat | V | V | Bộ hiệu chuẩn có thuật ngữ dễ nhầm; ngưỡng chặn nhầm ≤ 2%; p95 độ trễ ≤ 1,5 s | phàn nàn / số đo trễ | Chủ dự án | Mở |
| R38 | Lưu dữ liệu trẻ vị thành niên không tự xoá → nghĩa vụ pháp lý và rủi ro lộ dữ liệu; tin nhắn học sinh tới hai nhà cung cấp (OpenAI, DeepSeek) | V | C | Bỏ định danh khi phân tích; xoá theo yêu cầu; sao lưu mã hoá; rà pháp lý + điều khoản dữ liệu của nhà cung cấp trước phát hành (không phải tư vấn pháp lý) | trước phát hành cho học sinh thật | Chủ dự án | **Hoãn** (user 2026-10-01: "chưa cần"; bắt buộc trước phát hành) |
| R39 | Chi phí token tăng mạnh (lọc mọi lượt, hội đồng 2–3 model, mô phỏng) | V | V | Đo theo stage (NFR-M4); chỉ chạy hội đồng khi `entryRev` đổi; cache kết quả review theo `entryRev` | chi phí/ngày vượt ngân sách người vận hành đặt | Chủ dự án | Mở |
| R40 | Chỉ có hai nhà cung cấp: hội đồng #2 trùng model soạn bài (tự chấm), không có model phân xử | C | V | Cả hai model phải đạt; bất đồng = trượt; kiểm tất định trước; hội đồng #1 (DeepSeek) phải tự đạt hiệu chuẩn (ADR 0014 quyết định 8) | tỉ lệ bất đồng > 20% hoặc hiệu chuẩn #1 dưới ngưỡng | Chủ dự án | Mở |

## 2. Giả định

| # | Giả định | Nếu sai thì |
| --- | --- | --- |
| GĐ1 | Repo là bản riêng (`origin` = `nqthiep/OpenMAIC`), không định đẩy lên upstream; chấp nhận lệch hành vi upstream (chặn `code` mặc định) | Xem xét E2 (đổi package), quy trình PR, và đảo mặc định cờ |
| GĐ2 | Người dùng chủ yếu dùng tiếng Việt | Bổ sung locale cho catalog |
| GĐ5 | Không có nguồn chính thức cho đề cương chuyên Toán và thể thức thi vào 10 chuyên Tin trong phiên này | Mọi tên kỳ thi/tài liệu giữ `[Unverified]` |
| GĐ7 | Người vận hành bật được workbench (Postgres + agent runtime) | Không có tính năng (ADR 0011 trigger) |

## 3. Phụ thuộc bên ngoài

| Phụ thuộc | Loại | Ảnh hưởng nếu thiếu |
| --- | --- | --- |
| Nhà cung cấp LLM thứ hai (khác model dạy) | Dịch vụ ngoài | Không có hội đồng/bộ lọc độc lập → không phát hành nội dung mới; chat học sinh bị chặn |
| Bộ hiệu chuẩn (lỗi cài sẵn, mẫu độc hại/lành tính) | Dữ liệu | Không đo được năng lực vai trò LLM |
| Rà soát pháp lý về dữ liệu trẻ vị thành niên | Người (ngoài quy trình tự động) | R38 không đóng được |
| (Đã bỏ) Giáo viên Tin/Toán, học sinh thử | — | Thay bằng vai trò LLM (ADR 0014) |
| Runner CI có `g++`/`python3` [Unverified] | Hạ tầng | Không đối chiếu bản cài đặt |
| Postgres cho agent runtime | Hạ tầng | Không có workbench → không có tính năng |
| Nhà cung cấp LLM/TTS | Dịch vụ ngoài | Không sinh bài/lời thầy |
| Upstream `THU-MAIC/OpenMAIC` | Dự án gốc | Xung đột khi đồng bộ (nhánh riêng) |

## 4. Sổ spike và câu hỏi mở

| ID | Câu hỏi / đo gì | Đạt khi (`[Inference]`) | Chặn cái gì | Trạng thái |
| --- | --- | --- | --- | --- |
| Q1 | Công cụ build module runtime sinh sẵn (Rollup + `rollup-plugin-typescript2` hoặc khác); IIFE theo tsconfig riêng | build được, test độ mới xanh | Phase 1b | **Đã làm (2026-10-05)**: Rollup + rpt2 (`scripts/generate-tutor-runtime.mjs`); mọi file mà runtime nhập phải chạy được trên trình duyệt (không `node:crypto`)  |
| Q2–Q6 | Q2 (`widgetConfig` có bị ghi đè?): không. Q3 (locale): tham số tool + heuristic. Q4 (LLM dùng `frame`?): thay bằng kịch bản. Q5 (điểm sinh action): tool tự sinh; `generate_actions`/`duplicate_scene` qua provider (ADR 0011). Q6 (thông điệp sớm, pool): `widget-ready` + gửi lại (ADR 0013) | — | — | **Đã đóng bằng thiết kế** (Q6 cần e2e xác nhận) |
| Q7 | Runtime nhận diện cờ chụp tĩnh của video-export để nhảy tới `posterBeat` | khả thi/không | Backlog MP4 | Chưa làm |
| Q8 | KaTeX dựng sẵn trên server (CSS + font inline), qua export | công thức đúng ở HTML/MP4/ZIP; CSS + font ≤ ~300 KB | Phase 3B (walkthrough Toán) | Chưa làm |
| Q9 | Engine chờ dự đoán: tạm dừng/tua, resume, chat mở giữa chừng, silent mode | không treo; hết giờ 20 s luôn đi tiếp | Lát 1c | Chưa làm |
| Q10 | CSP cho widget LLM: tỉ lệ widget mẫu bị vỡ (≥ 30 widget, 6 chủ đề) | ≤ 10% vỡ thì bật | Lát 1b (cho widget LLM) | Chưa làm |
| Q12 | Liệt kê chính xác mọi route/hàm ghi scene cho `write-paths.test.ts` | danh sách đủ, test xanh | Lát 1b | Chưa làm |
| Q13 | Resume scene walkthrough: coi `widget_setState` tuyệt đối là "dựng lại được" trong `lib/playback` | resume đúng beat | Backlog sau 1c | Chưa làm |
| Q14 | Bộ lọc trong `/api/chat`: giữ `text_delta` tới `agent_end` có phá TTS/hiển thị hiện có không; độ trễ thêm | p95 ≤ 1,5 s; không mất `action` | Lát 1c | Chưa làm |
| Q15 | Đường ghi chat/quiz vào kho runtime ở mọi màn học; API xoá phiên theo `learnerKey` | có/không; nếu không → thêm ghi từ client | Lát 1c | **Đã làm (2026-10-05)**: chat và quiz đều qua `getRuntimeStore()`, nhưng chỉ lên Postgres khi build với `NEXT_PUBLIC_PERSISTENCE=1` (mặc định ghi IndexedDB); **chưa có API xoá theo `learnerKey`** (chỉ xoá theo cặp stage+learner); route nhúng trả 403 cho xoá stage  |
| Q16 | Định danh chính xác của DeepSeek V4.1 flash và GPT-6-luna; API (`openai-completions`/`openai-responses`) cho `maic-agent-driver`; hỗ trợ JSON schema cho hội đồng | gọi được cả hai qua `resolveModel`; JSON parse chặt | Trước lát 1c | Chưa làm |
| S2b | Skill (`SKILL.md`/`references/`) có tới chat agent Q&A không | có/không | **Lát 1c** | **Đã làm (2026-10-05)**: KHÔNG. Skill chỉ tới agent workbench; quy tắc \"khi học sinh hỏi\" phải nằm trong `describe()` và prompt chat  |

## 5. Quyết định user đã xác nhận (không còn mở)

| Ngày | Quyết định |
| --- | --- |
| 2026-09-30 | "Không có code editor để học sinh viết và chạy code" = không widget `code`, không bài luyện code; **giữ** interactive + visualizer + đổi input |
| 2026-09-30 | Chặn widget `code` **toàn ứng dụng** |
| 2026-09-30 | Nhập input tuỳ chỉnh (lát 1d) **sau khi** phần chọn preset chạy ổn |
| 2026-10-08 | Toán dùng **walkthrough tương tác (web UI), không video/Manim**; mã Manim xoá 2026-10-09 (ADR 0015) |
| 2026-09-30 | Tính năng **chỉ có khi bật workbench** (ADR 0011) |
| 2026-09-30 | Đối tượng: **cả hai**, thi vào 10 chuyên Tin và HSG (ADR 0012) |
| 2026-09-30 | Code chỉ-đọc: **C++ và Python** (ADR 0008, 0012) |
| 2026-10-01 | **Mọi vai trò con người dùng LLM** (lọc nội dung, giáo viên Tin/Toán, học sinh thử); **lưu dữ liệu học sinh** (ADR 0014) |
| 2026-10-01 | Hai nhà cung cấp: **DeepSeek V4.1 flash** và **GPT-6-luna** (ADR 0014 quyết định 8); rà pháp lý và commit tài liệu: **chưa cần** |

## 6. Kế hoạch giảm rủi ro theo thứ tự

1. Cấu hình `MODEL_ROUTES` cho các vai trò LLM (hai nhà cung cấp) và dựng bộ hiệu chuẩn (ADR 0014; R34, R35, R37).
2. Commit tài liệu và curriculum lên nhánh tính năng (R18); quyết định cách có CI cho nhánh (R31).
3. Phase 1: Q1, Q10, Q12 trước khi viết mã 1b; chặn `code` nhiều lớp và test ngay ở 1b (R10).
4. 1c: Q9, S2b; chuẩn bị G1.
5. Trước khi phát hành cho học sinh thật: bộ lọc đạt hiệu chuẩn (NFR-S7, R28, R37); lưu dữ liệu an toàn (NFR-S6, R38, SECURITY T29); R22 (điều khoản nhà cung cấp); rà pháp lý về trẻ vị thành niên.
