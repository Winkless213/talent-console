// 工作与绩效：重点事项、岗位业绩、人效。这一块企业微信里没有，全是示例数据（core/demo.js），口径见系统设置里的「指标口径」。
import { esc, md, fmt, r1, sum, GRADE, TASK, card, tiles, table, tag, who, meter, num, delta, segs } from '../ui.js';
import { line, cols, bars } from '../charts.js';
import { peopleX, workSummary } from '../../core/views.js';

// ts：重点事项只看哪种状态；fam：岗位业绩看哪个岗位族
const state = { ts: '', fam: '' };
const NA = '<span class="na">—</span>';
// 每工时产出：数大的取整，数小的留两位
const per = v => v == null ? '—' : v >= 100 ? fmt(Math.round(v)) : v >= 10 ? r1(v) : Math.round(v * 100) / 100;
// 表格里的近几个月走势：一根小柱一个月，最后一根是本月
const mini = (trend, months) => `<span class="mini" data-tip="${esc('近 ' + months.length + ' 个月的目标完成率|' + months.map((m, i) => `${+m.slice(5)} 月 ${trend[i] == null ? '—' : trend[i] + '%'}`).join('，'))}">${trend.map(v => v == null ? '<i class="no"></i>' : `<i style="height:${Math.round(3 + Math.max(0, Math.min(1, (v - 60) / 70)) * 19)}px"></i>`).join('')}</span>`;

