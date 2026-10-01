# Task Phase 2 (Chuyên Tin, đợt 2A–2E)

- **Trạng thái**: Accepted — mọi mô-đun đã có card riêng (input, preset, beat, oracle); 2A giao sau G1, 2B–2E giao sau cổng/tích hợp tương ứng
- **Ngày**: 2026-10-01
- **Người sở hữu**: Chủ dự án (leader điều phối)
- **Liên quan**: [README](README.md), [phase-1](phase-1.md), [phase-3](phase-3.md), [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md), [../CONTENT-DESIGN](../CONTENT-DESIGN.md), [../TEST-STRATEGY](../TEST-STRATEGY.md)

> **Tóm tắt:** Phase 2 có 55 task: 10 task nền, 38 task mô-đun, 7 task tích hợp/cổng.
> - **Task nền** (§1): curriculum, 4 visualizer, bảng chữ `brackets`, skill đầy đủ, đối chiếu C++/Python, eval bài giảng, bật nhập input sau 1d.
> - **Task mô-đun** (§3–§7): mỗi walkthrough là một card `W`/`W+` riêng, ghi sẵn state, input, `check`, preset, beat, oracle, bẫy. Worker không phải tự thiết kế bài.
> - Card mẫu chung ở §2. Bài giải đề P2, P3 và 4 mô-đun 2D do leader đề xuất ([Inference]); hội đồng LLM Tin duyệt ở bước tích hợp, trượt thì thay đề.
> - Đăng ký vào `pack.ts`, khoá catalog, khối id và chạy hội đồng là task `I-03`…`I-07`, `I-12` của leader.

## 1. Task nền

