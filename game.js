// game.js — BulletHell Mobile (완화+시간기반 골드 지급 통합본)
// - 점수: 1초에 50점
// - 보스: 3,000점마다 등장(= 1분 주기), 정확히 20초 상주
// - 보스 난이도 완화 + 패턴 겹침 방지(링/스파이럴 번갈아 발사)
// - 탄환 크기 축소: 일반 3.5 / 보스 2.8
// - 힐팩: "잃은 체력 10% + 7" 회복, 자연 소멸 없음
// - 30초마다 MaxHP +10, 힐팩 주기 스폰
// - 시간 기반 골드: 시작 20초 후 10골드, 이후 n분마다 10골드 (n은 설정값)
// - 보스 클리어 콜백 GameInterop.onBossClear(n)
// - HUD는 index.html에서 관리(HP/점수/골드 텍스트 지원)

const W = 350, H = 350;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CFG = {
  // HP 성장/힐팩
  growthMs: 3,         // 30초마다
  growthAmount: 10,        // MaxHP +10
  healMissingPct: 0.10,    // 잃은 체력의 10%
  healPackFlat: 7,         // +7
  healPackSpawnMs: 9000,   // 힐팩 스폰 간격(ms). 자연 소멸 없음

  // 탄속: 기본/기울기 + 배율
  bulletSpeedBase: 10.0,
  bulletSpeedScale: 1 / 3000,
  normalSpeedMult: 5,      // 일반탄 배율
  bossSpeedMult: 20,        // 보스탄 속도 증가(기존 9 → 20)

  // 데미지(보스 완화)
  normalBulletDmg: 7,
  bossBaseDmg: 7,          // 10 → 7
  bossDmgStep: 1,          // 2 → 1
  bossDmgEveryMs: 4000,    // 3000 → 4000

  // 골드 지급(시간 기반)
  goldFirstMs: 20000,      // 시작 20초 후 첫 지급
  goldIntervalMs: 60000,   // 이후 n분(기본 1분)마다
  goldPerPayout: 10
};

// ───────────────── 입력(모바일 조이스틱 + 키보드) ─────────────────
(function () {
  const pad = document.getElementById('pad');
  const stick = document.getElementById('stick');
  if (!pad || !stick) return; // 안전장치(메뉴 상태 등)
  let active = false, axis = { x: 0, y: 0 };

  function setAxis(x, y) {
    const r = pad.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = x - cx, dy = y - cy, max = r.width * .5;
    let ax = dx / max, ay = dy / max, l = Math.hypot(ax, ay);
    if (l > 1) { ax /= l; ay /= l; }
    axis.x = ax; axis.y = ay;
    stick.style.left = (50 + ax * 30) + '%';
    stick.style.top = (50 + ay * 30) + '%';
  }
  function endAxis() { axis.x = 0; axis.y = 0; stick.style.left = '50%'; stick.style.top = '50%'; }

  pad.addEventListener('touchstart', e => { e.preventDefault(); active = true; const t = e.changedTouches[0]; setAxis(t.clientX, t.clientY); }, { passive: false });
  pad.addEventListener('touchmove', e => { e.preventDefault(); if (!active) return; const t = e.changedTouches[0]; setAxis(t.clientX, t.clientY); }, { passive: false });
  pad.addEventListener('touchend', e => { e.preventDefault(); active = false; endAxis(); }, { passive: false });
  pad.addEventListener('touchcancel', e => { e.preventDefault(); active = false; endAxis(); }, { passive: false });

  window.MobileInput = { getAxis: () => ({ x: axis.x, y: axis.y }) };
})();
const keys = new Set();
addEventListener('keydown', e => keys.add(e.code));
addEventListener('keyup', e => keys.delete(e.code));
function inputAxis() {
  const a = (window.MobileInput && window.MobileInput.getAxis) ? window.MobileInput.getAxis() : { x: 0, y: 0 };
  let dx = a.x, dy = a.y;
  if (dx === 0 && dy === 0) {
    dx = (keys.has('ArrowRight') || keys.has('KeyD')) - (keys.has('ArrowLeft') || keys.has('KeyA'));
    dy = (keys.has('ArrowDown') || keys.has('KeyS')) - (keys.has('ArrowUp') || keys.has('KeyW'));
    const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
  }
  return { x: dx, y: dy };
}

