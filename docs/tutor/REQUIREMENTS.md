# Yêu cầu gốc, truy vết và bảng quyết định (SWOT)

- **Trạng thái**: Accepted — bảng truy vết phản ánh **thiết kế**, chưa có mã nguồn (sửa 2026-09-30 theo 4 quyết định của user và review 4 chuyên gia)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [README](README.md), [NFR](NFR.md), [ARCHITECTURE](ARCHITECTURE.md), [RISKS](RISKS.md), [decisions/](decisions/README.md)

> **Tóm tắt:** yêu cầu gốc của user (nguyên văn) được tách thành R1–R12. Mỗi R chỉ tới chỗ thiết kế đáp ứng, trạng thái và phần còn mở. Cuối file có bảng quyết định (SWOT), **các xác nhận của user (14 quyết định, §5.1)** và mặc định của hội đồng. Khi thiết kế đổi, **cập nhật ma trận này trước**.

## 1. Yêu cầu gốc của user (nguyên văn)

> Bây giờ tôi muốn phát triển tính năng dạy lập trình tin học nâng cao cho các học sinh thi vào các trường chuyên tin học. Các bài lập trình dạng này thường có dạng rất khó, nên bài giảng phải rõ ràng, chi tiết, dễ hiểu, trực quan, sinh động. Bạn hãy suy nghĩ kỹ càng để giúp tôi có thể xây dựng tính năng này. Và thiết kế để sau này tiếp theo sẽ là xây dựng tính năng dạy toán học nâng cao cho các học sinh.
>
> tôi nghĩ rằng hệ thống này sẽ không cho phép học sinh chạy code, nó chỉ giảng dạy, giải thích, trả lời, hướng dẫn mà thôi. Trực quan hoá toán học thì tôi biết có thư viện "manim", còn trực quan hoá cho giải thuật lập trình thì tôi chưa biết thư viện nào tốt.

**Giải thích của user về "không cho học sinh chạy code" (2026-09-30):** ứng dụng thuần về giảng dạy, giảng giải, **không có chức năng code editor** để học sinh làm bài, viết code và run; còn tính năng bài giảng **interactive** và **visualizer** là để bài giảng trực quan, sinh động, giúp học sinh nhìn vào dễ hiểu hơn.

Yêu cầu bổ sung: các tài liệu phải thoả yêu cầu trên; bản thiết kế phải đúng với kiến trúc OpenMAIC; phải giúp dễ dàng mở rộng khả năng của OpenMAIC; dùng framework SWOT để ra quyết định.

## 2. Yêu cầu nguyên tử

| # | Yêu cầu |
| --- | --- |
| R1 | Dạy bài khó **rõ ràng, chi tiết, dễ hiểu** (có khung cách dạy, không chỉ hạ tầng). |
| R2 | **Trực quan**. |
| R3 | **Sinh động**. |
| R4 | **Không có code editor** cho học sinh viết/chạy code (không bài luyện code, không chấm code). **Được** có interactive + visualizer (gồm đổi input để quan sát). |
| R5 | Thầy **giải thích, trả lời, hướng dẫn**: Q&A biết học sinh đang ở bước nào **và dạy kèm theo bậc** (không đưa lời giải ngay). |
| R6 | Cho biết **thư viện nào tốt** để trực quan hoá giải thuật. |
| R7 | **Manim là hướng chính** để trực quan hoá Toán (user xác nhận 2026-09-30). |
| R8 | Thiết kế để **sau làm Toán**. |
| R9 | **Đúng kiến trúc OpenMAIC**. |
| R10 | **Dễ mở rộng** khả năng của hệ thống. |
| R11 | **Dùng SWOT** để ra quyết định. |
| R12 | Phủ mục tiêu "**thi vào chuyên Tin**" và HSG (user xác nhận "cả hai"); tài liệu tự nhất quán, truy vết được. |

## 3. Ma trận truy vết (sau khi sửa)

Trạng thái *Thiết kế* nghĩa là tài liệu đã đáp ứng; chưa có mã nguồn nào của tính năng. Nhãn: [Inference] suy luận; [Unverified] chưa kiểm chứng.

