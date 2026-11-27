/** Adapter Firestore SDK cho source.js: lắng nghe truy vấn (bộ đệm trên máy → mở lại ứng dụng chỉ đọc phần thay đổi). */
export function createFsAdapter(fs, db) {
  const { collection, query, where, onSnapshot, doc } = fs;
  return {
    listen(coll, filters, cb, onErr) {
      const q = query(collection(db, coll), ...filters.map(f => where(f[0], f[1], f[2])));
      return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, data: d.data() }))), e => (onErr || console.warn)(e));
    },
    listenDoc(path, cb, onErr) {
      return onSnapshot(doc(db, path), snap => cb(snap.exists() ? snap.data() : null), e => (onErr || console.warn)(e));
    }
  };
}
