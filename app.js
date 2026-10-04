// ===== 必要に応じてここだけ変更します =====

// Google Apps ScriptをWebアプリとして公開したら、そのURLを入れます。
// まだ未設定なら空文字のままで、回答結果はブラウザ内に保存されます。
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx0isko1Ztwxague6_6kVKdXqK0dFrLGawxBgpCm5lrEqJJQyxwgiNZ2J-Zi0BqJx-mGg/exec";

// 画像ファイル名。研究参加者にはこのコード名を表示しません。
const IMAGE_FILES = [
  "CRLH.png",
  "JC.png",
  "CRHL.png",
  "JLL.png",
  "CRC.png",
  "JHH.png",
  "CRHH.png",
  "JLH.png",
  "CRLL.png",
  "JHL.png"
];

const introScreen = document.getElementById("introScreen");
const surveyScreen = document.getElementById("surveyScreen");
const completeScreen = document.getElementById("completeScreen");
const ageInput = document.getElementById("age");
const startButton = document.getElementById("startButton");
const nextButton = document.getElementById("nextButton");
const surveyImage = document.getElementById("surveyImage");
const progressText = document.getElementById("progressText");
const configWarning = document.getElementById("configWarning");
const saveStatus = document.getElementById("saveStatus");
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeImageModal = document.getElementById("closeImageModal");

let order = [];
let currentIndex = 0;
let results = [];
let participant = {
  age: "",
  cgExperience: "",
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

function getCgExperience() {
  const checked = document.querySelector('input[name="cgExperience"]:checked');
  return checked ? checked.value : "";
}

function validateIntro() {
  const age = ageInput.value.trim();
  const cg = getCgExperience();

  const ageValid = /^[0-9]+$/.test(age) && Number(age) >= 1 && Number(age) <= 120;
  const valid = ageValid && !!cg;

  startButton.disabled = !valid;
  return valid;
}

function resetRating() {
  document.querySelectorAll('input[name="rating"]').forEach((el) => {
    el.checked = false;
  });
  nextButton.disabled = true;
}

function showCurrentImage() {
  const fileName = order[currentIndex];

  progressText.textContent = `${currentIndex + 1} / ${order.length}`;
  surveyImage.src = `images/${encodeURIComponent(fileName)}`;
  surveyImage.alt = "評価対象の背景3DCG画像";
  resetRating();

  // 画像をクリックすると、同じページ上で拡大表示する。
  // 画像ファイルを別タブで開かないため、タブ名にファイル名は表示されません。
  surveyImage.onclick = () => {
  modalImage.src = surveyImage.src;
  imageModal.classList.remove("hidden");
};

// 画像の右クリックメニューを無効にする
surveyImage.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

modalImage.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

// 画像のドラッグを無効にする
surveyImage.setAttribute("draggable", "false");
modalImage.setAttribute("draggable", "false");
}

function collectCurrentRating() {
  const checked = document.querySelector('input[name="rating"]:checked');
  return checked ? Number(checked.value) : null;
}

function buildAlternatingOrder() {
  // 教室(CR)と神社(J)をそれぞれ独立してシャッフルする。
  // その後、2シーンを交互に配置するため、同じシーンは連続しません。
  const classroom = shuffle(IMAGE_FILES.filter((name) => name.startsWith("CR")));
  const shrine = shuffle(IMAGE_FILES.filter((name) => name.startsWith("J")));

  // 最初をどちらのシーンにするかも回答者ごとにランダムにする。
  const startWithClassroom = Math.random() < 0.5;
  const result = [];

  for (let i = 0; i < classroom.length; i++) {
    if (startWithClassroom) {
      result.push(classroom[i], shrine[i]);
    } else {
      result.push(shrine[i], classroom[i]);
    }
  }

  return result;
}

function startSurvey() {
  if (!validateIntro()) return;

  participant.age = ageInput.value.trim();
  participant.cgExperience = getCgExperience();

  // シーンは交互、各シーン内の5条件は回答者ごとにランダム。
  order = buildAlternatingOrder();
  currentIndex = 0;
  results = [];

  introScreen.classList.add("hidden");
  surveyScreen.classList.remove("hidden");
  showCurrentImage();
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
    saveStatus.textContent = "現在はテストモードです。回答データはこのブラウザに保存されています。";
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
    // 回答データを失わないよう、ブラウザにも保存
    localStorage.setItem(
      `survey-${participant.sessionId}`,
      JSON.stringify(payload)
    );
    saveStatus.textContent = "回答は端末に一時保存されました。保存処理を確認してください。";
  }
}

ageInput.addEventListener("input", validateIntro);
document.querySelectorAll('input[name="cgExperience"]').forEach((el) => {
  el.addEventListener("change", validateIntro);
});

document.querySelectorAll('input[name="rating"]').forEach((el) => {
  el.addEventListener("change", () => {
    nextButton.disabled = !collectCurrentRating();
  });
});

startButton.addEventListener("click", startSurvey);

function closeModal() {
  imageModal.classList.add("hidden");
  modalImage.src = "";
}

closeImageModal.addEventListener("click", closeModal);
modalImage.addEventListener("click", closeModal);
imageModal.addEventListener("click", (event) => {
  if (event.target === imageModal) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageModal.classList.contains("hidden")) {
    closeModal();
  }
});

nextButton.addEventListener("click", () => {
  const rating = collectCurrentRating();
  if (!rating) return;

  results.push({
    order: currentIndex + 1,
    image: order[currentIndex],
    rating
  });

  if (currentIndex < order.length - 1) {
    currentIndex += 1;
    showCurrentImage();
  } else {
    finishSurvey();
  }

  // 同じページのブラウザ操作で戻れないように履歴追加はしない。
  // アプリ内には「戻る」ボタンを置かない。
});

// テスト時の設定忘れに気づきやすくする
if (!APPS_SCRIPT_URL) {
  configWarning.textContent = "※現在はテストモードです。公開前にGoogle Apps ScriptのURLを設定してください。";
  configWarning.classList.remove("hidden");
}
