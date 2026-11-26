// 人员数据中心：页面逻辑。数据从 source.js 来，一屏要的数在浏览器里用 core/model.js 现算，页面不向别处发请求。
// 企业微信取回的文字（人名、部门、岗位、班次名、假期名）一律先转义再写进页面。
import { $, $$, esc, r1, sum, H, clock, hmOf, hrs, mins, md, weekday, tenureOf, ic, ST, st, MARK, typeTag, RULE, HERE, GRADE, LEVEL, toast, openLayer, closeAll, xBtn, avatar, tag, meter, fmt, csv } from '../ui.js';
import { src } from '../source.js';
import { openPerson } from '../person.js';
import { AI, aiRule, rulesDoc } from '../rules.js';
import { overviewFor } from '../../core/model.js';

const TAB = { today: '今日', yesterday: '昨日', d7: '近7天', month: '本月' };

// 指标卡：[键, 名称, 图标, 色调]
const KPI = [['total', '在职人数', 'users', 'b'], ['rate', '出勤率', 'calendar', 'b'], ['late', '迟到', 'clock', 'o'], ['ot', '加班', 'moon', 'p'], ['leave', '请假', 'umbrella', 'b'], ['absent', '缺勤', 'alert', 'r'], ['hours', '平均工时', 'alarm', 'b'], ['eff', '人效指数', 'bars', 'g'], ['star', '优秀人才', 'star', 'o']];
const isStar = e => e.level === '核心人才' || e.level === '优秀人才';
// 点指标卡看名单：按所选时段里每个人的累计来筛
const METRIC = { total: () => true, rate: r => r.sel.present > 0, late: r => r.sel.lateN > 0, ot: r => r.sel.otSec > 0, leave: r => r.sel.leaveN > 0, absent: r => r.sel.absentN > 0, hours: r => r.sel.regN > 0 || r.sel.spanN > 0,
  eff: r => r.x?.eff >= 1, star: r => !!r.x && isStar(r.x) };
const metricFn = m => m.startsWith('ai:') ? r => r.flags.includes(m.slice(3)) : METRIC[m] || (() => true);
const QUICK = [['all', '全部', () => true, ''], ['here', '在岗', r => HERE.has(r.today.st), 'b'], ['formal', '正式工', r => r.type === '正式工', 'g'], ['prob', '试用期', r => r.type === '试用期', 'o'], ['intern', '实习', r => r.type === '实习', 'p'],
  ['tlate', '今日迟到', r => r.today.late, 'o'], ['tmiss', '今日未到岗', r => r.today.st === 'unsigned' || r.today.st === 'nopunch', 'r'], ['tleave', '今日请假', r => r.today.leave.length > 0, 'b'],
  ['yot', '昨日加班', r => r.yest?.ot > 0, 'p'], ['yabs', '昨日缺勤', r => r.yest?.st === 'absent' || r.yest?.st === 'nopunch', 'r']];
// 排序：[键, 名称, 取值, 默认升序, 要有示例数据才能用]。"异常优先"就是核算时给的顺序。
// 表格里显示成"—"的（今天还没打卡、这一天没有日报、这个月还没有数）取值给 null，升序降序都排在最后
const worked = d => d && (d.reg > 0 || d.span > 0), M = f => r => r.month.days ? f(r.month) : null;
const SORTS = [['score', '异常优先'], ['tLate', '今日迟到时长', r => r.today.punched ? r.today.lateSec : null], ['tSpan', '今日在岗时长', r => r.today.span || null], ['yReg', '昨日工时', r => worked(r.yest) ? r.yest.reg : null], ['yOt', '昨日加班', r => r.yest?.n ? r.yest.ot : null],
  ['mLateN', '本月迟到次数', M(m => m.lateN)], ['mLateSec', '本月迟到分钟', M(m => m.lateSec)], ['mOt', '本月加班小时', M(m => m.otSec)], ['mReg', '本月累计工时', r => worked(r.month) ? r.month.reg : null], ['mPresent', '本月出勤天数', M(m => m.present)], ['mAbsent', '本月缺勤天数', M(m => m.absentN)],
  ['streak', '连续出勤天数', r => r.streak], ['join', '入职时间', r => r.join, 1], ['name', '姓名', r => r.name, 1],
  ['xRate', '业绩达成率', r => r.x?.perf.rate, 0, 1], ['xEff', '人效指数', r => r.x?.eff, 0, 1], ['xAbility', '能力评分', r => r.x?.ability.score, 0, 1]];

/* ---------- 页面状态 ---------- */
// p：所选时段（today / yesterday / d7 / month / custom）；dept、post：右上角的范围，核算时就按它取人；其余都在算好的名单里筛
const state = { p: 'today', from: '', to: '', dept: '', post: '', quick: 'all', metric: null, f: {}, sort: 'score', dir: -1, page: 1, size: 20 };
let D = null, R = [], shown = [], X = null;
const periodLabel = () => TAB[D.tab] || (D.from === D.to ? D.from : `${D.from} 至 ${D.to}`);

/* ---------- 算数 ---------- */
// 按所选时段和范围重算一屏的数，再全部重画。X 是示例数据（没有时为 null），每一行顺手挂上这个人的那一份
function load() {
  if (!src.ds) return;
  const d = overviewFor(src.ds, { p: state.p, from: state.from, to: state.to, dept: state.dept, post: state.post });
  X = src.x;
  for (const r of d.rows) r.x = X?.byId[r.id] || null;
  D = d;
  state.p = d.tab || 'custom'; state.from = d.tab ? '' : d.from; state.to = d.tab ? '' : d.to;
  $$('#seg button').forEach(b => b.classList.toggle('on', b.dataset.p === d.tab));
  for (const [id, v] of [['#dFrom', d.from], ['#dTo', d.to]]) { const el = $(id); el.min = d.minDay; el.max = d.today; el.value = v; }
  fillSelects(); renderKpis(); renderAi(); renderQuick(); renderTable();
}

