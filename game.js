// game.js — BulletHell Mobile (sessionStorage 세션 + 리다이렉트 루프 방지)
// - Score: 50/sec
// - Boss: every 3,000 score (≈1 min), stays 20s
// - Bullets: smaller (normal 3.5 / boss 2.8), boss bullets TTL 6s
// - Heal: missing 10% + 7, no natural despawn
// - Growth: +10 MaxHP every 30s
// - Gold: +10G at 20s after start, then every n minutes (CFG.goldIntervalMs)
// - Supabase RPC: wallet_add_gold(delta)

const W = 350, H = 350;
const CFG = {
  // HP & heal
  growthMs: 30000,
  growthAmount: 10,
  healMissingPct: 0.10,
  healPackFlat: 7,
  healPackSpawnMs: 9000,

  // Bullet speed
  bulletSpeedBase: 10.0,
  bulletSpeedScale: 1 / 3000,
  normalSpeedMult: 5,

  // Boss difficulty (easy)
  bossSpeedMult: 20,   // 더 쉽고 싶으면 3.5 ~ 10 사이
  bossBaseDmg: 6,
  bossDmgStep: 1,
  bossDmgEveryMs: 5000,

  // Field spawn easing
  minMs: 300,
  freezeAfter: 12000,

  // Score & gold
  scorePerSec: 50,
  goldFirstMs: 20000,    // first payout at 20s
  goldIntervalMs: 60000, // 1 min
  goldPerPayout: 10,

  // Supabase
  SUPABASE_URL: "https://pecoerlqanocydrdovbb.supabase.co",
  SUPABASE_ANON: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlY29lcmxxYW5vY3lkcmRvdmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNzM4ODYsImV4cCI6MjA3MDc0OTg4Nn0.gbQlIPV89_IecGzfVxsnjuzLe-TStTYQqMKzV-B4CUs"
};

//////////////////// Supabase ////////////////////
let supa = null;
function ensureSupa() {
  if (supa) return supa;
  // index.html에서 window.supabase를 전역 주입해둔 상태여야 함
  if (window.supabase && window.supabase.createClient) {
    supa = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON, {
      auth: {
        persistSession: true,          // 같은 탭에서 페이지 이동해도 세션 유지
        autoRefreshToken: true,
        storage: window.sessionStorage // 자동로그인 방지(세션 한정)
      }
    });
  }
  return supa;
}
const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));

/** 리다이렉트 루프 방지: supabase 로드/세션 동기화 잠깐 기다렸다가 없으면 그때 이동 */
async function requireLoginOrRedirect(opts = {}) {
  const { retries = 8, delayMs = 120 } = opts;

  // supabase 모듈 주입 대기
  if (!ensureSupa()) {
    for (let i=0;i<retries;i++){
      await sleep(delayMs);
      if (ensureSupa()) break;
    }
    if (!ensureSupa()) {
      console.error('Supabase not ready; skip redirect to avoid loop');
      return true; // 바로 튕기면 깜빡임 루프라 일단 진행만 막음
    }
  }

  // 세션 동기화 대기
  for (let i=0;i<retries;i++){
    const { data: { session } } = await supa.auth.getSession();
    if (session) return true;
    await sleep(delayMs);
  }

  // 정말 없으면 로그인으로
  location.href = './login.html';
  return false;
}

async function serverAddGold(n) {
  const ok = await requireLoginOrRedirect(); if (!ok) return { ok:false, reason:'not_logged_in' };
  const { data, error } = await supa.rpc('wallet_add_gold', { delta: n });
  if (error) return { ok:false, reason:error.message };
  return { ok:true, total: data|0 };
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

//////////////////// Boss Patterns ////////////////////
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
function makePainter(id){
  return function(){
    ctx.save(); ctx.translate(state.player.x, state.player.y);
    ctx.beginPath(); ctx.arc(0,0,state.player.r,0,Math.PI*2);
    switch(id){
      case 'white': ctx.fillStyle='#fff'; break;
      case 'mint': ctx.fillStyle='#7ef5d1'; break;
      case 'sky': ctx.fillStyle='#7ecbff'; break;
      case 'lime': ctx.fillStyle='#a6ff6b'; break;
      case 'orange': ctx.fillStyle='#ffb36b'; break;
      case 'violet': ctx.fillStyle='#ba8bff'; break;
      case 'aqua': ctx.fillStyle='#6bfffb'; break;
      default: ctx.fillStyle='#ffffff';
    }
    ctx.fill(); ctx.restore();
  };
}

//////////////////// Gold Utils ////////////////////
async function grantGold(amount){
  const res = await serverAddGold(amount).catch(()=>null);
  if (res && res.ok && typeof res.total === 'number') {
    state.gold = res.total|0;
  }
  updateHUD();
  const t = document.getElementById('saveToast');
  if (t){ t.textContent = `+${amount} Gold`; setTimeout(()=>t.textContent='', 1500); }
}

//////////////////// Game Logic ////////////////////
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
  if (window.GameInterop && typeof window.GameInterop.onBossClear === 'function'){
    try { window.GameInterop.onBossClear(state.boss.count); } catch(_) {}
  }
}
function updateBoss(dt){
  const prev = state.boss.t;
  state.boss.t += dt*1000;
  const t = state.boss.t;
  const phase2 = (t >= 10000);

  // Easy: alternate ring/spiral, slow cadence
  const cycle = phase2 ? 750 : 900;
  if (Math.floor(t/cycle) !== Math.floor(prev/cycle)){
    if ((state.boss.toggle++ % 2) === 0){
      if (!phase2) bossRing(W/2,H/2,12,1.8,10,'#38bdf8');
      else         bossRing(W/2,H/2,16,2.0,14,'#34d399');
    } else {
      if (!phase2) bossSpiral(W/2,H/2,0.32,8,1.7,'#c084fc');
      else         bossSpiral(W/2,H/2,0.44,10,1.9,'#f472b6');
    }
  }
  if (t >= 20000) endBossPhase();
}

