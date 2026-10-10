# Triển khai và vận hành

- **Trạng thái**: Accepted — phần *Đề xuất* chưa triển khai; phần *Đã có* lấy từ repo hiện tại (sửa 2026-09-30 theo review: điều kiện workbench, cờ mặc định chặn, CI; bỏ phần video/Manim 2026-10-09 theo ADR 0015)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án (DevOps)
- **Liên quan**: [ARCHITECTURE](ARCHITECTURE.md), [NFR](NFR.md), [SECURITY](SECURITY.md), [TEST-STRATEGY](TEST-STRATEGY.md), [RISKS](RISKS.md), [ADR 0010](decisions/0010-no-student-code-enforcement.md), [ADR 0011](decisions/0011-entry-point-workbench-tool.md), [ADR 0015](decisions/0015-math-interactive-web-ui-not-video.md)

> **Tóm tắt:**
> - SubjectTutor **chỉ chạy khi bật workbench**: `OPENMAIC_AGENT_RUNTIME_ENABLED=true` + `DATABASE_URL` (Postgres) + cờ build-time `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true`. Vì vậy triển khai này **luôn có server persistence** và **phải sao lưu Postgres + kho asset**.
> - Chuyên Tin và Chuyên Toán không thêm dịch vụ nào: cả hai chỉ là walkthrough HTML tự chứa (ADR 0015).
> - Widget `code` **mặc định bị chặn**, không cần đặt cờ.
> - Mọi thành phần tuỳ chọn suy giảm êm khi vắng mặt.

## 1. Topology triển khai

```mermaid
flowchart TB
  U["Học sinh (trình duyệt)"] --> APP
  subgraph DEP["Docker Compose"]
    APP["openmaic (Next.js standalone)<br/>cổng 3000 · volume openmaic-data<br/>workbench + agent runtime BẬT"]
    PG[("postgres<br/>BẮT BUỘC cho tính năng")]
    RS["render-service (Node+Chromium+FFmpeg)<br/>profile video-export · mạng render internal"]
  end
  APP --> PG
  APP -- "RENDER_SERVICE_URL" --> RS
  APP --> STORE[("Asset: Postgres / volume data / S3")]
  APP --> EXT["LLM, TTS, media providers"]
```

| Thành phần | Trạng thái | Bắt buộc? | Ghi chú |
| --- | --- | --- | --- |
| `openmaic` | Đã có | Có | `Dockerfile` 4 stage (`base`, `deps`, `builder`, `runner`); `next.config.ts`: `output: 'standalone'`. **Phải dựng với `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true`** |
| `postgres` | Đã có (profile) | **Có** (agent runtime cần `DATABASE_URL`, `lib/config/feature-flags.ts:29-36`) | Chứa tài liệu lớp học, runtime rows, asset (khi dùng kho server) |
| `render-service` | Đã có (profile `video-export`) | Không | Export MP4; vắng mặt → tải ZIP |

## 2. Cấu hình

`Đã có` = biến đã tồn tại trong `.env.example`/code. `Đề xuất` = biến mới, cần thêm khi triển khai.

