// ===== 必要に応じてここだけ変更します =====

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyBcZiKq1irtFVq2J-dFT_z_pIgBjpt8mknGpp7U5OXYMPGT8MLLXMJya9QAt7bvpkxiA/exec";

// 公開フォルダの実ファイル名は研究条件が分からない名前にしています。
// 研究条件名は回答データ側だけに保存します。
const IMAGE_MAP = {
  "CRLH": "img_a7k3p2.png",
  "JC":   "img_q4m8x1.png",
  "CRHL": "img_n6t2w9.png",
  "JLL":  "img_b3r7c5.png",
  "CRC":  "img_h8v1d4.png",
  "JHH":  "img_p5y9k2.png",
  "CRHH": "img_f2s6j8.png",
  "JLH":  "img_c9u4e7.png",
  "CRLL": "img_m1z5r3.png",
  "JHL":  "img_t8q2n6.png"
};

const QUESTIONS = {
  cleanCompare: {
    key: "clean_compare",
    label: "汚れなしとの比較",
    pairs: [
      ["CRC", "CRLH"], ["CRC", "CRHH"], ["CRC", "CRLL"], ["CRC", "CRHL"],
      ["JC", "JLH"], ["JC", "JHH"], ["JC", "JLL"], ["JC", "JHL"]
    ],
    instruction: "左の画像と比べて、右の画像のリアリティは変化したと感じますか？"
  },
  dirtAmount: {
    key: "dirt_amount",
    label: "汚れ量の比較",
    pairs: [
      ["CRLH", "CRHH"], ["CRLL", "CRHL"],
      ["JLH", "JHH"], ["JLL", "JHL"]
    ],
    instruction: "2枚の画像を比較して、どちらの方がよりリアルに感じましたか？"
  },
  information: {
    key: "information",
    label: "情報量の比較",
    pairs: [
      ["CRLH", "CRLL"], ["CRHH", "CRHL"],
      ["JLH", "JLL"], ["JHH", "JHL"]
    ],
    instruction: "2枚の画像を比較して、どちらの方がよりリアルに感じましたか？"
  }
};

const RANKING_QUESTIONS = [
  { scene: "classroom", label: "教室の5枚から選択", images: ["CRC", "CRLH", "CRHH", "CRLL", "CRHL"] },
  { scene: "shrine", label: "神社の5枚から選択", images: ["JC", "JLH", "JHH", "JLL", "JHL"] }
];

const introScreen = document.getElementById("introScreen");
const surveyScreen = document.getElementById("surveyScreen");
const completeScreen = document.getElementById("completeScreen");
const ageInput = document.getElementById("age");
const startButton = document.getElementById("startButton");
const nextButton = document.getElementById("nextButton");
const cgFollowup = document.getElementById("cgFollowup");
const progressText = document.getElementById("progressText");
const categoryLabel = document.getElementById("categoryLabel");
const instruction = document.getElementById("instruction");
const questionArea = document.getElementById("questionArea");
const configWarning = document.getElementById("configWarning");
const saveStatus = document.getElementById("saveStatus");
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeImageModal = document.getElementById("closeImageModal");

let questionSequence = [];
let currentIndex = 0;
let results = [];
const imageCache = new Map();

const participant = {
  age: "",
  cgExperience: "",
  cgFrequency: "",
  cgViewingFrequency: "",
  sessionId: createSessionId()
};

function createSessionId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "S" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : "";
}


function updateCgFollowupVisibility() {
  const hasExperience = getRadioValue("cgExperience") === "ある";
  cgFollowup.classList.toggle("hidden", !hasExperience);

  if (!hasExperience) {
    document.querySelectorAll('input[name="cgFrequency"], input[name="cgViewingFrequency"]')
      .forEach((el) => { el.checked = false; });
  }

  validateIntro();
}

function validateIntro() {
  const age = ageInput.value.trim();
  const ageValid = /^[0-9]+$/.test(age) && Number(age) >= 1 && Number(age) <= 120;

  const hasExperience = getRadioValue("cgExperience") === "ある";
  const valid =
    ageValid &&
    !!getRadioValue("cgExperience") &&
    (!hasExperience ||
      (!!getRadioValue("cgFrequency") && !!getRadioValue("cgViewingFrequency")));

  startButton.disabled = !valid;
  return valid;
}

