// 图：折线（趋势）、柱（少量类别的数量）、横条（排名和占比）、环（一个比例）、迷你走势、热力格、雷达、漏斗。不引第三方库，全是 HTML 加一小段 SVG。
// 一张图一个系列、一种颜色；数字和文字用正文的颜色，不跟着系列变色。每个点、每根柱子鼠标移上去都有说明（data-tip），折线和柱图下面可以展开数据表。
import { esc } from './ui.js';

const niceStep = raw => { const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
// 纵轴：把数据范围取整成三到五档
function axis(vals, o) {
  // min 是纵轴最低从哪开始；数据里有更低的就再往下放，不会把线切掉
  let lo = Math.min(o.min ?? Infinity, ...vals), hi = o.max ?? Math.max(...vals);
  if (hi <= lo) hi = lo + 1;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  if (o.max == null) hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 1e6; t += step) ticks.push(+t.toFixed(6));
  return { lo, hi, ticks };
}
const clamp01 = v => Math.max(0, Math.min(1, v || 0));
// 图下面可以展开的数据表：看不清图、或者用读屏软件的人看这个
const twin = (head, rows) => `<details class="twin"><summary>数据表</summary><div class="twin-bd"><table class="dt"><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;

// 折线。points：[{ label 横轴上的字, v 数值（null 表示这一点没有数，线在这里断开）, tip 说明 }]。o：unit 单位，min、max 纵轴范围，height 高度，name 数据表里这一列的名字
export function line(points, o = {}) {
  const vals = points.map(p => p.v).filter(v => v != null);
  if (!vals.length) return '<p class="note">这段时间没有数据。</p>';
  const { lo, hi, ticks } = axis(vals, o), n = points.length, unit = o.unit || '', f = v => v.toFixed(2);
  const X = i => (i + .5) / n * 100, Y = v => (1 - (v - lo) / (hi - lo)) * 100;
  const runs = [];
  let cur = null;
  points.forEach((p, i) => { if (p.v == null) cur = null; else { if (!cur) runs.push(cur = []); cur.push([X(i), Y(p.v)]); } });
  const path = r => 'M' + r.map(([x, y]) => f(x) + ' ' + f(y)).join('L');
  const every = o.every || Math.ceil(n / 6), last = points.findLastIndex(p => p.v != null);   // 横轴上最多写六个字，窄卡片里也不会挤成一串
  return `<figure class="chart"><div class="plot" style="--h:${o.height || 190}px"><div class="yax">${ticks.map(t => `<span style="bottom:${f(100 - Y(t))}%">${t}${unit}</span>`).join('')}</div><div class="area">`
    + ticks.map(t => `<i class="gl" style="bottom:${f(100 - Y(t))}%"></i>`).join('')
    + `<svg class="wash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${runs.map(r => `${path(r)}L${f(r[r.length - 1][0])} 100L${f(r[0][0])} 100Z`).join('')}"/></svg>`
    + `<svg class="ln" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${runs.map(path).join('')}"/></svg>`
    + points.map((p, i) => p.v == null ? '' : `<span class="pt${i === last ? ' last' : ''}" style="left:${f(i / n * 100)}%;width:${f(100 / n)}%" data-tip="${esc(p.tip || `${p.label}|${p.v}${unit}`)}"><i style="bottom:${f(100 - Y(p.v))}%"></i></span>`).join('')
    + `</div></div><div class="xax">${points.map((p, i) => i % every === (n - 1) % every ? `<span style="left:${f(X(i))}%">${esc(p.label)}</span>` : '').join('')}</div>`
    + twin([o.head || '日期', o.name || '数值'], points.map(p => [esc(p.label), p.v == null ? '—' : p.v + unit])) + '</figure>';
}

// 柱。items：[{ label, v, tip, mark 这一根用深一档的颜色标出来 }]。柱子不多时柱顶写数
export function cols(items, o = {}) {
  const max = o.max || Math.max(1, ...items.map(p => p.v || 0)), unit = o.unit || '', n = items.length, every = o.every || 1, show = o.values ?? n <= 12, h = v => (clamp01((v || 0) / max) * 100).toFixed(1);
  return `<figure class="chart"><div class="cols${show ? ' vals' : ''}" style="--h:${o.height || 150}px">${items.map((p, i) => `<span class="col${p.mark ? ' mark' : ''}" data-tip="${esc(p.tip || `${p.label}|${p.v}${unit}`)}"><span class="col-b">${show && p.v ? `<em style="bottom:${h(p.v)}%">${p.v}</em>` : ''}<i style="height:${h(p.v)}%;--i:${i}"></i></span><span class="col-l">${i % every === (n - 1) % every ? esc(p.label) : '&nbsp;'}</span></span>`).join('')}</div>`
    + twin([o.head || '类别', o.name || '数量'], items.map(p => [esc(p.label), (p.v ?? '—') + unit])) + '</figure>';
}

// 横条。items：[{ label, v, text 右边的字, tip }]。o：max 满格是多少（默认取最大的那个），lw 左边文字的宽度；
// set 给了的话每一行是个按钮，点了把这一行的 val 写进页面 state 的这个键（on 表示现在选中的是它）
export function bars(items, o = {}) {
  const max = o.max || Math.max(1, ...items.map(p => p.v || 0));
  return `<div class="hbars"${o.lw ? ` style="--lw:${o.lw}px"` : ''}>${items.map((p, i) => {
    const el = o.set ? `button data-set="${o.set}" data-v="${esc(p.val)}"${p.on ? ' class="on" aria-pressed="true"' : ''}` : 'div';
    return `<${el}${p.tip ? ` data-tip="${esc(p.tip)}"` : ''}><span>${esc(p.label)}</span><i><b style="width:${(clamp01((p.v || 0) / max) * 100).toFixed(1)}%;--i:${i}"></b></i><em>${p.text ?? p.v}</em></${o.set ? 'button' : 'div'}>`;
  }).join('')}</div>`;
}

