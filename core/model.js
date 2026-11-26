// 核算：把企微取回的原始数据算成页面要的数。纯函数，不联网、不读文件。每条口径在 test/model.test.js 里有对应用例。
import { DAY, TZ, dayStart, dayOf, addDays, arr, r1 } from './lib.js';

// 口径里所有人为定的门槛都在这里，页面"口径说明"直接读这张表
export const RULES = {
  otMinSec: 1800,        // 下班卡比班次下班时间晚满 30 分钟，才算加班（晚走）
  freqLate: 3,           // 本月迟到满 3 次：频繁迟到
  longHours: 14, longDays: 5, longWindow: 7,   // 近 7 天里有 5 天在岗满 14 小时：长期加班
  streakDays: 14,        // 连续出勤满 14 天：连续工作
  restHours: 9,          // 昨日下班到今日上班不足 9 小时：休息不足
  shiftPct: 20, shiftMinDays: 3,               // 近 7 天日均在岗比此前偏离 20%（两段各至少 3 天）：工时异常
  spanDay: 5 * 3600,     // 没有换日设置时，凌晨 5 点前的卡归前一天
  freeOn: 10 * 3600, freeWait: 3600            // 自由上下班：过了本人平时到岗时间 1 小时还没打卡才算未打卡；历史不足 5 天时按 10 点
};
// 国办发明电〔2025〕7号：2026 年放假和调休上班日。只在打卡规则开了"同步法定节假日"时使用
const HOLIDAY_2026 = [['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'], ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07']];
const MAKEUP_2026 = new Set(['01-04', '02-14', '02-28', '05-09', '09-20', '10-10']);
const BIWEEK0 = dayStart('2024-01-01');   // 企微大小周从这一周起算第 1 周
const H = 3600;

const hm = s => String(Math.floor(s / H) % 24).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0');
const sections = l => arr(l).filter(x => Number.isFinite(x?.work_sec) && Number.isFinite(x?.off_work_sec))
  .map(x => ({ on: x.work_sec, off: x.off_work_sec <= x.work_sec ? x.off_work_sec + DAY : x.off_work_sec }));
const sectLabel = s => s.length ? hm(s[0].on) + '-' + hm(s[s.length - 1].off) : '';
const has = l => arr(l).filter(x => x && (x.count > 0 || x.duration > 0));
const sum = (l, f) => l.reduce((a, x) => a + (f(x) || 0), 0);
const mean = l => l.length ? sum(l, x => x) / l.length : 0;
function holiday(day) {   // 放假 false，调休上班 true，其余 null
  if (!day.startsWith('2026-')) return null;
  const d = day.slice(5);
  return MAKEUP_2026.has(d) ? true : HOLIDAY_2026.some(([a, b]) => a <= d && d <= b) ? false : null;
}

// 部门、小组、主管。部门取公司下面第一级；小组取本人所在最深一级；主管先取直属上级，没登记时取所在部门（逐级往上）的负责人
export function buildOrg(depts, people) {
  const byId = new Map(arr(depts).map(d => [d.id, d]));
  const path = id => { const p = [], seen = new Set(); while (byId.has(id) && !seen.has(id)) { seen.add(id); p.push(id); id = byId.get(id).parentid; } return p; };
  const heads = new Map(arr(depts).map(d => [d.id, new Set(arr(d.department_leader).filter(u => people.has(u)))]));
  for (const m of people.values()) for (const d of m.leads || []) heads.get(d)?.add(m.id);
  const byUser = new Map(), used = new Set();
  for (const m of people.values()) {
    const deep = [...m.depts].filter(d => byId.has(d)).sort((a, b) => path(b).length - path(a).length)[0];
    const p = path(byId.has(m.main) ? m.main : deep), root = p[p.length - 1];
    const top = p.length >= 2 && byId.get(root)?.parentid === 0 ? p[p.length - 2] : root;
    const team = deep != null && deep !== top && path(deep).includes(top) ? deep : null;
    let boss = [...m.leaders].find(u => people.has(u) && u !== m.id), src = boss ? 'direct' : '';
    if (!boss) for (const d of path(deep)) { boss = [...(heads.get(d) || [])].find(u => u !== m.id); if (boss) { src = 'dept'; break; } }
    if (top != null) used.add(top);
    byUser.set(m.id, { dept: byId.get(top)?.name || '', team: team == null ? '' : byId.get(team).name || '', leader: boss ? people.get(boss).name : '', leaderSrc: src });
  }
  const order = [...used].sort((a, b) => (byId.get(b).order || 0) - (byId.get(a).order || 0)).map(id => byId.get(id).name || '');
  // 根部门就是公司本身。直接挂在它下面的人，部门一栏就是公司的名字；带上这个名字，页面才认得出这一组不是一个真的部门
  const roots = arr(depts).filter(d => d.parentid === 0);
  return { byUser, depts: order, company: roots.length === 1 ? roots[0].name || '' : '' };
}

// 基础档案：用工类型由花名册"员工类型"和"员工状态"合成；岗位先取通讯录，没有再取花名册
export function profileOf(m, row, today) {
  const v = k => (row?.[k]?.v ?? '') || '';
  const kind = v('员工类型'), status = v('员工状态'), join = v('入职日期');
  const type = kind && kind !== '全职' ? kind : status === '试用' ? '试用期' : kind || status ? '正式工' : '未登记';
  let tenure = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(join) && join <= today) {
    const [y1, m1, d1] = join.split('-').map(Number), [y2, m2, d2] = today.split('-').map(Number);
    tenure = (y2 - y1) * 12 + m2 - m1 - (d2 < d1 ? 1 : 0);
  }
  return { name: m.name, post: m.position || v('职位'), type, leaving: status === '待离职', join, tenure, no: v('工号') };
}