| Biến | Mặc định | Tác dụng | Trạng thái |
| --- | --- | --- | --- |
| `OPENMAIC_AGENT_RUNTIME_ENABLED` | tắt | **Bắt buộc bật**: chạy agent runtime (đường duy nhất tạo walkthrough, ADR 0011) | Đã có (`.env.example:347`) |
| `DATABASE_URL` | không đặt | **Bắt buộc**: runtime chỉ chạy khi có URL khác rỗng | Đã có (`.env.example:353`) |
| `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED` | tắt | **Bắt buộc bật lúc build**: hiện workbench; thiếu thì `/workbench` trả 404 (`middleware.ts:34-37`). Đã có trong `ARG`/`ENV` của `Dockerfile` (`:61`, `:72`) và `build.args` của compose (`docker-compose.yml:23`) | Đã có (biến, Dockerfile, compose) |
| `OPENMAIC_ALLOW_CODE_WIDGET` | **không đặt = chặn** widget `code` toàn ứng dụng | Đặt `true` chỉ khi triển khai muốn hành vi upstream (có code editor). Không có biến `NEXT_PUBLIC_*` tương ứng; client hỏi server (ADR 0010) | Đề xuất |
| `OPENMAIC_DISABLE_WIDGET_PROVIDERS` | không đặt | Kill-switch kiểu **boolean** (`true`/`1`; không phải danh sách provider): không đăng ký tool `generate_walkthrough` (§10) | Đã có (`lib/config/feature-flags.ts`) |
| `OPENMAIC_TUTOR_MODERATION` | không đặt = **tắt** | Boolean (`true`/`1`). **Tắt: chat `/api/chat` không được lọc, kể cả khi đã cấu hình route `tutor-moderation`.** Bật: mọi lượt chat qua bộ lọc, **fail-closed** (thiếu route `tutor-moderation` → chat bị chặn bằng câu an toàn). Chỉ phủ `/api/chat`, `/api/chat/pi`, `/api/quiz-grade` và tin nhắn của học sinh gửi vào phiên agent (`POST /api/agent/sessions` và `/api/agent/sessions/:id/messages`) (SECURITY §6) | Đã có |
| `OPENMAIC_REQUIRE_REVIEW` | không đặt = tắt (mọi entry) | Boolean (`true`/`1`). Bật: chỉ entry có file review đạt ở đúng `entryRev` (`lib/subjects/<môn>/reviews/<id>@<entryRev>.json`). **Bật mà không có file review → không lộ walkthrough nào.** `next.config.ts` đưa `lib/subjects/*/reviews/**` vào bản standalone (`outputFileTracingIncludes`); `release.ts` tìm file theo `process.cwd()` rồi theo đường dẫn của module. Đã kiểm 2026-10-09 trên `pnpm build`: file thử đặt ở `lib/subjects/cp/reviews/` xuất hiện trong `.next/standalone/lib/subjects/cp/reviews/`. Image Docker cũng đã dựng (2026-10-09, cờ workbench bật) và `ls lib/subjects/cp/reviews` trong container thấy đủ các file review | Đã có |
| `OPENMAIC_TUTOR_HINT_FIRST` | không đặt = **bật** | Boolean, mặc định bật (`false`/`0` = tắt). Bật: ở cảnh walkthrough, gia sư mở đầu bằng một câu hỏi hoặc một gợi ý cụ thể, và chỉ nêu đáp án ngay khi học sinh xin thẳng đáp án, giá trị hay code (`WALKTHROUGH_ANSWER_POLICY` trong `lib/orchestration/prompt-builder.ts`). Tắt: gia sư trả lời thẳng như upstream. Chỉ áp cho cảnh walkthrough; cảnh khác không đổi. Chỉ đọc ở server (prompt chat dựng ở server). `eval:tutor-qa` đọc cùng biến để đo từng chế độ | Đã có (`lib/config/feature-flags.ts`) |
| `slots` `tutor.*` trong `openmaic.yml` (ADR 0014) | không đặt | Model cho từng vai trò LLM của tutor: `tutor.moderation`, `tutor.review-cp`, `tutor.review-cp-2`, `tutor.review-math`, `tutor.review-math-2`, `tutor.review-code`, `tutor.sim-learner`, `tutor.analyst`. Mỗi vai trò là một cây riêng (gốc `tutor`), **không** kế thừa `llm`: thiếu gán thì tính năng tắt (thiếu `tutor.moderation` → chat học sinh bị chặn). Khuyến nghị hai nhà cung cấp khác model dạy | Đã làm (`lib/config/model-slots.ts`, `lib/tutor/llm-roles.ts`) |
| `RENDER_SERVICE_URL` | không đặt | Bật export MP4 một chạm; container render nằm trên mạng `render` (`internal: true`) | Đã có |
| `RENDER_MAX_QUEUE` (20), `RENDER_MAX_JOBS_PER_USER` (1), `RENDER_JOB_TTL_MS` (1 800 000), `RENDER_JOB_DEADLINE_MS` (2 700 000) | như trong ngoặc | Tham khảo | Đã có |
| `NEXT_PUBLIC_PERSISTENCE`, `PERSISTENCE_DEV_TOKEN` | không đặt | Server persistence (Postgres/S3), trần asset 32 MiB | Đã có |
| `ASSET_S3_BUCKET` (và cặp biến S3) | không đặt | Kho asset S3 của server persistence | Đã có (`.env.example:519`; dùng lại) |
| `ASSET_QUOTA_BYTES` | 10 GiB; `0` = tắt (`lib/persistence/asset-quota.ts:16`) | Trần tổng dung lượng asset mỗi principal (có test `tests/persistence/asset-quota.test.ts`) | Đã có |
| `ALLOW_LOCAL_NETWORKS` | tắt | Chỉ bật cho mô hình tự host; **không bật trên triển khai công khai** | Đã có |
| `ALLOWED_FRAME_ANCESTORS` | rỗng | CSP `frame-ancestors` thêm nguồn tin cậy (build-time) | Đã có |
| `ACCESS_CODE` | không đặt = **mọi thứ mở** (`middleware.ts:60-63`) | Cookie access-code; `/api/*` trả 401 nếu thiếu. **Bắt buộc đặt** cho triển khai học sinh (SECURITY T26) | Đã có |
| `LOG_LEVEL`, `LOG_FORMAT` | `info`, `pretty`; `LOG_FORMAT=json` cho log có cấu trúc (`lib/logger.ts:10`) | Mức và định dạng log | Đã có |
| `OPENMAIC_AGENT_TOOL_TIMEOUT_MS` | mặc định của runtime | Trần thời gian của tool agent | Đã có |

