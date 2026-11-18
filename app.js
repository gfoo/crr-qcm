"use strict";

const STORAGE_KEY = "crr-revision-v1";
const SERIES_SIZE = 12;
const REVIEW_SIZE = 20;
const VALIDATION_RATIO = 0.8;
const READY_EXAMS = 3;
const EXAMS_KEPT = 20;
const EXAMS_SHOWN = 5;
const EXAM_SECONDS = 22;
const SPEECH_START_TIMEOUT_MS = 3000;
const SPEECH_TIMEOUT_MS = 30000;
const REMOTE_SLOW_MS = 10000;
const MAX_BOX = 5;
const ANCHORED_BOX = 4;
// Leitner boxes: a wrong answer sends the card back to box 1, due again at once;
// every right answer moves it up one box and spaces the next review further out.
const INTERVAL_DAYS = [0, 0, 1, 3, 7, 15];
const DAY_MS = 24 * 60 * 60 * 1000;
const LETTERS = "ABCD";

const DATA = window.CRR_DATA;
const PART_IDS = Object.keys(DATA.parts).map(Number);
const EXAM_SIZE = PART_IDS.reduce((sum, part) => sum + DATA.parts[part].examCount, 0);
const PERMANENT_DB_ERRORS = new Set([
  "invalid_argument", "quota_exceeded", "revoked", "not_granted",
  "capability_disabled", "capability_removed", "transform_error",
]);

const QUESTIONS = DATA.lessons.flatMap((lesson) =>
  lesson.questions.map((q) => ({
    // Keyed on the text so that reordering or inserting questions keeps everyone's progress.
    id: hashId(q.q),
    lessonId: lesson.id,
    part: q.part ?? lesson.part,
    text: q.q,
    answers: q.a,
    why: q.why,
    page: q.p,
  })),
);

const app = document.getElementById("app");
const speechAvailable = "speechSynthesis" in window;

let localStorageOk = true;
let progress = loadLocalProgress();
let view = { name: "home" };
let session = null;
let examTick = null;
let examToken = 0;
// A claude.ai viewer defines window.claude before any script runs; elsewhere progress stays local.
let syncState = window.claude?.use ? "connecting" : "local";
let remoteRef = null;
let remoteWriting = false;
let remoteDirty = false;

function hashId(text) {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replace(/ ([?!:;»])/g, " $1")
    .replaceAll("« ", "« ");
}

