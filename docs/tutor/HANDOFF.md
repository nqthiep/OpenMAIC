# Handoff: SubjectTutor, trạng thái và việc tiếp theo

- **Trạng thái**: Living document, chụp ngày 2026-10-07; cập nhật khi bàn giao tiếp
- **Ngày**: 2026-10-07
- **Nhánh**: `it-math` (checkout chính `/Users/quangthiep/Projects/OpenMAIC`). Có 144 commit chưa push so với `origin/it-math`. Chưa push gì sau lần push đầu tiên của tài liệu.
- **Người nhận**: agent hoặc người tiếp quản. Đọc hết file này trước khi làm gì.

> **Tóm tắt:** Phase 1 xong, đã review và sửa. Phase 2 đã triển khai **mã** cho 4 visualizer (`array` nhiều chế độ, `tree`, `graph`, `grid`), eval `tutor-lesson`, và 37 entry catalog (đợt 2A 9, 2B 12, 2C 8, 2D 4, 2E 4; `graham-scan` chờ visualizer `geometry` của Phase 3). Chưa làm: review LLM từng entry và cổng G2 (cần khoá API), review ba góc của Phase 2, lát 1d (chặn bởi cổng 1d-00), Phase 3.

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

## 3. Trạng thái Phase 2 (cập nhật 2026-10-06, phiên 2)

Đã merge/commit vào `it-math`:

- `2-V1`…`2-V4`, `2-E1`; `I-03` (đăng ký runtime `tree/graph/grid`, bước CI cho 4 browser test, hợp đồng state trong ARCHITECTURE §8).
- Đợt 2A (9), 2B (12), 2C (8), 2D (4), 2E (4: `kmp`, `tarjan`, `digit-dp`, `nim-grundy`): mỗi entry có `lib/subjects/cp/catalog/<id>.ts`, `tests/subjects/cp/<id>.test.ts`, harness `tests/subjects/cp/impl/<id>.ts`. Test dùng chung `tests/subjects/cp/contract.ts` (hợp đồng của card mẫu) cộng oracle độc lập riêng từng entry. Đã đăng ký vào `lib/subjects/cp/pack.ts`, `catalog-lock.json`, khối id của `SKILL.md`.
- CI: job `tutor-impl` (`TUTOR_IMPL_CHECK=1`), script `eval:tutor-lesson`.
- `eval/tutor-review/clean-variants.ts`: thêm op `rename-title`, `tag-presets` để mỗi entry có ≥ 10 biến thể.

Lệch so với card (đều đo được, ghi trong commit và comment đầu file):

- `n-queens`: `n ∈ {1,3,4,5}`; `n = 6` cần ~380 frame, vượt ngưỡng 120.
- `subset-gen`: `maxBytes` 260000 (frame cây lặp mọi nút, đo 213 KB; NFR-P2 cho tới 512 KB).
- `bfs` `maxFrames` 70 (đo tối đa 58 với 8 đỉnh, 12 cạnh); `dijkstra` 90; `dijkstra-coupon` 120; `lis` 100; `knapsack-01` giá trị v tới 30 (preset `classic` của card có v = 30), nhãn hàng `món:w/v` (giới hạn 8 ký tự).
- `dfs`/`dijkstra`/`dp-bitmask`/`dijkstra-coupon`/`hld`/`aho-corasick`/`kmp`/`tarjan`: câu hỏi dự đoán chỉ có ở hai lần xuất hiện đầu của beat (script chỉ hỏi tối đa `MAX_ASKS_PER_BEAT = 2`), các frame kết quả không gắn thẻ beat đó.

Chưa làm và vì sao:

| Việc | Lý do |
| --- | --- |
| Hội đồng review LLM từng entry (`I-04`…`I-07`), `2-G2`, mọi eval thật | cần khoá API và tên model |
| `2E-05` `graham-scan`, `I-12` | cần visualizer `geometry` (`3B-V1`, Phase 3) |
| Lát 1d (`1d-00`…`1d-05`), `2-CI1` | cổng `1d-00` cần 20 lần e2e liên tiếp, ≥ 10 lớp dùng thật và G1 đạt (ADR 0012 quyết định 7) |
| Phase 3 | cần Docker/Manim/LaTeX (máy này có `docker` và `ffmpeg`, không có `manim`, `latex`) và LLM tác giả; 3B trở đi chờ G1 |
| Review ba góc của Phase 2 (an ninh/server, host/runtime/a11y, nội dung/catalog/provider) | chưa làm; việc kế tiếp |

### Gate review LLM: đã thử một phần, CHƯA đạt (cập nhật 2026-10-07)

