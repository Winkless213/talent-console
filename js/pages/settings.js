// 系统设置：数据从哪来、每个数怎么算、提醒的门槛。都是只读的说明，改门槛要改 core/model.js 的 RULES 和 core/demo.js 的 DEMO_RULES。
import { esc, stamp, card, table, tag } from '../ui.js';
import { AI, aiRule, rulesDoc, demoRules } from '../rules.js';
import { RULES } from '../../core/model.js';
import { signalsOf } from '../../core/views.js';

// 取数用到的企业微信官方接口：[接口, 取什么]
const API = [
  ['gettoken', '用企业 ID 和应用 Secret 换访问凭证'],
  ['department/list、user/list', '通讯录：部门树，成员的姓名、岗位、所在部门、直属上级'],
  ['hr/get_fields、hr/get_staff_info', '人事花名册：员工类型、员工状态、入职日期、工号、职位'],
  ['checkin/getcheckinoption、checkin/getcheckinschedulist', '每个人今天的打卡规则和排班'],
  ['checkin/getcheckin_daydata', '近 30 天的打卡日报：迟到、早退、缺卡、旷工、工时都用企业微信的判定'],
  ['checkin/getcheckindata', '今天的打卡记录：只留时间、类型、异常和标准时间'],
  ['checkin/getcheckin_monthdata', '往月的打卡月报，个人档案里的近几个月用'],
  ['oa/getapprovalinfo、oa/getapprovaldetail', '请假审批：只留申请人、状态、假别、起止时间和时长']
];

function sources({ ds, x, sync, mode }) {
  const c = ds.meta.coverage;
  return card('现在的数据', `<div class="kvs"><div>来源<b>${sync.mock ? '演示数据' : '企业微信'}</b></div><div>数据时间<b>${stamp(sync.at)}</b></div><div>怎么更新<b>${sync.static ? '固定不变' : `每 ${Math.round(sync.every / 60)} 分钟取一次`}</b></div>`
      + `<div>覆盖<b>${c.people} 人</b></div><div>打卡日报<b>${c.dayFrom ? `${c.dayFrom.slice(5)} 至 ${c.dayTo.slice(5)}` : '还没有'}</b></div><div>往月月报<b>${c.months.length} 个月</b></div>`
      + `<div>打卡规则<b>固定 ${c.rule.fixed} · 排班 ${c.rule.shift} · 自由 ${c.rule.free} · 无 ${c.rule.none}</b></div><div>示例数据<b>${x ? '有，页面上标了「示例」' : '没有'}</b></div></div>`,
    { note: mode === 'demo' ? '在这个浏览器标签页里生成，不联网' : '来自本机服务，只放在内存里' })
    + card('用到的企业微信官方接口', table([['接口', a => a[0].split('、').map(p => `<code>${p}</code>`).join(' ')], ['取什么', a => a[1], 'wrap']], API), { flush: true, note: sync.mock ? '演示时由一套假接口应答，路径和字段结构与官方接口一致' : '全部是官方文档里的接口' })
    + `<div class="row c2">${card('不留的东西', '<div class="doc"><ul><li>打卡接口返回的位置、WiFi、设备信息，不保留。</li><li>请假单里的事由、附件、审批意见，不保留。</li><li>通讯录接口返回的手机号、邮箱，不保留；聊天记录不碰。</li><li>留下来的数据只放内存，不存盘、不上传。</li></ul></div>')}`
    + `${card('示例数据', '<div class="doc"><p>工作事项、业绩、能力评价、薪酬、培养、招聘，企业微信里没有，演示时按固定种子从人员名单生成：同一个人在各个页面上的数互相对得上，重复生成结果不变，页面上都标了「示例」。</p><p>接真实企业微信后，这些位置显示「待接入」，不放任何编出来的数。</p></div>')}</div>`
    + card('接上真实的企业微信', '<div class="doc"><ul><li>准备一个能调用上面这几类接口（通讯录、打卡、审批、人事助手）的企业微信应用，并把运行这个程序的电脑的出口 IP 加进应用的企业可信 IP；接口报 60020 就是这一条没配。</li>'
      + '<li>把 <code>wecom-config.example.json</code> 复制成 <code>wecom-config.json</code>，填上企业 ID 和应用 Secret。这个文件只留在本机，不要提交到代码仓库。</li>'
      + '<li>运行 <code>node server.js</code>，浏览器打开它打印出来的本机地址。服务只监听 127.0.0.1，别的电脑打不开。</li></ul></div>');
}

function rules({ ds, x, sync }) {
  return `<section class="card"><div class="card-bd doc" style="padding-top:4px">${rulesDoc(ds, x, sync, 'h2')}</div></section>`;
}

function alerts({ ds, x }) {
  const att = AI.map(([k, name, , tone]) => ({ name, tone, basis: aiRule(k, RULES), from: '考勤', n: ds.people.filter(p => p.flags[k]).length }));
  const demo = signalsOf(ds, x).filter(s => s.demo).map(s => ({ name: s.name, tone: s.tone, basis: s.basis, from: '示例', n: x ? s.ids.length : null }));
  return card('提醒规则', table([['提醒', r => tag(r.name, r.tone)], ['什么情况下提醒', r => esc(r.basis), 'wrap'], ['数据', r => r.from === '示例' ? tag('示例', 'n') : '企业微信考勤'], ['现在', r => r.n == null ? '<span class="na">待接入</span>' : r.n + ' 人', 'num']], [...att, ...demo]),
    { flush: true, note: `${att.length + demo.length} 条，全部按固定口径判断` })
    + (x ? card('示例数据的口径', table([['指标', r => `<b>${r[0]}</b>`], ['怎么算', r => r[1] + '。', 'wrap']], demoRules()), { flush: true, demo: 1 }) : '')
    + '<p class="hint">门槛写在代码里：考勤类在 <code>core/model.js</code> 的 <code>RULES</code>，示例数据在 <code>core/demo.js</code> 的 <code>DEMO_RULES</code>。改了以后这一页、口径说明和各处的提醒一起变；每条口径在 <code>test/</code> 里有对应的用例。</p>';
}

const VIEW = { sources, rules, alerts };
export default { dept: false, render: c => VIEW[c.tab](c) };
