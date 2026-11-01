import { h, options, field, toast, loading, errorBox, badge, fmtDateTime, nowLocalInput, signed, uid, askReason, modal, b64ToBlob, searchSelect } from '../ui.js';
import { processImage } from '../image.js';
import * as outbox from '../queue.js';

/** TAB 2 – GHI NHẬN VI PHẠM – MINH CHỨNG */
export async function render(el, app, params) {
  const b = app.boot, u = app.user;
  let images = [];       // ảnh đã xử lý, chờ gửi
  let busy = false;

  const recordable = b.classes.filter(c => u.allScope || u.perms.includes('*') || u.campusIds.includes(c.campus_id) || u.classIds.includes(c.class_id));
  const campuses = b.campuses.filter(cs => recordable.some(c => c.campus_id === cs.campus_id));
  if (!recordable.length) { el.append(h('div', { class: 'notice red' }, 'Tài khoản chưa được phân công cơ sở/lớp để ghi nhận. Liên hệ Tổng phụ trách.')); return; }

  const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const libInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const thumbs = h('div', { class: 'thumbs' });
  const fCampus = h('select', {}, options(campuses, { value: 'campus_id', label: 'name' }));
  const fClass = h('select');
  const fStudent = searchSelect({ placeholder: 'Gõ tên học sinh để tìm (có thể bỏ trống)', emptyLabel: '— Không xác định —' });
  const fType = searchSelect({ placeholder: 'Gõ để tìm lỗi, ví dụ: mu, muon, truy bai', items: b.types.map(t => ({
    value: t.type_id, label: `${t.kind === 'CONG' ? '[CỘNG] ' : ''}${t.name}${t.points != null ? ' (' + signed(t.points) + ')' : ''}`, sub: t.group_name || '' })) });
  const pts = h('div', { class: 'small muted' });
  const fNote = h('textarea', { placeholder: 'Mô tả ngắn (không ghi thông tin cá nhân không cần thiết)', maxlength: 1000 });
  const timeShow = h('b', {}, 'Tự động theo giờ máy chủ khi gửi');
  const fTime = h('input', { type: 'datetime-local', hidden: true });
  let adjustReason = '';
  const canAdjust = app.can('incident.adjustTime');
  const status = h('div');

  const fillClasses = () => {
    fClass.replaceChildren(...options(recordable.filter(c => c.campus_id === fCampus.value), { value: 'class_id', label: 'name', empty: '— Chọn lớp —', selected: params.class_id }));
    loadStudents();
  };
  async function loadStudents() {
    fStudent.setItems([]);
    if (!fClass.value || !app.can(['student.lookup', 'student.view', 'incident.review'])) return;
    try {
      const list = await app.call('student.search', { class_id: fClass.value });
      // Chỉ hiện họ tên; trùng tên trong lớp thì đánh số (1), (2) để phân biệt
      const count = {}, seen = {};
      list.forEach(s => { count[s.full_name] = (count[s.full_name] || 0) + 1; });
      fStudent.setItems(list.map(s => ({ value: s.student_id, label: count[s.full_name] > 1 ? `${s.full_name} (${seen[s.full_name] = (seen[s.full_name] || 0) + 1})` : s.full_name })));
    } catch { /* không bắt buộc */ }
  }
  fCampus.addEventListener('change', fillClasses);
  fClass.addEventListener('change', loadStudents);
  fType.addEventListener('change', () => {
    const t = app.typeById(fType.value);
    pts.textContent = !t ? '' : t.points == null ? '⚠ Chưa có quy định điểm cho lỗi này – Tổng phụ trách sẽ nhập điểm khi duyệt.' : `Điểm dự kiến: ${signed(t.points)} (điểm chính thức do người duyệt xác nhận)`;
  });
  if (params.class_id) { const c = app.classById(params.class_id); if (c) fCampus.value = c.campus_id; }
  fillClasses();

  async function addFiles(files) {
    for (const f of files) {
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|hei[cf])$/i.test(f.name)) { toast('Bỏ qua tệp không phải ảnh: ' + f.name, 'warn'); continue; }
      if (f.size > 15 * 1024 * 1024) { toast('Ảnh quá 15 MB: ' + f.name, 'err'); continue; }
      const ph = h('div', { class: 'thumb' }, h('span', { class: 'spinner' }));
      thumbs.append(ph);
      try {
        const img = await processImage(f);
        if (images.some(x => x.checksum === img.checksum)) { ph.remove(); toast('Ảnh này đã được chọn rồi.', 'warn'); continue; }
        if (img.warning) toast(img.warning, 'warn', 6000);
        images.push(img);
        const url = URL.createObjectURL(img.thumb || img.blob);
        ph.replaceChildren(h('img', { src: url, alt: 'Ảnh minh chứng' }), h('button', { class: 'x', type: 'button', 'aria-label': 'Bỏ ảnh', onclick: () => { images = images.filter(x => x !== img); ph.remove(); } }, '✕'));
      } catch (e) { ph.remove(); toast('Không đọc được ảnh: ' + e.message, 'err'); }
    }
  }
  /**
   * Android thu hồi quyền đọc ảnh ngay khi ô chọn tệp bị xóa, và có thể thu hồi khi gửi lại sau.
   * Vì vậy chép toàn bộ nội dung ảnh vào bộ nhớ TRƯỚC, rồi mới xóa ô chọn tệp.
   */
  async function takeFiles(input) {
    const picked = [...input.files], copies = [];
    for (const f of picked) {
      try { copies.push(new File([await f.arrayBuffer()], f.name || ('anh_' + Date.now() + '.jpg'), { type: f.type, lastModified: f.lastModified })); }
      catch (e) { toast('Không đọc được ảnh ' + (f.name || '') + '. Hãy chụp lại hoặc chọn ảnh khác.', 'err', 6000); }
    }
    input.value = '';
    await addFiles(copies);
  }
  camInput.addEventListener('change', () => takeFiles(camInput));
  libInput.addEventListener('change', () => takeFiles(libInput));

  const hero = h('button', { class: 'btn btn-hero', type: 'button', onclick: () => camInput.click() }, h('span', { class: 'ic' }, '📷'), 'CHỤP ẢNH – GHI NHẬN VI PHẠM');
  const timeBox = h('div', { class: 'f' }, h('span', { class: 'small muted' }, 'Ngày giờ ghi nhận: '), timeShow,
    canAdjust ? h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => {
      const r = await askReason('Điều chỉnh ngày giờ ghi nhận', { label: 'Lý do điều chỉnh (bắt buộc)', min: 5 });
      if (!r) return; adjustReason = r; fTime.hidden = false; fTime.value = nowLocalInput(); timeShow.textContent = 'Điều chỉnh: ' + r;
    } }, 'Điều chỉnh') : '', fTime);
  const submitBtn = h('button', { class: 'btn green block', type: 'button', style: 'min-height:52px;font-size:17px', onclick: submit }, '📤 GỬI GHI NHẬN');

  el.append(h('div', { class: 'card' },
    hero, camInput, libInput,
    h('div', { class: 'actions', style: 'margin:10px 0' }, h('button', { class: 'btn', type: 'button', onclick: () => libInput.click() }, '🖼️ Chọn ảnh từ thư viện (nhiều ảnh)')),
    thumbs,
    h('div', { class: 'grid c2', style: 'margin-top:12px' }, field('Cơ sở', fCampus), field('Lớp vi phạm', fClass)),
    field('Học sinh (nếu xác định được)', fStudent),
    field('Loại vi phạm', fType, pts), field('Ghi chú', fNote), timeBox,
    h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Người ghi nhận: ', h('b', {}, u.full_name), ' – ', u.role_label),
    submitBtn, status));

  // Hộp thư đi
  const outCard = h('div', { class: 'card' }, h('h2', {}, '📮 Trạng thái gửi trên máy này'));
  const outList = h('div', { class: 'list' });
  outCard.append(outList, h('div', { class: 'small muted' }, 'Bản ghi chỉ được coi là ĐÃ GỬI khi máy chủ xác nhận. Nếu mất mạng, dữ liệu được giữ trên máy và tự gửi lại khi có mạng.'));
  el.append(outCard);
  const mine = h('div', { class: 'card' }, h('h2', {}, '🗂️ Bản ghi của tôi (trên máy chủ)'));
  const mineBody = h('div');
  mine.append(mineBody); el.append(mine);

  const unsub = outbox.subscribe(() => drawOutbox());
  const obs = new MutationObserver(() => { if (!el.isConnected) { unsub(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
  await drawOutbox();
  loadMine();

  async function submit() {
    if (busy) return;
    if (!fClass.value) return toast('Chọn lớp vi phạm.', 'err');
    if (!fType.value) return toast('Chọn loại vi phạm.', 'err');
    if (b.settings.require_evidence === '1' && !images.length) return toast('Cần ít nhất 1 ảnh minh chứng.', 'err');
    busy = true; submitBtn.disabled = true;
    const offline = !navigator.onLine;
    const rec = {
      id: uid() + '-' + Date.now().toString(36), created_at: new Date().toISOString(), state: 'pending', uploaded: [], attempts: 0,
      label: `${app.classById(fClass.value)?.name} – ${app.typeById(fType.value)?.name}`,
      form: { class_id: fClass.value, type_id: fType.value, student_id: fStudent.value, note: fNote.value.trim(),
        occurred_at: !fTime.hidden && fTime.value ? fTime.value + ':00+07:00' : new Date().toISOString(), offline: true, adjust_reason: !fTime.hidden ? adjustReason : '' },
      images: images.map(i => ({ name: i.name, mime: i.mime, blob: i.blob, checksum: i.checksum, width: i.width, height: i.height, preview: i.preview, thumb: i.thumb }))
    };
    try { await outbox.put(rec); }
    catch (e) { busy = false; submitBtn.disabled = false; return toast('Không lưu được trên máy: ' + e.message, 'err'); }
    // Đã lưu an toàn trên máy → làm mới biểu mẫu để ghi tiếp
    images = []; thumbs.replaceChildren(); fNote.value = ''; fStudent.value = ''; fTime.hidden = true; adjustReason = ''; timeShow.textContent = 'Tự động theo giờ máy chủ khi gửi';
    if (offline) {
      status.replaceChildren(h('div', { class: 'notice yellow' }, 'Đang mất mạng: bản ghi đã lưu trên máy, CHƯA gửi lên máy chủ. Hệ thống sẽ tự gửi khi có mạng.'));
      busy = false; submitBtn.disabled = false; return;
    }
    // Gửi ngầm: biểu mẫu sẵn sàng ngay cho lần ghi nhận tiếp theo. Chỉ báo "đã lưu" khi máy chủ xác nhận.
    busy = false; submitBtn.disabled = false;
    status.replaceChildren(h('div', { class: 'notice' }, h('span', { class: 'spinner' }), ` Đang gửi "${rec.label}" lên máy chủ… Bạn có thể ghi nhận tiếp, theo dõi ở mục "Trạng thái gửi" bên dưới.`));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    outbox.send(rec.id).then(r => {
      toast(`✔ Đã lưu: ${rec.label} (${r.images.length} ảnh) – CHỜ DUYỆT` + (r.dup ? ' – nghi trùng' : ''), 'ok', 5000);
      if (el.isConnected) { status.replaceChildren(h('div', { class: 'notice green' }, `✔ Máy chủ đã lưu "${rec.label}" và ${r.images.length} ảnh. Trạng thái: CHỜ DUYỆT.`)); loadMine(); }
    }).catch(e => {
      toast(`✖ Chưa gửi được "${rec.label}": ${e.message}. Dữ liệu vẫn giữ trên máy.`, 'err', 8000);
      if (el.isConnected) status.replaceChildren(h('div', { class: 'notice red' }, `✖ Chưa gửi được "${rec.label}": ${e.message} – Dữ liệu vẫn được giữ trên máy, bấm "Gửi lại" bên dưới.`));
    });
  }

  async function drawOutbox() {
    const items = await outbox.list();
    outList.replaceChildren();
    if (!items.length) { outList.append(h('div', { class: 'empty' }, 'Không có bản ghi nào đang chờ trên máy.')); return; }
    for (const r of items.slice(0, 30)) {
      const st = r.state === 'done' ? h('span', { class: 'badge green' }, 'Đã lưu trên máy chủ') : r.state === 'sending' ? h('span', { class: 'badge blue' }, 'Đang gửi')
        : r.state === 'error' ? h('span', { class: 'badge red' }, 'Gửi lỗi') : h('span', { class: 'badge yellow' }, 'Chờ gửi');
      const acts = h('div', { class: 'actions' });
      if (r.state === 'error' || r.state === 'pending') {
        acts.append(h('button', { class: 'btn sm primary', onclick: async () => { try { await outbox.send(r.id); toast('Đã gửi thành công', 'ok'); loadMine(); } catch (e) { toast(e.message, 'err'); } } }, 'Gửi lại'));
        acts.append(h('button', { class: 'btn sm', onclick: async () => {
          const why = await askReason('Bỏ bản ghi chưa gửi?', { label: 'Lý do (ví dụ: chọn sai lớp)', okLabel: 'Bỏ bản ghi', kind: 'red' });
          if (!why) return;
          if (r.incident_id) { try { await app.call('incident.cancel', { incident_id: r.incident_id, reason: why }); } catch (e) { return toast(e.message, 'err'); } }
          await outbox.remove(r.id); drawOutbox();
        } }, 'Bỏ'));
      }
      outList.append(h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', {}, r.label), h('div', { class: 'small muted' },
        new Date(r.created_at).toLocaleString('vi-VN'), ' · ', `${r.uploaded.length}/${r.images.length} ảnh`, r.stage ? ' · ' + r.stage : '', r.error ? h('div', { class: 'neg' }, r.error) : '')), st, acts));
    }
  }

  async function loadMine() {
    loading(mineBody);
    try {
      const res = await app.call('incident.list', { mine: true, limit: 30 });
      mineBody.replaceChildren(res.items.length ? h('div', { class: 'list' }, res.items.map(i => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('b', {}, `${i.class_name} – ${i.type_name}`), h('div', { class: 'small muted' }, fmtDateTime(i.occurred_at), ' · ', i.evidence.length + ' ảnh',
          i.approved_points !== '' ? ' · Điểm: ' + signed(i.approved_points) : i.proposed_points !== '' ? ' · Dự kiến: ' + signed(i.proposed_points) : ''),
          i.status === 'YEU_CAU_BO_SUNG' ? h('div', { class: 'notice yellow' }, 'Yêu cầu bổ sung: ' + i.review_reason, ' ', h('button', { class: 'btn sm', onclick: () => supplement(i) }, 'Bổ sung ảnh')) : '',
          i.status === 'BAC_BO' ? h('div', { class: 'small neg' }, 'Lý do: ' + i.review_reason) : ''),
        badge(i.status),
        i.evidence.length ? h('button', { class: 'btn sm', onclick: () => viewEvidence(app, i) }, 'Ảnh') : '')))
        : h('div', { class: 'empty' }, 'Bạn chưa có bản ghi nào.'));
    } catch (e) { errorBox(mineBody, e, loadMine); }
  }

  /** Bổ sung ảnh cho bản ghi bị yêu cầu bổ sung: tải ảnh rồi gửi lại để chờ duyệt. */
  function supplement(inc) {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple: true });
    const info = h('div', { class: 'small muted' });
    modal({ title: 'Bổ sung minh chứng – ' + inc.class_name, body: h('div', {}, inp, info), actions: [{ label: 'Hủy' }, { label: 'Gửi bổ sung', kind: 'green', onClick: async () => {
      if (!inp.files.length) { toast('Chọn ít nhất 1 ảnh', 'err'); return false; }
      for (const f of inp.files) {
        const img = await processImage(f);
        info.textContent = 'Đang gửi ' + f.name + '…';
        const { blobToB64 } = await import('../ui.js');
        await app.call('incident.addEvidence', { incident_id: inc.incident_id, base64: await blobToB64(img.blob), checksum: img.checksum, mime_type: img.mime, filename: img.name,
          width: img.width, height: img.height, preview_base64: img.preview ? await blobToB64(img.preview) : '', thumb_base64: img.thumb ? await blobToB64(img.thumb) : '' }, { timeout: 240000 });
      }
      await app.call('incident.submit', { incident_id: inc.incident_id });
      toast('Đã bổ sung, bản ghi chuyển về CHỜ DUYỆT', 'ok'); loadMine();
    } }] });
  }
}

