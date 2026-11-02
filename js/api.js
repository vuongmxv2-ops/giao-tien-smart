/** Gọi API backend. Chỉ coi là thành công khi máy chủ trả {ok:true}. */
const CFG = window.GTS_CONFIG || {};
let token = readToken();
let onAuthLost = () => {};

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
  get isNetwork() { return this.code === 'NETWORK' || this.code === 'TIMEOUT' || this.code === 'BAD_RESPONSE'; }
}

function readToken() { try { return localStorage.getItem('gts_token') || ''; } catch { return ''; } }
export function setToken(t) { token = t || ''; try { t ? localStorage.setItem('gts_token', t) : localStorage.removeItem('gts_token'); } catch { /* chế độ riêng tư */ } }
export function hasToken() { return !!token; }
export function setAuthLostHandler(fn) { onAuthLost = fn; }
export const isMock = () => !!(CFG.MOCK && window.GAS_MOCK && /^(localhost|127\.0\.0\.1)$/.test(location.hostname));

/** Mô phỏng mạng khi kiểm thử: độ trễ, lỗi trước khi tới máy chủ, mất phản hồi sau khi máy chủ đã xử lý. */
async function mockTransport(body) {
  const net = window.GTS_NET || {};
  await new Promise(r => setTimeout(r, net.latency ?? 120));
  if (Math.random() < (net.failRate || 0)) throw new ApiError('NETWORK', 'Không kết nối được máy chủ (mô phỏng mạng yếu).');
  const text = window.GAS_MOCK.call(body);
  if (Math.random() < (net.lostRate || 0)) throw new ApiError('NETWORK', 'Mất kết nối trước khi nhận phản hồi (mô phỏng).');
  return text;
}

/**
 * Hiện ngay kết quả lần trước (nếu có) rồi gọi máy chủ và hiện kết quả mới.
 * onData(data, stale): stale = true khi là dữ liệu cũ lưu trên máy. Chỉ dùng cho số liệu tổng hợp (không chứa thông tin học sinh).
 */
const SWR_KEY = 'gts_swr';
function swrStore() { try { return JSON.parse(localStorage.getItem(SWR_KEY) || '{}'); } catch { return {}; } }
export async function callSWR(action, payload, onData) {
  const key = action + ':' + JSON.stringify(payload);
  const old = swrStore()[key];
  if (old) onData(old.d, true);
  const d = await call(action, payload);
  try {
    const s = swrStore(); s[key] = { d, at: Date.now() };
    const keys = Object.keys(s).sort((a, b) => s[b].at - s[a].at);
    keys.slice(20).forEach(k => delete s[k]); // giữ 20 kết quả gần nhất
    localStorage.setItem(SWR_KEY, JSON.stringify(s));
  } catch { /* đầy bộ nhớ: bỏ qua */ }
  onData(d, false);
  return d;
}
export function clearSWR() { try { localStorage.removeItem(SWR_KEY); } catch { /* bỏ qua */ } }

export async function call(action, payload = {}, opts = {}) {
  const body = JSON.stringify({ action, token, payload });
  let text;
  if (isMock()) text = await mockTransport(body);
  else {
    if (!CFG.API_URL) throw new ApiError('NOT_SETUP', 'Chưa cấu hình địa chỉ API trong config.js.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 60000);
    try {
      const res = await fetch(CFG.API_URL, { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal, redirect: 'follow', credentials: 'omit' });
      if (!res.ok) throw new ApiError('NETWORK', 'Máy chủ phản hồi lỗi HTTP ' + res.status + '.');
      text = await res.text();
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', e.name === 'AbortError' ? 'Quá thời gian chờ máy chủ. Kiểm tra mạng rồi thử lại.' : 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    } finally { clearTimeout(timer); }
  }
  let json;
  try { json = JSON.parse(text); } catch { throw new ApiError('BAD_RESPONSE', 'Phản hồi từ máy chủ không hợp lệ.'); }
  if (!json.ok) {
    const err = new ApiError(json.error?.code || 'ERROR', json.error?.message || 'Lỗi không xác định.');
    if (err.code === 'AUTH_REQUIRED') { setToken(''); onAuthLost(err); }
    throw err;
  }
  return json.data;
}
