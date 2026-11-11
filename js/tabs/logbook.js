import { h, options, field, toast, signed, uid, blobToB64, searchSelect, modal, confirmBox, time24 } from '../ui.js';
import { processImage } from '../image.js';
import { parseLogbook, matchStudent } from '../quicklog.js';

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
  const photoBar = h('div', { class: 'small', style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px' });
  const fCampus = h('select', {}, options(campuses, { value: 'campus_id', label: 'name' }));
  const fDate = h('input', { type: 'date', value: todayKey, max: todayKey, min: minKey });
  const list = h('div', { class: 'lb-lines' });
  const status = h('div');
  const sendBtn = h('button', { class: 'btn primary block', type: 'button', style: 'min-height:52px;font-size:17px', onclick: send }, '📤 GỬI TẤT CẢ CÁC DÒNG');

  /* ---------- LƯỢC BỚT ẢNH TRANG SỔ (chụp nhầm / chụp trùng) ----------
   * Ảnh trùng y hệt (cùng tệp) tự bỏ qua. Ảnh chụp lại cùng trang: người nhập bấm vào ảnh để xem lớn rồi bỏ. */
  function removePhoto(img, silent) {
    if (carrier) return toast('Ảnh đã gửi lên, không bỏ được nữa.', 'warn');
    photos = photos.filter(x => x !== img);
    img.el?.remove(); if (img.url) URL.revokeObjectURL(img.url);
    if (!silent) toast('Đã bỏ 1 ảnh. Còn ' + photos.length + ' ảnh trang sổ.', 'info', 2500);
    refreshPhotos();
  }

  function viewPhoto(img) {
    const n = photos.indexOf(img) + 1;
    const big = h('img', { src: URL.createObjectURL(img.preview || img.blob), alt: 'Trang sổ ' + n });
    const m = modal({ title: `Ảnh trang sổ ${n}/${photos.length}`, wide: true,
      body: h('div', { class: 'viewer' }, big),
      onClose: () => URL.revokeObjectURL(big.src),
      actions: carrier ? [{ label: 'Đóng' }] : [{ label: 'Giữ lại' }, { label: '🗑 Bỏ ảnh này', kind: 'red', onClick: () => removePhoto(img) }] });
    return m;
  }

  function refreshPhotos() {
    photos.forEach((img, i) => { img.noEl.textContent = String(i + 1); });
    photoBar.replaceChildren();
    if (!photos.length) return;
    photoBar.append(h('span', { class: 'muted' }, carrier ? `${photos.length} ảnh trang sổ đã gửi`
      : `${photos.length} ảnh trang sổ · bấm vào ảnh để xem lớn, bấm ✕ để bỏ ảnh chụp nhầm/trùng`));
    if (carrier) return;
    if (photos.length > 1) photoBar.append(h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => {
      if (!await confirmBox('Bỏ tất cả ảnh?', `Bỏ cả ${photos.length} ảnh trang sổ để chụp lại từ đầu?`, 'Bỏ tất cả', 'red')) return;
      [...photos].forEach(p => removePhoto(p, true)); toast('Đã bỏ tất cả ảnh.', 'info');
    } }, '🗑 Bỏ tất cả'));
  }

  async function takeFiles(input) {
    const files = [...input.files]; const copies = [];
    for (const f of files) { try { copies.push(new File([await f.arrayBuffer()], f.name || 'so_truc.jpg', { type: f.type })); } catch { toast('Không đọc được ảnh ' + (f.name || ''), 'err'); } }
    input.value = '';
    for (const f of copies) {
      const ph = h('div', { class: 'thumb' }, h('span', { class: 'spinner' })); thumbs.append(ph);
      try {
        const img = await processImage(f);
        if (photos.some(x => x.checksum === img.checksum)) { ph.remove(); toast('Ảnh này đã có trong danh sách – bỏ qua ảnh trùng.', 'warn'); continue; }
        img.el = ph; img.url = URL.createObjectURL(img.thumb || img.blob);
        img.noEl = h('span', { style: 'position:absolute;left:4px;top:4px;background:rgba(15,23,42,.65);color:#fff;border-radius:10px;padding:0 7px;font-size:12px;font-weight:700' });
        photos.push(img);
        ph.replaceChildren(h('img', { src: img.url, alt: 'Trang sổ', onclick: () => viewPhoto(img) }), img.noEl,
          h('button', { class: 'x', type: 'button', 'aria-label': 'Bỏ ảnh', onclick: e => { e.stopPropagation(); removePhoto(img); } }, '✕'));
        refreshPhotos();
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

  function addLine(prev, preset = {}) {
    const ln = { id: uid() + '-' + Date.now().toString(36), state: '', customDate: !!preset.date };
    const classes = () => recordable.filter(c => c.campus_id === fCampus.value);
    const cl = classes();
    ln.cls = h('select', {}, options(cl, { value: 'class_id', label: 'name', empty: '— Lớp —', selected: preset.classId || prev?.cls.value || (cl.length === 1 ? cl[0].class_id : undefined) }));
    ln.date = h('input', { type: 'date', value: preset.date || prev?.date.value || fDate.value, max: todayKey, min: minKey });
    ln.date.addEventListener('change', () => { ln.customDate = true; });
    ln.time = time24(preset.time || prev?.time.value || (fDate.value === todayKey ? nowHM() : '07:00'));
    ln.type = searchSelect({ placeholder: 'Gõ để tìm lỗi / nội dung tuyên dương', items: typeItems() });
    ln.student = searchSelect({ placeholder: 'Học sinh (bỏ trống nếu lỗi tập thể)', emptyLabel: '— Lỗi tập thể / không xác định —' });
    ln.note = h('input', { type: 'text', placeholder: 'Ghi chú (ví dụ: dòng 5 trong sổ)', value: preset.note || '' });
    ln.badge = h('span', { class: preset.warn?.length ? 'badge yellow' : 'badge' }, preset.warn?.length ? '⚠ Kiểm tra' : preset.typeId ? 'Đã điền sẵn' : 'Dòng mới');
    ln.warnEl = h('div', { class: 'small', style: 'color:#92400e', hidden: !preset.warn?.length }, preset.warn?.length ? '⚠ ' + preset.warn.join(' · ') : '');
    if (preset.typeId) ln.type.value = preset.typeId;
    ln.cls.addEventListener('change', async () => { ln.student.setItems(await studentsOf(ln.cls.value)); });
    if (ln.cls.value) studentsOf(ln.cls.value).then(items => { ln.student.setItems(items); if (preset.studentId) ln.student.value = preset.studentId; });
    ln.el = h('div', { class: 'lb-line' },
      h('div', { class: 'lb-head' }, h('b', { class: 'lb-no' }), ln.badge,
        h('button', { class: 'btn sm ghost', type: 'button', style: 'margin-left:auto', onclick: () => {
          if (ln.state === 'done') return toast('Dòng đã gửi, không xóa được ở đây.', 'warn');
          lines = lines.filter(x => x !== ln); ln.el.remove(); renumber();
        } }, '✕ Bỏ dòng')),
      ln.warnEl,
      h('div', { class: 'grid c2' }, field('Lớp', ln.cls), field('Ngày (theo sổ)', ln.date)), field('Giờ (theo sổ)', ln.time),
      field('Lỗi vi phạm / nội dung tuyên dương', ln.type), field('Học sinh', ln.student), field('Ghi chú', ln.note));
    if (preset.warn?.length) ln.el.style.borderColor = '#f59e0b';
    lines.push(ln); list.append(ln.el); renumber();
    return ln;
  }
  function renumber() { lines.forEach((ln, i) => { ln.el.querySelector('.lb-no').textContent = 'Dòng ' + (i + 1); }); }
  function mark(ln, state, text) {
    ln.state = state;
    ln.badge.className = 'badge ' + (state === 'done' ? 'green' : state === 'err' ? 'red' : state === 'sending' ? 'blue' : '');
    ln.badge.textContent = text;
    ln.el.classList.toggle('done', state === 'done');
    [ln.cls, ln.date, ln.time, ln.note].forEach(x => { x.disabled = state === 'done'; });
    if (state === 'done' && ln.warnEl) ln.warnEl.hidden = true;
  }
  fDate.addEventListener('change', () => lines.filter(l => l.state !== 'done' && !l.customDate).forEach(l => { l.date.value = fDate.value; }));

  /* ---------- NHẬP NHANH: gõ/đọc theo sổ → tự tách thành các dòng ---------- */
  const typeByCode = code => b.types.find(t => t.code === code);
  const isBlank = ln => ln.state !== 'done' && !ln.type.value && !ln.student.value && !ln.note.value.trim();
  const quickText = h('textarea', { rows: 7, placeholder: 'Chép lại sổ, mỗi ý một dòng. Ví dụ:\nNgày 28/10/2026\nTrần Linh Nhi không sơ vin\nMai Phước Thiện, Lê Đăng Khoa không mũ\nNói chuyện: Cao Bảo Hân, Hoàng Dũng\nBuổi chiều\nXếp hàng muộn', style: 'font-size:15px' });
  const quickInfo = h('div', { class: 'small' });
  async function quickParse() {
    const txt = quickText.value.trim();
    if (!txt) return toast('Chưa có nội dung để tách.', 'warn');
    const cls = recordable.filter(c => c.campus_id === fCampus.value);
    const defCls = cls.length === 1 ? cls[0].class_id : (lines.find(l => l.cls.value)?.cls.value || '');
    const recs = parseLogbook(txt, { classes: recordable, defaultClassId: defCls, defaultDate: fDate.value, year: +todayKey.slice(0, 4) });
    if (!recs.length) return toast('Không tách được dòng nào. Mỗi ý viết trên một dòng: tên học sinh + lỗi.', 'warn', 6000);
    quickInfo.replaceChildren(h('span', { class: 'spinner sm' }), ' Đang đối chiếu tên học sinh…');
    lines.filter(isBlank).forEach(l => { lines = lines.filter(x => x !== l); l.el.remove(); });
    let warnCount = 0;
    for (const r of recs) {
      const warn = [...r.warn];
      const classId = r.classId || defCls;
      if (!classId) warn.push('Chọn lớp');
      if (r.date && (r.date > todayKey || r.date < minKey)) warn.push('Ngày ' + r.date.split('-').reverse().join('/') + ' ngoài thời gian được nhập');
      let studentId = '';
      if (r.name && classId) {
        const m = matchStudent(r.name, await studentsOf(classId));
        if (m.value) studentId = m.value;
        else warn.push(m.candidates.length ? `Nhiều bạn tên "${r.name}" – chọn đúng học sinh` : `Không tìm thấy "${r.name}" trong lớp – chọn học sinh`);
      }
      const t = r.code ? typeByCode(r.code) : null;
      if (r.code && !t) warn.push('Danh mục chưa có lỗi này – chọn lỗi');
      const uniq = [...new Set(warn)];
      if (uniq.length) warnCount++;
      addLine(null, { classId, date: r.dateInvalid ? '' : r.date, time: r.time, typeId: t?.type_id || '', studentId,
        note: `Sổ dòng ${r.line}: ${r.raw}`.slice(0, 180), warn: uniq });
    }
    quickText.value = '';
    quickInfo.replaceChildren(h('div', { class: warnCount ? 'notice yellow' : 'notice green' },
      `Đã tách ${recs.length} bản ghi` + (warnCount ? `, ${warnCount} dòng tô vàng cần kiểm tra/chọn lại.` : ', tất cả đã điền đủ.') + ' Xem lại bên dưới rồi bấm GỬI TẤT CẢ.'));
    list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- MỘT LỖI – NHIỀU HỌC SINH ---------- */
  async function bulkPick() {
    const cls = recordable.filter(c => c.campus_id === fCampus.value);
    const fCls = h('select', {}, options(cls, { value: 'class_id', label: 'name', empty: '— Lớp —', selected: cls.length === 1 ? cls[0].class_id : undefined }));
    const fType = searchSelect({ placeholder: 'Gõ để tìm lỗi', items: typeItems() });
    const fD = h('input', { type: 'date', value: fDate.value, max: todayKey, min: minKey });
    const fT = time24(fDate.value === todayKey ? nowHM() : '07:00');
    const box2 = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 14px;max-height:45vh;overflow:auto' });
    const fill = async () => {
      box2.replaceChildren();
      for (const s of await studentsOf(fCls.value)) {
        const cb = h('input', { type: 'checkbox', value: s.value });
        box2.append(h('label', { style: 'display:inline-flex;align-items:center;gap:6px;min-width:190px' }, cb, s.label));
      }
      if (!box2.children.length) box2.append(h('div', { class: 'muted small' }, fCls.value ? 'Không tải được danh sách học sinh.' : 'Chọn lớp trước.'));
    };
    fCls.addEventListener('change', fill); fill();
    modal({ title: '👥 Một lỗi – nhiều học sinh', wide: true,
      body: h('div', {}, h('div', { class: 'grid c2' }, field('Lớp', fCls), field('Ngày', fD)), field('Giờ', fT), field('Lỗi vi phạm / nội dung tuyên dương', fType), field('Tích các học sinh', box2)),
      actions: [{ label: 'Hủy' }, { label: 'Thêm các dòng', kind: 'primary', onClick: () => {
        const ids = [...box2.querySelectorAll('input:checked')].map(x => x.value);
        if (!fType.value) { toast('Chọn lỗi.', 'err'); return false; }
        if (!ids.length) { toast('Tích ít nhất một học sinh.', 'err'); return false; }
        lines.filter(isBlank).forEach(l => { lines = lines.filter(x => x !== l); l.el.remove(); });
        ids.forEach(id => addLine(null, { classId: fCls.value, date: fD.value, time: fT.value, typeId: fType.value, studentId: id }));
        toast(`Đã thêm ${ids.length} dòng.`, 'ok');
      } }] });
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
    cam, pick, h('div', { style: 'margin:10px 0' }, thumbs, photoBar),
    h('div', { class: 'grid c2' }, field('Cơ sở', fCampus), field('Ngày trực (theo sổ)', fDate, 'Được nhập lại các ngày trong tuần đó (thứ Sáu, thứ Bảy, Chủ nhật vẫn nhập bù được cho tuần trước).')),
    h('details', { class: 'acc', open: true, style: 'margin:6px 0 12px' }, h('summary', {}, '✍️ Nhập nhanh: gõ hoặc nói theo sổ, ứng dụng tự tách dòng'),
      h('div', { style: 'padding-top:8px' },
        h('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'Mỗi ý một dòng: tên học sinh + lỗi (có thể nhiều tên, nhiều lỗi cách nhau dấu phẩy). Dòng ghi ngày (28/10/2026) hoặc buổi (Buổi chiều, HĐGG, chào cờ) áp dụng cho các dòng sau. Có thể bấm 🎤 trên bàn phím điện thoại để đọc thay vì gõ.'),
        quickText,
        h('div', { class: 'grid c2', style: 'margin-top:8px' },
          h('button', { class: 'btn primary', type: 'button', onclick: quickParse }, '⚡ Tách thành các dòng'),
          h('button', { class: 'btn', type: 'button', onclick: bulkPick }, '👥 Một lỗi – nhiều học sinh')),
        quickInfo)),
    list,
    h('button', { class: 'btn block', type: 'button', style: 'margin:4px 0 12px;border-style:dashed', onclick: () => addLine(lines[lines.length - 1]) }, '＋ Thêm dòng'),
    h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Người ghi nhận: ', h('b', {}, app.user.full_name)),
    sendBtn, status));
  addLine();

  function occurredAt(ln) { return `${ln.date.value || fDate.value}T${ln.time.value || '07:00'}:00+07:00`; }
  function lineData(ln) {
    return { client_request_id: ln.id, class_id: ln.cls.value, type_id: ln.type.value, student_id: ln.student.value, note: ('[Sổ trực] ' + ln.note.value.trim()).trim(), occurred_at: occurredAt(ln) };
  }

  async function send() {
    if (busy) return;
    const todo = lines.filter(l => l.state !== 'done');
    if (!todo.length) return toast('Không còn dòng nào cần gửi.', 'warn');
    if (b.settings.require_evidence === '1' && !photos.length) return toast('Cần chụp hoặc chọn ảnh trang sổ.', 'err');
    for (const [i, ln] of todo.entries()) {
      const dk = ln.date.value;
      if (!dk || dk > todayKey || dk < minKey) return toast(`Dòng ${lines.indexOf(ln) + 1}: ngày ${dk ? dk.split('-').reverse().join('/') : '(trống)'} ngoài thời gian được nhập (tuần thi đua hiện tại; T6, T7, CN được nhập bù tuần trước). Sửa ngày hoặc bỏ dòng.`, 'err', 7000);
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
        refreshPhotos();
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
    photos.forEach(p => p.url && URL.revokeObjectURL(p.url));
    photos = []; carrier = null; thumbs.replaceChildren(); photoBar.replaceChildren(); list.replaceChildren(); lines = []; status.replaceChildren(); addLine();
  }
}
