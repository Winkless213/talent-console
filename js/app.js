// 入口：主题、导航、路由、搜索面板，以及各模块页面的外框。数据从 source.js 来，各页面只管把自己那一块画出来。
import { $, $$, esc, ic, toast, openLayer, closeAll, trapTab, avatar, pending } from './ui.js';
import { src, start, refresh, onData, sourceInfo, waitHtml, noticeLines } from './source.js';
import { openPerson } from './person.js';
import * as people from './pages/people.js';
import cockpit from './pages/cockpit.js';
import attendance from './pages/attendance.js';
import work from './pages/work.js';
import rating from './pages/rating.js';
import analysis from './pages/analysis.js';
import training from './pages/training.js';
import hire from './pages/hire.js';
import org from './pages/org.js';
import settings from './pages/settings.js';

// 导航。g 是分组的小标题；k 是地址里的名字；tabs 是子页面；x 表示这个模块的数据企业微信里没有，只有示例数据时才有内容
const NAV = [
  { g: '概览' },
  { k: 'cockpit', name: '人才驾驶舱', en: 'COCKPIT', icon: 'dash', desc: '一屏看全局：今天的出勤、要处理的事和人才结构。', page: cockpit },
  { k: 'people', name: '人员数据中心', icon: 'users' },
  { g: '业务' },
  { k: 'attendance', name: '考勤管理', en: 'ATTENDANCE', icon: 'calcheck', desc: '出勤趋势、每天的明细、异常跟进和请假单。', page: attendance, tabs: [['overview', '考勤总览'], ['daily', '员工考勤'], ['cases', '异常跟进'], ['leave', '假勤审批']] },
  { k: 'work', name: '工作与绩效', en: 'PERFORMANCE', icon: 'check', desc: '重点事项、岗位业绩和人效。', page: work, x: 1, tabs: [['tasks', '工作事项'], ['results', '岗位业绩'], ['efficiency', '人效分析']] },
  { k: 'rating', name: '人才评价', en: 'TALENT REVIEW', icon: 'badge', desc: '人才盘点、岗位胜任和主管评价。', page: rating, x: 1, tabs: [['inventory', '人才盘点'], ['fit', '岗位胜任'], ['reviews', '主管评价']] },
  { k: 'analysis', name: 'AI人才分析', en: 'INSIGHTS', icon: 'monitor', desc: '按固定口径从数据里找出值得关注的人和事。', page: analysis, tabs: [['insights', '人才观察'], ['signals', '异常分析'], ['notices', '企微提醒']] },
  { k: 'training', name: '培养发展', en: 'DEVELOPMENT', icon: 'cap', desc: '培养计划、导师带教和入职后的阶段回访。', page: training, x: 1, tabs: [['plans', '培养计划'], ['mentors', '导师带教'], ['outcomes', '阶段成果']] },
  { k: 'hire', name: '招聘管理', en: 'HIRING', icon: 'contact', desc: '招聘需求、面试安排和入职交接。', page: hire, x: 1, tabs: [['jobs', '招聘需求'], ['interviews', '面试跟进'], ['onboard', '入职交接']] },
  { g: '系统' },
  { k: 'org', name: '组织与权限', en: 'ORGANIZATION', icon: 'org', desc: '部门架构、岗位分布和角色权限。', page: org, tabs: [['depts', '部门架构'], ['posts', '岗位分布'], ['roles', '角色权限']] },
  { k: 'settings', name: '系统设置', en: 'SETTINGS', icon: 'gear', desc: '数据从哪来、每个数怎么算、提醒的门槛。', page: settings, tabs: [['sources', '数据来源'], ['rules', '指标口径'], ['alerts', '提醒规则']] }
];
const MODS = NAV.filter(n => n.k), reduced = matchMedia('(prefers-reduced-motion: reduce)');
let route = null, scopeDept = '', painted = false;

