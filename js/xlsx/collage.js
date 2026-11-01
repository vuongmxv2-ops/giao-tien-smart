/**
 * Ghép tối đa 4 ảnh thành một ảnh (1 → 1×1, 2 → 2×1, 3–4 → 2×2).
 * Mỗi ảnh được đặt vừa khung (contain) nên giữ nguyên tỷ lệ, không méo; có dải chữ mô tả lỗi + điểm.
 */
export async function composeCollage(tiles, { tile = 640, quality = 0.82 } = {}) {
  if (!tiles.length || tiles.length > 4) throw new Error('Mỗi ảnh ghép cần 1–4 ảnh.');
  const n = tiles.length;
  const cols = n === 1 ? 1 : 2, rows = n <= 2 ? 1 : 2;
  const portrait = tiles.filter(t => dim(t.source).h > dim(t.source).w).length > n / 2;
  const tw = portrait ? Math.round(tile * 0.75) : tile, th = portrait ? tile : Math.round(tile * 0.75);
  const withWho = tiles.some(t => t.who);
  const cap = Math.round(tile * (withWho ? 0.14 : 0.1)), gap = 6;
  const W = cols * tw + (cols + 1) * gap, H = rows * (th + cap) + (rows + 1) * gap;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  tiles.forEach((t, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    // 3 ảnh: ảnh thứ 3 nằm giữa hàng dưới
    const x0 = gap + col * (tw + gap) + (n === 3 && i === 2 ? (tw + gap) / 2 : 0), y0 = gap + row * (th + cap + gap);
    const { w, h } = dim(t.source);
    const s = Math.min(tw / w, th / h), dw = Math.round(w * s), dh = Math.round(h * s);
    g.fillStyle = '#eef1f5'; g.fillRect(x0, y0, tw, th);
    g.drawImage(t.source, x0 + Math.round((tw - dw) / 2), y0 + Math.round((th - dh) / 2), dw, dh);
    g.fillStyle = t.positive ? '#1b5e20' : '#b71c1c'; g.fillRect(x0, y0 + th, tw, cap);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
    let fs = Math.round(cap * (withWho ? 0.28 : 0.46));
    g.font = `bold ${fs}px Arial, sans-serif`;
    while (g.measureText(t.caption).width > tw - 16 && fs > 10) { fs--; g.font = `bold ${fs}px Arial, sans-serif`; }
    if (withWho) {
      // 3 dòng: lỗi + điểm / tên học sinh hoặc (Lỗi tập thể) / lớp · ngày giờ
      g.fillText(t.caption, x0 + 8, y0 + th + cap * 0.22);
      fitText(g, t.who || '', tw - 16, Math.round(cap * 0.26), 'bold ');
      g.fillText(t.who || '', x0 + 8, y0 + th + cap * 0.52);
      if (t.sub) { fitText(g, t.sub, tw - 16, Math.round(cap * 0.2), ''); g.fillText(t.sub, x0 + 8, y0 + th + cap * 0.8); }
    } else {
      g.fillText(t.caption, x0 + 8, y0 + th + cap * (t.sub ? 0.36 : 0.5));
      if (t.sub) { g.font = `${Math.round(cap * 0.3)}px Arial, sans-serif`; g.fillText(t.sub, x0 + 8, y0 + th + cap * 0.76); }
    }
  });
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), wPx: W, hPx: H };
}

/**
 * Một ảnh minh chứng giữ nguyên kích thước (cạnh dài tối đa maxSide), thêm dải chữ bên dưới: lỗi + điểm, học sinh, lớp · ngày giờ.
 * Dùng cho gói ảnh gửi về các lớp.
 */
export async function annotateImage(source, { lines, positive }, { maxSide = 2048, quality = 0.85 } = {}) {
  const { w, h } = dim(source);
  const s = Math.min(1, maxSide / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
  const lh = Math.max(22, Math.round(dw * 0.045)), pad = Math.round(lh * 0.45);
  const band = lines.length * lh + pad * 2;
  const c = document.createElement('canvas'); c.width = dw; c.height = dh + band;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, dw, dh + band);
  g.drawImage(source, 0, 0, dw, dh);
  g.fillStyle = positive ? '#1b5e20' : '#b71c1c'; g.fillRect(0, dh, dw, band);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  lines.forEach((t, i) => {
    fitText(g, t, dw - pad * 2, Math.round(lh * (i === 0 ? 0.8 : 0.68)), i < 2 ? 'bold ' : '');
    g.fillText(t, pad, dh + pad + lh * (i + 0.5));
  });
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}

function fitText(g, text, maxW, size, weight) {
  let fs = size;
  g.font = `${weight}${fs}px Arial, sans-serif`;
  while (g.measureText(text).width > maxW && fs > 9) { fs--; g.font = `${weight}${fs}px Arial, sans-serif`; }
}

function dim(s) { return { w: s.naturalWidth || s.videoWidth || s.width, h: s.naturalHeight || s.videoHeight || s.height }; }
