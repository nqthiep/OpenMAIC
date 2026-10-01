# Thuộc tính chất lượng (NFR)

- **Trạng thái**: Accepted — các ngưỡng đánh dấu *Đề xuất* chờ số đo từ spike/eval (sửa 2026-09-30 theo review: SMART hoá, thêm NFR còn thiếu)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [REQUIREMENTS](REQUIREMENTS.md), [ARCHITECTURE](ARCHITECTURE.md), [SECURITY](SECURITY.md), [OPERATIONS](OPERATIONS.md), [TEST-STRATEGY](TEST-STRATEGY.md), [RISKS](RISKS.md)

> **Tóm tắt:** mỗi thuộc tính có chỉ số, ngưỡng, **cách đo kèm môi trường và số mẫu**, cổng áp dụng và người chịu trách nhiệm.
> - Ngưỡng **Đã có** lấy từ code hiện tại; ngưỡng **Đề xuất** là `[Inference]` của kiến trúc sư, sẽ hiệu chỉnh khi có số đo.
> - Ưu tiên cao nhất: **đúng nội dung dạy**, **học sinh hiểu bài** (cổng G1/G2), **an toàn**, **giữ được export/import**.

## 1. Cách đọc

- *Trạng thái*: **Đã có** (giới hạn hiện hữu trong code, có nguồn) · **Đề xuất** (ngưỡng mới, chưa đo) · **Cần spike** (không đặt được ngưỡng khi chưa đo).
- *Cổng*: **CI** (chặn merge) · **Cổng đợt** (chặn mở đợt kế: G1, G2, acceptance) · **Theo dõi** (ghi lại, không chặn).
- Mọi số ở cột "Ngưỡng" trạng thái *Đề xuất* là `[Inference]`. Cách đo chỉ tới spike/test trong [RISKS](RISKS.md) và [TEST-STRATEGY](TEST-STRATEGY.md).
- Môi trường đo mặc định cho số liệu hiệu năng: runner `ubuntu-latest` của GitHub Actions (job `check`/`e2e`, `.github/workflows/ci.yml`), Node ≥ 22.19.0. Số vCPU của runner là [Unverified].

## 2. Bảng thuộc tính chất lượng

### 2.1. Đúng đắn và hiệu quả dạy

