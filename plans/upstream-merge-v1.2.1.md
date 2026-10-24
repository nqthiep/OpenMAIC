# Kế hoạch merge upstream v1.2.1 vào `it-math` (qua nhánh `it-math-merge-1.2.1`)

Trạng thái: **kế hoạch, chưa thực hiện bước nào**. Chủ dự án chọn hướng A (nhận đủ, theo giai đoạn) ngày 2026-10-24.
Yêu cầu của chủ dự án: nhận đủ tính năng mới; ứng dụng hiện tại vẫn chạy tốt; các tính năng mới của v1.2.1 chạy tốt trên ứng dụng này.

Nhãn: **[Đã đo]** có lệnh chạy; **[Suy luận]** từ code đã đọc; **[Chưa kiểm]** chưa thử.

## 1. Vì sao không merge thẳng

- **[Đã đo]** Cây code `it-math` là cây của `4bbcaaf` (rẽ từ upstream `ebf665f3`, 2026-09-11). Commit `31ef8eae` (`-s ours`, 2026-10-12) thay cả cây nhưng giữ lịch sử, nên git coi upstream tới `8c3a90d5` (2026-10-10) là đã merge, còn cây thì chưa có.
- **[Đã đo]** `git merge v1.2.1` thẳng: base sai (`8c3a90d5`), 233 file xung đột, 103 file là thư mục server-first mà ta không có (`lib/server/generation`, `lib/server/model-config`, `lib/model-settings`) quay lại dưới dạng modify/delete.
- **[Đã đo]** Với base đúng `ebf665f3`: 161 file xung đột (135 nội dung, 26 modify/delete). Khoảng cách thật là 183 commit upstream, không phải 40.
- **[Đã đo]** Tag `v1.1.2`–`v1.1.4` nằm trên nhánh bảo trì 1.1.x, **không** là tổ tiên của v1.2.1: bỏ qua.

## 2. Cơ chế merge (đã chạy thử trong worktree tạm, đã xoá)

Git tự chọn base sai cho mọi mốc không sau `8c3a90d5`, nên mỗi giai đoạn tới `rc.2` phải chỉ định base. Công thức đã chạy thử với giai đoạn v1.1.1 (51 file xung đột, 50 file có dấu `<<<<<<<`, commit có đúng 2 cha):

```bash
# trong worktree của nhánh it-math-merge-1.2.1
BASE=<mốc trước>; TAG=<mốc đích>
OUT=$(git merge-tree --write-tree --name-only --merge-base=$BASE HEAD $TAG)   # exit 1 nếu có xung đột, vẫn in cây
git read-tree -u --reset "$(echo "$OUT" | head -1)"                            # worktree = kết quả, có dấu xung đột
echo "$OUT" | awk 'NR>1 && NF==0{exit} NR>1'                                   # danh sách file xung đột
# ... giải xung đột, git add -A ...
C=$(git commit-tree "$(git write-tree)" -p HEAD -p $TAG -m "merge: upstream $TAG (stage N)")
git reset --soft "$C"
```

- **[Đã đo]** Sau commit hai cha của S1, `git merge-base HEAD v1.2.1` vẫn trả `8c3a90d5` (sai), và `git merge-base HEAD v1.2.0-rc.1` trả chính `rc.1` (đã là tổ tiên: `git merge rc.1` sẽ báo "Already up to date"). Vì vậy mọi giai đoạn tới `rc.2` phải chỉ định base.
- **[Suy luận, chưa chạy thử]** Sau khi commit merge của S6 (`v1.2.0-rc.2`, hậu duệ của `8c3a90d5`) nằm trong lịch sử nhánh, base cho `v1.2.0` và `v1.2.1` sẽ là chính `rc.2`, nên S7 và S8 dùng được `git merge` thường. Kiểm bằng `git merge-base HEAD v1.2.0` trước khi merge; nếu khác `rc.2` thì dùng `--merge-base`.
- Mỗi giai đoạn gồm 1 commit merge (chỉ giải xung đột) rồi các commit nối ghép (glue) riêng. Nhờ vậy diff của merge đọc được và việc nối ghép nhìn thấy được.