### 2-00 · Chia curriculum vào `references/` của skill

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 1b-23 |
| Sở hữu | `skills/agent-runtime/competitive-programming/references/curriculum/`, `scripts/split-curriculum.ts`, `tests/tutor/curriculum-map.test.ts` |
| Đọc | [../DATA-MODEL](../DATA-MODEL.md) §5; [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §3 (đoạn "Bước 0") |

**Làm**
1. `scripts/split-curriculum.ts` (chạy bằng `pnpm exec tsx`) đọc `docs/tutor/curriculum/curriculum-informatics-vn.json`.
   - Ghi `tier-1.json` … `tier-4.json`, mỗi file các topic của tier đó.
   - Ghi `index.json`: mỗi topic `{ id, name_vi, name_en, tier, tracks, difficulty, prerequisites }`, kèm `course_shape`, `tracks_def`, `sequencing`.
   - Đầu ra tất định: khoá sắp xếp, thụt lề 2.
2. Test kiểm bất biến ở DATA-MODEL §5:
   - id duy nhất; `tracks` khác rỗng;
   - `prerequisites` tồn tại, không vòng, không phụ thuộc tier cao hơn;
   - `sequencing` đủ 32 topic;
   - `index.json` khớp `tier-N.json`, và khớp bản sinh lại từ file gốc.

**Xong khi:** `pnpm vitest run tests/tutor/curriculum-map.test.ts tests/agent-runtime/skills.test.ts` xanh.

### 2-IS1 · `InputSpec`: thêm bảng chữ `brackets`

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | S |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/tutor/input-spec.ts`, `tests/tutor/input-spec.test.ts` |
| Đọc | ADR 0006 quyết định 7 (`InputSpec`); [../INTERFACES](../INTERFACES.md) §7 |

**Làm:** thêm `'brackets'` (chỉ gồm `()[]{}`) vào `alphabet` của kind `string`; các bảng chữ cũ giữ nguyên hành vi. Báo leader cập nhật ADR 0006.

**Xong khi:** `pnpm vitest run tests/tutor/input-spec.test.ts` xanh.

### 2-V1 · Visualizer `array`: `cells`, `bits`, hàng phụ, khoảng

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/tutor/runtime/visualizers/array.ts`, `lib/tutor/build/generated/runtime-array.ts`, `tests/tutor/runtime/array-layout.test.ts`, `tests/tutor/runtime/array-modes.browser.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8; [README](README.md) §5 D17 |

**Làm** (hợp đồng state, leader chép vào ARCHITECTURE §8):
```ts
type ArrayState = {
  values: readonly (number | string)[]
  mode: 'bars' | 'cells' | 'bits'
  rows?: readonly { label: string; values: readonly (number | string | null)[]; offset?: number }[]  // hàng phụ: cộng dồn, failure, lịch sử
  intervals?: readonly { id: string; start: number; end: number; label?: string }[]                // đoạn [start, end) trên trục
  threshold?: { value: number; label: string }                                                     // đã có từ 1b
}
```
- Khoá `highlights`:
  - chỉ số (`"3"`) cho hàng chính;
  - `"r<k>:<i>"` cho hàng phụ thứ k (từ 0);
  - id cho khoảng.
- Kind dùng chung: `active`, `compare`, `result`, `visited`, `muted`, `group-0` … `group-5` (bảng màu cố định, có cả mẫu nét để không phân biệt chỉ bằng màu).
- Sinh lại runtime `array`. Chế độ `bars` giữ nguyên hành vi (test của 1b vẫn xanh).

**Xong khi:**
- `pnpm vitest run tests/tutor/runtime/array-layout.test.ts tests/tutor/build/runtime-fresh.test.ts` xanh;
- `TUTOR_BROWSER=1 pnpm exec vitest run tests/tutor/runtime/array-modes.browser.test.ts` xanh.

### 2-V2 · Visualizer `tree`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/tutor/runtime/visualizers/tree.ts`, `lib/tutor/runtime/entries/tree.ts`, `lib/tutor/build/generated/runtime-tree.ts`, `tests/tutor/runtime/tree-layout.test.ts`, `tests/tutor/runtime/tree.browser.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8 (dòng `tree`); visualizer mẫu `lib/tutor/runtime/visualizers/array.ts`; [README](README.md) §5 D17 |

**Làm**
1. State: `{ nodes: readonly { id: string; label: string; parent?: string; note?: string; edgeLabel?: string }[] }`.
   - Đây là rừng: node không có `parent` là gốc. Thứ tự con theo thứ tự trong mảng.
   - `note` hiện nhỏ dưới node (ví dụ `fail→B`); `edgeLabel` hiện trên cạnh tới cha.
2. Khoá `highlights` là id node; kind dùng chung như `2-V1`.
3. Hàm thuần `layoutForest(nodes, width, height)`: cây gọn, con dàn đều dưới cha, không chồng nhau, tối đa 31 node. Có unit test.
4. SVG + CSS transition; chỉ `textContent`. `pointers` vẽ nhãn cạnh node.
5. Entry runtime gọi `startWalkthroughRuntime(treeVisualizer)`; sinh `runtime-tree.ts` bằng script.

**Xong khi:**
- `pnpm vitest run tests/tutor/runtime/tree-layout.test.ts` xanh. Test phủ: 1 node, chuỗi 8 node, rừng 2 cây, cây đủ 31 node.
- `TUTOR_BROWSER=1 pnpm exec vitest run tests/tutor/runtime/tree.browser.test.ts` xanh. Test dùng HTML dựng bằng `buildWalkthroughHtml` + frame mẫu viết tay; kiểm nhảy frame, 0 request, không lỗi console.

Báo leader thêm `tree` vào `runtimes.ts` (`I-03`).

### 2-V3 · Visualizer `graph`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/tutor/runtime/visualizers/graph.ts`, `lib/tutor/runtime/entries/graph.ts`, `lib/tutor/build/generated/runtime-graph.ts`, `tests/tutor/runtime/graph-layout.test.ts`, `tests/tutor/runtime/graph.browser.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8 (dòng `graph`); `2-V2` làm mẫu; [README](README.md) §5 D17 |

**Làm**
1. State:
   ```ts
   {
     nodes: { id: string; label?: string; x?: number; y?: number }[]
     edges: { from: string; to: string; weight?: number; directed?: boolean; kind?: string; label?: string }[]
   }
   ```
   - `label` thay cho id khi hiển thị (ví dụ `A (d=3)`). `edge.label` hiện cạnh trọng số (ví dụ `3/5` cho luồng).
2. Không có toạ độ thì xếp vòng tròn (hàm thuần `circleLayout`, có test). Có toạ độ thì co giãn vào khung.
3. Khoá `highlights`: id node, hoặc `"A-B"` cho cạnh (có hướng thì đúng chiều). Kind dùng chung như `2-V1`.
4. Heap/queue/stack hiển thị bằng panel `aux` của lõi, không vẽ trong visualizer.

**Xong khi:** như `2-V2`, với `graph-layout` và `graph.browser`.

### 2-V4 · Visualizer `grid`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/tutor/runtime/visualizers/grid.ts`, `lib/tutor/runtime/entries/grid.ts`, `lib/tutor/build/generated/runtime-grid.ts`, `tests/tutor/runtime/grid-layout.test.ts`, `tests/tutor/runtime/grid.browser.test.ts` |
| Đọc | [../ARCHITECTURE](../ARCHITECTURE.md) §8 (dòng `grid`); `2-V2` làm mẫu; [README](README.md) §5 D17 |

**Làm**
1. State:
   ```ts
   {
     rows: number
     cols: number
     cells: (number | string | null)[][]
     rowLabels?: string[]
     colLabels?: string[]
     arrows?: { from: string; to: string }[]   // mũi tên phụ thuộc của DP; khoá "r,c"
   }
   ```
2. Khoá `highlights` là `"r,c"`; kind dùng chung như `2-V1`. Dùng cho bảng DP, bàn cờ, sàng.
3. Hàm thuần `gridLayout(rows, cols, width, height)` có test. Tối đa 16 hàng × 13 cột (`dp-bitmask` cần 16 hàng); nhãn hàng/cột tối đa 8 ký tự.

**Xong khi:** như `2-V2`, với `grid-layout` và `grid.browser`.

### 2-S1 · `SKILL.md` đầy đủ của `competitive-programming`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 2-00, G1-01 |
| Sở hữu | `skills/agent-runtime/competitive-programming/SKILL.md`, `skills/agent-runtime/competitive-programming/outline-constraints.json` |
| Đọc | [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §4; [../CONTENT-DESIGN](../CONTENT-DESIGN.md) §3, §4 |

**Làm:** viết đủ các mục ở Phase 2 §4.1:
- nguyên tắc; hai luồng `ts10`/`hsg`;
- blueprint 12 giai đoạn + recipe; bài giải đề;
- "khi học sinh hỏi" (giữ phần của `1c-22`); tên scene và keyPoints;
- "khi user hỏi cả chuyên đề" (`references/curriculum/index.json` + `curriculum-planner`).

Không sửa khối id sinh ra.

**Xong khi:** `pnpm vitest run tests/tutor/skill-catalog-sync.test.ts tests/agent-runtime/skills.test.ts tests/workbench/workbench-i18n.test.ts` xanh.

### 2-I1 · Đối chiếu bản cài đặt C++/Python

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `tests/subjects/impl-equivalence.test.ts`, `tests/subjects/cp/impl/binary-search.ts`, `tests/subjects/cp/impl/bs-answer-mini.ts` |
| Đọc | [../TEST-STRATEGY](../TEST-STRATEGY.md) §2 (dòng "Bản cài đặt C++/Python"); [README](README.md) §5 D11 |

**Làm**
1. Mỗi entry có một **harness** ở `tests/subjects/cp/impl/<id>.ts`, export mặc định:
   ```ts
   export default {
     entryId: 'binary-search',
     cppPrelude: ['#include <bits/stdc++.h>', 'using namespace std;'],
     cppMain: ['int main() { … đọc stdin, gọi hàm trong impl.cpp, in kết quả … }'],
     pyMain: ['import sys', '… đọc stdin, gọi hàm trong impl.py, in kết quả …'],
     stdin: (input) => '…',     // văn bản: số cách nhau bởi dấu cách / xuống dòng
     expected: (input) => '…',  // kết quả tính ĐỘC LẬP (oracle), cùng dạng stdout
   }
   ```
2. Test bật bằng `TUTOR_IMPL_CHECK=1`. Với mọi harness và mọi preset của entry:
   - ghép `cppPrelude + impl.cpp + cppMain` → `g++ -std=c++17 -O2` → chạy với `stdin` → so `stdout.trim()` với `expected`;
   - ghép `impl.py + pyMain` → `python3` → so tương tự.
   - Thư mục tạm dưới `os.tmpdir()`; timeout 10 s mỗi lần chạy.
3. Entry trong `SUBJECT_PACKS` mà không có harness thì test đỏ, kèm tên entry.
4. Viết harness cho `binary-search` và `bs-answer-mini`.

**Xong khi:** `TUTOR_IMPL_CHECK=1 pnpm vitest run tests/subjects/impl-equivalence.test.ts` xanh. Không đặt cờ thì test tự bỏ qua. Báo leader nếu runner CI không có `g++`/`python3`.

### 2-E1 · Eval `tutor-lesson`

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `eval/tutor-lesson/runner.ts`, `eval/tutor-lesson/judge.ts`, `eval/tutor-lesson/scenarios.json` |
| Đọc | [../TEST-STRATEGY](../TEST-STRATEGY.md) §6 (dòng `eval:tutor-lesson`); ADR 0008 (rubric); mẫu `eval/outline-language/runner.ts` |

**Làm**
1. ≥ 6 scenario: 3 `ts10` + 3 `hsg`, gồm ≥ 2 bài giải đề.
2. Chấm theo rubric ADR 0008 (6 tiêu chí); judge temperature 0, parse JSON chặt; ghi token vào/ra.
3. Có chế độ `--dry-run`.

**Xong khi:** `pnpm exec tsx eval/tutor-lesson/runner.ts --dry-run` xanh.

### 2-CI1 · Bật nhập input cho entry `array`/`grid` (sau 1d)

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | 1d-05, I-07 |
| Sở hữu | `lib/subjects/cp/catalog/bs-answer-mini.ts`, `lib/subjects/cp/catalog/prefix-sum.ts`, `lib/subjects/cp/catalog/two-pointers.ts`, `lib/subjects/cp/catalog/stack-queue.ts`, `lib/subjects/cp/catalog/quick-sort.ts`, `lib/subjects/cp/catalog/merge-sort.ts`, `lib/subjects/cp/catalog/n-queens.ts`, `lib/subjects/cp/catalog/bs-answer.ts`, `lib/subjects/cp/catalog/sieve.ts`, `lib/subjects/cp/catalog/euclid-gcd.ts`, `lib/subjects/cp/catalog/bit-subsets.ts`, `lib/subjects/cp/catalog/activity-selection.ts`, `lib/subjects/cp/catalog/string-scan.ts`, `lib/subjects/cp/catalog/hash-count.ts`, `lib/subjects/cp/catalog/knapsack-01.ts`, `lib/subjects/cp/catalog/lcs.ts`, `lib/subjects/cp/catalog/lis.ts`, `lib/subjects/cp/catalog/kmp.ts`, `lib/subjects/cp/catalog/digit-dp.ts`, `lib/subjects/cp/catalog/nim-grundy.ts`, `lib/tutor/build/generated/entry-*.ts`, `tests/subjects/cp/custom-input.test.ts` |
| Đọc | [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §5 (gạch `customInput`); card `1d-05` |

**Làm**
1. Đặt `customInput: true` cho các entry trên (visualizer `array`/`grid`), chạy script sinh bundle `entry-<id>.ts`.
2. Thêm từng entry vào test tương đương server/iframe của `1d-05`.

`customInput` không nằm trong `contentHash`, nên không cần tăng `entryRev`.

**Xong khi:** `pnpm vitest run tests/subjects/cp/custom-input.test.ts tests/tutor/build/runtime-fresh.test.ts` xanh.

## 2. Card mẫu cho task mô-đun (áp cho mọi card ở §3–§7)

Mỗi card mô-đun chỉ ghi phần riêng; mọi yêu cầu dưới đây là bắt buộc.

| Trường | Giá trị chung |
| --- | --- |
| Đọc | [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §5; [../CONTENT-DESIGN](../CONTENT-DESIGN.md) §5 (mục 5.1); hợp đồng state của visualizer ở card `2-V*` (hoặc `3B-V1` với `geometry`); entry mẫu `lib/subjects/cp/catalog/binary-search.ts` + test `tests/subjects/cp/binary-search.test.ts`; harness mẫu `tests/subjects/cp/impl/binary-search.ts` |

**Làm** (giống `1a-07`, thay nội dung theo card):
1. Export `<camelId>Entry: WalkthroughEntry<…>`.
   - `id` đúng tên card; `entryRev: 1`; `subject: 'cp'`; `visualizer` và `curriculumTopics` đúng card; `customInput: false` (bật ở `2-CI1`).
2. `inputSpec` đúng dòng **Input**; `check` đúng dòng **check**, trả mã issue kebab-case. Mọi preset phải qua `validateInput`.
3. Preset đúng dòng **Preset**. Tổng frame mọi preset ≤ 300; `maxFrames` theo dòng **Ngưỡng**. Vượt thì báo leader số đo, không tự cắt preset.
4. `run(input, emit, tick, ctx)`:
   - `tick()` mỗi vòng lặp;
   - `explanation` ≤ 160 ký tự theo `ctx.locale`; `codeLine` là dòng pseudocode;
   - state đúng hợp đồng visualizer; frame mốc gắn tag `beat:<id>` đúng dòng **Beat**.
5. `beatDefs`, có `label`, `narration` (vi/en, chỉ dùng biến có trong `vars`), `hints[3]` (nhẹ → gần lời giải), `misconceptions` (≥ 1).
   - Beat có dấu `*` là `required`.
   - Beat ghi "dự đoán" có `ask.predict` với câu hỏi đã cho, chấm theo hợp đồng của `1c-05`.
6. Pseudocode + C++ + Python chỉ-đọc, cùng ý tưởng; `map.cpp`/`map.py` toàn phần.
   - `pitfalls` gồm các bẫy ở dòng **Bẫy**, có nhãn `lang` khi riêng một ngôn ngữ.
7. Bài giải đề: `problem` có đề, giới hạn, subtask (kèm `complexity`).
8. Harness `tests/subjects/cp/impl/<id>.ts` theo hợp đồng ở `2-I1`.

**Không làm:**
- sửa `pack.ts`, `catalog-lock.json`, `SKILL.md`, visualizer (báo leader);
- dùng `Intl`/`Date`/`Math.random`/`Math.pow` trong catalog.

**Xong khi:** `pnpm vitest run tests/subjects/cp/<id>.test.ts` xanh; `pnpm exec eslint lib/subjects/cp/catalog/<id>.ts` sạch; `TUTOR_IMPL_CHECK=1 pnpm vitest run tests/subjects/impl-equivalence.test.ts` xanh nếu máy có `g++`/`python3`. Test phủ:
- kết quả cuối đúng theo dòng **Oracle**, tính độc lập trong test;
- mọi preset qua `validateInput`; input sai/`check` sai bị từ chối;
- `map` toàn phần; beat `required` ở mọi preset; mọi `beatDef` dùng ở ≥ 1 preset;
- số nguyên trong `explanation` thuộc state/`vars`; `explanation` ≤ 160 ký tự;
- `fill` không còn `{…}` ở cả hai locale; đủ `vi-VN`/`en-US`;
- không mutate input; ngưỡng frame.

Ký hiệu: `int[a,b]` = `{kind:'int', range:[a,b]}`; `int-array(len[a,b], range[c,d])`; `string(len[a,b], 'a-z')`; `edge-list(nodes[a,b], edges[c,d], weight?[e,f])` với hình dạng thô ở [README](README.md) §5 D10; `grid(rows[a,b], cols[c,d], cell)`. Ngưỡng frame là [Inference].

## 3. Đợt 2A (giao song song ngay sau G1)

State theo hợp đồng visualizer ở `2-V*`; không cần chờ `2-V*` xong mới viết entry.

### 2A-01 · `prefix-sum` (mảng cộng dồn)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/subjects/cp/catalog/prefix-sum.ts`, `tests/subjects/cp/prefix-sum.test.ts`, `tests/subjects/cp/impl/prefix-sum.ts` |
| Đọc | card mẫu §2; topic `t1-array-prefix` (`ts10`) |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `array` `cells`. `values` = mảng; `rows: [{label:'P', values: P, offset: 0}]` với `P[0] = 0`, `P[i+1] = P[i] + a[i]`. `pointers`: `i` (khi dựng), `l`, `r` (khi hỏi).
- **Input:** `record { values: int-array(len[1,10], range[-99,99]), l: int[0,9], r: int[0,9] }`. **check:** `l ≤ r < n`.
- **Preset:**
  - `basic` (`[3,1,4,1,5,9,2,6]`, l=2, r=5);
  - `whole` (cùng mảng, l=0, r=7);
  - `one-cell` (l=r=3);
  - `negative` (`[-2,5,-1,3,-4]`, l=1, r=3);
  - `n1` (`[7]`, 0, 0).
- **Beat:**
  - `start`*;
  - `naive` (cộng từng phần tử, O(n) mỗi truy vấn);
  - `build` (mỗi `P[i+1]`);
  - `query`, dự đoán: "tổng a[l..r] = P[r+1] − P[?]", chọn `P[l]` / `P[l−1]`;
  - `answer`; `done`*.
- **Oracle:** cộng trực tiếp `a[l..r]`.
- **Bẫy:** lệch chỉ số `P[r+1] − P[l]`; `cpp`: tổng lớn cần `long long`; `py`: `sum(a[l:r+1])` vẫn là O(n).
- **Ngưỡng:** `maxFrames` 40.

**Xong khi:** như card mẫu §2, với `<id>` = `prefix-sum`.

### 2A-02 · `two-pointers` (hai con trỏ trên mảng tăng)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/subjects/cp/catalog/two-pointers.ts`, `tests/subjects/cp/two-pointers.test.ts`, `tests/subjects/cp/impl/two-pointers.ts` |
| Đọc | card mẫu §2; topic `t1-array-prefix` (`ts10`) |

**Làm** theo card mẫu §2, với:
- **Bài:** tìm cặp `i < j` có `a[i] + a[j] = target` trên mảng tăng ngặt.
- **Visualizer:** `array` `cells`; `pointers` `i`, `j`; `vars` `i`, `j`, `sum`, `target`.
- **Input:** `record { values: int-array(len[2,10], range[-99,99], strictlyIncreasing), target: int[-198,198] }`.
- **Preset:**
  - `middle` (`[1,3,4,6,8,11]`, 10);
  - `ends` (cùng mảng, 12 = 1 + 11);
  - `absent` (cùng mảng, 2);
  - `n2` (`[2,7]`, 9);
  - `negative` (`[-5,-2,0,3,7]`, 1).
- **Beat:**
  - `start`*;
  - `compare`, dự đoán: "tổng lớn hơn target thì dời con trỏ nào?", chọn `i` / `j`;
  - `move-right` (`i++`); `move-left` (`j--`); `found`; `done`*.
- **Oracle:** vét cạn mọi cặp. Có cặp thì kết quả phải là một cặp đúng; không có thì báo không có.
- **Bẫy:** điều kiện `i < j` (không `≤`); dời nhầm con trỏ khi `sum < target`.
- **Ngưỡng:** 30.

**Xong khi:** như card mẫu §2, với `<id>` = `two-pointers`.

### 2A-03 · `stack-queue` (ngoặc hợp lệ bằng stack)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-IS1 |
| Sở hữu | `lib/subjects/cp/catalog/stack-queue.ts`, `tests/subjects/cp/stack-queue.test.ts`, `tests/subjects/cp/impl/stack-queue.ts` |
| Đọc | card mẫu §2; topic `t1-stack-queue` (`ts10`); [README](README.md) §5 D14 |

**Làm** theo card mẫu §2, với:
- **Phạm vi:** chỉ phần stack. Hàng đợi được dạy ở `bfs` (2B-07) (D14).
- **Visualizer:** `array` `cells` (mỗi ký tự một ô); `aux: [{ id:'stack', label:'Stack', items }]`; `pointers` `i`.
- **Input:** `record { s: string(len[1,12], 'brackets') }`.
- **Preset:**
  - `nested` (`([]{})`); `sequence` (`()[]{}`);
  - `mismatch` (`([)]`); `unclosed` (`((()`); `extra-close` (`())`).
- **Beat:**
  - `start`*;
  - `push` (ký tự mở);
  - `pop-check`, dự đoán: "ký tự đóng này có khớp đỉnh stack không?", chọn có / không;
  - `pop`; `fail` (sai khớp, stack rỗng khi gặp ngoặc đóng, hoặc còn dư cuối xâu); `done`*.
- **Oracle:** xoá lặp các cặp `()`, `[]`, `{}` kề nhau tới khi không đổi; hợp lệ khi xâu rỗng.
- **Bẫy:** `cpp`: `st.top()` khi rỗng là hành vi không xác định; `py`: `st[-1]` khi rỗng ném `IndexError`; quên kiểm stack rỗng ở cuối.
- **Ngưỡng:** 30.

**Xong khi:** như card mẫu §2, với `<id>` = `stack-queue`.

### 2A-04 · `fib-recursion-tree` (cây gọi đệ quy + nhớ)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/subjects/cp/catalog/fib-recursion-tree.ts`, `tests/subjects/cp/fib-recursion-tree.test.ts`, `tests/subjects/cp/impl/fib-recursion-tree.ts` |
| Đọc | card mẫu §2; topic `t1-recursion` (`ts10`) |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `tree`. Mỗi lời gọi một node: `label` `f(k)`; `note` là giá trị trả về khi đã có. Node trúng nhớ có kind `muted`.
- **Input:** `record { n: int[0,6], memo: enum['off','on'] }`.
- **Preset:** `plain-5` (5, off); `memo-5` (5, on); `base-0` (0, off); `base-1` (1, off); `memo-6` (6, on).
- **Beat:**
  - `start`*;
  - `call`, dự đoán: "lời gọi con tiếp theo là f(?)", chọn `k−1` / `k−2`;
  - `base`; `return`; `memo-hit`; `done`*.
- **Oracle:** số lần gọi đếm độc lập (công thức truy hồi trong test); giá trị bằng vòng lặp.
- **Bẫy:** thiếu điều kiện dừng `n < 2`; `py`: nhớ bằng `dict` phải kiểm trước khi gọi.
- **Ngưỡng:** 60. `plain` với `n = 6` có 25 lời gọi; nếu vượt thì báo leader.

**Xong khi:** như card mẫu §2, với `<id>` = `fib-recursion-tree`.

### 2A-05 · `quick-sort` (phân hoạch Lomuto)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/subjects/cp/catalog/quick-sort.ts`, `tests/subjects/cp/quick-sort.test.ts`, `tests/subjects/cp/impl/quick-sort.ts` |
| Đọc | card mẫu §2; topic `t2-sorting`, `t2-divide-conquer` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `array` `bars`; `pointers` `i`, `j`, `pivot`; đoạn đang xét có kind `active`, phần đã cố định kind `result`.
- **Input:** `record { values: int-array(len[2,8], range[-999,999]) }`.
- **Preset (tối đa 4):** `random` (`[5,2,8,1,9,3]`); `sorted` (`[1,2,3,4,5,6]`, trường hợp xấu); `dups` (`[3,1,3,2,3]`); `n2` (`[2,1]`).
- **Emit:** một frame mỗi phép so sánh (gộp hoán đổi vào cùng frame), một frame khi đặt pivot, một frame khi vào đoạn con.
- **Beat:**
  - `start`*; `pick-pivot`;
  - `compare`, dự đoán: "a[j] sang trái hay phải pivot?", chọn trái / phải;
  - `swap`; `place-pivot`; `recurse`; `done`*.
- **Oracle:** `[...values].sort((a, b) => a - b)`.
- **Bẫy:** đệ quy `(lo, p−1)` và `(p+1, hi)`, không lệch; mảng đã sắp cho O(n²); `py`: cắt lát tạo bản sao, không sắp tại chỗ.
- **Ngưỡng:** 120.

**Xong khi:** như card mẫu §2, với `<id>` = `quick-sort`.

### 2A-06 · `merge-sort` (trộn từ trên xuống)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/subjects/cp/catalog/merge-sort.ts`, `tests/subjects/cp/merge-sort.test.ts`, `tests/subjects/cp/impl/merge-sort.ts` |
| Đọc | card mẫu §2; topic `t2-sorting`, `t2-divide-conquer` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `array` `bars`; mảng phụ đang trộn là `rows: [{label:'tmp', values}]`; `pointers` `i`, `j`, `k`.
- **Input:** như `quick-sort`.
- **Preset (tối đa 4):** `random` (`[5,2,8,1,9,3]`); `reverse` (`[6,5,4,3,2,1]`); `dups` (`[3,1,3,2,3]`); `n2` (`[2,1]`).
- **Beat:**
  - `start`*; `split`;
  - `merge-compare`, dự đoán: "lấy phần tử từ nửa trái hay nửa phải?", chọn trái / phải;
  - `copy-rest`; `merged`; `done`*.
- **Oracle:** `Array.prototype.sort`.
- **Bẫy:** dùng `<=` để giữ ổn định; quên chép phần còn lại; mảng phụ sai kích thước.
- **Ngưỡng:** 120.

**Xong khi:** như card mẫu §2, với `<id>` = `merge-sort`.

### 2A-07 · `subset-gen` (sinh tập con bằng đệ quy)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/subjects/cp/catalog/subset-gen.ts`, `tests/subjects/cp/subset-gen.test.ts`, `tests/subjects/cp/impl/subset-gen.ts` |
| Đọc | card mẫu §2; topic `t2-brute-force` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `tree`. Node là trạng thái `(i, tập hiện tại)`, `label` như `{1,3}`; `edgeLabel` `lấy a[i]` / `bỏ a[i]`; lá xuất kết quả có kind `result`.
- **Input:** `record { items: int-array(len[1,4], range[1,9]) }`.
- **Preset:** `n3` (`[1,2,3]`); `n1` (`[5]`); `n2` (`[4,7]`); `n4` (`[1,2,3,4]`).
- **Beat:**
  - `start`*;
  - `choose`, dự đoán: "nhánh tiếp theo lấy hay bỏ a[i]?", chọn lấy / bỏ;
  - `skip`; `leaf`; `backtrack`; `done`*.
- **Oracle:** liệt kê `2^n` mặt nạ bit; so tập kết quả không phân biệt thứ tự.
- **Bẫy:** `cpp`: quên `pop_back` khi quay lui; `py`: thêm `cur` thay vì `cur[:]`.
- **Ngưỡng:** 80 (`n = 4` có 31 node).

**Xong khi:** như card mẫu §2, với `<id>` = `subset-gen`.

### 2A-08 · `n-queens` (quay lui, nghiệm đầu tiên)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/subjects/cp/catalog/n-queens.ts`, `tests/subjects/cp/n-queens.test.ts`, `tests/subjects/cp/impl/n-queens.ts` |
| Đọc | card mẫu §2; topic `t2-backtracking`; [README](README.md) §5 D18 |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `grid` n×n. Ô có hậu là `'Q'`; ô bị tấn công có kind `muted`; ô đang thử có kind `active`.
- **Input:** `record { n: enum[1,3,4,5,6] }` (D18: thêm 1 và 3 làm biên).
- **Preset:** `n1` (biên); `n3-none` (vô nghiệm); `n4`; `n5`.
- **Beat:**
  - `start`*; `try`;
  - `conflict-check`, dự đoán: "ô này có bị hậu nào tấn công không?", chọn có / không;
  - `place`; `backtrack`; `solution`; `done`*.
- **Oracle:** vét cạn hoán vị cột: tồn tại nghiệm hay không; nghiệm trả ra hợp lệ.
- **Bẫy:** kiểm đường chéo bằng `r − c` và `r + c`; `py`: `abs(r1 − r2) == abs(c1 − c2)`.
- **Ngưỡng:** 120. Đo `n = 6`; vượt thì bỏ 6 khỏi `enum` và báo leader.

**Xong khi:** như card mẫu §2, với `<id>` = `n-queens`.

### 2A-09 · `bs-answer` (P1: cắt gỗ, bản đầy đủ)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | G1-01 |
| Sở hữu | `lib/subjects/cp/catalog/bs-answer.ts`, `tests/subjects/cp/bs-answer.test.ts`, `tests/subjects/cp/impl/bs-answer.ts` |
| Đọc | card mẫu §2; card `1c-07` (bản nhỏ); [../CONTENT-DESIGN](../CONTENT-DESIGN.md) §3 |

**Làm** theo card mẫu §2, với:
- **Bài giải đề:** `problem` với 3 subtask:
  - `n ≤ 100, h ≤ 100`: thử mọi H, O(n·maxH);
  - `n ≤ 10^5, h ≤ 10^9`: chặt nhị phân, O(n log maxH);
  - `n ≤ 10^6`: như trên + đọc nhanh, tổng dùng `long long`.
- **Visualizer:** `array` `bars` + `threshold` (vạch H); `vars` `lo`, `hi`, `mid`, `got`, `m`.
- **Input:** `record { h: int-array(len[1,8], range[1,40]), m: int[1,100] }`. **check:** `m ≤ Σh`.
- **Preset:**
  - `classic` (`[20,15,10,17]`, 7);
  - `all-equal` (`[5,5,5,5]`, 8);
  - `one-tree` (`[30]`, 12);
  - `take-all` (`[3,8,2]`, 13: H = 0);
  - `tiny-need` (`[9,4,7]`, 1).
- **Beat:**
  - `start`*;
  - `brute` (subtask 1);
  - `monotonic` (H tăng thì gỗ giảm);
  - `check`;
  - `narrow`, dự đoán: "check(mid) đúng thì tìm tiếp bên trái hay phải?", chọn trái / phải;
  - `boundary` (vì sao giữ `lo` là đáp án);
  - `done`*.
- **Oracle:** thử mọi H từ `max(h)` về 0, lấy H lớn nhất đủ gỗ.
- **Bẫy:** `cpp`: tổng tràn `int`; `hi` khởi đầu `max(h)`; vòng `lo < hi` với `mid = (lo + hi + 1) / 2` để không lặp vô hạn.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `bs-answer`.

## 4. Đợt 2B (sau cổng G2)

### 2B-01 · `sieve` (sàng Eratosthenes)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/sieve.ts`, `tests/subjects/cp/sieve.test.ts`, `tests/subjects/cp/impl/sieve.ts` |
| Đọc | card mẫu §2; topic `t2-number-basics` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `grid`, 10 cột, `⌈n/10⌉` hàng, ô chứa số 1…n. Hợp số bị gạch có kind `muted`; số nguyên tố kind `result`; `p` hiện tại kind `active`.
- **Input:** `record { n: int[2,60] }`.
- **Preset:** `n30`; `n2` (biên); `n49` (7² = n, biên của `p·p ≤ n`); `n60`.
- **Emit:** một frame khi chọn `p`, một frame gạch **mọi** bội của `p` một lượt (không mỗi bội một frame).
- **Beat:**
  - `start`*;
  - `next-prime`, dự đoán: "bắt đầu gạch từ bội nào của p?", chọn `2p` / `p²`;
  - `cross`; `stop` (`p² > n`); `done`*.
- **Oracle:** chia thử từng số.
- **Bẫy:** bắt đầu từ `p·p`; điều kiện `p·p ≤ n`; `cpp`: `vector<bool>(n+1)`; `py`: `range(p*p, n+1, p)`.
- **Ngưỡng:** 30.

**Xong khi:** như card mẫu §2, với `<id>` = `sieve`.

### 2B-02 · `euclid-gcd` (thuật toán Euclid)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/euclid-gcd.ts`, `tests/subjects/cp/euclid-gcd.test.ts`, `tests/subjects/cp/impl/euclid-gcd.ts` |
| Đọc | card mẫu §2; topic `t2-number-basics` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `array` `cells`; `values = [a, b, a mod b]`; lịch sử các cặp là `rows` (mỗi bước một hàng).
- **Input:** `record { a: int[0,200], b: int[0,200] }`. **check:** không đồng thời bằng 0.
- **Preset:** `basic` (48, 18); `coprime` (35, 64); `b-zero` (7, 0) (biên); `equal` (12, 12); `a-less` (18, 48).
- **Beat:**
  - `start`*;
  - `insight` (gcd(a, b) = gcd(b, a mod b));
  - `mod-step`, dự đoán: "sau bước này b có bằng 0 không?", chọn có / không;
  - `stop`; `done`*.
- **Oracle:** thử mọi ước chung từ `min(a, b)` xuống.
- **Bẫy:** đổi chỗ khi `a < b` (bước đầu tự đổi); đệ quy và vòng lặp tương đương; `py`: không dùng `math.gcd` trong bài.
- **Ngưỡng:** 30.

**Xong khi:** như card mẫu §2, với `<id>` = `euclid-gcd`.

### 2B-03 · `bit-subsets` (duyệt tập con bằng mặt nạ bit)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/bit-subsets.ts`, `tests/subjects/cp/bit-subsets.test.ts`, `tests/subjects/cp/impl/bit-subsets.ts` |
| Đọc | card mẫu §2; topic `t2-bitwise` |

**Làm** theo card mẫu §2, với:
- **Bài:** đếm tập con có tổng bằng `target`.
- **Visualizer:** `array` `bits` (bit của `mask`); `rows: [{label:'a', values: items}]`; phần tử được chọn có kind `active`.
- **Input:** `record { items: int-array(len[1,4], range[1,9]), target: int[0,36] }`.
- **Preset:** `n3` (`[2,3,5]`, 5); `n1` (`[4]`, 4); `none` (`[1,2,4,8]`, 16); `many` (`[1,1,2,2]`, 3).
- **Beat:**
  - `start`*; `mask`;
  - `test-bit`, dự đoán: "bit i của mask này bật không?", chọn bật / tắt;
  - `match`; `done`*.
- **Oracle:** đệ quy lấy/bỏ (độc lập với bit).
- **Bẫy:** `(mask >> i) & 1` cần ngoặc; `cpp`: `1LL << i` khi n lớn.
- **Ngưỡng:** 40.

**Xong khi:** như card mẫu §2, với `<id>` = `bit-subsets`.

### 2B-04 · `activity-selection` (tham lam chọn đoạn + đổi chỗ)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/activity-selection.ts`, `tests/subjects/cp/activity-selection.test.ts`, `tests/subjects/cp/impl/activity-selection.ts` |
| Đọc | card mẫu §2; topic `t3-greedy` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `array` `cells` (trục 0…24) + `intervals`. Đoạn được chọn có kind `result`; đoạn bị loại kind `muted`.
- **Input:** `record { seg: grid(rows[1,8], cols[2,2], 'int', range[0,24]) }`, mỗi hàng `[start, end)`. **check:** `start < end` mọi hàng.
- **Preset:**
  - `classic` (`[[1,4],[3,5],[0,6],[5,7],[3,9],[8,9]]`);
  - `nested` (`[[0,10],[1,2],[3,4],[5,6]]`);
  - `disjoint` (`[[0,1],[2,3],[4,5]]`);
  - `single` (`[[2,5]]`);
  - `same-end` (`[[1,4],[2,4],[3,4]]`).
- **Beat:**
  - `start`*;
  - `sort`, dự đoán: "sắp theo điểm đầu hay điểm cuối?", chọn đầu / cuối;
  - `pick`; `skip`;
  - `exchange` (lập luận đổi chỗ ở lần chọn đầu tiên);
  - `done`*.
- **Oracle:** vét cạn mọi tập đoạn không giao (2⁸); số đoạn lớn nhất bằng kết quả tham lam.
- **Bẫy:** sắp theo điểm đầu là sai; với đoạn nửa mở thì so `start ≥ lastEnd`; `cpp`: lambda trong `sort`; `py`: `key=lambda s: s[1]`.
- **Ngưỡng:** 40.

**Xong khi:** như card mẫu §2, với `<id>` = `activity-selection`.

### 2B-05 · `string-scan` (kiểm xâu đối xứng)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/string-scan.ts`, `tests/subjects/cp/string-scan.test.ts`, `tests/subjects/cp/impl/string-scan.ts` |
| Đọc | card mẫu §2; topic `t1-string` (`ts10`); [README](README.md) §5 D14 |

**Làm** theo card mẫu §2, với:
- **Phạm vi:** đối xứng bằng hai con trỏ. Đếm tần suất nằm ở `hash-count` (D14).
- **Visualizer:** `array` `cells` (ký tự); `pointers` `i`, `j`.
- **Input:** `record { s: string(len[1,12], 'a-z') }`.
- **Preset:** `odd` (`racecar`); `even` (`abba`); `not` (`abca`); `single` (`a`); `near` (`abcdba`).
- **Beat:**
  - `start`*;
  - `compare`, dự đoán: "s[i] và s[j] có bằng nhau?", chọn có / không;
  - `move`; `mismatch`; `done`*.
- **Oracle:** so `s` với xâu đảo ngược.
- **Bẫy:** điều kiện `i < j`; `cpp`: `s.size() - 1` là số không dấu; `py`: `s[::-1]` tốn thêm O(n) bộ nhớ.
- **Ngưỡng:** 20.

**Xong khi:** như card mẫu §2, với `<id>` = `string-scan`.

### 2B-06 · `hash-count` (đếm tần suất bằng bảng băm)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/hash-count.ts`, `tests/subjects/cp/hash-count.test.ts`, `tests/subjects/cp/impl/hash-count.ts` |
| Đọc | card mẫu §2; topic `t1-hash` (`ts10`) |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `array` `cells` (ký tự); `aux: [{ id:'count', label:'Đếm', items: ['a:2', …] }]` (khoá sắp theo chữ cái); `pointers` `i`.
- **Input:** `record { s: string(len[1,12], 'a-z') }`.
- **Preset:** `repeat` (`banana`); `all-same` (`aaaa`); `distinct` (`abcdef`); `single` (`z`).
- **Beat:**
  - `start`*;
  - `read`, dự đoán: "ký tự này đã có trong bảng chưa?", chọn có / chưa;
  - `new-key`; `increment`;
  - `max` (tìm ký tự nhiều nhất; hoà thì lấy chữ cái nhỏ nhất);
  - `done`*.
- **Oracle:** đếm bằng `split` từng ký tự trong test.
- **Bẫy:** `cpp`: mảng `cnt[26]` với `c - 'a'` hoặc `unordered_map`; `py`: `d.get(c, 0) + 1`; hoà thì phải có quy tắc chọn.
- **Ngưỡng:** 30.

**Xong khi:** như card mẫu §2, với `<id>` = `hash-count`.

### 2B-07 · `bfs` (tìm kiếm theo chiều rộng, có hàng đợi)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/bfs.ts`, `tests/subjects/cp/bfs.test.ts`, `tests/subjects/cp/impl/bfs.ts` |
| Đọc | card mẫu §2; topic `t3-graph-traversal` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `graph` vô hướng; `label` `A (d=2)`; `aux: [{ id:'queue', label:'Queue', items }]`. Đỉnh đã thăm có kind `visited`; đỉnh đang xử lý kind `active`.
- **Input:** `record { g: edge-list(nodes[1,8], edges[0,12]), source: int[0,7] }`. **check:** `source < n`; không cạnh trùng.
- **Thứ tự:** hàng xóm duyệt theo chỉ số tăng (tất định).
- **Preset:** `tree`; `cycle`; `disconnected` (có đỉnh không tới được); `single` (n = 1, không cạnh); `two-paths` (hai đường cùng độ dài).
- **Beat:**
  - `start`*;
  - `dequeue`;
  - `enqueue`, dự đoán: "hàng xóm này có được đưa vào queue không?", chọn có / không;
  - `skip-visited`;
  - `layer` (sang mức khoảng cách mới);
  - `done`*.
- **Oracle:** khoảng cách đơn vị bằng Bellman-Ford trong test.
- **Bẫy:** đánh dấu đã thăm **khi đưa vào queue**, không phải khi lấy ra; `py`: `collections.deque`, không `list.pop(0)`.
- **Ngưỡng:** 50.

**Xong khi:** như card mẫu §2, với `<id>` = `bfs`.

### 2B-08 · `dfs` (tìm kiếm theo chiều sâu)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/dfs.ts`, `tests/subjects/cp/dfs.test.ts`, `tests/subjects/cp/impl/dfs.ts` |
| Đọc | card mẫu §2; topic `t3-graph-traversal`; card `2B-07` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `graph` vô hướng; `label` `A (#3)` (thứ tự thăm); `aux: [{ id:'stack', label:'Call stack', items }]`. Cạnh cây có kind `result`.
- **Input:** như `bfs`. **check:** như `bfs`.
- **Preset:** `tree`; `cycle`; `disconnected`; `single`; `deep-chain` (đường thẳng 8 đỉnh).
- **Beat:**
  - `start`*;
  - `visit`, dự đoán: "đỉnh tiếp theo được thăm là?", chọn giữa hai hàng xóm chưa thăm;
  - `tree-edge`; `backtrack`; `skip-visited`; `done`*.
- **Oracle:**
  - tập đỉnh thăm được bằng tập tới được (tính bằng bao đóng trong test);
  - mỗi đỉnh mới kề một đỉnh đang ở trên stack.
- **Bẫy:** `py`: giới hạn đệ quy (ở đây nhỏ); bản dùng stack lặp phải đẩy hàng xóm theo thứ tự ngược để cùng thứ tự thăm.
- **Ngưỡng:** 50.

**Xong khi:** như card mẫu §2, với `<id>` = `dfs`.

### 2B-09 · `knapsack-01` (quy hoạch động cái túi 0/1)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/knapsack-01.ts`, `tests/subjects/cp/knapsack-01.test.ts`, `tests/subjects/cp/impl/knapsack-01.ts` |
| Đọc | card mẫu §2; topic `t3-dp-basic` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `grid` (n+1) × (cap+1); `rowLabels` là món (`0`, `1:w3/v4`…), `colLabels` là sức chứa; `arrows` từ `dp[i−1][w]` và `dp[i−1][w−wᵢ]`.
- **Input:** `record { w: int-array(len[1,5], range[1,20]), v: int-array(len[1,5], range[1,20]), cap: int[0,12] }`. **check:** `len(w) = len(v)`.
- **Preset:** `classic` (w `[1,3,4]`, v `[15,20,30]`, cap 4); `cap-zero` (cap 0); `one-item` (w `[2]`, v `[3]`, cap 5); `too-heavy` (w `[9,10]`, v `[5,6]`, cap 8).
- **Emit:** một frame mỗi ô (tối đa 6×13 = 78 ô).
- **Beat:**
  - `start`*; `base-row`;
  - `cell`, dự đoán: "ô này lấy món i hay không?", chọn lấy / bỏ;
  - `take`; `skip`; `traceback`; `done`*.
- **Oracle:** vét cạn 2ⁿ tập món.
- **Bẫy:** bản một chiều phải duyệt `w` **giảm dần**; `py`: `[[0]*(cap+1) for _ in range(n+1)]`, không `[[0]*(cap+1)]*(n+1)`.
- **Ngưỡng:** 100.

**Xong khi:** như card mẫu §2, với `<id>` = `knapsack-01`.

### 2B-10 · `lcs` (dãy con chung dài nhất)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/lcs.ts`, `tests/subjects/cp/lcs.test.ts`, `tests/subjects/cp/impl/lcs.ts` |
| Đọc | card mẫu §2; topic `t3-dp-basic` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `grid` (|a|+1) × (|b|+1); nhãn hàng/cột là ký tự; `arrows` chéo / lên / trái.
- **Input:** `record { a: string(len[1,6], 'a-z'), b: string(len[1,6], 'a-z') }`.
- **Preset:** `classic` (`abcbda`, `bdcaba`); `same` (`abc`, `abc`); `disjoint` (`abc`, `xyz`); `single` (`a`, `a`).
- **Beat:**
  - `start`*; `base`;
  - `match`, dự đoán: "a[i] = b[j] thì lấy từ ô nào?", chọn chéo / max(trên, trái);
  - `mismatch`; `traceback`; `done`*.
- **Oracle:** vét cạn 2⁶ dãy con của `a`, kiểm là dãy con của `b`, lấy độ dài lớn nhất.
- **Bẫy:** `dp[i][j]` là độ dài **tiền tố** (chỉ số lệch 1); `py`: lỗi tham chiếu chung khi tạo danh sách lồng.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `lcs`.

### 2B-11 · `lis` (dãy con tăng dài nhất, O(n²))

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/lis.ts`, `tests/subjects/cp/lis.test.ts`, `tests/subjects/cp/impl/lis.ts` |
| Đọc | card mẫu §2; topic `t3-dp-basic` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `grid` 2 × n (hàng `a`, hàng `dp`); `arrows` từ cột j sang cột i khi `dp[i]` được cải thiện.
- **Input:** `record { values: int-array(len[1,8], range[-99,99]) }`.
- **Preset:** `mixed` (`[3,10,2,1,20,4,6,7]`); `increasing` (`[1,2,3,4,5]`); `decreasing` (`[5,4,3,2,1]`); `single` (`[7]`); `dups` (`[2,2,2,3]`).
- **Beat:**
  - `start`*; `init`;
  - `extend`, dự đoán: "dp[i] có tăng nhờ j không?", chọn có / không;
  - `best`; `traceback`; `done`*.
- **Oracle:** vét cạn 2⁸ dãy con tăng **ngặt**.
- **Bẫy:** `<` hay `≤` (tăng ngặt); đáp án là `max(dp)`, không phải `dp[n−1]`.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `lis`.

### 2B-12 · `min-total-wait` (P2: tham lam + chứng minh đổi chỗ)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | 2-G2 |
| Sở hữu | `lib/subjects/cp/catalog/min-total-wait.ts`, `tests/subjects/cp/min-total-wait.test.ts`, `tests/subjects/cp/impl/min-total-wait.ts` |
| Đọc | card mẫu §2; topic `t3-greedy`; [README](README.md) §5 D16 |

**Làm** theo card mẫu §2, với:
- **Đề** (leader đề xuất [Inference], hội đồng LLM Tin duyệt ở `I-05`): một quầy phục vụ n khách, khách i cần `t[i]` phút; sắp thứ tự để **tổng thời gian chờ** nhỏ nhất.
- **Subtask:**
  - `n ≤ 8`: thử mọi hoán vị, O(n!·n);
  - `n ≤ 10^5`: sắp tăng dần (SPT), O(n log n);
  - `t ≤ 10^9`: như trên, tổng cần `long long`.
- **Visualizer:** `array` `bars` (thời gian); `rows: [{label:'chờ', values}]` (thời gian chờ cộng dồn).
- **Input:** `record { t: int-array(len[1,8], range[1,20]) }`.
- **Preset:** `classic` (`[8,3,5,1]`); `sorted` (`[1,2,3,4]`); `equal` (`[4,4,4]`); `single` (`[6]`).
- **Beat:**
  - `start`*; `brute`;
  - `swap-argument`, dự đoán: "đổi chỗ hai khách kề nhau, khách ngắn trước hay sau thì tổng chờ giảm?", chọn trước / sau;
  - `sort`; `accumulate`; `done`*.
- **Oracle:** vét cạn mọi hoán vị (8! = 40320).
- **Bẫy:** tính thời gian chờ (không gồm thời gian của chính mình) khác thời gian hoàn thành; tràn số.
- **Ngưỡng:** 40.

**Xong khi:** như card mẫu §2, với `<id>` = `min-total-wait`.

## 5. Đợt 2C (sau `I-05`)

### 2C-01 · `dsu` (hợp nhất tập: nén đường + hợp theo kích thước)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/dsu.ts`, `tests/subjects/cp/dsu.test.ts`, `tests/subjects/cp/impl/dsu.ts` |
| Đọc | card mẫu §2; topic `t3-dsu` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `tree` (rừng theo `parent`); `note` là kích thước tập ở gốc; mỗi tập một kind `group-k`.
- **Input:** `edge-list(nodes[2,8], edges[1,8])`, dùng `edges` làm dãy phép `union(a, b)`.
- **Preset:** `chain` (union lần lượt thành đường thẳng); `star`; `redundant` (union hai đỉnh đã cùng tập); `two-sets`; `min` (n = 2, một phép).
- **Beat:**
  - `start`*;
  - `find`, dự đoán: "gốc của x là đỉnh nào?";
  - `compress`; `union`; `same-set`; `done`*.
- **Oracle:** thành phần liên thông bằng BFS trên các cặp đã union.
- **Bẫy:** hợp theo kích thước phải so **gốc**, không so đỉnh; `cpp`/`py`: nén đường bằng đệ quy.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `dsu`.

### 2C-02 · `kruskal` (cây khung nhỏ nhất)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/kruskal.ts`, `tests/subjects/cp/kruskal.test.ts`, `tests/subjects/cp/impl/kruskal.ts` |
| Đọc | card mẫu §2; topic `t4-mst`; card `2C-01` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `graph` vô hướng có trọng số. Cạnh được chọn có kind `result`, cạnh bị loại kind `muted`; `aux` hiện DSU dạng `A→A, B→A, …`.
- **Input:** `edge-list(nodes[2,8], edges[1,10], weight[1,20])`. **check:** không khuyên, không cạnh trùng.
- **Preset:** `classic` (6 đỉnh, 9 cạnh); `ties` (trọng số trùng); `forest` (đồ thị không liên thông); `already-tree` (n−1 cạnh); `min` (2 đỉnh).
- **Beat:**
  - `start`*; `sort`;
  - `consider`, dự đoán: "cạnh này có tạo chu trình không?", chọn có / không;
  - `take`; `reject`; `done`*.
- **Oracle:** Prim trên từng thành phần, so **tổng trọng số** (cạnh có thể khác khi trùng trọng số).
- **Bẫy:** sắp theo trọng số; dừng sớm khi đủ n−1 cạnh; `cpp`: sắp `tuple(w, u, v)`.
- **Ngưỡng:** 40.

**Xong khi:** như card mẫu §2, với `<id>` = `kruskal`.

### 2C-03 · `dijkstra` (đường đi ngắn nhất, có heap)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/dijkstra.ts`, `tests/subjects/cp/dijkstra.test.ts`, `tests/subjects/cp/impl/dijkstra.ts` |
| Đọc | card mẫu §2; topic `t4-shortest-path` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `graph` vô hướng có trọng số; `label` `B (5)`; `aux: [{ id:'heap', label:'Heap (d, v)', items }]`. Đỉnh đã chốt có kind `result`.
- **Input:** `record { g: edge-list(nodes[1,8], edges[0,14], weight[1,20]), source: int[0,7] }`. **check:** `source < n`.
- **Preset:** `classic`; `relax-twice` (một đỉnh được cải thiện sau lần cập nhật đầu); `unreachable`; `single`; `line`.
- **Beat:**
  - `start`*;
  - `pop`, dự đoán: "đỉnh nào ra khỏi heap tiếp theo?";
  - `relax`; `skip-stale`; `settle`; `done`*.
- **Oracle:** Bellman-Ford trong test.
- **Bẫy:** bỏ mục cũ `if d > dist[u]: continue`; `cpp`: `priority_queue` mặc định là max-heap, cần `greater<>`; `py`: `heapq` với tuple `(d, v)`.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `dijkstra`.

### 2C-04 · `segment-tree` (dựng + truy vấn tổng đoạn)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/segment-tree.ts`, `tests/subjects/cp/segment-tree.test.ts`, `tests/subjects/cp/impl/segment-tree.ts` |
| Đọc | card mẫu §2; topic `t3-segment-tree` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `tree`, node id `1`…`15` (con là `2k`, `2k+1`), `label` `[l,r]`, `note` là tổng.
  - Khi truy vấn: node nằm trọn trong đoạn có kind `result`, node ngoài đoạn kind `muted`, node cắt đoạn kind `compare`.
- **Input:** `record { values: int-array(len[4,8], range[-99,99]), l: int[0,7], r: int[0,7] }`. **check:** `n ∈ {4, 8}`, `l ≤ r < n`.
- **Preset:** `n8-mid` (l=2, r=5); `n8-full` (0, 7: chỉ gốc); `n4-point` (l=r=1); `n8-edge` (0, 0); `n4-span` (1, 3).
- **Beat:**
  - `start`*;
  - `build` (dựng từ dưới lên);
  - `visit`, dự đoán: "đoạn của node này nằm trong, ngoài hay cắt đoạn hỏi?", chọn trong / ngoài / cắt;
  - `full-cover`; `no-overlap`; `split`; `done`*.
- **Oracle:** cộng trực tiếp `a[l..r]`.
- **Bẫy:** mảng cây kích thước `4n`; `mid = (l + r) / 2` và hai nửa `[l, mid]`, `[mid+1, r]`.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `segment-tree`.

### 2C-05 · `fenwick` (cây chỉ số nhị phân)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/fenwick.ts`, `tests/subjects/cp/fenwick.test.ts`, `tests/subjects/cp/impl/fenwick.ts` |
| Đọc | card mẫu §2; topic `t3-fenwick` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `tree`. Node `i` (1…n) có `label` `i: (i−lowbit, i]`, `note` là tổng; cha của `i` là `i + lowbit(i)` (cây cập nhật).
- **Input:** `record { values: int-array(len[4,8], range[-99,99]), q: int[1,8] }` (tổng tiền tố tới `q`). **check:** `n ∈ {4, 8}`, `q ≤ n`.
- **Preset:** `n8-q7` (nhiều bước nhảy); `n8-q8` (một node); `n4-q1`; `n8-q5`.
- **Beat:**
  - `start`*;
  - `lowbit`, dự đoán: "i & −i bằng bao nhiêu?";
  - `build-add`; `query-jump`; `done`*.
- **Oracle:** tổng tiền tố trực tiếp.
- **Bẫy:** chỉ số từ 1; `i & -i`; vòng `i += i & -i` (cập nhật) và `i -= i & -i` (truy vấn).
- **Ngưỡng:** 50.

**Xong khi:** như card mẫu §2, với `<id>` = `fenwick`.

### 2C-06 · `dp-tree` (tập độc lập trọng số lớn nhất trên cây)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/dp-tree.ts`, `tests/subjects/cp/dp-tree.test.ts`, `tests/subjects/cp/impl/dp-tree.ts` |
| Đọc | card mẫu §2; topic `t4-dp-tree` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `tree` gốc 0; `label` `A (w=5)`; `note` `[bỏ, lấy]` = `[dp0, dp1]`.
- **Input:** `record { g: edge-list(nodes[1,8], edges[0,7]), w: int-array(len[1,8], range[1,20]) }`.
- **check:**
  - số cạnh = n − 1 và liên thông (tức là cây), không thì issue `not-a-tree`;
  - `len(w) = n`, không thì `weights-length`.
- **Preset:** `star`; `path`; `binary` (7 đỉnh); `single`.
- **Beat:**
  - `start`*; `dfs-down`; `leaf`;
  - `combine`, dự đoán: "lấy u thì con của u có được lấy không?", chọn có / không;
  - `choose-root`; `done`*.
- **Oracle:** vét cạn 2⁸ tập đỉnh độc lập.
- **Bẫy:** `dp1[u] = w[u] + Σ dp0[con]`; `dp0[u] = Σ max(dp0, dp1)[con]`; truyền `parent` để không đi ngược.
- **Ngưỡng:** 50.

**Xong khi:** như card mẫu §2, với `<id>` = `dp-tree`.

### 2C-07 · `dp-bitmask` (Held-Karp, n ≤ 4)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/dp-bitmask.ts`, `tests/subjects/cp/dp-bitmask.test.ts`, `tests/subjects/cp/impl/dp-bitmask.ts` |
| Đọc | card mẫu §2; topic `t4-dp-bitmask`; [README](README.md) §5 D18 |

**Làm** theo card mẫu §2, với:
- **Phạm vi:** n ≤ 4 (D18: n = 5 cần 2⁵ = 32 hàng, vượt lưới 16 × 13).
- **Visualizer:** `grid` 2ⁿ × n; nhãn hàng là mặt nạ nhị phân (`0101`), nhãn cột là đỉnh cuối; `arrows` cho chuyển trạng thái.
- **Input:** `record { d: grid(rows[2,4], cols[2,4], 'int', range[0,20]) }`. **check:** ma trận vuông, đường chéo bằng 0.
- **Preset:** `n4` (đối xứng); `n3`; `n2` (biên); `n4-asym` (không đối xứng).
- **Beat:**
  - `start`*;
  - `base` (`dp[1][0] = 0`);
  - `transition`, dự đoán: "mặt nạ mới sau khi đi tới v là?";
  - `close-tour`; `done`*.
- **Oracle:** vét cạn mọi hoán vị đỉnh 1…n−1.
- **Bẫy:** khởi tạo INF; kiểm `mask & (1 << v)`; `cpp`: INF nhỏ hơn giới hạn để cộng không tràn.
- **Ngưỡng:** 80.

**Xong khi:** như card mẫu §2, với `<id>` = `dp-bitmask`.

### 2C-08 · `dijkstra-coupon` (P3: đồ thị trạng thái, miễn phí một cạnh)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/dijkstra-coupon.ts`, `tests/subjects/cp/dijkstra-coupon.test.ts`, `tests/subjects/cp/impl/dijkstra-coupon.ts` |
| Đọc | card mẫu §2; card `2C-03`; [README](README.md) §5 D16 |

**Làm** theo card mẫu §2, với:
- **Đề** (đề xuất [Inference], hội đồng duyệt ở `I-06`): đi từ đỉnh 0 tới đỉnh n−1, được dùng **một** vé đi miễn phí một cạnh; tìm chi phí nhỏ nhất.
- **Subtask:**
  - không vé: Dijkstra;
  - thử miễn phí từng cạnh: O(m · m log n);
  - đồ thị trạng thái `(v, đã dùng vé?)`: O(m log n).
- **Visualizer:** `graph` hai lớp: đỉnh `A0`…(chưa dùng vé) và `A1`…(đã dùng). Cạnh "dùng vé" từ lớp 0 sang lớp 1 có trọng số 0. `aux` là heap.
- **Input:** `edge-list(nodes[2,6], edges[1,8], weight[1,20])`.
- **Preset:** `classic`; `free-last` (nên miễn phí cạnh cuối); `no-gain` (một cạnh duy nhất); `unreachable`.
- **Beat:**
  - `start`*;
  - `states` (giải thích trạng thái `(v, k)`);
  - `pop`;
  - `relax-normal`;
  - `relax-free`, dự đoán: "dùng vé ở cạnh này có lợi hơn không?", chọn có / không;
  - `done`*.
- **Oracle:** với mỗi cạnh, đặt trọng số 0 rồi chạy Bellman-Ford; lấy nhỏ nhất (gồm cả trường hợp không dùng vé).
- **Bẫy:** quên trường hợp không dùng vé; trạng thái đích là `min(dist[n−1][0], dist[n−1][1])`.
- **Ngưỡng:** 80.

**Xong khi:** như card mẫu §2, với `<id>` = `dijkstra-coupon`.

## 6. Đợt 2D (song song 2C, sau `I-05`)

Các topic độ khó 5. Leader đề xuất chạy thuật toán thật trên input rất nhỏ (thay cho frame viết tay) để có oracle ([README](README.md) §5 D16); hội đồng duyệt ở `I-06`.

### 2D-01 · `hld` (phân tách nặng–nhẹ)

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/hld.ts`, `tests/subjects/cp/hld.test.ts`, `tests/subjects/cp/impl/hld.ts` |
| Đọc | card mẫu §2; topic `t4-tree-advanced` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `tree` gốc 0; `note` là kích thước cây con; mỗi chuỗi nặng một kind `group-k`; cạnh nặng có `edgeLabel` `nặng`.
- **Input:** `record { g: edge-list(nodes[2,10], edges[1,9]), u: int[0,9], v: int[0,9] }`. **check:** là cây; `u, v < n`.
- **Preset:** `binary` (7 đỉnh); `caterpillar`; `path` (một chuỗi); `star`.
- **Beat:**
  - `start`*;
  - `sizes` (tính kích thước cây con);
  - `heavy`, dự đoán: "con nặng của đỉnh này là?";
  - `chains`;
  - `query-path` (đường u–v tách thành các đoạn chuỗi);
  - `done`*.
- **Oracle:**
  - các chuỗi phủ mọi đỉnh, không giao nhau;
  - đường u–v ghép từ các đoạn bằng đường đi ngây thơ qua LCA;
  - số chuỗi trên đường ≤ ⌊log₂ n⌋ + 1.
- **Bẫy:** chọn con nặng theo kích thước cây con, không theo độ sâu; thứ tự `pos` liên tục trên mỗi chuỗi.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `hld`.

### 2D-02 · `max-flow` (Edmonds–Karp)

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/max-flow.ts`, `tests/subjects/cp/max-flow.test.ts`, `tests/subjects/cp/impl/max-flow.ts` |
| Đọc | card mẫu §2; topic `t4-flow-matching` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `graph` có hướng; `edge.label` `luồng/sức chứa`; đường tăng luồng có kind `active`; cạnh của lát cắt cuối có kind `result`.
- **Input:** `edge-list(nodes[2,6], edges[1,10], weight[1,10])` (trọng số là sức chứa), nguồn 0, đích n−1.
- **Emit:** một frame khi BFS tìm được đường tăng, một frame sau khi tăng luồng, một frame khi kết thúc (lát cắt).
- **Preset:** `classic` (6 đỉnh); `bottleneck`; `back-edge` (cần dùng cạnh ngược); `no-path`.
- **Beat:**
  - `start`*;
  - `bfs-path`;
  - `bottleneck`, dự đoán: "lượng tăng trên đường này bằng bao nhiêu?";
  - `augment`; `residual`; `min-cut`; `done`*.
- **Oracle:**
  - luồng lớn nhất bằng lát cắt nhỏ nhất, vét cạn mọi tập S chứa nguồn (2⁴);
  - bảo toàn luồng ở mọi đỉnh trong.
- **Bẫy:** quên cạnh ngược trong đồ thị dư; DFS thay BFS làm mất cận số lần tăng.
- **Ngưỡng:** 40.

**Xong khi:** như card mẫu §2, với `<id>` = `max-flow`.

### 2D-03 · `aho-corasick` (trie + liên kết thất bại)

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/aho-corasick.ts`, `tests/subjects/cp/aho-corasick.test.ts`, `tests/subjects/cp/impl/aho-corasick.ts` |
| Đọc | card mẫu §2; topic `t4-string-advanced` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `tree` (trie); `edgeLabel` là ký tự; `note` `fail→X`; node kết thúc mẫu có kind `result`; `aux` là văn bản và các vị trí khớp.
- **Input:** `record { p1: string(len[1,3], 'ab'), p2: string(len[1,3], 'ab'), text: string(len[1,10], 'ab') }`.
- **Preset:** `classic` (`ab`, `b`, `abab`); `nested` (`a`, `aa`, `aaaa`); `none` (`aa`, `bb`, `abab`); `same` (`ab`, `ab`, `ab`).
- **Beat:**
  - `start`*; `insert`;
  - `fail-link`, dự đoán: "liên kết thất bại của node này trỏ về đâu?";
  - `scan`; `output`; `done`*.
- **Oracle:** tìm ngây thơ mọi vị trí xuất hiện của từng mẫu.
- **Bẫy:** tính liên kết thất bại theo BFS (không DFS); gộp kết quả theo chuỗi liên kết thất bại.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `aho-corasick`.

### 2D-04 · `convex-hull-trick` (bao lồi đường thẳng, truy vấn tăng)

| Trường | Giá trị |
| --- | --- |
| Cấp | W+ |
| Cỡ | M |
| Phụ thuộc | I-05 |
| Sở hữu | `lib/subjects/cp/catalog/convex-hull-trick.ts`, `tests/subjects/cp/convex-hull-trick.test.ts`, `tests/subjects/cp/impl/convex-hull-trick.ts` |
| Đọc | card mẫu §2; topic `t4-dp-optimize` |

**Làm** theo card mẫu §2, với:
- **Bài:** n đường `y = k·x + m` thêm theo `k` **giảm dần**; truy vấn `x` **tăng dần**; mỗi truy vấn hỏi `min y`.
- **Visualizer:** `grid` (đường × truy vấn) chứa giá trị `k·x + m`; giá trị nhỏ nhất của cột có kind `result`; đường bị loại khỏi hull có kind `muted`; `aux` là deque của hull.
- **Input:** `record { lines: grid(rows[1,5], cols[2,2], 'int', range[-10,10]), xs: int-array(len[1,5], range[-10,10], strictlyIncreasing) }`. **check:** `k` giảm ngặt theo hàng.
- **Preset:** `classic` (4 đường, 4 truy vấn); `useless-line` (một đường không bao giờ nhỏ nhất); `single-line`; `parallel-like`.
- **Beat:**
  - `start`*;
  - `add-line`, dự đoán: "đường cuối deque có bị loại không?", chọn có / không;
  - `pop-back`; `query`; `pop-front`; `done`*.
- **Oracle:** duyệt mọi đường cho mỗi `x`.
- **Bẫy:** so giao điểm bằng nhân chéo số nguyên (không chia số thực); `cpp`: tràn khi nhân.
- **Ngưỡng:** 50.

**Xong khi:** như card mẫu §2, với `<id>` = `convex-hull-trick`.

## 7. Đợt 2E (sau `I-06`)

### 2E-01 · `kmp` (Knuth–Morris–Pratt)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-06 |
| Sở hữu | `lib/subjects/cp/catalog/kmp.ts`, `tests/subjects/cp/kmp.test.ts`, `tests/subjects/cp/impl/kmp.ts` |
| Đọc | card mẫu §2; topic `t4-string-advanced` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `array` `cells` (văn bản); `rows`: mẫu (dời theo vị trí so khớp, dùng `offset`) và `fail`; `pointers` `i`, `j`.
- **Input:** `record { text: string(len[1,12], 'ab'), pattern: string(len[1,5], 'ab') }`. **check:** `len(pattern) ≤ len(text)`.
- **Preset:** `twice` (`abababab`, `abab`); `none` (`aaaa`, `b`); `whole` (`abba`, `abba`); `periodic` (`aaaaa`, `aa`).
- **Beat:**
  - `start`*;
  - `build-fail`, dự đoán: "fail[i] bằng bao nhiêu?";
  - `match`;
  - `jump`, dự đoán: "lùi j về đâu?";
  - `found`; `done`*.
- **Oracle:** tìm ngây thơ mọi vị trí khớp.
- **Bẫy:** `fail[i]` là độ dài tiền tố-hậu tố thực sự dài nhất; dùng `while` (không `if`) khi lùi; sau khi khớp thì `j = fail[j−1]`.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `kmp`.

### 2E-02 · `tarjan` (thành phần liên thông mạnh)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-06 |
| Sở hữu | `lib/subjects/cp/catalog/tarjan.ts`, `tests/subjects/cp/tarjan.test.ts`, `tests/subjects/cp/impl/tarjan.ts` |
| Đọc | card mẫu §2; topic `t3-scc-bridges` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `graph` **có hướng**; `label` `A (3/1)` = `disc/low`; `aux` là stack; mỗi thành phần một kind `group-k`.
- **Input:** `edge-list(nodes[1,8], edges[0,14])`, hiểu là cạnh có hướng `from → to`. **check:** không khuyên.
- **Preset:** `two-scc`; `dag` (mọi đỉnh là một thành phần); `one-cycle`; `single`.
- **Beat:**
  - `start`*; `visit`;
  - `back-edge`, dự đoán: "low[u] cập nhật thành bao nhiêu?";
  - `tree-return`; `pop-scc`; `done`*.
- **Oracle:** Kosaraju trong test.
- **Bẫy:** chỉ cập nhật `low` qua cạnh tới đỉnh **đang trên stack**; cạnh ngược dùng `disc[v]`, cạnh cây dùng `low[v]`.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `tarjan`.

### 2E-03 · `digit-dp` (đếm số có tổng chữ số bằng S)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-06 |
| Sở hữu | `lib/subjects/cp/catalog/digit-dp.ts`, `tests/subjects/cp/digit-dp.test.ts`, `tests/subjects/cp/impl/digit-dp.ts` |
| Đọc | card mẫu §2; topic `t4-dp-digit` |

**Làm** theo card mẫu §2, với:
- **Bài:** đếm số trong `[0, N]` có tổng chữ số bằng `S`.
- **Visualizer:** `grid`, hàng = (vị trí, `tight`) tối đa 6 hàng, cột = tổng 0…S tối đa 13 cột; ô là số cách.
- **Input:** `record { n: int[0,999], s: int[0,12] }`.
- **Preset:** `n999-s5`; `n0-s0` (biên); `n100-s1`; `n345-s12`.
- **Beat:**
  - `start`*;
  - `digit`, dự đoán: "chữ số ở vị trí này được chọn tối đa bằng bao nhiêu?";
  - `tight-break`; `accumulate`; `done`*.
- **Oracle:** duyệt 0…N, tính tổng chữ số.
- **Bẫy:** cờ `tight`; chỉ nhớ trạng thái **không** `tight`; có hay không đếm số 0.
- **Ngưỡng:** 60.

**Xong khi:** như card mẫu §2, với `<id>` = `digit-dp`.

### 2E-04 · `nim-grundy` (Sprague–Grundy, lấy 1–3 viên)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-06 |
| Sở hữu | `lib/subjects/cp/catalog/nim-grundy.ts`, `tests/subjects/cp/nim-grundy.test.ts`, `tests/subjects/cp/impl/nim-grundy.ts` |
| Đọc | card mẫu §2; topic `t4-game-theory` |

**Làm** theo card mẫu §2, với:
- **Bài:** ≤ 3 đống; mỗi lượt lấy 1, 2 hoặc 3 viên từ **một** đống; ai không đi được thì thua.
- **Visualizer:** `grid` 1 × 8 cho `g(0..7)` + một hàng `piles`; `vars` `xor`.
- **Input:** `record { piles: int-array(len[1,3], range[0,7]) }`.
- **Preset:** `win` (`[3,4,5]`); `lose` (`[1,2,3]`, xor bằng 0); `single` (`[6]`); `empty` (`[0,0]`, biên).
- **Beat:**
  - `start`*;
  - `mex`, dự đoán: "g(x) bằng bao nhiêu?";
  - `xor`;
  - `verdict`, dự đoán: "người đi trước thắng hay thua?", chọn thắng / thua;
  - `winning-move`; `done`*.
- **Oracle:** minimax vét cạn trạng thái (≤ 8³).
- **Bẫy:** mex là số tự nhiên nhỏ nhất **không** có trong tập; cộng thay vì xor.
- **Ngưỡng:** 40.

**Xong khi:** như card mẫu §2, với `<id>` = `nim-grundy`.

### 2E-05 · `graham-scan` (bao lồi điểm; cần visualizer `geometry`)

| Trường | Giá trị |
| --- | --- |
| Cấp | W |
| Cỡ | M |
| Phụ thuộc | I-06, 3B-V1 |
| Sở hữu | `lib/subjects/cp/catalog/graham-scan.ts`, `tests/subjects/cp/graham-scan.test.ts`, `tests/subjects/cp/impl/graham-scan.ts` |
| Đọc | card mẫu §2; topic `t4-geometry`; hợp đồng state ở card `3B-V1` |

**Làm** theo card mẫu §2, với:
- **Visualizer:** `geometry`; điểm `P0`…; cạnh hull là `segments` có kind `result`; điểm đang xét kind `active`; `aux` là stack.
- **Input:** `record { pts: grid(rows[3,8], cols[2,2], 'int', range[-9,9]) }`. **check:** không điểm trùng.
- **Preset:** `classic` (8 điểm); `collinear` (có 3 điểm thẳng hàng trên biên); `triangle` (3 điểm); `square-inside` (4 góc + 1 điểm trong).
- **Beat:**
  - `start`*; `pivot`; `sort-angle`;
  - `turn`, dự đoán: "rẽ trái hay rẽ phải?", chọn trái / phải;
  - `pop`; `done`*.
- **Oracle:** với mỗi cặp điểm, kiểm mọi điểm khác cùng một phía; tập cạnh hull bằng nhau.
- **Bẫy:** tích có hướng bằng số nguyên; điểm thẳng hàng; sắp theo góc dùng tích có hướng, không dùng `atan2` (lint cấm hàm siêu việt).
- **Ngưỡng:** 50.

**Xong khi:** như card mẫu §2, với `<id>` = `graham-scan`.

## 8. Tích hợp và cổng (leader/user)

### I-03 · Đăng ký visualizer mới

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | S |
| Phụ thuộc | 2-V1, 2-V2, 2-V3, 2-V4 |
| Sở hữu | `lib/tutor/build/runtimes.ts`, `.github/workflows/ci.yml` |
| Đọc | [README](README.md) §6 |

**Làm:** thêm `tree`, `graph`, `grid` vào `runtimes.ts`; thêm step CI cho 4 browser test mới; chép hợp đồng state của `2-V*` vào ARCHITECTURE §8.

**Xong khi:** `pnpm vitest run tests/tutor tests/ci` xanh.

### I-04 · Tích hợp đợt 2A

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | I-03, 2-00, 2-S1, 2-I1, 2-E1, 2A-01, 2A-02, 2A-03, 2A-04, 2A-05, 2A-06, 2A-07, 2A-08, 2A-09 |
| Sở hữu | `lib/subjects/cp/pack.ts`, `tests/subjects/catalog-lock.json`, `skills/agent-runtime/competitive-programming/SKILL.md`, `package.json`, `.github/workflows/ci.yml` |
| Đọc | [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §8 |

**Làm**
1. Đăng ký entry 2A vào `pack.ts`, cập nhật khoá catalog (`UPDATE_CATALOG_LOCK=1`), sinh lại khối id.
2. Thêm job CI `tutor-impl` (`TUTOR_IMPL_CHECK=1`) và script `eval:tutor-lesson`.
3. Xem từng entry trong trình duyệt.
4. Chạy hội đồng LLM Tin cho từng entry và commit review.
5. Đếm độ phủ `ts10` bằng script.

**Xong khi:** mục 2A ở Phase 2 §8 đạt, trừ G2.

### 2-G2 · Cổng G2 trên `bs-answer`

| Trường | Giá trị |
| --- | --- |
| Cấp | U |
| Cỡ | — |
| Phụ thuộc | I-04 |
| Sở hữu | — |
| Đọc | ADR 0012 quyết định 6; ADR 0014 quyết định 5 |

**Làm:** hội đồng LLM + học sinh mô phỏng trên `bs-answer`, như G1.

**Xong khi:** đạt ngưỡng; số đo ghi vào REVIEW.

### I-05 · Tích hợp đợt 2B

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 2B-01, 2B-02, 2B-03, 2B-04, 2B-05, 2B-06, 2B-07, 2B-08, 2B-09, 2B-10, 2B-11, 2B-12 |
| Sở hữu | `lib/subjects/cp/pack.ts`, `tests/subjects/catalog-lock.json`, `skills/agent-runtime/competitive-programming/SKILL.md` |
| Đọc | [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §8 |

**Làm:** như `I-04` cho 2B. Hội đồng duyệt đề P2 (`2B-12`); trượt thì thay đề và giao lại card.

**Xong khi:** `ts10` = 13/14, `hsg` ≥ 10/26; review đạt.

### I-06 · Tích hợp đợt 2C và 2D

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | M |
| Phụ thuộc | 2C-01, 2C-02, 2C-03, 2C-04, 2C-05, 2C-06, 2C-07, 2C-08, 2D-01, 2D-02, 2D-03, 2D-04 |
| Sở hữu | `lib/subjects/cp/pack.ts`, `tests/subjects/catalog-lock.json`, `skills/agent-runtime/competitive-programming/SKILL.md` |
| Đọc | [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §8 |

**Làm:** như `I-04`. Hội đồng duyệt đề P3 (`2C-08`) và 4 mô-đun 2D.

**Xong khi:** `hsg` ≥ 17/26 sau 2C, và theo bảng Phase 2 §2.2 sau 2D; review đạt.

### I-07 · Tích hợp đợt 2E

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | S |
| Phụ thuộc | 2E-01, 2E-02, 2E-03, 2E-04 |
| Sở hữu | `lib/subjects/cp/pack.ts`, `tests/subjects/catalog-lock.json`, `skills/agent-runtime/competitive-programming/SKILL.md` |
| Đọc | [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §8 |

**Làm:** như `I-04`.

**Xong khi:** độ phủ theo Phase 2 §2.2 (`hsg` 24/26); mọi mục Phase 2 §8 đạt.

### I-12 · Đăng ký `graham-scan`

| Trường | Giá trị |
| --- | --- |
| Cấp | L |
| Cỡ | S |
| Phụ thuộc | 2E-05 |
| Sở hữu | `lib/subjects/cp/pack.ts`, `tests/subjects/catalog-lock.json`, `skills/agent-runtime/competitive-programming/SKILL.md` |
| Đọc | [../phase-2-competitive-programming/SCHEMA](../phase-2-competitive-programming/SCHEMA.md) §2 (mục 2.4) |

**Làm:** như `I-04` cho một entry.

**Xong khi:** `hsg` 25/26; tổng 30/32.
