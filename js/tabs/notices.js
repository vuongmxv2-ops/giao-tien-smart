import { h, options, field, toast, loading, errorBox, badge, fmtDateTime, signed, modal } from '../ui.js';
import { viewEvidence } from './record.js';

const KINDS = [{ value: 'PHAN_HOI', label: 'Phản hồi vi phạm' }, { value: 'XEM_XET_DIEM', label: 'Yêu cầu xem xét lại điểm' }, { value: 'GOP_Y', label: 'Hòm thư góp ý' }];
const CAT = { VI_PHAM: 'Vi phạm', LICH_TRUC: 'Lịch trực', THI_DUA: 'Thi đua', PHAN_HOI: 'Phản hồi', BO_SUNG: 'Bổ sung', CHUNG: 'Chung' };

/** TAB 10 – THÔNG BÁO – PHẢN HỒI */
export async function render(el, app) {
  const b = app.boot, manage = app.can('appeal.manage'), teacher = app.user.role === 'HOMEROOM_TEACHER';
  const tabs = h('div', { class: 'seg', style: 'margin-bottom:12px' });
  const body = h('div');
  el.append(tabs, body);
  const views = [['tb', 'Thông báo'], ['ph', 'Phản hồi – Kiến nghị'], ...(teacher || app.can('incident.view') ? [['vp', 'Vi phạm của lớp']] : [])];
  let cur = 'tb';
  views.forEach(([k, l]) => tabs.append(h('button', { type: 'button', class: k === cur ? 'on DAT' : '', onclick: e => { cur = k; [...tabs.children].forEach(x => x.className = ''); e.target.className = 'on DAT'; show(); } }, l)));

  function show() { ({ tb: notices, ph: appeals, vp: classIncidents })[cur](); }

  async function notices() {
    loading(body);
    try {
      const list = await app.call('notify.list', { limit: 100 });
      const unread = list.filter(n => !n.read).map(n => n.notification_id);
      body.replaceChildren(
        app.can('notify.manage') ? h('div', { class: 'actions', style: 'margin-bottom:10px' }, h('button', { class: 'btn primary', onclick: compose }, '＋ Gửi thông báo')) : '',
        unread.length ? h('button', { class: 'btn sm', style: 'margin-bottom:8px', onclick: async () => { await app.call('notify.markRead', { ids: unread }); notices(); } }, `Đánh dấu đã đọc (${unread.length})`) : '',
        h('div', { class: 'card' }, list.length ? h('div', { class: 'list' }, list.map(n => h('div', { class: 'item', style: n.read ? '' : 'font-weight:600' },
          h('span', { class: 'badge ' + (n.read ? '' : 'blue') }, CAT[n.category] || n.category), h('div', { class: 'grow' }, n.title, h('div', { class: 'small muted', style: 'font-weight:400' }, n.body, ' · ', fmtDateTime(n.created_at))))))
          : h('div', { class: 'empty' }, 'Chưa có thông báo.')));
    } catch (e) { errorBox(body, e, notices); }
  }

  function compose() {
    const tt = h('select', {}, options([{ value: 'ALL', label: 'Toàn bộ người dùng' }, { value: 'ROLE', label: 'Theo vai trò' }, { value: 'CLASS', label: 'GVCN một lớp' }]));
    const tv = h('select');
    const fill = () => tv.replaceChildren(...(tt.value === 'ROLE' ? options([{ value: 'HOMEROOM_TEACHER', label: 'Giáo viên chủ nhiệm' }, { value: 'RED_STAR', label: 'Sao đỏ' }, { value: 'YOUTH_COMMAND', label: 'Ban chỉ huy Liên đội' }, { value: 'SCHOOL_LEADER', label: 'Ban giám hiệu' }])
      : tt.value === 'CLASS' ? options(b.classes, { value: 'class_id', label: 'name' }) : []));
    tt.addEventListener('change', fill); fill();
    const cat = h('select', {}, options([{ value: 'CHUNG', label: 'Chung' }, { value: 'LICH_TRUC', label: 'Lịch trực' }, { value: 'THI_DUA', label: 'Kết quả thi đua' }]));
    const title = h('input', { type: 'text' }), text = h('textarea');
    modal({ title: 'Gửi thông báo', body: h('div', {}, field('Gửi tới', tt), field('Đối tượng', tv), field('Loại', cat), field('Tiêu đề', title), field('Nội dung', text)),
      actions: [{ label: 'Hủy' }, { label: 'Gửi', kind: 'primary', onClick: async () => { await app.call('notify.create', { target_type: tt.value, target_value: tv.value, category: cat.value, title: title.value, body: text.value }); toast('Đã gửi thông báo', 'ok'); notices(); } }] });
  }

  async function appeals() {
    loading(body);
    try {
      const list = await app.call('appeal.list', {});
      body.replaceChildren(
        app.can(['appeal.create', 'appeal.manage']) ? h('div', { class: 'actions', style: 'margin-bottom:10px' }, h('button', { class: 'btn primary', onclick: () => newAppeal() }, '＋ Gửi phản hồi / góp ý')) : '',
        h('div', { class: 'card' }, list.length ? h('div', { class: 'list' }, list.map(a => h('div', { class: 'item' },
          h('div', { class: 'grow' }, h('b', {}, a.kind_label + (a.class_name ? ' – ' + a.class_name : '')), h('div', {}, a.content),
            h('div', { class: 'small muted' }, `${a.created_by_name} · ${fmtDateTime(a.created_at)}` + (a.incident_id ? ' · Bản ghi ' + a.incident_id : '')),
            a.response ? h('div', { class: 'notice green' }, 'Trả lời: ' + a.response + (a.handled_by_name ? ' – ' + a.handled_by_name : '')) : ''),
          badge(a.status), manage ? h('button', { class: 'btn sm', onclick: () => handle(a) }, 'Xử lý') : '')))
          : h('div', { class: 'empty' }, 'Chưa có phản hồi.')));
    } catch (e) { errorBox(body, e, appeals); }
  }

  function newAppeal(incident) {
    const kind = h('select', {}, options(KINDS, { selected: incident ? 'PHAN_HOI' : undefined }));
    const myClasses = b.classes.filter(c => app.user.classIds.includes(c.class_id) || app.user.allScope || app.user.perms.includes('*'));
    const cls = h('select', {}, options(myClasses, { value: 'class_id', label: 'name', empty: '— Không gắn lớp (góp ý chung) —', selected: incident?.class_id_at_time }));
    const text = h('textarea', { placeholder: 'Trình bày rõ nội dung. Giáo viên không sửa trực tiếp bản ghi/điểm – Tổng phụ trách sẽ xem xét.' });
    modal({ title: incident ? `Phản hồi bản ghi: ${incident.class_name} – ${incident.type_name}` : 'Gửi phản hồi / góp ý',
      body: h('div', {}, field('Loại', kind), incident ? '' : field('Lớp', cls), field('Nội dung', text)),
      actions: [{ label: 'Hủy' }, { label: 'Gửi', kind: 'primary', onClick: async () => {
        await app.call('appeal.create', { kind: kind.value, incident_id: incident?.incident_id, class_id: incident ? '' : cls.value, week_id: b.current_week?.week_id, content: text.value });
        toast('Đã gửi. Bạn có thể theo dõi trạng thái tại đây.', 'ok'); cur = 'ph'; appeals();
      } }] });
  }

  function handle(a) {
    const st = h('select', {}, options([{ value: 'MOI', label: 'Mới' }, { value: 'DANG_XU_LY', label: 'Đang xử lý' }, { value: 'DA_GIAI_QUYET', label: 'Đã giải quyết' }, { value: 'DA_DONG', label: 'Đã đóng' }], { selected: a.status }));
    const resp = h('textarea', {}, a.response || '');
    modal({ title: 'Xử lý phản hồi', body: h('div', {}, h('p', {}, a.content), a.incident_id ? h('div', { class: 'notice' }, 'Nếu cần sửa điểm: vào Duyệt minh chứng → trạng thái "Đã duyệt" → Sửa/Bác bỏ (tuần đã khóa phải mở khóa có lý do).') : '', field('Trạng thái', st), field('Trả lời', resp)),
      actions: [{ label: 'Hủy' }, { label: 'Lưu', kind: 'primary', onClick: async () => { await app.call('appeal.update', { appeal_id: a.appeal_id, status: st.value, response: resp.value }); toast('Đã cập nhật', 'ok'); appeals(); } }] });
  }

  async function classIncidents() {
    loading(body);
    try {
      const r = await app.call('incident.list', { status: 'DA_DUYET', limit: 100 });
      body.replaceChildren(h('div', { class: 'card' }, r.items.length ? h('div', { class: 'list' }, r.items.map(i => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('b', {}, `${i.class_name} – ${i.type_name}`), h('div', { class: 'small muted' }, fmtDateTime(i.occurred_at), ' · Điểm: ', signed(i.approved_points))),
        i.evidence.length ? h('button', { class: 'btn sm', onclick: () => viewEvidence(app, i) }, 'Ảnh') : '',
        app.can(['appeal.create', 'appeal.manage']) ? h('button', { class: 'btn sm', onclick: () => newAppeal(i) }, 'Phản hồi') : '')))
        : h('div', { class: 'empty' }, 'Chưa có vi phạm đã duyệt.')));
    } catch (e) { errorBox(body, e, classIncidents); }
  }

  show();
}