## 3. Điều kiện trước khi bắt đầu (P0)

1. **Chốt thay đổi dở dang trên `it-math`** (phiên khác): `components/settings/{omniroute-panel,server-credential-card}.tsx`, 12 file locale, `tests/settings/omniroute-panel.test.ts`, `tests/security/*redaction*.test.ts`, `openmaic.local.yml`, `.omo/`. Nhánh merge cắt từ HEAD `ae128e1b` nên không mang theo chúng. Chủ dự án quyết commit, stash hay bỏ.
2. **Đóng băng hoặc đồng bộ `it-math`**: thay đổi mới trên `it-math` trong lúc merge phải được merge vào nhánh merge ở mỗi biên giai đoạn (`git merge it-math`, dễ vì là tổ tiên). Tránh sửa các vùng xung đột (settings, generation, persistence, identity) trên `it-math` cho tới khi xong.
3. **Mốc đo gốc (baseline) trên `it-math`**, ghi vào HANDOFF: `npx tsc --noEmit`, `pnpm test` (số file/test pass, danh sách fail có sẵn), `pnpm lint`, `pnpm check:i18n-keys`, `pnpm build`. **[Đã đo 2026-10-24 trên `it-math-merge-1.2.1` @ `a8a1a13b`]** (nhật ký lệnh trong HANDOFF):
   - `pnpm install --frozen-lockfile`: ok. `pnpm lint`: 0 lỗi, 18 cảnh báo. `pnpm check:i18n-keys`: pass. `pnpm build`: thành công.
   - `npx tsc --noEmit`: 3 lỗi, đều ở hai file test redaction (thiếu `redactSecretsForLog` trong `@/lib/pdf/pdf-providers`, thiếu module `@/lib/server/provider-fetch` và `@/lib/server/audio-provider-fetch`).
   - `pnpm test`: 6 file fail, 68 test fail, 9141 pass, 29 skip. Danh sách fail có sẵn (so sánh sau mỗi giai đoạn): `tests/runtime/chat-storage.test.ts` 40, `tests/security/provider-log-redaction.test.ts` 11, `tests/security/log-redaction.test.ts` 10, `tests/quiz/runtime.test.ts` 4, `tests/media/server-backed-media-orchestrator.test.ts` 2, `tests/media/media-placeholder-lease-guard.test.ts` 1. Chạy riêng bốn file không phải redaction vẫn fail (nhiều lỗi `Test timed out in 5000ms`); nguyên nhân [chưa kiểm].
4. **Bản sao dữ liệu để thử migration**: sao lưu DB VPS (`~/backups/*.sql.gz`, thói quen hiện có) rồi nạp vào Postgres cục bộ. Dữ liệu người dùng thật: cần chủ dự án đồng ý; nếu không, dùng dữ liệu giả cùng schema.
5. **Quyết định D1–D4 ở mục 7.**

## 4. Các giai đoạn

Mọi mốc đều tuyến tính trên `main` của upstream, nên có thể dừng ở bất kỳ commit nào. Số "trùng" là số file upstream đổi trong giai đoạn mà `it-math` cũng đã đổi kể từ điểm rẽ **[Đã đo]**.

