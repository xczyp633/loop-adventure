# 循环探险 · 类库拆分说明

## 目录

| 文件 | 作用 | 依赖(全局) |
|---|---|---|
| `physics.js` | `Ent` 物理基类(AABB 碰撞、落地判定) | TILE, overlap, solid, solidRect, platformAt |
| `player.js` | `Player`(操作/冲刺/跳跃/受伤/绘制) | Ent, FEEL, input, scene, checkSecret, checkExit, onPlayerDeath, loopStats |
| `enemy.js` | `Enemy`(外观/物理/冲刺技能; **行为交给下面的 ai.js**) | Ent, ENEMY_SKILL, player, loopCount, timeStopTimer, runBrain |
| `ai.js` | **怪物行为表**(状态机表驱动, 见下节) | — (纯逻辑, 只用 Math.random) |
| `audio.js` | **Web Audio 合成器**(纯代码合成音效, 不带音频文件) | — (自己管理 AudioContext) |
| `council-ui.js` | **圆桌投票动画**(画村民头像 + 绿勾红叉) | DOM 的 #game 画布, 可选 SFX_HOOK |
| `dragon.js` | `Dragon`(Boss: 巡航/吐息/激光) | player, camX, canvas, FEEL, ROWS |
| `item.js` | `Item`(道具动画与图标) | COLORS |
| `box.js` | `Box`(箱子下落) | solid, solidRect |
| `boot.js` | 启动入口: DOM 就绪后调用 `init()` | init |
| `单文件版.html` | 开发结构: 引擎代码 + 用 `<script src>` 引类库 | — |
| `build.js` | 把类库内联进 `../循环探险5.html`, 生成可直接双击的单文件 | — |

## 用法

- **开发/阅读**: 打开 `单文件版.html`(需要和这些 .js 放在同一目录)
- **给手机玩**: `node build.js` → 生成 `../循环探险5.html`(单文件, 不依赖目录)

## 为什么要有 build

浏览器在 `file://` 下加载外部 `.js` 时, 有些安卓浏览器/文件管理器会拦截跨文件脚本加载。
`循环探险5.html` 把类库内联进去, 任何浏览器双击都能跑。

## 加载顺序(必须保持)

`physics.js` → `player/enemy/dragon/item/box` → `ai.js` → `audio.js` → `council-ui.js` → 引擎 → `boot.js`

类之间不互相 new: 世界对象由引擎创建, 类只负责自己的行为。

---

## 怪物行为表(ai.js) — 加新怪型只改这张表

以前 `Enemy.update` 里是一串 `if (state === 'IDLE') ... else if (PURSUE) ...`,
每加一种怪(会飞的、会放魔法的)就得在这串 if 里插分支, 越写越长。

现在拆成三层:

```js
// 1. 状态名
AI_STATES = { IDLE, PURSUE, CONFUSED, ATTACK }

// 2. 每种状态的"这一帧做什么", 用 registerBehavior 注册
registerBehavior(AI_STATES.PURSUE, {
  act(o) {                      // o = { e:怪, ctx:本帧的感知, md/setMd }
    setMd(o.ctx.dx > 0 ? 1 : -1);
    if (近身) return AI_STATES.ATTACK;   // 返回"下一个状态"
    if (R() < 0.08 * o.ctx.dt) return AI_STATES.CONFUSED;
    return AI_STATES.PURSUE;             // 不变就是原地
  },
});

// 3. 每帧调用一次, 返回这一帧往哪走
const { dir, state } = runBrain(enemy, ctx);
```

原来的 if-else 链等价于 `AI_CHAIN`（检查顺序 `PURSUE → CONFUSED → ATTACK → IDLE`），
`runBrain` 按这个顺序"重放"整条链, 一个状态被改掉就只从它的下一段继续检查——
和原版逐字等价（同种子跑 900 帧逐帧一致, 见下面的回归测试）。

**新增怪型的两种做法**

- 只是数值不同: 在 `ARCHETYPES` 里加一行(速度/视野/有没有冲刺技能)；
- 有全新行为: `registerBehavior('FLY', {...})` + `AI_STATES` 加一条 + 在 `AI_CHAIN` 里选个位置；
  引擎和 `Enemy` 都不用动。

## 音效(audio.js) — 纯合成, 不带文件

```js
SFX_HOOK.play('jump');     // 名字见 audio.js 里 SFX 表的 key
SFX_HOOK.toggle();         // 静音开关(画布右上角喇叭 / 键盘 M)
SFX_HOOK.unlock();         // 浏览器要求: 第一次点击/按键后才出声, 已自动挂好
```

现成的音效: `jump hop land stomp shoot dash hurt hit kill pickup special
loopclear voteYes voteNo councilYes councilNo councilEven death start timeslow door`。

> ⚠️ **音频模块里绝对不能调用 `Math.random`**。
> 游戏逻辑(怪物 AI)也吃同一个 `Math.random`, 音频每抽一个数,
> 整条随机序列就被推歪, 表现为"加了音效之后怪的行为全变了"。
> 噪声用自带的 xorshift 种子生成(见 `noiseRand`)。

## 圆桌投票(council-ui.js)

`councilRound` 结算那一刻调 `COUNCIL_UI.trigger({...})`,
屏幕中央画出圆桌 + 5 个村民头像, 逐个亮出 ✅/❌, 最后出计票和结论。
纯读 `COUNCIL` 数据, 不改票、不消耗随机数; 用 `requestAnimationFrame` 自己画,
不占用游戏主循环。玩家死亡/重开时自动 `cancel()`。
