# Kế hoạch: thiết kế lại phần thiết lập OmniRoute trong popup Settings

Trạng thái (2026-10-23): chủ dự án đã duyệt cả 5 đề xuất ở mục 9; các pha A đến E đã làm xong và nằm trên nhánh `it-math` (commit `c96af82c`, `c8c49ce5`, `f0fb3d74`, `1a8f8921`, `4d948260`, `9a173535`, tài liệu `667a404c`). Đã chạy thật với OmniRoute 3.8.52 (container thử) và trong trình duyệt thật; chưa triển khai, chưa chạy sau cổng Caddy với ứng dụng thật. Chi tiết và bằng chứng: `HANDOFF.md`.

Chỗ khác với thiết kế ban đầu:
- Không còn ô chọn "công cụ (tools)": luôn coi là có. Chỉ còn ô "ảnh (vision)".
- Route `status` bị xóa, thay bằng `overview`.
- Model của nhà cung cấp tự thêm (OpenAI-compatible) nằm dưới tiền tố của "node", nên ứng dụng đọc `/api/provider-nodes` để liệt kê đúng.
- Ô chọn model của từng vai trò rộng hơn (`min-w-44`) vì tên model dài.
- Worker OpenCode làm phần giao diện bị cắt do hết hạn mức tuần (429); leader hoàn thiện và nghiệm thu phần đó.
- 2026-10-23 (sau đó): chủ dự án yêu cầu OmniRoute là service ngang hàng với `openmaic` và tự nối mặc định, không dán giá trị vào `.env`. Đã đổi: `docker compose up` chạy luôn OmniRoute, job `omniroute-init` sinh mật khẩu dùng chung vào volume `omniroute-secrets`, OmniRoute tự sinh các khóa của nó, app tự giữ gate secret trong bộ nhớ và suy địa chỉ dashboard từ trang đang mở; các biến `OMNIROUTE_*` chỉ còn là ghi đè tùy chọn. Chi tiết: `HANDOFF.md` và `ops/omniroute/README.md`.
Nhãn: `[Inference]` là suy luận, `[Unverified]` là chưa kiểm chứng. Mục ghi "chạy thật" nghĩa là tôi đã gọi API của container `diegosouzapw/omniroute:3.8.52` (container thử, đã xóa cùng volume và mật khẩu thử). Mục ghi "đọc tài liệu" hoặc "đọc mã" nghĩa là chỉ đọc.

## 1. Mục tiêu

Popup hiện tại cho OmniRoute là khung chung của mọi provider: dán khóa, dán địa chỉ, gõ tên model, rồi lại gõ model mặc định và 21 route theo bước. Mục tiêu: một panel đi theo đúng cách người ta dùng OmniRoute, và nối thẳng vào cách ứng dụng chọn model (model mặc định, route theo bước, khả năng của model).

## 2. OmniRoute được dùng như thế nào

Nguồn: `docs/guides/USER_GUIDE.md`, `MANAGEMENT-AUTH.md`, `docs/reference/API_REFERENCE.md`, `docs/routing/AUTO-COMBO.md`, mã `src/app/api/{keys,combos,v1/models}` ở tag v3.8.52 (đọc), cộng các phép thử chạy thật ghi ở mục 2.3.

### 2.1 Mô hình khái niệm (đọc tài liệu)

1. **Kết nối nhà cung cấp** (Dashboard → Providers): đăng nhập OAuth (gói thuê bao) hoặc dán khóa API. Việc này chỉ làm được trong OmniRoute, không thay thế được bằng popup của app.
2. **Đơn vị định tuyến** là combo hoặc `auto/*`, không phải model riêng lẻ:
   - **Combo**: tên do người dùng đặt, danh sách model xếp thứ tự dự phòng (ví dụ `premium-coding`). Gọi bằng đúng tên combo.
   - **`auto/*`**: combo ảo, không cần tạo. Phạm trù `coding`, `reasoning`, `vision`, `chat`, `multimodal`, hạng `fast`, `cheap`, `reliable`, `free`, `pro` (ví dụ `auto/vision`, `auto/reasoning:pro`). Bản chạy thật còn liệt kê `auto/best-*`, `auto/pro-*`, `auto/smart`, `auto/thrifty`.
   - Model riêng lẻ có tiền tố nhà cung cấp (`cc/claude-sonnet-4-6`).
