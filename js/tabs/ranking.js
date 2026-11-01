import { h, options, field, loading, errorBox, table, todayKey } from '../ui.js';
import { chart } from '../charts.js';
import { tieLabel } from './scores.js';

/** TAB 7 – XẾP HẠNG – KHEN THƯỞNG */
export async function render(el, app) {
  const b = app.boot;
  const fPeriod = h('select', {}, options([{ value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }, { value: 'semester', label: 'Học kỳ' }, { value: 'year', label: 'Năm học' }]));
  const fWeek = h('select', {}, options(b.weeks, { value: 'week_id', label: w => app.weekLabel(w), selected: b.current_week?.week_id }));
  const fMonth = h('input', { type: 'month', value: todayKey().substr(0, 7) });
  const fSem = h('select', {}, options([{ value: 1, label: 'Học kỳ I' }, { value: 2, label: 'Học kỳ II' }], { selected: b.current_week?.semester }));
  const fCampus = h('select', {}, options(b.campuses, { value: 'campus_id', label: 'name', empty: 'Toàn trường' }));
  const fGrade = h('select', {}, options([6, 7, 8, 9].map(g => ({ value: g, label: 'Khối ' + g })), { empty: 'Tất cả khối' }));
  const fGroup = h('select', {}, options(app.groups(), { empty: 'Tất cả nhóm thi đua' }));
  const wF = field('Tuần', fWeek), mF = field('Tháng', fMonth), sF = field('Học kỳ', fSem);
  el.append(h('div', { class: 'filters' }, field('Kỳ xếp hạng', fPeriod), wF, mF, sF, field('Nhóm thi đua', fGroup), field('Cơ sở', fCampus), field('Khối', fGrade)));
  const body = h('div'); el.append(body);
  const sync = () => { wF.hidden = fPeriod.value !== 'week'; mF.hidden = fPeriod.value !== 'month'; sF.hidden = fPeriod.value !== 'semester'; };
  [fPeriod, fWeek, fMonth, fSem, fGroup, fCampus, fGrade].forEach(x => x.addEventListener('change', () => { sync(); load(); }));
  sync();

  async function load() {
    loading(body);
    try {
      const d = await app.call('rank.get', { period: fPeriod.value, week_id: fWeek.value, month: fMonth.value, semester: fSem.value, comp_group: fGroup.value, campus_id: fCampus.value, grade: fGrade.value });
      body.replaceChildren();
      body.append(h('div', { class: 'small muted', style: 'margin-bottom:8px' }, d.basis + ' Quy tắc đồng hạng: ' + tieLabel(d.tie_rule) + '.'));
      if (d.commend.length) body.append(h('div', { class: 'card' }, h('h2', {}, '🎖️ Đề xuất tuyên dương'),
        h('div', { class: 'list' }, d.commend.map(r => h('div', { class: 'item' }, h('span', { class: 'badge green' }, 'Hạng ' + r.rank), h('div', { class: 'grow' }, h('b', {}, r.class_name), r.comp_group ? ' (nhóm ' + r.comp_group + ')' : '', ` – TB ${r.average} điểm, ${r.violation_count} lượt vi phạm`)))),
        d.most_improved.length ? h('div', { class: 'small', style: 'margin-top:8px' }, '📈 Tiến bộ nhiều nhất: ' + d.most_improved.map(r => `${r.class_name} (tăng ${r.rank_change} bậc)`).join(', ')) : '',
        h('div', { class: 'small muted', style: 'margin-top:6px' }, 'Danh sách chỉ là đề xuất từ số liệu đã duyệt; quyết định khen thưởng do nhà trường.')));
      const c = h('div', { class: 'card' }, h('h2', {}, 'Biểu đồ xếp hạng'));
      body.append(c);
      chart(c, { labels: d.rows.map(r => r.class_name), datasets: [{ label: 'Điểm trung bình', data: d.rows.map(r => r.average) }], height: Math.max(260, d.rows.length * 22), horizontal: true });
      body.append(table([
        { label: 'Hạng', render: r => h('b', {}, r.rank), num: true }, { label: 'Lớp', key: 'class_name' }, ...(app.groups().length ? [{ label: 'Nhóm', key: 'comp_group' }] : []), { label: 'Điểm TB', key: 'average', num: true }, { label: 'Tổng điểm', key: 'total', num: true },
        { label: 'Số tuần', key: 'weeks', num: true }, { label: 'Hạng kỳ trước', key: 'prev_rank', num: true },
        { label: 'Tăng/giảm', num: true, render: r => r.rank_change === '' ? '—' : r.rank_change > 0 ? h('span', { class: 'pos' }, '▲ ' + r.rank_change) : r.rank_change < 0 ? h('span', { class: 'neg' }, '▼ ' + -r.rank_change) : '＝' },
        { label: 'Lượt vi phạm', key: 'violation_count', num: true },
        { label: 'Tiến bộ', num: true, render: r => r.progress === '' ? '—' : h('span', { class: r.progress >= 0 ? 'pos' : 'neg' }, (r.progress > 0 ? '+' : '') + r.progress) }], d.rows));
    } catch (e) { errorBox(body, e, load); }
  }
  await load();
}
