// game.js — BulletHell Mobile (레이저 + 랭킹 저장 시 이모지 포함)
// - Score: 50/sec
// - Boss: every 3,000 score (≈1 min), stays 20s
// - Heal: missing 10% + 7
// - Growth: +10 MaxHP every 30s (growthAmount=5)
// - Gold: +10G at 1m20s, then every 1 min
// - Supabase RPC: wallet_add_gold(delta)

const W = 350, H = 350;
const CFG = {
  growthMs: 30000,
  growthAmount: 10,
  healMissingPct: 0.10,
  healPackFlat: 10,
  healPackSpawnMs: 10000,

  bulletSpeedBase: 20.0,
  bulletSpeedScale: 1 / 1500,
  normalSpeedMult: 10,

  bossSpeedMult: 30,
  bossBaseDmg: 20,
  bossDmgStep: 2,
  bossDmgEveryMs: 3000,

  minMs: 200,
  freezeAfter: 40000,

  scorePerSec: 50,
  goldFirstMs: 80000,
  goldIntervalMs: 60000,
  goldPerPayout: 10,

  SUPABASE_URL: "https://pecoerlqanocydrdovbb.supabase.co",
  SUPABASE_ANON: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlY29lcmxxYW5vY3lkcmRvdmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNzM4ODYsImV4cCI6MjA3MDc0OTg4Nn0.gbQlIPV89_IecGzfVxsnjuzLe-TStTYQqMKzV-B4CUs"
};

//////////////////// Supabase ////////////////////
let supa = null;
function ensureSupa() {
  if (supa) return supa;
  if (window.supabase && window.supabase.createClient) {
    supa = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, storage: window.sessionStorage }
    });
  }
  return supa;
}
const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));

async function requireLoginOrRedirect(opts = {}) {
  const { retries = 8, delayMs = 120 } = opts;
  if (!ensureSupa()) {
    for (let i=0;i<retries;i++){ await sleep(delayMs); if (ensureSupa()) break; }
    if (!ensureSupa()) { console.error('Supabase not ready'); return true; }
  }
  for (let i=0;i<retries;i++){
    const { data: { session } } = await supa.auth.getSession();
    if (session) return true;
    await sleep(delayMs);
  }
  location.href = './login.html';
  return false;
}
async function serverAddGold(n) {
  const ok = await requireLoginOrRedirect(); if (!ok) return { ok:false, reason:'not_logged_in' };
  const { data, error } = await supa.rpc('wallet_add_gold', { delta: n });
  if (error) return { ok:false, reason:error.message };
  return { ok:true, total: (data|0) };
}
async function serverGetGold(){ return serverAddGold(0); }

//////////////////// Canvas & Input ////////////////////
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