/* ---------- 指标卡、提醒、常用筛选 ---------- */
const delta = (v, u) => `<span class="delta ${v < 0 ? 'dn' : ''}">${ic(v < 0 ? 'dn' : 'up', 14, 2.8)}${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}${u}</span>`;
function renderKpis() {
  const d = D, k = d.kpi, T = d.kind === 'today', unit = d.kind === 'range' ? ' 人次' : '';
  const ruled = d.rows.filter(r => r.rule !== 'none').length, by = Object.entries(k.leaveBy).sort((a, b) => b[1] - a[1]), due = `实到 ${k.present} / 应到 ${k.due}${unit}`;
  // 人效指数、优秀人才是示例数据，按当前范围里的人算；没有示例数据时这两张卡显示待接入
  const mean = (l, f) => l.length ? sum(l, f) / l.length : null, xs = d.rows.filter(r => r.x), ef = xs.filter(r => r.x.eff != null), eff = mean(ef, r => r.x.eff), effPrev = mean(ef.filter(r => r.x.effPrev != null), r => r.x.effPrev);
  // 用工类型各有几人：卡片宽的时候接在小字后面（样式里控制），窄的时候只在鼠标停留的说明里
  const types = ['正式工', '试用期', '实习'].map(t => [t, d.rows.filter(r => r.type === t).length]).filter(v => v[1]).map(([t, n]) => ` · ${t} ${n}`).join('');
  const hv = T ? k.inPost : k.hours;
  // 每张卡：[大数, 第三行小字, 环比, 鼠标停留时的完整说明]。有环比时不显示小字；请假、缺勤两张卡窄，小字只放最要紧的一项
  const V = {
    total: [`<b>${k.total}</b>人`, `参与考勤 ${ruled} 人<i>${types}</i>`, '', `参与考勤 ${ruled} 人${types}`],
    rate: [k.rate == null ? '<b>—</b>' : `<b>${k.rate.toFixed(1)}%</b>`, unit ? `${k.present} / ${k.due}${unit}` : due, !T && k.rate != null && k.prevRate != null ? delta(k.rate - k.prevRate, 'pp') : '', due + (k.prevRate == null ? '' : `；前一段同样长的时间是 ${k.prevRate.toFixed(1)}%`)],
    late: [`<b>${k.lateN}</b>人/${k.lateMin}分钟`, k.lateN ? `人均 ${Math.round(k.lateMin / k.lateN)} 分钟` : ''],
    ot: [`<b>${k.otN}</b>人/${k.otHours}小时`, T ? `晚走满 ${Math.round(d.rules.otMinSec / 60)} 分钟起算` : `企微记 ${k.otWN} 人/${k.otWHours} 小时`, '', T ? '今天的日报企业微信还没生成，这里只按下班卡晚于班次下班时间算' : `企业微信记了加班时长的 ${k.otWN} 人共 ${k.otWHours} 小时，其余按下班卡晚于班次下班时间算`],
    leave: [`<b>${k.leaveN}</b>人`, by.length ? `${esc(by[0][0])} ${by[0][1]}${by.length > 1 ? ' 等' : ''}` : '', '', by.map(([n, c]) => `${n} ${c} 人`).join('、')],
    absent: [`<b>${k.absentN}</b>人`, T ? (k.before ? `未到点 ${k.before} 人` : '') : `含旷工 ${k.absentW}`, '',
      T ? `到了上班时间还没打卡的 ${k.absentN} 人` + (k.before ? `；另有 ${k.before} 人还没到上班时间` : '') : `企业微信判旷工的 ${k.absentW} 人，该上班却没打卡也没请假的 ${k.nopunch} 人`],
    hours: [hv == null ? '<b>—</b>' : `<b>${hv}</b>小时`, T ? `当前在岗 ${k.onDuty} 人` : k.inPost == null ? '' : `在岗 ${k.inPost} 小时`],
    eff: !X ? ['<b>—</b>', '待接入'] : [`<b>${eff == null ? '—' : eff.toFixed(2)}</b>`, effPrev == null ? '' : `上月 ${effPrev.toFixed(2)}`, '', '示例数据。本人每工时的产出 ÷ 同岗位的中位数，1.00 就是同岗位的中间水平；点开看不低于同岗位的人'],
    star: !X ? ['<b>—</b>', '待接入'] : [`<b>${xs.filter(r => isStar(r.x)).length}</b>人`, `核心 ${xs.filter(r => r.x.level === '核心人才').length} · 优秀 ${xs.filter(r => r.x.level === '优秀人才').length}`, '', '示例数据。人才等级为核心人才或优秀人才的人']
  };
  const LAB = { absent: T ? '未到岗' : '缺勤', hours: T ? '平均在岗' : '平均工时' };
  $('#kpis').innerHTML = KPI.map(([key, t, i, c]) => {
    const [v, sub, dl, tip] = V[key], off = (key === 'eff' || key === 'star') && !X, lab = LAB[key] || t;
    return `<button class="kpi${dl ? ' has-delta' : ''}${off ? ' off' : ''}${state.metric === key ? ' on' : ''}"${off ? ' tabindex="-1" title="这项数据还没有接入"' : ` data-metric="${key}"` + (tip ? ` title="${esc(tip)}"` : '')} data-label="${key === 'eff' ? '人效不低于同岗位' : lab}"><span class="ki t-${c}">${ic(i, 18, 2)}</span><span><span class="lab">${lab}</span>`
      + `<span class="val${v.replace(/<[^>]+>/g, '').length > 11 ? ' sm' : ''}">${v}</span>${dl || (sub ? `<span class="sub">${sub}</span>` : '')}</span></button>`;
  }).join('');
}
function renderAi() {
  const rows = D.rows, n = k => rows.filter(r => r.flags.includes(k)).length;
  $('#aiChips').innerHTML = AI.map(([k, t, i, c]) => `<button class="chip c-${c}${state.metric === 'ai:' + k ? ' on' : ''}" data-metric="ai:${k}" data-label="${t}">${ic(i, 15, 2.4)}<span>${t}</span><span>${n(k)}人</span></button>`).join('');
}
function renderQuick() {
  $('#quick').innerHTML = QUICK.map(([k, t, f, c]) => `<button class="qc${state.quick === k ? ' on' : ''}" data-quick="${k}">${t}<b class="n-${c}">${D.rows.filter(f).length}</b></button>`).join('');
}

