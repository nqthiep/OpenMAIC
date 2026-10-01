# Chiến lược kiểm thử

- **Trạng thái**: Accepted — chưa có test nào của tính năng được viết; công cụ và lệnh lấy từ repo hiện tại (sửa 2026-09-30 theo review: chặn `code` nhiều lớp, bắt tay, beat theo preset, `entryRev`, cổng sư phạm, bước CI cho browser test)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án (QA)
- **Liên quan**: [NFR](NFR.md), [SECURITY](SECURITY.md), [OPERATIONS §3](OPERATIONS.md), [RISKS](RISKS.md), [ONBOARDING](ONBOARDING.md), [REQUIREMENTS §3b](REQUIREMENTS.md), [ADR 0006 Eval](decisions/0006-deterministic-trace-catalog.md), [ADR 0008 Rubric](decisions/0008-lesson-blueprint-hard-problems.md), [ADR 0012 cổng G1/G2](decisions/0012-audience-scope-pedagogy-gates.md)

> **Tóm tắt:** nguyên tắc là **kiểm bằng hàm thuần trước, LLM sau, người thật ở cổng**.
> - Phần lớn kiểm chứng là test tất định chạy bằng vitest (môi trường node), vì frame, validator, guard, cache key và quyết định chặn đều là hàm thuần.
> - Trình duyệt dùng cho iframe, bắt tay, CSP, export (Playwright, Chromium).
> - Phần AI (lời thầy, chất lượng bài, Q&A) kiểm bằng eval có ngưỡng, không chặn CI.
> - **Hiệu quả dạy** kiểm bằng cổng G1/G2 với hội đồng LLM và học sinh mô phỏng, rồi số đo học sinh thật sau phát hành (ADR 0014). Mỗi vai trò LLM có **bộ hiệu chuẩn**.
> - Cổng CI cứng: `pnpm test`, `pnpm lint`, `pnpm check`, `npx tsc --noEmit`, `pnpm check:i18n-keys`, không đổi package, e2e (job `e2e`).

## 1. Nguyên tắc

1. Mọi thứ kiểm được tất định thì **không** dùng LLM để kiểm.
2. Mỗi entry (walkthrough/clip) là **một đơn vị kiểm thử độc lập**: thêm entry = thêm file test cùng lúc.
3. Đối chiếu kết quả với **cách tính độc lập** (ví dụ `Array.prototype.sort`, Bellman-Ford), không với chính hàm đang kiểm.
4. Test **không phụ thuộc mạng, không gọi LLM thật** (dùng `aiCall` giả ném lỗi nếu bị gọi).
5. Bảo mật kiểm bằng **kiểm kê**, không chỉ bằng ca mẫu: test liệt kê mọi đường ghi scene để đường mới không lọt (ADR 0010).
6. Phần chưa kiểm được thì **ghi rõ là không kiểm** (§8), không để trống.

## 2. Các tầng kiểm thử

