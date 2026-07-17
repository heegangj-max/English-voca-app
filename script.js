/* script.js — 단어 암기장 앱 로직 */
(function () {
"use strict";

/* ---------- 1. 데이터 평탄화 ---------- */
const LESSON_IDS = Object.keys(VOCAB_DATA);
const WORDS = [];
LESSON_IDS.forEach((lid) => {
  const lessonNo = parseInt(lid, 10);
  let n = 0;
  VOCAB_DATA[lid].words.forEach(([en, ko, def, pos, example]) => {
    n++;
    WORDS.push({
      id: lid + "::" + en,
      lesson: lid,
      en, ko, def: def || "", pos: pos || "", example: example || "",
      num: lessonNo + "-" + n, // 단원별 번호 (예: 5-1, 5-2 ... 6-1, 6-2 ...)
    });
  });
});
const WORD_BY_ID = {};
WORDS.forEach((w) => (WORD_BY_ID[w.id] = w));

function isPureEnglish(str) { return !/[가-힣]/.test(str); }

/* ---------- 2. 저장소 ---------- */
const STORE_KEY = "vocabAppState_v2";
const DAY = 24 * 60 * 60 * 1000;
const EBBINGHAUS_DAYS = [1, 3, 7, 14, 30, 60];

function todayStr(d) {
  const dt = d ? new Date(d) : new Date();
  return dt.getFullYear() + "-" + (dt.getMonth() + 1) + "-" + dt.getDate();
}

function defaultState() {
  return {
    progress: {},
    stats: { totalCorrect: 0, totalWrong: 0, dailyLog: {}, lastActiveDate: null, streak: 0 },
    settings: { darkMode: false, systemTheme: true, autoSpeak: false, direction: "en2ko" },
  };
}

let STATE = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      progress: parsed.progress || base.progress,
      stats: Object.assign(base.stats, parsed.stats || {}),
      settings: Object.assign(base.settings, parsed.settings || {}),
    };
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(STATE));
}

function getProgress(id) {
  if (!STATE.progress[id]) {
    STATE.progress[id] = { status: "new", box: 0, due: null, lastReview: null, correct: 0, wrong: 0, favorite: false, everWrong: false };
  }
  return STATE.progress[id];
}

/* ---------- 3. SRS (에빙하우스 망각곡선) ---------- */
function srsUpdate(id, action) {
  const p = getProgress(id);
  const now = Date.now();
  p.lastReview = now;
  if (action === "known") {
    p.box = Math.min(p.box + 1, EBBINGHAUS_DAYS.length - 1);
    p.status = "known";
    p.due = now + EBBINGHAUS_DAYS[p.box] * DAY;
    p.correct++;
    STATE.stats.totalCorrect++;
  } else if (action === "unsure") {
    p.box = Math.max(p.box - 1, 0);
    p.status = "unsure";
    p.due = now + 1 * DAY;
  } else if (action === "unknown") {
    p.box = 0;
    p.status = "unknown";
    p.everWrong = true;
    p.due = now + 10 * 60 * 1000;
    p.wrong++;
    STATE.stats.totalWrong++;
  }
  logActivity();
  saveState();
}

function logActivity() {
  const t = todayStr();
  STATE.stats.dailyLog[t] = (STATE.stats.dailyLog[t] || 0) + 1;
  updateStreak();
}

function updateStreak() {
  const t = todayStr();
  const last = STATE.stats.lastActiveDate;
  if (last === t) return;
  if (last === todayStr(Date.now() - DAY)) {
    STATE.stats.streak = (STATE.stats.streak || 0) + 1;
  } else {
    STATE.stats.streak = 1;
  }
  STATE.stats.lastActiveDate = t;
}

function dueWords() {
  const now = Date.now();
  return WORDS.filter((w) => {
    const p = STATE.progress[w.id];
    return p && p.due !== null && p.due <= now;
  });
}
function newWords(limit) {
  const arr = WORDS.filter((w) => !STATE.progress[w.id] || STATE.progress[w.id].status === "new");
  return typeof limit === "number" ? arr.slice(0, limit) : arr;
}
function todaysQueue() {
  const due = dueWords();
  const fresh = newWords(20 - Math.min(due.length, 20));
  return shuffle(due.concat(fresh));
}