(function () {
  const pad = document.getElementById('pad');
  const stick = document.getElementById('stick');
  if (!pad || !stick) return;
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

//////////////////// HUD ////////////////////
const hpFill = document.getElementById('hpFill');
const hpText = document.getElementById('hpText');
const liveScore = document.getElementById('liveScore');
function getGoldEl() {
  return (
    document.getElementById('liveGold') ||
    document.getElementById('goldText') ||
    document.getElementById('gold') ||
    document.querySelector('[data-role="gold"]') ||
    null
  );
}
let goldText = getGoldEl();
function updateHUD() {
  if (hpFill && hpText) {
    const pct = Math.max(0, Math.min(1, state.player.hp / state.maxHP));
    hpFill.style.width = (pct * 100) + '%';
    hpText.textContent = `${Math.floor(state.player.hp)} / ${state.maxHP}`;
  }
  if (liveScore) liveScore.textContent = Math.floor(state.score);
  goldText = getGoldEl() || goldText;
  if (goldText) goldText.textContent = state.gold;
}

//////////////////// Objects ////////////////////
class Bullet {
  constructor(x, y, vx, vy, r, clr, dmg, isBoss=false, ttlMs=isBoss?6000:null) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.r=r; this.clr=clr; this.dmg=dmg; this.isBoss=isBoss;
    this.ttlMs=ttlMs; this.ageMs=0;
  }
  step(dt){ this.x+=this.vx*dt; this.y+=this.vy*dt; this.ageMs+=dt*1000; }
  in(){
    const inBox = this.x>-30 && this.x<W+30 && this.y>-30 && this.y<H+30;
    const alive = (this.ttlMs==null) || (this.ageMs < this.ttlMs);
    return inBox && alive;
  }
  static aimedFromEdge(px, py, score){
    let x, y;
    if (Math.random() < .5) { x = Math.random()*W; y = Math.random()<.5 ? 0 : H; }
    else { x = Math.random()<.5 ? 0 : W; y = Math.random()*H; }
    const dx = px - x, dy = py - y, len = Math.hypot(dx, dy) || 1;
    const capScore = Math.min(score, 10000);
    const baseSp = CFG.bulletSpeedBase + capScore * CFG.bulletSpeedScale;
    const sp = baseSp * CFG.normalSpeedMult;
    return new Bullet(x, y, dx/len*sp, dy/len*sp, 3.5, '#ff4b4b', 7, false);
  }
}
class Heal {
  constructor(x,y){ this.x=x; this.y=y; this.r=7; this.picked=false; }
  expired(){ return false; }
}

//////////////////// LASER MODULE ////////////////////
const LASER = {
  telegraphMs: 500,
  beamMs: 500,
  widthWarn: 13,
  widthBeam: 11,
  dps: 90,
  flashWarn: false
};

let telegraphs = [];   // {angle, t0, telegraphMs, beamMs}
let lasers = [];       // {angle, t0, durMs}

// 수정: '앞방향(양의 t) 중 최단 교점' 선택으로 θ와 θ+π 겹침 방지
function rayToEdgeFromCenter(angle) {
  const cx = W / 2, cy = H / 2;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const EPS = 1e-6;
  const cand = [];

  if (Math.abs(dx) > EPS) {
    const tL = (0 - cx) / dx, yL = cy + dy * tL;
    const tR = (W - cx) / dx, yR = cy + dy * tR;
    if (yL >= 0 && yL <= H) cand.push({ t: tL, x: 0, y: yL });
    if (yR >= 0 && yR <= H) cand.push({ t: tR, x: W, y: yR });
  }
  if (Math.abs(dy) > EPS) {
    const tT = (0 - cy) / dy, xT = cx + dx * tT;
    const tB = (H - cy) / dy, xB = cx + dx * tB;
    if (xT >= 0 && xT <= W) cand.push({ t: tT, x: xT, y: 0 });
    if (xB >= 0 && xB <= W) cand.push({ t: tB, x: xB, y: H });
  }

  if (cand.length === 0) {
    return { x1: cx, y1: cy, x2: cx + dx * 1e6, y2: cy + dy * 1e6 };
  }

  // 앞방향(양의 t) 중 최단 교점 선택
  const forward = cand.filter(c => c.t >= 0);
  let hit;
  if (forward.length > 0) {
    hit = forward.reduce((a, b) => (a.t < b.t ? a : b));
  } else {
    // 전부 음수면 |t| 최소(가장 가까운 뒤쪽)로 대체
    hit = cand.reduce((a, b) => (Math.abs(a.t) < Math.abs(b.t) ? a : b));
  }
  return { x1: cx, y1: cy, x2: hit.x, y2: hit.y };
}

function pointSegDist(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const L2 = vx*vx + vy*vy;
  if (L2 === 0) return Math.hypot(px - x1, py - y1);
  let t = (wx*vx + wy*vy) / L2;
  t = Math.max(0, Math.min(1, t));
  const projx = x1 + t*vx, projy = y1 + t*vy;
  return Math.hypot(px - projx, py - projy);
}

function spawnLaser(angleRad, opts = {}) {
  const now = performance.now();
  const telegraphMs = opts.telegraphMs ?? LASER.telegraphMs;
  const beamMs = opts.beamMs ?? LASER.beamMs;
  telegraphs.push({ angle: angleRad, t0: now, telegraphMs, beamMs });
}

// 수정: 기본값을 30도 × 12발, 0.7초 간격으로
function spawnRotatingSequence(startDeg = 0, count = 24, stepDeg = 15, intervalMs = 700, opts = {}) {
  for (let i = 0; i < count; i++) {
    const a = (startDeg + i * stepDeg) * Math.PI / 180;
    setTimeout(() => spawnLaser(a, opts), i * intervalMs);
  }
}

// 선택: 동시에 16발 즉시 일제사격
function spawnBurst8(startDeg = 0, stepDeg = , opts = {}) {
  for (let i = 0; i < 16; i++) {
    const a = (startDeg + i * stepDeg) * Math.PI / 180;
    spawnLaser(a, opts);
  }
}

function updateLasers(dtMs, player) {
  const now = performance.now();

  // telegraph -> beam 전환
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const t = telegraphs[i];
    const elapsed = now - t.t0;
    if (elapsed >= t.telegraphMs) {
      lasers.push({ angle: t.angle, t0: now, durMs: t.beamMs });
      telegraphs.splice(i, 1);
    }
  }

  // beam 유지/충돌/소멸
  for (let i = lasers.length - 1; i >= 0; i--) {
    const L = lasers[i];
    const alive = now - L.t0;
    if (alive >= L.durMs) { lasers.splice(i, 1); continue; }

    if (player && !player.invincible) {
      const seg = rayToEdgeFromCenter(L.angle);
      const dist = pointSegDist(player.x, player.y, seg.x1, seg.y1, seg.x2, seg.y2);
      const hit = dist <= (player.r) + (LASER.widthBeam / 2);
      if (hit) {
        const damage = (LASER.dps * dtMs) / 1000;
        player.hp = Math.max(0, player.hp - damage);
      }
    }
  }
}

