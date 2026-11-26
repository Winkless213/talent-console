// 人才评价：人才盘点（等级和九宫格）、岗位胜任、主管评价。这一块企业微信里没有，全是示例数据，等级和判断的口径见系统设置里的「指标口径」。
import { esc, r1, sum, GRADE, LEVEL, card, tiles, table, tag, who, meter, num, segs, names } from '../ui.js';
import { bars, radar } from '../charts.js';
import { peopleX, talentSummary } from '../../core/views.js';
import { DEMO_RULES as R, FAMILY_NAME } from '../../core/demo.js';

// sel：人才盘点里选中的等级（lv:名称）或九宫格的格子（c:潜力-绩效）；fit：岗位胜任只看哪种判断；rv：主管评价只看待确认或已确认
const state = { sel: '', fit: '', rv: '' };
const NA = '<span class="na">—</span>';
// 九宫格每一格叫什么。键是 潜力-绩效
const BOX = { 'high-low': '待发展', 'high-mid': '高潜力', 'high-high': '明星', 'mid-low': '待观察', 'mid-mid': '中坚', 'mid-high': '骨干', 'low-low': '待改进', 'low-mid': '稳定', 'low-high': '专家' };
const BAND = { high: '高', mid: '中', low: '低' };

function inventory({ ds, x, dept, by }) {
  const t = talentSummary(ds, x, dept), cells = t.nine.flat(), most = Math.max(1, ...cells.map(c => c.ids.length)), lv = k => t.levels.find(l => l.name === k).n;
  const level = t.levels.find(l => 'lv:' + l.name === state.sel), cell = cells.find(c => `c:${c.pot}-${c.perf}` === state.sel);
  const picked = level ? [level.name, level.ids] : cell ? [`${BOX[cell.pot + '-' + cell.perf]}（潜力${BAND[cell.pot]}、绩效${BAND[cell.perf]}）`, cell.ids] : ['需要关注的人', t.warn];
  return tiles([
    { lab: '参评人数', val: num(t.n, 0, '人'), sub: '有打卡规则的在职人员' },
    { lab: '核心和优秀', val: num(lv('核心人才') + lv('优秀人才'), 0, '人'), sub: `核心 ${lv('核心人才')} · 优秀 ${lv('优秀人才')}` },
    { lab: '高潜人才', val: num(lv('高潜人才'), 0, '人'), sub: `潜力高，司龄不满 ${R.potMonths / 12} 年` },
    { lab: '待提升', val: num(lv('待提升'), 0, '人'), sub: `绩效 C，或能力低于 ${R.weakAbility} 分` },
    { lab: '平均能力评分', val: num(t.avgAbility, 1, '分'), sub: '五个维度的平均' },
    { lab: '需要关注', val: num(t.warn.length, 0, '人'), sub: '业绩连续下降或进度明显滞后' }
  ])
    + `<div class="row c12">${card('人才等级', bars(t.levels.map(l => ({ label: l.name, v: l.n, text: l.n + ' 人', val: 'lv:' + l.name, on: l === level })), { set: 'sel', lw: 70 }), { demo: 1, note: '点一行看名单' })}`
    + card('九宫格', `<div class="nine"><span class="nine-y">潜力　高 → 低</span><div class="nine-g">${cells.map(c => { const key = c.pot + '-' + c.perf;
      return `<button class="nine-c${c === cell ? ' on' : ''}" data-set="sel" data-v="c:${key}" style="--k:${(c.ids.length / most * .42).toFixed(3)}"${c === cell ? ' aria-pressed="true"' : ''}><b>${c.ids.length}</b><span>${BOX[key]}</span><small>潜力${BAND[c.pot]} · 绩效${BAND[c.perf]}</small></button>`; }).join('')}</div><span class="nine-x">绩效　低 → 高</span></div>`,
      { demo: 1, note: '点一格看名单；颜色越深人越多' }) + '</div>'
    + card(esc(picked[0]), names(picked[1].map(id => by.get(id)), '这一格现在没有人'), { demo: 1, note: `${picked[1].length} 人`, more: level || cell ? '<button class="btn sm" data-set="sel" data-v="">看需要关注的人</button>' : '' });
}

