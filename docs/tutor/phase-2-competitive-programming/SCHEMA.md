# Phase 2 — Chuyên Tin: SCHEMA

- **Trạng thái**: Đặc tả triển khai (đang chờ thực hiện; sửa 2026-09-30 theo ADR 0012: hai luồng, bài giải đề, C++ + Python)
- **Ngày**: 2026-09-30
- **Người sở hữu**: Chủ dự án
- **Liên quan**: [../CONTENT-DESIGN](../CONTENT-DESIGN.md), [../DATA-MODEL §5](../DATA-MODEL.md), [../TEST-STRATEGY](../TEST-STRATEGY.md), ADR 0004, 0006, 0008, 0011, 0012

> **Tóm tắt:** Chuyên Tin theo blueprint ADR 0008 cho **hai luồng** (ADR 0012): `ts10` (thi vào 10 chuyên Tin, 14 topic) và `hsg` (26 topic). Tier 1–2 phục vụ cả hai luồng nên làm trước.
> - Có **4 visualizer** (`array`, `tree`, `graph`, `grid`) + panel phụ.
> - Mô-đun chia 5 đợt 2A–2E; mỗi đợt 2A–2C có ≥1 **bài giải đề** (P1–P3).
> - Độ phủ walkthrough: `ts10` 8→13/14; `hsg` 5→10→17→21→24/26; tổng 29/32 (30 với `geometry`).
> - Mọi mô-đun có code chỉ-đọc C++ và Python.
> - Phase 2 bắt đầu sau cổng G1; đợt 2A kết thúc bằng G2.

> **Lịch sử:** bản viết lại 2026-09-29; sửa 2026-09-30 theo quyết định "cả hai đối tượng" và "C++ và Python" của user. Phụ thuộc **Phase 1 tới G1**. **Không đổi package `@openmaic/*`**; không phụ thuộc Phase 3 (trừ `t4-geometry`, xem §2.4).

## 1. Mục tiêu

Học sinh thi vào chuyên Tin và học sinh ôn HSG gặp bài **rất khó**. Phase 2 biến curriculum 32 topic thành khoá học theo **blueprint ADR 0008**: đề → vét cạn → điểm nghẽn → quan sát then chốt → chạy tay trực quan → code chỉ-đọc → độ phức tạp → bẫy → kiểm tra. Có thêm **bài giải đề** với thang subtask ([CONTENT-DESIGN §3.2](../CONTENT-DESIGN.md)).

- *"dạy em Quick Sort"* → khoá 6–8 scene, 1–3 scene interactive (thường 2 walkthrough qua `generate_walkthrough`: chạy tay có dự đoán; đọc C++/Python từng dòng).
- *"dạy em bài cắt gỗ bằng chặt nhị phân đáp án"* → bài giải đề `bs-answer`: subtask → vét cạn → `check(H)` đơn điệu → chặt nhị phân.
- *"dạy em cả chuyên đề Quy hoạch động"* → agent đọc `references/curriculum/index.json`, chọn topic DP theo chuỗi `prerequisites` và theo luồng của học sinh, làm theo `curriculum-planner`. Topic chưa có mô-đun dùng storyboard hoặc widget LLM sinh (ADR 0006 §5), kèm slide + `wb_*` khi Q&A.
- Thầy dẫn theo beat của preset (kịch bản tất định), **dạy kèm theo thang gợi ý** ở bất kỳ frame nào (ADR 0008 Decision 6, ADR 0009).
- Không có widget `code` (ADR 0010); walkthrough và widget tương tác do LLM sinh vẫn dùng bình thường.

## 2. Phạm vi — mô-đun theo đợt và luồng

Độ khó viết (S/M/L), nhãn luồng và ánh xạ topic↔mô-đun là [Inference], hội đồng LLM Tin duyệt (ADR 0014).

### 2.1. Bảng mô-đun

