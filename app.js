async function boot() {
  const CHAINS = await fetch("characters.json").then((r) => r.json());
  const FLAT = [];
  CHAINS.forEach((chain, ci) => {
    chain.chars.forEach((c, i) => {
      FLAT.push({ ...c, chain: ci, index: i });
    });
  });

  const store = {
    key: "hanzi-blocks-v2",
    read() {
      try { return JSON.parse(localStorage.getItem(this.key) || "{}"); }
      catch { return {}; }
    },
    write(data) { localStorage.setItem(this.key, JSON.stringify(data)); },
    data: { stars: {}, traces: {}, pos: 0 }
  };
  store.data = Object.assign(store.data, store.read());
  if (store.data.pos >= FLAT.length) store.data.pos = 0;

  const state = {
    page: "overview",
    pos: store.data.pos || 0,
    writer: null,
    quizLock: false,
    qIndex: 0,
    qSet: []
  };

  const $ = (id) => document.getElementById(id);
  const screen = $("screen");

  function save() {
    store.data.pos = state.pos;
    store.write(store.data);
    $("star-count").textContent = Object.keys(store.data.stars).length;
    const done = Object.keys(store.data.traces).length;
    $("progress-label").textContent = done + " / " + FLAT.length;
    $("progress-fill").style.width = Math.round((done / FLAT.length) * 100) + "%";
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1200);
  }

  function celebrate() {
    const box = $("confetti");
    box.innerHTML = "";
    ["\u2b50", "\ud83c\udf1f", "\u2728", "\ud83c\udf89", "\ud83d\udfe1", "\ud83d\udfe2"].forEach((bit, i) => {
      const s = document.createElement("span");
      s.className = "bit";
      s.textContent = bit;
      s.style.left = Math.random() * 100 + "%";
      s.style.animationDuration = 0.8 + Math.random() * 0.6 + "s";
      s.style.animationDelay = (i * 0.03) + "s";
      box.appendChild(s);
    });
    setTimeout(() => { box.innerHTML = ""; }, 1300);
  }

  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices() || []; };
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;

  function pickVoice(prefix) {
    const list = voices.length ? voices : speechSynthesis.getVoices();
    return list.find((v) => v.lang.toLowerCase().startsWith(prefix))
      || list.find((v) => v.lang.toLowerCase().includes(prefix.slice(0, 2)))
      || null;
  }

  function utter(text, lang) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const voice = pickVoice(lang === "zh-CN" ? "zh" : "en");
      if (voice) u.voice = voice;
      u.rate = lang === "zh-CN" ? 0.78 : 0.95;
      u.onend = resolve;
      u.onerror = resolve;
      speechSynthesis.speak(u);
    });
  }

  let speakToken = 0;
  async function speakBoth(c) {
    const token = ++speakToken;
    if (window.speechSynthesis) speechSynthesis.cancel();
    await utter(c.zi, "zh-CN");
    if (token !== speakToken) return;
    await new Promise((r) => setTimeout(r, 220));
    if (token !== speakToken) return;
    await utter(c.en, "en-US");
  }

  function current() { return FLAT[state.pos]; }
  function chainOf(pos) { return CHAINS[FLAT[pos].chain]; }

  function goOverview() {
    state.page = "overview";
    speakToken++;
    if (window.speechSynthesis) speechSynthesis.cancel();
    renderOverview();
  }

  function startAt(pos) {
    state.pos = pos;
    state.page = "lesson";
    save();
    renderLesson();
  }

  function renderOverview() {
    screen.className = "screen scroll";
    const cur = current();
    screen.innerHTML = `
      <div class="hero-start">
        <div class="next-zi">${cur.zi}</div>
        <div class="next-en">${cur.en}</div>
        <div class="next-py">${cur.py}</div>
        <button class="btn coral" id="go-now">${store.data.traces[cur.zi] ? "Keep going" : "Start"}</button>
      </div>
      <div class="chain-list">
        ${CHAINS.map((chain, ci) => {
          const here = cur.chain === ci;
          return `<button class="chain-row ${here ? "here" : ""}" data-chain="${ci}">
            <div class="zi-row">${chain.chars.map((c) => {
              const on = cur.zi === c.zi && here;
              const done = store.data.traces[c.zi] || store.data.stars[c.zi];
              return `<span class="mini ${on ? "now" : done ? "done" : ""}">${c.zi}</span>`;
            }).join("")}</div>
          </button>`;
        }).join("")}
      </div>`;
    $("go-now").onclick = () => startAt(state.pos);
    screen.querySelectorAll("[data-chain]").forEach((btn) => {
      btn.onclick = () => {
        const ci = +btn.dataset.chain;
        const pos = FLAT.findIndex((c) => c.chain === ci);
        startAt(pos);
      };
    });
  }

  function sizeWriterBox() {
    const wrap = screen.querySelector(".board-wrap");
    const box = $("writer-box");
    if (!wrap || !box) return 220;
    const side = Math.max(160, Math.min(wrap.clientWidth, wrap.clientHeight - 24, 360));
    box.style.width = side + "px";
    box.style.height = side + "px";
    return side;
  }

  function makeWriter(mode) {
    const box = $("writer-box");
    if (!box || !window.HanziWriter) return;
    box.innerHTML = "";
    const c = current();
    const size = sizeWriterBox();
    const writer = HanziWriter.create(box, c.zi, {
      width: size,
      height: size,
      padding: 14,
      strokeColor: "#2a2118",
      radicalColor: "#ef6b4a",
      outlineColor: "#e2d0aa",
      drawingColor: "#2aa7a0",
      highlightColor: "#f4b942",
      strokeAnimationSpeed: 1.05,
      delayBetweenStrokes: 160,
      showCharacter: mode === "watch",
      showOutline: true
    });
    state.writer = writer;
    const help = screen.querySelector(".trace-help");
    if (mode === "watch") {
      if (help) help.textContent = "Watch.";
      writer.animateCharacter({
        onComplete() {
          if (state.page !== "lesson") return;
          makeWriter("trace");
        }
      });
    } else {
      if (help) help.textContent = "Your turn.";
      writer.quiz({
        leniency: 1.6,
        showHintAfterMisses: 2,
        acceptBackwardsStrokes: true,
        highlightOnComplete: true,
        onCorrectStroke() { if (help) help.textContent = "Yes."; },
        onMistake(d) {
          if (help) help.textContent = d.mistakesOnStroke >= 2 ? "Follow the hint." : "Try that stroke again.";
        },
        onComplete() {
          store.data.traces[c.zi] = true;
          store.data.stars[c.zi] = true;
          save();
          celebrate();
          if (help) help.textContent = "Next!";
        }
      });
    }
  }

  function renderLesson() {
    screen.className = "screen";
    const c = current();
    const chain = chainOf(state.pos);
    screen.innerHTML = `
      <div class="lesson">
        <div class="lesson-head">
          <button class="icon-btn" id="back">\u2190</button>
          <div class="lesson-count">${c.index + 1} / ${chain.chars.length}</div>
        </div>
        <div class="meet">
          <div class="pic">${c.emoji}</div>
          <div class="zi">${c.zi}</div>
          <div class="en">${c.en}</div>
          <div class="py">${c.py}</div>
          <div class="tip">${c.tip}</div>
        </div>
        <div class="board-wrap">
          <div id="writer-box"></div>
          <div class="trace-help"></div>
        </div>
        <div class="lesson-nav">
          <button class="icon-btn" id="replay" title="Hear again">\ud83d\udd0a</button>
          <button class="btn coral" id="next">Next</button>
        </div>
      </div>`;
    $("back").onclick = goOverview;
    $("replay").onclick = () => speakBoth(c);
    $("next").onclick = nextStep;
    requestAnimationFrame(() => {
      makeWriter("watch");
      speakBoth(c);
    });
  }

  function nextStep() {
    const c = current();
    const chain = chainOf(state.pos);
    if (c.index < chain.chars.length - 1) {
      state.pos += 1;
      save();
      renderLesson();
      return;
    }
    renderCompare();
  }

  function renderCompare() {
    state.page = "compare";
    speakToken++;
    if (window.speechSynthesis) speechSynthesis.cancel();
    const chain = chainOf(state.pos);
    screen.className = "screen";
    screen.innerHTML = `
      <div class="compare">
        <div class="lesson-head">
          <button class="icon-btn" id="back">\u2190</button>
          <div class="lesson-count">Look</div>
        </div>
        <div class="compare-grid">
          ${chain.chars.map((c) => `
            <button class="compare-card ${c.twin ? "twin" : ""}" data-zi="${c.zi}">
              <div class="g">${c.zi}</div>
              <div class="e">${c.en}</div>
            </button>`).join("")}
        </div>
        <div class="lesson-nav">
          <button class="btn coral" id="next">Next</button>
        </div>
      </div>`;
    $("back").onclick = goOverview;
    screen.querySelectorAll(".compare-card").forEach((btn) => {
      btn.onclick = () => {
        const ch = chain.chars.find((x) => x.zi === btn.dataset.zi);
        if (ch) speakBoth(ch);
      };
    });
    $("next").onclick = startChainQuiz;
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startChainQuiz() {
    const chain = chainOf(state.pos);
    const pool = chain.chars.slice();
    const qs = [];
    pool.forEach((c) => {
      const others = shuffled(pool.filter((x) => x.zi !== c.zi)).slice(0, 2);
      if (c.twin) {
        const twin = pool.find((x) => x.zi === c.twin);
        if (twin && !others.some((o) => o.zi === twin.zi)) others[0] = twin;
      }
      qs.push({ ask: c, choices: shuffled([c, ...others.slice(0, 2)]) });
    });
    state.qSet = shuffled(qs).slice(0, Math.min(3, qs.length));
    state.qIndex = 0;
    state.quizLock = false;
    renderQuiz();
  }

  function renderQuiz() {
    state.page = "quiz";
    const q = state.qSet[state.qIndex];
    screen.className = "screen";
    screen.innerHTML = `
      <div class="quiz">
        <div class="lesson-head">
          <button class="icon-btn" id="back">\u2190</button>
          <div class="lesson-count">${state.qIndex + 1} / ${state.qSet.length}</div>
        </div>
        <div class="quiz-q">${q.ask.emoji} ${q.ask.en}</div>
        <div class="quiz-choices">
          ${q.choices.map((ch) => `<button class="q-choice" data-zi="${ch.zi}">${ch.zi}</button>`).join("")}
        </div>
      </div>`;
    $("back").onclick = goOverview;
    speakBoth(q.ask);
    screen.querySelectorAll(".q-choice").forEach((btn) => {
      btn.onclick = () => {
        if (state.quizLock) return;
        if (btn.dataset.zi === q.ask.zi) {
          state.quizLock = true;
          btn.classList.add("right");
          store.data.stars[q.ask.zi] = true;
          save();
          celebrate();
          setTimeout(() => {
            if (state.qIndex < state.qSet.length - 1) {
              state.qIndex += 1;
              state.quizLock = false;
              renderQuiz();
            } else {
              advanceChain();
            }
          }, 650);
        } else {
          btn.classList.add("wrong");
          toast("Not that one.");
        }
      };
    });
  }

  function advanceChain() {
    const chain = chainOf(state.pos);
    const nextPos = state.pos - chain.chars[chain.chars.length - 1].index + chain.chars.length;
    if (nextPos >= FLAT.length) {
      toast("You finished!");
      celebrate();
      state.pos = 0;
      save();
      goOverview();
      return;
    }
    startAt(nextPos);
  }

  window.addEventListener("resize", () => {
    if (state.page === "lesson" && $("writer-box")) {
      makeWriter("trace");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && window.speechSynthesis) speechSynthesis.cancel();
  });

  save();
  renderOverview();
}

boot();