/* ---------- 4. 유틸 ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function normalizeKo(str) {
  return str.replace(/\([^)]*\)/g, "").split(/[;,、·\/]/).map((s) => s.trim()).filter(Boolean);
}
function checkKoAnswer(userInput, koField) {
  const norm = userInput.trim().replace(/\s+/g, "");
  if (!norm) return false;
  const parts = normalizeKo(koField);
  return parts.some((p) => {
    const pn = p.replace(/\s+/g, "");
    return pn === norm || pn.includes(norm) || norm.includes(pn);
  });
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1600);
}
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------- 5. 네비게이션 ---------- */
function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === id));
  const titles = { "view-home": "단어 암기장", "view-cards": "카드 학습", "view-quiz": "테스트", "view-list": "단어장", "view-stats": "통계", "view-settings": "설정" };
  document.getElementById("pageTitle").textContent = titles[id] || "단어 암기장";
  if (id === "view-home") renderHome();
  if (id === "view-list") renderList();
  if (id === "view-stats") renderStats();
  window.scrollTo(0, 0);
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.goto));
});
document.getElementById("settingsBtn").addEventListener("click", () => showView("view-settings"));

/* ---------- 6. 홈 화면 ---------- */
function renderHome() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "좋은 아침이에요!" : hour < 18 ? "안녕하세요!" : "오늘 하루도 수고했어요!";
  document.getElementById("greetingText").textContent = greet;
  document.getElementById("streakNum").textContent = STATE.stats.streak || 0;
  document.getElementById("dueTodayNum").textContent = todaysQueue().length;

  const box = document.getElementById("lessonProgressList");
  box.innerHTML = "";
  LESSON_IDS.forEach((lid) => {
    const words = WORDS.filter((w) => w.lesson === lid);
    const known = words.filter((w) => STATE.progress[w.id] && STATE.progress[w.id].status === "known").length;
    const pct = Math.round((known / words.length) * 100);
    const item = document.createElement("div");
    item.className = "lesson-progress-item";
    item.innerHTML =
      '<div class="lp-top"><strong>' + VOCAB_DATA[lid].name + " · " + VOCAB_DATA[lid].fullName + '</strong><span>' + known + " / " + words.length + '</span></div>' +
      '<div class="lp-bar"><div class="lp-fill" style="width:' + pct + '%"></div></div>';
    box.appendChild(item);
  });
}
document.getElementById("startReviewBtn").addEventListener("click", () => {
  cardState.pool = todaysQueue();
  if (cardState.pool.length === 0) cardState.pool = shuffle(WORDS.slice());
  cardState.idx = 0;
  cardState.weakOnly = false;
  const weakToggle = document.getElementById("cardWeakOnlyToggle");
  if (weakToggle) weakToggle.checked = false;
  showView("view-cards");
  setActiveLessonChips(cardChipsEl, new Set(LESSON_IDS));
  renderCard();
});

/* ---------- 7. 카드 학습 ---------- */
const cardChipsEl = document.getElementById("cardLessonChips");
let cardState = { lessons: new Set(LESSON_IDS), pool: [], idx: 0, direction: "en2ko", flipped: false, weakOnly: false };

function buildLessonChips(container, onChange) {
  container.innerHTML = "";
  const selected = new Set(LESSON_IDS);
  LESSON_IDS.forEach((lid) => {
    const chip = document.createElement("div");
    chip.className = "chip active";
    chip.textContent = VOCAB_DATA[lid].name;
    chip.dataset.lesson = lid;
    chip.addEventListener("click", () => {
      if (chip.classList.contains("active")) {
        if (selected.size > 1) { selected.delete(lid); chip.classList.remove("active"); }
      } else {
        selected.add(lid); chip.classList.add("active");
      }
      onChange(selected);
    });
    container.appendChild(chip);
  });
  return selected;
}
function setActiveLessonChips(container, set) {
  container.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", set.has(c.dataset.lesson)));
}

buildLessonChips(cardChipsEl, (sel) => {
  cardState.lessons = sel;
  resetCardPool();
});

document.getElementById("cardDirectionToggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".seg");
  if (!btn) return;
  document.querySelectorAll("#cardDirectionToggle .seg").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  cardState.direction = btn.dataset.dir;
  cardState.flipped = false;
  renderCard();
});

document.getElementById("cardWeakOnlyToggle").addEventListener("change", (e) => {
  cardState.weakOnly = e.target.checked;
  resetCardPool();
});