**Việc phải làm sau (không bỏ):** chạy hội đồng review hai provider cho cả 38 entry cp, ghi file thật vào `lib/subjects/cp/reviews/`, sửa lỗi thật, rồi chạy `2-G2`/G1 và các eval còn lại (`eval:tutor-qa`, `sim-learner`, `tutor-moderation`, calibration `--calibrate`).

Đã làm và học được:

- DeepSeek trực tiếp (`api.deepseek.com`): `deepseek-v4-flash` là bí danh của V4.1 Flash; tắt thinking bằng route `{"model":..., "thinking":{"enabled":false}}`. Key hết số dư giữa chừng.
- Panel một provider (`--allow-same-provider`) đã chạy 19/38 entry, kết quả ở `docs/tutor/review-runs/2026-10-06-deepseek/` (KHÔNG phải file gate; README ở đó giải thích). Lỗi thật tìm được: `two-pointers` (đã sửa, entryRev 2). 7 file chưa triage: `hash-count`, `segment-tree`, `lcs`, `bfs`, `dfs`, `fib-recursion-tree`, `nim-grundy`.
- `eval:tutor-lesson` thật (generator flash, judge pro): FAIL, 1/6 kịch bản đạt; đây là LLM sinh bài giảng thô, không đo catalog.
- OpenCode Go cần header `x-opencode-session`: có trong nhánh (`lib/ai/providers.ts`, đặt `OPENCODE_GO_SESSION` trong `.env.local`; cổng mở cho mọi provider kiểu `openai` có base URL `https://opencode.ai/zen/go`, mở rộng so với PR #1593).
- Model free qua API: chỉ `longcat-2.5-preview-free` (Go) và `space-bunny-free` (Zen `https://opencode.ai/zen/v1`) dùng được; các model free khác bị chặn ("only within OpenCode"). Cả hai là model suy luận: cần `TUTOR_REVIEW_MAX_OUTPUT_TOKENS=64000`, `TUTOR_REVIEW_TIMEOUT_MS=900000`; longcat vẫn hết giờ 15 phút trên entry thật, nên không dùng làm gate.
- Khuyến nghị khi làm lại: một model Go có hạn mức (ví dụ `glm-5.3` hoặc `kimi-k3`) làm reviewer thứ hai cùng `deepseek-v4-pro`; chạy mỗi entry một lần, tuần tự theo lô.

## 3b. Trạng thái Phase 3 (cập nhật 2026-10-07, phiên 3)

Đã làm (tất cả là mã TypeScript/Python chạy được và có test; **không cần Manim**; chưa dựng clip nào):

| Nhóm | Task | Nội dung |
| --- | --- | --- |
| Hạ tầng clip | `3A-01`, `3A-02`, `3A-03` | `lib/clips/{types,validate,cache-key,registry,provider,describe,name,hash,assets,define,manifest,render-plan,render-pipeline}.ts`; tool `generate_clip_scenes` (`lib/server/agent-runtime/clip-tools.ts`); mỗi chapter một slide, `speech(before) → play_video → speech(after)` |
| Tích hợp | `I-08` (phần chính) | provider clip trong `widgetRegistry`; tool chỉ có trong bộ công cụ khi **đã dựng ít nhất một clip** (`registry.prebuiltIds()`); cổng review cho clip (file `lib/subjects/<môn>/reviews/<clipId>@<templateRev>.json`, hash `clipEntryHash`); `buildStateContext` mô tả slide clip từ `entry.sheet` (`3B-QA`) |
| Skill | `3A-12`, `3A-13` | `skills/agent-runtime/olympiad-math/`, tên skill ở 12 locale; khối id sinh **theo từng pack/skill** (`scripts/generate-skill-catalog.ts`) |
| Visualizer | `3B-V1`, `3B-V2`, `3B-V3`, `3B-K1` (+ quyết định `3B-Q8`) | `geometry`, `functionPlotter`, `proofOutline`; KaTeX dựng trên server (`walkthrough-data.math` + CSS có 10 font nhúng ~230 KB, chỉ thêm khi entry có công thức; `pnpm gen:tutor-katex`); chốt Q8 ở `phase-3-olympiad-math/SCHEMA.md` §8 |
| Walkthrough Toán | `3B-W1..W3` | `lib/subjects/math/catalog/{cauchy-schwarz,triangle-altitude,curve-sketching}.ts`; pack `math` (`lib/subjects/math/pack.ts`); `graham-scan` (`2E-05`, `I-12`) trên `geometry` |
| Mẫu clip (nửa TS) | `3A-T1..T3`, `3B-T1..T14`, `3D-T1..T4` | **21 mẫu** ở `lib/subjects/math/clips/*.ts` (+ `index.ts`), mỗi mẫu một test `tests/clips/<id>.test.ts` qua hợp đồng chung `tests/clips/clip-contract.ts` và một oracle độc lập |
| Cổng QA | `3A-05`, `3A-06` | `manim/qa/{allowlist,check_video,check_bbox,check_ssim}.py`, 45 test pytest chạy trên video ffmpeg tổng hợp; job CI `manim-qa` |
| Curriculum Toán | `3-R1` (khung), `3B-00` | `docs/tutor/curriculum/curriculum-math-vn.json`: 28 topic = 4 tier × 7 từ SCHEMA §7, id `m<tier>-<tên>` (clip và walkthrough đã đổi sang id này); mọi tên kỳ thi, lớp, trọng số, nguồn là **[Unverified]**, `vn_sources` rỗng; nội dung toán (subtopics, pitfalls) do người soạn viết, chưa có hội đồng duyệt. Tách vào `skills/agent-runtime/olympiad-math/references/curriculum/` bằng `scripts/split-curriculum-math.ts`; `tests/tutor/curriculum-math.test.ts` |
| Eval Toán | `3B-E1`, `3A-17` (dữ liệu), `3D-01` | 5 scenario Toán (`eval/tutor-lesson/scenarios-math.json`, prompt theo môn); `eval/tutor-review/{seed-errors-math,clip-runner}.ts`: 111 lỗi gieo (6 loại) + 43 biến thể sạch, review hai provider cho clip (ghi `lib/subjects/math/reviews/<clip>@<templateRev>.json`); `lib/clips/review-material.ts`; prompt reviewer **riêng cho Toán** (trước đó Toán dùng prompt Tin: bắt chấm code C++); `eval/manim-author/briefs-3d.json` |
| Vòng LLM tác giả | `3A-08`, `3D-02` | `eval/manim-author/{author,runner,make-briefs}.ts`, `briefs.json` (20 brief): prompt, vòng sửa ≤ 3, RSR@1/@3, token; cổng thật (allowlist, render, QA, manifest) qua `runRenderJob`; `--replay` chạy toàn bộ vòng với template đã commit (không cần model); `scripts/manim-author-pr.mjs` + `.github/workflows/manim-author.yml` (mỗi mẫu một PR, tự gộp chỉ khi cả 5 cổng `true`; **[Unverified] chưa chạy trên GitHub**) |
| e2e | `I-08` (S3 một phần) | `e2e/tests/clip-slides.spec.ts`: ứng dụng thật, slide clip, video tải từ `public/clips` và dài đúng; `tests/clips/{prebuilt-assets,export-manifest}.test.ts` |
| Dịch vụ | `3C-01`, `3C-02`, `3C-05..08` | `manim/service/{spec,jobs,server,runner}.py` (chỉ stdlib; giới hạn hàng đợi/người/toàn cục, TTL, deadline, token so sánh hằng thời gian); `spec.py` cho cùng khoá cache và cùng kết quả kiểm params với TS (`manim/service/fixtures/parity.json`, sinh từ `scripts/export-clip-specs.ts` → `templates.json`; test TS `service-parity` báo lệch); client, route, cờ, nhánh bất đồng bộ ở `lib/clips/service-client.ts`, `app/api/clips`, `clip-tools.ts`; 1358 test pytest (`manim/`), job CI `manim-qa` chạy `manim/service` |
| Mẫu Manim | `3A-M*`, `3B-M*`, `3D-M*` | **21 mẫu** `manim/templates/<id>.py` + `_base.py` + `manim/render_clip.py`; cài Manim 0.21.0 + TinyTeX theo `manim/README.md` (đã chạy trên máy này, 2026-10-08). **84/84 preset qua đủ cổng** (allowlist, video, bbox, frame, so số hiển thị với TS). `public/clips` giữ **10 thư mục** (preset đầu của 10 clip, 7,5 MB: giới hạn NFR-P8 tính mỗi preset là một clip); phần còn lại chỉ dựng được qua manim-service hoặc `render-clips --out-dir` |
| Dựng | `3A-07` | `scripts/render-clips.ts` (`pnpm render:clips --plan` in 84 job), `lib/clips/generated/asset-index.json` (rỗng), kiểm manifest |

Lệch so với card (đều ghi ở comment đầu file và test):

- Cổng `check_ssim`: ngưỡng "đứng yên" hạ từ 0,5 xuống 0,01 (đo: ảnh giữ 0-0,005, vẽ chậm ≥ 0,02). Cổng bbox trước đó **trống** (đọc độ mờ của vỏ MathTex), đã sửa trong `_base.py`; các mẫu đã sửa theo lỗi chồng chữ nó tìm ra.
- Mẫu tối đa 12 chữ trên màn hình: bảng số (lattice, modular-clock) dùng một MathTex nhiều phần cho mỗi hàng.

- `secant-tangent`: ngưỡng `|slope(0.01) − f'| < 0.1` của card **sai** trong miền input (c = [0,0,3,3], x0 = 2 cho ≈ 0.21); thay bằng đồng nhất thức đúng + ngưỡng 0.25.
- `render-clips` là file `.ts` chạy bằng `tsx`, không phải `.mjs`.
- `concurrency-dynamic`: đỉnh C chạy theo `C + t·(B − A)` (song song AB) để tam giác không bao giờ suy biến.
- Hợp đồng clip: chỉ các cặp chapter đầy đủ phải có câu hỏi dự đoán; với số chapter lẻ thì chapter cuối được miễn.
- Eslint cấm trig/`Date`/`Math.random`/`toLocaleString` cũng áp cho `lib/subjects/**/clips/**`.

Chưa làm và vì sao (Phase 3):

| Việc | Lý do |
| --- | --- |
| `3A-04` (image Docker ghim), spike `3-S1` (Docker, 2/4 vCPU), `3-S2` (tiếng Việt: cần xelatex hoặc Typst), `3-S4` trong image và amd64 | cần Docker chạy / máy amd64; `3-S4` trên arm64 đã làm (`manim/spikes/s4/RESULT.md`) |
| `3C-03` (build/chạy image dịch vụ), `3C-04` (sandbox, red-team), `3C-09` | `manim/service/Dockerfile` và `docker-compose.yml` đã viết nhưng **[Unverified] chưa build/chạy** (Docker daemon tắt); cách ly mạng của renderer chưa cưỡng chế; red-team cần image thật |
| Số đo S9 (RSR@3 ≥ 90%, đúng-toán ≥ 90%), `3D-03` | cần model viết mã đủ mạnh; vòng và 20 brief đã sẵn sàng (`pnpm exec tsx eval/manim-author/runner.ts`) |
| Calibration hội đồng Toán (≥ 90% bắt lỗi, ≤ 10% chặn nhầm) | cần hai model mạnh trên hai provider; `clip-runner.ts --calibrate` đã sẵn sàng (308 lần gọi). Hai model free đã thử cho review từng clip (xem "Review thật bằng model free") |
| Nghiên cứu nguồn cho curriculum Toán (đề cương thi, lớp, trọng số, tài liệu) | cần nguồn thật; khung hiện là [Inference] |
| `3-S3` phần trình duyệt: adopt vào pool, ZIP trọn vòng, tua, độ trễ | cần chạy trình duyệt với IndexedDB; phần liệt kê asset và phát clip trong app đã kiểm |
| Chỉ 10 trong 84 preset nằm trong `public/clips` | giới hạn NFR-P8 (≤ 10 thư mục, 30 MB); phần còn lại cần manim-service hoặc volume |

## 4. Việc tiếp theo (theo thứ tự)

1. Review Phase 2 ba góc, ghi nhận xét cụ thể vào REVIEW, sửa theo nhận xét.
2. Xem từng entry trong trình duyệt (visualizer mới chưa được kiểm bằng mắt trên entry thật).
3. Chạy lại hội đồng review LLM theo mục "Gate review LLM" ở trên: chạy hội đồng review LLM cho mọi entry, ghi file review, chạy cổng G1/G2, rồi mới phát hành.
4. Phase 3: mã và 21 mẫu Manim đã xong (mục 3b). Còn lại cần Docker hoặc model mạnh: `3A-04` (image ghim, build `manim/service/Dockerfile`), spike `3-S1/S2`, `3C-04` (sandbox), chạy thật vòng `3A-08` và calibration hội đồng Toán, rồi sửa nội dung theo review (xem "Review thật bằng model free").
5. Lát 1d chỉ khi cổng `1d-00` đạt.

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

Kết quả hiện tại: `tsc` sạch, `eslint` 0 lỗi (một cảnh báo `Static` chưa dùng), browser test `tests/tutor` đạt 542/542. Test vitest các thư mục trên đạt, **trừ** các lỗi nền:

- `tests/runtime/chat-storage.test.ts` (nhiều test) và `tests/persistence/stage-access-fidelity.test.ts`: **đã kiểm chứng** cũng đỏ trên worktree `base` (nhánh `main`, commit `4685cad`: 43 test đỏ ở hai file này), nên không do công việc này.
- `tests/persistence/asset-byte-store.test.ts`: đỏ khi chạy cả bộ song song, **đạt 3/3 khi chạy riêng** trên `it-math`. Coi là lỗi phụ thuộc tải; chưa điều tra `[Unverified]`.
- hai test "cross-owner isolation" trong `tests/agent-runtime/dsl-tools.test.ts` (cột `owner_id` không tồn tại): do agent báo, chưa tự chạy lại trên `main` `[Unverified]`.

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

### Chỉ dẫn đang hiệu lực của user (nguyên ý)

Thứ tự user đã yêu cầu cho toàn bộ dự án: (1) implement phase kế tiếp; (2) xong mỗi phase thì review kỹ và nêu nhận xét cụ thể; (3) improve theo nhận xét của reviewer; (4) implement phase tiếp; (5) lặp đến hết mọi phase; (6) test tất cả chức năng đã làm. Khi chạm giới hạn phiên thì chờ reset rồi làm tiếp.

Chỉ dẫn của tổ chức áp lên mọi câu trả lời: không trình bày nội dung suy đoán như sự thật; gắn nhãn `[Inference]`, `[Speculation]`, `[Unverified]`; không dùng các từ "ngăn chặn tuyệt đối/đảm bảo/sửa triệt để" mà không có nguồn; ví dụ mã và thực hành tốt, không lan man.

### Script ngoài repo (chép nguyên để dựng lại)

`mk.sh` và `accept.sh` nằm ở `/Users/quangthiep/Projects/tutor-wt/`, **không** thuộc repo. Nếu mất, dựng lại bằng các lệnh sau.

Tạo worktree từ `it-math` và nối `node_modules`:

```bash
cd /Users/quangthiep/Projects/OpenMAIC
id=<task-id>; d=/Users/quangthiep/Projects/tutor-wt/$id
git worktree add -q $d -b task/$id it-math
ln -s /Users/quangthiep/Projects/OpenMAIC/node_modules $d/node_modules
for p in packages/@openmaic/*; do
  [ -d $p/node_modules ] && ln -s /Users/quangthiep/Projects/OpenMAIC/$p/node_modules $d/$p/node_modules
done
```

Nghiệm thu một nhánh: trong worktree chạy eslint và prettier trên file đổi, vitest trên test đổi, kiểm `git diff --name-only origin/main -- packages/@openmaic` rỗng; rồi `git add` đúng file sở hữu, `git commit`, và ở checkout chính `git merge --no-edit task/<id>`.

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
- Các mã lỗi mới của tool `generate_walkthrough` (`no-document`, `content-blocked`, replay) đã ghi vào INTERFACES §3; hình dạng `lessonKit` mới (`pitfalls: {text, lang?}[]`, `hints: string[]`) đã khớp INTERFACES.
- `docs/tutor/curriculum/` là nguồn gốc; đổi nó thì chạy lại `npx tsx scripts/split-curriculum.ts`.

## 8. Những gì tài liệu này không có

- Báo cáo review chi tiết của ba reviewer (`review_A/B/C.md`, `phase1_issues.md`) nằm trong thư mục scratchpad của phiên cũ và **đã mất**. Phần còn lại là mã số phát hiện (A1…A18, B1…B15, C1…C29) trong REVIEW vòng 9–11 và trong commit của chín nhánh `task/fix-*`; `git log --stat` và `git show` trên các commit đó cho biết từng thay đổi.
- Mã kết quả test và log của từng agent con không được lưu lại ngoài các báo cáo đã tóm tắt ở đây.
- Sau khi merge `2-IS1`, `2-00`, `2-I1` đã chạy lại `tests/tutor/input-spec`, `curriculum-map`, `tests/subjects`, `tests/agent-runtime/skills`: 214 đạt, 9 bỏ qua (cần `TUTOR_IMPL_CHECK=1`). Chưa chạy lại toàn bộ các thư mục test còn lại sau ba merge đó.

## 9. Kiểm tra nhanh để biết trạng thái ban đầu

```bash
cd /Users/quangthiep/Projects/OpenMAIC
git status --short            # chỉ nên thấy docs/tutor/decisions/0006…md (+ HANDOFF.md) và .omo/ chưa theo dõi
git log --oneline -5
git worktree list             # nhiều worktree task/*; các cái 2-V1…2-V4, 2-E1 còn việc dở
python3 docs/tutor/tools/check_docs.py
npx tsc --noEmit
```

`.omo/` là thư mục chưa theo dõi (không thuộc dự án này; chứa prompt cũ và mẫu lời nhắc worker). Đừng commit nó.
