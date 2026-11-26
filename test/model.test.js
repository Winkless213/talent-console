// 口径测试：每条核算规则一个用例，再用假企微把"取数 -> 核算 -> 页面数据"整条跑一遍，和假数据的底稿逐人对账。npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, dayStart, addDays, client, fetchPunches } from '../core/lib.js';
import { RULES, dayRecord, monthRecord, aggregate, planOf, todayRecord, signals, buildOrg, profileOf, buildDataset, overview, personDetail, periodOf } from '../core/model.js';
import { mockCompany, MOCK_NOW } from '../core/mock.js';
import { createSync } from '../core/sync.js';

const H = 3600, M = 60, YD = '2026-11-20', TD = '2026-11-21', y0 = dayStart(YD), t0 = dayStart(TD);
const rep = (o = {}) => ({ base_info: { date: y0, record_type: 1, day_type: 0, acctid: 'a', rule_info: { checkintime: [{ work_sec: 9 * H, off_work_sec: 20 * H }] }, ...o.base },
  summary_info: { checkin_count: 2, earliest_time: 8.9 * H, lastest_time: 20.1 * H, regular_work_sec: 12 * H, standard_work_sec: 11 * H, ...o.sum },
  exception_infos: o.ex || [], ot_info: o.ot || { ot_status: 0, ot_duration: 0 }, sp_items: o.sp || [] });
const none = { checkin_count: 0, earliest_time: 0, lastest_time: 0, regular_work_sec: 0 };
const leaveItem = { type: 1, count: 1, duration: DAY, time_type: 0, name: '调休' };

test('日报：正常出勤，工时用企微的数，在岗时长按首末卡算', () => {
  const d = dayRecord(rep());
  assert.deepEqual([d.d, d.st, d.due, d.n, d.reg, d.std, d.shift], [YD, 'normal', true, 2, 12 * H, 11 * H, '09:00-20:00']);
  assert.equal(d.span, Math.round(11.2 * H));
  assert.equal(d.ot, 0, '只晚走 6 分钟不算加班');
});
test('日报：迟到、早退照企微判定，次数为 0 的异常项不算', () => {
  const d = dayRecord(rep({ ex: [{ exception: 1, count: 1, duration: 900 }, { exception: 2, count: 0, duration: 0 }, { exception: 4, count: 0, duration: 0 }] }));
  assert.deepEqual([d.st, d.lateN, d.lateSec, d.earlyN], ['late', 1, 900, 0]);
  assert.equal(dayRecord(rep({ ex: [{ exception: 2, count: 1, duration: 600 }] })).st, 'early');
});
test('日报：旷工算应到未到；全天请假不算应到；自由上下班没打卡没请假记未打卡', () => {
  const absent = dayRecord(rep({ sum: none, ex: [{ exception: 4, count: 1, duration: 11 * H }] }));
  assert.deepEqual([absent.st, absent.due], ['absent', true]);
  const leave = dayRecord(rep({ sum: none, sp: [leaveItem] }));
  assert.deepEqual([leave.st, leave.due, leave.leave[0].name], ['leave', false, '调休']);
  const free = dayRecord(rep({ base: { record_type: 4, rule_info: {} }, sum: none }));
  assert.deepEqual([free.st, free.due, free.shift], ['nopunch', true, '自由上下班']);
  const a = aggregate([absent, leave, free]);
  assert.deepEqual([a.due, a.present, a.absentW, a.nopunch, a.absentN, a.leaveN, a.leave], [2, 0, 1, 1, 2, 1, { 调休: 1 }]);
  assert.equal(a.work, 3, '应出勤天数含请假那天，和企微月报的应出勤一致');
});
test('日报：只打了一次卡算缺卡，不管企微有没有标', () => {
  assert.equal(dayRecord(rep({ base: { record_type: 4, rule_info: {} }, sum: { checkin_count: 1, lastest_time: 8.9 * H, regular_work_sec: 0 } })).st, 'miss');
  const d = dayRecord(rep({ sum: { checkin_count: 1, regular_work_sec: 0 }, ex: [{ exception: 3, count: 1, duration: 0 }, { exception: 1, count: 1, duration: 300 }] }));
  assert.deepEqual([d.st, d.missN, d.lateN, d.span], ['miss', 1, 1, 0]);
});
test('日报：休息日、休息日出勤、没有打卡规则的人', () => {
  assert.deepEqual([dayRecord(rep({ base: { day_type: 1 }, sum: none })).st, dayRecord(rep({ base: { day_type: 1 }, sum: none })).due], ['rest', false]);
  assert.equal(dayRecord(rep({ base: { day_type: 1 } })).st, 'restwork');
  assert.equal(dayRecord(rep({ base: { record_type: 5 } }), false).st, 'restwork');
  const d = dayRecord(rep({ base: { record_type: 5 } }), true);
  assert.deepEqual([d.st, d.due, d.work], ['norule', false, false]);
});
test('日报：有打卡又请了假，按出勤算状态，请假照记', () => {
  const d = dayRecord(rep({ sp: [{ type: 1, count: 1, duration: 2 * H, time_type: 1, name: '事假' }, { type: 2, count: 1, duration: 0, name: '补卡次数' }] }));
  assert.deepEqual([d.st, d.due, d.leave.length, d.leave[0].unit, d.fix], ['normal', true, 1, 'hour', 1]);
});
test('加班：晚走满 30 分钟才算；企微记了加班就用企微的', () => {
  assert.equal(dayRecord(rep({ sum: { lastest_time: 20 * H + RULES.otMinSec - 1 } })).ot, 0);
  const late = dayRecord(rep({ sum: { lastest_time: 20 * H + RULES.otMinSec } }));
  assert.deepEqual([late.ot, late.otL, late.otW], [1800, 1800, 0]);
  const wecom = dayRecord(rep({ sum: { lastest_time: 23 * H }, ot: { ot_status: 1, ot_duration: 2 * H } }));
  assert.deepEqual([wecom.ot, wecom.otL, wecom.otW], [2 * H, 0, 2 * H]);
  assert.equal(dayRecord(rep({ base: { record_type: 4, rule_info: {} }, sum: { lastest_time: 26 * H } })).ot, 0, '自由上下班没有班次，不算晚走');
  assert.equal(dayRecord(rep({ base: { day_type: 1 }, sum: { lastest_time: 23 * H } })).ot, 0, '休息日出勤不按晚走算');
});
test('加班：两段班按最后一段下班时间算；跨零点的班次下班时间按次日算', () => {
  const two = dayRecord(rep({ base: { rule_info: { checkintime: [{ work_sec: 9 * H, off_work_sec: 12 * H }, { work_sec: 13 * H, off_work_sec: 18 * H }] } }, sum: { lastest_time: 19 * H } }));
  assert.deepEqual([two.shift, two.ot], ['09:00-18:00', H]);
  for (const off of [24 * H, 0]) {
    const night = { record_type: 3, rule_info: { schedulename: '晚班', checkintime: [{ work_sec: 15 * H, off_work_sec: off }] } };
    assert.equal(dayRecord(rep({ base: night, sum: { earliest_time: 14.9 * H, lastest_time: 24 * H + 5 * M } })).ot, 0);
    const d = dayRecord(rep({ base: night, sum: { earliest_time: 14.9 * H, lastest_time: 25 * H } }));
    assert.deepEqual([d.ot, d.shift, d.off], [H, '晚班 15:00-00:00', 25 * H]);
  }
});
test('累计：出勤、迟到、加班、工时逐日相加', () => {
  const a = aggregate([dayRecord(rep()), dayRecord(rep({ ex: [{ exception: 1, count: 1, duration: 600 }], sum: { lastest_time: 21 * H } })), dayRecord(rep({ base: { day_type: 1 }, sum: none })), undefined]);
  assert.deepEqual([a.days, a.work, a.due, a.present, a.rest, a.lateN, a.lateSec, a.otN, a.otSec, a.reg, a.regN, a.spanN], [3, 2, 2, 2, 1, 1, 600, 1, H, 24 * H, 2, 2]);
});
test('月报：往月趋势用企微月报的数', () => {
  const m = monthRecord({ summary_info: { work_days: 20, regular_days: 17, except_days: 3, regular_work_sec: 221 * H }, exception_infos: [{ exception: 1, count: 3, duration: 1500 }, { exception: 4, count: 1, duration: 0 }],
    overwork_info: { workday_over_sec: 2 * H, restdays_over_sec: H, holidays_over_sec: 0 }, sp_items: [{ type: 1, count: 2, duration: 2 * DAY, name: '调休' }] }, '2026-10');
  assert.deepEqual(m, { ym: '2026-10', due: 20, normal: 17, except: 3, reg: 221 * H, lateN: 3, lateSec: 1500, absent: 1, ot: 3 * H, leaveN: 2 });
});

