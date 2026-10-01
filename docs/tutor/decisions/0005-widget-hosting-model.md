# ADR 0005: Kiến trúc tích hợp và mở rộng — widget HTML tự chứa + registry "gói môn học" ở tầng app

- **Status**: Accepted (viết lại 2026-09-29; sửa 2026-09-30 theo ADR 0011 và 0013; quyết định bằng SWOT theo chỉ thị của user)
- **Date**: 2026-09-29; sửa 2026-09-30
- **Deciders**: User (yêu cầu: "đúng kiến trúc OpenMAIC", "dễ mở rộng", "SWOT") + Architect panel
- **Thay thế**: mọi phần "React `WalkthroughWidget`/`usePlayer`/registry `SubjectTutor`" và phần "option `widgetContentProvider` trong package" của các bản trước. **Bị thay một phần bởi [0011](0011-entry-point-workbench-tool.md)**: bỏ hàm bọc `generateSceneContentWithWidgets`, call site classic và `SceneEnricher`; nội dung do tool tất định tạo.
- **Liên quan**: [0006](0006-deterministic-trace-catalog.md), [0007](0007-manim-and-math-visualization.md), [0010](0010-no-student-code-enforcement.md), [0011](0011-entry-point-workbench-tool.md), [0013](0013-provider-scene-lifecycle.md), [../ARCHITECTURE](../ARCHITECTURE.md), [../INTERFACES](../INTERFACES.md)

> **Tóm tắt:** widget là **HTML tự chứa** trong iframe sandbox. Mở rộng bằng **registry ở tầng app** (`WidgetProvider`, `SubjectPack`), chạy trên **vỏ `widgetType:'simulation'`** + `widgetConfig.kind`. **Không đổi package `@openmaic/*`.** Scene do **tool tất định** tạo (ADR 0011); provider nhận scene theo nội dung (ADR 0013). Thêm một môn dùng lại phương tiện sẵn có = thêm thư mục + một dòng đăng ký; thêm một **loại phương tiện** mới = ADR mới + tool mới.

## Context — sự thật về kiến trúc OpenMAIC (đã đọc code)

