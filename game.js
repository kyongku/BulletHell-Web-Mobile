/* --------------------------------------------------
 * Bullet Hell MVP (900x900 build) with Firebase Ranking + Leaderboard
 * -------------------------------------------------- */
'use strict';

// Firebase SDK는 HTML에서 <script> 태그로 불러오므로 import 사용 안 함
// 대신 전역 firebase 객체 사용

const firebaseConfig = {
  apiKey: "AIzaSyDnqIp8dOVoNtC1BM_iatTX6tSO7Hmra2A",
  authDomain: "score-513e1.firebaseapp.com",
  databaseURL: "https://score-513e1-default-rtdb.firebaseio.com",
  projectId: "score-513e1",
  storageBucket: "score-513e1.appspot.com",
  messagingSenderId: "467005083552",
  appId: "1:467005083552:web:456d61c47629b73ffa5ec5",
  measurementId: "G-620711P42E"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.database();

const nameForm = document.getElementById('score-submit');
const nicknameInput = document.getElementById('nicknameInput');
const leaderboardPanel = document.createElement('div');
leaderboardPanel.id = 'leaderboard';
leaderboardPanel.className = 'panel hidden';
leaderboardPanel.innerHTML = `
  <h2>🏆 랭킹 보기</h2>
  <select id="rank-diff-select">
    <option value="easy">Easy</option>
    <option value="hard">Hard</option>
  </select>
  <ol id="rank-list"></ol>
  <button onclick="hideLeaderboard()">닫기</button>
`;
document.getElementById('ui-root').appendChild(leaderboardPanel);

const rankSelect = document.getElementById('rank-diff-select');
const leaderboardList = document.getElementById('rank-list');

const rankBtn = document.createElement('button');
rankBtn.textContent = '랭킹 보기';
rankBtn.className = 'menu-btn';
rankBtn.onclick = showLeaderboard;
document.getElementById('menu').appendChild(rankBtn);

function submitScore() {
  const name = nicknameInput.value.trim();
  if (!/^[\uAC00-\uD7A3]{2,10}$/.test(name)) {
    alert("이름은 반드시 한글 2자 이상, 성 포함으로 입력해야 합니다.");
    return;
  }
  const path = `scores/${game.diff}/${name}`;
  const userRef = db.ref(path);
  userRef.once("value").then((snapshot) => {
    const data = snapshot.val();
    if (!data || game.score > data.score) {
      userRef.set({ score: game.score, timestamp: Date.now() });
    }
  });
  nameForm.classList.add('hidden');
  hideGameOver();
  showMenu();
  game.mode = GameMode.MENU;
}

function returnToMenu() {
  game.mode = GameMode.MENU;
  running = false;
  showMenu();
  hideGameOver();
  nameForm.classList.add('hidden');
  hideLeaderboard();
}

function showLeaderboard() {
  const difficulty = rankSelect.value;
  const scoresRef = db.ref(`scores/${difficulty}`);
  scoresRef.once("value").then((snapshot) => {
    const data = snapshot.val() || {};
    const sorted = Object.entries(data)
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
      .slice(0, 10);
    leaderboardList.innerHTML = '';
    for (const s of sorted) {
      const li = document.createElement('li');
      li.textContent = `${s.name} - ${s.score.toFixed(1)}s`;
      leaderboardList.appendChild(li);
    }
    leaderboardPanel.classList.remove('hidden');
  });
}

function hideLeaderboard() {
  leaderboardPanel.classList.add('hidden');
} 

// nicknameInput Enter 제출
nicknameInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') submitScore();
});
