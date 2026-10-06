# Handoff: SubjectTutor, trạng thái và việc tiếp theo

- **Ngày**: 2026-10-06
- **Nhánh**: `it-math` (checkout chính `/Users/quangthiep/Projects/OpenMAIC`). Có 144 commit chưa push so với `origin/it-math`. Chưa push gì sau lần push đầu tiên của tài liệu.
- **Người nhận**: agent hoặc người tiếp quản. Đọc hết file này trước khi làm gì.

> Mọi điều chưa kiểm chứng trong file này gắn nhãn `[Unverified]` hoặc `[Inference]`. Không coi chúng là sự thật.

## 1. Dự án là gì

SubjectTutor: gia sư Tin học nâng cao (chuyên Tin, HSG), sau đó Toán nâng cao, chạy trên OpenMAIC. Học sinh xem các walkthrough tất định (mỗi bước có khung hình, lời giảng, câu hỏi dự đoán), hỏi đáp với gia sư, làm bài.

Tài liệu thiết kế nằm ở `docs/tutor/`. Đọc theo thứ tự:

1. `README.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`
2. `INTERFACES.md` (hợp đồng; khi card lệch INTERFACES thì INTERFACES thắng)
3. `DATA-MODEL.md`, `SECURITY.md`, `TEST-STRATEGY.md`, `OPERATIONS.md`
4. `decisions/0001…0014` (ADR)
5. `tasks/README.md` (cách giao việc, **Luật chung §3**, bảng đợt §7), `tasks/phase-1.md`, `phase-2.md`, `phase-3.md` (212 task, mỗi card có Sở hữu / Phụ thuộc / Xong khi)
6. `REVIEW-2026-09-29.md` (nhật ký các vòng review; vòng 9–11 là Phase 1)

Công cụ kiểm tài liệu: `python3 docs/tutor/tools/check_docs.py` (phải báo `TOTAL PROBLEMS: 0`) và `npx prettier --check docs/tutor`. Mã tham chiếu trong tài liệu có neo `file:dòng`; sau khi sửa mã, neo hay trôi và `check_docs.py` sẽ báo `anchor-content-drift`. Sửa bằng cách đổi số dòng trong tài liệu và trong `check_docs.py`.

## 2. Việc đã làm

### Phase 1 (lát 1a, 1b, 1c): đã triển khai, đã review ba chiều, đã sửa theo review

Những thành phần chính (đều trên `it-math`):

- Engine bước và catalog: `lib/tutor/engine/*`, `lib/tutor/catalog/*` (hash, validate, types), `lib/tutor/input-spec.ts`, `lib/tutor/protocol/*`.
- Dựng HTML widget và runtime iframe: `lib/tutor/build/*` (có `generated/runtime-array.ts` sinh bởi `scripts/generate-tutor-runtime.mjs`), `lib/tutor/runtime/*` (`core`, `layout`, `panels`, `predict`, `visualizers/array.ts`, `entries/array.ts`).
- Provider và registry: `lib/widgets/*`, `lib/tutor/provider.ts`, `lib/subjects/*` (`cp/pack.ts`, `catalog/binary-search.ts`, `catalog/bs-answer-mini.ts`, `release.ts`).
- Tool agent: `generate_walkthrough` (không dùng LLM) trong `lib/server/agent-runtime/walkthrough-tools.ts`, cộng sửa `generation-tools.ts`, `dsl-tools.ts`, `course-tools.ts`, `content-moderation.ts`.
- Host và phát lại: `components/scene-renderers/InteractiveIframeHost.tsx`, `lib/store/widget-runtime-state.ts`, `lib/playback/engine.ts`, `lib/action/engine.ts` (chờ dự đoán).
- Chặn widget `code`: cờ `OPENMAIC_ALLOW_CODE_WIDGET` (không đặt = chặn), năm lớp L1–L5, `app/api/widgets/policy/route.ts`.
- Kiểm duyệt và LLM: `lib/tutor/{moderation,chat-moderation,llm-roles,review-schema,learning-log}.ts`; chat bọc `withTutorModeration` khi `OPENMAIC_TUTOR_MODERATION` bật (`app/api/chat/route.ts`, `app/api/chat/pi/route.ts`).
- Cổng phát hành: `OPENMAIC_REQUIRE_REVIEW`, file review trong `lib/subjects/*/reviews/`.
- Eval: `eval/tutor-moderation`, `eval/tutor-review`, `eval/sim-learner`, `eval/tutor-qa` (mã thoát 0/1/2, có `--dry-run`).
- Skill: `skills/agent-runtime/competitive-programming/{SKILL.md,outline-constraints.json,references/curriculum/}`.
- Test: `tests/tutor/**`, `tests/widgets/**`, `tests/subjects/**` (có `catalog-lock.json`, `ids-snapshot`, `reviews`), `tests/ci/browser-steps.test.ts`; e2e `e2e/tests/{walkthrough-widget,code-widget-blocked}.spec.ts`.