function keyToUrl(key) {
  return `images/${encodeURIComponent(IMAGE_MAP[key])}`;
}

function preloadImage(key) {
  if (imageCache.has(key)) return imageCache.get(key);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めませんでした: ${key}`));
    img.src = keyToUrl(key);
  });

  imageCache.set(key, promise);
  promise.catch(() => {
    if (imageCache.get(key) === promise) imageCache.delete(key);
  });

  return promise;
}

function protectImage(img) {
  img.draggable = false;
  img.addEventListener("contextmenu", (event) => event.preventDefault());
  img.addEventListener("dragstart", (event) => event.preventDefault());
}

function openImageModal(src) {
  modalImage.src = src;
  imageModal.classList.remove("hidden");
}

function closeModal() {
  imageModal.classList.add("hidden");
  modalImage.src = "";
}

function makeImage(key, className = "") {
  const img = document.createElement("img");
  img.className = className;
  img.alt = "評価対象の背景3DCG画像";
  img.src = keyToUrl(key);
  protectImage(img);
  img.addEventListener("click", () => openImageModal(img.src));
  return img;
}

function makeComparisonPair(question, leftKey, rightKey) {
  const grid = document.createElement("div");
  grid.className = "comparison-grid";

  const leftCard = document.createElement("div");
  leftCard.className = "comparison-card";
  const leftImg = makeImage(leftKey, "comparison-image");
  const leftLabel = document.createElement("div");
  leftLabel.className = "position-label";
  leftLabel.textContent = "左の画像";
  leftCard.append(leftImg, leftLabel);

  const rightCard = document.createElement("div");
  rightCard.className = "comparison-card";
  const rightImg = makeImage(rightKey, "comparison-image");
  const rightLabel = document.createElement("div");
  rightLabel.className = "position-label";
  rightLabel.textContent = "右の画像";
  rightCard.append(rightImg, rightLabel);

  grid.append(leftCard, rightCard);
  questionArea.appendChild(grid);
}

function addFivePointOptions() {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "answer-group";
  const legend = document.createElement("legend");
  legend.textContent = "最も近いものを1つ選んでください。";
  fieldset.appendChild(legend);

  const options = [
    ["1", "大きく低下した"],
    ["2", "やや低下した"],
    ["3", "ほとんど変化しない"],
    ["4", "やや高まった"],
    ["5", "大きく高まった"]
  ];

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "answer-options";

  for (const [value, label] of options) {
    const wrapper = document.createElement("label");
    wrapper.className = "answer-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "currentAnswer";
    input.value = value;
    const span = document.createElement("span");
    span.textContent = `${value}：${label}`;
    wrapper.append(input, span);
    optionsWrap.appendChild(wrapper);
    input.addEventListener("change", () => {
      nextButton.disabled = false;
    });
  }

  fieldset.appendChild(optionsWrap);
  questionArea.appendChild(fieldset);
}

function addLeftRightOptions() {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "answer-group";
  const legend = document.createElement("legend");
  legend.textContent = "最も近いものを1つ選んでください。";
  fieldset.appendChild(legend);

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "answer-options two-choice";

  for (const [value, label] of [["left", "左の画像"], ["right", "右の画像"]]) {
    const wrapper = document.createElement("label");
    wrapper.className = "answer-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "currentAnswer";
    input.value = value;
    const span = document.createElement("span");
    span.textContent = label;
    wrapper.append(input, span);
    optionsWrap.appendChild(wrapper);
    input.addEventListener("change", () => {
      nextButton.disabled = false;
    });
  }

  fieldset.appendChild(optionsWrap);
  questionArea.appendChild(fieldset);
}

function addRankingOptions(images) {
  const grid = document.createElement("div");
  grid.className = "list-grid";

  images.forEach((key, index) => {
    const label = document.createElement("label");
    label.className = "list-card";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "currentAnswer";
    input.value = key;

    const img = makeImage(key);
    const tag = document.createElement("span");
    tag.className = "list-label";
    tag.textContent = String.fromCharCode(65 + index);

    label.append(input, img, tag);
    grid.appendChild(label);

    input.addEventListener("change", () => {
      nextButton.disabled = false;
    });
  });

  questionArea.appendChild(grid);
}

function sceneOf(key) {
  return key.startsWith("CR") ? "教室" : "神社";
}

function makeAlternatingQuestions(definition) {
  const classroom = shuffle(definition.pairs.filter(pair => sceneOf(pair[0]) === "教室"));
  const shrine = shuffle(definition.pairs.filter(pair => sceneOf(pair[0]) === "神社"));

  const startWithClassroom = Math.random() < 0.5;
  const result = [];

  for (let i = 0; i < Math.max(classroom.length, shrine.length); i++) {
    if (startWithClassroom) {
      if (classroom[i]) result.push({ ...definition, pair: classroom[i] });
      if (shrine[i]) result.push({ ...definition, pair: shrine[i] });
    } else {
      if (shrine[i]) result.push({ ...definition, pair: shrine[i] });
      if (classroom[i]) result.push({ ...definition, pair: classroom[i] });
    }
  }

  return result;
}

function makeRankingSequence() {
  const rankings = RANKING_QUESTIONS.map((item) => ({ ...item, images: shuffle(item.images) }));
  return Math.random() < 0.5 ? rankings : [rankings[1], rankings[0]];
}

function buildQuestionSequence() {
  // 各大項目の順番は固定。
  // 各大項目内は「教室・神社が交互」、開始シーンは回答者ごとにランダム。
  const seq = [];
  seq.push(...makeAlternatingQuestions(QUESTIONS.cleanCompare));
  seq.push(...makeAlternatingQuestions(QUESTIONS.dirtAmount));
  seq.push(...makeAlternatingQuestions(QUESTIONS.information));

  for (const ranking of makeRankingSequence()) {
    seq.push({
      type: "ranking",
      key: "ranking",
      label: ranking.label,
      scene: ranking.scene,
      images: ranking.images
    });
  }

  return seq;
}

async function renderCurrentQuestion() {
  const q = questionSequence[currentIndex];
  progressText.textContent = `${currentIndex + 1} / ${questionSequence.length}`;
  categoryLabel.textContent = "";
  instruction.textContent = q.instruction || "最もリアルに感じた画像を1つ選んでください。";

  questionArea.innerHTML = "";
  nextButton.disabled = true;

  const needed = q.type === "ranking" ? q.images : q.pair;
  questionArea.innerHTML = '<div class="loading">画像を読み込んでいます…</div>';

  try {
    await Promise.all(needed.map(preloadImage));

    questionArea.innerHTML = "";

    if (q.type === "ranking") {
      addRankingOptions(q.images);
    } else {
      let leftKey = q.pair[0];
      let rightKey = q.pair[1];

      // 汚れなしとの比較は「左=汚れなし、右=汚れあり」で固定。
      // 汚れ量・情報量比較は左右を回答者ごとにランダム化。
      if (q.key === "dirt_amount" || q.key === "information") {
        if (Math.random() < 0.5) {
          [leftKey, rightKey] = [rightKey, leftKey];
        }
      }

      q.leftKey = leftKey;
      q.rightKey = rightKey;
      makeComparisonPair(q, leftKey, rightKey);

      if (q.key === "clean_compare") {
        addFivePointOptions();
      } else {
        addLeftRightOptions();
      }
    }

    // 次の質問で必要な画像を、回答中に裏で先読みする。
    // 次の質問がランキングでも比較でも同じように先読みする。
    const nextQ = questionSequence[currentIndex + 1];
    if (nextQ) {
      const nextNeeded = nextQ.type === "ranking" ? nextQ.images : nextQ.pair;
      nextNeeded.forEach(preloadImage);
    }
  } catch (error) {
    console.error(error);
    questionArea.innerHTML = '<div class="loading">画像の読み込みに失敗しました。通信状態を確認して、ページを再読み込みしてください。</div>';
  }
}

function collectCurrentAnswer() {
  const checked = document.querySelector('input[name="currentAnswer"]:checked');
  return checked ? checked.value : null;
}

function startSurvey() {
  if (!validateIntro()) return;

  participant.age = ageInput.value.trim();
  participant.cgExperience = getRadioValue("cgExperience");
  participant.cgFrequency = getRadioValue("cgFrequency");
  participant.cgViewingFrequency = getRadioValue("cgViewingFrequency");

  questionSequence = buildQuestionSequence();
  currentIndex = 0;
  results = [];
  imageCache.clear();

  introScreen.classList.add("hidden");
  surveyScreen.classList.remove("hidden");
  renderCurrentQuestion();
}

function finishSurvey() {
  surveyScreen.classList.add("hidden");
  completeScreen.classList.remove("hidden");

  if (APPS_SCRIPT_URL) {
    saveToAppsScript();
  } else {
    localStorage.setItem(
      `survey-${participant.sessionId}`,
      JSON.stringify({
        participant,
        results,
        completedAt: new Date().toISOString()
      })
    );
    saveStatus.textContent = "テストモードです。回答データはこのブラウザに保存されています。";
  }
}

function submitPayloadByHiddenForm(payload) {
  return new Promise((resolve) => {
    const iframeName = `submitFrame_${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const form = document.createElement("form");
    form.method = "POST";
    form.action = APPS_SCRIPT_URL;
    form.target = iframeName;
    form.style.display = "none";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify(payload);

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();

    setTimeout(() => {
      form.remove();
      iframe.remove();
      resolve();
    }, 1800);
  });
}

