// 考勤管理：总览、某一天所有人的明细、异常跟进、请假单。数据全部来自企业微信的打卡日报、今天的打卡记录和请假审批。
import { esc, md, weekday, clock, hrs, mins, ST, st, card, tiles, table, tag, who, meter, num, delta, segs, pick } from '../ui.js';
import { line, cols, heat, spark, bars } from '../charts.js';
import { overviewFor, periodOf } from '../../core/model.js';
import { attendanceTrend, attendanceCases, attendanceDay, leaveRows } from '../../core/views.js';

// day：员工考勤看哪一天；st：只看哪种状态；p、kind：异常跟进的时段和类别；ls：请假单的状态
const state = { day: '', st: '', p: 'today', kind: '', ls: '' };
const NA = '<span class="na">—</span>';
const abn = t => t.late + t.miss + t.absent;
const dayTip = t => `${t.d} 周${weekday(t.d)}|` + (t.due ? `出勤率 ${t.rate}%，实到 ${t.present} / 应到 ${t.due}|迟到 ${t.late} 人、缺卡 ${t.miss} 人、缺勤 ${t.absent} 人，请假 ${t.leave} 人` : '这一天没有人需要上班');

function overview({ ds, dept }) {
  const o = overviewFor(ds, { dept }), k = o.kpi, m = overviewFor(ds, { p: 'month', dept }).kpi, tr = attendanceTrend(ds, dept), n = tr.length;
  // 热力图一行一个部门；整段时间都不用考勤的部门（比如只有总经理一个人）不画
  const rows = (dept ? [dept] : ds.depts).map(name => ({ label: name, cells: attendanceTrend(ds, name).map(t => ({ v: t.due ? abn(t) : null, tip: `${name}　` + dayTip(t) })) })).filter(r => r.cells.some(c => c.v != null));
  // 指标旁边的迷你走势：近两周每天的数
  const near = f => spark(tr.slice(-14).map(f));
  return tiles([
    { lab: '今日出勤率', val: num(k.rate, 1, '%'), sub: `实到 ${k.present} / 应到 ${k.due}`, spark: near(t => t.rate) },
    { lab: '当前在岗', val: num(k.onDuty, 0, '人'), sub: k.before ? `还有 ${k.before} 人没到上班时间` : `平均已在岗 ${k.inPost ?? '—'} 小时`, go: '#/attendance/daily' },
    { lab: '今日迟到', val: num(k.lateN, 0, '人'), sub: k.lateN ? `共 ${k.lateMin} 分钟` : '没有人迟到', go: '#/attendance/cases', spark: near(t => t.late) },
    { lab: '今日未到岗', val: num(k.absentN, 0, '人'), sub: `另有 ${k.leaveN} 人请假`, go: '#/attendance/cases', spark: near(t => t.absent) },
    { lab: '本月出勤率', val: num(m.rate, 1, '%'), sub: m.rate != null && m.prevRate != null ? delta(m.rate - m.prevRate, 'pp') + ' 较前一段' : '算到昨天' },
    { lab: '本月加班', val: num(m.otN, 0, '人'), sub: `共 ${m.otHours} 小时`, spark: near(t => t.ot) }
  ])
    + `<div class="row c2">${card('出勤率', line(tr.map(t => ({ label: md(t.d), v: t.rate, tip: dayTip(t) })), { unit: '%', min: 90, max: 100, height: 200, name: '出勤率' }), { note: `近 ${n} 天，不含今天` })}`
    + `${card('每天有多少人异常', cols(tr.map(t => ({ label: md(t.d), v: abn(t), tip: dayTip(t) })), { height: 200, every: 5, values: false, head: '日期', name: '异常人数' }), { note: '迟到、缺卡、缺勤的人数相加' })}</div>`
    + card(dept ? '这个部门每天的异常' : '哪个部门、哪天异常多', heat(rows, tr.map((t, i) => i % 5 === (n - 1) % 5 ? String(+t.d.slice(8)) : '')), { note: '一格一天，颜色越深，迟到、缺卡、缺勤的人越多；空心的格子是休息日' })
    + (dept ? '' : card('各部门本月', table([['部门', r => esc(r.name) + (r.name === ds.meta.company ? '<span class="dim" title="直接挂在公司下面、没有分到部门的人"> 直属</span>' : '')], ['人数', r => r.k.total, 'num'], ['出勤率', r => meter(r.k.rate, 100, r.k.rate == null ? '' : r.k.rate.toFixed(1) + '%')], ['迟到', r => r.k.lateN + ' 人', 'num'],
      ['加班', r => `${r.k.otN} 人 / ${r.k.otHours} 小时`, 'num'], ['请假', r => r.k.leaveN + ' 人', 'num'], ['缺勤', r => r.k.absentN ? `<b class="v-r">${r.k.absentN} 人</b>` : '0 人', 'num'], ['平均工时', r => r.k.hours == null ? NA : r.k.hours + ' 小时', 'num']],
      ds.depts.map(name => ({ name, k: overviewFor(ds, { p: 'month', dept: name }).kpi }))), { flush: true, note: o.monthStart > o.yest ? '今天 1 号，明天起有数' : `${md(o.monthStart)} 至 ${md(o.yest)}` }));
}

