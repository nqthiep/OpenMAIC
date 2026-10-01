# ADR 0001: Step engine dùng `Frame<S>[]` tính sẵn, bất biến, serialize được

- **Status**: Accepted (sửa 2026-09-29; sửa 2026-09-30: thêm `tick`/`maxSteps`)
- **Date**: 2026-09-28; sửa 2026-09-29, 2026-09-30
- **Deciders**: User + Architect panel
- **Liên quan**: [0005](0005-widget-hosting-model.md), [0006](0006-deterministic-trace-catalog.md), [0008](0008-lesson-blueprint-hard-problems.md), [../INTERFACES](../INTERFACES.md), [../DATA-MODEL](../DATA-MODEL.md)

> **Tóm tắt:** biểu diễn từng bước bằng `Frame{state, meta}[]` **tính sẵn, bất biến, serialize được** để nhúng vào HTML và export; `emit(state, meta)`, thêm `vars`/`aux`/`render(frame, prev)` cho bài khó; trần 500 frame và 10 000 vòng `tick()` (`RangeError`).

## Context

Walkthrough cần: (1) chuyển một thuật toán/chứng minh thành danh sách trạng thái trực quan; (2) player play/pause/step/jump; (3) AI giáo viên nhảy tới frame bất kỳ qua `SET_WIDGET_STATE` (ADR 0005); (4) thầy Q&A biết frame hiện tại (ADR 0009). Frame được nhúng thành JSON vào HTML của widget và chạy trong iframe sandbox (ADR 0005) → phải **serialize được** và không phụ thuộc React.

Yêu cầu "trực quan, sinh động" cho bài khó cần nhiều hơn mảng + con trỏ: **bảng biến** (i, j, lo, hi…) và **cấu trúc phụ** (heap của Dijkstra, stack của Tarjan, queue của BFS, mảng failure của KMP). Chuyên gia thiết kế bài giảng đếm 9/32 topic cần panel phụ.

## Decision

```ts
export type HighlightKind = 'active' | 'compare' | 'result' | 'visited' | 'muted' | (string & {})

export interface FrameMeta {
  readonly index: number
  readonly explanation: string
  readonly codeLine?: number                                     // 1-indexed, dòng PSEUDOCODE (C++/Python suy ra qua code.map.cpp / code.map.py — ADR 0008)
  readonly highlights?: Readonly<Record<string, HighlightKind>>  // key = id phần tử do visualizer định nghĩa
  readonly pointers?: Readonly<Record<string, number | string>>  // 'lo' -> 0, 'mid' -> 3, …
  readonly vars?: Readonly<Record<string, number | string>>      // bảng biến hiển thị bên cạnh
  readonly aux?: readonly { readonly id: string; readonly label: string; readonly items: readonly (number | string)[] }[]  // heap/stack/queue/… (panel phụ dùng chung)
  readonly tags?: readonly string[]                              // 'beat:<id>' đánh dấu frame mốc (ADR 0006)
}

export interface Frame<S> { readonly state: S; readonly meta: FrameMeta }   // state CHỈ là dữ liệu

export const DEFAULT_MAX_FRAMES = 500

export const DEFAULT_MAX_STEPS = 10_000

export type Emit<S> = (state: S, meta: Omit<FrameMeta, 'index'>) => void

export function generateSteps<S, I>(
  input: I,
  run: (input: Readonly<I>, emit: Emit<S>, tick: () => void) => void,
  options?: { readonly maxFrames?: number; readonly maxSteps?: number },
): readonly Frame<S>[]
```

Ngữ nghĩa bắt buộc:

- `emit` nhận **snapshot đầy đủ** của `state` cùng `meta`; `index` do engine gán.
- Engine `structuredClone` + deep-freeze cả `input` lẫn mỗi `state` → không mutate được input/frame cũ, và mọi frame JSON-safe. Hàm/`Map`/`undefined` trong `state` là lỗi.
- Vượt `maxFrames` (mặc định 500; entry có thể đặt thấp hơn) → `throw new RangeError`.
- **Đếm bước độc lập với `emit`** (sửa 2026-09-30, review M5): `run` gọi `tick()` ở đầu mỗi vòng lặp. Engine đếm và ném `RangeError` khi vượt `maxSteps` (mặc định 10 000). Nhờ đó vòng lặp không emit (ví dụ lỗi logic trong iframe ở lát 1d) cũng không treo. Test: một `run` lặp vô hạn không emit phải kết thúc bằng `RangeError`.
- **Một cách đánh dấu duy nhất**: `meta.highlights`/`meta.pointers`; `state` không chứa `comparing/sorted/pivot`. Từ vựng `HighlightKind` ở base chỉ là giá trị chung; giá trị riêng truyền dạng chuỗi, visualizer không biết thì vẽ kiểu mặc định.
- **Visualizer nhận frame trước** để tạo chuyển động (hoán đổi, di chuyển con trỏ): `render(frame, prev?)` (ARCHITECTURE §8). Chuyển động chỉ ở mức CSS transition (ADR 0002).