// 一份企微日报 -> 当天记录。迟到、早退、缺卡、旷工、请假、计入工时都直接用企微的判定，不自己重算
export function dayRecord(e, noRule = false) {
  const b = e?.base_info || {}, s = e?.summary_info || {}, rt = b.record_type, n = s.checkin_count || 0, sec = sections(b.rule_info?.checkintime);
  const exc = k => has(e?.exception_infos).filter(x => x.exception === k);
  const late = exc(1), early = exc(2), miss = exc(3), absent = exc(4);
  const leave = has(e?.sp_items).filter(x => x.type === 1).map(x => ({ name: x.name || '请假', sec: x.duration || 0, unit: x.time_type === 0 ? 'day' : 'hour' }));
  const ruled = [1, 3, 4].includes(rt), work = ruled && b.day_type === 0;
  const on = n > 0 ? s.earliest_time : null, off = n > 1 ? s.lastest_time : null;
  const planOff = sec.length ? sec[sec.length - 1].off : null, stay = work && off != null && planOff != null ? off - planOff : 0;
  const otW = e?.ot_info?.ot_duration > 0 ? e.ot_info.ot_duration : 0, otL = !otW && stay >= RULES.otMinSec ? stay : 0;
  let st;
  if (!ruled) st = n > 0 ? (noRule ? 'norule' : 'restwork') : 'none';
  else if (!work) st = n > 0 ? 'restwork' : 'rest';
  else if (absent.length) st = 'absent';
  else if (n === 0) st = leave.length ? 'leave' : 'nopunch';
  else if (miss.length || n === 1) st = 'miss';
  else if (late.length) st = 'late';
  else if (early.length) st = 'early';
  else st = 'normal';
  return { d: dayOf(b.date), st, work, due: work && st !== 'leave', n, on, off, span: off != null ? Math.max(0, off - on) : 0, reg: s.regular_work_sec || 0, std: s.standard_work_sec || 0,
    shift: rt === 3 ? [b.rule_info?.schedulename, sectLabel(sec)].filter(Boolean).join(' ') : rt === 4 ? '自由上下班' : sectLabel(sec),
    lateN: sum(late, x => x.count) || late.length, lateSec: sum(late, x => x.duration), earlyN: sum(early, x => x.count) || early.length, earlySec: sum(early, x => x.duration),
    missN: sum(miss, x => x.count) || miss.length || (st === 'miss' ? 1 : 0), otW, otL, ot: otW || otL, leave, fix: sum(has(e?.sp_items).filter(x => x.type === 2), x => x.count) };
}