// ───────────────── 상태/HUD 핸들 ─────────────────
const hpFill = document.getElementById('hpFill');
const hpText = document.getElementById('hpText');
const liveScore = document.getElementById('liveScore');
const goldText = document.getElementById('liveGold') || document.getElementById('goldText');

const state = {
  run: false, over: false, time: 0, score: 0, maxHP: 100,
  player: { x: W / 2, y: H * 0.85, r: 7, speed: 170, hp: 100 },
  bullets: [],
  spawnT: 0, spawnMs: 700, diffT: 0, minMs: 230, freezeAfter: 12000, // 12k점까지 스폰 가속
  boss: { active: false, t: 0, next: 3000, count: 0 }, // 3,000점마다 보스 페이즈
  // 보스 패턴 겹침 방지용 토글(링/스파이럴 번갈아)
  bossToggle: 0,
  growthT: 0,
  items: [], itemT: 0,
  // 골드
  gold: 0,
  nextGoldTime: CFG.goldFirstMs,
  goldInterval: CFG.goldIntervalMs
};

function updateHUD() {
  if (hpFill && hpText) {
    const pct = Math.max(0, Math.min(1, state.player.hp / state.maxHP));
    hpFill.style.width = (pct * 100) + '%';
    hpText.textContent = `${Math.floor(state.player.hp)} / ${state.maxHP}`;
  }
  if (liveScore) liveScore.textContent = Math.floor(state.score);
  if (goldText) goldText.textContent = state.gold;
}

// ───────────────── 오브젝트 ─────────────────
class Bullet {
  constructor(x, y, vx, vy, r, clr, dmg, isBoss = false) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.r = r; this.clr = clr; this.dmg = dmg; this.isBoss = isBoss;
  }
  step(dt) { this.x += this.vx * dt; this.y += this.vy * dt; }
  in() { return this.x > -30 && this.x < W + 30 && this.y > -30 && this.y < H + 30; }
  static aimedFromEdge(px, py, score) {
    let x, y;
    if (Math.random() < .5) { x = Math.random() * W; y = Math.random() < .5 ? 0 : H; }
    else { x = Math.random() < .5 ? 0 : W; y = Math.random() * H; }
    const dx = px - x, dy = py - y, len = Math.hypot(dx, dy) || 1;
    const capScore = Math.min(score, 10000); // 1만점에서 탄속 증가 고정
    const baseSp = CFG.bulletSpeedBase + capScore * CFG.bulletSpeedScale;
    const sp = baseSp * CFG.normalSpeedMult;
    return new Bullet(x, y, dx / len * sp, dy / len * sp, 3.5, '#ff4b4b', CFG.normalBulletDmg, false); // 4.5 → 3.5
  }
}

class Heal {
  constructor(x, y) { this.x = x; this.y = y; this.r = 7; this.picked = false; }
  expired() { return false; } // 자연 소멸 없음
}

// ───────────────── 보스 패턴 ─────────────────
function bossDmg() {
  const step = Math.floor(state.boss.t / CFG.bossDmgEveryMs);
  return CFG.bossBaseDmg + step * CFG.bossDmgStep;
}
function bossRing(cx, cy, count, speed, radius, clr) {
  const s = speed * CFG.bossSpeedMult;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = cx + Math.cos(a) * radius, y = cy + Math.sin(a) * radius;
    const vx = Math.cos(a) * s, vy = Math.sin(a) * s;
    state.bullets.push(new Bullet(x, y, vx, vy, 2.8, clr || '#7dd3fc', bossDmg(), true)); // 3.5 → 2.8
  }
}
function bossSpiral(cx, cy, step, count, speed, clr) {
  const s = speed * CFG.bossSpeedMult;
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    const a = (i * step) + start / 700;
    const vx = Math.cos(a) * s, vy = Math.sin(a) * s;
    state.bullets.push(new Bullet(cx, cy, vx, vy, 2.8, clr || '#a78bfa', bossDmg(), true)); // 3.5 → 2.8
  }
}

