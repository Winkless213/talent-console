// 自检和演示用的假企微：接口路径、字段结构和真企微一致，人名是占位名，数据按固定种子生成，不联网。
import { DAY, TZ, dayStart, dayOf, addDays, arr } from './lib.js';

export const MOCK_NOW = dayStart('2026-11-21') + 17 * 3600 + 24 * 60;   // 演示时钟固定在周六 17:24
const H = 3600, M = 60;
const rnd = (a, b, c = 0) => { let x = Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 2246822519) ^ Math.imul(c + 3, 3266489917); x ^= x >>> 15; x = Math.imul(x, 2246822507); x ^= x >>> 13; x = Math.imul(x, 3266489909); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const SUR = '张李王陈刘周黄赵吴徐孙马朱胡郭何林高罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋', NUM = '三四五六七八九十一二';

const DEPTS = [
  { id: 1, name: '演示公司', parentid: 0, order: 100 },
  { id: 2, name: '运营中心', parentid: 1, order: 90 }, { id: 21, name: '运营一组', parentid: 2, order: 9 }, { id: 22, name: '运营二组', parentid: 2, order: 8 }, { id: 23, name: '直播组', parentid: 2, order: 7 },
  { id: 3, name: '客服中心', parentid: 1, order: 80 }, { id: 31, name: '售前组', parentid: 3, order: 9 }, { id: 32, name: '售后组', parentid: 3, order: 8 },
  { id: 4, name: '产品设计部', parentid: 1, order: 70 }, { id: 41, name: '设计组', parentid: 4, order: 9 },
  { id: 5, name: '供应链', parentid: 1, order: 60 }, { id: 51, name: '仓储组', parentid: 5, order: 9 }, { id: 52, name: '采购组', parentid: 5, order: 8 },
  { id: 6, name: '职能部', parentid: 1, order: 50 }, { id: 61, name: '人事行政', parentid: 6, order: 9 }, { id: 62, name: '财务', parentid: 6, order: 8 }
];
// [所在部门, 人数, 岗位, 打卡规则]
const TEAMS = [[21, 9, ['店铺运营', '推广投放'], 'free'], [22, 8, ['店铺运营', '内容运营'], 'free'], [23, 6, ['直播运营', '主播'], 'free'], [31, 8, ['售前客服'], 'shift'], [32, 6, ['售后客服'], 'shift'],
  [41, 7, ['设计师', '摄影师'], 'fixA'], [4, 2, ['商品企划'], 'fixA'], [51, 6, ['仓管', '打包'], 'fixC'], [52, 4, ['采购', '跟单'], 'fixA'], [61, 4, ['人事', '行政'], 'fixB'], [62, 3, ['会计', '出纳'], 'fixB'],
  [1, 1, ['总经理'], 'none'], [6, 2, ['顾问'], 'none']];