| R | Đáp ứng ở đâu | Trạng thái | Ghi chú / còn mở |
| --- | --- | --- | --- |
| R1 | ADR 0008 (blueprint 12 giai đoạn, recipe, rubric); **bài giải đề** (ADR 0012, CONTENT-DESIGN §3.2); ARCHITECTURE §1–2; Phase 2 SCHEMA §2 | Thiết kế | Chất lượng thật đo bằng eval **và cổng G1/G2** với hội đồng LLM + học sinh mô phỏng, rồi số đo học sinh thật sau phát hành (ADR 0012, 0014). LLM có tuân recipe hay không: [Unverified]. |
| R2 | ADR 0001 (`vars`, `aux`, `render(frame, prev)`), ARCHITECTURE §6, §8 | Thiết kế | Chuyển động chỉ ở mức CSS transition (ADR 0002). |
| R3 | ADR 0008 Decision 5 (dự đoán **có chờ**, luyện tập không editor), preset + nhập input, ADR 0013 (beat theo preset), ADR 0006 (widget LLM sinh cho topic chưa có walkthrough) | Thiết kế | "Sinh động" đo bằng rubric [Inference] + G1. Engine chờ dự đoán cần spike Q9. |
| R4 | ADR 0003 (làm rõ), ADR 0010 (**mặc định chặn**; chặn ở hiển thị, ghi, sinh, CSP; cả hai trường), ADR 0008 (recipe không cảnh code; giữ đổi input) | Thiết kế | Phủ cả lớp học import (chặn lúc hiển thị). Rủi ro dư: widget LLM tự dựng editor bằng JS thuần (SECURITY §6). Bản 2026-09-29 hiểu quá hẹp (cấm cả widget LLM sinh, chỉ preset), đã gỡ. |
| R5 | ADR 0009 (Q&A biết frame; chữ từ catalog), ADR 0013 (bắt tay), ADR 0008 Decision 6 (thang gợi ý, hiểu lầm, ngân sách lời "tutor") | Thiết kế | ~8 file ở tầng app. Spike S2b (skill có tới chat agent không) ở lát 1c. |
| R6 | ADR 0002 (khảo sát + SWOT + trả lời trực tiếp + danh sách **nên tham khảo**, gồm Motion Canvas/Revideo) | Thiết kế | Số liệu khảo sát [Unverified] từng số cụ thể; điều khoản GSAP cần xác nhận. |
| R7 | ADR 0007 (Manim là hướng chính: khảo sát + SWOT M1–M4, X/Y/Z, tích hợp/thực thi, **lời thầy riêng**; quyết định M3 trên M1), Phase 3 SCHEMA | Thiết kế (Phase 3 ở mức khung) | Spike S1/S2/S4 chạy song song 1a; số liệu Manim/arXiv [Unverified] từng con số; mẫu do LLM tác giả viết, hội đồng LLM Toán ký (ADR 0014); S9 ở 3A. |
| R8 | ADR 0005 (subject pack), ARCHITECTURE §4 (checklist), Phase 3 SCHEMA | Thiết kế | Phần walkthrough Toán = thêm thư mục + một dòng đăng ký + skill + i18n skill title. **Phần clip Manim là thêm một loại phương tiện, làm một lần ở 3A** (`lib/clips`, tool `generate_clip_scenes`, `manim/`); sau đó thêm mẫu clip chỉ là thêm file. Bản trước nói "không sửa lõi" cho cả Toán là nói quá (đã sửa). |
| R9 | ADR 0005 (bảng sự thật kiến trúc, có file:line), ADR 0011 (điểm vào workbench, đăng ký tool theo tiền lệ `generate_video`), ARCHITECTURE §2 | Thiết kế | Các file:line được kiểm bằng `check_docs.py` (có neo nội dung cho trích dẫn quan trọng); chạy lại khi code đổi. |
| R10 | ADR 0005 (E3; quy tắc registry), ADR 0011 (tool tất định dùng lại cho môn khác), ADR 0013 (vòng đời scene), ARCHITECTURE §4 | Thiết kế | Trigger đổi sang E2/E4 nêu rõ; thêm loại phương tiện mới cần ADR. |
| R11 | ADR 0001–0013 (mỗi ADR có SWOT; các quyết định sản phẩm có ADR 0012) | Thiết kế | Một số SWOT cũ có ô trống/phương án yếu (review 2026-09-30); các ADR mới so sánh phương án loại trừ nhau thật. |
| R12 | ADR 0012 (hai luồng), Phase 2 SCHEMA §2 (độ phủ **theo luồng**), curriculum `tracks`, ADR 0004 | Thiết kế | `ts10` 8/14 sau 2A, 13/14 sau 2B; `hsg` 24/26 sau 2E [Inference: ánh xạ và nhãn luồng thủ công]. Thể thức thi vào 10 chuyên Tin [Unverified]. |