| Tầng | Công cụ / vị trí | Kiểm gì | Lệnh | Khi nào chạy |
| --- | --- | --- | --- | --- |
| Đơn vị (node) | vitest; `tests/**/*.test.ts` (chỉ pattern này được thu thập, `vitest.config.ts:11`) | engine, player, `InputSpec`, guard message, entry, provider, tool, policy, cache key, describe, catalog↔SKILL.md, curriculum | `pnpm vitest run tests/tutor tests/widgets tests/subjects tests/clips` | mọi PR (`pnpm test`) |
| Tương đương server/trình duyệt | vitest + e2e | `run` chạy trong bundle iframe cho frame **giống** bản server cùng input (`framesHash` bằng nhau) | như trên + e2e | mọi PR |
| Tích hợp (không LLM) | vitest | tool `generate_walkthrough` ghi scene hợp lệ với `aiCall` giả ném lỗi nếu bị gọi; `generate_clip_scenes` tạo slide đúng | như trên | mọi PR |
| Trình duyệt (iframe) | Playwright; `e2e/tests/` (cổng 3002, Chromium; `playwright.config.ts`) | `sandbox` đúng; `widget-ready`; lệnh gửi trước `ready` vẫn được áp; dựng lại iframe → về đúng frame; `widget-state`; nguồn lạ bị bỏ; **0 request ra ngoài**; lớp học có `code` không hiện editor; dự đoán có chờ | `pnpm exec playwright test e2e/tests/walkthrough-widget.spec.ts e2e/tests/code-widget-blocked.spec.ts` | job `e2e` |
| Trình duyệt (export) | vitest browser test theo mẫu `tests/video-export/*.browser.test.ts` | widget tự chứa qua `prepareInteractiveHtmlScenes`; không dùng `localStorage`; clip trong slide qua export MP4 | `INTERACTIVE_STATIC_BROWSER=1 pnpm exec vitest run <file>.browser.test.ts` | job `e2e`, **mỗi file một step riêng** (§5) |
| Python | pytest trong `manim/` | bất biến toán của mẫu, bbox chữ, `ffprobe` (kích thước, fps, độ dài), manifest | `pytest manim/qa` | job Manim CI (đề xuất) |
| Bản cài đặt C++/Python | job riêng, cờ `TUTOR_IMPL_CHECK=1` | chạy `impl.cpp` (g++) và `impl.py` (python3) trên preset, so kết quả cuối với `run()` | `TUTOR_IMPL_CHECK=1 pnpm vitest run tests/subjects/impl-equivalence.test.ts` (đề xuất) | job riêng (đề xuất); `g++`/`python3` trên runner: [Unverified] |
| i18n | `pnpm check:i18n-keys` + `tests/i18n/tutor-locales.test.ts` | 12 locale có `subject.tutor.*`; script chỉ so với `en-US`, không bắt thiếu key ở `en-US`, nên cần test riêng | `pnpm check:i18n-keys` | mọi PR |
| Skill/workbench | vitest | tên skill ở 12 locale; `title` chứa chữ Hán; không thư mục thiếu `SKILL.md`; skill `deep-interactive` không còn `code` | `pnpm vitest run tests/workbench/workbench-i18n.test.ts tests/agent-runtime/skills.test.ts` | mọi PR |
| Tĩnh | ESLint (có luật tất định cho catalog), Prettier, TypeScript | kiểu, định dạng, cấm `Intl`/`Date`/`Math.random` trong `run` | `pnpm lint` · `pnpm check` · `npx tsc --noEmit` | mọi PR |
| Tài liệu | `docs/tutor/tools/check_docs.py` | cấu trúc, liên kết, tham chiếu code, **neo nội dung** | `python3 docs/tutor/tools/check_docs.py` | mọi PR (đề xuất thêm vào job `check`) |
| Eval (LLM) | `eval/<tên>/` (mẫu `eval/outline-language`, `eval/orchestration`) | chất lượng bài, lời thầy khớp frame, Q&A, RSR (offline) | `pnpm eval:tutor-lesson`, `pnpm eval:tutor-qa`, `pnpm eval:walkthrough-actions`: **các script này chưa có**, cần thêm vào `package.json` | thủ công/định kỳ, **không** chặn CI |
| Vai trò LLM (cổng) | `eval/tutor-review/`, `eval/tutor-moderation/`, `eval/sim-learner/`, `eval/manim-author/` (đề xuất) | Hội đồng LLM duyệt entry (JSON có schema); học sinh mô phỏng G1/G2; **bộ hiệu chuẩn** của từng vai trò (ADR 0014 quyết định 7) | `pnpm eval:tutor-review`, `eval:tutor-moderation`, `eval:sim-learner`, `eval:manim-author` (chưa có) | mỗi khi entry đổi (`entryRev`), đổi model/prompt, và trước mỗi cổng |
| Thủ công có ghi chép | checklist demo | "dạy em Binary Search" trọn vòng trên workbench; xuất/nhập lớp học; clip phát; Safari/Firefox; màn 375 px; `ar-SA` | — | trước phát hành mỗi đợt |

## 3. Ma trận: kiểm chứng cái gì ở đâu

