// 各页面共用的小工具：取元素、转义、时间和数字的写法、图标、状态对照表，以及模块页面用的卡片、表格、指标块。
// 企业微信取回的文字（人名、部门、岗位、班次名、假期名）一律先转义再写进页面。
export const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const pad = n => String(n).padStart(2, '0'), r1 = n => Math.round(n * 10) / 10, sum = (l, f) => l.reduce((a, x) => a + (f(x) || 0), 0);
export const H = 3600, DAY = 86400, TZ = 8 * H;   // 时间一律按北京时间显示，和服务端一致
export const clock = t => new Date((t + TZ) * 1000).toISOString().slice(11, 16);                    // 时间戳 -> 时:分
export const stamp = t => new Date((t + TZ) * 1000).toISOString().slice(0, 16).replace('T', ' ');   // 时间戳 -> 年-月-日 时:分
export const hmOf = s => (s >= DAY ? '次日 ' : '') + pad(Math.floor(s / H) % 24) + ':' + pad(Math.floor(s / 60) % 60);   // 当天 0 点起的秒数 -> 时:分
export const hrs = s => r1(s / H), mins = s => Math.max(1, Math.round(s / 60));
export const md = d => d.slice(5), weekday = d => '日一二三四五六'[new Date(d + 'T00:00:00Z').getUTCDay()];
export const tenureOf = m => m == null ? '工龄未知' : m < 1 ? '不满 1 个月' : m < 12 ? m + ' 个月' : Math.floor(m / 12) + ' 年' + (m % 12 ? ' ' + m % 12 + ' 个月' : '');
export const fmt = n => n == null ? '—' : Number(n).toLocaleString('zh-CN');
export const pct = (v, d = 1) => v == null ? '—' : v.toFixed(d) + '%';
// 表格（一行是一组格子）-> CSV 文字，Excel、WPS 可以直接打开。
// 每一格都加引号：有的地区用分号分列，不加引号的话格子里的分号会把一格拆成几格。
// 以 = + - @（半角全角都算）、制表符、回车开头的内容前面加一个单引号，表格软件就不会把它当公式执行
export const csv = rows => rows.map(r => r.map(v => { const s = String(v ?? ''); return '"' + (/^[=+\-@＝＋－＠\t\r]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"'; }).join(',')).join('\r\n');

/* ---------- 图标 ---------- */
// 一部分取自 Lucide（https://lucide.dev，ISC 许可，其中有些源自 Feather，MIT 许可）或在它的基础上改画，其余是自己画的。许可证原文在 licenses/lucide.txt
export const ICON = {
  logo: '<path d="M12.2 3.5c0 6.4-2.9 11.9-7.7 16"/><path d="M12.6 9.2c1.3 4.4 3.7 7.9 7 10.3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>', dn: '<path d="M12 5v14M5.5 12.5 12 19l6.5-6.5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  spark: '<g fill="currentColor" stroke="none"><path d="M9.6 2.2l2 5.5a2 2 0 0 0 1.2 1.2l5.5 2-5.5 2a2 2 0 0 0-1.2 1.2l-2 5.5-2-5.5a2 2 0 0 0-1.2-1.2l-5.5-2 5.5-2a2 2 0 0 0 1.2-1.2z"/><path d="M18.6 13.8l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/><path d="M18.4 2.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/></g>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  umbrella: '<path d="M22 12a10.06 10.06 0 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/>',
  bars: '<rect x="3.5" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16.5" y="3.5" width="4" height="16.5" rx="1"/>',
  star: '<path d="M12 2.5l2.94 5.96 6.56.96-4.75 4.63 1.12 6.55L12 17.5l-5.87 3.1 1.12-6.55L2.5 9.42l6.56-.96z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  target: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="3.6"/>',
  dash: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="10" r="2.6"/><path d="M7.5 17.5a4.5 4.5 0 0 1 9 0"/>',
  calcheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12.5 3 3 5-6.5"/>',
  badge: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><circle cx="12" cy="10" r="2.8"/><path d="M8 17.5a4 4 0 0 1 8 0"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="m7.5 13 3-3 2.5 2 3.5-4"/><path d="M8 21h8M12 17v4"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12.2V17c0 1.2 2.7 3 6 3s6-1.8 6-3v-4.8"/>',
  contact: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M9 3v3h6V3"/><circle cx="12" cy="12" r="2.4"/><path d="M8.5 18a3.6 3.6 0 0 1 7 0"/>',
  org: '<circle cx="9" cy="7.5" r="3.6"/><path d="M2.5 20v-1a6.5 6.5 0 0 1 9.5-5.8"/><circle cx="17.5" cy="16.5" r="2.4"/><path d="M17.5 12.4v1.7M17.5 18.9v1.7M13.9 14.4l1.5.9M19.6 17.7l1.5.9M13.9 18.6l1.5-.9M19.6 15.3l1.5-.9"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrow: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  trend: '<path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/>'
};
export const ic = (n, s = 18, sw = 1.8) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

/* ---------- 固定的对照表 ---------- */
// 考勤状态 -> [文字, 色调, 日历里的短写]。今天的实时状态和已结束日期的状态共用一张表；空串是这一天没有日报。
// 「在岗」这两个字留给合计（正常在岗、迟到、加班中三种人此刻都在岗位上），「未到岗」留给未签到加未打卡，所以单个状态不叫这两个名字
export const ST = { in: ['正常在岗', 'g'], late: ['迟到', 'o'], ot: ['加班中', 'p'], out: ['已下班', 'n'], unsigned: ['未签到', 'r'], nopunch: ['未打卡', 'o'], before: ['未到上班时间', 'n'], leave: ['请假', 'b'], rest: ['休息', 'n'], none: ['不考勤', 'n'],
  normal: ['正常', 'g'], early: ['早退', 'o'], miss: ['缺卡', 'o'], absent: ['旷工', 'r'], restwork: ['休息日出勤', 'p', '休出勤'], norule: ['已打卡', 'n'], '': ['无日报', 'n'] };
export const st = k => { const [t, c] = ST[k] || ST['']; return `<span class="st s-${c}"><i></i><em>${t}</em></span>`; };
// 近 7 天柱子下面的字：正常的日子写几号，其余写状态的头一个字
export const MARK = { late: ['迟', 'o'], early: ['早', 'o'], miss: ['缺', 'o'], absent: ['旷', 'r'], nopunch: ['未', 'o'], leave: ['假', 'b'], rest: ['休', 'n'], restwork: ['加', 'p'], none: ['–', 'n'], '': ['·', 'n'] };
export const TYPE = { 正式工: 't-b', 试用期: 't-o', 实习: 't-p' };
export const typeTag = r => `<span class="tag ${TYPE[r.type] || 't-n'}">${esc(r.type)}</span>` + (r.leaving ? '<span class="tag t-r">待离职</span>' : '');
export const RULE = { fixed: '固定班', shift: '排班', free: '自由上下班', none: '无打卡规则' };
export const HERE = new Set(['in', 'late', 'ot']);   // 今天此刻人在岗
// 示例数据里的绩效等级、人才等级、事项状态各用什么色调
export const GRADE = { A: 'g', 'B+': 'b', B: 'n', C: 'o' }, LEVEL = { 核心人才: 'p', 优秀人才: 'b', 高潜人才: 'g', 稳定贡献: 'n', 待提升: 'o' };
export const TASK = { done: ['已完成', 'g'], doing: ['进行中', 'b'], overdue: ['已逾期', 'r'] };

/* ---------- 提示、浮层 ---------- */
let toastT = 0;
export function toast(text) { const el = $('#toast'); el.textContent = text; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200); }
// 浮层有四个：个人档案（drawer）、弹窗（modal）、列设置（pop）、搜索面板（cmd），同一时间只开一个。
// 打开时记下焦点原来在哪、把焦点移进浮层；关掉时还回去；开着的时候 Tab 只在浮层里转，不会跑到后面被盖住的页面上
const LAYERS = ['drawer', 'modal', 'pop', 'cmd'];
let opener = null;
const layerOpen = () => LAYERS.map(id => $('#' + id)).find(el => !el.hidden);
// label 是念给读屏软件的名字；mask 为 false 时不盖住后面的页面（列设置）
export function openLayer(id, label, mask = true) {
  if (!layerOpen()) opener = document.activeElement;
  for (const k of LAYERS) $('#' + k).hidden = k !== id;
  $('#mask').hidden = !mask;
  const el = $('#' + id);
  el.setAttribute('aria-label', label);
  el.focus();
}
export function closeAll() {
  const was = layerOpen();
  for (const id of ['mask', ...LAYERS]) $('#' + id).hidden = true;
  if (was && opener?.isConnected) opener.focus();
  if (was) opener = null;
}
export function trapTab(ev) {
  const layer = layerOpen();
  if (!layer) return;
  const stops = $$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex="0"]', layer).filter(el => el.getClientRects().length), at = stops.indexOf(document.activeElement);
  if (ev.shiftKey ? at <= 0 : at < 0 || at === stops.length - 1) { ev.preventDefault(); (stops.at(ev.shiftKey ? -1 : 0) || layer).focus(); }
}
export const xBtn = () => `<button class="x" data-close title="关闭" aria-label="关闭">${ic('close', 20, 2.2)}</button>`;

// 带 data-tip 的元素：鼠标移上去或键盘聚焦时显示说明。内容用「|」分段，第一段加粗；一律按纯文字写入，不当 HTML 解析
const tip = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'tip', hidden: true }));
const part = (name, text) => Object.assign(document.createElement(name), { textContent: text });
function showTip(ev) {
  const el = ev.target.closest?.('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  const [head, ...rest] = el.dataset.tip.split('|');
  tip.replaceChildren(part('b', head), ...rest.map(t => part('span', t)));
  tip.hidden = false;
  const b = el.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, b.left + b.width / 2 - tip.offsetWidth / 2)) + 'px';
  tip.style.top = Math.max(8, b.top - tip.offsetHeight - 6) + 'px';
}
document.addEventListener('mouseover', showTip);
document.addEventListener('focusin', showTip);
document.addEventListener('focusout', () => { tip.hidden = true; });
document.addEventListener('scroll', () => { tip.hidden = true; }, true);

