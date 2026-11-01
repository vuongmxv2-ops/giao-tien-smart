/**
 * MODULE XUẤT XLSX THEO MẪU "BẢNG THEO DÕI THI ĐUA HK1 - TUẦN 7 GVCN".
 *
 * Cách làm: mở tệp mẫu (JSZip), lấy nguyên styles.xml + theme1.xml và mã định dạng (s=…) của các ô mẫu,
 * dựng lại sheet bảng thi đua với số cột thay đổi theo dữ liệu, rồi tạo:
 *   - xl/comments1.xml            : Note/Legacy Comment gắn vào ô
 *   - xl/drawings/vmlDrawing1.vml : hình dạng Note; Note có ảnh dùng <v:fill o:relid=… type="frame"/> như tệp mẫu
 *   - xl/drawings/_rels/vmlDrawing1.vml.rels → xl/media/imageN.jpeg
 *   - quan hệ sheet → comments + vmlDrawing, [Content_Types].xml
 * Không dùng Threaded Comment, hyperlink, ảnh nổi hay ảnh trong sheet phụ.
 */

/** Vị trí các ô mẫu trong sheet T7 của tệp mẫu (đã khảo sát trực tiếp tệp tuần 7). */
export const T7_TEMPLATE = {
  mdw: 8, // độ rộng ký tự (px) của font mặc định trong tệp mẫu – dùng để tính khung Note
  title1: 'A1', title2: 'A2', sep: 'A3',
  h4: { stt: 'A4', name: 'B4', dayStart: 'E4', dayMid: 'F4', dayEnd: 'H4', total: 'O4', sum: 'P4', grade: 'Q4', rank: 'P4' },
  h5: { stt: 'A5', name: 'B5', dayStart: 'E5', dayMid: 'F5', dayEnd: 'H5', total: 'O5', sum: 'P5', grade: 'Q5', rank: 'P5' },
  h6: { stt: 'A6', name: 'B6', cong: 'E6', tru: 'F6', total: 'O6', sum: 'P6', grade: 'Q6', rank: 'P6' },
  rows: { first: 11, mid: 12, last: 15, single: 7 },
  cols: { stt: 'A', name: 'B', cong: 'C', tru: 'D', total: 'O', sum: 'P', grade: 'Q', rank: 'P' },
  widths: { stt: 'A', name: 'B', cong: 'C', tru: 'D', total: 'O', sum: 'P', grade: 'Q' },
  footer: { label: 'O31', count: 'P31', pct: 'Q32' },
  detailHeader: 'A1'
};

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PT2PX = 96 / 72;
/** Hệ số hiệu chỉnh chiều cao dòng (đo bằng Microsoft Excel 365 trên Windows, 100% DPI). */
const ROW_PX_FACTOR = 0.993, COL_PX_FACTOR = 0.993;