// 迷你走势：只表示大概的起伏，具体的数在旁边的大数字和对应的页面里
export function spark(values) {
  const v = values.filter(x => x != null);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), n = values.length;
  const d = 'M' + values.map((x, i) => x == null ? null : (i / (n - 1) * 100).toFixed(1) + ' ' + (90 - (hi > lo ? (x - lo) / (hi - lo) : .5) * 78).toFixed(1)).filter(Boolean).join('L');
  return `<svg class="spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="sw" d="${d}L100 100L0 100Z"/><path class="sl" d="${d}"/></svg>`;
}

// 环：v 是 0 到 1 的比例，inner 是环中间的内容（HTML）。弧线用 index.html 里定义的渐变色 #gArc，取不到时退回单色
export const gauge = (v, label, inner) => `<div class="gauge" style="--v:${clamp01(v).toFixed(4)}" role="img" aria-label="${esc(label)}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="tick" cx="60" cy="60" r="57" pathLength="180"/><circle class="trk" cx="60" cy="60" r="47"/><circle class="arc" cx="60" cy="60" r="47" pathLength="100" stroke="url(#gArc) #6f8fff"/></svg><div class="gauge-c">${inner}</div></div>`;

// 热力格。rows：[{ label, cells: [{ v 数值（null 表示这一天不用上班）, tip }] }]，xs 每一列下面的字（空串不写），steps 四个分档的下限
export function heat(rows, xs, steps = [1, 2, 3, 4]) {
  const lv = v => v == null ? ' class="hx"' : v >= steps[3] ? ' class="h4"' : v >= steps[2] ? ' class="h3"' : v >= steps[1] ? ' class="h2"' : v >= steps[0] ? ' class="h1"' : '';
  return `<div class="heat" style="--n:${xs.length}">${rows.map(r => `<div class="heat-r"><span>${esc(r.label)}</span><div class="heat-c">${r.cells.map(c => `<i${lv(c.v)} data-tip="${esc(c.tip)}"></i>`).join('')}</div></div>`).join('')}`
    + `<div class="heat-r"><span></span><div class="heat-c">${xs.map(x => `<em>${esc(x)}</em>`).join('')}</div></div>`
    + `<div class="heat-k">少<i></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i>多</div></div>`;
}

// 雷达：几个维度的分数连成一圈。dims：[[名称, 分数]]，分数从 lo 到 hi；三圈网格线标在右上那条轴上。
// 图画在 200×200 里，画布左右各多留 36：两边的维度名（四五个字）写在这里面，不伸到画布外
export function radar(dims, lo = 40, hi = 100) {
  const n = dims.length, at = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r]; };
  const R = 66, ring = k => dims.map((_, i) => at(i, R * k).map(v => v.toFixed(1)).join(',')).join(' '), pts = dims.map(([, v], i) => at(i, R * clamp01((v - lo) / (hi - lo))));
  return `<svg class="radar" viewBox="-36 0 272 200" role="img" aria-label="${esc(dims.map(([k, v]) => k + ' ' + v).join('，'))}">`
    + [1 / 3, 2 / 3, 1].map(k => `<polygon class="web" points="${ring(k)}"/>`).join('') + dims.map((_, i) => { const [x, y] = at(i, R); return `<line class="axis" x1="100" y1="100" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')
    + [1 / 3, 2 / 3, 1].map(k => `<text class="lv" x="103" y="${(100 - R * k + 3).toFixed(1)}">${Math.round(lo + (hi - lo) * k)}</text>`).join('')
    + `<polygon class="shape" points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}"/>` + pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`).join('')
    + dims.map(([k], i) => { const [x, y] = at(i, R + 16); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${Math.abs(x - 100) < 4 ? 'middle' : x > 100 ? 'start' : 'end'}">${esc(k)}</text>`; }).join('') + '</svg>';
}

// 漏斗：每一步剩多少人。一层的上边宽度是这一步的人数，下边收到下一步的人数；右边写人数和比上一步留下了百分之几
export function funnel(steps) {
  const max = Math.max(1, ...steps.map(s => s.n)), w = n => Math.max(5, n / max * 100), keep = i => i && steps[i - 1].n ? Math.round(steps[i].n / steps[i - 1].n * 100) + '%' : '';
  return `<div class="funnel">${steps.map((s, i) => { const a = (100 - w(s.n)) / 2, b = (100 - w(steps[i + 1]?.n ?? s.n * .82)) / 2;
    return `<div data-tip="${esc(s.label + '|' + s.n + ' 人' + (keep(i) ? '|比上一步留下 ' + keep(i) : ''))}"><span>${esc(s.label)}</span><i style="clip-path:polygon(${a.toFixed(1)}% 0,${(100 - a).toFixed(1)}% 0,${(100 - b).toFixed(1)}% 100%,${b.toFixed(1)}% 100%);--i:${i}"></i><em>${s.n}</em><small>${keep(i)}</small></div>`; }).join('')}</div>`;
}
