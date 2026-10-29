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
