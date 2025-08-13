// PredictShot — Web 400x400 (Menu + Rankings, No Skill)
const W = 400, H = 400;
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

// ------- Game State -------
const state = {
  mode: 'normal',
  name: 'Anonymous',
  running: false,
  over: false,
  time: 0,
  score: 0,
  player: { x: W/2, y: H*0.85, r: 7, speed: 150, hp: 3 },
  bullets: [],
  spawnT: 0, spawnInterval: 0.9
};

// ------- Supabase (fill your creds) -------
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
let supabaseClient = null;
if (typeof window.supabase !== 'undefined' && SUPABASE_URL.startsWith('http')) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function submitScore(score, mode){
  if (!supabaseClient) return;
  const platform = window.PLATFORM || 'web';
  const name = state.name || 'Anonymous';
  const { error } = await supabaseClient
    .from('scores')
    .insert([{ name, score, mode, platform }]);
  if (error) console.error('[supabase] insert error:', error);
}

async function fetchTop(mode, platform, limit=20){
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('scores')
    .select('name, score, mode, platform, created_at')
    .eq('mode', mode)
    .eq('platform', platform)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) { console.error('[supabase] select error:', error); return []; }
  return data || [];
}

window.refreshRanks = async function(){
  const mode = document.getElementById('rkMode').value;
  const platform = document.getElementById('rkPlatform').value;
  const tbody = document.getElementById('rkBody');
  tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
  const rows = await fetchTop(mode, platform, 30);
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
  // difficulty scaling by mode
  const base = (state.mode==='easy') ? 50 : (state.mode==='hard') ? 80 : 65;
  const scale = (state.mode==='easy') ? 5 : (state.mode==='hard') ? 9 : 7;
  const speed = rnd(base, base+30) + Math.min(80, state.time*scale);
  const vx = (dx/n) * speed, vy = (dy/n) * speed;
  state.bullets.push({ x, y, vx, vy, r: 3.2 });
}

function resetRun(){
  state.player.x = W/2; state.player.y = H*0.85; state.player.hp = 3;
  state.bullets.length = 0;
  state.score = 0; state.time = 0; state.over = false;
  state.spawnT = 0;
  // spawn interval by mode
  state.spawnInterval = (state.mode==='easy') ? 1.1 : (state.mode==='hard') ? 0.7 : 0.9;
}

// ------- Update & Draw -------
function update(dt){
  state.time += dt;
  // Movement
  const a = axisInput();
  state.player.x += a.x * state.player.speed * dt;
  state.player.y += a.y * state.player.speed * dt;
  state.player.x = clamp(state.player.x, state.player.r, W - state.player.r);
  state.player.y = clamp(state.player.y, state.player.r, H - state.player.r);

  // Spawn
  state.spawnT -= dt;
  if (state.spawnT <= 0){
    spawnBulletTowardsPlayer();
    const minI = (state.mode==='easy') ? 0.35 : (state.mode==='hard') ? 0.18 : 0.25;
    const targetInterval = clamp(state.spawnInterval - state.time*0.02, minI, 1.2);
    state.spawnInterval = targetInterval;
    state.spawnT = state.spawnInterval;
  }

  // Bullets & collisions
  for (let i=state.bullets.length-1;i>=0;i--){
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20){ state.bullets.splice(i,1); continue; }
    const dx = b.x - state.player.x, dy = b.y - state.player.y;
    const hit = (dx*dx + dy*dy) <= (state.player.r + b.r) * (state.player.r + b.r);
    if (hit){
      state.bullets.splice(i,1);
      state.player.hp -= 1;
      if (state.player.hp <= 0) { state.over = true; break; }
    }
  }

  // Score
  state.score += Math.floor(60 * dt);
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
  for (const b of state.bullets){
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
  }

  // Player
  ctx.beginPath(); ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI*2);
  ctx.fillStyle = '#e2e8f0'; ctx.fill();

  // UI
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Score: ${state.score}`, 10, 18);
  ctx.fillText(`HP: ${state.player.hp}`, 10, 34);
  ctx.fillText(`Mode: ${state.mode}`, 10, 50);
}

let last = 0;
function loop(ts){
  if (!state.running) return;
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last)/1000);
  last = ts;
  if (!state.over) update(dt);
  draw();
  if (state.over){
    state.running = false;
    // show gameover overlay + submit score
    document.getElementById('over').classList.add('show');
    document.getElementById('overInfo').textContent = `Score: ${state.score} | Name: ${state.name}`;
    submitScore(state.score, state.mode);
  } else {
    requestAnimationFrame(loop);
  }
}

// ------- Public hooks from HTML -------
window.startGameFromMenu = function(name, mode){
  state.name = (name && name.trim()) ? name.trim() : 'Anonymous';
  state.mode = mode || 'normal';
  document.getElementById('menu').classList.remove('show');
  restartSameSettings();
};

window.restartSameSettings = function(){
  last = 0;
  resetRun();
  state.running = true;
  requestAnimationFrame(loop);
};
