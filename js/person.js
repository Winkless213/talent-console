// 个人档案抽屉：哪个页面点人名都打开这一个。考勤部分来自企业微信；工作、业绩、能力、评价、培养是示例数据，没有时不显示。
import { $, esc, r1, H, DAY, clock, hmOf, hrs, mins, md, weekday, tenureOf, ST, st, typeTag, RULE, GRADE, LEVEL, TASK, toast, openLayer, xBtn, tag, meter, fmt, avatar, DEMO } from './ui.js';
import { cols, bars, radar } from './charts.js';
import { src } from './source.js';
import { personDetail } from '../core/model.js';

const kv = rows => `<div class="kv">${rows.map(([k, v]) => `<div>${k}<b>${v || '—'}</b></div>`).join('')}</div>`;
const span2 = (a, b) => a == null ? '' : hmOf(a) + (b != null ? ' - ' + hmOf(b) : '');
const lateOf = (n, sec) => sec ? mins(sec) + ' 分钟' : n + ' 次';
// 假勤时长企业微信一律给秒数：按天的除以 86400，按小时的除以 3600
const leaveText = l => l.map(x => esc(x.name) + ' ' + (x.unit === 'day' ? r1(x.sec / DAY) + ' 天' : r1(x.sec / H) + ' 小时')).join('、');
const dayAbn = x => [x.st === 'absent' ? '旷工' : x.st === 'nopunch' ? '未打卡' : '', x.missN && x.st !== 'absent' ? `缺卡 ${x.missN} 次` : '', x.lateN ? '迟到 ' + lateOf(x.lateN, x.lateSec) : '', x.earlyN ? '早退 ' + lateOf(x.earlyN, x.earlySec) : ''].filter(Boolean);
const sec = (title, small, body) => `<section class="sec"><h3>${title}${small ? `<small>${small}</small>` : ''}</h3>${body}</section>`;
// 每工时产出：数大的取整，数小的留两位
const per = v => v == null ? '—' : v >= 100 ? fmt(Math.round(v)) : v >= 10 ? r1(v) : Math.round(v * 100) / 100;

// 示例数据的几节：工作、业绩、能力、人效、评价、培养。e 是这个人的示例数据，x 是整份
function extraSecs(p, e, x) {
  const o = e.output, sm = t => `<small>${t}</small>`, months = x.months, dims = Object.entries(e.ability.dims);
  const tasks = x.tasks.filter(v => v.owner === p.id), rv = x.reviews.find(v => v.person === p.id), pl = x.plans.find(v => v.person === p.id), oc = x.outcomes.filter(v => v.person === p.id);
  return sec('工作情况', DEMO, kv([['工作进度', meter(e.work.progress)], ['任务完成', `${e.work.tasks.done} / ${e.work.tasks.total} 项${sm(e.work.taskRate + '%')}`], ['逾期', e.work.tasks.overdue ? `<span class="v-r">${e.work.tasks.overdue} 项</span>` : '无']])
      + (tasks.length ? `<ul class="elist">${tasks.map(v => `<li><span>${v.status === 'done' ? md(v.doneAt) + ' 完成' : md(v.due) + ' 到期'}</span><b>${esc(v.name)}</b>${tag(...TASK[v.status])}</li>`).join('')}</ul>` : ''))
    + sec('业绩与质量', DEMO, kv([['本月' + o.name, `${fmt(o.value)} ${o.unit}${sm('目标 ' + fmt(o.target))}`], ['目标完成率', e.perf.rate + '%'], ['绩效等级', tag(e.perf.grade, GRADE[e.perf.grade])],
        [o.qName, e.perf.quality + '%'], ['近 3 个月', e.perf.decline ? '<span class="v-o">连续下降</span>' : '平稳或上升']])
      + cols(months.map((ym, i) => ({ label: +ym.slice(5) + ' 月', v: e.perf.trend[i], tip: `${ym}|${e.perf.trend[i] == null ? '还没有入职' : '目标完成率 ' + e.perf.trend[i] + '%'}`, mark: i === months.length - 1 })), { height: 124, unit: '%', max: 130, head: '月份', name: '目标完成率' }))
    + sec('个人能力', DEMO, `<div class="split">${radar(dims)}<div>${kv([['能力评分', e.ability.score + ' 分'], ['潜力', { high: '高', mid: '中', low: '低' }[e.potential]]])}${bars(dims.map(([k, v]) => ({ label: k, v, text: v })), { max: 100, lw: 64 })}</div></div>`)
    + sec('薪酬与人效', DEMO, kv([['人效指数', e.eff == null ? '' : e.eff.toFixed(2) + (e.effPrev == null ? '' : sm('上月 ' + e.effPrev.toFixed(2)))], ['每工时' + o.name, o.per == null ? '' : `${per(o.per)} ${o.unit}`],
      ['同岗基准', o.basis == null ? '' : `${per(o.basis)} ${o.unit}${sm(o.peers === 'post' ? '同岗位中位数' : '同岗位族中位数')}`], ['本月计入工时', o.hours + ' 小时'], ['月薪', '¥' + fmt(e.salary)]]))
    + sec('人才评价', DEMO, kv([['人才等级', tag(e.level, LEVEL[e.level])], ['需要关注', e.warn ? '<span class="v-o">是</span>' : '否'], ['培养状态', esc(e.training)]])
      + (rv ? `<div class="quote"><b>${rv.period} 主管评价：${rv.grade}</b>${sm(` ${esc(rv.reviewer)} · ${rv.confirmed ? rv.confirmed + ' 本人已确认' : '待本人确认'}`)}<br>做得好的：${esc(rv.good)}。<br>待改进：${esc(rv.improve)}。</div>` : ''))
    + (pl || oc.length ? sec('培养与成长', DEMO, (pl ? kv([['计划类型', esc(pl.kind)], ['导师', esc(pl.mentor) || '待分配'], ['进度', meter(pl.progress)], ['起止', `${md(pl.start)} 至 ${md(pl.due)}`], ['状态', tag(pl.status, pl.status === '已逾期' ? 'r' : pl.status === '已完成' ? 'g' : 'b')]])
      + `<div class="quote">目标：${esc(pl.goal)}。</div>` : '')
      + (oc.length ? `<ul class="elist" style="margin-top:12px">${oc.map(v => `<li><span>入职 ${v.stage} 天</span><b>${v.date} 回访</b>${tag(v.result, v.result === '达标' ? 'g' : v.result === '待评' ? 'n' : 'o')}</li>`).join('')}</ul>` : '')) : '');
}

