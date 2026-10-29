import { h, options, field, loading, errorBox, table, fmtDate, wdShort } from '../ui.js';
import { chart } from '../charts.js';

/** TAB 1 – TỔNG QUAN */
export async function render(el, app) {
  const b = app.boot;
  const f = {
    range: h('select', {}, options([{ value: 'day', label: 'Hôm nay' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng này' }, { value: 'semester', label: 'Học kỳ' }, { value: 'year', label: 'Năm học' }], { selected: 'week' })),
    week: h('select', {}, options(b.weeks, { value: 'week_id', label: w => app.weekLabel(w), selected: b.current_week?.week_id })),
    semester: h('select', {}, options([{ value: 1, label: 'Học kỳ I' }, { value: 2, label: 'Học kỳ II' }], { selected: b.current_week?.semester || 1 })),
    campus: h('select', {}, options(b.campuses, { value: 'campus_id', label: 'name', empty: 'Toàn trường' })),
    grade: h('select', {}, options([6, 7, 8, 9].map(g => ({ value: g, label: 'Khối ' + g })), { empty: 'Tất cả khối' }))
  };
  const wf = field('Tuần', f.week), sf = field('Học kỳ', f.semester);
  el.append(h('div', { class: 'filters' }, field('Khoảng thời gian', f.range), wf, sf, field('Cơ sở', f.campus), field('Khối', f.grade)));
  const body = h('div'); el.append(body);
  const sync = () => { wf.hidden = f.range.value !== 'week'; sf.hidden = f.range.value !== 'semester'; };
  Object.values(f).forEach(s => s.addEventListener('change', () => { sync(); load(); }));
  sync();

  async function load() {
    loading(body);
    try {
      const d = await app.call('dashboard.get', { range: f.range.value, week_id: f.week.value, semester: f.semester.value, campus_id: f.campus.value, grade: f.grade.value, date: b.today });
      draw(d);
    } catch (e) { errorBox(body, e, load); }
  }

  function draw(d) {
    body.replaceChildren();
    body.append(h('div', { class: 'small muted', style: 'margin-bottom:8px' }, `Dữ liệu từ ${fmtDate(d.range.from)} đến ${fmtDate(d.range.to)} – lấy trực tiếp từ cơ sở dữ liệu.`));
    const stat = (v, l, c = '') => h('div', { class: 'stat ' + c }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
    body.append(h('div', { class: 'grid k4', style: 'margin-bottom:14px' },
      stat(d.total_classes, 'Tổng số lớp'), stat(d.checked_today, 'Lớp đã kiểm tra hôm nay', 'green'),
      stat(d.violations_today, 'Lượt vi phạm hôm nay', 'red'), stat(d.pending, 'Minh chứng chờ duyệt', 'yellow'),
      stat(d.approved, 'Minh chứng đã duyệt (trong kỳ)', 'green'), stat(d.appeals_open, 'Phản hồi cần xử lý', 'yellow'),
      stat('+' + d.bonus, 'Tổng điểm cộng', 'green'), stat('−' + d.deduct, 'Tổng điểm trừ', 'red')));

    if (d.tasks.length) {
      body.append(h('div', { class: 'card' }, h('h2', {}, '📌 Việc cần làm'),
        h('div', { class: 'list' }, d.tasks.map(t => h('div', { class: 'item' },
          h('span', { class: 'badge ' + (t.level === 'error' ? 'red' : t.level === 'warn' ? 'yellow' : 'blue') }, t.level === 'error' ? 'Cần làm ngay' : t.level === 'warn' ? 'Cần xử lý' : 'Lưu ý'),
          h('div', { class: 'grow' }, t.text), t.link ? h('button', { class: 'btn sm', onclick: () => app.nav(t.link) }, 'Mở') : '')))));
    }

    const g = h('div', { class: 'grid c2' });
    body.append(g);
    g.append(h('div', { class: 'card' }, h('h2', {}, '🏆 Top 5 lớp dẫn đầu (tuần)'),
      table([{ label: 'Hạng', key: 'rank', num: true }, { label: 'Lớp', key: 'class_name' }, { label: 'Điểm', key: 'final_points', num: true }], d.top, { empty: 'Chưa có dữ liệu xếp hạng (kiểm tra cấu hình điểm đầu kỳ).' })));
    g.append(h('div', { class: 'card' }, h('h2', {}, '⚠️ Lớp cần nhắc nhở'),
      table([{ label: 'Lớp', key: 'class_name' }, { label: 'Lượt vi phạm', key: 'count', num: true }], d.warn_classes, { empty: 'Không có lớp vi phạm trong kỳ.' })));

    const c1 = h('div', { class: 'card' }, h('h2', {}, '📉 Vi phạm theo ngày'));
    body.append(c1);
    const days = d.by_day.length > 62 ? d.by_day.filter(x => x.count > 0) : d.by_day;
    chart(c1, { type: days.length > 10 ? 'line' : 'bar', labels: days.map(x => (days.length <= 10 ? wdShort(x.date) + ' ' : '') + fmtDate(x.date).substr(0, 5)), datasets: [{ label: 'Lượt vi phạm', data: days.map(x => x.count), color: '#c62828' }] });

    const c2 = h('div', { class: 'card' }, h('h2', {}, '🏫 So sánh hai cơ sở'));
    body.append(c2);
    c2.append(table([{ label: 'Cơ sở', key: 'name' }, { label: 'Số lớp', key: 'classes', num: true }, { label: 'Vi phạm (đã duyệt)', key: 'violations', num: true },
      { label: 'TB/lớp', key: 'per_class', num: true }, { label: 'Điểm cộng/trừ ròng', render: r => h('span', { class: r.net_points < 0 ? 'neg' : 'pos' }, r.net_points), num: true }], d.campuses));
    if (d.campuses.length > 1) chart(c2, { labels: d.campuses.map(c => c.name), datasets: [{ label: 'Vi phạm TB mỗi lớp', data: d.campuses.map(c => c.per_class) }], height: 200 });
  }

  await load();
}
