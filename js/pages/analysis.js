// AI人才分析：人才观察、异常分析、企微提醒预览。这里的"分析"是按固定口径从数据里算出来、拼成句子的，没有用大模型；每条的口径都写在旁边。
import { esc, ic, card, tag, names, segs, toast } from '../ui.js';
import { AI, aiRule } from '../rules.js';
import { overviewFor, RULES } from '../../core/model.js';
import { signalsOf, noticesOf, workSummary, talentSummary, cockpit } from '../../core/views.js';

// k：异常分析只看哪一个提醒；ns、nk：提醒预览只看哪种状态、哪一类
const state = { k: '', ns: '', nk: '' };
const DISCLAIM = '<p class="hint">这里的结论是按固定口径从数据里算出来、再拼成句子的，没有用大模型，也不替人做决定；重要的人员决策由负责人确认。每条口径见系统设置里的「提醒规则」。</p>';
// 全部提醒：业绩和人才方面的六个，加上考勤里另外四个
const allSignals = (ds, x, dept) => [...signalsOf(ds, x, dept).filter(s => x || !s.demo),
  ...AI.filter(a => a[0] !== 'att' && a[0] !== 'long').map(([k, name, icon, tone]) => ({ k, name, icon, tone, basis: aiRule(k, RULES), ids: ds.people.filter(p => (!dept || p.dept === dept) && p.flags[k]).map(p => p.id) }))];

function insights({ ds, x, dept, by }) {
  const k = overviewFor(ds, { dept }).kpi, m = overviewFor(ds, { p: 'month', dept }).kpi, sig = allSignals(ds, x, dept).filter(s => s.ids.length), w = x && workSummary(ds, x, dept), t = x && talentSummary(ds, x, dept);
  const n = key => sig.find(s => s.k === key)?.ids.length || 0, lv = name => t.levels.find(l => l.name === name).n;
  // 部门之间比一比：人太少的部门（不足 3 人）不参与，免得一个人的数被当成部门的数
  const depts = cockpit(ds, x).depts.filter(d => d.n >= 3), top = (f, dir) => depts.filter(d => f(d) != null).sort((a, b) => (f(b) - f(a)) * dir)[0];
  const pair = (name, f, unit, dec) => { const hi = top(f, 1), lo = top(f, -1); return hi && lo && hi !== lo ? `<li><span><b>${name}</b>：最高的是${esc(hi.name)}（${f(hi).toFixed(dec)}${unit}），最低的是${esc(lo.name)}（${f(lo).toFixed(dec)}${unit}）。</span></li>` : ''; };
  const tips = [
    n('promote') ? `有 <b>${n('promote')} 人</b>处于主管储备状态：绩效和能力持续达标，可以安排带教任务或者更大范围的职责。` : '',
    n('decline') ? `<b>${n('decline')} 人</b>近 3 个月目标完成率一个月比一个月低，建议各自的主管约一次一对一复盘，先弄清原因。` : '',
    n('fit') ? `<b>${n('fit')} 人</b>能力达标但产出不理想，先看岗位是不是合适，再谈绩效。` : '',
    n('long') ? `<b>${n('long')} 人</b>近 ${RULES.longWindow} 天里有 ${RULES.longDays} 天在岗满 ${RULES.longHours} 小时，建议确认工作安排，必要时安排调休。` : '',
    n('streak') ? `<b>${n('streak')} 人</b>已经连续出勤 ${RULES.streakDays} 天以上，留意休息。` : ''
  ].filter(Boolean);
  const between = dept ? '' : pair('今日出勤率', d => d.rate, '%', 1) + (x ? pair('业绩达成率', d => d.perf, '%', 1) + pair('人效指数', d => d.eff, '', 2) : '');
  // 每个命中的提醒一张卡：口径、头几个人，人多的给一个去「异常分析」看全部的入口
  const sigCard = s => card(`<span class="chip c-${s.tone}">${ic(s.icon, 15, 2.4)}${s.name}　${s.ids.length} 人</span>`,
    `<p class="note">${esc(s.basis)}。</p>${names(s.ids.slice(0, 5).map(id => by.get(id)))}` + (s.ids.length > 5 ? `<a class="lk" href="#/analysis/signals?k=${s.k}">看全部 ${s.ids.length} 人</a>` : ''), { demo: s.demo });
  return `<div class="obs">${card('总体', `<p>${dept ? esc(dept) : '全公司'}在职 <b>${k.total} 人</b>。今天应到 ${k.due} 人、已到 ${k.present} 人，出勤率 <b>${k.rate == null ? '—' : k.rate.toFixed(1) + '%'}</b>；迟到 ${k.lateN} 人，未到岗 ${k.absentN} 人，请假 ${k.leaveN} 人。`
      + `本月到昨天为止出勤率 <b>${m.rate == null ? '—' : m.rate.toFixed(1) + '%'}</b>，有 ${m.lateN} 人迟到过、${m.otN} 人加过班（共 ${m.otHours} 小时）。`
      + (w?.n ? `本月平均目标完成率 <b>${w.avgRate}%</b>，人效指数 <b>${w.effAvg?.toFixed(2) ?? '—'}</b>；${t.n} 人参评，核心和优秀人才 ${lv('核心人才') + lv('优秀人才')} 人，待提升 ${lv('待提升')} 人。业绩和人才这几个数是示例数据。` : '') + '</p>', { cls: 'wide' })}`
    + (between ? card('部门之间', `<ul>${between}</ul>`, { note: '只比 3 人及以上的部门' }) : '')
    + (tips.length ? card('可以考虑的动作', `<ul>${tips.map(v => `<li><span>${v}</span></li>`).join('')}</ul>`) : '') + '</div>'
    + `<div class="bar"><h2 class="sec-t">值得关注</h2><span class="count">${sig.length ? `${sig.length} 条提醒命中` : '现在没有命中任何一条提醒'}</span></div>`
    + (sig.length ? `<div class="sigs">${sig.map(sigCard).join('')}</div>` : '') + DISCLAIM;
}