function resetCardPool() {
  // 단어장의 번호 순서(1, 2, 3 ...)와 동일하게, 섞지 않고 원래 순서대로 진행한다.
  // (순서를 바꾸고 싶으면 카드 화면의 "섞기" 버튼을 사용)
  // "애매해요·모르겠어요만 보기"가 켜져 있으면 그 두 상태의 단어만 남긴다.
  cardState.pool = WORDS.filter((w) => {
    if (!cardState.lessons.has(w.lesson)) return false;
    if (cardState.weakOnly) {
      const p = STATE.progress[w.id];
      return !!p && (p.status === "unsure" || p.status === "unknown");
    }
    return true;
  });
  cardState.idx = 0;
  cardState.flipped = false;
  renderCard();
}
resetCardPool();

function currentCard() {
  if (cardState.pool.length === 0) return null;
  if (cardState.idx >= cardState.pool.length) cardState.idx = 0;
  return cardState.pool[cardState.idx];
}

function renderCard() {
  const total = cardState.pool.length;
  const done = cardState.idx;
  document.getElementById("cardProgressText").textContent = Math.min(done + 1, total) + " / " + total;
  document.getElementById("cardProgressFill").style.width = total ? ((done / total) * 100) + "%" : "0%";

  const flipCard = document.getElementById("flipCard");
  flipCard.classList.remove("swipe-out-right", "swipe-out-left", "swipe-out-up");
  flipCard.classList.toggle("flipped", cardState.flipped);

  const w = currentCard();
  if (!w) {
    document.getElementById("cardWordFront").textContent = cardState.weakOnly ? "애매해요·모르겠어요 단어를 모두 외웠어요! 🎉" : "완료!";
    document.getElementById("cardTagFront").textContent = "";
    document.getElementById("cardNumFront").textContent = "";
    document.getElementById("cardNumBack").textContent = "";
    document.getElementById("cardPosFront").style.display = "none";
    return;
  }
  const dir = cardState.direction;
  const frontText = dir === "en2ko" ? w.en : w.ko.replace(/\([^)]*\)/g, "").split(/[;,]/)[0].trim();
  const backText = dir === "en2ko" ? w.ko : w.en;

  document.getElementById("cardNumFront").textContent = "#" + w.num;
  document.getElementById("cardNumBack").textContent = "#" + w.num;
  document.getElementById("cardTagFront").textContent = VOCAB_DATA[w.lesson].name;
  document.getElementById("cardPosFront").textContent = w.pos;
  document.getElementById("cardPosFront").style.display = w.pos ? "inline-block" : "none";
  document.getElementById("cardWordFront").textContent = frontText;

  document.getElementById("cardTagBack").textContent = VOCAB_DATA[w.lesson].name;
  document.getElementById("cardMeaningBack").textContent = backText;
  document.getElementById("cardDefBack").textContent = w.def || "";
  document.getElementById("cardExampleBack").textContent = w.example ? "“" + w.example + "”" : "";

  const favBtn = document.getElementById("cardFavBtn");
  const p = STATE.progress[w.id];
  favBtn.classList.toggle("active-fav", !!(p && p.favorite));

  if (STATE.settings.autoSpeak && isPureEnglish(w.en)) speak(w.en);
}

document.getElementById("flipStage").addEventListener("click", (e) => {
  if (dragState.dragging) return;
  cardState.flipped = !cardState.flipped;
  renderCard();
});

document.getElementById("cardSpeakBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const w = currentCard();
  if (w) speak(w.en.replace(/\([^)]*\)/g, ""));
});
document.getElementById("cardFavBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const w = currentCard();
  if (!w) return;
  const p = getProgress(w.id);
  p.favorite = !p.favorite;
  saveState();
  renderCard();
  toast(p.favorite ? "즐겨찾기에 추가했어요" : "즐겨찾기에서 제거했어요");
});
document.getElementById("cardShuffleBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  cardState.pool = shuffle(cardState.pool);
  cardState.idx = 0;
  cardState.flipped = false;
  renderCard();
  toast("순서를 섞었어요");
});

