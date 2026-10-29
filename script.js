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
  let selectedMode = '1p';
  let selectedClass = 'k1'; // 'k1', 'k2', 'k3', 'k4'
  let selectedDifficulty = 'easy'; // 'easy', 'medium', 'hard'
  let raceOver = true;
  let isCountdown = false;
  let p1Name = "Kamu";
  let p2Name = "Pemain 2";
  let pendingDifficulty = 'easy';
  
  const state = {
    p1: { pos:0, score:0, streak:0, answer:null, isAnswering:false, bestStreak:0 },
    p2: { pos:0, score:0, streak:0, answer:null, isAnswering:false, bestStreak:0 },
    cpu1: { pos:0 },
    cpu2: { pos:0 }
  };

  let cpuTimer = null;
  const FINISH = 100;

  const CLASS_TITLES = {
    k1: '🟢 Kelas 1 SD',
    k2: '🟡 Kelas 2 SD',
    k3: '🔴 Kelas 3 SD',
    k4: '🟣 Campuran (1-3)'
  };

  const CLASS_SHORT = {
    k1: 'Kelas 1',
    k2: 'Kelas 2',
    k3: 'Kelas 3',
    k4: 'Campuran'
  };

  const DIFF_TITLES = {
    easy: 'Mudah',
    medium: 'Sedang',
    hard: 'Sulit'
  };

  const DIFF_SUBTITLES = {
    k1: {
      easy: 'Hitung 1-10 & nilai tempat',
      medium: 'Hitung s.d 20 & nilai tempat',
      hard: 'Operasi 2 digit tanpa simpan/pinjam'
    },
    k2: {
      easy: 'Simpan/pinjam 2 digit & kali/bagi 2',
      medium: 'Kali & bagi 1-5 (maks 50)',
      hard: 'Simpan/pinjam 3 digit (ratusan)'
    },
    k3: {
      easy: 'Otomatisasi perkalian 1-10',
      medium: 'Perkalian bersusun & porogapit 2 digit',
      hard: 'Pecahan sederhana (penyebut sama)'
    },
    k4: {
      easy: 'Soal mudah Kelas 1, 2, dan 3',
      medium: 'Soal sedang Kelas 1, 2, dan 3',
      hard: 'Soal sulit Kelas 1, 2, dan 3'
    }
  };

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
    difficulty: document.getElementById('screen-difficulty'),
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

  // Difficulty screen elements
  const diffClassBadge = document.getElementById('diffClassBadge');
  const diffSubtitle = document.getElementById('diffSubtitle');
  const diffDescEasy = document.getElementById('diffDescEasy');
  const diffDescMedium = document.getElementById('diffDescMedium');
  const diffDescHard = document.getElementById('diffDescHard');
  const diffBestScoreBox = document.getElementById('diffBestScoreBox');

  // Countdown
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownText = document.getElementById('countdownText');


  // ---------- Storage (best score per class and difficulty for 1P) ----------
  function getBestScore(cls, diff){
    try{
      const raw = localStorage.getItem(`balapAngka_best_${cls}_${diff}`);
      return raw ? parseInt(raw,10) : 0;
    }catch(e){ return 0; }
  }
  function setBestScore(cls, diff, val){
    try{ localStorage.setItem(`balapAngka_best_${cls}_${diff}`, String(val)); }catch(e){}
  }
  function renderBestScores(){
    try{
      const parts = ['k1','k2','k3','k4'].map(cls => {
        const best = Math.max(
          getBestScore(cls, 'easy'),
          getBestScore(cls, 'medium'),
          getBestScore(cls, 'hard')
        );
        return best > 0 ? (`${CLASS_SHORT[cls]}: ${best}`) : null;
      }).filter(Boolean);

      if(parts.length){
        bestScoreBox.innerHTML = '<div class="best-score">🏅 Rekor Tertinggi (1P) — ' + parts.join(' &nbsp;|&nbsp; ') + '</div>';
      } else {
        bestScoreBox.innerHTML = '';
      }
    }catch(e){ bestScoreBox.innerHTML = ''; }
  }

  // ---------- Math Helpers & Generators ----------
  function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }

  function shuffle(arr){
    const copy = [...arr];
    for(let i = copy.length - 1; i > 0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function normalizeChoice(c){
    if(typeof c === 'object' && c !== null && c.val !== undefined){
      return c;
    }
    return {
      val: c,
      displayHtml: String(c),
      displayText: String(c)
    };
  }

  function generateNumberChoices(correct, minVal = 0, rangeStep = 1, maxVal = Infinity){
    const choices = new Set([correct]);
    let range = Math.max(4, Math.floor(Math.abs(correct) * 0.25));
    let attempts = 0;
    while(choices.size < 4 && attempts < 80){
      attempts++;
      const delta = randInt(-range, range) * rangeStep;
      const cand = correct + delta;
      if(cand !== correct && cand >= minVal && cand <= maxVal){
        choices.add(cand);
      }
      if(delta === 0 || attempts % 8 === 0) range += 2;
    }
    let step = 1;
    while(choices.size < 4){
      const candDown = correct - step;
      const candUp = correct + step;
      if(candDown >= minVal && !choices.has(candDown)){
        choices.add(candDown);
      } else if(candUp <= maxVal && !choices.has(candUp)){
        choices.add(candUp);
      }
      step++;
    }
    return shuffle(Array.from(choices).map(c => normalizeChoice(c)));
  }

  function generateFractionChoices(ansN, d){
    const choices = [];
    const correctVal = `${ansN}/${d}`;
    choices.push({
      val: correctVal,
      displayHtml: `<span class="frac"><span class="top">${ansN}</span><span class="bottom">${d}</span></span>`,
      displayText: correctVal
    });

    const usedValues = new Set([correctVal]);

    // Common misconception trap: ansN / (d * 2) (e.g. 2/5 + 1/5 = 3/10)
    if(d * 2 <= 20){
      const trapVal = `${ansN}/${d * 2}`;
      if(!usedValues.has(trapVal)){
        usedValues.add(trapVal);
        choices.push({
          val: trapVal,
          displayHtml: `<span class="frac"><span class="top">${ansN}</span><span class="bottom">${d * 2}</span></span>`,
          displayText: trapVal
        });
      }
    }

    const candNumerators = [];
    for(let i = 1; i <= d + 2; i++){
      if(i !== ansN) candNumerators.push(i);
    }
    shuffle(candNumerators);

    for(const n of candNumerators){
      if(choices.length >= 4) break;
      const val = `${n}/${d}`;
      if(!usedValues.has(val)){
        usedValues.add(val);
        choices.push({
          val: val,
          displayHtml: `<span class="frac"><span class="top">${n}</span><span class="bottom">${d}</span></span>`,
          displayText: val
        });
      }
    }

    let extra = 1;
    while(choices.length < 4){
      const n = ansN + extra;
      const val = `${n}/${d}`;
      if(!usedValues.has(val)){
        usedValues.add(val);
        choices.push({
          val: val,
          displayHtml: `<span class="frac"><span class="top">${n}</span><span class="bottom">${d}</span></span>`,
          displayText: val
        });
      }
      extra++;
    }

    return shuffle(choices);
  }

  function makeUniqueChoices(correct, candidates, fallbackGen){
    const set = new Set([correct]);
    const list = [correct];
    for(const c of candidates){
      if(!set.has(c) && list.length < 4){
        set.add(c);
        list.push(c);
      }
    }
    while(list.length < 4){
      const f = fallbackGen();
      if(!set.has(f)){
        set.add(f);
        list.push(f);
      }
    }
    return shuffle(list.map(c => normalizeChoice(c)));
  }

  // ---------- KELAS 1 SD (Mudah, Sedang, Sulit) ----------
  // - Bilangan cacah 0 - 100
  // - Penjumlahan & pengurangan dasar (hasil maksimal 20)
  // - Penjumlahan & pengurangan dua digit (tanpa menyimpan/meminjam)
  // - Logika nilai tempat (puluhan & satuan)
  function generateQuestionK1(diff){
    if(diff === 'easy'){
      // MUDAH:
      // 50% hitung dasar kecil hasil <= 10
      // 50% tebak nilai tempat langsung
      if(Math.random() < 0.5){
        const isAdd = Math.random() < 0.5;
        if(isAdd){
          const a = randInt(1, 8);
          const b = randInt(1, 10 - a);
          const ans = a + b;
          return {
            text: `${a} + ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 0, 1, 10)
          };
        } else {
          const a = randInt(2, 10);
          const b = randInt(1, a - 1);
          const ans = a - b;
          return {
            text: `${a} - ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 0, 1, 10)
          };
        }
      } else {
        const p = randInt(1, 9);
        let s = randInt(0, 9);
        if(s === p) s = (p % 9) + 1;
        const num = p * 10 + s;
        const askTens = Math.random() < 0.5;
        if(askTens){
          return {
            text: `Angka puluhan dari ${num} adalah?`,
            answer: p,
            choices: makeUniqueChoices(p, [s, p * 10, num], () => randInt(1, 9))
          };
        } else {
          return {
            text: `Angka satuan dari ${num} adalah?`,
            answer: s,
            choices: makeUniqueChoices(s, [p, s * 10, num], () => randInt(0, 9))
          };
        }
      }
    } else if(diff === 'medium'){
      // SEDANG:
      // 50% hitung dasar hasil maksimal 20 (contoh: 8 + 7 = 15; 19 - 6 = 13)
      // 50% dekomposisi nilai tempat (57 = ... puluhan + 7 satuan)
      if(Math.random() < 0.5){
        const isAdd = Math.random() < 0.5;
        if(isAdd){
          const a = randInt(1, 14);
          const b = randInt(1, 20 - a);
          const ans = a + b;
          return {
            text: `${a} + ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 0, 1, 20)
          };
        } else {
          const a = randInt(4, 20);
          const b = randInt(1, a - 1);
          const ans = a - b;
          return {
            text: `${a} - ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 0, 1, 20)
          };
        }
      } else {
        const p = randInt(1, 9);
        let s = randInt(0, 9);
        if(s === p) s = (p % 9) + 1;
        const num = p * 10 + s;
        const v = randInt(1, 3);
        if(v === 1){
          return {
            text: `Angka ${num} = ... puluhan + ${s} satuan`,
            answer: p,
            choices: makeUniqueChoices(p, [s, p * 10, (p + 1) % 10 || 1], () => randInt(1, 9))
          };
        } else if(v === 2){
          return {
            text: `Angka ${num} = ${p} puluhan + ... satuan`,
            answer: s,
            choices: makeUniqueChoices(s, [p, s * 10, (s + 2) % 10], () => randInt(0, 9))
          };
        } else {
          return {
            text: `${p} puluhan + ${s} satuan = ?`,
            answer: num,
            choices: makeUniqueChoices(num, [s * 10 + p, p * 10, s * 10 || (num + 10)], () => randInt(11, 99))
          };
        }
      }
    } else {
      // SULIT:
      // Operasi dua digit tanpa menyimpan/meminjam (0 - 100, contoh: 23 + 14 = 37; 45 - 12 = 33)
      const isAdd = Math.random() < 0.55;
      if(isAdd){
        const p1 = randInt(1, 7);
        const p2 = randInt(1, 9 - p1);
        const s1 = randInt(1, 8);
        const s2 = randInt(0, 9 - s1);
        const a = p1 * 10 + s1;
        const b = p2 * 10 + s2;
        const ans = a + b;
        return {
          text: `${a} + ${b} = ?`,
          answer: ans,
          choices: generateNumberChoices(ans, 10, 1, 100)
        };
      } else {
        const p1 = randInt(2, 9);
        const p2 = randInt(1, p1 - 1);
        const s1 = randInt(1, 9);
        const s2 = randInt(0, s1);
        const a = p1 * 10 + s1;
        const b = p2 * 10 + s2;
        const ans = a - b;
        return {
          text: `${a} - ${b} = ?`,
          answer: ans,
          choices: generateNumberChoices(ans, 0, 1, 100)
        };
      }
    }
  }

  // ---------- KELAS 2 SD (Mudah, Sedang, Sulit) ----------
  // - Bilangan cacah 0 - 999
  // - Penjumlahan teknik menyimpan (hasil satuan > 9)
  // - Pengurangan teknik meminjam (satuan atas < bawah)
  // - Perkalian dasar 1 - 5 (hasil maksimal 50, konsep penjumlahan berulang)
  // - Pembagian dasar habis dibagi 1 - 5
  function generateQuestionK2(diff){
    if(diff === 'easy'){
      // MUDAH:
      // 50% simpan/pinjam 2 digit dasar (angka kecil <= 45)
      // 25% perkalian 1 & 2 (konsep penjumlahan berulang)
      // 25% pembagian dasar 2 & 3
      const r = Math.random();
      if(r < 0.5){
        const isAdd = Math.random() < 0.5;
        if(isAdd){
          const s1 = randInt(2, 9);
          const s2 = randInt(10 - s1, 9);
          const a = randInt(1, 3) * 10 + s1;
          const b = randInt(0, 2) * 10 + s2;
          const ans = a + b;
          return {
            text: `${a} + ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 10, 1, 70)
          };
        } else {
          const s2 = randInt(3, 9);
          const s1 = randInt(0, s2 - 1);
          const a = randInt(2, 5) * 10 + s1;
          const b = randInt(0, Math.floor(a/10) - 1) * 10 + s2;
          const ans = a - b;
          return {
            text: `${a} - ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 0, 1, 60)
          };
        }
      } else if(r < 0.75){
        const a = randInt(1, 2);
        const b = randInt(1, 10);
        const ans = a * b;
        const text = a > 1 && Math.random() < 0.5
          ? `${a} × ${b} = ${Array(a).fill(b).join(' + ')} = ?`
          : `${a} × ${b} = ?`;
        return {
          text: text,
          answer: ans,
          choices: generateNumberChoices(ans, 1, 1, 25)
        };
      } else {
        const b = randInt(2, 3);
        const q = randInt(1, 8);
        const a = b * q;
        return {
          text: `${a} ÷ ${b} = ?`,
          answer: q,
          choices: generateNumberChoices(q, 1, 1, 10)
        };
      }
    } else if(diff === 'medium'){
      // SEDANG:
      // 30% simpan/pinjam 2 digit lebih variatif (hasil s.d. 100)
      // 40% perkalian 1-5 (hasil maksimal 50, konsep berulang)
      // 30% pembagian dasar habis dibagi 1-5
      const r = Math.random();
      if(r < 0.3){
        const isAdd = Math.random() < 0.5;
        if(isAdd){
          const s1 = randInt(2, 9);
          const s2 = randInt(10 - s1, 9);
          const a = randInt(2, 6) * 10 + s1;
          const b = randInt(1, 8 - Math.floor(a/10)) * 10 + s2;
          const ans = a + b;
          return {
            text: `${a} + ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 10, 1, 100)
          };
        } else {
          const s2 = randInt(3, 9);
          const s1 = randInt(0, s2 - 1);
          const a = randInt(4, 9) * 10 + s1;
          const b = randInt(1, Math.floor(a/10) - 1) * 10 + s2;
          const ans = a - b;
          return {
            text: `${a} - ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 0, 1, 100)
          };
        }
      } else if(r < 0.7){
        const a = randInt(1, 5);
        const b = randInt(1, 10);
        const ans = a * b;
        const text = a > 1 && Math.random() < 0.35
          ? `${a} × ${b} = ${Array(a).fill(b).join(' + ')} = ?`
          : `${a} × ${b} = ?`;
        return {
          text: text,
          answer: ans,
          choices: generateNumberChoices(ans, 1, 1, 50)
        };
      } else {
        const b = randInt(2, 5);
        const q = randInt(1, 10);
        const a = b * q;
        return {
          text: `${a} ÷ ${b} = ?`,
          answer: q,
          choices: generateNumberChoices(q, 1, 1, 10)
        };
      }
    } else {
      // SULIT:
      // 50% simpan/pinjam ratusan 3 digit (contoh: 148 + 25 = 173; 215 - 38 = 177)
      // 50% perkalian & pembagian 1-5 cepat
      if(Math.random() < 0.5){
        const isAdd = Math.random() < 0.5;
        if(isAdd){
          const s1 = randInt(2, 9);
          const s2 = randInt(10 - s1, 9);
          const h1 = randInt(1, 6);
          const p1 = randInt(0, 8);
          const a = h1 * 100 + p1 * 10 + s1;
          const b = randInt(1, 24) * 10 + s2;
          const ans = a + b;
          return {
            text: `${a} + ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 10, 1, 999)
          };
        } else {
          const s2 = randInt(3, 9);
          const s1 = randInt(0, s2 - 1);
          const a = randInt(12, 75) * 10 + s1;
          const maxTensB = Math.min(25, Math.floor(a / 10) - 2);
          const b = randInt(1, Math.max(1, maxTensB)) * 10 + s2;
          const ans = a - b;
          return {
            text: `${a} - ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 0, 1, 999)
          };
        }
      } else {
        const isMult = Math.random() < 0.5;
        if(isMult){
          const a = randInt(2, 5);
          const b = randInt(4, 10);
          const ans = a * b;
          return {
            text: `${a} × ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 1, 1, 50)
          };
        } else {
          const b = randInt(2, 5);
          const q = randInt(4, 10);
          const a = b * q;
          return {
            text: `${a} ÷ ${b} = ?`,
            answer: q,
            choices: generateNumberChoices(q, 1, 1, 10)
          };
        }
      }
    }
  }

  // ---------- KELAS 3 SD (Mudah, Sedang, Sulit) ----------
  // - Bilangan cacah 0 - 9.999
  // - Perkalian komplit (1 - 10)
  // - Perkalian 2 digit dengan 1 digit (bersusun)
  // - Pembagian 2 digit dengan 1 digit tanpa sisa (porogapit sederhana)
  // - Operasi hitung pecahan sederhana (penyebut sama)
  function generateQuestionK3(diff){
    if(diff === 'easy'){
      // MUDAH:
      // 100% Perkalian komplit (1 - 10), otomatisasi perkalian angka 1 sampai 10
      let a = randInt(6, 10);
      let b = randInt(2, 10);
      if(Math.random() < 0.5) [a, b] = [b, a];
      const ans = a * b;
      return {
        text: `${a} × ${b} = ?`,
        answer: ans,
        choices: generateNumberChoices(ans, 2, 1, 100)
      };
    } else if(diff === 'medium'){
      // SEDANG:
      // 50% perkalian bersusun 2 digit × 1 digit (contoh: 24 × 3 = 72)
      // 50% pembagian bersusun (porogapit sederhana) 2 digit ÷ 1 digit tanpa sisa (contoh: 72 ÷ 3 = 24)
      if(Math.random() < 0.5){
        const a = randInt(12, 45);
        const b = randInt(2, 8);
        const ans = a * b;
        return {
          text: `${a} × ${b} = ?`,
          answer: ans,
          choices: generateNumberChoices(ans, 10, 1, 400)
        };
      } else {
        const b = randInt(2, 7);
        const maxQ = Math.floor(99 / b);
        const minQ = 11;
        const q = randInt(minQ, Math.max(minQ, maxQ));
        const a = b * q;
        return {
          text: `${a} ÷ ${b} = ?`,
          answer: q,
          choices: generateNumberChoices(q, 10, 1, 99)
        };
      }
    } else {
      // SULIT:
      // 65% operasi hitung pecahan sederhana penyebut sama (contoh: 2/5 + 1/5 = 3/5)
      // 35% perkalian 2 digit & porogapit angka lebih besar
      if(Math.random() < 0.65){
        const d = randInt(3, 9);
        const isAdd = Math.random() < 0.5;
        if(isAdd){
          const n1 = randInt(1, Math.max(1, d - 2));
          const n2 = randInt(1, d - n1);
          const ansN = n1 + n2;
          const html = `<span class="frac"><span class="top">${n1}</span><span class="bottom">${d}</span></span> + <span class="frac"><span class="top">${n2}</span><span class="bottom">${d}</span></span> = ?`;
          const text = `${n1}/${d} + ${n2}/${d} = ?`;
          const ansVal = `${ansN}/${d}`;
          return {
            text: text,
            html: html,
            answer: ansVal,
            answerDisplay: ansVal,
            choices: generateFractionChoices(ansN, d)
          };
        } else {
          const n1 = randInt(2, d - 1);
          const n2 = randInt(1, n1 - 1);
          const ansN = n1 - n2;
          const html = `<span class="frac"><span class="top">${n1}</span><span class="bottom">${d}</span></span> - <span class="frac"><span class="top">${n2}</span><span class="bottom">${d}</span></span> = ?`;
          const text = `${n1}/${d} - ${n2}/${d} = ?`;
          const ansVal = `${ansN}/${d}`;
          return {
            text: text,
            html: html,
            answer: ansVal,
            answerDisplay: ansVal,
            choices: generateFractionChoices(ansN, d)
          };
        }
      } else {
        const isMult = Math.random() < 0.5;
        if(isMult){
          const a = randInt(18, 49);
          const b = randInt(3, 9);
          const ans = a * b;
          return {
            text: `${a} × ${b} = ?`,
            answer: ans,
            choices: generateNumberChoices(ans, 10, 1, 9999)
          };
        } else {
          const b = randInt(3, 8);
          const maxQ = Math.floor(99 / b);
          const q = randInt(12, Math.max(12, maxQ));
          const a = b * q;
          return {
            text: `${a} ÷ ${b} = ?`,
            answer: q,
            choices: generateNumberChoices(q, 10, 1, 99)
          };
        }
      }
    }
  }

  // ---------- Question Dispatcher ----------
  function generateQuestion(cls, diff){
    cls = cls || selectedClass;
    diff = diff || selectedDifficulty;
    if(cls === 'k1') return generateQuestionK1(diff);
    if(cls === 'k2') return generateQuestionK2(diff);
    if(cls === 'k3') return generateQuestionK3(diff);
    if(cls === 'k4'){
      const r = Math.random();
      if(r < 0.333) return generateQuestionK1(diff);
      if(r < 0.666) return generateQuestionK2(diff);
      return generateQuestionK3(diff);
    }
    return generateQuestionK1(diff);
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
    
    const q = generateQuestion(selectedClass, selectedDifficulty);
    playerState.answer = q.answer;
    playerState.answerDisplay = q.answerDisplay || (q.html ? q.text : String(q.answer));
    
    const qText = playerKey === 'p1' ? qTextP1 : qTextP2;
    const grid = playerKey === 'p1' ? gridP1 : gridP2;
    const fb = playerKey === 'p1' ? fbP1 : fbP2;
    const labels = playerKey === 'p1' ? LABELS_P1 : LABELS_P2;
    
    qText.innerHTML = q.html || q.text;
    fb.textContent = '';
    fb.className = 'feedback';
    
    const choices = q.choices ? q.choices.map(normalizeChoice) : generateNumberChoices(q.answer);
    playerState.choices = choices;
    grid.innerHTML = '';
    
    choices.forEach((choiceObj, index) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.innerHTML = `<span class="key-label">${gameMode==='2p' ? labels[index] : (index+1)}</span>${choiceObj.displayHtml}`;
      btn.dataset.index = index;
      
      btn.addEventListener('click', () => {
        if(gameMode === '1p') handleAnswerClick(playerKey, choiceObj.val, index);
      });
      grid.appendChild(btn);
    });
  }

  function handleAnswerClick(playerKey, choiceVal, btnIndex){
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

    if(choiceVal === playerState.answer){
      if(btnEl) btnEl.classList.add('correct');
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
      if(btnEl) btnEl.classList.add('wrong');
      allBtns.forEach((b, idx) => {
        if(playerState.choices && playerState.choices[idx] && playerState.choices[idx].val === playerState.answer){
          b.classList.add('correct');
        }
      });
      
      playerState.streak = 0;
      moveRacer(playerKey, 2);
      
      fb.textContent = 'Salah: ' + playerState.answerDisplay;
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
      let minMove = 2, maxMove = 5;
      if(selectedDifficulty === 'easy'){ minMove = 2; maxMove = 4; }
      else if(selectedDifficulty === 'hard'){ minMove = 3; maxMove = 5; }
      moveRacer('cpu1', randInt(minMove, maxMove));
      moveRacer('cpu2', randInt(minMove, maxMove));
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
    if(raceOver || isCountdown) return;
    const key = e.key.toLowerCase();
    
    // 1P Mode Keyboard Support (1, 2, 3, 4)
    if(gameMode === '1p'){
      const KEY_MAP_1P = { '1':0, '2':1, '3':2, '4':3, 'numpad1':0, 'numpad2':1, 'numpad3':2, 'numpad4':3 };
      const codeKey = e.code.toLowerCase();
      const idx = key in KEY_MAP_1P ? KEY_MAP_1P[key] : (codeKey in KEY_MAP_1P ? KEY_MAP_1P[codeKey] : null);
      if(idx !== null && !state.p1.isAnswering && state.p1.choices && state.p1.choices[idx]){
        const btn = gridP1.querySelectorAll('.answer-btn')[idx];
        if(btn) btn.classList.add('pressed');
        handleAnswerClick('p1', state.p1.choices[idx].val, idx);
      }
      return;
    }

    // 2P Mode
    // Check P1 (QWAS)
    if(key in KEY_MAP_P1 && !state.p1.isAnswering){
      const index = KEY_MAP_P1[key];
      if(state.p1.choices && state.p1.choices[index]){
        const btn = gridP1.querySelectorAll('.answer-btn')[index];
        if(btn){
          btn.classList.add('pressed');
          handleAnswerClick('p1', state.p1.choices[index].val, index);
        }
      }
    }
    
    // Check P2 (Arrows)
    if(key in KEY_MAP_P2 && !state.p2.isAnswering){
      if(key.startsWith('arrow')) e.preventDefault();
      const index = KEY_MAP_P2[key];
      if(state.p2.choices && state.p2.choices[index]){
        const btn = gridP2.querySelectorAll('.answer-btn')[index];
        if(btn){
          btn.classList.add('pressed');
          handleAnswerClick('p2', state.p2.choices[index].val, index);
        }
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
            let cpuInterval = 1250;
            if(selectedDifficulty === 'easy') cpuInterval = 1400;
            else if(selectedDifficulty === 'hard') cpuInterval = 1100;
            cpuTimer = setInterval(moveCpus, cpuInterval);
          }
        }, 800);
      }
    }
    tick();
  }

  function startRace(mode, cls, diff){
    AudioController.playClick();
    gameMode = mode;
    selectedMode = mode;
    selectedClass = cls || selectedClass;
    selectedDifficulty = diff || selectedDifficulty;
    
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
    
    levelValue.textContent = `${CLASS_SHORT[selectedClass]} • ${DIFF_TITLES[selectedDifficulty]}`;
    
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
        endSubtitle.textContent = `Kerja bagus di ${CLASS_SHORT[selectedClass]} (${DIFF_TITLES[selectedDifficulty]})!`;
        AudioController.playWin();
        triggerConfetti();
        const best = getBestScore(selectedClass, selectedDifficulty);
        if(state.p1.score > best) setBestScore(selectedClass, selectedDifficulty, state.p1.score);
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
    if(name === 'start'){
      renderBestScores();
    }
  }

  function openDifficultyScreen(mode, cls){
    selectedMode = mode;
    selectedClass = cls;

    // Update Badge
    diffClassBadge.className = `class-badge ${cls}`;
    diffClassBadge.textContent = CLASS_TITLES[cls] || 'Kelas';

    // Update Subtitle
    diffSubtitle.textContent = mode === '1p' ? 'Mode: 1 Pemain vs CPU' : 'Mode: 2 Pemain Lokal';

    // Update Descriptions
    const subs = DIFF_SUBTITLES[cls] || DIFF_SUBTITLES.k1;
    diffDescEasy.textContent = subs.easy;
    diffDescMedium.textContent = subs.medium;
    diffDescHard.textContent = subs.hard;

    // Render best score for this class
    if(mode === '1p'){
      const bE = getBestScore(cls, 'easy');
      const bM = getBestScore(cls, 'medium');
      const bH = getBestScore(cls, 'hard');
      if(bE > 0 || bM > 0 || bH > 0){
        diffBestScoreBox.innerHTML = `
          <div class="best-score" style="font-size:0.9rem; padding:6px 14px;">
            🏅 Rekor (1P) — 🟢 Mudah: ${bE} &nbsp;|&nbsp; 🟡 Sedang: ${bM} &nbsp;|&nbsp; 🔴 Sulit: ${bH}
          </div>`;
      } else {
        diffBestScoreBox.innerHTML = '';
      }
    } else {
      diffBestScoreBox.innerHTML = '';
    }

    showScreen('difficulty');
  }

  // ---------- Init Events ----------
  // Start screen class selection buttons
  document.querySelectorAll('.mode-col .level-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      AudioController.init();
      AudioController.playClick();
      const mode = btn.getAttribute('data-mode');
      const cls = btn.getAttribute('data-class');
      openDifficultyScreen(mode, cls);
    });
  });

  // Difficulty screen selection buttons
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      AudioController.init();
      const diff = btn.getAttribute('data-difficulty');
      selectedDifficulty = diff;
      if (selectedMode === '2p') {
        pendingDifficulty = diff;
        document.getElementById('inputNameP1').value = '';
        document.getElementById('inputNameP2').value = '';
        showScreen('name');
      } else {
        startRace('1p', selectedClass, diff);
      }
    });
  });

  // Cancel / Back Buttons
  document.getElementById('cancelDifficultyBtn').addEventListener('click', function(){
    AudioController.playClick();
    showScreen('start');
  });

  document.getElementById('cancelNameBtn').addEventListener('click', function(){
    AudioController.playClick();
    showScreen('difficulty');
  });
  
  document.getElementById('start2PBtn').addEventListener('click', function(){
    AudioController.playClick();
    p1Name = document.getElementById('inputNameP1').value.trim() || 'Pembalap Kiri';
    p2Name = document.getElementById('inputNameP2').value.trim() || 'Pembalap Kanan';
    startRace('2p', selectedClass, pendingDifficulty);
  });
  
  document.getElementById('playAgainBtn').addEventListener('click', function(){
    AudioController.playClick();
    startRace(selectedMode, selectedClass, selectedDifficulty);
  });
  
  document.getElementById('changeLevelBtn').addEventListener('click', function(){
    AudioController.playClick();
    showScreen('start');
    AudioController.playMenuBGM();
  });

  // Init
  renderBestScores();
})();