function signals({ ds, x, dept, by }) {
  const sig = allSignals(ds, x, dept), cur = sig.find(s => s.k === state.k);
  return `<div class="bar">${segs('k', [['', '全部'], ...sig.map(s => [s.k, s.name, s.ids.length])], cur?.k)}</div>`
    + (cur ? [cur] : sig).map(s => card(`<span class="chip c-${s.tone}">${ic(s.icon, 15, 2.4)}${s.name}　${s.ids.length} 人</span>`, `<p class="note" style="margin-bottom:12px">口径：${esc(s.basis)}。</p>${names(s.ids.map(id => by.get(id)))}`, { demo: s.demo })).join('') + DISCLAIM;
}

const KIND = { 考勤: 'o', 关怀: 'p', 业绩: 'b', 事项: 'r' }, STATUS = { 待核实: 'o', 已预览: 'b', 已处理: 'g' };
function notices({ ds, x, dept, by }) {
  const all = noticesOf(ds, x).filter(v => !dept || v.dept === dept), kinds = Object.keys(KIND).filter(k => all.some(v => v.kind === k)), n = s => all.filter(v => v.status === s).length;
  const ns = Object.hasOwn(STATUS, state.ns) ? state.ns : '', nk = kinds.includes(state.nk) ? state.nk : '', list = all.filter(v => (!ns || v.status === ns) && (!nk || v.kind === nk));
  return `<div class="bar">${segs('ns', [['', '全部', all.length], ...Object.keys(STATUS).map(s => [s, s, n(s)])], ns)}${segs('nk', [['', '全部类别'], ...kinds.map(k => [k, k])], nk)}<span class="count">${list.length} 条</span></div>`
    + (list.length ? `<div class="ntc">${list.map(v => `<section class="card"><header class="card-hd">${tag(v.kind, KIND[v.kind])}<h2>${esc(v.title)}</h2><span class="card-r">${tag(v.status, STATUS[v.status])}</span></header><div class="card-bd">`
      + `<dl><dt>发给</dt><dd>${esc(v.to)}${v.dept ? `<span class="dim">　${esc(v.dept)}</span>` : ''}</dd><dt>依据</dt><dd>${esc(v.basis)}</dd></dl><div class="msg">${esc(v.text)}</div>`
      + `<div class="ft">${names(v.ids.slice(0, 4).map(id => by.get(id)))}<button class="btn sm" data-copy="${v.id}">${ic('copy', 13, 2.2)}复制文字</button></div></div></section>`).join('')}</div>`
      : '<div class="pending"><b>没有符合条件的提醒</b><p>换一个状态或类别看看。</p></div>')
    + '<p class="hint">这里只生成文字预览，不会向企业微信发任何消息：复制以后由人确认再发。处理状态是示例。</p>';
}
// 复制一条提醒的文字
function click(ev, { ds, x }) {
  const el = ev.target.closest('[data-copy]'), text = el && noticesOf(ds, x).find(v => v.id === el.dataset.copy)?.text;
  if (!text) return;
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('已复制，可以贴到企业微信里发'), () => toast('没有复制成功，可以选中文字手动复制'));
}

const VIEW = { insights, signals, notices };
export default { state, click, render: c => VIEW[c.tab](c) };
