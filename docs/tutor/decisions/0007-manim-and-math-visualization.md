# ADR 0007: Manim là hướng chính để trực quan hoá Toán — mẫu Manim tham số hoá (M3) trên nền thư viện dựng sẵn (M1)

- **Status**: Accepted (viết lại 2026-09-30 theo quyết định của user; sửa lần 2 ngày 2026-09-30 sau review; sửa 2026-10-01 theo ADR 0014: LLM tác giả, hội đồng LLM; quyết định bằng SWOT)
- **Date**: 2026-09-29; viết lại 2026-09-30
- **Deciders**: User ("Đây là hướng chính" — Manim cho trực quan hoá Toán; lời thầy "giữ riêng" với clip) + Architect panel
- **Liên quan**: [0005](0005-widget-hosting-model.md), [0009](0009-teacher-qa-awareness.md), [0011](0011-entry-point-workbench-tool.md), [../SECURITY](../SECURITY.md), [../OPERATIONS](../OPERATIONS.md), [../phase-3-olympiad-math/SCHEMA](../phase-3-olympiad-math/SCHEMA.md)

> **Tóm tắt:**
> - **Manim là hướng chính cho Toán**: mẫu tham số hoá (M3) trên nền thư viện dựng sẵn (M1); LLM chỉ chọn `templateId` + `presetId`/`params`.
> - Clip **câm**; lời thầy TTS **chạy riêng**, trước và sau mỗi chapter (user xác nhận 2026-09-30).
> - **Mỗi chapter một file và một slide**, do tool tất định `generate_clip_scenes` tạo (ADR 0011). Không đổi package.
> - Render theo yêu cầu qua `manim-service` (đợt 3): một container dài hạn đã cứng hoá, mỗi job một tiến trình con có giới hạn.
> - **Mã Manim không do LLM viết trên đường phục vụ.**

## Trả lời ngắn

**Manim là hướng chính để trực quan hoá Toán.** Cách làm: các **mẫu Manim tham số hoá** do ta viết và kiểm thử (M3), dựng trước bằng CI và sau đó theo yêu cầu qua một dịch vụ render riêng; LLM **chỉ chọn `templateId` + `params` đã kiểm** (giống ADR 0006), không tự viết mã Manim để chạy trên server. Clip là **video câm**, lời thầy là TTS; walkthrough SVG vẫn dùng cho phần thủ tục cần tua/đổi số/Q&A theo frame.

## Context

Sự thật đã kiểm chứng ngày 2026-09-30 (số liệu GitHub/PyPI/Docker Hub do chuyên gia đọc trực tiếp bằng API; số liệu từ bài arXiv do chuyên gia đọc, tôi chưa kiểm lại — [Unverified] cho từng con số):