/* ---------- 路由：地址形如 #/模块/子页面?条件 ---------- */
function parse() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?'), [k, tab] = path.split('/');
  const nav = MODS.find(n => n.k === k) || MODS[0], t = nav.tabs?.find(v => v[0] === tab) || nav.tabs?.[0];
  return { nav, tab: t?.[0] || '', tabName: t?.[1] || '', q: Object.fromEntries(new URLSearchParams(query)) };
}
const to = hash => { if (location.hash === hash) go(); else location.hash = hash; };
function go() {
  route = parse();
  closeAll(); closeNav();
  const state = route.nav.page?.state;
  // 地址里带的条件写进页面自己的 state，只认页面声明过的那几个；dept 是各模块共用的部门范围（空着就是全部部门，画的时候还会核对有没有这个部门）
  if (state) for (const [k, v] of Object.entries(route.q)) if (Object.hasOwn(state, k)) state[k] = v;
  if (route.nav.page && Object.hasOwn(route.q, 'dept')) scopeDept = route.q.dept;
  $('#side').innerHTML = NAV.map(n => n.g ? `<p class="side-g">${n.g}</p>` : `<a href="#/${n.k}"${n === route.nav ? ' class="on" aria-current="page"' : ''}>${ic(n.icon, 18, 1.9)}<span>${n.name}</span></a>`).join('');
  $('#crumb').innerHTML = `<span>人才管理中台</span>${ic('right', 13, 2.4)}` + (route.tabName ? `<span>${route.nav.name}</span>${ic('right', 13, 2.4)}<b>${route.tabName}</b>` : `<b>${route.nav.name}</b>`);
  document.title = `${route.tabName ? route.tabName + ' · ' : ''}${route.nav.name} - 人才管理中台`;
  renderPage(true);
  $('#main').scrollTop = 0;
}

