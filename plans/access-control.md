# Kế hoạch: vai trò, membership và chia sẻ khoá học

Trạng thái: P0 và P1 đã được implement (xem mục 8). P2 trở đi chờ quyết định ở mục 6.

## 1. Mục tiêu

Ba vai trò trên một ứng dụng học tập có thu phí thành viên:

- **admin**: toàn quyền, cấp và thu hồi vai trò `operator` và `admin`.
- **operator**: vận hành: usage, membership và quota, khoá hoặc mở tài khoản (trừ admin), đánh dấu bài preview, duyệt chia sẻ, bật tắt provider. Xem được toàn bộ khoá học, mọi truy cập đều có audit.
- **learner**: học viên. Membership có các trạng thái: chưa có, đang hoạt động, hết hạn, bị khoá. Tạo khoá bằng AI trong quota. Khoá mặc định riêng tư. Chia sẻ phải qua duyệt.
- **khách** (chưa đăng nhập): xem danh mục và bài preview do operator đánh dấu. Không vào được lớp học, không tạo nội dung.

## 2. Hiện trạng (đã kiểm tra trong code)

| Phát hiện | Vị trí |
|---|---|
| Route tiêu tốn model (đã resolve model với key của operator) gồm `chat`, `chat/pi`, `generate/*` (8 route), `generate-classroom`, `pbl/v2/*` (4 route), `quiz-grade`, `transcription`, `web-search`, `parse-pdf`, `extract-document`, và các route `agent/sessions` tạo phiên. Hầu hết không có guard. | `app/api/**/route.ts` |
| Lớp học lưu thành file JSON, không có owner. | `lib/server/classroom-storage.ts` (`PersistedClassroomData`) |
| `GET /api/classroom?id=` không kiểm tra quyền. Trang lớp học đọc local trước rồi mới gọi server. | `app/api/classroom/route.ts`, `lib/classroom/load-classroom.ts` |
| `GET /api/classroom-media/...` trả file không kiểm tra quyền và có `Cache-Control: public`. | `app/api/classroom-media/[classroomId]/[...path]/route.ts` |
| `GET /api/generate-classroom/[jobId]` trả `result` (có id lớp) cho bất kỳ ai biết jobId. | `app/api/generate-classroom/[jobId]/route.ts` |
| `POST /api/classroom` không có guard. | `app/api/classroom/route.ts` |
| Usage ghi vào `data/usage/YYYY-MM.jsonl`, không có owner. | `lib/server/usage-storage.ts` |
| `stage_meta.is_public` đặt được khi publish, nhưng không route đọc nội dung nào cho người không phải owner dùng cờ này. | `lib/server/stage-access.ts` |
| Schema tạo bằng `CREATE TABLE IF NOT EXISTS`, không có công cụ migration. Bảng `openmaic_schema_migrations` có trong DB nhưng không có code nào trong repo tạo nó. | `lib/server/accounts/store.ts` |
| `ensureAccountSchema` được gọi khi khởi tạo pool. | `lib/persistence/server-provider.ts` |
| Owner có dạng `anon:<uuid>` (cookie `anonymous_id`) hoặc `acct:<accountId>` (đã đăng nhập). | `lib/server/agent-runtime/owner.ts`, `lib/server/accounts/service.ts` |
| Admin xác định qua `ADMIN_USERNAMES`, không có cột role. | `lib/server/accounts/admin.ts` |

## 3. Quyết định kỹ thuật

