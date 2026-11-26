// 本机服务（可选）：只监听 127.0.0.1，定时从企业微信取数放在内存里，页面通过 api/ 读。不落盘；控制台只打印条数、耗时和错误码，不打印人名。
// 用法：node server.js [--mock] [--open]。--mock 用假企业微信（占位人名、固定时钟），端口 18761；接真实企业微信时端口 18760，要先填好 wecom-config.json。
// 端口被别的程序占了，可以用环境变量 PORT 换一个。
// 只想看演示可以不用它：把整个目录放到任何静态托管上，打开 index.html，数据在浏览器里现算。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { official } from './core/lib.js';
import { createSync } from './core/sync.js';
import { buildDataset } from './core/model.js';

const MOCK = process.argv.includes('--mock'), OPEN = process.argv.includes('--open'), PORT = Number(process.env.PORT) || (MOCK ? 18761 : 18760), URL0 = `http://127.0.0.1:${PORT}`;
// 端口是 80 时浏览器发来的 Host 和 Origin 不带端口，两种写法都认
const NAMES = ['127.0.0.1', 'localhost'].flatMap(h => PORT === 80 ? [h, h + ':80'] : [h + ':' + PORT]);
const HOSTS = new Set(NAMES), ORIGINS = new Set(NAMES.map(h => 'http://' + h));
const EVERY = 5 * 60, GAP = 20;   // 每 5 分钟自动取一次；手动刷新至少隔 20 秒
// 能被页面取走的文件只有这几类；配置文件、测试、这个脚本本身都不在里面
const STATIC = /^\/(?:favicon\.svg|css\/[\w-]+\.css|js\/(?:pages\/)?[\w-]+\.js|core\/[\w-]+\.js|fonts\/[\w-]+\.woff2)$/;
const TYPE = { svg: 'image/svg+xml', css: 'text/css', js: 'text/javascript', woff2: 'font/woff2' };
const HEAD = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };

let clock = () => Math.floor(Date.now() / 1000), raw = official;
if (MOCK) { const m = await import('./core/mock.js'); clock = () => m.MOCK_NOW; raw = m.mockCompany().raw; }

// 企业 ID 和应用 Secret 只从本机的 wecom-config.json 读，不写进代码，也不会被页面取到
async function readConfig() {
  let cfg;
  try { cfg = JSON.parse((await readFile(new URL('./wecom-config.json', import.meta.url), 'utf8')).replace(/^﻿/, '')); }
  catch { return { error: 'wecom-config.json 读不出来：把 wecom-config.example.json 复制成 wecom-config.json，只在两对引号里各填一个值。' }; }
  const corpid = String(cfg?.corpid ?? '').trim(), secret = String(cfg?.secret ?? '').trim();
  if (!corpid || !secret) return { error: '还没填：打开 wecom-config.json，填上 corpid（企业 ID）和 secret（应用 Secret）后保存。' };
  return { corpid, secret };
}

const state = { ds: null, at: 0, syncing: false, step: '', info: null, fail: null, began: 0 };
const stamp = () => new Date().toTimeString().slice(0, 8);
const codes = errors => Object.entries(errors).map(([p, o]) => p + ' ' + Object.entries(o).map(([c, n]) => c + '×' + n).join(' ')).join('；');
let sync = null, cfgKey = '';

// 取一轮数。失败时保留上一轮的数据，只记下失败原因
async function run(full) {
  if (state.syncing) return;
  state.syncing = true; state.step = '准备'; state.began = Math.floor(Date.now() / 1000);
  const now = clock();
  try {
    const cfg = MOCK ? { corpid: 'mock', secret: 'mock' } : await readConfig();
    if (cfg.error) { state.fail = { at: now, msg: cfg.error }; console.log(`[${stamp()}] 没有取数：wecom-config.json 没填好`); return; }
    if (!sync || cfgKey !== cfg.corpid + '\n' + cfg.secret) { sync = createSync(raw, cfg); cfgKey = cfg.corpid + '\n' + cfg.secret; full = true; }
    const r = await sync(now, full, s => { state.step = s; });
    if (!r.ok) {
      state.fail = { at: now, msg: '企业微信接口报错', errors: r.info.errors, hints: r.info.hints, ip: r.info.ip };
      console.log(`[${stamp()}] 取数失败：${codes(r.info.errors) || '没有取到凭证'}`);
      return;
    }
    state.ds = buildDataset(r.raw, now); state.at = now; state.info = r.info; state.fail = null;
    const c = state.ds.meta.coverage, soft = codes(r.info.errors);
    console.log(`[${stamp()}] 取数完成：${c.people} 人，日报 ${c.dayFrom || '无'} 至 ${c.dayTo || '无'}，调用接口 ${r.info.calls} 次，用时 ${r.info.seconds} 秒${soft ? '；局部报错 ' + soft : ''}`);
  } catch (e) {
    state.fail = { at: now, msg: '程序出错：' + e.message };
    console.error(`[${stamp()}] 取数时程序出错`, e.stack);
  } finally { state.syncing = false; state.step = ''; }
}

