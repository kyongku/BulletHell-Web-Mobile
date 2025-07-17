/* --------------------------------------------------
 * Bullet Hell MVP (spawn invulnerability 1s added)
 * --------------------------------------------------
 * Difficulty params from 탁경구 user spec:
 * - Movement: 2D (WASD + Arrow keys)
 * - Player diameter = 10px => radius=5
 * - Bullet radius = 0.8 * player diameter ≈ 4px
 * - Easy: HP=3, Laser warn=1.0s, Laser active=1.0s
 * - Hard: HP=1, Laser warn=0.5s, Laser active=1.0s
 * - Spawn invulnerability: 1.0s (both modes; change INVULN_* below)
 * - Score: survival time only
 * - Mode select: buttons or keys E/H
 * - Screen‑out cull buffer: 20px
 * -------------------------------------------------- */

'use strict';

/* =========================
 * Configurable parameters
 * ========================= */
const CONFIG = {
  canvas: { w: 900, h: 900 },
  player: {
    radius: 5,
    speedEasy: 300, // px/s
    speedHard: 360, // px/s
  },
  bullet: {
    radius: 4,
    speedStartEasy: 120,
    speedStartHard: 160,
    speedMaxEasy: 350,
    speedMaxHard: 500,
    spawnStartEasy: 3,   // bullets/sec at t=0
    spawnStartHard: 6,
    spawnMaxEasy: 10,    // bullets/sec at t>=45s
    spawnMaxHard: 20,
  },
  laser: {
    warnEasy: 1.0,
    warnHard: 0.5,
    active: 1.0,
    meanIntervalEasy: 5.0,
    meanIntervalHard: 3.0,
  },
  outBuffer: 20,
  storageKey: 'bh_best_score_v0',
};

// Start‑of‑game invulnerability (seconds)
const INVULN_EASY = 2.0;
const INVULN_HARD  = 2.0;

/* =========================
 * State Enums
 * ========================= */
const GameMode = Object.freeze({ MENU: 0, PLAY: 1, GAMEOVER: 2 });
const Difficulty = Object.freeze({ EASY: 'easy', HARD: 'hard' });

/* =========================
 * DOM
 * ========================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/* --- Sync actual canvas pixel size to CONFIG --- */
canvas.width  = CONFIG.canvas.w;   // 900
canvas.height = CONFIG.canvas.h;   // 900

const uiMenu = document.getElementById('menu');
const uiGameOver = document.getElementById('gameover');
const btnEasy = document.getElementById('btn-easy');
const btnHard = document.getElementById('btn-hard');
const btnReturn = document.getElementById('btn-return');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl  = document.getElementById('best-score');

/* =========================
 * Input State
 * ========================= */
const keys = { up:false, down:false, left:false, right:false };

window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'ArrowUp': case 'KeyW': keys.up=true;    break;
    case 'ArrowDown': case 'KeyS': keys.down=true;  break;
    case 'ArrowLeft': case 'KeyA': keys.left=true;  break;
    case 'ArrowRight': case 'KeyD': keys.right=true; break;
    case 'KeyE': if (game.mode===GameMode.MENU) startGame(Difficulty.EASY); break;
    case 'KeyH': if (game.mode===GameMode.MENU) startGame(Difficulty.HARD); break;
 /* --- Enter: Return to Menu when Game Over --- */
    case 'Enter':
    case 'NumpadEnter':
      if (game.mode === GameMode.GAMEOVER) {
        returnToMenu();
      }
      break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowUp': case 'KeyW': keys.up=false;    break;
    case 'ArrowDown': case 'KeyS': keys.down=false;  break;
    case 'ArrowLeft': case 'KeyA': keys.left=false;  break;
    case 'ArrowRight': case 'KeyD': keys.right=false; break;
  }
});

btnEasy.addEventListener('click', () => startGame(Difficulty.EASY));
btnHard.addEventListener('click', () => startGame(Difficulty.HARD));
btnReturn.addEventListener('click', returnToMenu);

/* =========================
 * Game State
 * ========================= */
