/**
 * NHẬP NHANH SỔ TRỰC – tách văn bản gõ/đọc theo sổ thành các bản ghi (lớp, ngày, buổi, học sinh, lỗi).
 * Viết theo cách Sao đỏ thực tế ghi sổ, ví dụ:
 *   Ngày 28/10/2026                       → đổi ngày cho các dòng sau
 *   Thứ Ba ngày 3 tháng 11 năm 2026       → đổi ngày
 *   * Buổi chiều / Giờ ra chơi / HĐGG     → đổi buổi (giờ)
 *   Trần Linh Nhi không sơ vin            → tên + lỗi
 *   Vũ Anh Quân: tháo sơ vin              → tên: lỗi
 *   - Nói chuyện: Cao Bảo Hân, Hoàng Dũng → lỗi: nhiều tên
 *   Nhi, Lợi, D.An, Ngọc, nói chuyện      → nhiều tên, lỗi
 *   Ng Thanh Công không khăn quàng, phù hiệu → một tên, nhiều lỗi
 *   Xếp hàng muộn                         → lỗi tập thể (không tên)
 *   8A5 Thông: khăn quàng, mũ             → có ghi lớp ở đầu dòng
 * Không gửi dữ liệu ra ngoài; chạy hoàn toàn trên điện thoại.
 */
import { fold } from './ui.js';

/* Quy tắc nhận lỗi: chuỗi đã bỏ dấu → mã lỗi trong danh mục. sure=false: nên kiểm tra lại. */
const RULES = [
  [/\b(khan quang|kq)\b/, 'KHAN_QUANG'],
  [/\b(phu hieu|ph)\b/, 'PHU_HIEU'],
  [/\b(mu trang|mu|mt)\b/, 'MU_TRANG'],
  [/\bso ?vin\b/, 'SO_VIN'],
  [/\bthat lung\b/, 'THAT_LUNG'],
  [/\b(dong phuc|trang phuc|dp)\b/, 'TRANG_PHUC'],
  [/\b(dep|chan dat|dap quai|quai hau|dep le)\b/, 'DEP'],
  [/\b(dau toc|toc)\b/, 'DAU_TOC'],
  [/\bde xe\b/, 'DE_XE'],
  [/\b(mat trat tu|lam on|on ao)\b/, 'MAT_TRAT_TU_HANG'],
  [/\bnoi chuyen\b/, 'NOI_CHUYEN'],
  [/\b(doi|chuyen) cho\b/, 'DOI_CHO'],
  [/\bxep hang\b/, 'XEP_HANG'],
  [/\bdi (hoc )?muon\b/, 'DI_MUON'],
  [/\bxuong muon\b/, 'DI_MUON', false],
  [/\b(an qua|an do an|an vat|an banh|an keo)\b/, 'AN_QUA'],
  [/\b(xa rac|vut rac)\b/, 'XA_RAC'],
  [/\b(chui bay|noi tuc|noi bay)\b/, 'NOI_TUC'],
  [/\b(tron|bo) (hdgg|hd gg|hoat dong|the duc|tiet|giua gio)/, 'GIUA_GIO'],
  [/\b(hdgg|hd gg)\b/, 'GIUA_GIO', false],
  [/\b(bo tap trung|bo xep hang)\b/, 'BO_XEP_HANG'],
  [/\b(khong|ko|k) tap trung\b/, 'BO_XEP_HANG', false],
  [/\b(khong|ko|k|chua) nghiem tuc\b/, 'MAT_TRAT_TU_HANG', false],
  [/\b(danh nhau|bat nat)\b/, 'DANH_NHAU'],
  [/\b(dua nghich|no nghich|chay nhay)\b/, 'NO_NGHICH'],
  [/\bdien thoai\b/, 'DIEN_THOAI'],
  [/\bleo (cay|treo)\b/, 'LEO_CAY'],
  [/\bdi xe (trong )?san\b/, 'DI_XE_SAN'],
  [/\b(le phep|vo le|hon lao|hon hao)\b/, 'LE_PHEP', false],
  [/\b(truy bai|binh nhat)\b/, 'TRUY_BAI'],
  [/\b(thieu ghe|ko mang ghe|khong mang ghe|k mang ghe)\b/, 'CN_NHE_KHAC', false],
  [/\bve sinh\b/, 'VE_SINH', false]
];

