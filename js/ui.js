/** Tiện ích giao diện dùng chung. */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Tạo phần tử: h('button', {class:'btn', onclick}, 'Nhãn') */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

export function toast(msg, type = 'info', ms = 4000) {
  let box = $('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : type === 'warn' ? 'warn' : '') }, msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const bg = h('div', { class: 'modal-bg' });
  const close = () => { bg.remove(); onClose && onClose(); };
  const footer = h('footer');
  const m = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('header', {}, h('h3', {}, title), h('button', { class: 'btn ghost sm', onclick: close, 'aria-label': 'Đóng' }, '✕')),
    body instanceof Node ? body : h('div', { html: body || '' }), footer);
  for (const a of actions) {
    const b = h('button', { class: 'btn ' + (a.kind || '') }, a.label);
    b.addEventListener('click', async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { const r = await a.onClick(); if (r !== false) close(); }
      catch (e) { toast(e.message, 'err'); }
      finally { b.disabled = false; }
    });
    footer.append(b);
  }
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  bg.append(m); document.body.append(bg);
  return { close, el: m };
}

/** Hỏi lý do (bắt buộc với các thao tác quan trọng). Trả về chuỗi hoặc null nếu hủy. */
export function askReason(title, { label = 'Lý do', min = 3, placeholder = '', okLabel = 'Xác nhận', kind = 'primary', extra } = {}) {
  return new Promise(resolve => {
    const ta = h('textarea', { placeholder, 'aria-label': label });
    const err = h('div', { class: 'notice red', hidden: true });
    let done = false;
    const body = h('div', {}, extra || '', h('label', { class: 'f' }, h('span', {}, label), ta), err);
    modal({ title, body, onClose: () => { if (!done) resolve(null); }, actions: [
      { label: 'Hủy' },
      { label: okLabel, kind, onClick: () => {
        const v = ta.value.trim();
        if (v.length < min) { err.hidden = false; err.textContent = 'Cần nhập ít nhất ' + min + ' ký tự.'; return false; }
        done = true; resolve(v);
      } }] });
    setTimeout(() => ta.focus(), 50);
  });
}

export function confirmBox(title, text, okLabel = 'Đồng ý', kind = 'primary') {
  return new Promise(resolve => {
    let done = false;
    modal({ title, body: h('p', {}, text), onClose: () => { if (!done) resolve(false); },
      actions: [{ label: 'Hủy' }, { label: okLabel, kind, onClick: () => { done = true; resolve(true); } }] });
  });
}

export const fmtDate = k => { if (!k) return ''; const p = String(k).substr(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : k; };
export const fmtTime = iso => iso ? String(iso).substr(11, 5) : '';
export const fmtDateTime = iso => iso ? fmtDate(iso) + ' ' + fmtTime(iso) : '';
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WDL = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export const weekdayOf = k => { const p = k.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); };
export const wdShort = k => WD[weekdayOf(k)];
export const wdLabel = k => WDL[weekdayOf(k)];
export function addDays(k, n) { const p = k.split('-'); const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 864e5); return d.toISOString().substr(0, 10); }
export function todayKey() { const d = new Date(Date.now() + 7 * 36e5); return d.toISOString().substr(0, 10); }
export function nowLocalInput() { const d = new Date(Date.now() + 7 * 36e5); return d.toISOString().substr(0, 16); }
export const signed = v => (v > 0 ? '+' : '') + v;

export const STATUS = {
  NHAP: ['Nháp', ''], CHO_DUYET: ['Chờ duyệt', 'yellow'], DA_DUYET: ['Đã duyệt', 'green'], BAC_BO: ['Bác bỏ', 'red'],
  YEU_CAU_BO_SUNG: ['Cần bổ sung', 'yellow'], DA_GOP: ['Đã gộp', ''], DA_HUY: ['Đã hủy', ''],
  MOI: ['Mới', 'blue'], DANG_XU_LY: ['Đang xử lý', 'yellow'], DA_GIAI_QUYET: ['Đã giải quyết', 'green'], DA_DONG: ['Đã đóng', ''],
  OPEN: ['Đang mở', 'blue'], LOCKED: ['Đã khóa', 'green'], PHAN_CONG: ['Đã phân công', 'blue'], HOAN_THANH: ['Hoàn thành', 'green'], DOI_LICH: ['Đã đổi lịch', 'yellow'],
  ACTIVE: ['Hoạt động', 'green'], VOID: ['Đã hủy', 'red']
};
export function badge(status) { const s = STATUS[status] || [status, '']; return h('span', { class: 'badge ' + s[1] }, s[0]); }

export function loading(el, text = 'Đang tải dữ liệu…') { el.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), ' ', text)); }
export function errorBox(el, err, retry) {
  el.replaceChildren(h('div', { class: 'notice red' }, err.message || String(err), ' ', retry ? h('button', { class: 'btn sm', onclick: retry }, 'Thử lại') : ''));
}

export function options(list, { value = 'value', label = 'label', selected, empty } = {}) {
  const out = [];
  if (empty !== undefined) out.push(h('option', { value: '' }, empty));
  for (const o of list) {
    const v = typeof o === 'object' ? o[value] : o, l = typeof o === 'object' ? (typeof label === 'function' ? label(o) : o[label]) : o;
    out.push(h('option', { value: v, selected: String(v) === String(selected) }, l));
  }
  return out;
}

export function field(label, input, hint) { return h('label', { class: 'f' }, h('span', {}, label), input, hint ? h('div', { class: 'small muted' }, hint) : ''); }

/** Bảng dữ liệu. cols: [{label, key | render(row), num:true, cls}] */
export function table(cols, rows, { empty = 'Không có dữ liệu.', onRow } = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, empty);
  const thead = h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.num ? 'num' : '' }, c.label))));
  const tbody = h('tbody', {}, rows.map((r, i) => {
    const tr = h('tr', { class: onRow ? 'click' : '' }, cols.map(c => {
      const v = c.render ? c.render(r, i) : r[c.key];
      return h('td', { class: (c.num ? 'num ' : '') + (c.cls || '') }, v instanceof Node ? v : (v ?? ''));
    }));
    if (onRow) tr.addEventListener('click', () => onRow(r));
    return tr;
  }));
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, thead, tbody));
}

export function download(blob, filename) {
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export function b64ToBlob(b64, mime) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}

export function blobToB64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16)); return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Đọc tệp Excel/CSV bằng SheetJS, trả về mảng đối tượng theo dòng tiêu đề. */
export async function readSheetFile(file) {
  if (!window.XLSX) throw new Error('Chưa tải được thư viện đọc Excel (kiểm tra mạng).');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
}

/** Ánh xạ tiêu đề cột tiếng Việt/tiếng Anh sang khóa chuẩn. */
export function mapColumns(rows, map) {
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
  return rows.map(r => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      const n = norm(k);
      for (const [key, aliases] of Object.entries(map)) if (aliases.some(a => norm(a) === n)) o[key] = typeof v === 'string' ? v.trim() : v;
    }
    return o;
  }).filter(o => Object.values(o).some(v => v !== '' && v != null));
}

export function devNote(text = 'Đang phát triển') { return h('span', { class: 'dev' }, text); }