| Đối tượng | Test | Tiêu chí đạt |
| --- | --- | --- |
| `generateSteps` | `tests/tutor/engine/generate.test.ts` | tất định; input bị freeze; vượt `maxFrames` → `RangeError`; `run` lặp vô hạn không emit → `RangeError` qua `tick`; JSON round-trip; `index` liên tục |
| `createPlayer` | `tests/tutor/engine/player.test.ts` (fake timer) | play/pause/step/jump/kẹp biên; speed kẹp; tự pause ở frame cuối; `dispose` dừng timer |
| Guard message | `tests/tutor/protocol/messages.test.ts` | thứ tự áp `preset → frame → panel → speed → playing`; `preset` lạ → bỏ cả message; `frame` kẹp theo bộ mới; `playing` idempotent; kiểu lạ → `null`; không ném lỗi |
| `InputSpec` | `tests/tutor/input-spec.test.ts` | mọi `kind`; khoá lạ bị từ chối; biên; JSON > 2048 byte → `too-large` |
| Entry walkthrough | `tests/subjects/<id>/<entry>.test.ts` | cạnh biên; kết quả cuối đúng (đối chiếu độc lập); ≥4 preset gồm biên; `map.cpp`/`map.py` toàn phần; mọi preset có beat `required`; mọi `beatDef` dùng ở ≥1 preset; số/nhãn trong `explanation` ⊆ state; ngưỡng frame/byte |
| Phiên bản entry | `tests/subjects/ids-snapshot.test.ts` | snapshot `id` + `entryRev` + `framesHash` mỗi (preset, locale) + `contentHash`; hash nào đổi mà `entryRev` không tăng → đỏ; xoá/đổi `id` → đỏ; `id` duy nhất trên mọi gói |
| HTML sinh ra | `tests/tutor/build/build-html.test.ts` | hai khối JSON parse được; `widget-config` đủ trường (ADR 0013 §5), không chứa `frames`; `extractInteractiveElements` liệt kê `#wt-*` và ≤60 id; có meta CSP; không chứa `<script src`/`</script`/`<!--` ngoài dự kiến; `<` thoát trong JSON |
| Runtime sinh sẵn | `tests/tutor/build/runtime-fresh.test.ts` | module sinh sẵn khớp bản build lại |
| Tool `generate_walkthrough` | `tests/widgets/walkthrough-tool.test.ts`, `registry.test.ts` | id/preset sai → lỗi kèm `validIds`; `input` trước 1d → `invalid-input`; idempotent theo `callId`; `aiCall` không bị gọi; actions theo `sets[presetId].beats`, thứ tự `[ask] → setState{preset,frame} → speech`; đúng một provider/scene |
| Chặn `code` | `tests/widgets/policy.test.ts`, `render-block.test.ts`, `write-paths.test.ts` | Mặc định chặn; `ALLOW=true` → không chặn; cả hai trường; `generate_scene`/`patch_stage`/`duplicate_scene` (scene cuối) từ chối; classic + `scene-content` coerce; `InteractiveRenderer` **và** `ThumbnailInteractive` không mount iframe; export gói tài nguyên bỏ HTML `code`; mọi đường ghi và mọi chỗ `srcDoc=` đã phân loại; widget khác **không** bị chặn |
| Khoá `patch_stage` | `tests/widgets/patch-lock.test.ts` | làm đổi `/content/html`/`/content/widgetConfig` của walkthrough (trước hoặc sau) → `walkthrough-locked`; `/actions` được phép; scene lệch catalog → `walkthrough-stale` |
| Q&A | `tests/widgets/describe.test.ts` | digest có title/beats/gợi ý **tra từ catalog**; có `widgetState` → frame k; **HTML chứa chữ tiêm vẫn cho cùng kết quả**; `entryRev` lệch → digest tĩnh; preset `student` → server kiểm lại `input` và tính lại |
| Clip entry | `tests/clips/*.test.ts` + pytest | `invariants` 100%; `entry.chapters` khớp `manifest.chapters`; cache key ổn định, lượng tử hoá, khác khi đổi `imageDigest`/`templateRev`; số liệu hiển thị khớp hàm độc lập |
| Bộ lọc nội dung | `tests/tutor/moderation.test.ts` | giữ `text_delta` tới `agent_end`; `allow:false` → câu an toàn, bỏ `action`; model lỗi/quá hạn → chặn (fail-closed); thiếu route → chat bị chặn; nội dung trong khối dữ liệu |
| Review của hội đồng | `tests/subjects/reviews.test.ts` | mọi entry trong `pack.ts` có `reviews/<id>@<entryRev>.json` đạt (hai model, điểm ≥ 4, không `factErrors`) |
| `tutorLearning` | `tests/runtime/tutor-learning.test.ts` | validator: đúng hình dạng, ≤ 2 KB, khoá lạ bị từ chối; không có trường nguyên văn nội dung bị chặn |
| AST allowlist mẫu Manim | pytest `manim/qa/test_allowlist.py` | mẫu có `import os`/`subprocess`/`open`/`eval` bị từ chối |
| Tool `generate_clip_scenes` | `tests/clips/clip-tool.test.ts` | mỗi chapter một slide qua `validateScene`; `name` đúng; `speech → play_video → speech`; `clip-not-prebuilt` |
| Skill | `tests/tutor/skills.test.ts`, `skill-catalog-sync.test.ts` | không skill nào cho phép `code`; khối id trong `SKILL.md` khớp catalog (snapshot) |
| Curriculum | `tests/tutor/curriculum-map.test.ts` | id duy nhất; `tracks` khác rỗng; prerequisite tồn tại; không vòng; không phụ thuộc tier cao hơn; `sequencing` đủ topic; `index.json` khớp |
| Bước CI của browser test | `tests/ci/browser-steps.test.ts` (đề xuất) | mọi `*.browser.test.ts` có một step trong `.github/workflows/ci.yml` kèm cờ |

