# ADR 0002: Trực quan hoá giải thuật — SVG/DOM tự viết trên mô hình "trace + renderer"; không thêm dependency

- **Status**: Accepted (viết lại 2026-09-29; bổ sung khảo sát 2026-09-30; quyết định bằng SWOT theo chỉ thị của user)
- **Date**: 2026-09-28; viết lại 2026-09-29; bổ sung 2026-09-30
- **Deciders**: User (yêu cầu gốc: "trực quan hoá giải thuật thì tôi chưa biết thư viện nào tốt") + Architect panel
- **Liên quan**: [0001](0001-step-engine-immutable.md), [0005](0005-widget-hosting-model.md), [0007](0007-manim-and-math-visualization.md), [../NFR](../NFR.md)

> **Tóm tắt:** không có thư viện giải thuật chuyên dụng nào hợp ràng buộc (chạy code server / proprietary / cũ); mọi công cụ đều là *trace + renderer*, nên tự viết SVG/DOM là đủ; **không thêm dependency**; GSAP hoặc d3-hierarchy (inline) chỉ khi chạm trigger T1–T3.

## Câu hỏi của user và trả lời ngắn

> "Trực quan hoá cho giải thuật lập trình thì tôi chưa biết thư viện nào tốt."

**Không có thư viện giải thuật chuyên dụng nào phù hợp với ràng buộc của OpenMAIC.** Các công cụ nổi tiếng đều theo cùng một kiến trúc: *chạy giải thuật → ghi ra danh sách bước (trace) → renderer đơn giản vẽ từng bước*. Phần "trace" chính là ADR 0001/0006 của ta. Phần còn lại chỉ là vẽ SVG và layout cây/đồ thị nhỏ — tự viết đủ dùng. Nếu buộc phải chọn một thư viện: **GSAP** (timeline có seek) hoặc **d3-hierarchy** (layout cây) — chỉ khi chạm ngưỡng trigger ở dưới.

## Context — ràng buộc kỹ thuật (đã kiểm chứng)

| Ràng buộc | Nguồn |
| --- | --- |
| Widget chạy trong iframe `srcDoc`, `sandbox="allow-scripts allow-forms allow-popups"`, origin `null`. | `components/scene-renderers/InteractiveIframeHost.tsx:281` |
| Export MP4 chụp widget trong trang có CSP `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'none'; frame-src 'none'` → script/asset ngoài phải được inline sẵn. | `lib/video-export-app/prepare-interactive-html.ts:36+` |
| Export HTML/PPTX có bộ inline asset cho `<script src>`. | `lib/export/inline-assets.ts` |
| `d3-*`, `three`, `cytoscape`… **không** phải dependency của repo; `three` chỉ nạp qua CDN trong widget `visualization3d`. | `package.json`, `templates/visualization3d-content/system.md` |
| `public/vendor/gsap.min.js` (72.927 B, 3.15.0) đã được commit, **chỉ** dùng cho video-export; `gsap` là devDependency. | `lib/video-export/emit-hyperframes/index.ts:7`, `package.json:190` |

## Khảo sát công cụ giải thuật

Số liệu do chuyên gia khảo sát báo ngày 2026-09-29 từ GitHub API/npm registry; tôi chưa kiểm lại từng số ([Unverified] cho từng con số cụ thể; kết luận định tính đã đối chiếu nhiều nguồn).

| Công cụ | Vì sao không dùng được |
| --- | --- |
| Algorithm Visualizer (algorithm-visualizer.org) | Chạy code người dùng ở backend → trái ADR 0003. Repo push cuối 2024-06-09. |
| VisuAlgo | Site proprietary, ToS cấm host lại/fork. |
| Python Tutor | Thực thi code ở server → trái ADR 0003; repo gốc bị gỡ (nguồn thứ cấp); fork MIT push cuối 2020. |
| JSAV / OpenDSA (MIT) | Mô hình slideshow undo/redo đáng học, nhưng gói jQuery/jQuery UI/d3 v7/dagre, bản npm cuối 2018. |

## Khảo sát thư viện đồ hoạ chung (chỉ các ứng viên đáng xét)

| Thư viện | License | Kích thước min (gzip) | Ghi chú |
| --- | --- | --- | --- |
| GSAP 3.15.0 | "Standard no-charge", **proprietary** | ~28 KB | Timeline có seek/progress. Điều khoản chỉ đọc bản tóm tắt [Unverified]; repo là MIT nên cần xác nhận trước khi phát tán trong widget. |
| d3-hierarchy | ISC | ~5,8 KB | Chỉ layout cây; hàm thuần. |
| Motion 13.x | MIT | ~49 KB | `animate().time` gán được. |
| Anime.js 4.x | MIT | ~41 KB | v3→v4 breaking; LLM dễ lẫn API [Inference]. |
| Cytoscape 3.x | MIT | ~137 KB | Layout đồ thị dựng sẵn (grid, circle, breadthfirst, cose). |
| Mermaid 12 | MIT | ~1,6 MB (raw 5,6 MB) | Text → SVG tĩnh, không có "bước". |
| React Flow, Excalidraw | MIT | — | Cần React → loại (ADR 0005). |
| Motion Canvas | MIT [Unverified] | — | Thư viện TypeScript dựng **video** hoạt hình bằng code (generator + timeline). Hợp để dựng clip offline, không hợp làm widget tương tác trong iframe. Thêm 2026-09-30 theo review. |
| Revideo | MIT [Unverified] | — | Nhánh của Motion Canvas, thiên về render video tự động phía server [Unverified]. Cùng vai trò với Hyperframes đã có (ADR 0007 §9). |

