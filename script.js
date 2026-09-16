(function(){
  "use strict";

  // ---------- Audio System (Web Audio API) ----------
  const AudioController = (function(){
    let ctx = null;
    let isMuted = false;
    let bgmInterval = null;

    function initCtx(){
      if(!ctx){
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if(AudioContext) ctx = new AudioContext();
      }
      if(ctx && ctx.state === 'suspended') ctx.resume();
    }

    function playTone(freq, type, duration, vol=0.1, sweep=0){
      if(isMuted || !ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if(sweep !== 0){
        osc.frequency.exponentialRampToValueAtTime(freq * sweep, ctx.currentTime + duration);
      }
      
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      osc.start();
      osc.stop(ctx.currentTime + duration);
    }

    return {
      init: initCtx,
      toggleMute: function(){ isMuted = !isMuted; return isMuted; },
      playClick: () => playTone(600, 'sine', 0.1, 0.05),
      playCorrect: () => {
        playTone(400, 'sine', 0.1, 0.1);
        setTimeout(() => playTone(600, 'sine', 0.15, 0.1), 100);
      },
      playWrong: () => playTone(150, 'sawtooth', 0.2, 0.1),
      playBoost: () => playTone(200, 'sine', 0.3, 0.1, 3), // sweep up
      playBeep: () => playTone(440, 'square', 0.1, 0.05),
      playGo: () => playTone(880, 'square', 0.3, 0.08),
      playWin: () => {
        playTone(400, 'square', 0.1, 0.1);
        setTimeout(() => playTone(500, 'square', 0.1, 0.1), 100);
        setTimeout(() => playTone(600, 'square', 0.3, 0.1), 200);
      },
      playLose: () => {
        playTone(300, 'triangle', 0.2, 0.1);
        setTimeout(() => playTone(250, 'triangle', 0.3, 0.1), 200);
      },
      playMenuBGM: () => {
        if(!ctx) return;
        if(bgmInterval) clearInterval(bgmInterval);
        const notes = [261.63, 392.00, 329.63, 392.00]; // Calmer melody
        let step = 0;
        bgmInterval = setInterval(() => {
          if(!isMuted) playTone(notes[step % notes.length], 'triangle', 0.2, 0.015);
          step++;
        }, 600);
      },
      playRaceBGM: () => {
        if(!ctx) return;
        if(bgmInterval) clearInterval(bgmInterval);
        const notes = [261.63, 329.63, 392.00, 329.63, 440.00, 392.00, 329.63, 261.63]; // Playful melody
        let step = 0;
        bgmInterval = setInterval(() => {
          if(!isMuted) playTone(notes[step % notes.length], 'sine', 0.2, 0.02);
          step++;
        }, 300);
      },
      stopBGM: () => {
        if(bgmInterval) clearInterval(bgmInterval);
        bgmInterval = null;
      }
    };
  })();

  document.getElementById('audioToggleBtn').addEventListener('click', function(e){
    AudioController.init();
    const muted = AudioController.toggleMute();
    e.target.textContent = muted ? '🔈' : '🔊';
    // If not muted and we are on start screen, play menu BGM
    if(!muted && screens.start.classList.contains('active')) {
       AudioController.playMenuBGM();
    }
  });

  // Init audio and play menu BGM on first interaction anywhere
  function firstInteraction() {
    AudioController.init();
    if(screens.start.classList.contains('active')) {
      AudioController.playMenuBGM();
    }
  }
  document.body.addEventListener('click', firstInteraction, {once:true});
  document.body.addEventListener('keydown', firstInteraction, {once:true});


  // ---------- State ----------
  let gameMode = '1p'; // '1p' or '2p'
  let level = null;
  let raceOver = true;
  let isCountdown = false;
  let p1Name = "Kamu";
  let p2Name = "Pemain 2";
  let pendingLevel = null;
  
  const state = {
    p1: { pos:0, score:0, streak:0, answer:null, isAnswering:false, bestStreak:0 },
    p2: { pos:0, score:0, streak:0, answer:null, isAnswering:false, bestStreak:0 },
    cpu1: { pos:0 },
    cpu2: { pos:0 }
  };

  let cpuTimer = null;
  const FINISH = 100;
  const LEVEL_LABELS = { easy:'Kelas 1-2', medium:'Kelas 3-4', hard:'Kelas 5-6' };

  // Controls map for 2P mode
  // P1 uses Q W A S
  const KEY_MAP_P1 = { 'q':0, 'w':1, 'a':2, 's':3 };
  const LABELS_P1 = ['Q', 'W', 'A', 'S'];
  
  // P2 uses ArrowUp, ArrowRight, ArrowLeft, ArrowDown
  const KEY_MAP_P2 = { 'arrowup':0, 'arrowright':1, 'arrowleft':2, 'arrowdown':3 };
  const LABELS_P2 = ['↑', '→', '←', '↓'];

  // ---------- UI Elements ----------
  const screens = {
    start: document.getElementById('screen-start'),
    name: document.getElementById('screen-name'),
    game: document.getElementById('screen-game'),
    end: document.getElementById('screen-end')
  };

  // Track & Cars
  const laneP2 = document.getElementById('laneP2');
  const laneCPU2 = document.getElementById('laneCPU2');
  const carP1 = document.getElementById('carP1');
  const carP2 = document.getElementById('carP2');
  const carCPU2 = document.getElementById('carCPU2');
  const laneLabelP1 = document.getElementById('laneLabelP1');
  const laneLabelP2 = document.getElementById('laneLabelP2');

  // Panels
  const panelsContainer = document.getElementById('panelsContainer');
  const panelP2 = document.getElementById('panelP2');
  const panelP1 = document.getElementById('panelP1');

  // Question Elements
  const qTextP1 = document.getElementById('questionTextP1');
  const gridP1 = document.getElementById('answersGridP1');
  const fbP1 = document.getElementById('feedbackTextP1');
  
  const qTextP2 = document.getElementById('questionTextP2');
  const gridP2 = document.getElementById('answersGridP2');
  const fbP2 = document.getElementById('feedbackTextP2');

  // HUD
  const scoreP1El = document.getElementById('scoreP1');
  const streakP1El = document.getElementById('streakP1');
  const hudP2 = document.getElementById('hudP2');
  const hudStreakP2 = document.getElementById('hudStreakP2');
  const scoreP2El = document.getElementById('scoreP2');
  const streakP2El = document.getElementById('streakP2');
  const levelValue = document.getElementById('levelValue');
  
  // Best score
  const bestScoreBox = document.getElementById('bestScoreBox');

  // Countdown
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownText = document.getElementById('countdownText');


  // ---------- Storage (best score per level for 1P) ----------
  function getBestScore(lvl){
    try{
      const raw = localStorage.getItem('balapAngka_best_' + lvl);
      return raw ? parseInt(raw,10) : 0;
    }catch(e){ return 0; }
  }
  function setBestScore(lvl, val){
    try{ localStorage.setItem('balapAngka_best_' + lvl, String(val)); }catch(e){}
  }
  function renderBestScores(){
    try{
      const parts = ['easy','medium','hard'].map(lvl => {
        const b = getBestScore(lvl);
        return b > 0 ? (LEVEL_LABELS[lvl] + ': ' + b) : null;
      }).filter(Boolean);
      
      if(parts.length){
        bestScoreBox.innerHTML = '<div class="best-score">🏅 Rekor (1P) — ' + parts.join(' &nbsp;|&nbsp; ') + '</div>';
      } else {
        bestScoreBox.innerHTML = '';
      }
    }catch(e){ bestScoreBox.innerHTML = ''; }
  }

  // ---------- Math Generator ----------
  function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }

  function generateQuestion(lvl){
    let a, b, op, answer, text;
    if(lvl === 'easy'){
      op = Math.random() < 0.5 ? '+' : '-';
      if(op === '+'){
        a = randInt(1,15); b = randInt(1,15); answer = a + b;
      } else {
        a = randInt(5,20); b = randInt(1,a); answer = a - b;
      }
      text = a + ' ' + op + ' ' + b;
    } else if(lvl === 'medium'){
      op = Math.random() < 0.5 ? '×' : '÷';
      if(op === '×'){
        a = randInt(2,10); b = randInt(2,10); answer = a * b;
      } else {
        b = randInt(2,10); answer = randInt(2,10); a = b * answer;
      }
      text = a + ' × ' + b;
      if (op === '÷') text = a + ' ÷ ' + b;
    } else {
      const ops = ['+','-','×','÷'];
      op = ops[randInt(0,3)];
      if(op === '+'){ a = randInt(10,50); b = randInt(10,50); answer = a+b; }
      else if(op === '-'){ a = randInt(20,60); b = randInt(1,a); answer = a-b; }
      else if(op === '×'){ a = randInt(2,12); b = randInt(2,12); answer = a*b; }
      else { b = randInt(2,12); answer = randInt(2,12); a = b*answer; }
      text = a + ' ' + op + ' ' + b;
    }
    return { text: text + ' = ?', answer: answer };
  }

  function generateChoices(correct){
    const choices = new Set([correct]);
    let range = 6;
    while(choices.size < 4){
      const delta = randInt(-range, range);
      const candidate = correct + delta;
      if(candidate !== correct && candidate >= 0) {
        choices.add(candidate);
      }
      // Expand range if we're stuck trying to find positive numbers for 0 or small answers
      if (delta === 0) range++; 
    }
    return shuffle(Array.from(choices));
  }

  function shuffle(arr){
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- Visual Effects ----------
  function spawnSmoke(laneEl, carEl){
    const smoke = document.createElement('div');
    smoke.className = 'smoke';
    // position relative to car
    const carLeft = parseFloat(carEl.style.left) || 0;
    smoke.style.left = `calc(${carLeft}% - 25px)`;
    smoke.style.top = '50%';
    smoke.style.transform = 'translateY(-50%)';
    laneEl.appendChild(smoke);
    setTimeout(() => { if(smoke.parentNode) smoke.parentNode.removeChild(smoke); }, 600);
  }

  function triggerConfetti(){
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';
    const colors = ['#FFC93C', '#FF6B6B', '#4FA8D8', '#8BC34A', '#FFFFFF'];
    for(let i=0; i<80; i++){
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.top = -20 + 'px';
      c.style.background = colors[Math.random()*colors.length|0];
      c.style.animationDuration = (Math.random() * 2 + 2) + 's';
      c.style.animationDelay = (Math.random() * 1) + 's';
      container.appendChild(c);
    }
    setTimeout(() => { container.innerHTML = ''; }, 4000);
  }

  // ---------- Question Rendering ----------
  function renderQuestionFor(playerKey){
    if(raceOver || isCountdown) return;
    const playerState = state[playerKey];
    playerState.isAnswering = false;
    
    const q = generateQuestion(level);
    playerState.answer = q.answer;
    
    const qText = playerKey === 'p1' ? qTextP1 : qTextP2;
    const grid = playerKey === 'p1' ? gridP1 : gridP2;
    const fb = playerKey === 'p1' ? fbP1 : fbP2;
    const labels = playerKey === 'p1' ? LABELS_P1 : LABELS_P2;
    
    qText.textContent = q.text;
    fb.textContent = '';
    fb.className = 'feedback';
    
    const choices = generateChoices(q.answer);
    grid.innerHTML = '';
    
    choices.forEach((choice, index) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.innerHTML = `<span class="key-label">${gameMode==='2p' ? labels[index] : (index+1)}</span>${choice}`;
      btn.dataset.index = index;
      
      btn.addEventListener('click', () => {
        if(gameMode === '1p') handleAnswerClick(playerKey, choice, index);
      });
      grid.appendChild(btn);
    });
  }

  function handleAnswerClick(playerKey, choice, btnIndex){
    if(raceOver || isCountdown) return;
    const playerState = state[playerKey];
    if(playerState.isAnswering) return;
    
    playerState.isAnswering = true;
    const grid = playerKey === 'p1' ? gridP1 : gridP2;
    const fb = playerKey === 'p1' ? fbP1 : fbP2;
    const panel = playerKey === 'p1' ? panelP1 : panelP2;
    
    const allBtns = grid.querySelectorAll('.answer-btn');
    allBtns.forEach(b => b.disabled = true);
    
    const btnEl = allBtns[btnIndex];

    if(choice === playerState.answer){
      btnEl.classList.add('correct');
      playerState.score++;
      playerState.streak++;
      if(playerState.streak > playerState.bestStreak) playerState.bestStreak = playerState.streak;
      
      const boost = 10 + Math.min(playerState.streak, 5) * 2;
      moveRacer(playerKey, boost);
      
      fb.textContent = 'Benar! 🚀';
      fb.className = 'feedback ok';
      
      AudioController.playCorrect();
      AudioController.playBoost();
      
      if(playerKey === 'p1') spawnSmoke(document.getElementById('laneP1'), carP1);
      else spawnSmoke(document.getElementById('laneP2'), carP2);

    } else {
      btnEl.classList.add('wrong');
      allBtns.forEach(b => {
        // Find the correct button by parsing text content (ignoring the span)
        if(parseInt(b.childNodes[1].nodeValue, 10) === playerState.answer){
           b.classList.add('correct');
        }
      });
      
      playerState.streak = 0;
      moveRacer(playerKey, 2);
      
      fb.textContent = 'Salah: ' + playerState.answer;
      fb.className = 'feedback bad';
      
      panel.classList.remove('shake');
      void panel.offsetWidth; // trigger reflow
      panel.classList.add('shake');
      
      AudioController.playWrong();
    }
    updateHud();
    
    setTimeout(() => {
      if(!raceOver && !isCountdown) renderQuestionFor(playerKey);
    }, 900);
  }

  // ---------- Movement & Win Condition ----------
  function moveRacer(who, amount){
    state[who].pos = Math.min(FINISH, state[who].pos + amount);
    
    if(who === 'p1') carP1.style.left = state[who].pos + '%';
    else if(who === 'p2') carP2.style.left = state[who].pos + '%';
    else if(who === 'cpu1') carP2.style.left = state[who].pos + '%'; // CPU1 uses carP2
    else if(who === 'cpu2') carCPU2.style.left = state[who].pos + '%';
    
    checkFinish();
  }

  function moveCpus(){
    if(raceOver || isCountdown) return;
    if(gameMode === '1p'){
      moveRacer('cpu1', randInt(2,6));
      moveRacer('cpu2', randInt(2,6));
    }
  }

  function checkFinish(){
    if(raceOver) return;
    if(gameMode === '1p'){
      if(state.p1.pos >= FINISH) endRace('p1');
      else if(state.cpu1.pos >= FINISH) endRace('cpu1');
      else if(state.cpu2.pos >= FINISH) endRace('cpu2');
    } else {
      if(state.p1.pos >= FINISH && state.p2.pos >= FINISH){
        // Tie break? Highly unlikely due to JS single thread but possible
        endRace('tie');
      }
      else if(state.p1.pos >= FINISH) endRace('p1');
      else if(state.p2.pos >= FINISH) endRace('p2');
    }
  }

  function updateHud(){
    scoreP1El.textContent = state.p1.score;
    streakP1El.textContent = state.p1.streak;
    if(gameMode === '2p'){
      scoreP2El.textContent = state.p2.score;
      streakP2El.textContent = state.p2.streak;
    }
  }

  // ---------- Keyboard Handling ----------
  document.addEventListener('keydown', function(e){
    if(raceOver || isCountdown || gameMode !== '2p') return;
    const key = e.key.toLowerCase();
    
    // Check P1 (QWAS)
    if(key in KEY_MAP_P1 && !state.p1.isAnswering){
      const index = KEY_MAP_P1[key];
      const btn = gridP1.querySelectorAll('.answer-btn')[index];
      if(btn){
        btn.classList.add('pressed');
        const choice = parseInt(btn.childNodes[1].nodeValue, 10);
        handleAnswerClick('p1', choice, index);
      }
    }
    
    // Check P2 (Arrows)
    if(key in KEY_MAP_P2 && !state.p2.isAnswering){
      // Prevent default scrolling for arrows
      if(key.startsWith('arrow')) e.preventDefault();
      const index = KEY_MAP_P2[key];
      const btn = gridP2.querySelectorAll('.answer-btn')[index];
      if(btn){
        btn.classList.add('pressed');
        const choice = parseInt(btn.childNodes[1].nodeValue, 10);
        handleAnswerClick('p2', choice, index);
      }
    }
  });


  // ---------- Race Lifecycle ----------
  function startCountdown(){
    isCountdown = true;
    countdownOverlay.style.display = 'flex';
    
    let count = 3;
    countdownText.textContent = count;
    
    function tick(){
      if(count > 0){
        countdownText.textContent = count;
        countdownText.style.animation = 'none';
        void countdownText.offsetWidth;
        countdownText.style.animation = 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
        AudioController.playBeep();
        count--;
        setTimeout(tick, 1000);
      } else {
        countdownText.textContent = 'GO!';
        countdownText.style.animation = 'none';
        void countdownText.offsetWidth;
        countdownText.style.animation = 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
        AudioController.playGo();
        AudioController.playRaceBGM();
        setTimeout(() => {
          countdownOverlay.style.display = 'none';
          isCountdown = false;
          renderQuestionFor('p1');
          if(gameMode === '2p') renderQuestionFor('p2');
          
          if(gameMode === '1p'){
            if(cpuTimer) clearInterval(cpuTimer);
            cpuTimer = setInterval(moveCpus, 1100);
          }
        }, 800);
      }
    }
    tick();
  }

  function startRace(mode, lvl){
    AudioController.playClick();
    gameMode = mode;
    level = lvl;
    
    // Reset state
    raceOver = false;
    isCountdown = false;
    state.p1 = { pos:0, score:0, streak:0, answer:null, isAnswering:false, bestStreak:0 };
    state.p2 = { pos:0, score:0, streak:0, answer:null, isAnswering:false, bestStreak:0 };
    state.cpu1 = { pos:0 };
    state.cpu2 = { pos:0 };
    
    carP1.style.left = '0%';
    carP2.style.left = '0%';
    carCPU2.style.left = '0%';
    
    levelValue.textContent = LEVEL_LABELS[lvl];
    
    if(gameMode === '1p'){
      p1Name = "Kamu";
      laneLabelP1.textContent = p1Name.toUpperCase();
      laneLabelP2.textContent = 'CPU 1';
      laneCPU2.style.display = 'block';
      panelsContainer.classList.remove('two-player');
      panelP2.style.display = 'none';
      hudP2.style.display = 'none';
      hudStreakP2.style.display = 'none';
      document.getElementById('hudLabelP1').textContent = 'Skor';
      document.getElementById('labelPanelP1').textContent = 'Pertanyaan';
      // Hide key labels in 1P mode using CSS rule injection or JS logic inside renderQuestionFor
    } else {
      laneLabelP1.textContent = p1Name.toUpperCase();
      laneLabelP2.textContent = p2Name.toUpperCase();
      laneCPU2.style.display = 'none';
      panelsContainer.classList.add('two-player');
      panelP2.style.display = 'block';
      hudP2.style.display = 'block';
      hudStreakP2.style.display = 'block';
      document.getElementById('hudLabelP1').textContent = `Skor ${p1Name}`;
      document.getElementById('labelPanelP1').textContent = p1Name;
      document.getElementById('hudP2').querySelector('.label').textContent = `Skor ${p2Name}`;
      document.getElementById('panelP2').querySelector('.panel-label').textContent = p2Name;
    }
    
    updateHud();
    showScreen('game');
    
    // Clear panels
    qTextP1.textContent = '?'; gridP1.innerHTML = ''; fbP1.textContent = '';
    qTextP2.textContent = '?'; gridP2.innerHTML = ''; fbP2.textContent = '';
    
    startCountdown();
  }

  function endRace(winner){
    raceOver = true;
    AudioController.stopBGM();
    if(cpuTimer) clearInterval(cpuTimer);

    const endEmoji = document.getElementById('endEmoji');
    const endTitle = document.getElementById('endTitle');
    const endSubtitle = document.getElementById('endSubtitle');
    const statsContainer = document.getElementById('endStatsContainer');

    statsContainer.innerHTML = '';

    if(gameMode === '1p'){
      if(winner === 'p1'){
        endEmoji.textContent = '🏆';
        endTitle.textContent = 'Kamu Menang!';
        endSubtitle.textContent = 'Kerja bagus, kamu jago matematika!';
        AudioController.playWin();
        triggerConfetti();
        const best = getBestScore(level);
        if(state.p1.score > best) setBestScore(level, state.p1.score);
      } else {
        endEmoji.textContent = '💪';
        endTitle.textContent = 'Hampir Menang!';
        endSubtitle.textContent = 'Ayo coba lagi, kamu pasti bisa menang!';
        AudioController.playLose();
      }
      
      statsContainer.innerHTML = `
        <div class="end-stat"><div class="num">${state.p1.score}</div><div class="lab">Benar</div></div>
        <div class="end-stat"><div class="num">${state.p1.bestStreak}</div><div class="lab">Beruntun</div></div>
      `;
    } else {
      // 2P Mode
      if(winner === 'p1'){
        endEmoji.textContent = '🥇';
        endTitle.textContent = `${p1Name} Menang!`;
        endSubtitle.textContent = `Selamat untuk ${p1Name}!`;
        AudioController.playWin();
        triggerConfetti();
      } else if(winner === 'p2') {
        endEmoji.textContent = '🥇';
        endTitle.textContent = `${p2Name} Menang!`;
        endSubtitle.textContent = `Selamat untuk ${p2Name}!`;
        AudioController.playWin();
        triggerConfetti();
      } else {
        endEmoji.textContent = '🤝';
        endTitle.textContent = 'Seri!';
        endSubtitle.textContent = 'Kalian berdua hebat!';
        AudioController.playWin();
      }
      
      statsContainer.innerHTML = `
        <div class="end-stat" style="background:#EAF6FF; border-color:var(--player1-color);">
          <div class="num" style="color:var(--player1-color)">${state.p1.score}</div><div class="lab">Benar ${p1Name}</div>
        </div>
        <div class="end-stat" style="background:#FFF3E0; border-color:var(--player2-color);">
          <div class="num" style="color:var(--player2-color)">${state.p2.score}</div><div class="lab">Benar ${p2Name}</div>
        </div>
      `;
    }

    setTimeout(() => { showScreen('end'); }, 1000);
  }

  function showScreen(name){
    Object.keys(screens).forEach(key => {
      screens[key].classList.toggle('active', key === name);
    });
    if(name === 'start') renderBestScores();
  }

  // ---------- Init Events ----------
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      AudioController.init();
      const mode = btn.getAttribute('data-mode');
      const lvl = btn.getAttribute('data-level');
      if (mode === '2p') {
        pendingLevel = lvl;
        document.getElementById('inputNameP1').value = '';
        document.getElementById('inputNameP2').value = '';
        showScreen('name');
      } else {
        startRace(mode, lvl);
      }
    });
  });
  
  document.getElementById('start2PBtn').addEventListener('click', function(){
    AudioController.playClick();
    p1Name = document.getElementById('inputNameP1').value.trim() || 'Pembalap Kiri';
    p2Name = document.getElementById('inputNameP2').value.trim() || 'Pembalap Kanan';
    startRace('2p', pendingLevel);
  });
  
  document.getElementById('cancelNameBtn').addEventListener('click', function(){
    AudioController.playClick();
    showScreen('start');
  });
  
  document.getElementById('playAgainBtn').addEventListener('click', function(){
    AudioController.playClick();
    startRace(gameMode, level);
  });
  
  document.getElementById('changeLevelBtn').addEventListener('click', function(){
    AudioController.playClick();
    showScreen('start');
    AudioController.playMenuBGM();
  });

  // Init
  renderBestScores();
})();
