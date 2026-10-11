# Relative persisted media URLs when PUBLIC_APP_ORIGIN is unset or invalid (B29)

**Label.** This report contains [Unverified] and [Inference] items, so the whole report carries that label. [Unverified] means not checked in code, or not runnable here. [Inference] means reasoned from code, not executed. Unlabelled facts were read at the cited line.

**Snapshot.** HEAD `9368ff1` (read-only `git rev-parse`). The working tree changed during the run: `README.md` was modified at 05:54:45, after the first read, so its line is taken from the later read. Other cited files show no modification after they were read.

**Method.** Read-only inspection. No test run, no package install, no state-changing git command, no browser or render run.

## 1. Summary and recommendation

**Recommendation: NO-GO until check C1 (section 10.1) passes.** [Inference] The code supports storing relative references: in-app browser readers pass a path such as `/api/classroom-media/...` through unchanged, no code fetches a stored URL on the render path, and the agent runtime already writes relative references. Nothing was run, so whether a browser loads a relative reference on the classroom page is [Unverified].

Findings:
1. One function writes origin-baked media URLs: `mediaServingUrl`, `lib/server/classroom-media-generation.ts:77-79`. It runs only in the classic generation job (`lib/server/classroom-generation.ts:677`, `:696`). The scenes persist at `:711-718`.
2. Relative writes already exist (section 3.2).
3. `lib/server/media-origin.ts` is not on the production path. `resolveMediaServingOrigin` (`:63-70`) and `requestOrigin` (`:76-78`) have no production caller. Only tests call them.
4. No code in `render-service/src` fetches a URL taken from archive content. The archive holds `assets/` paths only. Relative storage does not reach the render service.
5. The classroom ZIP does not fetch concrete image or video URLs, in either form (`lib/export/classroom-zip-utils.ts:196-198`; `lib/media/resolve-stored-bytes.ts:166`). This gap predates B29. B29 neither causes it nor closes it.
6. Existing absolute values stay absolute. A browser that holds a stage copy keeps it, because the server copy is read only when no local stage exists (`lib/classroom/load-classroom.ts:136-158`).
7. The converter described at `classroom-media-generation.ts:44-53` is not wired. `convertAssetRefs` has no production caller. It appears only at its injection point (`lib/document-store/migration.ts:52`, `:114-116`) and in `tests/document-store/migration.test.ts`.

## 2. Background claims checked

| # | Background claim | Verdict | Evidence |
|---|---|---|---|
| B-1 | Classroom and agent-runtime media URLs are built from the request origin by `public-origin.ts` and `media-origin.ts` | Partly false | Classic URLs take `baseUrl` from `buildRequestOrigin` → `requestPublicOrigin` (`lib/server/classroom-storage.ts:96-98`; `lib/server/classroom-job-runner.ts:16`; `classroom-media-generation.ts:77-79`). Agent-runtime URLs are relative (`classroom-media-bytes.ts:52`; `generate-image.ts:176`; `generate-video.ts:210`). `media-origin.ts` has no production caller. |
| B-2 | The create route calls `buildRequestOrigin` | True | `app/api/classroom/route.ts:92`. The result builds only the returned share link (`route.ts:104-108`; `classroom-storage.ts:173`). The route stores no media URL. |
| B-3 | The render service is reached through `RENDER_SERVICE_URL` | True | `lib/server/render-service.ts:15-18`; `app/api/export-video/render/route.ts:48-51`. |
| B-4 | The render service receives a ZIP from that route | True | `route.ts:67-77` forwards the raw multipart body to `${url}/render`. The ZIP is built in the browser (`lib/video-export-app/package-zip.ts:53-93`). |
| B-5 | Reviewers recommended relative stored references when unset, resolved at read time | True as stated positions | `scrum/meetings/devils-advocate.md:26`, `:82`; `scrum/meetings/security.md:182`, `:212-213`; `scrum/meetings/qa-rebuttal.md:166-168`. Those notes mark renderer and export behaviour [Unverified]. Read-time resolution is not needed for the in-app readers (section 4). |

## 3. Writers (Q1)

### 3.1 Origin-baked writers