// ───────────────── 패턴 스킨(선택) ─────────────────
let cachedSkinId = null, painter = makePainter('white');
function makePainter(id) {
  return function drawPlayer() {
    ctx.save();
    ctx.translate(state.player.x, state.player.y);
    ctx.beginPath(); ctx.arc(0, 0, state.player.r, 0, Math.PI * 2);
    switch (id) {
      case 'white': ctx.fillStyle = '#ffffff'; break;
      case 'mint': ctx.fillStyle = '#7ef5d1'; break;
      case 'sky': ctx.fillStyle = '#7ecbff'; break;
      case 'lime': ctx.fillStyle = '#a6ff6b'; break;
      case 'orange': ctx.fillStyle = '#ffb36b'; break;
      case 'violet': ctx.fillStyle = '#ba8bff'; break;
      case 'aqua': ctx.fillStyle = '#6bfffb'; break;
      case 'stripe-mint-sky': ctx.fillStyle = stripePattern(['#7ef5d1', '#7ecbff']); break;
      case 'stripe-orange-violet': ctx.fillStyle = stripePattern(['#ffb36b', '#ba8bff']); break;
      case 'grad-sunrise': {
        const g = ctx.createLinearGradient(-10, -10, 10, 10);
        g.addColorStop(0, '#ff9a9e'); g.addColorStop(0.5, '#fad0c4'); g.addColorStop(1, '#ffd1ff'); ctx.fillStyle = g; break;
      }
      case 'grad-sea': {
        const g = ctx.createLinearGradient(-10, -10, 10, 10);
        g.addColorStop(0, '#36d1dc'); g.addColorStop(1, '#5b86e5'); ctx.fillStyle = g; break;
      }
      case 'stripe-gold-silver': ctx.fillStyle = stripePattern(['#ffd700', '#c0c0c0']); break;
      case 'grad-sunset': {
        const g = ctx.createLinearGradient(-10, 0, 10, 0);
        g.addColorStop(0, '#0b486b'); g.addColorStop(1, '#f56217'); ctx.fillStyle = g; break;
      }
      case 'god-rainbow': {
        const g = ctx.createLinearGradient(-10, 0, 10, 0);
        const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
        colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
        ctx.fillStyle = g; break;
      }
      default: ctx.fillStyle = '#ffffff';
    }
    ctx.fill();
    ctx.restore();
  };
}
function stripePattern(colors) {
  const off = document.createElement('canvas');
  off.width = 16; off.height = 16;
  const c = off.getContext('2d');
  c.fillStyle = colors[0]; c.fillRect(0, 0, 16, 16);
  c.fillStyle = colors[1];
  c.beginPath();
  c.moveTo(0, 8); c.lineTo(8, 0); c.lineTo(16, 8); c.lineTo(8, 16); c.closePath(); c.fill();
  return ctx.createPattern(off, 'repeat');
}

// ───────────────── 유틸 ─────────────────
function grantGold(amount) {
  // 1) 서버/DB 반영(있으면)
  if (window.GameInterop && typeof window.GameInterop.addGold === 'function') {
    try { window.GameInterop.addGold(amount); } catch (_) {}
  }
  // 2) 로컬 표시
  state.gold += amount;
  if (goldText) goldText.textContent = state.gold;
  const t = document.getElementById('saveToast');
  if (t) { t.textContent = `+${amount} Gold`; setTimeout(() => t.textContent = '', 1500); }
}