function drawLasers(ctx) {
  // 경고선
  for (const t of telegraphs) {
    const seg = rayToEdgeFromCenter(t.angle);
    const blink = LASER.flashWarn ? (Math.sin(performance.now() / 80) * 0.5 + 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = 0.5 * blink;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = t.widthWarn ?? LASER.widthWarn;
    ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
    ctx.restore();
  }

  // 실제 레이저
  for (const L of lasers) {
    const seg = rayToEdgeFromCenter(L.angle);
    const life = (performance.now() - L.t0) / L.durMs;
    const alpha = 0.85 * (1 - Math.min(1, Math.max(0, life - 0.7) / 0.3));
    ctx.save();
    ctx.globalAlpha = Math.max(0.35, alpha);
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = LASER.widthBeam;
    ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
    ctx.restore();
  }
}

function clearLasers(){ telegraphs.length = 0; lasers.length = 0; }


//////////////////// Boss ////////////////////
function bossDmg() {
  const step = Math.floor(state.boss.t / CFG.bossDmgEveryMs);
  return CFG.bossBaseDmg + step * CFG.bossDmgStep;
}
function bossRing(cx, cy, count, speed, radius, clr){
  const s = speed * CFG.bossSpeedMult;
  for (let i=0;i<count;i++){
    const a = (i / count) * Math.PI*2;
    const x = cx + Math.cos(a)*radius, y = cy + Math.sin(a)*radius;
    const vx = Math.cos(a)*s, vy = Math.sin(a)*s;
    state.bullets.push(new Bullet(x,y,vx,vy,2.8,clr||'#7dd3fc',bossDmg(),true));
  }
}
function bossSpiral(cx, cy, step, count, speed, clr){
  const s = speed * CFG.bossSpeedMult;
  const start = performance.now();
  for (let i=0;i<count;i++){
    const a = (i*step) + start/700;
    const vx = Math.cos(a)*s, vy = Math.sin(a)*s;
    state.bullets.push(new Bullet(cx,cy,vx,vy,2.8,clr||'#a78bfa',bossDmg(),true));
  }
}

//////////////////// Skin Painter ////////////////////
let cachedSkinId = null, painter = makePainter('white');
function makeStripePattern(ctx, colors, angleDeg = 45, stripe = 8) {
  const off = document.createElement('canvas'); off.width = off.height = stripe * 2;
  const octx = off.getContext('2d');
  octx.save(); octx.translate(off.width/2, off.height/2);
  octx.rotate(angleDeg * Math.PI/180); octx.translate(-off.width/2, -off.height/2);
  octx.fillStyle = colors[0]; octx.fillRect(0, 0, off.width, off.height);
  octx.fillStyle = colors[1]; octx.fillRect(0, 0, off.width, stripe);
  octx.restore(); return ctx.createPattern(off, 'repeat');
}
function makeGradient(ctx, type, stops) {
  let g = (type === 'h') ? ctx.createLinearGradient(-20, 0, 20, 0) : ctx.createLinearGradient(0, -20, 0, 20);
  for (const [pos, color] of stops) g.addColorStop(pos, color); return g;
}
function makePainter(id){
  return function(){
    const r = state.player.r;
    ctx.save(); ctx.translate(state.player.x, state.player.y);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2);
    const solid = { white:'#ffffff', mint:'#7ef5d1', sky:'#7ecbff', lime:'#a6ff6b', orange:'#ffb36b', violet:'#ba8bff', aqua:'#6bfffb' };
    if (solid[id]) { ctx.fillStyle = solid[id]; ctx.fill(); ctx.restore(); return; }
    switch(id){
      case 'stripe-mint-sky':
        ctx.fillStyle = makeStripePattern(ctx, ['#7ef5d1','#7ecbff'], 45, 8); break;
      case 'stripe-orange-violet':
        ctx.fillStyle = makeStripePattern(ctx, ['#ffb36b','#ba8bff'], 45, 8); break;
      case 'stripe-gold-silver':
        ctx.fillStyle = makeStripePattern(ctx, ['#ffd700','#c0c0c0'], 45, 8); break;
      case 'grad-sunrise':
        ctx.fillStyle = makeGradient(ctx, 'h', [[0,'#ff9a9e'],[0.5,'#fad0c4'],[1,'#ffd1ff']]); break;
      case 'grad-sea':
        ctx.fillStyle = makeGradient(ctx, 'h', [[0,'#36d1dc'],[1,'#5b86e5']]); break;
      case 'grad-sunset':
        ctx.fillStyle = makeGradient(ctx, 'h', [[0,'#0b486b'],[1,'#f56217']]); break;
      case 'god-rainbow': {
        const t = performance.now() * 0.12 / 1000;
        const phase = (t * 360) % 360;
        const hues = [0,45,90,135,180,240,300,360].map(h => (h + phase) % 360);
        const stops = hues.map((h,i)=>[i/(hues.length-1), `hsl(${h} 100% 60%)`]);
        ctx.fillStyle = makeGradient(ctx, 'h', stops);
        ctx.shadowColor = 'rgba(255,255,255,0.85)'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 3;
        ctx.strokeStyle = `hsla(${(phase+180)%360} 100% 70% / 0.9)`; ctx.stroke();
        ctx.globalAlpha = 0.18; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0,0,r+2,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 0.10; ctx.beginPath(); ctx.arc(0,0,r+4,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.restore(); return;
      }
      default: ctx.fillStyle = '#ffffff';
    }
    ctx.fill(); ctx.restore();
  };
}

//////////////////// Gold Utils ////////////////////
async function grantGold(amount){
  const res = await serverAddGold(amount).catch(()=>null);
  if (res && res.ok && typeof res.total === 'number') { state.gold = res.total|0; }
  updateHUD();
  const t = document.getElementById('saveToast');
  if (t){ t.textContent = `+${amount} Gold`; setTimeout(()=>t.textContent='', 1500); }
  const g = document.getElementById('goldText'); if (g) g.textContent = state.gold;
}

//////////////////// Game State ////////////////////
const state = {
  run: false, over: false, time: 0, score: 0, maxHP: 100,
  player: { x: W / 2, y: H * 0.85, r: 7, speed: 170, hp: 100 },
  bullets: [],
  spawnT: 0, spawnMs: 700, diffT: 0,
  boss: { active: false, t: 0, next: 3000, count: 0, toggle: 0 },
  growthT: 0,
  items: [], itemT: 0,
  gold: 0,
  nextGoldTime: CFG.goldFirstMs,
  goldInterval: CFG.goldIntervalMs
};

function reset(){
  state.run=true; state.over=false; state.time=0; state.score=0; state.maxHP=100;
  state.player = { x: W/2, y: H*0.85, r: 7, speed: 170, hp: state.maxHP };
  state.bullets.length=0;
  state.spawnT=0; state.spawnMs=700; state.diffT=0;
  state.boss = { active:false, t:0, next:3000, count:0, toggle:0 };
  state.growthT=0; state.items.length=0; state.itemT=0;
  state.nextGoldTime = CFG.goldFirstMs;
  state.goldInterval = CFG.goldIntervalMs;
  clearLasers();
  updateHUD();
}
function gameOver(){
  state.run=false; state.over=true;
  const fs=document.getElementById('finalScore');
  const over=document.getElementById('over');
  if (fs) fs.textContent = Math.floor(state.score);
  if (over) over.classList.remove('hidden');
}
function heal(n){ state.player.hp = Math.min(state.maxHP, state.player.hp + n); updateHUD(); }

function tryStartBoss(){
  if (state.score >= state.boss.next && !state.boss.active){
    state.boss.active=true; state.boss.t=0; state.boss.next+=3000; state.boss.count+=1; state.boss.toggle=0;
  }
}
function endBossPhase(){
  state.boss.active=false;
  clearLasers();
  if (window.GameInterop && typeof window.GameInterop.onBossClear === 'function'){
    try { window.GameInterop.onBossClear(state.boss.count); } catch(_) {}
  }
}
function updateBoss(dt){
  const prev = state.boss.t;
  state.boss.t += dt*1000;
  const t = state.boss.t;
  const phase2 = (t >= 10000);

  const cycle = phase2 ? 750 : 900;
  if (Math.floor(t/cycle) !== Math.floor(prev/cycle)){
    if ((state.boss.toggle++ % 2) === 0){
      if (!phase2) bossRing(W/2,H/2,12,1.8,10,'#38bdf8');
      else         bossRing(W/2,H/2,16,2.0,14,'#34d399');
    } else {
      if (!phase2) bossSpiral(W/2,H/2,0.32,8,1.7,'#c084fc');
      else         bossSpiral(W/2,H/2,0.44,10,1.9,'#f472b6');
    }
    const startDeg = (state.boss.toggle*23 + (phase2?15:0)) % 360;
    spawnRotatingSequence(startDeg, 8, 45, phase2 ? 320 : 400, {
      telegraphMs: LASER.telegraphMs, beamMs: LASER.beamMs
    });
  }
  if (t >= 20000) endBossPhase();
}

function update(dt){
  if (!state.run) return;

  state.time += dt*1000;

  const a = inputAxis();
  state.player.x += a.x*state.player.speed*dt;
  state.player.y += a.y*state.player.speed*dt;
  state.player.x = Math.max(state.player.r, Math.min(W - state.player.r, state.player.x));
  state.player.y = Math.max(state.player.r, Math.min(H - state.player.r, state.player.y));

  state.growthT += dt*1000;
  if (state.growthT >= CFG.growthMs){ state.growthT -= CFG.growthMs; state.maxHP += CFG.growthAmount; updateHUD(); }

  state.itemT += dt*1000;
  if (state.itemT >= CFG.healPackSpawnMs){
    state.itemT -= CFG.healPackSpawnMs;
    state.items.push(new Heal(10+Math.random()*(W-20), 10+Math.random()*(H-20)));
  }

  tryStartBoss();
  if (state.boss.active){
    updateBoss(dt);
  } else {
    state.spawnT += dt*1000;
    state.diffT += dt*1000;
    if (state.spawnT >= state.spawnMs){
      state.spawnT -= state.spawnMs;
      state.bullets.push(Bullet.aimedFromEdge(state.player.x, state.player.y, state.score));
    }
    if (state.diffT >= 4800){
      state.diffT -= 4800;
      if (state.score < CFG.freezeAfter) state.spawnMs = Math.max(CFG.minMs, state.spawnMs - 40);
    }
  }

  for (const b of state.bullets) b.step(dt);
  state.bullets = state.bullets.filter(b => b.in());
  for (const b of state.bullets){
    const dx=b.x-state.player.x, dy=b.y-state.player.y;
    if (Math.hypot(dx,dy) < b.r + state.player.r){
      state.player.hp -= b.dmg; b.y = 9999;
      if (state.player.hp <= 0) break;
    }
  }

  for (const it of state.items){
    if (Math.hypot(it.x-state.player.x, it.y-state.player.y) < it.r + state.player.r){
      const missing = state.maxHP - state.player.hp;
      const healAmt = Math.round(missing*CFG.healMissingPct) + CFG.healPackFlat;
      heal(healAmt); it.picked = true;
    }
  }
  state.items = state.items.filter(it => !it.picked && !it.expired());

  state.score += CFG.scorePerSec * dt;
  while (state.time >= state.nextGoldTime){
    grantGold(CFG.goldPerPayout);
    state.nextGoldTime += state.goldInterval;
  }

  updateLasers(dt*1000, state.player);

  updateHUD();
  if (state.player.hp <= 0) gameOver();
}

//////////////////// Draw ////////////////////
function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,W,4); ctx.fillRect(0,0,4,H);
  ctx.fillRect(W-4,0,4,H); ctx.fillRect(0,H-4,W,4);

  const skinId = (window.GameConfig && window.GameConfig.selectedSkin) ? window.GameConfig.selectedSkin : 'white';
  if (skinId !== cachedSkinId){ painter = makePainter(skinId); cachedSkinId = skinId; }
  painter();

  for (const b of state.bullets){ ctx.fillStyle=b.clr; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); }
  for (const it of state.items){
    ctx.fillStyle='#ff6ec7';
    ctx.beginPath();
    ctx.arc(it.x-3,it.y-3,4,0,Math.PI*2);
    ctx.arc(it.x+3,it.y-3,4,0,Math.PI*2);
    ctx.moveTo(it.x-7,it.y-1);
    ctx.lineTo(it.x, it.y+8);
    ctx.lineTo(it.x+7,it.y-1);
    ctx.closePath(); ctx.fill();
  }

  drawLasers(ctx);
}