| Mục | Kết quả |
| --- | --- |
| Manim CE | 0.21.0 (2026-08-10), MIT, Python ≥ 3.11. Có breaking change ở mỗi bản minor (0.20, 0.21) → **phải pin phiên bản**. |
| Renderer | Mặc định Cairo (CPU); OpenGL tài liệu sơ sài. Chọn Cairo [Inference]. `-qm` = 1280×720@30; `-qh` = 1920×1080@60. |
| Image `manimcommunity/manim:v0.21.0` | ~533 MB nén (amd64). Có TeX Live tối thiểu (amsmath, babel-english, dvisvgm, standalone…); **không** có `babel-vietnamese`/`vntex`; không có `ctex`. Kích thước giải nén [Unverified]. |
| Thời gian render | **Không có benchmark công khai cho clip 15–60 s** → phải tự đo (spike S1). |
| Tất định | Tài liệu không cam kết bit-identical; chỉ có `--seed`. Cache key nên theo đầu vào + digest image, không theo hash video [Inference]. |
| Bảo mật LaTeX | Manim gọi `latex` với `-interaction=batchmode -halt-on-error`, **không có `-no-shell-escape`** (`manim/utils/tex_file_writing.py`, chuyên gia đọc mã nguồn) — chỉ an toàn khi không có chuỗi tự do từ bên ngoài đi vào TeX. |
| Tiếng Việt | `Text` dùng Pango + fontconfig (có `register_font`); tài liệu không có ví dụ tiếng Việt. TeX Live có `babel-vietnamese`, `vntex` nhưng image chưa cài. Font OFL: Be Vietnam Pro, Noto Sans (có subset `vietnamese`). Dấu chồng trong Pango/Typst: [Unverified] → spike S2. |
| Typst (mới ở 0.21) | `Typst`/`MathTypst`, cài `manim[typst]`, trình biên dịch Rust tự chứa, không shell escape. Mới 2 tháng tuổi; cú pháp toán khác LaTeX [Inference]. |
| Sections/cache | Có `next_section`/`--save_sections`, cache theo partial-movie (SHA-256, `max_files_cached=100`), `--max-inflight-encoders`. Song song thực tế = nhiều tiến trình [Inference]. |
| LLM sinh Manim | ManimBench-style: RSR 94% chỉ đạt với model 30B tinh chỉnh + 3 vòng sửa lỗi, trên 100 mẫu (arXiv 2604.18364); GPT-4.1 một lần đạt 77%. ManiBench (arXiv 2603.13251): tốt nhất 8/12 bài. TheoremExplainBench (arXiv 2502.19400): từ 2,1% đến 93,8%, tối đa 5 lần thử. Lỗi chính: bịa API, lỗi LaTeX. *(Bản ADR trước ghi "92–94%": không chính xác, đã sửa.)* Render được ≠ đúng toán. |
| Repo tham khảo | Math-To-Manim, Code2Video, TheoremExplainAgent, generative-manim — đều là demo/nghiên cứu, không thấy sandbox đa người dùng [Inference]. |
| Video trong OpenMAIC (đã đọc) | `PPTVideoElement` (`packages/@openmaic/dsl/src/slides.ts:736`: `src`/`mediaRef`/`autoplay`/`poster`); action `play_video` **chỉ có `elementId`, không seek/beat** (`packages/@openmaic/dsl/src/action.ts:190`); nó **chặn** đến hết clip, trần `MAX_VIDEO_WAIT_MS` = 5 phút (`lib/choreography/timing.ts:34`), nên **lời thầy không chồng lên clip**; `<video controls preload="metadata">` (học sinh tự tua, engine không biết). |
| Pipeline video bất đồng bộ đã có (đã đọc) | Tool agent `generate_video` (`lib/server/agent-runtime/generate-video.ts`) trả id ngay, job tách rời, `media_ready`; video "đang dựng" hiện skeleton (`components/slide-renderer/components/element/VideoElement/BaseVideoElement.tsx:49`); registry `lib/media/video-providers.ts`. |
| Nơi lưu asset | IndexedDB (`maic-asset-pool`) mặc định; server persistence (Postgres/S3, ≤32 MiB/asset) khi bật; file server `data/classrooms/<id>/media`. `public/` hiện 9,2 MB, không có Git LFS → **không commit MP4 hàng loạt vào git**. |
| `render-service/` (đã đọc) | Dịch vụ Node + Chromium + FFmpeg; hợp đồng submit→poll→download→cancel, 429, opt-in qua `RENDER_SERVICE_URL`; cách ly bằng mạng + iptables, **không auth**; container chạy root + `CAP_NET_ADMIN`. Dùng làm **khuôn hợp đồng**; không tái dùng code, không sao chép mô hình cách ly cho mã Python. |
| Export MP4/ZIP | Clip slide đi vào `VideoSegment`; thời lượng chỉ đo được từ blob cục bộ; clip chỉ là URL server [Inference] có nguy cơ bị bỏ khỏi ZIP và bị cap 5 phút trong MP4 → clip nên được **adopt vào asset pool (blob)** (tiền lệ `lib/audio/adopt-cached-narration.ts`). Widget HTML bị đóng băng sau ~250 ms trong export MP4. |

