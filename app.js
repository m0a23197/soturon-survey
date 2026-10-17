'use strict';

// Google Apps Scriptの接続先は既存のものを維持しています。
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxP3hNAl0AryJFMSEteNB9NT_OweafNgFF7-5WPMzMPFJ7goHE6MHYQ6uAIZzgXtqbS/exec';
const TOTAL_QUESTIONS = 23;
const IMAGE_FILES = {
  CRC: 'CRC.png', CRLL: 'CRLL.png', CRLH: 'CRLH.png', CRHL: 'CRHL.png', CRHH: 'CRHH.png',
  JC: 'JC.png', JLL: 'JLL.png', JLH: 'JLH.png', JHL: 'JHL.png', JHH: 'JHH.png'
};

const SECTION_INFO = {
  clean: {
    title: '汚れなしとの比較',
    instruction: 'この設問では、汚れなしの画像と汚れありの画像を比較します。2枚を見比べて、リアルだと思う方を選んでください。判断が難しい場合は「わからない」を選んでください。'
  },
  dirt: {
    title: '汚れ量の比較',
    instruction: 'この設問では、汚れの量が異なる画像を比較します。2枚を見比べて、リアルだと思う方を選んでください。判断が難しい場合は「わからない」を選んでください。'
  },
  info: {
    title: '情報量の比較',
    instruction: 'この設問では、汚れ表現の情報量が異なる画像を比較します。2枚を見比べて、リアルだと思う方を選んでください。判断が難しい場合は「わからない」を選んでください。'
  },
  retest: {
    // 「再テスト」という語を回答者向け画面には表示しない
    title: '画像の比較',
    instruction: 'この設問では、先ほど見た画像の組み合わせの一部を、左右を入れ替えて表示しています。2枚を見比べて、リアルだと思う方を選んでください。判断が難しい場合は「わからない」を選んでください。'
  },
  ranking: {
    title: '画像の順位付け',
    instruction: 'この設問では、5枚の画像を比較し、リアリティの感じ方を順位付けします。画像の下にあるボタンを、リアルだと思う順に押してください。最初に選んだ画像が1位、次が2位という順番になります。画像自体を押すと拡大できます。'
  }
};

const participantScreen = document.getElementById('participantScreen');
const sectionIntroScreen = document.getElementById('sectionIntroScreen');
const questionScreen = document.getElementById('questionScreen');
const completeScreen = document.getElementById('completeScreen');
const ageInput = document.getElementById('age');
const cgFrequencyField = document.getElementById('cgFrequencyField');
const formError = document.getElementById('formError');
const startButton = document.getElementById('startButton');
const beginSectionButton = document.getElementById('beginSectionButton');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const questionHeading = document.getElementById('questionHeading');
const questionArea = document.getElementById('questionArea');
const nextButton = document.getElementById('nextButton');
const sectionKicker = document.getElementById('sectionKicker');
const sectionTitle = document.getElementById('sectionTitle');
const sectionInstruction = document.getElementById('sectionInstruction');
const saveStatus = document.getElementById('saveStatus');
const imageModal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');
const closeImageModal = document.getElementById('closeImageModal');

let questionSequence = [];
let currentIndex = 0;
let results = [];
let rankingSelection = [];
const imageCache = new Map();

const participant = {
  age: '',
  cgViewingFrequency: '',
  cgExperience: '',
  cgFrequency: '',
  sessionId: createSessionId()
};

function createSessionId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '';
}

function updateCgFrequencyVisibility() {
  const hasExperience = getRadioValue('cgExperience') === 'ある';
  cgFrequencyField.classList.toggle('hidden', !hasExperience);
  if (!hasExperience) {
    document.querySelectorAll('input[name="cgFrequency"]').forEach((radio) => { radio.checked = false; });
  }
}

function validateParticipant() {
  const ageText = ageInput.value.trim();
  const ageValid = /^\d+$/.test(ageText) && Number(ageText) >= 1 && Number(ageText) <= 120;
  const hasExperience = getRadioValue('cgExperience') === 'ある';
  const valid = ageValid && !!getRadioValue('cgViewingFrequency') && !!getRadioValue('cgExperience') &&
    (!hasExperience || !!getRadioValue('cgFrequency'));
  startButton.disabled = !valid;
  formError.textContent = '';
  return valid;
}