3. **Khóa API suy luận** (`sk-…`) là thứ mọi ứng dụng khách dùng: chỉ định địa chỉ gốc `…/v1`, khóa, và `model` = tên combo hoặc `auto/…`. Khóa có quyền chi tiết: `allowedConnections`, `modelAccessMode`, `allowedModels`, `allowedCombos`, `catalogScope`, `noLog`, `usageLimitEnabled`, `dailyUsageLimitUsd`, `rateLimits`, `expiresAt`.
4. **Quản trị qua API** cần phiên dashboard (cookie `auth_token`) hoặc khóa có scope `manage`. Khóa suy luận thường không quản trị được.

### 2.2 Những gì ứng dụng làm được thay admin (đọc mã)

- `POST /api/auth/login` với mật khẩu dashboard cho cookie `auth_token`. App đã làm bước này ở `enter`.
- `POST /api/keys` tạo khóa và trả khóa dạng chữ thường, một lần duy nhất. `GET /api/keys` che khóa. `POST /api/keys/{id}/regenerate` cấp khóa mới. `PATCH /api/keys/{id}` đổi quyền.
- `GET /api/monitoring/health` có `providerSummary` (`configuredCount`, `activeCount`).
- `GET /api/providers` liệt kê kết nối. `GET /api/combos` liệt kê combo. `GET /v1/models` (cần khóa) liệt kê model và combo.

### 2.3 Điều đã chạy thật (container thử, 2026-10-23)

| Phép thử | Kết quả |
|---|---|
| Khởi động container, `GET /healthz` | 200 sau khoảng 9 giây. RAM nghỉ khoảng 420 đến 470 MiB. Image 1,95 GB trên đĩa. Lúc khởi động nó tự gọi ra ngoài (Arena ELO, OpenRouter stats; một số lần nhận 429) |
| `POST /api/auth/login` bằng mật khẩu thử | 200, cookie `auth_token` HttpOnly |
| `GET /api/auth/csrf` | 200, token dùng 10 phút |
| `POST /api/keys {name, noLog:true}` bằng cookie, không CSRF, không Origin | **201** và trả `key` (35 ký tự, dạng `sk-…`). Mặc định `modelAccessMode: all`, `allowedCombos: ["combo/*"]` |
| `GET /api/keys` | trả `allowKeyReveal: false`: khóa không xem lại được, chỉ cấp lại bằng `regenerate` (200, kiểm chứng) |
| `PATCH` đổi `usageLimitEnabled` và `dailyUsageLimitUsd` | 200 |
| `DELETE /api/keys/{id}` | 200 |
| `GET /v1/models` trên cả cổng 20129 lẫn 20128 | 200, 454 mục khi chưa nối nhà cung cấp nào |
| `GET /v1/models?kind=chat&prefix=alias` | 285 model chat, **phần lớn của nhà cung cấp không cần khóa**: `devin-cli-agentic` 127, `codex-app-server` 52, `auggie` 28, `cloudflare-playground` 20, `zcode` 14, và 37 combo/`auto/*` |
| Một mục model riêng lẻ | có `capabilities` (`vision`, `tool_calling`, `reasoning`, `thinking`), `context_length`, `max_output_tokens`, `input_modalities`, `pricing`. Dấu hiệu ảnh không nhất quán: một model có `input_modalities` gồm `image` nhưng `capabilities.vision` là false |
| Mục `auto/*` và combo | `owned_by: combo`, **không có** `capabilities`, `context_length` (đọc mã xác nhận: combo bỏ qua bước làm giàu) |
| `GET /v1/models?capability=vision&kind=chat` | 200, lọc được (83 mục) |
| `GET /api/monitoring/health` | `providerSummary: {catalogCount 375, configuredCount 0, activeCount 0}` |
| `POST /api/providers` với khóa giả | 201 nhưng `isActive: false` (kiểm tra khóa thất bại) |
| Chat `auto/best-vision` bằng khóa **không giới hạn** khi chưa có nhà cung cấp thật | 502: OmniRoute tự chọn `cfp/zai-org/glm-5.2` (Cloudflare Playground) rồi lỗi vì thiếu Playwright. Nghĩa là `auto/*` mặc định kéo cả nhà cung cấp không cần khóa vào danh sách ứng viên |
| Cùng yêu cầu với khóa tạo bằng `allowedConnections: [id]` | 503 `ALL_TARGETS_SKIPPED`: hồ ứng viên bị giới hạn theo kết nối, không còn tự chọn nhà cung cấp lạ |
| `PATCH catalogScope: combos` rồi `GET /v1/models` | chỉ còn 37 mục combo/`auto/*` |