function update(dt){
  if (!state.run) return;

  // time
  state.time += dt*1000;

  // move
  const a = inputAxis();
  state.player.x += a.x*state.player.speed*dt;
  state.player.y += a.y*state.player.speed*dt;
  state.player.x = Math.max(state.player.r, Math.min(W - state.player.r, state.player.x));
  state.player.y = Math.max(state.player.r, Math.min(H - state.player.r, state.player.y));

  // growth
  state.growthT += dt*1000;
  if (state.growthT >= CFG.growthMs){ state.growthT -= CFG.growthMs; state.maxHP += CFG.growthAmount; updateHUD(); }

  // heal packs
  state.itemT += dt*1000;
  if (state.itemT >= CFG.healPackSpawnMs){
    state.itemT -= CFG.healPackSpawnMs;
    state.items.push(new Heal(10+Math.random()*(W-20), 10+Math.random()*(H-20)));
  }

  // boss / field
  tryStartBoss();
  if (state.boss.active){
    updateBoss(dt);
  } else {
    state.spawnT += dt*1000;
    state.diffT += dt*1000;
    if (state.spawnT >= state.spawnMs){
      state.spawnT -= state.spawnMs;
      state.bullets.push(Bullet.aimedFromEdge(state.player.x, state.player.y, state.score)); // 한 발만
    }
    if (state.diffT >= 4800){
      state.diffT -= 4800;
      if (state.score < CFG.freezeAfter) state.spawnMs = Math.max(CFG.minMs, state.spawnMs - 40);
    }
  }

  // bullets
  for (const b of state.bullets) b.step(dt);
  state.bullets = state.bullets.filter(b => b.in());
  for (const b of state.bullets){
    const dx=b.x-state.player.x, dy=b.y-state.player.y;
    if (Math.hypot(dx,dy) < b.r + state.player.r){
      state.player.hp -= b.dmg; b.y = 9999;
      if (state.player.hp <= 0) break;
    }
  }

  // heals
  for (const it of state.items){
    if (Math.hypot(it.x-state.player.x, it.y-state.player.y) < it.r + state.player.r){
      const missing = state.maxHP - state.player.hp;
      const healAmt = Math.round(missing*CFG.healMissingPct) + CFG.healPackFlat;
      heal(healAmt); it.picked = true;
    }
  }
  state.items = state.items.filter(it => !it.picked && !it.expired());

  // score & timed gold
  state.score += CFG.scorePerSec * dt;
  while (state.time >= state.nextGoldTime){
    grantGold(CFG.goldPerPayout);      // async, 루프는 다음 tick에서 계속
    state.nextGoldTime += state.goldInterval;
  }

  updateHUD();
  if (state.player.hp <= 0) gameOver();
}

//////////////////// Draw ////////////////////
function draw(){
  ctx.clearRect(0,0,W,H);
  // border
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,W,4); ctx.fillRect(0,0,4,H);
  ctx.fillRect(W-4,0,4,H); ctx.fillRect(0,H-4,W,4);

  // player
  const skinId = (window.GameConfig && window.GameConfig.selectedSkin) ? window.GameConfig.selectedSkin : 'white';
  if (skinId !== cachedSkinId){ painter = makePainter(skinId); cachedSkinId = skinId; }
  painter();

  // bullets & heals
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
}

//////////////////// Loop & Buttons ////////////////////
let last=0, raf=0;
function loop(ts){
  const dt = Math.min(0.05, (ts - (last || ts))/1000);
  last = ts; update(dt); draw();
  if (state.run) raf = requestAnimationFrame(loop);
}
async function loadGoldAtStart(){
  const g = await fetchGold();
  state.gold = g;
  updateHUD();
  const el = document.getElementById('goldText');
  if (el) el.textContent = g;
}
async function startGame(){
  const ok = await requireLoginOrRedirect();
  if (!ok) return;

  const over=document.getElementById('over');
  const menu=document.getElementById('mainMenu');
  const wrap=document.getElementById('gameWrap');
  if (over) over.classList.add('hidden');
  if (menu) menu.classList.add('hidden');
  if (wrap) wrap.classList.remove('hidden');

  reset(); last=0; cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
  loadGoldAtStart();
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
  const ok = await requireLoginOrRedirect(); if (!ok) return;
  const saver = window.GameInterop && window.GameInterop.saveScore;
  if (!saver) return;
  const res = await saver(state.score);
  const t = document.getElementById('saveToast');
  if (t) {
    t.textContent = res.ok ? '랭킹 저장 완료' : '실패: ' + (res.reason || '알 수 없음');
    setTimeout(() => t.textContent = '', 2500);
  }
});