Vòng sửa sau review (vòng 11) đã merge đủ chín nhóm: server/an ninh, chat moderation, ops/release, host, runtime/a11y, nội dung catalog, provider/describe/hash, panel review, eval sim/qa/moderation. Chi tiết trong REVIEW vòng 11.

### Phase 2, đợt nền: một phần

Đã merge vào `it-math`:

| Task | Nội dung |
| --- | --- |
| `2-IS1` | Bảng chữ `brackets` cho `InputSpec` (`lib/tutor/input-spec.ts`); ADR 0006 đã cập nhật |
| `2-00` | `scripts/split-curriculum.ts` tách `docs/tutor/curriculum/curriculum-informatics-vn.json` thành `references/curriculum/{index,tier-1..4}.json`; test `tests/tutor/curriculum-map.test.ts` |
| `2-S1` | `SKILL.md` đầy đủ (hai track `ts10`/`hsg`, công thức bài giải đề, hỏi cả chuyên đề). Task này phụ thuộc cổng G1-01, **chưa chạy cổng**, làm trước theo chỉ dẫn |
| `2-I1` | `tests/subjects/impl-equivalence.test.ts` + `tests/subjects/cp/impl/{binary-search,bs-answer-mini}.ts`; phần biên dịch/chạy C++ và Python chỉ chạy khi `TUTOR_IMPL_CHECK=1` (máy tác giả có `clang++` và `python3` 3.14; runner CI chưa kiểm chứng `[Unverified]`) |

Còn một thay đổi tài liệu chưa commit trong checkout chính: `docs/tutor/decisions/0006-deterministic-trace-catalog.md` (thêm `'brackets'` ở dòng 96). Commit nó trước khi làm gì khác.

## 3. Việc dở dang: cần nhặt lại

Năm task bị dừng giữa chừng. Việc dở nằm ở các worktree, **chưa commit, chưa nghiệm thu**:

| Task | Worktree | Có gì |
| --- | --- | --- |
| `2-V1` visualizer `array` nhiều chế độ | `/Users/quangthiep/Projects/tutor-wt/2-V1` | sửa `array.ts`, `generated/runtime-array.ts`, `array-layout.test.ts`; **chưa có** `array-modes.browser.test.ts` |
| `2-V2` visualizer `tree` | `…/tutor-wt/2-V2` | file mới: `visualizers/tree.ts`, `entries/tree.ts`, `generated/runtime-tree.ts`, `tree-layout.test.ts`, `tree.browser.test.ts` |
| `2-V3` visualizer `graph` | `…/tutor-wt/2-V3` | file mới: `visualizers/graph.ts`, `entries/graph.ts`, `generated/runtime-graph.ts`, `graph-layout.test.ts`, `graph.browser.test.ts` |
| `2-V4` visualizer `grid` | `…/tutor-wt/2-V4` | file mới: `visualizers/grid.ts`, `entries/grid.ts`, `generated/runtime-grid.ts`, `grid-layout.test.ts`, `grid.browser.test.ts`, và `tmpshot.browser.test.ts` (**file tạm, phải xoá**) |
| `2-E1` eval `tutor-lesson` | `…/tutor-wt/2-E1` | thư mục `eval/tutor-lesson/` (chưa biết đã đủ `runner.ts`, `judge.ts`, `scenarios.json` chưa) |