**Nên tham khảo gì** (trả lời trực tiếp câu hỏi của user; tham khảo ý tưởng, không nhúng):

| Nguồn | Học được gì |
| --- | --- |
| VisuAlgo | Cách trình bày từng bước, bảng biến, câu giải thích ngắn cạnh hình. |
| JSAV / OpenDSA | Mô hình slideshow có undo/redo, bài "chạy tay" có chấm. |
| Algorithm Visualizer | Tách *tracer* (ghi bước) khỏi *renderer*: chính là ADR 0001/0006. |
| Manim (3Blue1Brown) | Chuyển động liên tục cho Toán (ADR 0007). |
| Motion Canvas / Revideo, Hyperframes | Nếu cần MP4 dựng từng bước cho walkthrough (trigger T3). |

## SWOT

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| **P-A. SVG/DOM viết tay (chọn)** | 0 KB thêm; frame là snapshot nên nhảy/tua đơn giản (ADR 0001); DOM có sẵn KaTeX, UTF-8 tiếng Việt; không phụ thuộc bên ngoài; qua được export/CSP video vì tự chứa. | Tự viết layout cây/đồ thị và animation; mỗi visualizer tốn công. | Bộ visualizer + shell dùng chung cho Toán (Phase 3). | Chuyển động liên tục mượt (tween) khó hơn; MP4 chỉ chụp một khung tĩnh (xem ADR 0007 và ARCHITECTURE §12). |
| **P-B. + một thư viện, inline** (GSAP / d3-hierarchy) | Seek timeline; layout cây chuẩn; inline như `gsap.min.js` đã có nên qua CSP video-export. | Thêm điều khoản (GSAP proprietary); thêm bước build/inline; kích thước widget tăng. | GSAP cùng hạ tầng Hyperframes đã có. | Đổi license/phiên bản; LLM/dev lẫn API. |
| **P-C. Nhúng công cụ chuyên dụng** | Có sẵn nhiều thuật toán. | Chạy code server / proprietary / legacy; không offline. | Học mô hình slideshow của JSAV. | Trái ADR 0003; gửi dữ liệu học sinh cho bên thứ ba; không export được. |
| Manim (video) | Xem **ADR 0007**. | | | |

## Decision

1. **P-A cho Phase 1–2.** Visualizer là module DOM/SVG thuần trong iframe; không thêm npm dependency.
2. **Không dùng CDN cho thư viện mới.** Nếu chạm trigger, **inline** (không `<script src>`), theo tiền lệ `public/vendor/gsap.min.js`.
3. **Trigger sang P-B** (ngưỡng do panel đặt [Inference], đổi được bằng ADR):
   - T1: một visualizer cần tween liên tục có seek mà CSS transition không diễn tả được → GSAP (kèm ADR về license).
   - T2: layout tự viết vượt ~150 dòng hoặc lỗi layout lặp lại từ 2 lần → `d3-hierarchy` (cây) hoặc Cytoscape (đồ thị tổng quát).
   - T3: cần MP4 dựng từng bước cho walkthrough → xem ADR 0007 (Hyperframes trước, GSAP sau).
4. **Đóng gói runtime**: Rollup + `rollup-plugin-typescript2` (root đã có) hoặc công cụ tương đương ở spike Q1 — *không* dùng `@rollup/plugin-typescript` (chỉ nằm ở devDeps của `renderer`/`editor`/`importer`, và config `renderer` xuất ESM `preserveModules`, không phải IIFE → không phải tiền lệ).
5. **Kiểm tra nhu cầu trước khi thêm** — quy tắc thêm visualizer: một module `VisualizerRenderer`, một entry build, quy ước key `highlights/pointers`, một test trình duyệt (ARCHITECTURE §8).

## Consequences

**Positive:** bundle host không đổi; không rủi ro lockfile/license; widget tự chứa → export/import như widget khác; đáp ứng câu hỏi của user bằng một kết luận có căn cứ.

**Negative:** phải tự viết mọi visualizer và layout; chuyển động chỉ ở mức CSS transition.

**Follow-up:** spike Q1 (ADR 0005) xác nhận đường build runtime.
