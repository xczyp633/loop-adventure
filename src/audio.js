// ============================================================================
// audio.js — Web Audio 合成器: 不加载任何音频文件, 全靠振荡器现算
//
// 用法:
//   AUDIO.unlock()      在第一次用户手势(点击/按键)里调用, 解除浏览器静音
//   AUDIO.play('jump')  播放一个音效(带限流, 防止密集帧糊成爆音)
//   AUDIO.setMute(true) 静音/恢复(设置会记住)
//
// 设计要点:
//   1. 每个音效 = 一串"音符"(osc + 包络), 用数据描述, 加音效只加一行数据
//   2. 所有声音必须挂在 master 上, master 音量压到 0.25 —— 手机外放不刺耳
//   3. 同一音效 50ms 内不重复(冲刺每帧都在命中, 不限流会炸)
//   4. 没有 AudioContext 的环境(比如无头测试)全部静默降级, 绝不抛错
// ============================================================================

const AUDIO = (() => {
  let ac = null, master = null, noiseBuf = null;
  let muted = false, ready = false;
  const lastAt = {};              // 限流: 音效名 → 上次播放时间
  const MIN_GAP = 0.05;           // 秒
  const MAX_VOICES = 24;          // 同时发声上限
  let voices = 0;

  function ensure() {
    if (ac) return ac;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ac = new Ctor();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.25;
      master.connect(ac.destination);
    } catch (err) { ac = null; return null; }
    return ac;
  }

  // 白噪声(爆炸/受伤用): 只生成一次, 复用
  // 注意: 这里(以及整个音频模块)绝对不能用 Math.random ——
  // 游戏逻辑也吃同一个 Math.random, 音频若跟着抽数会把怪物的随机序列整条推歪,
  // 表现为"加了音效之后怪的行为全变了". 所以噪声用自带的 xorshift 种子生成.
  let noiseSeed = 0x9e3779b9;
  function noiseRand() {
    noiseSeed ^= noiseSeed << 13; noiseSeed ^= noiseSeed >>> 17; noiseSeed ^= noiseSeed << 5;
    return ((noiseSeed >>> 0) / 4294967296);
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    const n = Math.floor(ac.sampleRate * 0.4);
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (noiseRand() * 2 - 1) * (1 - i / n);
    return noiseBuf;
  }

  // 一个"音符": 振荡器 + 频率滑移 + ADSR 包络
  // o = { type, f0, f1, dur, vol, delay, slide }  slide: 'exp'|'lin'|null
  function note(o) {
    const t0 = ac.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const g = ac.createGain();
    const vol = (o.vol == null ? 0.5 : o.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(master);
    let src;
    if (o.type === 'noise') {
      src = ac.createBufferSource();
      src.buffer = noise();
      if (o.f0 || o.f1) {
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(o.f0 || 800, t0);
        if (o.f1) bp.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t0 + dur);
        bp.Q.value = o.q || 1.2;
        src.connect(bp); bp.connect(g);
      } else src.connect(g);
    } else {
      src = ac.createOscillator();
      src.type = o.type || 'square';
      src.frequency.setValueAtTime(Math.max(20, o.f0 || 440), t0);
      if (o.f1) {
        if (o.slide === 'lin') src.frequency.linearRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
        else src.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
      }
      src.connect(g);
    }
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    voices++;
    src.onended = () => { voices = Math.max(0, voices - 1); };
  }

  // ---- 音效表(数据): 加音效 = 加一条 ----
  const SFX = {
    jump:      [{ type: 'square',   f0: 300, f1: 620, dur: 0.11, vol: 0.22 }],
    hop:       [{ type: 'square',   f0: 460, f1: 760, dur: 0.09, vol: 0.18 }],
    land:      [{ type: 'noise',    f0: 200, f1: 90,  dur: 0.07, vol: 0.12 }],
    stomp:     [{ type: 'square',   f0: 520, f1: 180, dur: 0.10, vol: 0.30 },
                { type: 'triangle', f0: 220, f1: 90,  dur: 0.14, vol: 0.25 }],
    shoot:     [{ type: 'sawtooth', f0: 760, f1: 240, dur: 0.07, vol: 0.16 }],
    dash:      [{ type: 'noise',    f0: 1400, f1: 260, dur: 0.16, vol: 0.20, q: 0.8 }],
    hurt:      [{ type: 'sawtooth', f0: 200, f1: 55,  dur: 0.22, vol: 0.34 },
                { type: 'noise',    f0: 600, f1: 120, dur: 0.18, vol: 0.18 }],
    hit:       [{ type: 'square',   f0: 900, f1: 400, dur: 0.04, vol: 0.12 }],
    kill:      [{ type: 'square',   f0: 240, f1: 60,  dur: 0.18, vol: 0.26 },
                { type: 'noise',    f0: 500, f1: 100, dur: 0.20, vol: 0.22 }],
    pickup:    [{ type: 'triangle', f0: 660, dur: 0.08, vol: 0.26 },
                { type: 'triangle', f0: 990, dur: 0.12, vol: 0.24, delay: 0.07 }],
    special:   [{ type: 'triangle', f0: 523, dur: 0.09, vol: 0.26 },
                { type: 'triangle', f0: 659, dur: 0.09, vol: 0.26, delay: 0.08 },
                { type: 'triangle', f0: 784, dur: 0.16, vol: 0.26, delay: 0.16 }],
    loopclear: [{ type: 'square', f0: 523, dur: 0.10, vol: 0.24 },
                { type: 'square', f0: 659, dur: 0.10, vol: 0.24, delay: 0.09 },
                { type: 'square', f0: 784, dur: 0.10, vol: 0.24, delay: 0.18 },
                { type: 'square', f0: 1047, dur: 0.24, vol: 0.26, delay: 0.27 }],
    voteYes:   [{ type: 'triangle', f0: 660, dur: 0.07, vol: 0.20 },
                { type: 'triangle', f0: 880, dur: 0.11, vol: 0.20, delay: 0.06 }],
    voteNo:    [{ type: 'square', f0: 330, f1: 180, dur: 0.16, vol: 0.20 }],
    councilYes:[{ type: 'triangle', f0: 784, dur: 0.12, vol: 0.26 },
                { type: 'triangle', f0: 1047, dur: 0.26, vol: 0.26, delay: 0.11 }],
    councilNo: [{ type: 'sawtooth', f0: 300, f1: 110, dur: 0.35, vol: 0.28 },
                { type: 'noise', f0: 400, f1: 90, dur: 0.30, vol: 0.16 }],
    councilEven:[{ type: 'triangle', f0: 440, dur: 0.14, vol: 0.22 },
                { type: 'triangle', f0: 440, dur: 0.14, vol: 0.22, delay: 0.16 }],
    death:     [{ type: 'sawtooth', f0: 440, f1: 60, dur: 0.6, vol: 0.30 },
                { type: 'noise',    f0: 300, f1: 60, dur: 0.5, vol: 0.20 }],
    start:     [{ type: 'square', f0: 392, dur: 0.09, vol: 0.22 },
                { type: 'square', f0: 587, dur: 0.14, vol: 0.22, delay: 0.08 }],
    timeslow:  [{ type: 'triangle', f0: 880, f1: 220, dur: 0.5, vol: 0.20 }],
    door:      [{ type: 'triangle', f0: 300, f1: 520, dur: 0.18, vol: 0.20 }],
  };

  function play(name) {
    if (muted) return;
    const seq = SFX[name];
    if (!seq) return;
    if (!ensure()) return;
    if (ac.state === 'suspended') { unlock(); if (ac.state === 'suspended') return; }   // 浏览器策略: 没手势前不出声
    const now = ac.currentTime;
    if (lastAt[name] != null && now - lastAt[name] < MIN_GAP) return;
    if (voices > MAX_VOICES) return;
    lastAt[name] = now;
    ready = true;
    for (const o of seq) { try { note(o); } catch (e) { /* 单个音效失败不影响游戏 */ } }
  }

  function unlock() {
    if (!ensure()) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  }

  function setMute(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.25;
  }

  return {
    play, unlock, setMute,
    get muted() { return muted; },
    get ready() { return ready; },
    get ctx() { return ac; },
    toggleMute() { setMute(!muted); return muted; },
    SFX, MIN_GAP,
  };
})();