// 往月月报 -> 月度汇总（档案里的近几个月趋势用）
export function monthRecord(e, ym) {
  const s = e?.summary_info || {}, o = e?.overwork_info || {}, exc = k => has(e?.exception_infos).filter(x => x.exception === k);
  return { ym, due: s.work_days || 0, normal: s.regular_days || 0, except: s.except_days || 0, reg: s.regular_work_sec || 0, lateN: sum(exc(1), x => x.count), lateSec: sum(exc(1), x => x.duration),
    absent: sum(exc(4), x => x.count), ot: (o.workday_over_sec || 0) + (o.restdays_over_sec || 0) + (o.holidays_over_sec || 0), leaveN: sum(has(e?.sp_items).filter(x => x.type === 1), x => x.count) };
}

// 一段时间的累计。应到不含全天请假；缺勤 = 企微判的旷工 + 应到却没有打卡也没有请假
export function aggregate(list) {
  const a = { days: 0, work: 0, due: 0, present: 0, rest: 0, restWork: 0, lateN: 0, lateSec: 0, earlyN: 0, earlySec: 0, missN: 0, absentW: 0, nopunch: 0, absentN: 0, leaveN: 0, leave: {},
    otN: 0, otSec: 0, otWN: 0, otWSec: 0, reg: 0, regN: 0, span: 0, spanN: 0, std: 0, fix: 0 };
  for (const d of list) {
    if (!d) continue;
    a.days++;
    if (d.work) a.work++;
    if (d.due) a.due++;
    if (d.due && d.n > 0) a.present++;
    if (d.st === 'rest') a.rest++;
    if (d.st === 'restwork') a.restWork++;
    a.lateN += d.lateN; a.lateSec += d.lateSec; a.earlyN += d.earlyN; a.earlySec += d.earlySec; a.missN += d.missN;
    if (d.st === 'absent') a.absentW++;
    if (d.st === 'nopunch') a.nopunch++;
    if (d.leave.length) { a.leaveN++; for (const x of d.leave) a.leave[x.name] = (a.leave[x.name] || 0) + 1; }
    if (d.ot > 0) { a.otN++; a.otSec += d.ot; }
    if (d.otW > 0) { a.otWN++; a.otWSec += d.otW; }
    if (d.reg > 0) { a.reg += d.reg; a.regN++; }
    if (d.span > 0) { a.span += d.span; a.spanN++; }
    a.std += d.std; a.fix += d.fix;
  }
  a.absentN = a.absentW + a.nopunch;
  return a;
}

