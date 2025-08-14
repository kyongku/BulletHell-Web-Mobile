// BulletHell Mobile v3 — HUD (HP bar + live score), heal packs, regen, bosses
const W=350,H=350;const canvas=document.getElementById('gameCanvas');const ctx=canvas.getContext('2d');

const CFG = { maxHP:6, regenMs:15000, healPackSpawnMs:9000, healPackTTL:10000, healAmount:2 };

(function(){const pad=document.getElementById('pad');const stick=document.getElementById('stick');let active=false,axis={x:0,y:0};
function setAxis(x,y){const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=x-cx,dy=y-cy,max=r.width*.5;let ax=dx/max,ay=dy/max,l=Math.hypot(ax,ay);if(l>1){ax/=l;ay/=l;}axis.x=ax;axis.y=ay;stick.style.left=(50+ax*30)+'%';stick.style.top=(50+ay*30)+'%';}
function endAxis(){axis.x=0;axis.y=0;stick.style.left='50%';stick.style.top='50%';}
pad.addEventListener('touchstart',e=>{e.preventDefault();active=true;const t=e.changedTouches[0];setAxis(t.clientX,t.clientY)},{passive:false});
pad.addEventListener('touchmove',e=>{e.preventDefault();if(!active)return;const t=e.changedTouches[0];setAxis(t.clientX,t.clientY)},{passive:false});
pad.addEventListener('touchend',e=>{e.preventDefault();active=false;endAxis()},{passive:false});
pad.addEventListener('touchcancel',e=>{e.preventDefault();active=false;endAxis()},{passive:false});
window.MobileInput={getAxis:()=>({x:axis.x,y:axis.y})};})();
const keys=new Set();addEventListener('keydown',e=>keys.add(e.code));addEventListener('keyup',e=>keys.delete(e.code));
function inputAxis(){const a=(window.MobileInput&&window.MobileInput.getAxis)?window.MobileInput.getAxis():{x:0,y:0};let dx=a.x,dy=a.y;if(dx===0&&dy===0){dx=(keys.has('ArrowRight')||keys.has('KeyD'))-(keys.has('ArrowLeft')||keys.has('KeyA'));dy=(keys.has('ArrowDown')||keys.has('KeyS'))-(keys.has('ArrowUp')||keys.has('KeyW'));const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;}return{x:dx,y:dy};}

const state={
  run:false,over:false,time:0,score:0,
  player:{x:W/2,y:H*0.85,r:7,speed:170,hp:4,color:'#fff'},
  bullets:[], spawnT:0,spawnMs:720,diffT:0,minMs:240,freezeAfter:12000,
  boss:{active:false,t:0,phase:0,next:6000},
  regenT:0, items:[], itemT:0
};

class Bullet{constructor(x,y,vx,vy,r,clr){this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.r=r;this.clr=clr;}
  step(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;} in(){return this.x>-30&&this.x<W+30&&this.y>-30&&this.y<H+30;}
  static aimedFromEdge(px,py,score){let x,y;if(Math.random()<.5){x=Math.random()*W;y=Math.random()<.5?0:H;}else{x=Math.random()<.5?0:W;y=Math.random()*H;}
    const dx=px-x,dy=py-y,len=Math.hypot(dx,dy)||1; const cap=Math.min(score,state.freezeAfter);
    const sp=4.4 + cap/3300; return new Bullet(x,y,dx/len*sp,dy/len*sp,4.5,'#ff4b4b');}}

class Heal{constructor(x,y){this.x=x;this.y=y;this.r=6;this.born=performance.now();} expired(){return performance.now()-this.born>CFG.healPackTTL;}}

function bossSpawnRing(cx,cy,count,speed,radius,clr){for(let i=0;i<count;i++){const a=(i/count)*Math.PI*2;const x=cx+Math.cos(a)*radius,y=cy+Math.sin(a)*radius;const vx=Math.cos(a)*speed,vy=Math.sin(a)*speed;state.bullets.push(new Bullet(x,y,vx,vy,3.5,clr||'#7dd3fc'));}}
function bossSpawnSpiral(cx,cy,step,count,speed,clr){const start=performance.now();for(let i=0;i<count;i++){const a=(i*step)+start/700;const vx=Math.cos(a)*speed,vy=Math.sin(a)*speed;state.bullets.push(new Bullet(cx,cy,vx,vy,3.5,clr||'#a78bfa'));}}
function tryStartBoss(){if(state.score>=state.boss.next&&!state.boss.active){state.boss.active=true;state.boss.t=0;state.boss.phase=0;state.boss.next+=6000;}}
function updateBoss(dt){if(!state.boss.active)return;state.boss.t+=dt*1000;const t=state.boss.t;
  if(t<8000){if(Math.floor(t/600)!==Math.floor((t-dt*1000)/600))bossSpawnRing(W/2,H/2,20,2.4,6,'#38bdf8'); if(Math.floor(t/120)!==Math.floor((t-dt*1000)/120))bossSpawnSpiral(W/2,H/2,0.35,12,2.2,'#c084fc');}
  else if(t<16000){if(Math.floor(t/450)!==Math.floor((t-dt*1000)/450))bossSpawnRing(W/2,H/2,28,2.7,12,'#34d399'); if(Math.floor(t/100)!==Math.floor((t-dt*1000)/100))bossSpawnSpiral(W/2,H/2,0.5,18,2.5,'#f472b6');}
  else{state.boss.active=false;}}