| # | Thuộc tính | Chỉ số | Ngưỡng | Cách đo (môi trường, mẫu) | Cổng | Chủ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-Q1 | Đúng nội dung (walkthrough) | Kết quả cuối của `run()` so với cách tính độc lập | 100% entry, mọi preset và biên | `tests/subjects/*/*.test.ts` (node) | CI | Tác giả entry | Đề xuất |
| NFR-Q2 | Đúng toán (clip) | `invariants(params)` + số liệu hiển thị đối chiếu độc lập; hội đồng LLM "giáo viên chuyên Toán" ký (ADR 0014) | 100% preset; 0 lỗi | pytest + vitest + review JSON đạt | CI + Cổng đợt | Hội đồng LLM | Đề xuất |
| NFR-Q3 | Tất định walkthrough | Cùng input → cùng frames; server = trình duyệt | 100% (JSON bằng nhau; `framesHash` bằng nhau giữa node và Chromium) | test tất định + e2e so hash (Chromium) | CI | Tác giả entry | Đề xuất |
| NFR-Q4 | Tất định clip | Cùng image + host → cùng video | Giống 100% hoặc SSIM ≥ 0,99 | spike S4 (2 lần × 2 kiến trúc) | Cổng đợt 3A | DevOps | Cần spike |
| NFR-Q5 | Chất lượng bài giảng | Rubric ADR 0008 (rõ, chi tiết, dễ hiểu, trực quan, sinh động) | ≥ 70% mẫu đạt (`EVAL_PASS_THRESHOLD` 0,7; với N=3 nghĩa là 3/3); "Đúng" < 100% chặn ký duyệt và cổng đợt (không chặn CI) | `eval:tutor-lesson`, ≥ 6 scenario × N=3, temperature 0 | Theo dõi (mỗi đợt) | Kiến trúc sư nội dung | Đề xuất |
| NFR-Q6 | Lời thầy khớp khung hình | contradict ≤ 5%; `frame` hợp lệ 100% (khi bật lời thầy do LLM) | như ADR 0006 | `eval:walkthrough-actions` | Theo dõi | Kiến trúc sư nội dung | Đề xuất |
| NFR-Q7 | **Học sinh hiểu bài** | Trước phát hành: học sinh mô phỏng (6 persona), điểm sau – điểm trước và tỉ lệ "dễ hiểu" ≥ 4/5. Sau phát hành: số đo học sinh thật từ `tutorLearning`/`quizAttempt` | Mô phỏng: +20 điểm % và ≥ 70% persona (áp dụng). Thật: theo dõi; lệch mô phỏng ≥ 15 điểm % trên ≥ 100 học sinh → bỏ mô phỏng làm cổng | `sim-learner`; `tutor-analyst` định kỳ | **Cổng G1, G2** + Theo dõi | `tutor-analyst` | Đề xuất |
| NFR-Q8 | Dạy kèm | Q&A: Đúng; Bám frame; Gợi ý trước; Dùng hiểu lầm đúng | Đúng 100%; Bám frame ≥ 90%; Gợi ý trước ≥ 80%; Dùng hiểu lầm đúng: theo dõi, chưa đặt ngưỡng | `eval:tutor-qa`, ≥ 20 câu hỏi × 3 frame | Theo dõi + G1 | Kiến trúc sư nội dung | Đề xuất |
| NFR-Q9 | Năng lực của vai trò LLM | Bộ hiệu chuẩn (ADR 0014 quyết định 7) | Hội đồng bắt ≥ 90% lỗi cài sẵn, chặn nhầm ≤ 10%; bộ lọc chặn ≥ 99% mẫu độc hại, chặn nhầm ≤ 2%; LLM tác giả Manim RSR@3 ≥ 90%; mô phỏng phân biệt bài tốt/kém ≥ 10 điểm % | chạy lại khi đổi model/prompt | Cổng đợt | Chủ dự án (cấu hình) | Đề xuất |

### 2.2. Hiệu năng và dung lượng

| # | Thuộc tính | Chỉ số | Ngưỡng | Cách đo (môi trường, mẫu) | Cổng | Chủ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-P1 | Tạo walkthrough (server) | `run()` mọi preset + dựng HTML | p95 ≤ 500 ms với input lớn nhất | vitest `bench` hoặc vòng đo trong test: 20 lần, bỏ 2 lần đầu, runner CI | Theo dõi (cảnh báo khi > 500 ms) | Dev | Đề xuất |
| NFR-P2 | Kích thước widget | Số byte UTF-8 của HTML đã dựng | ≤ `maxBytes` của entry (mặc định ≤ 512 KB) | test kích thước | CI | Tác giả entry | Đề xuất |
| NFR-P3 | Số frame | Frame mỗi preset; tổng frame mọi preset | ≤ `maxFrames` ≤ 500 (`DEFAULT_MAX_FRAMES`, vượt → `RangeError`); tổng ≤ 300 | test biên | CI | Tác giả entry | Đề xuất |
| NFR-P4 | Nhảy frame (client) | Từ nhận `SET_WIDGET_STATE` tới cập nhật DOM, đo **trong trang** bằng `performance.now()` | median ≤ 100 ms, 10 lần nhảy | spec riêng, chạy `--retries=0`, Chromium | Theo dõi (không chặn CI vì máy CI dao động) | Dev | Đề xuất |
| NFR-P5 | Render clip | Clip 30 s@720p30 trên 2 vCPU | ≤ 3 phút; RSS ≤ 2 GiB; MP4 ≤ 15 MB/30 s (**ngưỡng fail của spike**; mục tiêu thực tế ở P6) | spike S1 | Cổng đợt 3A | DevOps | Cần spike |
| NFR-P6 | Dung lượng clip | Mỗi chapter; số clip mỗi bài | Chapter ≤ 25 s và ≤ 3 MB; master (nếu có) ≤ 90 s; ≤ 6 clip/bài | test kích thước manifest | CI | Tác giả clip | Đề xuất |
| NFR-P7 | Asset đơn lẻ | Trần server persistence | 32 MiB/asset; request 33 MiB | `packages/@openmaic/storage/src/server/asset.ts:108-109` | — | — | Đã có |
| NFR-P8 | Thư viện clip trong git | `public/clips/` hiện tại **và** tăng trưởng lịch sử git | ≤ 30 MB, ≤ 10 clip; tổng dung lượng clip từng commit vào lịch sử ≤ 100 MB; hơn thế → volume/S3 | test kích thước + `git rev-list --objects` | CI + Theo dõi | DevOps | Đề xuất |
| NFR-P9 | Băng thông thấp | Kích thước tải lần đầu của một scene walkthrough | ≤ `maxBytes`; không tải tài nguyên ngoài | test kích thước + e2e đếm request | CI | Dev | Đề xuất |