// 某一天按规则要不要上班、几点到几点。固定和自由看规则里的工作日、特殊日期、法定节假日；按班次看当天排班
export function planOf(group, schedule, day) {
  const t0 = dayStart(day), base = { kind: 'none', expected: null, shift: '', on: null, off: null, grace: 0, spanDay: RULES.spanDay, usualOn: null };
  if (!group || ![1, 2, 3].includes(group.grouptype)) return base;
  if (group.grouptype === 2) {
    const ym = Number(day.slice(0, 7).replace('-', '')), dn = Number(day.slice(8));
    const hit = arr(Array.isArray(schedule) ? schedule : schedule ? [schedule] : []).filter(x => Number(x?.yearmonth) === ym)
      .flatMap(x => arr(x.schedule?.scheduleList)).find(x => Number(x?.day) === dn)?.schedule_info;
    if (!hit) return { ...base, kind: 'shift', shift: '未排班' };
    if (Number(hit.schedule_id) === 0) return { ...base, kind: 'shift', expected: false, shift: '休息' };
    const s = sections(hit.time_section), conf = arr(group.schedulelist).find(x => Number(x?.schedule_id) === Number(hit.schedule_id)) || {};
    return { ...base, kind: 'shift', expected: true, shift: [hit.schedule_name, sectLabel(s)].filter(Boolean).join(' '), on: s[0]?.on ?? null, off: s[s.length - 1]?.off ?? null,
      grace: Math.max(conf.flex_on_duty_time || 0, conf.max_allow_arrive_late || 0) };
  }
  const kind = group.grouptype === 1 ? 'fixed' : 'free', wd = new Date((t0 + TZ) * 1000).getUTCDay();
  const inDay = x => x?.timestamp >= t0 && x.timestamp < t0 + DAY, odd = Math.floor((t0 - BIWEEK0) / (7 * DAY)) % 2 === 0;
  const daysOf = d => d?.biweekly?.enable_weekday_recurrence === true ? arr(d.biweekly[odd ? 'odd_workdays' : 'even_workdays']) : arr(d?.workdays);
  const special = arr(group.spe_workdays).find(inDay), usual = arr(group.checkindate).find(d => daysOf(d).includes(wd));
  const hol = group.sync_holidays === true ? holiday(day) : null;
  const expected = arr(group.spe_offdays).some(inDay) ? false : special ? true : hol != null ? hol : !!usual;
  if (kind === 'free') return { ...base, kind, expected, shift: '自由上下班', spanDay: Number.isFinite(group.span_day_time) ? group.span_day_time : RULES.spanDay };
  const src = arr(special?.checkintime).length ? special : usual || arr(group.checkindate)[0], s = expected ? sections(src?.checkintime) : [];
  return { ...base, kind, expected, shift: expected ? sectLabel(s) : '休息', on: s[0]?.on ?? null, off: s[s.length - 1]?.off ?? null, grace: Math.max(src?.flex_on_duty_time || 0, src?.max_allow_arrive_late || 0) };
}

// 今天的实时状态，只用今天的真实打卡、今天的规则和已通过的请假。
// 上一班的下班卡归前一天：有标准时间的下班卡，标准时间不晚于今天 0 点的（班次到零点为止），或者早于今天这一班上班时间的（跨零点的夜班，早上才下班），都是上一班的；
// 没有标准时间的卡（自由上下班）看是否早于企微设置的换日时间
export function todayRecord(plan, punches, leaves, day, now) {
  const t0 = dayStart(day), last = t0 + (plan.expected && plan.on != null ? plan.on - 1 : 0);
  const mine = arr(punches).filter(x => x.t >= t0 && x.t <= now && x.type !== '外出打卡' && !x.ex.some(v => v.includes('未打卡'))
    && !(x.sch != null ? x.type === '下班打卡' && x.sch <= last : x.t - t0 < plan.spanDay)).sort((a, b) => a.t - b.t);
  const typed = mine.some(x => x.type === '上班打卡' || x.type === '下班打卡');
  const on = (typed ? mine.find(x => x.type === '上班打卡') : mine[0]) || null;
  const off = (typed ? [...mine].reverse().find(x => x.type === '下班打卡' && (!on || x.t > on.t)) : mine.length > 1 ? mine[mine.length - 1] : null) || null;
  const late = !!on && on.ex.includes('时间异常') && (on.sch == null || on.t > on.sch), lateSec = late && on.sch != null ? on.t - on.sch : 0;
  const earlySec = off && off.ex.includes('时间异常') && off.sch != null && off.t < off.sch ? off.sch - off.t : 0;
  const ok = arr(leaves).filter(x => x.status === 2), punched = !!(on || off), end = off ? off.t : now;
  const stay = on && plan.expected && plan.off != null ? end - (t0 + plan.off) : 0, otL = stay >= RULES.otMinSec ? stay : 0;
  let st;
  if (punched) st = off ? 'out' : otL ? 'ot' : late ? 'late' : 'in';
  else if (plan.kind === 'none' || plan.expected == null) st = 'none';
  else if (!plan.expected) st = 'rest';
  else if (ok.length) st = 'leave';
  else if (plan.on == null) st = now < t0 + (plan.usualOn ?? RULES.freeOn) + RULES.freeWait ? 'before' : 'nopunch';
  else st = now < t0 + plan.on + plan.grace ? 'before' : 'unsigned';
  return { d: day, st, due: plan.expected === true && st !== 'leave', punched, on: on ? on.t : null, off: off ? off.t : null, span: on ? Math.max(0, end - on.t) : 0, late, lateSec, earlySec, otL,
    shift: plan.shift, leave: [...new Set(ok.map(x => x.name || '请假'))], pending: arr(leaves).some(x => x.status === 1), restWork: punched && plan.expected === false, noRule: punched && plan.kind === 'none' };
}

