/**
 * Thống kê tuyên dương – vi phạm theo lớp (gửi GVCN).
 * Tự ghi tệp .xlsx (JSZip) để có khung, chữ đậm, màu tiêu đề và khổ in ngang – thư viện đọc Excel không ghi được định dạng.
 */
const COLS = [
  { t: 'STT', w: 5 }, { t: 'Lớp', w: 7 }, { t: 'Họ và tên', w: 24 }, { t: 'Tuyên dương', w: 28 }, { t: 'Điểm cộng tuyên dương', w: 11 },
  { t: 'Ngày tuyên dương', w: 12 }, { t: 'Vi phạm', w: 30 }, { t: 'Điểm trừ vi phạm', w: 10 }, { t: 'Ngày vi phạm', w: 12 }, { t: 'Ghi chú', w: 26 }
];
// Chỉ số kiểu ô (cellXfs) trong styles.xml bên dưới
const S = { title: 1, sub: 2, head: 3, text: 4, center: 5, plus: 6, minus: 7, totalLabel: 8, totalNum: 9, foot: 10, footBold: 11 };

const vnDate = k => (k ? k.split('-').reverse().join('/') : '');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colL = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Ghi chú hiển thị: bỏ tiền tố [Sổ trực] do hệ thống thêm, ghi rõ nguồn sổ trực. */
function noteOf(it) {
  const n = String(it.note || '').replace(/^\[Sổ trực\]\s*/, '').trim();
  return [it.logbook ? 'Theo sổ trực' : '', n].filter(Boolean).join('; ');
}

/** Dựng dữ liệu một lớp: mỗi bản ghi một dòng; tuyên dương điền 3 cột tuyên dương, vi phạm điền 3 cột vi phạm. */
export function classRows(cls, items) {
  const rows = items.filter(i => i.class_id === cls.class_id).map((it, k) => {
    const praise = it.kind === 'CONG' || it.points > 0;
    const who = it.student_name || (it.collective ? '(Tập thể lớp)' : '');
    return { stt: k + 1, lop: cls.name, who, praise, name: it.type_name, points: it.points, date: vnDate(it.date), note: noteOf(it) };
  });
  const sumPlus = rows.filter(r => r.praise).reduce((s, r) => s + Number(r.points || 0), 0);
  const sumMinus = rows.filter(r => !r.praise).reduce((s, r) => s + Number(r.points || 0), 0);
  return { rows, nPlus: rows.filter(r => r.praise).length, nMinus: rows.filter(r => !r.praise).length, sumPlus, sumMinus };
}

function cell(ref, v, s) {
  if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  if (v === '' || v == null) return `<c r="${ref}" s="${s}"/>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(cls, data, meta) {
  const r2 = x => Math.round(x * 100) / 100;
  const rows = [], merges = [];
  let n = 0;
  const row = (cells, ht) => { n++; rows.push(`<row r="${n}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells.map(([c, v, s]) => cell(colL(c) + n, v, s)).join('')}</row>`); return n; };
  const span = (r, c1, c2) => merges.push(`${colL(c1)}${r}:${colL(c2)}${r}`);
  const last = COLS.length - 1;

  span(row([[0, 'LIÊN ĐỘI ' + (meta.school || 'TRƯỜNG THCS GIAO TIẾN').toUpperCase(), S.sub]]), 0, last);
  span(row([[0, `THỐNG KÊ TUYÊN DƯƠNG – VI PHẠM LỚP ${cls.name}`, S.title]], 24), 0, last);
  span(row([[0, `Từ ngày ${vnDate(meta.from)} đến ngày ${vnDate(meta.to)}`, S.sub]]), 0, last);
  row([]);
  row(COLS.map((c, i) => [i, c.t, S.head]), 48);
  if (!data.rows.length) {
    span(row([[0, 'Không có tuyên dương hay vi phạm nào đã duyệt trong thời gian này.', S.center], ...COLS.slice(1).map((_, i) => [i + 1, '', S.center])]), 0, last);
  }
  for (const r of data.rows) {
    row([[0, r.stt, S.center], [1, r.lop, S.center], [2, r.who, S.text],
      [3, r.praise ? r.name : '', S.text], [4, r.praise ? r.points : '', S.plus], [5, r.praise ? r.date : '', S.center],
      [6, r.praise ? '' : r.name, S.text], [7, r.praise ? '' : r.points, S.minus], [8, r.praise ? '' : r.date, S.center],
      [9, r.note, S.text]]);
  }
  const t = row([[0, 'Tổng cộng', S.totalLabel], [1, '', S.totalLabel], [2, '', S.totalLabel],
    [3, `${data.nPlus} lượt`, S.totalNum], [4, r2(data.sumPlus), S.plus], [5, '', S.totalNum],
    [6, `${data.nMinus} lượt`, S.totalNum], [7, r2(data.sumMinus), S.minus], [8, '', S.totalNum], [9, '', S.totalNum]]);
  span(t, 0, 2);
  row([]);
  const d = new Date();
  span(row([[6, `Giao Tiến, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`, S.foot]]), 6, last);
  span(row([[1, 'GIÁO VIÊN CHỦ NHIỆM', S.footBold], [6, 'TỔNG PHỤ TRÁCH ĐỘI', S.footBold]]), 6, last);
  span(n, 1, 3);

  const cols = COLS.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
<printOptions horizontalCentered="1"/>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="7">
<font><sz val="11"/><name val="Times New Roman"/></font>
<font><b/><sz val="14"/><color rgb="FF0D47A1"/><name val="Times New Roman"/></font>
<font><i/><sz val="11"/><name val="Times New Roman"/></font>
<font><b/><sz val="11"/><name val="Times New Roman"/></font>
<font><b/><sz val="11"/><color rgb="FF1B5E20"/><name val="Times New Roman"/></font>
<font><b/><sz val="11"/><color rgb="FFB71C1C"/><name val="Times New Roman"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Times New Roman"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EFFF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FF94A3B8"/></left><right style="thin"><color rgb="FF94A3B8"/></right><top style="thin"><color rgb="FF94A3B8"/></top><bottom style="thin"><color rgb="FF94A3B8"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Tên trang tính hợp lệ (≤ 31 ký tự, không chứa []:*?/\) và không trùng. */
function sheetName(name, used) {
  let base = String(name).replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Lop', s = base, k = 2;
  while (used.has(s.toLowerCase())) s = base.slice(0, 28) + '_' + k++;
  used.add(s.toLowerCase());
  return s;
}

/** Tạo tệp .xlsx gồm một trang tính cho mỗi lớp trong danh sách. */
export async function buildClassWorkbook(classes, data) {
  const zip = new window.JSZip();
  const used = new Set();
  const sheets = classes.map((c, i) => ({ c, name: sheetName(c.name, used), file: `sheet${i + 1}.xml` }));
  const meta = { school: data.school_name, from: data.from, to: data.to };
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map(s => `<Override PartName="/xl/worksheets/${s.file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${sheets.map((s, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(s.name).replace(/'/g, "''")}'!$5:$5</definedName>`).join('')}</definedNames>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${s.file}"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  for (const s of sheets) zip.file('xl/worksheets/' + s.file, sheetXml(s.c, classRows(s.c, data.items), meta));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
