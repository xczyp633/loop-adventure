// ============================================================================
// dragon.js — 龙 Boss(不继承 Ent: 视觉是椭圆, 判定自己算)
// 依赖(引擎注入): TILE ROWS canvas camX FEEL player
// ============================================================================

class Dragon {
  constructor() {
    this.SEG_N = 18; this.seg = [];
    for (let i = 0; i < this.SEG_N; i++) this.seg.push({ x: 0, y: 0, px: 0, py: 0, a: Math.PI });
    this.hp = 1000; this.maxHp = 1000; this.t = 0; this.state = 'AIM';
    this.homeX = 500; this.homeY = (ROWS - 1) * TILE - 180;
    this.breathTm = 0; this.breathCd = 0; this.breathCount = 0; this.maxBreath = 3;
    this.laser = false; this.laserTm = 0; this.chargeTm = 0;
    this.laserClip = []; this.laserPtr = 0; this.laserLeft = 0; this.laserReload = 0;
    this.hitFlash = 0; this.x = this.homeX; this.y = this.homeY; this.ang = Math.PI; this.alive = true;
    // 碰撞框: 视觉是椭圆, 判定单独给, 和 w/h 解耦
    this.w = 60; this.h = 40;
    this.headHalfW = 58;      // 龙头左右判定半宽(对齐视觉头宽)
    this.headHalfH = 38;      // 龙头上下判定半径
    this.stompCd = 0;         // 踩头冷却(秒), 防止无限跳连踩瞬间秒杀龙
    // ===== 巡航: 在"跟随玩家的巡逻区间"内往返, 到边界掉头 =====
    // 区间大小固定(半宽 patrolHalf), 只有中心 patrolX 随玩家平移 —— 改大小改 patrolHalf
    this.patrolHalf = 300;    // 巡逻区间半宽(总宽 = 2*patrolHalf)
    this.patrolX = this.homeX; // 区间中心(平滑跟随玩家)
    this.dir = 1;             // 巡航朝向: 1右 / -1左
    this.patrolSpeed = 120;   // 巡航速度(px/s), 改这个调"压迫感"
    this.catchUpMul = 3.0;    // 龙被甩出区间时的回位加速倍率(玩家全速240px/s, 2.0=240只平速追不上, 3.0=360才追得上)
    this.followLerp = 2.2;    // 区间中心跟随玩家的收敛速度(越大跟得越紧)
  }

  spawn(x, y) {
    this.homeX = x; this.homeY = y; this.x = x; this.y = y;
    this.patrolX = x; this.dir = 1;
    for (let i = 0; i < this.SEG_N; i++) {
      this.seg[i].x = x - i * 26; this.seg[i].y = y;
      this.seg[i].px = this.seg[i].x; this.seg[i].py = this.seg[i].y; this.seg[i].a = Math.PI;
    }
    this.ang = Math.PI; this.state = 'AIM';
  }

