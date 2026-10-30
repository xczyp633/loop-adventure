// ============================================================================
// item.js — 道具类 Item(不继承 Ent: 只有拾取判定, 没有物理)
// 依赖(引擎注入): COLORS
// ============================================================================

class Item {
  constructor(x, y, type) { this.x = x; this.y = y; this.w = 20; this.h = 20; this.type = type; this.bob = Math.random() * Math.PI * 2; this.alive = true; }

  update(dt) { this.bob += dt * 4; }

  draw(ox, oy) {
    const sx = this.x - ox, sy = this.y - oy + Math.sin(this.bob) * 3;
    const c = this.type === 'heal' ? COLORS.itemHeal : this.type === 'timeStop' ? '#aa40ff' : this.type === 'swordDash' ? '#4fd8ff' : this.type === 'fireSkill' ? '#ff6622' : COLORS.itemPower;
    ctx.fillStyle = c; ctx.fillRect(sx, sy, this.w, this.h);
    ctx.fillStyle = '#fff';
    if (this.type === 'heal') {
      ctx.fillRect(sx + 8, sy + 3, 4, 14); ctx.fillRect(sx + 3, sy + 8, 14, 4);
    } else if (this.type === 'timeStop') {
      // 时钟图标: 表盘 + 两根指针
      ctx.fillRect(sx + 4, sy + 4, 12, 12);
      ctx.fillStyle = '#aa40ff';
      ctx.fillRect(sx + 9, sy + 6, 2, 5);   // 分针
      ctx.fillRect(sx + 12, sy + 9, 2, 2);  // 时针
    } else if (this.type === 'swordDash') {
      // 剑图标: 斜剑身 + 护手
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx + 4, sy + 7, 12, 3);   // 剑身(横)
      ctx.fillRect(sx + 7, sy + 3, 3, 4);    // 剑尖
      ctx.fillRect(sx + 16, sy + 6, 3, 6);   // 护手
    } else if (this.type === 'fireSkill') {
      // 火焰图标: 橙色外焰+内焰
      ctx.fillStyle = '#ff8833';
      ctx.beginPath();
      ctx.moveTo(sx + 10, sy + 2);
      ctx.lineTo(sx + 5, sy + 11);
      ctx.quadraticCurveTo(sx + 2, sy + 15, sx + 7, sy + 17);
      ctx.quadraticCurveTo(sx + 10, sy + 18, sx + 10, sy + 14);
      ctx.quadraticCurveTo(sx + 10, sy + 17, sx + 13, sy + 18);
      ctx.quadraticCurveTo(sx + 18, sy + 17, sx + 15, sy + 10);
      ctx.quadraticCurveTo(sx + 13, sy + 5, sx + 10, sy + 2);
      ctx.fill();
      ctx.fillStyle = '#ffcc66';
      ctx.beginPath();
      ctx.arc(sx + 10, sy + 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(sx + 8, sy + 2, 4, 12); ctx.fillRect(sx + 4, sy + 4, 12, 4);
    }
  }
}