**Cấu hình model theo vai trò** (ADR 0014 quyết định 8; user chọn DeepSeek V4.1 flash + GPT-6-luna). Định danh model dưới đây là **tạm, [Unverified]**; lấy tên chính xác từ danh sách model của nhà cung cấp (spike Q16):

```bash
OPENAI_API_KEY=...            # GPT-6-luna
OPENAI_MODELS=gpt-6-luna      # tên chính xác: [Unverified]; danh mục repo hiện có gpt-5.6-luna
DEEPSEEK_API_KEY=...          # DeepSeek V4.1 flash
DEEPSEEK_MODELS=deepseek-v4.1-flash   # tên chính xác: [Unverified]; ví dụ trong repo là deepseek-v4-flash
slots:
  tutor.moderation: deepseek:deepseek-v4.1-flash
  tutor.review-cp: deepseek:deepseek-v4.1-flash
  tutor.review-cp-2: openai:gpt-6-luna
  tutor.review-math: deepseek:deepseek-v4.1-flash
  tutor.review-math-2: openai:gpt-6-luna
  tutor.review-code: deepseek:deepseek-v4.1-flash
  tutor.sim-learner: deepseek:deepseek-v4.1-flash
  tutor.analyst: deepseek:deepseek-v4.1-flash
DEFAULT_MODEL=openai:gpt-6-luna
```

Các vai trò tutor là slot `tutor.*` trong `openmaic.yml` (`lib/tutor/llm-roles.ts`); biến `MODEL_ROUTES` không còn được đọc cho các vai trò này. Giá trị `api` của slot agent phải là `openai-completions` hoặc `openai-responses` (`.env.example:355-365`); chọn cái nào tuỳ model hỗ trợ (spike Q16).

Quy tắc: `NEXT_PUBLIC_*` biên dịch vào bundle trình duyệt (compose truyền qua `build.args`); không đặt bí mật vào đó.

**Danh tính cho giới hạn mỗi người:** `render-service` chỉ có danh tính thật khi `TRUST_PROXY_HEADERS=true` sau reverse proxy; nếu không, mọi client chung một danh tính (`render-service/README.md`), và `docker-compose.yml` vì vậy đặt `RENDER_MAX_JOBS_PER_USER=0`.

## 3. Build, phát hành và CI

- **Ứng dụng:** `pnpm build`. Docker deps stage chỉ COPY `packages/` và `scripts/` trước `pnpm install` (`Dockerfile:34-36`), nên **mọi thứ tạo từ `lib/`** (module runtime walkthrough) phải là **file sinh sẵn được commit**, không build ở `postinstall`. Lệnh sinh: `node scripts/generate-tutor-runtime.mjs` (tên đề xuất).
- **Không đổi package:** `packages/@openmaic/*` giữ nguyên nên không bump/publish (`git diff --name-only origin/main -- packages/@openmaic` rỗng).
- **CI hiện có** (`.github/workflows/ci.yml`):
  - job `check`: Prettier, ESLint, TypeScript, i18n, version bumps, unit tests;
  - job `render-service`: typecheck, test, build image;
  - job `e2e`: build, Playwright, và **browser test chạy từng file một ở step riêng có cờ môi trường** (`.github/workflows/ci.yml:271-279`).