## 3. Ứng dụng này thiết lập model như thế nào (đọc mã)

- Chuỗi model dạng `provider:model`. Hàng `provider_credentials` giữ khóa, địa chỉ gốc và danh sách model được phép (`models TEXT[]`, rỗng nghĩa là cho phép mọi model).
- Model mặc định và **21 bước** có thể route riêng (`LLM_STAGES` trong `lib/server/model-routes.ts`). Giá trị của bước là chuỗi hoặc `{model, thinking, api, contextWindow}`.
- **Khả năng của model (ảnh, công cụ, cửa sổ ngữ cảnh) chỉ lấy từ danh mục tĩnh** `PROVIDERS[...].models` qua `findModelById` trong `getModel`. Với OmniRoute `models` là mảng rỗng nên `modelInfo` luôn là `null`.
- Hệ quả (đọc mã): bốn route dùng `modelInfo?.capabilities?.vision` để quyết định có gửi ảnh cho model hay không (`app/api/generate/scene-outlines-stream`, `scene-actions`, `scene-content`, `app/api/pbl/v2/evaluate`). **Qua OmniRoute, mọi tính năng cần ảnh hiện đang tắt âm thầm**, bất kể model thật có hỗ trợ ảnh. Đây là lỗi chức năng của bản tích hợp hiện tại, không riêng gì giao diện.
- `contextWindow` trong giá trị route chỉ có tác dụng cho bước `maic-agent-driver`.

## 4. Chỗ lệch giữa hai bên (vì sao popup hiện tại không hợp)

| # | Lệch | Hậu quả |
|---|---|---|
| L1 | Admin phải mở dashboard, tạo khóa, sao chép, dán lại. App đã có mật khẩu dashboard và gọi được `POST /api/keys` | Bước thừa, dễ nhầm, khóa có thể bị lộ khi sao chép |
| L2 | Ô "Mô hình được phép" gõ tay. Danh sách thật có hàng trăm mục, phần lớn không dùng được | Khó chọn, dễ chọn nhầm model web/CLI |
| L3 | Cách dùng đúng của OmniRoute là combo hoặc `auto/*`, nhưng panel không nhắc tới | Admin không biết có lựa chọn này |
| L4 | Khóa mặc định không giới hạn kết nối, nên `auto/*` có thể gửi nội dung học viên tới nhà cung cấp lạ (đã thấy chạy thật) | Rủi ro dữ liệu, điều khoản dịch vụ |
| L5 | Không có metadata ảnh/công cụ/ngữ cảnh | Tính năng ảnh tắt âm thầm (mục 3) |
| L6 | 21 bước, mỗi bước một ô | Quá nhiều quyết định, trong khi OmniRoute đã tự chọn model |
| L7 | Khối cá nhân (khóa/URL trong trình duyệt) cùng hiện với khối chung | Hai bộ ô giống nhau, dễ nhầm chỗ lưu |

## 5. Thiết kế mới

### 5.1 Nguyên tắc