const game = {
  mode: GameMode.MENU,
  diff: Difficulty.EASY,
  time: 0,
  player: null,
  bullets: [],
  lasers: [],
  hp: 3,
  score: 0,
  best: loadBest(),
  nextBulletTimer: 0,
  bulletInterval: 0,
  nextLaserTimer: 0,
};

function loadBest() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return { easy:0, hard:0 };
    const obj = JSON.parse(raw);
    return { easy: obj.easy||0, hard: obj.hard||0 };
  } catch { return { easy:0, hard:0 }; }
}
function saveBest() {
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(game.best)); }
  catch {}
}

/* =========================
 * Entities
 * ========================= */
class Player {
  constructor(x,y,r,speed){ this.x=x; this.y=y; this.r=r; this.speed=speed; }
  update(dt){
    let vx=0, vy=0;
    if (keys.left) vx-=1;
    if (keys.right) vx+=1;
    if (keys.up) vy-=1;
    if (keys.down) vy+=1;
    if (vx||vy){
      const inv=1/Math.hypot(vx,vy); vx*=inv; vy*=inv;
      this.x+=vx*this.speed*dt; this.y+=vy*this.speed*dt;
    }
    // clamp
    if (this.x<this.r) this.x=this.r;
    if (this.x>CONFIG.canvas.w-this.r) this.x=CONFIG.canvas.w-this.r;
    if (this.y<this.r) this.y=this.r;
    if (this.y>CONFIG.canvas.h-this.r) this.y=CONFIG.canvas.h-this.r;
  }
  draw(){
    ctx.fillStyle='#0f0';
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
  }
}

class Bullet {
  constructor(x,y,vx,vy,r){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.r=r; this.alive=true; }
  update(dt){
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const b=CONFIG.outBuffer;
    if (this.x<-b||this.x>CONFIG.canvas.w+b||this.y<-b||this.y>CONFIG.canvas.h+b) this.alive=false;
  }
  draw(){
    ctx.fillStyle='#ff0';
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
  }
}

class Laser {
  constructor(orientation,pos,warnDur,activeDur){
    this.orientation=orientation; // 'h' or 'v'
    this.pos=pos; this.warnDur=warnDur; this.activeDur=activeDur;
    this.t=0; this.phase='warn';
  }
  update(dt){
    this.t+=dt;
    if (this.phase==='warn' && this.t>=this.warnDur){ this.phase='active'; this.t=0; }
    else if (this.phase==='active' && this.t>=this.activeDur){ this.phase='dead'; }
  }
  draw(){
    if (this.phase==='dead') return;
    const warn=(this.phase==='warn');
    ctx.strokeStyle=warn?'rgba(255,0,0,0.4)':'rgba(255,0,0,0.9)';
    ctx.lineWidth=warn?2:6;
    ctx.beginPath();
    if (this.orientation==='h'){ ctx.moveTo(0,this.pos); ctx.lineTo(CONFIG.canvas.w,this.pos); }
    else { ctx.moveTo(this.pos,0); ctx.lineTo(this.pos,CONFIG.canvas.h); }
    ctx.stroke();
  }
  isDanger(){ return this.phase==='active'; }
}

/* =========================
 * Utils
 * ========================= */
const randRange=(a,b)=>Math.random()*(b-a)+a;
const choose=arr=>arr[(Math.random()*arr.length)|0];

/* =========================
 * Bullet Spawning
 * ========================= */
