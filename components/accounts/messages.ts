/**
 * Vietnamese text of the account, sign-in and administration pages. These pages
 * are not in the i18n catalogue (lib/i18n), so their copy lives here, in one place.
 */

export type AccountRole = 'user' | 'admin';
export type AccountStatus = 'active' | 'disabled' | 'deleted';

export const roleLabel: Record<AccountRole, string> = {
  user: 'Người dùng',
  admin: 'Quản trị viên',
};

export const statusLabel: Record<AccountStatus, string> = {
  active: 'Đang hoạt động',
  disabled: 'Đã vô hiệu hoá',
  deleted: 'Đã xoá',
};

const auditActions: Record<string, string> = {
  'user.create': 'Tạo tài khoản',
  'user.update': 'Cập nhật tài khoản',
  'user.password_reset': 'Đặt lại mật khẩu',
  'user.password_change': 'Đổi mật khẩu',
  'user.promote': 'Cấp quyền quản trị',
};

const auditFields: Record<string, string> = {
  displayName: 'tên hiển thị',
  role: 'vai trò',
  status: 'trạng thái',
};

const policyReasons: Record<string, string> = {
  length: 'Mật khẩu phải từ 10 đến 200 ký tự.',
  username: 'Mật khẩu không được chứa tên đăng nhập.',
  common: 'Mật khẩu này quá phổ biến. Hãy chọn mật khẩu khác.',
  unchanged: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
};

