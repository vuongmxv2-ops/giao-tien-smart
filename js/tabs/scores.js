import { h, options, field, toast, loading, errorBox, badge, fmtDate, wdShort, signed, askReason, modal, table, fmtDateTime } from '../ui.js';

/** TAB 6 – BẢNG ĐIỂM THI ĐUA (chu kỳ thứ Sáu → thứ Năm) */
export async function render(el, app, params) {
  const b = app.boot;
  const fWeek = h('select', {}, options(b.weeks, { value: 'week_id', label: w => app.weekLabel(w) + (w.status === 'LOCKED' ? ' 🔒' : ''), selected: params.week_id || b.current_week?.week_id }));
  const fCampus = h('select', {}, options(b.campuses, { value: 'campus_id', label: 'name', empty: 'Toàn trường' }));
  const fGrade = h('select', {}, options([6, 7, 8, 9].map(g => ({ value: g, label: 'Khối ' + g })), { empty: 'Tất cả khối' }));
  const fGroup = h('select', {}, options(app.groups(), { empty: 'Tất cả nhóm thi đua' }));
  el.append(h('div', { class: 'filters' }, field('Tuần', fWeek), field('Nhóm thi đua', fGroup), field('Cơ sở', fCampus), field('Khối', fGrade)));
  const bar = h('div', { class: 'actions no-print', style: 'margin-bottom:12px' });
  const body = h('div');
  el.append(bar, body);
  [fWeek, fGroup, fCampus, fGrade].forEach(x => x.addEventListener('change', load));
  let data = null;

  async function load() {
    loading(body);
    try { data = await app.call('score.week', { week_id: fWeek.value, comp_group: fGroup.value, campus_id: fCampus.value, grade: fGrade.value }); draw(); }
    catch (e) { errorBox(body, e, load); }
  }

  function draw() {
    const d = data, w = d.week, locked = w.status === 'LOCKED';
    bar.replaceChildren(
      h('button', { class: 'btn primary', onclick: () => { load(); toast('Đã tính lại từ các bản ghi đã duyệt', 'ok'); } }, '🔄 Tính điểm'),
      app.can(['score.lock', 'incident.review']) ? h('button', { class: 'btn', onclick: check }, '🔍 Kiểm tra dữ liệu') : '',
      app.can('score.lock') && !locked ? h('button', { class: 'btn green', onclick: lock }, '🔒 Khóa tuần') : '',
      app.can('score.lock') && locked ? h('button', { class: 'btn yellow', onclick: unlock }, '🔓 Mở khóa có lý do') : '',
      app.can('export.create') ? h('button', { class: 'btn', onclick: () => app.nav('xuat', { week_id: w.week_id, campus_id: fCampus.value, comp_group: fGroup.value, kind: 'BASIC' }) }, '📄 Xuất Excel') : '',
      app.can('export.create') ? h('button', { class: 'btn', onclick: () => app.nav('xuat', { week_id: w.week_id, campus_id: fCampus.value, comp_group: fGroup.value, kind: 'COMMENT_IMAGES' }) }, '🖼️ Xuất Excel kèm ảnh Comment') : '',
      h('button', { class: 'btn ghost', onclick: () => print() }, '🖨️ In / PDF'));
    body.replaceChildren();
    body.append(h('div', { class: 'card' },
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, h('b', {}, app.weekLabel(w)), badge(w.status), locked ? h('span', { class: 'small muted' }, `Bản chính thức phiên bản ${w.current_version}, khóa lúc ${fmtDateTime(w.locked_at)}`) : h('span', { class: 'small muted' }, 'Điểm tạm tính – thay đổi khi có bản ghi được duyệt')),
      h('div', { class: 'small muted', style: 'margin-top:6px' }, `Điểm cuối tuần = Điểm đầu kỳ (${d.starting_points || 'chưa cấu hình'}) + Tổng cộng − Tổng trừ. Chỉ tính bản ghi đã duyệt. Xếp loại: ${d.thresholds}. Đồng hạng: ${tieLabel(d.tie_rule)}.`),
      d.pending ? h('div', { class: 'notice yellow' }, `${d.pending} bản ghi của tuần đang chờ duyệt / bổ sung – chưa được tính.`, ' ', app.can('incident.review') ? h('button', { class: 'btn sm', onclick: () => app.nav('duyet') }, 'Đi duyệt') : '') : '',
      w.unlock_reason && !locked ? h('div', { class: 'notice yellow' }, 'Tuần đã được mở khóa. Lý do: ' + w.unlock_reason) : ''));
    const cols = [{ label: 'STT', render: (r, i) => i + 1, num: true }, { label: 'Lớp', render: r => h('b', {}, r.class_name) }, ...(app.groups().length ? [{ label: 'Nhóm', key: 'comp_group' }] : []), { label: 'Điểm ban đầu', key: 'starting_points', num: true }];
    d.days.forEach(day => cols.push({ label: `${wdShort(day)} ${fmtDate(day).substr(0, 5)}`, num: true, render: r => {
      const x = r.daily[day]; if (!x) return '';
      return h('span', {}, x.bonus ? h('span', { class: 'pos' }, '+' + x.bonus) : '', x.bonus && x.deduct ? ' ' : '', x.deduct ? h('span', { class: 'neg' }, '−' + x.deduct) : '');
    } }));
    cols.push({ label: 'Cộng', render: r => h('span', { class: 'pos' }, r.bonus_points ? '+' + r.bonus_points : '0'), num: true },
      { label: 'Trừ', render: r => h('span', { class: 'neg' }, r.deducted_points ? '−' + r.deducted_points : '0'), num: true },
      { label: 'Tổng điểm', render: r => h('b', {}, r.final_points), num: true }, { label: 'Xếp loại', key: 'grade_label' },
      { label: app.groups().length ? 'Xếp thứ (trong nhóm)' : 'Xếp thứ', render: r => h('b', {}, r.rank), num: true },
      { label: 'Minh chứng', render: r => h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); explain(r); } }, (r.violation_count || 0) + ' lỗi · Xem') });
    const rows = d.rows.slice().sort((a, c) => d.full ? 0 : a.rank - c.rank);
    body.append(table(cols, rows, { onRow: explain, empty: 'Không có lớp nào trong phạm vi.' }));
    if (d.versions.length) body.append(h('div', { class: 'small muted', style: 'margin-top:8px' }, 'Các phiên bản chính thức đã lưu: ' + d.versions.map(v => 'v' + v).join(', ') + '. Mọi lần mở khóa/khóa lại đều được ghi nhật ký.'));
  }

  async function explain(r) {
    try {
      const x = await app.call('score.explain', { week_id: data.week.week_id, class_id: r.class_id });
      modal({ title: `Giải thích điểm lớp ${r.class_name} – ${app.weekLabel(data.week)}`, wide: true, body: h('div', {},
        h('p', {}, `Điểm đầu kỳ ${x.starting_points} + cộng ${r.bonus_points} − trừ ${r.deducted_points} = `, h('b', {}, r.final_points)),
        table([{ label: 'Ngày', render: t => fmtDate(t.occurred_date) }, { label: 'Nội dung', key: 'type_name' }, { label: 'Điểm', render: t => h('span', { class: t.signed_points < 0 ? 'neg' : 'pos' }, signed(t.signed_points)), num: true },
          { label: 'Trạng thái', render: t => badge(t.status) }, { label: 'Ảnh', key: 'evidence_count', num: true }, { label: 'Người duyệt', key: 'created_by' }, { label: 'Ghi chú', key: 'reason' }, { label: 'Mã bản ghi', key: 'incident_id' }], x.items,
          { empty: 'Không có giao dịch điểm nào trong tuần.' }),
        h('div', { class: 'small muted' }, 'Giao dịch "Đã hủy" là các lần điều chỉnh/hủy duyệt, không được tính – giữ lại để truy vết.')) });
    } catch (e) { toast(e.message, 'err'); }
  }

  async function check() {
    try {
      const c = await app.call('score.check', { week_id: data.week.week_id });
      modal({ title: 'Kiểm tra dữ liệu ' + app.weekLabel(c.week), body: h('div', {},
        h('p', {}, `${c.approved} giao dịch điểm hợp lệ.`),
        c.issues.length ? h('div', {}, c.issues.map(i => h('div', { class: 'notice ' + (i.level === 'error' ? 'red' : 'yellow') }, i.text))) : h('div', { class: 'notice green' }, 'Không phát hiện vấn đề. Có thể khóa tuần.')) });
    } catch (e) { toast(e.message, 'err'); }
  }

  async function lock() {
    try {
      const c = await app.call('score.check', { week_id: data.week.week_id });
      const errs = c.issues.filter(i => i.level === 'error');
      if (errs.length) return modal({ title: 'Chưa thể khóa tuần', body: h('div', {}, errs.map(i => h('div', { class: 'notice red' }, i.text))) });
      const reason = await askReason('Khóa bảng điểm ' + app.weekLabel(c.week), {
        label: 'Ghi chú khóa tuần', min: c.issues.length ? 3 : 0, okLabel: 'Khóa tuần', kind: 'green',
        extra: h('div', {}, h('p', {}, 'Khi khóa, hệ thống lưu bản điểm chính thức. Thay đổi sau đó phải mở khóa có lý do và tạo phiên bản mới.'), ...c.issues.map(i => h('div', { class: 'notice yellow' }, i.text))) });
      if (reason === null) return;
      await app.call('score.lock', { week_id: c.week.week_id, reason, confirm_warnings: true });
      toast('Đã khóa tuần và lưu bản điểm chính thức', 'ok');
      await app.reloadBoot(); load();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function unlock() {
    const reason = await askReason('Mở khóa ' + app.weekLabel(data.week), { label: 'Lý do mở khóa (ví dụ: giải quyết phản hồi của GVCN)', min: 5, kind: 'yellow' });
    if (!reason) return;
    try { await app.call('score.unlock', { week_id: data.week.week_id, reason }); toast('Đã mở khóa. Hãy khóa lại sau khi điều chỉnh để tạo phiên bản mới.', 'warn', 7000); await app.reloadBoot(); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  await load();
}

export function tieLabel(t) {
  return { COMPETITION: 'cùng điểm cùng hạng, hạng sau bỏ trống (1,1,3)', DENSE: 'cùng điểm cùng hạng, hạng sau liền kề (1,1,2)', FEWER_VIOLATIONS: 'cùng điểm thì lớp ít vi phạm hơn xếp trên' }[t] || 'CHƯA CẤU HÌNH';
}
