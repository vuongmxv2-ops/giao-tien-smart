/** Dựng bảng thi đua tuần (cơ bản hoặc kèm ảnh trong Note) từ dữ liệu ĐÃ DUYỆT. */
import { readTemplate, buildXlsx } from './engine.js';
import { composeCollage } from './collage.js';

const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const wdOf = k => { const p = k.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); };
const serial = k => { const p = k.split('-'); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 864e5); };
const vnDate = k => k.split('-').reverse().join('/');
const sg = v => (v > 0 ? '+' : '') + v;
const r2 = x => Math.round(x * 100) / 100;

/**
 * Ghi chú người vi phạm: tên học sinh, hoặc "(Lỗi tập thể)" khi bản ghi không gắn học sinh.
 * Máy chủ chỉ gửi tên khi bật "Ghi tên học sinh trong ghi chú Excel"; nếu cả tuần không có tên nào thì coi như chưa bật
 * và để trống (không đoán "tập thể" cho mọi bản ghi).
 */
export function whoLabel(it, namesOn) {
  if (it.student_name) return it.student_name;
  return namesOn ? '(Lỗi tập thể)' : '';
}
export const namesEnabled = items => items.some(i => i.student_name);

/** 3 dòng chú thích ảnh: (1) Thứ · giờ · ngày, (2) Họ và tên – Lớp, (3) Lỗi vi phạm + điểm. */
export function captionLines(it, className, namesOn, points) {
  const who = whoLabel(it, namesOn);
  return [[WD[wdOf(it.date)], it.time, vnDate(it.date)].filter(Boolean).join(' · '),
    (who ? who + ' – ' : '') + 'Lớp ' + className,
    `${it.type_name.toUpperCase()}  ${points}`];
}

export function parseThresholds(str) {
  return String(str || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean).map(p => { const [l, m] = p.split(':'); return { label: l.trim(), min: m !== undefined && m.trim() !== '' ? Number(m) : null }; });
}

function gradeOf(points, t) { for (const x of t) if (x.min == null || points >= x.min) return x.label; return ''; }

function gradeHeader(t) {
  const lines = ['Xếp loại'];
  t.forEach((x, i) => {
    const prev = t[i - 1];
    if (i === 0 && x.min != null) lines.push(`${x.label}>=${x.min}`);
    else if (x.min != null) lines.push(`${x.min}=<${x.label}<${prev.min}`);
    else if (prev) lines.push(`${x.label}<${prev.min}`);
  });
  return lines.join('\n');
}

/** Chia thành nhóm ≤ size ảnh; điểm của bản ghi tính vào nhóm chứa ảnh đầu tiên của nó (giống Logic.groupEvidence ở backend). */
export function groupEvidence(items, size = 4) {
  const groups = []; let cur = null;
  const add = () => { cur = { images: [], incidents: [], points: 0 }; groups.push(cur); };
  for (const it of items) {
    const ev = it.evidence || [];
    if (!ev.length) { if (!groups.length) add(); groups[0].incidents.push(it); groups[0].points = r2(groups[0].points + Number(it.points || 0)); continue; }
    ev.forEach((e, i) => {
      if (!cur || cur.images.length >= size) add();
      cur.images.push({ evidence: e, incident: it });
      if (i === 0) { cur.incidents.push(it); cur.points = r2(cur.points + Number(it.points || 0)); }
    });
  }
  return groups;
}

/**
 * @param data   kết quả API export.weekData
 * @param templateBytes ArrayBuffer tệp mẫu
 * @param withImages true = Note chứa ảnh ghép; false = Note văn bản
 * @param loadImages async (evidenceIds[]) => Map(id → ImageBitmap|HTMLImageElement)
 */
