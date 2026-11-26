// 首次绘制前定好深色还是浅色，免得闪一下。默认深色；切换过就记住上次选的
try { document.documentElement.dataset.theme = localStorage.getItem('talent-console:theme') === 'light' ? 'light' : 'dark'; } catch { /* 读不到就用默认的深色 */ }
// 直接双击 index.html 打开时（地址是 file:// 开头），浏览器不让加载其余的脚本，页面会是空的：说明该怎么打开
if (location.protocol === 'file:') addEventListener('DOMContentLoaded', () => {
  const w = document.getElementById('wait'), line = (tag, text) => w.appendChild(Object.assign(document.createElement(tag), { textContent: text }));
  w.hidden = false;
  line('b', '这个页面不能直接从文件夹里双击打开');
  line('span', 'Windows 上双击同一个文件夹里的 start.cmd；或者在这个文件夹里运行 node server.js --mock，再打开它打印出来的地址。');
});