### 2.3. Sẵn sàng và suy giảm có kiểm soát

| # | Thuộc tính | Chỉ số | Ngưỡng | Cách đo | Cổng | Chủ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-A1 | Suy giảm khi thiếu `manim-service` | Ứng dụng vẫn chạy; clip dựng sẵn vẫn phát; `generate_clip_scenes{params}` → `clip-render-unavailable` | 100% | test opt-in (như `RENDER_SERVICE_URL` bỏ trống → degrade) | CI | Dev | Đề xuất |
| NFR-A2 | Suy giảm khi thiếu `render-service` | Export MP4 rơi về tải ZIP | Đã có | `lib/server/render-service.ts` | — | — | Đã có |
| NFR-A3 | Quá tải dịch vụ render | 429 có `reason` máy đọc được | `queue_full`/`per_identity_limit`/`global_limit` | contract test | CI | DevOps | Đã có (render-service); Đề xuất (manim-service) |
| NFR-A4 | Job treo | Thời gian tối đa một placeholder tồn tại | ≤ `MANIM_JOB_DEADLINE_MS` + 60 s, rồi `failed` + gợi ý preset gần nhất | spike S8 (giết worker giữa chừng) | Cổng đợt 3C | Dev | Cần spike |
| NFR-A5 | Id/input sai từ LLM | Tool trả lỗi có `validIds`, không retry storm | 0 trường hợp ghi scene lỗi hoặc trả `null` | `tests/widgets/walkthrough-tool.test.ts` | CI | Dev | Đề xuất |
| NFR-A6 | Iframe tải chậm / bị đẩy khỏi pool | Frame hiển thị khớp `desired` sau khi `ready` | 100% | e2e (gửi lệnh trước khi ready; dựng lại iframe) | CI | Dev | Đề xuất |
| NFR-A7 | SLO | Mục tiêu sẵn sàng của dịch vụ | **Chưa đặt**: người vận hành quyết định; tính năng không thêm dịch vụ bắt buộc ngoài app + Postgres | — | — | Người vận hành | Chưa đặt |

### 2.4. Bảo mật, quyền riêng tư, an toàn nội dung (chi tiết ở [SECURITY](SECURITY.md))

