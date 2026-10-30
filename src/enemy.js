// ============================================================================
// enemy.js — 怪物类 Enemy(继承 physics.js 的 Ent)
// 依赖(引擎注入): TILE GRAVITY MAX_FALL ENEMY_SKILL COLORS
//                  player loopCount timeStopTimer
// ============================================================================

class Enemy extends Ent {
  constructor(x, y) {
    super(x, y, 24, 24);
    this.startX = x; this.patrolRange = 120; this.baseSpeed = 1.5; this.baseChase = 2.8; this.sight = 360;
    this.onGround = false; this.hitFlash = 0; this.hp = 2; this.maxHp = 2;
    this.alive = true;
    this.state = 'IDLE'; this.locked = false;
    this.attackRange = 26; this.attackRangeY = 30;   // 进入/维持 ATTACK 的距离阈值与判定阈一致
    this._pd = Math.random() < 0.5 ? -1 : 1;
    this._pt = 60 + Math.floor(Math.random() * 120);
    this._ct = 0; this._at = 0; this.tier = loopCount;
    // 被冲刺命中的独立计时(秒). 原来复用 hitFlash(受击白闪), 冲刺撞上怪时
    // hitFlash 被设成 0.25s, 于是"冲刺无敌"期间玩家能在怪头顶反复摩擦不出任何反馈.
    this.dashHitCd = 0;
    // 技能: 冲刺加速(ENEMY_SKILL配置)
    this.skillCd = ENEMY_SKILL.cd;
    this.skillBoost = 0;
  }

  // 一帧 AI: 状态的迁移/行为在 ai.js 的行为表里, 这里只做"取意图 + 走物理"
  // 原来这里是一串 if (state===...) , 加新怪型就得插分支; 现在换成 runBrain()
  update(dt) {
    const dx = player.x - this.x, dy = player.y - this.y;
    const ctx = {
      dx, dy, dt,
      playerAlive: player.alive,
      inSight: Math.abs(dx) <= this.sight && Math.abs(dy) <= 200 && player.alive,
      curSight: this.sight * (1 + (this.tier - 1) * 0.1),
      // 原版: let md = this._pd —— 初值永远是巡逻方向, 只有 PURSUE 那段会把它改成朝玩家
      md: this._pd,
    };
    // 速度按"锁定之后、if 链之前"的状态算:
    //   原版顺序是 [算 dx/dy/inSight] -> [头部锁定, 可能把 IDLE 改成 PURSUE] -> [算 sp] -> [if 链]
    //   所以"本帧刚被看见"的怪, 同一帧就用追击速度(2.8), 而不是巡逻速度(1.5).
    //   把头部锁定提到算 sp 之前, 行为上与原版一致.
    if (!this.locked && ctx.inSight) { this.locked = true; this.state = 'PURSUE'; }
    const diffT = Math.min((loopCount - 1) * 0.2, 1);
    let sp = this.state === 'PURSUE'
      ? this.baseChase * (1 + diffT * 0.4) * (1 + (this.tier - 1) * 0.12)
      : this.baseSpeed * (1 + diffT * 0.5) * (1 + (this.tier - 1) * 0.08);
    // 技能计时
    if (this.skillCd > 0) {
      this.skillCd -= dt;
      if (this.skillCd <= 0) { this.skillCd = ENEMY_SKILL.cd; this.skillBoost = ENEMY_SKILL.duration; } // 触发冲刺加速
    }
    if (this.skillBoost > 0) {
      sp *= ENEMY_SKILL.multiplier;   // 加速倍率
      this.skillBoost -= dt;
    }
    // ---- 行为表驱动: 本帧状态 + 该往哪走 ----
    const r = runBrain(this, ctx);
    const md = r.dir;
    // 时停: 时间停留期间怪移速归零(仅怪, 玩家不受影响)
    if (timeStopTimer > 0) sp = 0;
    this.x += md * sp;
    this.collideH();
    this.vy += GRAVITY; this.vy = Math.min(this.vy, MAX_FALL); this.y += this.vy;
    this.onGround = false; this.collideV();
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.dashHitCd > 0) this.dashHitCd -= dt;
  }

  draw(ox, oy) {
    if (this.hitFlash > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(this.x - ox, this.y - oy, this.w, this.h); return; }
    const weakened = this.hp <= 1;
    // 冲刺技能释放中: 整体变彩虹色(闪烁), 只影响冲刺技能
    if (this.skillBoost > 0) {
      const ph = performance.now() / 120;
      const cr = 128 + 127 * Math.sin(ph);
      const cg = 128 + 127 * Math.sin(ph + 2.09);
      const cb = 128 + 127 * Math.sin(ph + 4.18);
      ctx.fillStyle = 'rgb(' + cr.toFixed(0) + ',' + cg.toFixed(0) + ',' + cb.toFixed(0) + ')';
    } else {
      ctx.fillStyle = this.state === 'ATTACK' ? '#c0392b' : this.state === 'CONFUSED' ? '#888' : weakened ? '#f39c12' : COLORS.enemy;
    }
    ctx.fillRect(this.x - ox, this.y - oy, this.w, this.h);
    ctx.fillStyle = '#333'; ctx.fillRect(this.x - ox, this.y - oy - 8, 24, 3);
    ctx.fillStyle = this.hp > 1 ? '#e74c3c' : '#f39c12';
    ctx.fillRect(this.x - ox, this.y - oy - 8, 24 * (this.hp / this.maxHp), 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.x - ox + 4, this.y - oy + 6, 5, 5);
    ctx.fillRect(this.x - ox + 15, this.y - oy + 6, 5, 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(this.x - ox + 5, this.y - oy + 8, 2, 2);
    ctx.fillRect(this.x - ox + 16, this.y - oy + 8, 2, 2);
  }
}