const hpFill=document.getElementById('hpFill'); const liveScore=document.getElementById('liveScore');
function updateHUD(){const pct=Math.max(0,Math.min(1,state.player.hp/CFG.maxHP)); hpFill.style.width=(pct*100)+'%'; liveScore.textContent=Math.floor(state.score);}

function reset(){state.run=true;state.over=false;state.time=0;state.score=0;
  state.player={x:W/2,y:H*0.85,r:7,speed:170,hp:4,color:'#fff'}; state.bullets.length=0; state.spawnT=0; state.spawnMs=720; state.diffT=0;
  state.boss.active=false; state.boss.t=0; state.boss.phase=0; state.boss.next=6000; state.regenT=0; state.items.length=0; state.itemT=0; updateHUD();}
function gameOver(){state.run=false;state.over=true; document.getElementById('finalScore').textContent=Math.floor(state.score); document.getElementById('over').classList.remove('hidden');}
function heal(n){state.player.hp=Math.min(CFG.maxHP,state.player.hp+n); updateHUD();}

function update(dt){if(!state.run)return; const a=inputAxis(); state.player.x+=a.x*state.player.speed*dt; state.player.y+=a.y*state.player.speed*dt;
  state.player.x=Math.max(state.player.r,Math.min(W-state.player.r,state.player.x)); state.player.y=Math.max(state.player.r,Math.min(H-state.player.r,state.player.y));
  state.regenT+=dt*1000; if(state.regenT>=CFG.regenMs){state.regenT-=CFG.regenMs; if(state.player.hp<CFG.maxHP) heal(1);}
  state.itemT+=dt*1000; if(state.itemT>=CFG.healPackSpawnMs){state.itemT-=CFG.healPackSpawnMs; state.items.push(new Heal(10+Math.random()*(W-20),10+Math.random()*(H-20)));}
  state.items=state.items.filter(it=>!it.expired());
  tryStartBoss(); if(state.boss.active){updateBoss(dt);} else {state.spawnT+=dt*1000; state.diffT+=dt*1000;
    if(state.spawnT>=state.spawnMs){state.spawnT-=state.spawnMs; state.bullets.push(Bullet.aimedFromEdge(state.player.x,state.player.y,state.score)); state.bullets.push(Bullet.aimedFromEdge(state.player.x,state.player.y,state.score));}
    if(state.diffT>=4300){state.diffT-=4300; if(state.score<state.freezeAfter) state.spawnMs=Math.max(state.minMs,state.spawnMs-55);}}
  for(const b of state.bullets) b.step(dt); state.bullets=state.bullets.filter(b=>b.in());
  for(const b of state.bullets){const dx=b.x-state.player.x,dy=b.y-state.player.y; if(Math.hypot(dx,dy)<b.r+state.player.r){state.player.hp-=1; b.y=9999; if(state.player.hp<=0) break;}}
  for(const it of state.items){if(Math.hypot(it.x-state.player.x,it.y-state.player.y)<it.r+state.player.r){it.born=-9999999; heal(CFG.healAmount);}}
  state.score+=70*dt; updateHUD(); if(state.player.hp<=0) gameOver();}

function draw(){ctx.clearRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,4);ctx.fillRect(0,0,4,H);ctx.fillRect(W-4,0,4,H);ctx.fillRect(0,H-4,W,4);
  ctx.fillStyle=state.player.color; ctx.beginPath(); ctx.arc(state.player.x,state.player.y,state.player.r,0,Math.PI*2); ctx.fill();
  for(const b of state.bullets){ctx.fillStyle=b.clr; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();}
  for(const it of state.items){ctx.fillStyle='#22c55e'; ctx.beginPath(); ctx.arc(it.x,it.y,it.r,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#0b0f14'; ctx.fillRect(it.x-2,it.y-6,4,12); ctx.fillRect(it.x-6,it.y-2,12,4);}
}

let last=0,raf=0; function loop(ts){const dt=Math.min(0.05,(ts-(last||ts))/1000); last=ts; update(dt); draw(); if(state.run) raf=requestAnimationFrame(loop);}
function startGame(){document.getElementById('over').classList.add('hidden');document.getElementById('mainMenu').classList.add('hidden');document.getElementById('gameWrap').classList.remove('hidden');reset();last=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);} window.startGame=startGame;
document.getElementById('btnToMenu').addEventListener('click',()=>{document.getElementById('gameWrap').classList.add('hidden');document.getElementById('mainMenu').classList.remove('hidden');document.getElementById('over').classList.add('hidden');});
document.getElementById('btnSaveRank').addEventListener('click',async()=>{const saver=window.GameInterop&&window.GameInterop.saveScore;if(!saver)return;const res=await saver(state.score);const t=document.getElementById('saveToast');t.textContent=res.ok?'랭킹 저장 완료':'실패: '+(res.reason||'알 수 없음');setTimeout(()=>t.textContent='',2500);});