| # | Writer (file:line) | Stored shape | Origin source | Lands in |
|---|---|---|---|---|
| A1 | `lib/server/classroom-media-generation.ts:77-79` (`mediaServingUrl`) | `${baseUrl}/api/classroom-media/<id>/<sub>`, absolute | `baseUrl` from `app/api/generate-classroom/route.ts:43` | feeds A2, A3 |
| A2 | `classroom-media-generation.ts:155`, `:194`; written to slide elements at `:232`, `:241` | element `src`, absolute | as A1 | `data/classrooms/<id>.json` via A4 |
| A3 | `classroom-media-generation.ts:318-319` | `audioId` (plain id) and `audioUrl` (absolute) | as A1 | as A4 |
| A4 | `lib/server/classroom-generation.ts:711-718` → `lib/server/classroom-storage.ts:147-169` | the whole scenes array, including A2 and A3 | none added | `data/classrooms/<id>.json` |
| A5 | `app/api/classroom/route.ts:97-108` | scenes as posted, after sanitize and DSL validation; any URL the caller sends is stored | none added | `data/classrooms/<id>.json` |
| A6 | `lib/classroom/load-classroom.ts:310-312`, wired at `app/classroom/[id]/page.tsx:84` | scenes as received from `GET /api/classroom` | none | browser stage store, IndexedDB (`lib/utils/stage-storage.ts:235-240`) |
| A7 | `classroom-storage.ts:173`; `lib/server/classroom-job-store.ts:205-208` | share `url`, absolute by design | `baseUrl` | job JSON; not media |
| A8 | `app/api/agent/sessions/route.ts:147` → `packages/@openmaic/storage/src/agent-session/pg.ts:549` | session origin column (`:100`; mapped back at `:420`) | `buildRequestOrigin` | session row; no reader found [Inference: grep over `lib/`, `app/`, `packages/@openmaic/storage/src/`] |

### 3.2 Relative writers (already on production paths)

| # | Writer | Stored shape | Callers and notes |
|---|---|---|---|
| R1 | `lib/server/classroom-media-bytes.ts:52` | `/api/classroom-media/<stage>/media/<file>` | `lib/server/agent-runtime/scene-tts.ts:104-112` stores it as `audioId` and `audioUrl`. `material-media.ts:59-72` returns it to the agent as the slide `src`. |
| R2 | `lib/server/agent-runtime/generate-image.ts:176` | relative `src` | `defaultPersistGeneratedImage` |
| R3 | `lib/server/agent-runtime/generate-video.ts:210` | relative `src` | `defaultPersistGeneratedVideo` |
| R4 | `packages/@openmaic/generation/src/scene-generator.ts:368-377` | `src` set to the agent-supplied value (`imageMapping[src]`). Accepted forms: `/path` or `https://` (`lib/server/agent-runtime/generation-tools.ts:145-154`) | Agent input, stored as given |

Excluded: `lib/utils/database.ts:145`, `:235-236` (`ossKey`, an absolute CDN URL from the storage plugin; not origin-derived; outside B29).

### 3.3 Origin rule behind A1

| Setting | Origin written | Code | Test |
|---|---|---|---|
| `PUBLIC_APP_ORIGIN` valid | configured origin | `lib/server/public-origin.ts:26-27` | `tests/server/public-origin.test.ts:39-45` |
| invalid | request URL origin; forwarded headers ignored (test value `http://0.0.0.0:3000`) | `public-origin.ts:27` | `:47-53` |
| unset, `x-forwarded-host` present | `${x-forwarded-proto or 'http'}://${x-forwarded-host}`, not validated | `public-origin.ts:29-32` | `:55-61` |
| unset, no forwarded host | request URL origin | `public-origin.ts:33` | `:63-67` |

Security note: when unset, a forwarded host is written into the classroom file (A4). `GET /api/classroom` serves any classroom by id (`route.ts:82-83`, `:156`), so other viewers receive the stored value. [Unverified] exploitability. [Inference] Relative storage removes the stored origin in both the unset and invalid cases.

## 4. Readers and verdicts (Q2)

Relative means a path such as `/api/...`. The base is the page origin: `next.config.ts` sets no `basePath` or `assetPrefix` (grep: none).

