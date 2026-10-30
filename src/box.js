// ============================================================================
// box.js — 箱子(不继承 Ent: 只会往下掉, 不需要水平碰撞)
// 依赖(引擎注入): TILE GRAVITY MAX_FALL solid solidRect
// ============================================================================

class Box {
  constructor(x, y) { this.x = x; this.y = y; this.w = 28; this.h = 28; this.vy = 0; this.onGround = false; }

  update() {
    this.vy += GRAVITY; this.vy = Math.min(this.vy, MAX_FALL); this.y += this.vy; this.onGround = false;
    const ty1 = Math.floor(this.y / TILE), ty2 = Math.floor((this.y + this.h - 0.1) / TILE);
    const tx1 = Math.floor(this.x / TILE), tx2 = Math.floor((this.x + this.w - 0.1) / TILE);
    for (let y = ty1; y <= ty2; y++)
      for (let x = tx1; x <= tx2; x++) {
        if (!solid(x, y)) continue;
        const w = solidRect(x, y);   // 平台按整块算高度, 免得半截陷进方块
        if (this.vy > 0) { this.y = w.y - this.h; this.vy = 0; this.onGround = true; }
        else if (this.vy < 0) { this.y = w.y + w.h; this.vy = 0; }
      }
  }

  draw(ox, oy) {
    const sx = this.x - ox, sy = this.y - oy;
    ctx.fillStyle = '#8B5E3C'; ctx.fillRect(sx, sy, this.w, this.h);
    ctx.fillStyle = '#6e4628';
    ctx.fillRect(sx + 3, sy + 8, this.w - 6, 2);
    ctx.fillRect(sx + 3, sy + 16, this.w - 6, 2);
    ctx.strokeStyle = '#4a2f1a'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, this.w, this.h);
  }
}