**Đính chính các ADR/tài liệu trước** (chuyên gia đối chiếu code): (1) sửa `snippets/slide-video-instructions.md` là **sửa package `generation`** (bump/publish), trái ADR 0005 → thay bằng chèn phần tử video sau khi sinh; (2) "clip không bị giới hạn MP4" chỉ đúng khi clip là blob/pool; (3) `WidgetProvider.content()` trả `GeneratedInteractiveContent`, không diễn tả được "slide có clip". Bản trước thêm `SceneEnricher`; **sửa 2026-09-30**: thay bằng tool `generate_clip_scenes` (ADR 0011), vì `SceneEnricher` không khớp pipeline (action sinh trước khi có `Scene`); (4) "Manim chỉ offline/CI, ngoài Dockerfile" hết hiệu lực khi render theo yêu cầu (cần container dịch vụ riêng); (5) ADR 0009 mới là thiết kế, chưa có mã `widget-state`.

## SWOT 1 — chiến lược sinh clip

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| **M1. Thư viện clip dựng sẵn** (Manim viết tay + CI) | Người duyệt từng clip; chỉ mã tin cậy chạy; giao asset tĩnh; đi qua `PPTVideoElement` sẵn có. | Không nhận tham số; mỗi clip một file Python; nhân bản theo locale; asset phải ra object storage (không LFS). | Kho mẫu đầu tiên để tham số hoá thành M3. | Cần người biết Manim; nâng cấp Manim làm vỡ cảnh. |
| M2. LLM viết mã Manim → render trong sandbox | Phủ được phần đuôi dài. | RSR 77–94% tuỳ model/vòng sửa [Unverified]; render được ≠ đúng toán; chậm, tốn token; không kiểm thử tất định. | Trợ lý soạn **offline**. | **Thực thi mã tuỳ ý trên server** (RCE/DoS; LaTeX đọc file); lời giải sai chạm học sinh; trái nguyên tắc ADR 0006. |
| **M3. Mẫu tham số hoá (chọn — lõi)** | Chỉ mã của ta chạy; cùng mô hình tin cậy ADR 0006 (LLM chọn id + params đã kiểm); cache key hữu hạn (định nghĩa ở DATA-MODEL §4); bất biến toán kiểm được bằng test; `describe()` cho Q&A sinh từ params. | Hai ngôn ngữ (catalog TS + scene Python) — schema dùng chung; công viết mỗi mẫu; phủ giới hạn; tham số liên tục làm cache nổ (chỉ dùng miền hẹp). | Nền tảng cho họ mẫu (biến hình, họ hàm, hình học bất đẳng thức). | Áp lực nhồi thêm mẫu, và đẩy sang M2. |
| M4. M3 + M2 sau cổng | Có lối thoát cho ngoài danh mục. | Phức tạp nhất: sandbox, hàng đợi duyệt. | M2 offline sinh PR kèm QA và cho số đo RSR trên miền của ta. | Cổng bị bỏ qua vì tiện. |

## SWOT 2 — phân bổ vai trò cho nội dung Toán

| | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| X. Manim-first (mọi topic có clip) | Trải nghiệm đồng nhất, sinh động nhất. | Ép clip vào nội dung chữ nhiều → tải nhận thức; công nặng nhất; video không tua theo bước. | Mẫu nhân bản; tái dùng cho Tin. | Bảo trì Python; sai toán nhân lên; học sinh thụ động; ZIP nặng. |
| Y. Walkthrough-first (bản cũ) | Rẻ; tua/đổi số/Q&A theo frame tốt. | CSS transition không diễn tả biến hình liên tục; trái quyết định của user. | — | Không đạt "trực quan sinh động" cho Toán. |
| **Z. Cân bằng theo loại nội dung (chọn)** | Đúng công cụ đúng việc; Manim là mặc định cho nội dung liên tục/hình; giữ tương tác ở phần thủ tục. | Ba loại phương tiện, tiêu chí phân loại cần bảo trì. | Nâng dần lên X theo dữ liệu. | Phân loại sai; trôi về Y nếu không có người viết Manim. |

