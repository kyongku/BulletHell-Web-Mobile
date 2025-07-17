/* --------------------------------------------------
 * Bullet Hell MVP
 * --------------------------------------------------
 * Difficulty params from 탁경구 user spec:
 * - Movement: 2D (WASD + Arrow keys)
 * - Player diameter = 10px => radius=5
 * - Bullet radius = 0.8 * player diameter = 8 * 0.5 = 4px (approx)
 * - Easy: HP=3, Laser warn=1.0s, Laser active=1.0s
 * - Hard: HP=1, Laser warn=0.5s, Laser active=1.0s
 * - Score: survival time only
 * - Show score + best score on Game Over; click to return menu
 * - Difficulty select via buttons OR keys E/H
 * - Remove projectiles after leaving screen + 20px buffer
 * - Sound: stub (future)
 * -------------------------------------------------- */

'use strict';

/* =========================
 * Configurable parameters
 * ========================= */
const CONFIG = {
  canvas: { w: 800, h: 600 },
  player: {
    radius: 5,              // px (diameter 10)
    speedEasy: 300,         // px/s
    speedHard: 360,         // px/s (slightly faster to compensate for 1-hit)
  },
  bullet: {
    radius: 4,              // px (80% of player diameter ≈ 8 -> r=4)
    speedStartEasy: 120,    // px/s initial
    speedStartHard: 160,    // px/s initial
    speedMaxEasy: 350,      // px/s cap
    speedMaxHard: 500,      // px/s cap
    accelEasy:  (350-120)/30, // ~ time-slope used in currentBulletSpeed
    accelHard:  (500-160)/30,
    spawnStartEasy: 3,      // bullets per second at t=0
    spawnStartHard: 6,      // per second
    spawnMaxEasy: 10,       // per second at t>=45s
    spawnMaxHard: 20,       // per second at t>=45s
  },
  laser: {
    warnEasy: 1.0,          // s telegraph
    warnHard: 0.5,          // s telegraph
    active: 1.0,            // s active damage both modes
    meanIntervalEasy: 5.0,  // avg seconds between lasers
    meanIntervalHard: 3.0,  // avg seconds
  },
  outBuffer: 20,             // px beyond screen before cull
  storageKey: 'bh_best_score_v0',
};

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
const uiMenu = document.getElementById('menu');
const uiGameOver = document.getElementById('gameover');
const btnEasy = document.getElementById('btn-easy');
const btnHard = document.getElementById('btn-hard');
const btnReturn = document.getElementById('btn-return');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');

/* =========================
 * Input State
 * ========================= */
const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};

window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW': keys.up = true; break;
    case 'ArrowDown':
    case 'KeyS': keys.down = true; break;
    case 'ArrowLeft':
    case 'KeyA': keys.left = true; break;
    case 'ArrowRight':
    case 'KeyD': keys.right = true; break;
    case 'KeyE': if (game.mode === GameMode.MENU) startGame(Difficulty.EASY); break;
    case 'KeyH': if (game.mode === GameMode.MENU) startGame(Difficulty.HARD); break;
    default: break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW': keys.up = false; break;
    case 'ArrowDown':
    case 'KeyS': keys.down = false; break;
    case 'ArrowLeft':
    case 'KeyA': keys.left = false; break;
    case 'ArrowRight':
    case 'KeyD': keys.right = false; break;
    default: break;
  }
});

btnEasy.addEventListener('click', () => startGame(Difficulty.EASY));
btnHard.addEventListener('click', () => startGame(Difficulty.HARD));
btnReturn.addEventListener('click', returnToMenu);

/* =========================
 * Game State Object
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
  bulletInterval: 0, // sec/bullet dynamic
  nextLaserTimer: 0, // sec
};

function loadBest() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return { easy: 0, hard: 0 };
    const obj = JSON.parse(raw);
    return { easy: obj.easy||0, hard: obj.hard||0 };
  } catch(err) {
    return { easy: 0, hard: 0 };
  }
}
function saveBest() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(game.best));
  } catch(err) {
    /* ignore */
  }
}

/* =========================
 * Entities
 * ========================= */