| # | Thuộc tính | Chỉ số | Ngưỡng | Cách đo | Cổng | Chủ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-S1 | Không code editor cho học sinh | Số đường hiển thị editor `code`; số đường ghi chưa phân loại | 0 khi không đặt biến (mặc định chặn); 0 đường ghi chưa phân loại. Editor "trá hình" trong widget LLM là rủi ro dư (SECURITY §6) | e2e `code-widget-blocked.spec.ts` + `tests/widgets/write-paths.test.ts` + `policy.test.ts` | CI | Dev | Đề xuất |
| NFR-S2 | Cách ly iframe | `sandbox` không có `allow-same-origin` | Giữ nguyên | test tĩnh trên `InteractiveIframeHost.tsx:281` | CI | Dev | Đã có |
| NFR-S3 | Không chạy mã LLM trên server | Manim chỉ chạy mẫu của ta; `params` số/enum | 100% | review + test tool | CI + review | Kiến trúc sư | Đề xuất |
| NFR-S4 | Sandbox render | Red-team: 0 thoát; canary không bị đọc; kill ≤ timeout + 5 s | như spike S6 | spike S6 | Cổng đợt 3C | DevOps | Cần spike |
| NFR-S5 | Walkthrough/clip không gửi dữ liệu ra ngoài | Số request ra ngoài origin khi phát scene walkthrough/clip | 0 | e2e đếm request (Playwright `page.on('request')`) | CI | Dev | Đề xuất |
| NFR-S6 | Lưu giữ dữ liệu học sinh | Chat, quiz, `tutorLearning` lưu phía server; có cách xoá theo yêu cầu | **Lưu, không tự xoá** (user quyết định 2026-10-01); xoá theo `learnerKey` bằng công cụ vận hành; sao lưu cùng Postgres | test validator `tutorLearning`; spike Q15 | Cổng phát hành | Người vận hành | Đề xuất |
| NFR-S7 | An toàn nội dung cho trẻ vị thành niên | Bộ lọc `tutor-moderation` vào/ra; tỉ lệ chặn trên bộ hiệu chuẩn; độ trễ thêm | Chặn ≥ 99% mẫu độc hại, chặn nhầm ≤ 2% mẫu giáo dục; lọc lỗi/quá hạn → chặn (fail-closed); p95 độ trễ thêm ≤ 1,5 s mỗi câu trả lời [Inference] | eval bộ hiệu chuẩn; đo trong `/api/chat` | CI (unit) + Cổng phát hành | Chủ dự án (cấu hình) | Đề xuất |

### 2.5. Truy cập, quốc tế hoá, tương thích

| # | Thuộc tính | Chỉ số | Ngưỡng | Cách đo | Cổng | Chủ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-X1 | Tiếp cận (a11y) | Tương phản; nhấp nháy; caption; bàn phím; `aria-live` | Tương phản ≥ 4,5:1 (tính từ bảng màu trong test); ≤ 3 lần nháy/s; caption 100% clip; mọi nút điều khiển thao tác được bằng bàn phím (e2e nhấn phím); `aria-live` cho giải thích | test bảng màu + e2e bàn phím + checklist kiểm tay mỗi visualizer (không có công cụ a11y tự động; ADR 0002 cấm thêm dependency) | CI + Cổng đợt | Dev/nội dung | Đề xuất |
| NFR-X2 | i18n giao diện | Nhãn `subject.tutor.*` | 12/12 locale | `pnpm check:i18n-keys` + `tests/i18n/tutor-locales.test.ts` | CI | Dev | Đề xuất |
| NFR-X3 | i18n nội dung | `explanation`/`narration`/`label` | `vi-VN`, `en-US`; locale khác dùng `en-US` | test bảng `Messages` | CI | Tác giả entry | Đề xuất |
| NFR-X4 | Font tiếng Việt | Không ô vuông, không va chạm dấu | 0 ô vuông; 0 va chạm ở 50 cụm duyệt tay | spike S2 | Cổng đợt 3A | DevOps | Cần spike |
| NFR-X5 | Trình duyệt | Phát clip, iframe, autoplay muted | Chromium trong CI (`playwright.config.ts` chỉ có project `chromium`); Safari/Firefox kiểm tay mỗi đợt | e2e + checklist kiểm tay | CI + Cổng đợt | Dev | Đề xuất |
| NFR-X6 | Export/import | Lớp học có walkthrough/clip export HTML/PPTX/ZIP/MP4 và import lại | 100% trọn vòng | spike S3 + e2e | Cổng đợt | Dev | Cần spike |
| NFR-X7 | Di động / cảm ứng | Walkthrough dùng được trên màn 375 px, thao tác chạm | Mọi nút ≥ 44 px; không tràn ngang | kiểm tay (CI chỉ có Desktop Chrome, `playwright.config.ts:17-22`) | Cổng đợt | Dev | Đề xuất |
| NFR-X8 | RTL (`ar-SA`) | Shell hiển thị đúng hướng | Không vỡ layout | kiểm tay locale `ar-SA` (`lib/i18n/locales/ar-SA.json`) | Cổng đợt | Dev | Đề xuất |