// 明细里先列有状况的人
const ORDER = ['unsigned', 'absent', 'nopunch', 'miss', 'late', 'early', 'ot', 'in', 'normal', 'out', 'restwork', 'norule', 'leave', 'before', 'rest', 'none', ''];
function daily({ ds, dept }) {
  // day 可能是地址里带进来的：先看是不是日期的样子，再看在不在有数的范围里，都不是就看今天
  const m = ds.meta, first = m.days[0] || m.today, day = /^\d{4}-\d{2}-\d{2}$/.test(state.day) && state.day >= first && state.day <= m.today ? state.day : m.today, T = day === m.today;
  const all = attendanceDay(ds, day, dept).sort((a, b) => ORDER.indexOf(a.st) - ORDER.indexOf(b.st)), n = k => all.filter(r => r.st === k).length, kinds = ORDER.filter(n);
  const cur = kinds.includes(state.st) ? state.st : '', list = cur ? all.filter(r => r.st === cur) : all;
  return `<div class="bar"><input class="inp" type="date" data-set="day" value="${day}" min="${first}" max="${m.today}" aria-label="看哪一天">${segs('day', [[m.today, '今天'], [m.yest, '昨天']], day)}`
    + pick('st', [['', `全部状态（${all.length}）`], ...kinds.map(k => [k, `${ST[k][0]}（${n(k)}）`])], cur, '考勤状态')
    + `<span class="count">${T ? `今天，截至 ${clock(m.now)}` : `${day} 周${weekday(day)}`}，${list.length} 人</span></div>`
    + card(T ? '今天的考勤' : '这一天的考勤', table([
      ['姓名', r => who(r, r.team)], ['部门', r => esc(r.dept)], ['岗位', r => esc(r.post)],
      ['状态', r => st(r.st) + (r.leave.length ? `<span class="dim"> ${esc(r.leave.join('、'))}</span>` : r.pending ? '<span class="dim"> 请假待审批</span>' : '')],
      ['班次', r => esc(r.shift) || NA], ['打卡', r => r.time || NA],
      ['迟到', r => r.late ? `<b class="v-o">${r.lateSec ? mins(r.lateSec) + ' 分钟' : '是'}</b>` : NA, 'num'], ['早退', r => r.earlySec > 0 ? `<b class="v-o">${mins(r.earlySec)} 分钟</b>` : NA, 'num'],
      ['加班', r => r.ot > 0 ? `<b class="v-p">${hrs(r.ot)} 小时</b>` : NA, 'num'], [T ? '已在岗' : '计入工时', r => (T ? r.span : r.reg) > 0 ? hrs(T ? r.span : r.reg) + ' 小时' : NA, 'num']
    ], list), { flush: true, note: T ? '来自今天的打卡记录' : '来自企业微信的打卡日报' });
}

