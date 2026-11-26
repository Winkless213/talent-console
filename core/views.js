// 各模块页面要的汇总数。纯函数：输入数据集 ds（企业微信考勤和组织）和示例数据 x（见 demo.js，接真实企业微信时为 null）。
// 同一个数只在这里算一次，驾驶舱和各模块页面都从这里取，所以互相对得上。
import { DAY, TZ, dayOf, dayStart, r1 } from './lib.js';
import { aggregate, clampSpan, overviewFor, RULES } from './model.js';
import { LEVELS, GRADES, STAGES, DEMO_RULES, FAMILY_NAME } from './demo.js';

const H = 3600, pad = n => String(n).padStart(2, '0'), r2 = v => Math.round(v * 100) / 100;
const sum = (l, f) => l.reduce((a, v) => a + (f(v) || 0), 0), avg = (l, f = v => v) => l.length ? sum(l, f) / l.length : null;
const hm = s => (s >= DAY ? '次日 ' : '') + pad(Math.floor(s / H) % 24) + ':' + pad(Math.floor(s / 60) % 60);   // 当天 0 点起的秒数 -> 时:分
const clock = t => new Date((t + TZ) * 1000).toISOString().slice(11, 16);                                        // 时间戳 -> 时:分（北京时间）
const inDept = dept => p => !dept || p.dept === dept;
const NO_DEPT = '未分到部门';
const deptNames = (ds, people) => [...ds.depts.filter(n => people.some(p => p.dept === n)), ...(people.some(p => !p.dept) ? [NO_DEPT] : [])];
const ofDept = name => p => (p.dept || NO_DEPT) === name;
// 一组人里多数人的直属上级，当作这组的负责人
const leaderOf = people => { const n = {}; for (const p of people) if (p.leader) n[p.leader] = (n[p.leader] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };

// 有示例数据的人（不考勤的总经理、顾问不参与业绩和评价）
export const peopleX = (ds, x, dept = '') => !x ? [] : ds.people.filter(p => x.byId[p.id] && inDept(dept)(p)).map(p => ({ p, x: x.byId[p.id] }));

/* ---------- 人才评价 ---------- */
const perfBand = g => g === 'A' ? 'high' : g === 'C' ? 'low' : 'mid';
export function talentSummary(ds, x, dept = '') {
  const list = peopleX(ds, x, dept), ids = f => list.filter(f).map(v => v.p.id);
  const levels = LEVELS.map(name => { const l = ids(v => v.x.level === name); return { name, n: l.length, ids: l }; });
  const grades = GRADES.map(name => { const l = ids(v => v.x.perf.grade === name); return { name, n: l.length, ids: l }; });
  // 九宫格：行是潜力（高在上），列是绩效（低在左）
  const nine = ['high', 'mid', 'low'].map(pot => ['low', 'mid', 'high'].map(perf => ({ pot, perf, ids: ids(v => v.x.potential === pot && perfBand(v.x.perf.grade) === perf) })));
  return { n: list.length, levels, grades, nine, warn: ids(v => v.x.warn), avgAbility: list.length ? r1(avg(list, v => v.x.ability.score)) : null };
}

/* ---------- 工作与绩效 ---------- */
export function workSummary(ds, x, dept = '') {
  const list = peopleX(ds, x, dept);
  const part = l => {
    const total = sum(l, v => v.x.work.tasks.total), done = sum(l, v => v.x.work.tasks.done), e = l.filter(v => v.x.eff != null), ep = l.filter(v => v.x.effPrev != null);
    return { n: l.length, tasks: { total, done, overdue: sum(l, v => v.x.work.tasks.overdue), rate: total ? r1(done / total * 100) : null }, avgRate: l.length ? r1(avg(l, v => v.x.perf.rate)) : null,
      avgQuality: l.length ? r1(avg(l, v => v.x.perf.quality)) : null, avgProgress: l.length ? Math.round(avg(l, v => v.x.work.progress)) : null, effAvg: e.length ? r2(avg(e, v => v.x.eff)) : null, effPrev: ep.length ? r2(avg(ep, v => v.x.effPrev)) : null };
  };
  const all = part(list);
  const trend = (x?.months || []).map((ym, i) => { const l = list.map(v => v.x.perf.trend[i]).filter(v => v != null); return { ym, rate: l.length ? r1(avg(l)) : null, n: l.length }; });
  const byDept = deptNames(ds, list.map(v => v.p)).map(name => { const s = part(list.filter(v => ofDept(name)(v.p))); return { name, n: s.n, rate: s.avgRate, quality: s.avgQuality, taskRate: s.tasks.rate, overdue: s.tasks.overdue, eff: s.effAvg }; });
  const families = Object.keys(FAMILY_NAME).map(key => ({ key, name: FAMILY_NAME[key], rows: list.filter(v => v.x.family === key) })).filter(f => f.rows.length);
  return { ...all, trend, byDept, families };
}

/* ---------- 六个提醒（AI 人才分析） ---------- */
export function signalsOf(ds, x, dept = '') {
  const P = ds.people.filter(inDept(dept)), X = f => !x ? [] : P.filter(p => x.byId[p.id] && f(x.byId[p.id])).map(p => p.id), R = DEMO_RULES;
  return [
    { k: 'att', name: '考勤异常', tone: 'r', icon: 'alarm', basis: '今天迟到，或者到了上班时间还没有打卡', ids: P.filter(p => p.flags.att).map(p => p.id) },
    { k: 'behind', name: '工作进度滞后', tone: 'o', icon: 'info', basis: `当前工作进度低于 ${R.behind}%`, ids: X(e => e.work.progress < R.behind), demo: true },
    { k: 'decline', name: '业绩下降', tone: 'o', icon: 'info', basis: `近 3 个月目标完成率连续下降，累计降 ${R.declineDrop} 个点以上`, ids: X(e => e.perf.decline), demo: true },
    { k: 'promote', name: '可晋升培养', tone: 'b', icon: 'target', basis: '培养状态为主管储备：绩效和能力持续达标，司龄满 1 年', ids: X(e => e.training === '主管储备'), demo: true },
    { k: 'fit', name: '岗位匹配待优化', tone: 'b', icon: 'target', basis: `能力评分满 ${R.fitAbility}，但绩效为 C 或质量指标低于 ${R.fitQuality}%`, ids: X(e => e.ability.score >= R.fitAbility && (e.perf.grade === 'C' || e.perf.quality < R.fitQuality)), demo: true },
    { k: 'long', name: '长期加班', tone: 'o', icon: 'info', basis: `近 ${RULES.longWindow} 天里有 ${RULES.longDays} 天在岗满 ${RULES.longHours} 小时`, ids: P.filter(p => p.flags.long).map(p => p.id) }
  ];
}

/* ---------- 招聘 ---------- */
export function hireSummary(x) {
  const c = x.candidates, funnel = STAGES.map((stage, i) => ({ stage, n: c.filter(v => v.reach >= i).length }));
  const jobs = x.jobs.map(j => ({ ...j, cands: c.filter(v => v.job === j.id).length, active: c.filter(v => v.job === j.id && v.state === 'active').length }));
  return { funnel, jobs, open: sum(x.jobs.filter(j => j.status === '招聘中'), j => j.headcount - j.filled), active: c.filter(v => v.state === 'active').length, hired: c.filter(v => v.state === 'hired').length,
    interviews: c.filter(v => v.interviewAt).sort((a, b) => a.interviewAt < b.interviewAt ? -1 : 1), channels: [...new Set(c.map(v => v.channel))].map(name => ({ name, n: c.filter(v => v.channel === name).length, hired: c.filter(v => v.channel === name && v.state === 'hired').length })) };
}

/* ---------- 组织 ---------- */
export function orgSummary(ds) {
  const P = ds.people, here = l => l.filter(p => ['in', 'late', 'ot'].includes(p.today.st)).length, types = l => { const t = {}; for (const p of l) t[p.type] = (t[p.type] || 0) + 1; return t; };
  const depts = deptNames(ds, P).map(name => {
    const l = P.filter(ofDept(name)), teamNames = [...new Set(l.map(p => p.team || ''))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'zh'));
    // root：这一组是直接挂在公司下面的人，名字就是公司名，不是和别的部门并排的一个部门
    return { name, root: !!ds.meta.company && name === ds.meta.company, n: l.length, leader: leaderOf(l), here: here(l), types: types(l), teams: teamNames.map(t => { const m = l.filter(p => (p.team || '') === t); return { name: t || '部门直属', n: m.length, leader: leaderOf(m), here: here(m), posts: [...new Set(m.map(p => p.post).filter(Boolean))] }; }) };
  });
  const posts = [...new Set(P.map(p => p.post || ''))].map(name => { const l = P.filter(p => (p.post || '') === name), by = {}; for (const p of l) by[p.dept || NO_DEPT] = (by[p.dept || NO_DEPT] || 0) + 1;
    return { name: name || '未登记岗位', n: l.length, depts: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([d, n]) => ({ name: d, n })), probation: l.filter(p => p.type === '试用期').length }; }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'zh'));
  return { total: P.length, depts, posts, types: types(P), noLeader: P.filter(p => !p.leader).length };
}

