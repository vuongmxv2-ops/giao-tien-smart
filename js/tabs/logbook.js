import { h, options, field, toast, signed, uid, blobToB64, searchSelect } from '../ui.js';
import { processImage } from '../image.js';

/**
 * NHẬP TỪ SỔ TRỰC (trong tab Ghi nhận)
 * Chụp 1 lần trang sổ → nhập từng dòng (lớp, nội dung, học sinh, giờ) → gửi một lần.
 * Ảnh chỉ tải lên một lần (gắn vào dòng đầu), máy chủ dùng lại cùng tệp ảnh cho các dòng còn lại (incident.logbook).
 */
export function renderLogbook(box, app, { recordable, campuses }) {
  const b = app.boot;
  let photos = [], lines = [], carrier = null, busy = false;
  const studentCache = new Map();
  const todayKey = b.today || new Date().toISOString().slice(0, 10);
  // Được nhập lại các ngày trong tuần thi đua hiện tại (T6 → T5).
  // Thứ Sáu, thứ Bảy, Chủ nhật (3 ngày đầu tuần mới) vẫn được nhập bù cho tuần trước.
  const addDays = (k, n) => new Date(Date.parse(k) + n * 864e5).toISOString().slice(0, 10);
  const weekStart = b.current_week?.start_date || todayKey;
  const minKey = todayKey <= addDays(weekStart, 2) ? addDays(weekStart, -7) : weekStart;

  const pick = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const thumbs = h('div', { class: 'thumbs' });
  const fCampus = h('select', {}, options(campuses, { value: 'campus_id', label: 'name' }));
  const fDate = h('input', { type: 'date', value: todayKey, max: todayKey, min: minKey });
  const list = h('div', { class: 'lb-lines' });
  const status = h('div');
  const sendBtn = h('button', { class: 'btn primary block', type: 'button', style: 'min-height:52px;font-size:17px', onclick: send }, '📤 GỬI TẤT CẢ CÁC DÒNG');

  async function takeFiles(input) {
    const files = [...input.files]; const copies = [];
    for (const f of files) { try { copies.push(new File([await f.arrayBuffer()], f.name || 'so_truc.jpg', { type: f.type })); } catch { toast('Không đọc được ảnh ' + (f.name || ''), 'err'); } }
    input.value = '';
    for (const f of copies) {
      const ph = h('div', { class: 'thumb' }, h('span', { class: 'spinner' })); thumbs.append(ph);
      try {
        const img = await processImage(f);
        if (photos.some(x => x.checksum === img.checksum)) { ph.remove(); continue; }
        photos.push(img);
        ph.replaceChildren(h('img', { src: URL.createObjectURL(img.thumb || img.blob), alt: 'Trang sổ' }),
          h('button', { class: 'x', type: 'button', 'aria-label': 'Bỏ ảnh', onclick: () => { if (carrier) return toast('Ảnh đã gửi lên, không bỏ được nữa.', 'warn'); photos = photos.filter(x => x !== img); ph.remove(); } }, '✕'));
      } catch (e) { ph.remove(); toast('Không đọc được ảnh: ' + e.message, 'err'); }
    }
  }
  pick.addEventListener('change', () => takeFiles(pick));
  cam.addEventListener('change', () => takeFiles(cam));

  const typeItems = () => b.types.map(t => ({ value: t.type_id, label: `${t.kind === 'CONG' ? '🌟 ' : ''}${t.name}${t.points != null ? ' (' + signed(t.points) + ')' : ''}`, sub: t.group_name || '' }));
  const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  async function studentsOf(classId) {
    if (!classId || !app.can(['student.lookup', 'student.view', 'incident.review'])) return [];
    if (!studentCache.has(classId)) studentCache.set(classId, app.call('student.search', { class_id: classId }).catch(() => []));
    const arr = await studentCache.get(classId);
    const count = {}, seen = {};
    arr.forEach(s => { count[s.full_name] = (count[s.full_name] || 0) + 1; });
    return arr.map(s => ({ value: s.student_id, label: count[s.full_name] > 1 ? `${s.full_name} (${seen[s.full_name] = (seen[s.full_name] || 0) + 1})` : s.full_name }));
  }

  function addLine(prev) {
    const ln = { id: uid() + '-' + Date.now().toString(36), state: '' };
    const classes = () => recordable.filter(c => c.campus_id === fCampus.value);
    ln.cls = h('select', {}, options(classes(), { value: 'class_id', label: 'name', empty: '— Lớp —', selected: prev?.cls.value }));
    ln.time = h('input', { type: 'time', value: prev?.time.value || (fDate.value === todayKey ? nowHM() : '07:00') });
    ln.type = searchSelect({ placeholder: 'Gõ để tìm lỗi / nội dung tuyên dương', items: typeItems() });
    ln.student = searchSelect({ placeholder: 'Học sinh (bỏ trống nếu lỗi tập thể)', emptyLabel: '— Lỗi tập thể / không xác định —' });
    ln.note = h('input', { type: 'text', placeholder: 'Ghi chú (ví dụ: dòng 5 trong sổ)' });
    ln.badge = h('span', { class: 'badge' }, 'Dòng mới');
    ln.cls.addEventListener('change', async () => { ln.student.setItems(await studentsOf(ln.cls.value)); });
    if (ln.cls.value) studentsOf(ln.cls.value).then(items => ln.student.setItems(items));
    ln.el = h('div', { class: 'lb-line' },
      h('div', { class: 'lb-head' }, h('b', { class: 'lb-no' }), ln.badge,
        h('button', { class: 'btn sm ghost', type: 'button', style: 'margin-left:auto', onclick: () => {
          if (ln.state === 'done') return toast('Dòng đã gửi, không xóa được ở đây.', 'warn');
          lines = lines.filter(x => x !== ln); ln.el.remove(); renumber();
        } }, '✕ Bỏ dòng')),
      h('div', { class: 'grid c2' }, field('Lớp', ln.cls), field('Giờ (theo sổ)', ln.time)),
      field('Lỗi vi phạm / nội dung tuyên dương', ln.type), field('Học sinh', ln.student), field('Ghi chú', ln.note));
    lines.push(ln); list.append(ln.el); renumber();
    return ln;
  }
  function renumber() { lines.forEach((ln, i) => { ln.el.querySelector('.lb-no').textContent = 'Dòng ' + (i + 1); }); }
  function mark(ln, state, text) {
    ln.state = state;
    ln.badge.className = 'badge ' + (state === 'done' ? 'green' : state === 'err' ? 'red' : state === 'sending' ? 'blue' : '');
    ln.badge.textContent = text;
    ln.el.classList.toggle('done', state === 'done');
    [ln.cls, ln.time, ln.note].forEach(x => { x.disabled = state === 'done'; });
  }
  fCampus.addEventListener('change', () => lines.filter(l => l.state !== 'done').forEach(l => {
    l.cls.replaceChildren(...options(recordable.filter(c => c.campus_id === fCampus.value), { value: 'class_id', label: 'name', empty: '— Lớp —' }));
    l.student.setItems([]);
  }));

  box.append(h('div', { class: 'card' },
    h('div', { class: 'notice' }, '📒 Chụp ', h('b', {}, 'một lần'), ' trang sổ trực (có ngày, lớp, nội dung, chữ ký), rồi nhập từng dòng bên dưới. Mỗi dòng thành một bản ghi riêng, tất cả dùng chung ảnh trang sổ và có nhãn "Theo sổ trực".'),
    h('div', { class: 'grid c2' },
      h('button', { class: 'btn btn-hero logbook', type: 'button', style: 'min-height:80px', onclick: () => cam.click() }, h('span', { class: 'ic' }, '📒'), 'CHỤP TRANG SỔ'),
      h('button', { class: 'btn', type: 'button', style: 'min-height:80px', onclick: () => pick.click() }, '🖼️ Chọn ảnh trang sổ từ thư viện')),
    cam, pick, h('div', { style: 'margin:10px 0' }, thumbs),
    h('div', { class: 'grid c2' }, field('Cơ sở', fCampus), field('Ngày trực (theo sổ)', fDate, 'Được nhập lại các ngày trong tuần đó (thứ Sáu, thứ Bảy, Chủ nhật vẫn nhập bù được cho tuần trước).')),
    list,
    h('button', { class: 'btn block', type: 'button', style: 'margin:4px 0 12px;border-style:dashed', onclick: () => addLine(lines[lines.length - 1]) }, '＋ Thêm dòng'),
    h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Người ghi nhận: ', h('b', {}, app.user.full_name)),
    sendBtn, status));
  addLine();

  function occurredAt(ln) { return `${fDate.value}T${ln.time.value || '07:00'}:00+07:00`; }
  function lineData(ln) {
    return { client_request_id: ln.id, class_id: ln.cls.value, type_id: ln.type.value, student_id: ln.student.value, note: ('[Sổ trực] ' + ln.note.value.trim()).trim(), occurred_at: occurredAt(ln) };
  }

  async function send() {
    if (busy) return;
    const todo = lines.filter(l => l.state !== 'done');
    if (!todo.length) return toast('Không còn dòng nào cần gửi.', 'warn');
    if (b.settings.require_evidence === '1' && !photos.length) return toast('Cần chụp hoặc chọn ảnh trang sổ.', 'err');
    if (!fDate.value || fDate.value > todayKey || fDate.value < minKey) return toast('Ngày trực phải nằm trong tuần thi đua hiện tại (T6, T7, CN được nhập bù tuần trước), không sau hôm nay.', 'err');
    for (const [i, ln] of todo.entries()) {
      if (!ln.cls.value) return toast(`Dòng ${lines.indexOf(ln) + 1}: chọn lớp.`, 'err');
      if (!ln.type.value) return toast(`Dòng ${lines.indexOf(ln) + 1}: chọn lỗi hoặc nội dung tuyên dương.`, 'err');
      if (Date.parse(occurredAt(ln)) > Date.now() + 60000) return toast(`Dòng ${lines.indexOf(ln) + 1}: giờ không được ở tương lai.`, 'err');
    }
    busy = true; sendBtn.disabled = true;
    const say = t => status.replaceChildren(h('div', { class: 'notice' }, h('span', { class: 'spinner sm' }), ' ', t));
    try {
      // Bước 1: dòng đầu mang ảnh trang sổ (chỉ tải ảnh lên một lần)
      if (!carrier) {
        const first = todo[0];
        mark(first, 'sending', 'Đang gửi…');
        say('Đang gửi ảnh trang sổ…');
        const r = await app.call('incident.create', { ...lineData(first), source: 'LOGBOOK' });
        const inc = r.incident;
        for (const [k, img] of photos.entries()) {
          say(`Đang gửi ảnh trang sổ ${k + 1}/${photos.length}…`);
          await app.call('incident.addEvidence', { incident_id: inc.incident_id, base64: await blobToB64(img.blob), checksum: img.checksum, mime_type: img.mime, filename: img.name,
            width: img.width, height: img.height, preview_base64: img.preview ? await blobToB64(img.preview) : '', thumb_base64: img.thumb ? await blobToB64(img.thumb) : '' }, { timeout: 240000 });
        }
        await app.call('incident.submit', { incident_id: inc.incident_id, expected_evidence: photos.length });
        carrier = inc.incident_id;
        mark(first, 'done', '✔ Đã gửi' + (inc.dup_flag ? ' – nghi trùng' : ''));
      }
      // Bước 2: các dòng còn lại – một lần gọi, dùng lại ảnh đã gửi
      const rest = lines.filter(l => l.state !== 'done');
      if (rest.length) {
        rest.forEach(l => mark(l, 'sending', 'Đang gửi…'));
        say(`Đang tạo ${rest.length} bản ghi còn lại…`);
        const r = await app.call('incident.logbook', { from_incident_id: carrier, lines: rest.map(lineData) }, { timeout: 180000 });
        for (const x of r.results) {
          const ln = rest.find(l => l.id === x.client_request_id);
          if (!ln) continue;
          if (x.ok) mark(ln, 'done', '✔ Đã gửi' + (x.dup ? ' – nghi trùng' : ''));
          else mark(ln, 'err', '✖ ' + x.message);
        }
      }
      const bad = lines.filter(l => l.state !== 'done').length, good = lines.length - bad;
      if (bad) {
        status.replaceChildren(h('div', { class: 'notice yellow' }, `Đã lưu ${good} dòng. ${bad} dòng chưa gửi được (xem lý do ở từng dòng) – sửa lại rồi bấm Gửi lần nữa.`));
      } else {
        toast(`✔ Đã lưu ${good} bản ghi theo sổ trực – CHỜ DUYỆT`, 'ok', 5000);
        status.replaceChildren(h('div', { class: 'notice green' }, `✔ Máy chủ đã lưu ${good} bản ghi theo sổ trực, tất cả đang CHỜ DUYỆT.`,
          ' ', h('button', { class: 'btn sm', type: 'button', onclick: reset }, 'Nhập trang sổ mới')));
      }
    } catch (e) {
      lines.filter(l => l.state === 'sending').forEach(l => mark(l, 'err', '✖ Chưa gửi'));
      status.replaceChildren(h('div', { class: 'notice red' }, '✖ ' + e.message + ' – Bấm Gửi lần nữa để gửi tiếp (không tạo trùng).'));
    } finally { busy = false; sendBtn.disabled = false; }
  }

  function reset() {
    photos = []; carrier = null; thumbs.replaceChildren(); list.replaceChildren(); lines = []; status.replaceChildren(); addLine();
  }
}
