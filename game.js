// BulletHell Mobile — 패턴 스킨/가챠/보스보상/HP표기 포함 최종
// 규칙: 시작 HP 100, 30초마다 MaxHP +10, 힐팩(핑크 하트) 영구, (MaxHP*10%+7) 회복
// 탄속 증가(점수 비례) 10,000점에서 고정, 스폰속도는 12,000점까지 가속 후 고정
// 보스: 3,000점마다 페이즈. 3번째부터 (보스번호-2)*10 Gold 지급

const W=350, H=350;
const canvas=document.getElementById('gameCanvas'); const ctx=canvas.getContext('2d');

const CFG = {
  growthMs: 30000, growthAmount: 10,
  healPackPercent: 0.10, healPackFlat: 7, healPackSpawnMs: 9000,
  bulletSpeedBase: 5.0, bulletSpeedScale: 1/3000,
  normalBulletDmg: 7, bossBaseDmg: 10, bossDmgStep: 2, bossDmgEveryMs: 3000
};

// 입력
(function(){const pad=document.getElementById('pad');const stick=document.getElementById('stick');let active=false,axis={x:0,y:0};
function setAxis(x,y){const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=x-cx,dy=y-cy,max=r.width*.5;let ax=dx/max,ay=dy/max,l=Math.hypot(ax,ay);if(l>1){ax/=l;ay/=l;}axis.x=ax;axis.y=ay;stick.style.left=(50+ax*30)+'%';stick.style.top=(50+ay*30)+'%';}
function endAxis(){axis.x=0;axis.y=0;stick.style.left='50%';stick.style.top='50%';}
pad.addEventListener('touchstart',e=>{e.preventDefault();active=true;const t=e.changedTouches[0];setAxis(t.clientX,t.clientY)},{passive:false});
pad.addEventListener('touchmove',e=>{e.preventDefault();if(!active)return;const t=e.changedTouches[0];setAxis(t.clientX,t.clientY)},{passive:false});
pad.addEventListener('touchend',e=>{e.preventDefault();active=false;endAxis()},{passive:false});
pad.addEventListener('touchcancel',e=>{e.preventDefault();active=false;endAxis()},{passive:false});
window.MobileInput={getAxis:()=>({x:axis.x,y:axis.y})};})();
const keys=new Set();addEventListener('keydown',e=>keys.add(e.code));addEventListener('keyup',e=>keys.delete(e.code));
function inputAxis(){const a=(window.MobileInput&&window.MobileInput.getAxis)?window.MobileInput.getAxis():{x:0,y:0};let dx=a.x,dy=a.y;if(dx===0&&dy===0){dx=(keys.has('ArrowRight')||keys.has('KeyD'))-(keys.has('ArrowLeft')||keys.has('KeyA'));dy=(keys.has('ArrowDown')||keys.has('KeyS'))-(keys.has('ArrowUp')||keys.has('KeyW'));const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;}return{x:dx,y:dy};}

// 상태
const hpFill=document.getElementById('hpFill'); const hpText=document.getElementById('hpText'); const liveScore=document.getElementById('liveScore');
const state={run:false,over:false,time:0,score:0,maxHP:100,player:{x:W/2,y:H*0.85,r:7,speed:170,hp:100},
  bullets:[],spawnT:0,spawnMs:700,diffT:0,minMs:230,freezeAfter:12000,boss:{active:false,t:0,next:3000,count:0},growthT:0,items:[],itemT:0};

class Bullet{constructor(x,y,vx,vy,r,clr,dmg,isBoss=false){this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.r=r;this.clr=clr;this.dmg=dmg;this.isBoss=isBoss;}
  step(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;} in(){return this.x>-30&&this.x<W+30&&this.y>-30&&this.y<H+30;}
  static aimedFromEdge(px,py,score){let x,y;if(Math.random()<.5){x=Math.random()*W;y=Math.random()<.5?0:H;}else{x=Math.random()<.5?0:W;y=Math.random()*H;}
    const dx=px-x,dy=py-y,len=Math.hypot(dx,dy)||1;const capScore=Math.min(score,10000);
    const sp=CFG.bulletSpeedBase+capScore*CFG.bulletSpeedScale;
    return new Bullet(x,y,dx/len*sp,dy/len*sp,4.5,'#ff4b4b',CFG.normalBulletDmg,false);} }