Không có commit nào trên các nhánh `task/2-V1`…`task/2-E1` ngoài `848fa5e`. Mọi thứ trong bảng là thay đổi chưa commit.

Cách xử lý: mở từng worktree, đọc `git status` và `git diff`, đối chiếu với card trong `tasks/phase-2.md` §1, coi mã dở là bản nháp chưa tin cậy. Chạy lại test của chính nó, hoàn thiện phần thiếu, rồi nghiệm thu như ở §5. Hoặc bỏ worktree và làm lại từ `it-math` bằng `mk.sh`.

Không còn agent nào đang chạy. Các agent trước đã bị dừng, hệ thống coi là huỷ.

## 4. Việc tiếp theo (theo thứ tự)

1. Commit thay đổi ADR 0006 ở checkout chính.
2. Hoàn thành và merge `2-V1`…`2-V4`, `2-E1` (mục 3).
3. Đăng ký visualizer mới (task `I-03`, của leader): thêm mỗi visualizer một dòng vào `lib/tutor/build/runtimes.ts`; kiểm `scripts/generate-tutor-runtime.mjs` có tự nhận entry mới không (`node scripts/generate-tutor-runtime.mjs --check`); thêm bước CI cho từng browser test mới (`.github/workflows/ci.yml`, kiểm bởi `tests/ci/browser-steps.test.ts`); thêm bước `TUTOR_IMPL_CHECK=1 pnpm vitest run tests/subjects/impl-equivalence.test.ts` (cần `g++` và `python3` trên runner).
4. Đợt 2A (9 task, giao song song): `2A-01 prefix-sum`, `2A-02 two-pointers`, `2A-03 stack-queue` (cần `2-IS1`, đã xong), `2A-04 fib-recursion-tree`, `2A-05 quick-sort`, `2A-06 merge-sort`, `2A-07 subset-gen`, `2A-08 n-queens`, `2A-09 bs-answer`. Mỗi card có input, preset, beat, oracle sẵn. Mỗi task phải để lại harness `tests/subjects/cp/impl/<id>.ts` (test bao phủ của `2-I1` đỏ nếu thiếu harness cho entry nào có trong `SUBJECT_PACKS`).
5. `I-04` (tích hợp 2A, của leader): đăng ký vào `lib/subjects/cp/pack.ts`, sinh lại `tests/subjects/catalog-lock.json` (`UPDATE_CATALOG_LOCK=1`), sinh lại khối id trong `SKILL.md` (`npx tsx scripts/generate-skill-catalog.ts`), chạy hội đồng review LLM (cần khoá API).
6. Cổng `2-G2` rồi các đợt 2B (12 task), 2C + 2D (12 task), 2E (5 task) với các task tích hợp `I-05`, `I-06`, `I-07`, `I-12`. Thứ tự và phụ thuộc: `tasks/README.md` §7 và `tasks/phase-2.md` §3–§8.
7. Lát 1d (nhập input tuỳ chỉnh): `1d-00`…`1d-05` (`tasks/phase-1.md`); `2-CI1` cần `1d-05`.
8. Phase 3 (`tasks/phase-3.md`): 3-0 và 3A không chờ G1; 3B trở đi chờ `G1-01` và `I-02`. Có các spike Docker/Manim (xem §6).
9. Mỗi khi xong một phase: review kỹ (ba góc: an ninh/server, host/runtime/a11y, nội dung/catalog/provider), ghi nhận xét cụ thể vào REVIEW, sửa theo nhận xét, rồi mới sang phase tiếp. Đây là quy trình user yêu cầu.

## 5. Quy trình làm việc đã dùng (nên giữ)

### Worktree và nhánh

