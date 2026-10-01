# Hướng dẫn làm việc (onboarding)

- **Trạng thái**: Accepted — các lệnh của tính năng chỉ chạy được sau khi mã tương ứng tồn tại (hiện chưa có mã tính năng); sửa 2026-09-30 theo ADR 0010–0013
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [README](README.md), [ARCHITECTURE §4](ARCHITECTURE.md), [TEST-STRATEGY](TEST-STRATEGY.md), [OPERATIONS](OPERATIONS.md), [CONTENT-DESIGN](CONTENT-DESIGN.md), [RISKS](RISKS.md)

> **Tóm tắt:** dành cho dev hoặc coding agent mới. Đọc theo thứ tự ở §1, dựng môi trường (§2), biết chỗ thêm mã (§3), làm theo quy ước (§4–§5), dùng checklist PR (§6). Việc đầu tiên cần biết: **không đẩy từ `main`** (remote của `main` là upstream) và **không thêm npm dependency hay đổi package `@openmaic/*`**.

## 1. Thứ tự đọc

| Bước | Tài liệu | Để làm gì |
| --- | --- | --- |
| 1 | [README](README.md) | Mục tiêu, kế hoạch đợt, nguyên tắc |
| 2 | [REQUIREMENTS](REQUIREMENTS.md) | Yêu cầu gốc và cái đã chốt |
| 3 | [ARCHITECTURE](ARCHITECTURE.md) + [GLOSSARY](GLOSSARY.md) | Hình dung hệ thống và từ vựng |
| 4 | [decisions/](decisions/README.md) | Vì sao thiết kế như vậy (đọc ADR 0005, 0006, 0010, 0011, 0013 trước) |
| 5 | [INTERFACES](INTERFACES.md), [DATA-MODEL](DATA-MODEL.md) | Hợp đồng và dữ liệu |
| 6 | Đặc tả lát bạn làm: [Phase 1](phase-1-base-layer/SCHEMA.md) · [Phase 2](phase-2-competitive-programming/SCHEMA.md) · [Phase 3](phase-3-olympiad-math/SCHEMA.md) | Việc cụ thể, file, acceptance |
| 7 | [TEST-STRATEGY](TEST-STRATEGY.md), [SECURITY](SECURITY.md), [NFR](NFR.md) | Cách kiểm và ràng buộc |
| 8 | [RISKS](RISKS.md), [OPERATIONS](OPERATIONS.md), [CONTENT-DESIGN](CONTENT-DESIGN.md) | Rủi ro, vận hành, nội dung dạy |

## 2. Dựng môi trường

```bash
node --version        # cần Node >= 22.19.0 (package.json engines; Dockerfile dùng node:22-alpine); nếu không thấy, thêm thư mục Node vào PATH
pnpm install          # postinstall build các package @openmaic/*
pnpm dev              # dev server (Playwright dùng cổng 3002)
```

Cấu hình: sao chép `.env.example` → `.env.local`, điền khoá LLM. Tính năng **chỉ chạy trên workbench**, nên cần bật `OPENMAIC_AGENT_RUNTIME_ENABLED=true`, `DATABASE_URL` (Postgres) và `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true` (xem [OPERATIONS §2](OPERATIONS.md)). Widget `code` **mặc định bị chặn**; đừng đặt `OPENMAIC_ALLOW_CODE_WIDGET`. Không đưa bí mật vào tài liệu hay log.

Kiểm tra nhanh (không cần mạng):

```bash
pnpm vitest run tests/agent-runtime/skills.test.ts tests/workbench/workbench-i18n.test.ts   # nền hiện có phải xanh
pnpm lint && pnpm check && npx tsc --noEmit && pnpm check:i18n-keys
```

## 3. Thêm cái gì thì đặt ở đâu

| Muốn thêm | Làm | Không được |
| --- | --- | --- |
| Một walkthrough (thuật toán hoặc bài giải đề) | `lib/subjects/<id>/catalog/<entry>.ts` (`beatDefs` + gợi ý + hiểu lầm, preset, pseudo + C++ + Python + hai `map`, `entryRev`, `problem?`) + thêm vào `pack.ts` + `tests/subjects/<id>/<entry>.test.ts` + sinh lại khối id trong `SKILL.md` | Sửa `packages/@openmaic/*`; thêm `widgetType` mới; dùng `Intl`/`Date`/`Math.random` trong `run` |
| Một visualizer | `lib/tutor/runtime/visualizers/<name>.ts` + entry build + test trình duyệt | Thêm npm dependency (ADR 0002) |
| Một mẫu clip Manim | `manim/templates/<id>.py` + `lib/subjects/math/clips/<id>.ts` + preset + `invariants` + test + render CI | Cho LLM viết mã Manim chạy trên server (ADR 0007) |
| Một môn mới | `lib/subjects/<id>/` + một dòng ở `lib/subjects/index.ts` + skill (`title` có chữ Hán + `skill.title.<handle>` ở 12 locale) + `references/` | Thư mục dữ liệu không có `SKILL.md` dưới `skills/agent-runtime` (test đỏ, agent không đọc được) |
| Một **loại phương tiện** mới | ADR mới + `WidgetProvider` ở `lib/widgets` + tool tạo scene ở `lib/server/agent-runtime/` + trường trong `SubjectPack` | Đổi `WidgetType`; bọc `generateSceneContent` |
| Một đường ghi scene mới | Gọi `assertScenePolicy` (tool agent) hoặc phân loại "chỉ chặn hiển thị"; thêm vào danh sách của `tests/widgets/write-paths.test.ts` | Ghi scene mà không phân loại (test đỏ) |
| Nhãn giao diện | `subject.tutor.*` trong **cả 12** `lib/i18n/locales/*.json` | Chỉ sửa `vi-VN`/`en-US` |