// 作息按常见的电商公司来：固定班每天 8 小时、中午休 1 小时、周日休息；客服每 7 天休 2 天；自由上下班每天在岗 8.5 到 10 小时、周一休息
const SECT = { fixA: [[9 * H, 12 * H], [13 * H, 18 * H]], fixB: [[9 * H, 12 * H], [13 * H, 18 * H]], fixC: [[10 * H, 13 * H], [14 * H, 19 * H]], early: [[7.5 * H, 16.5 * H]], night: [[15 * H, 24 * H]] };
const GRACE = { fixA: 600, fixB: 0, fixC: 600, early: 0, night: 0 };
const monSat = [1, 2, 3, 4, 5, 6], noMon = [0, 2, 3, 4, 5, 6], cin = s => s.map(([a, b]) => ({ work_sec: a, off_work_sec: b, remind_work_sec: a - 600, remind_off_work_sec: b }));
const GROUP = {
  free: { groupid: 3, grouptype: 3, groupname: '演示-自由上下班', span_day_time: 7 * H, sync_holidays: false, spe_workdays: [], spe_offdays: [], checkindate: [{ workdays: noMon, checkintime: [] }] },
  fixA: { groupid: 1, grouptype: 1, groupname: '演示-办公室', sync_holidays: false, spe_workdays: [], spe_offdays: [], checkindate: [{ workdays: monSat, checkintime: cin(SECT.fixA), flex_on_duty_time: 600, noneed_offwork: false }] },
  fixB: { groupid: 4, grouptype: 1, groupname: '演示-职能', sync_holidays: true, spe_workdays: [], spe_offdays: [], checkindate: [{ workdays: [1, 2, 3, 4, 5, 6], checkintime: cin(SECT.fixB), flex_on_duty_time: 0, noneed_offwork: false }] },
  fixC: { groupid: 5, grouptype: 1, groupname: '演示-仓储', sync_holidays: false, spe_workdays: [], spe_offdays: [], checkindate: [{ workdays: monSat, checkintime: cin(SECT.fixC), flex_on_duty_time: 600, noneed_offwork: false }] },
  shift: { groupid: 2, grouptype: 2, groupname: '演示-客服排班', spe_workdays: [], spe_offdays: [], checkindate: [],
    schedulelist: [{ schedule_id: 11, schedule_name: '早班', time_section: cin(SECT.early), flex_on_duty_time: 0, max_allow_arrive_late: 0 }, { schedule_id: 12, schedule_name: '晚班', time_section: cin(SECT.night), flex_on_duty_time: 0, max_allow_arrive_late: 0 }] }
};
// 今天和昨天固定安排几个人出状况，保证每种情形演示里都看得到（按人员序号）
const FORCE_TODAY = { 38: 'absent', 47: 'late', 54: 'late', 5: 'nopunch', 57: 'leave', 10: 'leave' }, FORCE_YEST = { 39: 'absent', 6: 'nopunch', 41: 'miss', 48: 'early', 53: 'late' };
const FORCE_X = { absent: 0.001, nopunch: 0.001, miss: 0.03, late: 0.05, early: 0.112, normal: 0.9 };
const BUSY = 20, STREAK = 25;   // 演示用：BUSY 最近一周每天在岗 14.5 小时以上（长期加班、工时异常）；STREAK 是客服，最近 20 天没排休（连续出勤）
const LONG = 50, LONG_DAYS = 8;   // 这个人正在休一段长假，审批是 40 天前提交的：单号不在近 31 天的审批列表里，只能从日报里挂的单号找到
const ROSTER = [{ fieldid: 11, field_name: '员工类型', field_type: 2, value_type: 3, option_list: [{ id: 1, value: '全职' }, { id: 2, value: '实习' }] },
  { fieldid: 12, field_name: '员工状态', field_type: 2, value_type: 3, option_list: [{ id: 1, value: '正式' }, { id: 2, value: '试用' }, { id: 3, value: '待离职' }] },
  { fieldid: 13, field_name: '入职日期', field_type: 3, value_type: 2 }, { fieldid: 14, field_name: '工号', field_type: 1, value_type: 1 }, { fieldid: 15, field_name: '职位', field_type: 1, value_type: 1 }];