class Heal{constructor(x,y){this.x=x;this.y=y;this.r=7;} expired(){return false;}}

// 보스 탄
function bossDmg(){const step=Math.floor(state.boss.t/CFG.bossDmgEveryMs);return CFG.bossBaseDmg+step*CFG.bossDmgStep;}
function bossRing(cx,cy,count,speed,radius,clr){for(let i=0;i<count;i++){const a=(i/count)*Math.PI*2;const x=cx+Math.cos(a)*radius,y=cy+Math.sin(a)*radius;const vx=Math.cos(a)*speed,vy=Math.sin(a)*speed;state.bullets.push(new Bullet(x,y,vx,vy,3.5,clr||'#7dd3fc',bossDmg(),true));}}
function bossSpiral(cx,cy,step,count,speed,clr){const start=performance.now();for(let i=0;i<count;i++){const a=(i*step)+start/700;const vx=Math.cos(a)*speed,vy=Math.sin(a)*speed;state.bullets.push(new Bullet(cx,cy,vx,vy,3.5,clr||'#a78bfa',bossDmg(),true));}}

// HUD
function updateHUD(){
  const pct=Math.max(0,Math.min(1,state.player.hp/state.maxHP));
  hpFill.style.width=(pct*100)+'%';
  hpText.textContent=`${Math.floor(state.player.hp)} / ${state.maxHP}`;
  liveScore.textContent=Math.floor(state.score);
}

// 패턴 스킨 드로잉
function makePainter(id){
  return function drawPlayer(){
    ctx.save();
    ctx.translate(state.player.x,state.player.y);
    // 본체 경로
    ctx.beginPath(); ctx.arc(0,0,state.player.r,0,Math.PI*2);
    // 채우기 스타일
    switch(id){
      case 'white': ctx.fillStyle='#ffffff'; break;
      case 'mint': ctx.fillStyle='#7ef5d1'; break;
      case 'sky': ctx.fillStyle='#7ecbff'; break;
      case 'lime': ctx.fillStyle='#a6ff6b'; break;
      case 'orange': ctx.fillStyle='#ffb36b'; break;
      case 'violet': ctx.fillStyle='#ba8bff'; break;
      case 'aqua': ctx.fillStyle='#6bfffb'; break;
      case 'stripe-mint-sky': {
        const pat = stripePattern(['#7ef5d1','#7ecbff']); ctx.fillStyle=pat; break;
      }
      case 'stripe-orange-violet': {
        const pat = stripePattern(['#ffb36b','#ba8bff']); ctx.fillStyle=pat; break;
      }
      case 'grad-sunrise': {
        const g = ctx.createLinearGradient(-10,-10,10,10);
        g.addColorStop(0,'#ff9a9e'); g.addColorStop(0.5,'#fad0c4'); g.addColorStop(1,'#ffd1ff');
        ctx.fillStyle=g; break;
      }
      case 'grad-sea': {
        const g = ctx.createLinearGradient(-10,-10,10,10);
        g.addColorStop(0,'#36d1dc'); g.addColorStop(1,'#5b86e5');
        ctx.fillStyle=g; break;
      }
      case 'stripe-gold-silver': {
        const pat = stripePattern(['#ffd700','#c0c0c0']); ctx.fillStyle=pat; break;
      }
      case 'grad-sunset': {
        const g = ctx.createLinearGradient(-10,0,10,0);
        g.addColorStop(0,'#0b486b'); g.addColorStop(1,'#f56217');
        ctx.fillStyle=g; break;
      }
      case 'god-rainbow': {
        const g = ctx.createLinearGradient(-10,0,10,0);
        const colors=['red','orange','yellow','green','blue','indigo','violet'];
        colors.forEach((c,i)=>g.addColorStop(i/(colors.length-1),c));
        ctx.fillStyle=g; break;
      }
      default: ctx.fillStyle='#fff';
    }
    ctx.fill();
    ctx.restore();
  };
}
function stripePattern(colors){
  const off = document.createElement('canvas');
  off.width=16; off.height=16;
  const c=off.getContext('2d');
  // 대각 스트립
  c.fillStyle = colors[0]; c.fillRect(0,0,16,16);
  c.fillStyle = colors[1];
  c.beginPath();
  c.moveTo(0,8); c.lineTo(8,0); c.lineTo(16,8); c.lineTo(8,16); c.closePath(); c.fill();
  return ctx.createPattern(off,'repeat');
}
let cachedSkinId=null, painter=makePainter('white');