const fixed = (o = {}) => ({ grouptype: 1, sync_holidays: false, spe_workdays: [], spe_offdays: [], checkindate: [{ workdays: [1, 2, 3, 4, 5, 6], checkintime: [{ work_sec: 9 * H, off_work_sec: 20 * H }], flex_on_duty_time: 600 }], ...o });
test('应不应到：固定班看规则里的工作日、特殊日期和法定节假日', () => {
  const p = planOf(fixed(), null, TD);   // 周六
  assert.deepEqual([p.kind, p.expected, p.shift, p.on, p.off, p.grace], ['fixed', true, '09:00-20:00', 9 * H, 20 * H, 600]);
  assert.deepEqual([planOf(fixed(), null, '2026-11-22').expected, planOf(fixed(), null, '2026-11-22').shift], [false, '休息']);   // 周日
  assert.equal(planOf(fixed({ spe_offdays: [{ timestamp: t0 }] }), null, TD).expected, false);
  const sp = planOf(fixed({ spe_workdays: [{ timestamp: dayStart('2026-11-22') + 100, checkintime: [{ work_sec: 10 * H, off_work_sec: 16 * H }] }] }), null, '2026-11-22');
  assert.deepEqual([sp.expected, sp.shift], [true, '10:00-16:00']);
  assert.equal(planOf(fixed({ sync_holidays: true }), null, '2026-10-01').expected, false, '国庆放假');
  assert.equal(planOf(fixed({ sync_holidays: true, checkindate: [{ workdays: [1, 2, 3, 4, 5], checkintime: [{ work_sec: 9 * H, off_work_sec: 18 * H }] }] }), null, '2026-10-10').expected, true, '调休上班的周六');
  assert.equal(planOf(fixed({ sync_holidays: false }), null, '2026-10-01').expected, true, '规则没开同步节假日就照常');
});
test('应不应到：大小周按企微的周次', () => {
  const g = fixed({ checkindate: [{ biweekly: { enable_weekday_recurrence: true, odd_workdays: [1, 2, 3, 4, 5, 6], even_workdays: [1, 2, 3, 4, 5] }, checkintime: [{ work_sec: 9 * H, off_work_sec: 18 * H }] }] });
  assert.equal(planOf(g, null, '2024-01-06').expected, true, '第 1 周是单周，周六上班');
  assert.equal(planOf(g, null, '2024-01-13').expected, false, '第 2 周是双周，周六休息');
  assert.notEqual(planOf(g, null, TD).expected, planOf(g, null, '2026-11-28').expected);
});
test('应不应到：按班次看当天排班；自由上下班带出换日时间；没规则的人不考勤', () => {
  const group = { grouptype: 2, schedulelist: [{ schedule_id: 12, flex_on_duty_time: 0, max_allow_arrive_late: 1800 }] };
  const sch = id => [{ yearmonth: 202610, schedule: { scheduleList: [{ day: 21, schedule_info: { schedule_id: 99 } }] } },
    { yearmonth: 202611, schedule: { scheduleList: [{ day: 21, schedule_info: { schedule_id: id, schedule_name: '晚班', time_section: [{ work_sec: 15 * H, off_work_sec: 24 * H }] } }] } }];
  const p = planOf(group, sch(12), TD);
  assert.deepEqual([p.kind, p.expected, p.shift, p.on, p.off, p.grace], ['shift', true, '晚班 15:00-00:00', 15 * H, 24 * H, 1800]);
  assert.deepEqual([planOf(group, sch(0), TD).expected, planOf(group, sch(0), TD).shift], [false, '休息']);
  assert.deepEqual([planOf(group, [], TD).expected, planOf(group, [], TD).shift], [null, '未排班']);
  const free = planOf({ grouptype: 3, span_day_time: 7 * H, checkindate: [{ workdays: [0, 1, 2, 3, 4, 5, 6] }] }, null, TD);
  assert.deepEqual([free.kind, free.expected, free.spanDay, free.on], ['free', true, 7 * H, null]);
  assert.equal(planOf({ grouptype: 3, checkindate: [{ workdays: [6] }] }, null, TD).spanDay, RULES.spanDay);
  assert.deepEqual([planOf(undefined, null, TD).kind, planOf(undefined, null, TD).expected], ['none', null]);
});