export async function buildWeekWorkbook({ data, templateBytes, withImages, loadImages, onLog = () => {} }) {
  const tpl = await readTemplate(templateBytes);
  // Các lớp cùng nhóm thi đua đứng liền nhau (giữ thứ tự gốc) để công thức Xếp thứ tính trong từng nhóm
  const gOrder = [...new Set(data.classes.map(c => c.comp_group || ''))];
  data = { ...data, classes: gOrder.flatMap(g => data.classes.filter(c => (c.comp_group || '') === g)) };
  const gRange = {};
  data.classes.forEach((c, i) => { const g = c.comp_group || ''; if (!gRange[g]) gRange[g] = [i, i]; else gRange[g][1] = i; });
  const t = parseThresholds(data.thresholds);
  const days = data.days.slice();
  const warnings = [];
  const namesOn = namesEnabled(data.items);
  if (data.items.length && !namesOn) warnings.push('Chưa có tên học sinh trong ghi chú: vào Quản trị → Cài đặt khác → "Ghi tên học sinh trong ghi chú Excel" chọn Có rồi xuất lại.');
  const dayIndex = k => {
    let i = days.indexOf(k);
    if (i >= 0) return i;
    const prior = days.filter(d => d <= k); i = prior.length ? days.indexOf(prior[prior.length - 1]) : 0;
    warnings.push(`Bản ghi ngày ${vnDate(k)} (${WD[wdOf(k)]}) không phải ngày học – đưa vào cột ${WD[wdOf(days[i])]} ${vnDate(days[i])}.`);
    return i;
  };
  // Gom theo lớp → ngày → cộng/trừ
  const byClass = new Map(data.classes.map(c => [c.class_id, days.map(() => ({ cong: [], tru: [] }))]));
  for (const it of data.items) {
    const slots = byClass.get(it.class_id); if (!slots) continue;
    slots[dayIndex(it.date)][it.points > 0 ? 'cong' : 'tru'].push(it);
  }
  const grouped = new Map();
  for (const [cid, slots] of byClass) grouped.set(cid, slots.map(s => ({
    cong: s.cong.length ? (withImages ? groupEvidence(s.cong) : [{ images: [], incidents: s.cong, points: r2(s.cong.reduce((a, b) => a + b.points, 0)) }]) : [],
    tru: s.tru.length ? (withImages ? groupEvidence(s.tru) : [{ images: [], incidents: s.tru, points: r2(s.tru.reduce((a, b) => a + b.points, 0)) }]) : []
  })));
  // Số cột mỗi ngày = số nhóm lớn nhất (tối thiểu 1 cột Cộng, 1 cột Trừ)
  const nCong = days.map((_, d) => Math.max(1, ...[...grouped.values()].map(s => s[d].cong.length)));
  const nTru = days.map((_, d) => Math.max(1, ...[...grouped.values()].map(s => s[d].tru.length)));
  const columns = [{ role: 'stt' }, { role: 'name' }];
  days.forEach((_, d) => { for (let i = 0; i < nCong[d]; i++) columns.push({ role: 'cong', day: d, k: i }); for (let i = 0; i < nTru[d]; i++) columns.push({ role: 'tru', day: d, k: i }); });
  columns.push({ role: 'total' }, { role: 'sum' }, { role: 'grade' }, { role: 'rank' });

  // Tải ảnh (chỉ ảnh của bản ghi đã duyệt)
  let imgMap = new Map();
  const allIds = withImages ? data.items.flatMap(i => i.evidence.map(e => e.evidence_id)) : [];
  if (withImages && allIds.length) {
    onLog(`Đang tải ${allIds.length} ảnh minh chứng đã duyệt…`);
    imgMap = await loadImages(allIds);
    const missing = allIds.filter(id => !imgMap.get(id));
    if (missing.length) throw new Error(`Không tải được ${missing.length} ảnh (${missing.slice(0, 5).join(', ')}…). Dừng xuất để không bỏ sót minh chứng – hãy thử lại.`);
  }

  const rows = [], comments = [], detail = [];
  let placedImages = 0, collages = 0;
  const grades = data.classes.map(c => c.grade);
  for (let i = 0; i < data.classes.length; i++) {
    const c = data.classes[i], slots = grouped.get(c.class_id);
    const prevSame = i > 0 && grades[i - 1] === c.grade, nextSame = i < grades.length - 1 && grades[i + 1] === c.grade;
    const block = prevSame && nextSame ? 'mid' : prevSame ? 'last' : nextSame ? 'first' : 'single';
    const values = columns.map(() => '');
    values[0] = i + 1; values[1] = c.name;
    let sum = 0;
    for (let j = 0; j < columns.length; j++) {
      const col = columns[j];
      if (col.role !== 'cong' && col.role !== 'tru') continue;
      const g = slots[col.day][col.role][col.k];
      if (!g || !g.incidents.length && !g.images.length) continue;
      values[j] = g.points; sum = r2(sum + g.points);
      const ref = { row: i, col: j };
      const cellAddr = colName(j + 1) + (7 + i);
      if (withImages && g.images.length) {
        onLog(`Ghép ảnh lớp ${c.name} – ${WD[wdOf(days[col.day])]} (${g.images.length} ảnh)`);
        const tiles = g.images.map(im => ({ source: imgMap.get(im.evidence.evidence_id), positive: im.incident.points > 0,
          lines: captionLines(im.incident, c.name, namesOn, im.evidence === im.incident.evidence[0] ? sg(im.incident.points) + ' điểm' : '(ảnh tiếp)') }));
        const col2 = await composeCollage(tiles);
        const name = `${c.name}_${days[col.day].replace(/-/g, '')}_${col.role}${col.k + 1}.jpg`;
        comments.push({ ...ref, image: { bytes: col2.bytes, wPx: col2.wPx, hPx: col2.hPx, wPt: g.images.length === 1 ? 330 : 480, name } });
        placedImages += g.images.length; collages++;
        g.images.forEach(im => detail.push([c.name, vnDate(im.incident.date), WD[wdOf(im.incident.date)], im.evidence.filename || im.evidence.evidence_id,
          im.evidence === im.incident.evidence[0] ? im.incident.points : 0, im.incident.type_name, cellAddr, im.evidence.evidence_id]));
        const noImg = g.incidents.filter(x => !x.evidence.length);
        noImg.forEach(x => detail.push([c.name, vnDate(x.date), WD[wdOf(x.date)], '(không có ảnh)', x.points, x.type_name, cellAddr, x.incident_id]));
      } else {
        const text = g.incidents.map(x => `${x.type_name} ${sg(x.points)}${x.time ? ' (' + x.time + ')' : ''}${whoLabel(x, namesOn) ? ' – ' + whoLabel(x, namesOn) : ''}`).join('\n');
        comments.push({ ...ref, text });
        g.incidents.forEach(x => detail.push([c.name, vnDate(x.date), WD[wdOf(x.date)], x.evidence.map(e => e.filename || e.evidence_id).join('; ') || '(không có ảnh)', x.points, x.type_name, cellAddr, x.incident_id]));
      }
    }
    const total = r2(Number(data.starting_points) + sum);
    if (Math.abs(total - Number(c.final_points)) > 0.001) throw new Error(`Sai lệch điểm lớp ${c.name}: bảng Excel ${total} ≠ hệ thống ${c.final_points}. Dừng xuất.`);
    rows.push({ block, values, rankRange: gRange[c.comp_group || ''], cached: { total, grade: gradeOf(total, t), rank: c.rank } });
  }
  if (withImages && placedImages !== allIds.length) throw new Error(`Số ảnh đưa vào Note (${placedImages}) khác số ảnh đã duyệt (${allIds.length}).`);

  const model = {
    sheetName: 'T' + data.week.week_no,
    title1: 'LIÊN ĐỘI ' + (data.school_name || 'TRƯỜNG THCS GIAO TIẾN'),
    title2: `BẢNG THEO DÕI THI ĐUA TUẦN ${data.week.week_no} - ${data.scope_name}`,
    days: days.map(k => ({ label: WD[wdOf(k)], serial: serial(k) })),
    columns, rows, comments, startingPoints: Number(data.starting_points), thresholds: t, gradeHeader: gradeHeader(t),
    rankByFormula: data.tie_rule === 'COMPETITION',
    detail: { header: ['Lớp', 'Ngày', 'Thứ', 'File ảnh', 'Điểm', 'Nội dung', 'Ô ghi chú', 'Mã minh chứng'], rows: detail }
  };
  onLog('Đang đóng gói tệp XLSX…');
  const blob = await buildXlsx(tpl, model);
  return { blob, summary: { classes: rows.length, comments: comments.length, collages, images: placedImages, expectedImages: allIds.length, columns: columns.length, warnings } };
}

function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
