// 培养发展：培养计划、导师带教、入职后的阶段回访。这一块企业微信里没有，全是示例数据。
import { esc, md, card, tiles, table, tag, who, meter, num, segs, names } from '../ui.js';
import { trainingSummary } from '../../core/views.js';

// ps：培养计划只看哪种状态
const state = { ps: '' };
const PLAN = { 进行中: 'b', 已完成: 'g', 已逾期: 'r' }, KIND = { 主管储备: 'p', 重点培养: 'g', 跟进提升: 'o', 试用期带教: 'b' }, RESULT = { 达标: 'g', 待改进: 'o', 待评: 'n' };

function plans({ ds, x, dept }) {
  const all = trainingSummary(ds, x, dept).plans, n = s => all.filter(v => v.status === s).length, cur = Object.hasOwn(PLAN, state.ps) ? state.ps : '';
  const list = (cur ? all.filter(v => v.status === cur) : all).sort((a, b) => (a.status === '已逾期' ? 0 : 1) - (b.status === '已逾期' ? 0 : 1) || (a.due < b.due ? -1 : 1));
  return tiles([
    { lab: '进行中', val: num(n('进行中'), 0, '个'), sub: `共 ${all.length} 个培养计划` },
    { lab: '已完成', val: num(n('已完成'), 0, '个'), sub: '进度到了 100%' },
    { lab: '已逾期', val: num(n('已逾期'), 0, '个'), sub: '过了结束日期还没完成' },
    { lab: '导师待分配', val: num(all.filter(v => v.mentor === '待分配').length, 0, '人'), sub: '还没有指定带教的人' }
  ])
    + `<div class="bar">${segs('ps', [['', '全部', all.length], ...Object.keys(PLAN).map(s => [s, s, n(s)])], cur)}</div>`
    + card('培养计划', table([
      ['员工', v => who(v)], ['部门', v => esc(v.dept)], ['类型', v => tag(v.kind, KIND[v.kind])], ['目标', v => esc(v.goal), 'wrap'], ['导师', v => esc(v.mentor)],
      ['进度', v => meter(v.progress)], ['起止', v => `${md(v.start)} 至 ${md(v.due)}`], ['状态', v => tag(v.status, PLAN[v.status])]
    ], list), { flush: true, demo: 1 });
}

function mentors({ ds, x, dept, by }) {
  const m = trainingSummary(ds, x, dept).mentors, real = m.filter(v => !v.none);
  return tiles([
    { lab: '带教的导师', val: num(real.length, 0, '人'), sub: '手上有培养计划的主管' },
    { lab: '人均带教', val: num(real.length ? Math.round(real.reduce((a, v) => a + v.n, 0) / real.length * 10) / 10 : null, 1, '人'), sub: '每位导师带几个人' },
    { lab: '带得最多', val: num(real[0]?.n ?? null, 0, '人'), sub: real[0] ? esc(real[0].name) : '' },
    { lab: '有逾期计划的导师', val: num(real.filter(v => v.late).length, 0, '人'), sub: '需要过问一下进度' }
  ])
    + card('导师带教', table([
      ['导师', v => v.none ? tag('待分配', 'o') : `<b>${esc(v.name)}</b>`], ['带教人数', v => v.n + ' 人', 'num'], ['平均进度', v => meter(v.avg)], ['逾期', v => v.late ? `<b class="v-r">${v.late} 个</b>` : '无', 'num'],
      ['学员', v => names(v.ids.map(id => by.get(id))), 'wrap']
    ], m), { flush: true, demo: 1, note: '导师取直属主管，没有的取部门负责人' });
}

function outcomes({ ds, x, dept }) {
  const all = trainingSummary(ds, x, dept).outcomes, n = s => all.filter(v => v.result === s).length;
  return tiles([
    { lab: '达标', val: num(n('达标'), 0, '次'), sub: '回访结论达到岗位要求' },
    { lab: '待改进', val: num(n('待改进'), 0, '次'), sub: '需要定改进计划' },
    { lab: '待评', val: num(n('待评'), 0, '次'), sub: '回访日期快到了，还没评' }
  ])
    + card('入职后的阶段回访', table([
      ['员工', v => who(v)], ['部门', v => esc(v.dept)], ['岗位', v => esc(v.post)], ['入职日期', v => esc(v.join)], ['阶段', v => `入职满 ${v.stage} 天`], ['回访日期', v => v.date], ['结论', v => tag(v.result, RESULT[v.result])]
    ], all, '近半年没有新入职的人'), { flush: true, demo: 1, note: '入职满 30、90、180 天各回访一次' })
    + '<p class="hint">入职日期来自企业微信的人事花名册；回访的结论是示例数据。</p>';
}

const VIEW = { plans, mentors, outcomes };
export default { state, render: c => VIEW[c.tab](c) };
