/**
 * BỘ MÁY ĐỌC TẠI CHỖ (chế độ Firestore).
 * Chạy CHÍNH mã backend (js/engine/backend.js, gộp từ backend/*.gs) ngay trong trình duyệt, trên các bảng dữ liệu
 * do "nguồn" nạp về theo đúng quyền người dùng → kết quả giống hệt máy chủ cũ, nhưng không phải chờ mạng.
 * Chỉ dùng cho thao tác ĐỌC: mọi lệnh ghi bị chặn và chuyển về máy chủ cũ.
 */

/** Bảng nào thiếu/chưa đủ dữ liệu cho người dùng này → thao tác phải chạy ở máy chủ cũ. */
export class NeedRemote extends Error { constructor(reason) { super(reason); this.needRemote = true; } }

/** Dịch vụ Apps Script tối thiểu cho mã backend khi chỉ đọc. */
function services() {
  const props = {}, cache = new Map();
  const no = name => new Proxy({}, { get: () => { throw new NeedRemote('Không có ' + name + ' trong trình duyệt'); } });
  const vn = d => new Date(d.getTime() + 7 * 3600e3);
  return {
    cache,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty(k, v) { props[k] = String(v); return this; },
      deleteProperty(k) { delete props[k]; return this; }, getProperties: () => Object.assign({}, props) }) },
    CacheService: { getScriptCache: () => ({
      get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => { cache.set(k, String(v)); },
      getAll: ks => { const o = {}; ks.forEach(k => { if (cache.has(k)) o[k] = cache.get(k); }); return o; },
      putAll: m => { Object.keys(m).forEach(k => cache.set(k, String(m[k]))); }, remove: k => { cache.delete(k); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {}, hasLock: () => true }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: {}, Charset: {},
      formatDate: (d, tz, f) => { const v = vn(d); const p = n => String(n).padStart(2, '0');
        return f.replace('yyyy', v.getUTCFullYear()).replace('MM', p(v.getUTCMonth() + 1)).replace('dd', p(v.getUTCDate())).replace('HH', p(v.getUTCHours())).replace('H', v.getUTCHours()).replace('mm', p(v.getUTCMinutes())); },
      computeDigest: () => { throw new NeedRemote('computeDigest'); }, base64Encode: () => { throw new NeedRemote('base64'); },
      base64EncodeWebSafe: () => { throw new NeedRemote('base64'); }, base64Decode: () => { throw new NeedRemote('base64'); }, newBlob: () => { throw new NeedRemote('blob'); } },
    Logger: { log: (...a) => console.log('[engine]', ...a) },
    SpreadsheetApp: no('SpreadsheetApp'), DriveApp: no('DriveApp'), UrlFetchApp: no('UrlFetchApp'), ScriptApp: no('ScriptApp'),
    Session: no('Session'), ContentService: no('ContentService'), HtmlService: no('HtmlService'), MailApp: no('MailApp')
  };
}

/**
 * source: { load(table, member) → Promise<{rows, partial}>, onChange(cb) }
 *   rows: bản ghi dạng dòng Sheets (đủ cột); partial = true khi người dùng chỉ được xem một phần bảng
 *   (thao tác nào cần bảng "một phần" thì phải hỏi máy chủ cũ, trừ khi thao tác đó vốn chỉ xem phần đó – xem PARTIAL_OK).
 * member: hồ sơ quyền members/{uid}
 */
export function createEngine(factory, source, member) {
  const G = services();
  const B = factory(G);
  const tables = {}, partial = new Set(), loading = {};
  const accessed = new Set();
  const cols = t => (B.SCHEMA[t] ? B.SCHEMA[t].cols : []);

  B.Db.all = t => { accessed.add(t); return tables[t] || []; };
  B.Db.get = (t, id) => { const k = cols(t)[0]; const rows = B.Db.all(t); for (let i = 0; i < rows.length; i++) if (String(rows[i][k]) === String(id)) return rows[i]; return null; };
  B.Db.where = (t, pred) => B.Db.all(t).filter(pred);
  B.Db.withLock = fn => fn();
  B.Db.reset = () => {};
  B.Db.clearCache = () => {};
  ['insert', 'update', 'replaceAll'].forEach(k => { B.Db[k] = () => { throw new NeedRemote('Ghi dữ liệu (' + k + ')'); }; });

  /** Chuẩn hoá về đúng dạng dòng Sheets: đủ cột, thiếu → '' */
  function shape(t, r) { const o = {}; cols(t).forEach(c => { o[c] = r[c] == null ? '' : r[c]; }); return o; }
  function setTable(t, rows, isPartial) {
    tables[t] = rows.map(r => shape(t, r));
    if (isPartial) partial.add(t); else partial.delete(t);
  }
  function load(t) {
    if (!loading[t]) loading[t] = source.load(t, member, (rows, isPartial) => setTable(t, rows, isPartial))
      .then(res => { setTable(t, res.rows, res.partial); }).catch(e => { delete loading[t]; throw e; });
    return loading[t];
  }

  const user = {
    user_id: member.user_id, email: member.email || '', full_name: member.full_name || '', role: member.role,
    perms: member.perms || [], classIds: member.class_ids || [], campusIds: member.campus_ids || [], allScope: !!member.all_scope,
    username: member.username || '', has_password: !!member.has_password, must_change_pw: !!member.must_change_pw
  };

  /** Chạy một thao tác đọc. Ném NeedRemote nếu phải hỏi máy chủ cũ; ném lỗi nghiệp vụ {code,message} giống máy chủ. */
  async function run(action, payload, opts = {}) {
    const route = B.routes()[action];
    if (!route || route.public) throw new NeedRemote('Không có thao tác ' + action);
    if (user.must_change_pw && !route.pwPending) throw new NeedRemote('Phải đổi mật khẩu');
    const partialOk = opts.partialOk || [];
    for (let pass = 0; pass < 5; pass++) {
      accessed.clear(); G.cache.clear(); // cấu hình đọc lại mỗi lượt (Settings có bộ đệm)
      let result, err = null;
      try {
        if (route.perm) B.Auth.require(user, route.perm);
        result = route.fn(JSON.parse(JSON.stringify(payload || {})), { user }, {});
      } catch (e) { err = e; }
      const missing = [...accessed].filter(t => !(t in tables));
      if (missing.length) { await Promise.all(missing.map(load)); continue; }
      const used = [...accessed].filter(t => partial.has(t));
      const part = used.filter(t => !partialOk.includes(t));
      if (part.length) throw new NeedRemote('Chỉ có một phần bảng ' + part.join(', '));
      if (err) {
        if (err.needRemote) throw err;
        if (err instanceof B.AppError || err.name === 'AppError') { const e = new Error(err.message); e.code = err.code; throw e; }
        throw new NeedRemote('Lỗi khi chạy tại chỗ: ' + (err && err.message));
      }
      const res = JSON.parse(JSON.stringify(result === undefined ? null : result));
      return opts.post ? await opts.post(res, { partialUsed: used, source }) : res;
    }
    throw new NeedRemote('Không nạp đủ dữ liệu');
  }

  return { run, user, tables, partial, load, backend: B };
}