| ID | Reader (file:line) | Relative as-is? | Absolute, other origin | Verdict |
|---|---|---|---|---|
| RD1 | Slide image `<img>`: `components/slide-renderer/components/element/ImageElement/BaseImageElement.tsx:123-124` ← `useResolvedImageSrc.ts:40-67`, `:85-99` ← `lib/media/resolve-media-ref.ts:27-39`, `:119-123` | Yes. `isConcreteMediaAddress` matches a leading `/` (`:30`). Task lookup is skipped for concrete values (`useResolvedImageSrc.ts:49`). | Passed to `<img>`. [Inference] image display is not CORS-bound. The access cookie is not sent cross-origin (RD17). | ACCEPTS |
| RD2 | Slide video: `components/slide-renderer/components/element/VideoElement/BaseVideoElement.tsx:169-174` ← `useResolvedVideoMedia.ts:29-37` | Yes, same resolver | As RD1 | ACCEPTS |
| RD3 | Slide background: `lib/hooks/use-slide-background-style.ts:23-24`, `:37-44` | Yes, if no whitespace (`resolve-media-ref.ts:29`). The CSS is unquoted `url(${src})`. | As RD1 | ACCEPTS, with no whitespace or parentheses |
| RD4 | Legacy audio playback: `lib/utils/audio-player.ts:104-133`; `lib/playback/engine.ts:626`; `lib/action/engine.ts:343` | Yes. `fetch(legacyUrl)` resolves against the document (`audio-player.ts:113`) | On fetch failure the URL goes to a media element (`:125-131`) | ACCEPTS |
| RD5 | Audio preview: `components/edit/ActionsBar/ActionsBar.tsx:404`, `:416` (`new Audio(src)`) | Yes | As RD4 | ACCEPTS |
| RD6 | Classroom page: `app/classroom/[id]/page.tsx:73-84`; `lib/classroom/load-classroom.ts:261` (`fetch('/api/classroom?id=...')`), `:272-313`; hydration `lib/classroom/pbl-fallback-hydration.ts:15-21`, `lib/edit/slide-schema.ts:85-91`, `lib/pbl/v2/runtime/hydration.ts` | Stored as received. None of the hydration files rewrites `src`, `audioUrl` or `url` (grep). | Stored as received | ACCEPTS, no transform |
| RD7 | PPTX export: `lib/export/use-export-pptx.ts:410-429` (concrete value returned as-is, `:416`); image `fetch` `:633`; video `fetch` `:1122` | Same-origin `fetch` succeeds | Direct `fetch`, no proxy. Failure skips the element (`:634-644`, `:1118-1127`). [Inference] CORS decides. | ACCEPTS relative. Absolute cross-origin depends on CORS. |
| RD8 | Video export collector: `lib/video-export-app/collect.ts:166-179`, `:264`; `lib/media/resolve-stored-bytes.ts:145-148`, `:192-198` (direct `fetch`); legacy audio `lib/video-export-app/timeline-deps.ts:288-290` | Fetched directly; bytes go to `assets/` | Images and video: direct `fetch`, no proxy. Legacy audio: `lib/media/fetch-media-url.ts:53-62` proxies cross-origin. | ACCEPTS relative. [Inference] absolute cross-origin images and video depend on CORS. |
| RD9 | Frame snapshot: `packages/@openmaic/renderer/src/snapshot/index.ts:88`, `:271-272` | Same-origin image draws | Repo comments say a cross-origin image without permissive headers blocks the snapshot. Runtime [Unverified]. | ACCEPTS relative. Absolute cross-origin [Unverified]. |
| RD10 | Classroom ZIP media: `lib/export/use-export-classroom.ts:112-120` → `lib/export/classroom-zip-utils.ts:188-199` (no `taskUrlFallback`). The manifest keeps concrete refs (`lib/media/asset-manifest.ts:23-31`; `packages/@openmaic/dsl/src/asset-manifest.ts:145-159`; `lib/media/collect-stage-asset-refs.ts:107-108`). Concrete values return `null` (`resolve-stored-bytes.ts:166`). | Not fetched | Not fetched | REJECTS both forms (pre-existing) |
| RD10b | Classroom ZIP legacy audio: `classroom-zip-utils.ts:265-306` (`fetchMediaUrl` at `:284`) | Accepted | Proxied when cross-origin | ACCEPTS both |
| RD11 | Render service archive consumer: `render-service/src/main.ts:332-335`; `lib/video-export-app/package-zip.ts:62-89`; emitter `lib/video-export/emit-hyperframes/index.ts:237-238`, `:270`, `:284`, `:663`, `:675` | Never receives a stored URL. The emitter reads no `element.src` (grep). | Same | No stored-URL fetch found. Producer internals [Unverified]: package absent (`render-service/package.json:18`; the producer directory under `render-service/node_modules` is absent). |
| RD12 | Render service `/preview`, called by the agent runtime with the scene unchanged (`lib/server/agent-runtime/scene-preview.ts:66-77`); validation `render-service/src/preview-validation.ts:55-77`, `:211-223` | 422 unless `data:` | 422 | REJECTS, unchanged by B29 |
| RD13 | Agent server replace check: `lib/server/agent-runtime/generate-video.ts:321-337` | Relative prefix matched (`:331`) | Absolute pathname matched (`:333`) | ACCEPTS both (existing precedent) |
| RD14 | Server vision resolver: `lib/persistence/resolve-vision-images.ts:48-50`, `:66-76`, `:83-91`; callers `app/api/generate/scene-content/route.ts:142`, `:250`; `app/api/generate/scene-outlines-stream/route.ts:337-354` | Not "concrete", so sent to the asset resolver as an id and dropped with a warning | Passed through as a URL | REJECTS relative. Callers take PDF image inputs. [Inference] stored classroom refs do not reach them. |
| RD15 | Write-time validation: `app/api/classroom/route.ts:57-68`; `packages/@openmaic/dsl/src/storage.ts:41` (`AssetRef = string`); no `src`, `image` or `video` rule in `packages/@openmaic/dsl/src/validate.ts` (grep) | Accepted | Accepted | ACCEPTS both |
| RD16 | Sanitize on write and read: `lib/server/sanitize-scene-content.ts` (no `src` handling, grep; URL text at `:10` and `:36-43` concerns `javascript:` URLs and CSS `url(`); `route.ts:97-98`, `:156` | Unchanged | Unchanged | ACCEPTS both |
| RD17 | Access-code gate on `/api/classroom-media`: `middleware.ts:64-82`; cookie `SameSite=Lax` at `app/api/access-code/verify/route.ts:79-81` | Same-origin request carries the cookie | [Inference] cross-origin request carries no cookie | [Inference] relative favoured |
| RD18 | Share link: `classroom-storage.ts:173`; `classroom-job-store.ts:205-208` | Not media | Not media | N/A. Must stay absolute. |
| RD19 | External consumers of `GET /api/classroom` JSON and share links | Outside this repository | Outside this repository | [Unverified] |