// 取数状态：页面隔一会儿来问一次。只有时间、步骤、接口名和错误码，没有人员信息
function syncInfo() {
  const i = state.info;
  return { mock: MOCK, at: state.at, syncing: state.syncing, step: state.step, fail: state.fail, every: EVERY,
    info: i && { seconds: i.seconds, calls: i.calls, errors: i.errors, hints: i.hints, leaveOff: i.leaveOff, rosterOff: i.rosterOff, rosterFailed: i.rosterFailed, monthsOff: i.monthsOff } };
}

function send(res, code, type, body) { res.writeHead(code, { ...HEAD, 'Content-Type': type + (/^(text|application)\//.test(type) ? '; charset=utf-8' : '') }); res.end(body); }
const json = (res, code, o) => send(res, code, 'application/json', JSON.stringify(o));
const file = path => readFile(new URL('.' + path, import.meta.url));

const server = http.createServer(async (req, res) => {
  try {
    if (!HOSTS.has(req.headers.host || '')) return send(res, 403, 'text/plain', '只接受本机访问');
    const url = new URL(req.url, URL0), site = req.headers['sec-fetch-site'];
    if (url.pathname.startsWith('/api/')) {
      if (site && site !== 'same-origin' && site !== 'none') return json(res, 403, { error: '只接受本页面的请求' });
      if (req.method === 'POST' && url.pathname === '/api/refresh') {
        req.resume();
        if (!ORIGINS.has(req.headers.origin || '') || req.headers['x-console'] !== '1') return json(res, 403, { error: '只接受本页面的请求' });
        const wait = state.syncing ? 0 : Math.max(0, GAP - (Math.floor(Date.now() / 1000) - state.began));
        if (!state.syncing && !wait) run(false);   // run 一开始就把 syncing 置为 true
        return json(res, 200, { syncing: state.syncing, wait });
      }
      if (req.method !== 'GET') return json(res, 405, { error: '不支持这种请求' });
      if (url.pathname === '/api/state') return json(res, 200, syncInfo());
      // 整份数据：页面拿回去自己算各个页面要的数，和演示时在浏览器里算是同一套代码
      if (url.pathname === '/api/dataset') return json(res, 200, { sync: syncInfo(), ds: state.ds });
      return json(res, 404, { error: '没有这个接口' });
    }
    if (req.method !== 'GET') return send(res, 405, 'text/plain', '不支持这种请求');
    // 首页：告诉页面数据来自本机服务，不要在浏览器里生成演示数据
    if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, 'text/html', (await file('/index.html')).toString('utf8').replace('data-source="demo"', 'data-source="server"'));
    if (!STATIC.test(url.pathname)) return send(res, 404, 'text/plain', '没有这个页面');
    return send(res, 200, TYPE[url.pathname.split('.').pop()], await file(url.pathname));
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, 'text/plain', '没有这个页面');
    console.error(`[${stamp()}] 处理请求出错：${e.message}`);
    if (!res.headersSent) json(res, 500, { error: '服务出错' }); else res.end();
  }
});

// 用系统默认浏览器打开。打不开就算了，地址已经打印在上面
const openBrowser = () => { const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', URL0]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [URL0]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); };
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(`端口 ${PORT} 已经被占用：多半是之前已经开着一个了，直接在浏览器打开 ${URL0} 就行。`);
  if (OPEN) openBrowser();
  process.exitCode = 1;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`人才管理中台${MOCK ? '（演示数据）' : ''}已启动：${URL0}  只有这台电脑能打开；关掉这个窗口就停止。`);
  run(true);
  setInterval(() => run(false), EVERY * 1000);
  if (OPEN) openBrowser();
});
