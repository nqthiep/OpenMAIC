# OpenMAIC SubjectTutor — Tài liệu thiết kế

- **Trạng thái**: Thiết kế (vòng 9: đã chia task cho worker), **chưa có mã nguồn của tính năng**
- **Ngày**: 2026-10-01
- **Người sở hữu**: Chủ dự án
- **Liên quan**: mọi tài liệu trong thư mục này (mục lục ở §2)

> **Tóm tắt:** SubjectTutor thêm **Chuyên Tin** và **Chuyên Toán** vào OpenMAIC, **chạy trên workbench** (đường agent). Theo yêu cầu:
> - bài khó *rõ ràng, chi tiết, dễ hiểu, trực quan, sinh động*;
> - **không code editor** (mặc định chặn toàn ứng dụng); interactive + visualizer để dễ hiểu;
> - phục vụ cả học sinh **thi vào 10 chuyên Tin** và **HSG**; dễ thêm môn.
>
> Tin dùng walkthrough SVG: dữ kiện do hàm thuần sinh, có test; code chỉ-đọc C++ và Python. Toán dùng **Manim làm hướng chính**: clip câm, lời thầy riêng. Không đổi package `@openmaic/*`, không thêm npm dependency. Bắt đầu ở [REQUIREMENTS](REQUIREMENTS.md).

## 1. Mục tiêu và phạm vi

1. **Chuyên Tin**: dạy lập trình tin học nâng cao cho hai luồng (ADR 0012), cả bài **thuật toán** và bài **giải đề**.
   - `ts10`: thi vào lớp 10 chuyên Tin.
   - `hsg`: HSG Tin.
2. **Chuyên Toán**: dạy Toán nâng cao (Phase 3), dùng chung nền với Tin.

Hai môn dùng chung **Base Layer** (Phase 1): widget `walkthrough`, trình chiếu thuật toán/chứng minh từng bước trong iframe, do thầy AI dẫn dắt, hỏi dự đoán và dạy kèm. Ứng dụng **thuần giảng dạy**.

**Điều kiện chạy:** workbench bật, cần `OPENMAIC_AGENT_RUNTIME_ENABLED` + `DATABASE_URL` + build arg `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED` (ADR 0011, [OPERATIONS §2](OPERATIONS.md)).

**Ngoài phạm vi:**
- Chấm bài tự động; code editor / online IDE / sandbox chạy code của học sinh.
- Walkthrough trên đường tạo khoá học mặc định (classic).
- Marketplace, adaptive learning, teacher dashboard.
- Embed bên thứ ba (Desmos/GeoGebra).
- LLM viết mã Manim chạy trên server phục vụ.
- Visualizer 3D; kéo điểm trực tiếp trên hình.

## 2. Mục lục tài liệu

Bộ tài liệu đầy đủ theo các loại: tổng quan, yêu cầu, chất lượng, kiến trúc, dữ liệu, giao diện, bảo mật, vận hành, kiểm thử, quyết định, nội dung, rủi ro, thuật ngữ, onboarding.

```
docs/tutor/
├── README.md                 # Tổng quan + mục lục (file này)
├── REQUIREMENTS.md           # Yêu cầu gốc, R1–R12, ma trận truy vết + kiểm chứng, quyết định của user
├── NFR.md                    # Thuộc tính chất lượng: chỉ số, ngưỡng, cách đo, cổng
├── ARCHITECTURE.md           # Kiến trúc: bối cảnh (C4), luồng, sơ đồ trình tự, mở rộng, runtime, giao thức
├── DATA-MODEL.md             # Thực thể, schema, vòng đời, giới hạn, cache key
├── INTERFACES.md             # Hợp đồng giao diện (nguồn chính thức): message, tool, HTTP, kiểu TS, phiên bản
├── SECURITY.md               # Mô hình đe doạ, biện pháp, rủi ro dư
├── OPERATIONS.md             # Triển khai, cấu hình, CI, sao lưu, giám sát, runbook, chi phí, rollback
├── TEST-STRATEGY.md          # Tầng kiểm thử, lệnh, cổng CI, eval, cổng sư phạm, cái không kiểm
├── CONTENT-DESIGN.md         # Cách dạy: hai luồng, bài thuật toán/giải đề, Toán, lời thầy, tác giả, rubric
├── RISKS.md                  # Đăng ký rủi ro, giả định, phụ thuộc, sổ spike, quyết định của user
├── GLOSSARY.md               # Thuật ngữ và từ dễ nhầm
├── ONBOARDING.md             # Đọc gì trước, dựng môi trường, quy ước, checklist PR
├── REVIEW-2026-09-29.md      # Nhật ký các vòng thẩm định (lịch sử)
├── decisions/                # ADR — chỉ mục + mẫu ở decisions/README.md; mỗi ADR có SWOT
│   ├── README.md   0001 … 0013 (xem chỉ mục)
├── curriculum/               # Dữ liệu curriculum (tạm; vào references/ của skill ở Phase 2)
├── tools/check_docs.py       # Kiểm tài liệu (cấu trúc, liên kết, tham chiếu, neo nội dung): `python3 docs/tutor/tools/check_docs.py`
├── phase-1-base-layer/SCHEMA.md
├── phase-2-competitive-programming/SCHEMA.md
├── phase-3-olympiad-math/SCHEMA.md       # mức khung cho tới khi 3-0 có kết quả
└── tasks/                    # 211 task cho worker: luật chung, card, đợt (README.md, phase-1/2/3.md)
```