class Player {
  constructor(x,y,r,speed){
    this.x = x; this.y = y; this.r = r; this.speed = speed; // px/s
    this.alive = true;
  }
  update(dt){
    let vx = 0, vy = 0;
    if (keys.left)  vx -= 1;
    if (keys.right) vx += 1;
    if (keys.up)    vy -= 1;
    if (keys.down)  vy += 1;
    if (vx !== 0 || vy !== 0){
      const inv = 1/Math.hypot(vx,vy);
      vx *= inv; vy *= inv;
      this.x += vx * this.speed * dt;
      this.y += vy * this.speed * dt;
    }
    // clamp to screen
    if (this.x < this.r) this.x = this.r;
    if (this.x > CONFIG.canvas.w - this.r) this.x = CONFIG.canvas.w - this.r;
    if (this.y < this.r) this.y = this.r;
    if (this.y > CONFIG.canvas.h - this.r) this.y = CONFIG.canvas.h - this.r;
  }
  draw(){
    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
    ctx.fill();
  }
}

class Bullet {
  constructor(x,y,vx,vy,r){
    this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.r=r;
    this.alive=true;
  }
  update(dt){
    this.x += this.vx*dt; this.y += this.vy*dt;
    const b = CONFIG.outBuffer;
    if (this.x < -b || this.x > CONFIG.canvas.w + b || this.y < -b || this.y > CONFIG.canvas.h + b){
      this.alive=false;
    }
  }
  draw(){
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
    ctx.fill();
  }
}

// Laser states: telegraph -> active -> dead
class Laser {
  constructor(orientation, pos, warnDur, activeDur){
    this.orientation = orientation; // 'h' or 'v'
    this.pos = pos; // y if h, x if v
    this.warnDur = warnDur;
    this.activeDur = activeDur;
    this.t = 0; // elapsed
    this.phase = 'warn';
  }
  update(dt){
    this.t += dt;
    if (this.phase === 'warn' && this.t >= this.warnDur){
      this.phase = 'active';
      this.t = 0;
    } else if (this.phase === 'active' && this.t >= this.activeDur){
      this.phase = 'dead';
    }
  }
  draw(){
    if (this.phase === 'dead') return;
    if (this.orientation==='h'){
      if (this.phase==='warn'){
        ctx.strokeStyle = 'rgba(255,0,0,0.4)';
        ctx.lineWidth = 2;
      } else { // active
        ctx.strokeStyle = 'rgba(255,0,0,0.9)';
        ctx.lineWidth = 6;
      }
      ctx.beginPath();
      ctx.moveTo(0,this.pos);
      ctx.lineTo(CONFIG.canvas.w,this.pos);
      ctx.stroke();
    } else {
      if (this.phase==='warn'){
        ctx.strokeStyle = 'rgba(255,0,0,0.4)';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(255,0,0,0.9)';
        ctx.lineWidth = 6;
      }
      ctx.beginPath();
      ctx.moveTo(this.pos,0);
      ctx.lineTo(this.pos,CONFIG.canvas.h);
      ctx.stroke();
    }
  }
  isDanger(){
    return this.phase==='active';
  }
}

/* =========================
 * Utility
 * ========================= */
function randRange(a,b){ return Math.random()*(b-a)+a; }
function randInt(a,b){ return Math.floor(randRange(a,b)); }
function choose(arr){ return arr[(Math.random()*arr.length)|0]; }

/* =========================
 * Spawning Logic
 * ========================= */
function currentBulletSpeed(){
  const t = game.time;
  if (game.diff===Difficulty.EASY){
    const {speedStartEasy:s0, speedMaxEasy:sM} = CONFIG.bullet;
    const ratio = Math.min(t/30,1); // ramp 0->30s
    return s0 + (sM-s0)*ratio;
  } else {
    const {speedStartHard:s0, speedMaxHard:sM} = CONFIG.bullet;
    const ratio = Math.min(t/30,1);
    return s0 + (sM-s0)*ratio;
  }
}

function currentBulletSpawnRate(){ // bullets/sec
  const t = game.time;
  if (game.diff===Difficulty.EASY){
    const {spawnStartEasy:s0, spawnMaxEasy:sM} = CONFIG.bullet;
    const ratio = Math.min(t/45,1);
    return s0 + (sM-s0)*ratio;
  } else {
    const {spawnStartHard:s0, spawnMaxHard:sM} = CONFIG.bullet;
    const ratio = Math.min(t/45,1);
    return s0 + (sM-s0)*ratio;
  }
}

function scheduleNextBullet(){
  const rate = currentBulletSpawnRate();
  // exponential interval ~1/rate
  game.bulletInterval = 1/rate;
  game.nextBulletTimer = game.bulletInterval;
}

