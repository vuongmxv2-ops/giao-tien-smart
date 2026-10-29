import { h, options, field, toast, loading, errorBox, table, badge, fmtDate, fmtDateTime, askReason, modal, readSheetFile, mapColumns, devNote, confirmBox } from '../ui.js';
import { tieLabel } from './scores.js';

const ROLES = [{ value: 'ADMIN', label: 'Tổng phụ trách Đội (ADMIN)' }, { value: 'SCHOOL_LEADER', label: 'Ban giám hiệu' }, { value: 'YOUTH_COMMAND', label: 'Ban chỉ huy Liên đội' },
  { value: 'RED_STAR', label: 'Sao đỏ' }, { value: 'HOMEROOM_TEACHER', label: 'Giáo viên chủ nhiệm' }];
const EXTRA_PERMS = [['incident.review', 'Duyệt minh chứng'], ['incident.adjustTime', 'Điều chỉnh ngày giờ ghi nhận'], ['duty.manage', 'Phân công lịch trực'], ['notify.manage', 'Gửi thông báo'],
  ['appeal.manage', 'Xử lý phản hồi'], ['export.create', 'Xuất báo cáo'], ['score.lock', 'Khóa/mở khóa tuần']];
const RULE_COLS = { code: ['Mã lỗi', 'code'], name: ['Nội dung lỗi', 'Nội dung', 'name'], kind: ['Loại', 'Cộng/Trừ', 'kind'], points: ['Điểm', 'points'], scope_type: ['Phạm vi', 'scope_type'],
  scope_value: ['Giá trị phạm vi', 'scope_value'], effective_from: ['Hiệu lực từ', 'effective_from'], effective_to: ['Hiệu lực đến', 'effective_to'], note: ['Ghi chú', 'note'] };
const USER_COLS = { email: ['Email', 'email'], full_name: ['Họ và tên', 'Họ tên', 'full_name'], role: ['Vai trò', 'role'], campus_code: ['Cơ sở', 'campus_code'] };

