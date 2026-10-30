// ============================================================================
// player.js — 玩家类 Player(继承 physics.js 的 Ent)
// 依赖(引擎注入): TILE ROWS DUNGEON_ROWS PW PH GRAVITY MAX_FALL JUMP
//                  FEEL INVULN_DURATION STOMP_INVULN COLORS COLORS
//                  input scene dungeonFound
//                  checkSecret() checkExit() onPlayerDeath() loopStats
// ============================================================================

class Player extends Ent {
  constructor(x, y) {
    super(x, y, PW, PH);
    this.speed = 4; this.onGround = false; this.hp = 5; this.maxHp = 5;
    this.invuln = 0; this.alive = true; this.hitFlash = 0; this.stompInvuln = 0;
    this.powerTimer = 0;
    // 剑冲刺: 获得道具后可用
    this.hasDash = false;   // 是否获得冲刺能力
    this.dashT = 0;         // 冲刺剩余时间(>0=冲刺中)
    this.dashCd = 0;        // 冲刺冷却(秒), 冷却中不能再次冲刺
    this.dashDir = 1;       // 冲刺方向
    this.afterimages = [];  // 残影数组[{x,y,alpha}]
    this.facing = 1;        // 持久朝向: 1右=-1左(由最后一次按下的方向键决定)
    // 受击击退(独立于vx, 否则下一帧就被输入覆盖)
    this.knockT = 0;        // 击退剩余帧数
    this.knockVx = 0;       // 击退水平速度
    // 火焰远程技能: 碰道具获得, 按 E/发射键开火
    this.hasFire = false;
    this.fireCd = 0;
    // 滞空跳: 无限跳的漏洞(空中连按可无限爬升)修复 —— 落地后随便跳, 空中只额外给 airHops 次
    this.airHopsLeft = FEEL.airHops;
    this.airTime = 0;       // 本次离地后的时间(s), 用于"刚起跳不扣次数"的宽容判定
    // 连踩: 空中连续踩中怪物累计, 落地清零; 倍率见 comboMul()
    this.airCombo = 0;
    this.bestCombo = 0;
  }

  // 触发冲刺
  dash() {
    if (!this.alive || !this.hasDash || this.dashT > 0) return;
    if (this.dashCd > 0) return;                 // 冷却中不能冲刺
    this.dashT = FEEL.dashTime;                  // 持续
    this.dashCd = FEEL.dashCd;                   // 冷却
    this.dashDir = this.facing;   // 按最近朝向冲刺
    if (typeof sfx === 'function') sfx('dash');
  }

