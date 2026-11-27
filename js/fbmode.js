/**
 * CHẾ ĐỘ FIRESTORE (Phương án B – chạy song song, bật riêng từng máy bằng ?fb=1, tắt bằng ?fb=0).
 * - Đăng nhập vẫn qua màn hình cũ; xong thì đăng nhập thêm Firebase ở nền (cùng mã Google / cùng mật khẩu).
 * - Thao tác ĐỌC chạy tại chỗ bằng chính mã backend trên dữ liệu Firestore (js/engine/*) → không chờ mạng.
 * - Thao tác GHI vẫn gửi máy chủ cũ; sau khi ghi, đọc từ máy chủ cũ cho tới khi Firestore đã chép bản mới.
 * Bất cứ lỗi nào ở chế độ này → tự quay về máy chủ cũ (người dùng không bị ảnh hưởng).
 */
import { FIREBASE_CONFIG, FIRESTORE_DB, LINK_URL, PW_EMAIL_DOMAIN, ENGINE_VERSION } from './firebase-config.js';
import { LOCAL as LOCAL_LIST, PARTIAL_OK, POST } from './engine/policy.js';
import { call } from './api.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
/** Bản giao diện chế độ Firestore – đổi mỗi lần sửa fbmode/engine: danh sách thao tác đã tự tắt gắn với từng bản (lên bản mới = thử lại từ đầu). */
const BUILD = '1.6.4';
const KEY = 'gts_fb', OFF_KEY = 'gts_fb_off_' + BUILD;
export const SKIP = Symbol('skip');

/** Thao tác đọc chạy tại chỗ được (đã đối chiếu kết quả với máy chủ cũ trong tests/test-engine.html). */
const LOCAL = new Set(LOCAL_LIST);
/** Giai đoạn thử: mọi kết quả tại chỗ được so ngầm với máy chủ cũ; lệch → tắt thao tác đó trên máy này. */
const VERIFY = true;
/** Thao tác chỉ đọc (gọi máy chủ cũ cũng không làm dữ liệu đổi). Mọi thao tác khác coi là GHI. */
const READS = new Set([...LOCAL, 'auth.me', 'evidence.get', 'evidence.getMany', 'score.check', 'student.search', 'student.history', 'duty.stats',
  'export.weekData', 'export.classReport', 'export.template', 'export.list', 'export.download', 'export.violations',
  'admin.users', 'admin.staff', 'admin.redStars', 'admin.members', 'admin.settings', 'admin.audit', 'backup.list']);
const st = { enabled: false, fs: null, auth: null, db: null, user: null, member: null, engine: null, ready: null,
  syncedAt: 0, pendingWriteAt: 0, stats: { local: 0, remote: 0, verified: 0, fallback: {} }, mismatches: [], off: readOff() };
window.GTS_FB = st;
/** Thời gian từng bước (ms) – hiện trong hộp thông tin của nhãn ⚡ để biết chậm ở đâu. */
st.timing = {};
export function noteTiming(label, ms) { st.timing[label] = Math.round(ms); }
function readOff() { try { return new Set(JSON.parse(localStorage.getItem(OFF_KEY) || '[]')); } catch { return new Set(); } }
function saveOff() { try { localStorage.setItem(OFF_KEY, JSON.stringify([...st.off])); } catch { /* bỏ qua */ } }