- **Trigger CI:** `push` chỉ cho `main` và các nhánh integration; `pull_request` chỉ vào danh sách nhánh cố định (`.github/workflows/ci.yml:3-19`). Nhánh tính năng merge local **không có CI**. Cách xử lý: mở PR vào `main` của fork (origin), hoặc chạy đủ lệnh ở TEST-STRATEGY §7 trước khi merge local.
- **CI cần thêm (đề xuất):**
  - (a) Mỗi `*.browser.test.ts` mới **một step riêng** trong job `e2e` kèm cờ; test `tests/ci/browser-steps.test.ts` so danh sách file browser test với `ci.yml`.
  - (b) Đặt `OPENMAIC_AGENT_RUNTIME_ENABLED`, `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED` cho bước `pnpm build` và `webServer.env` của Playwright (`playwright.config.ts:35`) khi e2e cần workbench.
  - (c) Test kiểm độ mới của module runtime sinh sẵn.
  - (d) `python3 docs/tutor/tools/check_docs.py` trong job `check`.
  - (e) Job `TUTOR_IMPL_CHECK=1` chạy bản cài đặt C++/Python trên preset (Phase 2 §7).
- **Nhánh và commit:** làm trên nhánh tính năng tạo từ `origin/main`, **không đẩy từ `main` cục bộ** (`branch.main.remote` đang là `upstream`, tức THU-MAIC). Commit theo quy ước `type(scope): mô tả`. Không mở PR lên upstream.

## 4. Lưu trữ asset và dung lượng

| Kho | Trần / ghi chú | Dùng cho |
| --- | --- | --- |
| Asset pool (IndexedDB `maic-asset-pool`) | theo trình duyệt | Blob media của lớp học; nguồn để ZIP/MP4/import hoạt động |
| Server persistence (Postgres/S3) | ≤32 MiB/asset, request 33 MiB (`packages/@openmaic/storage/src/server/asset.ts:108-109`); tổng quota theo `ASSET_QUOTA_BYTES` (mặc định 10 GiB mỗi principal, `lib/persistence/asset-quota.ts:16`) | Luôn bật trong triển khai này |
| File server `data/classrooms/<id>/media` | route Range `/api/classroom-media`; trần 200 MB (agent), 100 MB (classic) [theo chuyên gia] | Video sinh bởi provider |

Xuất ZIP lớp học dựng `JSZip` rồi `generateAsync({type:'blob'})` **trong RAM** (`lib/export/use-export-classroom.ts:86,245`). Cảnh báo 200 MB nằm ở phía **import** (`lib/import/use-import-classroom.ts:361-364`, chỉ `log.warn`). Walkthrough là HTML tự chứa nhỏ (NFR-P2) nên không làm export/import nghẽn.

## 5. Sao lưu và khôi phục

| Dữ liệu | Sao lưu | Khôi phục |
| --- | --- | --- |
| Postgres (**bắt buộc** trong triển khai này; chứa **dữ liệu học sinh**: chat, quiz, `tutorLearning`, lưu không tự xoá theo ADR 0014) | `pg_dump` định kỳ, **mã hoá bản sao lưu** | Restore; xoá theo `learnerKey` khi có yêu cầu (công cụ vận hành, spike Q15) |
| Kho asset (S3, volume `openmaic-data`) | Sao lưu định kỳ | Khôi phục volume/bucket |
| Cấu hình (`.env.local`) | Lưu ngoài repo, có kiểm soát truy cập | Khôi phục thủ công |
| Curriculum, catalog | Nằm trong git (sau khi commit) | `git` |
| Dữ liệu chỉ ở IndexedDB (nếu người dùng mở lớp học không qua server) | **Không được sao lưu phía server**; mất khi trình duyệt xoá dữ liệu | Khuyến nghị học sinh dùng lớp học lưu trên server |

**RPO/RTO: chưa đặt**, cần người vận hành quyết định theo mức quan trọng của dữ liệu lớp học.

## 6. Giám sát và cảnh báo

**Đã có:** log qua `LOG_LEVEL`/`LOG_FORMAT` (`LOG_FORMAT=json`, `lib/logger.ts:10`); `/health` của `render-service` (`accepting`, hồ sơ tài nguyên).

**Đề xuất:** repo **không có backend metric** (không `prom-client`/OpenTelemetry), và ADR 0002 cấm thêm dependency. Vì vậy các sự kiện dưới được ghi thành **log có cấu trúc** (`LOG_FORMAT=json`); người vận hành đếm/cảnh báo bằng công cụ log của họ. **Repo không tự đánh giá cảnh báo.** Cột "Nên cảnh báo khi" là gợi ý cấu hình cho người vận hành.

Schema chung của sự kiện:

