// main.js — 헤더/프로필/상점/랭킹 + Supabase (이모지 상점: 부족 골드 방지 완전 적용)
(() => {
  'use strict';

  // ========= helpers =========
  const $ = sel => document.querySelector(sel);
  const show = el => el && el.classList.remove('hidden');
  const hide = el => el && el.classList.add('hidden');
  const toast = (msg) => { const t = $('#saveToast'); if (t) { t.textContent = msg; setTimeout(()=>t.textContent='', 1800); } };

  // ========= Supabase =========
  const SUPABASE_URL  = "https://pecoerlqanocydrdovbb.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlY29lcmxxYW5vY3lkcmRvdmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNzM4ODYsImV4cCI6MjA3MDc0OTg4Nn0.gbQlIPV89_IecGzfVxsnjuzLe-TStTYQqMKzV-B4CUs";
  const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, storage: window.sessionStorage }
  });

  // ========= Global state =========
  let session = null;
  let user = null;
  let profile = null;
  let bestScore = 0;

  // ========= Catalogs =========
  const ALL_SKINS = [
    { id:'white',  name:'White' },
    { id:'mint',   name:'Mint'  },
    { id:'sky',    name:'Sky'   },
    { id:'lime',   name:'Lime'  },
    { id:'orange', name:'Orange'},
    { id:'violet', name:'Violet'},
    { id:'aqua',   name:'Aqua'  },
    { id:'stripe-mint-sky', name:'Stripe Mint/Sky' },
    { id:'stripe-orange-violet', name:'Stripe Orange/Violet' },
    { id:'stripe-gold-silver',   name:'Stripe Gold/Silver' },
    { id:'grad-sunrise', name:'Grad Sunrise' },
    { id:'grad-sea',     name:'Grad Sea'     },
    { id:'grad-sunset',  name:'Grad Sunset'  },
    { id:'god-rainbow',  name:'GOD Rainbow'  }
  ];

  // 이모지 상점 판매 목록 (원하면 자유롭게 수정)
  const EMOJI_STORE = [
    { id:'e_star',       emoji:'⭐', name:'Star',       price:   0 },   // 기본 무료
    { id:'e_smile',      emoji:'😄', name:'Smile',      price: 100 },
    { id:'e_fire',       emoji:'🔥', name:'Fire',       price: 500 },
    { id:'e_crown',      emoji:'👑', name:'Crown',      price: 1000 },
    { id:'e_rocket',     emoji:'🚀', name:'Rocket',     price: 4000 },
    { id:'e_skull',      emoji:'💀', name:'Skull',      price: 8000 },
    { id:'e_dragon',     emoji:'🐉', name:'Dragon',     price: 15000 },
    { id:'e_trophy',     emoji:'🏆', name:'Trophy',     price: 40000 },
    { id:'e_Champion',   emoji:'🥇', name:'Champion',   price: 100000 }
  ];

  // ========= Auth / Profile =========
  async function getSession() {
    const { data } = await supa.auth.getSession();
    return data.session;
  }

  async function ensureProfile(u) {
    const { data: existing } = await supa
      .from('profiles').select('user_id').eq('user_id', u.id).maybeSingle();
    if (!existing) {
      await supa.from('profiles').insert({
        user_id: u.id,
        gold: 0,
        selected_skin: 'white',
        unlocked_skins: ['white'],
        selected_emoji: '⭐',
        unlocked_emojis: ['⭐']
      });
    }
  }

  async function loadProfile(u) {
    const { data } = await supa.from('profiles').select('*').eq('user_id', u.id).maybeSingle();
    profile = data || {};
    const patch = {};
    if (profile.gold == null) patch.gold = 0;
    if (!profile.selected_skin) patch.selected_skin = 'white';
    if (!Array.isArray(profile.unlocked_skins)) patch.unlocked_skins = ['white'];
    if (!profile.selected_emoji) patch.selected_emoji = '⭐';
    if (!Array.isArray(profile.unlocked_emojis)) patch.unlocked_emojis = ['⭐'];

    if (Object.keys(patch).length) {
      await supa.from('profiles').update(patch).eq('user_id', u.id);
      Object.assign(profile, patch);
    }
  }

  async function fetchBestScore(uid) {
    const { data, error } = await supa
      .from('rankings')
      .select('score')
      .eq('user_id', uid)
      .order('score', { ascending:false })
      .limit(1);
    bestScore = (!error && data && data.length) ? (data[0].score|0) : 0;
  }

  // ========= UI =========
  function applyHeaderUI() {
    const nameTag = (profile.nickname || 'user') + '#' + (profile.tag || '0000');
    $('#profileName').textContent = nameTag;
    $('#profileBest').textContent = String(bestScore || 0);
    $('#goldText').textContent = profile.gold ?? 0;
    $('#profileEmoji').textContent = profile.selected_emoji || '⭐';
    $('#shopGold').textContent = profile.gold ?? 0;
  }

  function chipHTML(label, sub, opts={}) {
    const sel = opts.selected ? 'chip-sel' : '';
    const lock = opts.locked ? 'chip-lock' : '';
    return `
      <button class="chip ${sel} ${lock}" ${opts.attr||''}>
        <span class="chip-color"></span>
        <span>${label}</span>
        ${sub ? `<small>${sub}</small>` : ''}
      </button>
    `;
  }

  function buildSkinGrid() {
    const grid = $('#skinGrid'); if (!grid) return;
    const have = new Set(profile.unlocked_skins || ['white']);
    const selected = profile.selected_skin || 'white';
    grid.innerHTML = ALL_SKINS.map(s => {
      const owned = have.has(s.id);
      return chipHTML(s.name, owned ? '보유' : '잠금', {
        selected: selected === s.id,
        locked: !owned,
        attr: `data-skin="${s.id}"`
      });
    }).join('');
    grid.querySelectorAll('[data-skin]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-skin');
        if (!have.has(id) || selected === id) return;
        const { error } = await supa.from('profiles').update({ selected_skin: id }).eq('user_id', profile.user_id);
        if (!error) { profile.selected_skin = id; buildSkinGrid(); }
      };
    });
  }

  function buildEmojiGrid() {
    const grid = $('#emojiGrid'); if (!grid) return;
    const have = new Set(profile.unlocked_emojis || ['⭐']);
    const selected = profile.selected_emoji || '⭐';
    grid.innerHTML = EMOJI_STORE.map(e => {
      const owned = have.has(e.emoji) || e.price === 0; // 무료는 항상 보유
      return `
        <button class="chip ${owned?'':'chip-lock'} ${selected===e.emoji?'chip-sel':''}" data-emoji="${e.emoji}">
          <span class="chip-color" style="display:grid;place-items:center;font-size:16px;background:#1a2332">${e.emoji}</span>
          <span>${e.name}</span>
        </button>
      `;
    }).join('');
    grid.querySelectorAll('[data-emoji]').forEach(btn => {
      btn.onclick = async () => {
        const emoji = btn.getAttribute('data-emoji');
        if (!have.has(emoji) && emoji !== '⭐') return;
        if (selected === emoji) return;
        const { error } = await supa.from('profiles').update({ selected_emoji: emoji }).eq('user_id', profile.user_id);
        if (!error) { profile.selected_emoji = emoji; applyHeaderUI(); buildEmojiGrid(); }
      };
    });
  }

  // ========= Emoji Shop (서버 원자 차감) =========
  function buildEmojiShop() {
    const grid = $('#emojiShopGrid'); if (!grid) return;
    const have = new Set(profile.unlocked_emojis || ['⭐']);

    grid.innerHTML = EMOJI_STORE.map(e => {
      const owned = have.has(e.emoji) || e.price === 0;
      return `
        <div class="shop-item">
          <div class="icon">${e.emoji}</div>
          <div class="meta">
            <div class="nm">${e.name}</div>
            <div class="pr">💰 ${e.price}</div>
          </div>
          <button class="buy" data-buy="${e.id}" ${owned?'disabled':''}>
            ${owned?'보유중':'구매'}
          </button>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-buy]').forEach(btn => {
      btn.onclick = async () => {
        // 중복 클릭 방지
        if (btn.disabled) return;
        const id = btn.getAttribute('data-buy');
        const item = EMOJI_STORE.find(x => x.id === id);
        if (!item) return;

        // 이미 보유면 무시
        const owned = (profile.unlocked_emojis || []).includes(item.emoji) || item.price === 0;
        if (owned) return;

        btn.disabled = true;

        // 1) (선택) 최신 잔액 동기화
        try {
          const { data: total0 } = await supa.rpc('wallet_add_gold', { delta: 0 });
          if (typeof total0 === 'number') profile.gold = total0;
        } catch (_) {}

        // 2) 로컬 선확인
        if ((profile.gold|0) < (item.price|0)) {
          console.log("골드 부족 체크 실행됨, 현재 골드:", profile.gold, "가격:", item.price);
          toast('골드가 부족합니다!');
          btn.disabled = false;
          return;
        }


        // 3) 서버에서 원자적으로 차감 (뽑기와 동일한 방식)
        const { data: newTotal, error: spendErr } =
          await supa.rpc('wallet_spend_gold', { cost: item.price });

        if (spendErr || typeof newTotal !== 'number') {
          if (spendErr && /insufficient_gold/i.test(spendErr.message)) {
            toast('골드가 부족합니다!');
          } else {
            toast('구매 실패' + (spendErr ? `: ${spendErr.message}` : ''));
          }
          btn.disabled = false;
          return;
        }

        // 4) 차감 성공 → 보유 이모지 저장
        profile.gold = newTotal;               // 서버가 계산한 최신 잔액
        const next = Array.from(new Set([...(profile.unlocked_emojis || ['⭐']), item.emoji]));
        const { error } = await supa.from('profiles')
          .update({ unlocked_emojis: next })
          .eq('user_id', profile.user_id);

        if (error) {
          toast('저장 실패: ' + error.message);
          btn.disabled = false;
          return;
        }

        profile.unlocked_emojis = next;

        // 5) UI 갱신
        applyHeaderUI();
        buildEmojiShop();
        buildEmojiGrid();
        toast(`구매 완료: ${item.emoji} ${item.name}`);
      };
    });
  }

  // ========= Ranking =========
  async function openRanking() {
    const { data, error } = await supa
      .from('rankings')
      .select('nickname,tag,score,emoji,created_at')
      .order('score', { ascending:false })
      .limit(50);
    if (error) { toast('랭킹 불러오기 실패'); return; }
    const list = $('#rankingList');
    list.innerHTML = (data||[]).map((r,i)=>(
      `<li><span class="rk">${i+1}</span> <span class="em">${r.emoji||'⭐'}</span> <span class="nm">${r.nickname||'user'}#${r.tag||'0000'}</span> <span class="sc">${r.score|0}</span></li>`
    )).join('');
    $('#rankingModal').showModal();
  }

  // ========= GameInterop =========
  window.GameInterop = {
    async saveScore(score, emoji) {
      try {
        const u = user || (await getSession())?.user;
        if (!u) return { ok:false, reason:'no_session' };
        const effectiveEmoji = emoji || (profile?.selected_emoji) || '⭐';
        const nickname = profile?.nickname || 'user';
        const tag = profile?.tag || '0000';
        const { error } = await supa.from('rankings').insert({
          user_id: u.id,
          nickname, tag,
          score: Math.floor(score||0),
          emoji: effectiveEmoji
        });
        if (error) return { ok:false, reason: error.message };
        if ((score|0) > (bestScore|0)) bestScore = score|0;
        applyHeaderUI();
        return { ok:true };
      } catch (e) {
        return { ok:false, reason: e?.message || 'exception' };
      }
    },
    onBossClear: (count) => {}
  };

  // ========= events =========
  $('#btnProfile')?.addEventListener('click', async ()=>{
    $('#modalNickname').textContent = (profile?.nickname||'user') + '#' + (profile?.tag||'0000');
    $('#modalGold').textContent = profile?.gold ?? 0;
    buildSkinGrid();
    buildEmojiGrid();
    $('#profileModal').showModal();
  });

  $('#btnEmojiShop')?.addEventListener('click', ()=>{
    $('#shopGold').textContent = profile?.gold ?? 0;
    buildEmojiShop();
    $('#emojiShopModal').showModal();
  });

  $('#btnGacha')?.addEventListener('click', ()=>{ $('#gachaModal').showModal(); });
  $('#btnRanking')?.addEventListener('click', openRanking);

  // modal close buttons
  document.querySelectorAll('[data-close]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = btn.getAttribute('data-close');
      const dlg = document.querySelector(target);
      dlg && dlg.close();
    });
  });

  // Start → 게임화면 진입
  $('#btnStart')?.addEventListener('click', ()=>{
    hide($('#mainMenu'));
    hide($('#topBar'));
    show($('#gameWrap'));
    window.startGame && window.startGame();
  });

  // ========= boot =========
  (async function boot(){
    session = await getSession();
    if (!session) { location.href = './login.html'; return; }
    user = session.user;
    await ensureProfile(user);
    await loadProfile(user);
    await fetchBestScore(user.id);
    applyHeaderUI();

    window.GameConfig = {
      get selectedSkin(){ return profile?.selected_skin || 'white'; }
    };

    hide($('#gameWrap'));
    show($('#mainMenu'));
    show($('#topBar'));
  })();
})();
