# Dữ liệu trên trình duyệt khi bật tài khoản

Áp dụng khi `OPENMAIC_ACCOUNTS=true`. Khoá học, hội thoại, tiến độ và tài nguyên nằm trên máy chủ, theo chủ sở hữu. Tài liệu này kiểm kê những gì trình duyệt vẫn giữ và cách xử lý khi tài khoản đổi hoặc kết thúc. Kiểm kê theo mã trong nhánh `it-math`, ngày 2026-10-11.

## Quy tắc

- Khoá không có trong bảng dưới đây bị xoá khi đổi hoặc kết thúc tài khoản.
- Tuỳ chọn giao diện được giữ. Sổ và dữ liệu của công cụ nhập dữ liệu cũ được giữ như quy tắc của "Xoá bộ nhớ đệm" (`lib/device-storage/clear-local-cache.ts`).
- Hàm xử lý: `lib/accounts/client-state.ts`.

## localStorage

Giữ lại:

| Khoá | Nội dung | Dữ liệu người dùng | Khi đổi tài khoản / đăng xuất |
| --- | --- | --- | --- |
| `theme` | Chế độ sáng hoặc tối | Không | Giữ |
| `locale` | Ngôn ngữ giao diện | Không | Giữ |
| `recentClassroomsOpen`, `interactiveModeEnabled` | Tuỳ chọn trang chủ | Không | Giữ |
| `openmaic:workspace:rail-width`, `rail-tab`, `nav-collapsed`, `chat-collapsed`, `classroom-collapsed`, `chat-width` | Bố cục workbench | Không | Giữ |
| `workbench.panel.<sessionId>` | Mở hoặc đóng bảng của từng phiên | Không | Giữ |
| `openmaic:account:last-user` | Id tài khoản dùng trình duyệt này gần nhất | Chỉ id | Giữ khi đổi; xoá khi đăng xuất |
| `maic:legacy-import:v3` | Sổ của công cụ nhập dữ liệu cũ | Không (không có chủ sở hữu) | Giữ |
| `maic:device:runtime.learnerKey` | Khoá ẩn danh cũ, để công cụ nhập tìm dữ liệu trước máy chủ | Không | Giữ |
| `maic:legacy-import:model-settings`, `maic:legacy-import:model-settings-unimported` | Cài đặt model chờ nhập hoặc không nhập được; có thể chứa khoá API bản cũ | Có | Giữ cho tới khi nhập xong (xem Rủi ro) |
| `agent-registry-storage` | Danh sách tác nhân bản cũ | Có | Giữ tới khi nhập xong tác nhân |
| `quizDraft:`, `quizAnswers:`, `quizResults:`, `quizAttemptId:` (theo `sceneId`) | Bản nháp, đáp án và kết quả quiz | Có | Giữ tới khi nhập xong |

Xoá:

| Khoá | Nội dung | Dữ liệu người dùng | Khi đổi tài khoản / đăng xuất |
| --- | --- | --- | --- |
| `maic:account:settings-storage` | Cài đặt: giọng đọc, tác nhân đã chọn, bố cục | Có | Xoá |
| `maic:account:user-profile-storage` | Tên hiển thị, tiểu sử, ảnh đại diện trên máy này | Có | Xoá |
| `maic:device:editor-current-scene:<stageId>` | Slide đang sửa | Có | Xoá |
| `maic:device:playback-cursor:<stageId>` | Vị trí đang xem | Có | Xoá |
| `maic:device:runtime.pblDrain.<stageId>.<sceneId>.<learnerKey>` | Mốc đồng bộ bài PBL của người học | Có | Xoá |
| `maic:device:document-migration:<stageId>` | Dấu chuyển đổi tài liệu cũ | Không | Xoá (như "Xoá bộ nhớ đệm") |
| `maic:device:document-storage-generation` | Bộ đếm thế hệ lưu trữ cục bộ | Không | Xoá |
| `openmaic:workspace:course-order`, `openmaic:workspace:session-order` | Thứ tự thư viện | Có | Xoá |
| `openmaic:workspace:course-tabs:v2` | Khoá học đang mở trong workbench | Có | Xoá |
| `openmaic:workspace:last-session` | Phiên làm việc gần nhất | Có | Xoá |
| `learnDoor.nickname` | Biệt danh học sinh ở `/learn` | Có | Xoá |
| `learnDoor.opened` | Bài đã mở ở `/learn` | Có | Xoá |
| `providersConfig` | Cấu hình nhà cung cấp bản cũ; chỉ đọc, có thể chứa khoá API | Có | Xoá |
| Mọi khoá khác | Không có trong kiểm kê | — | Xoá |

## sessionStorage

Xoá toàn bộ khi đổi hoặc đăng xuất:

| Khoá | Nội dung | Dữ liệu người dùng |
| --- | --- | --- |
| `openmaic:playback-action-resume:<stageId>` | Vị trí hành động đang phát | Có |
| `generationRunReviewIntent:<runId>` | Đã mở duyệt đề cương của một lượt sinh | Có |
| `workbench.launchPrompt` | Lời nhắc khởi tạo chưa dùng | Có |

## IndexedDB

| Cơ sở dữ liệu | Nội dung | Khi đổi tài khoản / đăng xuất |
| --- | --- | --- |
| `maic-device-cache` | Âm thanh và media đã lưu, lịch sử hoàn tác, giọng đọc (kể cả giọng sao chép), ảnh bìa khoá học | Xoá (`clearLocalCache`) |
| `MAIC-Database`, `maic-documents`, `maic-runtime`, `maic-asset-pool` | Kho trước khi có máy chủ; chỉ công cụ nhập đọc | Không đụng tới |

Cookie `openmaic_session` không thuộc danh sách này: máy chủ thu hồi phiên và xoá cookie khi đăng xuất.

## Cách hoạt động

1. Khi trang có phiên, menu tài khoản hỏi `/api/auth/me`. Nếu tài khoản khác với `openmaic:account:last-user` (hoặc chưa có), trình duyệt xoá trạng thái của tài khoản trước, ghi id mới và tải lại trang.
2. Đăng xuất: thu hồi phiên, xoá trạng thái, xoá `openmaic:account:last-user`, rồi chuyển tới `/login`.
3. Tab khác đổi hoặc kết thúc tài khoản: tab này tải lại (sự kiện `storage`).
4. learnerKey của tutor là owner của tài khoản do máy chủ trả về. Khoá đã cache trong trang bị bỏ khi tải lại.
5. Nếu không xoá hết được (IndexedDB bị tab khác giữ, lỗi bộ nhớ): id mới không được ghi, nên lần sau trình duyệt xoá lại.

## Rủi ro còn lại

- Công cụ nhập dữ liệu cũ (`lib/legacy-browser-import`) chưa bị chặn khi bật tài khoản. Tài khoản đăng nhập đầu tiên trên trình duyệt có dữ liệu cũ có thể nhận dữ liệu đó. Cần quyết định của chủ dự án.
- Trang đăng nhập chưa xoá trạng thái trước khi chuyển trang. Trang đầu tiên của tài khoản mới có thể thoáng hiện trạng thái cũ trước khi tải lại.
- Nút đăng xuất ở `/account` và "đăng xuất khỏi mọi thiết bị" chưa gọi `endAccountSession`.
- Các khoá "giữ tới khi nhập xong" nghĩa là dữ liệu cũ, kể cả khoá API bản cũ, còn trên máy cho tới khi công cụ nhập chạy xong.