function advanceCard(action, exitClass) {
  const w = currentCard();
  if (!w) return;
  srsUpdate(w.id, action);
  const flipCard = document.getElementById("flipCard");
  flipCard.classList.add(exitClass);
  setTimeout(() => {
    cardState.flipped = false;
    if (cardState.weakOnly && action === "known") {
      // "애매해요·모르겠어요만 보기" 모드에서는 외웠다고 표시한 단어를
      // 이번 복습 세션 목록에서 바로 빼준다.
      cardState.pool.splice(cardState.idx, 1);
      if (cardState.idx >= cardState.pool.length) cardState.idx = Math.max(0, cardState.pool.length - 1);
    } else {
      cardState.idx++;
      if (cardState.idx >= cardState.pool.length) {
        cardState.pool = cardState.pool.slice();
        cardState.idx = cardState.pool.length;
      }
    }
    renderCard();
  }, 260);
}
document.getElementById("btnUnknown").addEventListener("click", () => advanceCard("unknown", "swipe-out-left"));
document.getElementById("btnUnsure").addEventListener("click", () => advanceCard("unsure", "swipe-out-up"));
document.getElementById("btnKnown").addEventListener("click", () => advanceCard("known", "swipe-out-right"));

/* 스와이프 제스처 */
const dragState = { dragging: false, startX: 0, startY: 0, moved: false };
const flipStageEl = document.getElementById("flipStage");
flipStageEl.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  dragState.dragging = true; dragState.moved = false;
  dragState.startX = t.clientX; dragState.startY = t.clientY;
}, { passive: true });
flipStageEl.addEventListener("touchmove", (e) => {
  if (!dragState.dragging) return;
  const t = e.touches[0];
  const dx = t.clientX - dragState.startX;
  const dy = t.clientY - dragState.startY;
  if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dragState.moved = true;
  const card = document.getElementById("flipCard");
  card.style.transition = "none";
  card.style.transform = "translate(" + dx + "px," + dy + "px) rotate(" + (dx / 20) + "deg)" + (cardState.flipped ? " rotateY(180deg)" : "");
}, { passive: true });
flipStageEl.addEventListener("touchend", (e) => {
  if (!dragState.dragging) return;
  dragState.dragging = false;
  const t = e.changedTouches[0];
  const dx = t.clientX - dragState.startX;
  const dy = t.clientY - dragState.startY;
  const card = document.getElementById("flipCard");
  card.style.transition = "";
  card.style.transform = "";
  const TH = 90;
  if (Math.abs(dx) > TH && Math.abs(dx) > Math.abs(dy)) {
    advanceCard(dx > 0 ? "known" : "unknown", dx > 0 ? "swipe-out-right" : "swipe-out-left");
  } else if (dy < -TH && Math.abs(dy) > Math.abs(dx)) {
    advanceCard("unsure", "swipe-out-up");
  }
  setTimeout(() => { dragState.moved = false; }, 50);
});

/* ---------- 8. 테스트(퀴즈) ---------- */
const quizChipsEl = document.getElementById("quizLessonChips");
let quizState = { lessons: new Set(LESSON_IDS), type: "mc-meaning", wrongOnly: false, pool: [], idx: 0, score: 0, wrongList: [] };
buildLessonChips(quizChipsEl, (sel) => { quizState.lessons = sel; });

document.querySelectorAll(".quiz-type-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".quiz-type-card").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    quizState.type = btn.dataset.type;
  });
});
document.getElementById("quizWrongOnlyToggle").addEventListener("change", (e) => {
  quizState.wrongOnly = e.target.checked;
});

function buildQuizPool() {
  let pool = WORDS.filter((w) => quizState.lessons.has(w.lesson));
  if (quizState.wrongOnly) {
    pool = pool.filter((w) => STATE.progress[w.id] && STATE.progress[w.id].everWrong);
  }
  if (quizState.type === "spell" || quizState.type === "mc-word") {
    pool = pool.filter((w) => isPureEnglish(w.en));
  }
  pool = shuffle(pool);
  return pool.slice(0, Math.min(pool.length, 20));
}

document.getElementById("quizStartBtn").addEventListener("click", () => {
  const pool = buildQuizPool();
  if (pool.length < 1) { toast("출제할 단어가 없어요"); return; }
  quizState.pool = pool;
  quizState.idx = 0;
  quizState.score = 0;
  quizState.wrongList = [];
  document.getElementById("quizSetup").style.display = "none";
  document.getElementById("quizResult").style.display = "none";
  document.getElementById("quizPlay").style.display = "block";
  renderQuizQuestion();
});

