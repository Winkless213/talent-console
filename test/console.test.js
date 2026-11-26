// 中台其余模块的口径测试：示例数据要固定、不含真实信息，同一个数在各个页面上要对得上。npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../core/lib.js';
import { buildDataset, overviewFor, personDetail } from '../core/model.js';
import { mockCompany, MOCK_NOW } from '../core/mock.js';
import { createSync } from '../core/sync.js';
import { demoExtras, LEVELS, GRADES, STAGES } from '../core/demo.js';
import { peopleX, talentSummary, workSummary, signalsOf, hireSummary, orgSummary, attendanceTrend, attendanceCases, attendanceDay, leaveRows, arrivalHist, trainingSummary, noticesOf, cockpit } from '../core/views.js';

const TD = '2026-11-21', YD = '2026-11-20';
const company = mockCompany();
const synced = await createSync(company.raw, { corpid: 'mock', secret: 'mock' })(MOCK_NOW, true);
const ds = buildDataset(synced.raw, MOCK_NOW);
const x = demoExtras(ds);
const sum = (l, f) => l.reduce((a, v) => a + f(v), 0);

test('时间段：按钮和自选日期落到同一段时，高亮对应的按钮', () => {
  assert.deepEqual([overviewFor(ds, {}).tab, overviewFor(ds, { p: 'yesterday' }).tab, overviewFor(ds, { p: 'd7' }).tab, overviewFor(ds, { p: 'month' }).tab], ['today', 'yesterday', 'd7', 'month']);
  assert.equal(overviewFor(ds, { p: 'custom', from: YD, to: YD }).tab, 'yesterday', '自选的日期正好是昨天');
  const mid = overviewFor(ds, { p: 'custom', from: addDays(TD, -4), to: addDays(TD, -2) });
  assert.deepEqual([mid.tab, mid.from, mid.to, mid.kind], ['', addDays(TD, -4), addDays(TD, -2), 'range']);
  assert.equal(overviewFor(ds, { p: 'today', dept: '客服中心' }).rows.every(r => r.dept === '客服中心'), true);
});

test('请假单：数据集里带上近一个月的请假单，只有申请人、状态、假别和起止时间', () => {
  const ids = new Set(ds.people.map(p => p.id));
  assert.ok(ds.leaves.length > 20);
  assert.ok(ds.leaves.every(a => ids.has(a.user) && a.items.length && a.items.every(it => it.name && it.to >= it.from)));
  assert.deepEqual(Object.keys(ds.leaves[0]).sort(), ['at', 'items', 'no', 'status', 'user']);
  assert.deepEqual(Object.keys(ds.leaves[0].items[0]).sort(), ['from', 'name', 'sec', 'to', 'unit']);
  const todays = ds.leaves.filter(a => a.items.some(it => it.from <= MOCK_NOW && it.to > MOCK_NOW - 86400)).map(a => a.status);
  for (const s of [1, 3, 6]) assert.ok(todays.includes(s), '今天有一张状态为 ' + s + ' 的单');
});

test('数据集可以原样转成 JSON 再用：本机服务就是这样把数据交给页面的', () => {
  const copy = JSON.parse(JSON.stringify(ds));
  assert.deepEqual(overviewFor(copy, { p: 'month' }), overviewFor(ds, { p: 'month' }));
  assert.deepEqual(personDetail(copy, ds.people[3].id), personDetail(ds, ds.people[3].id));
  assert.deepEqual(demoExtras(copy), x);
});

test('示例数据：固定种子，重复生成结果一样；不考勤的人（总经理、顾问）不参与评价', () => {
  assert.deepEqual(demoExtras(ds), x);
  const list = peopleX(ds, x);
  assert.equal(list.length, ds.people.filter(p => p.rule !== 'none').length);
  assert.ok(ds.people.filter(p => p.rule === 'none').every(p => !x.byId[p.id]));
  for (const { p, x: e } of list) {
    assert.ok(LEVELS.includes(e.level), p.name + ' 的人才等级');
    assert.ok(GRADES.includes(e.perf.grade));
    assert.ok(e.perf.rate >= 60 && e.perf.rate <= 130 && e.perf.quality >= 80 && e.perf.quality <= 100);
    assert.equal(e.perf.trend.length, x.months.length);
    assert.equal(e.perf.trend[e.perf.trend.length - 1], e.perf.rate, '趋势的最后一个月就是本月');
    assert.ok(e.work.tasks.done + e.work.tasks.overdue <= e.work.tasks.total);
    assert.ok(e.ability.score >= 50 && e.ability.score <= 100 && Object.keys(e.ability.dims).length === 5);
    assert.ok(e.salary >= 3000 && e.salary % 100 === 0);
  }
});

