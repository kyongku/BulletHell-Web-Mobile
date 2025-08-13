// Minimal starter game loop compatible with MobileInput + nickname modal
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Player state
const player = { x: 450, y: 780, r: 12, speed: 4.0, hp: 3 };
let score = 0;
let running = false;
let last = 0;

// Keyboard state (joystick dispatches Arrow/WASD)
const keys = new Set();
window.addEventListener('keydown', (e)=> keys.add(e.code));
window.addEventListener('keyup',   (e)=> keys.delete(e.code));

// Skill (Space) sample: short shield
let shield = { active:false, t:0, cd:0 };

function update(dt){
  // Movement from keys (or use analog axes: const v = MobileInput.getAxis())
  const v = { x: (keys.has('ArrowRight')||keys.has('KeyD')) - (keys.has('ArrowLeft')||keys.has('KeyA')),
              y: (keys.has('ArrowDown') ||keys.has('KeyS')) - (keys.has('ArrowUp')  ||keys.has('KeyW')) };
  const len = Math.hypot(v.x, v.y) || 1;
  player.x += (v.x/len) * player.speed * dt;
  player.y += (v.y/len) * player.speed * dt;
  player.x = Math.max(player.r, Math.min(900 - player.r, player.x));
  player.y = Math.max(player.r, Math.min(900 - player.r, player.y));

  // Skill timing
  shield.cd = Math.max(0, shield.cd - dt);
  if (keys.has('Space') && shield.cd === 0) {
    shield.active = true;
    shield.t = 1.0; // 1s duration
    shield.cd = 5.0; // 5s cooldown
  }
  if (shield.active) {
    shield.t -= dt;
    if (shield.t <= 0) shield.active = false;
  }

  // Dummy scoring
  score += Math.floor(60 * dt); // +60 per second
}

function draw(){
  ctx.clearRect(0,0,900,900);
  // Background grid
  ctx.strokeStyle = '#0e1724';
  ctx.lineWidth = 1;
  for (let i=0;i<=900;i+=50){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,900); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(900,i); ctx.stroke(); }

  // Player
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();

  // Shield
  if (shield.active){
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r+6, 0, Math.PI*2);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // UI
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(`Name: ${getPlayerNickname()||'-'}`, 16, 26);
  ctx.fillText(`Score: ${score}`, 16, 50);
  ctx.fillText(`HP: ${player.hp}`, 16, 74);
  ctx.fillText(`Platform: ${window.PLATFORM||'web'}`, 16, 98);
  ctx.fillText(`Skill CD: ${shield.cd.toFixed(1)}s`, 16, 122);
}

// Basic loop
function loop(ts){
  if (!running) return;
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000); // cap dt
  last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// Public hooks
window.onMobileStart = function(name){
  // Reset run
  player.x = 450; player.y = 780; player.hp = 3;
  score = 0; last = 0; running = true;
  requestAnimationFrame(loop);
};

// Simple game over trigger (tap skill button 5 times)
let taps = 0;
window.addEventListener('keydown', (e)=>{
  if (e.code === 'Space') {
    taps++;
    if (taps >= 5) {
      running = false;
      submitScore(score, 'normal').finally(()=>{
        taps = 0;
        // Ask again before next run
        window.askNicknameEveryRun();
      });
    }
  }
});

// ===== Supabase integration (optional) =====
// 1) Uncomment the SDK script tag in index.html
// 2) Fill in your URL and ANON KEY here
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
let supabaseClient = null;
if (typeof window.supabase !== 'undefined') {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function submitScore(score, mode){
  const name = getPlayerNickname() || 'Anonymous';
  const platform = window.PLATFORM || 'web';
  if (!supabaseClient) { console.log('[supabase] SDK not loaded. Skipping submit.', { name, score, mode, platform }); return; }
  const { error } = await supabaseClient.from('scores').insert([{ name, score, mode, platform }]);
  if (error) console.error('[supabase] insert error:', error);
  else console.log('[supabase] score submitted.');
}

async function fetchTop(mode='normal', platform= (window.PLATFORM||'web'), limit=20){
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

// Kick first run: index.html will open the name modal and call onMobileStart()