function currentBulletSpeed(){
  const t=game.time;
  if (game.diff===Difficulty.EASY){
    const {speedStartEasy:s0,speedMaxEasy:sM}=CONFIG.bullet;
    return s0 + (sM-s0)*Math.min(t/30,1);
  } else {
    const {speedStartHard:s0,speedMaxHard:sM}=CONFIG.bullet;
    return s0 + (sM-s0)*Math.min(t/30,1);
  }
}
function currentBulletSpawnRate(){
  const t=game.time;
  if (game.diff===Difficulty.EASY){
    const {spawnStartEasy:s0,spawnMaxEasy:sM}=CONFIG.bullet;
    return s0 + (sM-s0)*Math.min(t/45,1);
  } else {
    const {spawnStartHard:s0,spawnMaxHard:sM}=CONFIG.bullet;
    return s0 + (sM-s0)*Math.min(t/45,1);
  }
}
function scheduleNextBullet(){
  const rate=currentBulletSpawnRate();
  game.bulletInterval=1/rate;
  game.nextBulletTimer=game.bulletInterval;
}
function spawnBullets(dt){
  game.nextBulletTimer-=dt;
  while (game.nextBulletTimer<=0){
    emitBulletPattern();
    scheduleNextBullet();
  }
}
function emitBulletPattern(){
  const patterns=['edge','aim','ring'];
  const p=choose(patterns);
  const speed=currentBulletSpeed();
  const r=CONFIG.bullet.radius;
  const Px=game.player.x, Py=game.player.y;

  if (p==='edge'){
    const side=choose(['top','bottom','left','right']);
    let x,y;
    if (side==='top'){ x=randRange(0,CONFIG.canvas.w); y=-CONFIG.outBuffer; }
    else if (side==='bottom'){ x=randRange(0,CONFIG.canvas.w); y=CONFIG.canvas.h+CONFIG.outBuffer; }
    else if (side==='left'){ x=-CONFIG.outBuffer; y=randRange(0,CONFIG.canvas.h); }
    else { x=CONFIG.canvas.w+CONFIG.outBuffer; y=randRange(0,CONFIG.canvas.h); }
    const dx=Px-x, dy=Py-y;
    let ang=Math.atan2(dy,dx)+randRange(-Math.PI/18,Math.PI/18); // +/-10deg
    const vx=Math.cos(ang)*speed;
    const vy=Math.sin(ang)*speed;
    game.bullets.push(new Bullet(x,y,vx,vy,r));
  } else if (p==='aim'){
    const x=randRange(0,CONFIG.canvas.w);
    const y=-CONFIG.outBuffer;
    const dx=Px-x, dy=Py-y;
    const inv=1/Math.hypot(dx,dy);
    const vx=dx*inv*speed;
    const vy=dy*inv*speed;
    game.bullets.push(new Bullet(x,y,vx,vy,r));
  } else { // ring
    const cx=CONFIG.canvas.w/2, cy=CONFIG.canvas.h/2;
    const N=12;
    for (let i=0;i<N;i++){
      const ang=(i/N)*Math.PI*2;
      const vx=Math.cos(ang)*speed;
      const vy=Math.sin(ang)*speed;
      game.bullets.push(new Bullet(cx,cy,vx,vy,r));
    }
  }
}

/* =========================
 * Laser Spawning
 * ========================= */
function scheduleNextLaser(){
  const mean=(game.diff===Difficulty.EASY)?CONFIG.laser.meanIntervalEasy:CONFIG.laser.meanIntervalHard;
  game.nextLaserTimer = -Math.log(Math.random())*mean; // exponential
}
function spawnLasers(dt){
  game.nextLaserTimer-=dt;
  if (game.nextLaserTimer<=0){
    emitLaser();
    scheduleNextLaser();
  }
}
function emitLaser(){
  const orient=Math.random()<0.5?'h':'v';
  const warn=(game.diff===Difficulty.EASY)?CONFIG.laser.warnEasy:CONFIG.laser.warnHard;
  const active=CONFIG.laser.active;
  const pos=(orient==='h')?randRange(0,CONFIG.canvas.h):randRange(0,CONFIG.canvas.w);
  game.lasers.push(new Laser(orient,pos,warn,active));
}

/* =========================
 * Collision Detection (with spawn invulnerability)
 * ========================= */
function checkCollisions(){
  const invuln=(game.diff===Difficulty.EASY)?INVULN_EASY:INVULN_HARD;
  if (game.time < invuln) return; // grace period
  const p=game.player; if (!p) return;

  // bullets
  for (const b of game.bullets){
    if (!b.alive) continue;
    const dx=b.x-p.x, dy=b.y-p.y;
    const rr=(b.r+p.r)**2;
    if (dx*dx+dy*dy <= rr){
      registerHit(); b.alive=false; break;
    }
  }
  // lasers
  for (const L of game.lasers){
    if (!L.isDanger()) continue;
    if (L.orientation==='h'){
      if (Math.abs(p.y-L.pos) <= (3+p.r)){ registerHit(); break; }
    } else {
      if (Math.abs(p.x-L.pos) <= (3+p.r)){ registerHit(); break; }
    }
  }
}

