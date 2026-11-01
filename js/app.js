import { call, setToken, hasToken, setAuthLostHandler, isMock } from './api.js';
import { $, h, toast, loading, errorBox, modal } from './ui.js';
import * as outbox from './queue.js';

const CFG = window.GTS_CONFIG || {};

/** 12 tab chức năng. perms: chỉ để ẩn/hiện; quyền thật được kiểm tra ở backend. */
export const TABS = [
  { id: 'tong-quan', n: 1, title: 'Tổng quan', ic: '🏠', mod: 'overview', perms: ['dashboard.view', 'dashboard.own', 'dashboard.class', 'incident.review'] },
  { id: 'ghi-nhan', n: 2, title: 'Ghi nhận vi phạm', short: 'Ghi nhận', ic: '📷', mod: 'record', perms: ['incident.create'] },
  { id: 'kiem-tra', n: 3, title: 'Kiểm tra nề nếp', short: 'Kiểm tra', ic: '✅', mod: 'checks', perms: ['check.create', 'check.view'] },
  { id: 'lich-truc', n: 4, title: 'Lịch trực ban', ic: '🗓️', mod: 'duty', perms: ['duty.view', 'duty.view.own', 'duty.manage'] },
  { id: 'duyet', n: 5, title: 'Duyệt minh chứng', ic: '🛡️', mod: 'review', perms: ['incident.review'] },
  { id: 'bang-diem', n: 6, title: 'Bảng điểm thi đua', short: 'Thi đua', ic: '📊', mod: 'scores', perms: ['score.view', 'score.view.class', 'incident.review'] },
  { id: 'xep-hang', n: 7, title: 'Xếp hạng – Khen thưởng', ic: '🏆', mod: 'ranking', perms: ['rank.view', 'score.view'] },
  { id: 'ho-so', n: 8, title: 'Hồ sơ lớp – Học sinh', ic: '👥', mod: 'profiles', perms: ['student.view', 'student.view.class', 'admin.data'] },
  { id: 'thong-ke', n: 9, title: 'Thống kê – Báo cáo AI', ic: '📈', mod: 'stats', perms: ['stats.view', 'incident.review'] },
  { id: 'thong-bao', n: 10, title: 'Thông báo – Phản hồi', ic: '🔔', mod: 'notices', perms: ['notify.view'] },
  { id: 'xuat', n: 11, title: 'Xuất báo cáo Excel', ic: '📤', mod: 'export', perms: ['export.create'] },
  { id: 'quan-tri', n: 12, title: 'Quản trị – Cài đặt', ic: '⚙️', mod: 'admin', perms: ['admin.config', 'admin.users'] }
];

export const app = {
  boot: null, user: null, params: {},
  can(p) { const u = this.user; if (!u) return false; if (u.perms.includes('*')) return true; return (Array.isArray(p) ? p : [p]).some(x => u.perms.includes(x)); },
  call,
  nav(id, params = {}) { this.params = params; if (location.hash !== '#/' + id) location.hash = '#/' + id; else render(); },
  classById(id) { return this.boot.classes.find(c => c.class_id === id); },
  typeById(id) { return this.boot.types.find(t => t.type_id === id); },
  campusName(id) { const c = this.boot.campuses.find(x => x.campus_id === id); return c ? c.name : ''; },
  weekLabel(w) { return w ? `Tuần ${w.week_no} (${w.start_date.substr(8, 2)}/${w.start_date.substr(5, 2)} – ${w.end_date.substr(8, 2)}/${w.end_date.substr(5, 2)})` : ''; },
  async reloadBoot() { this.boot = await call('app.bootstrap'); this.user = this.boot.user; return this.boot; },
  visibleTabs() { return TABS.filter(t => this.can(t.perms)); },
  /** Các nhóm thi đua (ví dụ: Lớp chọn, Đại trà) theo thứ tự xuất hiện trong danh sách lớp. */
  groups() { return [...new Set((this.boot?.classes || []).map(c => c.comp_group).filter(Boolean))]; }
};
window.GTS_APP = app;