// 로직
function reset(){
  state.run=true; state.over=false; state.time=0; state.score=0; state.maxHP=100;
  state.player={x:W/2,y:H*0.85,r:7,speed:170,hp:state.maxHP};
  state.bullets.length=0; state.spawnT=0; state.spawnMs=700; state.diffT=0;
  state.boss={active:false,t:0,next:3000,count:0}; state.growthT=0; state.items.length=0; state.itemT=0;
  updateHUD();
}
function gameOver(){
  state.run=false; state.over=true;
  document.getElementById('finalScore').textContent=Math.floor(state.score);
  document.getElementById('over').classList.remove('hidden');
}
function heal(n){ state.player.hp=Math.min(state.maxHP,state.player.hp+n); updateHUD(); }

function tryStartBoss(){
  if(state.score>=state.boss.next && !state.boss.active){
    state.boss.active=true; state.boss.t=0; state.boss.next += 3000; state.boss.count += 1;
  }
}
function endBossPhase(){
  state.boss.active=false;
  // 보스 클리어 보상 호출 (3번째부터)
  if (window.GameInterop && window.GameInterop.onBossClear){
    window.GameInterop.onBossClear(state.boss.count);
  }
}

function updateBoss(dt){
  state.boss.t += dt*1000;
  const t=state.boss.t;
  if(t<8000){
    if(Math.floor(t/600)!==Math.floor((t-dt*1000)/600)) bossRing (W/2,H/2,20,2.6, 6,'#38bdf8');
    if(Math.floor(t/120)!==Math.floor((t-dt*1000)/120)) bossSpiral(W/2,H/2,0.35,12,2.4,'#c084fc');
  }else if(t<16000){
    if(Math.floor(t/450)!==Math.floor((t-dt*1000)/450)) bossRing (W/2,H/2,28,2.9,12,'#34d399');
    if(Math.floor(t/100)!==Math.floor((t-dt*1000)/100)) bossSpiral(W/2,H/2,0.5 ,18,2.6,'#f472b6');
  }else{
    endBossPhase();
  }
}

