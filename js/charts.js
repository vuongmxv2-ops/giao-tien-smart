/** Biểu đồ (Chart.js). Nếu thư viện chưa tải được, hiển thị bảng số liệu thay thế. */
import { h, table } from './ui.js';

export const COLORS = ['#1565c0', '#2e7d32', '#f9a825', '#c62828', '#6a1b9a', '#00838f', '#ef6c00', '#5d4037', '#455a64', '#ad1457'];

export function chart(container, { type = 'bar', labels, datasets, horizontal = false, height = 260 }) {
  const box = h('div', { class: 'chart-box', style: `height:${height}px` });
  container.append(box);
  if (!window.Chart) {
    box.style.height = 'auto';
    box.append(h('div', { class: 'small muted' }, 'Không tải được thư viện biểu đồ – hiển thị dạng bảng.'),
      table([{ label: '', key: 'l' }, ...datasets.map((d, i) => ({ label: d.label, key: 'v' + i, num: true }))],
        labels.map((l, j) => Object.fromEntries([['l', l], ...datasets.map((d, i) => ['v' + i, d.data[j]])]))));
    return null;
  }
  const canvas = h('canvas', { 'aria-label': datasets.map(d => d.label).join(', ') });
  box.append(canvas);
  const pie = type === 'pie' || type === 'doughnut';
  return new window.Chart(canvas, {
    type,
    data: { labels, datasets: datasets.map((d, i) => ({
      borderWidth: type === 'line' ? 2 : 0, tension: 0.25, pointRadius: 3, borderRadius: type === 'bar' ? 4 : 0,
      backgroundColor: pie ? labels.map((_, j) => COLORS[j % COLORS.length]) : (d.color || COLORS[i % COLORS.length]),
      borderColor: d.color || COLORS[i % COLORS.length], ...d })) },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
      plugins: { legend: { display: pie || datasets.length > 1, position: 'bottom' } },
      scales: pie ? {} : { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}