## SWOT 3 — tích hợp và thực thi

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| **(i) Clip là phần tử video trên slide (chọn, pha đầu)** | Lease/export/import/MP4 overlay có sẵn; không đổi package, không iframe; thầy gọi lại `play_video` khi Q&A. | Không seek/beat; lời thầy không chồng clip (clip câm → cần lời trước/sau); Q&A không biết nội dung clip. | Chia clip theo beat (mỗi beat một file); `PPTBaseElement.name` + text caption cho Q&A. | Trần 5 phút; clip URL làm hỏng ZIP/MP4 (giảm bằng adopt vào pool). |
| (ii) Clip widget (iframe) có beat/`widget_setState` | Beat/tua điều khiển được; caption HTML đa ngữ/a11y; lời thầy chồng được. | Blob/URL trong iframe null-origin [Unverified]; cookie `/api` có thể không gửi; ref video trong widget không vào manifest ZIP/MP4; MP4 chỉ thấy khung tĩnh; cần `widget-state` (ADR 0009). | Dùng chung hạ tầng Q&A. | Lệch TTS↔clip; hành vi autoplay theo trình duyệt. |
| (iii) Cả hai | Một asset, hai vỏ. | Hai đường bảo trì. | Tuyến nâng cấp. | Làm cùng lúc nhân rủi ro (ii). |
| **(a) Dựng sẵn (chọn, đợt đầu)** | `generate_clip_scenes` đồng bộ; tất định; offline. | Chỉ preset; thư viện nặng. | Manifest = khối id cho SKILL.md. | Thư viện cũ đi. |
| (b) Render theo yêu cầu (async, như `generate_video`) | Tham số tuỳ ý (trong `inputSpec`); cache. | 30 s–vài phút; registry job mất khi restart. | Tái dùng skeleton + `media_ready`. | Container chết → skeleton mãi (cần timeout→failed + preset gần nhất). |
| **(c) Theo pha: (a) trước, (b) sau (chọn)** | Cache key (DATA-MODEL §4): trúng cache trả `src` ngay; trượt thì job + placeholder. | Hai đường. | Preset phổ biến luôn trúng. | — |

## Decision

1. **Manim là hướng chính cho Toán** (theo user). Phân bổ **Z**: Manim = phương tiện mặc định cho nội dung chuyển động liên tục/hình học/đồ thị (biến hình, chứng minh không lời, đại số hình học, hàm số–đạo hàm–giới hạn–tích phân, đếm bằng song ánh, đồng dư trên vòng tròn…); **walkthrough SVG** cho thủ tục rời rạc cần tua/lùi/đổi số/Q&A theo frame; **slide + `wb_latex`** cho chứng minh dài chữ nhiều.
2. **Chiến lược sinh: M3 trên nền M1.** Mẫu ngay từ đầu ở dạng tham số. **Sửa 2026-10-01 (ADR 0014):** mẫu do **LLM tác giả** (`manim-author`) viết offline trong CI, qua cổng tự động (AST allowlist, sandbox, QA, `invariants`) và hội đồng LLM duyệt, rồi tự động gộp; **không cần người viết/duyệt**. **Mã Manim không do LLM viết trên đường phục vụ**: chỉ mẫu đã commit chạy trong `manim-service`. S9 (RSR, đúng-toán) chuyển lên đợt 3A.
3. **Clip là video câm; lời thầy TTS chạy riêng** (user xác nhận 2026-09-30: "giữ riêng"). SWOT của lựa chọn này:

   | Phương án | Strengths | Weaknesses | Opportunities | Threats |
   | --- | --- | --- | --- | --- |
   | **Câm + lời trước/sau từng chapter (chọn)** | Một video cho mọi locale; dùng lại TTS/giọng sẵn có; thay lời không cần render lại; không cần đồng bộ âm thanh. | `play_video` chặn nên lời không chạy **cùng lúc** với hình động; [Inference] điều này yếu hơn nguyên tắc tiếp giáp thời gian (temporal contiguity). | Chapter ngắn làm lời và hình gần nhau. | Học sinh xem thụ động → câu hỏi dự đoán sau chapter. |
   | Ghép audio TTS vào MP4, mỗi locale một bản | Lời chạy cùng hình. | Nhân bản theo locale; đổi lời phải render lại; khoá giọng vào video. | — | Cache nổ theo locale × giọng. |
   | Lời chồng lên clip (đổi engine/choreography) | Cùng lúc, không nhân bản. | Sửa lõi phát lại. | — | Lệch nhịp TTS và clip. |

   **Cách giảm điểm yếu:**
   - **Chapter ngắn** (8–25 s).
   - Lời **trước** chapter nói trước cần để ý gì ("hãy nhìn đoạn h khi a thay đổi"); lời **sau** giải thích; ≥1 câu hỏi dự đoán mỗi 2 chapter.
   - **Nhãn và giá trị then chốt hiện ngay trong hình** (ký hiệu, số).
   - Có nút xem lại chapter.

   Chữ trên màn tối thiểu (ký hiệu, số, nhãn hình); không nướng câu tự nhiên; phụ đề/giải thích là text slide. Clip không có chữ nướng theo locale thì `locale = null` trong cache key (DATA-MODEL §4). **Không có `cues.json`**, vì lời và clip chạy tuần tự nên không cần đồng bộ trong clip.
