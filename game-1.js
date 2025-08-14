// PredictShot — Mobile Portrait 350 from Web Full (single difficulty, no skill)
const W = 350, H = 350;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ------- Input -------
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

// ------- Game State (from web full, trimmed to single difficulty) -------
const state = {
  name: 'Anonymous',
  running: false,
  over: false,
  time: 0,
  score: 0,
  scoreF: 0,
  player: { x: W/2, y: H*0.85, r: 6, speed: 140, hp: 3 },
  bullets: [],
  spawnT: 0, spawnInterval: 0.9
};

// ------- Supabase (same API as web full, but platform fixed) -------
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
let supabaseClient = null;
if (typeof window.supabase !== 'undefined' && SUPABASE_URL.startsWith('http')) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function submitScore(score){
  if (!supabaseClient) return;
  const platform = window.PLATFORM || 'mobile-portrait-350';
  const name = state.name || 'Anonymous';
  const { error } = await supabaseClient
    .from('scores')
    .insert([{ name, score, mode: 'normal', platform }]);
  if (error) console.error('[supabase] insert error:', error);
}

async function fetchTop(platform, limit=30){
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('scores')
    .select('name, score, platform, created_at')
    .eq('platform', platform)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) { console.error('[supabase] select error:', error); return []; }
  return data || [];
}

window.refreshRanks = async function(){
  const platform = document.getElementById('rkPlatform').value;
  const tbody = document.getElementById('rkBody');
  tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
  const rows = await fetchTop(platform, 30);
  tbody.innerHTML = '';
  rows.forEach((r, i)=>{
    const when = new Date(r.created_at).toLocaleString();
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${r.name}</td><td>${r.score}</td><td class="muted">${when}</td>`;
    tbody.appendChild(tr);
  });
  if (rows.length === 0){
    tbody.innerHTML = '<tr><td colspan="4" class="muted">No data</td></tr>';
  }
};

// ------- Helpers -------
function clamp(v,lo,hi){ return v<lo?lo:v>hi?hi:v; }
function rnd(a,b){ return Math.random()*(b-a)+a; }

function spawnBulletTowardsPlayer(){
  const edge = Math.floor(Math.random()*4);
  let x,y;
  if (edge===0){ x=rnd(0,W); y=-6; }
  else if(edge===1){ x=W+6; y=rnd(0,H); }
  else if(edge===2){ x=rnd(0,W); y=H+6; }
  else { x=-6; y=rnd(0,H); }
  const dx = state.player.x - x, dy = state.player.y - y;
  const n = Math.hypot(dx,dy)||1;
  const base = 62;
  const speed = rnd(base, base+28) + Math.min(70, state.time*6.5);
  const vx = (dx/n) * speed, vy = (dy/n) * speed;
  state.bullets.push({ x, y, vx, vy, r: 3 });
}

function resetRun(){
  state.player.x = W/2; state.player.y = H*0.85; state.player.hp = 3;
  state.bullets.length = 0;
  state.score = 0; state.scoreF = 0; state.time = 0; state.over = false;
  state.spawnT = 0; state.spawnInterval = 0.9;
}

// ------- Update & Draw (same structure as web full; tuned for 350) -------
function update(dt){
  state.time += dt;
  const a = axisInput();
  state.player.x += a.x * state.player.speed * dt;
  state.player.y += a.y * state.player.speed * dt;
  state.player.x = clamp(state.player.x, state.player.r, W - state.player.r);
  state.player.y = clamp(state.player.y, state.player.r, H - state.player.r);

  state.spawnT -= dt;
  if (state.spawnT <= 0){
    spawnBulletTowardsPlayer();
    const minI = 0.25;
    const targetInterval = clamp(state.spawnInterval - state.time*0.02, minI, 1.2);
    state.spawnInterval = targetInterval;
    state.spawnT = state.spawnInterval;
  }

  for (let i=state.bullets.length-1;i>=0;i--){
    const b = state.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20){ state.bullets.splice(i,1); continue; }
    const dx = b.x - state.player.x, dy = b.y - state.player.y;
    if ((dx*dx + dy*dy) <= (state.player.r + b.r) * (state.player.r + b.r)){
      state.bullets.splice(i,1);
      state.player.hp -= 1;
      if (state.player.hp <= 0) { state.over = true; break; }
    }
  }

  // Time-based score (smooth)
  const rate = 55;
  state.scoreF += rate * dt;
  state.score = Math.floor(state.scoreF);
}

function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle = '#0e1724'; ctx.lineWidth = 1;
  for (let i=0;i<=W;i+=50){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
  for (let j=0;j<=H;j+=50){ ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(W,j); ctx.stroke(); }

  ctx.fillStyle = '#94a3b8';
  for (const b of state.bullets){ ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); }

  ctx.beginPath(); ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI*2);
  ctx.fillStyle = '#e2e8f0'; ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`Name: ${state.name}`, 8, 16);
  ctx.fillText(`Score: ${state.score}`, 8, 30);
  ctx.fillText(`HP: ${state.player.hp}`, 8, 44);
}

let last = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', ()=>{ last = 0; });
}
function loop(ts){
  if (!state.running) return;
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last)/1000);
  last = ts;
  if (!state.over) update(dt);
  draw();
  if (state.over){
    state.running = false;
    document.getElementById('over').classList.add('show');
    document.getElementById('overInfo').textContent = `Score: ${state.score} | Name: ${state.name}`;
    submitScore(state.score).finally(()=>{});
  } else {
    requestAnimationFrame(loop);
  }
}

// ------- Start/restart (nickname modal flow) -------
window.startGameFromMenu = function(name){
  state.name = (name && name.trim()) ? name.trim() : 'Anonymous';
  document.getElementById('nameModal').classList.remove('show');
  window.restartSameSettings();
};
window.restartSameSettings = function(){
  last = 0;
  resetRun();
  state.running = true;
  requestAnimationFrame(loop);
};