/* ---------- 模块页面的积木。传进来的 HTML 片段由调用方负责转义 ---------- */
export const tag = (text, tone = 'n') => `<span class="tag t-${tone}">${esc(text)}</span>`;
// 示例数据的角标：这些数企业微信里没有，是按固定种子生成的
export const DEMO = '<span class="wb" title="按固定种子生成的示例数，不是真实数据">示例</span>';
// 卡片。o：cls 额外的类名，demo 标「示例」，note 标题旁的小字，more 右上角的内容，flush 内容贴边（放表格用）
export const card = (title, body, o = {}) => `<section class="card${o.cls ? ' ' + o.cls : ''}"><header class="card-hd"><h2>${title}</h2>${o.demo ? DEMO : ''}${o.note ? `<small>${o.note}</small>` : ''}${o.more ? `<span class="card-r">${o.more}</span>` : ''}</header><div class="card-bd${o.flush ? ' flush' : ''}">${body}</div></section>`;
// 右上角的"去看详情"
export const more = (href, text = '查看') => `<a class="go" href="${href}">${text}${ic('right', 14, 2.4)}</a>`;
// 大数字：换页面时从 0 数到这个数（app.js 里做），dec 是小数位数
export const num = (v, dec = 0, unit = '') => v == null ? '<b>—</b>' : `<b data-count="${v}" data-dec="${dec}">${dec ? v.toFixed(dec) : fmt(v)}</b>${unit}`;
// 涨跌：v 是和上一期的差
export const delta = (v, unit = '', dec = 1) => `<span class="delta${v < 0 ? ' dn' : ''}">${ic(v < 0 ? 'dn' : 'up', 12, 2.8)}${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(dec)}${unit}</span>`;
// 指标块。每块：{ lab 名称, val 大数（HTML）, sub 小字（HTML）, go 点了去哪, off 还没接入, demo 示例数据, spark 大数右边的迷你走势（HTML） }
export const tiles = (list, cls = '') => `<div class="tiles${cls ? ' ' + cls : ''}">${list.map(t => { const a = t.go && !t.off;
  return `<${a ? `a href="${t.go}"` : 'div'} class="tile${t.off ? ' off' : ''}"><span class="lab">${t.lab}${t.demo && !t.off ? DEMO : ''}</span><span class="val"><span>${t.off ? '<b>—</b>' : t.val}</span>${t.off ? '' : t.spark || ''}</span><span class="sub">${t.off ? '待接入' : t.sub || '&nbsp;'}</span></${a ? 'a' : 'div'}>`; }).join('')}</div>`;
