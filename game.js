// BulletHell — Mobile (350×350) with joystick, Supabase score saving
const W = 350, H = 350;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

(function initJoystick(){
  const pad = document.getElementById('pad');
  const stick = document.getElementById('stick');
  let active = false, axis = {x:0,y:0};
  function setAxis(clientX, clientY){
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const maxR = rect.width * 0.5;
    let ax = dx / maxR, ay = dy / maxR;
    const len = Math.hypot(ax, ay);
    if (len > 1) { ax /= len; ay /= len; }
    axis.x = ax; axis.y = ay;
    stick.style.left = (50 + ax*30) + '%';
    stick.style.top  = (50 + ay*30) + '%';
  }
  function endAxis(){ axis.x=0; axis.y=0; stick.style.left='50%'; stick.style.top='50%'; }
  pad.addEventListener('touchstart', (e)=>{ e.preventDefault(); active = true; const t=e.changedTouches[0]; setAxis(t.clientX,t.clientY); }, {passive:false});
  pad.addEventListener('touchmove',  (e)=>{ e.preventDefault(); if(!active) return; const t=e.changedTouches[0]; setAxis(t.clientX,t.clientY); }, {passive:false});
  pad.addEventListener('touchend',   (e)=>{ e.preventDefault(); active=false; endAxis(); }, {passive:false});
  pad.addEventListener('touchcancel',(e)=>{ e.preventDefault(); active=false; endAxis(); }, {passive:false});
  window.MobileInput = { getAxis: ()=> ({x:axis.x, y:axis.y}) };
})();

const keys = new Set();
window.addEventListener('keydown', e=> keys.add(e.code));
window.addEventListener('keyup',   e=> keys.delete(e.code));
function axisInput(){
  const a = (window.MobileInput && window.MobileInput.getAxis) ? window.MobileInput.getAxis() : {x:0,y:0};
  let dx = a.x, dy = a.y;
  if (dx === 0 && dy === 0) {
    dx = (keys.has('ArrowRight')||keys.has('KeyD')) - (keys.has('ArrowLeft')||keys.has('KeyA'));
    dy = (keys.has('ArrowDown') ||keys.has('KeyS')) - (keys.has('ArrowUp')  ||keys.has('KeyW'));
    const n = Math.hypot(dx,dy)||1; dx/=n; dy/=n;
  }
  return {x:dx, y:dy};
}

const state = {
  running:false, over:false,
  time:0, score:0,
  player: { x: W/2, y: H*0.85, r: 7, speed: 150, color: '#ffffff', hp: 3 },
  bullets: [],
  spawnT: 0, spawnIntervalMs: 900, diffT: 0,
  minSpawnMs: 300, freezeAfter: 12000
};

class Bullet {
  constructor(x,y,vx,vy,r,clr){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.r=r; this.clr=clr; }
  static aimedFromEdge(player, score){
    let x,y;
    if (Math.random()<0.5) { x = Math.random()*W; y = (Math.random()<0.5?0:H); }
    else { x = (Math.random()<0.5?0:W); y = Math.random()*H; }
    const dx = player.x-x, dy=player.y-y;
    const L = Math.hypot(dx,dy)||1;
    const capped = Math.min(score, state.freezeAfter);
    const sp = 3 + (capped/5000);
    const vx=dx/L*sp, vy=dy/L*sp;
    return new Bullet(x,y,vx,vy,4.5,'#ff3b3b');
  }
  step(dt){ this.x += this.vx * dt; this.y += this.vy * dt; }
  inBounds(){ return this.x>=-20&&this.x<=W+20&&this.y>=-20&&this.y<=H+20; }
}

function resetGame(){
  state.running=true; state.over=false; state.time=0; state.score=0;
  state.player = { x: W/2, y: H*0.85, r: 7, speed: 150, color:'#ffffff', hp: 3 };
  state.bullets.length=0;
  state.spawnT=0; state.spawnIntervalMs=900; state.diffT=0;
}

function gameOver(){
  state.running=false; state.over=true;
  document.getElementById('finalScore').textContent = Math.floor(state.score);
  document.getElementById('over').classList.remove('hidden');
}

function update(dt){
  if (!state.running) return;
  const a = axisInput();
  state.player.x += a.x * state.player.speed * dt;
  state.player.y += a.y * state.player.speed * dt;
  state.player.x = Math.max(state.player.r, Math.min(W - state.player.r, state.player.x));
  state.player.y = Math.max(state.player.r, Math.min(H - state.player.r, state.player.y));

  state.spawnT += dt*1000;
  state.diffT  += dt*1000;
  if (state.spawnT >= state.spawnIntervalMs) {
    state.spawnT -= state.spawnIntervalMs;
    state.bullets.push(Bullet.aimedFromEdge(state.player, state.score));
    state.bullets.push(Bullet.aimedFromEdge(state.player, state.score));
  }
  if (state.diffT >= 5000) {
    state.diffT -= 5000;
    const capped = state.score < state.freezeAfter;
    if (capped) state.spawnIntervalMs = Math.max(state.minSpawnMs, state.spawnIntervalMs - 50);
  }

  for (const b of state.bullets) b.step(dt);
  state.bullets = state.bullets.filter(b => b.inBounds());
  for (const b of state.bullets) {
    const dx=b.x-state.player.x, dy=b.y-state.player.y;
    if (Math.hypot(dx,dy) < b.r + state.player.r) {
      state.player.hp -= 1;
      b.y = 9999;
      if (state.player.hp <= 0) break;
    }
  }

  state.score += 60 * dt;
  if (state.player.hp <= 0) gameOver();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,W,4);
  ctx.fillRect(0,0,4,H);
  ctx.fillRect(W-4,0,4,H);
  ctx.fillRect(0,H-4,W,4);
  ctx.fillStyle = state.player.color;
  ctx.beginPath(); ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI*2); ctx.fill();
  for (const b of state.bullets) {
    ctx.fillStyle = b.clr;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
  }
}

let last = 0, rafId = 0;
function loop(ts){
  const dt = Math.min(0.05, (ts - (last||ts))/1000);
  last = ts;
  update(dt);
  draw();
  if (state.running) rafId = requestAnimationFrame(loop);
}

function startGame(){
  document.getElementById('over').classList.add('hidden');
  document.getElementById('mainMenu').classList.add('hidden');
  document.getElementById('gameWrap').classList.remove('hidden');
  resetGame();
  last = 0;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}
window.startGame = startGame;

document.getElementById('btnToMenu').addEventListener('click', ()=>{
  document.getElementById('gameWrap').classList.add('hidden');
  document.getElementById('mainMenu').classList.remove('hidden');
  document.getElementById('over').classList.add('hidden');
});
document.getElementById('btnSaveRank').addEventListener('click', async ()=>{
  const saver = window.GameInterop && window.GameInterop.saveScore;
  if (!saver) return;
  const res = await saver(state.score);
  const toastEl = document.getElementById('saveToast');
  if (res.ok) { toastEl.textContent = '랭킹 저장 완료'; }
  else { toastEl.textContent = '실패: ' + (res.reason||'알 수 없음'); }
  setTimeout(()=> toastEl.textContent = '', 2500);
});