function renderQuizQuestion() {
  const area = document.getElementById("quizAnswerArea");
  const nextBtn = document.getElementById("quizNextBtn");
  nextBtn.style.display = "none";
  area.innerHTML = "";
  document.getElementById("quizScoreText").textContent = quizState.score + " / " + quizState.idx + "  (" + Math.min(quizState.idx + 1, quizState.pool.length) + "/" + quizState.pool.length + ")";

  if (quizState.idx >= quizState.pool.length) { finishQuiz(); return; }
  const w = quizState.pool[quizState.idx];
  document.getElementById("quizQTag").textContent = VOCAB_DATA[w.lesson].name + (w.pos ? " · " + w.pos : "");

  if (quizState.type === "mc-meaning") {
    document.getElementById("quizQText").textContent = w.en;
    const others = shuffle(WORDS.filter((x) => x.id !== w.id)).slice(0, 3);
    const options = shuffle([w, ...others]);
    options.forEach((opt) => {
      const div = document.createElement("div");
      div.className = "quiz-choice";
      div.textContent = opt.ko;
      div.addEventListener("click", () => gradeChoice(div, opt.id === w.id, w));
      area.appendChild(div);
    });
  } else if (quizState.type === "mc-word") {
    document.getElementById("quizQText").textContent = w.ko;
    const others = shuffle(WORDS.filter((x) => x.id !== w.id && isPureEnglish(x.en))).slice(0, 3);
    const options = shuffle([w, ...others]);
    options.forEach((opt) => {
      const div = document.createElement("div");
      div.className = "quiz-choice";
      div.textContent = opt.en;
      div.addEventListener("click", () => gradeChoice(div, opt.id === w.id, w));
      area.appendChild(div);
    });
  } else if (quizState.type === "spell") {
    document.getElementById("quizQText").textContent = w.ko;
    area.innerHTML = '<div class="quiz-input-row"><input type="text" id="quizTextInput" autocapitalize="off" autocorrect="off" placeholder="영어 단어를 입력하세요"><button class="quiz-submit-btn" id="quizSubmitBtn">확인</button></div><div id="quizFeedback"></div>';
    const input = document.getElementById("quizTextInput");
    const submit = () => {
      const ok = input.value.trim().toLowerCase() === w.en.trim().toLowerCase();
      gradeText(ok, w, input);
    };
    document.getElementById("quizSubmitBtn").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    setTimeout(() => input.focus(), 100);
  } else if (quizState.type === "short") {
    document.getElementById("quizQText").textContent = w.en;
    area.innerHTML = '<div class="quiz-input-row"><input type="text" id="quizTextInput" placeholder="뜻을 한국어로 입력하세요"><button class="quiz-submit-btn" id="quizSubmitBtn">확인</button></div><div id="quizFeedback"></div>';
    const input = document.getElementById("quizTextInput");
    const submit = () => { gradeText(checkKoAnswer(input.value, w.ko), w, input); };
    document.getElementById("quizSubmitBtn").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    setTimeout(() => input.focus(), 100);
  }
}

function gradeChoice(el, correct, w) {
  if (el.parentElement.dataset.locked) return;
  el.parentElement.dataset.locked = "1";
  [...el.parentElement.children].forEach((c) => {
    if (c.textContent === (quizState.type === "mc-meaning" ? w.ko : w.en)) c.classList.add("correct");
  });
  if (!correct) el.classList.add("wrong");
  finalizeAnswer(correct, w);
}
function gradeText(correct, w, inputEl) {
  inputEl.disabled = true;
  const fb = document.getElementById("quizFeedback");
  fb.className = "quiz-feedback " + (correct ? "ok" : "bad");
  fb.textContent = correct ? "정답이에요!" : "정답: " + (quizState.type === "spell" ? w.en : w.ko);
  finalizeAnswer(correct, w);
}
function finalizeAnswer(correct, w) {
  if (correct) { quizState.score++; srsUpdate(w.id, "known"); }
  else { quizState.wrongList.push(w); srsUpdate(w.id, "unknown"); }
  quizState.idx++;
  document.getElementById("quizNextBtn").style.display = "block";
}
document.getElementById("quizNextBtn").addEventListener("click", renderQuizQuestion);
document.getElementById("quizQuitBtn").addEventListener("click", () => {
  document.getElementById("quizPlay").style.display = "none";
  document.getElementById("quizSetup").style.display = "block";
});