| # | Mô-đun (`walkthroughId`) | Topic curriculum | Luồng | Visualizer | Khó | Đợt |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `binary-search` (Phase 1), `bs-answer-mini` (1c) | `t2-binary-search` | ts10, hsg | `array` | S | 1a/1c |
| 2 | `prefix-sum`, `two-pointers` | `t1-array-prefix` | ts10 | `array` (cells) | S | 2A |
| 3 | `stack-queue` (ngoặc hợp lệ; mô phỏng hàng đợi; panel `aux`) | `t1-stack-queue` | ts10 | `array` + `aux` | S | 2A |
| 4 | `fib-recursion-tree` (+ memo) | `t1-recursion` (bắc cầu tới `t2-brute-force`, `t2-backtracking`, `t3-dp-basic`) | ts10 | `tree` | M | 2A |
| 5 | `quick-sort`, `merge-sort` (n ≤ 8) | `t2-sorting`, `t2-divide-conquer` | ts10, hsg | `array` | S | 2A |
| 6 | `subset-gen`, `n-queens` | `t2-brute-force`, `t2-backtracking` | ts10, hsg | `tree` + `grid` | M | 2A |
| P1 | **Bài giải đề** `bs-answer` (cắt gỗ, bản đầy đủ) | `t2-binary-search` (độ khó 3) | ts10, hsg | `array` (bars + vạch H) | M | 2A |
| 7 | `sieve`, `euclid-gcd` | `t2-number-basics` | ts10, hsg | `grid` / `array` | S | 2B |
| 8 | `bit-subsets` | `t2-bitwise` | ts10, hsg | `array` (bits) | S | 2B |
| 9 | `activity-selection` (+ chứng minh đổi chỗ) | `t3-greedy` | ts10, hsg | `array` (khoảng) | M | 2B |
| 10 | `string-scan` (đối xứng, đếm tần suất) | `t1-string` | ts10 | `array` (cells ký tự) | S | 2B |
| 11 | `hash-count` | `t1-hash` | ts10 | `array` + `aux` | S | 2B |
| 12 | `bfs`, `dfs` (lưới + đồ thị; panel queue/stack) | `t3-graph-traversal` | hsg | `graph`/`grid` | M | 2B |
| 13 | `knapsack-01`, `lcs`, `lis` (mũi tên phụ thuộc) | `t3-dp-basic` | hsg | `grid` | M | 2B |
| P2 | Bài giải đề (hội đồng LLM chọn; ví dụ tham lam + chứng minh) | theo đề | ts10/hsg | theo đề | M | 2B |
| 14 | `dsu`, `kruskal` | `t3-dsu`, `t4-mst` | hsg | `tree` + `graph` | M | 2C |
| 15 | `dijkstra` (panel heap) | `t4-shortest-path` | hsg | `graph` | M | 2C |
| 16 | `segment-tree`, `fenwick` | `t3-segment-tree`, `t3-fenwick` | hsg | `tree` (+ `array`) | M | 2C |
| 17 | `dp-tree` | `t4-dp-tree` | hsg | `tree` | M | 2C |
| 18 | `dp-bitmask` (Held-Karp, n ≤ 5) | `t4-dp-bitmask` | hsg | `grid` | M–L | 2C |
| P3 | Bài giải đề (ví dụ đồ thị trạng thái + Dijkstra) | theo đề | hsg | `graph` | M | 2C |
| C | Storyboard: HLD, Dinic/Hungarian, SAM/SA/Aho, CHT/Knuth | `t4-tree-advanced`, `t4-flow-matching`, `t4-string-advanced`, `t4-dp-optimize` | hsg | theo nội dung | M mỗi cái | 2D |
| D | `kmp`, `tarjan`, `digit-dp`, `nim-grundy`; `graham-scan` (chờ `geometry`) | `t4-string-advanced`, `t3-scc-bridges`, `t4-dp-digit`, `t4-game-theory`, `t4-geometry` | hsg | `array` (2 hàng), `graph`, `grid`, `grid`, `geometry` | M–L | 2E |