## 3b. Ma trận kiểm chứng (R → test / spike / lệnh)

| R | Kiểm chứng bằng | Lệnh hoặc bằng chứng | Trạng thái |
| --- | --- | --- | --- |
| R1–R3 | Rubric + `eval:tutor-lesson`; test entry (beat theo preset, hai `map`); **cổng G1/G2** (NFR-Q7) | `pnpm eval:tutor-lesson` (script cần thêm); `pnpm vitest run tests/subjects`; biên bản G1 | Chưa có mã |
| R2 | Test `build-html`, e2e `walkthrough-widget.spec.ts`, spike S3 | `pnpm exec playwright test e2e/tests/walkthrough-widget.spec.ts` | Chưa có mã |
| R4 | `policy.test.ts`, `render-block.test.ts`, `write-paths.test.ts`; e2e `code-widget-blocked.spec.ts`; mặc định chặn | `pnpm vitest run tests/widgets`; `pnpm exec playwright test e2e/tests/code-widget-blocked.spec.ts` | Chưa có mã |
| R5 | `tests/widgets/describe.test.ts` (chữ từ catalog), e2e bắt tay + `widget-state`, `eval:tutor-qa` (Đúng, Bám frame, Gợi ý trước) | `pnpm vitest run tests/widgets/describe.test.ts` | Chưa có mã |
| R6 | Khảo sát ở ADR 0002 (số liệu [Unverified] từng con số) | Không có test tự động; kiểm chứng lại nguồn khi cần | Tài liệu |
| R7 | Spike S1–S4; `tests/clips/*`; pytest `manim/qa` | `pytest manim/qa`; xem [RISKS §4](RISKS.md) | Chưa làm |
| R8, R10 | Acceptance 3B: thêm mẫu clip/walkthrough Toán chỉ thêm file | `git diff --stat` theo checklist [ARCHITECTURE §4](ARCHITECTURE.md) | Chưa có mã |
| R9 | Không đổi package; tham chiếu `file:line` còn đúng | `git diff --name-only origin/main -- packages/@openmaic` (rỗng); `python3 docs/tutor/tools/check_docs.py` | Đang áp dụng cho tài liệu |
| R11 | Mỗi ADR có bảng SWOT; ADR đánh số liên tục và có trong chỉ mục | `python3 docs/tutor/tools/check_docs.py` | Đang áp dụng |
| R12 | Độ phủ theo `tracks`; nhất quán tài liệu | Script đếm độ phủ theo luồng (**chưa có**); `curriculum-map.test.ts` (`tracks` khác rỗng); `check_docs.py` | Một phần |

Giới hạn: `check_docs.py` kiểm nội dung dòng (neo) **chỉ cho các trích dẫn quan trọng** trong danh sách `ANCHORS`; các trích dẫn khác chỉ được kiểm tồn tại và khoảng dòng (xem [RISKS R24](RISKS.md)).

## 4. Bảng quyết định (tóm tắt SWOT)

Bảng này chỉ là tóm tắt. Chỉ mục chính thức và trạng thái ở [decisions/README](decisions/README.md).


