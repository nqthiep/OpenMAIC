# Review-panel run, 2026-10-06 (DeepSeek only, same provider)

- **Trạng thái**: Tham khảo — kết quả thô của một lần chạy chưa đạt cổng review (không phải file gate)
- **Ngày**: 2026-10-06

> **Tóm tắt:** 19 trong 38 entry cp được review bằng một panel cùng provider DeepSeek, không độc lập theo ADR 0014; 3 pass, 16 fail; một lỗi thật (`two-pointers`) đã sửa.

Raw output of `eval/tutor-review/runner.ts <id> --allow-same-provider` for 19 of the 38 cp entries.
Stored here, not in `lib/subjects/cp/reviews/`, because it does NOT satisfy ADR 0014 decision 8:

- Both panel stages ran on the `deepseek` provider (v4-pro and v4-flash, thinking off), so the panel is not independent.
- The remaining 19 entries got no review: the API returned `Insufficient Balance` partway through (the "a review is missing" results were this, not truncated output).
- Reviews were taken before the `two-pointers` fix (entryRev 1 -> 2); `two-pointers@1` was removed as stale.

Verdicts: pass 3 (bs-answer-mini, prefix-sum, string-scan), fail 16.
Triage of 5 failing files by hand: the `two-pointers` finding was real (fixed, see git log); most others are
reviewer artefacts (the script narrates only some frames, so "jumps" are intentional; `vars.last` is the
value before the update on purpose). Not yet triaged: hash-count, segment-tree, lcs, bfs, dfs, fib-recursion-tree, nim-grundy, others.

Lesson eval (6 scenarios x 3 samples, generator deepseek-v4-flash, judge deepseek-v4-pro): FAIL,
1/6 scenarios >= 70% passing; Dung 3/3 on 4 scenarios, 2/3 on 2. Weakest: clarity (3.0-3.7) on knapsack, grid-components, LIS, binary-search.
Thresholds are [Inference]; this measures a raw LLM lesson generator, not the catalog.