### 2.2. Độ phủ (đếm theo nhãn `tracks` trong curriculum)

| | Sau 1a–1c | Sau 2A | Sau 2B | Sau 2C | Sau 2D | Sau 2E |
| --- | --- | --- | --- | --- | --- | --- |
| `ts10` (14 topic) | 1/14 | **8/14** | **13/14** | 13/14 | 13/14 | 13/14 |
| `hsg` (26 topic) | 1/26 | 5/26 | 10/26 | 17/26 | 21/26 | 24/26 (25 với `geometry`) |
| Tổng (32 topic) | 1/32 | 8/32 | 15/32 | 22/32 | 26/32 | 29/32 (30 với `geometry`) |

Topic cùng thuộc hai luồng (tier 2, `t3-greedy`) được đếm ở cả hai. Tính theo *có mô-đun*, không bảo đảm chất lượng (chất lượng đo bằng G1/G2 và rubric). **Không có walkthrough theo chủ ý:**
- `t1-complexity`: slider `n → bậc O` + slide, là mục duy nhất `ts10` còn thiếu.
- `t4-number-combinatorics`: công thức → slide + `wb_latex`/`wb_chart`.

### 2.3. Visualizer (`lib/tutor/runtime/visualizers/`)

- `array` (Phase 1): thêm `cells`/`bits`, 2 hàng, chế độ khoảng.
- `tree`, `graph`.
- `grid`: thay `dpTable`, dùng cho bàn cờ và sàng.
- Panel phụ `vars`/`aux` dùng chung (ADR 0001, ARCHITECTURE §8).

Mỗi visualizer gồm module + entry build + test trình duyệt. Layout tự viết (ADR 0002); chạm trigger T2 mới xét `d3-hierarchy`/Cytoscape (inline).

### 2.4. Phụ thuộc chéo

`t4-geometry` (Graham scan) cần visualizer `geometry` (Phase 3B). `geometry` đặt ở thư mục runtime dùng chung nên Tin dùng lại khi có; đến lúc đó mới làm.

### 2.5. Ngoài phạm vi

Code editor/luyện code cho học sinh (ADR 0003); Pascal; visualizer `callStack`/`hashTable`/`linkedList` riêng (dùng `array` + `aux`); MP4 dựng từng bước (ARCHITECTURE §12); walkthrough cho đề do học sinh tự mang tới.

## 3. File layout

```
skills/agent-runtime/competitive-programming/
├── SKILL.md                              # (Phase 1b tối thiểu) → đầy đủ ở Phase 2
├── outline-constraints.json             # chỉ cảnh báo (ADR 0005, 0010)
└── references/curriculum/{index.json, tier-1.json, tier-2.json, tier-3.json, tier-4.json}
lib/subjects/cp/
├── pack.ts                               # danh sách entry
├── catalog/<module>.ts                   # 1 file / walkthrough (kể cả bài giải đề)
└── messages/{vi-VN,en-US}.ts
lib/tutor/runtime/visualizers/{array,tree,graph,grid}.ts + entries
tests/subjects/cp/<module>.test.ts  tests/tutor/{skills,skill-catalog-sync,curriculum-map}.test.ts
```

**Bước 0 của Phase 2**: chuyển `docs/tutor/curriculum/curriculum-informatics-vn.json` vào `references/curriculum/` **chia theo tier** + `index.json` (id, tên, tier, **tracks**, độ khó, prerequisites; script sinh, test đồng bộ). Lý do: file gốc ~79 KB quá lớn để agent đọc nguyên khối, và công cụ `read` chỉ đọc trong thư mục skill có `SKILL.md`.

## 4. Skill

### 4.1. `SKILL.md`

Frontmatter theo convention skill hiện có: `name: competitive-programming`; `title:` **phải chứa chữ Hán** (`tests/agent-runtime/skills.test.ts:255-268`), ví dụ `信息学竞赛`; `description` (khi nào dùng). Nội dung:

