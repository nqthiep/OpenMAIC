# Tính giá gói thành viên KHAITAM

Ngày lập: 2026-10-23. Số liệu thị trường xem ngày 2026-10-23. Nhãn: `[Inference]` là suy luận, `[Unverified]` là chưa kiểm chứng. Nguồn chi tiết: báo cáo nghiên cứu giá (giữ trong thư mục tạm của phiên, không nằm trong repo) và nhật ký sử dụng `data/usage/2026-10.jsonl`.

## 1. Đề xuất

| Gói | Giá (đã gồm thuế nếu có) | Quy đổi mỗi tháng | Tiết kiệm |
|---|---|---|---|
| Dùng thử | miễn phí 30 ngày đầu sau khi đăng ký, hạn mức 500.000 token | | |
| 1 tháng | 99.000 ₫ | 99.000 ₫ | |
| 6 tháng | 499.000 ₫ | 83.167 ₫ | 16% |
| 12 tháng | 899.000 ₫ | 74.917 ₫ | 24% |

Hạn mức gói trả phí: 1.000.000 token mỗi tháng (mặc định của hệ thống). Đó là khoảng 5 khoá học 6 bài mỗi tháng, cộng trò chuyện với thầy giảng ảo.

Giá nằm ở `lib/brand/pricing.ts`; số ngày dùng thử và hạn mức dùng thử đặt bằng biến môi trường `MEMBERSHIP_TRIAL_DAYS` (30) và `MEMBERSHIP_TRIAL_QUOTA_TOKENS` (500.000).

## 2. Chi phí AI thật của một thành viên

Căn cứ: 5 khoá học có từ 3 cảnh trở lên trong nhật ký sử dụng của chủ dự án (mô hình `deepseek-flash`), trung bình 6,2 cảnh mỗi khoá.

- Một khoá học: 57.702 token đầu vào (62% trúng bộ nhớ đệm) và 133.458 token đầu ra (đã gồm token suy luận). Tổng 191.160 token tính vào hạn mức.
- Đơn giá DeepSeek (trang giá chính thức, kiểm lại 2026-10-23): `deepseek-flash` đầu vào trúng đệm 0,003 USD, trượt đệm 0,15 USD, đầu ra 0,60 USD mỗi triệu token; giờ cao điểm gấp đôi (thứ Hai đến thứ Sáu, 08:00 đến 11:00 và 13:00 đến 17:00 giờ Việt Nam). Trang chỉ ghi ký hiệu "$"; coi là USD `[Inference]`.
- Tỷ giá giả định 26.000 ₫ mỗi USD `[Unverified]`.

| Việc | Ngoài giờ cao điểm | Giờ cao điểm |
|---|---|---|
| Tạo một khoá học 6 bài | khoảng 2.200 ₫ | khoảng 4.300 ₫ |
| Dùng hết 1.000.000 token (tỉ lệ như khi tạo khoá học) | khoảng 11.400 ₫ | khoảng 22.700 ₫ |
| Dùng hết 1.000.000 token, trường hợp xấu nhất (toàn bộ là đầu ra) | 15.600 ₫ | 31.200 ₫ |
| Một lượt trò chuyện với thầy giảng ảo (khoảng 4.400 token) | khoảng 45 ₫ | khoảng 90 ₫ |

Chi phí AI tối đa của một thành viên là khoảng 31.000 ₫ mỗi tháng; người dùng bình thường (tạo 1 đến 2 khoá, vài trăm lượt trò chuyện) khoảng 5.000 đến 14.000 ₫ `[Inference]`.

Chưa tính: giọng đọc, nhận dạng giọng nói, tạo ảnh và video (nhà cung cấp chưa được cấu hình, chi phí chưa biết), và máy chủ (VPS cố định, chưa có số liệu).

## 3. Giá thị trường

Giá mỗi tháng quy đổi từ giá niêm yết (nguồn trong báo cáo nghiên cứu):

