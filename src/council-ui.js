// ============================================================================
// council-ui.js — 圆桌投票可视化
//
// 原来: councilRound 的结论只在左上角 HUD 显示 4 秒文字。
// 现在: 结算那一刻, 屏幕中央画出圆桌 + 5 个村民头像(含 1 个隐狼),
//       每个人的票先转圈, 然后逐个亮出 ✅ 同意 / ❌ 反对, 最后出结论横幅。
//
// 关键设计(不能踩的坑):
//   1. 纯视觉: 只在 draw() 里读 COUNCIL 数据, 绝不改 att/votes/kind,
//      也不消耗 Math.random —— 保证不影响游戏确定性(回归测试要靠这个)
//   2. 错时: 动画用真实时间(performance.now), 不占游戏 dt
//   3. 不进 loop 竞争: 用 requestAnimationFrame 自己画, 画在游戏画面之上
//      画布是同一个 #game, 所以坐标直接用屏幕坐标
//   4. 玩家死亡/重开时被强制收掉, 不会挡住 GAME OVER
// ============================================================================

const COUNCIL_UI = (() => {
  const DUR = { in: 0.45, flip: 0.22, gap: 0.13, hold: 3.2, out: 0.45 };
  let show = null;          // { startAt, att, members, kind, text, v }
  let raf = 0;
  let canvas = null;

  function layout() {
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const R = Math.max(90, Math.min(W, H) * 0.20);      // 圆桌半径
    return { W, H, cx, cy, R };
  }

  // ---- 画一个村民头像(纯 canvas, 无图片) ----
  // i: 序号, wolf: 是否隐狼(结算后才露馅), revealed: 是否已亮票
  function drawMember(c, x, y, r, i, c2) {
    const n = c2.i;
    // 头
    const skin = ['#f2c79a', '#e8b98a', '#f7d3ae', '#dfae7e', '#efc396'];
    c.fillStyle = skin[n % skin.length];
    c.beginPath(); c.arc(x, y, r * 0.62, 0, Math.PI * 2); c.fill();
    // 头发(每人形状不同, 一眼能分清)
    c.fillStyle = ['#3a2a1a', '#6b4a2a', '#20242e', '#8a5a2a', '#4a3a5a'][n % 5];
    c.beginPath();
    if (n % 3 === 0) c.arc(x, y - r * 0.12, r * 0.64, Math.PI, Math.PI * 2);
    else if (n % 3 === 1) { c.arc(x, y - r * 0.05, r * 0.68, Math.PI * 1.05, Math.PI * 1.95); }
    else { c.arc(x, y - r * 0.02, r * 0.60, Math.PI * 1.15, Math.PI * 1.85); }
    c.fill();
    // 眼睛(隐狼: 结算后变红)
    const wolfShow = c2.wolf && c2.revealed;
    c.fillStyle = wolfShow ? '#ff2222' : '#222';
    c.beginPath(); c.arc(x - r * 0.22, y - r * 0.05, r * 0.075, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + r * 0.22, y - r * 0.05, r * 0.075, 0, Math.PI * 2); c.fill();
    // 嘴: 同意=笑 反对=撇嘴 未知=平
    c.strokeStyle = wolfShow ? '#ff2222' : '#5a3a2a';
    c.lineWidth = Math.max(1.5, r * 0.09);
    c.beginPath();
    if (c2.vote === 1) c.arc(x, y + r * 0.12, r * 0.24, Math.PI * 0.15, Math.PI * 0.85);
    else if (c2.vote === -1) c.arc(x, y + r * 0.38, r * 0.24, Math.PI * 1.2, Math.PI * 1.8);
    else c.moveTo(x - r * 0.18, y + r * 0.30), c.lineTo(x + r * 0.18, y + r * 0.30);
    c.stroke();
    // 名字
    c.fillStyle = '#e8e8e8';
    c.font = 'bold ' + Math.round(r * 0.34) + 'px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(c2.name, x, y + r * 0.98);
  }

  function drawCheck(c, x, y, s) {
    c.strokeStyle = '#2ecc71'; c.lineWidth = Math.max(3, s * 0.18); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - s * 0.45, y); c.lineTo(x - s * 0.1, y + s * 0.38); c.lineTo(x + s * 0.5, y - s * 0.42); c.stroke();
  }
  function drawCross(c, x, y, s) {
    c.strokeStyle = '#e94560'; c.lineWidth = Math.max(3, s * 0.18); c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - s * 0.4, y - s * 0.4); c.lineTo(x + s * 0.4, y + s * 0.4);
    c.moveTo(x + s * 0.4, y - s * 0.4); c.lineTo(x - s * 0.4, y + s * 0.4);
    c.stroke();
  }

  function draw() {
    if (!show) return;
    raf = 0;
    const ctx2 = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx2) { show = null; return; }
    const t = (performance.now() - show.startAt) / 1000;
    const L = layout();
    const n = show.members.length;
    const totalIn = DUR.in + n * (DUR.flip + DUR.gap);
    const endAt = totalIn + DUR.hold + DUR.out;
    if (t > endAt) { show = null; return; }

    const alpha = t < DUR.in ? t / DUR.in : (t > endAt - DUR.out ? Math.max(0, (endAt - t) / DUR.out) : 1);
    ctx2.save();
    ctx2.globalAlpha = alpha;

    // 背景压暗
    ctx2.fillStyle = 'rgba(0,0,0,0.55)';
    ctx2.fillRect(0, 0, L.W, L.H);

    const pop = Math.min(1, t / DUR.in);
    const ease = 1 - Math.pow(1 - pop, 3);
    const R = L.R * (0.6 + 0.4 * ease);

    // 圆桌
    ctx2.fillStyle = 'rgba(90,60,35,0.92)';
    ctx2.beginPath(); ctx2.arc(L.cx, L.cy, R, 0, Math.PI * 2); ctx2.fill();
    ctx2.strokeStyle = '#d4a25a'; ctx2.lineWidth = 4;
    ctx2.beginPath(); ctx2.arc(L.cx, L.cy, R, 0, Math.PI * 2); ctx2.stroke();
    ctx2.strokeStyle = 'rgba(255,255,255,0.12)'; ctx2.lineWidth = 1;
    ctx2.beginPath(); ctx2.arc(L.cx, L.cy, R * 0.72, 0, Math.PI * 2); ctx2.stroke();

    // 标题
    ctx2.fillStyle = '#ffd24a';
    ctx2.font = 'bold ' + Math.round(Math.max(16, R * 0.22)) + 'px sans-serif';
    ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
    ctx2.globalAlpha = alpha * Math.min(1, t / 0.3);
    ctx2.fillText('圆 桌 投 票', L.cx, L.cy - R * 0.42);
    ctx2.fillStyle = '#bbb';
    ctx2.font = Math.round(Math.max(12, R * 0.14)) + 'px sans-serif';
    ctx2.fillText('第 ' + show.loop + ' 圈结算', L.cx, L.cy - R * 0.42 + R * 0.22);
    ctx2.globalAlpha = alpha;

    // 头像环绕圆桌
    const mr = Math.max(16, R * 0.20);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + i * (Math.PI * 2 / n);
      const mx = L.cx + Math.cos(ang) * R * 0.98;
      const my = L.cy + Math.sin(ang) * R * 0.98;
      const flipAt = DUR.in + i * (DUR.flip + DUR.gap);
      const c2 = show.members[i];
      const revoked = t >= flipAt + DUR.flip;
      // 亮票时配一声短音(只报"刚亮出"那一帧, 不影响游戏)
    if (revoked && !c2.sounded) { c2.sounded = true; if (typeof SFX_HOOK !== 'undefined') SFX_HOOK.play(c2.vote === 1 ? 'voteYes' : c2.vote === -1 ? 'voteNo' : 'hit'); }
    // 亮票时轻微弹一下
      const bounce = revoked ? 1 + 0.12 * Math.max(0, 1 - (t - flipAt - DUR.flip) / 0.2) : 1;
      ctx2.save();
      ctx2.translate(mx, my); ctx2.scale(bounce, bounce); ctx2.translate(-mx, -my);
      // 底盘
      ctx2.fillStyle = 'rgba(0,0,0,0.45)';
      ctx2.beginPath(); ctx2.arc(mx, my, mr * 1.12, 0, Math.PI * 2); ctx2.fill();
      drawMember(ctx2, mx, my, mr, i, {
        i, name: c2.name, vote: revoked ? c2.vote : 0,
        wolf: c2.wolf, revealed: revoked && show.revealWolf,
      });
      // 票: 亮出后浮在头像右上
      if (revoked) {
        const k = Math.min(1, (t - flipAt - DUR.flip) / 0.15);
        ctx2.globalAlpha = alpha * k;
        const bx = mx + mr * 0.85, by = my - mr * 0.85, bs = mr * 0.62;
        ctx2.fillStyle = 'rgba(0,0,0,0.7)';
        ctx2.beginPath(); ctx2.arc(bx, by, bs, 0, Math.PI * 2); ctx2.fill();
        if (c2.vote === 1) drawCheck(ctx2, bx, by, bs * 1.1);
        else if (c2.vote === -1) drawCross(ctx2, bx, by, bs * 1.1);
        else { ctx2.fillStyle = '#aaa'; ctx2.font = 'bold ' + Math.round(bs * 1.1) + 'px sans-serif'; ctx2.fillText('?', bx, by + 1); }
        ctx2.globalAlpha = alpha;
      }
      ctx2.restore();
    }

    // 中央计票
    if (t >= totalIn - 0.15) {
      const k = Math.min(1, (t - totalIn + 0.15) / 0.3);
      ctx2.globalAlpha = alpha * k;
      const fs = Math.round(Math.max(20, R * 0.30));
      ctx2.font = 'bold ' + fs + 'px sans-serif';
      const yes = show.members.filter(m => m.vote === 1).length;
      const no = show.members.filter(m => m.vote === -1).length;
      ctx2.fillStyle = '#2ecc71'; ctx2.fillText(String(yes), L.cx - fs * 0.7, L.cy + R * 0.02);
      ctx2.fillStyle = '#888'; ctx2.font = 'bold ' + Math.round(fs * 0.7) + 'px sans-serif';
      ctx2.fillText(':', L.cx, L.cy + R * 0.02);
      ctx2.fillStyle = '#e94560'; ctx2.font = 'bold ' + fs + 'px sans-serif';
      ctx2.fillText(String(no), L.cx + fs * 0.7, L.cy + R * 0.02);
      // 结论
      ctx2.globalAlpha = alpha;
      ctx2.font = 'bold ' + Math.round(Math.max(14, R * 0.17)) + 'px sans-serif';
      ctx2.fillStyle = show.kind === 'reward' ? '#2ecc71' : show.kind === 'penalty' ? '#e94560' : '#cccccc';
      ctx2.fillText(show.title, L.cx, L.cy + R * 0.30);
      if (show.wolfShown) {
        ctx2.fillStyle = '#ff8888';
        ctx2.font = Math.round(Math.max(11, R * 0.12)) + 'px sans-serif';
        ctx2.fillText('隐狼被火光照出来了', L.cx, L.cy + R * 0.50);
      }
    }
    ctx2.restore();

    raf = requestAnimationFrame(draw);
  }

  // councilRound 结算时调用
  function trigger(payload) {
    try {
      if (typeof canvas === 'undefined' || !canvas) { canvas = document.getElementById('game'); }
      if (!canvas) return;
      const att = payload.att || {};
      const members = [];
      for (let i = 0; i < (payload.members || 5); i++) {
        const name = '村民' + (i + 1);
        members.push({ name, vote: att[name] || 0, wolf: i === 2 });   // 与 engines 的"隐狼固定第 3 位"一致
      }
      show = {
        startAt: performance.now(),
        members,
        kind: payload.kind,
        // 引擎里 kind 只能是 reward / penalty / none, 平票要按 none 处理
        title: payload.kind === 'reward' ? '放行 — 村民支持你'
             : payload.kind === 'penalty' ? '加码 — 有人不服' : '平票 — 这圈不作数',
        loop: payload.loop,
        revealWolf: !!payload.wolfChecked,
        wolfShown: !!payload.wolfChecked,
      };
      if (!raf) raf = requestAnimationFrame(draw);
    } catch (e) { show = null; }
  }

  function cancel() {
    show = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function setCanvas(c) { canvas = c; }

  return { trigger, cancel, setCanvas, get active() { return !!show; } };
})();