Ví dụ test đối chiếu **cách tính độc lập** (không dùng chính hàm đang kiểm):

```ts
// tests/subjects/cp/quick-sort.test.ts
import { describe, expect, it } from 'vitest'
import { quickSortEntry } from '@/lib/subjects/cp/catalog/quick-sort'
import { steps } from '@/lib/tutor/engine/generate'

describe('quick-sort', () => {
  it.each(quickSortEntry.presets)('frame cuối đã sắp đúng: $id', ({ input }) => {
    const frames = steps(quickSortEntry, input, { locale: 'vi-VN' })
    const last = frames[frames.length - 1].state.values
    expect(last).toEqual([...input.values].sort((a, b) => a - b))   // oracle độc lập
    expect(frames.length).toBeLessThanOrEqual(quickSortEntry.maxFrames)
  })
})
```

Ví dụ test **kiểm kê đường ghi** (ý tưởng; danh sách chốt ở spike Q12):

```ts
// tests/widgets/write-paths.test.ts
import { execSync } from 'node:child_process'
import { expect, it } from 'vitest'

const CLASSIFIED = {
  'lib/server/agent-runtime/document-writes.ts': 'L2-tool',   // putSceneBringingCurrent
  'app/api/classroom/route.ts': 'L1-render-only',
  'app/api/persistence/[...path]/route.ts': 'L1-render-only',
} as const

it('mọi đường ghi scene đã được phân loại chặn `code`', () => {
  const hits = execSync("git grep -l -E 'putScene\\(|saveDocument\\(' -- lib app", { encoding: 'utf8' })
    .trim().split('\n').filter((f) => !f.includes('/tests/'))
  for (const f of hits) expect(Object.keys(CLASSIFIED)).toContain(f)
})
```

Quy tắc test tự bỏ qua theo môi trường: mọi test cần trình duyệt phải dùng `describe.skipIf(!process.env.<CỜ>)`, và `ci.yml` phải có **một step riêng** chạy đúng file đó với cờ (`.github/workflows/ci.yml:271-279`). Thiếu step thì test nằm trong `pnpm test` sẽ bị bỏ qua lặng lẽ; `tests/ci/browser-steps.test.ts` bắt lỗi này.