- **Nguyên tắc**: không tạo bài luyện code hay widget `code` (ADR 0003, 0010).
  - Trace số liệu dùng **`generate_walkthrough`** (id trong bảng) rồi soạn slide quanh nó từ `lessonKit`.
  - Topic chưa có mô-đun: storyboard hoặc widget tương tác do LLM sinh (simulation/diagram/game/3D) cho khái niệm/mô hình định tính.
  - Q&A dùng slide + `wb_*`.
- **Luồng**: hỏi hoặc suy ra học sinh thuộc `ts10` hay `hsg`; chọn topic và độ sâu theo `tracks`; chọn ngôn ngữ panel (C++/Python).
- **Blueprint 12 giai đoạn + recipe 6–8 cảnh, 1–3 scene interactive** (ADR 0008); **bài giải đề** theo CONTENT-DESIGN §3.2.
- **Bảng `walkthroughId` + mô tả + hình dạng `input`**: **sinh từ catalog** bằng script, kèm snapshot test (ADR 0006).
- **Khi học sinh hỏi** (ADR 0008 Decision 6): hỏi lại học sinh nghĩ gì → gợi ý mức 1 → mức 2 → mức 3 → lời giải khi học sinh yêu cầu; bám frame hiện tại; `wb_draw_table/shape/line/latex/code` cho phần dài (tên thật ở `lib/chat/pi/tools/native-whiteboard.ts`).
- **Tên scene** là hành động/kết quả ("Chia đôi mảng, mid = 4"), không phải tên chủ đề. **keyPoints** mô tả điều học sinh cần để ý ("thấy `lo` và `hi` thu hẹp"), không phải định nghĩa.
- **Khi user hỏi cả chuyên đề**: đọc `references/curriculum/index.json`, chọn topic theo chuỗi `prerequisites` và `tracks`, làm theo skill `curriculum-planner`.

### 4.2. `outline-constraints.json` (chỉ cảnh báo; không phải cưỡng chế)

```json
{
  "$comment": "Warn-only: checkScenesAgainstSkill reports after write and ignores requiredWidgetOutlineFields (ADR 0005). Widget `code` is blocked by default (ADR 0010); walkthroughs come from the generate_walkthrough tool (ADR 0011); other interactive widgets are welcome.",
  "allowedTypes": ["slide", "quiz", "interactive"],
  "firstSceneType": "slide",
  "sceneCount": { "min": 6, "max": 8 }
}
```

### 4.3. Hướng dẫn whiteboard cho Q&A

Spike S2b (skill có tới chat agent Q&A không) **đã chuyển sang lát 1c** (ADR 0008 Decision 6). Phase 2 mở rộng đoạn "khi học sinh hỏi" trong `SKILL.md` theo kết quả S2b. Nếu skill không tới chat agent, hướng dẫn nằm trong `describe()` (gợi ý và hiểu lầm của beat).

## 5. Đặc tả mô-đun

Mọi entry tuân ADR 0006:
- `inputSpec` (strict).
- `presets`: ≥4, ≥1 biên, ≤6.
- `beatDefs` 5–10, có `hints[3]` và `misconceptions`, ≥1 `ask.predict`.
- `code{pseudo, impl{cpp, py}, map{cpp, py}}`; `pitfalls` có nhãn `lang`.
- `entryRev`, `maxFrames`/`maxSteps`/`maxBytes`, test.
- `customInput: true` cho entry `array`/`grid` **chỉ bật sau khi lát 1d xong** (trước đó `false`).

Ngưỡng frame **tính theo `n` tối đa và trường hợp xấu nhất**, chốt khi cài đặt. Bản cũ (≤60 cho quick-sort n=8) sai: mô phỏng của chuyên gia cho n=8 đã sắp ra 72 frame nếu mỗi so sánh/hoán đổi là một frame, và n=12 lên 157 [Inference]. Vì vậy sort giới hạn **n ≤ 8**, và vì tổng frame mọi preset ≤ 300 (DATA-MODEL §3), entry sort có **tối đa 4 preset** ở trường hợp xấu nhất n = 8.

