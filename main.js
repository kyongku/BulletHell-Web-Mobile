// main.js — BulletHell Mobile (페이지 로직 + 프로필 + 가챠 + 패치노트 + 로그아웃)
// 필요: index.html에서 먼저 window.supabase 전역 주입
//   <script type="module">
//     import * as supabase from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
//     window.supabase = supabase;
//   </script>

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supa = createClient(
  'https://pecoerlqanocydrdovbb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlY29lcmxxYW5vY3lkcmRvdmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNzM4ODYsImV4cCI6MjA3MDc0OTg4Nn0.gbQlIPV89_IecGzfVxsnjuzLe-TStTYQqMKzV-B4CUs',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.sessionStorage   // 자동로그인 방지: 탭 기준 세션
    }
  }
);

// ---------- 유틸 ----------
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const show = (el) => el?.classList.remove('hidden');
const hide = (el) => el?.classList.add('hidden');
const genTag4 = () => String(Math.floor(1000 + Math.random()*9000));

let currentUser = null;
let profile     = null;   // { user_id, nickname, tag, gold, selected_skin, unlocked_skins }
let bestScore   = 0;

// ---------- 스킨/가챠 ----------
const ALL_SKINS = [
  // Normal
  { id:'white',   name:'White',   grade:'N' },
  { id:'mint',    name:'Mint',    grade:'N' },
  { id:'sky',     name:'Sky',     grade:'N' },
  { id:'lime',    name:'Lime',    grade:'N' },
  { id:'orange',  name:'Orange',  grade:'N' },
  { id:'violet',  name:'Violet',  grade:'N' },
  { id:'aqua',    name:'Aqua',    grade:'N' },
  // Rare
  { id:'stripe-mint-sky',        name:'Stripe Mint/Sky',        grade:'R' },
  { id:'stripe-orange-violet',   name:'Stripe Orange/Violet',    grade:'R' },
  // Epic
  { id:'grad-sunrise',           name:'Grad Sunrise',            grade:'E' },
  { id:'grad-sea',               name:'Grad Sea',                grade:'E' },
  // Legendary
  { id:'stripe-gold-silver',     name:'Stripe Gold/Silver',      grade:'L' },
  { id:'grad-sunset',            name:'Grad Sunset',             grade:'L' },
  // GOD
  { id:'god-rainbow',            name:'GOD Rainbow',             grade:'GOD' }
];

const GRADE_POOL = [
  { grade:'GOD', p:0.0005, skins:ALL_SKINS.filter(s=>s.grade==='GOD') },
  { grade:'L',   p:0.0045,  skins:ALL_SKINS.filter(s=>s.grade==='L') },
  { grade:'E',   p:0.045, skins:ALL_SKINS.filter(s=>s.grade==='E') },
  { grade:'R',   p:0.15,  skins:ALL_SKINS.filter(s=>s.grade==='R') },
  { grade:'N',   p:0.80,  skins:ALL_SKINS.filter(s=>s.grade==='N') },
];

function pickGacha() {
  const r = Math.random(); let acc = 0;
  for (const g of GRADE_POOL) {
    acc += g.p;
    if (r <= acc) {
      const arr = g.skins;
      return { grade: g.grade, skin: arr[Math.floor(Math.random()*arr.length)] };
    }
  }
  const last = GRADE_POOL[GRADE_POOL.length-1];
  return { grade:last.grade, skin:last.skins[0] };
}

function gradeBadge(g){
  const map={N:'N', R:'R', E:'E', L:'L', GOD:'G'};
  return `<span class="badge g-${g}">${map[g]||g}</span>`;
}

function previewCSS(id){
  switch(id){
    case 'white': return '#ffffff';
    case 'mint': return '#7ef5d1';
    case 'sky': return '#7ecbff';
    case 'lime': return '#a6ff6b';
    case 'orange': return '#ffb36b';
    case 'violet': return '#ba8bff';
    case 'aqua': return '#6bfffb';
    case 'stripe-mint-sky': return 'repeating-linear-gradient(45deg,#7ef5d1 0 8px,#7ecbff 8px 16px)';
    case 'stripe-orange-violet': return 'repeating-linear-gradient(45deg,#ffb36b 0 8px,#ba8bff 8px 16px)';
    case 'grad-sunrise': return 'linear-gradient(90deg,#ff9a9e,#fad0c4,#ffd1ff)';
    case 'grad-sea': return 'linear-gradient(90deg,#36d1dc,#5b86e5)';
    case 'stripe-gold-silver': return 'repeating-linear-gradient(45deg,#ffd700 0 8px,#c0c0c0 8px 16px)';
    case 'grad-sunset': return 'linear-gradient(90deg,#0b486b,#f56217)';
    case 'god-rainbow': return 'linear-gradient(90deg,red,orange,yellow,green,blue,indigo,violet)';
    default: return '#ffffff';
  }
}

