/**
 * CHÍNH SÁCH CHẠY TẠI CHỖ – xác định bằng kiểm thử đối chiếu tests/test-engine.html?partial=app
 * (mỗi vai trò × mỗi thao tác: kết quả tại chỗ phải GIỐNG HỆT máy chủ cũ).
 */

/** Thao tác đọc được phép chạy tại chỗ. */
export const LOCAL = ['app.bootstrap', 'dashboard.get', 'score.week', 'rank.get', 'incident.list', 'notify.list', 'review.queue',
  'week.list', 'class.list', 'rule.list', 'stats.get', 'report.weeklyComment', 'score.explain', 'duty.list', 'check.list', 'appeal.list'];

/**
 * Bảng người dùng chỉ thấy một phần (GVCN: lớp mình; Sao đỏ: bản ghi của mình; người không phải Quản trị: danh bạ tên thay cho USERS…).
 * Mã backend vốn lọc kết quả theo đúng phạm vi đó, nên dùng dữ liệu một phần vẫn cho kết quả giống máy chủ.
 * Ngoại lệ là số liệu tổng hợp toàn trường – xử lý riêng ở POST.
 */
const PARTIAL = ['USERS', 'INCIDENTS', 'EVIDENCE', 'SCORE_TRANSACTIONS', 'WEEKLY_RESULTS', 'STUDENTS', 'DAILY_CHECKS', 'DUTY_SCHEDULES', 'APPEALS', 'EXPORT_JOBS'];
export const PARTIAL_OK = Object.fromEntries(LOCAL.map(a => [a, PARTIAL]));

/** Sửa sau khi chạy: số liệu toàn trường mà người dùng không đọc đủ dữ liệu gốc để tự đếm. */
export const POST = {
  // "N bản ghi chờ duyệt" trên Bảng điểm đếm cả trường → lấy con số đếm sẵn do đồng bộ chép sang (boot/tables.PENDING_BY_WEEK)
  'score.week': async (res, { partialUsed, source }) => {
    if (res && res.week && partialUsed.includes('INCIDENTS')) {
      const p = await source.bootField('PENDING_BY_WEEK');
      res.pending = (p && p[res.week.week_id]) || 0;
    }
    return res;
  }
};