export function openPerson(id) {
  const ds = src.ds, p = ds && personDetail(ds, id);
  if (!p) return toast('没有找到这个人的档案');
  const e = src.x?.byId[id], t = p.today, y = p.yest, m = p.month, dt = ds.meta;
  const lead = p.daily.length ? (new Date(p.daily[0].d + 'T00:00:00Z').getUTCDay() + 6) % 7 : 0, maxH = Math.max(1, ...p.trend.map(x => x.hours));
  const abn = p.daily.filter(x => x.st && dayAbn(x).length).reverse();
  // 这个月一天日报都没有的人（没有打卡规则，或者今天是 1 号）：本月累计整节写"—"，不写"无"和"0 天"，和表格里一样
  const mo = v => m.days ? v : '';
  $('#drawer').innerHTML = `<div class="dw-hd">${avatar(p)}<div><h2>${esc(p.name)}<small>${p.no ? '工号 ' + esc(p.no) : RULE[p.rule]}</small></h2><p>${esc([p.dept, p.team, p.post].filter(Boolean).join(' · '))}${typeTag(p)}</p></div>${xBtn()}</div><div class="dw-bd" tabindex="0">`
    + (p.tags.length ? sec('提醒', '', `<div class="dtags">${p.tags.map(([text, c]) => `<span class="tag t-${c}">${esc(text)}</span>`).join('')}</div>`) : '')
    + sec('基础信息', '', kv([['部门', esc(p.dept)], ['小组', esc(p.team)], ['岗位', esc(p.post)], ['用工类型', esc(p.type) + (p.leaving ? '（待离职）' : '')], ['入职时间', esc(p.join)], ['工龄', p.join ? tenureOf(p.tenure) : ''],
      ['直属主管', p.leader ? esc(p.leader) + (p.leaderSrc === 'dept' ? '<small>部门负责人</small>' : '') : ''], ['考勤规则', RULE[p.rule]], ['工号', esc(p.no)]]))
    + sec('今日考勤', `${dt.today} 截至 ${clock(dt.now)}`, kv([['状态', st(t.st)], ['班次', esc(t.shift)], ['上班打卡', t.on != null ? clock(t.on) : ''], ['下班打卡', t.off != null ? clock(t.off) : t.on != null ? '未下班' : ''],
      ['迟到', !t.punched ? '' : t.late ? (t.lateSec ? mins(t.lateSec) + ' 分钟' : '是') : '无'], ['早退', t.off == null ? '' : t.earlySec > 0 ? mins(t.earlySec) + ' 分钟' : '无'], ['加班', !t.punched ? '' : t.otL > 0 ? hrs(t.otL) + ' 小时<small>晚走</small>' : '无'],
      ['在岗时长', t.span > 0 ? hrs(t.span) + ' 小时' : ''], ['请假', t.leave.length ? esc(t.leave.join('、')) : t.pending ? '待审批' : '无']]))
    + sec('昨日考勤', `${dt.yest} 周${weekday(dt.yest)}`, !y ? '<p class="note" style="margin:0">企业微信没有这一天的日报。</p>' : kv([['状态', st(y.st)], ['班次', esc(y.shift)], ['工作时间', span2(y.on, y.off)],
      ['迟到', !y.n ? '' : y.lateN ? lateOf(y.lateN, y.lateSec) : '无'], ['早退', !y.n ? '' : y.earlyN ? lateOf(y.earlyN, y.earlySec) : '无'], ['加班', !y.n ? '' : y.ot > 0 ? `${hrs(y.ot)} 小时<small>${y.otW > 0 ? '企微' : '晚走'}</small>` : '无'],
      ['计入工时', y.reg > 0 ? hrs(y.reg) + ' 小时' : ''], ['在岗时长', y.span > 0 ? hrs(y.span) + ' 小时' : ''], ['请假', y.leave.length ? leaveText(y.leave) : '无']]))
    + sec('本月累计', p.monthStart > dt.yest ? '今天 1 号，明天起有数' : `${md(p.monthStart)} 至 ${md(dt.yest)}`, kv([['出勤', mo(`${m.present} / ${m.due} 天`)], ['迟到', mo(m.lateN ? `${m.lateN} 次 / ${Math.round(m.lateSec / 60)} 分钟` : '无')],
      ['早退', mo(m.earlyN ? `${m.earlyN} 次 / ${Math.round(m.earlySec / 60)} 分钟` : '无')], ['缺卡', mo(m.missN ? m.missN + ' 次' : '无')], ['加班', mo(m.otN ? `${m.otN} 次 / ${hrs(m.otSec)} 小时` + (m.otWSec > 0 ? `<small>企微记 ${hrs(m.otWSec)}</small>` : '') : '无')],
      ['请假', mo(m.leaveN ? `${m.leaveN} 次<small>${esc(Object.entries(m.leave).map(([n, c]) => n + ' ' + c).join('、'))}</small>` : '无')], ['缺勤', mo(m.absentN ? `${m.absentN} 天<small>旷工 ${m.absentW} · 未打卡 ${m.nopunch}</small>` : '无')],
      ['休息', mo(m.rest + ' 天' + (m.restWork ? `<small>休息日出勤 ${m.restWork}</small>` : ''))], ['累计工时', m.reg > 0 ? hrs(m.reg) + ' 小时' : ''], ['在岗时长', m.span > 0 ? hrs(m.span) + ' 小时' : ''], ['连续出勤', mo(p.streak + ' 天')], ['补卡', mo(m.fix ? m.fix + ' 次' : '无')]]))
    + sec('每日打卡', `近 ${p.daily.length} 天，格子里是当天状态和在岗时长`, `<div class="cal7">${[...'一二三四五六日'].map(w => `<span class="wh">${w}</span>`).join('')}${'<span class="cd x"></span>'.repeat(lead)}${p.daily.map(x => {
      const s = ST[x.st] || ST[''];
      return `<div class="cd${s[1] === 'n' ? '' : ' c-' + s[1]}" title="${x.d} 周${weekday(x.d)} ${s[0]} ${span2(x.on, x.off)}"><i>${x.d.slice(8) === '01' ? +x.d.slice(5, 7) + '/1' : +x.d.slice(8)}</i><b>${s[2] || s[0]}</b><em>${x.span > 0 ? hrs(x.span) + '<span> 小时</span>' : '&nbsp;'}</em></div>`;
    }).join('')}</div>`)
    + sec('近几个月', '企业微信月报；本月算到昨天', `<table class="mt"><thead><tr><th>月份</th><th>计入工时</th><th class="num">迟到</th><th class="num">加班（企微记）</th><th class="num">旷工</th></tr></thead><tbody>${p.trend.map(x =>
      `<tr><td>${x.ym}${x.current ? '（本月）' : ''}</td><td><span class="hb"><i style="width:${Math.round(x.hours / maxH * 100)}%"></i></span>${x.hours} 小时</td><td class="num">${x.lateN} 次</td><td class="num">${x.ot} 小时</td><td class="num">${x.absent} 次</td></tr>`).join('')}</tbody></table>`
      + (p.trend.length < 2 ? '<p class="note" style="margin:8px 0 0">往月的月报还没有取到，或者这个人以前没有记录。</p>' : ''))
    + sec('异常记录', `近 ${p.daily.length} 天`, abn.length ? `<ul class="elist">${abn.map(x => `<li><span>${md(x.d)} 周${weekday(x.d)}</span><b>${dayAbn(x).join('，')}${x.fix ? `（已补卡 ${x.fix} 次）` : ''}</b><span>${span2(x.on, x.off) || '没有打卡'}</span></li>`).join('')}</ul>`
      : '<p class="note" style="margin:0">这段时间没有迟到、早退、缺卡、旷工。</p>')
    + (e ? extraSecs(p, e, src.x) : sec('还没有接入的部分', '', `<div class="todo">${src.x ? '这个人没有打卡规则，不参与业绩和评价，所以只有考勤和基础信息。' : '工作情况、业绩与质量、个人能力、薪酬与人效、人才评价，企业微信里没有这些数据，接入对应的数据来源之前这里不放任何数字。'}</div>`))
    + '</div>';
  openLayer('drawer', p.name + ' 的个人档案');
  $('.dw-bd').scrollTop = 0;
}