const root = $('#app');

async function start() {
  setAuthLostHandler(() => { toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'warn'); showLogin(); });
  if ('serviceWorker' in navigator && !isMock() && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!hasToken()) return showLogin();
  loading(root, 'Đang kết nối máy chủ…');
  try { await app.reloadBoot(); renderShell(); }
  catch (e) {
    if (e.code === 'AUTH_REQUIRED') return;
    errorBox(root, e, () => start());
  }
}

function showLogin(message) {
  app.user = null;
  const msg = h('div', { class: 'notice red', hidden: !message }, message || '');
  const btnBox = h('div', { id: 'gbtn', style: 'display:flex;justify-content:center;min-height:44px' });
  const card = h('div', { class: 'login' }, h('div', { class: 'card' },
    h('img', { src: 'icons/icon.svg', width: 72, height: 72, alt: '' }),
    h('div', { class: 'muted small' }, 'TRƯỜNG THCS GIAO TIẾN'),
    h('h1', {}, 'GIAO TIẾN SMART'),
    h('div', { class: 'muted' }, 'Hệ thống quản lý nề nếp Liên đội'),
    h('p', { class: 'small muted' }, 'Đăng nhập bằng tài khoản Google đã được Tổng phụ trách cấp quyền. Ứng dụng không bao giờ hỏi mật khẩu.'),
    msg, btnBox));
  root.replaceChildren(card);
  if (isMock()) return mockLogin(btnBox, msg);
  if (!CFG.GOOGLE_CLIENT_ID) { msg.hidden = false; msg.textContent = 'Chưa cấu hình GOOGLE_CLIENT_ID trong config.js.'; return; }
  const init = () => {
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: r => doLogin(r.credential, msg), auto_select: true, ux_mode: 'popup', use_fedcm_for_prompt: true });
    google.accounts.id.renderButton(btnBox, { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'vi' });
    google.accounts.id.prompt();
  };
  if (window.google?.accounts?.id) init();
  else { let n = 0; const t = setInterval(() => { if (window.google?.accounts?.id) { clearInterval(t); init(); } else if (++n > 50) { clearInterval(t); msg.hidden = false; msg.textContent = 'Không tải được dịch vụ đăng nhập Google. Kiểm tra mạng.'; } }, 200); }
}

/** Đăng nhập thử nghiệm: chỉ có khi chạy mô phỏng trên localhost. */
function mockLogin(box, msg) {
  const sel = h('select', {}, (window.GTS_MOCK_USERS || []).map(u => h('option', { value: u.email }, `${u.label} – ${u.email}`)));
  box.replaceChildren(h('div', { style: 'width:100%' }, h('div', { class: 'notice yellow' }, 'CHẾ ĐỘ KIỂM THỬ CỤC BỘ (backend mô phỏng)'), sel,
    h('button', { class: 'btn primary block', style: 'margin-top:8px', onclick: () => doLogin(window.GAS_MOCK.token(sel.value, sel.selectedOptions[0].textContent.split(' – ')[0]), msg) }, 'Đăng nhập thử')));
}

async function doLogin(idToken, msg) {
  try {
    loading(msg); msg.hidden = false; msg.className = 'notice';
    const r = await call('auth.login', { idToken });
    setToken(r.token);
    await app.reloadBoot();
    renderShell();
    toast('Xin chào ' + app.user.full_name, 'ok');
  } catch (e) { msg.className = 'notice red'; msg.textContent = e.message; }
}

export async function logout() {
  try { await call('auth.logout'); } catch { /* bỏ qua */ }
  setToken('');
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
  showLogin();
}

