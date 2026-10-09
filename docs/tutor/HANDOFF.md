# Handoff: SubjectTutor, trạng thái và việc tiếp theo

- **Trạng thái**: Living document, cập nhật lần cuối 2026-10-09; cập nhật khi bàn giao tiếp
- **Ngày**: 2026-10-09
- **Nhánh**: `it-math` (checkout chính `/Users/quangthiep/Projects/OpenMAIC`). Có 245 commit chưa push so với `origin/it-math` (chỉ commit cục bộ theo yêu cầu của chủ dự án). Các worktree `task/*` cũ đã xoá 2026-10-09; `/Users/quangthiep/Projects/tutor-wt/` chỉ còn `mk.sh` và `accept.sh`.
- **Người nhận**: agent hoặc người tiếp quản. Đọc hết file này trước khi làm gì.

> **Cập nhật 2026-10-08:** Toán chuyển sang web UI (ADR 0015): 27 walkthrough tương tác thay cho 21 clip Manim; xem mục 3b.

> **Tóm tắt:** Phase 1 xong, đã review và sửa. Phase 2 đã triển khai **mã** cho 4 visualizer (`array` nhiều chế độ, `tree`, `graph`, `grid`), eval `tutor-lesson`, và 37 entry catalog (đợt 2A 9, 2B 12, 2C 8, 2D 4, 2E 4; `graham-scan` chờ visualizer `geometry` của Phase 3). Chưa làm: review LLM từng entry và cổng G2 (cần khoá API), review ba góc của Phase 2, lát 1d (chặn bởi cổng 1d-00), Phase 3.

> Mọi điều chưa kiểm chứng trong file này gắn nhãn `[Unverified]` hoặc `[Inference]`. Không coi chúng là sự thật.

## 1. Dự án là gì

SubjectTutor: gia sư Tin học nâng cao (chuyên Tin, HSG), sau đó Toán nâng cao, chạy trên OpenMAIC. Học sinh xem các walkthrough tất định (mỗi bước có khung hình, lời giảng, câu hỏi dự đoán), hỏi đáp với gia sư, làm bài.

Tài liệu thiết kế nằm ở `docs/tutor/`. Đọc theo thứ tự:

1. `README.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`
2. `INTERFACES.md` (hợp đồng; khi card lệch INTERFACES thì INTERFACES thắng)
3. `DATA-MODEL.md`, `SECURITY.md`, `TEST-STRATEGY.md`, `OPERATIONS.md`
4. `decisions/0001…0015` (ADR)
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
| Phase 3 | review LLM và calibration cho 27 walkthrough Toán cần hai model mạnh khác nhà cung cấp (mục 3b); 3B trở đi chờ G1 |
| Review ba góc của Phase 2 (an ninh/server, host/runtime/a11y, nội dung/catalog/provider) | chưa làm; việc kế tiếp |

### Review thật bằng hai model (2026-10-09)

Cổng OpenCode Go (khoá trong `.env.local`, `DEEPSEEK_BASE_URL=https://opencode.ai/zen/go/v1`) liệt kê nhiều hãng. Cặp chạy được: `deepseek:deepseek-v4-pro` (thinking tắt) và `openai:kimi-k3` (đặt `OPENAI_API_KEY`/`OPENAI_BASE_URL` trỏ cùng cổng, `OPENAI_MODELS=kimi-k3`). `gpt-6-luna` báo "Model does not support this protocol" qua chat completions; `glm-5.3` trả "malformed output". Mỗi entry tốn khoảng 10 phút (kimi-k3 suy luận lâu), `TUTOR_REVIEW_TIMEOUT_MS=900000`, `TUTOR_REVIEW_MAX_OUTPUT_TOKENS=32000`.