- **D1. Phạm vi kiểm tra.** Mọi kiểm tra quyền chỉ bật khi `accountsEnabled()` (có `DATABASE_URL`). Khi tắt accounts, app giữ nguyên hành vi hiện tại, vì không có danh tính nào để phân quyền.
- **D2. Owner của lớp học nằm trong file sidecar** `data/classrooms/<id>.access.json` với `{ ownerId, visibility }`, không dùng bảng DB. Lý do: đọc nhanh cho media, không phụ thuộc DB, không đổi định dạng `<id>.json`. Id không có dấu chấm nên không đụng tên file khác.
- **D3. Lớp học không có sidecar** (tạo trước đợt này): chỉ operator và admin đọc được.
- **D4. Job sinh lớp** lưu `ownerId` trong bản ghi job. Chỉ owner (hoặc operator và admin) đọc được job và `result`.
- **D5. Role trong bảng `accounts`** với giá trị `learner`, `operator`, `admin`, mặc định `learner`. Role hiệu lực tính lúc request: tài khoản có username trong `ADMIN_USERNAMES` luôn là `admin`, bất kể cột `role`. Vì vậy env là sàn, và không cần bước bootstrap khi khởi động.
- **D6. Chính sách role** nằm ở một chỗ: `lib/server/authz/policy.ts`. Route chỉ gọi policy.
- **D7. Quota** sẽ ghi `owner_id` vào usage (P3), truyền qua `AsyncLocalStorage`.

## 4. Các pha

### P0: đóng lỗ hổng khẩn

**T0.1 Phân quyền đọc lớp học, job và media.**
- `lib/server/classroom-access.ts`: `writeClassroomAccess`, `readClassroomAccess`, `canReadClassroom(viewer, access)`.
- `persistClassroom` nhận `ownerId` và ghi sidecar.
- `POST /api/classroom` ghi owner của người gọi.
- `generate-classroom` lưu owner vào job, `generateClassroom` truyền owner xuống `persistClassroom`.
- `GET /api/classroom`, `GET /api/classroom-media/...` và `GET /api/generate-classroom/[jobId]` trả 404 khi không có quyền (không lộ việc tồn tại).
- Test: `tests/server/classroom-access.test.ts`.

**T0.2 Guard cho route tiêu tốn model.**
- `lib/server/authz/spend-guard.ts`: `requireSpender(req)`. Khi accounts bật mà không có session, trả 401 `LOGIN_REQUIRED`.
- Áp dụng cho toàn bộ danh sách ở mục 2.
- Test quét: đọc mọi route trong danh sách và báo lỗi nếu thiếu lời gọi `requireSpender`.

**T0.3 Lỗi 402 và 401 rõ ràng.**
- Phân loại lỗi upstream trong `scene-outlines-stream` và `error-summary.ts`: 402 thành `PROVIDER_BALANCE`, 401 và 403 thành `PROVIDER_AUTH`. Không rơi vào "empty response".
- Unit test cho hàm phân loại.

**T0.4 Vận hành.** Đặt `ACCESS_CODE` hoặc bind `127.0.0.1` trước khi mở LAN. Không đổi code.

### P1: vai trò, policy, khu quản trị

**T1.1 Cột role và bootstrap.** Thêm `role` vào schema accounts. Hàm `ensureBootstrapAdmins` chạy sau `ensureAccountSchema`.

**T1.2 Policy.** `lib/server/authz/policy.ts` với `can(actor, action)`. Test ma trận trong `tests/authz/policy.test.ts`.

**T1.3 Session trả role.** `findSessionAccount` đọc thêm `role`. `/api/auth/session` trả `role`, giữ `administrator` để không phá UI cũ.

**T1.4 Route quản trị.**
- `requireRole` thay `requireAdministrator`.
- Operator và admin dùng được `/api/usage` và danh sách tài khoản, operator khoá được learner và operator nhưng không khoá được admin.
- Đổi role chỉ admin làm. Không đổi role của mình. Không hạ quyền tài khoản trong `ADMIN_USERNAMES`. Mọi thao tác ghi audit.

**T1.5 Giao diện.** Trang `/admin`. Gỡ `AccountAdminPanel` khỏi Settings → General. Thêm badge vai trò vào menu tài khoản. Chuỗi dịch qua `pnpm check:i18n-keys`.

### P2 đến P4: xem bản kế hoạch gốc trong cuộc trò chuyện. Không bắt đầu trước khi có quyết định ở mục 6.

## 8. Đã implement (P0 và P1)

