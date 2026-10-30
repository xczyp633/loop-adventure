// ============================================================================
// boot.js — 启动入口: 显式写出"先加载类, 再启动"的顺序
//   1) physics.js(Ent) 2) player/enemy/dragon/item/box 3) 引擎 4) 本文件
// 依赖(引擎注入): init()
// ============================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();   // 脚本在 body 末尾执行时, canvas 已就绪, 直接启动
}