/* ---------- 下拉选项 ---------- */
const opts = (first, list, cur, label = x => x) => `<option value="">${first}</option>` + list.map(x => `<option value="${esc(x)}"${x === cur ? ' selected' : ''}>${esc(label(x))}</option>`).join('');
// 选项只列当前名单里真有的值；原来选中的值不在了就清掉这个条件
function fillSelects() {
  const d = D, rows = d.rows, f = state.f, uniq = l => [...new Set(l.filter(Boolean))], zh = (a, b) => a.localeCompare(b, 'zh');
  const keep = (k, list) => { if (f[k] && !list.includes(f[k])) f[k] = ''; return list; };
  $('#scopeDept').innerHTML = opts('全部部门', d.allDepts, state.dept);
  $('#scopePost').innerHTML = opts('全部岗位', d.posts, state.post);
  $('#fDept').innerHTML = opts('全部', keep('dept', d.allDepts.filter(x => rows.some(r => r.dept === x))), f.dept);
  $('#fPost').innerHTML = opts('全部', keep('post', uniq(rows.filter(r => !f.dept || r.dept === f.dept).map(r => r.post)).sort(zh)), f.post);
  const types = uniq(rows.map(r => r.type)), order = ['正式工', '试用期', '实习'];
  $('#fType').innerHTML = opts('全部', keep('type', [...order.filter(x => types.includes(x)), ...types.filter(x => !order.includes(x))]), f.type);
  $('#fAtt').innerHTML = opts('全部', keep('att', Object.keys(ST).filter(k => rows.some(r => r.sel.st === k))), f.att, k => ST[k][0]);
  $('#fMgr').innerHTML = opts('全部', keep('mgr', d.leaders), f.mgr);
  const sorts = SORTS.filter(s => !s[4] || X);
  if (!sorts.some(s => s[0] === state.sort)) { state.sort = 'score'; state.dir = -1; }
  $('#sortBy').innerHTML = sorts.map(([k, t]) => `<option value="${k}"${k === state.sort ? ' selected' : ''}>${t}</option>`).join('');
  const b = $('#sortDir');
  b.textContent = state.dir < 0 ? '降序' : '升序'; b.disabled = state.sort === 'score';
}

/* ---------- 表格：一格一组指标，首行加粗，其余行缩进带竖线 ---------- */
const NA = '<span class="na">—</span>';
const ln = (t, v) => `<p><span>${t}:</span> ${v || NA}</p>`;
const both = (reg, span) => reg > 0 || span > 0 ? `${hrs(reg)} 小时<span class="dim">（在岗 ${hrs(span)}）</span>` : '';
// 每组里的行：[键, 名称, 取值, 默认不显示]。取值为空就显示"—"
const TODAYL = [
  ['shift', '班次', t => esc(t.shift)],
  ['time', '工作时间', t => t.on == null && t.off == null ? '' : (t.on != null ? clock(t.on) : '—') + ' - ' + (t.off != null ? clock(t.off) : '<span class="dim">未下班</span>')],
  ['late', '迟到', t => !t.punched ? '' : t.late ? `<b class="v-o">${t.lateSec ? mins(t.lateSec) + ' 分钟' : '是'}</b>` : '无'],
  ['ot', '加班', t => !t.punched ? '' : t.otL > 0 ? `<b class="v-p">${hrs(t.otL)} 小时</b><span class="dim">（晚走）</span>` : '无'],
  ['span', '在岗', t => t.span > 0 ? hrs(t.span) + ' 小时' : '']
];
const DAYL = [
  ['time', '工作时间', y => y.on == null ? '' : hmOf(y.on) + (y.off != null ? ' - ' + hmOf(y.off) : '')],
  ['late', '迟到', y => !y.n ? '' : (y.lateN ? `<b class="v-o">${y.lateSec ? mins(y.lateSec) + ' 分钟' : y.lateN + ' 次'}</b>` : '无') + (y.earlySec > 0 ? `<span class="sep">·</span><span class="lb">早退</span> <b class="v-o">${mins(y.earlySec)} 分钟</b>` : '')],
  ['ot', '加班', y => !y.n ? '' : y.ot > 0 ? `<b class="v-p">${hrs(y.ot)} 小时</b><span class="dim">（${y.otW > 0 ? '企微' : '晚走'}）</span>` : '无'],
  ['reg', '工时', y => both(y.reg, y.span)],
  ['shift', '班次', y => esc(y.shift), 1]
];
const AGGL = [
  ['late', '迟到', a => !a.days ? '' : a.lateN ? `<b class="v-o">${a.lateN} 次</b><span class="sep">/</span>${Math.round(a.lateSec / 60)} 分钟` : '无'],
  ['ot', '加班', a => !a.days ? '' : a.otN ? `<b class="v-p">${a.otN} 次</b><span class="sep">/</span>${hrs(a.otSec)} 小时` : '无'],
  ['leave', '请假', a => !a.days ? '' : (a.leaveN ? `<b class="v-b">${a.leaveN} 次</b>` : '无') + '<span class="sep">·</span><span class="lb">缺勤</span> ' + (a.absentN ? `<b class="v-r">${a.absentN} 天</b>` : '无')],
  ['reg', '工时', a => both(a.reg, a.span)],
  ['early', '早退', a => !a.days ? '' : (a.earlyN ? a.earlyN + ' 次' : '无') + '<span class="sep">·</span><span class="lb">缺卡</span> ' + (a.missN ? a.missN + ' 次' : '无'), 1],
  ['rest', '休息', a => !a.days ? '' : a.rest + ' 天' + (a.restWork ? `<span class="sep">·</span><span class="lb">休息日出勤</span> ${a.restWork} 天` : ''), 1]
];
// 示例数据的两组，取值拿到的是这个人的示例数据
const WORKL = [
  ['progress', '工作进度', e => meter(e.work.progress)],
  ['task', '任务完成', e => `${e.work.taskRate}%<span class="dim">（${e.work.tasks.done}/${e.work.tasks.total}）</span>` + (e.work.tasks.overdue ? `<span class="sep">·</span><b class="v-r">逾期 ${e.work.tasks.overdue}</b>` : '')],
  ['quality', '工作质量', e => e.perf.quality + '%']
];
const TALENTL = [
  ['ability', '能力评分', e => e.ability.score + ' 分'],
  ['eff', '人效指数', e => e.eff == null ? '' : e.eff.toFixed(2)],
  ['salary', '工资', e => '¥' + fmt(e.salary), 1]
];
// 表格的分组。one：整组只有一个开关；x：示例数据的组，没有示例数据时显示"—"；auto：选了别的日期才出现，不进"自定义列"
const GROUPS = [
  { k: 'person', t: '人员', w: 250, lines: [
    ['dept', '部门', r => esc(r.dept) + (r.team ? `<span class="sep">·</span>${esc(r.team)}` : '')], ['post', '岗位', r => esc(r.post)],
    ['join', '入职', r => r.join ? esc(r.join) + `<span class="dim">（${tenureOf(r.tenure)}）</span>` : ''],
    ['leader', '主管', r => r.leader ? esc(r.leader) + (r.leaderSrc === 'dept' ? '<span class="dim">（部门负责人）</span>' : '') : ''],
    ['no', '工号', r => esc(r.no), 1], ['rule', '考勤规则', r => RULE[r.rule], 1]] },
  { k: 'week', t: '近7天', w: 150, one: '每天在岗时长' },
  { k: 'sel', t: '所选时段', w: 200, auto: 1 },
  { k: 'today', t: '今日考勤', w: 226, lines: TODAYL },
  { k: 'yest', t: '昨日考勤', w: 210, lines: DAYL },
  { k: 'month', t: '本月累计', w: 216, lines: AGGL },
  { k: 'work', t: '工作与业绩', w: 248, x: 1, lines: WORKL },
  { k: 'talent', t: '人效与人才', w: 172, x: 1, lines: TALENTL },
  { k: 'tags', t: '提醒', w: 176, one: '提醒标签' }
];
const G = Object.fromEntries(GROUPS.map(g => [g.k, g]));
const keysOf = g => g.lines ? g.lines.map(l => g.k + '.' + l[0]) : [g.k];
const DEF = new Set(GROUPS.filter(g => !g.auto).flatMap(g => g.lines ? g.lines.filter(l => !l[3]).map(l => g.k + '.' + l[0]) : [g.k]));
let vis = new Set(DEF);
// 旧版把列设置存在 people.cols.v1，那时没有示例数据的几行，沿用会把这两组藏掉，所以直接清掉，换一个名字重新记
const COLS = 'talent-console:cols';
try { localStorage.removeItem('people.cols.v1'); const s = JSON.parse(localStorage.getItem(COLS) || 'null'); if (Array.isArray(s)) vis = new Set(s.filter(k => typeof k === 'string')); } catch { /* 读不到就用默认 */ }
const saveVis = () => { try { localStorage.setItem(COLS, JSON.stringify([...vis])); } catch { /* 存不了不影响使用 */ } };
const linesOf = g => g.lines.filter(l => vis.has(g.k + '.' + l[0]));
const groupOn = g => g.k === 'person' || keysOf(g).some(k => vis.has(k));