| Mô-đun | Input hợp lệ (tóm tắt) | Đối chiếu kết quả độc lập |
| --- | --- | --- |
| `quick-sort`, `merge-sort` | 2–8 số nguyên `[-999,999]` | `Array.prototype.sort` |
| `prefix-sum`, `two-pointers` | mảng ≤ 10; truy vấn/mục tiêu nguyên | tính trực tiếp |
| `stack-queue` | xâu ngoặc ≤ 12 (`()[]{}`); ≤ 8 thao tác hàng đợi | kiểm ngoặc/hàng đợi độc lập |
| `fib-recursion-tree` | `n` ≤ 6; `memo` bật/tắt | số lần gọi đếm độc lập |
| `subset-gen`, `n-queens` | n ≤ 4 phần tử; n ∈ {4,5,6} | liệt kê/đếm nghiệm độc lập |
| `bs-answer` | 1–8 cây, chiều cao ≤ 40, `M` ≤ 100 | thử mọi `H` |
| `sieve`, `euclid-gcd` | `n` ≤ 60; `a, b` ≤ 200 | chia thử; `gcd` lặp |
| `bit-subsets` | n ≤ 4 | liệt kê tập con độc lập |
| `activity-selection` | ≤ 8 khoảng, đầu mút ≤ 24 | vét cạn tập con tương thích |
| `string-scan`, `hash-count` | xâu ≤ 12 `[a-z]` | đếm trực tiếp |
| `bfs`, `dfs` | ≤ 8 node hoặc lưới ≤ 5×5; nguồn | duyệt độc lập |
| `knapsack-01`, `lcs`, `lis` | knapsack: 1–5 món, giá trị/trọng lượng ≤ 20, sức chứa ≤ 12; lcs: hai xâu ≤ 6 ký tự `[a-z]`; lis: ≤ 8 số | vét cạn / DP độc lập |
| `dp-tree` | cây ≤ 8 node | vét cạn |
| `dsu`, `kruskal` | n 2–8; ≤ 8 thao tác/cạnh | duyệt thành phần liên thông / Prim |
| `dijkstra` | ≤ 8 node; trọng số nguyên dương ≤ 20; **nhãn tự sinh** | Bellman-Ford |
| `segment-tree`, `fenwick` | 4 hoặc 8 số | tính trực tiếp |
| `dp-bitmask` | n ≤ 5 | vét cạn hoán vị |

## 6. i18n

- `skill.title.competitive-programming` đã thêm ở Phase 1b; không thêm skill khác (curriculum là dữ liệu trong `references/`, không phải skill).
- Nội dung catalog theo bảng `Messages` vi/en (ADR 0006); locale khác dùng `en-US`.

## 7. Kiểm thử

- **Node** (`tests/subjects/cp`, `tests/tutor`):
  - §5 cho từng mô-đun, gồm hai `map` toàn phần và mọi preset có beat `required`.
  - `ids-snapshot.test.ts` (`entryRev`/`framesHash`); `skill-catalog-sync.test.ts` (snapshot khối id).
  - `tests/agent-runtime/skills.test.ts` (constraints hợp lệ; không `code`).
  - `curriculum-map.test.ts`: id duy nhất, `tracks` khác rỗng, `prerequisites` tồn tại, không vòng, không ngược tier, `sequencing` đủ 32, `index.json` đồng bộ tier-N.json.
  - `tests/workbench/workbench-i18n.test.ts` pass.