// ---------- 인증/프로필 ----------
async function ensureProfile(user){
  const { data: p } = await supa.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (p) return;
  // 최초 닉네임 설정 모달 표시
  show($('#nickModal'));
  await new Promise(resolve=>{
    $('#btnNickSave').onclick = async ()=>{
      const name = ($('#nickInput').value||'').trim();
      if (!name || name.length < 2) { $('#nickMsg').textContent = '2~12자 닉네임 입력'; return; }
      let tag = genTag4(), tries=0, ok=false;
      while(!ok && tries<8){
        const { data:t } = await supa.from('profiles').select('user_id').eq('nickname', name).eq('tag', tag).maybeSingle();
        if (!t) ok = true; else { tag = genTag4(); tries++; }
      }
      const row = { user_id: user.id, nickname: name, tag, gold: 0, selected_skin: 'white', unlocked_skins: ['white'] };
      const { error } = await supa.from('profiles').insert([row]);
      if (error){ $('#nickMsg').textContent = '실패: '+error.message; return; }
      hide($('#nickModal'));
      resolve();
    };
  });
}

async function loadProfile(user){
  const { data } = await supa.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  profile = data || {};
  const patch = {};
  if (profile.gold == null) patch.gold = 0;
  if (!profile.selected_skin) patch.selected_skin = 'white';
  if (!Array.isArray(profile.unlocked_skins)) patch.unlocked_skins = ['white'];
  if (Object.keys(patch).length){
    await supa.from('profiles').update(patch).eq('user_id', user.id);
    Object.assign(profile, patch);
  }
}

async function fetchBestScore(uid){
  const { data } = await supa.from('scores')
    .select('score').eq('user_id', uid).order('score', {ascending:false}).limit(1);
  bestScore = (data && data[0]) ? data[0].score : 0;
}

function applyHeaderUI(){
  const nameTag = (profile.nickname||'user') + '#' + (profile.tag||'0000');
  $('#profileName').textContent = nameTag;
  $('#profileBest').textContent = String(bestScore||0);
  $('#goldText').textContent = profile.gold ?? 0;
}

function buildSkinGrid(){
  const grid = $('#skinGrid');
  if (!grid) return;
  const have = new Set(profile.unlocked_skins||['white']);
  grid.innerHTML = ALL_SKINS.map(s=>{
    const owned = have.has(s.id);
    const sel = profile.selected_skin === s.id;
    return `
      <button class="chip ${owned?'':'chip-lock'} ${sel?'chip-sel':''}" data-id="${s.id}">
        <span class="chip-color" data-skin="${s.id}"></span>
        <span>${s.name}</span>
        ${gradeBadge(s.grade)}
      </button>`;
  }).join('');

  grid.querySelectorAll('button.chip').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute('data-id');
      if (!have.has(id)) return;
      if (profile.selected_skin === id) return;
      const { error } = await supa.from('profiles').update({ selected_skin:id }).eq('user_id', profile.user_id);
      if (error) return;
      profile.selected_skin = id;
      buildSkinGrid();
    };
  });
  grid.querySelectorAll('.chip-color').forEach(span=>{
    const id = span.getAttribute('data-skin');
    span.style.background = previewCSS(id);
  });
}

function updateProfileModalUI(){
  const el = $('#profInfo');
  if (!el) return;
  el.textContent = `${profile.nickname}#${profile.tag} / Best ${bestScore} / Gold ${profile.gold}`;
}