function spawnBullets(dt){
  game.nextBulletTimer -= dt;
  while (game.nextBulletTimer <= 0){
    emitBulletPattern();
    scheduleNextBullet();
  }
}

function emitBulletPattern(){
  // randomly choose one of three patterns: edge shot, aimed shot, ring burst
  const patterns = ['edge','aim','ring'];
  const p = choose(patterns);
  const speed = currentBulletSpeed();
  const r = CONFIG.bullet.radius;
  const Px = game.player.x, Py = game.player.y;

  if (p==='edge'){
    // spawn at a random edge point, aim roughly toward player with small spread
    const side = choose(['top','bottom','left','right']);
    let x,y,vx,vy;
    if (side==='top'){ x=randRange(0,CONFIG.canvas.w); y=-CONFIG.outBuffer; }
    else if(side==='bottom'){ x=randRange(0,CONFIG.canvas.w); y=CONFIG.canvas.h+CONFIG.outBuffer; }
    else if(side==='left'){ x=-CONFIG.outBuffer; y=randRange(0,CONFIG.canvas.h); }
    else { x=CONFIG.canvas.w+CONFIG.outBuffer; y=randRange(0,CONFIG.canvas.h); }
    const dx = Px - x;
    const dy = Py - y;
    let inv = 1/Math.hypot(dx,dy);
    let dirx = dx*inv;
    let diry = dy*inv;
    // spread +/- 10deg
    const ang = Math.atan2(diry,dirx) + randRange(-Math.PI/18, Math.PI/18);
    dirx = Math.cos(ang); diry = Math.sin(ang);
    vx = dirx*speed; vy = diry*speed;
    game.bullets.push(new Bullet(x,y,vx,vy,r));
  }
  else if (p==='aim'){
    // spawn from random screen point outside? simpler: center top aimed
    const x = randRange(0,CONFIG.canvas.w);
    const y = -CONFIG.outBuffer;
    const dx = Px - x; const dy = Py - y;
    const inv = 1/Math.hypot(dx,dy);
    const vx = dx*inv*speed;
    const vy = dy*inv*speed;
    game.bullets.push(new Bullet(x,y,vx,vy,r));
  }
  else if (p==='ring'){
    // spawn N bullets in a ring from screen center
    const cx = CONFIG.canvas.w/2;
    const cy = CONFIG.canvas.h/2;
    const N = 12;
    for (let i=0;i<N;i++){
      const ang = (i/N)*Math.PI*2;
      const vx = Math.cos(ang)*speed;
      const vy = Math.sin(ang)*speed;
      game.bullets.push(new Bullet(cx,cy,vx,vy,r));
    }
  }
}

/* =========================
 * Laser Spawning
 * ========================= */
function scheduleNextLaser(){
  const mean = (game.diff===Difficulty.EASY)? CONFIG.laser.meanIntervalEasy : CONFIG.laser.meanIntervalHard;
  // exponential dist: -ln(U)*mean
  game.nextLaserTimer = -Math.log(Math.random()) * mean;
}

function spawnLasers(dt){
  game.nextLaserTimer -= dt;
  if (game.nextLaserTimer <= 0){
    emitLaser();
    scheduleNextLaser();
  }
}

function emitLaser(){
  // choose orientation h or v
  const orient = Math.random()<0.5 ? 'h':'v';
  const warn = (game.diff===Difficulty.EASY)? CONFIG.laser.warnEasy : CONFIG.laser.warnHard;
  const active = CONFIG.laser.active;
  let pos;
  if (orient==='h') pos = randRange(0,CONFIG.canvas.h);
  else pos = randRange(0,CONFIG.canvas.w);
  game.lasers.push(new Laser(orient,pos,warn,active));
}

/* =========================
 * Collision Detection
 * ========================= */
function checkCollisions(){
  const p = game.player;
  if (!p) return;
  // bullets
  for (const b of game.bullets){
    if (!b.alive) continue;
    const dx = b.x-p.x; const dy = b.y-p.y;
    const rr = (b.r+p.r)*(b.r+p.r);
    if (dx*dx+dy*dy <= rr){
      registerHit();
      b.alive=false;
      break; // one hit per frame is fine
    }
  }
  // lasers
  for (const L of game.lasers){
    if (!L.isDanger()) continue;
    if (L.orientation==='h'){
      // treat active thickness ~6px lineWidth/2 = 3 => enlarge by player radius
      if (Math.abs(p.y - L.pos) <= (3 + p.r)){
        registerHit();
        break;
      }
    } else {
      if (Math.abs(p.x - L.pos) <= (3 + p.r)){
        registerHit();
        break;
      }
    }
  }
}