function rich(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function emptyProgress() {
  return { cards: {}, validated: {}, unlockAll: false, voice: false, exams: [], updatedAt: 0 };
}

function loadLocalProgress() {
  try {
    return { ...emptyProgress(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") };
  } catch {
    localStorageOk = false;
    return emptyProgress();
  }
}

function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    localStorageOk = true;
  } catch {
    localStorageOk = false;
  }
}

function saveProgress() {
  progress.updatedAt = Date.now();
  writeLocal();
  pushRemote();
}

// Answers given on this device while the account was out of reach must not be lost,
// nor erase those given elsewhere: each question keeps its most recent answer.
function mergeProgress(local, remote) {
  const cards = { ...local.cards };
  for (const [id, remoteCard] of Object.entries(remote.cards)) {
    if (!cards[id] || remoteCard.last > cards[id].last) cards[id] = remoteCard;
  }
  const exams = [...new Map([...local.exams, ...remote.exams].map((exam) => [exam.date, exam])).values()]
    .sort((a, b) => a.date - b.date)
    .slice(-EXAMS_KEPT);
  const newer = local.updatedAt >= remote.updatedAt ? local : remote;
  return {
    ...newer,
    cards,
    validated: { ...local.validated, ...remote.validated },
    exams,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

async function connectRemote() {
  if (!window.claude?.use) return;
  const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
  const userId = await user?.id();
  if (!db || !userId) {
    setSyncState("local");
    return;
  }

  const slowTimer = setTimeout(() => setSyncState("slow"), REMOTE_SLOW_MS);
  try {
    const ref = db.doc(`data/users/${userId}/progress`);
    const snapshot = await ref.get();
    const stored = { ...emptyProgress(), ...(snapshot.exists ? structuredClone(snapshot.data()) : {}) };
    const hasUnsentAnswers = progress.updatedAt > stored.updatedAt;
    progress = mergeProgress(progress, stored);
    writeLocal();
    remoteRef = ref;
    setSyncState("online");
    if (hasUnsentAnswers) pushRemote();
    if (view.name === "home" || view.name === "lesson") render();
  } catch {
    setSyncState("failed");
  } finally {
    clearTimeout(slowTimer);
  }
}

// One write in flight at a time: answers given meanwhile leave with the next write.
async function pushRemote(isRetry = false) {
  if (!remoteRef) return;
  if (remoteWriting) {
    remoteDirty = true;
    return;
  }
  remoteWriting = true;
  remoteDirty = false;
  try {
    await remoteRef.set(structuredClone(progress));
    setSyncState("online");
  } catch (error) {
    setSyncState("failed");
    if (PERMANENT_DB_ERRORS.has(error?.code)) remoteRef = null;
    else if (!isRetry) setTimeout(() => pushRemote(true), 1000 + Math.random() * 2000);
  } finally {
    remoteWriting = false;
  }
  if (remoteDirty) pushRemote();
}

function setSyncState(state) {
  syncState = state;
  const line = document.getElementById("sync-status");
  if (line) line.outerHTML = syncStatusLine();
}

function syncStatusLine() {
  const kept = localStorageOk
    ? "vos réponses restent gardées sur cet appareil"
    : "votre progression sera perdue en fermant la page";
  const messages = {
    local: localStorageOk
      ? "Votre progression est enregistrée sur cet appareil : utilisez toujours le même téléphone et le même navigateur. Site prévu pour smartphone."
      : `Le navigateur refuse l’enregistrement : ${kept}.`,
    connecting: "Connexion à votre compte…",
    slow: `Votre compte ne répond pas encore : ${kept} en attendant.`,
    online: "Progression enregistrée sur votre compte Claude.",
    failed: `L’enregistrement sur votre compte a échoué : ${kept}.`,
  };
  const alarming = syncState === "local" || (!localStorageOk && syncState !== "online" && syncState !== "connecting");
  return `<p id="sync-status" class="sync small ${alarming ? "notice" : "muted"}">${escapeHtml(messages[syncState])}</p>`;
}

function card(questionId) {
  return progress.cards[questionId] ?? { box: 0, last: 0 };
}

function recordAnswer(questionId, correct) {
  const { box } = card(questionId);
  progress.cards[questionId] = {
    box: correct ? Math.min(Math.max(box, 1) + 1, MAX_BOX) : 1,
    last: Date.now(),
  };
}

function isDue(questionId, now) {
  const { box, last } = card(questionId);
  return box > 0 && now >= last + INTERVAL_DAYS[box] * DAY_MS;
}

function isKnown(questionId) {
  return card(questionId).box >= 2;
}

function lessonQuestions(lessonId) {
  return QUESTIONS.filter((q) => q.lessonId === lessonId);
}

function lessonStats(lessonId) {
  const questions = lessonQuestions(lessonId);
  return {
    total: questions.length,
    known: questions.filter((q) => isKnown(q.id)).length,
    seen: questions.filter((q) => card(q.id).box > 0).length,
  };
}

function isUnlocked(index) {
  return progress.unlockAll || index === 0 || Boolean(progress.validated[DATA.lessons[index - 1].id]);
}

function nextLessonIndex() {
  return DATA.lessons.findIndex((lesson, index) => isUnlocked(index) && !progress.validated[lesson.id]);
}

function dueQuestions() {
  const now = Date.now();
  return QUESTIONS.filter((q) => isDue(q.id, now));
}

function partKnownRatio(part) {
  const questions = QUESTIONS.filter((q) => q.part === part);
  return questions.filter((q) => isKnown(q.id)).length / questions.length;
}

function weakestFirst(questions) {
  return shuffle(questions).sort((a, b) => card(a.id).box - card(b.id).box);
}

function pickExam() {
  return PART_IDS.flatMap((part) => {
    // One question per lesson in turn, so that a big lesson such as the alphabet cannot
    // crowd the others out of a part.
    const pools = shuffle(
      DATA.lessons
        .map((lesson) => shuffle(QUESTIONS.filter((q) => q.part === part && q.lessonId === lesson.id)))
        .filter((pool) => pool.length > 0),
    );
    const picked = [];
    for (let i = 0; picked.length < DATA.parts[part].examCount && pools.some((p) => p.length); i++) {
      const pool = pools[i % pools.length];
      if (pool.length) picked.push(pool.pop());
    }
    return shuffle(picked);
  });
}

function startSession(kind, questions, extra = {}) {
  session = {
    kind,
    items: questions.map((q) => ({
      q,
      choices: shuffle(q.answers.map((text, i) => ({ text, correct: i === 0 }))),
    })),
    index: 0,
    results: [],
    selected: null,
    answered: false,
    newlyValidated: [],
    ...extra,
  };
}

function go(nextView) {
  stopExam();
  view = nextView;
  render();
  window.scrollTo(0, 0);
}

function render() {
  const screens = {
    home: renderHome,
    lesson: renderLesson,
    question: renderQuestion,
    seriesEnd: renderSeriesEnd,
    exam: renderExamQuestion,
    examEnd: renderExamEnd,
  };
  app.innerHTML = screens[view.name]();
  app.querySelector("[autofocus]")?.focus();
}

function progressBar(ratio, label, extraClass = "") {
  const percent = Math.round(ratio * 100);
  return `<div class="bar ${extraClass}" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(label)}"><span style="width:${percent}%"></span></div>`;
}

function partChip(part) {
  return `<span class="chip chip-part${part}">${escapeHtml(DATA.parts[part].short)}</span>`;
}

function readinessChecks() {
  const validatedCount = DATA.lessons.filter((lesson) => progress.validated[lesson.id]).length;
  const weakestPart = Math.min(...PART_IDS.map(partKnownRatio));
  const recentPassed = progress.exams.slice(-READY_EXAMS).filter((exam) => exam.passed).length;
  return [
    {
      label: "Toutes les étapes du parcours validées",
      value: `${validatedCount} / ${DATA.lessons.length}`,
      done: validatedCount === DATA.lessons.length,
    },
    {
      label: `${VALIDATION_RATIO * 100} % des questions sues dans chaque partie`,
      value: `${Math.floor(weakestPart * 100)} % au plus bas`,
      done: weakestPart >= VALIDATION_RATIO,
    },
    {
      label: `Les ${READY_EXAMS} derniers examens blancs réussis`,
      value: `${recentPassed} / ${READY_EXAMS}`,
      done: recentPassed === READY_EXAMS,
    },
  ];
}

function examHistory() {
  if (progress.exams.length === 0) return "";
  const rows = progress.exams.slice(-EXAMS_SHOWN).reverse().map((exam) => `<tr>
      <td>${new Date(exam.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</td>
      <td class="num">${exam.score} / ${EXAM_SIZE}</td>
      <td class="num muted">${exam.parts ? exam.parts.map((p) => `${p.good}/${p.total}`).join(" · ") : ""}</td>
      <td class="num">${exam.passed ? `<span class="tag tag-right">reçu</span>` : `<span class="tag tag-wrong">ajourné</span>`}</td>
    </tr>`).join("");
  return `
    <h3>Derniers examens blancs</h3>
    <div class="table-scroll">
      <table class="parts-table">
        <thead><tr><th>Date</th><th class="num">Score</th><th class="num">Par partie</th><th class="num">Verdict</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderProgress() {
  const count = (test) => QUESTIONS.filter(test).length;
  const stats = [
    { label: "Vues", value: count((q) => card(q.id).box > 0), hint: "posées au moins une fois" },
    { label: "Sues", value: count((q) => isKnown(q.id)), hint: "dernière réponse juste" },
    { label: "Ancrées", value: count((q) => card(q.id).box >= ANCHORED_BOX), hint: "justes 3 fois de suite ou plus" },
  ].map((s) => `<div class="stat">
      <span class="stat-value">${s.value}</span>
      <span class="stat-label">${s.label}</span>
      <span class="stat-hint">${s.hint}</span>
    </div>`).join("");

  const parts = PART_IDS.map((part) => {
    const ratio = partKnownRatio(part);
    return `<div class="part-row">
      <div class="part-head"><span>${escapeHtml(DATA.parts[part].name)}</span><strong>${Math.floor(ratio * 100)} %</strong></div>
      ${progressBar(ratio, DATA.parts[part].name, "has-target")}
    </div>`;
  }).join("");

  const checks = readinessChecks();
  const checklist = checks.map((check) => `<li class="${check.done ? "is-done" : ""}">
      <span class="check" aria-hidden="true">${check.done ? "✓" : ""}</span>
      <span>${escapeHtml(check.label)}</span>
      <span class="check-value">${escapeHtml(check.value)}</span>
    </li>`).join("");
  const ready = checks.every((check) => check.done);

  return `
    <section class="panel">
      <h2>Ma progression</h2>
      <p class="muted small">Sur les ${QUESTIONS.length} questions du parcours.</p>
      <div class="stats">${stats}</div>
      <h3>Par partie d’examen</h3>
      <p class="muted small">Part des questions sues. Le trait marque l’objectif de ${VALIDATION_RATIO * 100} % ; à l’examen, il faut la moyenne dans chacune des trois parties.</p>
      ${parts}
      <h3>Prêt pour l’examen ?</h3>
      <ul class="checklist">${checklist}</ul>
      <p class="ready-line">${ready ? "Oui : vous pouvez vous inscrire à une session." : "Pas encore : les trois cases doivent être cochées."}</p>
      ${examHistory()}
    </section>`;
}

function renderHome() {
  const due = dueQuestions().length;
  const nextIndex = nextLessonIndex();

  const todo = [];
  if (due > 0) {
    todo.push(`<button class="btn btn-primary" data-action="review">Réviser mes questions du jour <span class="count">${due}</span></button>`);
  }
  if (nextIndex >= 0) {
    const lesson = DATA.lessons[nextIndex];
    const cls = due > 0 ? "btn" : "btn btn-primary";
    todo.push(`<button class="${cls}" data-action="open-lesson" data-lesson="${lesson.id}">Continuer : étape ${nextIndex + 1} — ${escapeHtml(lesson.title)}</button>`);
  }
  todo.push(`<button class="btn" data-action="exam">Examen blanc : ${EXAM_SIZE} questions, ${EXAM_SECONDS} s chacune</button>`);

  const lessons = DATA.lessons.map((lesson, index) => {
    const unlocked = isUnlocked(index);
    const validated = Boolean(progress.validated[lesson.id]);
    const stats = lessonStats(lesson.id);
    const status = validated
      ? `<span class="status status-done">Validée</span>`
      : unlocked
        ? `<span class="status">${stats.known} / ${stats.total} sues</span>`
        : `<span class="status status-locked">Verrouillée</span>`;
    return `<li>
      <button class="lesson-item${validated ? " is-done" : ""}" data-action="open-lesson" data-lesson="${lesson.id}" ${unlocked ? "" : "disabled"}>
        <span class="step">${validated ? "✓" : index + 1}</span>
        <span class="lesson-body">
          <span class="lesson-title">${escapeHtml(lesson.title)}</span>
          <span class="lesson-meta">${partChip(lesson.part)} <span class="muted">${escapeHtml(lesson.pages)}</span></span>
          ${unlocked && !validated ? progressBar(stats.known / stats.total, lesson.title) : ""}
        </span>
        ${status}
      </button>
    </li>`;
  }).join("");

  return `
    ${syncStatusLine()}
    <header class="hero">
      <p class="eyebrow">Certificat restreint de radiotéléphoniste</p>
      <h1>Révision CRR maritime</h1>
      <p class="muted">${escapeHtml(DATA.source)} · ${QUESTIONS.length} questions</p>
    </header>
    <section class="panel">
      <h2>Aujourd’hui</h2>
      <div class="stack">${todo.join("")}</div>
    </section>
    ${renderProgress()}
    <section>
      <h2 class="section-title">Le parcours</h2>
      <p class="muted small">Chaque étape se valide quand vous savez 80 % de ses questions. La suivante se débloque alors.</p>
      <ol class="lessons">${lessons}</ol>
    </section>
    <section class="panel settings">
      <h2>Réglages</h2>
      <label class="toggle"><input type="checkbox" data-action="toggle-unlock" ${progress.unlockAll ? "checked" : ""}> Débloquer toutes les étapes</label>
      ${speechAvailable ? `<label class="toggle"><input type="checkbox" data-action="toggle-voice" ${progress.voice ? "checked" : ""}> Lire les questions à voix haute pendant l’examen blanc, comme le jour J</label>` : ""}
      <button class="btn btn-quiet" data-action="reset">${view.confirmReset ? "Confirmer : tout effacer" : "Effacer ma progression"}</button>
    </section>`;
}

function renderLesson() {
  const index = DATA.lessons.findIndex((l) => l.id === view.lessonId);
  const lesson = DATA.lessons[index];
  const stats = lessonStats(lesson.id);
  const validated = Boolean(progress.validated[lesson.id]);
  const remaining = stats.total - stats.known;
  const cta = stats.seen === 0 ? "Commencer une série" : remaining > 0 ? "Continuer : nouvelle série" : "Refaire une série";

  return `
    <nav class="topbar"><button class="link" data-action="home">← Parcours</button></nav>
    <article class="panel lesson">
      <p class="eyebrow">Étape ${index + 1} · ${partChip(lesson.part)} · manuel ${escapeHtml(lesson.pages)}</p>
      <h1>${escapeHtml(lesson.title)}</h1>
      <p class="intro">${rich(lesson.intro)}</p>
      <h2>À retenir</h2>
      <ul class="key-points">${lesson.keyPoints.map((point) => `<li>${rich(point)}</li>`).join("")}</ul>
      <aside class="tip"><strong>Astuce</strong> ${rich(lesson.tip)}</aside>
    </article>
    <section class="panel">
      <div class="part-head"><span>${validated ? "Étape validée" : "Votre avancement"}</span><strong>${stats.known} / ${stats.total} sues</strong></div>
      ${progressBar(stats.known / stats.total, lesson.title)}
      <p class="muted small">Une série compte ${Math.min(SERIES_SIZE, stats.total)} questions, en commençant par celles que vous n’avez jamais vues ou que vous avez ratées.</p>
      <button class="btn btn-primary" data-action="start-lesson" data-lesson="${lesson.id}" autofocus>${cta}</button>
    </section>`;
}

function sessionTitle() {
  if (session.kind === "lesson") return DATA.lessons.find((l) => l.id === session.lessonId).title;
  if (session.kind === "retry") return "Mes erreurs";
  return "Révision du jour";
}

function choiceButtons(item, { reveal }) {
  return item.choices.map((choice, i) => {
    const classes = ["choice"];
    if (session.selected === i) classes.push("is-selected");
    if (reveal && choice.correct) classes.push("is-correct");
    if (reveal && session.selected === i && !choice.correct) classes.push("is-wrong");
    return `<button class="${classes.join(" ")}" data-action="choose" data-choice="${i}" ${reveal ? "disabled" : ""}>
      <span class="letter">${LETTERS[i]}</span><span>${escapeHtml(choice.text)}</span>
    </button>`;
  }).join("");
}

function renderQuestion() {
  const item = session.items[session.index];
  const total = session.items.length;
  const feedback = session.answered
    ? (() => {
        const correct = item.choices[session.selected].correct;
        const isLast = session.index === total - 1;
        return `<div class="feedback ${correct ? "is-correct" : "is-wrong"}">
          <p class="verdict">${correct ? "Bonne réponse" : "Pas tout à fait"}</p>
          <p>${escapeHtml(item.q.why)}</p>
          <p class="muted small">Manuel, page ${item.q.page}</p>
        </div>
        <button class="btn btn-primary" data-action="next" autofocus>${isLast ? "Voir le bilan" : "Question suivante"} →</button>`;
      })()
    : "";

  return `
    <nav class="topbar">
      <button class="link" data-action="quit">← Quitter</button>
      <span class="muted">${escapeHtml(sessionTitle())}</span>
      <span class="counter">${session.index + 1} / ${total}</span>
    </nav>
    ${progressBar(session.index / total, "Avancement de la série")}
    <section class="panel question">
      <p class="eyebrow">${partChip(item.q.part)}</p>
      <h1 class="question-text">${escapeHtml(item.q.text)}</h1>
      <div class="choices">${choiceButtons(item, { reveal: session.answered })}</div>
      <div aria-live="polite">${feedback}</div>
      ${session.answered ? "" : `<p class="muted small hint keys-hint">Clavier : touches A à ${LETTERS[item.choices.length - 1]}, puis Entrée.</p>`}
    </section>`;
}

function answerTraining(choiceIndex) {
  if (session.answered) return;
  const item = session.items[session.index];
  const correct = item.choices[choiceIndex].correct;
  session.selected = choiceIndex;
  session.answered = true;
  session.results.push({ item, selected: choiceIndex, correct });
  recordAnswer(item.q.id, correct);
  validateLessonIfReady(item.q.lessonId);
  saveProgress();
  render();
}

// Once validated, a lesson stays validated: a later slip in a review must not lock the path again.
function validateLessonIfReady(lessonId) {
  if (progress.validated[lessonId]) return;
  const stats = lessonStats(lessonId);
  if (stats.known / stats.total >= VALIDATION_RATIO) {
    progress.validated[lessonId] = true;
    session.newlyValidated.push(lessonId);
  }
}

function nextTraining() {
  if (session.index < session.items.length - 1) {
    session.index++;
    session.selected = null;
    session.answered = false;
    render();
  } else {
    go({ name: "seriesEnd" });
  }
}

function retryButton(mistakes) {
  const label = mistakes === 1 ? "Revoir mon erreur" : `Revoir mes ${mistakes} erreurs`;
  return `<button class="btn btn-primary" data-action="retry" autofocus>${label}</button>`;
}

function mistakesList(results) {
  return results.filter((r) => !r.correct).map((r) => {
    const correctChoice = r.item.choices.find((c) => c.correct);
    const given = r.selected === null ? "pas de réponse" : r.item.choices[r.selected].text;
    return `<li>
      <p class="mistake-q">${escapeHtml(r.item.q.text)}</p>
      <p><span class="tag tag-wrong">Votre réponse</span> ${escapeHtml(given)}</p>
      <p><span class="tag tag-right">Bonne réponse</span> ${escapeHtml(correctChoice.text)}</p>
      <p class="muted small">${escapeHtml(r.item.q.why)} — manuel p. ${r.item.q.page}</p>
    </li>`;
  }).join("");
}

function renderSeriesEnd() {
  const good = session.results.filter((r) => r.correct).length;
  const total = session.results.length;
  const mistakes = total - good;
  const validatedNow = session.newlyValidated.map((id) => DATA.lessons.find((l) => l.id === id));
  const upcomingIndex = nextLessonIndex();
  const upcoming = DATA.lessons[upcomingIndex];

  const headline = validatedNow.length > 0
    ? "Étape validée !"
    : good === total ? "Sans faute !" : good / total >= VALIDATION_RATIO ? "Très bien" : "On continue";

  const lines = [];
  if (session.kind === "lesson") {
    const stats = lessonStats(session.lessonId);
    lines.push(`Vous savez ${stats.known} questions sur ${stats.total} dans cette étape.`);
    if (!progress.validated[session.lessonId]) {
      lines.push(`Il en faut ${Math.ceil(stats.total * VALIDATION_RATIO)} pour la valider.`);
    }
  } else {
    lines.push("Les questions ratées reviendront dès la prochaine révision ; les autres, dans quelques jours.");
  }
  if (validatedNow.length > 0) {
    lines.push(`Validée : ${validatedNow.map((l) => `« ${escapeHtml(l.title)} »`).join(", ")}.`);
    lines.push(upcoming
      ? `Prochaine étape : « ${escapeHtml(upcoming.title)} ».`
      : "Toutes les étapes sont validées : place aux examens blancs.");
  }

  const actions = [];
  if (mistakes > 0) actions.push(retryButton(mistakes));
  if (validatedNow.length > 0 && upcoming) {
    actions.push(`<button class="btn${mistakes > 0 ? "" : " btn-primary"}" data-action="open-lesson" data-lesson="${upcoming.id}" ${mistakes > 0 ? "" : "autofocus"}>Étape suivante</button>`);
  }
  if (session.kind === "lesson") actions.push(`<button class="btn" data-action="start-lesson" data-lesson="${session.lessonId}">Nouvelle série</button>`);
  actions.push(`<button class="btn btn-quiet" data-action="home" ${actions.length ? "" : "autofocus"}>Retour au parcours</button>`);
  const message = lines.join(" ");

  return `
    <section class="panel result">
      <p class="eyebrow">${escapeHtml(sessionTitle())}</p>
      <h1>${headline}</h1>
      <p class="score">${good} / ${total}</p>
      <p>${message}</p>
      <div class="stack">${actions.join("")}</div>
    </section>
    ${mistakes > 0 ? `<section class="panel"><h2>À revoir</h2><ol class="mistakes">${mistakesList(session.results)}</ol></section>` : ""}`;
}

function renderExamQuestion() {
  const item = session.items[session.index];
  return `
    <nav class="topbar">
      <button class="link" data-action="quit">← Abandonner</button>
      <span class="muted">Examen blanc</span>
      <span class="counter">${session.index + 1} / ${session.items.length}</span>
    </nav>
    <div class="timer" aria-hidden="true"><span id="timer-fill"></span></div>
    <p class="timer-label muted small" id="timer-label">${progress.voice && speechAvailable ? "Lecture de la question…" : `${EXAM_SECONDS} s`}</p>
    <section class="panel question">
      <p class="eyebrow">${partChip(item.q.part)}</p>
      <h1 class="question-text">${escapeHtml(item.q.text)}</h1>
      <div class="choices">${choiceButtons(item, { reveal: false })}</div>
      <button class="btn btn-primary" data-action="validate-exam" ${session.selected === null ? "disabled" : ""}>Valider</button>
      <p class="muted small hint">Pas de retour en arrière. Sans réponse à la fin du temps, la question compte comme fausse.</p>
    </section>`;
}

function beginExamQuestion() {
  render();
  const token = ++examToken;
  const startTimer = () => {
    if (token !== examToken) return;
    session.deadline = Date.now() + EXAM_SECONDS * 1000;
    examTick = setInterval(updateExamTimer, 100);
    updateExamTimer();
  };
  if (progress.voice && speechAvailable) speak(session.items[session.index], startTimer);
  else startTimer();
}

function speak(item, onDone) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onDone();
  };
  const text = `${item.q.text} ${item.choices.map((c, i) => `${LETTERS[i]} : ${c.text}.`).join(" ")}`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  // A phone without a French voice, or a viewer that blocks speech, may stay silent without
  // ever firing `end`: the clock must start anyway, quickly if reading never began.
  const startGuard = setTimeout(finish, SPEECH_START_TIMEOUT_MS);
  utterance.onstart = () => clearTimeout(startGuard);
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  setTimeout(finish, SPEECH_TIMEOUT_MS);
}

function updateExamTimer() {
  const left = Math.max(0, session.deadline - Date.now());
  const fill = document.getElementById("timer-fill");
  const label = document.getElementById("timer-label");
  if (fill) fill.style.width = `${(left / (EXAM_SECONDS * 1000)) * 100}%`;
  if (label) label.textContent = `${Math.ceil(left / 1000)} s`;
  if (left === 0) validateExamAnswer();
}

function stopExam() {
  clearInterval(examTick);
  examTick = null;
  examToken++;
  if (speechAvailable) window.speechSynthesis.cancel();
}

function selectExamChoice(choiceIndex) {
  session.selected = choiceIndex;
  app.querySelectorAll(".choice").forEach((button, i) => button.classList.toggle("is-selected", i === choiceIndex));
  app.querySelector('[data-action="validate-exam"]').disabled = false;
}

function validateExamAnswer() {
  stopExam();
  const item = session.items[session.index];
  const correct = session.selected !== null && item.choices[session.selected].correct;
  session.results.push({ item, selected: session.selected, correct });
  recordAnswer(item.q.id, correct);
  validateLessonIfReady(item.q.lessonId);
  if (session.index < session.items.length - 1) {
    session.index++;
    session.selected = null;
    beginExamQuestion();
  } else {
    finishExam();
  }
}

function examPartScores(results) {
  return PART_IDS.map((part) => {
    const ofPart = results.filter((r) => r.item.q.part === part);
    const good = ofPart.filter((r) => r.correct).length;
    return { part, good, total: ofPart.length, passed: good * 2 >= ofPart.length };
  });
}

function finishExam() {
  const parts = examPartScores(session.results);
  const score = session.results.filter((r) => r.correct).length;
  progress.exams = [...progress.exams, {
    date: Date.now(),
    score,
    passed: parts.every((p) => p.passed),
    parts: parts.map(({ good, total }) => ({ good, total })),
  }].slice(-EXAMS_KEPT);
  saveProgress();
  go({ name: "examEnd" });
}

function renderExamEnd() {
  const parts = examPartScores(session.results);
  const passed = parts.every((p) => p.passed);
  const score = session.results.filter((r) => r.correct).length;
  const mistakes = session.results.length - score;
  const rows = parts.map((p) => `<tr>
      <td>${escapeHtml(DATA.parts[p.part].name)}</td>
      <td class="num">${p.good} / ${p.total}</td>
      <td class="num">${p.passed ? `<span class="tag tag-right">moyenne</span>` : `<span class="tag tag-wrong">insuffisant</span>`}</td>
    </tr>`).join("");

  return `
    <section class="panel result">
      <p class="eyebrow">Examen blanc</p>
      <h1>${passed ? "Reçu" : "Ajourné"}</h1>
      <p class="score">${score} / ${session.results.length}</p>
      <table class="parts-table"><tbody>${rows}</tbody></table>
      <p class="muted small">Comme à l’examen, il faut au moins la moitié des points dans chacune des trois parties. Vos erreurs reviendront dans la révision du jour.</p>
      <div class="stack">
        ${mistakes > 0 ? retryButton(mistakes) : ""}
        <button class="btn" data-action="exam">Nouvel examen blanc</button>
        <button class="btn btn-quiet" data-action="home">Retour au parcours</button>
      </div>
    </section>
    ${mistakes > 0 ? `<section class="panel"><h2>Corrigé de vos erreurs</h2><ol class="mistakes">${mistakesList(session.results)}</ol></section>` : ""}`;
}

const actions = {
  home: () => go({ name: "home" }),
  quit: () => go({ name: "home" }),
  "open-lesson": (el) => go({ name: "lesson", lessonId: el.dataset.lesson }),
  "start-lesson": (el) => {
    startSession("lesson", weakestFirst(lessonQuestions(el.dataset.lesson)).slice(0, SERIES_SIZE), { lessonId: el.dataset.lesson });
    go({ name: "question" });
  },
  review: () => {
    startSession("review", weakestFirst(dueQuestions()).slice(0, REVIEW_SIZE));
    go({ name: "question" });
  },
  retry: () => {
    const wrong = session.results.filter((r) => !r.correct).map((r) => r.item.q);
    startSession("retry", shuffle(wrong));
    go({ name: "question" });
  },
  exam: () => {
    startSession("exam", pickExam());
    stopExam();
    view = { name: "exam" };
    beginExamQuestion();
    window.scrollTo(0, 0);
  },
  choose: (el) => {
    const choice = Number(el.dataset.choice);
    if (view.name === "exam") selectExamChoice(choice);
    else answerTraining(choice);
  },
  next: () => nextTraining(),
  "validate-exam": () => validateExamAnswer(),
  reset: () => {
    if (!view.confirmReset) {
      view = { name: "home", confirmReset: true };
      render();
      return;
    }
    progress = { ...emptyProgress(), unlockAll: progress.unlockAll, voice: progress.voice };
    saveProgress();
    go({ name: "home" });
  },
};

app.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled || el.type === "checkbox") return;
  actions[el.dataset.action]?.(el);
});

app.addEventListener("change", (event) => {
  const action = event.target.dataset.action;
  if (action === "toggle-unlock") progress.unlockAll = event.target.checked;
  else if (action === "toggle-voice") progress.voice = event.target.checked;
  else return;
  saveProgress();
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (view.name !== "question" && view.name !== "exam") return;
  const key = event.key.toUpperCase();
  const index = "ABCD".includes(key) && key.length === 1 ? LETTERS.indexOf(key) : "1234".indexOf(key);
  const item = session.items[session.index];

  if (index >= 0 && index < item.choices.length) {
    event.preventDefault();
    if (view.name === "exam") selectExamChoice(index);
    else answerTraining(index);
    return;
  }
  if (event.key !== "Enter") return;
  // Enter on a focused button keeps its native click, so that Tab + Enter still picks an answer;
  // in the exam, Enter on an answer means "validate", as with the remote control.
  const onButton = event.target.closest?.("button");
  if (view.name === "exam" && session.selected !== null && (!onButton || onButton.classList.contains("choice"))) {
    event.preventDefault();
    validateExamAnswer();
  } else if (view.name === "question" && session.answered && !onButton) {
    event.preventDefault();
    nextTraining();
  }
});

render();
connectRemote();