// ---------- 초기화 ----------
(async () => {
  // 살짝 대기: 모듈/세션 동기화
  await new Promise(r=>setTimeout(r, 60));
  const { data: { user } } = await supa.auth.getUser();
  if (!user) { location.href = './login.html'; return; }
  currentUser = user;

  await ensureProfile(user);
  await loadProfile(user);
  await fetchBestScore(user.id);
  applyHeaderUI();
  buildSkinGrid();
  window.GameConfig = { get selectedSkin(){ return profile?.selected_skin || 'white'; } };

  // UI 표시 (index.html에 authGate가 있으면 제거)
  $('#authGate')?.remove();
  show($('#topBar'));
  show($('#mainMenu'));
})();

// ---------- 버튼/모달 ----------
$('#btnStart')?.addEventListener('click', ()=>{
  hide($('#mainMenu'));
  show($('#gameWrap'));
  window.startGame && window.startGame();
});

$('#profileBtn')?.addEventListener('click', ()=>{
  updateProfileModalUI();
  show($('#profileModal'));
});
$('#btnProfileClose')?.addEventListener('click', ()=>{
  hide($('#profileModal'));
});

// 프로필 모달 하단: 닫기(왼쪽) / 로그아웃(오른쪽)
$('#btnLogout')?.addEventListener('click', async ()=>{
  try { await supa.auth.signOut(); } catch(_) {}
  sessionStorage.clear();
  location.href = './login.html';
});

$('#btnGacha')?.addEventListener('click', ()=>{
  $('#gachaResult').textContent = '';
  show($('#gachaModal'));
});
$('#btnGachaClose')?.addEventListener('click', ()=>{
  hide($('#gachaModal'));
});
$('#btnDoGacha')?.addEventListener('click', async ()=>{
  if ((profile.gold ?? 0) < 100){
    $('#gachaResult').textContent = 'Gold가 부족합니다.';
    return;
  }
  const { grade, skin } = pickGacha();
  const newGold = (profile.gold ?? 0) - 100;
  const set = new Set(profile.unlocked_skins || []);
  set.add(skin.id);
  const updates = { gold:newGold, unlocked_skins:Array.from(set) };
  const { error } = await supa.from('profiles').update(updates).eq('user_id', profile.user_id);
  if (error){ $('#gachaResult').textContent = '오류: '+error.message; return; }
  Object.assign(profile, updates);
  applyHeaderUI();
  buildSkinGrid();
  updateProfileModalUI();
  $('#gachaResult').textContent = `당첨! [${grade}] ${skin.name}`;
});

$('#btnPatch')?.addEventListener('click', async ()=>{
  const list = $('#patchList');
  if (!list) return;
  list.textContent = '불러오는 중...';
  const { data, error } = await supa.from('updates')
    .select('title,content,created_at').order('created_at', {ascending:false}).limit(3);
  if (error){ list.textContent = '불러오기 실패: '+error.message; return; }
  list.innerHTML = data.map(u=>`
    <article class="note">
      <h4>${u.title}</h4>
      <div class="muted">${new Date(u.created_at).toLocaleString()}</div>
      <p>${u.content}</p>
    </article>`).join('');
  show($('#patchModal'));
});
$('#btnPatchClose')?.addEventListener('click', ()=>{
  hide($('#patchModal'));
});

$('#btnRanking')?.addEventListener('click', ()=>{
  location.href = './ranking/';
});

// ---------- 게임 ↔ 페이지 브리지 ----------
window.GameInterop = {
  async saveScore(score){
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return { ok:false, reason:'로그인 필요' };
    const payload = { user_id: user.id, score: Math.floor(score) };
    const { error } = await supa.from('scores').insert([payload]);
    if (error) return { ok:false, reason:error.message };
    await fetchBestScore(user.id);
    applyHeaderUI();
    return { ok:true };
  },
  async onBossClear(n){
    if (n >= 3){
      const add = (n - 2) * 10;
      await addGold(add);
      toast(`Boss ${n} 클리어 +${add}G`);
    }
  },
  getSelectedSkin(){ return profile?.selected_skin || 'white'; }
};

async function addGold(amount){
  const newGold = (profile.gold ?? 0) + amount;
  const { error } = await supa.from('profiles').update({ gold:newGold }).eq('user_id', profile.user_id);
  if (!error){
    profile.gold = newGold;
    $('#goldText').textContent = newGold;
    updateProfileModalUI();
  }
}
function toast(msg){
  const t = $('#saveToast');
  if (!t) return;
  t.textContent = msg;
  setTimeout(()=> t.textContent = '', 2500);
}