// ---------------------------------------------------------------------------
// sfx.js 的内容(放在同一文件里, 保证 build.js 内联时不多一个脚本标签):
// 把游戏事件 → 合成器音效
// 只是"事件转发", 不含任何判定, 出错就静默 —— 宁可没声音, 不能卡住游戏
// ---------------------------------------------------------------------------
const SFX_HOOK = {
  play(name) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('loopgame_mute') === '1') return;
      AUDIO.play(name);
    } catch (e) { /* 无声降级 */ }
  },
  unlock() { try { AUDIO.unlock(); } catch (e) {} },
  toggle() {
    try {
      const m = AUDIO.toggleMute();
      localStorage.setItem('loopgame_mute', m ? '1' : '0');
      return m;
    } catch (e) { return false; }
  },
  init() {
    try {
      // 页面加载时插一个"音频已授权"的引导: 第一次点击/按键后解锁
      const kick = () => { SFX_HOOK.unlock(); };
      window.addEventListener('pointerdown', kick, { once: true });
      window.addEventListener('keydown', kick, { once: true });
      // 记住静音状态
      if (typeof localStorage !== 'undefined' && localStorage.getItem('loopgame_mute') === '1') AUDIO.setMute(true);
    } catch (e) {}
  },
};
if (typeof window !== 'undefined') SFX_HOOK.init();
