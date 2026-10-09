# Bàn giao cho sub-agent: SubjectTutor (nhánh it-math)

- **Trạng thái**: Living document, chụp lúc bàn giao 2026-10-09; cập nhật khi trạng thái đổi
- **Ngày**: 2026-10-09
- **Người sở hữu**: Chủ dự án (nqthiep)
- **Liên quan**: [HANDOFF](../HANDOFF.md) (trạng thái chi tiết), [tasks/README](README.md), [RISKS](../RISKS.md), [ADR 0014](../decisions/0014-llm-roles-and-learner-data.md), [ADR 0015](../decisions/0015-math-interactive-web-ui-not-video.md)

> **Tóm tắt:** Việc còn lại chủ yếu là **review nội dung bằng hội đồng LLM** cho 64 trên 67 walkthrough (chưa có file review) và sửa nội dung theo kết quả. Đang bị chặn bởi hạn mức OpenCode Go. Mọi việc khác đã xong và đã commit cục bộ. Không được push.

## 1. Quy tắc làm việc (bắt buộc)

- Trả lời người dùng bằng **tiếng Việt**. Dùng `[Unverified]` / `[Inference]` cho điều chưa kiểm chứng; không bịa nguồn.
- **Commit cục bộ, không push.** Không `git push`, không mở PR, không `git push --force`.
- **Không stage** `AGENTS.md` và `CLAUDE.md` (untracked, do `next dev` sinh). Dùng: `git add -A -- . ':!AGENTS.md' ':!CLAUDE.md'`.
- Dấu co-author cho commit mới: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` (theo chỉ dẫn hiện hành của phiên).
- Không xoá gì ngoài repo (worktree, thư mục home) mà không hỏi người dùng. Đã xoá trước đó: 73 worktree `tutor-wt/*`, 72 nhánh `task/*`, `~/.opencodex`, 3 agent `ocx-*`, `~/Library/TinyTeX`.
- **Không dùng** agent `ocx-*` hay `opencodex` (đã gỡ). Đừng spawn worker OpenCode nếu người dùng chưa đồng ý rõ ràng, và luôn hỏi trước theo `~/.claude/rules/opencode-delegation.md`.
- Không in giá trị khoá API. Khoá nằm trong `.env.local`; chỉ đọc khi cần, không ghi vào tài liệu.

## 2. Môi trường

```bash
cd /Users/quangthiep/Projects/OpenMAIC
export PATH=/Users/quangthiep/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH   # Node 24 (dev)
# Node 22 (bản CI): /Users/quangthiep/.local/share/fnm/node-versions/v22.23.3/installation/bin
```

- Node 22 là môi trường chuẩn để chạy toàn bộ vitest (146/146 test "lỗi nền" qua trên Node 22; trên Node 24 có 46 test đỏ không liên quan đến SubjectTutor).
- Một số test chạm timeout 5 giây khi cả bộ chạy song song; chạy riêng thì qua. Các test đã biết có timeout 60 giây; nếu gặp test mới chậm thì nới timeout tương tự, đừng sửa logic.
- Nhánh: `it-math`. Đầu nhánh: `65444a9`. Có khoảng 250 commit chưa push so với `origin/it-math`.

## 3. Trạng thái

**Đã xong (commit trên `it-math`):**
- Phase 1 (lớp nền) và Phase 2 (Tin học): 40 entry `cp`, có test oracle và harness C++/Python.
- Phase 3 (Toán, web UI theo ADR 0015): 27 walkthrough `math`, visualizer `geometry`/`functionPlotter`/`proofOutline`, KaTeX dựng sẵn, skill `olympiad-math`, curriculum 28 topic.
- Lọc nội dung (ADR 0014) cho: `/api/chat`, `/api/chat/pi`, `/api/quiz-grade`, và cả `POST /api/agent/sessions` + `POST /api/agent/sessions/:id/messages` (commit `ee45496`).
- Xuất video theo chính sách widget `code`; `HIGHLIGHT_ELEMENT` giữ lại trước `widget-ready`; câu hỏi dự đoán; lỗi "1 nodes" trong tiếng Anh (cú pháp `{n|node|nodes}`).
- Docker: `docker build --build-arg NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true -t openmaic-tutor-check .` đã chạy thành công; trong image có các file review.
- Kiểm tra: `tsc` sạch, `check_docs.py` 0 vấn đề, catalog sweep trình duyệt (`TUTOR_BROWSER=1`) qua, e2e `walkthrough-math`, `walkthrough-widget`, `code-widget-blocked` qua.

**File review hiện có (đây là các file cổng, không được sửa tay):**
- `lib/subjects/cp/reviews/binary-search@3.json`, `bs-answer-mini@4.json`, `stack-queue@3.json`. Đạt bởi `deepseek-v4-pro` + `kimi-k3` (2026-10-09).
- Bản ghi chưa đạt (không phải cổng): `docs/tutor/review-runs/2026-10-09-deepseek-kimi/` (`cauchy-schwarz`, `two-pointers`, `prefix-sum`, `merge-sort`, `fib-recursion-tree`). Các lỗi thật trong đó đã sửa (entryRev tăng), **chưa chạy lại** để có file đạt.

## 4. Việc còn lại, theo thứ tự ưu tiên

### 4.1. Review hội đồng cho 64 entry chưa có file (bị chặn)

- **Chặn bởi:** hạn mức OpenCode Go hết ("Go usage limit exceeded"). `space-bunny`, `kimi-k3`, `deepseek-v4-flash` đều báo hết hạn mức; `gpt-6-luna` và `glm-5.3` không dùng được qua chat completions; `step-5-preview-free` lỗi endpoint; `longcat-2.5-preview-free` chạy được nhưng chậm (có lượt quá 900 giây).
- **Quy tắc:** hội đồng cần hai model khác nhà cung cấp (ADR 0014 quyết định 8). Người dùng đã nói: **tạm** dùng một model đóng hai vai đến khi có UAT với model thật. Kết quả một model **không** được ghi như cổng đạt; phải ghi rõ trong tài liệu.
- **Khi đã có hạn mức:** dùng `eval/tutor-review/runner.ts`. Thiết lập `MODEL_ROUTES` cho `tutor-review-cp`, `tutor-review-cp-2` (môn cp) hoặc `tutor-review-math`, `tutor-review-math-2` (môn math). Đặt `TUTOR_REVIEW_TIMEOUT_MS=900000`, `TUTOR_REVIEW_MAX_OUTPUT_TOKENS=32000`. Chạy từng entry, tối đa 4 tiến trình song song. Lệnh mẫu:
  ```bash
  pnpm exec tsx eval/tutor-review/runner.ts <entryId>
  ```
- **Danh sách 64 entry chưa có file:** so `entryRev` trong `lib/subjects/*/catalog/*.ts` với tên file `<id>@<entryRev>.json` trong `lib/subjects/*/reviews/` (một lần chạy Python ngắn là đủ; kết quả lần kiểm cuối là 64/67). Đừng đoán thủ công.

### 4.2. Sửa nội dung theo review (đã xác định)

- `cauchy-schwarz`, `two-pointers`, `prefix-sum`, `merge-sort`, `fib-recursion-tree`: đã sửa một phần ở commit `7e43852`; chi tiết còn lại trong `docs/tutor/review-runs/2026-10-09-deepseek-kimi/README.md`. Chạy lại review để xác nhận.
- Prompt reviewer đã có ghi chú: `{n|one|other}` không phải mẫu chưa điền; `factErrors` chỉ dành cho lỗi.
- **Không sửa nội dung** ba entry đã đạt (`binary-search`, `bs-answer-mini`, `stack-queue`), trừ khi phải sửa và chạy lại review; sửa sẽ làm file review mất hiệu lực vì `contentHash`.

**Quy tắc khi đổi nội dung entry:** tăng `entryRev`, chạy `UPDATE_CATALOG_LOCK=1 pnpm exec vitest run tests/subjects/ids-snapshot.test.ts` để tạo lại lock, rồi chạy `tests/subjects`. Nếu test `english-plurals` đỏ: đổi `1 nodes` thành `{n|node|nodes}`.

### 4.3. Dữ kiện thi cử và curriculum

- Quyết định đã ghi (RISKS §5, 2026-10-09): dữ kiện là snapshot có ngày kiểm và nguồn. Tìm kiếm tự động **chỉ gợi ý**; người duyệt xác nhận rồi mới sửa `docs/tutor/curriculum/curriculum-math-vn.json`. Sau khi sửa: `pnpm exec tsx scripts/split-curriculum-math.ts` rồi `pnpm exec vitest run tests/tutor/curriculum-math.test.ts`.
- Còn `[Unverified]`: văn bản gốc của Bộ (Thông tư 17/2023, 23/2025, 30/2024); số bài VMO các năm ngoài 2026; quy chế chuyên-10 từng tỉnh. Nguồn VMO 2026 là nguồn thứ cấp (tttbooks).
- **Cloudflare AI Search:** chưa kiểm chứng; chưa dùng. Chỉ triển khai nếu người dùng cung cấp tài khoản hoặc xác nhận công cụ.

### 4.4. Mở các cổng sư phạm (chưa mở được)

- **G1/G2** (học sinh mô phỏng, `eval/sim-learner`): cần model thật. Ngưỡng áp dụng: điểm hơn nhóm đối chứng không học ≥ 20 điểm phần trăm, ≥ 70% persona chấm "dễ hiểu" ≥ 4/5 (ADR 0012, 0014).
- **Lát 1d** (`customInput`): chỉ mở khi G1 đạt, e2e xanh 20 lần liên tiếp, và ít nhất 10 lớp dùng thật không lỗi (ADR 0012). Cần dữ liệu thật; không tự mở.

### 4.5. Lỗ hổng còn lại đã ghi (HANDOFF §7)

- Lọc chưa phủ: `chart` và PBL v2 trong `extractVisibleText`; tài liệu đính kèm và tin assistant trong lịch sử do client gửi.
- Bản ghi `tutorLearning` kiểu `moderation` chưa được ghi.
- Chưa kiểm chứng trên CI thật: `g++`, `python3` cho `TUTOR_IMPL_CHECK`.

## 5. Việc không thể làm nếu không có người dùng

- Có model thật (UAT) để làm hội đồng hai hãng.
- Quyết định push hoặc mở PR (hiện cấm).
- Xác nhận nguồn chính thức cho thi cử.
- Đánh giá bản dịch bởi người bản ngữ.

## 6. Cách kiểm tra nhanh khi nhận bàn giao

```bash
cd /Users/quangthiep/Projects/OpenMAIC
git status --short                       # chỉ nên thấy AGENTS.md, CLAUDE.md
git log --oneline | head -3              # đầu nhánh 65444a9 (hoặc mới hơn)
python3 docs/tutor/tools/check_docs.py   # phải báo TOTAL PROBLEMS: 0
pnpm exec tsc --noEmit -p .
pnpm exec vitest run tests/subjects tests/tutor tests/widgets   # chạy trên Node 22
```

Đọc thêm: [HANDOFF](../HANDOFF.md) (mục 3b Toán, mục 4 cổng review, mục 6 việc bị chặn, mục 7 lỗ hổng đã biết).