**Readers that cannot be verified: 2.** These are RD11 (producer internals; package absent) and RD19 (consumers outside the repository). Definition used: a reader is counted when its code, or its consumer, is absent from this checkout. Runtime-only uncertainty (RD7, RD8, RD9, RD17) is listed in section 10.4 and not counted. In-repo readers were traced by code. None was run.

Adjacent note: agent-supplied `/path` values are accepted (`generation-tools.ts:145-147`). Whether the vision call sends them to an external service unchanged was not traced [Unverified]. This is outside stored classroom media.

## 5. Render service finding (Q3)

- **Does it fetch URLs from the archive?** No. A grep over `render-service/src` finds no `fetch(`, `http(s)://` fetch, `goto(` or `file://` navigation tied to archive content. The service reads archive bytes: `render-service/src/main.ts:332-335` (unzip, then submit); `render-service/src/unzip.ts:31`. The preview renderer loads content with `setContent` (`render-service/src/preview-renderer.ts:478`). The only URL-text code, `preview-validation.ts:55-77`, counts references and never fetches.
- **What the archive holds.** Text files and `assets/<planPath>` blobs (`lib/video-export-app/package-zip.ts:62-71`, `:83-89`). The emitter writes only `assets/` references (`lib/video-export/emit-hyperframes/index.ts:237-238`, `:270`, `:284`, `:663`, `:675`).
- **Interactive HTML.** Inlined before packaging (`lib/video-export-app/prepare-interactive-html.ts:237-241`) under a CSP that allows only `data:` and `blob:` for images and media, and blocks connections (`:35`).
- **Egress.** The entrypoint drops new outbound connections (`render-service/docker-entrypoint.sh:40-42`).
- **Conclusion.** [Inference] A relative stored reference cannot break the render path. The browser resolves it during collection, and it never reaches the archive as text.
- **Failure mode if the emitter changed.** The producer would resolve a root-relative path against its own loopback file server (`scripts/egress-smoke.sh:3-4` calls it "the producer's file server"). That server has no `/api/classroom-media` route. [Inference] The emitter must keep writing `assets/` paths.
- **Not verified.** The producer's loader and file server [Unverified]. The package is not installed here.

