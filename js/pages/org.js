// 组织与权限：部门架构、岗位分布、角色权限。架构和岗位来自企业微信的通讯录和花名册；角色权限是一张建议的划分表，演示版没有做登录。
import { esc, card, tiles, table, tag, num, avatars, meter, names } from '../ui.js';
import { orgSummary } from '../../core/views.js';

const TYPE = { 正式工: 'b', 试用期: 'o', 实习: 'p' };

function depts({ ds }) {
  const o = orgSummary(ds), people = name => ds.people.filter(p => (p.dept || '未分到部门') === name);
  // 直接挂在公司下面的人（比如总经理）不算一个部门：组织图上写在公司那一格里，下面的卡片里排在最后，列出是谁
  const real = o.depts.filter(d => !d.root), direct = o.depts.find(d => d.root);
  const types = d => Object.entries(d.types).map(([t, n]) => tag(`${t} ${n}`, TYPE[t] || 'n')).join('');
  return tiles([
    { lab: '在职', val: num(o.total, 0, '人'), sub: Object.entries(o.types).map(([t, n]) => `<span class="nw">${esc(t)} ${n}</span>`).join(' · ') },
    { lab: '部门', val: num(real.length, 0, '个'), sub: '公司下面第一级' },
    { lab: '小组', val: num(real.reduce((a, d) => a + d.teams.filter(t => t.name !== '部门直属').length, 0), 0, '个'), sub: '部门下面最深一级' },
    { lab: '没有登记上级', val: num(o.noLeader, 0, '人'), sub: '直属上级和部门负责人都没有' }
  ])
    + `<div class="org-tree"><div class="org-root"><div class="org-node"><b>${esc(ds.meta.company) || '全公司'}</b><span>${o.total} 人 · ${real.length} 个部门${direct ? ` · 直属 ${direct.n} 人` : ''}</span></div></div>`
    + `<div class="org-kids" style="--n:${real.length}">${real.map(d => `<div class="org-node"><b>${esc(d.name)}</b><span>${d.n} 人${d.teams.length > 1 ? ` · ${d.teams.length} 个组` : ''}</span></div>`).join('')}</div></div>`
    + `<div class="org-g">${real.map(d => `<section class="card"><div class="org-hd"><div><h2>${esc(d.name)}</h2><p>${d.leader ? '负责人 ' + esc(d.leader) : '没有登记负责人'} · 现在在岗 ${d.here} 人</p></div><strong>${d.n}<i>人</i></strong></div>`
      + `<div class="org-tags">${types(d)}${avatars(people(d.name), 6)}</div>`
      + `<ul class="org-t">${d.teams.map(t => `<li><b>${esc(t.name)}</b><em>${t.n} 人 · 在岗 ${t.here}</em><small>${t.leader ? '负责人 ' + esc(t.leader) + ' · ' : ''}${esc(t.posts.join('、'))}</small></li>`).join('')}</ul></section>`).join('')
      + (direct ? `<section class="card"><div class="org-hd"><div><h2>公司直属</h2><p>不在任何部门里 · 现在在岗 ${direct.here} 人</p></div><strong>${direct.n}<i>人</i></strong></div><div class="org-tags">${types(direct)}</div>`
        + `<div class="org-own">${names(people(direct.name))}<p class="note">这些人在企业微信的通讯录里直接挂在公司下面，没有分到哪个部门，所以部门一栏写的是公司的名字。</p></div></section>` : '')}</div>`;
}

function posts({ ds }) {
  const o = orgSummary(ds), most = o.posts[0]?.n || 1;
  return tiles([
    { lab: '岗位', val: num(o.posts.length, 0, '个'), sub: '按通讯录里登记的岗位名' },
    { lab: '人最多的岗位', val: num(o.posts[0]?.n ?? null, 0, '人'), sub: esc(o.posts[0]?.name || '') },
    { lab: '只有一个人的岗位', val: num(o.posts.filter(p => p.n === 1).length, 0, '个'), sub: '请假或离职时没有人顶' },
    { lab: '试用期', val: num(o.types['试用期'] || 0, 0, '人'), sub: '分布见下表' }
  ])
    + card('岗位分布', table([
      ['岗位', p => `<b>${esc(p.name)}</b>`], ['人数', p => meter(p.n, most, p.n + ' 人')], ['在哪些部门', p => esc(p.depts.map(d => `${d.name} ${d.n}`).join('、'))], ['试用期', p => p.probation ? p.probation + ' 人' : '<span class="na">—</span>', 'num']
    ], o.posts), { flush: true, note: '人数从多到少' });
}

// 建议的角色划分。演示版没有登录，所有人看到的都是管理员视角
const ROLES = [
  ['管理员', '全公司', '看全部模块；改指标口径和提醒的门槛；管理谁是什么角色'],
  ['人事', '全公司的考勤、组织、培养和招聘', '跟进考勤异常；维护培养计划和招聘需求；不看薪酬以外的敏感字段'],
  ['部门负责人', '本部门的人和事', '看本部门的考勤、业绩和人才评价；写主管评价；确认发给本部门的提醒'],
  ['员工', '只有自己', '看自己的考勤档案和评价；确认主管对自己的评价']
];
function roles() {
  return card('角色和权限', table([['角色', r => `<b>${r[0]}</b>`], ['能看到的范围', r => r[1], 'wrap'], ['能做的事', r => r[2], 'wrap']], ROLES), { flush: true, note: '建议的划分' })
    + '<p class="hint">演示版没有做登录，所有人看到的都是管理员视角，这张表只是建议的权限划分。真实使用时，「部门负责人」可以直接用企业微信通讯录里登记的部门负责人和直属上级关系，不用另外维护一套。</p>';
}

const VIEW = { depts, posts, roles };
export default { dept: false, render: c => VIEW[c.tab](c) };