const COLLECTIVE = new Set(['XEP_HANG', 'TRUY_BAI', 'VE_SINH', 'MAT_TRAT_TU_TU_QUAN', 'BAN_GHE', 'DO_RAC_LOP', 'TAT_DIEN_LOP', 'KHOA_CUA']);

/* Từ mở đầu phần lỗi (giữ dấu, viết thường) – dùng để cắt "Tên + lỗi". */
const START = new Set(['không', 'ko', 'k', 'kh', 'thiếu', 'mất', 'tháo', 'đi', 'đeo', 'mặc', 'xuống', 'trốn', 'tự', 'tập', 'ăn', 'chửi', 'đánh', 'nói',
  'sai', 'bỏ', 'xếp', 'đùa', 'leo', 'hút', 'mang', 'quên', 'nghỉ', 'vệ', 'khăn', 'phù', 'mũ', 'sơ', 'thắt', 'dép', 'chân', 'nô', 'chưa',
  'khong', 'thieu', 'thao', 'deo', 'mac', 'xuong', 'tron', 'chui', 'danh', 'xep', 'dep', 'quen', 'chua', 'hđgg', 'hdgg', 'kq', 'ph']);

/* Dòng tiêu đề buổi/hoạt động → giờ mặc định. */
const SESSIONS = [
  [/\bchieu\b/, '13:30'], [/\b(ra choi)\b/, '09:00'], [/\b(hdgg|hd gg|giua gio|the duc giua gio)\b/, '09:15'],
  [/\b(chao co|shdc|sinh hoat duoi co)\b/, '07:00'], [/\b(truy bai|dau gio)\b/, '06:50'], [/\bsang\b/, '07:00']
];
const HEADER_WORDS = /\b(buoi|sang|chieu|gio|ra choi|hd|hdgg|hoat dong|giua|the duc|chao co|shdc|sinh hoat|duoi co|truy bai|dau gio|tuan|thu|ngay|thang|nam|hai|ba|tu|nam|sau|bay|chu nhat|cn|lop|truc|cong|\d+[a-z]\d+|\d+)\b/g;

const pad = n => String(n).padStart(2, '0');
function validDate(y, m, d) { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }

/** Tìm ngày trong dòng. Trả về {key, invalid, start, end} hoặc null. */
function findDate(line, year) {
  const low = line.toLowerCase();
  let m = /ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{2,4}))?/.exec(low);
  const pack = (d, mo, y, mm) => {
    let yy = y ? +y : year; if (yy < 100) yy += 2000;
    const ok = validDate(yy, +mo, +d);
    return { key: ok ? `${yy}-${pad(mo)}-${pad(d)}` : '', invalid: !ok, raw: mm[0], start: mm.index, end: mm.index + mm[0].length };
  };
  if (m) return pack(m[1], m[2], m[3], m);
  // d/m/y (chấp nhận / \ - .); thử mọi vị trí để bỏ qua "Thứ 2/26/10/2026"
  const re = /(\d{1,2})\s*[/\\\-.]\s*(\d{1,2})\s*[/\\\-.]\s*(\d{2,4})/g;
  let best = null;
  for (let i = 0; i < low.length; i++) {
    re.lastIndex = i; const x = re.exec(low);
    if (!x) break;
    if (+x[2] >= 1 && +x[2] <= 12 && +x[1] >= 1 && +x[1] <= 31) { best = x; break; }
    i = x.index;
  }
  if (best) return pack(best[1], best[2], best[3], best);
  m = /(?:ngày|^)\s*(\d{1,2})\s*[/\\\-.]\s*(\d{1,2})(?!\s*[/\\\-.]?\s*\d)/.exec(low);
  if (m && +m[2] >= 1 && +m[2] <= 12 && /ngày/.test(low)) return pack(m[1], m[2], '', m);
  return null;
}

