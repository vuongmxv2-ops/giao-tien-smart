import { h, options, field, toast, loading, errorBox, table, download, blobToB64, b64ToBlob, fmtDateTime, devNote, fmtDate } from '../ui.js';
import { buildWeekWorkbook } from '../xlsx/report.js';
import { decode } from '../image.js';

/** TAB 11 – XUẤT BÁO CÁO – EXCEL KÈM MINH CHỨNG */
export async function render(el, app, params) {
  const b = app.boot;
  const fWeek = h('select', {}, options(b.weeks, { value: 'week_id', label: w => app.weekLabel(w) + (w.status === 'LOCKED' ? ' 🔒 (chính thức)' : ' (tạm tính)'), selected: params.week_id || b.current_week?.week_id }));
  const fCampus = h('select', {}, options(b.campuses, { value: 'campus_id', label: 'name', empty: 'Toàn trường', selected: params.campus_id }));
  const fGroup = h('select', {}, options(app.groups(), { empty: 'Tất cả nhóm (mỗi nhóm xếp thứ riêng)', selected: params.comp_group }));
  el.append(h('div', { class: 'filters' }, field('Nhóm thi đua', fGroup), field('Năm học', h('input', { type: 'text', value: b.year?.name || '', disabled: true })), field('Tuần', fWeek), field('Cơ sở', fCampus)));
  const logBox = h('div', { class: 'small', style: 'max-height:220px;overflow:auto' });
  const prog = h('div', { class: 'progress', hidden: true }, h('i'));
  const result = h('div');
  const btnBasic = h('button', { class: 'btn primary btn-hero', style: 'min-height:70px;font-size:16px;background:linear-gradient(135deg,#0d47a1,#1565c0)', onclick: () => run('BASIC') }, '📄 XUẤT BẢNG THI ĐUA');
  const btnImg = h('button', { class: 'btn btn-hero', style: 'min-height:70px;font-size:16px', onclick: () => run('COMMENT_IMAGES') }, '🖼️ XUẤT BẢNG THI ĐUA KÈM ẢNH COMMENT');
  el.append(h('div', { class: 'card' }, h('h2', {}, 'Bảng thi đua tuần theo mẫu Tuần 7'),
    h('div', { class: 'grid c2' }, btnBasic, btnImg),
    h('div', { class: 'small muted', style: 'margin-top:8px' }, 'Nút 1: điểm cộng/trừ theo ngày, tổng, xếp loại, xếp thứ, ghi chú văn bản. Nút 2: ảnh minh chứng đã duyệt được ghép (tối đa 4 ảnh/nhóm) và đặt trong Note của đúng ô – mở bằng Microsoft Excel trên máy tính để xem ảnh.'),
    prog, logBox, result));

  // Báo cáo khác
  el.append(h('div', { class: 'card' }, h('h2', {}, 'Báo cáo khác'), h('div', { class: 'actions' },
    h('button', { class: 'btn', onclick: violationsCsv }, '📋 Danh sách vi phạm (CSV)'),
    h('button', { class: 'btn', onclick: rankingCsv }, '🏆 Bảng xếp hạng (CSV)'),
    h('button', { class: 'btn', onclick: () => app.nav('bang-diem', { week_id: fWeek.value }) }, '🖨️ In / lưu PDF bảng điểm'),
    app.can('admin.backup') ? h('button', { class: 'btn', onclick: () => app.nav('quan-tri') }, '💾 Bản sao lưu dữ liệu') : ''),
    h('div', { class: 'small muted', style: 'margin-top:6px' }, 'Excel tổng hợp tháng: ', devNote(), ' – tạm thời dùng Xếp hạng theo tháng rồi xuất CSV.')));

  const tplCard = h('div', { class: 'card' }, h('h2', {}, 'Mẫu Excel đang dùng'));
  const jobs = h('div', { class: 'card' }, h('h2', {}, 'Lịch sử xuất (lưu trong Google Drive)'));
  el.append(tplCard, jobs);
  loadTemplateInfo(); loadJobs();
  if (params.kind) setTimeout(() => run(params.kind), 50);

  const log = m => { logBox.append(h('div', {}, '• ' + m)); logBox.scrollTop = 1e9; };
  const setProg = p => { prog.hidden = false; prog.firstChild.style.width = Math.round(p * 100) + '%'; };

  async function getTemplate() {
    try {
      const t = await app.call('export.template', {});
      if (t.found) { log('Dùng mẫu trên Drive: ' + t.name); return b64ToBlob(t.base64, 'application/octet-stream').arrayBuffer(); }
    } catch (e) { log('Không đọc được mẫu trên Drive: ' + e.message); }
    log('Dùng mẫu mặc định kèm ứng dụng (định dạng tuần 7).');
    const r = await fetch('templates/mau_thi_dua.xlsx');
    if (!r.ok) throw new Error('Không tải được tệp mẫu mặc định.');
    return r.arrayBuffer();
  }

  async function loadImages(ids) {
    const map = new Map();
    for (let i = 0; i < ids.length; i += 8) {
      const part = ids.slice(i, i + 8);
      const r = await app.call('evidence.getMany', { ids: part, size: 'preview' }, { timeout: 180000 });
      for (const it of r.items) {
        if (it.error || !it.base64) continue;
        try { map.set(it.evidence_id, await decode(b64ToBlob(it.base64, it.mime))); } catch { /* báo thiếu ở bước kiểm tra */ }
      }
      // các ảnh chưa nhận do giới hạn dung lượng phản hồi: gọi lại
      const got = new Set(r.items.map(x => x.evidence_id));
      for (const id of part) if (!got.has(id)) {
        const one = await app.call('evidence.get', { evidence_id: id, size: 'preview' }, { timeout: 180000 });
        map.set(id, await decode(b64ToBlob(one.base64, one.mime)));
      }
      setProg(0.15 + 0.6 * Math.min(1, (i + part.length) / ids.length));
    }
    return map;
  }

  let busy = false;
  async function run(kind) {
    if (busy) return;
    if (!window.JSZip) return toast('Chưa tải được thư viện JSZip. Kiểm tra mạng rồi tải lại trang.', 'err');
    busy = true; btnBasic.disabled = btnImg.disabled = true;
    logBox.replaceChildren(); result.replaceChildren(); setProg(0.02);
    const withImages = kind === 'COMMENT_IMAGES';
    try {
      log('Lấy dữ liệu đã duyệt của tuần…');
      const data = await app.call('export.weekData', { week_id: fWeek.value, campus_id: fCampus.value, comp_group: fGroup.value });
      log(`${data.classes.length} lớp, ${data.items.length} bản ghi đã duyệt, ${data.items.reduce((s, i) => s + i.evidence.length, 0)} ảnh. ${data.locked ? 'Tuần đã khóa (phiên bản ' + data.version + ').' : 'Tuần CHƯA khóa – điểm tạm tính.'}`);
      setProg(0.1);
      const tplBytes = await getTemplate();
      const { blob, summary } = await buildWeekWorkbook({ data, templateBytes: tplBytes, withImages, loadImages, onLog: log });
      setProg(0.85);
      summary.warnings.forEach(w => log('⚠ ' + w));
      const scope = (fCampus.value ? (b.campuses.find(c => c.campus_id === fCampus.value)?.code || 'CS') : 'TOAN_TRUONG') + (fGroup.value ? '_' + fGroup.value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\W+/g, '_').toUpperCase() : '');
      const filename = `BANG_THI_DUA_T${data.week.week_no}_${scope}${withImages ? '_KEM_ANH' : ''}${data.locked ? '' : '_TAM_TINH'}.xlsx`;
      download(blob, filename);
      log(`Đã tạo ${filename} (${(blob.size / 1048576).toFixed(2)} MB). Đang lưu vào Google Drive…`);
      const note = `${summary.classes} lớp; ${summary.comments} ghi chú; ${summary.collages} ảnh ghép chứa ${summary.images}/${summary.expectedImages} ảnh; ${summary.columns} cột` + (summary.warnings.length ? '; ' + summary.warnings.join(' ') : '');
      let job = null;
      try { job = await app.call('export.save', { filename, base64: await blobToB64(blob), kind, week_id: data.week.week_id, campus_id: fCampus.value, image_count: summary.images, note }, { timeout: 240000 }); }
      catch (e) { log('⚠ Chưa lưu được vào Drive: ' + e.message + ' (tệp đã tải về máy).'); }
      setProg(1);
      result.replaceChildren(h('div', { class: 'notice green' }, `✔ Hoàn tất: ${note}.`, job ? ' Đã lưu vào Drive (05_XUAT_EXCEL).' : '', ' ',
        h('button', { class: 'btn sm', onclick: () => download(blob, filename) }, 'Tải lại tệp')),
        withImages ? h('div', { class: 'notice yellow' }, 'Ảnh trong Note chỉ hiển thị trên Microsoft Excel cho máy tính (Windows/Mac). Excel trên điện thoại và Excel Online không hiển thị ảnh trong Note.') : '');
      loadJobs();
    } catch (e) {
      log('✖ ' + e.message);
      result.replaceChildren(h('div', { class: 'notice red' }, 'Xuất thất bại: ' + e.message));
    } finally { busy = false; btnBasic.disabled = btnImg.disabled = false; }
  }

  async function loadTemplateInfo() {
    try {
      const t = await app.call('export.template', {});
      const up = h('input', { type: 'file', accept: '.xlsx', hidden: true });
      up.addEventListener('change', async () => {
        const f = up.files[0]; if (!f) return;
        try { await app.call('export.uploadTemplate', { filename: f.name, base64: await blobToB64(f) }, { timeout: 120000 }); toast('Đã tải mẫu lên Drive', 'ok'); loadTemplateInfo(); } catch (e) { toast(e.message, 'err'); }
      });
      tplCard.replaceChildren(h('h2', {}, 'Mẫu Excel đang dùng'), h('div', {}, t.found ? 'Mẫu trên Drive (07_MAU_BIEU): ' + t.name : 'Mẫu mặc định kèm ứng dụng (định dạng tuần 7).'),
        app.can('admin.config') ? h('div', { class: 'actions', style: 'margin-top:8px' }, h('button', { class: 'btn sm', onclick: () => up.click() }, 'Tải mẫu mới lên'), up) : '',
        h('div', { class: 'small muted' }, 'Hệ thống giữ nguyên font, màu, đường viền, độ rộng cột, chiều cao dòng của mẫu; dựng lại số cột Cộng/Trừ theo số nhóm ảnh của từng ngày và tự điều chỉnh công thức.'));
    } catch (e) { tplCard.append(h('div', { class: 'small neg' }, e.message)); }
  }

  async function loadJobs() {
    try {
      const list = await app.call('export.list', {});
      jobs.replaceChildren(h('h2', {}, 'Lịch sử xuất (lưu trong Google Drive)'), table([{ label: 'Thời gian', render: j => fmtDateTime(j.created_at) }, { label: 'Tệp', key: 'filename' },
        { label: 'Loại', render: j => j.kind === 'COMMENT_IMAGES' ? 'Kèm ảnh' : j.kind === 'BASIC' ? 'Cơ bản' : j.kind }, { label: 'Ảnh', key: 'image_count', num: true }, { label: 'Người xuất', key: 'created_by_name' },
        { label: '', render: j => h('button', { class: 'btn sm', onclick: async () => { try { const f = await app.call('export.download', { job_id: j.job_id }, { timeout: 180000 }); download(b64ToBlob(f.base64, f.mime), f.filename); } catch (e) { toast(e.message, 'err'); } } }, 'Tải') }], list, { empty: 'Chưa có lần xuất nào.' }));
    } catch (e) { errorBox(jobs, e, loadJobs); }
  }

  function csv(rows) { return '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'); }

  async function violationsCsv() {
    try {
      const r = await app.call('export.violations', { week_id: fWeek.value, campus_id: fCampus.value });
      const rows = [['Mã', 'Ngày', 'Giờ', 'Lớp', 'Nội dung', 'Điểm', 'Trạng thái', 'Người ghi nhận', 'Số ảnh']].concat(r.items.map(i => [i.incident_id, fmtDate(i.occurred_date), String(i.occurred_at).substr(11, 5), i.class_name, i.type_name, i.approved_points, i.status, i.submitted_by_name, i.evidence.length]));
      download(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }), `DANH_SACH_VI_PHAM_${fWeek.value}.csv`);
    } catch (e) { toast(e.message, 'err'); }
  }

  async function rankingCsv() {
    try {
      const d = await app.call('rank.get', { period: 'week', week_id: fWeek.value, campus_id: fCampus.value, comp_group: fGroup.value });
      const rows = [['Hạng', 'Lớp', 'Nhóm', 'Điểm TB', 'Tổng', 'Hạng tuần trước', 'Tăng/giảm', 'Lượt vi phạm']].concat(d.rows.map(r => [r.rank, r.class_name, r.comp_group || '', r.average, r.total, r.prev_rank, r.rank_change, r.violation_count]));
      download(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }), `XEP_HANG_${fWeek.value}.csv`);
    } catch (e) { toast(e.message, 'err'); }
  }
}