1. Việc nào app làm được thì app làm (tạo khóa, đọc danh sách, điền metadata). Việc nào chỉ làm được trong OmniRoute (thêm nhà cung cấp, tạo combo) thì có nút mở đúng trang.
2. Mặc định an toàn: khóa của OpenMAIC chỉ được dùng các kết nối admin tích chọn, không ghi log nội dung (`noLog`), có hạn mức chi tiêu tùy chọn.
3. Chọn theo vai trò, không theo 21 bước. Cho phép đi sâu khi cần (mục 5.5).
4. Chỉ một nơi ghi sự thật: các route và model mặc định vẫn nằm ở `model_routing`, panel chỉ là cách nhập thuận tiện.

### 5.2 Bố cục panel (thay thế hoàn toàn nội dung hiện có của trang provider OmniRoute, kể cả thẻ "Máy chủ dùng chung" và khối cá nhân)

```
OmniRoute                                            [Sẵn sàng | Chờ nối nhà cung cấp | Chưa thiết lập]

①  Nhà cung cấp trong OmniRoute                      [Mở OmniRoute ↗] [Làm mới]
    ☑ openai-chính   (OpenAI · khóa API · hoạt động)
    ☑ glm-nhóm       (GLM · khóa API · hoạt động)
    ☐ claude-cá-nhân (Claude Code · OAuth · hoạt động)   ⚠ gói thuê bao: xem điều khoản
    OpenMAIC chỉ được dùng các kết nối đã tích. Nhà cung cấp không cần khóa của OmniRoute không được dùng.

②  Kết nối                                           [Kết nối] / [Cập nhật quyền]
    ☑ Không lưu nội dung trò chuyện trong OmniRoute (noLog)
    Hạn mức chi tiêu mỗi ngày (USD, tùy chọn): [  5  ]
    Khóa: …a1b2 · tạo 2026-10-23 · [Cấp lại khóa]

③  Chọn model theo vai trò                           [Gợi ý: Cân bằng ▾]
    Tạo nội dung bài     [ auto/best-vision        ▾ ]  ảnh ✓ công cụ ✓
    Trò chuyện, trợ giảng[ auto/best-chat          ▾ ]  ảnh – công cụ ✓
    Chấm bài, đánh giá   [ auto/best-reasoning     ▾ ]  ảnh – công cụ ✓
    Việc phụ             [ auto/cheap              ▾ ]
    Model mặc định = vai trò "Trò chuyện"    ▸ Tùy chỉnh từng bước (nâng cao)

                                                     [Kiểm tra]   [Ngắt kết nối]
```

- Mỗi hộp chọn chia nhóm: **Tự động (`auto/*`)**, **Combo của bạn**, **Model riêng lẻ** (ô tìm kiếm, thu gọn mặc định; chỉ giữ model của nhà cung cấp có kết nối hoạt động trong số các kết nối đã tích, nên 285 mục thô còn lại rất ít).
- Chip khả năng hiện cạnh lựa chọn (ảnh, công cụ, cửa sổ ngữ cảnh). Với combo và `auto/*` thì chip ảnh do luật đặt theo tên (`vision`, `multimodal` → có ảnh) hoặc admin tích tay.
- Bước ③ chỉ mở khi bước ② xong. Trạng thái chung lấy từ `providerSummary` (chưa nối nhà cung cấp nào thì ghi rõ và chỉ hiện bước ①).
- Khối cá nhân (khóa/URL trong trình duyệt), ô Proxy, và hai thẻ "Mô hình mặc định", "Mô hình cho từng bước" **không hiện** trên trang provider OmniRoute. Cả hai thẻ này vẫn có ở các provider khác và vẫn sửa được cùng dữ liệu.

### 5.3 Vai trò → bước (một nguồn trong mã, có test kiểm mỗi bước thuộc đúng một vai trò)

| Vai trò | Bước | Gợi ý "Cân bằng" [Unverified: chưa chạy với nhà cung cấp thật] |
|---|---|---|
| Tạo nội dung bài | `scene-outlines-stream`, `scene-content`, `scene-content:slide|quiz|interactive|pbl`, `scene-actions`, `generate-classroom`, `agent-profiles` | `auto/best-vision` (cần ảnh) |
| Trò chuyện, trợ giảng | `pbl-chat`, `pbl-v2-runtime`, `pbl-v2-runtime:instructor`, `:open-task`, `:simulator`, `chat-adapter`, `maic-agent`, `maic-agent-driver` | `auto/best-chat` |
| Chấm bài, đánh giá | `quiz-grade`, `pbl-v2-runtime:evaluate` | `auto/best-reasoning` |
| Việc phụ | `conversation-title`, `web-search-query-rewrite` | `auto/cheap` |