function finishQuiz() {
  document.getElementById("quizPlay").style.display = "none";
  document.getElementById("quizResult").style.display = "block";
  const total = quizState.pool.length;
  document.getElementById("quizResultScore").textContent = quizState.score;
  document.getElementById("quizResultTotal").textContent = total;
  document.getElementById("quizResultRate").textContent = (total ? Math.round((quizState.score / total) * 100) : 0) + "%";
  const list = document.getElementById("quizWrongList");
  list.innerHTML = "";
  if (quizState.wrongList.length === 0) {
    list.innerHTML = '<div class="empty-msg">틀린 문제가 없어요, 완벽해요!</div>';
  } else {
    quizState.wrongList.forEach((w) => {
      const row = document.createElement("div");
      row.className = "wrong-review-item";
      row.innerHTML = "<b></b><span></span>";
      row.querySelector("b").textContent = w.en;
      row.querySelector("span").textContent = w.ko;
      list.appendChild(row);
    });
  }
}
document.getElementById("quizRestartBtn").addEventListener("click", () => {
  document.getElementById("quizResult").style.display = "none";
  document.getElementById("quizSetup").style.display = "block";
});

/* ---------- 9. 단어장(전체 목록) ---------- */
const listChipsEl = document.getElementById("listLessonChips");
let listState = { lessons: new Set(LESSON_IDS), filter: "all", search: "" };
buildLessonChips(listChipsEl, (sel) => { listState.lessons = sel; renderList(); });

document.querySelectorAll(".filter-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    listState.filter = btn.dataset.filter;
    renderList();
  });
});
document.getElementById("listSearch").addEventListener("input", (e) => {
  listState.search = e.target.value.trim().toLowerCase();
  renderList();
});

function renderList() {
  const body = document.getElementById("listBody");
  let words = WORDS.filter((w) => listState.lessons.has(w.lesson));
  if (listState.search) {
    words = words.filter((w) => w.en.toLowerCase().includes(listState.search) || w.ko.toLowerCase().includes(listState.search));
  }
  if (listState.filter === "fav") words = words.filter((w) => STATE.progress[w.id] && STATE.progress[w.id].favorite);
  if (listState.filter === "wrong") words = words.filter((w) => STATE.progress[w.id] && STATE.progress[w.id].everWrong);
  if (listState.filter === "unknown") words = words.filter((w) => !STATE.progress[w.id] || STATE.progress[w.id].status !== "known");

  if (words.length === 0) { body.innerHTML = '<div class="empty-msg">단어가 없어요</div>'; return; }
  body.innerHTML = "";
  words.forEach((w, i) => {
    const p = STATE.progress[w.id];
    const status = p ? p.status : "new";
    const row = document.createElement("div");
    row.className = "word-row";
    row.innerHTML =
      '<span class="wr-num"></span>' +
      '<span class="wr-badges"><span class="wr-badge ' + (status === "known" ? "known" : status === "unsure" ? "unsure" : status === "unknown" ? "unknown" : "") + '"></span></span>' +
      '<div class="wr-main"><div class="wr-en"></div><div class="wr-ko"></div></div>' +
      '<button class="wr-speak-btn" aria-label="발음"><svg viewBox="0 0 24 24" class="icon"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/></svg></button>' +
      '<button class="wr-fav-btn ' + (p && p.favorite ? "active" : "") + '" aria-label="즐겨찾기"><svg viewBox="0 0 24 24" class="icon"><path d="M12 20s-7-4.35-9.5-8.5C.5 8 2.3 4.5 6 4.5c2 0 3.5 1.2 4.5 2.6a2 2 0 003 0C14.5 5.7 16 4.5 18 4.5c3.7 0 5.5 3.5 3.5 7C19.5 15.65 12 20 12 20z" fill="' + (p && p.favorite ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.4"/></svg></button>';
    row.querySelector(".wr-num").textContent = w.num + ".";
    const enEl = row.querySelector(".wr-en");
    enEl.textContent = w.en;
    if (w.pos) { const s = document.createElement("span"); s.className = "wr-pos"; s.textContent = w.pos; enEl.appendChild(s); }
    row.querySelector(".wr-ko").textContent = w.ko;
    row.querySelector(".wr-speak-btn").addEventListener("click", () => speak(w.en.replace(/\([^)]*\)/g, "")));
    row.querySelector(".wr-fav-btn").addEventListener("click", (ev) => {
      const pr = getProgress(w.id);
      pr.favorite = !pr.favorite;
      saveState();
      renderList();
    });
    body.appendChild(row);
  });
}