function tasks({ ds, x, dept, by }) {
  const w = workSummary(ds, x, dept), all = x.tasks.filter(t => !dept || by.get(t.owner)?.dept === dept), n = s => all.filter(t => t.status === s).length;
  const cur = Object.hasOwn(TASK, state.ts) ? state.ts : '', rank = { overdue: 0, doing: 1, done: 2 };
  const list = (cur ? all.filter(t => t.status === cur) : all).sort((a, b) => rank[a.status] - rank[b.status] || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  return tiles([
    { lab: '任务完成率', val: num(w.tasks.rate, 1, '%'), sub: `本月 ${w.tasks.done} / ${w.tasks.total} 项` },
    { lab: '逾期任务', val: num(w.tasks.overdue, 0, '项'), sub: '过了期限还没办结' },
    { lab: '平均工作进度', val: num(w.avgProgress, 0, '%'), sub: `${w.n} 人参与统计` },
    { lab: '重点事项', val: num(all.length, 0, '项'), sub: `进行中 ${n('doing')} · 已逾期 ${n('overdue')}` }
  ])
    + `<div class="bar">${segs('ts', [['', '全部', all.length], ['overdue', '已逾期', n('overdue')], ['doing', '进行中', n('doing')], ['done', '已完成', n('done')]], cur)}</div>`
    + `<div class="row c21">${card('重点事项', table([
      ['事项', t => esc(t.name)], ['负责人', t => who(by.get(t.owner))], ['部门', t => esc(by.get(t.owner)?.dept)], ['状态', t => tag(...TASK[t.status])],
      ['期限', t => t.status === 'done' ? `<span class="dim">${md(t.doneAt)} 完成</span>` : t.status === 'overdue' ? `<b class="v-r">${md(t.due)} 到期</b>` : md(t.due) + ' 到期']
    ], list), { flush: true, demo: 1 })}`
    + `${card('各部门任务完成率', bars(w.byDept.map(d => ({ label: d.name, v: d.taskRate, text: d.taskRate == null ? '—' : d.taskRate + '%', tip: `${d.name}|完成率 ${d.taskRate}%，逾期 ${d.overdue} 项` })), { max: 100 }), { cls: 'side', demo: 1, note: '本月' })}</div>`;
}

function results({ ds, x, dept }) {
  const w = workSummary(ds, x, dept), list = peopleX(ds, x, dept), fam = w.families.find(f => f.key === state.fam) || w.families[0], o = fam?.rows[0]?.x.output;
  return tiles([
    { lab: '平均目标完成率', val: num(w.avgRate, 1, '%'), sub: '本月' },
    { lab: '平均质量指标', val: num(w.avgQuality, 1, '%'), sub: '各岗位自己的质量指标' },
    { lab: '绩效 A', val: num(list.filter(v => v.x.perf.grade === 'A').length, 0, '人'), sub: `共 ${list.length} 人参评` },
    { lab: '连续下降', val: num(list.filter(v => v.x.perf.decline).length, 0, '人'), sub: '近 3 个月一个月比一个月低', go: '#/analysis/signals?k=decline' }
  ])
    + `<div class="row c2">${card('目标完成率', line(w.trend.map(t => ({ label: +t.ym.slice(5) + ' 月', v: t.rate, tip: `${t.ym}|平均目标完成率 ${t.rate}%|${t.n} 人有数` })), { unit: '%', height: 190, every: 1, head: '月份', name: '平均目标完成率' }), { demo: 1, note: '近 6 个月的平均' })}`
    + `${card('各部门', table([['部门', d => esc(d.name)], ['人数', d => d.n, 'num'], ['目标完成率', d => meter(d.rate, 130, d.rate + '%')], ['质量', d => d.quality + '%', 'num'], ['人效', d => d.eff == null ? NA : d.eff.toFixed(2), 'num']], w.byDept), { flush: true, demo: 1 })}</div>`
    + (fam ? `<div class="bar">${segs('fam', w.families.map(f => [f.key, f.name + '岗位', f.rows.length]), fam.key)}</div>`
      + card(`${fam.name}岗位的业绩`, table([
        ['姓名', v => who(v.p)], ['岗位', v => esc(v.p.post)], [`本月${o.name}（${o.unit}）`, v => `${fmt(v.x.output.value)}<span class="dim"> / ${fmt(v.x.output.target)}</span>`, 'num'],
        ['目标完成率', v => meter(v.x.perf.rate, 130, v.x.perf.rate + '%')], ['绩效', v => tag(v.x.perf.grade, GRADE[v.x.perf.grade])], [o.qName, v => v.x.perf.quality + '%', 'num'], ['近 6 个月', v => mini(v.x.perf.trend, x.months)]
      ], [...fam.rows].sort((a, b) => b.x.perf.rate - a.x.perf.rate)), { flush: true, demo: 1, note: '按目标完成率从高到低' }) : '');
}

function efficiency({ ds, x, dept }) {
  const w = workSummary(ds, x, dept), list = peopleX(ds, x, dept).filter(v => v.x.eff != null).sort((a, b) => b.x.eff - a.x.eff);
  // 横轴上的字要短：六根柱子在半张卡片里，每根下面只有五十来个像素
  const cuts = [[0, .8, '0.8 以下'], [.8, .9, '0.8–0.9'], [.9, 1, '0.9–1.0'], [1, 1.1, '1.0–1.1'], [1.1, 1.2, '1.1–1.2'], [1.2, 99, '1.2 以上']];
  return tiles([
    { lab: '人效指数', val: num(w.effAvg, 2), sub: w.effAvg != null && w.effPrev != null ? delta(w.effAvg - w.effPrev, '', 2) + ' 较上月' : '同岗位中位数 = 1.00' },
    { lab: '明显高于同岗位', val: num(list.filter(v => v.x.eff >= 1.1).length, 0, '人'), sub: '人效指数 1.10 及以上' },
    { lab: '明显低于同岗位', val: num(list.filter(v => v.x.eff <= .9).length, 0, '人'), sub: '人效指数 0.90 及以下' },
    { lab: '人均计入工时', val: num(list.length ? r1(sum(list, v => v.x.output.hours) / list.length) : null, 1, '小时'), sub: '本月，来自考勤' }
  ])
    + `<div class="row c2">${card('各部门人效', bars(w.byDept.map(d => ({ label: d.name, v: d.eff, text: d.eff == null ? '—' : d.eff.toFixed(2) })), { max: 1.4 }), { demo: 1, note: '1.00 是同岗位的中间水平' })}`
    + `${card('人效指数的分布', cols(cuts.map(([a, b, label]) => ({ label, v: list.filter(v => v.x.eff >= a && v.x.eff < b).length, mark: a === 1 || b === 1, tip: `人效指数 ${label}|${list.filter(v => v.x.eff >= a && v.x.eff < b).length} 人` })), { height: 150, head: '人效指数', name: '人数' }), { demo: 1, note: '深色两档紧挨着 1.00' })}</div>`
    + card('每个人的人效', table([
      ['姓名', v => who(v.p)], ['岗位', v => esc(v.p.post)], ['本月工时', v => v.x.output.hours + ' 小时', 'num'], ['本月产出', v => `${fmt(v.x.output.value)} ${v.x.output.unit}`, 'num'],
      ['每工时产出', v => per(v.x.output.per), 'num'], ['同岗位基准', v => per(v.x.output.basis) + (v.x.output.peers === 'family' ? '<span class="dim"> 按岗位族</span>' : ''), 'num'],
      ['人效指数', v => meter(v.x.eff, 1.5, v.x.eff.toFixed(2))], ['较上月', v => v.x.effPrev == null ? NA : delta(v.x.eff - v.x.effPrev, '', 2)]
    ], list), { flush: true, demo: 1, note: '从高到低' })
    + '<p class="hint">人效指数 = 本人每工时的产出 ÷ 同岗位的中位数（同岗位不足 3 人时按岗位族算）。工时用考勤里本月的计入工时，所以只和做同样工作的人比，不拿在岗时间长短评价人。</p>';
}

const VIEW = { tasks, results, efficiency };
export default { state, render: c => VIEW[c.tab](c) };
