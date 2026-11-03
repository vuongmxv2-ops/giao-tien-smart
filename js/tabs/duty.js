import { h, options, field, toast, loading, errorBox, table, badge, fmtDate, wdLabel, addDays, todayKey, askReason, modal, readSheetFile, mapColumns, fold, lib, download } from '../ui.js';

const TASKS = [{ value: 'TRUC_CONG', label: 'Trực cổng' }, { value: 'TRUY_BAI', label: 'Kiểm tra truy bài' }, { value: 'NE_NEP', label: 'Kiểm tra nề nếp' }];
const taskName = v => (TASKS.find(t => t.value === v) || {}).label || v;

/** TAB 4 – LỊCH TRỰC BAN */
export async function render(el, app) {
  const b = app.boot, manage = app.can('duty.manage');
  const sessions = b.settings.duty_sessions || [];
  const fMode = h('select', {}, options([{ value: 'week', label: 'Bảng trực tuần' }, { value: 'month', label: 'Bảng trực tháng' }, { value: 'stats', label: 'Thống kê số buổi trực' }]));
  const fRef = h('input', { type: 'date', value: todayKey() });
  const fCampus = h('select', {}, options(b.campuses, { value: 'campus_id', label: 'name', empty: 'Tất cả cơ sở' }));
  el.append(h('div', { class: 'filters' }, field('Chế độ xem', fMode), field('Ngày tham chiếu', fRef), field('Cơ sở', fCampus)));
  let staff = [];
  if (manage) {
    try { staff = await app.call('admin.staff', { roles: ['RED_STAR', 'YOUTH_COMMAND'] }); } catch { staff = []; }
    const inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true });
    inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) importExcel(f); });
    el.append(h('div', { class: 'actions', style: 'margin-bottom:12px' },
      h('button', { class: 'btn primary', onclick: () => editDuty() }, '＋ Phân công trực'),
      h('button', { class: 'btn', onclick: () => inp.click() }, '📥 Nhập lịch từ Excel'),
      h('button', { class: 'btn ghost', onclick: downloadTemplate }, '📄 Tải mẫu Excel'), inp));
  }
  const body = h('div'); el.append(body);
  [fMode, fRef, fCampus].forEach(x => x.addEventListener('change', load));

  function period() {
    const ref = fRef.value || todayKey();
    if (fMode.value === 'month') { const m = ref.substr(0, 7); const end = addDays(addDays(m + '-01', 32).substr(0, 7) + '-01', -1); return { from: m + '-01', to: end }; }
    const p = ref.split('-'), wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
    const mon = addDays(ref, -((wd + 6) % 7));
    return { from: mon, to: addDays(mon, 6) };
  }

  async function load() {
    loading(body);
    try {
      const p = period();
      if (fMode.value === 'stats') {
        const rows = await app.call('duty.stats', { from: p.from.substr(0, 4) + '-01-01', to: p.to.substr(0, 4) + '-12-31' });
        body.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Số buổi trực trong năm ' + p.from.substr(0, 4)),
          table([{ label: 'Họ tên', key: 'user_name' }, { label: 'Vai trò', render: r => r.role === 'RED_STAR' ? 'Sao đỏ' : 'BCH Liên đội' },
            { label: 'Được phân công', key: 'assigned', num: true }, { label: 'Hoàn thành', key: 'done', num: true }], rows)));
        return;
      }
      const rows = await app.call('duty.list', { from: p.from, to: p.to, campus_id: fCampus.value });
      draw(rows, p);
    } catch (e) { errorBox(body, e, load); }
  }

  function draw(rows, p) {
    body.replaceChildren();
    const mine = rows.filter(r => r.user_id === app.user.user_id && r.status !== 'HOAN_THANH');
    if (mine.length) {
      body.append(h('div', { class: 'card' }, h('h2', {}, '🧭 Nhiệm vụ của tôi'), h('div', { class: 'list' }, mine.map(r => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('b', {}, `${wdLabel(r.duty_date)} ${fmtDate(r.duty_date)} – ${sessionName(r.session)}`), h('div', { class: 'small muted' }, r.task_name + ' · ' + app.campusName(r.campus_id) + (r.note ? ' · ' + r.note : ''))),
        h('button', { class: 'btn sm green', onclick: async () => { try { await app.call('duty.complete', { duty_id: r.duty_id }); toast('Đã đánh dấu hoàn thành', 'ok'); load(); } catch (e) { toast(e.message, 'err'); } } }, 'Hoàn thành'))))));
    }
    const days = [];
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) days.push(d);
    const card = h('div', { class: 'card' }, h('h2', {}, `Lịch trực ${fmtDate(p.from)} – ${fmtDate(p.to)}`));
    const list = h('div', { class: 'list' });
    days.forEach(d => {
      const items = rows.filter(r => r.duty_date === d);
      if (!items.length && fMode.value === 'month') return;
      list.append(h('div', { class: 'item' }, h('div', { style: 'width:96px;flex:none' }, h('b', {}, wdLabel(d)), h('div', { class: 'small muted' }, fmtDate(d))),
        h('div', { class: 'grow' }, items.length ? items.map(r => h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px' },
          h('span', { class: 'badge blue' }, sessionName(r.session)), h('span', {}, `${r.task_name}: `, h('b', {}, r.user_name)), h('span', { class: 'small muted' }, app.campusName(r.campus_id)), badge(r.status),
          manage ? h('button', { class: 'btn ghost sm', onclick: () => editDuty(r) }, 'Sửa') : '',
          manage ? h('button', { class: 'btn ghost sm', onclick: () => swap(r) }, 'Đổi lịch') : '',
          manage ? h('button', { class: 'btn ghost sm', onclick: async () => { const why = await askReason('Xóa lịch trực', { okLabel: 'Xóa', kind: 'red' }); if (!why) return; await app.call('duty.delete', { duty_id: r.duty_id, reason: why }); load(); } }, 'Xóa') : ''))
          : h('span', { class: 'small muted' }, 'Chưa phân công'))));
    });
    card.append(list.children.length ? list : h('div', { class: 'empty' }, 'Không có lịch trực trong khoảng này.'));
    body.append(card);
  }

  function sessionName(code) { return (sessions.find(s => s.code === code) || {}).name || code; }

  function editDuty(r = {}) {
    const fd = h('input', { type: 'date', value: r.duty_date || fRef.value });
    const fs = h('select', {}, options(sessions, { value: 'code', label: 'name', selected: r.session }));
    const fc = h('select', {}, options(b.campuses, { value: 'campus_id', label: 'name', selected: r.campus_id || fCampus.value }));
    const ft = h('select', {}, options(TASKS, { selected: r.task }));
    const fu = h('select', {}, options(staff, { value: 'user_id', label: s => `${s.full_name} (${s.role === 'RED_STAR' ? 'Sao đỏ' : 'BCH'})`, selected: r.user_id }));
    const fn = h('input', { type: 'text', value: r.note || '' });
    const repeat = h('select', {}, options([{ value: 0, label: 'Chỉ ngày này' }, { value: 4, label: 'Lặp lại 4 tuần' }, { value: 8, label: 'Lặp lại 8 tuần' }]));
    modal({ title: r.duty_id ? 'Sửa lịch trực' : 'Phân công trực', body: h('div', {}, field('Ngày', fd), field('Buổi', fs), field('Cơ sở', fc), field('Nhiệm vụ', ft), field('Người trực', fu), field('Ghi chú', fn), r.duty_id ? '' : field('Lặp lại', repeat)),
      actions: [{ label: 'Hủy' }, { label: 'Lưu', kind: 'primary', onClick: async () => {
        const n = Number(repeat.value) || 1;
        const items = [];
        for (let i = 0; i < (r.duty_id ? 1 : n); i++) items.push({ duty_id: r.duty_id, duty_date: addDays(fd.value, i * 7), session: fs.value, campus_id: fc.value, task: ft.value, user_id: fu.value, note: fn.value });
        await app.call('duty.save', { items }); toast('Đã lưu lịch trực', 'ok'); load();
      } }] });
  }

  /* ---------- NHẬP LỊCH TRỰC TỪ EXCEL ---------- */
  const COLS = { date: ['Ngày', 'Ngày trực', 'date'], session: ['Buổi', 'session'], campus: ['Cơ sở', 'Khu', 'campus'], task: ['Nhiệm vụ', 'task'],
    person: ['Người trực', 'Họ tên', 'Họ và tên', 'Email', 'person'], note: ['Ghi chú', 'note'] };
  const roleLabel = s => s.role === 'RED_STAR' ? 'Sao đỏ' : s.role === 'YOUTH_COMMAND' ? 'BCH Liên đội' : 'Tổng phụ trách';

  /** Ngày: số ngày Excel, dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd. */
  function parseDate(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }

  function matchSession(v) {
    const f = fold(v).replace(/^buoi\s*/, '').trim();
    if (!f && sessions.length) return sessions[0].code;
    return (sessions.find(s => fold(s.name) === f || fold(s.code) === f) || {}).code || '';
  }
  function matchCampus(v) {
    const f = fold(v).trim();
    if (!f) return b.campuses.length === 1 ? b.campuses[0].campus_id : '';
    // Khớp mã (GT/HS), mã cơ sở, tên đầy đủ hoặc phần tên riêng ("Giao Tiến", "Hoành Sơn")
    const core = c => fold(c.name).replace(/^(co so|phan hieu|khu)\s*/, '').trim();
    return (b.campuses.find(c => fold(c.code) === f || fold(c.campus_id) === f || fold(c.name) === f || (core(c) && (f.includes(core(c)) || core(c).includes(f)))) || {}).campus_id || '';
  }
  function matchTask(v) {
    const f = fold(v);
    if (!f) return '';
    const t = TASKS.find(x => fold(x.label) === f || fold(x.value) === f);
    if (t) return t.value;
    if (f.includes('cong')) return 'TRUC_CONG';
    if (f.includes('truy bai')) return 'TRUY_BAI';
    if (f.includes('ne nep')) return 'NE_NEP';
    return '';
  }
  function matchUser(v) {
    const raw = String(v || '').trim(), f = fold(raw);
    if (!f) return { err: 'Thiếu người trực' };
    const byMail = staff.find(s => String(s.email || '').toLowerCase() === raw.toLowerCase());
    if (byMail) return { user: byMail };
    const hits = staff.filter(s => fold(s.full_name) === f);
    if (hits.length === 1) return { user: hits[0] };
    if (hits.length > 1) return { err: 'Có ' + hits.length + ' người trùng tên – hãy ghi email' };
    return { err: 'Không tìm thấy tài khoản "' + raw + '" (cần được cấp tài khoản Sao đỏ/BCH)' };
  }

  async function importExcel(file) {
    let rows;
    try { rows = mapColumns(await readSheetFile(file, { raw: true }), COLS); }
    catch (e) { return toast('Không đọc được tệp: ' + e.message, 'err'); }
    if (!rows.length) return toast('Không đọc được dòng nào. Kiểm tra tiêu đề cột theo mẫu (Ngày, Buổi, Cơ sở, Nhiệm vụ, Người trực).', 'err', 7000);
    const checked = rows.map((r, i) => {
      const it = { line: i + 2, raw: r, errs: [] };
      it.duty_date = parseDate(r.date); if (!it.duty_date) it.errs.push('Ngày không hợp lệ');
      it.session = matchSession(r.session); if (!it.session) it.errs.push('Buổi không hợp lệ (Sáng/Chiều)');
      it.campus_id = matchCampus(r.campus); if (!it.campus_id) it.errs.push('Cơ sở không hợp lệ');
      it.task = matchTask(r.task); if (!it.task) it.errs.push('Nhiệm vụ không hợp lệ');
      const u = matchUser(r.person); if (u.err) it.errs.push(u.err); else it.user = u.user;
      it.note = String(r.note || '').trim();
      return it;
    });
    // Trùng trong tệp và trùng với lịch đã có (cùng người, cùng ngày, cùng buổi)
    const ok = checked.filter(x => !x.errs.length);
    if (ok.length) {
      const dates = ok.map(x => x.duty_date).sort();
      let existing = [];
      try { existing = await app.call('duty.list', { from: dates[0], to: dates[dates.length - 1] }); } catch { /* bỏ qua, máy chủ vẫn kiểm tra */ }
      const seen = new Set(existing.map(d => `${d.duty_date}|${d.session}|${d.user_id}`));
      ok.forEach(x => {
        const k = `${x.duty_date}|${x.session}|${x.user.user_id}`;
        if (seen.has(k)) x.errs.push('Người này đã có lịch trực buổi này'); else seen.add(k);
      });
    }
    const good = checked.filter(x => !x.errs.length), bad = checked.length - good.length;
    const preview = table([{ label: 'Dòng', key: 'line', num: true },
      { label: 'Ngày', render: x => x.duty_date ? `${wdLabel(x.duty_date)} ${fmtDate(x.duty_date)}` : String(x.raw.date || '') },
      { label: 'Buổi', render: x => x.session ? sessionName(x.session) : String(x.raw.session || '') },
      { label: 'Cơ sở', render: x => x.campus_id ? app.campusName(x.campus_id) : String(x.raw.campus || '') },
      { label: 'Nhiệm vụ', render: x => x.task ? taskName(x.task) : String(x.raw.task || '') },
      { label: 'Người trực', render: x => x.user ? `${x.user.full_name} (${roleLabel(x.user)})` : String(x.raw.person || '') },
      { label: 'Kiểm tra', render: x => x.errs.length ? h('span', { class: 'neg' }, '✖ ' + x.errs.join('; ')) : h('span', { class: 'pos' }, '✔ Hợp lệ') }], checked);
    modal({ title: `Nhập lịch trực từ ${file.name}`, wide: true, body: h('div', {},
      h('div', { class: 'notice ' + (bad ? 'yellow' : 'green') }, `${good.length} dòng hợp lệ` + (bad ? `, ${bad} dòng có lỗi (sẽ bỏ qua – sửa trong Excel rồi nhập lại)` : '') + '. Người trực sẽ nhận thông báo lịch mới.'), preview),
      actions: [{ label: 'Hủy' }, { label: `Nhập ${good.length} dòng hợp lệ`, kind: 'primary', onClick: async () => {
        if (!good.length) { toast('Không có dòng hợp lệ để nhập.', 'err'); return false; }
        let done = 0;
        try {
          for (let i = 0; i < good.length; i += 40) {
            const part = good.slice(i, i + 40).map(x => ({ duty_date: x.duty_date, session: x.session, campus_id: x.campus_id, task: x.task, user_id: x.user.user_id, note: x.note }));
            await app.call('duty.save', { items: part }, { timeout: 120000 });
            done += part.length;
          }
          toast(`✔ Đã nhập ${done} buổi trực`, 'ok', 5000);
        } catch (e) { toast(`Đã nhập ${done}/${good.length} buổi. Dừng do lỗi: ${e.message}`, 'err', 9000); }
        if (good[0]) { fRef.value = good[0].duty_date; }
        load();
      } }] });
  }

  async function downloadTemplate() {
    try {
      const X = await lib('XLSX');
      const mon = (() => { const t = todayKey(), p = t.split('-'), wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); return addDays(t, 7 - ((wd + 6) % 7)); })();
      const vn = k => k.split('-').reverse().join('/');
      const people = staff.length ? staff : [{ full_name: 'Nguyễn Văn A', email: 'vidu@gmail.com', role: 'RED_STAR' }];
      const camp = b.campuses[0]?.name || 'Cơ sở Giao Tiến';
      const sample = [0, 1, 2, 3, 4].flatMap((d, i) => [
        [vn(addDays(mon, d)), sessions[0]?.name || 'Sáng', camp, 'Trực cổng', people[(i * 2) % people.length].full_name, ''],
        [vn(addDays(mon, d)), sessions[0]?.name || 'Sáng', camp, 'Kiểm tra truy bài', people[(i * 2 + 1) % people.length].full_name, '']]);
      const ws = X.utils.aoa_to_sheet([['Ngày', 'Buổi', 'Cơ sở', 'Nhiệm vụ', 'Người trực', 'Ghi chú'], ...sample]);
      ws['!cols'] = [{ wch: 13 }, { wch: 8 }, { wch: 22 }, { wch: 20 }, { wch: 28 }, { wch: 24 }];
      for (let r = 1; r <= sample.length; r++) { const c = ws['A' + (r + 1)]; if (c) { c.t = 's'; c.z = '@'; } }
      const ref = X.utils.aoa_to_sheet([['Người trực (Họ tên)', 'Email', 'Vai trò'], ...people.map(s => [s.full_name, s.email || '', roleLabel(s)]), [],
        ['Buổi hợp lệ', sessions.map(s => s.name).join(', ')], ['Nhiệm vụ hợp lệ', TASKS.map(t => t.label).join(', ')],
        ['Cơ sở hợp lệ', b.campuses.map(c => c.name + ' (' + c.code + ')').join(', ')],
        ['Ngày', 'Ghi dạng dd/mm/yyyy, ví dụ 10/11/2026'], ['Trùng tên', 'Nếu hai người trùng họ tên, ghi email vào cột "Người trực"']]);
      ref['!cols'] = [{ wch: 28 }, { wch: 34 }, { wch: 16 }];
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, 'Lich_truc'); X.utils.book_append_sheet(wb, ref, 'Huong_dan');
      download(new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'MAU_LICH_TRUC.xlsx');
    } catch (e) { toast('Không tạo được tệp mẫu: ' + e.message, 'err'); }
  }

  async function swap(r) {
    const fu = h('select', {}, options(staff.filter(s => s.user_id !== r.user_id), { value: 'user_id', label: 'full_name' }));
    const reason = h('input', { type: 'text', placeholder: 'Lý do đổi lịch' });
    modal({ title: 'Đổi lịch trực', body: h('div', {}, h('p', {}, `${fmtDate(r.duty_date)} – ${r.task_name} – ${r.user_name}`), field('Chuyển cho', fu), field('Lý do', reason)),
      actions: [{ label: 'Hủy' }, { label: 'Đổi lịch', kind: 'primary', onClick: async () => { await app.call('duty.swap', { duty_id: r.duty_id, to_user_id: fu.value, reason: reason.value }); toast('Đã đổi lịch', 'ok'); load(); } }] });
  }

  await load();
}