/* ---------- 考勤管理 ---------- */
// 每天一行：应到、实到、出勤率和各类异常的人数（只有日报的日子，不含今天）
export function attendanceTrend(ds, dept = '') {
  const P = ds.people.filter(inDept(dept));
  return ds.meta.days.map(d => {
    const recs = P.map(p => p.days[d]).filter(Boolean), a = aggregate(recs), n = f => recs.filter(f).length;
    return { d, due: a.due, present: a.present, rate: a.due ? r1(a.present / a.due * 100) : null, late: n(r => r.lateN > 0), absent: n(r => r.st === 'absent' || r.st === 'nopunch'), miss: n(r => r.missN > 0 && r.st !== 'absent'), leave: n(r => r.leave.length > 0), ot: n(r => r.ot > 0) };
  });
}
// 今天的到岗时间分布：每半小时一档，只数今天打了上班卡的人。from 是当天 0 点起的秒数
export function arrivalHist(ds, dept = '') {
  const t0 = dayStart(ds.meta.today), step = 1800, on = ds.people.filter(inDept(dept)).map(p => p.today.on).filter(v => v != null).map(v => v - t0).sort((a, b) => a - b);
  if (!on.length) return { n: 0, bins: [], median: null };
  const lo = Math.floor(on[0] / step), hi = Math.floor(on[on.length - 1] / step);
  return { n: on.length, bins: Array.from({ length: hi - lo + 1 }, (_, i) => ({ from: (lo + i) * step, n: on.filter(v => Math.floor(v / step) === lo + i).length })), median: on[Math.floor((on.length - 1) / 2)] };
}
const mins = s => Math.max(1, Math.round(s / 60));
const dayWhat =r => [r.st === 'absent' ? '旷工' : r.st === 'nopunch' ? '未打卡' : '', r.missN && r.st !== 'absent' ? `缺卡 ${r.missN} 次` : '', r.lateN ? '迟到 ' + (r.lateSec ? mins(r.lateSec) + ' 分钟' : r.lateN + ' 次') : '', r.earlyN ? '早退 ' + (r.earlySec ? mins(r.earlySec) + ' 分钟' : r.earlyN + ' 次') : ''].filter(Boolean);
const KIND = ['absent', 'unsigned', 'nopunch', 'miss', 'late', 'early'];
// 异常明细：一人一天一行。所选日期是今天时用实时打卡，其余用日报；跨多天的区间不含今天
export function attendanceCases(ds, q = {}) {
  const { today } = ds.meta, { from, to } = clampSpan(ds.meta, q), P = ds.people.filter(inDept(q.dept)), out = [];
  const row = (p, d, kind, what, time, shift, fix = 0) => out.push({ d, id: p.id, name: p.name, dept: p.dept, team: p.team, post: p.post, kind, what, time, shift, fix });
  if (from === today) for (const p of P) {
    const t = p.today, what = [t.st === 'unsigned' ? '未签到' : t.st === 'nopunch' ? '未打卡' : '', t.late ? '迟到' + (t.lateSec ? ' ' + mins(t.lateSec) + ' 分钟' : '') : '', t.earlySec > 0 ? '早退 ' + mins(t.earlySec) + ' 分钟' : ''].filter(Boolean);
    if (what.length) row(p, today, t.st === 'unsigned' || t.st === 'nopunch' ? t.st : t.late ? 'late' : 'early', what, t.on == null ? '' : clock(t.on) + (t.off != null ? ' - ' + clock(t.off) : ''), t.shift);
  }
  else for (const d of ds.meta.days.filter(v => v >= from && v <= to)) for (const p of P) {
    const r = p.days[d], what = r ? dayWhat(r) : [];
    if (what.length) row(p, d, r.st === 'absent' || r.st === 'nopunch' || r.st === 'miss' ? r.st : r.lateN ? 'late' : 'early', what, r.on == null ? '' : hm(r.on) + (r.off != null ? ' - ' + hm(r.off) : ''), r.shift, r.fix);
  }
  return out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0) || KIND.indexOf(a.kind) - KIND.indexOf(b.kind));
}
// 某一天所有人的考勤：今天用实时打卡，其余用日报
export function attendanceDay(ds, day, dept = '') {
  const { today } = ds.meta, base = p => ({ id: p.id, name: p.name, dept: p.dept, team: p.team, post: p.post, rule: p.rule });
  return ds.people.filter(inDept(dept)).map(p => {
    if (day === today) { const t = p.today; return { ...base(p), st: t.st, shift: t.shift, time: t.on == null ? '' : clock(t.on) + ' - ' + (t.off != null ? clock(t.off) : '未下班'), late: t.late, lateSec: t.lateSec, earlySec: t.earlySec, ot: t.otL, reg: null, span: t.span, leave: t.leave, pending: t.pending }; }
    const r = p.days[day];
    if (!r) return { ...base(p), st: '', shift: '', time: '', late: false, lateSec: 0, earlySec: 0, ot: 0, reg: 0, span: 0, leave: [], pending: false };
    return { ...base(p), st: r.st, shift: r.shift, time: r.on == null ? '' : hm(r.on) + (r.off != null ? ' - ' + hm(r.off) : ''), late: r.lateN > 0, lateSec: r.lateSec, earlySec: r.earlySec, ot: r.ot, reg: r.reg, span: r.span, leave: r.leave.map(v => v.name), pending: false };
  });
}
const LEAVE_STATUS = { 1: '审批中', 2: '已通过', 3: '已驳回', 4: '已撤销', 6: '通过后撤销', 7: '已删除', 10: '已支付' };
// 请假单：一段假一行，按开始日期倒序
export function leaveRows(ds, dept = '') {
  const by = new Map(ds.people.map(p => [p.id, p])), out = [];
  for (const a of ds.leaves || []) { const p = by.get(a.user); if (!p || !inDept(dept)(p)) continue;
    for (const it of a.items) out.push({ no: a.no, id: p.id, name: p.name, dept: p.dept, post: p.post, kind: it.name, from: dayOf(it.from), to: dayOf(Math.max(it.from, it.to - 1)), unit: it.unit, days: r1(it.sec / DAY), hours: r1(it.sec / H), status: a.status, statusText: LEAVE_STATUS[a.status] || '状态 ' + a.status, at: a.at ? dayOf(a.at) : '' }); }
  return out.sort((a, b) => a.from < b.from ? 1 : a.from > b.from ? -1 : a.name.localeCompare(b.name, 'zh'));
}