const P = planOf(fixed(), null, TD), at = (h, m = 0) => t0 + h * H + m * M;
const pin = (t, type = '上班打卡', ex = [], sch = null) => ({ t, type, ex, sch });
const now = at(10);
test('今天：没到上班时间、宽限内、过了还没打卡', () => {
  assert.deepEqual([todayRecord(P, [], [], TD, at(8, 50)).st, todayRecord(P, [], [], TD, at(8, 50)).due], ['before', true]);
  assert.equal(todayRecord(P, [], [], TD, at(9, 9)).st, 'before', '规则允许晚 10 分钟');
  assert.equal(todayRecord(P, [], [], TD, at(9, 10)).st, 'unsigned');
});
test('今天：在岗、迟到只认企微标的时间异常、已下班', () => {
  const a = todayRecord(P, [pin(at(8, 55), '上班打卡', [], at(9))], [], TD, now);
  assert.deepEqual([a.st, a.punched, a.on, a.off, a.span, a.late], ['in', true, at(8, 55), null, 65 * M, false]);
  const b = todayRecord(P, [pin(at(9, 20), '上班打卡', ['时间异常'], at(9))], [], TD, now);
  assert.deepEqual([b.st, b.late, b.lateSec], ['late', true, 20 * M]);
  assert.equal(todayRecord(P, [pin(at(9, 5), '上班打卡', [], at(9))], [], TD, now).late, false, '企微没标异常就不算迟到');
  const c = todayRecord(P, [pin(at(9, 20), '上班打卡', ['时间异常'], at(9)), pin(at(20, 10), '下班打卡', [], at(20))], [], TD, at(21));
  assert.deepEqual([c.st, c.late, c.span, c.otL], ['out', true, 650 * M, 0]);
  const e = todayRecord(P, [pin(at(8, 55), '上班打卡', [], at(9)), pin(at(19, 30), '下班打卡', ['时间异常'], at(20))], [], TD, at(21));
  assert.deepEqual([e.st, e.earlySec], ['out', 30 * M]);
});
test('今天：过了班次下班时间 30 分钟还在岗算加班中', () => {
  const on = [pin(at(8, 55), '上班打卡', [], at(9))];
  assert.equal(todayRecord(P, on, [], TD, at(20, 29)).st, 'in');
  assert.deepEqual([todayRecord(P, on, [], TD, at(20, 30)).st, todayRecord(P, on, [], TD, at(20, 30)).otL], ['ot', 30 * M]);
  assert.equal(todayRecord(P, [...on, pin(at(21), '下班打卡', [], at(20))], [], TD, at(22)).otL, H);
});
test('今天：请假只认已通过的审批；审批中的只做提示', () => {
  const ok = todayRecord(P, [], [{ name: '调休', status: 2 }], TD, now);
  assert.deepEqual([ok.st, ok.due, ok.leave, ok.pending], ['leave', false, ['调休'], false]);
  const wait = todayRecord(P, [], [{ name: '事假', status: 1 }], TD, now);
  assert.deepEqual([wait.st, wait.due, wait.leave, wait.pending], ['unsigned', true, [], true]);
  const both = todayRecord(P, [pin(at(8, 55))], [{ name: '事假', status: 2 }], TD, now);
  assert.deepEqual([both.st, both.due, both.leave], ['in', true, ['事假']]);
});
test('今天：休息、休息日出勤、没有打卡规则', () => {
  const rest = planOf(fixed(), null, '2026-11-22'), r0 = dayStart('2026-11-22');
  assert.deepEqual([todayRecord(rest, [], [], '2026-11-22', r0 + 12 * H).st, todayRecord(rest, [], [], '2026-11-22', r0 + 12 * H).due], ['rest', false]);
  const work = todayRecord(rest, [pin(r0 + 10 * H)], [], '2026-11-22', r0 + 12 * H);
  assert.deepEqual([work.st, work.restWork, work.due, work.otL], ['in', true, false, 0]);
  const nobody = planOf(undefined, null, TD);
  assert.equal(todayRecord(nobody, [], [], TD, now).st, 'none');
  assert.deepEqual([todayRecord(nobody, [pin(at(9))], [], TD, now).st, todayRecord(nobody, [pin(at(9))], [], TD, now).noRule], ['in', true]);
  assert.equal(todayRecord({ ...planOf({ grouptype: 2 }, [], TD) }, [], [], TD, now).st, 'none', '没排班不算应到');
});
test('今天：自由上下班按本人平时到岗时间加 1 小时判断', () => {
  const free = { ...planOf({ grouptype: 3, span_day_time: 7 * H, checkindate: [{ workdays: [0, 1, 2, 3, 4, 5, 6] }] }, null, TD), usualOn: 10 * H + 20 * M };
  assert.equal(todayRecord(free, [], [], TD, at(11, 19)).st, 'before');
  assert.deepEqual([todayRecord(free, [], [], TD, at(11, 20)).st, todayRecord(free, [], [], TD, at(11, 20)).due], ['nopunch', true]);
  assert.equal(todayRecord({ ...free, usualOn: null }, [], [], TD, at(10, 59)).st, 'before', '历史不够时按 10 点');
  assert.equal(todayRecord({ ...free, usualOn: null }, [], [], TD, at(11)).st, 'nopunch');
});
test('今天：凌晨的下班卡归前一天，占位记录和外出打卡不算', () => {
  assert.equal(todayRecord(P, [pin(at(0, 40), '下班打卡', [], at(20) - DAY)], [], TD, at(8)).punched, false, '固定班：标准时间在昨天');
  const night = planOf({ grouptype: 2 }, [{ yearmonth: 202611, schedule: { scheduleList: [{ day: 21, schedule_info: { schedule_id: 12, time_section: [{ work_sec: 15 * H, off_work_sec: 24 * H }] } }] } }], TD);
  assert.equal(todayRecord(night, [pin(at(0, 5), '下班打卡', [], t0)], [], TD, at(8)).punched, false, '晚班：标准时间正好是今天 0 点');
  const free = planOf({ grouptype: 3, span_day_time: 7 * H, checkindate: [{ workdays: [0, 1, 2, 3, 4, 5, 6] }] }, null, TD);
  const f = todayRecord(free, [pin(at(2, 10), '下班打卡'), pin(at(6, 59, 59 / 60), '下班打卡', ['未打卡'], at(6, 59)), pin(at(9, 50)), pin(at(12), '外出打卡')], [], TD, at(13));
  assert.deepEqual([f.st, f.on, f.off], ['in', at(9, 50), null]);
  const lost = todayRecord(P, [pin(at(18), '下班打卡', ['时间异常'], at(20))], [], TD, at(19));
  assert.deepEqual([lost.st, lost.on, lost.off, lost.span], ['out', null, at(18), 0], '白天只有下班卡，算今天的');
  const plain = todayRecord(free, [pin(at(9, 30), '仅记录打卡时间和位置'), pin(at(15), '仅记录打卡时间和位置')], [], TD, at(16));
  assert.deepEqual([plain.st, plain.on, plain.off], ['out', at(9, 30), at(15)]);
});
test('今天：跨零点的班次，早上那张下班卡是昨晚那一班的，不算今天到过岗', () => {
  // 今晚 22:00 到明早 06:00 的班；早上 06:05 打的下班卡，标准时间是今天 06:00，比今天这一班的上班时间早
  const over = planOf({ grouptype: 2 }, [{ yearmonth: 202611, schedule: { scheduleList: [{ day: 21, schedule_info: { schedule_id: 13, schedule_name: '夜班', time_section: [{ work_sec: 22 * H, off_work_sec: 6 * H }] } }] } }], TD);
  assert.deepEqual([over.on, over.off], [22 * H, 30 * H]);
  const morning = pin(at(6, 5), '下班打卡', [], at(6));
  const a = todayRecord(over, [morning], [], TD, at(10));
  assert.deepEqual([a.st, a.punched, a.off], ['before', false, null], '白天：今晚的班还没到点');
  assert.deepEqual([todayRecord(over, [morning], [], TD, at(23)).st, todayRecord(over, [morning], [], TD, at(23)).punched], ['unsigned', false], '晚上过了上班时间没打上班卡：未签到');
  const c = todayRecord(over, [morning, pin(at(21, 55), '上班打卡', [], at(22))], [], TD, at(23));
  assert.deepEqual([c.st, c.on, c.off], ['in', at(21, 55), null], '打了今晚的上班卡：在岗，早上那张下班卡不当成今晚的下班');
});