```json
{ "level": "info", "event": "walkthrough_generated", "walkthroughId": "binary-search", "entryRev": 1, "presetId": "mid-hit", "ms": 42, "bytes": 38120, "sessionOwner": "owner-hash" }
```

| Sự kiện | Ý nghĩa | Nên cảnh báo khi |
| --- | --- | --- |
| `walkthrough_generated` (`ms`, `bytes`) | Hiệu năng tạo, kích thước | p95 `ms` vượt NFR-P1; `bytes` vượt NFR-P2 |
| `walkthrough_invalid_id`, `walkthrough_invalid_input` | LLM chọn sai id/input | tăng đột biến (SKILL.md lệch catalog) |
| `frame_cap_exceeded` | `RangeError` vượt trần frame/step | > 0 kéo dài |
| `code_widget_blocked` (`layer`: render/tool/classic), `code_widget_stored` | Chặn `code` hoạt động; lớp học import có `code` | `layer=tool` tăng: kiểm prompt/template gán `code` |
| `widget_ready_timeout` | Iframe không báo `ready` trong 5 s | > 1% lượt phát |
| `widget_state_reported` | Kênh Q&A hoạt động | về 0 sau khi triển khai 1c |
| `moderation_verdict` (`direction`, `allow`, `categories`, `ms`), `moderation_failed_closed` | Bộ lọc hoạt động | tỉ lệ chặn đột biến; `ms` p95 > 1500; `failed_closed` > 0 kéo dài |
| `review_verdict` (`entryId`, `entryRev`, `pass`, `models`) | Hội đồng LLM | tỉ lệ trượt tăng; bất đồng giữa hai model > 20% |
| `llm_role_tokens` (`stage`, `in`, `out`) | Chi phí từng vai trò | vượt ngân sách |

Ví dụ truy vấn (với `jq` trên log JSON): `jq -c 'select(.event=="code_widget_blocked") | .layer' app.log | sort | uniq -c`.

## 7. Runbook

| Triệu chứng | Nguyên nhân có thể | Cách xử lý |
| --- | --- | --- |
| Không có workbench / `/workbench` 404 | Thiếu một trong ba điều kiện (ADR 0011); image dựng không có `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED` | Kiểm `/api/agent/runtime`; dựng lại image với build arg; kiểm `DATABASE_URL` |
| Agent trả lỗi `invalid-walkthrough-id` kèm `validIds` | SKILL.md lệch catalog; LLM bịa id | Chạy lại sinh khối id từ catalog; xem test `skill-catalog-sync`; kiểm sự kiện `walkthrough_invalid_id` |
| Học sinh thấy code editor | Có ai đặt `OPENMAIC_ALLOW_CODE_WIDGET=true`; hoặc đường hiển thị mới chưa qua L1 | Bỏ biến; chạy `tests/widgets/policy.test.ts`, `write-paths.test.ts`, e2e `code-widget-blocked.spec.ts` |
| Lời thầy nói "bước 5" nhưng hình ở frame 0 | Iframe chưa `ready` hoặc bị đẩy khỏi pool, host không gửi lại `desired` | Kiểm sự kiện `widget_ready_timeout`; e2e bắt tay (ADR 0013) |
| Chat học sinh luôn trả câu an toàn | Thiếu slot `tutor.moderation` trong `openmaic.yml` hoặc model lọc lỗi (fail-closed) | Kiểm `slots` của `openmaic.yml`; xem sự kiện `moderation_failed_closed` |
| Entry mới không được phát hành | Hội đồng LLM trượt hoặc thiếu route `tutor-review-*` | Xem `lib/subjects/<id>/reviews/…json`; sửa entry theo `issues` |
| Xuất ZIP lớp học thất bại/rất nặng | Nhiều media, ZIP dựng trong RAM | Giảm số asset/bài; kiểm kích thước manifest; xem NFR-P7 |
| MP4 export chỉ thấy khung tĩnh của walkthrough | Hạn chế đã biết (widget bị đóng băng ~250 ms) | ARCHITECTURE §12 (các hướng giảm thiểu, backlog); không phải lỗi vận hành |

## 8. Chi phí và công suất

- **Chi phí LLM cho frame: 0** (frame do hàm thuần sinh). Chi phí LLM còn lại ở slide/quiz/Q&A như OpenMAIC hiện có, **cộng các vai trò LLM của ADR 0014**: lọc mọi lượt chat vào/ra, hội đồng 2–3 model mỗi khi `entryRev` đổi, học sinh mô phỏng ở cổng G1/G2, `tutor-analyst` định kỳ. Đo theo stage trong log (NFR-M4).

