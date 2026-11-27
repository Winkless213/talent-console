// 样式表的版本号：index.html 引用 css 时带 ?v=<指纹>，指纹是文件内容（换行统一成 LF）sha256 的前 8 位。
// GitHub Pages 给 css 的缓存是 10 分钟，改了样式不换地址的话，手机上会继续用旧的。改了 css 忘了换版本号，这里会失败并给出要改成的那一行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const print = p => createHash('sha256').update(read(p)).digest('hex').slice(0, 8);
const html = read('index.html');
const links = [...html.matchAll(/<link rel="stylesheet" href="(css\/[\w-]+\.css)(?:\?v=([0-9a-f]*))?">/g)].map(m => ({ file: m[1], v: m[2] }));

test('样式表：index.html 引用的每个 css 都带着和内容一致的版本号', () => {
  assert.ok(links.length > 0, 'index.html 里没找到样式表引用');
  for (const { file, v } of links) {
    const want = print(file);
    assert.equal(v, want, `${file} 的版本号不对，改成：<link rel="stylesheet" href="${file}?v=${want}">`);
  }
});

test('样式表：css 目录里的文件都被 index.html 引用了', () => {
  const files = readdirSync(new URL('../css/', import.meta.url)).filter(f => f.endsWith('.css')).map(f => 'css/' + f).sort();
  assert.deepEqual(links.map(l => l.file).sort(), files);
});