const person = (days, today = {}) => ({ days, today: { st: 'none', punched: false, late: false, on: null, ...today } });
const run = (n, span = 11 * H, from = YD) => Object.fromEntries(Array.from({ length: n }, (_, i) => [addDays(from, -i), { n: 2, on: 9 * H, off: 9 * H + span, span, lateN: 0 }]));
const meta = days => ({ days: Object.keys(days).sort(), yest: YD, monthStart: '2026-11-01', today: TD });
test('信号：频繁迟到按本月次数，今天迟到也算一次', () => {
  const days = run(25);
  days['2026-11-18'].lateN = 1; days['2026-11-19'].lateN = 1; days['2026-10-31'].lateN = 5;   // 上个月的不算
  assert.deepEqual([signals(person(days), meta(days)).monthLate, signals(person(days), meta(days)).flags.freqLate], [2, false]);
  const s = signals(person(days, { late: true }), meta(days));
  assert.deepEqual([s.monthLate, s.flags.freqLate, s.flags.att], [RULES.freqLate, true, true]);
});
test('信号：连续出勤满 14 天，中间断一天就重算', () => {
  const a = run(13), b = run(14);
  assert.deepEqual([signals(person(a), meta(a)).streak, signals(person(a), meta(a)).flags.streak], [13, false]);
  assert.deepEqual([signals(person(a, { punched: true }), meta(a)).streak, signals(person(a, { punched: true }), meta(a)).flags.streak], [14, true]);
  assert.equal(signals(person(b), meta(b)).flags.streak, true);
  b['2026-11-15'].n = 0;
  assert.equal(signals(person(b), meta(b)).streak, 5);
});
test('信号：近 7 天有 5 天在岗满 14 小时算长期加班', () => {
  const d = run(20, 11 * H);
  for (let i = 0; i < 4; i++) d[addDays(YD, -i)].span = 14 * H;
  assert.equal(signals(person(d), meta(d)).flags.long, false);
  d[addDays(YD, -6)].span = 14 * H;
  assert.deepEqual([signals(person(d), meta(d)).longN, signals(person(d), meta(d)).flags.long], [5, true]);
  d[addDays(YD, -6)].span = 11 * H; d[addDays(YD, -7)].span = 16 * H;
  assert.equal(signals(person(d), meta(d)).flags.long, false, '7 天以外的不算');
});
test('信号：昨日下班到今日上班不足 9 小时算休息不足', () => {
  const d = run(3);
  d[YD].off = 25.5 * H;   // 昨天干到今天 01:30
  assert.deepEqual([Math.round(signals(person(d, { on: at(9, 50) }), meta(d)).restGap * 100), signals(person(d, { on: at(9, 50) }), meta(d)).flags.rest], [833, true]);
  assert.equal(signals(person(d, { on: at(10, 30) }), meta(d)).flags.rest, false);
  assert.equal(signals(person(d), meta(d)).restGap, null, '今天还没打卡就不判断');
});
test('信号：近 7 天日均在岗比此前偏离 20% 算工时异常，天数不够不判断', () => {
  const d = run(20, 10 * H);
  assert.equal(signals(person(d), meta(d)).flags.shift, false);
  for (let i = 0; i < 7; i++) d[addDays(YD, -i)].span = 12 * H;
  assert.deepEqual([Math.round(signals(person(d), meta(d)).shiftPct), signals(person(d), meta(d)).flags.shift], [20, true]);
  const few = run(9, 10 * H);
  for (let i = 0; i < 7; i++) few[addDays(YD, -i)].span = 14 * H;
  assert.equal(signals(person(few), meta(few)).shiftPct, null);
});