| # | Merge tới | Base | Commit | File trùng | Nội dung chính | Nối ghép (glue) bắt buộc |
|---|-----------|------|--------|------------|----------------|--------------------------|
| S1 | `v1.1.1` | `ebf665f3` | 92 | 100 | Toàn bộ 1.1.0 + 1.1.1 (Pi workbench, sửa lỗi). 51 xung đột đo được | Thấp. Chủ yếu docs, i18n, tests |
| S2 | `a686481e` (owner identity seam) | `v1.1.1` | 5 | 71 (một commit) | `lib/server/identity/*`, `configureOwnerAuthentication`, cookie ẩn danh, `POST /api/identity/claim` | Đăng ký tài khoản của ta làm một `OwnerAuthMethod` (mục 5.1) |
| S3 | `fa47efe1` (persistence chỉ qua server) | S2 | 11 | 35 | Bỏ `NEXT_PUBLIC_PERSISTENCE`, bỏ `PERSISTENCE_DEV_TOKEN`/`x-learner-key`, nhập dữ liệu trình duyệt một lần | Bỏ phụ thuộc vào cờ trong `AccountControl`; compose và `.env` VPS (mục 5.2) |
| S4 | `5312c2b4` (openmaic.yml, slot, model-config) | S3 | 5 | 101 | `lib/server/model-config/*`, `app/api/model-config`, UI cài đặt theo slot | Điểm then chốt: nối `provider-store` và OmniRoute vào lớp triển khai (mục 5.3) |
| S5 | `636fab0d` (rc.1, server-first) | S4 | 4 | 112 (một commit) | Generation runs trên server, `/api/generation-runs`, `/api/materials`, `/api/agents`, migration schema, render-service | Trang tạo khoá học, đo dùng và hạn mức, phân quyền hội viên (mục 5.4) |
| S6 | `v1.2.0-rc.2` | `v1.2.0-rc.1` | 36 | 59 | Xuất HTML độc lập và PPTX, `model-authorization` (#1879), gắn render job với chủ sở hữu (#1884) | `readRenderJobOwner` trong `viewer.ts`; `render-service` |
| S7 | `v1.2.0` | tự động | 15 | 21 | Sửa lỗi sau rc.2 | Thấp |
| S8 | `v1.2.1` | tự động | 15 | 41 | `webFetch`, Kimi/DeepSeek/Firecrawl, chỉ còn chat Pi, `cue_user`, i18n theo cookie, bỏ model cũ | Mục 6 |

Biên S2 → S5 chọn theo bốn commit lớn nhất của upstream (594, 443, 260, 201 file) để mỗi giai đoạn có một chủ đề. Muốn chia nhỏ hơn thì cắt thêm ở bất kỳ commit nào trong `git log v1.1.1..v1.2.0-rc.1`.

### Cổng nghiệm thu mỗi giai đoạn (không qua thì không sang giai đoạn sau)

```bash
npx tsc --noEmit            # không có lỗi mới so với mốc đo gốc
pnpm lint
pnpm check:i18n-keys        # 12 locale cùng bộ khoá
pnpm test                   # không có test mới fail so với mốc đo gốc
pnpm build                  # từ S3 trở đi, build với và không có biến môi trường cũ
```

Thêm từ S2: chạy ứng dụng thật (Postgres bằng Docker, `pnpm dev`) và đi đúng bộ hành trình ở mục 8. Ghi bằng chứng vào HANDOFF cho từng giai đoạn: lệnh đã chạy, kết quả, thứ chưa kiểm.

## 5. Điểm nối cần thiết kế (cả bốn là việc thiết kế, không chỉ gỡ xung đột)

### 5.1 Danh tính: tài khoản của ta thành `OwnerAuthMethod` (S2)

**[Đã đọc]** `lib/server/identity/{types,registry,resolve}.ts` ở v1.2.1: upstream có sẵn điểm gắn cho "host auth methods". Chỗ gắn là `configureOwnerAuthentication({ methods, anonymousFallback })` trong `instrumentation.ts`; một method đọc cookie phiên và trả `OwnerPrincipal { ownerId, kind: 'user', roles, assurance: 'verified' }`. Thư mục `lib/server/identity/host/` dành cho code của host; có test biên giới cấm đọc header danh tính ở nơi khác.

Hướng đi **[Suy luận]**:
- Viết `lib/server/identity/host/account-session.ts`: dùng `resolveRequestAccount` của ta, `ownerId = accountOwnerId(accountId)` (giữ nguyên định dạng id đang nằm trong các cột owner của DB), role của ta ánh xạ sang `roles` (`admin` có sẵn trong `OWNER_ROLES`).
- Giữ cookie ẩn danh (`anonymousFallback: true`); id ẩn danh `anon:<uuid>` của ta cần tương thích với của upstream: kiểm bằng test trước khi gỡ `lib/server/agent-runtime/owner.ts`.
- `lib/server/authz/viewer.ts` (`resolveViewer`) tiếp tục là lớp vai trò và hội viên của ta, nhưng lấy chủ sở hữu từ seam của upstream thay vì tự đọc cookie. Thay `lib/server/agent-runtime/{owner,with-owner}.ts` và `lib/persistence/server-auth.ts` (upstream đã xoá, ta đã sửa) bằng `lib/server/identity/with-owner.ts`.
- `lib/server/accounts/claim.ts` đối chiếu với `POST /api/identity/claim` của upstream: chọn một, xoá cái kia (xem `clean-up-dead-approach-fully`).
- Rủi ro: bốn thứ phụ thuộc vào danh tính cùng lúc (phiên, đăng xuất thiết bị khác, cổng OmniRoute gắn với `account_sessions`, `proxy`/`middleware`). Tests `tests/accounts/*` và `tests/security/*` là lưới an toàn; chạy lại trọn bộ sau S2.

### 5.2 Persistence luôn bật (S3)

**[Đã đọc]** rc.1 bỏ `NEXT_PUBLIC_PERSISTENCE`, `PERSISTENCE_DEV_TOKEN`, `NEXT_PUBLIC_PERSISTENCE_TOKEN`; bắt buộc `DATABASE_URL`; `docker compose up` có Postgres không cần profile; khoá học thuộc `stage_meta` / `documentOwnership`; phiên runtime cũ không chuyển được.
- Ta đang có `NEXT_PUBLIC_PERSISTENCE=1` trong `~/OpenMAIC/.env` trên VPS và profile `server-persistence` trong compose. Cả hai thành thừa; `AccountControl` hiện thoát sớm khi cờ tắt (`components/account/account-control.tsx`): bỏ nhánh đó.
- Schema upstream có bảng `openmaic_schema_migrations` và lần khởi động đầu chạy migration. **[Chưa kiểm]** có đụng 45 bảng hiện có của ta không. Thử bằng bản sao DB (P0.4) trước khi nghĩ tới VPS.
- `OPENMAIC_SECRET_KEY` hoặc `data/instance-secret.key`: khoá mã hoá key lưu trong cài đặt model; phải nằm trong sao lưu cùng DB.
- Phiên runtime cũ mất: chấp nhận, báo trước.

### 5.3 Cấu hình model: cầu nối giữa `provider-store`/OmniRoute và lớp triển khai của upstream (S4)

Hiện trạng của ta **[Đã đọc]**: cấu hình model nằm trong DB (`lib/server/provider-store`, bảng `model_routing`), sửa khi chạy qua popup Cài đặt và panel OmniRoute (`lib/server/omniroute/roles.ts` ánh xạ bốn vai trò `generate/chat/grade/utility` sang các stage như `scene-content`, `pbl-chat`).

Upstream 1.2 **[Đã đọc]**: lớp triển khai nạp **một lần mỗi tiến trình** từ `openmaic.yml`, hoặc dịch từ biến môi trường cũ qua `getServerProviderConfig()` (`lib/server/model-config/deployment-layer.ts`). `MODEL_ROUTES` không được dịch. Slot: `llm` (kèm `course.*`, `classroom`, `agent`), `tts`, `asr`, `image`, `video`, `webSearch`, `webFetch` (v1.2.1), `document`.

Ba hướng, theo thứ tự khuyến nghị:
- **(a) Cầu nối** (khuyến nghị, **[Chưa kiểm]**): giữ `provider-store` làm nguồn; viết bộ chuyển `provider-store snapshot + model_routing → ModelConfigLayer` cắm vào `loadDeploymentLayer`, kèm hàm xoá cache khi admin lưu (để thay đổi có hiệu lực không cần khởi động lại). Vai trò OmniRoute ánh xạ sang slot. File upstream chỉ sửa một hook nhỏ. **Cần một spike ngắn ở đầu S4** để xác nhận `ModelConfigLayer` nhận được dữ liệu dựng bằng code và cache có thể làm mới.
- (b) Nhận `openmaic.yml`: sinh `openmaic.yml` lúc khởi động từ `omniroute-init` và `.env`; bỏ `provider-store`. Đơn giản nhưng admin không đổi được khi chạy, mất panel OmniRoute đang có.
- (c) Giữ `provider-store` song song, chỉ dùng slot cho tính năng mới: hai nguồn sự thật, không nên.

**Kết quả S4 (2026-10-24):** đã chọn và chạy hướng (a). `lib/server/model-config/provider-store-layer.ts` dịch snapshot + route thành lớp triển khai; `runtime.ts` giữ cache theo từng snapshot nên lưu của admin có hiệu lực không cần khởi động lại (đã thấy: lưu route `scene-content` xong, `GET /api/model-config` hiện `course.content` là slot khoá nguồn `deployment`). `quiz-grade` và `pbl-v2-runtime:evaluate` dùng chung slot `classroom` qua lớp ghi đè riêng từng stage (thêm slot `classroom.grade` làm hỏng hợp đồng `STATION_STAGE_KEYS` của upstream nên đã bỏ). Khi kho đã có cài đặt, `policy.allowWorkspaceProviders` là `false` (quyết định D3); học viên nhận 403 ở `PUT /api/model-config`. Bài học: không cần sửa slot hay hợp đồng nào của upstream.

Việc phải làm dù chọn hướng nào: ánh xạ `ROLE_STAGES` sang slot; `model-authorization` (#1879, S6) phải cho phép đúng các model ta đã cấp qua OmniRoute; `lib/server/authz/provider-keys.ts` (chỉ hội viên được dùng khoá trả phí) vẫn đứng trước.

### 5.4 Sinh khoá học trên server (S5)

Upstream xoá `/api/generate/{scene-outlines-stream,agent-profiles,scene-content,scene-actions}`, `/api/extract-document`, `/api/web-search`, `GET/POST /api/classroom`; thay bằng `/api/generation-runs`. Code của ta còn gọi các route này **[Đã đo]**: `app/generation-preview/page.tsx`, `lib/hooks/use-scene-generator.ts`, `lib/classroom/load-classroom.ts` (`/api/classroom?id=`), `lib/server/classroom-generation.ts`, `lib/server/classroom-job-*`, `lib/server/scene-generation.ts`, `eval/whiteboard-layout/runner.ts`.
- Lấy phiên bản upstream cho các file này, rồi áp lại phần riêng của ta (nhãn hiệu KHAITAM, văn bản, kiểm tra hội viên) bằng điểm gắn mỏng.
- **Đo dùng và hạn mức**: ta ghi lượng token theo tài khoản qua `lib/server/authz/spend-context.ts` (`enterSpendOwner`) trong ngữ cảnh yêu cầu. Generation run chạy nền, ngoài ngữ cảnh yêu cầu, nên **[Suy luận]** nếu không truyền chủ sở hữu vào worker thì lượng dùng bị ghi sai hoặc không ghi. Việc cần làm: kiểm tra hội viên và hạn mức lúc `POST /api/generation-runs`, và gắn `owner` cho mọi lệnh gọi model trong run.
- `data/classrooms` được nhập một lần vào DB; `lib/server/classroom-storage.ts`, `learning/course-exists.ts`, `learning/courses.ts` (`listAllCourses` đọc cả file lẫn DB) cần đọc theo nguồn mới.
- Khoá học chỉ đọc khi đang sinh (`409 COURSE_GENERATING`): kiểm các luồng của ta (gắn vào lớp, chia sẻ, xem trước) có ghi vào khoá học đang sinh không.
- `render-service`: ta đã sửa (`render-service/src/*`); upstream đổi nhiều ở rc.1/rc.2 và yêu cầu nâng cấp cùng lúc.
**Kết quả S5 (2026-10-24):** đã áp theo hướng trên. Cổng chi tiêu (`requireSpender`) đặt ở `POST /api/generation-runs`, `confirm-outline`, `retry`, `POST /api/materials`, `POST /api/generate-classroom`; lượng dùng của run ghi theo chủ sở hữu run bằng `runWithSpendOwner` (worker phục vụ nhiều chủ trong một vòng lặp, nên không dùng `enterWith`); lỗi của run lưu câu cố định khi bật tài khoản. Đã chạy thật trên Postgres: khách bị 401, học viên tạo được run, run dừng ở bước dàn ý với câu cố định (không có model thật), chủ khác đọc run nhận 404, trang xem trước và trang chủ hiển thị đúng. Chưa thấy: một run chạy hết với model thật (ghi lượng dùng theo tài khoản, xếp khoá học vào thư mục, mở lớp học), `render-service`, nhập `data/classrooms` một lần.

## 6. Tính năng v1.2.1 chạy trên ứng dụng này: điều kiện và cách kiểm

| Tính năng v1.2.1 | Điều kiện để chạy trên ứng dụng của ta | Kiểm |
|---|---|---|
| Slot `webFetch` (builtin, Kimi, Firecrawl, DeepSeek); `fetch_url` của agent | Cầu nối 5.3 phải biết slot `webFetch` (mặc định `builtin`); UI Cài đặt → Model Services → Web Fetch hiện trong popup của ta | Test slot trong `tests/server/model-config/*`; chạy thật: agent gọi `fetch_url` ra URL công khai; URL nội bộ bị chặn |
| Tìm web Kimi / DeepSeek / Firecrawl (mặc định tắt, cần bật) | Biến `WEB_SEARCH_*_ENABLED` hoặc gán slot; khoá qua `provider-store` hoặc env; OmniRoute không phục vụ tìm web | Gọi tìm kiếm thật với khoá thử; xác nhận mặc định cũ không đổi |
| Chat lớp học chỉ còn Pi; bỏ `POST /api/chat` | Cần model Classroom có gọi công cụ: vai trò `chat` của OmniRoute phải khai `tools: true` (`contract.ts` đã có trường này); bỏ `NEXT_PUBLIC_PI_CHAT_ENABLED` khỏi `Dockerfile`, `docker-compose.yml`, `.env.example` (production chỉ chấp nhận bỏ trống, `true` hoặc `1`); sửa `components/chat/use-chat-sessions.ts` và `eval/whiteboard-layout/runner.ts` đang gọi `/api/chat` | Chat một lớp học thật với model OmniRoute; model không có tools bị từ chối rõ ràng |
| `cue_user` gợi ý 2–4 câu trả lời | Chỉ cần chat Pi chạy; kiểm giao diện roundtable theo thương hiệu và 12 ngôn ngữ | Bấm một gợi ý gửi như tin nhắn thường |
| i18n: máy chủ chọn ngôn ngữ theo cookie rồi `Accept-Language`, `<html lang>` khớp; `/` và `/_not-found` thành động | **Quyết định D1** (ngôn ngữ mặc định `vi-VN` của ta đối với người xem chưa có cookie); đoạn script chủ đề tối (`lib/theme-init-script.ts`) và SEO (`app/layout.tsx` đang xung đột) phải còn nguyên | Trình duyệt `Accept-Language: en` và không cookie; kiểm `<html lang>`, chủ đề tối mặc định, không chớp sáng |
| Chat lưu được trên HTTP không có Web Locks | Không cần nối ghép | Mở bằng IP LAN qua HTTP |
| Sửa bong bóng gợi ý roundtable, `rotate` của shape | Không cần nối ghép | Test có sẵn của upstream |
| Bỏ model cũ khỏi catalog | Model đã lưu giữ nguyên; kiểm danh sách model trong panel OmniRoute và preset | `pnpm test tests/config` |

Cũng cần kiểm các tính năng 1.2.0 đi kèm (vì nhận đủ): chạy sinh khoá học không đóng theo tab, nhập tài liệu khi đính kèm, tác tử tuỳ chỉnh lưu trên server, xuất HTML độc lập và PPTX, lược đồ DB có phiên bản.

## 7. Quyết định cần chủ dự án (mặc định đề xuất)

- **D1 Ngôn ngữ mặc định.** Upstream 1.2.1 chọn ngôn ngữ theo cookie rồi `Accept-Language`. Ta đang cố định `vi-VN`. Đề xuất: giữ `vi-VN` khi không có cookie, dùng `Accept-Language` chỉ khi ngôn ngữ đó nằm trong 12 locale hỗ trợ. [Chưa kiểm] chỗ hook trong `app/layout.tsx`.
- **D2 Cấu hình model.** Đề xuất hướng (a) cầu nối ở 5.3, sau spike.
- **D3 Giao diện cài đặt model.** Upstream cho người dùng đổi slot và thêm khoá riêng (`allowUserKeys`). Đề xuất: người dùng thường không đổi model và không thêm khoá (`allowUserKeys: false`), chỉ quản trị viên cấu hình qua popup hiện có.
- **D4 Danh tính.** Đề xuất 5.1 (tài khoản là host auth method, cookie ẩn danh vẫn là dự phòng cho khách).
- **D5 Có đẩy nhánh `it-math-merge-1.2.1` lên `origin` sau mỗi giai đoạn để sao lưu?** Quy tắc dự án chỉ cho đẩy khi được yêu cầu. Đề xuất: có, chỉ nhánh này, không bao giờ `it-math` cho tới khi xong.

### Đã quyết (chủ dự án, 2026-10-24)

D1 đồng ý (giữ `vi-VN` khi không có cookie). D2 đồng ý (cầu nối (a), sau spike). D3 đồng ý (chỉ quản trị viên cấu hình model và khoá). D4 đồng ý (tài khoản là host auth method, cookie ẩn danh là dự phòng cho khách). D5 có: đẩy `it-math-merge-1.2.1` lên `origin` sau mỗi giai đoạn, chỉ nhánh này, không đẩy `it-math`. P0.1 xong: thay đổi dở đã commit (`70c600c4`, `efc8648b`); `openmaic.local.yml` và `.omo/` để ngoài.

## 8. Bộ hành trình để chạy thật (từ S2, và toàn bộ ở cuối)

Chạy trong trình duyệt và bằng `curl`; ghi kết quả vào HANDOFF.
1. Khách: trang chủ (chủ đề tối, `<html lang>`), `/catalog`, đăng ký, đăng nhập, đăng xuất về `/`.
2. Đăng xuất thiết bị khác (hai cookie jar), kiểm tra tab còn lại bật `SESSION_ENDED`.
3. Hội viên: xin tham gia, gia hạn, hết hạn; hạn mức và lượng dùng sau một lần sinh khoá học.
4. Tạo khoá học (sinh trên server, đóng tab giữa chừng, mở lại thấy tiếp tục); gắn tài liệu; xem lớp học; chat; câu hỏi gợi ý.
5. Học viên: lớp, mã tham gia, tiến độ, thử thách, hỗ trợ, cộng đồng.
6. Quản trị: bảng quản trị, OmniRoute (mở, vai trò, kiểm tra kết nối), cài đặt slot, thêm provider.
7. Xuất HTML độc lập và PPTX một khoá học; `render-service`.
8. Bảo mật: `tests/security/*` (che log, SEC-01 khoá học nháp chỉ chủ sở hữu thấy), phân quyền theo vai trò, URL nội bộ bị chặn trong `fetch_url`.
9. Docker: `docker compose up` từ sạch; `omniroute-init`; health `GET /api/health`.

## 9. Triển khai và hoàn tác

1. Chạy staging trước: compose dự án riêng (cổng và volume riêng) với bản sao DB; không chạy migration trên DB thật khi chưa qua bước này.
2. VPS **[Chưa kiểm]**: RAM 3,7 GiB (theo HANDOFF) phải chứa Postgres, app, OmniRoute, cổng OmniRoute, và `render-service` (Chromium). Đo `docker stats` trên staging.
3. Trước khi triển khai: sao lưu DB (thói quen `~/backups/pre-deploy-*.sql.gz`, kiểm `gzip -t`); gỡ `NEXT_PUBLIC_PERSISTENCE` khỏi `.env`; đặt và sao lưu `OPENMAIC_SECRET_KEY`.
4. **Hoàn tác**: migration schema một chiều. Quay lại bằng cách phục hồi bản sao lưu cùng image `it-math` cũ (ghi sẵn tag), hoặc dùng SQL chép ngược quyền sở hữu mà CHANGELOG 1.2.0 đưa ra. Ghi tag image trước khi build.
5. Chỉ fast-forward `it-math` khi mọi cổng qua và chủ dự án xác nhận.

## 10. Quy tắc giải xung đột

- File thuộc upstream (lõi sinh khoá học, model-config, identity, storage, renderer, packages): lấy upstream, áp lại phần riêng của ta bằng điểm gắn mỏng (theo memory `upstream-continuous-merge`). Mỗi file upstream mà ta vẫn sửa được ghi vào danh sách điểm vá (`docs/upstream-patch-points.md`, tạo mới).
- Module của ta (`lib/server/{accounts,authz,learning,omniroute,provider-store}`, `lib/{admin,community,home,learning,legal,membership,capabilities}`, các route `app/api/{admin,auth,catalog,classes,community,courses,membership,progress,support}`): giữ nguyên, chỉ sửa chỗ giao với upstream.
- File dùng chung (i18n 12 locale, `app/layout.tsx`, `docker-compose.yml`, `.env.example`, `package.json`, `next.config.ts`): gộp từng dòng; `pnpm check:i18n-keys` sau mỗi lần.
- Khi một hướng cũ không còn dùng (route bị xoá, cờ bị bỏ, `lib/orchestration/director-*`): xoá hẳn code, tài liệu sống và test của nó, không để banner thay cho xoá (memory `clean-up-dead-approach-fully`).
- Dọn nhánh: sau khi xong, xoá worktree và nhánh phụ.

## 11. Rủi ro chính

| # | Rủi ro | Mức | Giảm thiểu |
|---|--------|-----|-----------|
| R1 | Cầu nối model (5.3) không khả thi hoặc làm mất cấu hình admin khi chạy | Cao | Spike đầu S4; nếu không được thì hướng (b) |
| R2 | Đo dùng/hạn mức sai với generation run chạy nền (5.4) | Cao | Cổng ở `POST /api/generation-runs`; test số dư sau một lần sinh |
| R3 | Migration đụng bảng của ta hoặc mất dữ liệu | Cao | Thử trên bản sao DB; sao lưu; hoàn tác ghi sẵn |
| R4 | Danh tính: phiên, đăng xuất thiết bị khác, cổng OmniRoute hỏng sau S2 | Cao | `tests/accounts`, `tests/security`; chạy thật hai cookie jar |
| R5 | `it-math` có commit mới trong lúc merge, vùng xung đột phình ra | Trung bình | Mục 3.2 |
| R6 | RAM VPS không đủ cho cả bộ | Trung bình | Đo trên staging |
| R7 | Mặc định ngôn ngữ đổi bất ngờ với khách (D1) | Trung bình | Quyết định D1, test |
| R8 | Tính năng v1.2.1 hoạt động theo tài liệu upstream nhưng không có đường cấu hình trong UI của ta | Trung bình | Bảng mục 6; mỗi dòng có một lần chạy thật |

Phạm vi chưa ước lượng thời gian: tôi không có số đo công sức; kích cỡ ở mục 4 là số file và commit, không phải ngày công.

## 12. Bảng task để thực hiện (chép sang HANDOFF khi bắt đầu)

| # | Task | Phụ thuộc |
|---|------|-----------|
| 0 | P0: chốt thay đổi dở, mốc đo gốc, bản sao DB, quyết định D1–D5 | — |
| 1 | Tạo `it-math-merge-1.2.1` và worktree | 0 |
| 2 | S1 merge `v1.1.1`, cổng | 1 |
| 3 | S2 merge `a686481e` + nối ghép danh tính 5.1, cổng, hành trình 1–2 | 2 |
| 4 | S3 merge `fa47efe1` + persistence 5.2, thử migration trên bản sao DB | 3 |
| 5 | S4 spike cầu nối, merge `5312c2b4` + 5.3 | 4 |
| 6 | S5 merge `636fab0d` + 5.4, hành trình 3–4 | 5 |
| 7 | S6 merge `v1.2.0-rc.2` | 6 |
| 8 | S7 merge `v1.2.0`, S8 merge `v1.2.1` | 7 |
| 9 | Bảng mục 6: chạy thật từng tính năng v1.2.1 | 8 |
| 10 | Staging, bộ hành trình đầy đủ, đo RAM | 9 |
| 11 | Triển khai VPS và fast-forward `it-math` (chủ dự án duyệt) | 10 |
