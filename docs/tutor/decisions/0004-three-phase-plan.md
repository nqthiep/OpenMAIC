# ADR 0004: Kế hoạch triển khai — Base (3 lát) → Tin ‖ Toán, theo đợt

- **Status**: Accepted (sửa 2026-09-29; sửa 2026-09-30 theo ADR 0011–0013; quyết định bằng SWOT)
- **Date**: 2026-09-28; sửa 2026-09-29, 2026-09-30
- **Deciders**: User + Architect panel
- **Liên quan**: [../README §3](../README.md), [../RISKS](../RISKS.md), [0012](0012-audience-scope-pedagogy-gates.md), phase-1/2/3 `SCHEMA.md`

> **Tóm tắt:** kế hoạch **Base (1a–1c) → cổng G1 → 1d ‖ Tin (2A–2E) ‖ Toán (3-0 → 3A–3D)**. Spike Manim S1/S2/S4 chạy song song với 1a. Phase 2 xen kẽ hai luồng `ts10`/`hsg` (ADR 0012); độ phủ walkthrough theo luồng: `ts10` 8→13/14, `hsg` 5→10→17→21→24/26. Chỉ có ước lượng cỡ S/M/L, chưa có ước lượng thời gian.

## Context

User đề xuất: "chỉ chia làm 3 phase implement: base layer, lập trình, toán học" (vì dùng coding agent). Yêu cầu gốc cũng đòi: bài khó phải rõ ràng/chi tiết/trực quan/sinh động, và **thiết kế để sau làm Toán**.

Độ phủ của bản 7-walkthrough quá thấp cho mục tiêu "thi vào chuyên Tin": 7/32 topic; tier 1: 0/6; topic độ khó 5: 0/8; độ khó ≥4: 2/15 (đếm bằng script trên `curriculum-map.json`). Bản 2026-09-29 dùng 12 mô-đun để nâng lên 15/32 topic, nhưng đẩy phần lớn tier 1–2 vào backlog. **Sửa 2026-09-30 (ADR 0012)**: xếp theo hai luồng; tier 1–2 làm trước vì phục vụ cả hai luồng. Tổng cộng 29/32 topic có mô-đun (30/32 khi có `geometry`); `t1-complexity` và `t4-number-combinatorics` không có walkthrough theo chủ ý. Chi tiết theo đợt ở Phase 2 §2.2. [Inference]: ánh xạ topic↔mô-đun và nhãn luồng là thủ công, cần giáo viên Tin duyệt.

## SWOT — cách chia phase

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| A. Một mega-phase | Nhanh về danh nghĩa. | Quá tải context coding agent; khó review/test; lỗi base ảnh hưởng hai môn. | — | Không kiểm chứng được sớm. |
| B. Tuần tự Base → Tin → Toán | Đơn giản. | Toán chờ Tin dù không dùng code của Tin. | — | Chậm. |
| **C. Base (3 lát) → (Tin ‖ Toán), Tin theo đợt (chọn)** | Base chứng minh vòng đời đầy đủ với 1 bài thật; Tin và Toán độc lập (không chung file, không đổi package); có thể dừng ở bất kỳ đợt nào; giao được cho hai coding agent (worktree riêng). | Phase 1 lớn hơn bản đầu. | Đợt nhỏ → phản hồi sớm. | Đổi API base khi hai môn đã dùng thì tốn kém. |

## Decision

**Phương án C**, sửa 2026-09-30:
- MVP = 1a–1c + G1 (ADR 0012).
- Phase 2 xen kẽ hai luồng và có thêm đợt 2E.
- Phase 3 chỉ giữ ở mức khung cho tới khi 3-0 có kết quả.

Ước lượng thời gian: chưa có (không nguồn), sẽ ước lượng lại sau spike (Phase 1 §7). Không dùng con số "tái sử dụng ~80%" hay "+10% effort" của bản đầu.