function imageUrl(key) {
  const file = IMAGE_FILES[key];
  if (!file) throw new Error(`画像キーが定義されていません: ${key}`);
  return `images/${encodeURIComponent(file)}`;
}

function preloadImage(key) {
  if (imageCache.has(key)) return imageCache.get(key);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`画像を読み込めませんでした: ${key}`));
    image.src = imageUrl(key);
  });
  imageCache.set(key, promise);
  promise.catch(() => { if (imageCache.get(key) === promise) imageCache.delete(key); });
  return promise;
}

function protectImage(image) {
  image.draggable = false;
  image.addEventListener('contextmenu', (event) => event.preventDefault());
  image.addEventListener('dragstart', (event) => event.preventDefault());
}

function openImageModal(src) {
  modalImage.src = src;
  imageModal.classList.remove('hidden');
  closeImageModal.focus();
}

function closeModal() {
  imageModal.classList.add('hidden');
  modalImage.removeAttribute('src');
}

function createImage(key, className = '') {
  const image = document.createElement('img');
  image.className = className;
  image.src = imageUrl(key);
  image.alt = '評価対象の背景3DCG画像。クリックすると拡大表示します。';
  image.loading = 'eager';
  protectImage(image);
  image.addEventListener('click', (event) => {
    event.stopPropagation();
    openImageModal(image.src);
  });
  return image;
}

function createComparisonPair(leftKey, rightKey) {
  const grid = document.createElement('div');
  grid.className = 'comparison-grid';
  for (const [position, key] of [['左', leftKey], ['右', rightKey]]) {
    const card = document.createElement('div');
    card.className = 'comparison-card';
    card.appendChild(createImage(key, 'comparison-image'));
    const label = document.createElement('p');
    label.className = 'position-label';
    label.textContent = `${position}の画像`;
    card.appendChild(label);
    grid.appendChild(card);
  }
  questionArea.appendChild(grid);
}

function addComparisonOptions() {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'answer-group';
  const legend = document.createElement('legend');
  legend.textContent = 'リアルだと思う方を選んでください。';
  fieldset.appendChild(legend);
  const choices = [
    ['left', '左'], ['equal', 'わからない'], ['right', '右']
  ];
  const wrap = document.createElement('div');
  wrap.className = 'comparison-choices';
  for (const [value, text] of choices) {
    const label = document.createElement('label');
    label.className = 'choice-card';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'currentAnswer';
    input.value = value;
    const span = document.createElement('span');
    span.textContent = text;
    label.append(input, span);
    wrap.appendChild(label);
    input.addEventListener('change', () => { nextButton.disabled = false; });
  }
  fieldset.appendChild(wrap);
  questionArea.appendChild(fieldset);
}

function addRankingOptions(q) {
  rankingSelection = [];
  const container = document.createElement('div');
  container.className = 'ranking-block';
  const grid = document.createElement('div');
  grid.className = 'ranking-grid';

  const update = () => {
    [...grid.children].forEach((card) => {
      const key = card.dataset.key;
      const index = rankingSelection.indexOf(key);
      const rank = card.querySelector('.rank-number');
      const button = card.querySelector('.rank-select-button');
      const selected = index !== -1;
      card.classList.toggle('selected', selected);
      rank.textContent = selected ? `${index + 1}位` : '未選択';
      button.textContent = selected ? `${index + 1}位（選択解除）` : 'この画像を選ぶ';
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !selected && rankingSelection.length >= q.images.length;
    });
    nextButton.disabled = rankingSelection.length !== q.images.length;
  };

  q.images.forEach((key) => {
    const card = document.createElement('article');
    card.className = 'ranking-card';
    card.dataset.key = key;
    card.appendChild(createImage(key, 'ranking-image'));
    const rank = document.createElement('span');
    rank.className = 'rank-number';
    rank.textContent = '未選択';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rank-select-button';
    button.textContent = 'この画像を選ぶ';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const oldIndex = rankingSelection.indexOf(key);
      if (oldIndex >= 0) rankingSelection.splice(oldIndex, 1);
      else if (rankingSelection.length < q.images.length) rankingSelection.push(key);
      update();
    });
    card.append(rank, button);
    grid.appendChild(card);
  });

  container.appendChild(grid);
  const help = document.createElement('p');
  help.className = 'rank-help';
  help.textContent = '画像の下の大きなボタンを、リアルだと思う順に押してください。最初に選んだ画像が1位です。順位の取り消しは、選択済みのボタンをもう一度押してください。画像そのものを押すと拡大表示できます。';
  container.appendChild(help);
  questionArea.appendChild(container);
  update();
}