// 今天的状态换成和"一段时间的累计"相同的字段，指标卡和筛选就只有一套算法
function selOfToday(t) {
  const miss = t.st === 'unsigned' || t.st === 'nopunch' ? 1 : 0;
  return { ...aggregate([]), st: t.st, days: 1, due: +t.due, present: +(t.due && t.punched), lateN: +t.late, lateSec: t.lateSec, earlyN: +(t.earlySec > 0), earlySec: t.earlySec, nopunch: miss, absentN: miss,
    leaveN: +(t.leave.length > 0), leave: Object.fromEntries(t.leave.map(n => [n, 1])), otN: +(t.otL > 0), otSec: t.otL, span: t.span, spanN: +(t.span > 0), restWork: +t.restWork,
    onDuty: +['in', 'late', 'ot'].includes(t.st), before: +(t.st === 'before') };
}
const rangeSt = a => a.absentW ? 'absent' : a.nopunch ? 'nopunch' : a.missN ? 'miss' : a.lateN ? 'late' : a.earlyN ? 'early' : a.present ? 'normal' : a.leaveN ? 'leave' : a.restWork ? 'restwork' : a.rest ? 'rest' : 'none';

// 异常信号：频繁迟到、长期加班、连续工作、休息不足、工时异常。门槛见 RULES
export function signals(p, meta) {
  const { days, yest, monthStart, today } = meta, t = p.today, rec = d => p.days[d];
  const monthLate = sum(days.filter(d => d >= monthStart), d => rec(d)?.lateN) + (t.late ? 1 : 0);
  let streak = t.punched ? 1 : 0;
  for (let i = days.length - 1; i >= 0 && rec(days[i])?.n > 0; i--) streak++;
  const recent = days.slice(-RULES.longWindow), spans = l => l.map(d => rec(d)?.span || 0).filter(v => v > 0);
  const longN = spans(recent).filter(v => v >= RULES.longHours * H).length;
  const y = rec(yest), last = y?.n > 0 ? dayStart(yest) + (y.off ?? y.on) : null, restGap = last != null && t.on != null ? (t.on - last) / H : null;
  const a = spans(recent), b = spans(days.slice(0, -RULES.longWindow));
  const shiftPct = a.length >= RULES.shiftMinDays && b.length >= RULES.shiftMinDays ? r1((mean(a) / mean(b) - 1) * 100) : null;
  return { monthLate, streak, restGap, shiftPct, longN, flags: { att: t.late || t.st === 'unsigned' || t.st === 'nopunch', freqLate: monthLate >= RULES.freqLate, long: longN >= RULES.longDays,
    streak: streak >= RULES.streakDays, rest: restGap != null && restGap < RULES.restHours, shift: shiftPct != null && Math.abs(shiftPct) >= RULES.shiftPct } };
}

function tagsOf(p, yest) {
  const t = p.today, y = p.days[yest], f = p.flags, out = [];
  if (t.st === 'unsigned') out.push(['今日未签到', 'r']);
  if (t.st === 'nopunch') out.push(['今日未打卡', 'o']);
  if (t.late) out.push(['今日迟到' + (t.lateSec ? ' ' + Math.max(1, Math.round(t.lateSec / 60)) + ' 分钟' : ''), 'o']);
  if (t.leave.length) out.push(['今日' + t.leave[0], 'b']);
  if (t.pending) out.push(['请假待审批', 'n']);
  if (f.rest) out.push(['休息不足 ' + r1(p.restGap) + ' 小时', 'r']);
  if (y?.st === 'absent') out.push(['昨日旷工', 'r']);
  if (y?.st === 'nopunch') out.push(['昨日未打卡', 'o']);
  if (y?.st === 'miss') out.push(['昨日缺卡', 'o']);
  if (f.freqLate) out.push(['本月迟到 ' + p.monthLate + ' 次' + (t.late ? '（含今日）' : ''), 'o']);
  if (f.streak) out.push(['连续出勤 ' + p.streak + ' 天', 'p']);
  if (f.long) out.push(['长期加班', 'p']);
  if (f.shift) out.push(['工时' + (p.shiftPct > 0 ? '上升 ' : '下降 ') + Math.abs(Math.round(p.shiftPct)) + '%', 'o']);
  return out;
}

