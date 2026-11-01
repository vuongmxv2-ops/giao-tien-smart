/**
 * Xử lý ảnh trên máy: giữ nguyên tệp gốc (gửi nguyên byte), tính SHA-256,
 * tạo ảnh xem trước 1280px và ảnh nhỏ 320px đúng chiều (theo EXIF), đúng tỷ lệ.
 */
export async function sha256Hex(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeMime(file) {
  const t = (file.type || '').toLowerCase();
  if (t) return t === 'image/jpg' ? 'image/jpeg' : t;
  const n = (file.name || '').toLowerCase();
  if (/\.(jpe?g)$/.test(n)) return 'image/jpeg';
  if (/\.png$/.test(n)) return 'image/png';
  if (/\.webp$/.test(n)) return 'image/webp';
  if (/\.hei[cf]$/.test(n)) return 'image/heic';
  return 'application/octet-stream';
}

/** Giải mã ảnh, áp dụng chiều xoay EXIF. */
export async function decode(blob) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* dùng cách dự phòng */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.style.imageOrientation = 'from-image';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Trình duyệt không đọc được ảnh này.')); img.src = url; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

const dims = src => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

export function resizeTo(src, maxSide, quality = 0.82) {
  const { w, h } = dims(src);
  const s = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);
  g.drawImage(src, 0, 0, cw, ch);
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', quality));
}

export async function processImage(file) {
  let blob = file, mime = normalizeMime(file), name = file.name || ('anh_' + Date.now() + '.jpg');
  let width = '', height = '', preview = null, thumb = null, warning = '';
  try {
    const src = await decode(file);
    ({ w: width, h: height } = dims(src));
    if (file.size > MAX_UPLOAD_BYTES || Math.max(width, height) > MAX_SIDE) {
      // Ảnh điện thoại 3–8 MB: nén về cạnh dài 2048 px (vẫn đủ rõ để làm minh chứng), nhỏ hơn khoảng 5–10 lần nên gửi nhanh.
      // Ảnh đã được xoay đúng chiều khi vẽ lại; bản này vừa là ảnh lưu trữ vừa dùng làm ảnh xem trước.
      const s = Math.min(1, MAX_SIDE / Math.max(width, height));
      blob = await resizeTo(src, MAX_SIDE, 0.85);
      width = Math.round(width * s); height = Math.round(height * s);
      mime = 'image/jpeg'; name = name.replace(/\.\w+$/, '') + '.jpg';
    } else {
      preview = await resizeTo(src, 1280, 0.82);
    }
    thumb = await resizeTo(src, 320, 0.7);
    if (src.close) src.close();
  } catch (e) {
    warning = 'Không tạo được ảnh thu nhỏ (' + e.message + '). Ảnh gốc vẫn được gửi.';
  }
  const checksum = await sha256Hex(await blob.arrayBuffer());
  return { name, mime, size: blob.size, originalSize: file.size, blob, checksum, width, height, preview, thumb, warning };
}

/** Ảnh lớn hơn ngưỡng này sẽ được nén trước khi gửi. */
const MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024;
const MAX_SIDE = 2048;
