/**
 * Tải ảnh nhỏ theo lô: gom các yêu cầu trong cùng một nhịp rồi gọi evidence.getMany một lần (tối đa 24 ảnh),
 * thay vì mỗi ảnh một lần gọi máy chủ. Ảnh đã tải được giữ trong bộ nhớ trong phiên làm việc.
 */
import { call } from './api.js';
import { b64ToBlob } from './ui.js';

const urls = new Map();      // evidence_id → objectURL
const waiting = new Map();   // evidence_id → [{resolve, reject}]
let timer = null;

export function thumbUrl(id) {
  if (urls.has(id)) return Promise.resolve(urls.get(id));
  return new Promise((resolve, reject) => {
    if (!waiting.has(id)) waiting.set(id, []);
    waiting.get(id).push({ resolve, reject });
    clearTimeout(timer);
    timer = setTimeout(flush, 30);
  });
}

async function flush() {
  const ids = [...waiting.keys()];
  for (let i = 0; i < ids.length; i += 24) batch(ids.slice(i, i + 24));
}

async function batch(ids) {
  const subs = ids.map(id => { const s = waiting.get(id); waiting.delete(id); return [id, s]; });
  const settle = (id, s, url, err) => s.forEach(p => (url ? p.resolve(url) : p.reject(err)));
  try {
    const r = await call('evidence.getMany', { ids, size: 'thumb' }, { timeout: 120000 });
    const got = new Map(r.items.map(x => [x.evidence_id, x]));
    for (const [id, s] of subs) {
      const x = got.get(id);
      if (x && x.base64) { const u = URL.createObjectURL(b64ToBlob(x.base64, x.mime)); urls.set(id, u); settle(id, s, u); }
      else if (x && x.error) settle(id, s, null, new Error(x.error));
      else thumbUrl(id).then(u => settle(id, s, u), e => settle(id, s, null, e)); // vượt giới hạn dung lượng một lần trả: lấy ở lô sau
    }
  } catch (e) { subs.forEach(([id, s]) => settle(id, s, null, e)); }
}
