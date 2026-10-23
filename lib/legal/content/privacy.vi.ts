import type { LegalContext, LegalDocument } from '@/lib/legal/types';

/**
 * Chính sách quyền riêng tư, bản tiếng Việt (bản có giá trị áp dụng). Bản nháp, chưa có luật sư
 * rà soát: xem `LEGAL_TEXT_REVIEWED`. Bảng dữ liệu phải khớp với những gì mã nguồn thật sự lưu và
 * gửi đi; khi mã đổi thì sửa văn bản và đổi `TERMS_VERSION`.
 */
export function privacyVi({ product, domain, email, version }: LegalContext): LegalDocument {
  return {
    title: 'Chính sách quyền riêng tư',
    summary: `${product} thu thập những dữ liệu nào, dùng vào việc gì, chia sẻ với ai, giữ bao lâu và bạn làm chủ dữ liệu của mình thế nào.`,
    sections: [
      {
        id: 'ai-chiu-trach-nhiem',
        heading: 'Ai chịu trách nhiệm về dữ liệu của bạn',
        blocks: [
          {
            type: 'p',
            text: `Người vận hành ${product} (${domain}) quyết định dữ liệu nào được thu thập và dùng vào việc gì; trong chính sách này gọi là “chúng tôi”. Bạn liên hệ với chúng tôi qua ${email}. Tên người vận hành, địa chỉ và mã số thuế sẽ được ghi ở đây khi hoàn tất đăng ký kinh doanh.`,
          },
          {
            type: 'p',
            text: `Chính sách này (phiên bản ${version}) đi cùng Điều khoản sử dụng. Khi tạo tài khoản, bạn xác nhận đã đọc chính sách này.`,
          },
        ],
      },
      {
        id: 'tom-tat',
        heading: 'Tóm tắt trong một phút',
        blocks: [
          {
            type: 'ul',
            items: [
              'Chúng tôi chỉ cần tên đăng nhập và mật khẩu. Không hỏi họ tên thật, ngày sinh, số điện thoại, email, địa chỉ hay vị trí của học sinh.',
              'Không có quảng cáo, không bán dữ liệu, không có công cụ phân tích hay cookie theo dõi của bên thứ ba.',
              'Nội dung bạn nhập khi tạo bài học và khi trò chuyện với thầy giảng ảo được gửi cho nhà cung cấp mô hình AI ở nước ngoài để họ trả lời. Vì vậy đừng nhập thông tin cá nhân vào đó.',
              'Tên đăng nhập của bạn hiện cho thành viên khác thấy khi bạn hỏi đáp trong cộng đồng.',
              'Bạn hoặc cha mẹ, người giám hộ có thể xem, sửa, xoá dữ liệu và rút lại sự đồng ý bằng cách viết cho chúng tôi.',
            ],
          },
        ],
      },
      {
        id: 'du-lieu-thu-thap',
        heading: 'Dữ liệu chúng tôi thu thập',
        blocks: [
          {
            type: 'table',
            head: ['Dữ liệu', 'Từ đâu và để làm gì', 'Giữ bao lâu'],
            rows: [
              [
                'Tài khoản: tên đăng nhập, mật khẩu (chỉ lưu bản băm), vai trò, ngày tạo, phiên bản điều khoản đã đồng ý và thời điểm đồng ý',
                'Bạn nhập khi tạo tài khoản. Dùng để đăng nhập, phân quyền và chứng minh bạn đã đồng ý điều khoản.',
                'Đến khi tài khoản bị xoá.',
              ],
              [
                'Phiên đăng nhập: mã phiên (chỉ lưu bản băm) và thời điểm hết hạn',
                'Tạo khi đăng nhập. Dùng để giữ bạn đăng nhập trên thiết bị.',
                '30 ngày kể từ lúc đăng nhập, hoặc đến khi bạn đăng xuất.',
              ],
              [
                'Học tập: bài học bạn tạo hoặc tham gia, tiến độ, kết quả bài tập và bài kiểm tra, lớp bạn tham gia',
                'Phát sinh khi bạn học. Dùng để lưu tiến độ, chấm bài, và để giáo viên của lớp bạn tham gia xem tiến độ của lớp.',
                'Đến khi bạn xoá nội dung hoặc tài khoản bị xoá.',
              ],
              [
                'Trò chuyện với thầy giảng ảo: tin nhắn của bạn và câu trả lời',
                'Bạn nhập. Dùng để trả lời bạn và giữ mạch hội thoại. Được gửi cho nhà cung cấp AI (mục 6).',
                'Đến khi bạn xoá hội thoại hoặc tài khoản bị xoá.',
              ],
              [
                'Tài liệu bạn tải lên (như tệp PDF) và nội dung bạn nhập để tạo bài học',
                'Bạn tải lên hoặc nhập. Dùng để tạo bài học theo yêu cầu của bạn. Được gửi cho nhà cung cấp AI (mục 6).',
                'Đến khi bạn xoá hoặc tài khoản bị xoá.',
              ],
              [
                'Giọng nói và tìm kiếm trên mạng (khi các chức năng này được bật)',
                'Âm thanh bạn ghi hoặc câu truy vấn được gửi cho nhà cung cấp dịch vụ nhận dạng giọng nói hoặc tìm kiếm tương ứng để trả lời bạn.',
                'Chúng tôi không lưu riêng bản ghi âm; nhà cung cấp có thể giữ theo chính sách của họ.',
              ],
              [
                'Hỏi đáp trong cộng đồng: câu hỏi, câu trả lời, bình chọn, báo cáo',
                'Bạn viết. Các thành viên khác xem được, kèm tên đăng nhập của bạn.',
                'Đến khi bạn xoá hoặc chúng tôi ẩn nội dung; hoặc tài khoản bị xoá.',
              ],
              [
                'Thư và yêu cầu hỗ trợ bạn gửi cho chúng tôi (email, và nội dung hỗ trợ trong trang)',
                'Bạn gửi. Dùng để trả lời bạn. Nếu bạn viết bằng email thì địa chỉ email của bạn hiện ra với chúng tôi.',
                'Đến 24 tháng sau lần trao đổi cuối.',
              ],
              [
                'Nhật ký sử dụng: thời điểm, loại chức năng, mô hình AI, số lượng token và mã tài khoản (không có nội dung bạn viết)',
                'Phát sinh mỗi lần bạn dùng chức năng AI. Dùng để tính hạn mức, phát hiện lạm dụng và biết chi phí vận hành.',
                '24 tháng, sau đó xoá.',
              ],
              [
                'Nhật ký quản trị: quản trị viên nào xem hoặc đổi gì ở tài khoản của bạn, lúc nào',
                'Ghi tự động khi quản trị viên xử lý tài khoản. Dùng để kiểm soát và giải quyết khiếu nại.',
                '24 tháng, sau đó xoá.',
              ],
              [
                'Dữ liệu kỹ thuật: địa chỉ IP, loại trình duyệt',
                'Máy chủ dùng địa chỉ IP trong bộ nhớ để giới hạn số lần thử mật khẩu sai; chúng tôi không ghi địa chỉ này vào cơ sở dữ liệu của mình. Nhà cung cấp mạng và máy chủ (mục 6) có thể ghi nhật ký truy cập của riêng họ.',
                'Trong bộ nhớ máy chủ, vài phút đến vài giờ.',
              ],
            ],
          },
          {
            type: 'p',
            text: 'Những dữ liệu mà bạn có thể đã đưa vào nội dung của mình (như họ tên, trường, số điện thoại trong tin nhắn hoặc tài liệu) cũng bị xử lý như các dữ liệu trên. Vì vậy chúng tôi khuyên bạn không viết thông tin cá nhân vào bài học, tin nhắn hay câu hỏi.',
          },
        ],
      },
      {
        id: 'khong-thu-thap',
        heading: 'Điều chúng tôi không làm',
        blocks: [
          {
            type: 'ul',
            items: [
              'Không hỏi và không lưu họ tên thật, ngày sinh, số điện thoại, địa chỉ hay vị trí.',
              'Không bán, cho thuê hay trao đổi dữ liệu của bạn.',
              'Không hiển thị quảng cáo và không dùng cookie quảng cáo hay công cụ phân tích của bên thứ ba.',
              'Không dùng dữ liệu của bạn để huấn luyện mô hình AI của riêng chúng tôi.',
            ],
          },
        ],
      },
      {
        id: 'muc-dich',
        heading: 'Chúng tôi dùng dữ liệu vào việc gì',
        blocks: [
          {
            type: 'ul',
            items: [
              'Tạo và bảo vệ tài khoản của bạn, cho bạn đăng nhập.',
              'Cung cấp dịch vụ bạn yêu cầu: tạo bài học, chấm bài, trả lời câu hỏi, lưu tiến độ.',
              'Tính hạn mức, kích hoạt gói thành viên và xử lý thanh toán chuyển khoản.',
              'Giữ an toàn: phát hiện đăng nhập bất thường, lạm dụng và việc tạo nhiều tài khoản để lấy thêm hạn mức.',
              'Trả lời yêu cầu hỗ trợ và khiếu nại.',
              'Tuân thủ pháp luật và yêu cầu hợp pháp của cơ quan nhà nước.',
            ],
          },
          {
            type: 'p',
            text: 'Căn cứ của các việc này là để thực hiện dịch vụ mà bạn đã đăng ký, bảo vệ an toàn của dịch vụ và người dùng, và tuân thủ pháp luật. Chúng tôi không dùng dữ liệu cho mục đích khác nếu chưa hỏi và được bạn (hoặc cha mẹ, người giám hộ) đồng ý riêng cho mục đích đó. Việc đồng ý như vậy không phải là điều kiện để dùng dịch vụ.',
          },
        ],
      },
      {
        id: 'chia-se',
        heading: 'Chia sẻ dữ liệu và chuyển ra nước ngoài',
        blocks: [
          {
            type: 'table',
            head: ['Bên nhận', 'Họ nhận gì', 'Để làm gì'],
            rows: [
              [
                'Nhà cung cấp mô hình AI. Hiện chúng tôi dùng DeepSeek và Anthropic; có thể dùng nhà cung cấp khác trong tương lai. Họ ở nước ngoài.',
                'Nội dung bạn nhập khi tạo bài học và khi trò chuyện, tài liệu bạn tải lên và phần bài học cần làm ngữ cảnh để trả lời.',
                'Tạo bài học và trả lời bạn. Cách nhà cung cấp lưu và dùng dữ liệu theo chính sách riêng của họ.',
              ],
              [
                'Nhà cung cấp giọng nói và tìm kiếm (khi được bật)',
                'Âm thanh bạn ghi hoặc câu truy vấn tìm kiếm.',
                'Nhận dạng giọng nói và tìm thông tin.',
              ],
              [
                'Nhà cung cấp máy chủ (OVHcloud) và dịch vụ mạng (Cloudflare)',
                'Toàn bộ dữ liệu đi qua và nằm trên hệ thống của họ, vì họ chạy hạ tầng của chúng tôi.',
                'Chạy trang web, bảo vệ khỏi tấn công. Họ chỉ xử lý theo hợp đồng với chúng tôi.',
              ],
              [
                'Dịch vụ lưu bản sao lưu (kho riêng trên GitHub)',
                'Bản sao lưu của dữ liệu, đã được mã hoá trước khi gửi đi.',
                'Khôi phục khi hệ thống hỏng.',
              ],
              [
                'Giáo viên và quản trị viên của chúng tôi',
                'Giáo viên của lớp thấy tiến độ của học sinh trong lớp đó. Quản trị viên thấy tài khoản và nhật ký sử dụng; mọi lần xem được ghi lại.',
                'Dạy học, hỗ trợ, vận hành.',
              ],
              [
                'Cơ quan nhà nước có thẩm quyền',
                'Dữ liệu mà họ yêu cầu hợp pháp bằng văn bản.',
                'Tuân thủ pháp luật.',
              ],
            ],
          },
          {
            type: 'p',
            text: 'Khi dữ liệu đi ra khỏi Việt Nam (tới nhà cung cấp AI và bản sao lưu), chúng tôi chỉ gửi những gì cần cho việc đó và làm các thủ tục mà pháp luật Việt Nam về bảo vệ dữ liệu cá nhân yêu cầu cho việc chuyển dữ liệu ra nước ngoài. Bằng việc dùng chức năng AI, bạn biết rằng nội dung bạn nhập sẽ được xử lý ở nước ngoài.',
          },
        ],
      },
      {
        id: 'luu-tru-xoa',
        heading: 'Giữ dữ liệu bao lâu và xoá thế nào',
        blocks: [
          {
            type: 'ul',
            items: [
              'Thời hạn từng loại dữ liệu ở bảng mục 3. Hết thời hạn hoặc khi hết mục đích, chúng tôi xoá hoặc làm cho không còn nhận ra là của bạn.',
              'Khi bạn yêu cầu xoá tài khoản, chúng tôi xoá dữ liệu tài khoản, bài học, hội thoại và tài liệu của bạn trong vòng 20 ngày, trừ phần pháp luật bắt chúng tôi giữ. Các bài hỏi đáp của bạn được xoá hoặc gỡ tên đăng nhập.',
              'Bản sao lưu mã hoá được ghi đè dần và xoá hẳn sau tối đa 90 ngày; dữ liệu đã xoá không được khôi phục vào hệ thống đang chạy.',
              'Thông tin giao dịch (số tiền, thời điểm, gói) được giữ theo thời hạn kế toán và thuế do pháp luật quy định.',
            ],
          },
        ],
      },
      {
        id: 'quyen',
        heading: 'Quyền của bạn và cách thực hiện',
        blocks: [
          {
            type: 'p',
            text: `Bạn có quyền được biết dữ liệu nào của bạn đang bị xử lý, xem và nhận bản sao, sửa, xoá, hạn chế xử lý, phản đối, rút lại sự đồng ý, khiếu nại và yêu cầu bồi thường khi bị thiệt hại. Hãy viết cho ${email} từ địa chỉ email bạn có, nêu tên đăng nhập và điều bạn muốn. Chúng tôi có thể hỏi thêm để chắc rằng bạn là chủ tài khoản. Bạn tự đổi mật khẩu và đăng xuất khỏi thiết bị khác được ngay trong phần tài khoản.`,
          },
          {
            type: 'table',
            head: ['Yêu cầu', 'Chúng tôi trả lời trong', 'Chúng tôi hoàn thành trong'],
            rows: [
              ['Xem, nhận bản sao hoặc sửa dữ liệu', '2 ngày làm việc', '10 ngày'],
              ['Rút lại sự đồng ý, hạn chế xử lý, phản đối', '2 ngày làm việc', '15 ngày'],
              ['Xoá dữ liệu', '2 ngày làm việc', '20 ngày'],
            ],
          },
          {
            type: 'p',
            text: 'Khi việc cần thêm thời gian hoặc cần nhà cung cấp khác xử lý, chúng tôi báo cho bạn biết lý do và thời hạn mới. Yêu cầu hợp lệ không mất phí. Nếu chúng tôi từ chối, chúng tôi nói rõ lý do.',
          },
        ],
      },
      {
        id: 'tre-em',
        heading: 'Trẻ em và cha mẹ, người giám hộ',
        blocks: [
          {
            type: 'ul',
            items: [
              'Dịch vụ dành cho học sinh lớp 5, lớp 9 và lớp 12. Người dưới 16 tuổi chỉ được dùng khi cha mẹ hoặc người giám hộ đã đồng ý; khi tạo tài khoản, người dùng xác nhận điều đó.',
              'Chúng tôi chỉ thu thập dữ liệu cần để học, không hỏi thông tin nhận dạng thật của trẻ, không quảng cáo và không lập hồ sơ cho mục đích thương mại.',
              'Cha mẹ hoặc người giám hộ có thể thay trẻ thực hiện mọi quyền ở mục 8: xem, sửa, xoá dữ liệu, rút lại sự đồng ý và yêu cầu khoá hoặc xoá tài khoản. Khi bạn rút lại sự đồng ý, chúng tôi ngừng xử lý dữ liệu của trẻ và xoá tài khoản nếu bạn yêu cầu.',
              'Chúng tôi không công khai tên thật, ảnh hay đời tư của trẻ. Tên đăng nhập hiện cho thành viên khác thấy khi trẻ hỏi đáp trong cộng đồng, nên hãy chọn tên đăng nhập không có tên thật.',
              `Nếu bạn nghĩ một trẻ dưới 16 tuổi đang dùng dịch vụ mà không có sự đồng ý của cha mẹ, hãy báo cho ${email}; chúng tôi sẽ khoá tài khoản ngay khi kiểm tra.`,
            ],
          },
        ],
      },
      {
        id: 'bao-mat',
        heading: 'Chúng tôi bảo vệ dữ liệu thế nào',
        blocks: [
          {
            type: 'ul',
            items: [
              'Mật khẩu chỉ được lưu dưới dạng băm một chiều. Cookie đăng nhập đặt ở chế độ chỉ máy chủ đọc được (HttpOnly) và chỉ gửi qua HTTPS.',
              'Số lần thử mật khẩu sai bị giới hạn. Quản trị viên chỉ xem được dữ liệu cần cho việc của họ và mọi lần xem được ghi lại.',
              'Bản sao lưu được mã hoá trước khi rời máy chủ.',
              'Nếu xảy ra sự cố làm lộ dữ liệu cá nhân, chúng tôi báo cho cơ quan có thẩm quyền trong 72 giờ kể từ lúc phát hiện và báo cho người bị ảnh hưởng khi pháp luật yêu cầu hoặc khi có nguy cơ gây hại cho họ.',
            ],
          },
          {
            type: 'p',
            text: 'Không hệ thống nào an toàn tuyệt đối. Chúng tôi làm hết sức, và bạn góp phần bằng cách giữ kín mật khẩu.',
          },
        ],
      },
      {
        id: 'cookie',
        heading: 'Cookie và bộ nhớ của trình duyệt',
        blocks: [
          {
            type: 'table',
            head: ['Tên', 'Để làm gì', 'Thời hạn'],
            rows: [
              [
                'openmaic_session',
                'Giữ bạn đăng nhập. Cần thiết; không có nó bạn không đăng nhập được.',
                '30 ngày',
              ],
              [
                'anonymous_id',
                'Phân biệt các khách chưa đăng nhập để họ không thấy dữ liệu của nhau. Không chứa thông tin cá nhân.',
                '30 ngày',
              ],
              [
                'Bộ nhớ cục bộ của trình duyệt',
                'Nhớ giao diện sáng hoặc tối, ngôn ngữ và cài đặt của bạn trên thiết bị này.',
                'Đến khi bạn xoá dữ liệu trình duyệt',
              ],
            ],
          },
          {
            type: 'p',
            text: 'Chúng tôi không đặt cookie quảng cáo hay theo dõi. Bạn có thể xoá hoặc chặn cookie trong trình duyệt, nhưng khi đó bạn không đăng nhập được.',
          },
        ],
      },
      {
        id: 'ai-tu-dong',
        heading: 'Xử lý bằng AI',
        blocks: [
          {
            type: 'p',
            text: 'Bài học, lời giải và câu trả lời của thầy giảng ảo do mô hình AI sinh ra từ nội dung bạn đưa vào. AI có thể sai. Chúng tôi dùng AI để hỗ trợ học, không dùng nó để quyết định điều gì về quyền lợi của bạn. Bạn có thể không dùng chức năng AI, nhưng khi đó nhiều chức năng của dịch vụ không dùng được.',
          },
        ],
      },
      {
        id: 'thay-doi',
        heading: 'Thay đổi chính sách và khiếu nại',
        blocks: [
          {
            type: 'p',
            text: `Khi sửa chính sách, chúng tôi đổi số phiên bản ở đầu trang và thông báo trên trang chủ ít nhất 15 ngày trước khi có hiệu lực. Nếu chúng tôi muốn dùng dữ liệu vào một mục đích mới, chúng tôi hỏi sự đồng ý của bạn trước. Nếu bạn không hài lòng với cách chúng tôi xử lý dữ liệu, hãy viết cho ${email}; chúng tôi trả lời trong 3 ngày làm việc. Bạn cũng có quyền khiếu nại tới cơ quan nhà nước có thẩm quyền về bảo vệ dữ liệu cá nhân.`,
          },
        ],
      },
    ],
  };
}