- **Đối chiếu bản cài đặt** (đề xuất, job CI riêng, cờ `TUTOR_IMPL_CHECK=1`): chạy `impl.cpp` (g++) và `impl.py` (python3) trên mọi preset, so kết quả cuối với `run()`. `g++`/`python3` trên runner: [Unverified]; nếu không có thì duyệt tay.
- **Trình duyệt** (Playwright): mỗi visualizer mới nạp một frame mẫu; `SET_WIDGET_STATE` nhảy frame; 0 request ra ngoài; không lỗi console.
- **Eval**: `eval:tutor-lesson` (rubric ADR 0008) trên 6 scenario (3 `ts10`, 3 `hsg`; ≥2 bài giải đề), A/B recipe; `eval:tutor-qa`; `eval:walkthrough-actions` chỉ khi bật lời thầy do LLM.
- **Tích hợp** (thủ công có ghi chép): *"dạy em Quick Sort"*; *"dạy em bài cắt gỗ"*; *"dạy em cả chuyên đề Quy hoạch động"* (agent chọn topic DP theo prerequisite).

## 8. Acceptance criteria

- [ ] Phase 1 đã tới **G1 đạt**.
- [ ] Đợt 2A: 4 visualizer + mô-đun 2–6 + `bs-answer`, test pass; độ phủ `ts10` ≥ 8/14 (đếm bằng script theo `tracks`); **G2 đạt** trên `bs-answer` (ADR 0012 §6).
- [ ] Đợt 2B: mô-đun 7–13 + P2 pass; `ts10` = 13/14, `hsg` ≥ 10/26.
- [ ] Đợt 2C: mô-đun 14–18 + P3 pass; `hsg` ≥ 17/26.
- [ ] Đợt 2D/2E: theo bảng §2.2; mỗi storyboard có test bất biến (bảo toàn luồng, liệt kê xâu con…).
- [ ] Mỗi đợt: mọi entry mới có **review đạt của hội đồng LLM Tin** (INTERFACES §8.2) ở đúng `entryRev`; `tests/subjects/reviews.test.ts` pass.
- [ ] Skill hiện trong menu với tên đúng ở cả 12 locale; `outline-constraints.json` hợp lệ; `SKILL.md` khối id khớp catalog.
- [ ] Curriculum trong `references/curriculum/` (chia tier + index, có `tracks`), `course_shape` đúng ADR 0008 (không `code`).
- [ ] *"dạy em cả chuyên đề Quy hoạch động"* → chuỗi bài từ các topic DP (tier 3 **và** 4).
- [ ] Mỗi mô-đun có ≥4 preset, tab C++ và Python với `map` toàn phần, kịch bản beat theo preset; entry `customInput` có test tương đương `run` server/iframe.
- [ ] `pnpm vitest run tests/subjects tests/tutor tests/widgets tests/workbench tests/agent-runtime/skills.test.ts`, `pnpm build`, `pnpm lint`, `pnpm check`, `npx tsc --noEmit`, `pnpm check:i18n-keys` pass.
- [ ] `git diff --name-only origin/main -- packages/@openmaic` rỗng.
- [ ] `eval:tutor-lesson` và `eval:tutor-qa` chạy mỗi đợt, ghi kết quả để hiệu chỉnh ngưỡng.

## 9. Thứ tự cho coding agent

| Bước | Module | Song song |
| ---: | --- | --- |
| 0 | Chuyển + chia curriculum (có `tracks`); script index; `curriculum-map.test.ts` | 1 |
| 1 | 4 visualizer + entry + test Playwright (`array` mở rộng, `tree`, `graph`, `grid`, panel phụ) | 0, 2 |
| 2 | Mô-đun đợt 2A + `bs-answer` (mỗi mô-đun một agent, file riêng) | 0, 1 |
| 3 | `SKILL.md` đầy đủ + sinh khối id + `outline-constraints.json` | 2 |
| 4 | G2 → Đợt 2B → (2C ‖ 2D) → 2E (2D chỉ cần 2B; 2E cần 2C; trong đợt song song) | — |
| 5 | Tích hợp + eval + smoke mỗi đợt | phụ thuộc 1–4 |

Điểm chung duy nhất giữa các agent: `lib/subjects/cp/pack.ts` (danh sách entry). Để agent điều phối thêm, hoặc làm tuần tự.