// 能力和产出放在一起看：先看能力够不够，再看产出
const verdict = e => e.ability.score < R.weakAbility ? ['能力待提升', 'o'] : e.ability.score >= R.fitAbility && (e.perf.grade === 'C' || e.perf.quality < R.fitQuality) ? ['岗位匹配待优化', 'b'] : e.perf.grade === 'C' ? ['业绩待提升', 'o'] : ['胜任', 'g'];
function fit({ ds, x, dept }) {
  const all = peopleX(ds, x, dept).map(v => ({ ...v, vd: verdict(v.x) })), n = k => all.filter(v => v.vd[0] === k).length, dims = all.length ? Object.keys(all[0].x.ability.dims) : [];
  const kinds = ['岗位匹配待优化', '能力待提升', '业绩待提升', '胜任'].filter(n), cur = kinds.includes(state.fit) ? state.fit : '', list = (cur ? all.filter(v => v.vd[0] === cur) : all).sort((a, b) => b.x.ability.score - a.x.ability.score);
  const mean = (l, f) => l.length ? r1(sum(l, f) / l.length) : null, fams = [...new Set(all.map(v => v.x.family))], avgs = dims.map(d => [d, mean(all, v => v.x.ability.dims[d])]);
  return tiles([
    { lab: '胜任', val: num(n('胜任'), 0, '人'), sub: '能力和产出都达标' },
    { lab: '岗位匹配待优化', val: num(n('岗位匹配待优化'), 0, '人'), sub: `能力满 ${R.fitAbility} 分，产出不理想`, go: '#/analysis/signals?k=fit' },
    { lab: '能力待提升', val: num(n('能力待提升'), 0, '人'), sub: `能力评分低于 ${R.weakAbility} 分` },
    { lab: '业绩待提升', val: num(n('业绩待提升'), 0, '人'), sub: '能力尚可，绩效为 C' }
  ])
    // 能力画像：雷达图看形状，旁边的横条写出每一项的分数。卡片窄（和右边的表格并排）时只放雷达图，分数在右边表格里也有
    + (all.length ? `<div class="row c12">${card('能力画像', `<div class="pf">${radar(avgs)}${bars(avgs.map(([d, v]) => ({ label: d, v, text: v })), { max: 100, lw: 64 })}</div>`, { demo: 1, note: `${all.length} 人的平均` })}`
      + `${card('各岗位族', table([['岗位族', f => esc(f.name)], ['人数', f => f.l.length, 'num'], ...dims.map(d => [d, f => mean(f.l, v => v.x.ability.dims[d]), 'num']), ['能力评分', f => `<b>${mean(f.l, v => v.x.ability.score)}</b>`, 'num']],
        fams.map(k => ({ name: FAMILY_NAME[k], l: all.filter(v => v.x.family === k) }))), { flush: true, demo: 1, note: '每一项的平均分' })}</div>` : '')
    + `<div class="bar">${segs('fit', [['', '全部', all.length], ...kinds.map(k => [k, k, n(k)])], cur)}</div>`
    + card('每个人的能力和判断', table([
      ['姓名', v => who(v.p)], ['岗位', v => esc(v.p.post)], ['能力评分', v => meter(v.x.ability.score, 100, v.x.ability.score + ' 分')], ...dims.map(d => [d, v => v.x.ability.dims[d], 'num']),
      ['绩效', v => tag(v.x.perf.grade, GRADE[v.x.perf.grade])], ['质量', v => v.x.perf.quality + '%', 'num'], ['判断', v => tag(...v.vd)]
    ], list), { flush: true, demo: 1, note: '按能力评分从高到低' });
}

function reviews({ x, dept, by }) {
  const all = x.reviews.map(v => ({ ...v, p: by.get(v.person) })).filter(v => v.p && (!dept || v.p.dept === dept)), done = all.filter(v => v.confirmed), todo = all.filter(v => !v.confirmed);
  const cur = ['todo', 'done'].includes(state.rv) ? state.rv : '', list = cur === 'todo' ? todo : cur === 'done' ? done : all;
  return tiles([
    { lab: '上月评价', val: num(all.length, 0, '份'), sub: all[0] ? all[0].period + ' 的月度评价' : '' },
    { lab: '本人已确认', val: num(done.length, 0, '份'), sub: all.length ? `占 ${Math.round(done.length / all.length * 100)}%` : '' },
    { lab: '待本人确认', val: num(todo.length, 0, '份'), sub: '主管已写，本人还没看' },
    { lab: '评为 A', val: num(all.filter(v => v.grade === 'A').length, 0, '人'), sub: `评为 C 的 ${all.filter(v => v.grade === 'C').length} 人` }
  ])
    + `<div class="bar">${segs('rv', [['', '全部', all.length], ['todo', '待本人确认', todo.length], ['done', '已确认', done.length]], cur)}</div>`
    + card('主管评价', table([
      ['员工', v => who(v.p)], ['岗位', v => esc(v.p.post)], ['评价人', v => esc(v.reviewer) || NA], ['等级', v => tag(v.grade, GRADE[v.grade])], ['做得好的', v => esc(v.good), 'wrap'], ['待改进', v => esc(v.improve), 'wrap'],
      ['依据', v => v.evidence + ' 条记录', 'num'], ['本人确认', v => v.confirmed ? `<span class="dim">${v.confirmed.slice(5)} 已确认</span>` : tag('待确认', 'o')]
    ], list), { flush: true, demo: 1 })
    + '<p class="hint">评价由直属主管写，写的时候要挂上依据（事项、业绩记录），本人确认后才算数。这里的等级只是主管的月度评价，不直接等于人才等级。</p>';
}

const VIEW = { inventory, fit, reviews };
export default { state, render: c => VIEW[c.tab](c) };