// 自由上下班的人平时几点到岗：近 30 天上班卡时间的中位数，不足 5 天不算
function usualOn(recs) {
  const l = Object.values(recs).filter(d => d.n > 0 && d.on != null).map(d => d.on).sort((a, b) => a - b);
  return l.length >= 5 ? l[Math.floor(l.length / 2)] : null;
}

// raw：{ depts, people, roster:{rows}, plans:{sched, rules}, daily:{days}, punches, leaves, months }，都是 lib.mjs 取回的原样
export function buildDataset(raw, now) {
  const today = dayOf(now), yest = addDays(today, -1), t0 = dayStart(today);
  const days = [...raw.daily.days.keys()].filter(d => d < today).sort(), meta = { today, yest, now, monthStart: today.slice(0, 8) + '01', days };
  const org = buildOrg(raw.depts, raw.people), leaveBy = new Map();
  meta.company = org.company;
  for (const a of arr(raw.leaves)) for (const it of arr(a.items)) {
    if (it.kind !== 1 || ![1, 2].includes(a.status)) continue;
    if (!(it.days.length ? it.days.some(x => x.day === t0 && x.sec > 0) : it.from < t0 + DAY && it.to > t0)) continue;
    if (!leaveBy.has(a.user)) leaveBy.set(a.user, []);
    leaveBy.get(a.user).push({ name: it.name, status: a.status });
  }
  const people = [];
  for (const m of raw.people.values()) {
    const group = raw.plans.rules.get(m.id), recs = {};
    for (const d of days) { const e = raw.daily.days.get(d).get(m.id); if (e) recs[d] = dayRecord(e, !group); }
    const plan = planOf(group, raw.plans.sched.get(m.id), today);
    if (plan.kind === 'free') plan.usualOn = usualOn(recs);
    const p = { id: m.id, ...profileOf(m, raw.roster?.rows?.get(m.id), today), ...org.byUser.get(m.id), rule: plan.kind, days: recs,
      today: todayRecord(plan, raw.punches.get(m.id), leaveBy.get(m.id), today, now),
      months: [...(raw.months || new Map())].filter(([, map]) => map.has(m.id)).map(([ym, map]) => monthRecord(map.get(m.id), ym)).sort((a, b) => a.ym < b.ym ? -1 : 1) };
    Object.assign(p, signals(p, meta));
    p.tags = tagsOf(p, yest);
    people.push(p);
  }
  const count = f => people.filter(f).length, md = days.filter(d => d >= meta.monthStart);
  meta.coverage = { people: people.length, rule: { fixed: count(p => p.rule === 'fixed'), shift: count(p => p.rule === 'shift'), free: count(p => p.rule === 'free'), none: count(p => p.rule === 'none') },
    noJoin: count(p => !p.join), leaderDirect: count(p => p.leaderSrc === 'direct'), leaderDept: count(p => p.leaderSrc === 'dept'), leaderNone: count(p => !p.leader),
    dayFrom: days[0] || '', dayTo: days[days.length - 1] || '', reportYest: count(p => p.days[yest]), leaveToday: count(p => p.today.leave.length), leavePending: count(p => p.today.pending),
    otWecomMonth: count(p => md.some(d => p.days[d]?.otW > 0)), otForms: raw.otForms ?? null, months: [...(raw.months || new Map()).keys()].sort() };
  // 请假单：只留申请人、状态、假别和起止时间，「假勤审批」页面用
  const leaves = arr(raw.leaves).filter(a => raw.people.has(a.user)).map(a => ({ no: a.no, status: a.status, user: a.user, at: a.at,
    items: arr(a.items).filter(it => it.kind === 1).map(it => ({ name: it.name || '请假', from: it.from, to: it.to, unit: it.unit, sec: it.sec })) })).filter(a => a.items.length);
  return { meta, people, depts: org.depts, leaves };
}

