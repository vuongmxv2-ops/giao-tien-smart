import { h, options, field, toast, loading, errorBox, table, fmtDate, download, devNote } from '../ui.js';
import { chart } from '../charts.js';

/** TAB 9 – THỐNG KÊ – BÁO CÁO AI */
export async function render(el, app) {
  const b = app.boot;
  const fRange = h('select', {}, options([{ value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng này' }, { value: 'semester', label: 'Học kỳ' }, { value: 'year', label: 'Năm học' }]));
  const fWeek = h('select', {}, options(b.weeks, { value: 'week_id', label: w => app.weekLabel(w), selected: b.current_week?.week_id }));
  const fSem = h('select', {}, options([{ value: 1, label: 'Học kỳ I' }, { value: 2, label: 'Học kỳ II' }]));
  const fCampus = h('select', {}, options(b.campuses, { value: 'campus_id', label: 'name', empty: 'Toàn trường' }));
  const fGrade = h('select', {}, options([6, 7, 8, 9].map(g => ({ value: g, label: 'Khối ' + g })), { empty: 'Tất cả khối' }));
  const wF = field('Tuần', fWeek), sF = field('Học kỳ', fSem);
  el.append(h('div', { class: 'filters' }, field('Khoảng', fRange), wF, sF, field('Cơ sở', fCampus), field('Khối', fGrade)));

  // Nhận xét tuần
  const mode = h('select', {}, options([{ value: 'RULES', label: 'Theo quy tắc từ dữ liệu đã duyệt (đang hoạt động)' }, { value: 'AI', label: 'AI viết nhận xét – Đang phát triển' }]));
  const out = h('div');
  el.append(h('div', { class: 'card' }, h('h2', {}, '🤖 Nhận xét tuần'),
    h('div', { class: 'grid c2' }, field('Cách tạo', mode), h('div', { style: 'align-self:end' }, h('button', { class: 'btn primary block', onclick: comment }, 'TẠO NHẬN XÉT TUẦN BẰNG AI'))),
    h('div', { class: 'small muted' }, 'Giai đoạn 1 tạo nhận xét theo quy tắc, chỉ dùng số liệu đã duyệt, xưng hô "các bạn", không gửi dữ liệu ra ngoài và không đưa ra kết luận kỷ luật.'), out));

  const body = h('div'); el.append(body);
  const sync = () => { wF.hidden = fRange.value !== 'week'; sF.hidden = fRange.value !== 'semester'; };
  [fRange, fWeek, fSem, fCampus, fGrade].forEach(x => x.addEventListener('change', () => { sync(); load(); }));
  sync();

  async function comment() {
    if (mode.value === 'AI') {
      out.replaceChildren(h('div', { class: 'notice yellow' }, devNote(), ' Kết nối dịch vụ AI chưa được bật. Khi bật, quản trị viên phải phê duyệt mục đích xử lý và hệ thống chỉ gửi số liệu tổng hợp (không gửi ảnh, không gửi tên học sinh). Hãy dùng chế độ "Theo quy tắc".'));
      return;
    }
    loading(out, 'Đang tổng hợp…');
    try {
      const r = await app.call('report.weeklyComment', { week_id: fWeek.value, campus_id: fCampus.value, grade: fGrade.value });
      const ta = h('textarea', { style: 'min-height:360px', 'aria-label': 'Nội dung nhận xét' }, r.text);
      out.replaceChildren(ta, h('div', { class: 'actions', style: 'margin-top:8px' },
        h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Đã chép', 'ok'); } catch { ta.select(); document.execCommand('copy'); } } }, '📋 Chép nội dung'),
        h('button', { class: 'btn', onclick: () => download(new Blob(['﻿' + ta.value], { type: 'text/plain;charset=utf-8' }), `Nhan_xet_tuan_${r.week.week_no}.txt`) }, '⬇ Tải tệp .txt'),
        h('span', { class: 'small muted' }, 'Bạn có thể sửa nội dung trước khi dùng.')));
    } catch (e) { errorBox(out, e, comment); }
  }

  async function load() {
    loading(body);
    try {
      const d = await app.call('stats.get', { range: fRange.value, week_id: fWeek.value, semester: fSem.value, campus_id: fCampus.value, grade: fGrade.value });
      body.replaceChildren();
      body.append(h('div', { class: 'small muted', style: 'margin-bottom:8px' }, `Từ ${fmtDate(d.range.from)} đến ${fmtDate(d.range.to)} · ${d.total} bản ghi đã duyệt.`));
      if (d.progress) body.append(h('div', { class: 'stat green', style: 'margin-bottom:12px' }, h('div', { class: 'v' }, d.progress.rate + '%'), h('div', { class: 'l' }, `Tỷ lệ lớp tiến bộ tuần ${d.progress.week_no} so với tuần trước (${d.progress.improved}/${d.progress.total} lớp)`)));
      const g = h('div', { class: 'grid c2' }); body.append(g);
      const box = (title, fn) => { const c = h('div', { class: 'card' }, h('h2', {}, title)); g.append(c); fn(c); };
      box('Vi phạm theo lớp', c => chart(c, { labels: d.by_class.map(x => x.label), datasets: [{ label: 'Lượt vi phạm', data: d.by_class.map(x => x.count), color: '#c62828' }] }));
      box('Vi phạm theo loại', c => chart(c, { type: 'pie', labels: d.by_type.map(x => x.label), datasets: [{ label: 'Lượt', data: d.by_type.map(x => x.count) }] }));
      box('Vi phạm theo ngày', c => chart(c, { type: 'line', labels: d.by_day.map(x => x.label.substr(0, 5)), datasets: [{ label: 'Lượt vi phạm', data: d.by_day.map(x => x.count) }] }));
      box('Vi phạm theo tuần', c => chart(c, { type: 'line', labels: d.by_week.map(x => x.label), datasets: [{ label: 'Lượt vi phạm', data: d.by_week.map(x => x.count) }, { label: 'Điểm cộng', data: d.by_week.map(x => x.bonus), color: '#2e7d32' }] }));
      box('Theo khối', c => chart(c, { labels: d.by_grade.map(x => x.label), datasets: [{ label: 'Lượt vi phạm', data: d.by_grade.map(x => x.count) }] }));
      box('Theo cơ sở', c => chart(c, { labels: d.by_campus.map(x => x.label), datasets: [{ label: 'Lượt vi phạm', data: d.by_campus.map(x => x.count) }, { label: 'Điểm trừ', data: d.by_campus.map(x => x.deduct), color: '#f9a825' }] }));
      body.append(h('div', { class: 'card' }, h('h2', {}, 'Bảng số liệu theo lớp'),
        table([{ label: 'Lớp', key: 'label' }, { label: 'Lượt vi phạm', key: 'count', num: true }, { label: 'Điểm trừ', key: 'deduct', num: true }, { label: 'Điểm cộng', key: 'bonus', num: true }], d.by_class)));
    } catch (e) { errorBox(body, e, load); }
  }

  await load();
}