- Mỗi task một worktree trong `/Users/quangthiep/Projects/tutor-wt/<id>`, nhánh `task/<id>`, **tạo từ `it-math`**. Script: `/Users/quangthiep/Projects/tutor-wt/mk.sh <id>...` (tạo worktree, symlink `node_modules`). Đừng dùng `git worktree add` mặc định của agent: lần trước nó dựng từ `main` (không có tài liệu) và agent dừng.
- `accept.sh <id> [commit]`: chạy eslint, prettier, vitest của các file đã đổi, rồi commit và merge vào `it-math`.
- Hai task chạy song song **không bao giờ** sửa chung file. Các điểm đăng ký chung do leader giữ (bảng ở `tasks/README.md` §6): `lib/subjects/cp/pack.ts`, `lib/subjects/index.ts`, `tests/subjects/catalog-lock.json`, `lib/tutor/build/runtimes.ts`, khối id trong `SKILL.md`, `package.json`, `.github/workflows/ci.yml`.
- **Cấm** `git stash`, `git reset`, `git checkout`, `git merge`, `git pull` trong worktree của worker. Stash là chung giữa các worktree và đã làm lẫn việc của hai agent một lần.
- Môi trường: `export PATH=/Users/quangthiep/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH`. Chromium đã cài.

### Lệnh nghiệm thu chuẩn

```bash
npx tsc --noEmit
npx eslint lib eval tests/tutor tests/widgets tests/subjects
npx prettier --check docs/tutor
python3 docs/tutor/tools/check_docs.py
node scripts/generate-tutor-runtime.mjs --check
npx tsx scripts/generate-skill-catalog.ts --check
npx vitest run tests/tutor tests/widgets tests/subjects tests/runtime tests/playback tests/persistence tests/video-export tests/ci
TUTOR_BROWSER=1 npx vitest run tests/tutor
```

Kết quả hiện tại: `tsc` sạch, `eslint` 0 lỗi (một cảnh báo `Static` chưa dùng), browser test `tests/tutor` đạt 542/542. Test vitest các thư mục trên đạt, **trừ** lỗi nền có từ trước, không do công việc này (chưa tự điều tra nguyên nhân `[Unverified]`):

- `tests/runtime/chat-storage.test.ts` (nhiều test)
- `tests/persistence/stage-access-fidelity.test.ts`
- `tests/persistence/asset-byte-store.test.ts`
- hai test "cross-owner isolation" trong `tests/agent-runtime/dsl-tools.test.ts` (cột `owner_id` không tồn tại)

`tests/tutor/build/runtime-fresh.test.ts` thỉnh thoảng quá 5 giây khi chạy cả bộ song song (đã nâng timeout 60 giây); chạy riêng thì qua.

### Quy tắc nội dung catalog

Trong `lib/subjects/**/catalog/**` không dùng `Intl`, `Date`, `Math.random`, `Math.sin/cos/exp/log/pow`, `toLocaleString`, `localeCompare`. Bất kỳ đổi nào làm đổi frame/lời giảng/preset của entry đều phải tăng `entryRev` và sinh lại `catalog-lock.json`.

### Mẫu prompt cho worker

Dán nguyên văn khối **Luật chung** (`tasks/README.md` §3) và nguyên văn card của task. Thêm các dòng sau (đã dùng ổn):

```text
Setup: export PATH=/Users/quangthiep/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH.
Chỉ làm trong worktree của bạn (nhánh task/<id> từ it-math). KHÔNG git stash/reset/checkout/merge/pull.
Commit chỉ các file bạn sở hữu, trên nhánh của bạn; không merge.
Điểm đăng ký chung (pack.ts, catalog-lock.json, runtimes.ts, khối id SKILL.md, package.json, ci.yml) thuộc leader:
KHÔNG sửa; ghi dòng cần thêm vào báo cáo cuối.
Thiếu thông tin: chọn cách đọc bảo thủ nhất, gắn [Unverified] trong comment và báo; không bịa số liệu.
Trước khi báo: chạy lệnh "Xong khi" của card, prettier --write, eslint, tsc --noEmit.
Browser test: TUTOR_BROWSER=1 npx vitest run <file>.
Nếu chạm giới hạn rate: dừng, leader sẽ cho chạy tiếp.
Báo cáo cuối ngắn: đã làm gì, file, lệnh test + kết quả, dòng leader phải đăng ký, vấn đề mở.
```

Khi merge nhánh task, kiểm `git diff --name-only it-math...task/<id>` chỉ chứa file trong Sở hữu. Sau khi merge mọi nhánh của một đợt, mới sinh lại `catalog-lock.json`, `SKILL.md` id block và runtime, rồi sửa các test cũ bị đổi (các lần trước, test của `qa-score`, `review-schema`, `sim-transcript`, `provider` phải sửa tay sau khi catalog đổi). Nếu doc neo trôi thì sửa như §1.