Kết quả: chạy 8 entry thì hết hạn mức ("Go usage limit exceeded"). Đạt và đã lưu ở `lib/subjects/cp/reviews/`: `binary-search@3`, `bs-answer-mini@4`, `stack-queue@3` (đừng sửa nội dung ba entry này, file mất hiệu lực theo `contentHash`). Chưa đạt, lưu làm bản ghi ở `docs/tutor/review-runs/2026-10-09-deepseek-kimi/`: `cauchy-schwarz`, `two-pointers`, `prefix-sum`, `merge-sort`, `fib-recursion-tree`; các lỗi thật trong đó đã sửa (entryRev tăng). Reviewer DeepSeek hay ghi mục "đúng" vào `factErrors` làm trượt oan; prompt đã dặn lại. Còn khoảng 58 entry chưa review. Model free duy nhất còn dùng được là `longcat-2.5-preview-free` (một hãng, hay quá giờ): không đủ lập hội đồng hai hãng.

Chạy tiếp khi có hạn mức: `pnpm exec tsx eval/tutor-review/runner.ts <entryId>` với `MODEL_ROUTES` trỏ hai stage `tutor-review-<môn>` và `tutor-review-<môn>-2` tới hai model trên (xem `eval/tutor-review/runner.ts` đầu file); chạy song song tối đa 4 tiến trình.

### Gate review LLM: đã thử một phần, CHƯA đạt (cập nhật 2026-10-07)

**Việc phải làm sau (không bỏ):** chạy hội đồng review hai provider cho cả 38 entry cp, ghi file thật vào `lib/subjects/cp/reviews/`, sửa lỗi thật, rồi chạy `2-G2`/G1 và các eval còn lại (`eval:tutor-qa`, `sim-learner`, `tutor-moderation`, calibration `--calibrate`).

Đã làm và học được:

