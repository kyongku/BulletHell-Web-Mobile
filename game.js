// mobile_game.js — Mobile joystick version (local only: no leaderboard)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const btnStart = document.getElementById('btnStart');
const btnRetry = document.getElementById('btnRetry');
const mainMenu = document.getElementById('mainMenu');
const ui = document.getElementById('ui');
const warningDiv = document.getElementById('warning');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScore = document.getElementById('finalScore');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const hpFill = document.querySelector('#hpBar>div');
const hpText = document.getElementById('hpText');
const bossUi = document.getElementById('bossUi');
const bossHpFill = document.querySelector('#bossHpBar>div');

const joystick = document.getElementById('joystick');
const stick = document.getElementById('stick');

// HiDPI resize
function resizeCanvas(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(window.innerWidth);
  const h = Math.floor(window.innerHeight);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let lastTime = performance.now();
const FRAME_REF = 16.6667;
const SCORE_PER_SEC = 60;

// State
let player, bullets, healthPacks, score, gameOver, spawnIntervalMs, spawnTimerMs, difficultyTimerMs;
let nextBossIdx, bossSchedule, bossActive, bossTimerMs, bossDurationMs, lastHealThreshold, lastMaxHpThreshold, boss;

// Player + joystick
let input = { ax: 0, ay: 0 };
const JOY_RADIUS = 50;
const STICK_RADIUS = 24;

// Entities
class Bullet {
  constructor(x,y,vx,vy,r,color,dmg){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.r=r; this.color=color; this.dmg=dmg; }
  static aimedFromEdge(){
    let x,y;
    if(Math.random()<0.5){ x=Math.random()*canvas.width; y=Math.random()<0.5?0:canvas.height; }
    else { x=Math.random()<0.5?0:canvas.width; y=Math.random()*canvas.height; }
    const dx=player.x-x, dy=player.y-y;
    const L=Math.hypot(dx,dy)||1;
    const sp=3 + score/5000; // 80% scaling kept
    const vx=dx/L*sp, vy=dy/L*sp;
    return new Bullet(x,y,vx,vy,5,'#f00', player.maxHp/15);
  }
  update(dt){ const k=dt/FRAME_REF; this.x+=this.vx*k; this.y+=this.vy*k; }
  draw(){ ctx.fillStyle=this.color; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill(); }
  inBounds(){ return (this.x>=-20&&this.x<=canvas.width+20&&this.y>=-20&&this.y<=canvas.height+20); }
}

class HealthPack {
  constructor(){ this.r=10; this.color='#ff66cc'; this.x=Math.random()*(canvas.width-30)+15; this.y=Math.random()*(canvas.height-30)+15; }
  draw(){
    ctx.fillStyle=this.color;
    ctx.beginPath();
    const topCurve = this.r * 0.3;
    ctx.moveTo(this.x, this.y + this.r * 0.3);
    ctx.bezierCurveTo(this.x - this.r, this.y - topCurve,
                      this.x - this.r*1.5, this.y + this.r*0.8,
                      this.x, this.y + this.r*1.6);
    ctx.bezierCurveTo(this.x + this.r*1.5, this.y + this.r*0.8,
                      this.x + this.r, this.y - topCurve,
                      this.x, this.y + this.r * 0.3);
    ctx.closePath(); ctx.fill();
  }
}

class Boss {
  constructor(){
    this.size=90; this.x=canvas.width/2; this.y=canvas.height/2;
    this.maxHp=400; this.hp=this.maxHp; this.t=0; this.phase='burst';
  }
  draw(){ ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.t*0.002); ctx.fillStyle='#0ff'; const s=this.size; ctx.fillRect(-s/2,-s/2,s,s); ctx.restore(); }
  update(dt){
    this.t+=dt;
    const r=this.hp/this.maxHp;
    if(r>=0.70) this.phase='burst'; else if(r>=0.40) this.phase='spiral'; else this.phase='aimed';
    const bossDmg = player.maxHp/15*2;

    if(this.phase==='burst'){
      if(this.t%800<dt){ const n=16; for(let i=0;i<n;i++){ const a=(2*Math.PI*i)/n; bullets.push(new Bullet(this.x,this.y,Math.cos(a)*2.2,Math.sin(a)*2.2,6,'#ff0',bossDmg)); } }
    } else if(this.phase==='spiral'){
      if(this.t%40<dt){ const a=(performance.now()/30)%(2*Math.PI); bullets.push(new Bullet(this.x,this.y,Math.cos(a)*2.8,Math.sin(a)*2.8,5.5,'#ffa500',bossDmg)); }
    } else {
      if(this.t%500<dt){ for(let k=0;k<3;k++){ setTimeout(()=>{ if(!bossActive) return; const dx=player.x-this.x, dy=player.y-this.y; const L=Math.hypot(dx,dy)||1; const vx=dx/L*3.6, vy=dy/L*3.6; bullets.push(new Bullet(this.x,this.y,vx,vy,6,'#0ff',bossDmg)); }, k*100); } }
    }
    // temporal decay so phases rotate if player cannot damage
    const hpDecay = this.maxHp/15000 * dt;
    this.hp = Math.max(0, this.hp - hpDecay);
  }
}

