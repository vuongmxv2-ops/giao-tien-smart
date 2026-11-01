import { h, options, field, toast, loading, errorBox, table, badge, fmtDate, fmtDateTime, signed, modal, readSheetFile, mapColumns, askReason } from '../ui.js';

export const CLASS_COLS = { name: ['Lớp', 'Tên lớp', 'name'], grade: ['Khối', 'grade'], campus_code: ['Cơ sở', 'Mã cơ sở', 'campus_code', 'campus'],
  homeroom_name: ['GVCN', 'Giáo viên chủ nhiệm', 'homeroom_name'], homeroom_email: ['Email GVCN', 'homeroom_email', 'Email'], sort_order: ['STT', 'Thứ tự', 'sort_order'], comp_group: ['Nhóm thi đua', 'Nhóm', 'comp_group'] };
export const STUDENT_COLS = { student_code: ['Mã học sinh', 'Mã HS', 'student_code', 'Mã định danh'], full_name: ['Họ và tên', 'Họ tên', 'full_name'], class_name: ['Lớp', 'class_name'], status: ['Tình trạng', 'Trạng thái', 'status'] };
const ST_LABEL = { DANG_HOC: 'Đang học', CHUYEN_DI: 'Chuyển đi', NGHI_HOC: 'Nghỉ học', BAO_LUU: 'Bảo lưu' };