function sceneOf(key) {
  return key.startsWith('CR') ? '教室' : '神社';
}

function alternatingQuestions(pairs, key, section, prefix) {
  const classroom = shuffle(pairs.filter((pair) => sceneOf(pair[0]) === '教室'));
  const shrine = shuffle(pairs.filter((pair) => sceneOf(pair[0]) === '神社'));
  const startClassroom = Math.random() < 0.5;
  const alternating = [];
  for (let i = 0; i < Math.max(classroom.length, shrine.length); i++) {
    if (startClassroom) {
      if (classroom[i]) alternating.push(classroom[i]);
      if (shrine[i]) alternating.push(shrine[i]);
    } else {
      if (shrine[i]) alternating.push(shrine[i]);
      if (classroom[i]) alternating.push(classroom[i]);
    }
  }
  return alternating.map((pair, index) => ({
    type: 'comparison', key, section, questionId: `${prefix}_${pair[0]}_${pair[1]}`,
    scene: sceneOf(pair[0]), pair: [...pair], leftKey: '', rightKey: ''
  }));
}

function buildQuestionSequence() {
  const cleanPairs = [
    ['CRC', 'CRLH'], ['CRC', 'CRHH'], ['CRC', 'CRLL'], ['CRC', 'CRHL'],
    ['JC', 'JLH'], ['JC', 'JHH'], ['JC', 'JLL'], ['JC', 'JHL']
  ];
  const dirtPairs = [['CRLH', 'CRHH'], ['CRLL', 'CRHL'], ['JLH', 'JHH'], ['JLL', 'JHL']];
  const infoPairs = [['CRLH', 'CRLL'], ['CRHH', 'CRHL'], ['JLH', 'JLL'], ['JHH', 'JHL']];

  const sequence = [
    ...alternatingQuestions(cleanPairs, 'clean', 'clean', 'clean'),
    ...alternatingQuestions(dirtPairs, 'dirt', 'dirt', 'dirt'),
    ...alternatingQuestions(infoPairs, 'info', 'info', 'info')
  ];

  // 16問目の完了時に、実際に提示した左右を反転した5問へ置き換えます。
  for (let i = 0; i < 5; i++) {
    sequence.push({ type: 'placeholder', key: 'retest', section: 'retest', questionId: `retest_pending_${i + 1}` });
  }

  const rankingQuestions = [
    { type: 'ranking', key: 'ranking', section: 'ranking', questionId: 'ranking_classroom', scene: '教室', images: ['CRC', 'CRLL', 'CRLH', 'CRHL', 'CRHH'] },
    { type: 'ranking', key: 'ranking', section: 'ranking', questionId: 'ranking_shrine', scene: '神社', images: ['JC', 'JLL', 'JLH', 'JHL', 'JHH'] }
  ];
  sequence.push(...(Math.random() < 0.5 ? rankingQuestions : [rankingQuestions[1], rankingQuestions[0]]));
  return sequence;
}

function createRetestQuestions() {
  const candidates = questionSequence.slice(8, 16).filter((q) => (q.key === 'dirt' || q.key === 'info') && q.leftKey && q.rightKey);
  const selected = shuffle(candidates).slice(0, 5);
  return selected.map((source, index) => ({
    type: 'comparison', key: 'retest', section: 'retest',
    questionId: `retest_${index + 1}_${source.questionId}`,
    scene: source.scene,
    leftKey: source.rightKey,
    rightKey: source.leftKey,
    pair: [source.rightKey, source.leftKey],
    retestOf: source.questionId,
    originalLeftImage: source.leftKey,
    originalRightImage: source.rightKey
  }));
}

function showSectionIntro(section) {
  const info = SECTION_INFO[section];
  sectionKicker.textContent = '設問について';
  sectionTitle.textContent = info.title;
  sectionInstruction.textContent = info.instruction;
  participantScreen.classList.add('hidden');
  questionScreen.classList.add('hidden');
  completeScreen.classList.add('hidden');
  sectionIntroScreen.classList.remove('hidden');
}