## 6. Existing absolute data (Q4)

- **Branch points that already accept both forms: 3.** `lib/media/resolve-media-ref.ts:30` (regex), `lib/media/fetch-media-url.ts:53-62` (scheme split), `lib/server/agent-runtime/generate-video.ts:331-333` (prefix or pathname).
- **Branch point that accepts absolute forms only: 1.** `lib/persistence/resolve-vision-images.ts:48-50`. It needs a relative branch if relative values can reach it.
- **Pass-through readers: about 10** (RD1-RD8, RD15-RD16). They need no dual-form code and keep the cross-origin limits in section 4.
- **Minimum for both forms.** One normalizer at the client load boundary (`lib/classroom/load-classroom.ts:256-270`) rewrites `https?://<host>/api/classroom-media/...` to the path form. After it, readers need only the relative form [Inference]. Size S.
- **Count of existing absolute URLs.** Local checkout: 0 classroom files (`data/classrooms` is empty) [measured here]. Deployments [Unverified].

## 7. Minimal change (Q5)

**Writers (S).**
- `classroom-media-generation.ts:77-79`: return the path. Remove `baseUrl` from `mediaServingUrl`, from `generateMediaForClassroom` (`:85-89`), from `generateTTSForClassroom` (`:251-255`), and from the calls at `:155`, `:194`, `:319`.
- `classroom-generation.ts:677`, `:696`: stop passing `options.baseUrl`. Keep `:717` (share URL).

```ts
// lib/server/classroom-media-generation.ts
function mediaServingUrl(classroomId: string, subPath: string): string {
  return `/api/classroom-media/${classroomId}/${subPath}`;
}
```

**Readers.**
- RD1-RD8: no code change for relative values. Size S (verification).
- RD14 vision resolver: add a relative branch that reads `CLASSROOMS_DIR/<id>/<sub>` and returns a data URL. Size M. Needed only if relative values can reach it [Inference].
- RD10 ZIP: resolve concrete references before `resolveStoredBytes` (for example, `fetchMediaUrl` for relative and same-origin URLs). Size M. Pre-existing; separate item.

**Comments, docs, dead code (S).**
- `lib/server/media-origin.ts:1-28` describes this resolver as the base-origin source for `mediaServingUrl`. `classroom-media-bytes.ts:33-35` and `generate-image.ts:158-159` say request-bearing routes use it. None calls it (finding 3). Lines 12-13 say `Cache-Control: private`. The route sends `public, max-age=86400, immutable` (`app/api/classroom-media/[classroomId]/[...path]/route.ts:24`).
- `classroom-media-generation.ts:44-53` (converter claim); `classroom-media-bytes.ts:27-35` (says server consumers "fetch it relative to the same origin"; none was found, and a server-side `fetch` needs an absolute URL [Inference]); `generate-image.ts:158-159`.
- `lib/server/config-validation.ts:237-238`, `:244`; `README.md:419`: they describe generated links as depending on the origin.
- `resolveMediaServingOrigin` and `requestOrigin` may be removed only with their tests updated: `tests/server/media-origin.test.ts`; `tests/server/public-origin.test.ts:5`, `:44`, `:52`, `:60`.

**Tests to update (not run).** `tests/server/classroom-media-generation.test.ts` lines 139, 177, 180, 217, 253, 304, 312, 361, 367 assert `http://localhost` prefixes.

## 8. Migration