function renderShell() {
  const b = app.boot, u = app.user;
  const net = h('span', { class: 'netbadge' + (navigator.onLine ? '' : ' off') }, navigator.onLine ? 'Trực tuyến' : 'Mất mạng');
  addEventListener('online', () => { net.className = 'netbadge'; net.textContent = 'Trực tuyến'; });
  addEventListener('offline', () => { net.className = 'netbadge off'; net.textContent = 'Mất mạng'; });
  const top = h('header', { class: 'topbar' },
    h('div', { class: 'logo' }, h('img', { src: 'icons/icon.svg', alt: '' })),
    h('div', { class: 'titles' }, h('div', { class: 'school' }, b.settings.school_name || 'TRƯỜNG THCS GIAO TIẾN'),
      h('div', { class: 'system' }, b.settings.system_name || 'HỆ THỐNG QUẢN LÝ NỀ NẾP LIÊN ĐỘI'),
      h('div', { class: 'year' }, 'Năm học ' + (b.year ? b.year.name : '—') + (b.current_week ? ' · ' + app.weekLabel(b.current_week) : ''))),
    h('div', { class: 'who' }, h('b', {}, u.full_name), u.role_label, h('br'), net, isMock() ? h('span', { class: 'netbadge', style: 'background:#f9a825;color:#000' }, 'THỬ NGHIỆM') : ''));
  const side = h('nav', { class: 'sidebar', 'aria-label': 'Menu chính' },
    app.visibleTabs().map(t => h('button', { 'data-tab': t.id, onclick: () => app.nav(t.id) }, h('span', { class: 'ic' }, t.ic), `${t.n}. ${t.title}`)),
    h('button', { onclick: logout }, h('span', { class: 'ic' }, '↩'), 'Đăng xuất'));
  const main = h('main', { id: 'view' });
  const bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Menu nhanh' },
    navBtn('tong-quan', '🏠', 'Tổng quan'),
    app.can('incident.create') ? navBtn('ghi-nhan', '📷', 'Ghi nhận', true) : navBtn('duyet', '🛡️', 'Duyệt'),
    navBtn('kiem-tra', '✅', 'Kiểm tra'),
    navBtn('bang-diem', '📊', 'Thi đua'),
    h('button', { onclick: openMenu }, h('span', { class: 'ic' }, '☰'), 'Menu'));
  root.replaceChildren(top, h('div', { class: 'layout' }, side, main), bottom);
  window.onhashchange = render;
  if (!location.hash) location.hash = '#/' + (app.visibleTabs()[0]?.id || 'tong-quan');
  render();
  outbox.cleanup().catch(() => {});
  if (navigator.onLine) outbox.sendAll().catch(() => {});
}

function navBtn(id, ic, label, fab) {
  return h('button', { 'data-tab': id, class: fab ? 'fab' : '', onclick: () => app.nav(id) }, h('span', { class: 'ic' }, ic), label);
}

function openMenu() {
  const grid = h('div', { class: 'menu-grid' }, app.visibleTabs().map(t => h('button', { onclick: () => { m.close(); app.nav(t.id); } }, h('span', { class: 'ic' }, t.ic), `${t.n}. ${t.short || t.title}`)),
    h('button', { onclick: () => { m.close(); logout(); } }, h('span', { class: 'ic' }, '↩'), 'Đăng xuất'));
  const m = modal({ title: 'Tất cả chức năng', body: grid });
}

let renderSeq = 0;
async function render() {
  const view = $('#view'); if (!view) return;
  const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1] || 'tong-quan';
  const tab = TABS.find(t => t.id === id) || TABS[0];
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab.id));
  if (!app.can(tab.perms)) { view.replaceChildren(h('div', { class: 'notice red' }, 'Bạn không có quyền truy cập chức năng này.')); return; }
  const seq = ++renderSeq;
  loading(view);
  try {
    const mod = await import(`./tabs/${tab.mod}.js`);
    if (seq !== renderSeq) return;
    view.replaceChildren(h('div', { class: 'page-title' }, h('h1', {}, `${tab.ic} ${tab.title}`)));
    const body = h('div');
    view.append(body);
    await mod.render(body, app, app.params || {});
    app.params = {};
  } catch (e) {
    if (seq === renderSeq) errorBox(view, e, render);
  }
  document.title = tab.title + ' – GIAO TIẾN SMART';
}

start();