export function mockCompany(now = MOCK_NOW) {
  const today = dayOf(now), yest = addDays(today, -1), t0 = dayStart(today), y0 = t0 - DAY;
  const users = [];
  for (const [dept, n, posts, rule] of TEAMS) for (let j = 0; j < n; j++) {
    const k = users.length, lead = j === 0 && dept > 9 && dept !== 52;
    const ago = k === 12 ? 4 : k === 44 ? 9 : 40 + Math.floor(rnd(k, 1) * 1400);
    users.push({ k, id: 'u' + String(k + 1).padStart(3, '0'), name: SUR[k % SUR.length] + NUM[(k + Math.floor(k / SUR.length) * 3) % 10], dept, top: dept > 9 ? Math.floor(dept / 10) : dept, lead,
      post: lead ? posts[0] + '组长' : posts[j % posts.length], rule, join: addDays(today, -ago), joinKnown: k % 10 !== 9, kind: k % 23 === 7 ? 2 : 1, status: k === 30 ? 3 : k % 11 === 5 ? 2 : 1 });
  }
  const leaderOf = d => users.find(u => u.lead && (u.dept === d || (u.top === d && [21, 31, 41, 61].includes(u.dept))));
  for (const u of users) { const l = users.find(x => x.lead && x.dept === u.dept); u.boss = l && l !== u && u.k % 3 !== 0 ? l.id : ''; }
  const byId = new Map(users.map(u => [u.id, u]));
  const OTW = new Set([users.find(u => u.rule === 'fixA' && !u.lead).k, users.find(u => u.rule === 'free' && !u.lead).k]);   // 只有这两个人的规则开了加班
  const longFrom = addDays(today, -4), spNo = (u, date, status) => 'L' + u.id.slice(1) + date.replace(/-/g, '') + status;

  // 某人某天实际发生了什么。日报、今天的打卡、审批、月报都从这里出，互相对得上
  function scenario(u, date) {
    if (date < u.join) return null;
    const t = dayStart(date), dn = Math.round(t / DAY), wd = new Date((t + TZ) * 1000).getUTCDay(), r = n => rnd(u.k, dn, n);
    if (u.rule === 'none') return u.post === '顾问' && u.k % 2 === 0 && r(1) < 0.6 ? { kind: 'norule', n: 2, on: 9.6 * H + Math.floor(r(3) * H), off: 19 * H + Math.floor(r(4) * 2 * H), sect: [], shift: '' } : null;
    const busy = u.k === BUSY && date >= addDays(today, -7), streak = u.k === STREAK && date > addDays(today, -21);
    const restDay = u.rule === 'shift' ? (u.k + dn) % 7 < 2 && !streak : u.rule === 'free' ? wd === 1 && !busy : wd === 0;
    const shift = restDay ? null : u.rule === 'shift' ? (Math.floor((dn + u.k * 3) / 7) % 2 ? 'night' : 'early') : u.rule;
    if (shift === null) return { kind: 'rest', n: 0, sect: [], shift: '' };
    const sect = SECT[shift] || [], free = u.rule === 'free', planOn = free ? null : sect[0][0], planOff = free ? null : sect[sect.length - 1][1];
    const base = { sect, shift, planOn, planOff, n: 0, on: null, off: null };
    const cadence = 6 + u.k % 4, force = (date === today ? FORCE_TODAY : date === yest ? FORCE_YEST : {})[u.k];
    if (u.k === LONG && date >= longFrom && date < addDays(longFrom, LONG_DAYS)) return { ...base, kind: 'leave', leave: '病假', long: true };
    if (force === 'leave' || (!force && !busy && u.k % 9 !== 4 && u.rule !== 'shift' && (dn + u.k * 2) % cadence === 0)) return { ...base, kind: 'leave', leave: u.k % 2 ? '事假' : '调休' };
    const x = force ? FORCE_X[force] : busy || streak ? Math.max(0.2, r(2)) : r(2), prone = u.k % 8 === 3;
    if (!free && x < 0.012) return { ...base, kind: 'absent' };
    if (free && x < 0.02) return { ...base, kind: 'nopunch' };
    const on = free ? Math.floor(9.5 * H + r(3) * 1.2 * H) : planOn - Math.floor(r(3) * 20 * M);
    const stay = r(4) < 0.6 ? 2 + r(5) * 18 : r(4) < 0.9 ? 30 + r(5) * 40 : 70 + r(5) * 50;
    // 自由上下班在岗 8.5 到 10 小时，开了加班的那个人常多待 1.5 小时；BUSY 最近一周每天 14.5 到 15.5 小时
    const off = free ? on + Math.floor(busy ? 14.5 * H + r(4) * H : 8.5 * H + r(4) * 1.5 * H + (OTW.has(u.k) ? 1.5 * H : 0)) : planOff + Math.floor((stay + (u.k % 7 === 2 ? 60 : 0)) * M);
    if (x < 0.04) return { ...base, kind: 'miss', n: 1, on };
    if (!free && x < (prone ? 0.36 : 0.1)) return { ...base, kind: 'late', n: 2, on: planOn + GRACE[shift] + 60 + Math.floor(r(6) * 44 * M), off };
    if (!free && x < (prone ? 0.38 : 0.115)) return { ...base, kind: 'early', n: 2, on, off: planOff - 10 * M - Math.floor(r(6) * 30 * M) };
    return { ...base, kind: 'normal', n: 2, on, off };
  }
  // 企微记的加班：固定班从班次下班算起，自由上下班从满 10 小时算起；不足 30 分钟不记，最多记 4 小时
  const otOf = (u, sc) => { if (!OTW.has(u.k) || sc.n < 2) return 0; const v = Math.min(4 * H, u.rule === 'free' ? sc.off - sc.on - 10 * H : sc.off - sc.planOff); return v >= 30 * M ? v : 0; };

  function report(u, date) {
    const sc = scenario(u, date);
    if (!sc) return null;
    const std = sc.sect.reduce((a, [x, y]) => a + y - x, 0), brk = sc.sect.slice(1).reduce((a, [x], i) => a + x - sc.sect[i][1], 0);
    const rest = sc.kind === 'rest', rt = sc.kind === 'norule' ? 5 : u.rule === 'shift' ? 3 : u.rule === 'free' ? 4 : 1;
    const ex = [1, 2, 3, 4].map(exception => ({ exception, count: 0, duration: 0 }));
    if (sc.kind === 'late') Object.assign(ex[0], { count: 1, duration: sc.on - sc.planOn });
    if (sc.kind === 'early') Object.assign(ex[1], { count: 1, duration: sc.planOff - sc.off });
    if (sc.kind === 'miss' && u.rule !== 'free') ex[2].count = 1;
    if (sc.kind === 'absent') Object.assign(ex[3], { count: 1, duration: std });
    const ot = otOf(u, sc);
    return { base_info: { date: dayStart(date), record_type: rt, name: u.name, name_ex: u.name, departs_name: '演示公司', acctid: u.id, day_type: rest ? 1 : 0,
        rule_info: { groupid: GROUP[u.rule]?.groupid || 0, groupname: GROUP[u.rule]?.groupname || '', scheduleid: u.rule === 'shift' && !rest ? (sc.shift === 'early' ? 11 : 12) : 0,
          schedulename: u.rule === 'shift' ? (rest ? '休息' : sc.shift === 'early' ? '早班' : '晚班') : '', checkintime: sc.sect.map(([a, b]) => ({ work_sec: a, off_work_sec: b })) } },
      summary_info: { checkin_count: sc.n, regular_work_sec: sc.n === 2 ? Math.ceil((sc.off - sc.on - brk) / H) * H : 0, standard_work_sec: sc.kind === 'norule' ? 0 : std, earliest_time: sc.on ?? 0, lastest_time: sc.off ?? sc.on ?? 0 },
      holiday_infos: sc.kind === 'leave' ? [{ sp_number: spNo(u, sc.long ? longFrom : date, 2), sp_title: { data: [{ lang: 'zh_CN', text: '请假1.0天' }] }, sp_description: { data: [{ lang: 'zh_CN', text: '演示' }] } }] : [],
      exception_infos: ex, ot_info: { ot_status: ot ? 1 : 0, ot_duration: ot, exception_duration: [] },
      sp_items: [{ type: 1, vacation_id: 2, count: sc.kind === 'leave' ? 1 : 0, duration: sc.kind !== 'leave' ? 0 : sc.leave === '事假' ? 8 * H : DAY, time_type: sc.leave === '事假' ? 1 : 0, name: sc.leave || '调休' },
        { type: 2, vacation_id: 0, count: sc.kind === 'normal' && rnd(u.k, Math.round(dayStart(date) / DAY), 9) < 0.03 ? 1 : 0, duration: 0, time_type: 0, name: '补卡次数' }] };
  }

  const timed = u => u.rule !== 'free' && u.rule !== 'none';
  function punches(u) {
    const out = [], y = scenario(u, yest), sc = scenario(u, today);
    const rec = (t, type, ex, sch) => ({ userid: u.id, groupname: '演示规则', checkin_type: type, exception_type: ex, checkin_time: t, location_title: '演示园区', location_detail: '演示路 1 号', wifiname: 'DEMO-WIFI', notes: '',
      wifimac: '00:00:00:00:00:00', mediaids: [], lat: 30000000, lng: 120000000, deviceid: 'demo-device', sch_checkin_time: sch, groupid: GROUP[u.rule]?.groupid || 0, schedule_id: 0, timeline_id: 1 });
    if (y?.on != null) out.push(rec(y0 + y.on, '上班打卡', y.kind === 'late' ? '时间异常' : '', timed(u) ? y0 + y.planOn : 0));
    if (y?.off != null) out.push(rec(y0 + y.off, '下班打卡', y.kind === 'early' ? '时间异常' : '', timed(u) ? y0 + y.planOff : 0));
    if (sc?.on != null) out.push(rec(t0 + sc.on, '上班打卡', sc.kind === 'late' ? '时间异常' : '', timed(u) ? t0 + sc.planOn : 0));
    if (sc?.off != null) out.push(rec(t0 + sc.off, '下班打卡', sc.kind === 'early' ? '时间异常' : '', timed(u) ? t0 + sc.planOff : 0));
    if (u.rule === 'free') out.push(rec(t0 + 7 * H - 1, '下班打卡', '未打卡', t0 + 7 * H - 1));
    return out.filter(x => x.checkin_time <= now);
  }

  // 请假审批：每个请假日一张已通过的单；另外造三张今天的：审批中、已驳回、通过后撤销
  const approvals = new Map();
  const leaveForm = (u, date, name, status, days = 1, at = dayStart(date) - 2 * DAY + 10 * H) => ({ sp_no: spNo(u, date, status), sp_name: '请假', sp_status: status, template_id: 'demo', apply_time: at, applyer: { userid: u.id, partyid: '1' },
    apply_data: { contents: [{ control: 'Vacation', id: 'vacation-1', title: [{ text: '请假类型', lang: 'zh_CN' }], value: { vacation: { selector: { type: 'single', options: [{ key: 'option-1', value: [{ text: name, lang: 'zh_CN' }] }] },
      attendance: { type: 1, date_range: { type: name === '事假' ? 'hour' : 'halfday', new_begin: dayStart(date), new_end: dayStart(date) + (days - 1) * DAY + (name === '事假' ? DAY : 12 * H), new_duration: days * (name === '事假' ? 8 * H : DAY) },
        slice_info: { duration: days * DAY, state: 1, day_items: Array.from({ length: days }, (_, i) => ({ daytime: dayStart(date) + i * DAY, duration: DAY })) } } } } },
      { control: 'Textarea', id: 'item-2', title: [{ text: '请假事由', lang: 'zh_CN' }], value: { text: '演示事由，页面不取' } }] } });
  const add = f => approvals.set(f.sp_no, f);
  for (const u of users) for (let i = -30; i <= 1; i++) { const d = addDays(today, i), sc = scenario(u, d); if (sc?.kind === 'leave' && !sc.long) add(leaveForm(u, d, sc.leave, 2)); }
  add(leaveForm(users[LONG], longFrom, '病假', 2, LONG_DAYS, t0 - 40 * DAY));
  const todays = k => users.filter(u => scenario(u, today)?.kind === k);
  const pendingUser = todays('absent')[0] || todays('nopunch')[0], workers = todays('normal');
  if (pendingUser) add(leaveForm(pendingUser, today, '事假', 1));
  if (workers[0]) add(leaveForm(workers[0], today, '调休', 3));
  if (workers[1]) add(leaveForm(workers[1], today, '调休', 6));

  function monthly(u, from, to) {
    const s = { work_days: 0, regular_days: 0, except_days: 0, rest_days: 0, regular_work_sec: 0, standard_work_sec: 0 }, late = { exception: 1, count: 0, duration: 0 }, absent = { exception: 4, count: 0, duration: 0 };
    let ot = 0, leave = 0, any = false;
    for (let d = from; d <= to && d < today; d = addDays(d, 1)) {
      const e = report(u, d);
      if (!e) continue;
      any = true;
      const b = e.base_info, x = e.summary_info, ex = e.exception_infos.filter(v => v.count > 0);
      if (b.day_type === 1) s.rest_days++; else if (b.record_type !== 5) { s.work_days++; if (ex.length) s.except_days++; else s.regular_days++; }
      s.regular_work_sec += x.regular_work_sec; s.standard_work_sec += x.standard_work_sec;
      late.count += e.exception_infos[0].count; late.duration += e.exception_infos[0].duration; absent.count += e.exception_infos[3].count; absent.duration += e.exception_infos[3].duration;
      ot += e.ot_info.ot_duration; leave += e.sp_items[0].count;
    }
    return any ? { base_info: { acctid: u.id, name: u.name, name_ex: u.name, departs_name: '演示公司', record_type: 1 }, summary_info: s, exception_infos: [late, absent],
      sp_items: [{ type: 1, vacation_id: 2, count: leave, duration: leave * DAY, time_type: 0, name: '调休' }], overwork_info: { workday_over_sec: ot, holidays_over_sec: 0, restdays_over_sec: 0 } } : null;
  }

  const calls = {};
  async function raw(path, query, body) {
    calls[path] = (calls[path] || 0) + 1;
    const list = arr(body?.useridlist).map(id => byId.get(id)).filter(Boolean), ok = o => ({ errcode: 0, errmsg: 'ok', ...o });
    switch (path) {
      case 'gettoken': return ok({ access_token: 'mock', expires_in: 7200 });
      case 'department/list': return ok({ department: DEPTS.map(d => ({ ...d, department_leader: leaderOf(d.id) ? [leaderOf(d.id).id] : [] })) });
      case 'user/list': { const id = Number(query.department_id); return ok({ userlist: users.filter(u => u.dept === id || u.top === id).map(u => { const ds = u.dept === u.top ? [u.top] : [u.top, u.dept];
        return { userid: u.id, name: u.name, position: u.k % 13 === 6 ? '' : u.post, main_department: u.top, department: ds, direct_leader: u.boss ? [u.boss] : [], is_leader_in_dept: ds.map(d => +(leaderOf(d) === u)), status: 1 }; }) }); }
      case 'hr/get_fields': return ok({ group_list: [{ field_list: ROSTER }] });
      case 'hr/get_staff_info': { const u = byId.get(body.userid); if (!u) return { errcode: 60111, errmsg: 'userid not found' };
        return ok({ field_info: [{ fieldid: 11, sub_idx: 0, result: 1, value_type: 3, value_uint32: u.kind }, { fieldid: 12, sub_idx: 0, result: 1, value_type: 3, value_uint32: u.status },
          { fieldid: 13, sub_idx: 0, result: 1, value_type: 2, value_uint64: u.joinKnown ? dayStart(u.join) : 0 }, { fieldid: 14, sub_idx: 0, result: 3 }, { fieldid: 15, sub_idx: 0, result: 1, value_type: 1, value_string: u.post }] }); }
      case 'checkin/getcheckin_daydata': { const datas = []; for (const u of list) for (let t = body.starttime; t <= body.endtime; t += DAY) { const e = dayOf(t) < today ? report(u, dayOf(t)) : null; if (e) datas.push(e); } return ok({ datas }); }
      case 'checkin/getcheckin_monthdata': return ok({ datas: dayOf(body.starttime) < '2026-08-01' ? [] : list.map(u => monthly(u, dayOf(body.starttime), dayOf(body.endtime))).filter(Boolean) });
      case 'checkin/getcheckindata': return ok({ checkindata: list.flatMap(punches).filter(x => x.checkin_time >= body.starttime && x.checkin_time <= body.endtime) });
      case 'checkin/getcheckinschedulist': return ok({ schedule_list: list.filter(u => u.rule === 'shift').map(u => { const d = dayOf(body.starttime), sc = scenario(u, d) || { kind: 'rest' }, rest = sc.kind === 'rest';
        return { userid: u.id, yearmonth: Number(d.slice(0, 7).replace('-', '')), groupid: 2, groupname: GROUP.shift.groupname, schedule: { scheduleList: [{ day: Number(d.slice(8)),
          schedule_info: rest ? { schedule_id: 0, schedule_name: '休息', time_section: [] } : { schedule_id: sc.shift === 'early' ? 11 : 12, schedule_name: sc.shift === 'early' ? '早班' : '晚班', time_section: cin(SECT[sc.shift]) } }] } }; }) });
      case 'checkin/getcheckinoption': return ok({ info: list.filter(u => u.rule !== 'none').map(u => ({ userid: u.id, group: GROUP[u.rule] })) });
      case 'oa/getapprovalinfo': { const f = Object.fromEntries(arr(body.filters).map(x => [x.key, x.value]));
        const all = f.record_type && f.record_type !== '1' ? [] : [...approvals.values()].filter(a => a.apply_time >= Number(body.starttime) && a.apply_time <= Number(body.endtime) && (!f.sp_status || String(a.sp_status) === f.sp_status));
        const at = Number(body.new_cursor) || 0, page = all.slice(at, at + body.size);
        return ok({ sp_no_list: page.map(a => a.sp_no), ...(at + body.size < all.length ? { new_next_cursor: String(at + body.size) } : {}) }); }
      case 'oa/getapprovaldetail': return approvals.has(body.sp_no) ? ok({ info: approvals.get(body.sp_no) }) : { errcode: 301025, errmsg: 'invalid sp_no' };
    }
    return { errcode: 48002, errmsg: 'api forbidden' };
  }
  return { raw, users, scenario, report, calls, today, yest, now, otw: OTW, approvals, long: LONG };
}
