// ============================================================================
// ai.js — 怪物行为表(Brain): 把 "state + 一长串 if-else" 变成 "state + 一张表"
//
// 为什么要改:
//   原来的 Enemy.update 里 IDLE/PURSUE/CONFUSED/ATTACK 四个状态各写一段 if,
//   加"会飞的怪""会放魔法的怪"就得再插分支, 函数会越来越长。
//   现在每个状态的行为登记在 AI_BEHAVIORS 表里, 新怪 = 新名字 + 新的一段行为。
//
// 三种扩展方式(从易到难):
//   1. AI_MOVES[state]        只改移动方式(比如会飞: 目标高度不同)
//   2. registerBehavior(s,fn) 加一种新状态(比如 CAST: 蓄力放魔法)
//   3. ARCHETYPES.xx          加一种怪型(换数值/初始状态/行为组合)
//
// 关键约定: 取随机数一律走 R() (= Math.random)。
//           这样才能与重构前的 if-else 版做"同种子逐帧一致"回归。
// ============================================================================

const AI_STATES = {
  IDLE: 'IDLE',
  PURSUE: 'PURSUE',
  CONFUSED: 'CONFUSED',
  ATTACK: 'ATTACK',
};

const R = () => Math.random();
// 每个状态的 act 收到一个环境对象 o = { e: 敌人, ctx: 本帧上下文, md: 当前移动方向, setMd(v) }
// 返回下一个状态(与当前相同 = 停在本状态)

// ---------------------------------------------------------------------------
// 移动表(扩展用): 新怪型如果只是"走得不一样", 在这里登记即可;
// 现有四种状态的移动方向在各自行为里用 setMd() 给出(与原版逐帧等价)
// ---------------------------------------------------------------------------
const AI_MOVES = {
  [AI_STATES.IDLE]:     { decide(e) { return e._pd; } },   // 巡逻方向
  [AI_STATES.PURSUE]:   { decide(e, ctx) { return ctx.dx > 0 ? 1 : -1; } },
  [AI_STATES.CONFUSED]: { decide() { return 0; } },
  [AI_STATES.ATTACK]:   { decide() { return 0; } },
};

// ---------------------------------------------------------------------------
// 状态迁移表: 数据化描述"什么情况下转到什么状态"(when 只是标签, 判定在下面)
// ---------------------------------------------------------------------------
const ENEMY_BRAIN = {
  initial: AI_STATES.IDLE,
  steps: [
    { from: AI_STATES.IDLE,     to: AI_STATES.PURSUE,   when: 'sight' },
    { from: AI_STATES.PURSUE,   to: AI_STATES.ATTACK,   when: 'touch' },
    { from: AI_STATES.PURSUE,   to: AI_STATES.CONFUSED, when: 'random' },
    { from: AI_STATES.CONFUSED, to: AI_STATES.PURSUE,   when: 'timer' },
    { from: AI_STATES.ATTACK,   to: AI_STATES.PURSUE,   when: 'lostTarget' },
    { from: AI_STATES.ATTACK,   to: AI_STATES.IDLE,     when: 'giveUp' },
  ],
};

const AI_BEHAVIORS = {};
const AI_ORDER = {};          // 兼容旧写法(行为里的 order 字段), 实际排序用下面的 AI_CHAIN
function registerBehavior(state, def) {
  AI_BEHAVIORS[state] = def;
  AI_ORDER[state] = typeof def.order === 'number' ? def.order : 999;
}
// 检查顺序: 原版 if 链是 先 PURSUE 后 IDLE(IDLE 永远最后), 新怪型的状态默认插在 IDLE 之前
function aiChain() {
  return AI_CHAIN.filter(k => AI_BEHAVIORS[k])
    .concat(Object.keys(AI_BEHAVIORS).filter(k => AI_CHAIN.indexOf(k) < 0));
}

// IDLE: 巡逻; 看见玩家立刻"咬住"(locked=true, 只触发一次)并转 PURSUE
registerBehavior(AI_STATES.IDLE, {
  order: 30,
  // 巡逻: 计时到点换向 + 到巡逻边界掉头(和原版 IDLE 那段一字不差)
  act(o) {
    // 注意: 原版 IDLE 段只改 _pd(下一步的巡逻方向), 不改 md ——
    // 本帧实际位移用的是"进入 IDLE 段之前"的 md(通常是上一帧的 _pd)。
    // 早期版本这里多写了一行 setMd(e._pd), 导致掉头那一帧方向反了。
    const { e } = o;
    e._pt--;
    if (e._pt <= 0) { e._pd = R() < 0.5 ? -1 : 1; e._pt = 60 + Math.floor(R() * 120); }
    if (e.x - e.startX > e.patrolRange) e._pd = -1;
    else if (e.startX - e.x > e.patrolRange) e._pd = 1;
    return AI_STATES.IDLE;
  },
});