- DeepSeek trực tiếp (`api.deepseek.com`): `deepseek-v4-flash` là bí danh của V4.1 Flash; tắt thinking bằng route `{"model":..., "thinking":{"enabled":false}}`. Key hết số dư giữa chừng.
- Panel một provider (`--allow-same-provider`) đã chạy 19/38 entry, kết quả ở `docs/tutor/review-runs/2026-10-06-deepseek/` (KHÔNG phải file gate; README ở đó giải thích). Lỗi thật tìm được: `two-pointers` (đã sửa, entryRev 2). 7 file chưa triage: `hash-count`, `segment-tree`, `lcs`, `bfs`, `dfs`, `fib-recursion-tree`, `nim-grundy`.
- `eval:tutor-lesson` thật (generator flash, judge pro): FAIL, 1/6 kịch bản đạt; đây là LLM sinh bài giảng thô, không đo catalog.
- OpenCode Go cần header `x-opencode-session`: có trong nhánh (`lib/ai/providers.ts`, đặt `OPENCODE_GO_SESSION` trong `.env.local`; cổng mở cho mọi provider kiểu `openai` có base URL `https://opencode.ai/zen/go`, mở rộng so với PR #1593).
- Model free qua API: chỉ `longcat-2.5-preview-free` (Go) và `space-bunny-free` (Zen `https://opencode.ai/zen/v1`) dùng được; các model free khác bị chặn ("only within OpenCode"). Cả hai là model suy luận: cần `TUTOR_REVIEW_MAX_OUTPUT_TOKENS=64000`, `TUTOR_REVIEW_TIMEOUT_MS=900000`; longcat vẫn hết giờ 15 phút trên entry thật, nên không dùng làm gate; longcat còn từ chối `temperature: 0` ("0 is not greater or equal to 0.1"), đặt `TUTOR_REVIEW_TEMPERATURE=0.1` để qua lỗi đó.
- Khuyến nghị khi làm lại: một model Go có hạn mức (ví dụ `glm-5.3` hoặc `kimi-k3`) làm reviewer thứ hai cùng `deepseek-v4-pro`; chạy mỗi entry một lần, tuần tự theo lô.

## 3b. Trạng thái Phase 3 (cập nhật 2026-10-08, phiên 4): minh hoạ Toán bằng web UI

**Quyết định mới nhất của chủ dự án: chuyển sang web UI, không dùng clip Manim (video)** → [ADR 0015](decisions/0015-math-interactive-web-ui-not-video.md). Cả 21 mẫu clip đã được viết lại thành walkthrough tương tác cùng id; clip tắt trong sản phẩm. Không thêm thư viện đồ hoạ ngoài (ADR 0002, iframe tự chứa).

Đã làm (mã TypeScript chạy được, có test và oracle độc lập):

| Nhóm | Nội dung |
| --- | --- |
| Quyết định | `decisions/0015-…md` + dòng trong `decisions/README.md`; SCHEMA Phase 3 có biển báo "đã thay thế một phần"; RISKS/OPERATIONS cập nhật |
| Visualizer `geometry` | mở rộng: đa giác (đỉnh theo id điểm hoặc toạ độ nội tuyến `xy`), polyline lấy mẫu cho đường cong, mũi tên, điểm ẩn và nhãn căn giữa, mô tả aria; giới hạn `MAX_*` (160 điểm, 120 đoạn, 140 đa giác, 12 polyline ≤ 200 điểm); runtime sinh lại (`pnpm gen:tutor-runtime`); `tests/tutor/runtime/geometry-layout.test.ts`, `geometry.browser.test.ts` |
| Bộ dựng hình | `lib/subjects/math/figure.ts`: `Figure` (điểm, đoạn, đường, tròn, góc, đa giác, polyline, hình chữ nhật), `boundsOf`, `curvePieces`, `upperSemicircle`, `circlePoint` (vòng tròn theo độ, hằng số xoay 1°, không lượng giác), `gcd`/`frac` (phân số chính xác, không số thập phân), `framePut` |
| Walkthrough Toán | **27 entry** ở `lib/subjects/math/catalog/*.ts` (pack `math`): 3 có trước (`cauchy-schwarz`, `triangle-altitude`, `curve-sketching`) + 21 chuyển từ clip + 3 viết mới cho ba chủ đề `walkthrough` còn thiếu (`mvt-lagrange` cho `m4-limits-mvt`, `inversion-circle` cho `m4-projective-inversion`, `subtraction-game` cho `m4-games-invariants`); mọi chủ đề `walkthrough` của curriculum đều có entry. Mỗi entry một `tests/subjects/math/<id>.test.ts`: hợp đồng chung `tests/subjects/cp/contract.ts` (beat đầu `start`, cuối `done`, 5–10 beat, 3 gợi ý + hiểu lầm mỗi beat, dự đoán `choice` có `answer()`, số nguyên trong lời giảng phải đến từ input/state/vars, ≤ 160 ký tự) cộng oracle độc lập từng entry (đếm đường đi bằng duyệt hết, tập hợp phần tử thật cho bao hàm–loại trừ, giải hệ tuyến tính cho các tâm tam giác, góc bằng `acos`/`atan2`, luỹ thừa bằng số nguyên lớn…) |
| Quy ước chung | `customInput: false` (lát 1d chưa mở): tương tác = preset + bước/phát/tua + dự đoán; "thanh trượt" = chuỗi khung tua được. Tham số thập phân đổi thành số nguyên (`tn` = t tính bằng phần mười, `e` = ε tính bằng 1/20) để mọi con số trên màn hình là phân số chính xác; đường tròn bằng hằng số xoay, không dùng `sin/cos`; PA², PB² là phân số chính xác thay cho độ dài vô tỉ |
| Skill | `skills/agent-runtime/olympiad-math/SKILL.md` viết lại: không còn tool/khối clip; bảng walkthrough sinh từ catalog (`pnpm exec tsx scripts/generate-skill-catalog.ts`) |
| Curriculum Toán | `docs/tutor/curriculum/curriculum-math-vn.json` + `references/curriculum/*` (28 topic, id `m<tier>-<tên>`): `primary_medium` walkthrough 18 / slide 10, danh sách `walkthrough_ids`; 5 nguồn thật (2026-10-09, card `3-R1`) cho `exam_profile` và `vn_sources` của 18 topic; chi tiết thi cử (đề VMO từng kỳ, quy chế chuyên-10 từng tỉnh, công báo gốc) vẫn **[Unverified]** |
| Review Toán (hạ tầng) | prompt reviewer **riêng cho Toán** (`buildMathReviewSystem` trong `lib/tutor/review-schema.ts`); `eval/tutor-review/runner.ts` đã có hai panel (`cp`, `math`) và `--calibrate` chạy trên cả 67 entry (cp và Toán) bằng bộ lỗi gieo chung `seed-errors.ts` (với Toán áp dụng các loại `explanation`, `narration`, `hint`: walkthrough Toán không có mã C++/Python) và biến thể sạch `clean-variants.ts`; `--dry-run` với bốn route giả cho thấy 1893 mutant, 825 biến thể sạch, 5436 lần gọi. Bộ lỗi gieo riêng cho clip (111 + 43) đã xoá cùng mã video |
| CI | bước kiểm `split-curriculum-math --check` trong job `check`; workflow `manim-author.yml` đã gỡ |

Mã video **đã xoá (2026-10-09, theo yêu cầu của chủ dự án)**: `lib/clips/**`, `lib/subjects/math/clips/**` (21 mẫu TS), `manim/**` (21 mẫu Python, cổng QA, dịch vụ, Dockerfile, spike S1/S2/S4, red-team), `eval/manim-author/**`, `scripts/{render-clips.ts,manim-author-pr.mjs,export-clip-specs.ts}`, `app/api/clips`, `lib/server/agent-runtime/{clip-tools,clip-render}.ts`, tests của chúng, job CI `manim-qa`, biến `MANIM_*` trong `.env.example`, vai LLM `manim-author`, nhà cung cấp clip trong `widgetRegistry`, phần clip của cổng release, ZIP và `buildStateContext`. Thẻ git `manim-clips-final` trỏ tới bản cuối còn chạy được (`git checkout manim-clips-final`); tài liệu thiết kế đã được dọn theo (2026-10-09); phần còn nhắc Manim chỉ nằm trong các ADR lịch sử (0002, 0004, 0005, 0007, 0009, 0011, 0012, 0014) và `REVIEW-2026-09-29.md`.

Kết quả đo còn dùng được từ nhánh video (ghi ở ADR 0015): image Manim 0.21.0 ghim dựng được và render qua HTTP cho khung hình giống hệt bản native arm64; red-team thử đầu tiên tìm ra TeX đọc được `/etc/passwd` và fork bomb làm dịch vụ ngừng trả lời (chưa vá, không còn cần vì hướng này đã đóng).

Review bằng model free (kết luận: không dùng được làm cổng):

- `longcat-2.5-preview-free` bị upstream từ chối `temperature: 0` ("0 is not greater or equal to 0.1") nên hội đồng hai provider không đủ hai review; `space-bunny-free` chạy được nhưng một reviewer không đủ để ghi file cổng. Vì vậy **chưa có file review nào** trong `lib/subjects/math/reviews/`. Bản ghi từng phần của các entry cp nằm ở `docs/tutor/review-runs/2026-10-08-cp-free-models/` (không phải file cổng); bản ghi Toán (trên bản clip cũ) đã xoá, còn trong lịch sử git. Những lỗi chữ thật mà hai model free tìm ra lúc đó đã được sửa trong các walkthrough.

Lệch so với card/kế hoạch cũ:

- 7 clip đầu (`amgm-semicircle`, `cs-projection`, `secant-tangent`, `alg-identity-area`, `pythagoras-dissection`, `euclid-rectangle`, `geometric-series-area`) và 14 clip sau chuyển nguyên id; vài entry đổi hình dạng input cho gọn số học: `convex-chord` (`tn` thay `t`), `limit-epsilon` (`e` thay `eps`).
- `secant-tangent`: ngưỡng `|slope(0.01) − f'| < 0.1` của card cũ sai trong miền input; walkthrough dùng độ dốc chính xác ở h = 1, 1/2, 1/4, 1/8 như phân số.
- `concurrency-dynamic`: đỉnh C chạy theo `C + (k/4)(B − A)`, k = −2…3 và một vị trí đặc biệt (tam giác tù thì tâm ra ngoài); hai điểm neo của mỗi đường được đẩy ra xa cỡ cạnh tam giác để làm tròn 3 chữ số không làm lệch đường.
- `limit-epsilon`: trục n được co theo tỉ lệ khung hình (renderer giữ tỉ lệ 1:1 giữa hai trục).
- Dữ liệu hình được làm tròn 3 chữ số thập phân: test hình học dùng dung sai 6e-4 (toạ độ) và 0,3–0,4° (góc), không so bằng.

Chưa làm và vì sao (Phase 3):

| Việc | Lý do |
| --- | --- |
| Hội đồng review Toán cho 27 walkthrough, rồi calibration (≥ 90% bắt lỗi, ≤ 10% chặn nhầm) | cần hai model mạnh trên hai provider (`MODEL_ROUTES` cho `tutor-review-math`, `tutor-review-math-2`); runner và calibrate đã sẵn sàng, chưa chạy thật. Lỗi gieo của Toán chỉ phủ chữ (lời giảng, narration, gợi ý), chưa gieo lỗi vào hình hay số trong khung |
| Nghiên cứu nguồn cho curriculum Toán (đề cương thi, lớp, trọng số, tài liệu) | cần nguồn thật; khung hiện là [Inference] |
| Xem từng walkthrough mới bằng mắt trong ứng dụng thật và e2e riêng | đã chụp ảnh từ iframe headless cho từng entry khi viết; chưa chạy e2e trình duyệt cho entry mới |
| Nhập số tự do (`customInput`) cho Toán | lát 1d chưa mở (cổng `1d-00`) |

## 4. Việc tiếp theo (theo thứ tự)

1. Review Phase 2 ba góc, ghi nhận xét cụ thể vào REVIEW, sửa theo nhận xét.
2. Xem từng entry trong trình duyệt (visualizer mới chưa được kiểm bằng mắt trên entry thật).
3. Chạy lại hội đồng review LLM theo mục "Gate review LLM" ở trên: chạy hội đồng review LLM cho mọi entry, ghi file review, chạy cổng G1/G2, rồi mới phát hành.
4. Phase 3: 27 walkthrough Toán đã xong (mục 3b, ADR 0015). Còn lại cần model mạnh hoặc người: hội đồng review Toán và calibration (hạ tầng và bộ lỗi gieo đã có), kiểm chứng chi tiết thi cử còn `[Unverified]`, xem bằng mắt entry mới.
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

Kết quả 2026-10-09: `tsc` sạch, `eslint` 0 lỗi, `check_docs` 0 vấn đề, `pnpm build` và `docker build` (cờ workbench bật) đều qua. Trên **Node 22** (`fnm install 22`, bản CI dùng) toàn bộ vitest qua; trên **Node 24** có đúng 46 test đỏ ở `tests/runtime/chat-storage.test.ts` (40), `tests/quiz/runtime.test.ts` (4) và `tests/media/server-backed-media-orchestrator.test.ts` (2), cũng đỏ trên `main` nguyên bản và đạt 146/146 dưới Node 22, nên là khác biệt môi trường, không phải lỗi của công việc này.

Một số test nặng vượt timeout 5 giây khi cả bộ chạy song song và máy bận (ví dụ `tests/subjects/math/curve-sketching`, `tests/media/media-placeholder-lease-guard`, `tests/workbench/workspace-rail-session-rename`); chạy riêng thì qua. Các test của ta đã được nới timeout 60 giây ở những chỗ đã gặp.

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
| Hạn mức OpenCode Go (khoá trong `.env.local`) | Hội đồng review LLM cho các entry còn lại (xem "Review thật" bên dưới): chạy 2026-10-09 thì cổng báo "Go usage limit exceeded". Cổng G1/G2 và các eval thật khác cũng cần hạn mức | `I-04`…`I-07`, `2-G2`, `G1-01` |
| Image Docker | Đã dựng 2026-10-09 (`docker build --build-arg NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true`); trong container `lib/subjects/cp/reviews/` có đủ 3 file review | OPERATIONS §2 |
| `node_modules` thật cho Playwright | e2e `e2e/tests/*.spec.ts` chưa chạy; `1c-21` (e2e chờ dự đoán) chưa làm | `1c-21` |
| Runner CI có `g++`, `python3` | Chưa kiểm chứng trên CI thật `[Unverified]` | bước `TUTOR_IMPL_CHECK` |
| Review do người | Bản dịch giao diện `subject.tutor.*` (20 khoá × 12 locale) đã được đọc lại 2026-10-09, không thấy lỗi, nhưng chưa có người bản ngữ xem; nội dung bài giải đề P2/P3 và 4 mô-đun 2D là đề xuất của leader `[Inference]` | `I-05`, `I-06` |

## 7. Vấn đề đã biết, chưa sửa

Lấy từ REVIEW vòng 11 và báo cáo của các agent:

- Đã sửa 2026-10-09: xuất video giờ theo chính sách widget `code` của server; `HIGHLIGHT_ELEMENT` gửi trước `widget-ready` được giữ lại; `/api/quiz-grade` được lọc nội dung; lọc lịch sử chat đã phủ tới 10 tin học sinh gần nhất.
- Còn lại: route phiên agent của workbench (`app/api/agent/sessions/**`) chưa lọc tin học sinh (cần quyết định của chủ dự án, SECURITY §6); tin vai assistant trong lịch sử do client gửi chưa lọc; `extractVisibleText` chưa đọc `chart` và PBL v2; chưa ghi `tutorLearning` kiểu `moderation`.
- Cổng sim-learner đo so với nhóm đối chứng không học (tài liệu đã cập nhật khớp mã).
- `bs-answer-mini` preset `one-tree` có 14 beat; provider cắt còn 12 beat kể và giữ beat `done`.
- Bộ lọc kiểm duyệt: mẫu "benign" gồm lời hỗ trợ khi học sinh có ý tự hại có thể bị lọc chặn; ghi nhận chứ không xoá mẫu.
- Replay của `generate_walkthrough` giữ map `(sessionId, callId)` trong bộ nhớ tiến trình (tối đa 1000); sau khi khởi động lại chỉ dựa vào so sánh nội dung giống hệt.
- Bấm Play khi đang có câu hỏi dự đoán thì câu hỏi bị coi là bỏ qua và được báo `skipped`: chủ ý, không phải lỗi.
- Các mã lỗi mới của tool `generate_walkthrough` (`no-document`, `content-blocked`, replay) đã ghi vào INTERFACES §3; hình dạng `lessonKit` mới (`pitfalls: {text, lang?}[]`, `hints: string[]`) đã khớp INTERFACES.
- `docs/tutor/curriculum/` là nguồn gốc; đổi nó thì chạy lại `npx tsx scripts/split-curriculum.ts`.

## 8. Những gì tài liệu này không có

- Báo cáo review chi tiết của ba reviewer (`review_A/B/C.md`, `phase1_issues.md`) nằm trong thư mục scratchpad của phiên cũ và **đã mất**. Phần còn lại là mã số phát hiện (A1…A18, B1…B15, C1…C29) trong REVIEW vòng 9–11 và trong commit của chín nhánh `task/fix-*`; `git log --stat` và `git show` trên các commit đó cho biết từng thay đổi.
- Mã kết quả test và log của từng agent con không được lưu lại ngoài các báo cáo đã tóm tắt ở đây.
- Sau khi merge `2-IS1`, `2-00`, `2-I1` đã chạy lại `tests/tutor/input-spec`, `curriculum-map`, `tests/subjects`, `tests/agent-runtime/skills`: 214 đạt, 9 bỏ qua (cần `TUTOR_IMPL_CHECK=1`). Chưa chạy lại toàn bộ các thư mục test còn lại sau ba merge đó.

## 9. Kiểm tra nhanh để biết trạng thái ban đầu

```bash
cd /Users/quangthiep/Projects/OpenMAIC
git status --short            # chỉ nên thấy AGENTS.md và CLAUDE.md (sinh bởi next dev, đừng commit)
git log --oneline -5
git worktree list             # chỉ checkout chính
python3 docs/tutor/tools/check_docs.py
npx tsc --noEmit
```

`.omo/` là thư mục chưa theo dõi (không thuộc dự án này; chứa prompt cũ và mẫu lời nhắc worker). Đừng commit nó.