async function saveToAppsScript() {
  const payload = {
    participant,
    results,
    completedAt: new Date().toISOString()
  };

  saveStatus.textContent = "回答を保存しています…";

  try {
    await submitPayloadByHiddenForm(payload);
    saveStatus.textContent = "回答を受け付けました。ご協力ありがとうございました。";
  } catch (error) {
    console.error(error);
    localStorage.setItem(
      `survey-${participant.sessionId}`,
      JSON.stringify(payload)
    );
    saveStatus.textContent = "回答の保存を確認できませんでした。通信状態を確認してください。";
  }
}

ageInput.addEventListener("input", validateIntro);
document.querySelectorAll('input[name="cgFrequency"], input[name="cgViewingFrequency"]')
  .forEach((el) => el.addEventListener("change", validateIntro));

document.querySelectorAll('input[name="cgExperience"]')
  .forEach((el) => el.addEventListener("change", updateCgFollowupVisibility));

startButton.addEventListener("click", startSurvey);

nextButton.addEventListener("click", async () => {
  const answer = collectCurrentAnswer();
  if (!answer) return;

  const q = questionSequence[currentIndex];

  if (q.type === "ranking") {
    results.push({
      globalOrder: currentIndex + 1,
      questionType: "ranking",
      category: "最もリアルな画像",
      scene: q.scene === "classroom" ? "教室" : "神社",
      leftImage: q.images[0],
      rightImage: q.images[1],
      displayImages: q.images.join(" / "),
      answer: answer,
      selectedImage: answer
    });
  } else {
    const answerRecord = {
      globalOrder: currentIndex + 1,
      questionType: q.key,
      category: q.label,
      scene: sceneOf(q.leftKey),
      leftImage: q.leftKey,
      rightImage: q.rightKey,
      answer: answer,
      selectedImage: answer === "left" ? q.leftKey : (answer === "right" ? q.rightKey : ""),
      scaleLabel: q.key === "clean_compare" ? ({
        "1": "大きく低下した",
        "2": "やや低下した",
        "3": "ほとんど変化しない",
        "4": "やや高まった",
        "5": "大きく高まった"
      })[answer] : ""
    };
    results.push(answerRecord);
  }

  if (currentIndex < questionSequence.length - 1) {
    currentIndex += 1;
    await renderCurrentQuestion();
  } else {
    finishSurvey();
  }
});

closeImageModal.addEventListener("click", closeModal);
modalImage.addEventListener("click", closeModal);
imageModal.addEventListener("click", (event) => {
  if (event.target === imageModal) closeModal();
});
modalImage.addEventListener("contextmenu", (event) => event.preventDefault());
modalImage.addEventListener("dragstart", (event) => event.preventDefault());

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageModal.classList.contains("hidden")) {
    closeModal();
  }
});

document.addEventListener("contextmenu", (event) => {
  if (event.target && event.target.tagName === "IMG") {
    event.preventDefault();
  }
});

if (!APPS_SCRIPT_URL) {
  configWarning.textContent = "※現在はテストモードです。公開前にGoogle Apps ScriptのURLを設定してください。";
  configWarning.classList.remove("hidden");
}