/* ---------- 培养发展 ---------- */
export function trainingSummary(ds, x, dept = '') {
  const by = new Map(ds.people.map(p => [p.id, p])), join = (l, f) => l.map(v => ({ v, p: by.get(v.person) })).filter(({ p }) => p && inDept(dept)(p)).map(f);
  const plans = join(x.plans, ({ v, p }) => ({ id: p.id, name: p.name, dept: p.dept, post: p.post, kind: v.kind, goal: v.goal, mentor: v.mentor || '待分配', progress: v.progress, start: v.start, due: v.due, status: v.status }));
  const names = [...new Set(plans.map(v => v.mentor))];
  const mentors = names.map(name => { const l = plans.filter(v => v.mentor === name); return { name, n: l.length, avg: Math.round(avg(l, v => v.progress)), late: l.filter(v => v.status === '已逾期').length, ids: l.map(v => v.id), none: name === '待分配' }; }).sort((a, b) => a.none - b.none || b.n - a.n || a.name.localeCompare(b.name, 'zh'));
  const outcomes = join(x.outcomes, ({ v, p }) => ({ id: p.id, name: p.name, dept: p.dept, post: p.post, join: p.join, stage: v.stage, result: v.result, date: v.date })).sort((a, b) => a.date < b.date ? 1 : -1);
  return { plans, mentors, outcomes };
}

