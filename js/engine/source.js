/**
 * NGUỒN DỮ LIỆU cho bộ máy đọc: nạp bảng từ Firestore theo đúng quyền người dùng (truy vấn khớp firestore.rules).
 * Không phụ thuộc thư viện Firebase: dùng "adapter" {listen(coll, filters, cb), listenDoc(path, cb)}:
 *   - trình duyệt thật: js/engine/fsadapter.js (Firestore SDK, có lắng nghe thay đổi + bộ đệm trên máy)
 *   - kiểm thử: adapter đọc kho Firestore giả lập.
 * filters: [[field, '==' | 'in', value]]; cb(docs: [{id, data}]) được gọi lần đầu và mỗi khi dữ liệu đổi.
 */
const BOOT_TABLES = ['CAMPUSES', 'SCHOOL_YEARS', 'CLASSES', 'VIOLATION_TYPES', 'SCORE_RULES', 'SCHOOL_WEEKS', 'SYSTEM_SETTINGS'];

export function createSource(adapter) {
  /** Gộp nhiều truy vấn (lắng nghe) thành một bảng; gọi onRows(rows) lần đầu khi mọi truy vấn đã có kết quả và mỗi lần đổi. */
  function merged(queries, toRows, onRows) {
    const parts = queries.map(() => null);
    return new Promise((resolve, reject) => {
      let done = false;
      const emit = () => {
        if (parts.some(p => p === null)) return;
        const byId = new Map(); parts.forEach(list => list.forEach(d => byId.set(d.id, d)));
        // Giữ đúng thứ tự dòng Sheets (_seq do đồng bộ ghi) như máy chủ cũ đọc
        const rows = toRows([...byId.values()].sort((a, b) => ((a.data && a.data._seq) || 0) - ((b.data && b.data._seq) || 0)));
        if (!done) { done = true; resolve(rows); } else onRows(rows);
      };
      if (!queries.length) { done = true; resolve(toRows([])); return; }
      queries.forEach((q, i) => {
        try { adapter.listen(q[0], q[1] || [], docs => { parts[i] = docs; emit(); }, err => { if (!done) { done = true; reject(err); } }); }
        catch (e) { if (!done) { done = true; reject(e); } }
      });
    });
  }
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const plain = docs => docs.map(d => d.data);
  let bootTables = null;
  function bootDoc(name) {
    return new Promise((resolve, reject) => adapter.listenDoc('boot/' + name, d => resolve(d), reject));
  }

  /** Nạp một bảng. Trả {rows, partial}. onChange(rows, partial) khi có thay đổi sau đó. */
  async function load(table, m, onChange) {
    const perms = m.perms || [], has = p => perms.includes('*') || perms.includes(p), any = ps => ps.some(has);
    const cls = m.class_ids || [], camp = m.campus_ids || [], me = m.user_id;
    const ok = (rows, partial) => ({ rows, partial: !!partial });
    const listenAll = async (queries, toRows, partial) => ok(await merged(queries, toRows, rows => onChange(rows, partial)), partial);
    const inChunks = (coll, field, values, extra) => chunk(values, 30).map(v => [coll, [[field, 'in', v]].concat(extra || [])]);

    if (BOOT_TABLES.includes(table)) {
      if (!bootTables) bootTables = bootDoc('tables');
      const t = await bootTables;
      return ok((t && t[table]) || [], false);
    }
    switch (table) {
      case 'USERS':
        if (has('*')) return listenAll([['users']], plain, false);
        return ok(((await bootDoc('directory')) || {}).users || [], true);
      case 'INCIDENTS':
      case 'EVIDENCE': {
        const full = any(['incident.view', 'incident.review']);
        const q = full ? [['incidents']] : [['incidents', [['submitted_by', '==', me]]]]
          .concat(has('incident.view.class') && cls.length ? inChunks('incidents', 'class_id_at_time', cls, m.homeroom_sees_pending ? [] : [['status', '==', 'DA_DUYET']]) : []);
        const toRows = table === 'INCIDENTS'
          ? docs => docs.map(d => { const o = Object.assign({}, d.data); delete o.evidence; return o; })
          : docs => [].concat(...docs.map(d => d.data.evidence || []));
        return listenAll(q, toRows, !full);
      }
      case 'SCORE_TRANSACTIONS':
      case 'WEEKLY_RESULTS': {
        const coll = table === 'SCORE_TRANSACTIONS' ? 'score_tx' : 'weekly_results';
        if (any(['score.view', 'incident.review', 'rank.view'])) return listenAll([[coll]], plain, false);
        if (has('score.view.class') && cls.length) return listenAll(inChunks(coll, 'class_id', cls), plain, true);
        return ok([], true);
      }
      case 'STUDENTS':
        if (any(['student.view', 'incident.review'])) return listenAll([['students']], plain, false);
        if (has('student.view.class') && cls.length) return listenAll(inChunks('students', 'current_class_id', cls), plain, true);
        return ok([], true);
      case 'NOTIFICATIONS': {
        const q = [['notifications', [['audience', '==', 'ALL']]], ['notifications', [['audience', '==', 'ROLE:' + m.role]]], ['notifications', [['audience', '==', 'USER:' + me]]]];
        if (has('incident.review')) q.push(['notifications', [['target_type', '==', 'CLASS']]]);
        else if (cls.length) chunk(cls, 30).forEach(v => q.push(['notifications', [['target_type', '==', 'CLASS'], ['target_value', 'in', v]]]));
        // Đúng phạm vi người này được thấy (Notify.visible) → không coi là "một phần"
        return listenAll(q, docs => docs.map(d => { const o = Object.assign({}, d.data); o.read_by = (o.read_by || []).join(','); delete o.audience; return o; }), false);
      }
      case 'DAILY_CHECKS': {
        if (has('check.view') || m.all_scope || has('*')) return listenAll([['daily_checks']], plain, false);
        const q = [['daily_checks', [['checked_by', '==', me]]]].concat(inChunks('daily_checks', 'class_id', cls));
        if (m.role !== 'HOMEROOM_TEACHER') q.push(...inChunks('daily_checks', 'campus_id', camp));
        return listenAll(q, plain, true);
      }
      case 'DUTY_SCHEDULES':
        if (has('duty.view')) return listenAll([['duty_schedules']], plain, false);
        return listenAll([['duty_schedules', [['user_id', '==', me]]]], plain, true);
      case 'APPEALS':
        if (any(['appeal.view', 'appeal.manage'])) return listenAll([['appeals']], plain, false);
        return listenAll([['appeals', [['created_by', '==', me]]]], plain, true);
      case 'EXPORT_JOBS':
        if (has('export.create')) return listenAll([['export_jobs']], plain, false);
        return ok([], true);
      default: // USER_SCOPES, STUDENT_ENROLLMENTS, AUDIT_LOGS… không chép sang Firestore → luôn hỏi máy chủ cũ
        return ok([], true);
    }
  }

  /** Trường phụ trong boot/tables (ví dụ PENDING_BY_WEEK: số bản ghi chờ duyệt mỗi tuần – chỉ là con số đếm). */
  async function bootField(name) { if (!bootTables) bootTables = bootDoc('tables'); const t = await bootTables; return t ? t[name] : undefined; }

  return { load, bootField };
}