| ADR | Quyết định | Lý do then chốt (S/W/O/T) | Trigger đổi |
| --- | --- | --- | --- |
| 0001 | `Frame={state,meta}` tính sẵn, thêm `vars/aux/prev` | S: serialize/export/test; W: RAM/kích thước (chặn bằng trần); T: chuyển động hạn chế | Cần tween liên tục → ADR 0002 T1 |
| 0002 | SVG/DOM tự viết, không dependency | S: 0 KB, qua CSP video-export; W: tự viết layout; T: license (GSAP), CDN | T1/T2/T3 trong ADR |
| 0003 | Không code editor/chấm code; giữ interactive + visualizer + đổi input | S: đúng ý user, bài giảng sinh động; W: cần chặn `code` thật | Luyện code = phase riêng |
| 0004 | 1a–1c → G1 → 1d ‖ Tin 2A–2E ‖ Toán 3-0→3D; spike Manim sớm | S: kiểm chứng giá trị dạy sớm, độc lập; W: 1b lớn, Phase 2 chờ G1 | Đổi API base khi hai môn đã dùng |
| 0005 | E3 (registry gói môn học) trên vỏ E1 (một phần bị 0011 thay) | S: không đổi package, thêm môn = thêm file; W: nhãn "Simulation", thêm phương tiện cần ADR; T: over-engineering | Upstream nhận → E2; consumer ngoài → E4 |
| 0006 | Dữ kiện do hàm thuần; lời thầy kịch bản; LLM chỉ chọn id + input; topic chưa có walkthrough → storyboard hoặc widget LLM sinh | S: đúng, test được; W: công viết; T: LLM sai | >20% speech trượt (khi bật B) → soạn offline |
| 0007 | **Manim là hướng chính cho Toán**: M3 (mẫu tham số hoá) trên M1; phân bổ Z (Manim / walkthrough SVG / slide); clip câm + TTS; tích hợp slide video → render theo yêu cầu qua `manim-service` | S: đúng ý user, chỉ mã của ta chạy, tái dùng video/export/async có sẵn; W: vận hành image Manim, công viết mẫu, clip không tua theo bước; T: chạy mã LLM (loại), sai toán nhân lên | Hạ xuống phụ nếu <5 topic cần chuyển động / render quá chậm / tiếng Việt hỏng / >30% clip trượt QA |
| 0008 | Blueprint 12 giai đoạn; preset **+ nhập input tuỳ chỉnh (client)**; dự đoán có chờ; thang gợi ý; pseudo + C++ + Python để đọc hiểu | S: bài khó rõ ràng, đổi input để quan sát; W: thêm công viết (`inputSpec`, module `steps` theo entry) | Tính nặng không chạy được ở client → (4) bằng ADR |
| 0009 | Báo `widget-state` về host + digest cho thầy; chữ từ catalog | S: đúng frame, chống tiêm chữ; W: ~8 file ở tầng app | Cần thầy Q&A nhảy frame |
| 0010 | **Mặc định chặn** widget `code`; chặn nhiều lớp (hiển thị, ghi, sinh, CSP) | S: đúng "toàn ứng dụng" ở mọi cách chạy, phủ bài import; W: ~10 file, lệch upstream; T: CSP làm vỡ widget LLM (Q10) | Cần `code` ở nơi khác → chính sách theo gói |
| 0011 | Chỉ đường agent (workbench); tool tất định `generate_walkthrough`/`generate_clip_scenes` | S: 0 lời gọi LLM, id trong schema, không đụng classic; W: cần bật workbench (Postgres); T: agent tự mô phỏng bằng simulation → lỗi `use-generate-walkthrough` | Cần tính năng khi không bật workbench |
| 0012 | Hai luồng `ts10`/`hsg` xen kẽ; bài giải đề; C++ + Python; MVP 1a–1c + G1 | S: đúng người dùng chính, đo được giá trị dạy; W: thêm công viết, phụ thuộc người thật | G1 trượt 2 vòng |
| 0013 | `widget-ready` + gửi lại trạng thái cuối; beat theo preset; `entryRev`; khoá `patch_stage`; chữ từ catalog | S: lời khớp hình, chống tiêm, phát hiện lệch catalog; W: sửa host/`patch_stage`, tác giả quản `entryRev` | Vẫn mất lệnh sau `ready` → ack |