| Phase | Nội dung | Phụ thuộc | Cỡ [Inference] |
| --- | --- | --- | --- |
| **1a** | Engine (`tick`/`maxSteps`), player, guard message, `InputSpec`, `WalkthroughEntry` (`beatDefs`, C++ + Python), `binary-search` — chỉ test node | — | M |
| **1b** | Runtime/shell + CSP, bắt tay `widget-ready`, registry + provider, **tool `generate_walkthrough`**, chặn `code` nhiều lớp (ADR 0010), khoá `patch_stage`, điều kiện workbench (Dockerfile/compose), i18n, e2e | 1a | L |
| **1c** | Q&A biết frame (ADR 0009): digest + `widget-state`; thang gợi ý; ngân sách lời "tutor"; chế độ dự đoán (Q9); S2b; một bài giải đề nhỏ | 1b | M |
| **G1** | Cổng sư phạm: hội đồng LLM ký + học sinh mô phỏng (ADR 0012 §6, ADR 0014) | 1c | — |
| **1d** | Nhập input tuỳ chỉnh (ADR 0008 §2): module `run` theo entry, preset `student`/`llm`, Q&A tính lại. **Cổng: "preset chạy ổn" đo được (ADR 0012 §7)** | G1 | M |
| **2A** | Visualizer `array` (mở rộng), `tree`, `graph`, `grid` + panel phụ; nền chung tier 1–2: prefix-sum/two-pointers, stack-queue, fib-recursion-tree, quick/merge sort, subset-gen/n-queens; **bài giải đề `bs-answer`**; cổng G2 | G1 | L |
| **2B** | Phần `ts10` còn lại (sieve/euclid, bit-subsets, activity-selection, string-scan, hash-count) + HSG cốt lõi (BFS/DFS, knapsack/LCS/LIS) + ≥1 bài giải đề | 2A | L |
| **2C** | HSG: DSU + Kruskal, Dijkstra + heap, segment tree + BIT, DP cây, DP bitmask + ≥1 bài giải đề | 2B | L |
| **2D** | Storyboard cho topic khó (HLD, luồng, SAM/SA/Aho, CHT/Knuth) | 2B | M |
| **2E** | Topic độ khó 5 còn lại (KMP, Tarjan, digit-DP, Nim/Grundy; Graham cần `geometry` của Phase 3B) | 2C | M |
| **3-0** | Spike S1, S2, S4 (**song song 1a**); S3 (cần 1b), S5 (kiểm kê topic) + research curriculum Toán | S3: 1b | M |
| **3A** | Manim đợt 1: image pin, 3 mẫu, CI + cổng QA, tool `generate_clip_scenes` + provider clip, export trọn vòng; vòng LLM tác giả + S9, đo chi phí token/mẫu → quyết định đi tiếp/dừng | 1b; 3-0 (S1–S4) | L |
| **3B** | Manim đợt 2 (sau 3B tổng 9–12 mẫu theo kiểm kê, vi/en, `clip-sheet` cho Q&A) ‖ walkthrough SVG (`cauchy-schwarz`, `triangle-altitude`, `curve-sketching`) | 3A; S5 | L |
| **3C** | Render theo yêu cầu: `generate_clip_scenes{params}` + `manim-service` (cách ly theo ADR 0007 Decision 5) | 3B; S6 | L |
| **3D** | Mở rộng catalog hàng loạt bằng LLM tác giả (ADR 0014) | 3B | M |

Cỡ S/M/L là ước lượng tương đối [Inference], chốt lại sau spike Q1/Q5 (Phase 1 §7). Chi tiết mô-đun ở Phase 2 SCHEMA §2.

## Consequences

**Positive:**
- Acceptance riêng từng lát; độ phủ đo được sau mỗi đợt theo từng luồng.
- Có cổng sư phạm trước khi mở rộng.
- Rủi ro chính của Toán (render, tiếng Việt, tất định) được giảm sớm nhờ S1/S2/S4 chạy song song 1a.
- Toán không chờ Tin.

**Negative:**
- 1b lớn (tool, runtime, chặn nhiều lớp, điều kiện workbench).
- Phase 2 chờ G1.
- `t4-geometry` (Tin) phụ thuộc visualizer `geometry` (Phase 3); đặt `geometry` ở thư mục runtime dùng chung để Tin dùng lại khi có.

## Implementation note

- Mỗi phase có `SCHEMA.md` riêng; coding agent đọc file đó.
- `docs/tutor/` đã được bỏ ignore trong `.gitignore` nhưng **chưa commit**; worktree mới chỉ thấy sau khi commit.
- Curriculum là **dữ liệu** nằm trong `references/` của skill tương ứng (công cụ `read` của agent chỉ đọc trong thư mục skill có `SKILL.md`; test buộc mọi thư mục trong `skills/agent-runtime` là skill). Trong lúc chờ skill Phase 2, file nằm ở `docs/tutor/curriculum/`.
