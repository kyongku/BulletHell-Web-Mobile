const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const player = { x: 200, y: 350, r: 8, speed: 3.0, hp: 3 };
let score = 0;
let running = false;
let last = 0;
const keys = new Set();
window.addEventListener('keydown', (e)=> keys.add(e.code));
window.addEventListener('keyup',   (e)=> keys.delete(e.code));
let shield = { active:false, t:0, cd:0 };
function update(dt){
  const v = { x: (keys.has('ArrowRight')||keys.has('KeyD')) - (keys.has('ArrowLeft')||keys.has('KeyA')),
              y: (keys.has('ArrowDown') ||keys.has('KeyS')) - (keys.has('ArrowUp')  ||keys.has('KeyW')) };
  const len = Math.hypot(v.x, v.y) || 1;
  player.x += (v.x/len) * player.speed * dt * 60;
  player.y += (v.y/len) * player.speed * dt * 60;
  player.x = Math.max(player.r, Math.min(400 - player.r, player.x));
  player.y = Math.max(player.r, Math.min(400 - player.r, player.y));
  shield.cd = Math.max(0, shield.cd - dt);
  if (keys.has('Space') && shield.cd === 0) {
    shield.active = true;
    shield.t = 1.0;
    shield.cd = 5.0;
  }
  if (shield.active) {
    shield.t -= dt;
    if (shield.t <= 0) shield.active = false;
  }
  score += Math.floor(60 * dt);
}
function draw(){
  ctx.clearRect(0,0,400,400);
  ctx.strokeStyle = '#0e1724';
  ctx.lineWidth = 1;
  for (let i=0;i<=400;i+=50){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,400); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(400,i); ctx.stroke(); }
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();
  if (shield.active){
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r+4, 0, Math.PI*2);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`Name: ${getPlayerNickname()||'-'}`, 10, 20);
  ctx.fillText(`Score: ${score}`, 10, 36);
}
function loop(ts){
  if (!running) return;
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
window.onMobileStart = function(name){
  player.x = 200; player.y = 350; player.hp = 3;
  score = 0; last = 0; running = true;
  requestAnimationFrame(loop);
};
