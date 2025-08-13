// PredictShot — Web (400x400, No Skill)
const W = 400, H = 400;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Input
const keys = new Set();
window.addEventListener('keydown', (e)=> keys.add(e.code));
window.addEventListener('keyup',   (e)=> keys.delete(e.code));

function axisInput() {
  const a = (window.MobileInput && window.MobileInput.getAxis) ? window.MobileInput.getAxis() : {x:0,y:0};
  let dx = a.x, dy = a.y;
  if (dx === 0 && dy === 0) {
    dx = (keys.has('ArrowRight')||keys.has('KeyD')) - (keys.has('ArrowLeft')||keys.has('KeyA'));
    dy = (keys.has('ArrowDown') ||keys.has('KeyS')) - (keys.has('ArrowUp')  ||keys.has('KeyW'));
    const n = Math.hypot(dx,dy)||1; dx/=n; dy/=n;
  }
  return {x:dx, y:dy};
}

// Game state
const player = { x: W/2, y: H*0.85, r: 7, speed: 150, hp: 3 };
let score = 0;
let time = 0;
let gameOver = false;

const bullets = []; // {x,y,vx,vy,r}
const spawns = { t:0, interval:0.9 };

// Helpers
function clamp(v,lo,hi){ return v<lo?lo:v>hi?hi:v; }
function rnd(a,b){ return Math.random()*(b-a)+a; }

function spawnBulletTowardsPlayer(){
  const edge = Math.floor(Math.random()*4);
  let x,y;
  if (edge===0){ x=rnd(0,W); y=-6; }
  else if(edge===1){ x=W+6; y=rnd(0,H); }
  else if(edge===2){ x=rnd(0,W); y=H+6; }
  else { x=-6; y=rnd(0,H); }
  const dx = player.x - x, dy = player.y - y;
  const n = Math.hypot(dx,dy)||1;
  const speed = rnd(60, 90) + Math.min(80, time*6);
  const vx = (dx/n) * speed, vy = (dy/n) * speed;
  bullets.push({ x, y, vx, vy, r: 3.2 });
}

function resetRun(){
  player.x = W/2; player.y = H*0.85; player.hp = 3;
  bullets.length = 0;
  score = 0; time = 0; gameOver = false;
  spawns.t = 0; spawns.interval = 0.9;
}

// Update & Draw
function update(dt){
  time += dt;
  const a = axisInput();
  player.x += a.x * player.speed * dt;
  player.y += a.y * player.speed * dt;
  player.x = clamp(player.x, player.r, W - player.r);
  player.y = clamp(player.y, player.r, H - player.r);

  spawns.t -= dt;
  if (spawns.t <= 0){
    spawnBulletTowardsPlayer();
    const targetInterval = clamp(0.9 - time*0.02, 0.25, 0.9);
    spawns.interval = targetInterval;
    spawns.t = spawns.interval;
  }

  for (let i=bullets.length-1;i>=0;i--){
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20){ bullets.splice(i,1); continue; }
    const dx = b.x - player.x, dy = b.y - player.y;
    const hit = (dx*dx + dy*dy) <= (player.r + b.r) * (player.r + b.r);
    if (hit){
      bullets.splice(i,1);
      player.hp -= 1;
      if (player.hp <= 0) { gameOver = true; break; }
    }
  }

  score += Math.floor(60 * dt);
}

function draw(){
  ctx.clearRect(0,0,W,H);
  // Grid
  ctx.strokeStyle = '#0e1724';
  ctx.lineWidth = 1;
  for (let i=0;i<=W;i+=50){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
  for (let j=0;j<=H;j+=50){ ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(W,j); ctx.stroke(); }

  // Bullets
  ctx.fillStyle = '#94a3b8';
  for (const b of bullets){
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
  }

  // Player
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();

  // UI
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Score: ${score}`, 10, 18);
  ctx.fillText(`HP: ${player.hp}`, 10, 34);
  if (window.PLATFORM) ctx.fillText(`Platform: ${window.PLATFORM}`, 10, 50);

  if (gameOver){
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W/2, H/2 - 8);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Press Enter to restart', W/2, H/2 + 12);
    ctx.textAlign = 'start';
  }
}

// Loop
let last = 0, running = false;
function loop(ts){
  if (!running) return;
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last)/1000);
  last = ts;
  if (!gameOver) update(dt);
  draw();
  requestAnimationFrame(loop);
}

function startRun(){
  resetRun();
  running = true;
  last = 0;
  requestAnimationFrame(loop);
}
window.addEventListener('keydown', (e)=>{
  if (gameOver && e.code === 'Enter'){
    startRun();
  }
});

// Autostart on web
startRun();