// 页面上的时间段 -> 起止日期。近 7 天、本月都只到昨天（今天的日报企微还没出）；每月 1 号的"本月"就是今天；不是日期的一律当今天
export function periodOf(meta, p, from, to) {
  const { today, yest, monthStart } = meta, ok = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(dayStart(v));
  if (p === 'yesterday') return { from: yest, to: yest };
  if (p === 'd7') return { from: addDays(today, -7), to: yest };
  if (p === 'month' && monthStart < today) return { from: monthStart, to: yest };
  if (p === 'custom' && ok(from)) { const b = ok(to) ? to : from; return from <= b ? { from, to: b } : { from: b, to: from }; }
  return { from: today, to: today };
}

// 起止日期收回到有日报的范围里；跨多天的区间不含今天
export function clampSpan(meta, q = {}) {
  const { today, yest, days } = meta, first = days[0] || today, clamp = (v, lo, hi) => !v || v > hi ? hi : v < lo ? lo : v;
  const to = clamp(q.to, first, today), from = clamp(q.from, first, to);
  return { from, to: from !== today && to >= today ? yest : to };
}

const ORDER = (a, b) => b.score - a.score || a.i - b.i;
// 页面一屏要的全部数据。q：{ from, to, dept, post }。今天是实时的；其余日期用日报；跨多天的区间不含今天
export function overview(ds, q = {}) {
  const { today, yest, monthStart, days } = ds.meta, { from, to } = clampSpan(ds.meta, q), isToday = from === today;
  const dates = isToday ? [] : days.filter(d => d >= from && d <= to), single = !isToday && from === to, md = days.filter(d => d >= monthStart), week = days.slice(-7);
  const kind = isToday ? 'today' : single ? 'day' : 'range', showRange = kind === 'range' && !(from === monthStart && to === yest);
  const rows = ds.people.filter(p => (!q.dept || p.dept === q.dept) && (!q.post || p.post === q.post)).map((p, i) => {
    const pick = l => l.map(d => p.days[d]), y = p.days[yest] || null, t = p.today, f = p.flags;
    const range = kind === 'range' ? aggregate(pick(dates)) : null;
    const sel = isToday ? selOfToday(t) : single ? { ...aggregate([p.days[from]]), st: p.days[from]?.st || 'none' } : { ...range, st: rangeSt(range) };
    // 默认排序：所选时段里没到的排最前，其次迟到、缺卡，长期性的信号只在同一档里再分先后
    const score = (isToday ? (t.st === 'unsigned' ? 1000 : 0) + (t.st === 'nopunch' ? 700 : 0) + (t.late ? 600 : 0) + (f.rest ? 400 : 0) : sel.absentW * 1000 + sel.nopunch * 700 + sel.missN * 300 + sel.lateN * 200 + sel.earlyN * 100)
      + (f.freqLate ? 30 : 0) + (f.streak ? 15 : 0) + (f.long ? 15 : 0) + (f.shift ? 10 : 0);
    return { i, id: p.id, name: p.name, no: p.no, dept: p.dept, team: p.team, post: p.post, type: p.type, leaving: p.leaving, join: p.join, tenure: p.tenure, leader: p.leader, leaderSrc: p.leaderSrc, rule: p.rule,
      today: t, yest: y, day: single && from !== yest ? p.days[from] || null : null, month: aggregate(pick(md)), range: showRange ? range : null, sel, week: week.map(d => ({ d, st: p.days[d]?.st || '', h: r1((p.days[d]?.span || 0) / H) })),
      flags: Object.keys(f).filter(k => f[k]), tags: p.tags, streak: p.streak, monthLate: p.monthLate, score };
  }).sort(ORDER);
  const S = f => sum(rows, r => f(r.sel)), C = f => rows.filter(r => f(r.sel)).length, due = S(s => s.due), present = S(s => s.present);
  const leaveBy = {};
  for (const r of rows) for (const n of Object.keys(r.sel.leave)) leaveBy[n] = (leaveBy[n] || 0) + 1;
  // 出勤率的环比：往前同样长的一段
  let prevRate = null;
  if (!isToday) {
    const before = days.filter(d => d < from).slice(-dates.length);
    if (before.length === dates.length && dates.length) {
      const ids = new Set(rows.map(r => r.id)), a = aggregate(ds.people.filter(p => ids.has(p.id)).flatMap(p => before.map(d => p.days[d])));
      prevRate = a.due ? a.present / a.due * 100 : null;
    }
  }
  // 今天的出勤率只算已经到上班时间的人，早上不会因为多数人还没到点而显得很低
  const regN = S(s => s.regN), spanN = S(s => s.spanN), base = due - (isToday ? C(s => s.before) : 0);
  const kpi = { total: rows.length, due, present, rate: base ? present / base * 100 : null, prevRate, lateN: C(s => s.lateN > 0), lateMin: Math.round(S(s => s.lateSec) / 60),
    otN: C(s => s.otSec > 0), otHours: r1(S(s => s.otSec) / H), otWN: C(s => s.otWSec > 0), otWHours: r1(S(s => s.otWSec) / H), leaveN: C(s => s.leaveN > 0), leaveBy,
    absentN: C(s => s.absentN > 0), absentW: C(s => s.absentW > 0), nopunch: C(s => s.nopunch > 0), hours: regN ? r1(S(s => s.reg) / regN / H) : null, inPost: spanN ? r1(S(s => s.span) / spanN / H) : null,
    onDuty: isToday ? C(s => s.onDuty) : null, before: isToday ? C(s => s.before) : null };
  const uniq = l => [...new Set(l.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
  return { kind, from, to, days: dates.length, today, yest, monthStart, minDay: days[0] || today, now: ds.meta.now, kpi, rows, coverage: ds.meta.coverage, rules: RULES,
    allDepts: ds.depts, posts: uniq(ds.people.filter(p => !q.dept || p.dept === q.dept).map(p => p.post)), leaders: uniq(rows.map(r => r.leader)) };
}

// 页面上的时间段（p：today / yesterday / d7 / month / custom）-> 一屏数据。
// tab：这段日期正好等于哪个按钮，页面据此高亮；都对不上为空串
const TABS = ['today', 'yesterday', 'd7', 'month'];
export function overviewFor(ds, q = {}) {
  const meta = ds.meta, p = q.p || 'today';
  const o = overview(ds, { ...periodOf(meta, p, q.from || '', q.to || ''), dept: q.dept || '', post: q.post || '' });
  const same = k => { const r = clampSpan(meta, periodOf(meta, k)); return r.from === o.from && r.to === o.to; };
  return { tab: TABS.includes(p) && same(p) ? p : TABS.find(same) || '', ...o };
}

// 个人考勤档案：基础信息、今天、近 31 天逐日、本月累计、近几个月
export function personDetail(ds, id) {
  const p = ds.people.find(x => x.id === id);
  if (!p) return null;
  const { days, monthStart, yest } = ds.meta, md = days.filter(d => d >= monthStart), cur = aggregate(md.map(d => p.days[d]));
  const { days: recs, ...rest } = p;
  return { ...rest, yest: recs[yest] || null, month: cur, daily: days.slice(-31).map(d => recs[d] || { d, st: '' }), monthStart, rules: RULES,
    trend: [...p.months.map(m => ({ ym: m.ym, hours: r1(m.reg / H), lateN: m.lateN, ot: r1(m.ot / H), absent: m.absent })),
      { ym: monthStart.slice(0, 7), hours: r1(cur.reg / H), lateN: cur.lateN, ot: r1(cur.otWSec / H), absent: cur.absentW, current: true }] };
}