## 6. Việc bị chặn, cần người hoặc điều kiện bên ngoài

| Việc | Vì sao chặn | Task liên quan |
| --- | --- | --- |
| Khoá API và tên model chính xác | Cổng G1/G2, mọi eval thật (moderation, review, sim-learner, qa, lesson), hội đồng review LLM ở `I-04`…`I-07`. Chưa có số đo nào, nên các ngưỡng vẫn là mục tiêu thiết kế, không phải kết quả | `0-02`, `0-05`, `1b-26`, `G1-01`, `2-G2` |
| Build Docker standalone | Chưa xác nhận file review có được đóng gói (`next.config.ts` `outputFileTracingIncludes`) `[Unverified]` | OPERATIONS §2, smoke item 8 |
| `node_modules` thật cho Playwright | e2e `e2e/tests/*.spec.ts` chưa chạy; `1c-21` (e2e chờ dự đoán) chưa làm | `1c-21` |
| Spike Docker và Manim | Phase 3 | `tasks/phase-3.md` |
| Runner CI có `g++`, `python3` | Chưa kiểm chứng | bước `TUTOR_IMPL_CHECK` |
| Review do người | Bản dịch giao diện chưa ai đọc `[Unverified]`; nội dung bài giải đề P2/P3 và 4 mô-đun 2D là đề xuất của leader `[Inference]`, hội đồng LLM duyệt ở bước tích hợp | `I-05`, `I-06` |

## 7. Vấn đề đã biết, chưa sửa

Lấy từ REVIEW vòng 11 và báo cáo của các agent:

- Xuất video coi widget `code` là bị chặn kể cả khi `OPENMAIC_ALLOW_CODE_WIDGET` bật (chưa nối cờ vào `createVideoTimelineDeps`).
- Tin nhắn vai assistant trong lịch sử do client gửi chưa bị lọc; route phiên Pi (`/api/agent/sessions/**`) chưa lọc tin học sinh.
- Cổng sim-learner đổi sang so với nhóm đối chứng không có bài giảng (cần hiệu ≥ 20 điểm so với đối chứng, ≥ 10 so với bản suy giảm). Tài liệu còn nhắc `--calibrate` và cổng hiệu tuyệt đối cũ; cần cập nhật.
- `bs-answer-mini` preset `one-tree` có 14 beat; provider cắt còn 12 beat kể và giữ beat `done`.
- Bộ lọc kiểm duyệt: mẫu "benign" gồm lời hỗ trợ khi học sinh có ý tự hại có thể bị lọc chặn; ghi nhận chứ không xoá mẫu.
- Replay của `generate_walkthrough` giữ map `(sessionId, callId)` trong bộ nhớ tiến trình (tối đa 1000); sau khi khởi động lại chỉ dựa vào so sánh nội dung giống hệt.
- Khi người dùng bấm Play lúc đang có câu hỏi dự đoán, tick đi tiếp và câu hỏi bị coi là bỏ qua (không giữ phát).
- Quản lý lỗi mới của tool `generate_walkthrough` (`no-document`, `content-blocked`, replay) đã ghi vào INTERFACES §3; hình dạng `lessonKit` mới (`pitfalls: {text, lang?}[]`, `hints: string[]`) đã khớp INTERFACES.
- `docs/tutor/curriculum/` là nguồn gốc; đổi nó thì chạy lại `npx tsx scripts/split-curriculum.ts`.

## 8. Kiểm tra nhanh để biết trạng thái ban đầu

```bash
cd /Users/quangthiep/Projects/OpenMAIC
git status --short            # chỉ nên thấy docs/tutor/decisions/0006…md (+ HANDOFF.md) và .omo/ chưa theo dõi
git log --oneline -5
git worktree list             # nhiều worktree task/*; các cái 2-V1…2-V4, 2-E1 còn việc dở
python3 docs/tutor/tools/check_docs.py
npx tsc --noEmit
```

`.omo/` là thư mục chưa theo dõi (không thuộc dự án này; chứa prompt cũ và mẫu lời nhắc worker). Đừng commit nó.