/* ---------- 外框上跟着数据变的几处 ---------- */
function renderStatus() {
  const [state, name, text] = sourceInfo(), has = !!src.ds, lines = has ? noticeLines() : [];
  $('#source').innerHTML = `<div class="source-l"><i class="live${state ? ' ' + state : ''}"></i><b>${name}</b>`
    + (src.mode === 'server' ? `<button class="ib${src.sync?.syncing ? ' spin' : ''}" data-refresh title="重新取数" aria-label="重新取数">${ic('refresh', 15, 2.2)}</button>` : '') + `</div><small>${text}</small>`;
  $('#wait').hidden = has;
  if (!has) $('#wait').innerHTML = waitHtml();
  $('#notice').hidden = !lines.length;
  $('#notice').innerHTML = lines.map(([tone, t]) => `<p class="n-${tone}">${t}</p>`).join('');
  $('#bellDot').hidden = !has || !src.ds.people.some(p => p.flags.att);
}
const ctx = () => ({ ds: src.ds, x: src.x, sync: src.sync, mode: src.mode, tab: route.tab, dept: scopeDept, by: new Map(src.ds.people.map(p => [p.id, p])) });
function renderMod() {
  const n = route.nav, page = n.page;
  if (scopeDept && !src.ds.depts.includes(scopeDept)) scopeDept = '';
  const scope = page.dept === false || page.noDept?.includes(route.tab) ? '' : `<div class="head-tools"><select class="sel" data-scope aria-label="部门范围"><option value="">全部部门</option>${src.ds.depts.map(d => `<option value="${esc(d)}"${d === scopeDept ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></div>`;
  $('#pageMod').innerHTML = (page.bare ? '' : `<header class="page-head"><div class="ph-t"><p class="eyebrow">${n.en}</p><h1>${n.name}</h1><p class="ph-sub">${n.desc}</p></div>${scope}</header>`)
    + (n.tabs ? `<nav class="tabs" aria-label="子页面">${n.tabs.map(([k, t]) => `<a href="#/${n.k}/${k}"${k === route.tab ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('')}</nav>` : '')
    + `<div class="mod-body">${n.x && !src.x ? pending(n.name) : page.render(ctx())}</div>`;
  markScrollers();
}
// 横向放不下、要左右滑才看得全的卡片：让它能接住焦点，键盘才滑得动（放得下的不多占一个 Tab 位）；
// 再标上哪一边还有内容，样式里那一边淡出一小截，看得出没完
function markScrollers() {
  for (const el of $$('.card-bd.flush,.card-bd:has(>.heat),.org-tree', $('#pageMod'))) {
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) el.tabIndex = 0; else el.removeAttribute('tabindex');
    el.classList.toggle('more-r', over - el.scrollLeft > 1);
    el.classList.toggle('more-l', over > 1 && el.scrollLeft > 1);
  }
}
// entering：刚换到这个页面（放入场动效、数字从 0 数上来）；否则只是数据或筛选变了，原地重画
let fxTimer = 0;
function renderPage(entering) {
  renderStatus();
  const has = !!src.ds, isPeople = route.nav.k === 'people', el = $(isPeople ? '#pagePeople' : '#pageMod');
  $('#pagePeople').hidden = !has || !isPeople;
  $('#pageMod').hidden = !has || isPeople;
  if (!has) return;
  if (!isPeople) renderMod(); else if (entering) people.enter(route.q); else people.update();
  if (!entering) return;
  painted = true;
  clearTimeout(fxTimer);
  for (const p of $$('.page')) p.classList.remove('enter');
  void el.offsetWidth;   // 让浏览器先认一次"没有 enter"，再加上才会重新播放
  el.classList.add('enter');
  fxTimer = setTimeout(() => el.classList.remove('enter'), 1400);
  if (!reduced.matches) for (const b of $$('[data-count]', el)) countUp(b);
}
function countUp(el) {
  const end = +el.dataset.count, dec = +el.dataset.dec || 0, text = el.textContent, t0 = performance.now();
  if (!Number.isFinite(end)) return;
  const step = now => {
    const k = Math.min(1, (now - t0) / 900), v = end * (1 - (1 - k) ** 3);
    el.textContent = k === 1 ? text : dec ? v.toFixed(dec) : Math.round(v).toLocaleString('zh-CN');
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// 模块页面是整块重画的。重画前记下焦点在哪个控件上，重画完放回"同一个"上：筛选按它的键和值认，人名、部门范围、链接按各自的标记认
const keyOf = f => !f?.dataset || !$('#pageMod').contains(f) ? '' : f.dataset.set ? `[data-set="${f.dataset.set}"]` + (f.tagName === 'BUTTON' ? `[data-v="${CSS.escape(f.dataset.v)}"]` : '')
  : f.dataset.emp ? `[data-emp="${CSS.escape(f.dataset.emp)}"]` : f.hasAttribute('data-scope') ? '[data-scope]' : f.hasAttribute('href') ? `a[href="${CSS.escape(f.getAttribute('href'))}"]` : '';
// 模块页面里的筛选：把值写进页面的 state 再重画
function setState(key, value) {
  const state = route.nav.page.state, back = keyOf(document.activeElement);
  if (!state || !Object.hasOwn(state, key)) return;
  state[key] = value;
  renderMod();
  // 原来那个找不到了（比如点完自己就消失的按钮），就放到同一组筛选的头一个上，不让焦点掉回页面开头
  if (back) ($(back, $('#pageMod')) || $(`[data-set="${key}"]`, $('#pageMod')))?.focus();
}

/* ---------- 深色、浅色 ---------- */
function toggleTheme() {
  const root = document.documentElement, next = root.dataset.theme === 'light' ? 'dark' : 'light';
  const apply = () => { root.dataset.theme = next; try { localStorage.setItem('talent-console:theme', next); } catch { /* 存不了就只管这一次 */ } };
  if (!document.startViewTransition || reduced.matches) return apply();
  // 新主题从按钮的位置一圈一圈铺开
  const b = $('#btnTheme').getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2, r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add('theming');
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 560, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
  vt.finished.finally(() => root.classList.remove('theming'));
}

/* ---------- 手机上的导航抽屉 ---------- */
const openNav = () => { $('#app').classList.add('nav-open'); $('#scrim').hidden = false; };
function closeNav() { $('#app').classList.remove('nav-open'); $('#scrim').hidden = true; }

/* ---------- 搜索面板：找人、找页面 ---------- */
let cmdItems = [], cmdAt = 0;
function openCmd() {
  closeAll(); closeNav();
  $('#cmd').innerHTML = `<div class="cmd-in">${ic('search', 18, 2.2)}<input id="cmdIn" placeholder="搜索人员、页面" aria-label="搜索人员、页面" autocomplete="off"><kbd>Esc</kbd></div><div class="cmd-list" id="cmdList"></div>`
    + '<div class="cmd-ft"><span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span></div>';
  openLayer('cmd', '搜索人员、页面');
  renderCmd('');
  $('#cmdIn').focus();
}
function renderCmd(kw) {
  const k = kw.trim().toLowerCase(), hit = s => s.toLowerCase().includes(k);
  const pages = MODS.flatMap(n => [{ t: n.name, sub: '', href: `#/${n.k}`, icon: n.icon }, ...(n.tabs || []).map(([tk, tn]) => ({ t: tn, sub: n.name, href: `#/${n.k}/${tk}`, icon: n.icon }))]).filter(p => k ? hit(p.t + p.sub) : !p.sub);
  const ppl = k && src.ds ? src.ds.people.filter(p => hit(p.name + (p.dept || '') + (p.post || ''))).slice(0, 8) : [];
  cmdItems = [...ppl.map(p => ({ emp: p.id })), ...pages.map(p => ({ href: p.href }))];
  cmdAt = 0;
  const item = (i, inner) => `<button class="cmd-i${i ? '' : ' on'}" data-cmd="${i}">${inner}</button>`;
  $('#cmdList').innerHTML = (ppl.length ? '<p class="cmd-g">人员</p>' + ppl.map((p, i) => item(i, `${avatar(p)}<span>${esc(p.name)}</span><small>${esc([p.dept, p.post].filter(Boolean).join(' · '))}</small>`)).join('') : '')
    + (pages.length ? '<p class="cmd-g">页面</p>' + pages.map((p, i) => item(ppl.length + i, `${ic(p.icon, 17, 1.9)}<span>${p.t}</span><small>${p.sub}</small>`)).join('') : '')
    || '<p class="cmd-none">没有找到。试试姓名、部门、岗位，或者页面的名字。</p>';
}
function moveCmd(d) {
  if (!cmdItems.length) return;
  cmdAt = (cmdAt + d + cmdItems.length) % cmdItems.length;
  $$('.cmd-i').forEach((b, i) => { b.classList.toggle('on', i === cmdAt); if (i === cmdAt) b.scrollIntoView({ block: 'nearest' }); });
}
function runCmd(i) {
  const it = cmdItems[i];
  if (!it) return;
  closeAll();
  if (it.emp) openPerson(it.emp); else to(it.href);
}

/* ---------- 点击、改值、按键：通用的在这里处理，剩下的交给当前页面 ---------- */
document.addEventListener('click', ev => {
  const q = s => ev.target.closest(s);
  let el;
  if ((el = q('[data-emp]'))) return openPerson(el.dataset.emp);
  if (q('[data-close]') || ev.target.id === 'mask') return closeAll();
  if ((el = q('[data-cmd]'))) return runCmd(+el.dataset.cmd);
  if (q('#topSearch')) return openCmd();
  if (q('#btnTheme')) return toggleTheme();
  if (q('#btnMenu')) return openNav();
  if (ev.target.id === 'scrim') return closeNav();
  if (q('#topBell')) return to('#/people?metric=ai:att');
  if (q('[data-refresh]')) return refresh().then(toast);
  // 长表：把收起来的行都露出来。按钮自己随即消失，焦点交给刚露出来的第一行里的人名
  if ((el = q('[data-expand]'))) { const t = el.parentElement.previousElementSibling; t.classList.add('all'); markScrollers(); return $('tr.xtra button', t)?.focus(); }
  if (!src.ds) return;
  if (route.nav.k === 'people') return people.click(ev);
  if ((el = q('button[data-set]'))) return setState(el.dataset.set, el.dataset.v);
  route.nav.page.click?.(ev, ctx());
});
// 日期框用键盘一段一段敲的时候，浏览器每敲一下就报一次"改了"；这时候就去重算，敲到一半的日期会被冲掉。
// 所以键盘敲出来的改动先记着，回车或者离开这个框的时候再算；用日历点选的照常马上算
let keyed = null, typed = null;
const commitTyped = () => { const t = typed; typed = null; if (t?.isConnected) t.dispatchEvent(new Event('change', { bubbles: true })); };
// 离开时等焦点落到下一个控件上再算：页面重画以后才知道该把焦点放回哪
document.addEventListener('focusout', ev => { if (ev.target === typed) setTimeout(commitTyped); });
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.type === 'date' && ev.isTrusted && keyed === t) { typed = t; return; }
  if (t === typed) typed = null;
  if (!src.ds) return;
  if (route.nav.k === 'people') return people.change(ev);
  if (t.matches('[data-scope]')) { scopeDept = t.value; renderMod(); $('[data-scope]').focus(); }
  else if (t.dataset.set) setState(t.dataset.set, t.value);
});
document.addEventListener('input', ev => { if (ev.target.id === 'cmdIn') renderCmd(ev.target.value); });
document.addEventListener('keydown', ev => {
  if (ev.isComposing) return;   // 输入法还在组字：这一下回车只是确认候选词，不当成"执行"
  if (ev.target.type === 'date') { if (ev.key === 'Enter') commitTyped(); else if (ev.key?.length === 1 || /^(Arrow(Up|Down)|Backspace|Delete)$/.test(ev.key)) { keyed = ev.target; setTimeout(() => { keyed = null; }); } }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); return $('#cmd').hidden ? openCmd() : closeAll(); }
  if (ev.key === 'Escape') { closeNav(); return closeAll(); }
  if (ev.key === 'Tab') return trapTab(ev);
  if (!$('#cmd').hidden) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); moveCmd(ev.key === 'ArrowDown' ? 1 : -1); }
    // 焦点在某一条结果上（Tab 过去的）就打开那一条，否则打开高亮的那一条。拦掉默认动作，免得这一下回车接着再点一次按钮
    else if (ev.key === 'Enter') { ev.preventDefault(); const b = ev.target.closest?.('[data-cmd]'); runCmd(b ? +b.dataset.cmd : cmdAt); }
    return;
  }
  if (src.ds && route.nav.k === 'people') people.keydown(ev);
});
// 卡片上跟着鼠标走的那一圈光
$('#main').addEventListener('pointermove', ev => {
  const el = ev.target.closest('.card,.tile,.kpi');
  if (!el) return;
  const b = el.getBoundingClientRect();
  el.style.setProperty('--mx', ev.clientX - b.left + 'px');
  el.style.setProperty('--my', ev.clientY - b.top + 'px');
});

$$('[data-ic]').forEach(el => el.insertAdjacentHTML('afterbegin', ic(el.dataset.ic, +el.dataset.s || 18, +el.dataset.sw || 1.8)));
// 数据换了一轮就重画当前页面；只是取数状态变了，就只更新外框上的提示
onData(changed => { if (changed || !painted) renderPage(!painted); else renderStatus(); });
addEventListener('hashchange', go);
addEventListener('resize', markScrollers);
$('#pageMod').addEventListener('scroll', markScrollers, true);   // 滚动事件不往上冒，在捕获阶段听
go();
start();