Mã mới:
- `lib/server/authz/roles.ts`: kiểu role, `effectiveRole`, `administratorUsernames`.
- `lib/server/authz/policy.ts`: `can(viewer, action, resource)`. Đây là nơi duy nhất quyết định quyền.
- `lib/server/authz/viewer.ts`: `resolveViewer` (đọc cookie, không mint), `canReadClassroom`, `requireSpender`.
- `lib/server/classroom-storage.ts`: sidecar `<id>.access.json` chứa `ownerId` (`readClassroomAccess`, `writeClassroomAccess`).
- `app/admin/page.tsx`: trang quản trị cho operator và admin.
- `app/api/admin/accounts/[id]/role/route.ts`: đổi role, chỉ admin.

Đã sửa:
- Role lưu trong `accounts.role`; session và danh sách tài khoản trả role.
- `GET /api/classroom`, `GET /api/classroom-media/...`, `GET /api/generate-classroom/[jobId]` kiểm tra quyền. Không có quyền thì trả 404. Media đổi `Cache-Control` sang `private`.
- `POST /api/generate-classroom` và `POST /api/classroom` ghi owner. Job lưu `ownerId`, không lộ ra client.
- 25 route tiêu tốn model gọi `requireSpender`. Test quét `tests/authz/spend-guard-coverage.test.ts` báo lỗi nếu route mới thiếu guard.
- Luồng outline phân loại lỗi 402, 401, 403 thành thông báo cố định và không retry.
- Usage và danh sách tài khoản dành cho cả operator và admin. Route chỉ admin (đổi role) vẫn trả `ADMIN_ONLY`. Route dành cho cả hai trả `STAFF_ONLY`.

Sai khác so với kế hoạch gốc:
- D4 đổi: owner của lớp học lưu trong sidecar file, không dùng bảng DB. Lý do: đọc nhanh cho media, không cần thêm bảng.
- Phạm vi kiểm tra: mọi kiểm tra chỉ bật khi có `DATABASE_URL`. Khi tắt, hành vi giữ nguyên.
- `verify-*` cũng được đưa vào guard, vì chúng có thể dùng key của operator.

Giao diện đã thêm: trang `/admin` (usage và panel tài khoản), badge role và mục Administration trong menu tài khoản, ô chọn role cho admin trong panel tài khoản. Panel không hiện nút khoá với admin khi người xem là operator.

Đã kiểm tra trên trình duyệt với bản build hiện tại:
- Learner vào `/admin` thấy thông báo từ chối. Menu không có mục Administration.
- Khách gọi route tạo nội dung nhận 401 `LOGIN_REQUIRED`. `/api/admin/accounts` nhận 401. `/api/usage` nhận 403.
- Admin đổi role learner thành operator. Database lưu đúng và có audit `set_role:operator`. Operator vào `/admin` không thấy ô chọn role và không có nút khoá admin.

Kết quả full suite (`pnpm exec vitest run`): 5 file fail, và cả 5 đều không do thay đổi này. `server-backed-media-orchestrator`, `quiz/runtime` và `chat-storage` fail y hệt trên HEAD khi chạy tải nặng (timeout và race). `tests/security/*` là hai file untracked có từ trước, tham chiếu module không có trong repo.

Việc còn lại:
- P2 chưa bắt đầu, chờ quyết định ở mục 6.
- `generate-classroom` vẫn trả thông báo chung khi lỗi 402 (chỉ luồng outline được phân loại).
- `verify-*` chặn bằng `requireSpender` nhưng chưa có test riêng.

## 5. Kiểm thử

- `pnpm test` (bộ `tests/accounts` có 152 test, phải tiếp tục pass).
- Test mới: classroom-access, spend-guard (quét route), policy (ma trận), role và route quản trị.
- `pnpm check:i18n-keys`, `pnpm lint`, `pnpm build`.
- Chạy không có `DATABASE_URL` để xác nhận hành vi không đổi.
- Thủ công trên trình duyệt theo vai trò: khách, learner, operator, admin.

## 6. Quyết định còn mở (cần trước P2)

1. Xuất HTML, PPTX và ZIP cho ai: chỉ member, tắt, hay khách với bài preview?
2. Ai được tạo lớp: chỉ operator, hay member?
3. Quota tháng và giá membership.
4. Gỡ bài: người đã học có giữ bản đã lưu không? (Đề xuất: có.)
5. Lớp học cũ không có owner: chỉ operator xem, hay cho gán lại?