| Dịch vụ | Gói | Mỗi tháng |
|---|---|---|
| OLM (olm.vn) VIP | 1 tháng 199.000; 6 tháng 800.000; 12 tháng 1.400.000 | 199.000; 133.333; 116.667 |
| VietJack VIP | 1 tháng 250.000; 6 tháng 599.000; 12 tháng 799.000 | 250.000; 99.833; 66.583 |
| VioEdu (ứng dụng iOS) | 6 tháng 799.000; 12 tháng 999.000 | 133.167; 83.250 |
| Hocmai | khoá Toán 12 "Học chủ động" 1.200.000 cho khoảng 9 tháng | khoảng 130.000 |
| Gauth (ứng dụng giải bài bằng AI) | 49.000 mỗi tháng; 299.000 mỗi năm | 49.000; 24.917 |
| QANDA | 42.000 mỗi tháng | 42.000 |

Một số nguồn mâu thuẫn nhau (OLM, VietJack) và giá VioEdu trên web không tìm thấy; xem danh sách "chưa kiểm chứng" trong báo cáo nghiên cứu.

## 4. Vì sao chọn mức này `[Inference]`

- Thấp hơn OLM gói tháng (199.000) và ngang các gói nhiều tháng của VioEdu và VietJack, vì nội dung của KHAITAM còn ít (danh mục công khai mới có một bài thử) và chưa có lớp học với giáo viên thật.
- Cao hơn các ứng dụng giải bài bằng AI (42.000 đến 49.000), vì KHAITAM tạo cả khoá học tương tác và có hạn mức dùng nhiều hơn.
- Biên lợi nhuận: gói tháng 99.000 ₫, chi phí AI tối đa 31.200 ₫, phí thanh toán khoảng 1%, và nếu chịu 5% thuế giá trị gia tăng cộng 2% thuế thu nhập cá nhân thì còn lại khoảng 59.900 ₫ (60%) trong trường hợp xấu nhất, 81.100 ₫ (82%) với người dùng bình thường.
- Gói 6 và 12 tháng giữ chân người học qua một năm học và đưa tiền về sớm.

## 5. Tháng miễn phí tốn bao nhiêu

- Hạn mức dùng thử 500.000 token: tối đa khoảng 7.800 ₫ (ngoài cao điểm) đến 15.600 ₫ (cao điểm) cho mỗi tài khoản, khoảng 2,6 khoá học. Để 1.000.000 token thì gấp đôi.
- Nếu một tháng trả phí thu về ròng khoảng 60.000 ₫, tháng dùng thử hoà vốn khi tỉ lệ chuyển sang trả phí đạt khoảng 26% trong trường hợp xấu nhất, khoảng 10% với mức dùng bình thường (5.700 ₫) `[Inference]`.
- Hạn mức tính theo chu kỳ một tháng kể từ ngày giờ gói bắt đầu (mục 9), nên tháng dùng thử là đúng một chu kỳ: tối đa 500.000 token, các con số trên đúng. Gói N tháng có đúng N chu kỳ nên chi phí AI tối đa là N lần hạn mức. (Trước đây hạn mức đếm theo tháng dương lịch UTC: gói mua giữa tháng chạm N+1 tháng lịch, nên dùng thử có thể dùng gấp đôi.)
- Rủi ro lạm dụng: tạo nhiều tài khoản để lấy nhiều tháng miễn phí, vì đăng ký chỉ cần tên người dùng và mật khẩu, không email. Mỗi tài khoản tốn tối đa 15.600 ₫; 100 tài khoản giả là 1,56 triệu ₫. Chưa có biện pháp chặn ngoài giới hạn số lần thử theo địa chỉ IP.

## 6. Chi phí khác