## SWOT

| Phương án | Strengths | Weaknesses | Opportunities | Threats |
| --- | --- | --- | --- | --- |
| **`Frame[]` tính sẵn, bất biến (chọn)** | Serialize/nhúng vào HTML → export/import như widget khác; nhảy/tua tức thì; test tất định; cache theo `(id, input)`; thầy và Q&A trỏ được frame. | Snapshot đầy đủ mỗi frame (kích thước). | `vars/aux` cho bài khó; `render(frame, prev)` cho chuyển động. | Input lớn → payload lớn (chặn bằng `maxFrames`, `maxBytes`, giới hạn input — ADR 0006). |
| Reducer thuần + tính frame theo yêu cầu | Ít RAM. | Phải chạy thuật toán trong iframe → runtime nặng, khó nhúng dữ liệu cho export/offline. | — | Nhân đôi thuật toán vào mỗi widget. |
| Generator (`function*`) | Tiết kiệm RAM. | Không serialize được. | — | Không nhúng/export được. |
| Stream frame qua channel | Real-time. | Khó replay/test; không hợp playback theo kịch bản. | — | Phức tạp không cần thiết. |

## Alternatives considered

| Phương án | Kết luận |
| --- | --- |
| Reducer thuần + tính frame theo yêu cầu | Reducer cũng là hàm thuần (bản đầu ghi "chỉ dùng được trong React" là sai). Loại vì phải chạy thuật toán trong iframe → runtime nặng, khó nhúng dữ liệu để export/offline. |
| Generator (`function*`) | Không serialize được. |
| Stream frame qua channel | Khó replay/test, không hợp playback theo kịch bản. |

## Consequences

**Positive:** frame nhúng thẳng vào HTML → export/import như widget khác; test đơn giản (frame cuối, số frame, determinism, input không bị đổi, JSON round-trip); có bảng biến + panel phụ đáp ứng "trực quan".

**Negative:** mỗi frame mang snapshot đầy đủ; bị chặn bởi `maxFrames`, giới hạn input và `maxBytes` theo entry (ADR 0006). Kích thước (đo trên frame tổng hợp [Inference]): `array` ~273 ký tự/frame, `grid` 6×13 ~608, đồ thị 8 node ~1156.

## Thay đổi so với bản đầu

| Bản đầu | Bây giờ | Lý do |
| --- | --- | --- |
| `Frame<S> = S & { __frame }`, `emit(Partial<S>)` | `Frame = {state, meta}`, `emit(state, meta)` | `emit` cũ không mang được meta; merge/replace không rõ; intersection làm bẩn `state`. |
| `highlights`/`pointers` trùng với `comparing`/`sorted`/`pivot` trong state | Chỉ `meta` | Hai cách biểu diễn cùng một thứ. |
| `HighlightKind` gắn `swapping`, `merged` | Từ vựng chung + `string` | Base không được gắn cứng từ vựng của sorting. |
| Ba ngưỡng 1000 / ≤500 / 30–80 | `DEFAULT_MAX_FRAMES=500` (throw) + trần theo entry | Thống nhất. |
| "Window N frames" | Bỏ | Mâu thuẫn với mảng tính sẵn. |
| "Share URL `?frame=5`" | Bỏ | iframe null-origin không có URL/`localStorage`; nhảy frame qua `SET_WIDGET_STATE`. |
| `usePlayer` React hook | `createPlayer` (`subscribe/getState`) | Không có React trong iframe; nếu host cần, bọc `useSyncExternalStore`. |
| — | `vars`, `aux`, `render(frame, prev)` | Yêu cầu "trực quan, sinh động" cho bài khó. |