4. **Tích hợp pha đầu = (i)**; (ii) chỉ sau spike S3 (blob/URL trong iframe null-origin) và khi có nhu cầu tua/beat. Không đổi package. **Sửa 2026-09-30 (ADR 0011):** tool `generate_clip_scenes{stageId, afterOrder, clipId, presetId}` tạo **mỗi chapter một slide**:
   - Bố cục cố định: tiêu đề, một `PPTVideoElement` (`name: 'clip:<id>@<hash>#<chapterId>'`, `src` là URL cụ thể hoặc ref trong asset pool), text chú thích.
   - Kịch bản `speech(before) → play_video → speech(after)` lấy từ `ClipEntry.chapters`.
   - Tool không đi qua sinh nội dung của LLM, nên không cần `normalizeGeneratedVideoRefs` (`packages/@openmaic/generation/src/scene-generator.ts:817`).
   - Clip được **adopt vào asset pool** khi dùng lần đầu, để export/import/MP4 hoạt động. Spike Q11: slide do tool dựng qua `validateScene`.
5. **Thực thi (c):** đợt đầu chỉ tra `clipId` → asset dựng sẵn bằng CI; đợt sau `generate_clip_scenes` nhận thêm `params` và gọi **`manim-service`**: container thứ hai theo hợp đồng của `render-service` (submit→poll→download→cancel, 429, opt-in), nhưng **cách ly mạnh hơn** (sửa 2026-09-30 sau review bảo mật):
   - **Một container dài hạn đã cứng hoá**: user không phải root, `cap_drop: ALL`, `read_only` + tmpfs cho thư mục làm việc, `pids_limit`, `mem_limit`.
   - Mạng internal **riêng** `manim`, không dùng chung mạng `render`; xác thực bằng token giữa app và dịch vụ.
   - **Mỗi job một tiến trình con** có timeout, `rlimit` CPU/RAM/file và kill cả process group.
   - TeX cấu hình `shell_escape=f`, `openin_any=p`, `openout_any=p` [Unverified: cách đặt qua `texmf.cnf`/biến môi trường của kpathsea].
   - Lý do chọn cách này thay vì mỗi job một container: M3 chỉ chạy mã mẫu của ta, nên không cần tự khởi container, và không phải mount `docker.sock` (đóng SECURITY T22, RISKS R25).
   - `params` chỉ là số/enum (không chuỗi tự do), nên không có đường tiêm LaTeX.
   - Red-team ở spike S6 dùng canary.