//////////////////// Interop (저장 함수 내장) ////////////////////
window.GameInterop = window.GameInterop || {};
// 선택: 보스 클리어 훅
window.GameInterop.onBossClear = window.GameInterop.onBossClear || function(_count){};

// 점수 저장: rankings(메인) + scores(레거시)에도 남김
// 교체본
window.GameInterop.saveScore = window.GameInterop.saveScore || async function(score, emojiFromHeader){
  try {
    ensureSupa();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return { ok:false, reason:'not_logged_in' };

    // 프로필(닉/태그/이모지)
    const { data: prof, error: pErr } = await supa
      .from('profiles')
      .select('nickname, tag, selected_emoji')
      .eq('user_id', user.id)
      .maybeSingle();
    if (pErr || !prof) return { ok:false, reason:'no_profile' };

    const row = {
      user_id: user.id,
      nickname: prof.nickname,
      tag: prof.tag,
      emoji: (emojiFromHeader ?? prof.selected_emoji ?? '⭐'),
      score: Math.floor(score|0)
    };

    // 1) 메인 랭킹 저장
    const { error: rErr } = await supa.from('rankings').insert(row);
    if (rErr) return { ok:false, reason: rErr.message };

    // 2) (선택) 레거시 scores에도 남김 — 실패해도 무시
    try {
      await supa.from('scores').insert({ user_id: user.id, score: row.score });
    } catch (e) {
      console.warn('scores insert 실패(무시):', e?.message);
    }

    return { ok:true };
  } catch (e) {
    return { ok:false, reason: e?.message || 'unknown' };
  }
};


