// 各模块页面的转义测试：企业微信取回的文字（人名、部门、岗位、用工类型、班次、假别……）和地址里带进来的条件，就算带着 HTML，画出来的页面里也不能多出标签；导出的表格里也不能变成公式。npm test
// 页面脚本本来跑在浏览器里；这里只给一个够它们加载的假 document，然后直接调各页面的 render 看它吐出来的 HTML。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../core/model.js';
import { mockCompany, MOCK_NOW } from '../core/mock.js';
import { createSync } from '../core/sync.js';
import { demoExtras } from '../core/demo.js';

globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: el => el }, createElement: () => ({}), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
const PAGES = { cockpit: [''], attendance: ['overview', 'daily', 'cases', 'leave'], work: ['tasks', 'results', 'efficiency'], rating: ['inventory', 'fit', 'reviews'], analysis: ['insights', 'signals', 'notices'],
  training: ['plans', 'mentors', 'outcomes'], hire: ['jobs', 'interviews', 'onboard'], org: ['depts', 'posts', 'roles'], settings: ['sources', 'rules', 'alerts'] };
const mods = Object.fromEntries(await Promise.all(Object.keys(PAGES).map(async k => [k, (await import(`../js/pages/${k}.js`)).default])));
const { csv } = await import('../js/ui.js');

const BAD = `'"><img src=x onerror=alert(1)><b class=xss>!</b>`;
const TEXT = new Set(['id', 'user', 'name', 'post', 'type', 'no', 'dept', 'team', 'leader', 'shift', 'company']);
// 把数据集里所有来自企业微信的文字都接上一段 HTML。人的编号和请假单上的申请人一起改、公司名和部门名一起改，所以还对得上
function poison(ds) {
  const walk = (v, key) => {
    if (Array.isArray(v)) return v.forEach((x, i) => { if (typeof x === 'string') { if (key === 'depts' || key === 'leave') v[i] += BAD; } else walk(x, key); });
    if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (typeof v[k] === 'string') { if (TEXT.has(k) && v[k]) v[k] += BAD; } else walk(v[k], k); }
  };
  walk(ds, '');
  for (const p of ds.people) for (const t of p.tags) t[0] += BAD;
  return ds;
}
const synced = await createSync(mockCompany().raw, { corpid: 'mock', secret: 'mock' })(MOCK_NOW, true);
const ds = poison(buildDataset(synced.raw, MOCK_NOW)), x = demoExtras(ds);
const ctx = (tab, dept, withX = true) => ({ ds, x: withX ? x : null, sync: { mock: withX, static: withX, at: MOCK_NOW, syncing: false, step: '', fail: null, every: 300, info: {} }, mode: withX ? 'demo' : 'server', tab, dept, by: new Map(ds.people.map(p => [p.id, p])) });
// 页面自己不用 img，也没有 xss 这个类名；出现了就是数据里的文字被当成 HTML 了
const clean = (html, where) => { assert.ok(html.length > 200, where + ' 画出了内容'); assert.ok(!/<img|<b class=xss/i.test(html), where + ' 把数据里的文字当成了 HTML'); };

test('模块页面：数据里的文字带着 HTML 也只当文字显示', () => {
  for (const [k, tabs] of Object.entries(PAGES)) for (const tab of tabs) for (const dept of ['', ds.depts[1]]) clean(mods[k].render(ctx(tab, dept)), `${k}/${tab}${dept ? '（限定部门）' : ''}`);
});

test('模块页面：选了某个等级、格子、提醒、状态以后也一样', () => {
  const set = (k, o) => Object.assign(mods[k].state, o);
  set('rating', { sel: 'lv:稳定贡献' }); clean(mods.rating.render(ctx('inventory', '')), '人才盘点·选了等级');
  set('rating', { sel: 'c:mid-mid' }); clean(mods.rating.render(ctx('inventory', '')), '人才盘点·选了九宫格');
  set('rating', { fit: '胜任', rv: 'todo' }); clean(mods.rating.render(ctx('fit', '')), '岗位胜任·选了判断'); clean(mods.rating.render(ctx('reviews', '')), '主管评价·待确认');
  set('analysis', { k: 'att', ns: '待核实', nk: '考勤' }); clean(mods.analysis.render(ctx('signals', '')), '异常分析·选了提醒'); clean(mods.analysis.render(ctx('notices', '')), '企微提醒·选了状态');
  set('attendance', { day: ds.meta.yest, p: 'month', kind: 'late', ls: '2' });
  for (const tab of PAGES.attendance) clean(mods.attendance.render(ctx(tab, '')), '考勤·' + tab + '·换了条件');
  set('work', { ts: 'overdue', fam: 'cs' }); clean(mods.work.render(ctx('tasks', '')), '工作事项·已逾期'); clean(mods.work.render(ctx('results', '')), '岗位业绩·换了岗位族');
  set('training', { ps: '已逾期' }); clean(mods.training.render(ctx('plans', '')), '培养计划·已逾期');
});

test('模块页面：没有示例数据时（接真实企业微信），只用考勤和组织数据的页面照常出，也一样转义', () => {
  for (const k of ['cockpit', 'attendance', 'analysis', 'org', 'settings']) for (const tab of PAGES[k]) clean(mods[k].render(ctx(tab, '', false)), `${k}/${tab}（没有示例数据）`);
});

// 地址里的 ?键=值 会原样写进页面声明过的 state（js/app.js 的 go），所以 state 里的每个值都要当成别人写的
const STATED = Object.keys(PAGES).filter(k => mods[k].state);
const withState = (k, value, f) => { const st = mods[k].state, keys = Object.keys(st); for (const key of keys) st[key] = value; try { return f(); } finally { for (const key of keys) st[key] = ''; } };

test('模块页面：地址里带进来的条件带着 HTML 也只当文字，或者干脆不认', () => {
  // 第二个值以合法日期开头：只比大小的话，它正好落在最早一天和今天之间
  for (const value of [BAD, ds.meta.today.slice(0, 9) + BAD]) for (const k of STATED) withState(k, value, () => { for (const tab of PAGES[k]) clean(mods[k].render(ctx(tab, '')), `${k}/${tab}（地址里的条件是 ${value.slice(0, 14)}…）`); });
});

test('模块页面：地址里带进来的条件不认识，就和没带一样', () => {
  for (const k of STATED) for (const tab of PAGES[k]) {
    const plain = withState(k, '', () => mods[k].render(ctx(tab, '')));
    for (const value of ['constructor', 'toString', '没有这个值']) assert.ok(withState(k, value, () => mods[k].render(ctx(tab, ''))) === plain, `${k}/${tab} 的条件全是 ${value} 时，画出来的和没带条件时不一样`);
  }
});

test('导出：格子里的文字不会被表格软件当成公式，也不会把一格拆成几格', () => {
  const lines = csv([['姓名', '部门'], ['=1+1', 'a;=1+1;'], ['＝1＋1', '-x'], ['@x', '+x'], ['\tx', 'a"b'], ['c,d\ne', null], [0, 12.5]]).split('\r\n');
  assert.deepEqual(lines.slice(0, 5), ['"姓名","部门"', '"\'=1+1","a;=1+1;"', '"\'＝1＋1","\'-x"', '"\'@x","\'+x"', '"\'\tx","a""b"']);
  assert.equal(lines.slice(5).join('\r\n'), '"c,d\ne",""\r\n"0","12.5"', '格子里的换行留在引号里，空值是空串');
});