/** TAB 8 – HỒ SƠ LỚP – HỌC SINH. GVCN chỉ thấy học sinh lớp mình (backend lọc). */
export async function render(el, app) {
  const b = app.boot, admin = app.can('admin.data');
  const classes = admin || app.user.allScope ? b.classes : b.classes.filter(c => app.user.classIds.includes(c.class_id));
  if (admin) {
    const ci = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true }), si = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true });
    ci.addEventListener('change', () => importFile(ci, 'class'));
    si.addEventListener('change', () => importFile(si, 'student'));
    el.append(h('div', { class: 'card' }, h('h2', {}, '📥 Nhập dữ liệu từ Excel'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => ci.click() }, 'Nhập danh sách lớp'), h('button', { class: 'btn primary', onclick: () => si.click() }, 'Nhập danh sách học sinh'),
        h('a', { class: 'btn ghost', href: 'templates/mau_danh_sach_lop.xlsx', download: '' }, 'Tải mẫu lớp'), h('a', { class: 'btn ghost', href: 'templates/mau_danh_sach_hoc_sinh.xlsx', download: '' }, 'Tải mẫu học sinh')), ci, si,
      h('div', { class: 'small muted' }, 'Chỉ lưu: mã học sinh, họ tên, lớp, tình trạng học tập. Không nhập ngày sinh, địa chỉ, số điện thoại.')));
  }
  const fClass = h('select', {}, options(classes, { value: 'class_id', label: c => `${c.name} – ${app.campusName(c.campus_id)}`, empty: classes.length > 1 ? '— Chọn lớp —' : undefined }));
  const fQ = h('input', { type: 'search', placeholder: 'Tìm theo tên hoặc mã học sinh' });
  el.append(h('div', { class: 'filters' }, field('Lớp', fClass), field('Tìm kiếm', fQ)));
  const info = h('div'), body = h('div');
  el.append(info, body);
  fClass.addEventListener('change', load);
  let t; fQ.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 350); });

  async function load() {
    const c = app.classById(fClass.value);
    info.replaceChildren(c ? h('div', { class: 'card' }, h('b', {}, 'Lớp ' + c.name), ` · Khối ${c.grade} · ${app.campusName(c.campus_id)} · GVCN: ${c.homeroom_name || '—'} · Năm học ${b.year?.name || ''}`) : '');
    if (!fClass.value && !fQ.value.trim()) {
      body.replaceChildren(table([{ label: 'Lớp', key: 'name' }, { label: 'Khối', key: 'grade', num: true }, { label: 'Cơ sở', render: r => app.campusName(r.campus_id) }, { label: 'Nhóm thi đua', key: 'comp_group' }, { label: 'GVCN', key: 'homeroom_name' }], classes,
        { onRow: r => { fClass.value = r.class_id; load(); } }));
      return;
    }
    loading(body);
    try {
      const rows = await app.call('student.search', { class_id: fClass.value, q: fQ.value.trim() });
      body.replaceChildren(table([{ label: 'Mã HS', key: 'student_code' }, { label: 'Họ và tên', key: 'full_name' }, { label: 'Lớp', key: 'class_name' },
        { label: 'Tình trạng', render: r => ST_LABEL[r.status] || r.status || '' },
        admin ? { label: '', render: r => h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); transfer(r); } }, 'Chuyển lớp') } : { label: '', render: () => '' }], rows,
        { onRow: history, empty: 'Không tìm thấy học sinh.' }));
    } catch (e) { errorBox(body, e, load); }
  }

  async function history(s) {
    try {
      const d = await app.call('student.history', { student_id: s.student_id });
      modal({ title: `${d.student.full_name} (${d.student.student_code})`, wide: true, body: h('div', {},
        h('h3', {}, 'Lịch sử lớp'), table([{ label: 'Lớp', key: 'class_name' }, { label: 'Từ', render: e => fmtDate(e.from_date) }, { label: 'Đến', render: e => e.to_date ? fmtDate(e.to_date) : 'nay' }, { label: 'Lý do', key: 'reason' }], d.enrollments),
        h('h3', {}, 'Lịch sử ghi nhận nề nếp'), table([{ label: 'Ngày', render: i => fmtDateTime(i.occurred_at) }, { label: 'Lớp lúc vi phạm', key: 'class_name' }, { label: 'Nội dung', key: 'type_name' },
          { label: 'Điểm', render: i => i.approved_points !== '' ? signed(i.approved_points) : '', num: true }, { label: 'Trạng thái', render: i => badge(i.status) }], d.incidents, { empty: 'Chưa có ghi nhận.' })) });
    } catch (e) { toast(e.message, 'err'); }
  }

  async function transfer(s) {
    const to = h('select', {}, options(b.classes.filter(c => c.class_id !== s.class_id), { value: 'class_id', label: 'name' }));
    modal({ title: 'Chuyển lớp: ' + s.full_name, body: h('div', {}, h('p', { class: 'small muted' }, 'Các vi phạm cũ vẫn giữ nguyên lớp tại thời điểm vi phạm.'), field('Chuyển sang lớp', to)),
      actions: [{ label: 'Hủy' }, { label: 'Tiếp tục', kind: 'primary', onClick: async () => {
        const reason = await askReason('Lý do chuyển lớp'); if (!reason) return false;
        await app.call('student.transfer', { student_id: s.student_id, to_class_id: to.value, reason }); toast('Đã chuyển lớp', 'ok'); load();
      } }] });
  }

  async function importFile(input, kind) {
    const file = input.files[0]; input.value = '';
    if (!file) return;
    try {
      const raw = await readSheetFile(file);
      const rows = mapColumns(raw, kind === 'class' ? CLASS_COLS : STUDENT_COLS);
      if (!rows.length) return toast('Không đọc được dòng dữ liệu nào. Kiểm tra dòng tiêu đề theo mẫu.', 'err');
      const preview = table(Object.keys(kind === 'class' ? CLASS_COLS : STUDENT_COLS).map(k => ({ label: k, key: k })), rows.slice(0, 8));
      modal({ title: `Nhập ${rows.length} ${kind === 'class' ? 'lớp' : 'học sinh'} từ ${file.name}`, wide: true, body: h('div', {}, h('p', {}, 'Xem trước 8 dòng đầu:'), preview),
        actions: [{ label: 'Hủy' }, { label: 'Nhập vào hệ thống', kind: 'primary', onClick: async () => {
          const r = await app.call(kind === 'class' ? 'class.import' : 'student.import', { rows });
          modal({ title: 'Kết quả nhập', body: h('div', {}, h('p', {}, kind === 'class' ? `Tạo mới ${r.created}, cập nhật ${r.updated}.` : `Tạo mới ${r.created}, chuyển lớp ${r.moved}, cập nhật ${r.updated}.`),
            r.errors.length ? h('div', { class: 'notice red' }, r.errors.slice(0, 30).join('\n')) : h('div', { class: 'notice green' }, 'Không có lỗi.')) });
          await app.reloadBoot();
        } }] });
    } catch (e) { toast(e.message, 'err'); }
  }

  await load();
}