| Sự thật | Nguồn |
| --- | --- |
| Interactive scene = HTML hoàn chỉnh render bằng iframe `srcDoc`, sandbox không `allow-same-origin`. | `packages/@openmaic/dsl/src/interactive.ts`; `components/scene-renderers/InteractiveIframeHost.tsx:281` |
| `WidgetType` là union đóng 6 giá trị; `isInteractiveContent` và `validateScene` từ chối giá trị lạ. | `packages/@openmaic/dsl/src/interactive.ts:5-26,65-77`; `packages/@openmaic/dsl/src/validate.ts:200-216` |
| Agent **không có bước outline**: nó tự gọi tool `generate_scene`; tool nhận `widgetType` (5 giá trị) và `widgetOutline: Unknown`. Đường "classic" (`scene-outlines-stream` → `scene-content`) **không nhận skill**. | `lib/server/agent-runtime/generation-tools.ts:44-70`; `lib/server/agent-runtime/course-tools.ts:240` |
| `outline-constraints.json`: `skillOutlineContext`/`renderConstraints` **không có caller production**; kiểm tra duy nhất là `checkScenesAgainstSkill` **sau khi ghi** scene, chỉ báo `skillViolations`, và bỏ `requiredWidgetOutlineFields`. → `SKILL.md` là kênh chỉ dẫn LLM duy nhất; ràng buộc chỉ là cảnh báo. | `lib/server/agent-runtime/skills.ts:719,879-890`; `lib/server/agent-runtime/generation-tools.ts:458-461` |
| Công cụ `read` của agent chỉ đọc trong thư mục skill có `SKILL.md`. Test buộc mọi thư mục trong `skills/agent-runtime` phải load được thành skill, và `title` của skill phải chứa chữ Hán; `workbench-i18n` buộc `skill.title.<handle>` ở 12 locale. | `lib/server/agent-runtime/skills.ts:596-604`; `tests/agent-runtime/skills.test.ts:241-268`; `tests/workbench/workbench-i18n.test.ts:116-137` |
| Có sẵn kênh **iframe → host**: message `{__maicInteractive:true, kind}` (`runtime-error`, `element-picked`, …); kind lạ bị bỏ qua. | `components/scene-renderers/InteractiveIframeHost.tsx:40-50,205-225` |
| Host → iframe: `HIGHLIGHT_ELEMENT`, `SET_WIDGET_STATE {state,content}`, `ANNOTATE_ELEMENT`, `REVEAL_ELEMENT`. | `lib/action/engine.ts:872-902` |
| Stage sinh action cho scene interactive chỉ cho 4 action `widget_*`, giới hạn "3-8 items", nhận `widgetConfig` (JSON) và Element Inventory (bỏ `<script>/<style>`, `MAX_IDS=60`). | `packages/@openmaic/generation/templates/interactive-actions/system.md:59,109`; `packages/@openmaic/generation/src/scene-generator.ts:1352,1734` |
| `extractWidgetConfig` chỉ chạy một lần, sau `aiCall`, nên `widgetConfig` do provider trả không bị ghi đè; `scene-builder` chép nguyên `widgetConfig`. | `packages/@openmaic/generation/src/scene-generator.ts:1282`; `packages/@openmaic/generation/src/scene-builder.ts:92-93` |
| Dockerfile chỉ COPY `packages/`, `scripts/` trước `pnpm install` → không build được runtime ở `postinstall`. | `Dockerfile:34-46` |
| Local `dsl` 0.11.1, `generation` 0.3.7; `check:package-versions` bắt buộc bump khi package đổi; bump merge vào `main` kích hoạt publish. Remote `main` đang track `upstream` (THU-MAIC). | `scripts/check-package-version-bumps.mjs`; `.github/workflows/publish-packages.yml` |

## Điểm mở rộng chính thức và điểm phải sửa lõi

| Mảng | Loại |
| --- | --- |
| Skills (quét thư mục, `SKILL.md`, `references/`) | **Chính thức** |
| `widgetConfig` (túi mở, "thuộc app domain") | **Chính thức** |
| `sceneEditorRegistry` (theo `SceneType`) | Chính thức; không có tầng theo `widgetType` |
| Ngôn ngữ i18n mới | Chính thức; thêm **key** = sửa cả 12 file |
| `WidgetType`, `SceneType`, `ActionType`, `PromptId` | **Sửa lõi + đổi package publish** |
| Whiteboard `wb_*` | Sửa lõi ≥8 nơi |
| Video export | Sửa lõi |

Tiền lệ "gói miền" duy nhất (`vocational`/`taskEngineMode`) đã sửa lõi ở ≥12 chỗ, gồm 2 package publish — bằng chứng cho chi phí của E2.

## SWOT các phương án

| | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| **E1. Vỏ `widgetType:'simulation'` + hàm bọc** (`widgetConfig.kind:'walkthrough'`) | Không đổi package, không bump/publish; đảo ngược dễ; tool schema hiện tại đã chấp nhận (`widgetOutline: Unknown`). | Skill không phân biệt được walkthrough với simulation LLM (không cần: cả hai đều được phép); editor hiện nhãn "Simulation" và xoá `widgetOutline` khi đổi loại; phải sửa call site. | Nâng lên E2 sau nếu cần. | Không có (widget LLM sinh là **tính năng mong muốn**, ADR 0003); chỉ `code` bị chặn bằng cờ (ADR 0010). |
| **E2. `walkthrough` hạng nhất** (dsl + generation) | Ràng buộc/schema đúng bản chất; UI phân biệt loại. | Đổi 2 package publish + bump; publish khi push `main` (fork có thể thiếu `NPM_TOKEN` [Unverified]); lớp học export mở không được trên upstream (`isInteractiveContent` từ chối); lệch nhánh với upstream. | Đề xuất PR ngược upstream. | Xung đột phiên bản; bản local đang lạc hậu so với registry [Unverified]. |
| **E3. Registry "provider + gói môn học" ở app** | Theo đúng kiểu `sceneEditorRegistry`; không đổi package; **mỗi môn = một thư mục**, thêm Toán chỉ thêm file; có hook cho `actions()` (kể chuyện tất định, bỏ giới hạn 3-8) và `describe()` (Q&A). | Cần cửa vào sinh nội dung (hàm bọc của E1); thêm một dòng đăng ký/môn. | Nhà cung cấp mới (clip Manim, ADR 0007) là provider khác; nhưng mỗi **loại phương tiện** mới vẫn cần tool + trường `SubjectPack` (sửa 2026-09-30). | Over-engineering nếu chỉ có một môn — giảm bằng cách giữ registry ~40 dòng. |
| **E4. Package mới `@openmaic/tutor`** | Cô lập. | Phải đăng ký `OPENMAIC_PACKAGES`, workflow publish, `postinstall`, `workspace:*`; scope `@openmaic` thuộc upstream. | — | Chi phí phát hành cao; không đảo ngược (tên npm). |

## Decision

**E3 chạy trên vỏ E1**: registry ở app + vỏ `widgetType:'simulation'`. `widgetConfig.kind` là bộ phân biệt ổn định: mọi đọc/ghi qua `kind`, nên nâng lên E2 chỉ đổi một trường. **Phase 1–3 không đổi package nào.**

**Sửa 2026-09-30 (ADR 0011, 0013):** "hàm bọc của E1" không còn. Cửa vào là tool agent `generate_walkthrough` (và `generate_clip_scenes` ở Phase 3). Tool gọi thẳng provider rồi ghi scene. Hệ quả:
- E1 chỉ còn là **vỏ dữ liệu**; không cần sửa call site classic.
- E3 là registry nhận scene **theo nội dung**.
- [Inference] Mọi bước 1a–3D vẫn không cần đổi package. Có một lưu ý: `convertInteractiveConfigToWidget`/`inferWidgetType` là hàm private của package (`packages/@openmaic/generation/src/scene-generator.ts:135,169,259`), nên tool phải tự gán `widgetType` + `widgetConfig`, không gọi lại các hàm đó.

### Cấu trúc thư mục và contract

```
lib/widgets/                  # lõi mở rộng, làm một lần, KHÔNG đăng ký kiểu side-effect
  types.ts  registry.ts  policy.ts  describe.ts  index.ts   # (generate.ts bỏ — ADR 0011)
lib/tutor/                    # engine walkthrough dùng chung mọi môn
  engine/  protocol/  runtime/  build/  provider.ts
lib/subjects/
  index.ts                    # danh sách gói khai báo tường minh (HMR-safe)
  cp/   pack.ts  catalog/*.ts  messages/{vi-VN,en-US}.ts
  math/ (Phase 3)
skills/agent-runtime/<skill>/{SKILL.md, outline-constraints.json (tuỳ chọn), references/...}
tests/widgets/  tests/tutor/  tests/subjects/<id>/
```

Chữ ký đầy đủ (nguồn chính thức): [INTERFACES §5](../INTERFACES.md). Tóm tắt:

```ts
interface WidgetProvider {
  readonly id: string                                          // 'walkthrough' | 'clip'
  claimsScene(scene: Scene): boolean                           // theo nội dung: widgetConfig.kind (ADR 0013)
  build(req: BuildRequest, ctx: WidgetContext): BuildResult    // tool gọi; không gọi LLM
  actions(scene: Scene, ctx: WidgetContext): Action[]          // generate_actions / duplicate_scene
  describe(scene: Scene, runtime?: WidgetRuntimeState): string // Q&A (ADR 0009); chữ lấy từ catalog
}
interface WidgetContext { readonly locale: Locale; readonly languageDirective?: string }   // Locale = string, có fallback

interface SubjectPack {
  readonly id: string                          // 'cp' | 'math' | ...   (KHÔNG là union đóng)
  readonly skillId: string
  readonly walkthroughs: readonly WalkthroughEntry[]     // ADR 0006
  readonly clips?: readonly ClipEntry[]                  // ADR 0007 (Toán)
}
```