test('示例数据：人才等级按写明的规则来，页面上的判断依据和它一致', () => {
  for (const { p, x: e } of peopleX(ds, x)) {
    if (e.level === '核心人才') assert.ok(e.perf.grade === 'A' && e.ability.score >= 85 && p.tenure >= 12, p.name);
    if (e.level === '待提升') assert.ok(e.perf.grade === 'C' || e.ability.score < 70, p.name);
  }
  const t = talentSummary(ds, x);
  assert.equal(sum(t.levels, l => l.n), peopleX(ds, x).length, '每个人只落在一个等级里');
  assert.equal(sum(t.grades, g => g.n), peopleX(ds, x).length);
  assert.equal(sum(t.nine.flat(), c => c.ids.length), peopleX(ds, x).length, '九宫格不重不漏');
  assert.ok(t.levels.every(l => l.n > 0), '演示里每个等级都看得到人');
});

test('示例数据：不出现真实人名。员工是"姓 + 数字"的占位名，候选人只有姓和编号', () => {
  assert.ok(ds.people.every(p => /^[一-龥][一二三四五六七八九十]$/.test(p.name)));
  assert.ok(x.candidates.every(c => /^[一-龥]某$/.test(c.name) && /^C\d{3}$/.test(c.code)));
  const text = JSON.stringify(x);
  assert.equal(/1[3-9]\d{9}/.test(text), false, '没有手机号');
  assert.equal(/@|https?:/.test(text), false, '没有邮箱和网址');
  // 店铺、渠道只用泛称，不写具体是哪家平台、哪个品牌
  assert.equal(/天猫|淘宝|京东|抖音|拼多多|小红书|快手|唯品会/.test(text + JSON.stringify(ds)), false, '没有电商平台的名字');
});

test('工作与绩效：任务、业绩、人效的汇总和逐人明细对得上', () => {
  const w = workSummary(ds, x), list = peopleX(ds, x);
  assert.equal(w.tasks.total, sum(list, v => v.x.work.tasks.total));
  assert.equal(w.tasks.overdue, sum(list, v => v.x.work.tasks.overdue));
  assert.equal(w.trend.length, x.months.length);
  assert.equal(sum(w.byDept, d => d.n), list.length);
  const one = workSummary(ds, x, '客服中心');
  assert.equal(one.byDept.length, 1);
  assert.ok(one.tasks.total < w.tasks.total);
  // 人效指数 = 本人单位工时产出 ÷ 同岗基准；有工时的人才有
  for (const v of list) if (v.x.eff != null) assert.ok(v.x.eff > 0.3 && v.x.eff < 2.5 && v.x.output.hours > 0, v.p.name);
  assert.equal(x.tasks.every(t => x.byId[t.owner] && ['done', 'doing', 'overdue'].includes(t.status)), true);
});

test('信号：六个提醒各有判断依据，名单里的人确实满足', () => {
  const s = signalsOf(ds, x), by = Object.fromEntries(s.map(v => [v.k, v]));
  assert.deepEqual(s.map(v => v.k), ['att', 'behind', 'decline', 'promote', 'fit', 'long']);
  assert.ok(s.every(v => v.basis && v.ids.every(id => ds.people.some(p => p.id === id))));
  assert.ok(by.behind.ids.every(id => x.byId[id].work.progress < 80));
  for (const id of by.decline.ids) { const t = x.byId[id].perf.trend.slice(-3); assert.ok(t[0] > t[1] && t[1] > t[2], id); }
  assert.deepEqual(by.att.ids.sort(), ds.people.filter(p => p.flags.att).map(p => p.id).sort(), '考勤异常沿用人员数据中心的口径');
  assert.ok(by.decline.ids.length > 0 && by.promote.ids.length > 0 && by.fit.ids.length > 0);
});

test('招聘：漏斗逐级不增，需求和候选人对得上', () => {
  const h = hireSummary(x);
  assert.deepEqual(h.funnel.map(f => f.stage), STAGES);
  for (let i = 1; i < h.funnel.length; i++) assert.ok(h.funnel[i].n <= h.funnel[i - 1].n);
  assert.equal(h.funnel[0].n, x.candidates.length);
  assert.ok(x.candidates.every(c => x.jobs.some(j => j.id === c.job)));
  assert.equal(h.open, sum(x.jobs.filter(j => j.status === '招聘中'), j => j.headcount - j.filled));
});

test('组织：部门人数加起来是全员，岗位分布同理', () => {
  const o = orgSummary(ds);
  assert.equal(sum(o.depts, d => d.n), ds.people.length);
  assert.equal(sum(o.posts, d => d.n), ds.people.length);
  for (const d of o.depts) assert.equal(d.n, sum(d.teams, t => t.n), d.name + ' 的小组人数');
  assert.ok(o.depts.find(d => d.name === '运营中心').teams.some(t => t.name === '直播组'));
  // 直接挂在公司下面的人（总经理）单算一组，标出来：组织图上它不是和各部门并排的一个部门
  assert.equal(ds.meta.company, '演示公司');
  assert.deepEqual(o.depts.filter(d => d.root).map(d => [d.name, d.n]), [['演示公司', 1]]);
  assert.equal(o.depts.filter(d => !d.root).length, 5);
});