test('档案：部门取公司下第一级，小组取最深一级，主管先直属上级再部门负责人', () => {
  const depts = [{ id: 1, name: '公司', parentid: 0, order: 9 }, { id: 2, name: '运营', parentid: 1, order: 8, department_leader: ['boss'] }, { id: 3, name: '一组', parentid: 2, order: 1 }, { id: 4, name: '客服', parentid: 1, order: 5 }];
  const mk = (id, main, ds, leaders = [], leads = []) => [id, { id, name: id.toUpperCase(), main, depts: new Set(ds), leaders: new Set(leaders), leads: new Set(leads) }];
  const people = new Map([mk('boss', 2, [2]), mk('lead', 2, [2, 3], [], [3]), mk('a', 2, [2, 3], ['boss']), mk('b', 2, [2, 3]), mk('c', 4, [4]), mk('ceo', 1, [1])]);
  const org = buildOrg(depts, people), u = id => org.byUser.get(id);
  assert.deepEqual(u('a'), { dept: '运营', team: '一组', leader: 'BOSS', leaderSrc: 'direct' });
  assert.deepEqual(u('b'), { dept: '运营', team: '一组', leader: 'LEAD', leaderSrc: 'dept' });
  assert.deepEqual(u('lead'), { dept: '运营', team: '一组', leader: 'BOSS', leaderSrc: 'dept' }, '组长自己往上一级找');
  assert.deepEqual(u('c'), { dept: '客服', team: '', leader: '', leaderSrc: '' });
  assert.deepEqual([u('ceo').dept, u('boss').leader], ['公司', '']);
  assert.deepEqual(org.depts, ['公司', '运营', '客服']);
  // 根部门就是公司。直接挂在它下面的人，部门一栏写的就是公司的名字；页面靠 company 认出这一组不是一个真的部门
  assert.equal(org.company, '公司');
  assert.equal(buildOrg([...depts, { id: 9, name: '另一棵树', parentid: 0 }], people).company, '', '有两个根的时候不猜哪个是公司');
});
test('档案：用工类型、岗位、工龄', () => {
  const row = (kind, status, join = '') => ({ 员工类型: { v: kind }, 员工状态: { v: status }, 入职日期: { v: join }, 工号: { miss: 1 }, 职位: { v: '花名册岗位' } });
  const m = { name: '张三', position: '通讯录岗位' };
  assert.deepEqual(profileOf(m, row('全职', '正式', '2024-03-22'), TD), { name: '张三', post: '通讯录岗位', type: '正式工', leaving: false, join: '2024-03-22', tenure: 31, no: '' });
  assert.equal(profileOf(m, row('全职', '正式', '2024-03-21'), TD).tenure, 32);
  assert.deepEqual(['全职|试用', '实习|试用', '实习|正式', '全职|待离职', '|', '|试用'].map(s => profileOf(m, row(...s.split('|')), TD).type), ['试用期', '实习', '实习', '正式工', '未登记', '试用期']);
  assert.equal(profileOf(m, row('全职', '待离职'), TD).leaving, true);
  assert.deepEqual([profileOf({ name: 'x', position: '' }, row('全职', '正式'), TD).post, profileOf(m, undefined, TD).type, profileOf(m, row('全职', '正式'), TD).tenure], ['花名册岗位', '未登记', null]);
});

test('时间段：今日、昨日、近 7 天、本月各取哪几天；每月 1 号的本月就是今天', () => {
  const m = { today: TD, yest: YD, monthStart: '2026-11-01' }, td = { from: TD, to: TD };
  assert.deepEqual(periodOf(m, 'today'), td);
  assert.deepEqual(periodOf(m, 'yesterday'), { from: YD, to: YD });
  assert.deepEqual(periodOf(m, 'd7'), { from: '2026-11-14', to: YD });
  assert.deepEqual(periodOf(m, 'month'), { from: '2026-11-01', to: YD });
  assert.deepEqual(periodOf({ today: '2026-12-01', yest: '2026-11-30', monthStart: '2026-12-01' }, 'month'), { from: '2026-12-01', to: '2026-12-01' });
  assert.deepEqual(periodOf(m, 'custom', '2026-11-03', '2026-11-09'), { from: '2026-11-03', to: '2026-11-09' });
  assert.deepEqual(periodOf(m, 'custom', '2026-11-09', '2026-11-03'), { from: '2026-11-03', to: '2026-11-09' }, '起止填反了就对调');
  assert.deepEqual([periodOf(m, 'custom', 'x', '<b>'), periodOf(m, 'custom', '2026-11-09'), periodOf(m, 'whatever'), periodOf(m)], [td, { from: '2026-11-09', to: '2026-11-09' }, td, td], '不是日期的一律当今天');
});

// ---------- 整条链路：假企微 -> 同步 -> 核算 -> 页面数据，和假数据底稿逐人对账 ----------
const co = mockCompany(), sync = createSync(co.raw, { corpid: 'mock', secret: 'mock' });
const res = await sync(MOCK_NOW, true), ds = res.ok ? buildDataset(res.raw, MOCK_NOW) : null;
const sc = (u, d) => co.scenario(u, d), who = id => ds.people.find(p => p.id === id);
const WORK = new Set(['normal', 'late', 'early', 'miss', 'absent', 'nopunch']);

