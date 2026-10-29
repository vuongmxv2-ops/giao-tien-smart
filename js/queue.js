/**
 * Hộp thư đi (IndexedDB): lưu bản ghi + ảnh trên máy cho tới khi máy chủ xác nhận đã lưu.
 * Mỗi bản ghi có client_request_id cố định nên gửi lại bao nhiêu lần cũng không tạo bản trùng / trừ điểm hai lần.
 */
import { call } from './api.js';
import { blobToB64 } from './ui.js';

const DB = 'gts_outbox', STORE = 'items';
let dbp = null;
const listeners = new Set();
let running = false;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Không ghi được bộ nhớ máy (có thể đã đầy).'));
  });
}

export const put = rec => tx('readwrite', s => s.put(rec));
export const remove = id => tx('readwrite', s => s.delete(id));
export const get = id => tx('readonly', s => s.get(id));
export async function list() { const all = await tx('readonly', s => s.getAll()); return (all || []).sort((a, b) => b.created_at.localeCompare(a.created_at)); }

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(rec) { listeners.forEach(fn => { try { fn(rec); } catch { /* bỏ qua */ } }); }

/** Gửi một bản ghi theo từng bước, lưu tiến độ sau mỗi bước. */
export async function send(id) {
  let rec = await get(id);
  if (!rec || rec.state === 'done') return rec;
  rec.state = 'sending'; rec.error = ''; rec.attempts = (rec.attempts || 0) + 1; await put(rec); emit(rec);
  try {
    if (!rec.incident_id) {
      const r = await call('incident.create', { ...rec.form, client_request_id: rec.id });
      rec.incident_id = r.incident.incident_id; rec.warning = r.warning || ''; rec.dup = r.incident.dup_flag || '';
      await put(rec); emit(rec);
    }
    for (const img of rec.images) {
      if (rec.uploaded.includes(img.checksum)) continue;
      rec.stage = `Đang gửi ảnh ${rec.uploaded.length + 1}/${rec.images.length}`; emit(rec);
      await call('incident.addEvidence', {
        incident_id: rec.incident_id, base64: await blobToB64(img.blob), checksum: img.checksum, mime_type: img.mime, filename: img.name,
        width: img.width, height: img.height,
        preview_base64: img.preview ? await blobToB64(img.preview) : '', thumb_base64: img.thumb ? await blobToB64(img.thumb) : ''
      }, { timeout: 240000 });
      rec.uploaded.push(img.checksum); await put(rec); emit(rec);
    }
    rec.stage = 'Đang xác nhận với máy chủ…'; emit(rec);
    const s = await call('incident.submit', { incident_id: rec.incident_id, expected_evidence: rec.images.length });
    rec.state = 'done'; rec.server_status = s.incident.status; rec.stage = ''; rec.done_at = new Date().toISOString();
    rec.images = rec.images.map(i => ({ name: i.name, checksum: i.checksum })); // giải phóng bộ nhớ máy sau khi máy chủ đã lưu
    await put(rec); emit(rec);
    return rec;
  } catch (e) {
    rec.state = 'error'; rec.error = e.message; rec.error_code = e.code || ''; rec.stage = '';
    await put(rec); emit(rec);
    throw e;
  }
}

export async function sendAll() {
  if (running) return;
  running = true;
  try {
    for (const r of await list()) {
      if (r.state === 'done') continue;
      try { await send(r.id); } catch (e) { if (e.isNetwork) break; }
    }
  } finally { running = false; }
}

/** Xóa các bản đã gửi xong quá 3 ngày. */
export async function cleanup() {
  const lim = Date.now() - 3 * 864e5;
  for (const r of await list()) if (r.state === 'done' && Date.parse(r.done_at || r.created_at) < lim) await remove(r.id);
}

window.addEventListener('online', () => sendAll());