### 2.6. Bảo trì, chi phí, quan sát

| # | Thuộc tính | Chỉ số | Ngưỡng | Cách đo | Cổng | Chủ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-M1 | Dễ mở rộng | Thêm một walkthrough / một môn **dùng phương tiện có sẵn** | 1 file entry + test / thêm thư mục + 1 dòng đăng ký; **không sửa lõi**. Thêm **loại phương tiện** mới là ngoại lệ, cần ADR | `git diff --stat` theo checklist ARCHITECTURE §4 | Cổng đợt | Kiến trúc sư | Đề xuất |
| NFR-M2 | Không đổi package | `packages/@openmaic/*` | 0 file đổi | `git diff --name-only origin/main -- packages/@openmaic` rỗng | CI | Dev | Đề xuất |
| NFR-M3 | Ghim phiên bản | Manim, TeX Live, Python lock có hash, font, image digest | Ghim 100%; golden-frame test khi nâng cấp | CI | CI | DevOps | Đề xuất |
| NFR-M4 | Chi phí LLM | Token sinh frame; token mỗi bài; token của các vai trò LLM (lọc, hội đồng, tác giả, mô phỏng) | Sinh frame: 0 (hàm thuần). Còn lại: **đo** theo stage ở log (`MODEL_ROUTES`), chưa đặt trần | eval + log | Theo dõi | Chủ dự án | Đề xuất |
| NFR-M5 | Chi phí render | vCPU-giây mỗi clip; giờ CPU CI mỗi lần dựng thư viện | Cần số đo | spike S1 | Cổng đợt 3A | DevOps | Cần spike |
| NFR-M6 | Quan sát | Log có cấu trúc cho các sự kiện ở OPERATIONS §6 | `LOG_FORMAT=json` đã có (`lib/logger.ts:10`); sự kiện mới theo schema ở OPERATIONS §6 | test ghi log | CI | DevOps | Đã có (log); Đề xuất (sự kiện) |
| NFR-M7 | Tài liệu khớp code | Trích dẫn quan trọng còn đúng nội dung | 0 lỗi `check_docs.py` (gồm neo nội dung) | `python3 docs/tutor/tools/check_docs.py` | CI (đề xuất thêm job) | Dev | Đề xuất |

## 3. Đánh đổi chính

- **Đúng vs. nhanh:** chọn hàm thuần + test thay vì để LLM sinh frame; đổi lại công viết entry.
- **Sinh động vs. chủ động:** clip Manim đẹp nhưng tuyến tính. Bù bằng chapter ngắn, câu hỏi dự đoán có chờ, và walkthrough SVG cho phần thủ tục.
- **Tự chứa vs. kích thước:** HTML tự chứa để export được và không gọi mạng; bị chặn bởi `maxBytes`.
- **Mặc định an toàn vs. tương thích upstream:** chặn `code` mặc định; lệch hành vi upstream.
- **Cách ly vs. chi phí vận hành:** container render cứng hoá + tiến trình con; đổi lại phải vận hành thêm một dịch vụ ở đợt 3C.

## 4. Việc còn lại để chốt số

Spike S1 (hiệu năng), S2 (tiếng Việt), S3 (tích hợp/export), S4 (tất định), S6 (sandbox), S8 (`generate_clip_scenes{params}`); benchmark P1; kiểm a11y; G1 (Q7). Các quyết định còn chờ chủ dự án: NFR-A7 (SLO), NFR-S6 (lưu giữ dữ liệu), RPO/RTO (OPERATIONS §5). Danh sách và tiêu chí đạt ở [RISKS](RISKS.md).
