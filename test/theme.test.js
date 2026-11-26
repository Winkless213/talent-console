// 配色测试：要读的字在深色、浅色两套主题里都要看得清（WCAG 对比度，正文不低于 4.5:1）。npm test
// 颜色直接从 css/theme.css 的变量里读；半透明的颜色先叠到它所在的底色上再算。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: el => el }, createElement: () => ({}), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
const { avatar } = await import('../js/ui.js');

const css = readFileSync(new URL('../css/theme.css', import.meta.url), 'utf8');
const vars = re => Object.fromEntries([...css.match(re)[1].matchAll(/--([\w-]+):([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const dark = vars(/:root\{([\s\S]*?)\n\}/);
const THEMES = { 深色: dark, 浅色: { ...dark, ...vars(/\[data-theme=light\]\{([\s\S]*?)\n\}/) } };

// 颜色一律换成 [r, g, b, a]
function rgba(c) {
  if (Array.isArray(c)) return c;
  let m;
  if ((m = /^#([0-9a-f]{6})$/i.exec(c))) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  if ((m = /^#([0-9a-f]{3})$/i.exec(c))) return [...m[1]].map(h => parseInt(h + h, 16)).concat(1);
  if ((m = /^rgba?\(([^)]+)\)$/.exec(c))) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error('读不懂这个颜色：' + c);
}
const over = (top, under) => { const [r, g, b, a] = rgba(top), u = rgba(under); return [r * a + u[0] * (1 - a), g * a + u[1] * (1 - a), b * a + u[2] * (1 - a), 1]; };
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, [r, g, b] = rgba(c); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
const hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255, 1]; };
const WHITE = '#ffffff';
// 这套主题里字会压上去的几种底色
function surfaces(t) {
  const card = over(t.card, t.bg);
  return { 页面: rgba(t.bg), 卡片: card, 导航栏: over(t.rail, t.bg), 表头: rgba(t.th), 选中的行: rgba(t.row), 浮层: rgba(t.raise), 鼠标所在的行: over(t.hover, card), 输入框: over(t.input, card) };
}
const atLeast = (min, fg, bg, where) => assert.ok(ratio(fg, bg) >= min, `${where}：${ratio(fg, bg).toFixed(2)}:1，不到 ${min}:1`);

test('文字：正文、次要文字、说明文字压在每一种底色上都不低于 4.5:1', () => {
  for (const [name, t] of Object.entries(THEMES)) for (const [where, bg] of Object.entries(surfaces(t))) for (const k of ['ink', 'ink-2', 'ink-3']) atLeast(4.5, t[k], bg, `${name} --${k} 在${where}上`);
});

test('色调：六种色调的字压在自己的衬底上、当前导航的字压在品牌色衬底上，都不低于 4.5:1', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    const s = surfaces(t);
    for (const k of ['tb', 'tg', 'to', 'tr', 'tp', 'tn']) for (const where of ['卡片', '浮层', '鼠标所在的行']) atLeast(4.5, t[k], over(t[k + '-bg'], s[where]), `${name} --${k} 的标签在${where}上`);
    for (const where of ['卡片', '导航栏']) atLeast(4.5, t['brand-ink'], over(t['brand-bg'], s[where]), `${name} --brand-ink 在${where}的品牌色衬底上`);
  }
});

test('白字：主按钮的渐变两头、头像可能取到的每一种底色，白字压上去都不低于 4.5:1', () => {
  for (const [name, t] of Object.entries(THEMES)) for (const stop of t.grad.match(/#[0-9a-f]{6}/gi)) atLeast(4.5, WHITE, stop, `${name} 主按钮渐变的 ${stop}`);
  // 头像的色相是按编号算出来的：把能取到的色相都找出来，再按样式表里的饱和度和亮度算出两头的颜色
  const hues = new Set();
  for (let i = 0; i < 2000; i++) hues.add(+/--h:(\d+)/.exec(avatar({ id: 'u' + i, name: '某' }))[1]);
  const av = /\.av\{[^}]*hsl\(var\(--h,\d+\) (\d+)% (\d+)%\),hsl\(calc\(var\(--h,\d+\) \+ (\d+)\) (\d+)% (\d+)%\)/.exec(css);
  assert.ok(av && hues.size > 60, '样式表里有头像的两头颜色，色相取到了一整段');
  const [s1, l1, shift, s2, l2] = av.slice(1).map(Number);
  for (const h of hues) { atLeast(4.5, WHITE, hsl(h, s1, l1), `头像色相 ${h} 的浅的一头`); atLeast(4.5, WHITE, hsl(h + shift, s2, l2), `头像色相 ${h} 的深的一头`); }
});

test('带色调衬底的格子：档案里每日打卡的日期和时长、组织图根节点上的小字，用的那一档颜色压得住', () => {
  const people = readFileSync(new URL('../css/people.css', import.meta.url), 'utf8'), pages = readFileSync(new URL('../css/pages.css', import.meta.url), 'utf8');
  // 日历格里的日期（i）和时长（em）各用哪个变量
  const used = ['i', 'em'].map(el => new RegExp(`\\.cal7 \\.cd ${el}\\{[^}]*color:var\\(--([\\w-]+)\\)`).exec(people)?.[1]);
  assert.ok(used.every(Boolean), '样式表里有日历格的日期和时长两条规则');
  for (const [name, t] of Object.entries(THEMES)) for (const k of ['tn', 'tg', 'to', 'tr', 'tb', 'tp']) for (const v of used) atLeast(4.5, t[v], over(t[k + '-bg'], t.raise), `${name} 日历格 --${v} 在 --${k}-bg 上`);
  // 根节点是渐变底，上面的小字得是不透明的白
  assert.match(pages, /\.org-root \.org-node span\{color:#fff\}/, '组织图根节点的小字是不透明的白色');
});

test('热力图：四档颜色一路变深（深色主题是一路变亮），最浅的一档压在卡片上也分得出来', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    const card = over(t.card, t.bg), steps = ['h1', 'h2', 'h3', 'h4'].map(k => ratio(t[k], card));
    assert.ok(steps[0] >= 2, `${name} 最浅一档和卡片 ${steps[0].toFixed(2)}:1，不到 2:1`);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i] > steps[i - 1] * 1.25, `${name} 第 ${i + 1} 档和前一档拉不开`);
  }
});