//////////////////// Loop & Buttons ////////////////////
let last=0, raf=0;
function loop(ts){
  const dt = Math.min(0.05, (ts - (last || ts))/1000);
  last = ts; update(dt); draw();
  if (state.run) raf = requestAnimationFrame(loop);
}
async function loadGoldAtStart(){
  const res = await serverGetGold().catch(()=>null);
  if (res && res.ok) { state.gold = res.total|0; }
  updateHUD();
  const el = document.getElementById('goldText');
  if (el) el.textContent = state.gold;
}
async function startGame(){
  const ok = await requireLoginOrRedirect();
  if (!ok) return;

  document.getElementById('over')?.classList.add('hidden');
  document.getElementById('mainMenu')?.classList.add('hidden');
  document.getElementById('gameWrap')?.classList.remove('hidden');

  reset(); last=0; cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
  loadGoldAtStart();
}
window.startGame = startGame;

// 메인으로 복귀 버튼(두 군데에서 받아줌)
function backToMain(){
  document.getElementById('gameWrap')?.classList.add('hidden');
  document.getElementById('mainMenu')?.classList.remove('hidden');
  document.getElementById('over')?.classList.add('hidden');
  document.getElementById('topBar')?.classList.remove('hidden'); // ★ 메인 헤더 복귀
  state.run = false;
  cancelAnimationFrame(raf);
}
document.getElementById('btnToMenu')?.addEventListener('click', backToMain);
document.getElementById('btnToMenu2')?.addEventListener('click', backToMain);

// 랭킹 저장(이모지 포함)
document.getElementById('btnSaveRank')?.addEventListener('click', async () => {
  const ok = await requireLoginOrRedirect(); if (!ok) return;
  const saver = window.GameInterop && window.GameInterop.saveScore;
  if (!saver) return;

  // 헤더의 현재 이모지를 읽거나, 없으면 null
  const emojiEl = document.getElementById('profileEmoji');
  const emoji = emojiEl ? emojiEl.textContent : null;

  let res;
  try {
    if (saver.length >= 2) res = await saver(state.score, emoji);
    else res = await saver(state.score);
  } catch (e) {
    res = { ok:false, reason: e?.message || 'exception' };
  }

  const t = document.getElementById('saveToast');
  if (t) {
    t.textContent = res?.ok ? `랭킹 저장 완료 ${emoji || ''}` : '실패: ' + (res?.reason || '알 수 없음');
    setTimeout(() => t.textContent = '', 2500);
  }
});