function registerHit(){
  if (game.diff===Difficulty.EASY){
    if (--game.hp <= 0) endGame();
  } else {
    endGame();
  }
}

/* =========================
 * Game Flow
 * ========================= */
function startGame(diff){
  game.mode=GameMode.PLAY;
  game.diff=diff;
  game.time=0;
  game.score=0;
  game.player=new Player(CONFIG.canvas.w/2,CONFIG.canvas.h/2,CONFIG.player.radius,
                        diff===Difficulty.EASY?CONFIG.player.speedEasy:CONFIG.player.speedHard);
  game.bullets.length=0;
  game.lasers.length=0;
  game.hp=(diff===Difficulty.EASY)?3:1;
  scheduleNextBullet();
  scheduleNextLaser();
  hideMenu(); hideGameOver();
  running=true;
  lastTime=performance.now();
  requestAnimationFrame(loop);
}

function endGame(){
  if (game.mode!==GameMode.PLAY) return;
  game.mode=GameMode.GAMEOVER;
  running=false;
  game.score=game.time;
  if (game.diff===Difficulty.EASY){
    if (game.score>game.best.easy){ game.best.easy=game.score; saveBest(); }
  } else {
    if (game.score>game.best.hard){ game.best.hard=game.score; saveBest(); }
  }
  showGameOver();
}

function returnToMenu(){
  game.mode=GameMode.MENU;
  running=false;
  showMenu(); hideGameOver();
}

/* =========================
 * UI Helpers
 * ========================= */
function showMenu(){ uiMenu.classList.remove('hidden'); }
function hideMenu(){ uiMenu.classList.add('hidden'); }
function showGameOver(){
  finalScoreEl.textContent = `Score: ${game.score.toFixed(1)}s`;
  const best=(game.diff===Difficulty.EASY)?game.best.easy:game.best.hard;
  bestScoreEl.textContent = `Best: ${best.toFixed(1)}s`;
  uiGameOver.classList.remove('hidden');
}
function hideGameOver(){ uiGameOver.classList.add('hidden'); }

/* =========================
 * Main Loop
 * ========================= */
let running=false;
let lastTime=0;
function loop(ts){
  if (!running) return;
  const dt=clampDt((ts-lastTime)/1000); lastTime=ts;
  update(dt); render();
  requestAnimationFrame(loop);
}
function clampDt(dt){ return dt>0.1?0.1:dt; }

function update(dt){
  game.time+=dt;
  game.player.update(dt);
  spawnBullets(dt);
  spawnLasers(dt);
  for (const b of game.bullets) b.update(dt);
  for (const L of game.lasers) L.update(dt);
  game.bullets=game.bullets.filter(b=>b.alive);
  game.lasers=game.lasers.filter(L=>L.phase!=='dead');
  checkCollisions();
}

function render(){
  ctx.clearRect(0,0,CONFIG.canvas.w,CONFIG.canvas.h);
  drawGrid();
  for (const L of game.lasers) L.draw();
  for (const b of game.bullets) b.draw();
  game.player.draw();
  drawHUD();
}

function drawGrid(){
  const spacing=50;
  ctx.strokeStyle='rgba(255,255,255,0.05)';
  ctx.lineWidth=1;
  for (let x=0;x<=CONFIG.canvas.w;x+=spacing){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CONFIG.canvas.h); ctx.stroke();
  }
  for (let y=0;y<=CONFIG.canvas.h;y+=spacing){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(0+CONFIG.canvas.w,y); ctx.stroke();
  }
}

function drawHUD(){
  if (game.mode!==GameMode.PLAY) return;
  ctx.fillStyle='#fff';
  ctx.font='16px monospace';
  ctx.textAlign='left';
  ctx.fillText(`Time: ${game.time.toFixed(1)}s`,8,20);
  if (game.diff===Difficulty.EASY){ ctx.fillText(`HP: ${game.hp}`,8,40); }
}

/* =========================
 * Init
 * ========================= */
showMenu(); hideGameOver();
window.addEventListener('resize',()=>{/* CSS handles scaling */});