- Thanh toán: hiện chưa có thanh toán trực tuyến; thành viên chuyển khoản và quản trị viên cấp gói. Nhà cung cấp mã QR ngân hàng: VNPay QR 0,88% (cần giấy chứng nhận hộ kinh doanh); SePay miễn phí đến 50 giao dịch mỗi tháng, trên đó 120.000 ₫ mỗi tháng, nhận tài khoản ngân hàng cá nhân; payOS đăng ký bằng căn cước công dân, chưa tìm thấy phí.
- Thuế `[Unverified]`: theo nguồn thứ cấp, hộ và cá nhân kinh doanh có doanh thu từ 500 triệu ₫ mỗi năm trở xuống không phải nộp thuế giá trị gia tăng (Luật 149/2025), trên mức đó là 5% cộng 2% thuế thu nhập cá nhân. Ở giá 99.000 ₫ mỗi tháng, ngưỡng 500 triệu tương ứng khoảng 420 thành viên trả phí. Dịch vụ giáo dục được miễn thuế giá trị gia tăng theo Luật 48/2024 Điều 5 khoản 13 nếu đúng "theo quy định của pháp luật về giáo dục"; một trang web bài giảng AI có thuộc diện đó hay không chưa có hướng dẫn nào tìm thấy. Cần hỏi cơ quan thuế hoặc kế toán.

## 7. Lỗi đã sửa liên quan đến giá

Hạn mức tháng trước đây cộng token suy luận hai lần (token suy luận đã nằm trong token đầu ra). Với mô hình suy luận, một khoá học bị tính khoảng 290.000 token thay vì 191.000, nên 1.000.000 token chỉ đủ khoảng 3,4 khoá thay vì 5,2 khoá. Đã sửa ở `lib/usage/normalize.ts` (`quotaTokens`), dùng cho hạn mức và bảng vận hành.

## 8. Việc nên làm tiếp

1. Sau một tháng chạy thật, đo lại chi phí AI trung bình mỗi thành viên (nhật ký sử dụng đã có mã tài khoản) và chỉnh giá hoặc hạn mức.
2. Tự động cấp gói sau khi nhận tiền (SePay hoặc payOS gửi thông báo khi có chuyển khoản), thay cho cấp tay.
3. Chặn tạo hàng loạt tài khoản dùng thử (email hoặc số điện thoại xác minh, hoặc captcha).
4. Hỏi kế toán về thuế trước khi vượt khoảng 420 thành viên trả phí.

## 9. Chu kỳ hạn mức (chủ dự án chốt 2026-10-23)

- Một gói chạy theo một hoặc nhiều **giai đoạn**, mỗi giai đoạn có hạn mức riêng: tháng dùng thử (500.000 token), mỗi gói trả phí (1.000.000 token mỗi chu kỳ, chỉ khác thời hạn và giá).
- Mỗi giai đoạn chia thành **chu kỳ một tháng** tính từ ngày giờ giai đoạn bắt đầu, theo lịch Việt Nam: bắt đầu 20/10 lúc 21:15 thì chu kỳ sau bắt đầu 20/11 lúc 21:15, rồi 20/12. Ngày không có trong tháng ngắn thì lùi về ngày cuối tháng (31/1 thành 28/2, rồi 31/3). Hạn mức tính lại đúng thời điểm đó, không phải nửa đêm và không phải ngày 1.
- Mua khi gói còn hạn: gói mới **nối sau** gói đang chạy (bắt đầu lúc gói cũ hết); hạn mức của chu kỳ đang chạy không đổi. Không mua thì hết giai đoạn là hết hạn mức: không còn tạo bài (khoá học cũ vẫn đọc được).
- Gói đã hết hạn rồi mua lại: giai đoạn mới bắt đầu ngay lúc mua.
- Phần thưởng token (đọc, trả lời hay nhất, thử thách) thuộc về chu kỳ đang chạy của người nhận, không cộng sang chu kỳ sau; người không có gói đang chạy thì không nhận được.
- Chuyển đổi: dòng thành viên cũ (không có giai đoạn) được đọc như một giai đoạn từ lúc cấp đến lúc hết hạn, nên chu kỳ của họ tính từ ngày cấp lần cuối; phần thưởng ghi theo tháng dương lịch trước đây không còn tính.
- Chưa làm: gói 6 tháng và 12 tháng được cấp theo số ngày (180 và 365), nên chu kỳ cuối ngắn hơn vài ngày so với "6 tháng", "12 tháng" tròn. Nếu muốn tròn tháng, cho phép cấp theo số tháng.