/** TAB 12 – QUẢN TRỊ – CÀI ĐẶT */
export async function render(el, app) {
  const b = app.boot;
  let S;
  try { S = await app.call('admin.settings'); } catch (e) { return errorBox(el, e); }
  const sec = (title, fn, open) => { const body = h('div'); const d = h('details', { class: 'acc', open }, h('summary', {}, title), body); d.addEventListener('toggle', () => { if (d.open && !body.dataset.done) { body.dataset.done = 1; fn(body); } }); if (open) { body.dataset.done = 1; fn(body); } el.append(d); };

  sec('🎯 Điểm đầu kỳ, xếp loại, xếp hạng', scoreSettings, !S.starting_points || !S.tie_rule);
  sec('📚 Danh mục lỗi', typesSection);
  sec('📜 Nội quy – điểm cộng, điểm trừ (có phiên bản)', rulesSection);
  sec('👤 Tài khoản & phân quyền', usersSection);
  sec('🏫 Cơ sở trường', campusSection);
  sec('📅 Năm học, học kỳ, tuần thi đua', yearSection);
  sec('⚙️ Cài đặt khác', otherSettings);
  sec('📁 Google Drive & cơ sở dữ liệu', driveSection);
  sec('💾 Sao lưu – Phục hồi', backupSection);
  sec('🧾 Nhật ký chỉnh sửa', auditSection);
  sec('🤖 Cấu hình AI', aiSection);

  async function saveSettings(values) {
    const reason = await askReason('Lưu thay đổi cấu hình', { label: 'Lý do thay đổi (ghi vào nhật ký)' });
    if (!reason) return false;
    S = await app.call('admin.saveSettings', { values, reason });
    await app.reloadBoot(); toast('Đã lưu cấu hình', 'ok'); return true;
  }

  function scoreSettings(body) {
    const sp = h('input', { type: 'number', step: '0.5', value: S.starting_points, placeholder: 'Ví dụ theo mẫu tuần 7: 100' });
    const th = h('input', { type: 'text', value: S.grade_thresholds });
    const tie = h('select', {}, options([{ value: 'COMPETITION', label: tieLabel('COMPETITION') }, { value: 'DENSE', label: tieLabel('DENSE') }, { value: 'FEWER_VIOLATIONS', label: tieLabel('FEWER_VIOLATIONS') }], { selected: S.tie_rule, empty: '— Chưa chọn —' }));
    const top = h('input', { type: 'number', value: S.commend_top_n, min: 1 });
    const days = h('input', { type: 'text', value: S.school_days });
    body.append(
      !S.starting_points || !S.tie_rule ? h('div', { class: 'notice red' }, 'Bắt buộc cấu hình Điểm đầu kỳ và Quy tắc đồng hạng trước khi tính điểm. Hệ thống không tự đặt số điểm.') : '',
      field('Điểm đầu kỳ (mỗi tuần)', sp), field('Ngưỡng xếp loại (Nhãn:điểm tối thiểu; …; nhãn cuối không có điểm)', th, 'Mặc định lấy theo tệp mẫu tuần 7: A ≥ 100, B ≥ 95, C ≥ 80, còn lại D.'),
      field('Quy tắc xử lý đồng hạng', tie), field('Số lớp đề xuất tuyên dương', top), field('Ngày học trong tuần (5=T6, 1=T2…; theo thứ tự cột)', days),
      h('button', { class: 'btn primary', onclick: () => saveSettings({ starting_points: sp.value, grade_thresholds: th.value, tie_rule: tie.value, commend_top_n: top.value, school_days: days.value }) }, 'Lưu'));
  }

  function typesSection(body) {
    const draw = () => body.replaceChildren(h('div', { class: 'actions', style: 'margin-bottom:8px' }, h('button', { class: 'btn sm primary', onclick: () => editType() }, '＋ Thêm loại lỗi')),
      table([{ label: 'Mã', key: 'code' }, { label: 'Tên', key: 'name' }, { label: 'Loại', render: t => t.kind === 'CONG' ? h('span', { class: 'badge green' }, 'Cộng') : h('span', { class: 'badge red' }, 'Trừ') },
        { label: 'Điểm hiện hành', render: t => t.points == null ? h('span', { class: 'neg' }, 'Chưa có') : t.points, num: true }], app.boot.types, { onRow: editType }));
    function editType(t = {}) {
      const code = h('input', { type: 'text', value: t.code || '', disabled: !!t.type_id }), name = h('input', { type: 'text', value: t.name || '' });
      const kind = h('select', {}, options([{ value: 'TRU', label: 'Trừ điểm' }, { value: 'CONG', label: 'Cộng điểm' }], { selected: t.kind }));
      const status = h('select', {}, options([{ value: 'ACTIVE', label: 'Đang dùng' }, { value: 'INACTIVE', label: 'Ngừng dùng' }]));
      modal({ title: t.type_id ? 'Sửa loại lỗi' : 'Thêm loại lỗi', body: h('div', {}, field('Mã lỗi', code), field('Tên lỗi', name), field('Loại', kind), field('Trạng thái', status)),
        actions: [{ label: 'Hủy' }, { label: 'Lưu', kind: 'primary', onClick: async () => { await app.call('type.save', { type_id: t.type_id, code: code.value, name: name.value, kind: kind.value, status: status.value }); await app.reloadBoot(); draw(); toast('Đã lưu', 'ok'); } }] });
    }
    draw();
  }

  async function rulesSection(body) {
    const inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true });
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.value = ''; if (!f) return;
      try {
        const rows = mapColumns(await readSheetFile(f), RULE_COLS);
        if (!rows.length) return toast('Không đọc được dòng nào. Kiểm tra tiêu đề theo mẫu.', 'err');
        modal({ title: `Nhập ${rows.length} quy định từ ${f.name}`, wide: true, body: table(Object.keys(RULE_COLS).map(k => ({ label: k, key: k })), rows.slice(0, 12)),
          actions: [{ label: 'Hủy' }, { label: 'Nhập', kind: 'primary', onClick: async () => { const r = await app.call('rule.import', { rows }); toast(`Đã nhập ${r.created} quy định` + (r.errors.length ? `, ${r.errors.length} lỗi` : ''), r.errors.length ? 'warn' : 'ok', 8000); if (r.errors.length) modal({ title: 'Lỗi nhập', body: h('pre', { class: 'text' }, r.errors.join('\n')) }); await app.reloadBoot(); load(); } }] });
      } catch (e) { toast(e.message, 'err'); }
    });
    const load = async () => {
      loading(body);
      try {
        const rules = await app.call('rule.list');
        body.replaceChildren(h('div', { class: 'actions', style: 'margin-bottom:8px' }, h('button', { class: 'btn sm primary', onclick: () => inp.click() }, 'Nhập nội quy từ Excel'),
          h('a', { class: 'btn sm ghost', href: 'templates/mau_noi_quy.xlsx', download: '' }, 'Tải mẫu nội quy'), h('button', { class: 'btn sm', onclick: newRule }, '＋ Quy định mới / đổi điểm'), inp),
          h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Đổi điểm không sửa đè: hệ thống tạo phiên bản mới có ngày hiệu lực; tuần cũ giữ quy định tại thời điểm tính.'),
          table([{ label: 'Lỗi', key: 'type_name' }, { label: 'Loại', key: 'kind' }, { label: 'Điểm', key: 'points', num: true }, { label: 'Phạm vi', render: r => r.scope_type + (r.scope_value ? ': ' + r.scope_value : '') },
            { label: 'Hiệu lực', render: r => fmtDate(r.effective_from) + ' → ' + (r.effective_to ? fmtDate(r.effective_to) : 'nay') }, { label: 'PB', key: 'version', num: true }, { label: 'Trạng thái', render: r => badge(r.status) }, { label: 'Ghi chú', key: 'note' }], rules, { empty: 'Chưa có quy định điểm nào. Hãy nhập nội quy chính thức của nhà trường.' }));
      } catch (e) { errorBox(body, e, load); }
    };
    function newRule() {
      const t = h('select', {}, options(app.boot.types, { value: 'type_id', label: 'name' }));
      const p = h('input', { type: 'number', step: '0.5', min: 0 }), from = h('input', { type: 'date' }), note = h('input', { type: 'text' });
      const scope = h('select', {}, options([{ value: 'ALL', label: 'Toàn trường' }, { value: 'CAMPUS', label: 'Theo cơ sở' }, { value: 'GRADE', label: 'Theo khối' }]));
      const sv = h('input', { type: 'text', placeholder: 'Mã cơ sở (CS-GT/CS-HS) hoặc khối (6–9)' });
      modal({ title: 'Quy định điểm mới', body: h('div', {}, field('Loại lỗi', t), field('Số điểm (không dấu; dấu theo loại Cộng/Trừ)', p), field('Phạm vi', scope), field('Giá trị phạm vi', sv), field('Hiệu lực từ ngày', from), field('Căn cứ / ghi chú', note)),
        actions: [{ label: 'Hủy' }, { label: 'Lưu', kind: 'primary', onClick: async () => { await app.call('rule.save', { type_id: t.value, points: p.value, scope_type: scope.value, scope_value: sv.value, effective_from: from.value, note: note.value }); await app.reloadBoot(); load(); toast('Đã lưu phiên bản quy định mới', 'ok'); } }] });
    }
    load();
  }

  async function usersSection(body) {
    const inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true });
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.value = ''; if (!f) return;
      try { const rows = mapColumns(await readSheetFile(f), USER_COLS); const r = await app.call('admin.importUsers', { rows }); toast(`Tạo ${r.created} tài khoản` + (r.errors.length ? `, ${r.errors.length} lỗi` : ''), 'ok'); if (r.errors.length) modal({ title: 'Lỗi nhập', body: h('pre', { class: 'text' }, r.errors.join('\n')) }); load(); }
      catch (e) { toast(e.message, 'err'); }
    });
    const load = async () => {
      loading(body);
      try {
        const users = await app.call('admin.users');
        body.replaceChildren(h('div', { class: 'actions', style: 'margin-bottom:8px' }, h('button', { class: 'btn sm primary', onclick: () => edit() }, '＋ Thêm tài khoản'), h('button', { class: 'btn sm', onclick: () => inp.click() }, 'Nhập từ Excel'),
          h('a', { class: 'btn sm ghost', href: 'templates/mau_tai_khoan.xlsx', download: '' }, 'Tải mẫu'), inp),
          h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Đăng nhập bằng tài khoản Google; không có mật khẩu chung. Email không có trong danh sách sẽ bị từ chối.'),
          table([{ label: 'Họ tên', key: 'full_name' }, { label: 'Email', key: 'email' }, { label: 'Vai trò', key: 'role_label' },
            { label: 'Phạm vi', render: u => u.scopes.map(s => s.scope_type === 'PERM' ? '+' + s.scope_value : s.scope_type + ':' + s.scope_value).join(', ') || '—' },
            { label: 'Đăng nhập gần nhất', render: u => fmtDateTime(u.last_login_at) }, { label: 'Trạng thái', render: u => badge(u.status) },
            { label: '', render: u => h('button', { class: 'btn sm', onclick: async e => { e.stopPropagation(); const why = await askReason(u.status === 'ACTIVE' ? 'Khóa tài khoản ' + u.email : 'Mở khóa ' + u.email, { kind: u.status === 'ACTIVE' ? 'red' : 'primary' }); if (!why) return; try { await app.call('admin.setUserStatus', { user_id: u.user_id, status: u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE', reason: why }); load(); } catch (er) { toast(er.message, 'err'); } } }, u.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa') }], users, { onRow: edit }));
      } catch (e) { errorBox(body, e, load); }
    };
    function edit(u = { scopes: [] }) {
      const email = h('input', { type: 'email', value: u.email || '' }), name = h('input', { type: 'text', value: u.full_name || '' });
      const role = h('select', {}, options(ROLES, { selected: u.role || 'RED_STAR' }));
      const campusBoxes = app.boot.campuses.map(c => h('label', { style: 'display:block' }, h('input', { type: 'checkbox', value: c.campus_id, checked: u.scopes.some(s => s.scope_type === 'CAMPUS' && s.scope_value === c.campus_id) }), ' ' + c.name));
      const classSel = h('select', { multiple: true, style: 'min-height:120px' }, app.boot.classes.map(c => h('option', { value: c.class_id, selected: u.scopes.some(s => s.scope_type === 'CLASS' && s.scope_value === c.class_id) }, c.name)));
      const permBoxes = EXTRA_PERMS.map(([p, l]) => h('label', { style: 'display:block' }, h('input', { type: 'checkbox', value: p, checked: u.scopes.some(s => s.scope_type === 'PERM' && s.scope_value === p) }), ' ' + l));
      modal({ title: u.user_id ? 'Sửa tài khoản' : 'Thêm tài khoản', body: h('div', {}, field('Email Google', email), field('Họ và tên', name), field('Vai trò', role),
        field('Cơ sở được phân công (Sao đỏ/BCH)', h('div', {}, campusBoxes)), field('Lớp phụ trách (GVCN) – giữ Ctrl để chọn nhiều', classSel), field('Quyền bổ sung', h('div', {}, permBoxes))),
        actions: [{ label: 'Hủy' }, { label: 'Lưu', kind: 'primary', onClick: async () => {
          const scopes = [...campusBoxes.map(l => l.firstChild).filter(c => c.checked).map(c => ({ scope_type: 'CAMPUS', scope_value: c.value })),
            ...[...classSel.selectedOptions].map(o => ({ scope_type: 'CLASS', scope_value: o.value })),
            ...permBoxes.map(l => l.firstChild).filter(c => c.checked).map(c => ({ scope_type: 'PERM', scope_value: c.value }))];
          await app.call('admin.saveUser', { user_id: u.user_id, email: email.value, full_name: name.value, role: role.value, scopes }); toast('Đã lưu tài khoản', 'ok'); load();
        } }] });
    }
    load();
  }

  function campusSection(body) {
    body.append(table([{ label: 'Mã', key: 'code' }, { label: 'Tên', key: 'name' }], app.boot.campuses, { onRow: edit }), h('button', { class: 'btn sm', style: 'margin-top:8px', onclick: () => edit() }, '＋ Thêm cơ sở'));
    function edit(c = {}) {
      const code = h('input', { type: 'text', value: c.code || '' }), name = h('input', { type: 'text', value: c.name || '' });
      modal({ title: 'Cơ sở', body: h('div', {}, field('Mã', code), field('Tên', name)), actions: [{ label: 'Hủy' }, { label: 'Lưu', kind: 'primary', onClick: async () => { await app.call('campus.save', { campus_id: c.campus_id, code: code.value, name: name.value }); await app.reloadBoot(); toast('Đã lưu', 'ok'); } }] });
    }
  }

  function yearSection(body) {
    const y = app.boot.year || {};
    const name = h('input', { type: 'text', value: y.name || '' }), s = h('input', { type: 'date', value: y.start_date || '' }), e = h('input', { type: 'date', value: y.end_date || '' }), s1 = h('input', { type: 'date', value: y.semester1_end || '' });
    const ff = h('input', { type: 'date', value: app.boot.weeks[0]?.start_date || '' }), cnt = h('input', { type: 'number', value: app.boot.weeks.length || 35 }), sem = h('input', { type: 'number', value: app.boot.weeks.filter(w => String(w.semester) === '1').length || 18 });
    body.append(h('div', { class: 'grid c2' }, field('Năm học', name), field('Ngày bắt đầu', s), field('Kết thúc HK I', s1), field('Ngày kết thúc', e)),
      h('button', { class: 'btn sm primary', onclick: async () => { try { await app.call('year.save', { name: name.value, start_date: s.value, end_date: e.value, semester1_end: s1.value, make_current: true }); await app.reloadBoot(); toast('Đã lưu năm học', 'ok'); } catch (er) { toast(er.message, 'err'); } } }, 'Lưu năm học (đặt làm hiện tại)'),
      h('h3', {}, 'Tuần thi đua (thứ Sáu → thứ Năm)'),
      h('div', { class: 'grid c3' }, field('Thứ Sáu đầu tiên của tuần 1', ff), field('Số tuần', cnt), field('Số tuần học kỳ I', sem)),
      h('button', { class: 'btn sm', onclick: async () => { try { await app.call('week.generate', { first_friday: ff.value, count: cnt.value, semester1_weeks: sem.value }); await app.reloadBoot(); toast('Đã tạo danh sách tuần', 'ok'); } catch (er) { toast(er.message, 'err'); } } }, 'Tạo / cập nhật danh sách tuần'),
      table([{ label: 'Tuần', key: 'week_no', num: true }, { label: 'HK', key: 'semester', num: true }, { label: 'Từ (T6)', render: w => fmtDate(w.start_date) }, { label: 'Đến (T5)', render: w => fmtDate(w.end_date) }, { label: 'Trạng thái', render: w => badge(w.status) }], app.boot.weeks));
  }

  function otherSettings(body) {
    const sel = (k, opts) => h('select', { 'data-k': k }, options(opts, { selected: S[k] }));
    const yn = [{ value: '1', label: 'Có' }, { value: '0', label: 'Không' }];
    const ctrls = [
      ['Bắt buộc có ảnh minh chứng', sel('require_evidence', yn)],
      ['Khoảng thời gian phát hiện nghi trùng (phút)', h('input', { type: 'number', 'data-k': 'dup_window_minutes', value: S.dup_window_minutes })],
      ['Cho phép ghi nhận offline gửi trễ tối đa (giờ)', h('input', { type: 'number', 'data-k': 'offline_max_hours', value: S.offline_max_hours })],
      ['GVCN được xem bản ghi đang chờ duyệt của lớp', sel('homeroom_sees_pending', yn)],
      ['Ghi tên học sinh trong ghi chú Excel', sel('export_show_student_names', yn)],
      ['Tên trường', h('input', { type: 'text', 'data-k': 'school_name', value: S.school_name })]];
    body.append(...ctrls.map(([l, c]) => field(l, c)), h('button', { class: 'btn primary', onclick: () => saveSettings(Object.fromEntries(ctrls.map(([, c]) => [c.dataset.k, c.value]))) }, 'Lưu'));
  }

  function driveSection(body) {
    body.append(h('p', {}, 'Toàn bộ dữ liệu nằm trong Google Drive của tài khoản đã triển khai Apps Script. Thư mục không chia sẻ công khai; ảnh chỉ được trả qua API sau khi kiểm tra quyền.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn sm', href: S._root_folder_url, target: '_blank', rel: 'noopener' }, 'Mở thư mục GIAO_TIEN_SMART'), h('a', { class: 'btn sm', href: S._spreadsheet_url, target: '_blank', rel: 'noopener' }, 'Mở Google Sheets CSDL')),
      h('div', { class: 'small muted', style: 'margin-top:8px' }, 'Đổi thư mục gốc: sửa SETUP.ROOT_FOLDER_ID trong Setup.gs rồi chạy lại setup(). GOOGLE_CLIENT_ID: ' + (S._client_id_set ? 'đã cấu hình' : 'CHƯA cấu hình')));
  }

  function backupSection(body) {
    const hour = h('select', {}, options([{ value: '', label: 'Tắt sao lưu tự động' }, ...[...Array(24).keys()].map(x => ({ value: x, label: `Hằng ngày lúc ${x}h` }))], { selected: S.backup_hour }));
    const list = h('div');
    const load = async () => { loading(list); try { const rows = await app.call('backup.list'); list.replaceChildren(table([{ label: 'Bản sao lưu', key: 'name' }, { label: 'Tạo lúc', render: r => fmtDateTime(r.created) }, { label: '', render: r => h('button', { class: 'btn sm red', onclick: () => restore(r) }, 'Phục hồi') }], rows, { empty: 'Chưa có bản sao lưu.' })); } catch (e) { errorBox(list, e, load); } };
    body.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: async () => { try { const r = await app.call('backup.run', {}, { timeout: 180000 }); toast('Đã sao lưu: ' + r.name, 'ok'); load(); } catch (e) { toast(e.message, 'err'); } } }, 'Sao lưu ngay')),
      field('Lịch sao lưu tự động', hour), h('button', { class: 'btn sm', onclick: async () => { try { toast(await app.call('backup.schedule', { hour: hour.value }), 'ok'); } catch (e) { toast(e.message, 'err'); } } }, 'Lưu lịch'), list);
    async function restore(r) {
      const ok = await confirmBox('Phục hồi dữ liệu', `Toàn bộ dữ liệu hiện tại (trừ nhật ký) sẽ được thay bằng bản "${r.name}". Hệ thống tự sao lưu hiện trạng trước khi phục hồi.`, 'Tiếp tục', 'red');
      if (!ok) return;
      const reason = await askReason('Lý do phục hồi', { min: 5, kind: 'red' }); if (!reason) return;
      const confirm = prompt('Gõ PHUC HOI để xác nhận');
      try { const x = await app.call('backup.restore', { file_id: r.file_id, reason, confirm }, { timeout: 300000 }); toast('Đã phục hồi: ' + x.restored.length + ' bảng', 'ok', 8000); await app.reloadBoot(); } catch (e) { toast(e.message, 'err'); }
    }
    load();
  }

  function auditSection(body) {
    const q = h('input', { type: 'search', placeholder: 'Lọc theo thao tác, ví dụ: incident.approve' });
    const list = h('div');
    const load = async () => { loading(list); try { const r = await app.call('admin.audit', { action: q.value.trim(), limit: 150 }); list.replaceChildren(h('div', { class: 'small muted' }, r.total + ' mục'), table([{ label: 'Lúc', render: l => fmtDateTime(l.at) }, { label: 'Người', key: 'user_name' }, { label: 'Thao tác', key: 'action' }, { label: 'Đối tượng', render: l => l.entity + ' ' + l.entity_id }, { label: 'Lý do', key: 'reason' }], r.items, { onRow: l => modal({ title: l.action, wide: true, body: h('div', {}, h('h3', {}, 'Trước'), h('pre', { class: 'text' }, l.before_json || '—'), h('h3', {}, 'Sau'), h('pre', { class: 'text' }, l.after_json || '—')) }) })); } catch (e) { errorBox(list, e, load); } };
    q.addEventListener('change', load);
    body.append(q, list); load();
  }

  function aiSection(body) {
    const en = h('select', {}, options([{ value: '0', label: 'Tắt (mặc định)' }, { value: '1', label: 'Bật' }], { selected: S.ai_enabled }));
    const purpose = h('textarea', { placeholder: 'Mục đích xử lý dữ liệu, phạm vi dữ liệu được gửi, người phê duyệt…' }, S.ai_purpose || '');
    body.append(h('div', { class: 'notice yellow' }, devNote(), ' Kết nối dịch vụ AI bên ngoài chưa được xây dựng. Ứng dụng hoạt động đầy đủ khi AI tắt. Khi phát triển: chỉ gửi số liệu tổng hợp, không gửi ảnh hay thông tin nhận dạng học sinh nếu chưa được phê duyệt; khóa API lưu ở Script Properties, không đặt ở giao diện.'),
      field('Trạng thái', en), field('Mục đích & phê duyệt', purpose), h('button', { class: 'btn', onclick: () => saveSettings({ ai_enabled: en.value, ai_purpose: purpose.value }) }, 'Lưu'));
  }
}
