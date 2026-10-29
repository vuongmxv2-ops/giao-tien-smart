import { h, options, field, toast, loading, errorBox, todayKey, table, uid } from '../ui.js';

const RES = [['DAT', 'Đạt'], ['CHUA_DAT', 'Chưa đạt'], ['CHUA_KT', 'Chưa KT'], ['KHONG_AD', 'Không áp dụng']];

/** TAB 3 – KIỂM TRA NỀ NẾP HẰNG NGÀY. Không tự tính vi phạm: mục "Chưa đạt" cần tạo ghi nhận có minh chứng để trừ điểm. */
export async function render(el, app) {
  const b = app.boot, u = app.user;
  const canWrite = app.can('check.create');
  const classes = b.classes.filter(c => u.allScope || u.perms.includes('*') || u.campusIds.includes(c.campus_id) || u.classIds.includes(c.class_id) || !canWrite);
  const sessions = b.settings.duty_sessions || [];
  const now = new Date(Date.now() + 7 * 36e5).toISOString().substr(11, 5);
  const curSession = (sessions.find(s => now <= s.to) || sessions[sessions.length - 1] || { code: 'SANG' }).code;
  const fDate = h('input', { type: 'date', value: todayKey() });
  const fSession = h('select', {}, options(sessions, { value: 'code', label: s => `${s.name} (${s.from}–${s.to})`, selected: curSession }));
  const fCampus = h('select', {}, options(b.campuses.filter(cs => classes.some(c => c.campus_id === cs.campus_id)), { value: 'campus_id', label: 'name' }));
  const fClass = h('select');
  const fill = () => fClass.replaceChildren(...options(classes.filter(c => c.campus_id === fCampus.value), { value: 'class_id', label: 'name' }));
  fCampus.addEventListener('change', () => { fill(); load(); });
  fill();
  el.append(h('div', { class: 'filters' }, field('Ngày', fDate), field('Buổi', fSession), field('Cơ sở', fCampus), field('Lớp', fClass)));
  el.append(h('div', { class: 'small muted', style: 'margin-bottom:10px' }, 'Thời gian trực ban: ' + sessions.map(s => `${s.name} ${s.from}–${s.to}`).join(' · ') + '. Mặc định mọi mục là "Chưa kiểm tra" và không tính vi phạm.'));
  const body = h('div'); el.append(body);
  const summary = h('div'); el.append(summary);
  [fDate, fSession, fClass].forEach(x => x.addEventListener('change', load));

  let state = {};
  async function load() {
    loading(body);
    try {
      const rows = await app.call('check.list', { check_date: fDate.value, session: fSession.value, class_id: fClass.value });
      state = {};
      (b.settings.check_items || []).forEach(it => { state[it.code] = { result: 'CHUA_KT', note: '' }; });
      rows.forEach(r => { state[r.item_code] = { result: r.result, note: r.note }; });
      draw();
      loadSummary();
    } catch (e) { errorBox(body, e, load); }
  }

  function draw() {
    const items = (b.settings.check_items || []).map(it => {
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': it.name }, RES.map(([code, label]) => {
        const btn = h('button', { type: 'button', class: code + (state[it.code].result === code ? ' on' : ''), disabled: !canWrite }, label);
        btn.addEventListener('click', () => { state[it.code].result = code; [...seg.children].forEach(x => x.classList.toggle('on', x === btn)); noteIn.hidden = code !== 'CHUA_DAT' && !noteIn.value; });
        return btn;
      }));
      const noteIn = h('input', { type: 'text', placeholder: 'Ghi chú', value: state[it.code].note, hidden: state[it.code].result !== 'CHUA_DAT' && !state[it.code].note, disabled: !canWrite });
      noteIn.addEventListener('input', () => { state[it.code].note = noteIn.value; });
      return h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', {}, it.name), noteIn), seg);
    });
    const acts = h('div', { class: 'actions', style: 'margin-top:12px' });
    if (canWrite) {
      acts.append(h('button', { class: 'btn primary', onclick: () => save(false) }, '💾 Lưu kết quả'),
        h('button', { class: 'btn green', onclick: () => save(true) }, 'Lưu & sang lớp tiếp theo ▶'),
        h('button', { class: 'btn', onclick: () => { for (const k in state) if (state[k].result === 'CHUA_KT') state[k].result = 'DAT'; draw(); } }, 'Đánh dấu các mục còn lại là Đạt'),
        app.can('incident.create') ? h('button', { class: 'btn yellow', onclick: () => app.nav('ghi-nhan', { class_id: fClass.value }) }, '📷 Chụp ảnh minh chứng / ghi nhận vi phạm') : '');
    }
    body.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Lớp ' + (app.classById(fClass.value)?.name || '')), h('div', { class: 'list' }, items), acts,
      h('div', { class: 'small muted', style: 'margin-top:8px' }, 'Lưu ý: kết quả kiểm tra không tự trừ điểm. Muốn trừ điểm phải gửi ghi nhận vi phạm có ảnh để Tổng phụ trách duyệt.')));
  }

  async function save(next) {
    try {
      const items = Object.entries(state).map(([item_code, v]) => ({ item_code, result: v.result, note: v.note }));
      const r = await app.call('check.save', { client_request_id: uid(), check_date: fDate.value, session: fSession.value, class_id: fClass.value, items });
      toast(`Đã lưu (${r.inserted} mới, ${r.updated} cập nhật)`, 'ok');
      if (next) {
        const opts = [...fClass.options], i = opts.findIndex(o => o.value === fClass.value);
        if (i < opts.length - 1) { fClass.value = opts[i + 1].value; await load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else toast('Đã tới lớp cuối cùng của cơ sở.', 'info');
      } else loadSummary();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function loadSummary() {
    try {
      const rows = await app.call('check.list', { check_date: fDate.value, session: fSession.value, campus_id: fCampus.value });
      const by = {};
      rows.forEach(r => { const o = by[r.class_id] || (by[r.class_id] = { DAT: 0, CHUA_DAT: 0, CHUA_KT: 0, KHONG_AD: 0 }); o[r.result]++; });
      const list = classes.filter(c => c.campus_id === fCampus.value).map(c => ({ name: c.name, ...(by[c.class_id] || { DAT: 0, CHUA_DAT: 0, CHUA_KT: 0, KHONG_AD: 0 }), checked: !!by[c.class_id] }));
      summary.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Tổng hợp buổi kiểm tra'),
        table([{ label: 'Lớp', key: 'name' }, { label: 'Đạt', key: 'DAT', num: true }, { label: 'Chưa đạt', render: r => h('span', { class: r.CHUA_DAT ? 'neg' : '' }, r.CHUA_DAT), num: true },
          { label: 'Chưa KT', key: 'CHUA_KT', num: true }, { label: 'Không AD', key: 'KHONG_AD', num: true }, { label: '', render: r => r.checked ? h('span', { class: 'badge green' }, 'Đã KT') : h('span', { class: 'badge' }, 'Chưa') }], list)));
    } catch { /* tổng hợp không bắt buộc */ }
  }

  await load();
}