## 5. Xác nhận của user và mặc định còn chờ

### 5.1. Đã được user xác nhận (2026-09-30)

| # | Câu hỏi | Trả lời của user | Tác động |
| --- | --- | --- | --- |
| A | Chặn widget `code` áp cho toàn ứng dụng hay chỉ khoá Tin/Toán? | "Tôi không muốn tạo tính năng code editor để học sinh viết code, trên toàn bộ ứng dụng." | **Toàn ứng dụng.** ADR 0010 phương án (3a) là quyết định chính thức; (3b) bị loại. |
| B | Nhập input tuỳ chỉnh làm ngay hay sau preset? | "Sau khi phần chọn preset chạy ổn." | Lát **1d chỉ mở khi cổng ADR 0012 quyết định 7 đạt** (G1 đạt; e2e walkthrough xanh 20 lần liên tiếp; ≥ 10 lớp học trong 14 ngày không lỗi P0/P1); entry Phase 2 mặc định `customInput:false` cho tới lúc đó. |
| C | Manim ở mức nào cho Toán? | "Đây là hướng chính." | ADR 0007 được thiết kế lại: **Manim là hướng chính để trực quan hoá Toán** (không còn là pilot 1–3 clip). |
| D | Điểm vào: chỉ khi bật workbench, hay cả đường classic? | "Khi bật workbench." | ADR 0011: chỉ đường agent; tool tất định `generate_walkthrough`; điều kiện triển khai (Postgres, agent runtime, build arg). |
| E | Đối tượng ưu tiên: thi vào 10 chuyên Tin hay HSG? | "Cả hai." | ADR 0012: hai luồng `ts10`/`hsg`, tier 1–2 trước, bài giải đề mỗi đợt. |
| F | Lời thầy trong clip Manim: câm + lời riêng, hay ghép audio? | "Giữ riêng." | ADR 0007 Decision 3: clip câm, lời trước/sau chapter; không `cues.json`; `locale = null` trong cache key nếu không có chữ nướng. |
| G | Ngôn ngữ code chỉ-đọc? | "C++ và Python." | ADR 0008 Decision 3 (b'): `impl{cpp,py}`, hai `map`, bẫy theo ngôn ngữ. |
| H (2026-10-01) | Bộ lọc nội dung? | "Dùng một LLM khác làm bộ lọc nội dung." | ADR 0014 quyết định 2: `tutor-moderation`, lọc vào/ra, fail-closed. |
| I (2026-10-01) | Ai duyệt nội dung Tin (và Toán)? | "Dùng một LLM khác đóng vai trò giáo viên chuyên Tin." | ADR 0014 quyết định 3: hội đồng hai LLM khác nhà cung cấp, bộ hiệu chuẩn; áp dụng cả Toán. |
| J (2026-10-01) | Ai viết Manim? | "Dùng một LLM khác viết Manim." | ADR 0014 quyết định 4: `manim-author` offline trong CI; đường phục vụ không đổi. |
| K (2026-10-01) | Thời gian lưu dữ liệu học sinh? | "Lưu trữ dữ liệu học sinh." "Mọi thứ đều dùng LLM để giảm thiểu sự invoke của người khác." | ADR 0014 quyết định 5–6: lưu không tự xoá trong kho runtime; học sinh mô phỏng thay học sinh thử; số đo thật sau phát hành. |
| L (2026-10-01) | Hai nhà cung cấp LLM? | "Deepseek V4.1 flash và GPT-6-luna." | ADR 0014 quyết định 8: phân vai (DeepSeek: lọc, hội đồng #1, duyệt mã, học sinh mô phỏng, phân tích; GPT-6-luna: dạy, soạn, tác giả Manim, hội đồng #2). Định danh model [Unverified], spike Q16. |
| M (2026-10-01) | Rà soát pháp lý dữ liệu trẻ vị thành niên? | "Chưa cần." | R38 hoãn; bắt buộc trước khi phát hành cho học sinh thật. |
| N (2026-10-01) | Commit tài liệu? | "Chưa cần." | R18 hoãn. |

### 5.2. Mặc định hội đồng đã chọn thay user (đảo được, ảnh hưởng nhỏ)

1. **Vỏ `widgetType:'simulation'`** (không đổi package) — nhãn "Simulation" trong outline editor (ADR 0005).
2. **Slider tham số hàm số**: làm bằng `customInput` của `curve-sketching` (đổi hệ số → phân tích chạy lại trong iframe), không cần walkthrough riêng. Chỉ "kéo điểm trên hình" để sau (Phase 3 §2).
3. **Chuyển `curriculum-informatics-vn/` vào `docs/tutor/curriculum/`** (tạm) để hết làm test `tests/agent-runtime/skills.test.ts` đỏ; sẽ vào `references/` của skill ở Phase 2.
4. **GSAP** chỉ dùng nếu chạm trigger *và* xác nhận điều khoản.
5. **Manim (ADR 0007), hội đồng chọn thay user:** M3 làm lõi (LLM không viết mã Manim chạy trên server; M2 chỉ offline); phân bổ Z; mỗi chapter một file và một slide; đợt 1 chỉ tra asset dựng sẵn, render theo yêu cầu ở đợt 3; đợt 2 chỉ mở rộng sau khi kiểm kê topic Toán (S5). (Clip câm + lời riêng: user đã xác nhận, mục F.)
6. **Review 2026-09-30, hội đồng chọn thay user** (đảo được):
   - tool riêng `generate_walkthrough` thay vì bọc `generate_scene` (ADR 0011);
   - cờ **mặc định chặn** `code` (ADR 0010);
   - bắt tay `widget-ready` (ADR 0013);
   - cổng G1/G2 và ngưỡng (+20 điểm %, ≥ 70% "dễ hiểu"), nay là **giá trị áp dụng** (ADR 0012, 0014);
   - `manim-service` dùng container dài hạn cứng hoá + tiến trình con (ADR 0007 Decision 5).
7. **Khung curriculum Toán** (28 topic, cột `primary_medium`) là đề xuất **[Inference]**, hội đồng LLM Toán duyệt kèm nguồn; chưa có nguồn chính thức.
8. **ADR 0014, hội đồng chọn thay user** (đảo được): hai nhà cung cấp cho mỗi hội đồng; ngưỡng bộ hiệu chuẩn; persona học sinh mô phỏng; `tutorLearning` trong kho runtime (không thêm bảng).

## 6. Tài liệu nguồn cho từng yêu cầu

| R | Chi tiết ở |
| --- | --- |
| R1–R3 (rõ ràng, trực quan, sinh động) | [CONTENT-DESIGN](CONTENT-DESIGN.md), ADR 0008, [NFR-Q5](NFR.md) |
| R4 (không code editor) | ADR 0003, 0010, [SECURITY T8](SECURITY.md), [OPERATIONS §2](OPERATIONS.md) |
| R5 (thầy trả lời, dạy kèm) | ADR 0009, 0013, ADR 0008 Decision 6, [INTERFACES §2](INTERFACES.md), [DATA-MODEL §6](DATA-MODEL.md), [CONTENT-DESIGN §4](CONTENT-DESIGN.md) |
| R6–R7 (thư viện, Manim) | ADR 0002, 0007, [OPERATIONS §1](OPERATIONS.md), [SECURITY T9–T11](SECURITY.md) |
| R8, R10 (mở rộng, thêm Toán) | ADR 0005, 0011, [ARCHITECTURE §4](ARCHITECTURE.md), [ONBOARDING §3](ONBOARDING.md) |
| R9 (đúng kiến trúc OpenMAIC) | ADR 0005, [ARCHITECTURE §2](ARCHITECTURE.md), [DATA-MODEL §2](DATA-MODEL.md) |
| R11 (SWOT) | [decisions/README](decisions/README.md) |
| R12 (phủ, nhất quán, truy vết) | ADR 0004, 0012, [Phase 2 §2](phase-2-competitive-programming/SCHEMA.md), [RISKS](RISKS.md), [TEST-STRATEGY](TEST-STRATEGY.md), [GLOSSARY](GLOSSARY.md) |
| Chất lượng phi chức năng | [NFR](NFR.md) |