function startSurvey() {
  if (!validateParticipant()) {
    formError.textContent = '未入力の項目があります。各項目を選択してください。';
    return;
  }
  participant.age = ageInput.value.trim();
  participant.cgViewingFrequency = getRadioValue('cgViewingFrequency');
  participant.cgExperience = getRadioValue('cgExperience');
  participant.cgFrequency = participant.cgExperience === 'ある' ? getRadioValue('cgFrequency') : '';

  questionSequence = buildQuestionSequence();
  currentIndex = 0;
  results = [];
  rankingSelection = [];
  imageCache.clear();
  showSectionIntro(questionSequence[currentIndex].section);
}

async function renderCurrentQuestion() {
  const q = questionSequence[currentIndex];
  if (!q || q.type === 'placeholder') {
    questionArea.innerHTML = '<p class="error-message">設問の準備に失敗しました。ページを再読み込みしてください。</p>';
    return;
  }

  // 進捗は「質問の描画のたび」に更新し、セクション単位で飛ばないようにします。
  progressText.textContent = `${currentIndex + 1} / ${TOTAL_QUESTIONS}`;
  progressBar.style.width = `${((currentIndex + 1) / TOTAL_QUESTIONS) * 100}%`;
  questionHeading.textContent = q.type === 'ranking' ? '5枚の画像を、リアルだと思う順に順位付けしてください。' : 'リアルだと思う方を選んでください。';
  questionArea.innerHTML = '<p class="loading-message">画像を読み込んでいます…</p>';
  nextButton.disabled = true;
  sectionIntroScreen.classList.add('hidden');
  participantScreen.classList.add('hidden');
  completeScreen.classList.add('hidden');
  questionScreen.classList.remove('hidden');

  const needed = q.type === 'ranking' ? q.images : [q.leftKey || q.pair?.[0], q.rightKey || q.pair?.[1]];
  try {
    await Promise.all(needed.map(preloadImage));
    questionArea.innerHTML = '';
    if (q.type === 'ranking') {
      addRankingOptions(q);
    } else {
      let leftKey;
      let rightKey;
      if (q.key === 'retest') {
        // リテスト相当の設問は、元の質問で提示した画像の左右を必ず反転。
        leftKey = q.leftKey;
        rightKey = q.rightKey;
      } else {
        [leftKey, rightKey] = q.pair;
        // 全ての2画像比較で左右を回答者ごとにランダム化。
        if (Math.random() < 0.5) [leftKey, rightKey] = [rightKey, leftKey];
        q.leftKey = leftKey;
        q.rightKey = rightKey;
      }
      createComparisonPair(leftKey, rightKey);
      addComparisonOptions();
    }

    // 次の質問の画像はバックグラウンドで先読み。失敗しても表示を止めません。
    const nextQ = questionSequence[currentIndex + 1];
    if (nextQ && nextQ.type !== 'placeholder') {
      const nextNeeded = nextQ.type === 'ranking' ? nextQ.images : [nextQ.leftKey || nextQ.pair?.[0], nextQ.rightKey || nextQ.pair?.[1]];
      nextNeeded.forEach((key) => preloadImage(key).catch(() => {}));
    }
  } catch (error) {
    console.error(error);
    questionArea.innerHTML = '<p class="error-message">画像を読み込めませんでした。通信状態を確認してからページを再読み込みしてください。</p>';
  }
}

function collectCurrentAnswer() {
  if (questionSequence[currentIndex]?.type === 'ranking') return rankingSelection.length === 5 ? [...rankingSelection] : null;
  const checked = document.querySelector('input[name="currentAnswer"]:checked');
  return checked ? checked.value : null;
}