## 9. Kiểm tra sau triển khai (smoke)

1. `ACCESS_CODE` đã đặt; `/api/*` không cookie → 401.
2. `OPENMAIC_ALLOW_CODE_WIDGET` **không** được đặt `true`. Tạo khoá lập trình → không có widget `code`; mở lớp học mẫu có scene `code` → hiện khung thông báo, không có editor.
3. `/workbench` mở được; `/api/agent/runtime` báo bật.
4. "Dạy em Binary Search" trên workbench:
   - scene walkthrough phát được; kịch bản đúng beat;
   - đổi preset; tab C++/Python;
   - hỏi thầy ở frame k → thầy thấy đúng frame và gợi ý mức 1.
5. Xuất HTML/ZIP lớp học có walkthrough (Toán: walkthrough tương tác); import lại vào máy sạch.
6. `OPENMAIC_TUTOR_MODERATION=true` (nếu triển khai cho học sinh): gửi một tin vi phạm vào chat → nhận câu an toàn, agent không chạy; bỏ route `tutor-moderation` → chat vẫn bị chặn (fail-closed). Nhớ: cờ tắt = chat **không lọc**.
7. `OPENMAIC_REQUIRE_REVIEW=true`: workbench chỉ liệt kê entry có file review; trong container chạy `ls lib/subjects/*/reviews` (thư mục standalone) phải thấy các file review, nếu không thì **không walkthrough nào được lộ**.
8. `OPENMAIC_DISABLE_WIDGET_PROVIDERS` là boolean: đặt `true` rồi hỏi agent tạo walkthrough → tool không còn; bỏ đặt → trở lại.

## 10. Phát hành, rollback và kill-switch

**Phát hành theo lô:** bật từng lớp, mỗi lớp qua smoke §9 trước khi bật lớp kế:
1. 1a–1b: walkthrough, chặn `code`.
2. 1c: Q&A, dự đoán.
3. G1 đạt.
4. 1d: nhập input.
5. Toán: walkthrough tương tác (ADR 0015).

| Kill-switch | Tắt cái gì | Tác dụng khi tắt | Trạng thái |
| --- | --- | --- | --- |
| `OPENMAIC_DISABLE_WIDGET_PROVIDERS=true` | Tool `generate_walkthrough` | Agent chỉ còn `generate_scene` (widget LLM); scene đã lưu **vẫn phát** (HTML tự chứa) | Đề xuất |
| Bỏ đặt `OPENMAIC_TUTOR_MODERATION` | Bộ lọc chat | **Chat không còn được lọc** (không phải fail-closed): chỉ tắt khi sự cố bộ lọc, và thông báo cho người phụ trách | Đã có |
| Bỏ đặt `OPENMAIC_REQUIRE_REVIEW` | Cổng phát hành | Mọi entry trong `SUBJECT_PACKS` hiện ra, kể cả entry chưa được duyệt. Cờ và file review chỉ được đọc **một lần khi nạp `lib/widgets`**: đổi cờ hoặc thêm file review thì phải khởi động lại server | Đã có |
| Tắt cờ `NEXT_PUBLIC_*` liên quan hiện có | Tính năng UI của OpenMAIC gốc | Như hiện có | Đã có |

**Rollback:**

| Tình huống | Cách quay lại |
| --- | --- |
| Lỗi ở provider/tool sau khi phát hành | Bật `OPENMAIC_DISABLE_WIDGET_PROVIDERS`; redeploy bản trước (không có migration DB nên không cần khôi phục dữ liệu) |
| Runtime walkthrough lỗi | Scene cũ giữ runtime cũ trong HTML (`runtimeVersion`), nên chỉ scene mới bị ảnh hưởng. Hoàn nguyên module sinh sẵn, sinh lại scene lỗi |
| Đổi nhầm `id` hoặc quên tăng `entryRev` | Khôi phục; test snapshot `id`/`framesHash` sẽ chặn ở PR |

Vì tính năng **không đổi schema DB và không đổi package publish**, rollback là rollback mã + cấu hình; dữ liệu lớp học đã lưu không cần di trú.

**Nâng cấp:**
- Runtime: tăng `runtimeVersion`, sinh lại module, chạy test độ mới.
- `InputSpec`/message: theo quy tắc phiên bản ở [INTERFACES §7](INTERFACES.md).