  reloadLaser() {
    const n = Math.floor(Math.random() * 4) + 2;
    this.laserClip = [];
    for (let i = 0; i < n; i++) this.laserClip.push(true);
    for (let i = 0; i < 2; i++) this.laserClip.push(false);
    for (let i = this.laserClip.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.laserClip[i], this.laserClip[j]] = [this.laserClip[j], this.laserClip[i]];
    }
    this.laserLeft = n; this.laserPtr = 0;
  }

  onScreen() { return this.x > camX - 120 && this.x < camX + canvas.width + 120; }

  update(dt) {
    if (!this.alive || !player || !player.alive) return;
    this.t += dt;
    this.breathTm = Math.max(0, this.breathTm - dt);
    this.breathCd = Math.max(0, this.breathCd - dt);
    this.stompCd = Math.max(0, this.stompCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    // ===== 巡航: 区间中心平滑跟随玩家(大小不变), 龙在区间内往返, 越界掉头 =====
    // 旧逻辑是 this.x = this.homeX 每帧钉死原地(站桩炮台), 现在换成真移动
    const follow = 1 - Math.exp(-this.followLerp * dt);
    this.patrolX += (player.x - this.patrolX) * follow;
    const pLeft = this.patrolX - this.patrolHalf;
    const pRight = this.patrolX + this.patrolHalf;
    // 玩家把区间带走了, 龙落在区间外 → 加速朝区间内飞(不瞬移)
    let spd = this.patrolSpeed;
    if (this.x < pLeft) { this.dir = 1; spd *= this.catchUpMul; }
    else if (this.x > pRight) { this.dir = -1; spd *= this.catchUpMul; }
    this.x += this.dir * spd * dt;
    // 到边界掉头(区间位置在变, 所以每帧都要判)
    if (this.x >= pRight) this.dir = -1;
    else if (this.x <= pLeft) this.dir = 1;
    this.y = this.homeY;   // 高度固定, 不做上下浮动(踩头/吐息判定依赖它)
    const dTP = Math.hypot(player.x - this.x, player.y - this.y);
    this.ang = Math.atan2(player.y - this.y, player.x - this.x);
    const SL = 26;
    this.seg[0].px = this.seg[0].x; this.seg[0].py = this.seg[0].y;
    this.seg[0].x = this.x; this.seg[0].y = this.y; this.seg[0].a = this.ang;
    for (let i = 1; i < this.SEG_N; i++) {
      const p = this.seg[i - 1], c = this.seg[i];
      const tx = p.x - Math.cos(p.a) * SL, ty = p.y - Math.sin(p.a) * SL;
      c.px = c.x; c.py = c.y;
      const f = 1 - Math.exp(-10 * dt);
      c.x += (tx - c.x) * f; c.y += (ty - c.y) * f;
      c.a = Math.atan2(c.y - c.py, c.x - c.px);
      if (c.x === c.px && c.y === c.py) c.a = p.a;
      const side = Math.sin(this.t * 2.5 - i * 0.5) * (1.2 + i * 0.12);
      c.x += -Math.sin(c.a) * side; c.y += Math.cos(c.a) * side;
    }
    const hpR = this.hp / this.maxHp;
    const bCd = hpR < 0.5 ? 2.0 * hpR : 2.0;
    const vis = this.onScreen();
    if (this.state === 'AIM') {
      if (dTP < 300 && this.breathCd <= 0 && vis && Math.random() < 0.02) {
        this.state = 'BREATH'; this.breathTm = 1.8; this.breathCount++;
      }
    }
    if (this.state === 'BREATH') {
      const el = 1.8 - this.breathTm;
      if (el > 0.5) {
        const atp = Math.atan2(player.y - this.y, player.x - this.x);
        let da = Math.abs(atp - this.ang); if (da > Math.PI) da = Math.PI * 2 - da;
        const inS = player.x > camX - 50 && player.x < camX + canvas.width + 50;
        if (dTP < 300 && da < 0.32 && player.alive && inS) player.hurt(this.x);
      }
      if (this.breathTm <= 0) {
        this.state = 'AIM';
        if (this.breathCount >= this.maxBreath) { this.breathCount = 0; this.breathCd = bCd; }
      }
    }
    if (this.laserReload > 0) { this.laserReload -= dt; if (this.laserReload <= 0) this.reloadLaser(); }
    const visL = this.x > camX - 150 && this.x < camX + canvas.width + 150;
    if (!this.laser && this.laserLeft <= 0 && this.laserReload <= 0 && hpR < 0.5 && visL) this.reloadLaser();
    if (!this.laser && this.laserLeft > 0 && this.breathCd <= 0 && dTP < 500 && hpR < 0.5 && visL && Math.random() < 0.005) {
      this.laser = true; this.chargeTm = 1.5;
    }
    if (this.laser && this.chargeTm > 0) this.chargeTm -= dt;
    if (this.laser && this.chargeTm <= 0 && this.laserTm <= 0) {
      const bul = this.laserClip[this.laserPtr];
      this.laserPtr = (this.laserPtr + 1) % this.laserClip.length;
      if (bul) {
        // 用玩家中心算角度(原来用左上角, 近距离时偏差可达 ~0.1rad, 和 0.09 的容差同量级)
        const pcx = player.x + player.w / 2, pcy = player.y + player.h / 2;
        const atp = Math.atan2(pcy - this.y, pcx - this.x);
        let da = Math.abs(atp - this.ang); if (da > Math.PI) da = Math.PI * 2 - da;
        const inS = player.x > camX - 50 && player.x < camX + canvas.width + 50;
        // 近身不吃激光: 原来 da<0.09 没有下限, 玩家贴着龙站(120~200px)必中且躲不开
        const laserMin = 160;
        const pdc = Math.hypot(pcx - this.x, pcy - this.y);
        if (da < 0.09 && pdc >= laserMin && pdc < 600 && player.alive && inS) player.hurt(this.x);
      }
      this.laserLeft--; this.laserTm = 0.3;
    }
    if (this.laser && this.laserTm > 0) this.laserTm -= dt;
    if (this.laser && this.laserLeft <= 0 && this.laserTm <= 0) { this.laser = false; this.laserReload = 2.0 + Math.random() * 2.0; }
    if (dTP < 55 && player.alive) player.hurt(this.x);
  }

  draw(ox, oy) {
    if (!this.alive) return;
    ctx.save(); ctx.translate(this.x - ox, this.y - oy); ctx.rotate(this.ang);
    for (let i = this.SEG_N - 1; i >= 1; i--) {
      const s = this.seg[i];
      const px = s.x - this.x, py = s.y - this.y;
      const sc = 1 - i / this.SEG_N;
      const r = 20 * sc + 3;
      ctx.save(); ctx.translate(px, py); ctx.rotate(s.a - this.ang);
      ctx.fillStyle = this.hitFlash > 0 ? '#fff' : '#d9dde3';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const g = ctx.createLinearGradient(-30, -45, 40, 45);
    g.addColorStop(0, this.hitFlash > 0 ? '#faa' : '#fff');
    g.addColorStop(0.45, '#f1f4f7'); g.addColorStop(1, '#aeb8c2');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 58, 38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dce3e8'; ctx.beginPath(); ctx.ellipse(12, 15, 40, 19, 0, 0, Math.PI * 2); ctx.fill();
    const hg = ctx.createRadialGradient(55, -15, 4, 65, 0, 45);
    hg.addColorStop(0, '#fff'); hg.addColorStop(0.65, '#edf1f4'); hg.addColorStop(1, '#9da8b1');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(65, -3, 38, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f22'; ctx.beginPath(); ctx.ellipse(65, -12, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (this.laser && this.chargeTm <= 0 && this.laserTm > 0) {
      // 按朝向画, 长度与判定一致(600 内). 原来固定向右画 600px, 朝左时画面和判定对不上.
      const L = 600;
      const x0 = this.x - ox + Math.cos(this.ang) * 160;   // 从激光最近距离处起(近身是安全区)
      const y0 = this.y - oy + Math.sin(this.ang) * 160;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,50,50,0.8)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(this.ang) * (L - 160), y0 + Math.sin(this.ang) * (L - 160)); ctx.stroke();
      ctx.restore();
    }
  }
}
