# Review-panel run, 2026-10-09 (deepseek-v4-pro + kimi-k3 via OpenCode Go)

- **Ngày**: 2026-10-09
- **Trạng thái**: Tham khảo, KHÔNG phải file cổng. Chạy dừng giữa chừng vì hạn mức OpenCode Go hết ("Go usage limit exceeded").

> **Tóm tắt:** 8 entry được review đủ hai model (DeepSeek v4-pro thinking tắt + Kimi K3, cấu hình `MODEL_ROUTES` thay cho GPT-6-luna vì cổng báo "Model does not support this protocol"). 3 đạt và nằm ở `lib/subjects/cp/reviews/` (`binary-search@3`, `bs-answer-mini@4`, `stack-queue@3`: đừng sửa nội dung ba entry này, file mất hiệu lực); 5 chưa đạt và nằm ở đây.

Việc đã rút ra từ các file này: số nhiều tiếng Anh có tính từ ("1 remaining numbers") đã sửa; reviewer DeepSeek hay ghi mục "đúng" vào `factErrors` làm trượt oan (`fib-recursion-tree`, `merge-sort`). Chưa sửa: `two-pointers` frame 11 thiếu tag và lời kết preset `absent`; `prefix-sum` code `range_sum` dựng lại mảng P mỗi lần gọi và lời hiểu lầm mơ hồ; `merge-sort` frame `done` map vào dòng 2; `fib-recursion-tree` "khoảng 2n" nên là 2n − 1 và câu "chạy từ trái sang phải" chỉ đúng với Python; `cauchy-schwarz` hai preset có đáp án nhiễu trùng giá trị với đáp án đúng, lời hiểu lầm tiếng Việt viết "điều kiện đủ" (phải là cần và đủ), gợi ý AM-GM thiếu điều kiện a, b ≥ 0. Reviewer hiểu nhầm cú pháp `{n|one|other}` là mẫu chưa điền: cần ghi chú trong prompt reviewer (`lib/tutor/review-schema.ts`, quanh dòng 521).