function recordCurrentAnswer(answer) {
  const q = questionSequence[currentIndex];
  if (q.type === 'ranking') {
    const ordered = answer;
    results.push({
      globalOrder: currentIndex + 1,
      questionId: q.questionId,
      questionType: 'ranking',
      scene: q.scene,
      leftKey: '',
      rightKey: '',
      displayImages: q.images.join(' / '),
      answer: 'ranking',
      selectedImage: ordered[0] || '',
      ranking: ordered,
      rank1: ordered[0] || '',
      rank2: ordered[1] || '',
      rank3: ordered[2] || '',
      rank4: ordered[3] || '',
      rank5: ordered[4] || ''
    });
    return;
  }

  results.push({
    globalOrder: currentIndex + 1,
    questionId: q.questionId,
    questionType: q.key,
    scene: q.scene || sceneOf(q.leftKey),
    leftKey: q.leftKey,
    rightKey: q.rightKey,
    displayImages: `${q.leftKey} / ${q.rightKey}`,
    answer,
    selectedImage: answer === 'left' ? q.leftKey : (answer === 'right' ? q.rightKey : ''),
    ranking: '',
    rank1: '', rank2: '', rank3: '', rank4: '', rank5: '',
    retestOf: q.retestOf || '',
    originalLeftImage: q.originalLeftImage || '',
    originalRightImage: q.originalRightImage || ''
  });
}

async function submitPayloadByHiddenForm(payload) {
  return new Promise((resolve, reject) => {
    const frameName = `surveySubmit_${Date.now()}`;
    const frame = document.createElement('iframe');
    frame.name = frameName;
    frame.title = '回答送信用フレーム';
    frame.style.display = 'none';
    frame.onload = () => { /* クロスオリジンの応答本文は読まず、送信処理のみ行う */ };
    document.body.appendChild(frame);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = APPS_SCRIPT_URL;
    form.target = frameName;
    form.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'payload';
    input.value = JSON.stringify(payload);
    form.appendChild(input);
    document.body.appendChild(form);
    try {
      form.submit();
    } catch (error) {
      form.remove(); frame.remove(); reject(error); return;
    }
    window.setTimeout(() => { form.remove(); frame.remove(); resolve(); }, 2200);
  });
}

async function finishSurvey() {
  questionScreen.classList.add('hidden');
  sectionIntroScreen.classList.add('hidden');
  participantScreen.classList.add('hidden');
  completeScreen.classList.remove('hidden');
  saveStatus.textContent = '回答を保存しています…';
  const payload = { participant, results, completedAt: new Date().toISOString() };
  try {
    await submitPayloadByHiddenForm(payload);
    saveStatus.textContent = '回答を受け付けました。ご協力ありがとうございました。';
  } catch (error) {
    console.error(error);
    try { localStorage.setItem(`survey-${participant.sessionId}`, JSON.stringify(payload)); } catch (_) {}
    saveStatus.textContent = '回答の送信を確認できませんでした。通信状態を確認してください。';
  }
}

async function goToNextQuestion() {
  const answer = collectCurrentAnswer();
  if (answer === null || answer === '') return;
  const currentQ = questionSequence[currentIndex];
  recordCurrentAnswer(answer);

  // 最初の16問が終わった時点で、表示済みの左右を反転した5問を抽出します。
  if (currentIndex === 15) {
    const retests = createRetestQuestions();
    questionSequence.splice(16, 5, ...retests);
  }

  if (currentIndex >= TOTAL_QUESTIONS - 1) {
    await finishSurvey();
    return;
  }

  const previousSection = currentQ.section;
  currentIndex += 1;
  const nextQ = questionSequence[currentIndex];
  if (nextQ.section !== previousSection) {
    showSectionIntro(nextQ.section);
    return;
  }
  await renderCurrentQuestion();
}

ageInput.addEventListener('input', validateParticipant);
document.querySelectorAll('input[name="cgViewingFrequency"], input[name="cgExperience"], input[name="cgFrequency"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    updateCgFrequencyVisibility();
    validateParticipant();
  });
});
startButton.addEventListener('click', startSurvey);
beginSectionButton.addEventListener('click', renderCurrentQuestion);
nextButton.addEventListener('click', goToNextQuestion);
closeImageModal.addEventListener('click', closeModal);
imageModal.addEventListener('click', (event) => { if (event.target === imageModal) closeModal(); });
modalImage.addEventListener('click', closeModal);
modalImage.addEventListener('contextmenu', (event) => event.preventDefault());
modalImage.addEventListener('dragstart', (event) => event.preventDefault());
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !imageModal.classList.contains('hidden')) closeModal(); });
updateCgFrequencyVisibility();
validateParticipant();