/* ---------- 10. 통계 ---------- */
function renderStats() {
  const t = todayStr();
  document.getElementById("statTodayCount").textContent = STATE.stats.dailyLog[t] || 0;
  const total = Object.values(STATE.stats.dailyLog).reduce((a, b) => a + b, 0);
  document.getElementById("statTotalCount").textContent = total;
  const c = STATE.stats.totalCorrect, wr = STATE.stats.totalWrong;
  document.getElementById("statAccuracy").textContent = (c + wr) ? Math.round((c / (c + wr)) * 100) + "%" : "0%";
  document.getElementById("statStreak").textContent = STATE.stats.streak || 0;

  const box = document.getElementById("statLessonList");
  box.innerHTML = "";
  let knownAll = 0;
  LESSON_IDS.forEach((lid) => {
    const words = WORDS.filter((w) => w.lesson === lid);
    const known = words.filter((w) => STATE.progress[w.id] && STATE.progress[w.id].status === "known").length;
    knownAll += known;
    const pct = Math.round((known / words.length) * 100);
    const item = document.createElement("div");
    item.className = "lesson-progress-item";
    item.innerHTML =
      '<div class="lp-top"><strong>' + VOCAB_DATA[lid].name + '</strong><span>' + pct + '%</span></div>' +
      '<div class="lp-bar"><div class="lp-fill" style="width:' + pct + '%"></div></div>';
    box.appendChild(item);
  });
  const overallPct = Math.round((knownAll / WORDS.length) * 100);
  document.getElementById("statRingPct").textContent = overallPct + "%";
  const circle = document.getElementById("statRingCircle");
  const circumference = 2 * Math.PI * 52;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference * (1 - overallPct / 100);
}

/* ---------- 11. 설정 ---------- */
function applyTheme() {
  const useDark = STATE.settings.systemTheme
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : STATE.settings.darkMode;
  document.documentElement.setAttribute("data-theme", useDark ? "dark" : "light");
}
document.getElementById("darkModeToggle").addEventListener("change", (e) => {
  STATE.settings.darkMode = e.target.checked;
  saveState(); applyTheme();
});
document.getElementById("systemThemeToggle").addEventListener("change", (e) => {
  STATE.settings.systemTheme = e.target.checked;
  saveState(); applyTheme();
});
document.getElementById("autoSpeakToggle").addEventListener("change", (e) => {
  STATE.settings.autoSpeak = e.target.checked;
  saveState();
});
if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (STATE.settings.systemTheme) applyTheme(); });
}

document.getElementById("backupBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vocab-backup-" + todayStr().replace(/\//g, "-") + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("백업 파일을 저장했어요");
});
document.getElementById("restoreBtn").addEventListener("click", () => document.getElementById("restoreFileInput").click());
document.getElementById("restoreFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.progress || !data.stats || !data.settings) throw new Error("invalid");
      STATE = data;
      saveState();
      applyTheme();
      document.getElementById("darkModeToggle").checked = STATE.settings.darkMode;
      document.getElementById("systemThemeToggle").checked = STATE.settings.systemTheme;
      document.getElementById("autoSpeakToggle").checked = STATE.settings.autoSpeak;
      renderHome();
      toast("데이터를 복원했어요");
    } catch (err) {
      toast("올바른 백업 파일이 아니에요");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});
document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("모든 학습 기록을 초기화할까요? 이 작업은 되돌릴 수 없어요.")) return;
  STATE = defaultState();
  saveState();
  applyTheme();
  resetCardPool();
  renderHome();
  toast("초기화했어요");
});

/* ---------- 12. 초기화 ---------- */
document.getElementById("darkModeToggle").checked = STATE.settings.darkMode;
document.getElementById("systemThemeToggle").checked = STATE.settings.systemTheme;
document.getElementById("autoSpeakToggle").checked = STATE.settings.autoSpeak;
applyTheme();
renderHome();

/* 서비스 워커 등록은 index.html의 인라인 스크립트에서 처리됨.
   여기서는 "새 버전 발견" 이벤트를 받아 업데이트 배너만 제어한다. */
window.addEventListener("sw-update-available", (e) => {
  const reg = e.detail;
  const banner = document.getElementById("updateBanner");
  const btn = document.getElementById("updateReloadBtn");
  if (!banner || !btn) return;
  banner.hidden = false;
  btn.onclick = () => {
    const waiting = reg && reg.waiting;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
    banner.hidden = true;
  };
});

})();