/** Các lỗi trong một đoạn chữ, theo thứ tự xuất hiện: [{code, sure, pos}]. */
function violationsIn(text) {
  const f = ' ' + fold(text).replace(/[°º]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const out = [];
  for (const [re, code, sure] of RULES) {
    const m = re.exec(f);
    if (m && !out.some(o => o.code === code)) out.push({ code, sure: sure !== false, pos: m.index });
  }
  // "trong HĐGG" chỉ là nơi xảy ra khi đã có lỗi khác (nói chuyện, mất trật tự…)
  const res = out.length > 1 ? out.filter(o => !(o.code === 'GIUA_GIO' && !o.sure)) : out;
  return res.sort((a, b) => a.pos - b.pos);
}
const looksViolation = t => violationsIn(t).length > 0;

/** Tách "Tên + lỗi" theo từ mở đầu phần lỗi. Trả về {name, viol}. */
function splitNameViol(item) {
  const toks = item.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].toLowerCase().replace(/[°º.,:;]+$/g, '').replace(/[°º]/g, '');
    const rest = toks.slice(i).join(' ');
    if (START.has(w) || (i > 0 && violationsIn(rest).some(v => v.pos <= 2))) return { name: toks.slice(0, i).join(' '), viol: rest };
  }
  return looksViolation(item) ? { name: '', viol: item } : { name: item.trim(), viol: '' };
}

const cleanName = s => s.replace(/^[\s\-+*•.:;]+|[\s\-+*•.:;]+$/g, '').replace(/\s+/g, ' ').trim();
const isNameLike = s => { const n = cleanName(s); return n.length >= 2 && n.split(' ').length <= 6 && !/\d/.test(n); };

/**
 * Tách cả trang. opts: {classes:[{class_id,name}], defaultClassId, defaultDate (yyyy-mm-dd), year}
 * Trả về [{line, raw, date, dateInvalid, time, classId, classText, names:[...], codes:[{code,sure}], violText, collective, warn:[...]}]
 */
