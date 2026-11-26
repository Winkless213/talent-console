// 招聘管理：招聘需求、面试跟进、入职交接。候选人是示例数据，只有姓和编号；近一个月入职的人来自企业微信的花名册。
import { esc, md, weekday, card, tiles, table, tag, who, num, typeTag } from '../ui.js';
import { funnel } from '../charts.js';
import { hireSummary } from '../../core/views.js';
import { STAGES } from '../../core/demo.js';
import { addDays } from '../../core/lib.js';

const JOB = { 招聘中: 'b', 待审批: 'o', 已招满: 'g' }, NA = '<span class="na">—</span>';
const cand = c => `<b>${esc(c.name)}</b><span class="dim"> ${c.code}</span>`;

function jobs({ x }) {
  const h = hireSummary(x);
  return tiles([
    { lab: '还缺', val: num(h.open, 0, '人'), sub: `${h.jobs.filter(j => j.status === '招聘中').length} 个岗位在招` },
    { lab: '跟进中的候选人', val: num(h.active, 0, '人'), sub: `共收到 ${x.candidates.length} 份简历` },
    { lab: '待进行的面试', val: num(h.interviews.length, 0, '场'), sub: '已经约好时间的', go: '#/hire/interviews' },
    { lab: '已入职', val: num(h.hired, 0, '人'), sub: '这一批需求里到岗的' }
  ])
    + card('招聘需求', table([
      ['岗位', j => `<b>${esc(j.post)}</b>`], ['部门', j => esc(j.dept)], ['用工', j => esc(j.type)], ['需要', j => j.headcount + ' 人', 'num'], ['已到岗', j => j.filled + ' 人', 'num'],
      ['候选人', j => j.cands ? `${j.cands} 人<span class="dim">，在跟进 ${j.active}</span>` : NA, 'num'], ['期望到岗', j => md(j.expect)], ['申请人', j => esc(j.applicant) || NA], ['状态', j => tag(j.status, JOB[j.status])]
    ], h.jobs), { flush: true, demo: 1 })
    + `<div class="row c2">${card('招聘漏斗', funnel(h.funnel.map(f => ({ label: f.stage, n: f.n }))), { demo: 1, note: '每一步还剩多少人' })}`
    + `${card('简历从哪来', table([['渠道', c => esc(c.name)], ['简历', c => c.n + ' 份', 'num'], ['已入职', c => c.hired + ' 人', 'num'], ['入职比例', c => Math.round(c.hired / c.n * 100) + '%', 'num']], [...h.channels].sort((a, b) => b.n - a.n)), { flush: true, demo: 1 })}</div>`;
}

function interviews({ ds, x }) {
  const l = hireSummary(x).interviews, today = ds.meta.today;
  return tiles([
    { lab: '今天', val: num(l.filter(c => c.interviewAt.startsWith(today)).length, 0, '场'), sub: `${md(today)} 周${weekday(today)}` },
    { lab: '明天', val: num(l.filter(c => c.interviewAt.startsWith(addDays(today, 1))).length, 0, '场'), sub: md(addDays(today, 1)) },
    { lab: '一面', val: num(l.filter(c => c.reach === 1).length, 0, '场'), sub: '第一轮' },
    { lab: '二面', val: num(l.filter(c => c.reach === 2).length, 0, '场'), sub: '第二轮' }
  ])
    + card('已经约好的面试', table([
      ['时间', c => `<b>${md(c.interviewAt.slice(0, 10))}</b> ${c.interviewAt.slice(11)}<span class="dim"> 周${weekday(c.interviewAt.slice(0, 10))}</span>`], ['候选人', cand], ['应聘岗位', c => esc(c.post)], ['部门', c => esc(c.dept)],
      ['轮次', c => tag(STAGES[c.reach], c.reach === 2 ? 'p' : 'b')], ['面试官', c => esc(c.interviewer) || NA], ['渠道', c => esc(c.channel)]
    ], l, '现在没有约好的面试'), { flush: true, demo: 1, note: '按时间先后' })
    + '<p class="hint">候选人只显示姓和编号，不含联系方式；面试官取用人部门的负责人。</p>';
}

function onboard({ ds, x, by }) {
  const job = id => x.jobs.find(j => j.id === id), wait = x.candidates.filter(c => c.reach === 3 && c.state === 'active'), from = addDays(ds.meta.today, -30);
  const fresh = ds.people.filter(p => p.join && p.join >= from).sort((a, b) => a.join < b.join ? 1 : -1), plan = id => x.plans.find(v => v.person === id);
  return tiles([
    { lab: '待入职', val: num(wait.length, 0, '人'), sub: '已发录用，还没到岗' },
    { lab: '近 30 天入职', val: num(fresh.length, 0, '人'), sub: '来自花名册的入职日期' },
    { lab: '有带教计划', val: num(fresh.filter(p => plan(p.id)).length, 0, '人'), sub: '新人里已经安排导师的' }
  ])
    + `<div class="row c2 wide">${card('待入职的候选人', table([['候选人', cand], ['岗位', c => esc(c.post)], ['部门', c => esc(c.dept)], ['期望到岗', c => md(job(c.job).expect)], ['接收人', c => esc(job(c.job).applicant) || NA]], wait, '现在没有待入职的人'), { flush: true, demo: 1 })}`
    + `${card('刚入职的同事', table([['员工', p => who(p)], ['部门', p => esc(p.dept)], ['岗位', p => esc(p.post)], ['入职日期', p => md(p.join)], ['用工', p => typeTag(p)],
      ['带教', p => plan(p.id) ? `${esc(plan(p.id).mentor) || '待分配'}<span class="dim"> 带</span>` : tag('没有安排', 'o')]], fresh, '近 30 天没有新入职的人'), { flush: true, note: '入职日期来自企业微信，带教是示例数据' })}</div>`
    + '<p class="hint">交接就是把人接住：到岗当天企业微信通讯录里出现这个人，花名册的入职日期就是到岗日期；接下来要有人带，所以右边把新人有没有带教计划一并列出来。</p>';
}

const VIEW = { jobs, interviews, onboard };
export default { dept: false, render: c => VIEW[c.tab](c) };
