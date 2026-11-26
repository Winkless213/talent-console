// 数据从哪来。页面只认这里给出的三样：ds（考勤和组织，企业微信口径）、x（示例数据，接真实企业微信时为 null）、sync（取数状态）。
// 演示（静态托管）：浏览器里用假企业微信跑同一套取数和核算，不联网。本机服务：数据来自 server.js 的 api/，那边定时从企业微信取。
import { esc, clock, stamp } from './ui.js';
import { buildDataset } from '../core/model.js';
import { demoExtras } from '../core/demo.js';

export const src = { mode: document.documentElement.dataset.source === 'server' ? 'server' : 'demo', ds: null, x: null, sync: null, offline: false };
const subs = new Set();
// 数据或取数状态变了就通知。changed 为 true 表示数据本身换了一轮，false 表示只是状态变了（页面不用重画）
export const onData = fn => subs.add(fn);
const emit = changed => subs.forEach(fn => fn(changed));

async function demo() {
  try {
    const [{ mockCompany, MOCK_NOW }, { createSync }] = await Promise.all([import('../core/mock.js'), import('../core/sync.js')]);
    const r = await createSync(mockCompany().raw, { corpid: 'mock', secret: 'mock' })(MOCK_NOW, true);
    src.ds = buildDataset(r.raw, MOCK_NOW);
    src.x = demoExtras(src.ds);
    src.sync = { mock: true, static: true, at: MOCK_NOW, syncing: false, step: '', fail: null, every: 0, info: r.info };
  } catch (e) {
    console.error(e);
    src.sync = { mock: true, static: true, at: 0, syncing: false, step: '', fail: { at: 0, msg: '演示数据没有生成出来：' + e.message }, every: 0, info: null };
  }
  emit(true);
}

// 平时每 30 秒问一次本机服务，正在取数或还没有数据时 2 秒问一次；取数时间变了才把整份数据拿回来
let timer = 0, seq = 0;
async function poll() {
  const my = ++seq;
  clearTimeout(timer);
  let s = null, changed = false;
  try {
    const res = await fetch('api/state', { cache: 'no-store' });
    if (res.ok) s = await res.json();
    if (s?.at && s.at !== src.sync?.at) {
      const d = await (await fetch('api/dataset', { cache: 'no-store' })).json();
      if (d.ds) { src.ds = d.ds; src.x = d.sync.mock ? demoExtras(d.ds) : null; s = d.sync; changed = true; }
    }
  } catch { s = null; /* 连不上，下面按断线处理 */ }
  if (my !== seq) return;
  src.offline = !s;
  if (s) src.sync = s;
  timer = setTimeout(poll, !s ? 5000 : !s.at || s.syncing ? 2000 : 30000);
  emit(changed);
}

export const start = () => src.mode === 'demo' ? demo() : poll();
// 让本机服务马上再取一轮。返回一句给人看的话
export async function refresh() {
  if (src.mode === 'demo') return '演示数据是固定的，不用重新取数';
  let o = null;
  try { const res = await fetch('api/refresh', { method: 'POST', headers: { 'x-console': '1' } }); if (res.ok) o = await res.json(); } catch { /* 下面统一提示 */ }
  poll();
  return !o ? '连不上本机服务，没有取成' : o.wait ? `刚取过数，${o.wait} 秒后再点` : src.sync?.mock ? '正在重新生成演示数据' : '正在从企业微信重新取数，取完页面自动更新';
}

/* ---------- 取数状态写成给人看的话 ---------- */
// 取数失败的原因只有接口名、错误码和处理提示，不含任何人员信息
export const failText = f => esc(String(f.msg || '').replace(/。$/, '')) + Object.entries(f.errors || {}).map(([p, o]) => `；${esc(p)} 报错 ${Object.entries(o).map(([c, n]) => esc(c) + (n > 1 ? `（${n} 次）` : '')).join('、')}`).join('') + '。'
  + (f.hints || []).map(h => esc(h) + '。').join('') + (f.ip ? `本机出口 IP：${esc(f.ip)}。` : '');
// 侧栏底下那一块：[圆点的样子, 来源, 一句说明]
export function sourceInfo() {
  const s = src.sync;
  if (!s) return ['', src.mode === 'demo' ? '演示数据' : '企业微信', src.offline ? '连不上本机服务' : '正在准备'];
  if (s.static) return ['', '演示数据', s.at ? `时钟固定在 ${stamp(s.at).slice(5)}，不联网` : '没有生成出来'];
  return [src.offline || s.fail ? 'bad' : 'ok', s.mock ? '演示数据' : '企业微信',
    src.offline ? '连不上本机服务' : s.syncing ? '正在取数：' + esc(s.step || '准备') : s.fail ? '最近一次取数没成功' : (s.at ? `${clock(s.at)} 更新，` : '') + `每 ${Math.round(s.every / 60)} 分钟自动取`];
}
// 还没有数据时页面中间的话
export function waitHtml() {
  const s = src.sync;
  return s?.fail && !s.syncing ? `<b>还没有取到数据</b><div class="err">${failText(s.fail)}</div>` + (src.mode === 'demo' ? '' : '<span>处理好以后，点左下角的刷新按钮再取一次。</span>')
    : src.mode === 'demo' ? '<span class="spinner"></span><b>正在准备演示数据</b>'
    : !s ? '<b>连不上本机服务</b><span>黑色的命令行窗口可能被关掉了：重新双击 start.cmd，再刷新本页。</span>'
    : s.mock ? '<span class="spinner"></span><b>正在准备演示数据</b>'
    : `<span class="spinner"></span><b>正在从企业微信取数</b><span>第一次要一两分钟${s.step ? '，现在取到：' + esc(s.step) : ''}</span>`;
}
// 有数据以后页面顶上的提示：[色调, 文字]
export function noticeLines() {
  const s = src.sync, m = src.ds.meta, i = s.info || {}, l = [];
  if (src.offline) l.push(['r', '连不上本机服务：黑色的命令行窗口可能被关掉了。重新双击 start.cmd 后刷新本页；现在页面上是之前取到的数据。']);
  if (s.fail) l.push(['r', `最近一次取数没成功（${clock(s.fail.at)}），页面上还是 ${stamp(s.at)} 的数据。${failText(s.fail)}`]);
  for (const h of i.hints || []) l.push(['o', esc(h) + '。']);
  if (i.rosterOff) l.push(['o', '花名册没有取到：用工类型、入职时间、工龄暂时显示不出来。']);
  else if (i.rosterFailed) l.push(['o', `花名册有 ${i.rosterFailed} 人没取到，这些人的用工类型、入职时间暂缺。`]);
  if (i.leaveOff) l.push(['o', '请假审批没有取全：今天请了假的人可能被显示成未签到。']);
  if (i.monthsOff) l.push(['o', '往月月报没有取全：个人档案里近几个月的数字可能不全。']);
  if (!m.coverage.reportYest) l.push(['b', `企业微信还没有生成昨天（${m.yest}）的打卡日报，「昨日考勤」暂时是空的，「本月累计」也还不含昨天。`]);
  return l;
}