Các tên `auto/best-*` lấy từ danh sách chạy thật; tên chính thức trong tài liệu là `auto/vision`, `auto/reasoning:pro`, `auto/chat:fast`. Luật gợi ý chọn tên có mặt trong `/v1/models` của khóa.

### 5.4 Dữ liệu và máy chủ

- **Metadata ảnh/công cụ/ngữ cảnh đi cùng giá trị route**: `{model: "omniroute:auto/best-vision", vision: true, tools: true, contextWindow: 131072}` trong `model_routing.value`. `StageRoute` (lib/server/model-routes.ts) nhận thêm `vision` và `tools`. `resolveModel` (lib/server/resolve-model.ts) dùng chúng khi `getModel` trả `modelInfo` rỗng. Không thêm bảng mới. Việc này sửa luôn lỗi chức năng ở mục 3.
- **Route mới** (đều qua `provider.manage`, có dòng audit, không bao giờ trả khóa):
  - `GET /api/admin/omniroute/overview`: có đủ biến môi trường chưa, OmniRoute có trả `/healthz` không, `providerSummary`, danh sách kết nối (tên, nhà cung cấp, hoạt động hay không, có cần khóa hay không), trạng thái khóa OpenMAIC.
  - `POST /api/admin/omniroute/connect`: đăng nhập OmniRoute bằng mật khẩu đã có, tạo khóa (hoặc `PATCH` quyền, hoặc `regenerate` nếu mất), `allowedConnections` = các kết nối đã tích, `noLog`, hạn mức; lưu khóa mã hóa vào `provider_credentials` (địa chỉ gốc `http://omniroute:20129/v1`).
  - `GET /api/admin/omniroute/models`: gọi `/v1/models?kind=chat` bằng khóa đã lưu, giữ combo/`auto/*` và model của nhà cung cấp có kết nối hoạt động đã tích (so `owned_by` với danh sách kết nối), thu gọn trường, kèm chip khả năng.
  - `PUT /api/admin/omniroute/roles`: ghi model mặc định và các route theo bảng 5.3 bằng đường ghi `model_routing` hiện có (có kiểm phiên bản).
- **Tách logic**: `lib/server/omniroute/client.ts` (gọi OmniRoute, chỉ phía server), `roles.ts` (bảng vai trò, luật khả năng). Giao diện: một component mới thay nội dung trang provider OmniRoute; sửa nhẹ `components/settings/index.tsx` để ẩn khối chung cho provider này.
- **Giới hạn đã biết**: hai thẻ chung hiện ghi route dạng chuỗi và sẽ xóa `vision`/`contextWindow` nếu admin sửa bước đó ở đấy. Phải bảo toàn trường lạ khi chỉ đổi model (việc kèm theo, có test).

### 5.5 Nâng cao
Liên kết "Tùy chỉnh từng bước" mở vùng 21 bước hiện có (cùng dữ liệu). Nút "Mở OmniRoute" nhận thêm đích: `/dashboard/providers`, `/dashboard/combos`, `/dashboard/api-manager`, `/dashboard/health` (đường dẫn lấy từ cây mã). Đích đi trong vé đã ký, `enter` chỉ chấp nhận danh sách trắng.

## 6. Bảo mật và riêng tư