export function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
export function colIndex(letters) { let n = 0; for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
export const xmlEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Đọc thông tin định dạng từ tệp mẫu. */
export async function readTemplate(bytes) {
  const zip = await window.JSZip.loadAsync(bytes);
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheets = [...wb.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m => ({ name: m[1], rid: m[2] }));
  const target = rid => { const m = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels) || new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels); return m ? 'xl/' + m[1].replace(/^\/?xl\//, '').replace(/^\.\//, '') : null; };
  if (!sheets.length) throw new Error('Tệp mẫu không có sheet nào.');
  const s1 = await zip.file(target(sheets[0].rid)).async('string');
  const s2 = sheets[1] ? await zip.file(target(sheets[1].rid)).async('string') : '';
  const styles = await zip.file('xl/styles.xml').async('string');
  const themeFile = zip.file('xl/theme/theme1.xml');
  const theme = themeFile ? await themeFile.async('string') : null;
  const styleOf = (xml, addr) => { const m = new RegExp(`<c r="${addr}"(?=[\\s/>])([^>]*)`).exec(xml); if (!m) return 0; const s = /\bs="(\d+)"/.exec(m[1]); return s ? +s[1] : 0; };
  const rowHt = r => { const m = new RegExp(`<row r="${r}"[^>]*?ht="([\\d.]+)"`).exec(s1); return m ? +m[1] : null; };
  const colW = letter => {
    const n = colIndex(letter);
    for (const m of s1.matchAll(/<col\b[^>]*min="(\d+)"[^>]*max="(\d+)"[^>]*width="([\d.]+)"/g)) if (+m[1] <= n && n <= +m[2]) return +m[3];
    const d = /defaultColWidth="([\d.]+)"/.exec(s1); return d ? +d[1] : 9.14;
  };
  const defRowHt = (/defaultRowHeight="([\d.]+)"/.exec(s1) || [0, 15])[1] * 1;
  const cellText = async addr => {
    const m = new RegExp(`<c r="${addr}"[^>]*t="s"[^>]*><v>(\\d+)</v>`).exec(s1);
    if (!m) return '';
    const sst = await zip.file('xl/sharedStrings.xml')?.async('string');
    if (!sst) return '';
    const items = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(x => [...x[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));
    return (items[+m[1]] || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  };
  return { zip, styles, theme, s1, s2, styleOf: addr => styleOf(s1, addr), style2: addr => styleOf(s2, addr), rowHt, colW, defRowHt, cellText, sheetNames: sheets.map(s => s.name) };
}

/** Khung Note (x:Anchor) từ kích thước mong muốn, theo độ rộng cột/chiều cao dòng thực tế của sheet. */
function anchorFor(col0, row0, wPt, hPt, colPx, rowPx) {
  let c = col0 + 1, offX = 15, remain = Math.round(wPt * PT2PX);
  while (remain > (colPx(c) - offX)) { remain -= colPx(c) - offX; offX = 0; c++; }
  const rc = c, ro = Math.round(offX + remain);
  let r = Math.max(0, row0 - 1), offY = 2; remain = Math.round(hPt * PT2PX);
  while (remain > (rowPx(r) - offY)) { remain -= rowPx(r) - offY; offY = 0; r++; }
  return [col0 + 1, 15, Math.max(0, row0 - 1), 2, rc, ro, r, Math.round(offY + remain)].join(', ');
}

/**
 * Dựng tệp XLSX.
 * model = {
 *   sheetName, title1, title2,
 *   columns: [{role:'stt'|'name'|'cong'|'tru'|'total'|'sum'|'grade'|'rank', day?:index}],
 *   days: [{label:'Thứ 6', serial:46311}],  // mỗi cột cong/tru có day = chỉ số trong days
 *   rows: [{block:'first'|'mid'|'last'|'single', values:[…theo cột…], cached:{total,sum,grade,rank}}],
 *   startingPoints, thresholds:[{label,min}], rankByFormula:boolean,
 *   comments: [{row:i (chỉ số dòng dữ liệu), col:j (chỉ số cột), text?:string, image?:{bytes:Uint8Array, wPx, hPx, name}}],
 *   detail: { header:[…], rows:[[…]] }
 * }
 */
export async function buildXlsx(tpl, model) {
  const T = T7_TEMPLATE;
  const zip = new window.JSZip();
  const out = { file: (name, data) => zip.file(name, data, { createFolders: false }) }; // không tạo mục thư mục rỗng trong gói
  const sst = [], sstIdx = new Map();
  const S = v => { const k = String(v); if (!sstIdx.has(k)) { sstIdx.set(k, sst.length); sst.push(k); } return sstIdx.get(k); };

  const cols = model.columns, nCols = cols.length, lastCol = colLetter(nCols);
  const firstData = 7, nRows = model.rows.length, lastData = firstData + nRows - 1;
  const idx = role => cols.findIndex(c => c.role === role) + 1;
  const cTotal = colLetter(idx('total')), cSum = colLetter(idx('sum')), cGrade = colLetter(idx('grade')), cName = colLetter(idx('name'));
  const firstDayCol = colLetter(cols.findIndex(c => c.role === 'cong' || c.role === 'tru') + 1);
  const lastDayCol = colLetter(cols.length - [...cols].reverse().findIndex(c => c.role === 'cong' || c.role === 'tru'));

  // ---- Định dạng lấy từ tệp mẫu
  const st = a => tpl.styleOf(a);
  const dataStyle = (role, block) => st(T.cols[role] + T.rows[block]);
  const headStyle = (row, key) => st(T['h' + row][key]);

  // ---- Độ rộng cột
  const widthOf = c => tpl.colW(T.widths[c.role === 'rank' ? 'sum' : c.role] || 'C') * (c.role === 'rank' ? 0.7 : 1);
  const colWidths = cols.map(widthOf);
  const colPxArr = colWidths.map(w => Math.trunc(((256 * w + Math.trunc(128 / T.mdw)) / 256) * T.mdw));
  const defColPx = Math.trunc(((256 * tpl.colW('ZZ') + Math.trunc(128 / T.mdw)) / 256) * T.mdw);
  const colPx = c0 => (colPxArr[c0] ?? defColPx) * COL_PX_FACTOR;
  const heights = { 1: tpl.rowHt(1) || 12.75, 2: tpl.rowHt(2) || 18.5, 3: tpl.rowHt(3) || 8.75, 4: tpl.rowHt(4) || 20.75, 5: tpl.rowHt(5) || 20.75, 6: tpl.rowHt(6) || 20.75, data: tpl.rowHt(T.rows.mid) || 18.5 };
  const rowPt = r0 => { const r = r0 + 1; if (r <= 6) return heights[r]; if (r <= lastData) return heights.data; return tpl.defRowHt; };
  const rowPx = r0 => rowPt(r0) * PT2PX * ROW_PX_FACTOR;

  // ---- Sheet 1
  const rowsXml = [];
  const cell = (ref, s, v, type) => {
    if (v === undefined || v === null || v === '') return `<c r="${ref}" s="${s}"/>`;
    if (type === 'f') return `<c r="${ref}" s="${s}"${v.str ? ' t="str"' : ''}><f>${xmlEsc(v.f)}</f>${v.v !== undefined && v.v !== '' ? `<v>${xmlEsc(v.v)}</v>` : ''}</c>`;
    if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${s}" t="s"><v>${S(v)}</v></c>`;
  };
  const row = (r, ht, cells) => rowsXml.push(`<row r="${r}" spans="1:${nCols}" ht="${ht}" customHeight="1">${cells.join('')}</row>`);

  row(1, heights[1], [cell('A1', st(T.title1), model.title1)]);
  row(2, heights[2], [cell('A2', st(T.title2), model.title2), ...range(2, nCols).map(c => cell(colLetter(c) + '2', st('B2')))]);
  row(3, heights[3], []);
  // Tiêu đề 3 dòng
  const merges = ['A1:' + colLetter(Math.min(nCols, 7)) + '1', 'A2:' + lastCol + '2'];
  const h4 = [], h5 = [], h6 = [];
  cols.forEach((c, j) => {
    const L = colLetter(j + 1);
    if (c.role === 'cong' || c.role === 'tru') {
      const first = j === 0 || cols[j - 1].day !== c.day, last = j === nCols - 1 || cols[j + 1].day !== c.day;
      const k = first ? 'dayStart' : last ? 'dayEnd' : 'dayMid';
      h4.push(cell(L + '4', headStyle(4, k), first ? model.days[c.day].label : ''));
      h5.push(cell(L + '5', headStyle(5, k), first ? model.days[c.day].serial : ''));
      h6.push(cell(L + '6', headStyle(6, c.role), c.role === 'cong' ? 'Cộng' : 'Trừ'));
      if (first) { let e = j; while (e + 1 < nCols && cols[e + 1].day === c.day) e++; if (e > j) { merges.push(`${L}4:${colLetter(e + 1)}4`, `${L}5:${colLetter(e + 1)}5`); } }
    } else {
      const label = { stt: 'Stt', name: 'Lớp', total: 'Điểm\n tuần', sum: 'Tổng\n', grade: model.gradeHeader, rank: 'Xếp thứ' }[c.role];
      h4.push(cell(L + '4', headStyle(4, c.role), label)); h5.push(cell(L + '5', headStyle(5, c.role))); h6.push(cell(L + '6', headStyle(6, c.role)));
      merges.push(`${L}4:${L}6`);
    }
  });
  row(4, heights[4], h4); row(5, heights[5], h5); row(6, heights[6], h6);

  // Dữ liệu
  const gradeFormula = ref => {
    const t = model.thresholds; let f = '';
    t.forEach((x, i) => { if (i < t.length - 1 && x.min != null) f += `IF(${ref}>=${x.min},"${x.label}",`; });
    const lastLabel = t.length ? t[t.length - 1].label : '';
    return f + `"${lastLabel}"` + ')'.repeat(t.filter((x, i) => i < t.length - 1 && x.min != null).length);
  };
  model.rows.forEach((r, i) => {
    const R = firstData + i, cells = [];
    cols.forEach((c, j) => {
      const ref = colLetter(j + 1) + R, s = dataStyle(c.role, r.block);
      if (c.role === 'total') cells.push(cell(ref, s, { f: `${model.startingPoints}+SUM(${firstDayCol}${R}:${lastDayCol}${R})`, v: r.cached.total }, 'f'));
      else if (c.role === 'sum') cells.push(cell(ref, s, { f: `${cTotal}${R}`, v: r.cached.total }, 'f'));
      else if (c.role === 'grade') cells.push(cell(ref, s, { f: gradeFormula(cSum + R), v: r.cached.grade, str: true }, 'f'));
      else if (c.role === 'rank') { const rr = r.rankRange || [0, nRows - 1]; cells.push(model.rankByFormula ? cell(ref, s, { f: `RANK(${cSum}${R},$${cSum}$${firstData + rr[0]}:$${cSum}$${firstData + rr[1]},0)`, v: r.cached.rank }, 'f') : cell(ref, s, r.cached.rank)); }
      else cells.push(cell(ref, s, r.values[j]));
    });
    row(R, heights.data, cells);
  });
  // Thống kê xếp loại (như mẫu)
  // Mọi dòng phía dưới bảng đều có chiều cao cố định: Excel dựng khung Note theo ô neo (x:Anchor),
  // nên chiều cao dòng phải đúng như lúc tính khung thì ảnh mới không bị kéo méo.
  const fr = lastData + 2, extH = tpl.defRowHt;
  rowsXml.push(`<row r="${lastData + 1}" ht="${extH}" customHeight="1"/>`);
  model.thresholds.forEach((t, k) => {
    const R = fr + k, cnt = model.rows.filter(r => r.cached.grade === t.label).length;
    const pct = nRows ? Math.round(cnt / nRows * 10000) / 100 + '%' : '';
    rowsXml.push(`<row r="${R}" spans="1:${nCols}" ht="${extH}" customHeight="1">` + cell(cTotal + R, st('O31'), t.label) +
      cell(cSum + R, st('P31'), { f: `COUNTIF($${cGrade}$${firstData}:$${cGrade}$${lastData},"${t.label}")`, v: cnt }, 'f') +
      cell(cGrade + R, st(k === 0 ? 'Q31' : 'Q32'), { f: `ROUND(${cSum}${R}/COUNTA($${cName}$${firstData}:$${cName}$${lastData})*100,2)&"%"`, v: pct, str: true }, 'f') + '</row>');
  });
  for (let R = fr + model.thresholds.length; R <= fr + model.thresholds.length + 60; R++) rowsXml.push(`<row r="${R}" ht="${extH}" customHeight="1"/>`);

  const hasComments = model.comments.length > 0;
  const colsXml = '<cols>' + colWidths.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastCol}${fr + model.thresholds.length - 1}"/>` +
    `<sheetViews><sheetView tabSelected="1" zoomScale="85" zoomScaleNormal="85" workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A7" sqref="A7"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultColWidth="${tpl.colW('ZZ')}" defaultRowHeight="${tpl.defRowHt}"/>` + colsXml +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>` +
    (hasComments ? '<legacyDrawing r:id="rId1"/>' : '') + '</worksheet>';

  // ---- Sheet 2: Chi tiết ảnh
  const hs = tpl.style2(T.detailHeader);
  const dRows = [`<row r="1">${model.detail.header.map((t, j) => cell(colLetter(j + 1) + '1', hs, t)).join('')}</row>`];
  model.detail.rows.forEach((r, i) => dRows.push(`<row r="${i + 2}">${r.map((v, j) => v === '' || v == null ? '' : (typeof v === 'number' ? `<c r="${colLetter(j + 1)}${i + 2}"><v>${v}</v></c>` : `<c r="${colLetter(j + 1)}${i + 2}" t="s"><v>${S(v)}</v></c>`)).join('')}</row>`));
  const dWidths = [8, 12, 8, 34, 7, 30, 9, 26];
  const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><dimension ref="A1:${colLetter(model.detail.header.length)}${model.detail.rows.length + 1}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${model.detail.header.map((_, j) => `<col min="${j + 1}" max="${j + 1}" width="${dWidths[j] || 12}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${dRows.join('')}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;

  // ---- Comments + VML + media
  const types = new Set(['jpeg']);
  if (hasComments) {
    const list = model.comments.map(c => ({ ...c, ref: colLetter(c.col + 1) + (firstData + c.row), r0: firstData - 1 + c.row, c0: c.col }))
      .sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    const seen = new Set();
    list.forEach(c => { if (seen.has(c.ref)) throw new Error('Hai ghi chú trùng một ô ' + c.ref); seen.add(c.ref); });
    let imgN = 0;
    const vmlRels = [], shapes = [];
    const commentXml = list.map(c => {
      const text = c.text ? `<text><r><rPr><b/><sz val="9"/><color indexed="81"/><rFont val="Tahoma"/><family val="2"/></rPr><t xml:space="preserve">${xmlEsc(c.text)}</t></r></text>` : '<text/>';
      return `<comment ref="${c.ref}" authorId="0">${text}</comment>`;
    });
    list.forEach((c, k) => {
      const id = 1025 + k;
      if (c.image) {
        imgN++;
        const rid = 'rId' + imgN, file = `image${imgN}.jpeg`;
        out.file('xl/media/' + file, c.image.bytes);
        vmlRels.push(`<Relationship Id="${rid}" Type="${REL}/image" Target="../media/${file}"/>`);
        const wPt = c.image.wPt, hPt = Math.round(wPt * c.image.hPx / c.image.wPx * 1000) / 1000;
        shapes.push(`<v:shape id="_x0000_s${id}" type="#_x0000_t202" alt="${xmlEsc(c.image.name)}" style='position:absolute;margin-left:${(c.c0 + 1) * 40}pt;margin-top:${Math.max(0, c.r0 - 1) * 14}pt;width:${wPt}pt;height:${hPt}pt;z-index:${k + 1};visibility:hidden' o:insetmode="auto">` +
          `<v:fill o:relid="${rid}" o:title="${xmlEsc(c.image.name.replace(/\.\w+$/, ''))}" type="frame"/><v:path o:connecttype="none"/>` +
          `<v:textbox style='mso-direction-alt:auto' inset="0,0,0,0"><div style='text-align:left'></div></v:textbox>` +
          `<x:ClientData ObjectType="Note"><x:Anchor>${anchorFor(c.c0, c.r0, wPt, hPt, colPx, rowPx)}</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${c.r0}</x:Row><x:Column>${c.c0}</x:Column></x:ClientData></v:shape>`);
      } else {
        const lines = String(c.text || '').split('\n').length;
        const wPt = 190, hPt = Math.min(320, 16 + lines * 12.5);
        shapes.push(`<v:shape id="_x0000_s${id}" type="#_x0000_t202" style='position:absolute;margin-left:${(c.c0 + 1) * 40}pt;margin-top:${Math.max(0, c.r0 - 1) * 14}pt;width:${wPt}pt;height:${hPt}pt;z-index:${k + 1};visibility:hidden' fillcolor="#ffffe1" o:insetmode="auto">` +
          `<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>` +
          `<v:textbox style='mso-direction-alt:auto'><div style='text-align:left'></div></v:textbox>` +
          `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${anchorFor(c.c0, c.r0, wPt, hPt, colPx, rowPx)}</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${c.r0}</x:Row><x:Column>${c.c0}</x:Column></x:ClientData></v:shape>`);
      }
    });
    const blocks = []; for (let b = 1; b <= Math.floor((1024 + list.length) / 1024); b++) blocks.push(b);
    const vml = `<xml xmlns:v="urn:schemas-microsoft-com:vml"\n xmlns:o="urn:schemas-microsoft-com:office:office"\n xmlns:x="urn:schemas-microsoft-com:office:excel">\n` +
      ` <o:shapelayout v:ext="edit">\n  <o:idmap v:ext="edit" data="${blocks.join(',')}"/>\n </o:shapelayout>` +
      `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202"\n  path="m,l,21600r21600,l21600,xe">\n  <v:stroke joinstyle="miter"/>\n  <v:path gradientshapeok="t" o:connecttype="rect"/>\n </v:shapetype>` +
      shapes.join('\n') + '\n</xml>';
    out.file('xl/comments1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="${NS_MAIN}"><authors><author>GIAO TIEN SMART</author></authors><commentList>${commentXml.join('')}</commentList></comments>`);
    out.file('xl/drawings/vmlDrawing1.vml', vml);
    if (vmlRels.length) out.file('xl/drawings/_rels/vmlDrawing1.vml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${vmlRels.join('')}</Relationships>`);
    out.file('xl/worksheets/_rels/sheet1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/><Relationship Id="rId2" Type="${REL}/comments" Target="../comments1.xml"/></Relationships>`);
  }

  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${NS_MAIN}" count="${sst.length}" uniqueCount="${sst.length}">` +
    sst.map(s => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join('') + '</sst>';
  const safeSheet = n => String(n).replace(/[\\/?*[\]:]/g, '-').substr(0, 31);
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="21600" windowHeight="11000"/></bookViews>` +
    `<sheets><sheet name="${xmlEsc(safeSheet(model.sheetName))}" sheetId="1" r:id="rId1"/><sheet name="Chi tiết ảnh" sheetId="2" r:id="rId2"/></sheets>` +
    `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'${xmlEsc(safeSheet(model.sheetName)).replace(/'/g, "''")}'!$4:$6</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/>` +
    (tpl.theme ? `<Relationship Id="rId3" Type="${REL}/theme" Target="theme/theme1.xml"/>` : '') +
    `<Relationship Id="rId4" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId5" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>${[...types].map(t => `<Default Extension="${t}" ContentType="image/${t}"/>`).join('')}` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    (tpl.theme ? `<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` : '') +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    (hasComments ? `<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>` : '') +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

  out.file('[Content_Types].xml', ct);
  out.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  out.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${xmlEsc(model.title2)}</dc:title><dc:creator>GIAO TIEN SMART</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  out.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application></Properties>`);
  out.file('xl/workbook.xml', wbXml);
  out.file('xl/_rels/workbook.xml.rels', wbRels);
  out.file('xl/styles.xml', tpl.styles);
  if (tpl.theme) out.file('xl/theme/theme1.xml', tpl.theme);
  out.file('xl/sharedStrings.xml', sstXml);
  out.file('xl/worksheets/sheet1.xml', sheet1);
  out.file('xl/worksheets/sheet2.xml', sheet2);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