// ───────────────── 게임 루프/로직 ─────────────────
function reset() {
  state.run = true; state.over = false; state.time = 0; state.score = 0; state.maxHP = 100;
  state.player = { x: W / 2, y: H * 0.85, r: 7, speed: 170, hp: state.maxHP };
  state.bullets.length = 0;
  state.spawnT = 0; state.spawnMs = 700; state.diffT = 0;
  state.boss = { active: false, t: 0, next: 3000, count: 0 };
  state.bossToggle = 0;
  state.growthT = 0; state.items.length = 0; state.itemT = 0;
  // 골드
  state.gold = 0;
  state.nextGoldTime = CFG.goldFirstMs;
  state.goldInterval = CFG.goldIntervalMs;
  updateHUD();
}
function gameOver() {
  state.run = false; state.over = true;
  const fs = document.getElementById('finalScore');
  const over = document.getElementById('over');
  if (fs) fs.textContent = Math.floor(state.score);
  if (over) over.classList.remove('hidden');
}
function heal(n) { state.player.hp = Math.min(state.maxHP, state.player.hp + n); updateHUD(); }

function tryStartBoss() {
  if (state.score >= state.boss.next && !state.boss.active) {
    state.boss.active = true; state.boss.t = 0; state.boss.next += 3000; state.boss.count += 1;
    state.bossToggle = 0; // 새 페이즈마다 패턴 교대 초기화
  }
}
function endBossPhase() {
  state.boss.active = false;
  if (window.GameInterop && typeof window.GameInterop.onBossClear === 'function') {
    window.GameInterop.onBossClear(state.boss.count);
  }
}

function updateBoss(dt) {
  // 보스 시간(ms)
  const prev = state.boss.t;
  state.boss.t += dt * 1000;
  const t = state.boss.t;

  // 총 20초 상주
  // 페이즈1: 0~10s, 페이즈2: 10~20s
  // 겹침 방지: 400~800ms 주기로 링/스파이럴 번갈아 발사
  const phase2 = (t >= 10000);

  // 트리거 간격
  const cycle = phase2 ? 500 : 700;      // 발사 주기(느긋하게)
  if (Math.floor(t / cycle) !== Math.floor(prev / cycle)) {
    // 토글에 따라 번갈아 발사
    if ((state.bossToggle++ % 2) === 0) {
      // 링
      if (!phase2) {
        bossRing(W / 2, H / 2, 16, 2.2, 8, '#38bdf8');
      } else {
        bossRing(W / 2, H / 2, 22, 2.4, 12, '#34d399');
      }
    } else {
      // 스파이럴
      if (!phase2) {
        bossSpiral(W / 2, H / 2, 0.34, 10, 2.0, '#c084fc');
      } else {
        bossSpiral(W / 2, H / 2, 0.46, 12, 2.2, '#f472b6');
      }
    }
  }

  if (t >= 20000) endBossPhase(); // 정확히 20s에 종료
}