const todayHead = t => `<p class="h">${st(t.st)}<span class="sub">${esc([...t.leave, t.pending ? '请假待审批' : '', t.restWork ? '休息日出勤' : '', t.noRule ? '无打卡规则' : '', t.earlySec > 0 ? `早退 ${mins(t.earlySec)} 分钟` : ''].filter(Boolean).join(' · '))}</span></p>`;
const dayCell = y => `<div class="g"><p class="h">${st(y ? y.st : '')}<span class="sub">${y ? esc(y.leave.map(x => x.name).join(' · ')) : ''}</span></p><div class="l">${linesOf(G.yest).map(l => ln(l[1], y ? l[2](y) : '')).join('')}</div></div>`;
const aggCell = a => `<div class="g"><p class="h">出勤: ${a.days ? `${a.present} / ${a.due} 天` : '—'}</p><div class="l">${linesOf(G.month).map(l => ln(l[1], l[2](a))).join('')}</div></div>`;
function weekCell(r) {
  const on = r.week.filter(x => x.h > 0);
  return `<div class="g"><p class="h">${on.length ? `日均在岗: ${r1(sum(on, x => x.h) / on.length)} 小时` : '<span class="dim">近 7 天没有打卡</span>'}</p><div class="wk">${r.week.map(x => {
    const m = MARK[x.st] || [String(+x.d.slice(8)), 'n'];
    return `<div class="d" data-tip="${md(x.d)} 周${weekday(x.d)}　${(ST[x.st] || ST[''])[0]}|${x.h > 0 ? '在岗 ' + x.h + ' 小时' : '没有打卡'}"><i style="height:${x.h > 0 ? Math.max(2, Math.round(Math.min(x.h, 16) / 16 * 43)) : 0}px"></i><em class="m-${m[1]}">${m[0]}</em></div>`;
  }).join('')}</div></div>`;
}
function tagsCell(r) {
  const l = r.tags, cut = l.length > 5 ? 4 : 5;
  return `<div class="g tg">${l.length ? l.slice(0, cut).map(([t, c]) => `<p><span class="tag t-${c}">${esc(t)}</span></p>`).join('') + (l.length > cut ? `<p class="dim">还有 ${l.length - cut} 条，点详情看</p>` : '') : '<p class="na">无</p>'}</div>`;
}
// 示例数据的格子：这个人没有示例数据时整格显示"—"
const xCell = (g, e, head, name) => `<div class="g${e ? '' : ' wt'}"><p class="h">${e ? head(e) : name + ': —'}</p><div class="l">${linesOf(g).map(l => ln(l[1], e ? l[2](e) : '')).join('')}</div></div>`;
function cellOf(g, r) {
  switch (g.k) {
    case 'person': return `<div class="g"><p class="h pn" data-emp="${esc(r.id)}" title="看这个人的档案">${avatar(r)}<b>${esc(r.name)}</b>${typeTag(r)}</p><div class="l">${linesOf(g).map(l => ln(l[1], l[2](r))).join('')}</div></div>`;
    case 'week': return weekCell(r);
    case 'sel': return r.range ? aggCell(r.range) : dayCell(r.day);
    case 'today': return `<div class="g">${todayHead(r.today)}<div class="l">${linesOf(g).map(l => ln(l[1], l[2](r.today))).join('')}</div></div>`;
    case 'yest': return dayCell(r.yest);
    case 'month': return aggCell(r.month);
    case 'tags': return tagsCell(r);
    case 'work': return xCell(g, r.x, e => `业绩达成: ${e.perf.rate}%${tag(e.perf.grade, GRADE[e.perf.grade])}${e.perf.decline ? '<span class="sub">连续下降</span>' : ''}`, '业绩达成');
    case 'talent': return xCell(g, r.x, e => tag(e.level, LEVEL[e.level]) + (e.training ? `<span class="sub">${esc(e.training)}</span>` : ''), '人才等级');
  }
}
function headOf(g, d) {
  const sm = t => `<small>${t}</small>`;
  switch (g.k) {
    case 'week': return g.t + sm(g.one);
    case 'sel': return d.kind === 'range' ? '所选时段' + sm(`${md(d.from)} 至 ${md(d.to)}`) : '所选日期' + sm(`${md(d.from)} 周${weekday(d.from)}`);
    case 'today': return g.t + sm(`${md(d.today)} 截至 ${clock(d.now)}`);
    case 'yest': return g.t + sm(`${md(d.yest)} 周${weekday(d.yest)}`);
    case 'month': return g.t + sm(d.monthStart > d.yest ? '今天 1 号，明天起有数' : `${md(d.monthStart)} 至 ${md(d.yest)}`);
    case 'work': case 'talent': return g.t + `<span class="wb">${X ? '示例' : '待接入'}</span>`;
    default: return g.t;
  }
}