6. **Công nghệ:** Manim CE **pin 0.21.0**, renderer Cairo, 720p30 H.264 MP4 faststart (`-qm`), image dựng từ `manimcommunity/manim` + gói TeX bổ sung + font OFL (Noto Sans / Be Vietnam Pro) + pin phiên bản TeX Live. LaTeX so với Typst (`MathTypst`): quyết định ở spike S2. Không dùng `manim-voiceover` (trùng TTS sẵn có, khoá giọng vào video), `manim-slides`, `manim-web`.
7. **Cổng chất lượng tự động** (trước khi clip vào thư viện): (a) render thành công, `ffprobe` (h264/yuv420p, kích thước, fps), độ dài đúng ±5% so với manifest; (b) **bố cục tất định**: sau mỗi `play()` kiểm bounding box mọi `Text/MathTex` nằm trong khung với lề, không chồng chữ, cỡ chữ tối thiểu; (c) khung hình: lấy mẫu mỗi giây và tại ranh giới chapter, loại khung đen/đứng yên, SSIM so với khung vàng ở params cố định; (d) **đúng toán**: `invariants(params)` (hàm thuần TS) chạy trên mọi preset và biên, và số liệu hiển thị (manifest do scene ghi) đối chiếu với hàm độc lập; **hội đồng LLM "giáo viên chuyên Toán" ký** (`tutor-review-math` + `-2`, cổng cứng; ADR 0014); (e) VLM-judge chỉ cảnh báo (nghiên cứu Code2Video cho thấy VLM bỏ sót che khuất); (f) a11y: tương phản, không nhấp nháy, có caption.
8. **Entry mẫu** (`lib/subjects/math/clips/`, hình dạng ở ARCHITECTURE §8b): dùng chung `InputSpec` (thêm `enum`), `Messages`, `presets` với `WalkthroughEntry` (ADR 0006); khác: không có `run()`/`beatDefs`; có `render`, `chapters` (lời `before`/`after`), `bakedText`, `invariants`, `cacheKeyInput`, `asset`.
9. **Hyperframes** (HTML→MP4; đã là devDependency, Apache-2.0, dùng ở `render-service`): thử trước Manim cho clip mà HTML/SVG dựng được, hoặc cho MP4 dựng từng bước của walkthrough (ADR 0002 T3) [Unverified — chưa thử render walkthrough qua đó].
10. **Catalog và đợt** (Phase 3 §3): 21 mẫu đề xuất, **Lô A** (8 mẫu ưu tiên): `amgm-semicircle`, `alg-identity-area`, `figurate-sums`, `cs-projection`, `secant-tangent`, `concurrency-dynamic`, `inscribed-angle`, `tiling-coloring`.
11. **Q&A cho clip**: L0 — mỗi clip có `clip-sheet` (chapter, cái đang hiện, công thức, hiểu lầm hay gặp, gợi ý theo bậc) vào digest của thầy (ADR 0009 bước 0) và `name` tag của phần tử; thầy hỏi "em đang ở đoạn nào?" và vẽ lại khung `poster` bằng `wb_*`. L1 — host báo `currentTime`→chapter (như `widget-state`) làm sau.

## Đợt, cổng và trigger

| Đợt (= phase ở ADR 0004) | Nội dung | Cổng |
| --- | --- | --- |
| 0 (3-0) | Spike S1–S5 (Phase 3 §8) và **research curriculum Toán**. **S1, S2, S4 chạy song song với lát 1a** (không cần 1b); S3 và S5 cần 1b/curriculum | — |
| 1 (3A) | Pin image; 3 mẫu; CI render + cổng QA; tool `generate_clip_scenes` + provider clip; export MP4/ZIP trọn vòng; **chạy vòng LLM tác giả + S9 trên 3 mẫu, đo chi phí token/mẫu**, có quyết định đi tiếp/dừng | S1–S4 đạt |
| 2 (3B) | Sau 3B tổng 9–12 mẫu theo kiểm kê topic; vi/en; `describe()`/`clip-sheet` cho Q&A; **3 walkthrough Toán** (chuyển từ 3A sang) | S5 (kiểm kê) + đợt 1 qua rubric |
| 3 (3C) | `generate_clip_scenes{params}` + `manim-service` (render theo yêu cầu, cách ly theo Decision 5) | đợt 2 xong; sandbox đạt red-team (S6) |
| 4 (3D) | Mở rộng catalog hàng loạt bằng LLM tác giả (M2 offline, không người duyệt; ADR 0014) | bộ hiệu chuẩn S9 đạt |