## 4. Quy ước

- **Commit**: `type(scope): mô tả` (ví dụ `feat(tutor): add binary-search walkthrough`); kết thúc bằng dòng đồng tác giả khi có.
- **Nhánh**: tạo từ `origin/main`, ví dụ `feat/tutor-p1-engine`. **Không commit/đẩy từ `main`** — `git config branch.main.remote` là `upstream` (THU-MAIC). Đẩy bằng `git push -u origin <nhánh>`.
- **Không mở PR lên upstream** (CONTRIBUTING của upstream yêu cầu issue và một mối quan tâm mỗi PR).
- **Test đặt ở `tests/`** (vitest chỉ thu thập `tests/**/*.test.ts`); không `.tsx`; không cần jsdom.
- **Không đổi package**: `git diff --name-only origin/main -- packages/@openmaic` phải rỗng.
- **Nhãn trong tài liệu**: khẳng định về code kèm `file:line`; suy luận ghi `[Inference]`; chưa kiểm chứng ghi `[Unverified]`. Không bịa số liệu.

## 5. Quy ước viết tài liệu (áp dụng cho `docs/tutor/`)

1. Đầu file có khối: Trạng thái, Ngày, Người sở hữu, Liên quan; ngay sau đó là `> Tóm tắt:` 3–5 dòng.
2. Bảng cho so sánh và thuộc tính; văn xuôi cho lý do.
3. Mỗi thông tin có **một nguồn chính thức**; nơi khác chỉ liên kết (hợp đồng giao diện → [INTERFACES](INTERFACES.md); dữ liệu → [DATA-MODEL](DATA-MODEL.md)).
4. ADR mới: dùng mẫu ở [decisions/README](decisions/README.md); có SWOT và trigger.
5. Kiểm tài liệu trước khi hoàn thành: `python3 docs/tutor/tools/check_docs.py`. Công cụ kiểm: khối đầu file, `Tóm tắt`, fence/JSON/Mermaid, liên kết tương đối, số mục `§N`, sự tồn tại và khoảng dòng của tham chiếu `file:line` (kể cả tệp ở gốc repo), **neo nội dung** cho các trích dẫn quan trọng, ADR đánh số liên tục + có SWOT + có trong chỉ mục. **Giới hạn:** chỉ trích dẫn trong `ANCHORS` được kiểm nội dung; khi trích dẫn code quan trọng mới, thêm vào `ANCHORS` (RISKS R24).

## 6. Checklist PR

- [ ] Đọc ADR liên quan và không đi ngược quyết định; nếu cần đi ngược → ADR mới (có SWOT, trigger).
- [ ] Entry/visualizer/clip mới có test cùng PR; test đối chiếu **cách tính độc lập**; frame/lời/preset/code đổi thì **tăng `entryRev`** (snapshot `framesHash`).
- [ ] `pnpm vitest run tests/tutor tests/widgets tests/subjects tests/clips` xanh; `pnpm lint`, `pnpm check`, `npx tsc --noEmit`, `pnpm check:i18n-keys` xanh.
- [ ] Không thêm npm dependency; không đổi `packages/@openmaic/*`.
- [ ] Nhãn i18n đủ 12 locale; tên skill đủ 12 locale (nếu thêm skill).
- [ ] Không có widget `code`; `tests/widgets/write-paths.test.ts` xanh; không bí mật trong diff (`git diff | grep -iE "api[_-]?key|secret|token"` rỗng ý nghĩa).
- [ ] Browser test mới có **step riêng** trong `.github/workflows/ci.yml` (TEST-STRATEGY §3).
- [ ] Cập nhật tài liệu liên quan (INTERFACES/DATA-MODEL/RISKS/…) cùng PR.
- [ ] Kích thước: HTML/entry ≤ `maxBytes`; `public/clips` ≤ 30 MB.
- [ ] Nội dung dạy mới có review đạt của hội đồng LLM Tin/Toán ở đúng `entryRev` ([CONTENT-DESIGN §7](CONTENT-DESIGN.md), ADR 0014).
- [ ] Nhánh không có CI tự động thì đã chạy đủ lệnh ở TEST-STRATEGY §7 trước khi merge (RISKS R31).
- [ ] Docs và curriculum đã được commit trên nhánh (đừng để `docs/tutor` ở trạng thái untracked khi giao việc cho worktree).

## 7. Khi vướng

| Vấn đề | Xem |
| --- | --- |
| "Vì sao không dùng thư viện X / không để LLM sinh frame?" | ADR 0002, 0006 |
| "Sao test đỏ vì thư mục curriculum?" | ARCHITECTURE §9; ADR 0004 (curriculum phải nằm trong `references/` của skill) |
| "Sao `pnpm test lib/tutor/` không chạy test?" | Vitest chỉ thu thập `tests/**/*.test.ts`; test nằm ở `tests/tutor/` |
| "Sao học sinh vẫn thấy code editor?" | Kiểm `OPENMAIC_ALLOW_CODE_WIDGET` (không được đặt `true`); L1 chặn ở `InteractiveRenderer`; ADR 0010; TEST-STRATEGY §3 |
| "Sao không có workbench / không có walkthrough?" | Ba điều kiện ở ADR 0011; image phải dựng với `NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true`; OPERATIONS §7 |
| "Sao lời thầy nói bước 5 mà hình ở bước 0?" | Bắt tay `widget-ready` + `desired` (ADR 0013); e2e walkthrough |
| "Cái nào còn chưa đo?" | [RISKS §4](RISKS.md) (sổ spike) |
