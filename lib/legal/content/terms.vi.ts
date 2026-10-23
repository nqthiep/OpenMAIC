import type { LegalContext, LegalDocument } from '@/lib/legal/types';

/**
 * Điều khoản sử dụng, bản tiếng Việt (bản có giá trị áp dụng). Bản nháp, chưa có luật sư rà soát:
 * xem `LEGAL_TEXT_REVIEWED`. Mọi mô tả về dữ liệu và thanh toán phải khớp với mã nguồn; khi mã đổi
 * thì sửa văn bản và đổi `TERMS_VERSION`.
 */
export function termsVi({ product, domain, email, version }: LegalContext): LegalDocument {
  return {
    title: 'Điều khoản sử dụng',
    summary: `Những điều bạn và ${product} cam kết với nhau khi bạn tạo tài khoản và học trên ${domain}.`,
    sections: [
      {
        id: 'pham-vi',
        heading: 'Phạm vi và việc chấp nhận',
        blocks: [
          {
            type: 'p',
            text: `${product} (${domain}) là trang web giúp học sinh học và ôn tập Toán, Tin học, Vật lí, Hoá học ở lớp 5, lớp 9 và lớp 12. Điều khoản này áp dụng cho mọi việc bạn làm trên trang, từ lúc xem trang chủ đến lúc dùng tài khoản. “Chúng tôi” là người vận hành ${product}. Bạn có thể viết cho chúng tôi qua ${email}.`,
          },
          {
            type: 'p',
            text: `Khi tạo tài khoản, bạn đánh dấu vào ô đồng ý. Chúng tôi lưu lại việc đó cùng phiên bản điều khoản bạn đã đồng ý (hiện là ${version}) và thời điểm đồng ý. Nếu bạn không đồng ý, xin đừng tạo tài khoản; bạn vẫn xem được các trang công khai.`,
          },
          {
            type: 'p',
            text: 'Điều khoản này đi cùng Chính sách quyền riêng tư, trong đó nói rõ chúng tôi thu thập, dùng và bảo vệ dữ liệu của bạn thế nào. Hai văn bản được viết để đọc cùng nhau.',
          },
        ],
      },
      {
        id: 'ai-dung',
        heading: 'Ai được dùng và việc của cha mẹ, người giám hộ',
        blocks: [
          {
            type: 'ul',
            items: [
              'Người từ đủ 16 tuổi có thể tự tạo và dùng tài khoản.',
              'Người dưới 16 tuổi (thường là học sinh lớp 5 và lớp 9) chỉ được tạo và dùng tài khoản khi cha mẹ hoặc người giám hộ đã đồng ý. Tốt nhất là cha mẹ hoặc người giám hộ cùng tạo tài khoản và giữ mật khẩu.',
              'Người dưới 18 tuổi không tự mua gói trả phí. Việc mua gói do cha mẹ hoặc người giám hộ thực hiện hoặc đồng ý.',
            ],
          },
          {
            type: 'p',
            text: 'Ô đồng ý khi tạo tài khoản có nghĩa là: bạn đã đủ 16 tuổi, hoặc cha mẹ, người giám hộ của bạn đã đọc và đồng ý cho bạn dùng dịch vụ. Chúng tôi không hỏi họ tên thật, ngày sinh, số điện thoại hay email của học sinh, nên chúng tôi không thể tự kiểm tra tuổi; chúng tôi tin vào xác nhận của bạn. Nếu bạn là cha mẹ hoặc người giám hộ và không muốn con mình dùng tài khoản, hãy viết cho chúng tôi, chúng tôi sẽ khoá hoặc xoá tài khoản đó.',
          },
        ],
      },
      {
        id: 'tai-khoan',
        heading: 'Tài khoản và mật khẩu',
        blocks: [
          {
            type: 'ul',
            items: [
              'Tài khoản gồm tên đăng nhập và mật khẩu. Chúng tôi không lưu mật khẩu; chúng tôi chỉ lưu bản băm không đọc ngược được.',
              'Bạn giữ kín mật khẩu và chịu trách nhiệm về những gì xảy ra trên tài khoản của bạn. Mỗi người một tài khoản; không bán, cho thuê hay chia sẻ tài khoản.',
              'Tên đăng nhập hiện cho thành viên khác thấy khi bạn hỏi hoặc trả lời trong cộng đồng. Đừng dùng họ tên thật, tên của người khác hay từ ngữ xúc phạm.',
              'Bạn có thể đăng xuất khỏi các thiết bị khác trong phần tài khoản. Nếu nghi ngờ lộ mật khẩu, hãy đổi mật khẩu ngay.',
              `Quên mật khẩu: vì không lưu email, chúng tôi đặt lại mật khẩu khi bạn viết cho ${email} và cho biết tên đăng nhập. Chúng tôi có thể hỏi thêm thông tin để chắc rằng bạn là chủ tài khoản.`,
            ],
          },
        ],
      },
      {
        id: 'thanh-vien',
        heading: 'Gói thành viên, tháng dùng thử và thanh toán',
        blocks: [
          {
            type: 'ul',
            items: [
              'Tài khoản mới được dùng thử miễn phí trong 30 ngày kể từ lúc tạo, với hạn mức dùng thử ghi trên trang chủ. Dùng thử không cần thông tin thanh toán và không tự chuyển thành gói trả phí.',
              'Sau đó, các chức năng dành cho thành viên, như tạo bài học bằng AI, cần gói trả phí. Các gói hiện có là 1 tháng, 6 tháng và 12 tháng; giá niêm yết trên trang chủ.',
              'Giá niêm yết đã là giá cuối cùng bạn phải trả cho gói đó; chúng tôi không thu thêm khoản nào khác. Khi giá đổi, giá mới chỉ áp dụng cho gói mua sau đó, không áp dụng cho thời gian bạn đã trả.',
              `Hiện chưa có thanh toán tự động. Bạn viết cho ${email} chọn gói, chuyển khoản theo hướng dẫn chúng tôi gửi lại, rồi chúng tôi kích hoạt gói sau khi nhận được tiền. Chúng tôi không bao giờ tự trừ tiền và không tự gia hạn.`,
              'Gói hết hạn thì thôi, bạn không phải làm gì để huỷ. Chúng tôi hiển thị thông báo trên trang chủ khi gói sắp hết và khi đã hết.',
              'Mỗi gói có hạn mức dùng cho từng chu kỳ một tháng, tính từ ngày và giờ gói bắt đầu: gói bắt đầu lúc 21:15 ngày 20/10 thì hạn mức được tính lại lúc 21:15 ngày 20/11, rồi ngày 20/12, và cứ thế đến khi gói hết. Hạn mức không cộng dồn sang chu kỳ sau. Khi dùng hết hạn mức, các chức năng cần AI tạm dừng đến chu kỳ sau hoặc đến khi chúng tôi cấp thêm.',
              'Nếu bạn mua gói trong lúc một gói đang chạy, gói mới bắt đầu ngay khi gói đang chạy kết thúc; hạn mức của chu kỳ đang chạy không đổi. Tháng dùng thử là một chu kỳ.',
            ],
          },
          {
            type: 'p',
            text: 'Hoàn tiền: nếu bạn chưa dùng hạn mức của gói và viết cho chúng tôi trong vòng 7 ngày kể từ ngày chuyển khoản, chúng tôi hoàn lại toàn bộ số tiền về tài khoản đã chuyển. Sau thời hạn đó chúng tôi không hoàn phần chưa dùng, trừ khi dịch vụ lỗi do chúng tôi và không khắc phục được, hoặc pháp luật yêu cầu hoàn. Quyền của người tiêu dùng theo pháp luật vẫn được giữ nguyên.',
          },
        ],
      },
      {
        id: 'noi-dung-ai',
        heading: 'Nội dung do AI tạo ra',
        blocks: [
          {
            type: 'ul',
            items: [
              'Bài học, câu hỏi, lời giải và câu trả lời của thầy giảng ảo do mô hình AI tạo ra. Thầy giảng ảo là AI, không phải người thật.',
              'AI có thể sai, thiếu hoặc không phù hợp. Hãy đối chiếu với sách giáo khoa và thầy cô, nhất là với đáp án và công thức trước khi thi.',
              `${product} là công cụ học và ôn tập. Chúng tôi không cam kết điểm số, kết quả thi hay kết quả học tập.`,
              'Nếu bạn thấy nội dung sai hoặc không phù hợp với học sinh, hãy báo cho chúng tôi để chúng tôi sửa.',
            ],
          },
        ],
      },
      {
        id: 'noi-dung-nguoi-dung',
        heading: 'Nội dung bạn đưa lên và quyền sở hữu',
        blocks: [
          {
            type: 'ul',
            items: [
              'Tài liệu, câu hỏi và nội dung bạn nhập hoặc tải lên vẫn là của bạn hoặc của người có quyền. Bạn cho chúng tôi quyền dùng chúng chỉ để cung cấp dịch vụ cho bạn: lưu, xử lý và gửi tới nhà cung cấp AI để tạo bài học và trả lời bạn.',
              'Bạn cam kết có quyền dùng những gì bạn tải lên. Đừng tải lên tài liệu bạn không có quyền sử dụng, và đừng tải lên thông tin cá nhân của người khác hoặc của chính bạn mà không cần thiết.',
              'Chúng tôi không nhận bản quyền đối với nội dung do AI tạo ra từ yêu cầu của bạn và không hứa rằng nội dung đó được pháp luật bảo hộ bản quyền. Bạn được dùng nội dung đó để học và dạy cho mục đích cá nhân, không thương mại.',
              'Phần mềm, thiết kế, nhãn hiệu và nội dung do chúng tôi biên soạn thuộc về chúng tôi hoặc bên cấp phép cho chúng tôi. Bạn không được sao chép hàng loạt hay bán lại.',
            ],
          },
        ],
      },
      {
        id: 'cong-dong',
        heading: 'Hỏi đáp trong cộng đồng',
        blocks: [
          {
            type: 'ul',
            items: [
              'Thành viên có thể đặt câu hỏi và trả lời về các bài học đã được chia sẻ. Câu hỏi, câu trả lời và bình chọn được các thành viên khác xem, kèm tên đăng nhập của người viết.',
              'Chỉ viết điều liên quan đến bài học. Không đăng họ tên, số điện thoại, địa chỉ, ảnh hay thông tin riêng của bạn hoặc của người khác.',
              'Thành viên có thể báo cáo nội dung không phù hợp. Chúng tôi có thể ẩn nội dung và chặn một tài khoản đăng bài khi có vi phạm.',
              'Phần thưởng hạn mức cho câu trả lời được chọn là hay nhất chỉ để dùng trong dịch vụ, không có giá trị tiền mặt và có thể đổi hoặc ngừng.',
            ],
          },
        ],
      },
      {
        id: 'quy-dinh',
        heading: 'Điều bạn không được làm',
        blocks: [
          {
            type: 'ul',
            items: [
              'Dùng trang để làm điều trái pháp luật, quấy rối, lừa đảo, hay đăng nội dung bạo lực, khiêu dâm, xúc phạm hoặc gây hại cho trẻ em.',
              'Cố truy cập tài khoản hoặc dữ liệu của người khác, dò mật khẩu, hoặc tấn công, làm quá tải hệ thống.',
              'Tạo nhiều tài khoản để nhận thêm tháng dùng thử hoặc hạn mức, hoặc dùng công cụ tự động để lấy nội dung hoặc dùng hạn mức.',
              'Dùng trang để huấn luyện mô hình khác hoặc bán lại quyền truy cập.',
              'Cố ép AI bỏ qua các giới hạn an toàn của trang.',
            ],
          },
        ],
      },
      {
        id: 'ben-thu-ba',
        heading: 'Dịch vụ của bên thứ ba và phần mềm mã nguồn mở',
        blocks: [
          {
            type: 'p',
            text: `${product} dựa trên dự án mã nguồn mở OpenMAIC và các thư viện mã nguồn mở khác, theo giấy phép của từng dự án. Để chạy, chúng tôi dùng dịch vụ của bên thứ ba, như nhà cung cấp mô hình AI, máy chủ và dịch vụ mạng; chi tiết ở Chính sách quyền riêng tư. Chúng tôi không chịu trách nhiệm về những gián đoạn do các bên này gây ra ngoài phạm vi pháp luật quy định.`,
          },
        ],
      },
      {
        id: 'tam-dung',
        heading: 'Tạm khoá và chấm dứt',
        blocks: [
          {
            type: 'ul',
            items: [
              'Bạn có thể ngừng dùng bất cứ lúc nào và yêu cầu xoá tài khoản bằng email gửi tới chúng tôi.',
              'Chúng tôi có thể tạm khoá hoặc đóng tài khoản vi phạm điều khoản này, hoặc khi pháp luật yêu cầu. Trừ trường hợp khẩn cấp hoặc pháp luật cấm, chúng tôi báo trước cho bạn và nêu lý do; bạn có thể giải trình qua email.',
              'Khi đóng tài khoản vì vi phạm, thời gian chưa dùng của gói trả phí được hoàn lại theo tỉ lệ, trừ phần đã dùng và trừ thiệt hại do vi phạm gây ra.',
              'Chúng tôi có thể ngừng một chức năng hoặc cả dịch vụ. Khi đó chúng tôi báo trước ít nhất 30 ngày và hoàn lại phần chưa dùng của gói trả phí.',
            ],
          },
        ],
      },
      {
        id: 'trach-nhiem',
        heading: 'Giới hạn trách nhiệm',
        blocks: [
          {
            type: 'p',
            text: `${product} được cung cấp theo hiện trạng và chúng tôi cố gắng để dịch vụ chạy liên tục nhưng không cam kết không bao giờ gián đoạn hoặc không có lỗi. Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp, về việc bạn tin vào nội dung AI mà không đối chiếu, hay về việc mất dữ liệu do lỗi ngoài kiểm soát của chúng tôi. Không điều khoản nào ở đây loại trừ trách nhiệm mà pháp luật không cho phép loại trừ, hay giới hạn quyền khiếu nại của bạn.`,
          },
        ],
      },
      {
        id: 'thay-doi',
        heading: 'Thay đổi điều khoản',
        blocks: [
          {
            type: 'p',
            text: 'Khi sửa điều khoản, chúng tôi đổi số phiên bản ở đầu trang và thông báo trên trang chủ ít nhất 15 ngày trước khi có hiệu lực. Với thay đổi bất lợi cho bạn, bạn có quyền ngừng dùng và yêu cầu hoàn lại phần chưa dùng của gói trả phí; nếu bạn vẫn tiếp tục dùng sau ngày có hiệu lực thì được coi là đồng ý. Thay đổi không áp dụng ngược cho thời gian bạn đã trả tiền.',
          },
        ],
      },
      {
        id: 'luat-va-giai-quyet',
        heading: 'Luật áp dụng và giải quyết tranh chấp',
        blocks: [
          {
            type: 'p',
            text: `Điều khoản này theo pháp luật Việt Nam. Nếu có khiếu nại, hãy viết cho ${email}; chúng tôi trả lời trong 3 ngày làm việc và cố gắng giải quyết trong 15 ngày. Nếu không thoả thuận được, hai bên có thể nhờ tổ chức hoà giải hoặc đưa ra Toà án có thẩm quyền ở Việt Nam. Bạn cũng có quyền gửi khiếu nại tới cơ quan nhà nước có thẩm quyền.`,
          },
        ],
      },
      {
        id: 'lien-he',
        heading: 'Liên hệ',
        blocks: [
          {
            type: 'p',
            text: `Mọi câu hỏi về điều khoản, tài khoản, thanh toán hay khiếu nại: ${email}. Tên người vận hành, địa chỉ và mã số thuế sẽ được ghi ở mục này khi hoàn tất đăng ký kinh doanh.`,
          },
        ],
      },
    ],
  };
}