1. **Server scrub (M).** For each `data/classrooms/<id>.json`, rewrite `scenes[].content.canvas.elements[].src` and `scenes[].actions[].audioUrl` values of the form `<origin>/api/classroom-media/...` to the path form. Dry-run and count first, then write with `writeJsonFileAtomic` (`lib/server/classroom-storage.ts:23-31`). Leave the share `url` in job JSON unchanged.
2. **Client normalizer (S).** Apply it in `fetchClassroomFromApi` (`lib/classroom/load-classroom.ts:256-270`) and to stage copies read from IndexedDB (`load-classroom.ts:133`). Without it, a browser that holds a copy keeps absolute values [Inference from `load-classroom.ts:136-158`].
3. **API.** The in-repo readers need no `GET /api/classroom` version change. External consumers: RD19 [Unverified].
4. **Rollback.** [Inference] A relative value keeps working on any origin. An absolute value written before rollback works only on its own origin.

## 9. Size estimate

| Part | Size | Basis |
|---|---|---|
| Writers A1-A4 and call sites | S | About 10 lines in two files |
| Readers RD1-RD8 without change | S | Verification only |
| Vision resolver relative branch (RD14) | M | Only if reachable |
| Client normalizer (section 6) | S | One boundary |
| Server scrub (section 8.1) | M | Dry run, count, write, tests |
| Comments, docs, dead code | S | About 8 sites |
| Tests updated | S | 9 assertions in one file |
| ZIP concrete-media change (RD10) | M | Pre-existing; separate item |
| Checks C1-C2 | M | Browser and render runs |
| **Total for B29** | **M** | Writers S; migration and checks M |

## 10. Checks

### 10.1 Gate before GO

- **C1, browser (classroom page).** Fixture `data/classrooms/<id>.json` with `src: "/api/classroom-media/<id>/media/x.png"` and `audioUrl: "/api/classroom-media/<id>/audio/x.mp3"`, `PUBLIC_APP_ORIGIN` unset. Open `/classroom/<id>` in a headless browser. Pass if the `<img>` has `naturalWidth > 0`, the audio request returns 200 and playback starts, and the PPTX export embeds the image with no "Failed to convert image" warning (`use-export-pptx.ts:634-644`). Repeat with `ACCESS_CODE` set: media requests must return 200 with the cookie. Status: [Unverified], not run.
- **C2, render round trip.** Build an export ZIP from a classroom whose image is a relative reference. Submit it to `POST /render`. Pass if the response is 202, the job reaches `succeeded`, and the ZIP's `index.html` contains no `/api/classroom-media` text. Status: [Unverified], not run.

### 10.2 Before merging the writer change

- **C3, existing absolute values.** Export a classroom whose media is absolute and points at an origin other than the page's, in PPTX and video export. Record which media are dropped. The result decides whether the scrub is required or optional. Status: [Unverified].
- **C4, tests.** Run `tests/server/classroom-media-generation.test.ts` after the writer change. Status: [Unverified], not run.

### 10.3 Pre-existing, separate

- **C5, ZIP media.** Export a server-generated classroom and count media files in the archive. Code reading predicts zero for concrete references (RD10). Status: [Unverified].
- **C6, producer.** Install the render-service dependencies in a scratch copy, read the producer's loader, and confirm an `assets/`-only project triggers no network fetch. Status: [Unverified]; package absent here.
- **C7, external consumers (RD19).** Inventory consumers of `GET /api/classroom` and of share payloads outside this repository. Status: [Unverified].

### 10.4 Remaining [Unverified] items

- Browser behaviour of RD1-RD9 (no browser run).
- Access-cookie behaviour for cross-origin media requests (RD17): [Inference] only.
- Producer internals (RD11).
- External consumers (RD19).
- Absolute URLs in deployed classrooms (only the local checkout was counted: 0).
- The changelog says agent-runtime relative references shipped (`CHANGELOG.md:95`, under 1.0.0). Not checked against a release.

## 11. Method and limits

- Searches excluded `node_modules`, `.next`, `scrum`, `tests`, `data`, and locale JSON when counting writers and readers. Tests were read for coverage only, and none was run.
- Reviewer notes were checked for what they claim. Their conclusions were not treated as evidence.
- `README.md` changed during the run (line 416 at the first read, 419 at the later read). No other cited file changed after it was read.