**Thêm một môn** dùng phương tiện sẵn có (walkthrough, clip), ví dụ Toán: thêm `lib/subjects/math/`, một dòng trong `lib/subjects/index.ts`, một skill + `references/`. Engine, runtime, provider, Q&A và policy không đổi.

**Thêm một loại phương tiện mới** (ngoài walkthrough/clip) là việc khác: cần ADR mới, một provider mới, một tool tạo scene mới và một trường mới trong `SubjectPack`. `SubjectPack` là record đóng theo loại phương tiện; checklist "thêm môn" chỉ đúng khi dùng lại phương tiện có sẵn.

**Quy tắc registry:**
- `walkthroughId`/`clipId` **duy nhất trên mọi gói**.
- Mỗi scene được **đúng một** provider nhận.
- Vi phạm thì ném lỗi lúc khởi động (khác tiền lệ ghi đè kèm cảnh báo ở `lib/edit/scene-editor-registry.ts:7-19`). Có test.

Chặn widget `code` là cờ triển khai chung, không phải chính sách theo gói (ADR 0010).

### Quyết định kỹ thuật kèm theo

- **Widget = HTML tự chứa**: shell DOM tĩnh (id `#wt-*`), CSS inline, runtime inline, dữ liệu nhúng dạng JSON, không React/npm của host trong iframe.
- **Hai khối JSON**: `widget-config` (nhẹ; đủ các trường bắt buộc ở ADR 0013 §5; `beats` là của `presetId`) đi vào `widgetConfig` + prompt; `walkthrough-data` (đầy đủ frame/pseudocode/C++/Python/nhãn) chỉ runtime đọc.
- **Q1 — phân phối runtime**: sinh một module TS chứa chuỗi runtime (theo tiền lệ `katex-assets.ts` "GENERATED FILE" + `scripts/generate-video-export-katex.mjs`), commit vào repo, có script sinh và test kiểm độ mới. Không `readFileSync` lúc chạy, không build ở `postinstall` (deps stage chỉ COPY `packages/`, `scripts/`). Build trong builder stage cũng có thể khả thi [Inference: chưa đọc hết `Dockerfile`], nhưng ta chọn **file sinh sẵn** để không thêm bước build và để test chạy không cần build. Sinh **theo visualizer** (`runtime-<visualizer>.ts`: core + visualizer) và, khi entry bật `customInput` (ADR 0008 §2), **theo entry** (`entry-<id>.ts`: `steps` + `inputSpec` + bảng `Messages`, vài KB) — builder ghép hai phần. Công cụ build: spike (ADR 0002 §4).
- **Q2 — đã trả lời**: `widgetConfig` do provider trả không bị ghi đè (bảng Context).
- **Q3 — locale**:
  - Trong đường agent, tool `generate_walkthrough` nhận `locale` tường minh nếu agent truyền. Nếu không, dùng `resolveLocale(languageDirective)`: có dấu tiếng Việt hoặc chứa "Vietnamese" → `vi-VN`; nói tiếng Anh → `en-US`; mặc định `vi-VN`.
  - `Locale` là `string`. Nội dung catalog có bảng `vi-VN`, `en-US`; locale khác dùng `en-US`. Thêm locale không đổi kiểu.
  - Có test.