const KIND = { absent: ['旷工', 'r'], unsigned: ['未签到', 'r'], nopunch: ['未打卡', 'o'], miss: ['缺卡', 'o'], late: ['迟到', 'o'], early: ['早退', 'o'] };
function cases({ ds, dept, by }) {
  const P = ['today', 'yesterday', 'd7', 'month'].includes(state.p) ? state.p : 'today', all = attendanceCases(ds, { ...periodOf(ds.meta, P), dept });
  const n = k => all.filter(r => r.kind === k).length, kinds = Object.keys(KIND).filter(n), cur = kinds.includes(state.kind) ? state.kind : '', list = cur ? all.filter(r => r.kind === cur) : all;
  // 同一个人这段时间里出了几次状况
  const times = new Map();
  for (const r of all) times.set(r.id, (times.get(r.id) || 0) + 1);
  const repeat = [...times].filter(v => v[1] >= 3).sort((a, b) => b[1] - a[1]);
  return `<div class="bar">${segs('p', [['today', '今日'], ['yesterday', '昨日'], ['d7', '近7天'], ['month', '本月']], P)}${segs('kind', [['', '全部', all.length], ...kinds.map(k => [k, KIND[k][0], n(k)])], cur)}<span class="count">${list.length} 条</span></div>`
    + (repeat.length ? card('要重点跟进的人', `<div class="names">${repeat.map(([id, v]) => `<button data-emp="${esc(id)}">${esc(by.get(id).name)}<i>${v} 次</i></button>`).join('')}</div>`, { note: '这段时间里出了 3 次及以上状况' }) : '')
    + card('异常明细', table([
      ['日期', r => `${md(r.d)} <span class="dim">周${weekday(r.d)}</span>`], ['姓名', r => who(r)], ['部门', r => esc(r.dept) + (r.team ? `<span class="dim"> ${esc(r.team)}</span>` : '')], ['岗位', r => esc(r.post)],
      ['情况', r => r.what.map(w => tag(w, KIND[r.kind][1])).join(' ')], ['打卡', r => r.time || '<span class="dim">没有打卡</span>'], ['班次', r => esc(r.shift) || NA], ['补卡', r => r.fix ? `已补 ${r.fix} 次` : NA, 'num']
    ], list, '这段时间没有迟到、早退、缺卡、缺勤'), { flush: true })
    + '<p class="hint">补卡和请假在企业微信里办理，办完以后这里随打卡日报更新；这个页面只读，不会改动企业微信里的任何记录。跨多天的时段只算到昨天，因为今天的日报企业微信还没有生成。</p>';
}

// 审批单状态 -> 色调。企业微信的状态：1 审批中、2 已通过、3 已驳回、4 已撤销、6 通过后撤销
const LS = { 1: 'b', 2: 'g', 3: 'r' };
function leave({ ds, dept }) {
  const all = leaveRows(ds, dept), today = ds.meta.today, ok = all.filter(r => r.status === 2), wait = all.filter(r => r.status === 1), other = all.filter(r => r.status !== 1 && r.status !== 2);
  const cur = ['1', '2', 'x'].includes(state.ls) ? state.ls : '', list = cur === '1' ? wait : cur === '2' ? ok : cur === 'x' ? other : all;
  const kinds = [...new Set(ok.map(r => r.kind))].map(name => ({ label: name, v: ok.filter(r => r.kind === name).length })).sort((a, b) => b.v - a.v);
  return tiles([
    { lab: '审批中', val: num(wait.length, 0, '张'), sub: '批下来之前不算请假' },
    { lab: '已通过', val: num(ok.length, 0, '张'), sub: '近一个月提交的' },
    { lab: '今天在休', val: num(new Set(ok.filter(r => r.from <= today && r.to >= today).map(r => r.id)).size, 0, '人'), sub: '假期包含今天' },
    { lab: '驳回或撤销', val: num(other.length, 0, '张'), sub: '不计入请假' }
  ])
    + `<div class="bar">${segs('ls', [['', '全部', all.length], ['1', '审批中', wait.length], ['2', '已通过', ok.length], ['x', '驳回或撤销', other.length]], cur)}</div>`
    + `<div class="row c21">${card('请假单', table([
      ['申请人', r => who(r)], ['部门', r => esc(r.dept)], ['假别', r => esc(r.kind)], ['时间', r => r.from === r.to ? r.from : `${r.from} 至 ${md(r.to)}`],
      ['时长', r => r.unit === 'hour' ? r.hours + ' 小时' : r.days + ' 天', 'num'], ['状态', r => tag(r.statusText, LS[r.status] || 'n')], ['提交', r => r.at ? md(r.at) : NA]
    ], list, '没有这种状态的请假单'), { flush: true })}`
    + `${card('请了哪些假', kinds.length ? bars(kinds.map(v => ({ ...v, text: v.v + ' 张' }))) : '<p class="note">近一个月没有已通过的请假。</p>', { cls: 'side', note: '已通过的单' })}</div>`
    + '<p class="hint">只取申请人、状态、假别、起止时间和时长；请假事由、附件和审批意见不取。</p>';
}

const VIEW = { overview, daily, cases, leave };
export default { state, render: c => VIEW[c.tab](c) };