## 7. Rủi ro đã biết

- Nội dung đã xuất ra file thì không thu hồi được.
- Bản local trong trình duyệt vẫn mở được cho đến khi người dùng xoá dữ liệu.
- Usage nằm trên đĩa của từng instance, quota không chính xác khi chạy nhiều instance.
- Quota có race, có thể vượt một request.
- Không có công cụ migration. Mọi thay đổi schema dùng `IF NOT EXISTS`.

## 9. P2 đến P4: đã implement

Quyết định đã áp dụng (mặc định, có thể đổi):
- Xuất HTML, PPTX, ZIP: chỉ member đang hoạt động. Chặn ở giao diện, vì xuất diễn ra trong trình duyệt.
- Tạo lớp: chỉ operator và admin. Member tham gia bằng mã mời.
- Quota: 1.000.000 token LLM mỗi tháng cho membership mới (cấp thủ công). Thưởng 20.000 token cho mỗi người đọc lần đầu, tối đa 200.000 token mỗi tháng cho một tác giả. Huy hiệu tại 10 và 100 người đọc.
- Gỡ bài: người đã học giữ bản đã lưu. Không ai học mới được nữa.
- Lớp học cũ không có owner: chỉ staff xem.

Đã làm:
- Membership: cấp, gia hạn, tạm khoá, mở lại, mỗi thay đổi có audit (`lib/server/learning/store.ts`, `app/api/admin/memberships`).
- Chia sẻ: owner gửi yêu cầu, operator duyệt hoặc từ chối, owner gỡ bài. Yêu cầu chia sẻ phải có tài khoản (`app/api/courses/[id]/share`, `app/api/admin/shares`).
- Preview do operator đánh dấu, lớp học (tạo, tham gia bằng mã, gắn khoá học), danh mục `/catalog`.
- Quota: usage gắn owner qua `AsyncLocalStorage` (`lib/server/authz/spend-context.ts`). Learner không có membership hoặc hết quota bị chặn tạo nội dung (403 `MEMBERSHIP_REQUIRED` / `QUOTA_EXCEEDED`). Operator và admin không bị tính quota.
- Thưởng và huy hiệu khi có người đọc lần đầu.
- Audit log hiển thị trong `/admin`.
- Nút chia sẻ cho owner trên trang lớp học. Nút xuất hiển thị nhãn chặn cho khách.

Đã kiểm tra:
- Test: store (PGlite), route (membership, chia sẻ, lớp, catalog, audit), policy, quota và membership trong `requireSpender`.
- Trình duyệt: cấp membership, tạo lớp, đánh dấu preview, learner tham gia lớp, catalog cho member và khách, khách bị chặn 401, người không có membership đọc khoá học được chia sẻ nhận 404, member đọc được 200, thưởng cộng đúng một lần.

Chưa làm và hạn chế:
- P4.4 gộp dữ liệu ẩn danh: chưa làm. Anonymous không còn tạo được nội dung, nên phạm vi nhỏ. Dữ liệu cũ vẫn gắn `anon:`.
- P4.5 thanh toán: chưa làm, vì chưa chọn nhà cung cấp.
- Quota đọc file usage mỗi lần gọi. Chỉ đúng khi chạy một instance.
- Thông báo lỗi từ server (ví dụ "Sign in to use AI generation.") vẫn là tiếng Anh. Phần giao diện đã dịch theo mã lỗi.
- Chia sẻ chỉ áp dụng cho lớp học (classroom). Bài trong Pro workbench (document stages) chưa tham gia.
- Xuất chỉ được chặn trong giao diện. Nội dung đã xuất ra file thì không thu hồi được.
- Nút chia sẻ và nhãn xuất đã kiểm tra trên trình duyệt. Chưa kiểm tra luồng thanh toán vì chưa có.

Dữ liệu thử còn trong database local (chưa xoá, vì xoá là thao tác phải do bạn làm): tài khoản `bob` (mật khẩu 12345678), lớp `Grade 6`, preview `demo-preview-1`, khoá học thử `fractions-basics-course-0001` (kèm file trong `data/classrooms/`), và membership đang hoạt động của `learner`.
