import { h, options, field, toast, loading, errorBox, table, badge, fmtDate, wdLabel, addDays, todayKey, askReason, modal } from '../ui.js';

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
    el.append(h('div', { class: 'actions', style: 'margin-bottom:12px' }, h('button', { class: 'btn primary', onclick: () => editDuty() }, '＋ Phân công trực')));
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

  async function swap(r) {
    const fu = h('select', {}, options(staff.filter(s => s.user_id !== r.user_id), { value: 'user_id', label: 'full_name' }));
    const reason = h('input', { type: 'text', placeholder: 'Lý do đổi lịch' });
    modal({ title: 'Đổi lịch trực', body: h('div', {}, h('p', {}, `${fmtDate(r.duty_date)} – ${r.task_name} – ${r.user_name}`), field('Chuyển cho', fu), field('Lý do', reason)),
      actions: [{ label: 'Hủy' }, { label: 'Đổi lịch', kind: 'primary', onClick: async () => { await app.call('duty.swap', { duty_id: r.duty_id, to_user_id: fu.value, reason: reason.value }); toast('Đã đổi lịch', 'ok'); load(); } }] });
  }

  await load();
}