export function parseLogbook(text, opts) {
  const byName = {}; (opts.classes || []).forEach(c => { byName[String(c.name).toUpperCase()] = c.class_id; });
  let date = opts.defaultDate, dateInvalid = false, time = '07:00', curClass = opts.defaultClassId, curClassText = '';
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    let line = rawLine.replace(/\t/g, ' ').trim();
    if (!line || /^[-_=*.~\s]+$/.test(line)) return;
    // Ngày
    const d = findDate(line, opts.year);
    if (d) { date = d.key || date; dateInvalid = d.invalid; line = (line.slice(0, d.start) + ' ' + line.slice(d.end)).trim(); }
    // Ghi chú trong ngoặc, ví dụ (SHDC), (8A1 trực cổng)
    let ctx = '';
    line = line.replace(/\(([^)]*)\)/g, (_, x) => { ctx += ' ' + x; return ' '; }).trim();
    // Buổi / hoạt động
    const fl = ' ' + fold(line + ' ' + ctx).replace(/[^a-z0-9 ]+/g, ' ') + ' ';
    for (const [re, t] of SESSIONS) if (re.test(fl)) { time = t; break; }
    // Lớp ghi ở đầu dòng: "8A5 ...", "Lớp 6A6 ..."
    let classId = curClass, classText = '';
    line = line.replace(/(?:^|\s)(?:lớp|lop)?\s*(\d{1,2}[A-Za-z]\d{1,2})\b[\s:,-]*/i, (all, c) => { classText = c.toUpperCase(); return ' '; }).trim();
    if (classText) classId = byName[classText] || '';
    const setClass = () => { if (classText) { curClass = classId; curClassText = classText; } };
    // Bỏ tiền tố tiêu đề "Sáng:", "* Buổi chiều:", "Giờ ra chơi:", "T3:"
    line = line.replace(/^[\s\-+*•]*(buổi\s+)?(sáng|chiều|giờ ra chơi|hđ giữa giờ|hoạt động giữa giờ|chào cờ|t\d)\s*[:.-]\s*/i, '').trim();
    line = line.replace(/^[\s\-+*•]+/, '').trim();
    if (!line) { setClass(); return; }
    // Chỉ còn từ tiêu đề (Tuần 9, Buổi sáng, Thứ hai…) → bỏ qua
    if (!fold(line).replace(/[^a-z0-9 ]+/g, ' ').replace(HEADER_WORDS, '').trim() && !looksViolation(line.replace(/\b(hđgg|hdgg|hđ giữa giờ)\b/gi, ''))) { setClass(); return; }
    if (!classText && curClassText) classText = curClassText;

    let names = [], violText = '';
    const colon = line.indexOf(':');
    if (colon > 0) {
      const L = line.slice(0, colon), R = line.slice(colon + 1);
      if (looksViolation(L) && !looksViolation(R)) { violText = L; names = R.split(/[,;]| và /).map(cleanName).filter(isNameLike); }
      else {
        const s = splitNameViol(L);
        names = (s.viol ? [s.name] : L.split(/[,;]/)).map(cleanName).filter(isNameLike);
        violText = (s.viol ? s.viol + ', ' : '') + R;
      }
    } else {
      const parts = line.split(/[,;]/);
      const viols = [];
      parts.forEach(p => {
        const s = splitNameViol(p);
        if (s.name && isNameLike(s.name)) names.push(cleanName(s.name));
        if (s.viol) viols.push(s.viol);
      });
      violText = viols.join(', ');
    }
    const codes = violationsIn(violText || line);
    const warn = [];
    if (dateInvalid) warn.push('Ngày ghi trong sổ không hợp lệ');
    if (classText && !classId) warn.push('Lớp ' + classText + ' không thuộc phạm vi được ghi nhận');
    if (!codes.length) warn.push('Chưa nhận ra lỗi – chọn lỗi');
    if (!names.length && codes.some(c => !COLLECTIVE.has(c.code))) warn.push('Chưa có tên học sinh');
    codes.filter(c => !c.sure).forEach(() => warn.length < 3 && warn.push('Kiểm tra lại lỗi'));
    const base = { line: idx + 1, raw: rawLine.trim(), date, dateInvalid, time, classId, classText, violText: (violText || line).trim(), ctx: ctx.trim() };
    const list = codes.length ? codes : [{ code: '', sure: false }];
    if (!names.length) list.forEach(c => out.push({ ...base, name: '', code: c.code, sure: c.sure, collective: true, warn: [...new Set(warn)] }));
    else names.forEach(n => list.forEach(c => out.push({ ...base, name: n, code: c.code, sure: c.sure, collective: false, warn: [...new Set(warn)] })));
  });
  return out;
}

/** Khớp tên viết trong sổ với danh sách học sinh lớp. students: [{value,label}] → {value, candidates, exact} */
export function matchStudent(name, students) {
  const toks = s => fold(s).replace(/\(\d+\)$/, '').replace(/[^a-z0-9. ]+/g, ' ').replace(/\./g, '. ').split(/\s+/).filter(Boolean);
  const expand = t => ({ ng: 'nguyen', ngu: 'nguyen', tr: 'tran', ph: 'pham', hg: 'hoang' }[t] || t);
  const q = toks(name).map(expand);
  if (!q.length) return { value: '', candidates: [] };
  const tokOk = (a, b) => a.endsWith('.') ? b.startsWith(a.slice(0, -1)) : a === b;
  const scored = students.map(s => {
    const st = toks(s.label);
    if (fold(s.label).replace(/\s*\(\d+\)$/, '') === q.join(' ')) return { s, score: 100 };
    // tên gọi (chữ cuối) phải khớp; các chữ trước khớp theo thứ tự (cho phép bỏ bớt họ, đệm)
    if (!tokOk(q[q.length - 1], st[st.length - 1])) return { s, score: 0 };
    let j = st.length - 2, sc = 10;
    for (let i = q.length - 2; i >= 0; i--) {
      while (j >= 0 && !tokOk(q[i], st[j])) j--;
      if (j < 0) return { s, score: 0 };
      sc += 10; j--;
    }
    return { s, score: sc };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return { value: '', candidates: [] };
  const top = scored.filter(x => x.score === scored[0].score);
  return { value: top.length === 1 ? top[0].s.value : '', candidates: top.map(x => x.s), exact: scored[0].score === 100 };
}