function pass(r) {
  const f = state.f, m = r.month;
  if (f.dept && r.dept !== f.dept) return false;
  if (f.post && r.post !== f.post) return false;
  if (f.type && r.type !== f.type) return false;
  if (f.rule && r.rule !== f.rule) return false;
  if (f.att && r.sel.st !== f.att) return false;
  if (f.mlate && m.lateN < +f.mlate) return false;
  if (f.mot && !(f.mot === '0' ? m.otSec > 0 : m.otSec >= +f.mot * H)) return false;
  if (f.tenure && !(r.tenure != null && (f.tenure === 'a' ? r.tenure < 12 : f.tenure === 'b' ? r.tenure >= 12 && r.tenure < 36 : r.tenure >= 36))) return false;
  if (f.mgr && r.leader !== f.mgr) return false;
  // 入职时间的两头填反了也照样当一段时间算
  const [jf, jt] = f.jf && f.jt && f.jf > f.jt ? [f.jt, f.jf] : [f.jf, f.jt];
  if (jf && !(r.join && r.join >= jf)) return false;
  if (jt && !(r.join && r.join <= jt)) return false;
  const k = (f.kw || '').trim().toLowerCase();
  return !k || r.name.toLowerCase().includes(k) || String(r.no || '').toLowerCase().includes(k);
}
function renderTable() {
  const d = D;
  if (!d) return;
  let list = d.rows.filter(QUICK.find(q => q[0] === state.quick)[2]);
  if (state.metric) list = list.filter(metricFn(state.metric));
  list = list.filter(pass);
  const so = SORTS.find(s => s[0] === state.sort) || SORTS[0], none = v => v == null || v === '';
  // 没有值的排最后；值相同时保持"异常优先"的先后
  if (so[2]) list = [...list].sort((a, b) => { const p = so[2](a), q = so[2](b); return none(p) || none(q) ? none(p) - none(q) : (typeof p === 'string' ? p.localeCompare(q, 'zh') : p - q) * state.dir; });
  R = list;
  const hasSel = d.rows.some(r => r.range || r.day);
  shown = GROUPS.filter(g => g.auto ? hasSel : groupOn(g));
  const pages = Math.max(1, Math.ceil(list.length / state.size));
  state.page = Math.min(Math.max(1, state.page), pages);
  const start = (state.page - 1) * state.size;
  $('#twrap table').style.minWidth = 40 + sum(shown, g => g.w) + 56 + 'px';
  $('#cg').innerHTML = '<col style="width:40px">' + shown.map(g => `<col style="width:${g.w}px">`).join('') + '<col style="width:56px">';
  $('#thead').innerHTML = '<th class="k-no">序号</th>' + shown.map(g => `<th class="k-${g.k}">${headOf(g, d)}</th>`).join('') + '<th class="k-op">操作</th>';
  $('#tbody').innerHTML = list.length
    ? list.slice(start, start + state.size).map((r, n) => `<tr><td class="k-no">${start + n + 1}</td>${shown.map(g => `<td class="k-${g.k}">${cellOf(g, r)}</td>`).join('')}<td class="k-op"><button class="lk" data-emp="${esc(r.id)}" aria-label="${esc(r.name)}的详情">详情</button></td></tr>`).join('')
    : `<tr class="empty-row"><td colspan="${shown.length + 2}">没有符合条件的人员</td></tr>`;
  $('#count').textContent = $('#count2').textContent = `共 ${list.length} 条`;
  // 筛选条件收起来的时候，标题旁边写上现在有几个条件在起作用
  const active = Object.values(state.f).filter(v => String(v || '').trim()).length;
  $('#filterN').hidden = !active;
  $('#filterN').textContent = active;
  const lab = state.metric && document.querySelector(`[data-metric="${state.metric}"]`);
  $('#drill').innerHTML = lab ? `<span class="drill">名单：${lab.dataset.label}<button data-clear="metric" title="清除">✕</button></span>` : '';
  const nums = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1) : state.page <= 4 ? [1, 2, 3, 4, 5, 0, pages] : state.page >= pages - 3 ? [1, 0, pages - 4, pages - 3, pages - 2, pages - 1, pages] : [1, 0, state.page - 1, state.page, state.page + 1, 0, pages];
  $('#pager').innerHTML = `<select class="sel" id="pageSize" aria-label="每页条数">${[20, 50, 100].map(s => `<option value="${s}"${s === state.size ? ' selected' : ''}>${s}条/页</option>`).join('')}</select>`
    + `<button class="pb nv" data-pg="${state.page - 1}" aria-label="上一页"${state.page === 1 ? ' disabled' : ''}>${ic('left', 14, 2.6)}</button>`
    + nums.map(n => n ? `<button class="pb${n === state.page ? ' on' : ''}" data-pg="${n}"${n === state.page ? ' aria-current="page"' : ''}>${n}</button>` : '<span class="dots">···</span>').join('')
    + `<button class="pb nv nx" data-pg="${state.page + 1}" aria-label="下一页"${state.page === pages ? ' disabled' : ''}>${ic('right', 16, 2.6)}</button>`
    + `<span class="jl">跳至</span><input id="jump" value="${state.page}" inputmode="numeric" aria-label="跳到第几页"><span>页</span>`;
  markScroll();
}
// 表格左右滑的时候，左边两列和右边的操作列不动。哪一边还有内容压在固定列下面，就标出来，样式里在那条边上淡出一截
function markScroll() { const w = $('#twrap'), over = w.scrollWidth - w.clientWidth; w.classList.toggle('under-l', w.scrollLeft > 1); w.classList.toggle('under-r', over - w.scrollLeft > 1); }
$('#twrap').addEventListener('scroll', markScroll);

