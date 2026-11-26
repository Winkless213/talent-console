// 本机服务的测试：真的把 server.js 起起来（演示数据，临时端口），看它只放行该放行的东西。npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 20000 + Math.floor(Math.random() * 20000), BASE = `http://127.0.0.1:${PORT}`;
const child = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url)), '--mock'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', d => { log += d; });
child.stderr.on('data', d => { log += d; });
test.after(() => child.kill());

// 发一个请求，返回状态码、响应头和正文。headers 可以改掉 Host 之类浏览器不让改的头
const get = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request(BASE + path, { method, headers }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', d => { body += d; }); res.on('end', () => resolve({ code: res.statusCode, head: res.headers, body })); });
  req.on('error', reject);
  req.end();
});
// 等服务起来并取完第一轮数（演示数据不联网，一两秒内就好）
async function ready() {
  for (let i = 0; i < 100; i++) {
    try { const r = await get('/api/state'); if (r.code === 200 && JSON.parse(r.body).at) return; } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 100));
  }
  assert.fail('服务没有起来。它的输出：\n' + log);
}

test('本机服务：首页、取数状态和整份数据', async () => {
  await ready();
  const home = await get('/');
  assert.equal(home.code, 200);
  assert.match(home.body, /<html[^>]* data-source="server"/, '首页的 html 标签告诉页面：数据来自本机服务');
  assert.match(home.head['content-security-policy'], /default-src 'self'/);
  assert.equal(home.head['x-frame-options'], 'DENY');
  const state = JSON.parse((await get('/api/state')).body);
  assert.deepEqual([state.mock, state.syncing, state.fail], [true, false, null]);
  const data = JSON.parse((await get('/api/dataset')).body);
  assert.equal(data.sync.at, state.at);
  assert.ok(data.ds.people.length > 50 && data.ds.depts.length >= 5 && data.ds.meta.today, '数据集里有人员、部门和日期');
});

test('本机服务：只放行页面用得到的文件，配置文件、脚本本身、测试都取不到', async () => {
  await ready();
  for (const [path, type] of [['/favicon.svg', 'image/svg+xml'], ['/css/theme.css', 'text/css'], ['/js/app.js', 'text/javascript'], ['/js/pages/cockpit.js', 'text/javascript'], ['/core/model.js', 'text/javascript'], ['/fonts/geist-latin-wght-normal.woff2', 'font/woff2']]) {
    const r = await get(path);
    assert.equal(r.code, 200, path);
    assert.ok(r.head['content-type'].startsWith(type), path + ' 的类型');
    assert.equal(r.head['x-content-type-options'], 'nosniff');
  }
  for (const path of ['/wecom-config.json', '/wecom-config.example.json', '/server.js', '/package.json', '/README.md', '/test/model.test.js', '/css/../wecom-config.json', '/core/%2e%2e/server.js', '/js/pages/../../server.js', '/css/no-such.css', '/.gitignore'])
    assert.equal((await get(path)).code, 404, path);
  assert.equal((await get('/api/nothing')).code, 404);
});

test('本机服务：只认本机地址和本页面发来的请求', async () => {
  await ready();
  assert.equal((await get('/', { headers: { host: 'evil.example' } })).code, 403, 'Host 不是本机的不理');
  assert.equal((await get('/api/state', { headers: { 'sec-fetch-site': 'cross-site' } })).code, 403, '别的网站发来的请求不理');
  assert.equal((await get('/api/refresh', { method: 'POST' })).code, 403, '重新取数：没有本页面的标记不理');
  assert.equal((await get('/api/refresh', { method: 'POST', headers: { origin: 'http://evil.example', 'x-console': '1' } })).code, 403, '重新取数：来源不是本页面不理');
  const ok = await get('/api/refresh', { method: 'POST', headers: { origin: BASE, 'x-console': '1' } });
  assert.equal(ok.code, 200);
  assert.ok('wait' in JSON.parse(ok.body), '回答里写了还要等几秒');
  assert.equal((await get('/api/state', { method: 'DELETE' })).code, 405);
  assert.equal((await get('/css/theme.css', { method: 'POST' })).code, 405);
});
