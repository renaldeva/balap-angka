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

  function syncAudioButtons(muted){
    document.querySelectorAll('.audio-toggle').forEach(btn => {
      btn.textContent = muted ? '🔈' : '🔊';
    });
  }

  document.querySelectorAll('.audio-toggle').forEach(btn => {
    btn.addEventListener('click', function(e){
      AudioController.init();
      const muted = AudioController.toggleMute();
      syncAudioButtons(muted);
      // If not muted and we are on start screen, play menu BGM
      if(!muted && screens.start.classList.contains('active')) {
        AudioController.playMenuBGM();
      }
    });
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
  let isPaused = false;
  let countdownTimer = null;
  let countdownVal = 3;
  let p1Name = "Kamu";
  let p2Name = "P2";
  let pendingDifficulty = 'easy';
  
  // Data pemain baru (dipakai saat awal dan setiap balapan dimulai / diulang)
  function newPlayerState(){
    return {
      pos:0, score:0, streak:0, answer:null, isAnswering:false, bestStreak:0,
      explanation:null, explanationTimer:null,
      nextTimer:null // timer menuju soal berikutnya
    };
  }

  const state = {
    p1: newPlayerState(),
    p2: newPlayerState(),
    cpu1: { pos:0 },
    cpu2: { pos:0 }
  };

  let cpuTimer = null;
  const FINISH = 100;

  // ---------- Pengaturan yang mudah diubah ----------
  // Waktu baca soal panjang (soal cerita). Hanya berlaku di mode 1 Pemain:
  // CPU berhenti sebentar selama waktu ini (atau sampai pemain menjawab).
  const READ_TIME_BASE_MS = 2000;     // waktu dasar (milidetik)
  const READ_TIME_PER_CHAR_MS = 100;  // tambahan waktu per huruf (0,1 detik)
  const LONG_TEXT_MIN_CHARS = 30;     // soal dengan huruf <= angka ini dianggap soal biasa (CPU tidak ditahan)

  // Nama lawan komputer (diambil acak, dua lawan selalu berbeda). Silakan tambah nama baru.
  const COMPUTER_NAMES = [
    'Si Kilat', 'Turbo', 'Roket Biru', 'Petir', 'Elang Cepat',
    'Macan Turbo', 'Bayu Ngebut', 'Si Meteor', 'Jago Balap', 'Kancil Cepat',
    'Naga Api', 'Kijang Emas', 'Badai', 'Komet', 'Si Bintang'
  ];
  let cpuNames = ['Turbo', 'Petir']; // nama lawan balapan yang sedang berjalan
  let cpuHoldUntil = 0;              // CPU tidak bergerak sampai waktu ini
  let cpuHoldRemaining = 0;          // sisa waktu tahan saat game dijeda

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
      easy: 'Tambah, kurang & pasangan bilangan s.d. 10',
      medium: 'Bilangan 11-20, nilai tempat & bandingkan',
      hard: 'Tambah & kurang s.d. 20, soal cerita'
    },
    k2: {
      easy: 'Bilangan 21-50 & tambah/kurang 2 digit',
      medium: 'Simpan/pinjam, kali & bagi sederhana',
      hard: 'Simpan/pinjam s.d. 100, kali & bagi 2-5'
    },
    k3: {
      easy: 'Nilai tempat 3 digit & tabel kali 1-10',
      medium: 'Tambah/kurang 3 digit, kali & bagi bersusun',
      hard: 'Pecahan penyebut sama & soal tantangan'
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
  const laneLabelCPU2 = document.getElementById('laneLabelCPU2');

  // Panels
  const panelsContainer = document.getElementById('panelsContainer');
  const panelP2 = document.getElementById('panelP2');
  const panelP1 = document.getElementById('panelP1');

  // Question Elements
  const qTextP1 = document.getElementById('questionTextP1');
  const gridP1 = document.getElementById('answersGridP1');
  const fbP1 = document.getElementById('feedbackTextP1');
  const expP1 = document.getElementById('explanationP1');
  
  const qTextP2 = document.getElementById('questionTextP2');
  const gridP2 = document.getElementById('answersGridP2');
  const fbP2 = document.getElementById('feedbackTextP2');
  const expP2 = document.getElementById('explanationP2');

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

  // Countdown & Pause
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownText = document.getElementById('countdownText');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const resumeBtn = document.getElementById('resumeBtn');


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
  // Urutan mengikuti buku Kelas I:
  // - Mudah  : bilangan 1-10 (tambah, kurang, pasangan bilangan, soal cerita)
  // - Sedang : bilangan 11-20 (nilai tempat, terbesar/terkecil, tambah/kurang s.d. 20, cerita)
  // - Sulit  : tambah/kurang s.d. 20 melewati 10, mencari bilangan yang hilang, selisih, cerita
  // Setiap soal punya field `explanation` untuk ditampilkan saat jawaban salah.

  // Daftar kecil nama & benda supaya soal cerita bervariasi
  const K1_NAMES = ['Upe', 'Kira', 'Malosi', 'Halim', 'Tika'];
  const K1_ITEMS = ['kelereng', 'apel', 'buku', 'permen', 'balon'];

  function pickOne(list){ return list[randInt(0, list.length - 1)]; }

  // Soal "a + b = ?" angka langsung. Hasil tidak lebih dari maxSum.
  function k1AddPlain(minA, maxA, maxSum){
    const a = randInt(minA, maxA);
    const b = randInt(1, maxSum - a);
    const ans = a + b;
    return {
      text: `${a} + ${b} = ?`,
      answer: ans,
      explanation: `${a} + ${b}: mulai dari ${a}, tambah ${b} lagi, jadi ${ans}.`,
      choices: generateNumberChoices(ans, 0, 1, maxSum)
    };
  }

  // Soal "a - b = ?" angka langsung. a antara minA..maxA.
  function k1SubPlain(minA, maxA){
    const a = randInt(minA, maxA);
    const b = randInt(1, a - 1);
    const ans = a - b;
    return {
      text: `${a} - ${b} = ?`,
      answer: ans,
      explanation: `${a} - ${b}: mulai dari ${a}, kurangi ${b}, sisanya ${ans}.`,
      choices: generateNumberChoices(ans, 0, 1, maxA)
    };
  }

  // Soal cerita penjumlahan. Hasil tidak lebih dari maxSum.
  function k1StoryAdd(minA, maxA, maxSum){
    const name = pickOne(K1_NAMES);
    const item = pickOne(K1_ITEMS);
    const a = randInt(minA, maxA);
    const b = randInt(1, maxSum - a);
    const ans = a + b;
    return {
      text: `${name} punya ${a} ${item}. Lalu diberi ${b} ${item} lagi. Berapa ${item} ${name} sekarang?`,
      answer: ans,
      explanation: `Dijumlahkan: ${a} + ${b} = ${ans}. Jadi ${name} punya ${ans} ${item}.`,
      choices: generateNumberChoices(ans, 0, 1, maxSum)
    };
  }

  // Soal cerita pengurangan.
  function k1StorySub(minA, maxA){
    const name = pickOne(K1_NAMES);
    const item = pickOne(K1_ITEMS);
    const a = randInt(minA, maxA);
    const b = randInt(1, a - 1);
    const ans = a - b;
    return {
      text: `${name} punya ${a} ${item}. ${b} ${item} diberikan ke teman. Berapa sisanya?`,
      answer: ans,
      explanation: `Dikurangi: ${a} - ${b} = ${ans}. Jadi sisanya ${ans} ${item}.`,
      choices: generateNumberChoices(ans, 0, 1, maxA)
    };
  }

  // Penjumlahan melewati 10 (contoh: 8 + 5). Cara: genapkan ke 10 dulu.
  function k1AddCross10(){
    const a = randInt(6, 9);
    const b = randInt(11 - a, 9); // supaya hasil lebih dari 10
    const ans = a + b;
    const toTen = 10 - a;
    return {
      text: `${a} + ${b} = ?`,
      answer: ans,
      explanation: `${a} + ${toTen} = 10, lalu 10 + ${b - toTen} = ${ans}. Jadi ${ans}.`,
      choices: generateNumberChoices(ans, 11, 1, 20)
    };
  }

  // Pengurangan melewati 10 (contoh: 15 - 7). Cara: turun ke 10 dulu.
  function k1SubCross10(){
    const a = randInt(12, 18);
    const b = randInt(a - 9, 9); // supaya perlu melewati 10
    const ans = a - b;
    const toTen = a - 10;
    return {
      text: `${a} - ${b} = ?`,
      answer: ans,
      explanation: `${a} - ${toTen} = 10, lalu 10 - ${b - toTen} = ${ans}. Jadi ${ans}.`,
      choices: generateNumberChoices(ans, 0, 1, 20)
    };
  }

  // Pasangan bilangan: a dan ... jika digabung jadi total (total 4-10)
  function k1NumberBond(){
    const total = randInt(4, 10);
    const a = randInt(1, total - 1);
    const b = total - a;
    return {
      text: `Pasangan bilangan: ${a} dan ... jika digabung jadi ${total}`,
      answer: b,
      explanation: `${a} + ${b} = ${total}. Jadi pasangan ${a} adalah ${b}.`,
      choices: generateNumberChoices(b, 0, 1, 10)
    };
  }

  // Nilai tempat bilangan 11-19: puluhan selalu 1
  function k1PlaceValue(){
    const s = randInt(1, 9);
    const num = 10 + s;
    const type = randInt(1, 3);
    if(type === 1){
      return {
        text: `${num} = 1 puluhan + ... satuan`,
        answer: s,
        explanation: `${num} terdiri dari 1 puluhan (10) dan ${s} satuan. Jadi ${s}.`,
        choices: generateNumberChoices(s, 0, 1, 9)
      };
    } else if(type === 2){
      return {
        text: `1 puluhan + ${s} satuan = ...`,
        answer: num,
        explanation: `1 puluhan = 10. Lalu 10 + ${s} = ${num}.`,
        choices: generateNumberChoices(num, 10, 1, 20)
      };
    }
    return {
      text: `Pada bilangan ${num}, ada berapa satuan?`,
      answer: s,
      explanation: `Pada ${num}, angka 1 adalah puluhan dan angka ${s} adalah satuan. Jadi ${s}.`,
      choices: generateNumberChoices(s, 0, 1, 9)
    };
  }

  // Membandingkan bilangan: yang paling besar / paling kecil dari 4 bilangan 11-20
  function k1Compare(){
    const nums = shuffle([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]).slice(0, 4);
    const sorted = [...nums].sort((x, y) => x - y);
    const askBig = Math.random() < 0.5;
    const ans = askBig ? sorted[3] : sorted[0];
    return {
      text: askBig ? 'Bilangan mana yang paling besar?' : 'Bilangan mana yang paling kecil?',
      answer: ans,
      explanation: `Urutan dari kecil: ${sorted.join(', ')}. ${askBig ? 'Paling besar' : 'Paling kecil'} adalah ${ans}.`,
      choices: shuffle(nums).map(n => normalizeChoice(n))
    };
  }

  // Mencari bilangan yang hilang: ... + b = total (hubungan tambah dan kurang)
  function k1MissingAddend(){
    const total = randInt(11, 20);
    const b = randInt(2, 9);
    const a = total - b;
    return {
      text: `... + ${b} = ${total}`,
      answer: a,
      explanation: `${total} - ${b} = ${a}. Tambah dan kurang saling berhubungan, jadi ${a}.`,
      choices: generateNumberChoices(a, 1, 1, 20)
    };
  }

  // Soal cerita selisih: siapa lebih banyak, berapa selisihnya
  function k1StoryDifference(){
    let n1 = pickOne(K1_NAMES);
    let n2 = pickOne(K1_NAMES);
    while(n2 === n1) n2 = pickOne(K1_NAMES);
    const item = pickOne(K1_ITEMS);
    const big = randInt(8, 20);
    const small = randInt(3, big - 1);
    const ans = big - small;
    return {
      text: `${n1} punya ${big} ${item}. ${n2} punya ${small} ${item}. Berapa selisihnya?`,
      answer: ans,
      explanation: `Selisih berarti dikurangi: ${big} - ${small} = ${ans}.`,
      choices: generateNumberChoices(ans, 1, 1, 20)
    };
  }

  function generateQuestionK1(diff){
    const r = Math.random();
    if(diff === 'easy'){
      // MUDAH: bilangan 1-10
      if(r < 0.35) return k1AddPlain(1, 8, 10);
      if(r < 0.6) return k1SubPlain(2, 10);
      if(r < 0.8) return k1NumberBond();
      return Math.random() < 0.5 ? k1StoryAdd(1, 8, 10) : k1StorySub(3, 10);
    } else if(diff === 'medium'){
      // SEDANG: bilangan 11-20
      if(r < 0.25) return k1PlaceValue();
      if(r < 0.5) return k1Compare();
      if(r < 0.75) return Math.random() < 0.5 ? k1AddPlain(1, 14, 20) : k1SubPlain(11, 20);
      return Math.random() < 0.5 ? k1StoryAdd(5, 14, 20) : k1StorySub(11, 20);
    } else {
      // SULIT: tambah/kurang melewati 10, bilangan hilang, selisih, cerita
      if(r < 0.25) return k1AddCross10();
      if(r < 0.5) return k1SubCross10();
      if(r < 0.7) return k1MissingAddend();
      if(r < 0.85) return k1StoryDifference();
      return k1StoryAdd(6, 12, 20);
    }
  }

  // ---------- KELAS 2 SD (Mudah, Sedang, Sulit) ----------
  // Urutan mengikuti buku Kelas II:
  // - Mudah  : bilangan 21-50 (nilai tempat, bandingkan), tambah/kurang 2 digit TANPA simpan/pinjam, cerita
  // - Sedang : tambah simpan & kurang pinjam 2 digit, perkalian sebagai penjumlahan berulang,
  //            setengah dari kumpulan benda, pembagian bagi rata, cerita
  // - Sulit  : simpan/pinjam sampai 100, perkalian & pembagian 2-5, setengah/seperempat, cerita
  // Setiap soal punya field `explanation` untuk ditampilkan saat jawaban salah.

  const K2_ITEMS = ['jambu air', 'kue', 'pensil', 'stiker', 'buku'];

  // Penjelasan penjumlahan 2 digit (otomatis tahu ada simpan atau tidak)
  function k2AddExplain(a, b){
    const p1 = Math.floor(a / 10), s1 = a % 10;
    const p2 = Math.floor(b / 10), s2 = b % 10;
    const ans = a + b;
    if(s1 + s2 < 10){
      return `${a} + ${b}: puluhan ${p1}+${p2}=${p1 + p2}, satuan ${s1}+${s2}=${s1 + s2}, jadi ${ans}.`;
    }
    return `${a} + ${b}: satuan ${s1}+${s2}=${s1 + s2}, tulis ${(s1 + s2) % 10}, simpan 1. Puluhan ${p1}+${p2}+1=${p1 + p2 + 1}. Jadi ${ans}.`;
  }

  // Penjelasan pengurangan 2 digit (otomatis tahu ada pinjam atau tidak)
  function k2SubExplain(a, b){
    const p1 = Math.floor(a / 10), s1 = a % 10;
    const p2 = Math.floor(b / 10), s2 = b % 10;
    const ans = a - b;
    if(s1 >= s2){
      return `${a} - ${b}: puluhan ${p1}-${p2}=${p1 - p2}, satuan ${s1}-${s2}=${s1 - s2}, jadi ${ans}.`;
    }
    return `${a} - ${b}: satuan ${s1} kurang dari ${s2}, pinjam 10: ${10 + s1}-${s2}=${10 + s1 - s2}. Puluhan ${p1}-1=${p1 - 1}, lalu ${p1 - 1}-${p2}=${p1 - 1 - p2}. Jadi ${ans}.`;
  }

  // Memilih angka a dan b untuk penjumlahan TANPA simpan (hasil < 60)
  function k2NumsAddNoCarry(){
    const p1 = randInt(1, 3), p2 = randInt(1, 4 - p1);
    const s1 = randInt(0, 8), s2 = randInt(0, 9 - s1);
    return { a: p1 * 10 + s1, b: p2 * 10 + s2 };
  }
  // Memilih angka a dan b untuk pengurangan TANPA pinjam
  function k2NumsSubNoBorrow(){
    const p1 = randInt(2, 5), p2 = randInt(1, p1 - 1);
    const s1 = randInt(0, 9), s2 = randInt(0, s1);
    return { a: p1 * 10 + s1, b: p2 * 10 + s2 };
  }
  // Penjumlahan DENGAN simpan. hard=true berarti hasil bisa sampai 99
  function k2NumsAddCarry(hard){
    const s1 = randInt(2, 9), s2 = randInt(10 - s1, 9);
    const p1 = hard ? randInt(2, 6) : randInt(1, 3);
    const p2 = hard ? randInt(1, 2) : randInt(1, 2);
    return { a: p1 * 10 + s1, b: p2 * 10 + s2 };
  }
  // Pengurangan DENGAN pinjam
  function k2NumsSubBorrow(hard){
    const s2 = randInt(3, 9), s1 = randInt(0, s2 - 1);
    const p1 = hard ? randInt(5, 9) : randInt(3, 5);
    const p2 = randInt(1, p1 - 1);
    return { a: p1 * 10 + s1, b: p2 * 10 + s2 };
  }

  // Soal angka langsung a + b
  function k2AddPlain(n, maxVal){
    const ans = n.a + n.b;
    return {
      text: `${n.a} + ${n.b} = ?`,
      answer: ans,
      explanation: k2AddExplain(n.a, n.b),
      choices: generateNumberChoices(ans, 10, 1, maxVal)
    };
  }
  // Soal angka langsung a - b
  function k2SubPlain(n, maxVal){
    const ans = n.a - n.b;
    return {
      text: `${n.a} - ${n.b} = ?`,
      answer: ans,
      explanation: k2SubExplain(n.a, n.b),
      choices: generateNumberChoices(ans, 0, 1, maxVal)
    };
  }
  // Soal cerita tambah
  function k2StoryAdd(n, maxVal){
    const name = pickOne(K1_NAMES), item = pickOne(K2_ITEMS);
    const ans = n.a + n.b;
    return {
      text: `${name} punya ${n.a} ${item}. Lalu mendapat ${n.b} ${item} lagi. Berapa ${item} ${name} sekarang?`,
      answer: ans,
      explanation: k2AddExplain(n.a, n.b),
      choices: generateNumberChoices(ans, 10, 1, maxVal)
    };
  }
  // Soal cerita kurang
  function k2StorySub(n, maxVal){
    const name = pickOne(K1_NAMES), item = pickOne(K2_ITEMS);
    const ans = n.a - n.b;
    return {
      text: `${name} punya ${n.a} ${item}. ${n.b} ${item} diberikan ke teman. Berapa sisanya?`,
      answer: ans,
      explanation: k2SubExplain(n.a, n.b),
      choices: generateNumberChoices(ans, 0, 1, maxVal)
    };
  }

  // Nilai tempat bilangan 21-50
  function k2PlaceValue(){
    const p = randInt(2, 5);
    const s = randInt(0, 9);
    const num = p * 10 + s;
    const type = randInt(1, 3);
    if(type === 1){
      return {
        text: `${num} = ... puluhan + ${s} satuan`,
        answer: p,
        explanation: `${num} terdiri dari ${p} puluhan (${p * 10}) dan ${s} satuan. Jadi ${p}.`,
        choices: generateNumberChoices(p, 1, 1, 6)
      };
    } else if(type === 2){
      return {
        text: `${p} puluhan + ${s} satuan = ...`,
        answer: num,
        explanation: `${p} puluhan = ${p * 10}. Lalu ${p * 10} + ${s} = ${num}.`,
        choices: generateNumberChoices(num, 20, 1, 59)
      };
    }
    return {
      text: `Pada bilangan ${num}, angka puluhannya adalah?`,
      answer: p,
      explanation: `Pada ${num}, angka ${p} ada di tempat puluhan. Angka ${s} ada di tempat satuan.`,
      choices: generateNumberChoices(p, 1, 1, 6)
    };
  }

  // Membandingkan bilangan: paling besar / paling kecil dari 4 bilangan 21-50
  function k2Compare(){
    const nums = [];
    while(nums.length < 4){
      const n = randInt(21, 50);
      if(!nums.includes(n)) nums.push(n);
    }
    const sorted = [...nums].sort((x, y) => x - y);
    const askBig = Math.random() < 0.5;
    const ans = askBig ? sorted[3] : sorted[0];
    return {
      text: askBig ? 'Bilangan mana yang paling besar?' : 'Bilangan mana yang paling kecil?',
      answer: ans,
      explanation: `Urutan dari kecil: ${sorted.join(', ')}. ${askBig ? 'Paling besar' : 'Paling kecil'} adalah ${ans}.`,
      choices: shuffle(nums).map(n => normalizeChoice(n))
    };
  }

  // Perkalian sebagai penjumlahan berulang (a kali b)
  function k2Mult(minA, maxA, minB, maxB){
    const a = randInt(minA, maxA), b = randInt(minB, maxB);
    const ans = a * b;
    const repeated = Array(a).fill(b).join(' + ');
    if(Math.random() < 0.3){
      // Versi terbalik: penjumlahan berulang -> berapa kali?
      return {
        text: `${repeated} = ... × ${b}`,
        answer: a,
        explanation: `${b} muncul ${a} kali, jadi ${a} × ${b}.`,
        choices: generateNumberChoices(a, 1, 1, 10)
      };
    }
    return {
      text: `${a} × ${b} = ?`,
      answer: ans,
      explanation: `${a} × ${b} artinya ${repeated} = ${ans}.`,
      choices: generateNumberChoices(ans, 1, 1, 50)
    };
  }

  // Soal cerita perkalian
  function k2StoryMult(minA, maxA, minB, maxB){
    const item = pickOne(K2_ITEMS);
    const a = randInt(minA, maxA), b = randInt(minB, maxB);
    const ans = a * b;
    return {
      text: `Ada ${a} piring. Setiap piring berisi ${b} ${item}. Berapa ${item} semuanya?`,
      answer: ans,
      explanation: `${Array(a).fill(b).join(' + ')} = ${ans}. Jadi ada ${ans} ${item}.`,
      choices: generateNumberChoices(ans, 1, 1, 50)
    };
  }

  // Pembagian: bagi rata (cerita atau angka langsung)
  function k2Division(maxDivisor, minQ, maxQ, asStory){
    const n = randInt(2, maxDivisor), q = randInt(minQ, maxQ);
    const total = n * q;
    if(asStory){
      const item = pickOne(K2_ITEMS);
      return {
        text: `${total} ${item} dibagi rata untuk ${n} anak. Tiap anak dapat berapa?`,
        answer: q,
        explanation: `${total} ÷ ${n} = ${q}, karena ${n} × ${q} = ${total}.`,
        choices: generateNumberChoices(q, 1, 1, 10)
      };
    }
    return {
      text: `${total} ÷ ${n} = ?`,
      answer: q,
      explanation: `${total} ÷ ${n} = ${q}, karena ${n} × ${q} = ${total}.`,
      choices: generateNumberChoices(q, 1, 1, 10)
    };
  }

  // Pecahan konkret: setengah atau seperempat dari kumpulan benda
  function k2Fraction(allowQuarter){
    const item = pickOne(K2_ITEMS);
    const quarter = allowQuarter && Math.random() < 0.5;
    const parts = quarter ? 4 : 2;
    const q = randInt(1, quarter ? 5 : 10);
    const total = parts * q;
    return {
      text: `${quarter ? 'Seperempat' : 'Setengah'} dari ${total} ${item} adalah ... ${item}`,
      answer: q,
      explanation: `${quarter ? 'Seperempat' : 'Setengah'} artinya dibagi ${parts}. ${total} ÷ ${parts} = ${q}.`,
      choices: generateNumberChoices(q, 1, 1, 12)
    };
  }

  function generateQuestionK2(diff){
    const r = Math.random();
    const coin = Math.random() < 0.5;
    if(diff === 'easy'){
      // MUDAH: bilangan 21-50, tanpa simpan/pinjam
      if(r < 0.2) return k2PlaceValue();
      if(r < 0.35) return k2Compare();
      if(r < 0.55) return k2AddPlain(k2NumsAddNoCarry(), 59);
      if(r < 0.75) return k2SubPlain(k2NumsSubNoBorrow(), 59);
      return coin ? k2StoryAdd(k2NumsAddNoCarry(), 59) : k2StorySub(k2NumsSubNoBorrow(), 59);
    } else if(diff === 'medium'){
      // SEDANG: simpan/pinjam, perkalian berulang, setengah, pembagian
      if(r < 0.2) return k2AddPlain(k2NumsAddCarry(false), 99);
      if(r < 0.4) return k2SubPlain(k2NumsSubBorrow(false), 99);
      if(r < 0.6) return k2Mult(2, 5, 2, 10);
      if(r < 0.7) return k2Fraction(false);
      if(r < 0.8) return k2Division(5, 2, 10, coin);
      return coin ? k2StoryAdd(k2NumsAddCarry(false), 99) : k2StorySub(k2NumsSubBorrow(false), 99);
    } else {
      // SULIT: simpan/pinjam sampai 100, kali & bagi 2-5, setengah/seperempat, cerita
      if(r < 0.2) return k2AddPlain(k2NumsAddCarry(true), 99);
      if(r < 0.4) return k2SubPlain(k2NumsSubBorrow(true), 99);
      if(r < 0.55) return k2Mult(3, 5, 4, 10);
      if(r < 0.65) return k2Division(5, 4, 10, false);
      if(r < 0.75) return k2Fraction(true);
      if(r < 0.85) return k2StoryMult(3, 5, 3, 10);
      return coin ? k2StoryAdd(k2NumsAddCarry(true), 99) : k2StorySub(k2NumsSubBorrow(true), 99);
    }
  }

  // ---------- KELAS 3 SD (Mudah, Sedang, Sulit) ----------
  // Urutan mengikuti buku Kelas III:
  // - Mudah  : bilangan sampai 1.000 (nilai tempat, bandingkan), tabel perkalian 1-10, cerita perkalian
  // - Sedang : tambah/kurang 3 digit (simpan/pinjam), perkalian & pembagian bersusun, bilangan yang hilang, cerita
  // - Sulit  : pecahan berpenyebut sama (+ dan -), perkalian bersusun lebih besar, pembagian, soal cerita
  // Setiap soal punya field `explanation` untuk ditampilkan saat jawaban salah.

  const K3_ITEMS = ['kelereng', 'permen', 'pensil', 'apel', 'stiker'];

  // HTML pecahan bertumpuk (memakai style .frac yang sudah ada)
  function fracHtml(n, d){
    return `<span class="frac"><span class="top">${n}</span><span class="bottom">${d}</span></span>`;
  }

  // Penjelasan penjumlahan 3 digit per kolom (satuan, puluhan, ratusan)
  function k3AddExplain(a, b){
    const da = [a % 10, Math.floor(a / 10) % 10, Math.floor(a / 100)];
    const db = [b % 10, Math.floor(b / 10) % 10, Math.floor(b / 100)];
    const names = ['satuan', 'puluhan', 'ratusan'];
    let carry = 0;
    const parts = [];
    for(let i = 0; i < 3; i++){
      const sum = da[i] + db[i] + carry;
      const plus = carry ? `${da[i]}+${db[i]}+1` : `${da[i]}+${db[i]}`;
      if(sum >= 10 && i < 2){
        parts.push(`${names[i]} ${plus}=${sum}, tulis ${sum % 10}, simpan 1`);
        carry = 1;
      } else {
        parts.push(`${names[i]} ${plus}=${sum}`);
        carry = 0;
      }
    }
    return `${a} + ${b}: ${parts.join('. ')}. Jadi ${a + b}.`;
  }

  // Penjelasan pengurangan 3 digit per kolom
  function k3SubExplain(a, b){
    const da = [a % 10, Math.floor(a / 10) % 10, Math.floor(a / 100)];
    const db = [b % 10, Math.floor(b / 10) % 10, Math.floor(b / 100)];
    const names = ['satuan', 'puluhan', 'ratusan'];
    let borrow = 0;
    const parts = [];
    for(let i = 0; i < 3; i++){
      const cur = da[i] - borrow;
      const label = borrow ? `${names[i]} ${da[i]} dipinjam 1 jadi ${cur}` : `${names[i]} ${cur}`;
      if(cur < db[i]){
        parts.push(`${label}, kurang dari ${db[i]}, pinjam 10: ${cur + 10}-${db[i]}=${cur + 10 - db[i]}`);
        borrow = 1;
      } else {
        parts.push(`${label}-${db[i]}=${cur - db[i]}`);
        borrow = 0;
      }
    }
    return `${a} - ${b}: ${parts.join('. ')}. Jadi ${a - b}.`;
  }

  // Memilih a dan b untuk penjumlahan 3 digit (hasil maksimal 999)
  function k3NumsAdd(needCarry){
    let a, b;
    for(let i = 0; i < 40; i++){
      a = randInt(120, 700);
      b = randInt(101, 999 - a);
      if(!needCarry || (a % 10) + (b % 10) >= 10) break;
    }
    return { a, b };
  }
  // Memilih a dan b untuk pengurangan 3 digit (tidak negatif)
  function k3NumsSub(needBorrow){
    let a, b;
    for(let i = 0; i < 40; i++){
      a = randInt(2, 9) * 100 + randInt(1, 9) * 10 + randInt(0, 9);
      b = randInt(101, a - 1);
      if(!needBorrow || (a % 10) < (b % 10)) break;
    }
    return { a, b };
  }

  function k3AddPlain(n){
    const ans = n.a + n.b;
    return {
      text: `${n.a} + ${n.b} = ?`,
      answer: ans,
      explanation: k3AddExplain(n.a, n.b),
      choices: generateNumberChoices(ans, 100, 1, 999)
    };
  }
  function k3SubPlain(n){
    const ans = n.a - n.b;
    return {
      text: `${n.a} - ${n.b} = ?`,
      answer: ans,
      explanation: k3SubExplain(n.a, n.b),
      choices: generateNumberChoices(ans, 0, 1, 999)
    };
  }
  function k3StoryAdd(n){
    const name = pickOne(K1_NAMES), item = pickOne(K3_ITEMS);
    const ans = n.a + n.b;
    return {
      text: `${name} punya ${n.a} ${item}. Lalu ditambah ${n.b} ${item}. Berapa ${item} ${name} sekarang?`,
      answer: ans,
      explanation: k3AddExplain(n.a, n.b),
      choices: generateNumberChoices(ans, 100, 1, 999)
    };
  }
  function k3StorySub(n){
    const name = pickOne(K1_NAMES), item = pickOne(K3_ITEMS);
    const ans = n.a - n.b;
    return {
      text: `${name} punya ${n.a} ${item}. ${n.b} ${item} diberikan ke teman. Berapa sisanya?`,
      answer: ans,
      explanation: k3SubExplain(n.a, n.b),
      choices: generateNumberChoices(ans, 0, 1, 999)
    };
  }

  // Nilai tempat bilangan 3 digit (angka ratusan, puluhan, satuan dibuat berbeda agar tidak membingungkan)
  function k3PlaceValue(){
    let h, p, s;
    do {
      h = randInt(1, 9); p = randInt(1, 9); s = randInt(1, 9);
    } while(h === p || p === s || h === s);
    const num = h * 100 + p * 10 + s;
    const type = randInt(1, 3);
    if(type === 1){
      return {
        text: `${num} = ... ratusan + ${p} puluhan + ${s} satuan`,
        answer: h,
        explanation: `${num} terdiri dari ${h} ratusan (${h * 100}), ${p} puluhan (${p * 10}), dan ${s} satuan. Jadi ${h}.`,
        choices: generateNumberChoices(h, 1, 1, 9)
      };
    } else if(type === 2){
      return {
        text: `${h} ratusan + ${p} puluhan + ${s} satuan = ...`,
        answer: num,
        explanation: `${h * 100} + ${p * 10} + ${s} = ${num}.`,
        choices: makeUniqueChoices(num, [h * 100 + s * 10 + p, p * 100 + h * 10 + s, h * 100 + p + s], () => randInt(101, 999))
      };
    }
    return {
      text: `Nilai angka ${p} pada bilangan ${num} adalah ...`,
      answer: p * 10,
      explanation: `Angka ${p} ada di tempat puluhan, jadi nilainya ${p} × 10 = ${p * 10}.`,
      choices: makeUniqueChoices(p * 10, [p, p * 100, h * 10], () => randInt(1, 9) * 10)
    };
  }

  // Membandingkan bilangan 3 digit: paling besar / paling kecil
  function k3Compare(){
    const nums = [];
    while(nums.length < 4){
      const n = randInt(101, 999);
      if(!nums.includes(n)) nums.push(n);
    }
    const sorted = [...nums].sort((x, y) => x - y);
    const askBig = Math.random() < 0.5;
    const ans = askBig ? sorted[3] : sorted[0];
    return {
      text: askBig ? 'Bilangan mana yang paling besar?' : 'Bilangan mana yang paling kecil?',
      answer: ans,
      explanation: `Bandingkan ratusannya dulu. Urutan dari kecil: ${sorted.join(', ')}. ${askBig ? 'Paling besar' : 'Paling kecil'} adalah ${ans}.`,
      choices: shuffle(nums).map(n => normalizeChoice(n))
    };
  }

  // Tabel perkalian 1-10 (fokus tabel 6-10)
  function k3MultTable(){
    let a = randInt(6, 10), b = randInt(2, 10);
    if(Math.random() < 0.5) [a, b] = [b, a];
    const ans = a * b;
    const big = Math.max(a, b), small = Math.min(a, b);
    let how;
    if(big === 10){
      how = `${small} × 10 = ${ans}: tambahkan angka 0 di belakang ${small}.`;
    } else if(big > 5){
      how = `${small} × 5 = ${small * 5}, ${small} × ${big - 5} = ${small * (big - 5)}. ${small * 5} + ${small * (big - 5)} = ${ans}.`;
    } else {
      how = `${small} × ${big} = ${Array(big).fill(small).join(' + ')} = ${ans}.`;
    }
    return {
      text: `${a} × ${b} = ?`,
      answer: ans,
      explanation: how,
      choices: generateNumberChoices(ans, 2, 1, 100)
    };
  }

  // Cerita perkalian
  function k3StoryMult(){
    const name = pickOne(K1_NAMES), item = pickOne(K3_ITEMS);
    const a = randInt(3, 9), b = randInt(6, 10);
    const ans = a * b;
    return {
      text: `${name} punya ${a} kantong. Tiap kantong berisi ${b} ${item}. Berapa ${item} semuanya?`,
      answer: ans,
      explanation: `${a} × ${b} = ${ans}. Jadi ada ${ans} ${item}.`,
      choices: generateNumberChoices(ans, 2, 1, 100)
    };
  }

  // Perkalian bersusun 2 digit × 1 digit
  function k3MultStacked(minA, maxA, minB, maxB, asStory){
    let a;
    do { a = randInt(minA, maxA); } while(a % 10 === 0);
    const b = randInt(minB, maxB);
    const ans = a * b;
    const tens = Math.floor(a / 10) * 10, ones = a % 10;
    const how = `${tens} × ${b} = ${tens * b}, ${ones} × ${b} = ${ones * b}. ${tens * b} + ${ones * b} = ${ans}.`;
    if(asStory){
      const name = pickOne(K1_NAMES), item = pickOne(K3_ITEMS);
      return {
        text: `${name} punya ${b} kotak. Tiap kotak berisi ${a} ${item}. Berapa ${item} semuanya?`,
        answer: ans,
        explanation: `${a} × ${b}: ${how}`,
        choices: generateNumberChoices(ans, 10, 1, 999)
      };
    }
    return {
      text: `${a} × ${b} = ?`,
      answer: ans,
      explanation: `${a} × ${b}: ${how}`,
      choices: generateNumberChoices(ans, 10, 1, 999)
    };
  }

  // Pembagian 2 digit ÷ 1 digit tanpa sisa (cerita atau angka langsung)
  function k3Division(minB, maxB, minQ, asStory){
    const b = randInt(minB, maxB);
    const maxQ = Math.floor(99 / b);
    const q = randInt(minQ, Math.max(minQ, maxQ));
    const a = b * q;
    const how = `${a} ÷ ${b} = ${q}, karena ${b} × ${q} = ${a}.`;
    if(asStory){
      const item = pickOne(K3_ITEMS);
      return {
        text: `${a} ${item} dibagi rata ke ${b} kantong. Tiap kantong berisi berapa?`,
        answer: q,
        explanation: how,
        choices: generateNumberChoices(q, 2, 1, 99)
      };
    }
    return {
      text: `${a} ÷ ${b} = ?`,
      answer: q,
      explanation: how,
      choices: generateNumberChoices(q, 2, 1, 99)
    };
  }

  // Kalimat matematika: mencari bilangan yang hilang
  function k3Missing(){
    const b = randInt(11, 60);
    if(Math.random() < 0.5){
      const c = randInt(b + 10, 120);
      const a = c - b;
      return {
        text: `... + ${b} = ${c}`,
        answer: a,
        explanation: `${c} - ${b} = ${a}. Jadi bilangan yang hilang adalah ${a}.`,
        choices: generateNumberChoices(a, 1, 1, 200)
      };
    }
    const c = randInt(10, 90);
    const a = c + b;
    return {
      text: `... - ${b} = ${c}`,
      answer: a,
      explanation: `${c} + ${b} = ${a}. Jadi bilangan yang hilang adalah ${a}.`,
      choices: generateNumberChoices(a, 1, 1, 200)
    };
  }

  // Pecahan berpenyebut sama: tambah atau kurang
  function k3Fraction(){
    const d = randInt(3, 9);
    const isAdd = Math.random() < 0.5;
    let n1, n2, ansN, sign;
    if(isAdd){
      n1 = randInt(1, Math.max(1, d - 2));
      n2 = randInt(1, d - n1);
      ansN = n1 + n2;
      sign = '+';
    } else {
      n1 = randInt(2, d - 1);
      n2 = randInt(1, n1 - 1);
      ansN = n1 - n2;
      sign = '-';
    }
    const ansVal = `${ansN}/${d}`;
    return {
      text: `${n1}/${d} ${sign} ${n2}/${d} = ?`,
      html: `${fracHtml(n1, d)} ${sign} ${fracHtml(n2, d)} = ?`,
      answer: ansVal,
      answerDisplay: ansVal,
      explanation: `Penyebut sama (${d}), jadi hitung pembilangnya saja: ${n1} ${sign} ${n2} = ${ansN}. Penyebut tetap ${d}. Jawabannya ${fracHtml(ansN, d)}.`,
      choices: generateFractionChoices(ansN, d)
    };
  }

  function generateQuestionK3(diff){
    const r = Math.random();
    const coin = Math.random() < 0.5;
    if(diff === 'easy'){
      // MUDAH: bilangan sampai 1.000 & tabel perkalian
      if(r < 0.2) return k3PlaceValue();
      if(r < 0.35) return k3Compare();
      if(r < 0.7) return k3MultTable();
      return k3StoryMult();
    } else if(diff === 'medium'){
      // SEDANG: tambah/kurang 3 digit, kali & bagi bersusun
      if(r < 0.15) return k3AddPlain(k3NumsAdd(coin));
      if(r < 0.3) return k3SubPlain(k3NumsSub(coin));
      if(r < 0.5) return k3MultStacked(12, 45, 2, 8, false);
      if(r < 0.65) return k3Division(2, 7, 11, false);
      if(r < 0.75) return k3Missing();
      if(r < 0.85) return coin ? k3StoryAdd(k3NumsAdd(coin)) : k3StorySub(k3NumsSub(coin));
      return k3MultStacked(12, 45, 2, 8, true);
    } else {
      // SULIT: pecahan penyebut sama & tantangan
      if(r < 0.4) return k3Fraction();
      if(r < 0.6) return k3MultStacked(18, 49, 3, 9, coin);
      if(r < 0.75) return k3Division(3, 8, 12, coin);
      if(r < 0.87) return coin ? k3AddPlain(k3NumsAdd(true)) : k3SubPlain(k3NumsSub(true));
      return coin ? k3StoryAdd(k3NumsAdd(true)) : k3StorySub(k3NumsSub(true));
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

  // ---------- Question Validation & Safeguards ----------
  // Memastikan soal valid: tepat 4 pilihan unik, jawaban benar ada di dalam pilihan, dan tidak ada pilihan negatif
  function isQuestionValid(q){
    if(!q || typeof q !== 'object') return false;
    if(!q.choices || !Array.isArray(q.choices) || q.choices.length !== 4) return false;
    
    // Normalisasi nilai pilihan
    const vals = q.choices.map(c => {
      if(typeof c === 'object' && c !== null && c.val !== undefined) return c.val;
      return c;
    });

    // Harus tepat 4 pilihan yang unik (tidak ada duplikat)
    const uniqueVals = new Set(vals);
    if(uniqueVals.size !== 4) return false;

    // Jawaban benar harus ada di dalam daftar pilihan
    const ans = typeof q.answer === 'object' && q.answer !== null && q.answer.val !== undefined ? q.answer.val : q.answer;
    if(!uniqueVals.has(ans)) return false;

    // Tidak boleh ada pilihan bernilai negatif
    for(const v of vals){
      if(typeof v === 'number' && v < 0) return false;
      if(typeof v === 'string'){
        const numVal = Number(v);
        if(!isNaN(numVal) && numVal < 0) return false;
        if(v.includes('/')){
          const parts = v.split('/');
          if(parts.length === 2){
            const n = parseInt(parts[0], 10);
            const d = parseInt(parts[1], 10);
            if(isNaN(n) || isNaN(d) || n < 0 || d <= 0) return false;
          }
        }
      }
    }

    return true;
  }

  // Generate ulang jika soal tidak memenuhi kriteria validasi
  function getValidQuestion(cls, diff){
    let maxAttempts = 20;
    while(maxAttempts > 0){
      maxAttempts--;
      const q = generateQuestion(cls, diff);
      if(isQuestionValid(q)){
        return q;
      }
    }
    return generateQuestion(cls, diff);
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
    if(raceOver || isCountdown || isPaused) return;
    const playerState = state[playerKey];
    playerState.isAnswering = false;
    
    const q = getValidQuestion(selectedClass, selectedDifficulty);
    playerState.answer = q.answer;
    playerState.answerDisplay = q.answerDisplay || (q.html ? q.text : String(q.answer));
    playerState.explanation = q.explanation || null;
    // Soal panjang (soal cerita): CPU ditahan sebentar supaya siswa sempat membaca (hanya 1P)
    if(gameMode === '1p' && playerKey === 'p1') holdCpuForReading(q.text);
    
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
        if(!isPaused) handleAnswerClick(playerKey, choiceObj.val, index); // berlaku 1P dan 2P (layar sentuh)
      });
      grid.appendChild(btn);
    });
  }

  function handleAnswerClick(playerKey, choiceVal, btnIndex){
    if(raceOver || isCountdown || isPaused) return;
    const playerState = state[playerKey];
    if(playerState.isAnswering) return;
    
    playerState.isAnswering = true;
    if(gameMode === '1p' && playerKey === 'p1') cpuHoldUntil = 0; // sudah menjawab, CPU jalan lagi
    const grid = playerKey === 'p1' ? gridP1 : gridP2;
    const fb = playerKey === 'p1' ? fbP1 : fbP2;
    const panel = playerKey === 'p1' ? panelP1 : panelP2;
    const expBox = playerKey === 'p1' ? expP1 : expP2;
    
    const allBtns = grid.querySelectorAll('.answer-btn');
    allBtns.forEach(b => b.disabled = true);
    
    const btnEl = allBtns[btnIndex];

    if(choiceVal === playerState.answer){
      // Sembunyikan kotak penjelasan lama jika ada saat pemain menjawab benar
      if(playerState.explanationTimer){
        clearTimeout(playerState.explanationTimer);
        playerState.explanationTimer = null;
      }
      if(expBox) expBox.style.display = 'none';

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
      moveRacer(playerKey, 0); // Kompensasi jawaban salah diubah jadi 0% (sebelumnya 2%)
      
      fb.textContent = 'Salah! ❌';
      fb.className = 'feedback bad';

      // Kotak penjelasan: tampil sekitar 3 detik, tidak menghalangi balapan
      if(expBox){
        const expText = playerState.explanation
          ? playerState.explanation
          : `Jawaban yang benar: <strong>${playerState.answerDisplay}</strong>`;
        expBox.innerHTML = `💡 ${expText}`;
        expBox.style.display = 'block';

        if(playerState.explanationTimer) clearTimeout(playerState.explanationTimer);
        playerState.explanationTimer = setTimeout(() => {
          expBox.style.display = 'none';
          playerState.explanationTimer = null;
        }, 3000);
      }
      
      panel.classList.remove('shake');
      void panel.offsetWidth; // trigger reflow
      panel.classList.add('shake');
      
      AudioController.playWrong();
    }
    updateHud();
    
    // Soal berikutnya muncul setelah 0,9 detik. Timer disimpan agar bisa dihentikan saat pause.
    if(playerState.nextTimer) clearTimeout(playerState.nextTimer);
    playerState.nextTimer = setTimeout(() => {
      playerState.nextTimer = null;
      if(!raceOver && !isCountdown && !isPaused) renderQuestionFor(playerKey);
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
    if(Date.now() < cpuHoldUntil) return; // sedang menunggu siswa membaca soal panjang
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
    // Esc: jeda / lanjutkan (memakai fungsi yang sama dengan tombol pause)
    if(e.key === 'Escape'){
      if(isPaused) resumeGame(); else pauseGame();
      return;
    }
    if(raceOver || isCountdown || isPaused) return;
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
  function startCpuLoop(){
    stopCpuLoop();
    let cpuInterval = 1250;
    if(selectedDifficulty === 'easy') cpuInterval = 1400;
    else if(selectedDifficulty === 'hard') cpuInterval = 1100;
    cpuTimer = setInterval(moveCpus, cpuInterval);
  }

  function stopCpuLoop(){
    if(cpuTimer){
      clearInterval(cpuTimer);
      cpuTimer = null;
    }
  }

  // Menahan CPU saat soal panjang (soal cerita) tampil. Soal pendek tidak ditahan,
  // jadi kecepatan CPU untuk soal biasa tidak berubah.
  function holdCpuForReading(text){
    const len = String(text).length;
    if(len <= LONG_TEXT_MIN_CHARS){
      cpuHoldUntil = 0;
      return;
    }
    cpuHoldUntil = Date.now() + READ_TIME_BASE_MS + len * READ_TIME_PER_CHAR_MS;
  }

  // Menghentikan semua timer balapan: CPU, countdown, soal berikutnya, kotak penjelasan
  function clearRaceTimers(){
    stopCpuLoop();
    if(countdownTimer){
      clearTimeout(countdownTimer);
      countdownTimer = null;
    }
    ['p1', 'p2'].forEach(key => {
      const ps = state[key];
      if(ps.nextTimer) clearTimeout(ps.nextTimer);
      if(ps.explanationTimer) clearTimeout(ps.explanationTimer);
      ps.nextTimer = null;
      ps.explanationTimer = null;
    });
    cpuHoldUntil = 0;
    cpuHoldRemaining = 0;
  }

  // PAUSE: satu fungsi untuk tombol pause, tombol Esc, dan tab tidak aktif
  function pauseGame(){
    if(isPaused || raceOver || !screens.game.classList.contains('active')) return;
    isPaused = true;
    stopCpuLoop();
    if(countdownTimer){
      clearTimeout(countdownTimer);
      countdownTimer = null;
    }
    ['p1', 'p2'].forEach(key => {
      if(state[key].nextTimer){
        clearTimeout(state[key].nextTimer);
        state[key].nextTimer = null;
      }
    });
    cpuHoldRemaining = Math.max(0, cpuHoldUntil - Date.now());
    AudioController.stopBGM();
    pauseOverlay.style.display = 'flex';
  }

  // RESUME: satu fungsi untuk tombol Lanjut dan tombol Esc
  function resumeGame(){
    if(!isPaused) return;
    isPaused = false;
    pauseOverlay.style.display = 'none';

    if(isCountdown){
      // Countdown dilanjutkan dari angka terakhir
      startCountdown(countdownVal > 0 ? countdownVal : 1);
      return;
    }
    if(raceOver) return;

    AudioController.playRaceBGM();
    cpuHoldUntil = Date.now() + cpuHoldRemaining;
    if(gameMode === '1p') startCpuLoop(); // startCpuLoop menghentikan interval lama dulu, jadi tidak ganda

    // Pemain yang sedang menunggu soal berikutnya: tampilkan sekarang.
    // (Tanpa ini tombol jawaban tetap terkunci setelah jeda.)
    ['p1', 'p2'].forEach(key => {
      if(key === 'p2' && gameMode !== '2p') return;
      if(state[key].isAnswering) renderQuestionFor(key);
    });
  }

  function startCountdown(initialCount = 3){
    isCountdown = true;
    countdownVal = initialCount;
    countdownOverlay.style.display = 'flex';
    
    if(countdownTimer){
      clearTimeout(countdownTimer);
      countdownTimer = null;
    }

    function tick(){
      if(isPaused) return;
      if(countdownVal > 0){
        countdownText.textContent = countdownVal;
        countdownText.style.animation = 'none';
        void countdownText.offsetWidth;
        countdownText.style.animation = 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
        AudioController.playBeep();
        countdownVal--;
        countdownTimer = setTimeout(tick, 1000);
      } else {
        countdownText.textContent = 'GO!';
        countdownText.style.animation = 'none';
        void countdownText.offsetWidth;
        countdownText.style.animation = 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
        AudioController.playGo();
        AudioController.playRaceBGM();
        countdownTimer = setTimeout(() => {
          if(isPaused) return;
          countdownOverlay.style.display = 'none';
          isCountdown = false;
          countdownTimer = null;
          renderQuestionFor('p1');
          if(gameMode === '2p') renderQuestionFor('p2');
          
          if(gameMode === '1p'){
            startCpuLoop();
          }
        }, 800);
      }
    }
    tick();
  }

  function startRace(mode, cls, diff){
    AudioController.playClick();
    clearRaceTimers();
    AudioController.stopBGM();
    gameMode = mode;
    selectedMode = mode;
    selectedClass = cls || selectedClass;
    selectedDifficulty = diff || selectedDifficulty;
    
    // Reset state
    raceOver = false;
    isCountdown = false;
    isPaused = false;
    if(pauseOverlay) pauseOverlay.style.display = 'none';

    // Bersihkan kotak penjelasan dan timer
    if(state.p1.explanationTimer) clearTimeout(state.p1.explanationTimer);
    if(state.p2.explanationTimer) clearTimeout(state.p2.explanationTimer);
    if(expP1) expP1.style.display = 'none';
    if(expP2) expP2.style.display = 'none';

    state.p1 = newPlayerState();
    state.p2 = newPlayerState();
    state.cpu1 = { pos:0 };
    state.cpu2 = { pos:0 };
    
    carP1.style.left = '0%';
    carP2.style.left = '0%';
    carCPU2.style.left = '0%';
    
    levelValue.textContent = `${CLASS_SHORT[selectedClass]} • ${DIFF_TITLES[selectedDifficulty]}`;
    
    if(gameMode === '1p'){
      screens.game.classList.add('mode-1p');
      screens.game.classList.remove('mode-2p');
      panelP1.classList.remove('flip-top');
      p1Name = "Kamu";
      laneLabelP1.textContent = p1Name.toUpperCase();
      // Dua lawan mendapat nama berbeda, dan tetap sama selama satu balapan
      cpuNames = shuffle(COMPUTER_NAMES).slice(0, 2);
      laneLabelP2.textContent = cpuNames[0];
      laneLabelCPU2.textContent = cpuNames[1];
      laneCPU2.style.display = 'block';
      panelsContainer.classList.remove('two-player');
      panelP2.style.display = 'none';
      hudP2.style.display = 'none';
      hudStreakP2.style.display = 'none';
      document.getElementById('hudLabelP1').textContent = 'Skor';
      document.getElementById('labelPanelP1').textContent = 'Pertanyaan';
    } else {
      screens.game.classList.add('mode-2p');
      screens.game.classList.remove('mode-1p');
      panelP1.classList.add('flip-top');
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
      const p2LabelEl = document.getElementById('labelPanelP2') || document.getElementById('panelP2').querySelector('.panel-label');
      if(p2LabelEl) p2LabelEl.textContent = p2Name;
    }
    
    updateHud();
    showScreen('game');
    
    // Clear panels
    qTextP1.textContent = '?'; gridP1.innerHTML = ''; fbP1.textContent = '';
    qTextP2.textContent = '?'; gridP2.innerHTML = ''; fbP2.textContent = '';
    
    startCountdown(3);
  }

  function endRace(winner){
    raceOver = true;
    isPaused = false;
    AudioController.stopBGM();
    clearRaceTimers();
    if(pauseOverlay) pauseOverlay.style.display = 'none';
    if(expP1) expP1.style.display = 'none';
    if(expP2) expP2.style.display = 'none';

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
        const winnerName = winner === 'cpu2' ? cpuNames[1] : cpuNames[0];
        endSubtitle.textContent = `${winnerName} menang kali ini. Ayo coba lagi, kamu pasti bisa menang!`;
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
    document.body.dataset.screen = name;
    if(name !== 'game'){
      screens.game.classList.remove('mode-1p', 'mode-2p');
      panelP1.classList.remove('flip-top');
    }
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
    let raw1 = document.getElementById('inputNameP1').value.trim() || 'P1';
    let raw2 = document.getElementById('inputNameP2').value.trim() || 'P2';
    // Sanitasi input mobile autocorrect (misal "p20"/"P20" dari keyboard sentuh dinormalkan ke "P2")
    if (/^p20$/i.test(raw2)) raw2 = 'P2';
    if (/^p10$/i.test(raw1)) raw1 = 'P1';
    p1Name = raw1;
    p2Name = raw2;
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

  // ---------- Pause / Resume Controls ----------
  // Semua jalur pause (tombol, Esc, tab tidak aktif) memakai pauseGame() dan resumeGame()
  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');

  pauseBtn.addEventListener('click', function(){
    AudioController.init();
    AudioController.playClick();
    pauseGame();
  });

  resumeBtn.addEventListener('click', function(){
    AudioController.init();
    AudioController.playClick();
    resumeGame();
  });

  // Mulai Ulang: mode, kelas, dan kesulitan sama; startRace mereset semua state
  restartBtn.addEventListener('click', function(){
    startRace(gameMode, selectedClass, selectedDifficulty);
  });

  // Tab tidak aktif -> jeda otomatis
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'hidden'){
      if(screens.game.classList.contains('active') && !raceOver) pauseGame();
      else if(screens.start.classList.contains('active')) AudioController.stopBGM();
    } else if(screens.start.classList.contains('active')){
      AudioController.playMenuBGM();
    }
  });

  // Init
  showScreen('start');
  renderBestScores();
})();