/** Xem ảnh minh chứng (backend kiểm tra quyền trước khi trả ảnh). */
export async function viewEvidence(app, inc, size = 'preview') {
  const box = h('div', { class: 'viewer' });
  modal({ title: `${inc.class_name} – ${inc.type_name}`, body: box, wide: true });
  for (const ev of inc.evidence) {
    const slot = h('div', { style: 'margin-bottom:12px' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
    box.append(slot);
    try {
      const r = await app.call('evidence.get', { evidence_id: ev.evidence_id, size }, { timeout: 120000 });
      const url = URL.createObjectURL(b64ToBlob(r.base64, r.mime));
      slot.replaceChildren(h('img', { src: url, alt: 'Minh chứng' }), h('div', { class: 'small muted center' }, `${ev.filename} · ${ev.width || '?'}×${ev.height || '?'} · ${ev.evidence_id}`,
        size !== 'full' ? h('button', { class: 'btn ghost sm', onclick: async () => {
          const f = await app.call('evidence.get', { evidence_id: ev.evidence_id, size: 'full' }, { timeout: 180000 });
          slot.querySelector('img').src = URL.createObjectURL(b64ToBlob(f.base64, f.mime));
        } }, 'Xem ảnh gốc') : ''));
    } catch (e) { slot.replaceChildren(h('div', { class: 'notice red' }, e.message)); }
  }
}