// Init
function init(){
  const best = parseInt(localStorage.getItem('best')||'0',10); bestEl.textContent = best;
  player={ x: canvas.width/2, y: canvas.height/2, r:10, speed:4, hp:100, maxHp:100, color:'#ff0' };
  bullets=[]; healthPacks=[]; score=0; gameOver=false;
  spawnIntervalMs=1000; spawnTimerMs=0; difficultyTimerMs=0;
  bossSchedule=[3000,6000,9000]; nextBossIdx=0; bossActive=false; bossTimerMs=0; bossDurationMs=15000;
  lastHealThreshold=0; lastMaxHpThreshold=0; boss=null;
  ui.style.display='block'; canvas.style.display='block'; joystick.style.display='block'; warningDiv.style.display='none';
  gameOverScreen.style.display='none';
  updateHpBar(); scoreEl.textContent='0';
  lastTime = performance.now();
}

function updateHpBar(){
  const pct = Math.max(0, player.hp)/player.maxHp;
  hpFill.style.width = `${160*Math.max(0,Math.min(1,pct))}px`;
  hpText.textContent = `${Math.floor(player.hp)}/${Math.floor(player.maxHp)}`;
}
function updateBossBar(){
  if(bossActive && boss){ bossUi.style.display='flex'; bossHpFill.style.width = `${Math.max(0,Math.min(1,boss.hp/boss.maxHp))*100}%`; }
  else { bossUi.style.display='none'; }
}

function maybeSpawnBoss(){
  if(nextBossIdx<bossSchedule.length && score>=bossSchedule[nextBossIdx]){
    warningDiv.style.display='flex';
    setTimeout(()=>{
      warningDiv.style.display='none';
      bossActive=true; bossTimerMs=0; boss=new Boss();
      updateBossBar();
    }, 1000);
    nextBossIdx++;
  }
}

// Joystick handlers
let joyActive=false, joyCx=0, joyCy=0;
function setStick(dx, dy){
  const len = Math.hypot(dx,dy);
  const max = JOY_RADIUS- STICK_RADIUS/2;
  const scale = len>max ? max/len : 1;
  stick.style.transform = `translate(${dx*scale}px, ${dy*scale}px)`;
  // normalized input
  const nx = (dx*scale)/max;
  const ny = (dy*scale)/max;
  input.ax = nx; input.ay = ny;
}
function resetStick(){ stick.style.transform='translate(0,0)'; input.ax=0; input.ay=0; }

joystick.addEventListener('touchstart', (e)=>{
  const t = e.changedTouches[0];
  const rect = joystick.getBoundingClientRect();
  joyCx = rect.width/2; joyCy = rect.height/2;
  joyActive=true;
  const dx = (t.clientX - rect.left) - joyCx;
  const dy = (t.clientY - rect.top) - joyCy;
  setStick(dx, dy);
}, {passive:true});

joystick.addEventListener('touchmove', (e)=>{
  if(!joyActive) return;
  const t = e.changedTouches[0];
  const rect = joystick.getBoundingClientRect();
  const dx = (t.clientX - rect.left) - joyCx;
  const dy = (t.clientY - rect.top) - joyCy;
  setStick(dx, dy);
}, {passive:true});

joystick.addEventListener('touchend', ()=>{ joyActive=false; resetStick(); }, {passive:true});
joystick.addEventListener('touchcancel', ()=>{ joyActive=false; resetStick(); }, {passive:true});

// Keyboard fallback (desktop testing)
const keys={};
window.addEventListener('keydown', e=>keys[e.key]=true);
window.addEventListener('keyup', e=>keys[e.key]=false);