function update(dt) {
  if (!state.run) return;

  // 시간 누적(ms)
  state.time += dt * 1000;

  // 이동
  const a = inputAxis();
  state.player.x += a.x * state.player.speed * dt;
  state.player.y += a.y * state.player.speed * dt;
  state.player.x = Math.max(state.player.r, Math.min(W - state.player.r, state.player.x));
  state.player.y = Math.max(state.player.r, Math.min(H - state.player.r, state.player.y));

  // 30초마다 MaxHP +10
  state.growthT += dt * 1000;
  if (state.growthT >= CFG.growthMs) { state.growthT -= CFG.growthMs; state.maxHP += CFG.growthAmount; updateHUD(); }

  // 힐팩 스폰(자연 소멸 없음)
  state.itemT += dt * 1000;
  if (state.itemT >= CFG.healPackSpawnMs) {
    state.itemT -= CFG.healPackSpawnMs;
    state.items.push(new Heal(10 + Math.random() * (W - 20), 10 + Math.random() * (H - 20)));
  }

  // 보스/스폰
  tryStartBoss();
  if (state.boss.active) {
    updateBoss(dt);
  } else {
    state.spawnT += dt * 1000;
    state.diffT += dt * 1000;
    if (state.spawnT >= state.spawnMs) {
      state.spawnT -= state.spawnMs;
      state.bullets.push(Bullet.aimedFromEdge(state.player.x, state.player.y, state.score));
      state.bullets.push(Bullet.aimedFromEdge(state.player.x, state.player.y, state.score));
    }
    if (state.diffT >= 4200) {
      state.diffT -= 4200;
      if (state.score < state.freezeAfter) state.spawnMs = Math.max(state.minMs, state.spawnMs - 55);
    }
  }

  // 탄 이동/충돌
  for (const b of state.bullets) b.step(dt);
  state.bullets = state.bullets.filter(b => b.in());
  for (const b of state.bullets) {
    const dx = b.x - state.player.x, dy = b.y - state.player.y;
    if (Math.hypot(dx, dy) < b.r + state.player.r) {
      state.player.hp -= b.dmg; b.y = 9999;
      if (state.player.hp <= 0) break;
    }
  }

  // 힐팩 획득(먹으면 즉시 제거)
  for (const it of state.items) {
    if (Math.hypot(it.x - state.player.x, it.y - state.player.y) < it.r + state.player.r) {
      const missing = state.maxHP - state.player.hp;
      const healAmt = Math.round(missing * CFG.healMissingPct) + CFG.healPackFlat; // 잃은 체력 기준
      heal(healAmt);
      it.picked = true;
    }
  }
  state.items = state.items.filter(it => !it.picked && !it.expired());

  // 점수/HUD/사망
  state.score += 50 * dt;   // 1초에 50점
  // 시간 기반 골드 지급
  while (state.time >= state.nextGoldTime) {
    grantGold(CFG.goldPerPayout);
    state.nextGoldTime += state.goldInterval;
  }

  updateHUD();
  if (state.player.hp <= 0) gameOver();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  // 경계
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, 4);
  ctx.fillRect(0, 0, 4, H);
  ctx.fillRect(W - 4, 0, 4, H);
  ctx.fillRect(0, H - 4, W, 4);

  // 플레이어(스킨 적용)
  const skinId = (window.GameConfig && window.GameConfig.selectedSkin) ? window.GameConfig.selectedSkin : 'white';
  if (skinId !== cachedSkinId) { painter = makePainter(skinId); cachedSkinId = skinId; }
  painter();

  // 탄/힐팩
  for (const b of state.bullets) {
    ctx.fillStyle = b.clr; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  for (const it of state.items) {
    ctx.fillStyle = '#ff6ec7';
    ctx.beginPath();
    ctx.arc(it.x - 3, it.y - 3, 4, 0, Math.PI * 2);
    ctx.arc(it.x + 3, it.y - 3, 4, 0, Math.PI * 2);
    ctx.moveTo(it.x - 7, it.y - 1);
    ctx.lineTo(it.x, it.y + 8);
    ctx.lineTo(it.x + 7, it.y - 1);
    ctx.closePath();
    ctx.fill();
  }
}

// ───────────────── 루프/버튼 ─────────────────
let last = 0, raf = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
  last = ts; update(dt); draw();
  if (state.run) raf = requestAnimationFrame(loop);
}
function startGame() {
  const over = document.getElementById('over');
  const menu = document.getElementById('mainMenu');
  const wrap = document.getElementById('gameWrap');
  if (over) over.classList.add('hidden');
  if (menu) menu.classList.add('hidden');
  if (wrap) wrap.classList.remove('hidden');
  reset(); last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
window.startGame = startGame;

const btnToMenu = document.getElementById('btnToMenu');
if (btnToMenu) btnToMenu.addEventListener('click', () => {
  document.getElementById('gameWrap')?.classList.add('hidden');
  document.getElementById('mainMenu')?.classList.remove('hidden');
  document.getElementById('over')?.classList.add('hidden');
});

const btnSaveRank = document.getElementById('btnSaveRank');
if (btnSaveRank) btnSaveRank.addEventListener('click', async () => {
  const saver = window.GameInterop && window.GameInterop.saveScore;
  if (!saver) return;
  const res = await saver(state.score);
  const t = document.getElementById('saveToast');
  if (t) {
    t.textContent = res.ok ? '랭킹 저장 완료' : '실패: ' + (res.reason || '알 수 없음');
    setTimeout(() => t.textContent = '', 2500);
  }
});