// PURSUE: 贴身进 ATTACK; 偶尔走神(顺序: 先判贴身, 再判走神 —— 与原版一致)
registerBehavior(AI_STATES.PURSUE, {
  order: 10,      // 原版 if 链顺序: PURSUE -> CONFUSED -> ATTACK -> IDLE
  act(o) {
    const { e, ctx, setMd } = o;
    setMd(ctx.dx > 0 ? 1 : -1);                       // 朝玩家
    // 贴身进 ATTACK. 原版是"非 else-if 的 if 链": 这里把 state 改成 ATTACK 之后,
    // 后面"再抽一次骰子决定要不要 CONFUSED"那一行仍然会执行(只是此时 state 已不是 PURSUE,
    // 所以骰子结果不会生效, 但随机数照样被消耗) —— 为了同种子逐帧可复现, 必须照原样消费.
    if (Math.abs(ctx.dx) < 26 && Math.abs(ctx.dy) < 30) {
      e._at = 36; setMd(0);
      if (R() < 0.08 * ctx.dt) e._ct = 30 + R() * 30;   // 结果被丢弃, 只消耗随机数(与原版一致)
      return AI_STATES.ATTACK;
    }
    // 注意: 这一步是"再抽一次骰子决定要不要 CONFUSED", 没抽中就保持 PURSUE,
    // 不能写成"没抽中则保持当前状态"那样直接 return 当前状态 —— 否则下面 IDLE 的巡逻逻辑会被跳过
    if (R() < 0.08 * ctx.dt) { e._ct = 30 + R() * 30; return AI_STATES.CONFUSED; }   // 原版是 30+rand*30(小数)
    return AI_STATES.PURSUE;
  },
});

// CONFUSED: 呆 N 帧
registerBehavior(AI_STATES.CONFUSED, {
  order: 20,
  // 原版语义: 每帧 _ct--; 减到 0 就切回 PURSUE(该帧还没真正走到就结束)
  // 注意: 原版这里不会动 locked —— 只有 ATTACK 放弃追击时才会清 locked
  act(o) {
    const { e, setMd } = o;
    setMd(0);
    e._ct--;
    if (e._ct <= 0) return AI_STATES.PURSUE;
    return AI_STATES.CONFUSED;
  },
});

// ATTACK: 只在仍贴着玩家时维持; 玩家跑了/被击退就脱战(不再永久冻住)
registerBehavior(AI_STATES.ATTACK, {
  order: 40,
  act(o) {
    const { e, ctx, setMd } = o;
    setMd(0);
    e._at--;
    const stillClose = Math.abs(ctx.dx) < e.attackRange && Math.abs(ctx.dy) < e.attackRangeY;
    if (e._at <= 0 || !stillClose || !ctx.playerAlive) {
      if (ctx.playerAlive && Math.abs(ctx.dx) < ctx.curSight && Math.abs(ctx.dy) <= 200) return AI_STATES.PURSUE;
      e.locked = false; e._pt = 60 + Math.floor(R() * 120);
      return AI_STATES.IDLE;
    }
    return AI_STATES.ATTACK;
  },
});

// ---------------------------------------------------------------------------
// 怪型表: 加"会飞的怪""会放魔法的怪"就在这里加一行
// ---------------------------------------------------------------------------
const ARCHETYPES = {
  walker: { speed: { base: 1.5, chase: 2.8 }, sight: 360, skill: true },   // 当前唯一怪型
  // flyer: { speed: { base: 2.0, chase: 3.2 }, sight: 420, skill: false },
  // mage:  { speed: { base: 1.0, chase: 1.4 }, sight: 500, skill: false },
};

// ---------------------------------------------------------------------------
// 跑一帧 AI, 返回 { dir, state }
// ctx.md: 本帧移动到现在的"默认方向"(原版 let md = this._pd, PURSUE 分支会先把它改成朝玩家)
// 判定顺序与原 if-else 版完全一致, 随机数取用位置也一致 → 可做同种子回归
// ---------------------------------------------------------------------------
function runBrain(e, ctx) {
  // 原版是一条 if 链, 这里逐行重放(顺序 = AI_CHAIN):
  //   0. 开头独立一行: 没咬住 + 看见玩家 -> 咬住, 并把状态置成 PURSUE(只改状态)
  //   1. PURSUE / CONFUSED / ATTACK / IDLE 四段, 当前状态匹配就执行
  //   2. 某段把状态改了就"从头再来"(原版后面的段看到的是新状态), 一圈无迁移则本帧结束
  // 新增怪型: 往 AI_BEHAVIORS / AI_MOVES 加条目, 不用改这里.
  const CHAIN = aiChain();
  let st = e.state;
  if (!AI_BEHAVIORS[st]) st = ENEMY_BRAIN.initial;
  let md = ctx.md != null ? ctx.md : e._pd;      // 原版: let md = this._pd
  const o = { e, ctx, get md() { return md; }, setMd(v) { md = v; } };
  // 从头重放时, 只从"让状态刚变掉的那一段之后"继续检查 —— 这正对应原版 if 链:
  // 状态在位置 i 被改掉后, 原版只会继续往下看 i+1..末尾的 if, 不会回头再执行 i 本身
  // (早期版本每次都从链头重跑, 导致 ATTACK 脱战改成 PURSUE 之后, 同一帧又执行了一遍
  //  PURSUE 段, 把刚减到 0 的 _at 又设成 36 → 怪永远脱不了战)
  for (let pass = 0, from = 0; pass < 10; pass++) {
    // 第 0 行(独立于各状态): 没咬住 + 看见玩家 -> 咬住并把状态置成 PURSUE
    if (!e.locked && ctx.inSight) { e.locked = true; st = AI_STATES.PURSUE; from = 0; }
    let moved = false, nextFrom = 0;
    for (let i = from; i < CHAIN.length; i++) {
      if (st !== CHAIN[i]) continue;
      const beh = AI_BEHAVIORS[st];
      const r = beh ? beh.act(o) : st;
      if (r !== st) { st = r; moved = true; nextFrom = i + 1; break; }
    }
    md = o.md;
    if (!moved) break;
    from = nextFrom;
  }
  e.state = st;
  return { dir: md, state: st };
}

// 原版 if 链的检查顺序(改顺序会改变同帧内的判定结果, 别随便动)
const AI_CHAIN = [AI_STATES.PURSUE, AI_STATES.CONFUSED, AI_STATES.ATTACK, AI_STATES.IDLE];