test('考勤管理：趋势、异常明细、单日明细、请假单', () => {
  const t = attendanceTrend(ds), last = t[t.length - 1], y = overviewFor(ds, { p: 'yesterday' }).kpi;
  assert.equal(t.length, ds.meta.days.length);
  assert.deepEqual([last.d, last.due, last.present, last.late], [YD, y.due, y.present, y.lateN], '趋势的最后一天就是"昨日"那一屏的数');
  const cases = attendanceCases(ds, { from: YD, to: YD });
  assert.equal(cases.filter(c => c.kind === 'absent' || c.kind === 'nopunch').length, y.absentN);
  assert.ok(cases.every(c => c.d === YD && c.what.length));
  assert.equal(attendanceCases(ds, { from: YD, to: YD, dept: '客服中心' }).every(c => c.dept === '客服中心'), true);
  const day = attendanceDay(ds, TD), yd = attendanceDay(ds, YD);
  assert.equal(day.length, ds.people.length);
  assert.equal(day.filter(r => r.late).length, overviewFor(ds, {}).kpi.lateN);
  assert.equal(yd.filter(r => r.st === 'late').length > 0, true);
  const lv = leaveRows(ds);
  assert.equal(lv.length, sum(ds.leaves, a => a.items.length));
  assert.ok(lv.every(r => r.name && r.statusText && r.days > 0));
});

test('到岗时间分布：每半小时一档，人数加起来就是今天打了上班卡的人', () => {
  const h = arrivalHist(ds), on = ds.people.filter(p => p.today.on != null);
  assert.equal(h.n, on.length);
  assert.equal(sum(h.bins, b => b.n), on.length);
  for (let i = 1; i < h.bins.length; i++) assert.equal(h.bins[i].from - h.bins[i - 1].from, 1800, '中间没有人的档也留着');
  const first = h.bins[0], last = h.bins[h.bins.length - 1];
  assert.ok(first.n > 0 && last.n > 0 && h.median >= first.from && h.median < last.from + 1800);
  assert.deepEqual(arrivalHist(ds, '没有这个部门'), { n: 0, bins: [], median: null });
});

test('培养与提醒：计划、导师、阶段回访、提醒预览都指向名单里的人', () => {
  const tr = trainingSummary(ds, x);
  assert.equal(sum(tr.mentors, m => m.n), tr.plans.length, '每个计划有且只有一位导师');
  assert.ok(tr.plans.every(pl => pl.progress >= 0 && pl.progress <= 100 && pl.goal));
  assert.ok(tr.outcomes.every(o => [30, 90, 180].includes(o.stage)));
  const n = noticesOf(ds, x);
  assert.ok(n.length >= 6 && n.every(v => v.title && v.text && v.basis && ['待核实', '已预览', '已处理'].includes(v.status)));
});

test('驾驶舱：首页上的数就是各模块里的数', () => {
  const c = cockpit(ds, x), t = talentSummary(ds, x), w = workSummary(ds, x), h = hireSummary(x), o = overviewFor(ds, {});
  assert.deepEqual([c.kpi.total, c.kpi.rate, c.kpi.lateN], [o.kpi.total, o.kpi.rate, o.kpi.lateN]);
  assert.equal(c.kpi.star, t.levels.filter(l => l.name === '核心人才' || l.name === '优秀人才').reduce((a, l) => a + l.n, 0));
  assert.equal(c.kpi.eff, w.effAvg);
  assert.equal(c.kpi.open, h.open);
  assert.equal(sum(c.depts, d => d.n), ds.people.length);
  assert.equal(c.todo.every(v => v.n > 0 && v.go), true);
  // 「今天要处理的」每一项点进去就是那几条：地址里带着对应的筛选，条数就是那一页筛出来的条数
  const todo = Object.fromEntries(c.todo.map(v => [v.label, v])), tr = trainingSummary(ds, x);
  assert.deepEqual(c.todo.map(v => v.go), ['#/people?metric=ai:att', '#/attendance/leave?ls=1&dept=', '#/analysis/signals?k=decline&dept=', '#/work/tasks?ts=overdue&dept=',
    '#/training/plans?ps=' + encodeURIComponent('已逾期') + '&dept=', '#/rating/reviews?rv=todo&dept=', '#/hire/interviews']);
  assert.deepEqual([todo['今日考勤异常'].n, todo['请假待审批'].n, todo['业绩连续下降'].n, todo['重点事项逾期'].n, todo['培养计划逾期'].n, todo['主管评价待确认'].n, todo['待进行的面试'].n],
    [o.rows.filter(r => r.flags.includes('att')).length, leaveRows(ds).filter(r => r.status === 1).length, signalsOf(ds, x).find(s => s.k === 'decline').ids.length, x.tasks.filter(t => t.status === 'overdue').length,
      tr.plans.filter(v => v.status === '已逾期').length, x.reviews.filter(v => !v.confirmed).length, h.interviews.length]);
  // 没有示例数据（接真实企业微信）时，驾驶舱只出考勤和组织，其余为空
  const real = cockpit(ds, null);
  assert.deepEqual([real.kpi.total, real.kpi.star, real.kpi.eff, real.levels], [o.kpi.total, null, null, null]);
});
