async function boot() {
  const UNITS = await fetch('characters.json').then(r => r.json());
  const store = {
    read() {
      try { return JSON.parse(localStorage.getItem('hanzi-blocks-v1') || '{}'); }
      catch { return {}; }
    },
    write(data) { localStorage.setItem('hanzi-blocks-v1', JSON.stringify(data)); },
    data: { stars: {}, traces: {}, last: { unit: 0, char: 0 } }
  };
  store.data = Object.assign(store.data, store.read());
  const state = {
    screen: 'home', unit: store.data.last.unit || 0, char: store.data.last.char || 0,
    writer: null, cardFlipped: false, cardQueue: [], cardIndex: 0, cardChoices: []
  };
  const $ = (id) => document.getElementById(id);
  const toastEl = $('toast');
  function save() {
    store.data.last = { unit: state.unit, char: state.char };
    store.write(store.data);
    $('star-count').textContent = Object.keys(store.data.stars).length;
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 1400);
  }
  function celebrate() {
    const box = $('confetti');
    box.innerHTML = '';
    const bits = ['\u2b50', '\ud83c\udf1f', '\u2728', '\ud83c\udf89', '\ud83d\udfe1', '\ud83d\udfe2', '\ud83d\udd35'];
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('span');
      s.className = 'bit';
      s.textContent = bits[i % bits.length];
      s.style.left = Math.random() * 100 + '%';
      s.style.animationDuration = (0.8 + Math.random() * 0.7) + 's';
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 1400);
  }
  let voices = [];
  function loadVoices() { voices = speechSynthesis.getVoices() || []; }
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
  function pickVoice(lang) {
    const list = voices.length ? voices : speechSynthesis.getVoices();
    return list.find(v => v.lang.toLowerCase().startsWith(lang)) || list.find(v => v.lang.toLowerCase().includes(lang.slice(0, 2))) || null;
  }
  function speak(text, lang) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voice = pickVoice(lang === 'zh-CN' ? 'zh' : 'en');
    if (voice) u.voice = voice;
    u.rate = lang === 'zh-CN' ? 0.78 : 1;
    speechSynthesis.speak(u);
  }
  function speakChar(c) { speak(c.zi, 'zh-CN'); }
  function currentUnit() { return UNITS[state.unit]; }
  function currentChar() { return currentUnit().chars[state.char]; }
  function isStarred(c) { return !!store.data.stars[c.zi]; }
  function isTraced(c) { return !!store.data.traces[c.zi]; }
  function unitProgress(unit) {
    return unit.chars.filter(c => store.data.stars[c.zi] || store.data.traces[c.zi]).length;
  }
  function go(screen) {
    state.screen = screen;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
    $('screen-' + screen).classList.add('on');
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.go === screen));
    if (screen === 'home') renderHome();
    if (screen === 'list') renderList();
    if (screen === 'play') renderPlay();
    if (screen === 'cards') renderCards();
  }
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => go(tab.dataset.go)));
  function renderHome() {
    const root = $('screen-home');
    root.innerHTML = '<div class="unit-grid">' + UNITS.map((u, i) => {
      const done = unitProgress(u);
      return '<button class="unit-card" data-unit="' + i + '">' +
        '<div class="unit-kicker" style="color:' + u.color + '">' + u.kicker + '</div>' +
        '<div class="unit-title">' + u.title + '</div>' +
        '<div class="unit-row">' + u.chars.map(c => '<span class="mini ' + ((isStarred(c) || isTraced(c)) ? 'done' : '') + '">' + c.zi + '</span>').join('') + '</div>' +
        '<div class="progress-tiny">' + done + ' / ' + u.chars.length + ' practiced</div></button>';
    }).join('') + '</div>';
    root.querySelectorAll('[data-unit]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.unit = +btn.dataset.unit; state.char = 0; save(); go('list');
      });
    });
  }
  function renderList() {
    const unit = currentUnit();
    const root = $('screen-list');
    root.innerHTML = '<div class="family-head"><button class="back" id="list-back">\u2190</button><div>' +
      '<div class="unit-kicker" style="color:' + unit.color + '">' + unit.kicker + '</div>' +
      '<h2 class="unit-title">' + unit.title + '</h2></div></div>' +
      '<div class="compare-note">' + unit.note + '</div><div class="char-list">' +
      unit.chars.map((c, i) => {
        return '<button class="char-row ' + (c.twin ? 'twin' : '') + '" data-i="' + i + '">' +
          '<div class="glyph">' + c.zi + '</div><div class="meta">' +
          '<div class="en">' + c.en + '</div>' +
          '<div class="py">' + c.py + (c.twin ? ' \u00b7 twin of ' + c.twin : '') + '</div>' +
          '<div class="hint">' + c.tip + '</div></div>' +
          '<div class="row-right"><div class="emoji-lg">' + c.emoji + '</div>' +
          '<div class="star">' + (isStarred(c) ? '\u2b50' : (isTraced(c) ? '\u2728' : '')) + '</div></div></button>';
      }).join('') + '</div>';
    document.getElementById('list-back').addEventListener('click', () => go('home'));
    root.querySelectorAll('[data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.char = +btn.dataset.i; save(); speakChar(currentChar()); go('play');
      });
    });
  }
  function makeWriter(mode) {
    const box = $('writer-box');
    if (!box || !window.HanziWriter) return;
    box.innerHTML = '';
    const size = Math.min(360, Math.floor(box.clientWidth || 300));
    const c = currentChar();
    const writer = HanziWriter.create(box, c.zi, {
      width: size, height: size, padding: 16,
      strokeColor: '#2b2118', radicalColor: '#ef6b4a', outlineColor: '#e2d0aa',
      drawingColor: '#2aa7a0', highlightColor: '#f4b942',
      strokeAnimationSpeed: 1, delayBetweenStrokes: 180,
      showCharacter: mode === 'watch', showOutline: true
    });
    state.writer = writer;
    const help = document.querySelector('.trace-help');
    if (mode === 'watch') {
      if (help) help.textContent = 'Watch the strokes\u2026';
      writer.animateCharacter();
    } else {
      if (help) help.textContent = 'Trace each stroke with your finger.';
      writer.quiz({
        leniency: 1.55, showHintAfterMisses: 2, acceptBackwardsStrokes: true, highlightOnComplete: true,
        onCorrectStroke() { if (help) help.textContent = 'Nice stroke!'; },
        onMistake(d) { if (help) help.textContent = d.mistakesOnStroke >= 2 ? 'Watch the hint\u2026' : 'Almost \u2014 try that stroke again.'; },
        onComplete(d) {
          store.data.traces[c.zi] = true; store.data.stars[c.zi] = true; save(); celebrate();
          toast(d.totalMistakes === 0 ? 'Perfect!' : 'You wrote ' + c.zi + '!');
          if (help) help.textContent = 'You did it!';
        }
      });
    }
  }
  function renderPlay() {
    const unit = currentUnit();
    const c = currentChar();
    const root = $('screen-play');
    root.innerHTML = '<div class="family-head"><button class="back" id="play-back">\u2190</button><div>' +
      '<div class="unit-kicker" style="color:' + unit.color + '">' + unit.title + ' \u00b7 ' + (state.char + 1) + '/' + unit.chars.length + '</div>' +
      '<h2 class="unit-title">' + c.en + '</h2></div></div>' +
      '<div class="play"><div class="hero"><div class="pic">' + c.emoji + '</div>' +
      '<div class="big-hanzi">' + c.zi + '</div><div class="meaning">' + c.en + '</div>' +
      '<div class="pinyin">' + c.py + '</div><p class="kid-note">' + c.tip + '</p>' +
      '<div class="actions"><button class="btn coral" id="say-zh">\ud83d\udd0a Say it</button>' +
      '<button class="btn sun" id="say-en">Talk English</button>' +
      '<button class="btn leaf" id="star-it">' + (isStarred(c) ? '\u2b50 Saved' : '\u2b50 I know it') + '</button></div></div>' +
      '<div class="board-wrap"><p class="board-label">Writing square</p><div id="writer-box"></div>' +
      '<p class="trace-help"></p><div class="actions">' +
      '<button class="btn teal" id="watch">\u25b6 Watch</button>' +
      '<button class="btn grape" id="trace">\u270d\ufe0f Trace</button>' +
      '<button class="btn ghost" id="again">Reset</button></div>' +
      '<div class="nav-chars"><button class="btn sky" id="prev">\u2190 Back</button>' +
      '<button class="btn sky" id="next">Next \u2192</button></div></div></div>';
    $('play-back').onclick = () => go('list');
    $('say-zh').onclick = () => speakChar(c);
    $('say-en').onclick = () => speak(c.en, 'en-US');
    $('star-it').onclick = () => { store.data.stars[c.zi] = true; save(); toast('Starred ' + c.zi); renderPlay(); };
    $('watch').onclick = () => makeWriter('watch');
    $('trace').onclick = () => makeWriter('trace');
    $('again').onclick = () => makeWriter('trace');
    $('prev').onclick = () => stepChar(-1);
    $('next').onclick = () => stepChar(1);
    requestAnimationFrame(() => makeWriter('watch'));
    speakChar(c);
  }
  function stepChar(dir) {
    const unit = currentUnit();
    const next = state.char + dir;
    if (next < 0) {
      if (state.unit > 0) { state.unit -= 1; state.char = currentUnit().chars.length - 1; }
    } else if (next >= unit.chars.length) {
      if (state.unit < UNITS.length - 1) { state.unit += 1; state.char = 0; }
      else { toast('You finished every family!'); celebrate(); }
    } else { state.char = next; }
    save(); renderPlay();
  }
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function renderCards() {
    const unit = currentUnit();
    if (!state.cardQueue.length || state.cardQueue[0].unitId !== unit.id) {
      state.cardQueue = shuffled(unit.chars.map(c => Object.assign({}, c, { unitId: unit.id })));
      state.cardIndex = 0; state.cardFlipped = false; state.cardChoices = [];
    }
    const c = state.cardQueue[state.cardIndex];
    if (!state.cardChoices.length || state.cardChoicesKey !== c.zi + unit.id) {
      const others = shuffled(unit.chars.filter(x => x.zi !== c.zi)).slice(0, 3);
      state.cardChoices = shuffled([c].concat(others));
      state.cardChoicesKey = c.zi + unit.id;
    }
    const choices = state.cardChoices;
    const root = $('screen-cards');
    root.innerHTML = '<div class="family-head"><button class="back" id="cards-back">\u2190</button><div>' +
      '<div class="unit-kicker" style="color:' + unit.color + '">Cards \u00b7 ' + unit.title + '</div>' +
      '<h2 class="unit-title">' + (state.cardIndex + 1) + ' / ' + state.cardQueue.length + '</h2></div></div>' +
      '<div class="flash-card" id="flash"><div><div class="front-zi">' + c.zi + '</div>' +
      '<div class="pinyin">' + (state.cardFlipped ? c.py + ' \u00b7 ' + c.en : 'Tap to peek') + '</div>' +
      '<div class="pic" style="margin-top:8px">' + (state.cardFlipped ? c.emoji : '\ud83d\ude48') + '</div></div></div>' +
      '<div class="actions" style="margin-top:12px"><button class="btn coral" id="card-say">\ud83d\udd0a Hear</button>' +
      '<button class="btn sun" id="card-peek">Peek</button></div>' +
      '<p class="kid-note" style="text-align:center">What does it mean?</p><div class="choice-grid">' +
      choices.map(ch => '<button class="choice" data-zi="' + ch.zi + '">' + ch.emoji + ' ' + ch.en + '</button>').join('') +
      '</div>';
    $('cards-back').onclick = () => go('list');
    $('flash').onclick = () => { state.cardFlipped = !state.cardFlipped; renderCards(); };
    $('card-say').onclick = () => speakChar(c);
    $('card-peek').onclick = () => { state.cardFlipped = true; renderCards(); };
    root.querySelectorAll('.choice').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.zi === c.zi) {
          btn.classList.add('right');
          store.data.stars[c.zi] = true; save(); celebrate();
          toast('Yes! ' + c.zi + ' is ' + c.en);
          setTimeout(() => {
            state.cardIndex = (state.cardIndex + 1) % state.cardQueue.length;
            state.cardFlipped = false; renderCards();
          }, 700);
        } else {
          btn.classList.add('wrong');
          toast('Not that one. Look again.');
        }
      };
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.speechSynthesis) speechSynthesis.cancel();
  });
  save();
  renderHome();
}
boot();