## 4. Dữ liệu kiểm thử

- **Preset** của entry là dữ liệu test chính, kèm ≥1 biên (rỗng, n=1, đã sắp, đảo ngược, target vắng).
- **Golden frame** của mỗi mẫu clip ở params cố định (dùng cho SSIM); cập nhật có chủ đích khi nâng Manim/mẫu.
- **Frame tổng hợp** để đo kích thước payload (mảng, bảng DP, đồ thị) ở test P2/P3.
- **HTML độc** cho test bảo mật (SECURITY §5): chữ tiêm trong `walkthrough-data`, `widgetConfig.type:'code'`, `widget-state` trước `ready`.
- **Bộ câu hỏi Q&A** cho `eval:tutor-qa`: ≥ 20 câu × 3 frame, gồm câu khớp `misconceptions`.
- Không dùng dữ liệu thật của học sinh trong test tự động. Dữ liệu của cổng G1/G2 được ẩn danh.

## 5. Cổng CI (theo `.github/workflows/ci.yml`)

| Cổng | Job hiện có | Nội dung liên quan tính năng |
| --- | --- | --- |
| Lint, kiểu, i18n | `check` | `pnpm check`, ESLint (luật tất định), `tsc`, `check:i18n-keys` |
| Unit | `check` → `pnpm test` | mọi test §3 chạy bằng vitest |
| Package versions | `check` | `git diff --name-only origin/main -- packages/@openmaic` rỗng → không cần bump |
| Trình duyệt | `e2e` (build + Playwright) | walkthrough iframe, bắt tay, CSP, chặn `code`; **mỗi browser test một step có cờ** |
| Render service | `render-service` | không đổi bởi tính năng |
| **Đề xuất thêm** | `check` | `python3 docs/tutor/tools/check_docs.py` |
| **Đề xuất thêm** | job `manim` | dựng image ghim, pytest, cổng QA, render preset trượt cache, kiểm kích thước `public/clips` |
| **Đề xuất thêm** | job `tutor-impl` | `TUTOR_IMPL_CHECK=1` |

**CI chỉ chạy** khi push vào `main`/nhánh integration, hoặc khi mở PR vào danh sách nhánh cố định (`.github/workflows/ci.yml:3-19`). Merge local trên nhánh tính năng không có CI, nên phải chạy đủ §7 trước khi merge, hoặc mở PR vào `main` của fork.

## 6. Eval (không chặn CI)

| Eval | Đo | Ngưỡng đề xuất (`[Inference]`) | Ghi chú |
| --- | --- | --- | --- |
| `eval:tutor-lesson` | rubric ADR 0008 (đúng, rõ, chi tiết, dễ hiểu, trực quan, sinh động) | ≥ 70% mẫu đạt (với N=3 nghĩa là **3/3**, vì 2/3 = 0,67); "Đúng" < 100% chặn ký duyệt và cổng đợt (không chặn CI) | ≥ 6 scenario (3 `ts10`, 3 `hsg`; ≥ 2 bài giải đề); judge temperature 0, parse JSON chặt; ghi token vào/ra (NFR-M4) |
| `eval:walkthrough-actions` | M1–M6 của ADR 0006 | M1=M5=100%; M2 ≥ 90%; contradict ≤ 5% | Chỉ khi bật lời thầy do LLM; `--baseline` đo LLM tự trace |
| `eval:tutor-qa` | Đúng; Bám frame; Gợi ý trước; Dùng hiểu lầm đúng | Đúng 100% (chặn cổng đợt, không chặn CI); Bám frame ≥ 90%; Gợi ý trước ≥ 80%; Dùng hiểu lầm đúng: theo dõi, chưa đặt ngưỡng | A/B có/không `describe()` trong ngữ cảnh; **bỏ** `leads_with_answer` (mâu thuẫn "gợi ý trước") |
| `eval:manim-author` (S9, đợt 3A) | tỉ lệ mã Manim của LLM tác giả render được + đúng toán (hội đồng) | RSR@3 ≥ 90%, đúng toán ≥ 90% (20 brief Việt) | Đường soạn chính (ADR 0014); không chạy khi phục vụ |
| `eval:tutor-review` (hiệu chuẩn) | hội đồng bắt lỗi cài sẵn | bắt ≥ 90%; chặn nhầm ≤ 10% | ≥ 30 entry cài lỗi + ≥ 10 entry đúng |
| `eval:tutor-moderation` (hiệu chuẩn) | chặn độc hại / chặn nhầm | ≥ 99% / ≤ 2% | ≥ 100 mẫu độc hại + ≥ 200 mẫu giáo dục, có thuật ngữ Tin học dễ nhầm và mẫu tiêm prompt |
| `eval:sim-learner` (hiệu chuẩn + G1/G2) | điểm tăng; phân biệt bài tốt/kém | +20 điểm %, ≥ 70% "dễ hiểu"; bài kém thấp hơn ≥ 10 điểm % | 6 persona |