  update(dt) {
    if (!this.alive) return;
    if (this.dashCd > 0) this.dashCd -= dt;      // 冲刺冷却递减
    // 冲刺中: 生成残影 + 强制水平高速移动; 仍在下面走重力落地(不return跳过物理)
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.afterimages.length < 6) this.afterimages.push({ x: this.x, y: this.y, alpha: 0.5 });
      this.x += this.dashDir * FEEL.dashSpeed * dt;   // 冲刺速度
      this.collideH();
    }
    // 残影每帧淡出, 移除全透明的
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].alpha -= dt * 1.2;
      if (this.afterimages[i].alpha <= 0) this.afterimages.splice(i, 1);
    }
    let d = 0;
    if (input.left) d--;
    if (input.right) d++;
    // 受击击退优先于输入(持续若干帧, 期间不响应移动键)
    if (this.knockT > 0) {
      this.vx = this.knockVx;
      this.knockT--;
    } else {
      this.vx = d * this.speed;
    }
    // 首次/最近按下的方向固定朝向(断触松键后 facing 不弹回默认右)
    if (input.left) this.facing = -1;
    else if (input.right) this.facing = 1;
    this.x += this.vx;
    this.collideH();
    this.vy += GRAVITY;
    this.vy = Math.min(this.vy, MAX_FALL);
    const oldY = this.y;
    this.y += this.vy;
    this.onGround = false;
    this.collideV(oldY);
    // 站在平台上时脚底可能因为重力每帧往下压 0.5px 而不再与平台"重叠", collideV 就判不到地面了;
    // 这里补一脚探测: 脚下 1px 内有实心面就算站稳(和地面一样, 站上去不会抖)
    if (!this.onGround && this.vy >= 0) {
      // 用"下沉 1px 的自己"和所有实心块做一次重叠检查(平台按整块算)
      const probe = { x: this.x, y: this.y + 1, w: this.w, h: this.h };
      const tx1 = Math.floor(probe.x / TILE), tx2 = Math.floor((probe.x + probe.w - 0.001) / TILE);
      const ty1 = Math.floor(probe.y / TILE), ty2 = Math.floor((probe.y + probe.h - 0.001) / TILE);
      let landed = null;
      for (let y = ty1; y <= ty2 && !landed; y++)
        for (let x = tx1; x <= tx2 && !landed; x++) {
          if (!solid(x, y)) continue;
          const wall = solidRect(x, y);
          if (overlap(probe, wall)) landed = wall;
        }
      if (landed) { this.y = landed.y - this.h; this.vy = 0; this.onGround = true; }
    }
    if (this.onGround) {
      if (!this._wasGround && this.airTime > 0.12 && typeof sfx === 'function') sfx('land');   // 从一定高度落地才出声
      this.airHopsLeft = FEEL.airHops;
    }
    this._wasGround = this.onGround;
    this.airTime = this.onGround ? 0 : this.airTime + dt;
    const voidY = (scene === 'world' ? ROWS : DUNGEON_ROWS) * TILE + 100;
    if (this.y > voidY) {
      const gy = (scene === 'world' ? ROWS : DUNGEON_ROWS) - 1;
      this.y = gy * TILE - this.h; this.vy = 0; this.onGround = true;
    }
    if (this.invuln > 0) this.invuln--;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.stompInvuln > 0) this.stompInvuln--;
    if (this.powerTimer > 0) this.powerTimer--;
    if (scene === 'world' && !dungeonFound) checkSecret();
    if (scene === 'dungeon') checkExit();
  }

  jump() {
    if (!this.alive) return;
    // 落地后无限跳(手感核心); 空中只保留 airHops 次滞空跳.
    // 原来的"任何时候都能跳"导致空中连按可无限爬升, 10 秒能飞出屏幕几千像素.
    if (this.onGround || this.airTime <= FEEL.hopRefreshT || this.airHopsLeft > 0) {
      const _wasAir = !this.onGround;
      this.vy = FEEL.hopVy;
      this.onGround = false;
      if (typeof sfx === 'function') sfx(_wasAir ? 'hop' : 'jump');
      if (this.airTime > FEEL.hopRefreshT) this.airHopsLeft = Math.max(0, this.airHopsLeft - 1);
      // 头顶软天花板: 脚底已经飞得比 skyBandH 还高, 放弃这次起跳动力(防止靠反复起跳越飞越远)
      const headroom = (scene === 'world' ? ROWS : DUNGEON_ROWS) * TILE - FEEL.skyBandH;
      if (this.y + this.h < headroom) this.vy = Math.max(this.vy, 0);
    }
  }

  // srcX: 伤害来源的世界 x 坐标(怪物/龙)。有了它就把玩家往"远离来源"的方向推,
  // 不再看当前按着哪个方向键 —— 之前按左逃反而被往右推回怪身上.
  hurt(srcX) {
    if (this.invuln > 0 || !this.alive) return;
    if (this.dashT > 0) return;   // 冲刺期间无敌
    this.hp--; this.invuln = INVULN_DURATION; this.vy = -6; this.hitFlash = 0.12;
    if (typeof loopStats !== 'undefined') loopStats.hits++;   // 圆桌态度样本
    // 击退方向: 远离来源; 没有来源(理论上不会发生)就按朝向反推
    const cx = this.x + this.w / 2;
    const dir = (typeof srcX === 'number') ? (cx < srcX ? -1 : 1) : -this.facing;
    this.knockVx = dir * FEEL.hurtKnockback;
    this.knockT = FEEL.hurtKnockbackT;
    if (typeof sfx === 'function') sfx('hurt');
    if (this.hp <= 0) { this.alive = false; onPlayerDeath(); }
  }

  draw(ox, oy) {
    if (!this.alive) return;
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0 && this.dashT <= 0) return;
    // 冲刺拖尾残影: 先画残影(逐渐淡出)
    if (this.dashT > 0) {
      for (const a of this.afterimages) {
        ctx.globalAlpha = Math.max(0, Math.min(1, a.alpha));
        ctx.fillStyle = '#00d4ff';
        ctx.beginPath();
        ctx.arc(a.x + 15 - ox, a.y + 15 - oy, 30, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 玩家冲刺形态: 圆形(半径30)
      ctx.fillStyle = '#00d4ff';
      ctx.beginPath();
      ctx.arc(this.x + 15 - ox, this.y + 15 - oy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.x + 18 - ox, this.y + 12 - oy, 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (this.powerTimer > 0) {
      ctx.fillStyle = 'rgba(243,156,18,0.35)';
      ctx.fillRect(this.x - ox - 3, this.y - oy - 3, this.w + 6, this.h + 6);
    }
    if (this.hitFlash > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(this.x - ox, this.y - oy, this.w, this.h); return; }
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(this.x - ox, this.y - oy, this.w, this.h);
    const fr = this.facing >= 0;   // 眼睛跟随最近朝向
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.x - ox + (fr ? 12 : 4), this.y - oy + 4, 4, 4);
    ctx.fillRect(this.x - ox + (fr ? 18 : 10), this.y - oy + 4, 4, 4);
  }
}