/* ---------- 企微提醒预览：只生成文字，不发送 ---------- */
export function noticesOf(ds, x) {
  const { today } = ds.meta, out = [], seed = s => { let h = 7; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h % 10; };
  const add = (kind, title, dept, to, basis, text, ids) => out.push({ id: 'N' + (out.length + 1), kind, title, date: today, dept, to: to || '部门负责人', basis, text, ids, status: ['待核实', '待核实', '待核实', '待核实', '待核实', '已预览', '已预览', '已预览', '已处理', '已处理'][seed(title)] });
  for (const name of deptNames(ds, ds.people)) {
    const l = ds.people.filter(p => ofDept(name)(p) && p.flags.att);
    if (l.length) add('考勤', `${name}今日考勤异常 ${l.length} 人`, name, leaderOf(ds.people.filter(ofDept(name))), '今天迟到，或者到了上班时间还没有打卡', `【考勤提醒】${name}今天有 ${l.length} 人迟到或未打卡：${l.map(p => p.name).join('、')}。请核实后在企业微信办理补卡或请假。`, l.map(p => p.id));
  }
  for (const p of ds.people.filter(v => v.flags.streak)) add('关怀', `${p.name} 已连续出勤 ${p.streak} 天`, p.dept, p.leader, `连续 ${RULES.streakDays} 天及以上每天都有打卡`, `【关怀提醒】${p.name} 已连续出勤 ${p.streak} 天，建议和本人确认近期安排，必要时安排调休。`, [p.id]);
  for (const { p, x: e } of peopleX(ds, x)) {
    const t = e.perf.trend.slice(-3);
    if (e.perf.decline) add('业绩', `${p.name} 目标完成率连续下降`, p.dept, p.leader, `近 3 个月：${t.join('% → ')}%`, `【业绩提醒】${p.name}（${p.post}）近 3 个月目标完成率 ${t.join('% → ')}%，建议约一次一对一复盘，确认原因和支持方式。`, [p.id]);
  }
  const late = (x?.tasks || []).filter(v => v.status === 'overdue').map(t => ({ t, p: ds.people.find(v => v.id === t.owner) }));
  for (const name of deptNames(ds, late.map(v => v.p))) {
    const l = late.filter(v => ofDept(name)(v.p));
    add('事项', `${name}有 ${l.length} 项重点事项逾期`, name, leaderOf(ds.people.filter(ofDept(name))), l.map(v => `${v.p.name}：${v.t.name}（应于 ${v.t.due} 完成）`).join('；'),
      `【事项提醒】${name}有 ${l.length} 项重点事项已过期限还没有办结：${l.map(v => `${v.p.name}「${v.t.name}」`).join('、')}。请确认卡点或调整期限。`, [...new Set(l.map(v => v.p.id))]);
  }
  const order = { 待核实: 0, 已预览: 1, 已处理: 2 };
  return out.sort((a, b) => order[a.status] - order[b.status]);
}

