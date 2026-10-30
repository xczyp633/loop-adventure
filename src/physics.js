// ============================================================================
// physics.js — 物理基类 Ent
// 所有会动的东西(玩家/怪/箱子)都继承它, 共享同一套 AABB 碰撞。
// 依赖(由引擎在加载时注入): 全局常量 TILE, GRAVITY, MAX_FALL;
//                              函数 overlap / solid / solidRect / platformAt
// ============================================================================

class Ent {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
  }

  overlap(o) { return overlap(this, o); }

  // 身体覆盖到的实心格; 同一平台只算一次(用整块矩形推, 不逐格), 否则一脚跨两格会被上一格钉死
  solidWalls() {
    const out = [], seen = new Set();
    const tx1 = Math.floor(this.x / TILE), tx2 = Math.floor((this.x + this.w - 0.001) / TILE);
    const ty1 = Math.floor(this.y / TILE), ty2 = Math.floor((this.y + this.h - 0.001) / TILE);
    for (let y = ty1; y <= ty2; y++)
      for (let x = tx1; x <= tx2; x++) {
        if (!solid(x, y)) continue;
        const p = platformAt(x, y);
        const key = p ? 'p' + p.tx + ',' + p.ty : 't' + x + ',' + y;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(solidRect(x, y));
      }
    return out;
  }

  // 嵌进实心块内部(冲刺/被怪顶进, 速度为 0 时的重叠)时, 从最近的一条边推出去
  pushOutOfPlatform(wall) {
    const left = this.x + this.w - wall.x, right = wall.x + wall.w - this.x;
    const up = this.y + this.h - wall.y, down = wall.y + wall.h - this.y;
    const m = Math.min(left, right, up, down);
    if (m === up) { this.y = wall.y - this.h; this.onGround = true; }
    else if (m === down) this.y = wall.y + wall.h;
    else if (m === left) this.x = wall.x - this.w;
    else this.x = wall.x + wall.w;
  }

  collideH() {
    for (const wall of this.solidWalls()) {
      if (!overlap(this, wall)) continue;
      if (this.vx > 0) this.x = wall.x - this.w;
      else if (this.vx < 0) this.x = wall.x + wall.w;
      else this.pushOutOfPlatform(wall);   // vx=0 却重叠: 原写法直接放过, 会卡在方块里
      this.vx = 0;
    }
  }

  collideV(oldY) {
    // 本帧下落前的脚底位置: 用来区分"从上方落到平台面"和"从侧面撞进平台"
    const prevBottom = (oldY === undefined ? this.y : oldY) + this.h;
    for (const wall of this.solidWalls()) {
      if (!overlap(this, wall)) continue;
      if (this.vy > 0) {
        if (prevBottom > wall.y + 2) continue;   // 之前脚底已经在平台表面以下 → 侧撞, 归 collideH 处理
        this.y = wall.y - this.h; this.vy = 0; this.onGround = true;
      }
      else if (this.vy < 0) { this.y = wall.y + wall.h; this.vy = 0; }
      else this.pushOutOfPlatform(wall);
    }
  }
}