function registerHit(){
  if (game.diff===Difficulty.EASY){
    game.hp -= 1;
    if (game.hp <= 0) endGame();
  } else {
    endGame();
  }
}

/* =========================
 * Game Flow
 * ========================= */
function startGame(diff){
  game.mode = GameMode.PLAY;
  game.diff = diff;
  game.time = 0;
  game.score = 0;
  game.player = new Player(CONFIG.canvas.w/2, CONFIG.canvas.h/2, CONFIG.player.radius, diff===Difficulty.EASY?CONFIG.player.speedEasy:CONFIG.player.speedHard);
  game.bullets.length = 0;
  game.lasers.length = 0;
  game.hp = (diff===Difficulty.EASY)?3:1;
  scheduleNextBullet();
  scheduleNextLaser();
  hideMenu();
  hideGameOver();
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame(){
  if (game.mode !== GameMode.PLAY) return;
  game.mode = GameMode.GAMEOVER;
  running = false;
  game.score = game.time;
  // update best
  if (game.diff===Difficulty.EASY){
    if (game.score > game.best.easy){ game.best.easy = game.score; saveBest(); }
  } else {
    if (game.score > game.best.hard){ game.best.hard = game.score; saveBest(); }
  }
  showGameOver();
}

function returnToMenu(){
  game.mode = GameMode.MENU;
  running = false;
  showMenu();
  hideGameOver();
}

/* =========================
 * UI Helpers
 * ========================= */
function showMenu(){ uiMenu.classList.remove('hidden'); }
function hideMenu(){ uiMenu.classList.add('hidden'); }
function showGameOver(){
  finalScoreEl.textContent = `Score: ${game.score.toFixed(1)}s`;
  const best = (game.diff===Difficulty.EASY)?game.best.easy:game.best.hard;
  bestScoreEl.textContent = `Best: ${best.toFixed(1)}s`;
  uiGameOver.classList.remove('hidden');
}
function hideGameOver(){ uiGameOver.classList.add('hidden'); }

/* =========================
 * Main Loop
 * ========================= */
let running = false;
let lastTime = 0;
function loop(ts){
  if (!running) return;
  const dt = clampDt((ts - lastTime)/1000);
  lastTime = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function clampDt(dt){
  // avoid huge jumps after tab inactive
  if (dt > 0.1) return 0.1;
  return dt;
}

function update(dt){
  game.time += dt;
  // update player
  game.player.update(dt);
  // spawn
  spawnBullets(dt);
  spawnLasers(dt);
  // update bullets
  for (const b of game.bullets) b.update(dt);
  // update lasers
  for (const L of game.lasers) L.update(dt);
  // gc
  game.bullets = game.bullets.filter(b=>b.alive);
  game.lasers = game.lasers.filter(L=>L.phase!=='dead');
  // collisions
  checkCollisions();
}

function render(){
  // clear
  ctx.clearRect(0,0,CONFIG.canvas.w,CONFIG.canvas.h);
  // bg grid faint (optional comment out for perf)
  drawGrid();
  // draw entities
  for (const L of game.lasers) L.draw();
  for (const b of game.bullets) b.draw();
  game.player.draw();
  drawHUD();
}

function drawGrid(){
  const spacing = 50; // px
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x=0; x<=CONFIG.canvas.w; x+=spacing){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CONFIG.canvas.h); ctx.stroke();
  }
  for (let y=0; y<=CONFIG.canvas.h; y+=spacing){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CONFIG.canvas.w,y); ctx.stroke();
  }
}

function drawHUD(){
  if (game.mode !== GameMode.PLAY) return;
  ctx.fillStyle = '#fff';
  ctx.font = '16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Time: ${game.time.toFixed(1)}s`, 8, 20);
  if (game.diff===Difficulty.EASY){
    ctx.fillText(`HP: ${game.hp}`, 8, 40);
  }
}

/* =========================
 * Init to Menu
 * ========================= */
showMenu();
hideGameOver();

// Resize handling (maintain aspect in CSS only; logical size fixed)
window.addEventListener('resize', ()=>{/* nothing; CSS handles */});