test('同步：全量取数成功，取回的打卡记录里没有位置、WiFi、设备', () => {
  assert.equal(res.ok, true, JSON.stringify(res.info.errors));
  assert.deepEqual(res.info.errors, {});
  assert.equal(ds.people.length, co.users.length);
  for (const l of res.raw.punches.values()) for (const x of l) assert.deepEqual(Object.keys(x).sort(), ['ex', 'sch', 't', 'type']);
  assert.equal(JSON.stringify([...res.raw.punches.values()]).includes('演示园区'), false);
  assert.equal(JSON.stringify(res.raw.leaves).includes('演示事由'), false, '请假事由不取');
});
test('同步：第二轮不重取花名册和已办结的审批；关键接口报错整轮算失败', async () => {
  const before = { ...co.calls };
  const again = await sync(MOCK_NOW);
  assert.equal(again.ok, true);
  assert.equal(co.calls['hr/get_staff_info'], before['hr/get_staff_info']);
  assert.equal(co.calls['user/list'], before['user/list']);
  for (const p of ['department/list', 'checkin/getcheckin_monthdata']) assert.equal(co.calls[p], before[p], p + ' 刚取过，不重取');
  for (const p of ['checkin/getcheckindata', 'checkin/getcheckin_daydata', 'checkin/getcheckinoption']) assert.ok(co.calls[p] > before[p], p + ' 每轮都取');
  assert.ok(co.calls['oa/getapprovaldetail'] - before['oa/getapprovaldetail'] < 40, '只重取假期没过完的');
  assert.deepEqual([again.raw.people.size, again.raw.daily.days.size, again.info.rosterOff, again.info.monthsOff], [co.users.length, 30, false, false]);
  const bad = createSync(async (p, q, b) => p === 'checkin/getcheckin_daydata' ? { errcode: 60020, errmsg: 'not allow to access from your ip, from ip: 1.2.3.4' } : co.raw(p, q, b), {});
  const r = await bad(MOCK_NOW, true);
  assert.deepEqual([r.ok, r.info.errors['checkin/getcheckin_daydata'][60020] > 0, r.info.ip, r.info.hints.length], [false, true, '1.2.3.4', 1]);
  const soft = await createSync(async (p, q, b) => p.startsWith('oa/') ? { errcode: 301055, errmsg: 'no permission' } : co.raw(p, q, b), {})(MOCK_NOW, true);
  assert.deepEqual([soft.ok, soft.info.leaveOff], [true, true], '审批没权限，页面照常出，只是今天的请假看不到');
});
test('同步：这一轮失败，下一轮重新取凭证', async () => {
  let fail = true;
  const n = {}, s = createSync(async (p, q, b) => { n[p] = (n[p] || 0) + 1; return fail && p === 'checkin/getcheckin_daydata' ? { errcode: 42001, errmsg: 'access_token expired' } : co.raw(p, q, b); }, {});
  assert.equal((await s(MOCK_NOW, true)).ok, false);
  fail = false;
  assert.deepEqual([(await s(MOCK_NOW)).ok, n.gettoken], [true, 2]);
});
test('同步：通讯录取到一半失败，下一轮整份重取，不沿用半截名单', async () => {
  let fail = true;
  const s = createSync(async (p, q, b) => fail && p === 'user/list' && [3, 31, 32].includes(Number(q.department_id)) ? { errcode: -1, errmsg: 'system busy' } : co.raw(p, q, b), {});
  assert.equal((await s(MOCK_NOW, true)).ok, false);
  fail = false;
  const b = await s(MOCK_NOW);
  assert.deepEqual([b.ok, b.raw.people.size, b.raw.daily.days.size], [true, co.users.length, 30]);
});
test('同步：花名册、往月月报取不到时页面照常出，并说明缺了哪块', async () => {
  const r = await createSync(async (p, q, b) => p === 'hr/get_fields' || p === 'checkin/getcheckin_monthdata' ? { errcode: 48002, errmsg: 'api forbidden' } : co.raw(p, q, b), {})(MOCK_NOW, true);
  assert.deepEqual([r.ok, r.info.rosterOff, r.info.monthsOff, r.info.leaveOff], [true, true, true, false]);
  const d = buildDataset(r.raw, MOCK_NOW);
  assert.deepEqual([d.people.length, d.people.every(p => p.type === '未登记' && !p.join), d.meta.coverage.months], [co.users.length, true, []]);
});
test('整链：昨天的指标卡和假数据底稿一致', () => {
  const o = overview(ds, { from: co.yest, to: co.yest }), k = o.kpi, all = co.users.map(u => [u, sc(u, co.yest)]).filter(([, s]) => s);
  const cnt = f => all.filter(([u, s]) => f(s, u)).length;
  assert.deepEqual([o.kind, o.from, o.to, o.days], ['day', co.yest, co.yest, 1]);
  assert.equal(k.total, co.users.length);
  assert.equal(k.lateN, cnt(s => s.kind === 'late'));
  assert.equal(k.lateMin, Math.round(all.filter(([, s]) => s.kind === 'late').reduce((a, [, s]) => a + s.on - s.planOn, 0) / 60));
  assert.equal(k.absentW, cnt(s => s.kind === 'absent'));
  assert.equal(k.nopunch, cnt(s => s.kind === 'nopunch'));
  assert.equal(k.leaveN, cnt(s => s.kind === 'leave'));
  assert.equal(k.due, cnt(s => WORK.has(s.kind)));
  assert.equal(k.present, cnt(s => WORK.has(s.kind) && s.n > 0));
  assert.equal(k.due, k.present + k.absentN, '应到 = 实到 + 缺勤');
  assert.ok(k.lateN > 0 && k.absentW > 0 && k.nopunch > 0 && k.leaveN > 0 && k.otN > k.otWN && k.otWN > 0, '演示数据里每种情形都有人');
  const worked = all.filter(([, s]) => s.n === 2);
  assert.equal(k.inPost, Math.round(worked.reduce((a, [, s]) => a + s.off - s.on, 0) / worked.length / H * 10) / 10);
  assert.ok(k.hours >= k.inPost, '企微的工时进位到整小时，不会比在岗时长小');
  assert.equal(k.onDuty, null);
});
test('整链：今天每个人的状态和假数据底稿一致', () => {
  const o = overview(ds), late = [], off = [];
  assert.deepEqual([o.kind, o.from, o.to], ['today', co.today, co.today]);
  for (const u of co.users) {
    const s = sc(u, co.today), p = who(u.id), t = p.today, on = s?.on != null && t0 + s.on <= MOCK_NOW, out = on && s.off != null && t0 + s.off <= MOCK_NOW;
    const want = !s ? 'none' : s.kind === 'rest' ? 'rest' : s.kind === 'leave' ? 'leave' : !on ? (u.rule === 'free' ? 'nopunch' : 'unsigned')
      : out ? 'out' : s.planOff != null && MOCK_NOW >= t0 + s.planOff + RULES.otMinSec ? 'ot' : s.kind === 'late' ? 'late' : 'in';
    assert.equal(t.st, want, u.id + ' ' + u.rule + ' ' + (s?.kind || '无'));
    if (on) assert.equal(t.on, t0 + s.on, u.id);
    if (s?.kind === 'late' && on) { late.push(u.id); assert.equal(t.lateSec, s.on - s.planOn); }
    if (out) off.push(u.id);
  }
  const k = o.kpi;
  assert.equal(k.lateN, late.length);
  assert.equal(k.due, k.present + k.absentN + k.before);
  assert.equal(k.onDuty, co.users.filter(u => ['in', 'late', 'ot'].includes(who(u.id).today.st)).length);
  assert.ok(late.length >= 2 && off.length > 0 && k.absentN >= 2 && k.leaveN >= 2 && k.onDuty > 20);
  assert.equal(k.rate, k.present / (k.present + k.absentN) * 100, '今天的出勤率只算已经到上班时间的人');
  assert.equal(k.hours, null, '今天还没有企微日报，没有计入工时');
});
test('整链：昨天干到凌晨的人，凌晨那张下班卡不算今天的', () => {
  const cross = co.users.filter(u => sc(u, co.yest)?.off > DAY);
  assert.ok(cross.length >= 5);
  for (const u of cross) {
    const t = who(u.id).today, y = who(u.id).days[co.yest];
    assert.equal(y.off, sc(u, co.yest).off, u.id);
    assert.ok(t.on == null || t.on >= t0 + 5 * H, u.id);
    assert.ok(t.off == null || t.off > t0 + 5 * H, u.id);
  }
});
test('整链：今天的请假只认已通过的审批', () => {
  const st = k => co.users.filter(u => sc(u, co.today)?.kind === k);
  for (const u of st('leave')) assert.deepEqual([who(u.id).today.st, who(u.id).today.leave, who(u.id).tags.some(x => x[0] === '今日' + sc(u, co.today).leave)], ['leave', [sc(u, co.today).leave], true], u.id);
  const forms = [...co.approvals.values()].filter(a => a.apply_time === t0 - 2 * DAY + 10 * H && a.sp_status !== 2);
  assert.deepEqual(forms.map(a => a.sp_status).sort(), [1, 3, 6]);
  for (const a of forms) {
    const t = who(a.applyer.userid).today;
    assert.deepEqual([t.leave, t.pending, t.st === 'leave'], [[], a.sp_status === 1, false], '状态 ' + a.sp_status);
  }
  assert.equal(overview(ds).coverage.leavePending, 1);
});
test('整链：一个多月前就批下来的长假，单号不在近 31 天的审批列表里，靠日报里挂的单号找到', () => {
  const u = co.users[co.long], form = [...co.approvals.values()].find(a => a.applyer.userid === u.id && a.apply_time < MOCK_NOW - 31 * DAY);
  assert.ok(form && sc(u, co.yest).kind === 'leave' && sc(u, co.today).kind === 'leave');
  assert.deepEqual([who(u.id).today.st, who(u.id).days[co.yest].st], ['leave', 'leave']);
});
test('同步：一个多月前就批下来、今天才开始休的假也找得到（这时日报里还没有挂这张单）', async () => {
  const c2 = mockCompany(), u = c2.users.find(x => x.rule === 'free' && c2.scenario(x, c2.today)?.kind === 'nopunch');
  const one = a => a.apply_data.contents[0].value.vacation.attendance;
  const form = JSON.parse(JSON.stringify([...c2.approvals.values()].find(a => a.sp_status === 2 && one(a).slice_info.day_items.length === 1)));
  Object.assign(form, { sp_no: 'EARLY1', apply_time: t0 - 35 * DAY, applyer: { userid: u.id, partyid: '1' } });
  Object.assign(one(form).date_range, { new_begin: t0, new_end: t0 + 12 * H });
  one(form).slice_info.day_items = [{ daytime: t0, duration: DAY }];
  c2.approvals.set(form.sp_no, form);
  const r = await createSync(c2.raw, {})(MOCK_NOW, true), p = buildDataset(r.raw, MOCK_NOW).people.find(v => v.id === u.id);
  assert.deepEqual([who(u.id).today.st, p.today.st, p.flags.att], ['nopunch', 'leave', false], '没有这张单时是未打卡，有了就是请假');
  // 往前多查的那两段只为找还没休完的假：一个月以前提交、已经休完的单不进请假单列表
  const old = r.raw.leaves.filter(a => a.at < MOCK_NOW - 31 * DAY);
  assert.deepEqual([old.length, old.every(a => a.items.some(x => x.to >= t0)), res.raw.leaves.filter(a => a.at < MOCK_NOW - 31 * DAY).length], [2, true, 1]);
});
test('整链：本月累计逐人等于日报相加，企微记的加班只有开了加班的两个人有', () => {
  const o = overview(ds), md = ds.meta.days.filter(d => d >= ds.meta.monthStart);
  assert.ok(md.length === 20);
  for (const u of co.users) {
    const r = o.rows.find(x => x.id === u.id), list = md.map(d => co.report(u, d)).filter(Boolean);
    assert.equal(r.month.lateN, list.reduce((a, e) => a + e.exception_infos[0].count, 0), u.id);
    assert.equal(r.month.reg, list.reduce((a, e) => a + e.summary_info.regular_work_sec, 0), u.id);
    assert.equal(r.month.otWSec, list.reduce((a, e) => a + e.ot_info.ot_duration, 0), u.id);
    assert.equal(r.month.otWSec > 0, co.otw.has(u.k) && r.month.otWSec > 0);
    assert.equal(r.month.leaveN, list.filter(e => e.sp_items[0].count > 0).length, u.id);
    assert.equal(r.month.days, list.length);
  }
  assert.equal(o.coverage.otWecomMonth, 2);
  assert.equal(o.coverage.otForms, 0, '近 31 天的加班审批单数，假企微里没有');
  const u = co.users.find(x => x.rule === 'fixA' && x.join < ds.meta.monthStart), m = o.rows.find(x => x.id === u.id).month;
  assert.equal(m.work, md.filter(d => ['normal', 'late', 'early', 'miss', 'absent', 'leave'].includes(sc(u, d)?.kind)).length, '应出勤');
});
test('同步：加班审批单数取不到时记为未知，不当成 0', async () => {
  const r = await createSync(async (p, q, b) => p === 'oa/getapprovalinfo' && b.filters.some(f => f.key === 'record_type' && f.value === '5') ? { errcode: 301055, errmsg: 'no permission' } : co.raw(p, q, b), {})(MOCK_NOW, true);
  assert.deepEqual([r.ok, buildDataset(r.raw, MOCK_NOW).meta.coverage.otForms], [true, null]);
});
test('整链：时间段切换。跨天的区间不含今天；本月不另出时段组；近 7 天带环比', () => {
  const week = overview(ds, { from: addDays(co.today, -6), to: co.today });
  assert.deepEqual([week.kind, week.from, week.to, week.days], ['range', addDays(co.today, -6), co.yest, 6]);
  const seven = overview(ds, { from: addDays(co.today, -7), to: co.yest });
  assert.deepEqual([seven.days, seven.rows[0].range != null, seven.kpi.prevRate != null], [7, true, true]);
  assert.equal(seven.rows[0].week.length, 7);
  const month = overview(ds, { from: ds.meta.monthStart, to: co.today });
  assert.deepEqual([month.kind, month.rows[0].range, month.days], ['range', null, 20]);
  for (const r of month.rows) assert.deepEqual([r.sel.lateN, r.sel.reg], [r.month.lateN, r.month.reg]);
  const old = overview(ds, { from: '2030-01-01', to: '2020-01-01' });
  assert.deepEqual([overview(ds, { from: '2030-01-01' }).kind, old.from, old.to, old.kind], ['today', ds.meta.days[0], ds.meta.days[0], 'day'], '超出范围的日期收回到有数据的范围里');
  const sum = f => seven.rows.reduce((a, r) => a + f(r.sel), 0);
  assert.equal(seven.kpi.rate, sum(s => s.present) / sum(s => s.due) * 100);
});
test('整链：选了昨天以外的某一天，每行带上这一天的记录', () => {
  const d = addDays(co.today, -5), o = overview(ds, { from: d, to: d });
  const u = co.users.find(x => sc(x, d)?.kind === 'normal'), r = o.rows.find(x => x.id === u.id);
  assert.deepEqual([o.kind, r.day.d, r.day.st, r.day.on, r.day.off], ['day', d, 'normal', sc(u, d).on, sc(u, d).off]);
  assert.deepEqual([overview(ds, { from: co.yest, to: co.yest }).rows[0].day, overview(ds).rows[0].day], [null, null], '昨天和今天各有自己的一组，不重复带');
});
test('整链：部门范围、异常优先的默认排序、筛选项', () => {
  const o = overview(ds, { dept: '运营中心' });
  assert.deepEqual([o.rows.length, o.rows.every(r => r.dept === '运营中心'), o.kpi.total], [23, true, 23]);
  assert.deepEqual(o.allDepts, ['演示公司', '运营中心', '客服中心', '产品设计部', '供应链', '职能部']);
  const all = overview(ds);
  for (let i = 1; i < all.rows.length; i++) assert.ok(all.rows[i - 1].score >= all.rows[i].score);
  assert.ok(['unsigned', 'nopunch'].includes(all.rows[0].today.st), '没到的人排最前');
  assert.ok(all.posts.includes('售前客服') && all.leaders.length > 3);
  assert.equal(overview(ds, { post: '售前客服' }).rows.every(r => r.post === '售前客服'), true);
  assert.ok(overview(ds, { dept: '客服中心', post: '售前客服' }).posts.includes('售后客服'), '选了岗位，岗位下拉仍列出本部门全部岗位');
});
test('整链：档案里的主管、用工类型、入职时间', () => {
  const c = ds.meta.coverage, rows = overview(ds).rows;
  assert.deepEqual([c.people, c.rule], [66, { fixed: 26, shift: 14, free: 23, none: 3 }]);
  assert.equal(c.noJoin, co.users.filter(u => !u.joinKnown).length);
  assert.equal(c.leaderDirect, co.users.filter(u => u.boss).length);
  assert.ok(c.leaderDept > 0 && c.leaderNone > 0 && c.leaderDirect + c.leaderDept + c.leaderNone === 66);
  assert.equal(rows.filter(r => r.type === '试用期').length, co.users.filter(u => u.status === 2 && u.kind === 1).length);
  assert.equal(rows.filter(r => r.type === '实习').length, co.users.filter(u => u.kind === 2).length);
  assert.equal(rows.filter(r => r.leaving).length, 1);
  assert.equal(rows.every(r => r.no === ''), true, '企微里没登记工号');
  const u = co.users.find(x => x.dept > 9 && x.joinKnown), r = rows.find(x => x.id === u.id);
  assert.deepEqual([r.name, r.join, r.team !== '', r.dept !== r.team], [u.name, u.join, true, true]);
});
test('整链：异常信号和提醒。连续出勤的人确实连着 14 天有打卡', () => {
  const flagged = k => ds.people.filter(p => p.flags[k]);
  for (const k of ['att', 'freqLate', 'long', 'streak', 'shift']) assert.ok(flagged(k).length > 0, k + ' 演示里至少有一人');
  for (const p of flagged('streak')) {
    assert.ok(p.streak >= RULES.streakDays);
    const l = ds.meta.days.slice(-(p.streak - (p.today.punched ? 1 : 0)));
    assert.ok(l.every(d => p.days[d].n > 0), p.id);
    assert.ok(p.tags.some(t => t[0] === '连续出勤 ' + p.streak + ' 天'));
  }
  for (const p of flagged('freqLate')) {
    assert.ok(p.monthLate >= RULES.freqLate);
    assert.ok(p.tags.some(t => t[0] === '本月迟到 ' + p.monthLate + ' 次' + (p.today.late ? '（含今日）' : '')), p.id);
  }
  for (const p of flagged('rest')) assert.ok(p.restGap < RULES.restHours);
});
test('整链：个人考勤档案', () => {
  const u = co.users.find(x => x.rule === 'fixA' && x.join < addDays(co.today, -200)), d = personDetail(ds, u.id);
  assert.deepEqual([d.name, d.daily.length, d.daily[d.daily.length - 1].d, d.days], [u.name, 30, co.yest, undefined]);
  assert.deepEqual(d.trend.map(m => m.ym), ['2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual([d.trend[3].current, d.trend[3].hours], [true, Math.round(d.month.reg / H * 10) / 10]);
  assert.ok(d.trend[2].hours > 100);
  const fresh = personDetail(ds, co.users[12].id);
  assert.deepEqual([fresh.daily.filter(x => x.st).length, fresh.trend.length], [4, 1], '入职 4 天的人只有 4 天日报');
  assert.equal(personDetail(ds, 'nobody'), null);
});
test('整链：换一个时刻看。早上 8 点多数人还没到上班时间，不会报成未签到', async () => {
  const early = MOCK_NOW - 9 * H - 24 * M, c2 = mockCompany(early), r = await createSync(c2.raw, {})(early, true), k = overview(buildDataset(r.raw, early)).kpi;
  assert.ok(k.before > 30, '没到上班时间的人数 ' + k.before);
  assert.equal(k.due, k.present + k.absentN + k.before);
  assert.ok(k.absentN <= 2, '8 点就被算成未签到的人数 ' + k.absentN);
  assert.ok(k.present > 5, '早班已经到了');
  assert.ok(k.rate > 70, '8 点的出勤率不该因为多数人没到点而很低：' + k.rate);
});
test('取数：打卡记录只保留时间、类型、异常、标准时间', async () => {
  const c = client(async () => ({ errcode: 0, checkindata: [{ userid: 'a', checkin_time: 100, checkin_type: '上班打卡', exception_type: '时间异常;地点异常', sch_checkin_time: 90, location_title: 'X', wifiname: 'Y', deviceid: 'Z', lat: 1, lng: 2, notes: 'n' },
    { userid: 'b', checkin_time: 100, checkin_type: '上班打卡' }, { userid: 'a', checkin_type: '上班打卡' }] }));
  assert.deepEqual([...await fetchPunches(c, ['a'], 0, 200)], [['a', [{ t: 100, type: '上班打卡', ex: ['时间异常', '地点异常'], sch: 90 }]]]);
});