## 3. Kế hoạch theo đợt

| Đợt | Nội dung | Phụ thuộc |
| --- | --- | --- |
| **1a** | Engine (`tick`), player, guard message, `InputSpec`, `WalkthroughEntry` (`beatDefs`, C++ + Python), `binary-search`; chỉ test node | — |
| **1b** | Runtime/shell + CSP, bắt tay `widget-ready`, registry + provider, **tool `generate_walkthrough`**, chặn `code` nhiều lớp, khoá `patch_stage`, điều kiện workbench, i18n, e2e | 1a |
| **1c** | Q&A biết frame + thang gợi ý, dự đoán có chờ, bài giải đề nhỏ | 1b |
| **G1** | **Cổng sư phạm**: hội đồng LLM "giáo viên chuyên Tin" ký + học sinh mô phỏng + bộ hiệu chuẩn (ADR 0014) | 1c |
| **1d** | Nhập input tuỳ chỉnh. **Cổng: "preset chạy ổn" đo được** (ADR 0012 §7) | G1 |
| **2A–2E** | Tin, hai luồng xen kẽ: 2A nền chung tier 1–2 + bài giải đề `bs-answer` (cổng G2) → 2B phần `ts10` còn lại + HSG cốt lõi → 2C HSG cấu trúc dữ liệu/đồ thị ‖ 2D storyboard → 2E độ khó 5 | G1 |
| **3-0** | Toán: spike S1/S2/S4 **song song 1a**; S3 (sau 1b), S5 + research curriculum Toán | S3: 1b |
| **3A** | Toán: **Manim đợt 1** (image pin, 3 mẫu, CI + cổng QA, tool `generate_clip_scenes`, export; LLM tác giả Manim + S9) | 1b; 3-0 |
| **3B–3D** | Manim đợt 2 (sau 3B tổng 9–12 mẫu) + 3 walkthrough Toán → render theo yêu cầu (`manim-service`) → trợ lý soạn nháp offline | 3A |

Chỉ có ước lượng cỡ S/M/L ([ADR 0004](decisions/0004-three-phase-plan.md)), chưa có ước lượng thời gian. Phase 2 ‖ Phase 3. Rủi ro và spike: [RISKS](RISKS.md).

## 4. Nguyên tắc cốt lõi