- Mật khẩu dashboard đã nằm trong biến môi trường của app; thêm việc dùng nó để gọi API quản trị phía server, không đi qua trình duyệt.
- Khóa OpenMAIC: tạo bằng `noLog: true`, `allowedConnections` bắt buộc không rỗng (không có tùy chọn "không giới hạn" trên giao diện), `expiresAt` tùy chọn. Khóa lưu bằng đường mã hóa AES-GCM của `provider_credentials`.
- Dữ liệu học viên chỉ đi qua các kết nối admin đã tích: `allowedConnections` giới hạn cả hồ ứng viên của `auto/*` (đã chạy thật, mục 2.3), nên nhà cung cấp không cần khóa (Cloudflare Playground, DuckDuckGo web, CLI) không còn được chọn. Kết nối kiểu gói thuê bao (OAuth) hiện cảnh báo điều khoản dịch vụ. Điều khoản của từng nhà cung cấp là việc của admin [Inference].
- Thêm việc app tự gọi `POST /api/keys` làm tăng quyền của app lên OmniRoute (nó là quản trị viên của OmniRoute). OmniRoute là mã bên thứ ba cùng mạng `omniroute` với app: giữ ghim phiên bản.

## 7. Cái bị bỏ hoặc đổi
- Bỏ khỏi trang OmniRoute: khối cá nhân, Proxy, hai thẻ mặc định/route chung (các provider khác không đổi).
- Giữ: nút mở dashboard (thêm đích), trạng thái "chưa thiết lập" (nâng thành thẻ có tên biến thiếu).
- File upstream phải sửa: `components/settings/index.tsx` (vài dòng). Phần còn lại là file của fork: `lib/server/model-routes.ts`, `lib/server/resolve-model.ts`, `lib/server/omniroute/*`, `app/api/admin/omniroute/*`, `components/settings/*omniroute*`, 12 file locale.

## 8. Kế hoạch triển khai
| Pha | Việc | Kiểm chứng |
|---|---|---|
| A | Sửa lỗi ảnh: `StageRoute.vision/tools`, `resolveModel` dùng khi `modelInfo` rỗng, bảo toàn trường lạ ở thẻ chung | Test route + `resolveModel`; test `hasVision` thật qua một route mẫu |
| B | `client.ts` + route `overview`, `connect` (có container OmniRoute giả bằng máy chủ nhỏ trong test) | Test PGlite + máy chủ giả; một script thử với container thật (như đã làm ở mục 2.3) |
| C | `models`, `roles` (bảng vai trò, test mỗi bước thuộc đúng một vai trò) | Test đơn vị + invariant theo `LLM_STAGES` |
| D | Giao diện: panel 3 bước, i18n (vi, en viết; 10 locale để tiếng Anh theo quy ước) | Test jsdom; xem trong trình duyệt khi có tài khoản admin |
| E | Chạy thật trên container OmniRoute với ít nhất một nhà cung cấp thật | Gọi chat qua `auto/…`, kiểm ảnh/công cụ |

Công việc bảo mật (B) tôi tự làm; giao diện (D) và test hàng loạt (một phần C) có thể giao worker OpenCode theo quy tắc của chủ dự án sau khi duyệt.

## 9. Quyết định cần chủ dự án
1. Cho app tự tạo khóa OmniRoute (đề xuất), hay vẫn để admin dán tay?
2. Mặc định riêng tư: giới hạn theo kết nối + `noLog` bật (đề xuất, không có lối tắt "không giới hạn")?
3. Dùng bốn vai trò thay 21 ô (đề xuất), giữ 21 ô trong "nâng cao"?
4. Chip ảnh cho combo/`auto/*`: luật theo tên + admin sửa tay (đề xuất), hay bắt buộc chọn model thật khi cần ảnh?
5. Làm cả pha A ngay cả khi không đổi giao diện (đề xuất vì đó là lỗi chức năng)?

## 10. Chưa kiểm chứng
- Chat thật qua OmniRoute với nhà cung cấp thật (ảnh, công cụ, streaming qua cổng admin).
- `auto/vision` thật sự chỉ chọn model có ảnh; tên `auto/best-*` giữ nguyên qua các bản nâng cấp.
- Hành vi khi OmniRoute nâng phiên bản (API quản trị là API nội bộ của dashboard, không có cam kết ổn định) [Inference].
- Vai trò "Tạo nội dung" cần cả ảnh lẫn đầu ra có cấu trúc: chưa biết `auto/best-vision` có đáp ứng ổn định.
