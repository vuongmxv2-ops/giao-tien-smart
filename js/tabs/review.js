import { h, options, field, toast, loading, errorBox, badge, fmtDateTime, signed, askReason, modal, b64ToBlob, nowLocalInput, searchSelect, dateTime24 } from '../ui.js';
import { viewEvidence } from './record.js';
import { thumbUrl } from '../thumbs.js';

/** TAB 5 – DUYỆT MINH CHỨNG: DUYỆT – SỬA – BÁC BỎ – GỘP TRÙNG – YÊU CẦU BỔ SUNG */
export async function render(el, app) {
  const b = app.boot;
  const fStatus = h('select', {}, options([{ value: 'pending', label: 'Chờ duyệt + cần bổ sung' }, { value: 'CHO_DUYET', label: 'Chỉ chờ duyệt' }, { value: 'DA_DUYET', label: 'Đã duyệt (để sửa/hủy duyệt nhầm)' }, { value: 'BAC_BO', label: 'Đã bác bỏ' }]));
  const fWeek = h('select', {}, options(b.weeks, { value: 'week_id', label: w => app.weekLabel(w) + (w.status === 'LOCKED' ? ' 🔒' : ''), empty: 'Tất cả tuần' }));
  const fCampus = h('select', {}, options(b.campuses, { value: 'campus_id', label: 'name', empty: 'Toàn trường' }));
  const fClass = h('select', {}, options(b.classes, { value: 'class_id', label: 'name', empty: 'Tất cả lớp' }));
  // Mục: tất cả / vi phạm / tuyên dương (lọc theo loại cộng/trừ của nội dung)
  let kindFilter = '';
  const kSeg = h('div', { class: 'seg mode-seg kind-seg' });
  const kBtns = [['', 'Tất cả'], ['TRU', '⚠️ Vi phạm'], ['CONG', '🌟 Tuyên dương']].map(([k, l]) => {
    const btn = h('button', { type: 'button', onclick: () => { kindFilter = k; draw(total); } }, l); btn.dataset.k = k; kSeg.append(btn); return btn;
  });
  el.append(kSeg, h('div', { class: 'filters' }, field('Trạng thái', fStatus), field('Tuần', fWeek), field('Cơ sở', fCampus), field('Lớp', fClass)));
  const bar = h('div', { class: 'actions', style: 'margin-bottom:10px' });
  const body = h('div');
  el.append(bar, body);
  [fStatus, fWeek, fCampus, fClass].forEach(x => x.addEventListener('change', load));
  let all = [], items = [], selected = new Set(), total = 0;
  const isPraise = i => { const t = app.typeById(i.type_id); if (t) return t.kind === 'CONG'; const p = i.approved_points !== '' ? i.approved_points : i.proposed_points; return Number(p) > 0; };

  async function load() {
    loading(body); selected.clear();
    try {
      const st = fStatus.value === 'pending' ? ['CHO_DUYET', 'YEU_CAU_BO_SUNG'] : fStatus.value;
      const r = await app.call('incident.list', { status: st, week_id: fWeek.value, campus_id: fCampus.value, class_id: fClass.value, limit: 100 });
      all = r.items; total = r.total; draw();
    } catch (e) { errorBox(body, e, load); }
  }

  function draw() {
    const nCong = all.filter(isPraise).length, nTru = all.length - nCong;
    kBtns.forEach(btn => {
      btn.classList.toggle('on', btn.dataset.k === kindFilter);
      btn.textContent = { '': `Tất cả (${all.length})`, TRU: `⚠️ Vi phạm (${nTru})`, CONG: `🌟 Tuyên dương (${nCong})` }[btn.dataset.k];
    });
    items = kindFilter ? all.filter(i => isPraise(i) === (kindFilter === 'CONG')) : all;
    [...selected].forEach(id => { if (!items.some(i => i.incident_id === id)) selected.delete(id); });
    bar.replaceChildren(h('span', { class: 'muted' }, `${items.length}/${total} bản ghi`));
    if (fStatus.value !== 'DA_DUYET' && fStatus.value !== 'BAC_BO') {
      bar.append(h('button', { class: 'btn sm', onclick: () => { items.filter(i => i.status === 'CHO_DUYET' && i.proposed_points !== '').forEach(i => selected.add(i.incident_id)); draw(); } }, 'Chọn tất cả có điểm dự kiến'),
        h('button', { class: 'btn sm green', onclick: approveSelected }, 'Duyệt các bản đã chọn'));
    }
    body.replaceChildren(...(items.length ? items.map(card) : [h('div', { class: 'empty card' }, kindFilter === 'CONG' ? 'Không có bản ghi tuyên dương nào.' : 'Không có bản ghi nào cần xử lý. 🎉')]));
  }

  function card(i) {
    const slots = new Map();
    const thumbs = h('div', { class: 'thumbs' }, i.evidence.map(ev => {
      const t = h('div', { class: 'thumb', title: 'Xem ảnh lớn', onclick: () => viewEvidence(app, i) }, h('span', { class: 'spinner' }));
      slots.set(ev.evidence_id, t); loadThumb(ev.evidence_id, t); return t;
    }));
    const canTrim = i.evidence.length > 1 && ['CHO_DUYET', 'YEU_CAU_BO_SUNG', 'DA_DUYET'].includes(i.status);
    const pts = h('input', { type: 'number', step: '0.5', value: i.approved_points !== '' ? i.approved_points : i.proposed_points, style: 'max-width:120px' });
    const cb = h('input', { type: 'checkbox', checked: selected.has(i.incident_id), onchange: e => e.target.checked ? selected.add(i.incident_id) : selected.delete(i.incident_id) });
    const own = i.submitted_by === app.user.user_id && app.user.role !== 'ADMIN';
    const acts = h('div', { class: 'actions' });
    if (i.status === 'CHO_DUYET') {
      acts.append(h('button', { class: 'btn green', disabled: own, onclick: () => approve(i, pts.value) }, '✔ DUYỆT'));
      acts.append(h('button', { class: 'btn yellow', onclick: () => act('review.requestInfo', i, 'Yêu cầu bổ sung minh chứng', 'Nội dung cần bổ sung') }, 'YÊU CẦU BỔ SUNG'));
    }
    if (['CHO_DUYET', 'YEU_CAU_BO_SUNG', 'DA_DUYET'].includes(i.status)) {
      acts.append(h('button', { class: 'btn', onclick: () => edit(i) }, '✎ SỬA'));
      acts.append(h('button', { class: 'btn red', onclick: () => act('review.reject', i, i.status === 'DA_DUYET' ? 'Hủy duyệt / bác bỏ (duyệt nhầm)' : 'Bác bỏ bản ghi', 'Lý do bác bỏ') }, '✖ BÁC BỎ'));
      acts.append(h('button', { class: 'btn', onclick: () => merge(i) }, '⧉ GỘP TRÙNG'));
    }
    const praise = isPraise(i);
    return h('div', { class: 'review-card' + (i.dup_flag ? ' dup' : '') + (praise ? ' praise' : '') },
      h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, i.status === 'CHO_DUYET' ? cb : '',
        praise ? h('span', { class: 'badge', style: 'background:#ef6c00;color:#fff' }, '🌟 Tuyên dương') : h('span', { class: 'badge red' }, 'Vi phạm'),
        h('b', { style: 'font-size:16px' }, `${i.class_name} – ${i.type_name}`), badge(i.status),
        i.dup_flag ? h('span', { class: 'badge yellow' }, '⚠ Nghi trùng với ' + i.duplicate_of) : '', i.time_source === 'OFFLINE' ? h('span', { class: 'badge' }, 'Gửi sau khi mất mạng') : '',
        i.time_source === 'LOGBOOK' ? h('span', { class: 'badge', style: 'background:#eef2ff;color:#4338ca' }, '📒 Theo sổ trực') : '',
        i.time_source === 'ADJUSTED' ? h('span', { class: 'badge yellow' }, 'Giờ đã điều chỉnh') : ''),
      thumbs,
      canTrim ? h('div', { class: 'actions', style: 'margin:-4px 0 8px' }, h('button', { class: 'btn sm', onclick: () => trimImages(i, slots) }, `✂ Lược bớt ảnh (${i.evidence.length} ảnh)`)) : '',
      h('div', { class: 'meta' },
        h('b', {}, 'Lớp'), h('span', {}, i.class_name + ' · ' + app.campusName(i.campus_id)),
        h('b', {}, 'Học sinh'), h('span', {}, i.student_name || '—'),
        h('b', {}, 'Ngày giờ'), h('span', {}, fmtDateTime(i.occurred_at) + (i.time_adjust_reason ? ` (${i.time_adjust_reason})` : '')),
        h('b', {}, 'Nội dung'), h('span', {}, i.type_name),
        h('b', {}, 'Người ghi nhận'), h('span', {}, i.submitted_by_name || i.submitted_by),
        h('b', {}, 'Điểm dự kiến'), h('span', {}, i.proposed_points === '' ? h('span', { class: 'neg' }, 'Chưa có quy định – nhập điểm') : signed(i.proposed_points)),
        h('b', {}, 'Ghi chú'), h('span', {}, i.note || '—'),
        i.review_reason ? h('b', {}, 'Xử lý') : '', i.review_reason ? h('span', {}, i.review_reason + (i.reviewed_by_name ? ' – ' + i.reviewed_by_name : '')) : ''),
      i.status === 'CHO_DUYET' ? field('Điểm duyệt (âm = trừ, dương = cộng)', pts) : (i.approved_points !== '' ? h('div', {}, 'Điểm đã duyệt: ', h('b', { class: i.approved_points < 0 ? 'neg' : 'pos' }, signed(i.approved_points))) : ''),
      own ? h('div', { class: 'small muted' }, 'Bạn là người ghi nhận nên không thể tự duyệt bản ghi này.') : '',
      acts);
  }

  async function loadThumb(id, slot) {
    try {
      slot.replaceChildren(h('img', { src: await thumbUrl(id), alt: 'Ảnh minh chứng' }));
    } catch (e) { slot.replaceChildren('Lỗi ảnh'); slot.title = e.message; }
  }

  async function approve(i, pointsValue) {
    const changed = pointsValue !== '' && Number(pointsValue) !== Number(i.proposed_points);
    let reason = '';
    if (pointsValue === '') return toast('Nhập điểm trước khi duyệt.', 'err');
    if (changed) { reason = await askReason('Điểm duyệt khác điểm dự kiến', { label: 'Lý do' }); if (!reason) return; }
    try { await app.call('review.approve', { incident_id: i.incident_id, approved_points: Number(pointsValue), reason }); toast('Đã duyệt – điểm đã được ghi nhận', 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  async function approveSelected() {
    if (!selected.size) return toast('Chưa chọn bản ghi nào.', 'warn');
    try {
      const r = await app.call('review.approveMany', { ids: [...selected] });
      const ok = r.results.filter(x => x.ok).length, bad = r.results.filter(x => !x.ok);
      toast(`Đã duyệt ${ok} bản ghi` + (bad.length ? `, ${bad.length} lỗi: ${bad[0].message}` : ''), bad.length ? 'warn' : 'ok', 7000);
      load();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function act(action, i, title, label) {
    const reason = await askReason(title, { label, kind: action === 'review.reject' ? 'red' : 'primary' });
    if (!reason) return;
    try { await app.call(action, { incident_id: i.incident_id, reason }); toast('Đã cập nhật', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  }

  function edit(i) {
    const fc = h('select', {}, options(b.classes, { value: 'class_id', label: 'name', selected: i.class_id_at_time }));
    // Tìm nhanh lỗi (gõ không dấu cũng được); giữ được cả loại đã ngừng dùng của bản ghi cũ
    const typeItems = b.types.map(t => ({ value: t.type_id, label: (t.kind === 'CONG' ? '🌟 ' : '') + t.name + (t.points != null ? ` (${signed(t.points)})` : ''), sub: t.group_name || '' }));
    if (!typeItems.some(t => t.value === i.type_id)) typeItems.unshift({ value: i.type_id, label: i.type_name, sub: 'Loại đã ngừng dùng' });
    const ft = searchSelect({ placeholder: 'Gõ để tìm lỗi, ví dụ: dien thoai, muon, so vin', items: typeItems });
    ft.value = i.type_id;
    const ftime = dateTime24(String(i.occurred_at).substr(0, 16) || nowLocalInput());
    const fp = h('input', { type: 'number', step: '0.5', value: i.approved_points !== '' ? i.approved_points : '' , placeholder: 'Để trống = theo nội quy' });
    const fn = h('textarea', {}, i.note || '');
    const fr = h('textarea', { placeholder: 'Bắt buộc' });
    modal({ title: 'Sửa bản ghi ' + i.incident_id, body: h('div', {},
      i.status === 'DA_DUYET' ? h('div', { class: 'notice yellow' }, 'Bản ghi đã duyệt: giao dịch điểm cũ sẽ bị hủy và tạo giao dịch mới, có lưu lịch sử.') : '',
      field('Lớp', fc), field('Loại vi phạm', ft), field('Ngày giờ', ftime), field('Điểm duyệt', fp), field('Ghi chú', fn), field('Lý do sửa', fr)),
      actions: [{ label: 'Hủy' }, { label: 'Lưu thay đổi', kind: 'primary', onClick: async () => {
        const changes = {};
        if (fc.value !== i.class_id_at_time) changes.class_id = fc.value;
        if (ft.value !== i.type_id) changes.type_id = ft.value;
        if (ftime.value && ftime.value !== String(i.occurred_at).substr(0, 16)) changes.occurred_at = ftime.value + ':00+07:00';
        if (fp.value !== '' && Number(fp.value) !== Number(i.approved_points)) changes.approved_points = Number(fp.value);
        if (fn.value !== (i.note || '')) changes.note = fn.value;
        if (!Object.keys(changes).length) { toast('Chưa có thay đổi.', 'warn'); return false; }
        await app.call('review.edit', { incident_id: i.incident_id, changes, reason: fr.value });
        toast('Đã lưu và ghi nhật ký', 'ok'); load();
      } }] });
  }

  /** Chọn ảnh thừa/trùng để bỏ khỏi bản ghi. Ảnh không bị xóa trên Drive, chỉ không còn tính là minh chứng. */
  function trimImages(i, slots) {
    const picks = i.evidence.map((ev, k) => {
      const src = slots.get(ev.evidence_id)?.querySelector('img')?.src;
      const cb = h('input', { type: 'checkbox', value: ev.evidence_id });
      const tile = h('label', { class: 'trim-tile' }, src ? h('img', { src, alt: 'Ảnh ' + (k + 1) }) : h('div', { class: 'small muted' }, ev.filename || ev.evidence_id),
        h('div', { class: 'trim-cap' }, cb, ` Bỏ ảnh ${k + 1}`));
      cb.addEventListener('change', () => { tile.classList.toggle('off', cb.checked); count(); });
      return { cb, tile };
    });
    const info = h('div', { class: 'small muted' });
    const fr = h('input', { type: 'text', value: 'Ảnh trùng / chụp thừa' });
    const count = () => { const n = picks.filter(p => p.cb.checked).length; info.textContent = n ? `Bỏ ${n} ảnh, giữ lại ${i.evidence.length - n} ảnh.` : 'Đánh dấu các ảnh muốn bỏ (giữ lại ít nhất 1 ảnh).'; };
    count();
    modal({ title: `Lược bớt ảnh – ${i.class_name} – ${i.type_name}`, wide: true, body: h('div', {},
      h('div', { class: 'trim-grid' }, picks.map(p => p.tile)), info, field('Lý do', fr),
      h('div', { class: 'small muted' }, 'Ảnh bị bỏ không bị xóa trên Google Drive, chỉ không hiện khi duyệt và khi xuất báo cáo. Thao tác được ghi nhật ký.')),
      actions: [{ label: 'Hủy' }, { label: 'Bỏ ảnh đã chọn', kind: 'red', onClick: async () => {
        const ids = picks.filter(p => p.cb.checked).map(p => p.cb.value);
        if (!ids.length) { toast('Chưa chọn ảnh nào.', 'warn'); return false; }
        if (ids.length >= i.evidence.length) { toast('Phải giữ lại ít nhất 1 ảnh.', 'err'); return false; }
        const r = await app.call('review.removeEvidence', { incident_id: i.incident_id, evidence_ids: ids, reason: fr.value });
        toast(`Đã bỏ ${r.removed} ảnh, còn ${r.left} ảnh`, 'ok'); load();
      } }] });
  }

  function merge(i) {
    const same = items.filter(x => x.incident_id !== i.incident_id && x.class_id_at_time === i.class_id_at_time);
    if (!same.length) return toast('Không có bản ghi cùng lớp trong danh sách đang xem để gộp.', 'warn');
    const boxes = same.map(x => h('label', { style: 'display:flex;gap:8px;margin:6px 0' }, h('input', { type: 'checkbox', value: x.incident_id, checked: x.incident_id === i.duplicate_of || x.duplicate_of === i.incident_id }),
      `${x.type_name} · ${fmtDateTime(x.occurred_at)} · ${x.submitted_by_name} · ${x.evidence.length} ảnh`));
    const fr = h('textarea', { placeholder: 'Ví dụ: hai Sao đỏ cùng ghi một lỗi' });
    modal({ title: 'Gộp bản ghi trùng vào: ' + i.type_name + ' (' + fmtDateTime(i.occurred_at) + ')', body: h('div', {}, h('p', { class: 'small muted' }, 'Các bản được chọn sẽ chuyển sang "Đã gộp", ảnh được chuyển về bản giữ lại, không bị tính điểm.'), ...boxes, field('Lý do', fr)),
      actions: [{ label: 'Hủy' }, { label: 'Gộp', kind: 'primary', onClick: async () => {
        const ids = boxes.map(l => l.querySelector('input')).filter(c => c.checked).map(c => c.value);
        if (!ids.length) { toast('Chọn bản ghi cần gộp', 'err'); return false; }
        await app.call('review.merge', { keep_id: i.incident_id, merge_ids: ids, reason: fr.value }); toast('Đã gộp', 'ok'); load();
      } }] });
  }

  await load();
}