export const messages = {
  appName: 'OpenMAIC',
  goHome: 'Về trang chủ',
  cancel: 'Huỷ',
  close: 'Đóng',
  copy: 'Sao chép',
  copied: 'Đã sao chép.',
  copyFailed: 'Không sao chép tự động được. Chọn ô mật khẩu rồi sao chép thủ công.',
  networkError: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  serverError: 'Máy chủ gặp lỗi. Thử lại sau ít phút.',
  genericError: 'Thao tác chưa thành công. Thử lại sau.',
  loading: 'Đang tải…',
  locked(seconds?: number): string {
    if (seconds === undefined || seconds <= 60) {
      return 'Nhập sai nhiều lần nên tạm khoá. Thử lại sau ít hơn một phút.';
    }
    return `Nhập sai nhiều lần nên tạm khoá. Thử lại sau ${Math.ceil(seconds / 60)} phút.`;
  },
  errors: {
    UNAUTHENTICATED: 'Phiên đăng nhập đã hết. Hãy đăng nhập lại.',
    PASSWORD_CHANGE_REQUIRED: 'Bạn cần đổi mật khẩu trước khi tiếp tục.',
    FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
    INVALID_REQUEST: 'Dữ liệu chưa hợp lệ. Kiểm tra lại các ô rồi thử lại.',
    USERNAME_TAKEN: 'Tên đăng nhập này đã có. Tên không phân biệt chữ hoa và chữ thường.',
    INVALID_USERNAME:
      'Tên đăng nhập không hợp lệ hoặc là tên dành riêng. Dùng 3 đến 32 ký tự gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.',
    INVALID_DISPLAY_NAME: 'Tên hiển thị phải từ 1 đến 80 ký tự.',
    NOT_FOUND: 'Không tìm thấy tài khoản này.',
    DELETED: 'Tài khoản đã bị xoá nên không thể thay đổi.',
    LAST_ADMIN: 'Phải còn ít nhất một quản trị viên đang hoạt động, nên thay đổi này bị từ chối.',
  } as Record<string, string>,
  policy(reason: string | undefined): string {
    return (reason && policyReasons[reason]) || 'Mật khẩu chưa đạt yêu cầu.';
  },

  login: {
    title: 'Đăng nhập',
    intro: 'Dùng tên đăng nhập và mật khẩu do quản trị viên cấp.',
    submit: 'Đăng nhập',
    busy: 'Đang đăng nhập…',
    invalid: 'Tên đăng nhập hoặc mật khẩu không đúng.',
    noAccount: 'Chưa có tài khoản? Liên hệ quản trị viên để được cấp.',
  },

  fields: {
    username: 'Tên đăng nhập',
    password: 'Mật khẩu',
    displayName: 'Tên hiển thị',
    role: 'Vai trò',
    currentPassword: 'Mật khẩu hiện tại',
    newPassword: 'Mật khẩu mới',
    confirmPassword: 'Nhập lại mật khẩu mới',
    search: 'Tìm kiếm',
    status: 'Trạng thái',
  },

  account: {
    title: 'Tài khoản',
    username: 'Tên đăng nhập',
    role: 'Vai trò',
    saveName: 'Lưu tên',
    saving: 'Đang lưu…',
    nameSaved: 'Đã lưu tên hiển thị.',
    security: 'Bảo mật',
    changePassword: 'Đổi mật khẩu',
    adminPage: 'Trang quản trị',
    signOut: 'Đăng xuất',
    signOutAll: 'Đăng xuất khỏi mọi thiết bị',
    signOutAllHint:
      'Mọi thiết bị đang đăng nhập bằng tài khoản này, gồm cả máy này, sẽ bị đăng xuất.',
    signOutAllConfirm: 'Đăng xuất tất cả',
  },

  userMenu: {
    trigger: (name: string): string => `Tài khoản của ${name}`,
    account: 'Tài khoản',
    admin: 'Trang quản trị',
    signOut: 'Đăng xuất',
  },

  password: {
    title: 'Đổi mật khẩu',
    mustChange:
      'Quản trị viên đã đặt mật khẩu tạm cho tài khoản này. Bạn cần đặt mật khẩu mới trước khi dùng ứng dụng. Sau khi đổi, các thiết bị khác sẽ bị đăng xuất.',
    hint: 'Từ 10 đến 200 ký tự. Không chứa tên đăng nhập và không phải mật khẩu phổ biến.',
    submit: 'Đổi mật khẩu',
    saving: 'Đang đổi…',
    done: 'Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.',
    backToAccount: 'Quay lại tài khoản',
    mismatch: 'Hai ô mật khẩu mới chưa khớp.',
    wrongCurrent: 'Mật khẩu hiện tại không đúng.',
  },

  admin: {
    title: 'Quản trị người dùng',
    tabUsers: 'Người dùng',
    tabAudit: 'Nhật ký',
    tabCost: 'Sử dụng',
    search: 'Tìm',
    searchPlaceholder: 'Tên đăng nhập hoặc tên hiển thị',
    filterStatus: 'Lọc theo trạng thái',
    filterRole: 'Lọc theo vai trò',
    all: 'Tất cả',
    create: 'Tạo người dùng',
    empty: 'Không có người dùng nào khớp bộ lọc.',
    loadFailed: 'Chưa tải được danh sách.',
    retry: 'Thử lại',
    previous: 'Trang trước',
    next: 'Trang sau',
    you: '(bạn)',
    mustChange: 'Phải đổi mật khẩu',
    neverSignedIn: 'Chưa đăng nhập',
    edit: 'Sửa',
    disable: 'Vô hiệu hoá',
    enable: 'Kích hoạt lại',
    resetPassword: 'Đặt lại mật khẩu',
    delete: 'Xoá',
    rowAction: (action: string, username: string): string => `${action} người dùng ${username}`,
    columns: {
      username: 'Tên đăng nhập',
      displayName: 'Tên hiển thị',
      role: 'Vai trò',
      status: 'Trạng thái',
      lastLogin: 'Đăng nhập gần nhất',
      actions: 'Thao tác',
    },
    notice: {
      created: (username: string) => `Đã tạo tài khoản ${username}.`,
      updated: (username: string) => `Đã cập nhật ${username}.`,
      disabled: (username: string) => `Đã vô hiệu hoá ${username}.`,
      enabled: (username: string) => `Đã kích hoạt lại ${username}.`,
      reset: (username: string) => `Đã đặt lại mật khẩu cho ${username}.`,
      deleted: (username: string) => `Đã xoá tài khoản ${username}.`,
    },
    usage: {
      from: 'Từ ngày',
      to: 'Đến ngày',
      apply: 'Xem',
      invalidRange: 'Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.',
      empty: 'Chưa có lượt sử dụng nào trong khoảng ngày này.',
      note: 'Chưa có bảng giá nên trang này chỉ hiển thị số lượt và token, chưa quy ra tiền. Ngày tính theo UTC. Lượt chỉ được gắn với tài khoản kể từ khi hệ thống bắt đầu ghi nhận người thực hiện; lượt trước đó nằm ở dòng Không gắn tài khoản.',
      columns: {
        account: 'Tài khoản',
        requests: 'Lượt',
        input: 'Token vào',
        output: 'Token ra',
        total: 'Tổng token',
        kinds: 'Theo loại',
      },
      unattributed: 'Không gắn tài khoản',
      totals: 'Tổng cộng',
      kindLabel: {
        llm: 'Văn bản',
        image: 'Ảnh',
        video: 'Video',
        tts: 'Giọng đọc',
        asr: 'Nhận dạng giọng nói',
      } as Record<string, string>,
    },
  },

  create: {
    title: 'Tạo người dùng',
    description:
      'Hệ thống tạo một mật khẩu tạm. Người dùng phải đổi mật khẩu này ở lần đăng nhập đầu tiên.',
    usernameHint:
      'Chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang. Từ 3 đến 32 ký tự, bắt đầu bằng chữ hoặc số.',
    submit: 'Tạo tài khoản',
    busy: 'Đang tạo…',
  },

  edit: {
    title: 'Sửa người dùng',
    description:
      'Đổi tên hiển thị hoặc vai trò. Quản trị viên đang hoạt động cuối cùng không thể bị hạ quyền.',
    submit: 'Lưu thay đổi',
    nothing: 'Chưa có thay đổi nào.',
  },

  temporary: {
    title: 'Mật khẩu tạm',
    warning:
      'Lưu mật khẩu này ngay. Khi đóng hộp thoại, bạn không thể xem lại. Gửi cho người dùng qua kênh an toàn.',
  },

  disable: {
    title: 'Vô hiệu hoá tài khoản?',
    description:
      'Người dùng không đăng nhập được, và mọi phiên đang mở sẽ kết thúc ngay. Có thể kích hoạt lại sau.',
    submit: 'Vô hiệu hoá',
  },

  enable: {
    title: 'Kích hoạt lại tài khoản?',
    description: 'Người dùng đăng nhập lại được bằng mật khẩu hiện có.',
    submit: 'Kích hoạt',
  },

  reset: {
    title: 'Đặt lại mật khẩu?',
    description:
      'Hệ thống tạo mật khẩu tạm mới. Mọi phiên đang mở của người dùng sẽ kết thúc, và người dùng phải đổi mật khẩu khi đăng nhập.',
    submit: 'Đặt lại mật khẩu',
  },

  remove: {
    title: 'Xoá tài khoản?',
    description(username: string): string {
      return `Tài khoản không đăng nhập được nữa và mọi phiên sẽ kết thúc. Tên đăng nhập ${username} vẫn bị giữ, nên không ai đăng ký lại được. Việc xoá dữ liệu học tập không thực hiện ở đây.`;
    },
    typeHint: 'Gõ lại tên đăng nhập để xác nhận.',
    submit: 'Xoá tài khoản',
  },

  audit: {
    when: 'Thời điểm',
    actor: 'Người thực hiện',
    action: 'Thao tác',
    target: 'Đối tượng',
    detail: 'Chi tiết',
    empty: 'Chưa có nhật ký.',
    cli: 'Dòng lệnh',
    actionLabel(action: string): string {
      return auditActions[action] ?? 'Thao tác khác';
    },
    changed(fields: string[]): string {
      const names = fields.map((field) => auditFields[field] ?? field);
      return names.length > 0 ? `Đổi: ${names.join(', ')}` : 'Không đổi trường nào';
    },
    created(role: string, generated: boolean): string {
      const roleText = role === 'admin' ? roleLabel.admin : roleLabel.user;
      return generated ? `Vai trò ${roleText}, có mật khẩu tạm` : `Vai trò ${roleText}`;
    },
  },

  forbidden: {
    title: 'Không có quyền truy cập (403)',
    body(username: string): string {
      return `Trang quản trị chỉ dành cho quản trị viên. Tài khoản ${username} hiện là tài khoản người dùng, nên không mở được trang này.`;
    },
    help: 'Nếu bạn cần quyền quản trị, hãy nhờ quản trị viên nâng quyền cho tài khoản của bạn.',
    toAccount: 'Về trang tài khoản',
  },
} as const;

/** A date and time as shown in the tables, in Vietnamese order. */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
