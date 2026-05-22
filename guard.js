/* ══ 运行时保护：域名校验 · 防复制 · 版权水印 ══ */

const ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  'earth-volcano-3d.vercel.app',
  // ↑ 在此添加其他授权域名
];

const host = location.hostname;
const allowed =
  ALLOWED_HOSTS.includes(host) ||
  /^earth-volcano-3d.*\.vercel\.app$/.test(host); // Vercel 预览部署

if (location.protocol === 'file:' || (!allowed && !host.endsWith('.local'))) {
  document.documentElement.innerHTML = '';
  throw new Error('\u26d4');
}

/* 控制台版权声明 */
console.log(
  '%c\u26a0\ufe0f \u7248\u6743\u58f0\u660e | Copyright Notice',
  'font-size:16px;font-weight:bold;color:#ff6b6b'
);
console.log(
  '%c\u672c\u5e94\u7528\u5185\u5bb9\u53d7\u7248\u6743\u4fdd\u62a4\uff0c\u672a\u7ecf\u6388\u6743\u7981\u6b62\u590d\u5236\u3001\u4fee\u6539\u6216\u4e8c\u6b21\u5206\u53d1\u3002\nThis application is protected by copyright. Unauthorized copying, modification, or redistribution is prohibited.',
  'font-size:12px;color:#aaa'
);

/* 禁用右键菜单 */
document.addEventListener('contextmenu', (e) => e.preventDefault());

/* 禁用常见调试/保存快捷键 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12') { e.preventDefault(); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) { e.preventDefault(); return; }
  if (mod && e.key === 'u') { e.preventDefault(); return; }
  if (mod && e.key === 's') { e.preventDefault(); return; }
});