## 7. Chạy cục bộ

```bash
pnpm install
pnpm vitest run tests/tutor tests/widgets tests/subjects tests/clips   # nhanh, tất định
pnpm vitest run tests/agent-runtime/skills.test.ts tests/workbench/workbench-i18n.test.ts
pnpm lint && pnpm check && npx tsc --noEmit && pnpm check:i18n-keys
pnpm exec playwright test e2e/tests/walkthrough-widget.spec.ts e2e/tests/code-widget-blocked.spec.ts   # cần Chromium + cổng 3002
python3 docs/tutor/tools/check_docs.py
```

Lưu ý môi trường: cần Node ≥ 22.19.0 (`package.json` `engines`; `Dockerfile` dùng `node:22-alpine`). Nếu shell tích hợp không có `node` trên `PATH`, thêm thư mục Node vào `PATH` trước khi chạy. e2e cần workbench thì đặt `OPENMAIC_AGENT_RUNTIME_ENABLED=true`, `DATABASE_URL`, `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true`.

## 8. Cái gì **không** được kiểm (và vì sao chấp nhận)

| Không kiểm | Lý do | Giảm thiểu |
| --- | --- | --- |
| Hành vi LLM thật trong CI | không tất định, tốn phí | eval thủ công có ngưỡng; kiểm biên bằng `aiCall` giả |
| Đúng toán của mọi clip bằng máy | không có oracle tổng quát | `invariants` cho phần đo được + **hội đồng LLM Toán** (bộ hiệu chuẩn) |
| Đẹp/dễ hiểu của clip | chủ quan | rubric + VLM-judge chỉ tư vấn + duyệt người + cổng G |
| Autoplay/`blob:` trong iframe trên mọi trình duyệt | CI chỉ có Chromium | spike S7 + kiểm tay Safari/Firefox |
| Editor "trá hình" trong widget LLM | không có oracle | CSP + heuristic cảnh báo (SECURITY §6) |
| Hiệu năng render trên phần cứng thật | phụ thuộc hạ tầng | spike S1 trước khi đặt ngưỡng cứng |
| Hiệu năng nhảy frame trong CI | máy CI dao động, Playwright `retries: 2` | spec riêng `--retries=0`, chỉ theo dõi (NFR-P4) |
| a11y tự động (axe) | ADR 0002 cấm thêm dependency | test bảng màu + e2e bàn phím + checklist tay |

## 9. Quản lý test không ổn định và bảo trì

- Test tất định không được retry. Playwright có `retries: 2` trong CI (`playwright.config.ts:7`), nên test walkthrough phải ổn định **không cần** retry: đợi `widget-ready`, không dùng timeout cứng.
- Fake timer cho mọi test player; không dựa vào giờ thật.
- Golden frame chỉ đổi trong PR có mô tả lý do (nâng Manim, sửa mẫu). `framesHash` đổi thì phải tăng `entryRev`.
- Thêm walkthrough/clip mới = PR phải kèm test tương ứng (checklist ở [ONBOARDING](ONBOARDING.md)).
- Ánh xạ R → test ở [REQUIREMENTS §3b](REQUIREMENTS.md).