**Lô mẫu:** Lô A = 8 mẫu ưu tiên; Lô B = 9; Lô C = 4 (Phase 3 §3). Đợt 1 (3A) dựng **3 mẫu của Lô A** (`amgm-semicircle`, `cs-projection`, `secant-tangent`) để chứng minh toàn hệ; 3B hoàn thành Lô A và làm 1–4 mẫu Lô B (sau 3B tổng 9–12 mẫu).

Trigger (ngưỡng do panel đặt [Inference]):
- **Hạ Manim xuống phụ (về Y cho topic/toàn bộ):** kiểm kê thấy <5 topic thật sự cần chuyển động liên tục; hoặc clip 30 s@720p mất >3 phút trên 2 vCPU; hoặc spike tiếng Việt hỏng; hoặc >30% clip trượt cổng QA; hoặc LLM tác giả không đạt RSR@3 ≥ 90% sau 2 lần đổi model/prompt.
- **Nâng topic từ Z lên X:** đợt 1 qua rubric, hội đồng LLM chấm ≥4/5, có số đo chi phí token và thời gian render mỗi clip.
- **Mở M2 trên đường phục vụ** (vẫn bị loại): RSR@3 ≥90% và đúng-toán do hội đồng LLM chấm ≥90% trên ≥50 prompt tiếng Việt; red-team sandbox 0 thoát; ≥30% yêu cầu rơi ngoài catalog qua 2 đợt liên tiếp — cần ADR mới.
- **Chuyển LaTeX → Typst:** `MathTypst` qua bộ công thức của các mẫu và image nhỏ đi ≥30%.

## Phản biện đã ghi nhận (rủi ro của quyết định)

- Quyết định "hướng chính" đi trước kiểm kê topic; `curriculum-math-vn` chưa viết → đợt 2 chỉ mở rộng khi S5 xong.
- Video tuyến tính đi ngược lõi sư phạm (dự đoán, lùi, đổi input) → bù bằng: hold + ≥1 câu hỏi dự đoán sau mỗi 2 chapter, quiz sau clip, chọn biến thể preset, walkthrough "lab" đổi số, ghi rõ "đây là trực giác, chứng minh chặt ở bước sau".
- Khối lượng sản xuất (21 mẫu, 63–105 clip khi 3–5 preset/mẫu) → Lô A 8 → Lô B 9 → Lô C 4 (Phase 3 §3), khuôn chung (palette, axes, hold), LLM điền khuôn offline, cắt mẫu giá trị thấp.
- Giấy phép: Manim MIT, font OFL, Typst Apache-2.0; FFmpeg/x264 trong PyAV có thể thuộc họ GPL — nghĩa vụ khi phát hành image lên registry [Unverified]; đây không phải tư vấn pháp lý.

## Consequences

**Positive:** đúng quyết định của user; chỉ mã của ta chạy (không RCE); tái dùng hạ tầng video/export/async sẵn có; không đổi package `@openmaic/*`; đường nâng cấp rõ ràng (đợt 1→4).

**Negative:** phải vận hành thêm image Manim/CI (và container dịch vụ ở đợt 3); công viết mẫu và người duyệt Toán/Manim; clip câm phụ thuộc lời thầy; Q&A chỉ biết vị trí qua chapter (L0) cho tới khi có L1.

**Follow-up:** Phase 3 SCHEMA viết lại theo ADR này; ADR 0006 thêm `InputSpec.enum`; ADR 0009 thêm Q&A cho clip. **2026-09-30:** thay `SceneEnricher` bằng tool `generate_clip_scenes` (ADR 0011); cách ly `manim-service` theo Decision 5; asset clip đã phát hành không bao giờ bị xoá (OPERATIONS §5).