/* ---------- 导出：当前筛选和排序下的名单，一人一行，Excel 可以直接打开 ---------- */
function exportCsv() {
  const hr = s => s > 0 ? hrs(s) : '', mi = s => s > 0 ? Math.round(s / 60) : '', tm = v => v == null ? '' : clock(v), dm = v => v == null ? '' : hmOf(v);
  // 某一天的几列、一段时间累计的几列。昨日和本月各用一次；选了别的日期或时段时，表格里多出来的那一组也照样导出
  const dayCols = (pre, of) => { const Y = f => r => of(r) ? f(of(r)) : '';
    return [[pre + '状态', r => ST[of(r) ? of(r).st : ''][0]], [pre + '上班', Y(y => dm(y.on))], [pre + '下班', Y(y => dm(y.off))], [pre + '迟到(分钟)', Y(y => mi(y.lateSec))], [pre + '加班(小时)', Y(y => hr(y.ot))], [pre + '工时(小时)', Y(y => hr(y.reg))], [pre + '在岗(小时)', Y(y => hr(y.span))]]; };
  const aggCols = (pre, of) => { const A = f => r => f(of(r));
    return [[pre + '出勤(天)', A(a => a.present)], [pre + '应出勤(天)', A(a => a.due)], [pre + '迟到(次)', A(a => a.lateN)], [pre + '迟到(分钟)', A(a => Math.round(a.lateSec / 60))], [pre + '加班(次)', A(a => a.otN)], [pre + '加班(小时)', A(a => hrs(a.otSec))],
      [pre + '请假(次)', A(a => a.leaveN)], [pre + '缺勤(天)', A(a => a.absentN)], [pre + '累计工时(小时)', A(a => hrs(a.reg))], [pre + '在岗(小时)', A(a => hrs(a.span))]]; };
  const cols = [['姓名', r => r.name], ['工号', r => r.no], ['部门', r => r.dept], ['小组', r => r.team], ['岗位', r => r.post], ['用工类型', r => r.type], ['入职时间', r => r.join], ['工龄(月)', r => r.tenure ?? ''], ['主管', r => r.leader], ['考勤规则', r => RULE[r.rule]],
    ...(!shown.includes(G.sel) ? [] : D.kind === 'range' ? aggCols('所选时段', r => r.range) : dayCols('所选日期', r => r.day)),
    ['今日状态', r => ST[r.today.st][0]], ['今日班次', r => r.today.shift], ['今日上班', r => tm(r.today.on)], ['今日下班', r => tm(r.today.off)], ['今日迟到(分钟)', r => mi(r.today.lateSec)], ['今日加班(小时)', r => hr(r.today.otL)], ['今日在岗(小时)', r => hr(r.today.span)],
    ...dayCols('昨日', r => r.yest), ...aggCols('本月', r => r.month), ['连续出勤(天)', r => r.streak], ['提醒', r => r.tags.map(t => t[0]).join('；')]];
  // 示例数据的几列放在最后，表头写明是示例
  const E = f => r => r.x ? f(r.x) ?? '' : '';
  if (X) cols.push(['业绩达成率%（示例）', E(e => e.perf.rate)], ['绩效等级（示例）', E(e => e.perf.grade)], ['工作进度%（示例）', E(e => e.work.progress)], ['任务完成率%（示例）', E(e => e.work.taskRate)], ['工作质量%（示例）', E(e => e.perf.quality)],
    ['人才等级（示例）', E(e => e.level)], ['能力评分（示例）', E(e => e.ability.score)], ['人效指数（示例）', E(e => e.eff)]);
  const text = csv([cols.map(c => c[0]), ...R.map(r => cols.map(c => c[1](r)))]);
  const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = `人员数据中心_${D.from}_${D.to}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`已导出 ${R.length} 人`);
}

/* ---------- 分析报告、口径说明 ---------- */
function openReport() {
  const d = D, k = d.kpi, rows = d.rows, T = d.kind === 'today', u = d.kind === 'range' ? ' 人次' : ' 人', by = new Map();
  for (const r of rows) { const n = r.dept || '未分到部门'; by.set(n, [...(by.get(n) || []), r]); }
  const names = [...d.allDepts.filter(n => by.has(n)), ...[...by.keys()].filter(n => !d.allDepts.includes(n))];
  const line = (n, l) => { const due = sum(l, r => r.sel.due - (r.sel.before || 0)), sn = sum(l, r => r.sel.spanN); return `<tr><td>${esc(n)}</td><td class="num">${l.length}</td><td class="num">${due ? (sum(l, r => r.sel.present) / due * 100).toFixed(1) + '%' : '—'}</td><td class="num">${l.filter(r => r.sel.lateN > 0).length}</td><td class="num">${r1(sum(l, r => r.sel.otSec) / H)}</td><td class="num">${sn ? r1(sum(l, r => r.sel.span) / sn / H) : '—'}</td><td class="num">${l.filter(r => r.flags.includes('streak')).length}</td><td class="num">${l.filter(r => r.flags.length).length}</td></tr>`; };
  const title = `AI分析报告 · 考勤（${periodLabel()}）`;
  $('#modal').innerHTML = `<div class="md-hd"><h2>${title}</h2>${xBtn()}</div><div class="md-bd">`
    + `<div class="rep"><h3>总体</h3><p style="margin-bottom:0">在职 ${k.total} 人，应到 ${k.due}${u}、实到 ${k.present}${u}，出勤率 ${k.rate == null ? '—' : k.rate.toFixed(1) + '%'}；迟到 ${k.lateN} 人、加班 ${k.otN} 人、请假 ${k.leaveN} 人、${T ? '未到岗' : '缺勤'} ${k.absentN} 人。</p></div>`
    + AI.map(([key, t, , c]) => { const l = rows.filter(r => r.flags.includes(key)); return `<div class="rep"><h3><span class="chip c-${c}">${t} ${l.length}人</span><button class="btn" data-drill="ai:${key}">在名单中查看</button></h3><p>口径：${aiRule(key, d.rules)}。</p><div class="names">${l.map(r => `<button data-emp="${esc(r.id)}">${esc(r.name)}<i>${esc([r.dept, r.post].filter(Boolean).join(' · '))}</i></button>`).join('') || '<span class="note">现在没有符合的人</span>'}</div></div>`; }).join('')
    + `<div class="rep"><h3>部门对比</h3><p>按「${periodLabel()}」算。异常人数是六个提醒里中了任意一个的人数。</p><table class="mt"><thead><tr><th>部门</th><th class="num">人数</th><th class="num">出勤率</th><th class="num">迟到人数</th><th class="num">加班小时</th><th class="num">人均在岗小时</th><th class="num">连续工作人数</th><th class="num">异常人数</th></tr></thead><tbody>${names.map(n => line(n, by.get(n))).join('')}</tbody></table></div>`
    + '<p class="note" style="margin:12px 0 0">这一版的提醒是按固定口径从考勤数据里算出来的，没有用大模型，也不评价一个人工作好坏；每条口径见「口径说明」。重要人员决策由负责人确认。业绩、人才方面的提醒在 <a class="lk" href="#/analysis/signals">AI人才分析</a>。</p></div>';
  openLayer('modal', title);
}
// 口径说明只有文字、没有可以点的东西，所以让正文自己能接住焦点，键盘才滚得动
function openRules() {
  $('#modal').innerHTML = `<div class="md-hd"><h2>口径说明</h2>${xBtn()}</div><div class="md-bd doc" tabindex="0">${rulesDoc(src.ds, X, src.sync)}</div>`;
  openLayer('modal', '口径说明');
}

/* ---------- 显示指标 / 自定义列 ---------- */
function renderPop() {
  const item = (key, t) => `<label><input type="checkbox" data-col="${key}"${vis.has(key) ? ' checked' : ''}>${t}</label>`;
  $('#pop').innerHTML = '<h2>显示指标 / 自定义列</h2><p class="note" style="margin:0 0 2px">勾组名整组开关，勾单项只动这一行。选了别的日期时，表格会自动多出「所选时段」一组。</p>'
    + GROUPS.filter(g => !g.auto).map(g => `<div class="g"><label class="gt"><input type="checkbox" data-grp="${g.k}"${groupOn(g) ? ' checked' : ''}${g.k === 'person' ? ' disabled' : ''}>${g.t}${g.x ? (X ? '（示例）' : '（待接入）') : ''}</label><div>${g.lines ? g.lines.map(l => item(g.k + '.' + l[0], l[1])).join('') : item(g.k, g.one)}</div></div>`).join('')
    + '<div class="ft"><button class="btn" id="colAll">全部显示</button><button class="btn" id="colReset">恢复默认</button><button class="btn pri" data-close>完成</button></div>';
}
// 列设置贴着打开它的那个按钮放，放不下就往窗口里收。窗口变了大小要重放一次，不然它会留在窗口外面
function placePop() {
  const p = $('#pop'), b = $('#' + p.dataset.by).getBoundingClientRect(), h = p.offsetHeight;
  p.style.left = Math.max(12, Math.min(b.right - p.offsetWidth, innerWidth - p.offsetWidth - 12)) + 'px';
  p.style.top = (b.bottom + 6 + h > innerHeight - 8 ? Math.max(8, innerHeight - h - 8) : b.bottom + 6) + 'px';
}
function togglePop(btn) {
  const p = $('#pop');
  if (!p.hidden && p.dataset.by === btn.id) return closeAll();
  renderPop(); openLayer('pop', '显示指标和自定义列', false); p.dataset.by = btn.id;
  placePop();
}

/* ---------- 交互 ---------- */
const again = () => { if (!D) return; state.page = 1; renderKpis(); renderAi(); renderQuick(); renderTable(); };   // 只是筛选变了，不重算
const setPeriod = (p, from = '', to = '') => { state.p = p; state.from = from; state.to = to; state.page = 1; load(); };
// 筛选面板、常用筛选、名单、排序都放回默认。右上角的时段和范围不在这里面
function resetFilters() {
  Object.assign(state, { f: {}, quick: 'all', metric: null, sort: 'score', dir: -1 });
  $$('[data-f]').forEach(x => { x.value = ''; if (x.id.startsWith('fJoin')) x.type = 'text'; });
}

// 指标卡、提醒、常用筛选、名单标签、分页条都是整块重画的：用过一次，原来有焦点的那个控件就换成了新的，焦点会掉。
// 所以每次处理完点击、改值、按键，焦点要是因此掉了，就按下面认出来的"同一个控件"放回去；那个控件不能点了（翻到头的箭头）就放到当前页码上
const keyOf = el => !el?.dataset ? '' : el.id ? '#' + el.id : el.dataset.metric ? `[data-metric="${el.dataset.metric}"]` : el.dataset.quick ? `[data-quick="${el.dataset.quick}"]` : el.hasAttribute('data-clear') ? `[data-metric="${state.metric}"]`
  : el.matches('.pb.nx') ? '#pager .nx' : el.matches('.pb.nv') ? '#pager .nv:not(.nx)' : el.matches('.pb') ? '#pager [aria-current]' : '';
const keepFocus = handle => ev => {
  const key = keyOf(document.activeElement);
  handle(ev);
  if (!key || document.activeElement !== document.body) return;
  const el = $(key), to = el && !el.disabled ? el : key.startsWith('#pager') ? $('#pager [aria-current]') : null;
  to?.focus();
  if (to?.id === 'jump') to.select();   // 接着敲数字就是换一个页码，不用先删
};

// 下面三个是这一页自己的点击、改值、按键。人名、关闭、导航这些各页通用的在 app.js 里先处理掉了
export const click = keepFocus(onClick), change = keepFocus(onChange), keydown = keepFocus(onKeydown);
function onClick(ev) {
  const q = s => ev.target.closest(s);
  let el;
  if ((el = q('#btnCols') || q('#btnMetrics'))) return togglePop(el);
  if (q('#aiMore')) return D && openReport();
  if (q('#btnRules')) return D && openRules();
  if ((el = q('[data-drill]'))) { closeAll(); state.metric = el.dataset.drill; return again(); }
  // 列设置每动一下都整块重画，重画完把焦点放回刚才那个控件上
  if (q('#colAll')) { vis = new Set(GROUPS.filter(g => !g.auto).flatMap(keysOf)); saveVis(); renderPop(); $('#colAll').focus(); return renderTable(); }
  if (q('#colReset')) { vis = new Set(DEF); saveVis(); renderPop(); $('#colReset').focus(); return renderTable(); }
  if (q('.pop')) return;
  $('#pop').hidden = true;
  if ((el = q('#seg button'))) setPeriod(el.dataset.p);
  else if ((el = q('[data-metric]'))) { state.metric = state.metric === el.dataset.metric ? null : el.dataset.metric; again(); }
  else if (q('[data-clear]')) { state.metric = null; again(); }
  else if ((el = q('[data-quick]'))) { state.quick = el.dataset.quick; state.page = 1; renderQuick(); renderTable(); }
  else if ((el = q('[data-pg]'))) { if (!el.disabled) { state.page = +el.dataset.pg; renderTable(); $('#twrap').scrollTop = 0; } }
  else if ((el = q('#filterHd'))) el.setAttribute('aria-expanded', !$('#filter').classList.toggle('closed'));
  else if (q('#btnFilter')) { state.page = 1; renderTable(); }
  else if (q('#btnQuery')) { load(); toast('已按现在的数据重新算了一遍'); }
  else if (q('#btnReset')) { resetFilters(); if (D) fillSelects(); again(); }
  else if (q('#btnExport')) { if (D) exportCsv(); }
  else if (q('#sortDir')) { state.dir = -state.dir; fillSelects(); renderTable(); }
}
function onChange(ev) {
  const t = ev.target;
  if (t.dataset.col) { if (t.checked) vis.add(t.dataset.col); else vis.delete(t.dataset.col); saveVis(); renderPop(); renderTable(); $(`#pop [data-col="${t.dataset.col}"]`).focus(); }
  else if (t.dataset.grp) {
    const keys = keysOf(G[t.dataset.grp]);
    keys.forEach(k => vis.delete(k));
    if (t.checked) keys.filter(k => DEF.has(k)).forEach(k => vis.add(k));
    saveVis(); renderPop(); renderTable(); $(`#pop [data-grp="${t.dataset.grp}"]`).focus();
  }
  else if (t.dataset.f) { state.f[t.dataset.f] = t.value; if (t.id === 'fDept') { state.f.post = ''; fillSelects(); } state.page = 1; renderTable(); }
  else if (t.id === 'scopeDept') { state.dept = t.value; state.post = ''; state.page = 1; load(); }
  else if (t.id === 'scopePost') { state.post = t.value; state.page = 1; load(); }
  else if (t.id === 'pageSize') { state.size = +t.value; state.page = 1; renderTable(); }
  // 改了页码就离开这个框，也算数。等焦点落到下一个控件上再重画，重画完焦点还在那个控件上
  else if (t.id === 'jump') setTimeout(keepFocus(() => jump(t)));
  else if (t.id === 'sortBy') { state.sort = t.value; state.dir = SORTS.find(s => s[0] === t.value)[3] ? 1 : -1; state.page = 1; fillSelects(); renderTable(); }
  else if (t.id === 'dFrom' || t.id === 'dTo') {
    let a = $('#dFrom').value, b = $('#dTo').value;
    if (!a || !b) return;
    if (a > b) { if (t.id === 'dFrom') b = a; else a = b; }
    setPeriod('custom', a, b);
    // 实际算的范围和选的不一样时说一声，不悄悄改
    if (D.from !== a || D.to !== b) toast(`按 ${md(D.from)} 至 ${md(D.to)} 算：` + (b >= D.today && D.to < D.today ? '今天的日报企业微信还没生成，跨多天的时段只算到昨天' : `日报只有 ${md(D.minDay)} 到 ${md(D.yest)} 的`));
  }
}
$('#fKw').addEventListener('input', ev => { state.f.kw = ev.target.value; state.page = 1; renderTable(); });
const jump = el => { state.page = parseInt(el.value, 10) || 1; renderTable(); };
function onKeydown(ev) {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'jump') jump(ev.target);
  // 搜到只剩一个人时，回车直接打开这个人的档案
  else if (ev.target.id === 'fKw' && state.f.kw) { if (R.length === 1) openPerson(R[0].id); else toast(R.length ? `有 ${R.length} 个人符合，再多输几个字，或者直接点名字` : '没有找到这个人'); }
}
for (const id of ['fJoinFrom', 'fJoinTo']) { const x = $('#' + id); x.addEventListener('focus', () => { x.type = 'date'; }); x.addEventListener('blur', () => { if (!x.value) x.type = 'text'; }); }
addEventListener('resize', () => { markScroll(); if (!$('#pop').hidden) placePop(); });

/* ---------- 给外框用的两个入口 ---------- */
// 进到这一页。地址里可以带条件：metric 直接看某张指标卡或某个提醒的名单，dept 限定部门，kw 把光标放进关键字
export function enter(q = {}) {
  const metric = q.metric && (Object.hasOwn(METRIC, q.metric) || AI.some(a => 'ai:' + a[0] === q.metric)) ? q.metric : null, dept = q.dept != null && src.ds?.depts.includes(q.dept) ? q.dept : null;
  // 从别处点一个数过来（带着指标或部门）：那个数是按今天算的，所以这一页上次留下的时段、筛选、排序先放回默认，落地的名单才和点的那个数一样多
  if (metric || dept != null) { resetFilters(); Object.assign(state, { p: 'today', from: '', to: '', dept: dept || '', post: '', metric }); }
  state.page = 1;
  load();
  if (q.kw != null) { $('#filter').classList.remove('closed'); $('#fKw').focus(); }
}
// 数据换了一轮：按现在的条件重算
export const update = load;