// Game loop helpers
function update(dt){
  if(gameOver) return;
  // Movement: joystick + keyboard fallback
  const mx = input.ax * player.speed * dt/FRAME_REF + ((keys['ArrowRight']||keys['d']) - (keys['ArrowLeft']||keys['a']))*player.speed*dt/FRAME_REF;
  const my = input.ay * player.speed * dt/FRAME_REF + ((keys['ArrowDown']||keys['s']) - (keys['ArrowUp']||keys['w']))*player.speed*dt/FRAME_REF;
  player.x = Math.max(player.r, Math.min(canvas.width-player.r, player.x + mx));
  player.y = Math.max(player.r, Math.min(canvas.height-player.r, player.y + my));

  spawnTimerMs += dt;
  if(spawnTimerMs>=spawnIntervalMs){ spawnTimerMs-=spawnIntervalMs; bullets.push(Bullet.aimedFromEdge(), Bullet.aimedFromEdge()); }
  difficultyTimerMs += dt;
  if(difficultyTimerMs>=5000){ difficultyTimerMs-=5000; spawnIntervalMs=Math.max(300, spawnIntervalMs-50); }

  // Heal pack @ 500 score
  const healThr=(score|0)/500|0;
  if(healThr>lastHealThreshold){ lastHealThreshold=healThr; healthPacks.push(new HealthPack()); }

  // Max HP + at 2000 score
  const hpThr=(score|0)/2000|0;
  if(hpThr>lastMaxHpThreshold){
    lastMaxHpThreshold=hpThr;
    const inc = player.maxHp/15;
    player.maxHp += inc; player.hp += inc; updateHpBar();
  }

  // Boss
  maybeSpawnBoss();
  if(bossActive && boss){
    bossTimerMs += dt; boss.update(dt);
    const dx=player.x-boss.x, dy=player.y-boss.y; const half=boss.size/2;
    if(Math.abs(dx)<=half+player.r && Math.abs(dy)<=half+player.r){ player.hp -= 0.2*dt/FRAME_REF; }
    if(bossTimerMs>=15000 || boss.hp<=0){ bossActive=false; boss=null; updateBossBar(); }
  }

  // Bullets
  bullets.forEach(b=>b.update(dt));
  bullets=bullets.filter(b=>b.inBounds());
  bullets.forEach(b=>{ const dx=b.x-player.x, dy=b.y-player.y; if(Math.hypot(dx,dy)<b.r+player.r){ player.hp -= b.dmg; b.y=1e9; } });

  // Health packs
  healthPacks.forEach((p,i)=>{
    const dx=p.x-player.x, dy=p.y-player.y;
    if(Math.hypot(dx,dy)<p.r+player.r){
      const missing = player.maxHp - player.hp;
      const healAmt = missing*0.10 + (player.maxHp/15);
      player.hp = Math.min(player.maxHp, player.hp + healAmt);
      healthPacks.splice(i,1);
    }
  });

  // Score (fixed time)
  score += (dt/1000)*SCORE_PER_SEC;
  scoreEl.textContent = (score|0);

  // HP UI
  updateHpBar();
  if(player.hp<=0){ player.hp=0; endGame(); }
}

function draw(){
  ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,4); ctx.fillRect(0,0,4,canvas.height); ctx.fillRect(canvas.width-4,0,4,canvas.height); ctx.fillRect(0,canvas.height-4,canvas.width,4);
  ctx.fillStyle=player.color; ctx.beginPath(); ctx.arc(player.x,player.y,player.r/2,0,Math.PI*2); ctx.fill();
  if(bossActive && boss) boss.draw();
  healthPacks.forEach(p=>p.draw());
  bullets.forEach(b=>b.draw());
}

function loop(t){
  const dt = Math.min(50, t - lastTime); lastTime = t;
  update(dt); draw();
  if(!gameOver) requestAnimationFrame(loop);
}

// Game control
function startGame(){
  mainMenu.style.display='none';
  init();
  requestAnimationFrame(loop);
}
function endGame(){
  gameOver=true; gameOverScreen.style.display='flex'; finalScore.textContent = (score|0);
  const best = parseInt(localStorage.getItem('best')||'0',10);
  if(score>best){ localStorage.setItem('best', score|0); bestEl.textContent = (score|0); }
}

btnStart.addEventListener('click', startGame);
document.getElementById('btnRetry').addEventListener('click', ()=>{ gameOverScreen.style.display='none'; mainMenu.style.display='flex'; });

// Initially
mainMenu.style.display='flex';
ui.style.display='none';
canvas.style.display='none';
joystick.style.display='none';
gameOverScreen.style.display='none';