/* ---------- 驾驶舱 ---------- */
export function cockpit(ds, x) {
  const o = overviewFor(ds, {}), k = o.kpi, t = x ? talentSummary(ds, x) : null, w = x ? workSummary(ds, x) : null, h = x ? hireSummary(x) : null, tr = x ? trainingSummary(ds, x) : null, sig = signalsOf(ds, x);
  const star = t ? sum(t.levels.filter(l => l.name === '核心人才' || l.name === '优秀人才'), l => l.n) : null, n = key => sig.find(s => s.k === key).ids.length;
  const depts = deptNames(ds, ds.people).map(name => {
    const rows = o.rows.filter(r => (r.dept || NO_DEPT) === name), S = f => sum(rows, r => f(r.sel)), base = S(s => s.due) - S(s => s.before), wd = w?.byDept.find(v => v.name === name);
    return { name, n: rows.length, due: base, present: S(s => s.present), rate: base ? r1(S(s => s.present) / base * 100) : null, lateN: rows.filter(r => r.sel.lateN > 0).length, absentN: rows.filter(r => r.sel.absentN > 0).length, onDuty: S(s => s.onDuty), perf: wd?.rate ?? null, eff: wd?.eff ?? null };
  });
  // 今天要处理的：每一项的地址带着筛选，点进去看到的就是这几条。&dept= 是把那一页的部门范围放回全部，这里的数是全公司的
  const todo = [
    { label: '今日考勤异常', n: n('att'), unit: '人', tone: 'r', go: '#/people?metric=ai:att' },
    { label: '请假待审批', n: leaveRows(ds).filter(r => r.status === 1).length, unit: '张', tone: 'o', go: '#/attendance/leave?ls=1&dept=' },
    { label: '业绩连续下降', n: n('decline'), unit: '人', tone: 'o', go: '#/analysis/signals?k=decline&dept=' },
    { label: '重点事项逾期', n: x ? x.tasks.filter(v => v.status === 'overdue').length : 0, unit: '项', tone: 'o', go: '#/work/tasks?ts=overdue&dept=' },
    { label: '培养计划逾期', n: tr ? tr.plans.filter(v => v.status === '已逾期').length : 0, unit: '个', tone: 'o', go: '#/training/plans?ps=' + encodeURIComponent('已逾期') + '&dept=' },
    { label: '主管评价待确认', n: x ? x.reviews.filter(v => !v.confirmed).length : 0, unit: '份', tone: 'b', go: '#/rating/reviews?rv=todo&dept=' },
    { label: '待进行的面试', n: h ? h.interviews.length : 0, unit: '场', tone: 'b', go: '#/hire/interviews' }
  ].filter(v => v.n > 0);
  return { today: o.today, now: o.now,
    kpi: { total: k.total, rate: k.rate, present: k.present, due: k.due, lateN: k.lateN, absentN: k.absentN, leaveN: k.leaveN, onDuty: k.onDuty, before: k.before, star, eff: w ? w.effAvg : null, effPrev: w ? w.effPrev : null,
      avgRate: w ? w.avgRate : null, open: h ? h.open : null, plans: tr ? tr.plans.filter(v => v.status === '进行中').length : null },
    depts, trend: attendanceTrend(ds), todo, signals: sig.map(s => ({ k: s.k, name: s.name, tone: s.tone, n: s.ids.length, demo: !!s.demo })),
    levels: t ? t.levels.map(l => ({ name: l.name, n: l.n })) : null, grades: t ? t.grades.map(g => ({ name: g.name, n: g.n })) : null, perfTrend: w ? w.trend : null, funnel: h ? h.funnel : null };
}