- **Cửa vào** (sửa 2026-09-30, ADR 0011): tool `generate_walkthrough` kiểm id/preset trước, trả lỗi kèm `validIds`, rồi gọi `provider.build()`. **Không** bọc `generateSceneContent` và không sửa call site classic. `generate_scene` gặp `walkthroughId` thì trả lỗi `use-generate-walkthrough`.
- **Call site sinh action cho scene walkthrough đã có:** `generate_actions` (`lib/server/agent-runtime/generation-tools.ts:513-537`) và `duplicate_scene` (`:581`) đi qua `provider.actions(scene)` khi `claimsScene`. Các call site classic (`lib/server/classroom-generation.ts:631`, `app/api/generate/scene-actions/route.ts:160`) không bao giờ gặp walkthrough vì classic không tạo được nó.
- **Công thức toán** (sửa 2026-09-30):
  - **Không** dùng `postProcessInteractiveHtml`: nó chèn KaTeX từ CDN (`interactive-post-processor.ts:72-74`, `trust:true` ở `:86`), làm HTML mất tính tự chứa, và đổi `$…$` ngoài `<script>`.
  - Công thức trong catalog được **dựng sẵn trên server** bằng `katex.renderToString` (`katex` đã là dependency, `package.json:110`). Iframe chỉ cần CSS + font KaTeX inline, theo tiền lệ `lib/video-export/emit-hyperframes/katex-assets.ts`. `temml` (MathML, `package.json:156`) là phương án dự phòng [Inference: chất lượng MathML cần đo].
  - Spike Q8 thu hẹp lại thành "kích thước CSS + font inline và độ đúng khi export".
- **Không có registry `SubjectTutor` kiểu cũ**; "SubjectTutor" là tên tính năng.

### Rủi ro và cách giảm

| # | Rủi ro | Giảm |
| --- | --- | --- |
| R1 | `null` → 500 → client thử lại 5 lần (~31 s [Unverified]) | Không còn áp dụng cho walkthrough: tool tất định trả lỗi có cấu trúc (ADR 0011). |
| R2 | `postProcessInteractiveHtml` (trên) | Không dùng; công thức dựng sẵn trên server. Test: HTML sinh ra không chứa `<script src`, `</script` lạ, `<!--`; JSON thoát `<`. |
| R3 | `widgetConfig` lớn vào prompt | Chỉ `beats` của `presetId`, nhãn ≤80 ký tự; frame không bao giờ vào `widgetConfig`. |
| R4 | MP4 chụp khung tĩnh | ARCHITECTURE §12. |
| R5 | iframe bị đẩy khỏi pool (`IFRAME_POOL_CAP=3`) reset về frame 0; message tới trước khi iframe load | Bắt tay `widget-ready` + host gửi lại trạng thái mong muốn cuối (ADR 0013); thứ tự `[ask] → setState → narration`. |
| R6 | `MAX_IDS=60` của Element Inventory | Không id từng dòng code: dùng `data-line`. |
| R7 | `widgetConfig` va chạm sanitize | Không object có `type ∈ {text,shape,table,latex}`, không key `teacherActions` (`sanitize-scene-content.ts:251-274`; `slide-schema.ts:56-75`). |
| R8 | Skill mới vướng test | `title` frontmatter chứa chữ Hán + `skill.title.<handle>` ở 12 locale (ADR 0006 §Skill). |

## Trigger đổi sang E2 / E4

- **E2:** Q4/eval (ADR 0006) thất bại nếu không sửa template; classic generator phải tự sinh walkthrough; hoặc upstream chấp nhận `walkthrough` hạng nhất. Khi đó: một PR đổi `dsl` (PATCH) + `generation` (PATCH), số phiên bản = cao nhất trên registry + 1 lúc rebase; cập nhật snapshot prompt.
- **E4:** khi có consumer ngoài repo.

## Consequences

**Positive:** đúng kiến trúc hiện có; không chạm package publish; thêm một môn dùng lại phương tiện có sẵn chỉ thêm file; Q&A và policy có điểm móc rõ ràng.

**Negative:**
- Nhãn "Simulation" trong editor.
- Scene cũ phải migrate `widgetConfig.kind` nếu nâng lên E2.
- Thêm loại phương tiện mới cần sửa `SubjectPack` + ADR.
- Tính năng chỉ có ở workbench (ADR 0011).