// 表格。cols：[表头, 取值, 类名]。类名 num 右对齐，wrap 允许换行。行数多的先露出前 LIMIT 行，剩下的点「展开」再出来（app.js 里处理）。
// 「展开」放在表格后面而不是表格里：表格比卡片宽、要左右滑的时候，它才能一直待在看得见的这一截的中间
const LIMIT = 20;
export function table(cols, rows, empty = '没有符合条件的记录') {
  const fold = rows.length > LIMIT + 5;
  return `<table class="dt"><thead><tr>${cols.map(c => `<th${c[2] ? ` class="${c[2]}"` : ''}>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.length
    ? rows.map((r, i) => `<tr${fold && i >= LIMIT ? ' class="xtra"' : ''}>${cols.map(c => `<td${c[2] ? ` class="${c[2]}"` : ''}>${c[1](r) ?? ''}</td>`).join('')}</tr>`).join('')
    : `<tr class="empty-row"><td colspan="${cols.length}">${empty}</td></tr>`}</tbody></table>`
    + (fold ? `<p class="more-rows"><button class="lk" data-expand>展开其余 ${rows.length - LIMIT} 行</button></p>` : '');
}
// 头像：姓氏加一个按编号算出来的固定色相（只取蓝到紫红这一段，白字压得住；青色那一头太亮，不取）
const hue = id => { let h = 7; for (const c of String(id)) h = (h * 31 + c.codePointAt(0)) >>> 0; return 212 + h % 113; };
export const avatar = p => `<span class="av" style="--h:${hue(p.id ?? p.name)}">${esc([...String(p.name || '')][0] || '')}</span>`;
// 人名：点了打开这个人的档案
export const who = (p, sub = '') => p ? `<button class="pl" data-emp="${esc(p.id)}">${avatar(p)}${esc(p.name)}</button>${sub ? `<span class="dim">${esc(sub)}</span>` : ''}` : '<span class="na">—</span>';
export const names = (list, empty = '现在没有符合的人') => `<div class="names">${list.map(p => `<button data-emp="${esc(p.id)}">${esc(p.name)}<i>${esc([p.dept, p.post].filter(Boolean).join(' · '))}</i></button>`).join('') || `<span class="note">${empty}</span>`}</div>`;
// 一排叠在一起的头像，多出来的写"等 n 人"
export const avatars = (list, max = 5) => `<span class="avs">${list.slice(0, max).map(avatar).join('')}${list.length > max ? `<small>等 ${list.length} 人</small>` : ''}</span>`;
// 横条：数值占上限的比例，后面跟文字
export const meter = (v, max = 100, text = v + '%') => v == null ? '<span class="na">—</span>' : `<span class="mtr"><i><b style="width:${Math.max(0, Math.min(100, v / max * 100)).toFixed(1)}%"></b></i><em>${text}</em></span>`;
// 筛选：一排按钮或一个下拉。点了以后外框把值写进当前页面的 state 再重画（见 app.js）。options：[值, 文字, 数量]
export const segs = (key, options, cur) => `<div class="segs" role="group">${options.map(([v, t, n]) => `<button data-set="${key}" data-v="${esc(v)}"${String(v) === String(cur ?? '') ? ' class="on" aria-pressed="true"' : ''}>${esc(t)}${n == null ? '' : `<b>${n}</b>`}</button>`).join('')}</div>`;
export const pick = (key, options, cur, label) => `<select class="sel" data-set="${key}" aria-label="${label}">${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
// 企业微信里没有的那部分，接真实数据时显示这一块
export const pending = what => `<div class="pending"><b>${what}还没有接入</b><p>企业微信里没有这部分数据。演示时这里显示按固定种子生成的示例数；接真实企业微信后，在接入对应的数据来源之前，这里不放任何编出来的数。</p></div>`;