1. **Không có code editor cho học sinh** (không bài luyện code, không chấm code): widget `code` **mặc định bị chặn** ở hiển thị, ghi và sinh (ADR 0003, 0010). **Interactive + visualizer + đổi input để quan sát được khuyến khích**; code chỉ hiển thị để đọc hiểu (C++ và Python).
2. **Bài khó có khung dạy**: blueprint 12 giai đoạn, bài giải đề có thang subtask, học chủ động (dự đoán có chờ, luyện không editor), dạy kèm theo thang gợi ý (ADR 0008, 0012, [CONTENT-DESIGN](CONTENT-DESIGN.md)). **Giá trị dạy được đo ở cổng G1/G2.**
3. **Dữ kiện do hàm thuần sinh, có test; lời thầy kịch bản tất định** theo beat của từng preset. LLM chỉ chọn `walkthroughId` + `presetId` qua tool `generate_walkthrough`; từ 1d có thể cấp `input` (ADR 0006, 0011, 0013).
4. **Widget là HTML tự chứa trong iframe sandbox + CSP**, không phải component React của host; host và iframe bắt tay `widget-ready` (ADR 0005, 0013).
5. **Mở rộng bằng gói môn học**: thêm môn dùng lại phương tiện có sẵn = thêm thư mục + một dòng đăng ký; thêm **loại phương tiện** mới cần ADR. **Không đổi package publish** (ADR 0005).
6. **Không thêm npm dependency**; trực quan bằng SVG/DOM tự viết (ADR 0002). **Manim là hướng chính cho Toán** (user xác nhận): mẫu tham số hoá, clip câm + lời thầy riêng, mỗi chapter một slide. LLM chỉ chọn `clipId` + `presetId`/`params`, không viết mã Manim chạy trên server (ADR 0007).
7. **Tái dùng kênh và tiền lệ có sẵn**: `SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `__maicInteractive`, cách đăng ký tool như `generate_video` ([INTERFACES](INTERFACES.md)).
8. **Quyết định bằng SWOT**: mỗi ADR có bảng S/W/O/T và trigger đổi quyết định.
9. **Không cần người thật để vận hành quy trình** (ADR 0014): bộ lọc nội dung, hội đồng giáo viên Tin/Toán, tác giả Manim và học sinh thử đều là **LLM riêng** (khác nhà cung cấp với model dạy), mỗi vai trò có bộ hiệu chuẩn. Kiểm tất định vẫn là cổng cứng. Dữ liệu học sinh được lưu để đo việc học thật.

## 5. Trạng thái hiện tại

- Curriculum Tin: `curriculum/curriculum-informatics-vn.json`.
  - 4 tier, 32 topic (6 + 7 + 7 + 12); mỗi topic có `tracks` (`ts10`: 14 topic, `hsg`: 26 topic, [Inference], hội đồng LLM Tin duyệt).
  - Đã kiểm tra không có `prerequisites` treo/vòng/ngược tier; `course_shape` theo ADR 0008; `sequencing` đủ 32 topic.
  - **Chưa được git theo dõi**; cần rà nguồn/bản quyền trước khi commit (`provenance` trong file).
- `.gitignore`: đã bỏ ignore `docs/tutor/` (`/docs/*` + `!/docs/tutor/`); các file **chưa commit**.
- Chưa có `lib/tutor/`, `lib/widgets/`, `lib/subjects/`, `lib/clips/`, `manim/`.
- Quyết định của user (2026-09-30), chi tiết ở [REQUIREMENTS §5](REQUIREMENTS.md):
  - chặn `code` toàn ứng dụng;
  - nhập input sau khi preset chạy ổn;
  - Manim là hướng chính;
  - chỉ khi bật workbench;
  - cả hai đối tượng;
  - lời thầy riêng với clip;
  - code C++ và Python;
  - (2026-10-01) mọi vai trò con người dùng LLM; lưu dữ liệu học sinh (ADR 0014);
  - (2026-10-01) hai nhà cung cấp DeepSeek V4.1 flash + GPT-6-luna (định danh [Unverified], spike Q16); rà pháp lý và commit: chưa cần.
- (2026-10-01) Đã chia thành 211 task cho worker, đủ cả ba phase ([tasks/](tasks/README.md)). Muốn giao việc trong worktree thì phải commit tài liệu trước (task `0-01`).
- Review 4 chuyên gia (2026-09-30): các lỗi chặn và lỗi Major đã được xử lý trong tài liệu ([REVIEW §Vòng 6](REVIEW-2026-09-29.md)).

## 6. Cách đọc theo vai trò

| Vai trò | Đọc |
| --- | --- |
| **Worker nhận task** | [tasks/README](tasks/README.md) §3 (luật chung) → card của task → các mục ở dòng `Đọc` |
| **Coding agent / dev** | [ONBOARDING](ONBOARDING.md) → [REQUIREMENTS](REQUIREMENTS.md) → [ARCHITECTURE](ARCHITECTURE.md) → ADR (0005, 0010, 0011, 0013 trước) → `phase-<n>/SCHEMA.md` của lát bạn làm → [INTERFACES](INTERFACES.md), [TEST-STRATEGY](TEST-STRATEGY.md) |
| **Kiến trúc sư / reviewer** | [REQUIREMENTS §4](REQUIREMENTS.md) (bảng quyết định) → [ARCHITECTURE](ARCHITECTURE.md) → [NFR](NFR.md), [SECURITY](SECURITY.md), [RISKS](RISKS.md) |
| **Sản phẩm / chủ dự án** | [REQUIREMENTS](REQUIREMENTS.md) → ADR 0012 → [CONTENT-DESIGN](CONTENT-DESIGN.md) → [RISKS](RISKS.md) → ADR 0002, 0007, 0008 |
| **Tác giả nội dung / người cấu hình vai trò LLM** | [CONTENT-DESIGN](CONTENT-DESIGN.md) → [GLOSSARY](GLOSSARY.md) → curriculum |
| **DevOps** | [OPERATIONS](OPERATIONS.md) → [SECURITY](SECURITY.md) → [NFR](NFR.md) |
