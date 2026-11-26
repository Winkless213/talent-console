// 人才驾驶舱：一屏看全局。上面的数都从 core/views.js 来，和各模块页面里的是同一个数。
import { esc, ic, md, weekday, clock, hmOf, stamp, card, tiles, table, meter, num, delta, more, pending } from '../ui.js';
import { line, cols, bars, spark, gauge, funnel } from '../charts.js';
import { cockpit, arrivalHist, signalsOf } from '../../core/views.js';

const hello = h => h < 5 ? '夜深了' : h < 11 ? '上午好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
const zero = '<span class="na">0</span>';
// 首屏右边的四个数：点了去对应的名单，圆点的颜色和别处的状态颜色一致
const stat = (href, n, tone, label) => `<a href="${href}">${num(n)}<span><i class="d-${tone}"></i>${label}</span></a>`;

// bare：这一页不要通用的页头，第一块概况自己就是页头
export default { dept: false, bare: true, render({ ds, x, sync }) {
  const c = cockpit(ds, x), k = c.kpi, cov = ds.meta.coverage, ah = arrivalHist(ds), sig = signalsOf(ds, x).filter(s => x || !s.demo);
  const odd = [k.lateN ? `${k.lateN} 人迟到` : '', k.absentN ? `${k.absentN} 人未到岗` : '', k.leaveN ? `${k.leaveN} 人请假` : ''].filter(Boolean);
  const hero = `<section class="card hero"><div class="hero-t"><h1 class="sr">人才驾驶舱</h1><p class="eyebrow">TODAY · ${md(c.today)} 周${weekday(c.today)}${sync.mock ? '<span class="wb" title="人名是占位名，数据按固定种子生成">演示数据</span>' : ''}</p>`
    + `<p class="hero-h">${hello(+clock(c.now).slice(0, 2))}，管理员</p>`
    + `<p class="hero-s">今天应到 <b>${k.due}</b> 人，已到 <b>${k.present}</b> 人；${odd.join('、') || '没有人迟到或缺勤'}。<span class="nw">数据截至 ${clock(c.now)}。</span></p>`
    + `<div class="hero-a"><a class="btn pri" href="#/attendance/cases">处理今日异常${ic('arrow', 14, 2.4)}</a><a class="btn" href="#/people">人员数据中心</a></div></div>`
    + `<div class="hero-g">${gauge(k.rate / 100, `今日出勤率 ${k.rate == null ? '暂无' : k.rate.toFixed(1) + '%'}`, `<b>${k.rate == null ? '—' : `<span data-count="${k.rate}" data-dec="1">${k.rate.toFixed(1)}</span><i>%</i>`}</b><small>今日出勤率</small>`)}</div>`
    + `<div class="hero-m">${stat('#/attendance/daily', k.onDuty, 'g', '当前在岗')}${stat('#/people?metric=late', k.lateN, 'o', '迟到')}${stat('#/people?metric=absent', k.absentN, 'r', '未到岗')}${stat('#/people?metric=leave', k.leaveN, 'b', '请假')}</div></section>`;
  const kpi = tiles([
    { lab: '在职人数', val: num(k.total) + '人', sub: `参与考勤 ${cov.people - cov.rule.none} 人`, go: '#/people' },
    { lab: '人效指数', demo: 1, off: !x, val: num(k.eff, 2), sub: k.eff != null && k.effPrev != null ? delta(k.eff - k.effPrev, '', 2) + ' 较上月' : '同岗位中位数 = 1.00', go: '#/work/efficiency' },
    { lab: '优秀人才', demo: 1, off: !x, val: num(k.star) + '人', sub: '核心人才和优秀人才', go: '#/rating/inventory' },
    { lab: '业绩达成率', demo: 1, off: !x, val: num(k.avgRate, 1) + '%', sub: '本月平均', go: '#/work/results', spark: x && spark(c.perfTrend.map(t => t.rate)) }
  ]);
  const todo = card('今天要处理的', c.todo.length ? `<div class="todo-l">${c.todo.map(t => `<a href="${t.go}"><i class="d-${t.tone}"></i><span>${t.label}</span><b>${t.n}</b><small>${t.unit}</small>${ic('right', 14, 2.4)}</a>`).join('')}</div>` : '<p class="note">今天没有需要处理的事项。</p>',
    { cls: 'ck-todo', note: c.todo.length ? `${c.todo.length} 类` : '' });
  const last = c.trend.findLast(t => t.rate != null);
  const trend = card('出勤率', line(c.trend.map(t => ({ label: md(t.d), v: t.rate, tip: `${t.d} 周${weekday(t.d)}|${t.rate == null ? '这一天没有人需要上班' : '出勤率 ' + t.rate + '%'}|实到 ${t.present} / 应到 ${t.due}，迟到 ${t.late} 人` })), { unit: '%', min: 90, max: 100, height: 200, name: '出勤率' }),
    { cls: 'ck-trend', note: `近 ${c.trend.length} 天，不含今天` + (last ? `；最近一天 ${last.rate}%` : ''), more: more('#/attendance', '考勤总览') });
  const arrive = card('今天几点到岗', ah.n ? cols(ah.bins.map(b => ({ label: hmOf(b.from), v: b.n, mark: ah.median >= b.from && ah.median < b.from + 1800, tip: `${hmOf(b.from)} - ${hmOf(b.from + 1800)}|${b.n} 人到岗` })), { height: 180, every: 3, values: true, head: '时间', name: '到岗人数' })
    : '<p class="note">今天还没有人打上班卡。</p>', { cls: 'ck-arrive', note: ah.n ? `${ah.n} 人已打卡，中间那个人 ${hmOf(ah.median)} 到` : '' });
  const depts = card('各部门今天的出勤', table([
    ['部门', d => `<a class="pl" href="#/people?dept=${encodeURIComponent(d.name)}">${esc(d.name)}</a>` + (d.name === ds.meta.company ? '<span class="dim" title="直接挂在公司下面、没有分到部门的人">直属</span>' : '')], ['人数', d => d.n, 'num'], ['出勤率', d => meter(d.rate, 100, d.rate == null ? '' : d.rate.toFixed(1) + '%')],
    ['在岗', d => d.onDuty || zero, 'num'], ['迟到', d => d.lateN || zero, 'num'], ['未到岗', d => d.absentN ? `<b class="v-r">${d.absentN}</b>` : zero, 'num'],
    ...(x ? [['业绩达成', d => d.perf == null ? '—' : d.perf.toFixed(1) + '%', 'num'], ['人效', d => d.eff == null ? '—' : d.eff.toFixed(2), 'num']] : [])], c.depts), { cls: 'ck-dept', flush: true, note: x ? '业绩和人效是示例数据' : '' });
  const ai = card('AI 提醒', `<div class="sig">${sig.map(s => `<a href="#/analysis/signals?k=${s.k}" title="${esc(s.basis)}"><span class="si t-${s.tone}">${ic(s.icon, 17, 2.2)}</span><span class="sig-t"><b>${s.name}</b><small>${esc(s.basis)}</small></span><strong>${s.ids.length}<i>人</i></strong></a>`).join('')}</div>`,
    { cls: 'ck-ai', note: '按固定口径算出来的，没有用大模型', more: more('#/analysis/signals', '全部') });
  const rest = !x ? pending('工作、业绩、人才评价、培养和招聘')
    : card('人才结构', bars(c.levels.map(l => ({ label: l.name, v: l.n, text: l.n + ' 人' }))), { cls: 'ck-lv', demo: 1, more: more('#/rating/inventory', '人才盘点') })
    + card('绩效分布', cols(c.grades.map(g => ({ label: g.name, v: g.n, tip: `绩效 ${g.name}|${g.n} 人` })), { height: 132, head: '绩效等级', name: '人数' }), { cls: 'ck-grade', demo: 1 })
    + card('业绩达成率', line(c.perfTrend.map(t => ({ label: +t.ym.slice(5) + ' 月', v: t.rate, tip: `${t.ym}|平均目标完成率 ${t.rate}%|${t.n} 人有数` })), { unit: '%', height: 132, every: 1, head: '月份', name: '平均目标完成率' }), { cls: 'ck-perf', demo: 1, note: '近 6 个月' })
    + card('招聘漏斗', funnel(c.funnel.map(f => ({ label: f.stage, n: f.n }))), { cls: 'ck-hire', demo: 1, more: more('#/hire', '招聘') });
  return `<div class="bento"><div class="ck-top">${hero}${kpi}</div>${todo}${trend}${arrive}${depts}${ai}${rest}</div>`
    + (sync.mock ? `<p class="hint">这是演示：人名是占位名，考勤由一套假的企业微信接口按固定种子生成，时钟固定在 ${stamp(c.now)}；工作、业绩、评价、培养、招聘是示例数据，卡片上都标了「示例」。</p>` : '');
} };
