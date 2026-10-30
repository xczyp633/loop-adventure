// ============================================================================
// build.js — 生成"单文件版"(手机用, 不依赖同目录其它文件)
//   输入: 单文件版.html(开发结构, 带 <script src> 引用)
//   内联顺序: physics → player → enemy → dragon → item → box
//             → ai(行为表) → audio(合成器) → council-ui(圆桌投票) → 引擎 → boot
//   输出: ../循环探险5.html (可用 OUT=xxx 环境变量覆盖)
// 用法: node build.js
// ============================================================================
const fs = require('fs');
const path = require('path');

const CLASSES = [
  'physics.js', 'player.js', 'enemy.js', 'dragon.js', 'item.js', 'box.js',
  'ai.js',          // 怪物行为表(状态机从这里查, 加新怪型只改这张表)
  'audio.js',       // Web Audio 合成器(纯代码合成, 不带音频文件)
  'council-ui.js',  // 圆桌投票头像动画
];
const BOOT = 'boot.js';
// 默认输出到仓库根目录的可玩单文件(和本目录的 README 说明一致)
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(__dirname, '..', '循环探险5.html');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
let html = read('单文件版.html');

// 1) 剥掉所有 <script src="..."></script>
html = html.replace(/<script src="[^"]+"><\/script>\n?/g, '');

// 2) 在第一个主 <script> 之前插入类库(内联)
const engineAt = html.indexOf('<script>\n// 基础常量');
if (engineAt < 0) throw new Error('找不到引擎主脚本(// 基础常量)');
let lib = '<script>\n// ===== 类库(build.js 内联) =====\n';
for (const f of CLASSES) lib += '\n/* ---------- ' + f + ' ---------- */\n' + read(f).trim() + '\n';
lib += '</script>\n\n';
html = html.slice(0, engineAt) + lib + html.slice(engineAt);

// 3) 在 </body> 之前插入 boot(内联)
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) throw new Error('<body> 结束标签缺失');
html = html.slice(0, bodyEnd) + '<script>\n/* ---------- ' + BOOT + ' ---------- */\n' + read(BOOT).trim() + '\n</script>\n</body>' + html.slice(bodyEnd + '</body>'.length);

fs.writeFileSync(OUT, html);
console.log('built ->', OUT, html.length, 'bytes');