export function isEnabled() {
  try {
    const p = new URLSearchParams(location.search).get('fb');
    if (p === '1') { localStorage.setItem(KEY, '1'); localStorage.removeItem(OFF_KEY); st.off.clear(); } // bật lại: thử lại mọi thao tác
    if (p === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch { return false; }
}
/** true khi vừa bật bằng ?fb=1 (cần đăng nhập lại một lần để có phiên Firebase). */
export function justEnabled() { return new URLSearchParams(location.search).get('fb') === '1'; }

async function sdk() {
  const [app, auth, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  return { app, auth, fs };
}

/** Khởi động (không chặn giao diện). */
export function init() {
  st.enabled = isEnabled();
  if (!st.enabled) return Promise.resolve(false);
  st.ready = (async () => {
    const t0 = performance.now();
    const m = await sdk();
    noteTiming('Tải thư viện Firebase', performance.now() - t0);
    st.fs = m.fs;
    const app = m.app.initializeApp(FIREBASE_CONFIG);
    st.auth = m.auth.getAuth(app);
    st.authMod = m.auth;
    try { st.db = m.fs.initializeFirestore(app, { localCache: m.fs.persistentLocalCache({ tabManager: m.fs.persistentMultipleTabManager() }) }, FIRESTORE_DB); }
    catch { st.db = m.fs.getFirestore(app, FIRESTORE_DB); }
    await new Promise(res => { const off = m.auth.onAuthStateChanged(st.auth, u => { off(); st.user = u; res(); }); });
    if (st.user) await attach();
    return true;
  })().catch(e => { console.warn('[fb] không khởi động được chế độ Firestore:', e); st.engine = null; return false; });
  return st.ready;
}

/** Nạp hồ sơ quyền + dựng bộ máy đọc cho người đang đăng nhập Firebase. */
async function attach() {
  const { doc, getDoc, onSnapshot } = st.fs;
  let snap = await getDoc(doc(st.db, 'members', st.user.uid));
  if (!snap.exists() && st.user.providerData.some(p => p.providerId === 'google.com')) {
    await link('link.google', { idToken: await st.user.getIdToken() });
    snap = await getDoc(doc(st.db, 'members', st.user.uid));
  }
  if (!snap.exists()) throw new Error('Chưa có hồ sơ quyền trên Firebase');
  st.member = snap.data();
  if (st.member.status !== 'ACTIVE') { st.engine = null; return; }
  onSnapshot(doc(st.db, '_sync', 'status'), s => { const d = s.data(); if (d) st.syncedAt = Number(d.started_ms) || Date.parse(d.started || d.at) || 0; }, () => {});
  const t0 = performance.now();
  await loadBackend();
  noteTiming('Nạp bộ máy đọc', performance.now() - t0);
  const { createEngine } = await import('./engine/engine.js');
  const { createSource } = await import('./engine/source.js');
  const { createFsAdapter } = await import('./engine/fsadapter.js');
  st.engine = createEngine(window.GTSBackendFactory, createSource(createFsAdapter(st.fs, st.db)), st.member);
}

/**
 * Nạp mã backend dạng chạy trong trình duyệt (~200 KB, không phải module ES):
 * 1) tệp js/engine/backend.js nếu có (thử nghiệm trên máy); 2) bản lưu trên máy đúng phiên bản; 3) tải từ web app liên kết (?f=engine).
 */
async function loadBackend() {
  if (window.GTSBackendFactory) return;
  const inject = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
  try { const r = await fetch('js/engine/backend.js', { method: 'HEAD' }); if (r.ok) { await inject('js/engine/backend.js'); if (window.GTSBackendFactory) return; } } catch { /* không có tệp: dùng cách khác */ }
  let code = null;
  try { const c = JSON.parse(localStorage.getItem('gts_engine') || 'null'); if (c && c.v === ENGINE_VERSION) code = c.code; } catch { /* bỏ qua */ }
  if (!code) {
    const r = await fetch(LINK_URL + '?f=engine&v=' + encodeURIComponent(ENGINE_VERSION));
    code = await r.text();
    if (code.indexOf('window.GTSBackendFactory') < 0) throw new Error('Không tải được mã bộ máy đọc');
    try { localStorage.setItem('gts_engine', JSON.stringify({ v: ENGINE_VERSION, code })); } catch { /* đầy bộ nhớ: lần sau tải lại */ }
  }
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try { await inject(url); } finally { URL.revokeObjectURL(url); }
}

async function link(action, payload) {
  const r = await fetch(LINK_URL, { method: 'POST', body: JSON.stringify({ action, payload }) });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
  return j.data;
}

/** Gọi sau khi đăng nhập hệ thống cũ thành công. cred = {googleIdToken} | {username, password}. Không bao giờ ném lỗi. */
export async function afterLogin(cred) {
  if (!st.enabled) return;
  const t0 = performance.now();
  try {
    await st.ready;
    const A = st.authMod;
    // Luôn bỏ phiên Firebase cũ (có thể của người khác) trước khi đăng nhập người mới
    st.engine = null; st.member = null;
    if (st.auth.currentUser) await A.signOut(st.auth);
    if (cred.googleIdToken) {
      await A.signInWithCredential(st.auth, A.GoogleAuthProvider.credential(cred.googleIdToken));
    } else if (cred.username) {
      const email = cred.username.trim().toLowerCase() + '@' + PW_EMAIL_DOMAIN;
      try { await A.signInWithEmailAndPassword(st.auth, email, cred.password); }
      catch (e) {
        if (!/invalid-credential|user-not-found|wrong-password|invalid-login/.test(e.code || '')) throw e;
        await link('link.password', { username: cred.username.trim(), password: cred.password });
        await A.signInWithEmailAndPassword(st.auth, email, cred.password);
      }
    }
    st.user = st.auth.currentUser;
    noteTiming('Đăng nhập Firebase', performance.now() - t0);
    await attach();
  } catch (e) { console.warn('[fb] đăng nhập Firebase không thành công – dùng máy chủ cũ:', e.code || e.message); st.engine = null; }
}

/** Đã sẵn sàng chạy tại chỗ (đã đăng nhập Firebase, có hồ sơ quyền đang hoạt động, đã dựng bộ máy đọc). */
export function isActive() { return !!(st.enabled && st.engine && st.member && st.member.status === 'ACTIVE'); }

export async function logout() {
  if (!st.enabled || !st.auth) return;
  try { await st.authMod.signOut(st.auth); } catch { /* bỏ qua */ }
  st.user = null; st.member = null; st.engine = null;
}

/** Thử chạy tại chỗ. Trả SKIP nếu phải gọi máy chủ cũ. */
export async function tryLocal(action, payload) {
  if (!st.enabled || !LOCAL.has(action) || st.off.has(action)) return SKIP;
  if (st.ready) await Promise.race([st.ready, new Promise(r => setTimeout(r, 2500))]);
  if (!st.engine) return SKIP;
  // Chốt an toàn: người trên Firebase phải trùng người đang đăng nhập hệ thống cũ (app.user, khi đã biết)
  const appUser = window.GTS_APP && window.GTS_APP.user;
  if (appUser && appUser.user_id !== st.member.user_id) { console.warn('[fb] khác người dùng – tắt chạy tại chỗ'); st.engine = null; return SKIP; }
  if (st.pendingWriteAt && !(st.syncedAt > st.pendingWriteAt + 1000)) { st.stats.remote++; badge(); return SKIP; } // vừa ghi: chờ Firestore chép xong
  const t0 = performance.now();
  try {
    const r = await st.engine.run(action, payload, { partialOk: PARTIAL_OK[action] || [], post: POST[action] });
    const ms = Math.round(performance.now() - t0);
    st.stats.local++; badge(); console.debug('[fb] ' + action + ' tại chỗ ' + ms + ' ms');
    if (VERIFY) verify(action, payload, r);
    return r;
  } catch (e) {
    if (e.needRemote) { st.stats.fallback[action] = e.message; console.debug('[fb] ' + action + ' → máy chủ cũ: ' + e.message); return SKIP; }
    throw e; // lỗi nghiệp vụ (giống máy chủ cũ)
  }
}

/** So ngầm kết quả tại chỗ với máy chủ cũ (không làm chậm người dùng). Lệch → tắt thao tác này trên máy, ghi lại để kiểm tra. */
// version: số phiên bản mã máy chủ (không phải dữ liệu) – bộ máy tại chỗ có thể chạy bản mã cũ hơn một chút
const VOLATILE = new Set(['server_time', 'ms', 'generated_at', 'version']);
const norm = v => JSON.stringify(v, (k, x) => (VOLATILE.has(k) ? undefined : x));
function verify(action, payload, local, retry) {
  const at = Date.now();
  call(action, payload, { remote: true }).then(async remote => {
    if (norm(local) === norm(remote)) { st.stats.verified++; badge(); return; }
    if (!retry) {
      // Có thể chỉ do Firestore chưa chép kịp thay đổi của người khác (≤ 5 phút): chờ lượt đồng bộ mới rồi so lại
      for (let i = 0; i < 40 && !(st.syncedAt > at + 1000); i++) await new Promise(r => setTimeout(r, 15000));
      if (!(st.syncedAt > at + 1000) || !st.engine) return;
      try { return verify(action, payload, await st.engine.run(action, payload, { partialOk: PARTIAL_OK[action] || [], post: POST[action] }), true); } catch { return; }
    }
    st.mismatches.push({ action, payload, at: new Date().toISOString() });
    st.off.add(action); saveOff(); badge();
    console.warn('[fb] KẾT QUẢ LỆCH (đã so lại sau đồng bộ) – tắt chạy tại chỗ cho ' + action, { payload, local, remote });
  }).catch(() => {});
}

/** Nhãn nhỏ góc màn hình: đang ở chế độ Firestore, số lần chạy tại chỗ / đã đối chiếu khớp / lệch. */
function badge() {
  let b = document.getElementById('fb-badge');
  if (!b) {
    b = document.createElement('div'); b.id = 'fb-badge';
    b.style.cssText = 'position:fixed;left:8px;bottom:78px;z-index:9999;background:#0b5;color:#fff;font:12px/1.2 Arial;padding:4px 8px;border-radius:10px;opacity:.85;cursor:pointer';
    b.title = 'Chế độ Firestore (thử nghiệm). Bấm để xem chi tiết.';
    b.onclick = () => alert('Chế độ Firestore (thử nghiệm) – bản ' + BUILD + '\n\nChạy tại chỗ: ' + st.stats.local + '\nĐối chiếu khớp: ' + st.stats.verified +
      '\nPhải hỏi máy chủ cũ: ' + st.stats.remote + '\nLệch (đã tự tắt): ' + ([...st.off].join(', ') || 'không') +
      (Object.keys(st.timing).length ? '\n\nThời gian:\n' + Object.entries(st.timing).map(([k, v]) => '· ' + k + ': ' + (v / 1000).toFixed(1) + ' giây').join('\n') : '') +
      '\n\nTắt chế độ: mở lại ứng dụng với địa chỉ có ?fb=0');
    document.body.append(b);
  }
  b.textContent = '⚡ ' + st.stats.local + ' · ✔ ' + st.stats.verified + (st.off.size ? ' · ⚠ ' + st.off.size : '');
  b.style.background = st.off.size ? '#c60' : '#0b5';
}

/** Gọi sau mỗi lần máy chủ cũ trả kết quả. Thao tác ghi → đánh dấu chờ đồng bộ + nhờ chép ngay. */
export function noteRemote(action) {
  if (!st.enabled || READS.has(action) || action.startsWith('auth.')) return;
  st.pendingWriteAt = Date.now();
  if (st.user) st.user.getIdToken().then(t => link('sync.kick', { idToken: t })).catch(() => {});
}