function update(dt){
  if(!state.run) return;

  // 이동
  const a=inputAxis();
  state.player.x+=a.x*state.player.speed*dt;
  state.player.y+=a.y*state.player.speed*dt;
  state.player.x=Math.max(state.player.r,Math.min(W-state.player.r,state.player.x));
  state.player.y=Math.max(state.player.r,Math.min(H-state.player.r,state.player.y));

  // Max HP 성장
  state.growthT+=dt*1000;
  if(state.growthT>=CFG.growthMs){ state.growthT-=CFG.growthMs; state.maxHP+=CFG.growthAmount; updateHUD(); }

  // 힐팩
  state.itemT+=dt*1000;
  if(state.itemT>=CFG.healPackSpawnMs){
    state.itemT-=CFG.healPackSpawnMs;
    state.items.push(new Heal(10+Math.random()*(W-20), 10+Math.random()*(H-20)));
  }
  state.items = state.items.filter(it=>!it.expired());

  // 보스/스폰
  tryStartBoss();
  if(state.boss.active){
    updateBoss(dt);
  }else{
    state.spawnT+=dt*1000; state.diffT+=dt*1000;
    if(state.spawnT>=state.spawnMs){
      state.spawnT-=state.spawnMs;
      state.bullets.push(Bullet.aimedFromEdge(state.player.x,state.player.y,state.score));
      state.bullets.push(Bullet.aimedFromEdge(state.player.x,state.player.y,state.score));
    }
    if(state.diffT>=4200){
      state.diffT-=4200;
      if(state.score < state.freezeAfter) state.spawnMs = Math.max(state.minMs, state.spawnMs - 55);
    }
  }

  // 탄 이동/충돌
  for(const b of state.bullets) b.step(dt);
  state.bullets = state.bullets.filter(b=>b.in());
  for(const b of state.bullets){
    const dx=b.x-state.player.x, dy=b.y-state.player.y;
    if(Math.hypot(dx,dy) < b.r + state.player.r){
      state.player.hp -= b.dmg; b.y=9999;
      if(state.player.hp<=0) break;
    }
  }

  // 힐팩 획득
  for(const it of state.items){
    if(Math.hypot(it.x-state.player.x,it.y-state.player.y) < it.r+state.player.r){
      const healAmt = Math.round(state.maxHP*CFG.healPackPercent)+CFG.healPackFlat;
      heal(healAmt); it.born=-9999;
    }
  }

  // 점수/HUD
  state.score += 70*dt;
  updateHUD();
  if(state.player.hp<=0) gameOver();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  // 경계
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,W,4); ctx.fillRect(0,0,4,H); ctx.fillRect(W-4,0,4,H); ctx.fillRect(0,H-4,W,4);

  // 플레이어(스킨)
  const skinId = (window.GameConfig && window.GameConfig.selectedSkin) ? window.GameConfig.selectedSkin : 'white';
  if (skinId !== cachedSkinId){ painter = makePainter(skinId); cachedSkinId = skinId; }
  painter();

  // 탄/힐팩
  for(const b of state.bullets){ ctx.fillStyle=b.clr; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); }
  for(const it of state.items){
    ctx.fillStyle='#ff6ec7';
    ctx.beginPath();
    ctx.arc(it.x-3, it.y-3, 4, 0, Math.PI*2);
    ctx.arc(it.x+3, it.y-3, 4, 0, Math.PI*2);
    ctx.moveTo(it.x-7, it.y-1);
    ctx.lineTo(it.x,    it.y+8);
    ctx.lineTo(it.x+7, it.y-1);
    ctx.closePath();
    ctx.fill();
  }
}

// 루프
let last=0, raf=0;
function loop(ts){ const dt=Math.min(0.05,(ts-(last||ts))/1000); last=ts; update(dt); draw(); if(state.run) raf=requestAnimationFrame(loop); }
function startGame(){ document.getElementById('over').classList.add('hidden'); document.getElementById('mainMenu').classList.add('hidden'); document.getElementById('gameWrap').classList.remove('hidden'); reset(); last=0; cancelAnimationFrame(raf); raf=requestAnimationFrame(loop); }
window.startGame=startGame;

// 버튼
document.getElementById('btnToMenu').addEventListener('click',()=>{
  document.getElementById('gameWrap').classList.add('hidden');
  document.getElementById('mainMenu').classList.remove('hidden');
  document.getElementById('over').classList.add('hidden');
});
document.getElementById('btnSaveRank').addEventListener('click', async ()=>{
  const saver = window.GameInterop && window.GameInterop.saveScore;
  if(!saver) return;
  const res = await saver(state.score);
  const t = document.getElementById('saveToast');
  t.textContent = res.ok ? '랭킹 저장 완료' : '실패: '+(res.reason||'알 수 없음');
  setTimeout(()=> t.textContent='', 2500);
});
