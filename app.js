// ===== 卒業研究アンケート・完全新規再構成版 =====

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxP3hNAl0AryJFMSEteNB9NT_OweafNgFF7-5WPMzMPFJ7goHE6MHYQ6uAIZzgXtqbS/exec";

const IMAGES = {
  CRC:"CRC.png", CRLL:"CRLL.png", CRLH:"CRLH.png", CRHL:"CRHL.png", CRHH:"CRHH.png",
  JC:"JC.png", JLL:"JLL.png", JLH:"JLH.png", JHL:"JHL.png", JHH:"JHH.png"
};

const SECTION_DEFS = {
  clean:{
    key:"clean", title:"汚れなしとの比較",
    intro:"この設問では、汚れなしの画像と汚れありの画像を比較します。\n\n2枚を十分に比較し、リアルだと思う方を選んでください。",
    question:"リアルだと思う方を選んでください。",
    pairs:[
      ["CRC","CRLL"],["CRC","CRLH"],["CRC","CRHL"],["CRC","CRHH"],
      ["JC","JLL"],["JC","JLH"],["JC","JHL"],["JC","JHH"]
    ]
  },
  dirt:{
    key:"dirt", title:"汚れ量の比較",
    intro:"この設問では、汚れの量が異なる2枚の画像を比較し、どちらがよりリアルに感じるかを評価します。\n\n2枚を十分に比較し、リアルだと思う方を選んでください。",
    question:"リアルだと思う方を選んでください。",
    pairs:[["CRLH","CRHH"],["CRLL","CRHL"],["JLH","JHH"],["JLL","JHL"]]
  },
  info:{
    key:"info", title:"情報量の比較",
    intro:"この設問では、汚れ表現の情報量が異なる2枚の画像を比較し、どちらがよりリアルに感じるかを評価します。\n\n2枚を十分に比較し、リアルだと思う方を選んでください。",
    question:"リアルだと思う方を選んでください。",
    pairs:[["CRLH","CRLL"],["CRHH","CRHL"],["JLH","JLL"],["JHH","JHL"]]
  }
};

const RANKING_DEFS = [
  {sceneKey:"classroom",scene:"教室",title:"5枚のランキング",
   intro:"この設問では、5枚の画像を比較し、リアリティの感じ方を順位付けします。\n\n5枚すべてを、リアルだと思った順に1位から5位まで並べ替えてください。",
   images:["CRC","CRLL","CRLH","CRHL","CRHH"]},
  {sceneKey:"shrine",scene:"神社",title:"5枚のランキング",
   intro:"この設問では、5枚の画像を比較し、リアリティの感じ方を順位付けします。\n\n5枚すべてを、リアルだと思った順に1位から5位まで並べ替えてください。",
   images:["JC","JLL","JLH","JHL","JHH"]}
];

const TOTAL_QUESTIONS = 23;

const introScreen=document.getElementById("introScreen");
const surveyScreen=document.getElementById("surveyScreen");
const completeScreen=document.getElementById("completeScreen");
const ageInput=document.getElementById("age");
const cgFollowup=document.getElementById("cgFollowup");
const startButton=document.getElementById("startButton");
const introStatus=document.getElementById("introStatus");
const progressText=document.getElementById("progressText");
const sectionIntroCard=document.getElementById("sectionIntroCard");
const sectionIntroTitle=document.getElementById("sectionIntroTitle");
const sectionIntroText=document.getElementById("sectionIntroText");
const sectionIntroButton=document.getElementById("sectionIntroButton");
const questionCard=document.getElementById("questionCard");
const questionArea=document.getElementById("questionArea");
const nextButton=document.getElementById("nextButton");
const saveStatus=document.getElementById("saveStatus");
const imageModal=document.getElementById("imageModal");
const modalImage=document.getElementById("modalImage");
const closeImageModal=document.getElementById("closeImageModal");

let sequence=[];
let currentIndex=0;
let results=[];
let initialComparisonRecords=[];

const participant={
  age:"", cgViewingFrequency:"", cgExperience:"", cgFrequency:"",
  sessionId:createSessionId()
};

function createSessionId(){
  try{
    if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  }catch(_){}
  return "S"+Date.now().toString(36)+Math.random().toString(36).slice(2);
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function radioValue(name){
  const el=document.querySelector(`input[name="${name}"]:checked`);
  return el?el.value:"";
}

function validateIntro(){
  const age=ageInput.value.trim();
  const ageOK=/^[0-9]+$/.test(age)&&Number(age)>=1&&Number(age)<=120;
  const viewing=radioValue("cgViewingFrequency");
  const exp=radioValue("cgExperience");
  const freq=radioValue("cgFrequency");

  startButton.disabled=!(
    ageOK && viewing && exp && (exp==="ない" || freq)
  );
}

function updateCgBranch(){
  const has=radioValue("cgExperience")==="ある";
  cgFollowup.classList.toggle("hidden",!has);
  if(!has){
    document.querySelectorAll('input[name="cgFrequency"]').forEach(el=>el.checked=false);
  }
  validateIntro();
}

function imagePath(key){
  return `./images/${encodeURIComponent(IMAGES[key])}`;
}

/*
 * 軽量な先読み。
 * 画像をキャッシュ用のJavaScript変数に保持せず、ブラウザの通常キャッシュに任せる。
 * 表示時は表示用のimgを別に作るため、先読みの成否が表示処理を壊さない。
 */
function preloadImage(key){
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>resolve(true);
    img.onerror=()=>resolve(false);
    img.src=imagePath(key);
  });
}

function preloadNext(){
  const next=sequence[currentIndex+1];
  if(!next) return;
  const keys=next.kind==="ranking"?next.images:[next.leftKey,next.rightKey];
  keys.forEach((key)=>preloadImage(key));
}

function displayImage(img,key,alt){
  return new Promise((resolve)=>{
    let attempt=0;

    const load=()=>{
      attempt++;
      const src=imagePath(key);

      img.onload=()=>{
        img.onload=null;
        img.onerror=null;
        resolve(true);
      };

      img.onerror=()=>{
        img.onload=null;
        img.onerror=null;
        if(attempt<3){
          setTimeout(load,400*attempt);
        }else{
          resolve(false);
        }
      };

      img.src=attempt===1?src:`${src}?retry=${attempt}`;
    };

    img.alt=alt;
    img.draggable=false;
    load();
  });
}

function protectImage(img){
  img.draggable=false;
  img.addEventListener("contextmenu",(e)=>e.preventDefault());
  img.addEventListener("dragstart",(e)=>e.preventDefault());
  img.addEventListener("mousedown",(e)=>{
    if(e.button===2)e.preventDefault();
  });
}

function openModal(src){
  modalImage.src=src;
  imageModal.classList.remove("hidden");
}

function closeModal(){
  imageModal.classList.add("hidden");
  modalImage.removeAttribute("src");
}

function makeComparison(q){
  const block=document.createElement("div");
  block.className="question-block";

  const qt=document.createElement("p");
  qt.className="question-text";
  qt.textContent=q.question;
  block.appendChild(qt);

  const grid=document.createElement("div");
  grid.className="comparison-grid";

  const leftCard=document.createElement("div");
  leftCard.className="comparison-card";
  const leftImg=document.createElement("img");
  leftImg.className="comparison-image";
  protectImage(leftImg);
  leftImg.addEventListener("click",()=>{if(leftImg.src)openModal(leftImg.src)});
  const leftLabel=document.createElement("div");
  leftLabel.className="position-label";
  leftLabel.textContent="左の画像";
  leftCard.append(leftImg,leftLabel);

  const rightCard=document.createElement("div");
  rightCard.className="comparison-card";
  const rightImg=document.createElement("img");
  rightImg.className="comparison-image";
  protectImage(rightImg);
  rightImg.addEventListener("click",()=>{if(rightImg.src)openModal(rightImg.src)});
  const rightLabel=document.createElement("div");
  rightLabel.className="position-label";
  rightLabel.textContent="右の画像";
  rightCard.append(rightImg,rightLabel);

  grid.append(leftCard,rightCard);
  block.appendChild(grid);

  const fieldset=document.createElement("fieldset");
  fieldset.className="answer-fieldset";

  const legend=document.createElement("legend");
  legend.textContent="1つ選択してください。";
  fieldset.appendChild(legend);

  const options=document.createElement("div");
  options.className="answer-options three-choice";

  const data=[
    ["left","左"],
    ["equal","わからない"],
    ["right","右"]
  ];

  data.forEach(([value,label])=>{
    const wrap=document.createElement("label");
    wrap.className="answer-option";
    const input=document.createElement("input");
    input.type="radio";
    input.name="currentAnswer";
    input.value=value;
    const span=document.createElement("span");
    span.textContent=label;
    wrap.append(input,span);
    options.appendChild(wrap);
    input.addEventListener("change",()=>nextButton.disabled=false);
  });
  fieldset.appendChild(options);
  block.appendChild(fieldset);

  return {block,leftImg,rightImg};
}

function makeRanking(q){
  const block=document.createElement("div");
  block.className="question-block";

  const qt=document.createElement("p");
  qt.className="question-text";
  qt.textContent="5枚の画像を、リアルだと思った順に1位から5位まで選択してください。";
  block.appendChild(qt);

  const list=document.createElement("div");
  list.className="ranking-list";

  const selected=[];

  const update=()=>{
    [...list.children].forEach(item=>{
      const rank=selected.indexOf(item.dataset.key);
      const rankEl=item.querySelector(".rank-number");
      if(rank>=0){
        item.classList.add("selected");
        rankEl.textContent=`${rank+1}位`;
      }else{
        item.classList.remove("selected");
        rankEl.textContent="";
      }
    });

    nextButton.disabled=selected.length!==q.images.length;
  };

  q.images.forEach((key)=>{
    const item=document.createElement("div");
    item.className="rank-item";
    item.dataset.key=key;
    item.setAttribute("role","button");
    item.setAttribute("tabindex","0");
    item.setAttribute("aria-label","ランキング候補の画像");

    const img=document.createElement("img");
    img.className="ranking-image";
    img.src=imagePath(key);
    img.alt="ランキング対象の背景3DCG画像";
    protectImage(img);
    // 画像をクリックした場合は拡大表示だけ行い、ランキング選択にはしない。
    img.addEventListener("click",(e)=>{
      e.stopPropagation();
      openModal(img.src);
    });
    const rank=document.createElement("span");
    rank.className="rank-number";

    item.append(img,rank);
    list.appendChild(item);

    const toggle=()=>{
      const index=selected.indexOf(key);
      if(index>=0){
        selected.splice(index,1);
      }else if(selected.length<q.images.length){
        selected.push(key);
      }
      update();
    };

    item.addEventListener("click",toggle);
    item.addEventListener("keydown",(e)=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        toggle();
      }
    });
  });

  update();
  block.appendChild(list);

  const help=document.createElement("p");
  help.className="rank-help";
  help.textContent="画像をリアルだと思う順にクリックしてください。1回目が1位、2回目が2位…となります。もう一度クリックすると選択が外れ、後の順位が繰り上がります。";
  block.appendChild(help);

  return block;
}

function makeComparisonQuestion(def,pair,isRetest=false,record=null){
  let leftKey=pair[0], rightKey=pair[1];

  // Initial comparison questions: randomize left/right for every section.
  // Retest: use the explicitly reversed pair built from the original presentation.
  if(!isRetest){
    if(Math.random()<0.5)[leftKey,rightKey]=[rightKey,leftKey];
  }

  return {
    kind:isRetest?"retest":"comparison",
    sectionKey:isRetest?"retest":def.key,
    originalSectionKey:isRetest?def.key:def.key,
    title:isRetest?"画像の比較":def.title,
    intro:isRetest
      ?"この設問では、これまでの比較問題の一部を、画像の左右を入れ替えてもう一度評価します。\n\n2枚を十分に比較して回答してください。"
      :def.intro,
    question:isRetest
      ?"2枚の画像を比較して、どちらの方がよりリアルに感じますか？"
      :def.question,
    leftKey,rightKey,
    questionId:isRetest?`${record.questionId}_retest`:
      `${def.key}_${pair[0]}_${pair[1]}_${Math.random().toString(36).slice(2,8)}`,
    originalQuestionId:isRetest?record.questionId:"",
    originalLeftImage:isRetest?record.leftKey:"",
    originalRightImage:isRetest?record.rightKey:"",
    displayPair:[leftKey,rightKey]
  };
}

function buildAlternating(def){
  const cr=shuffle(def.pairs.filter(p=>p[0].startsWith("CR")));
  const j=shuffle(def.pairs.filter(p=>p[0].startsWith("J")));
  const startCR=Math.random()<0.5;
  const out=[];

  for(let i=0;i<cr.length;i++){
    out.push(makeComparisonQuestion(def,startCR?cr[i]:j[i]));
    out.push(makeComparisonQuestion(def,startCR?j[i]:cr[i]));
  }
  return out;
}

function buildInitialSequence(){
  return [
    ...buildAlternating(SECTION_DEFS.clean),
    ...buildAlternating(SECTION_DEFS.dirt),
    ...buildAlternating(SECTION_DEFS.info)
  ];
}

function buildRetests(){
  // exactly 5 different questions from the 8 initial dirt/info comparisons
  return shuffle(initialComparisonRecords)
    .slice(0,5)
    .map(record=>{
      const rev=[record.rightKey,record.leftKey];
      return {
        kind:"retest",
        sectionKey:"retest",
        title:"画像の比較",
        intro:
          "この設問では、2枚の画像を比較し、どちらがよりリアルに感じるかを評価します。\n\n2枚を十分に比較し、リアルだと思う方を選んでください。",
        question:"リアルだと思う方を選んでください。",
        leftKey:rev[0],
        rightKey:rev[1],
        questionId:`${record.questionId}_retest`,
        originalQuestionId:record.questionId,
        originalLeftImage:record.leftKey,
        originalRightImage:record.rightKey,
        displayPair:rev
      };
    });
}

function buildRankings(){
  const r=RANKING_DEFS.map(x=>({
    kind:"ranking",
    sectionKey:"ranking",
    title:x.title,
    intro:x.intro,
    sceneKey:x.sceneKey,
    scene:x.scene,
    images:[...x.images]
  }));
  return Math.random()<0.5?r:[r[1],r[0]];
}

function showSectionIntro(q){
  questionCard.classList.add("hidden");
  sectionIntroCard.classList.remove("hidden");
  sectionIntroTitle.textContent=q.title;
  sectionIntroText.textContent=q.intro;
  progressText.textContent=`${currentIndex+1} / ${TOTAL_QUESTIONS}`;
}

async function showCurrentQuestion(){
  const q=sequence[currentIndex];
  questionCard.classList.remove("hidden");
  sectionIntroCard.classList.add("hidden");
  nextButton.disabled=true;
  questionArea.innerHTML='<div class="loading">画像を読み込んでいます…</div>';

  try{
    if(q.kind==="ranking"){
      questionArea.innerHTML="";
      const block=makeRanking(q);
      questionArea.appendChild(block);
      preloadNext();
      return;
    }

    questionArea.innerHTML="";
    const built=makeComparison(q,q.leftKey,q.rightKey);

    questionArea.appendChild(built.block);

    const okLeft=await displayImage(built.leftImg,q.leftKey,"左の画像");
    const okRight=await displayImage(built.rightImg,q.rightKey,"右の画像");

    if(!okLeft || !okRight){
      questionArea.innerHTML="";
      const msg=document.createElement("div");
      msg.className="loading";
      msg.textContent="画像の読み込みに失敗しました。下の「再読み込み」を押してください。";

      const retry=document.createElement("button");
      retry.className="primary";
      retry.type="button";
      retry.textContent="再読み込み";
      retry.addEventListener("click",()=>showCurrentQuestion());

      questionArea.append(msg,retry);
      return;
    }

    // Only start preloading after the current question is successfully displayed.
    preloadNext();
  }catch(err){
    console.error(err);
    questionArea.innerHTML='<div class="loading">画像の読み込みに失敗しました。下の「再読み込み」を押してください。</div>';
    const retry=document.createElement("button");
    retry.className="primary";
    retry.textContent="再読み込み";
    retry.type="button";
    retry.addEventListener("click",()=>showCurrentQuestion());
    questionArea.appendChild(retry);
  }
}

// Correct helper: this uses q's existing display pair.
// kept as separate function to make the retest path explicit.
function makeComparison(q,leftKey,rightKey){
  const wrapper=makeComparisonInternal(q,leftKey,rightKey);
  return wrapper;
}

function makeComparisonInternal(q,leftKey,rightKey){
  const oldQ=q;
  // Reuse the same DOM builder while preserving the actual q keys.
  return makeComparisonDOM(oldQ,leftKey,rightKey);
}

function makeComparisonDOM(q,leftKey,rightKey){
  const block=document.createElement("div");
  block.className="question-block";

  const qt=document.createElement("p");
  qt.className="question-text";
  qt.textContent=q.question;
  block.appendChild(qt);

  const grid=document.createElement("div");
  grid.className="comparison-grid";

  function cardFor(key, label){
    const card=document.createElement("div");
    card.className="comparison-card";
    const img=document.createElement("img");
    img.className="comparison-image";
    protectImage(img);
    img.addEventListener("click",()=>{if(img.src)openModal(img.src)});
    const pos=document.createElement("div");
    pos.className="position-label";
    pos.textContent=label;
    card.append(img,pos);
    return {card,img};
  }

  const L=cardFor(leftKey,"左の画像");
  const R=cardFor(rightKey,"右の画像");
  grid.append(L.card,R.card);
  block.appendChild(grid);

  const fieldset=document.createElement("fieldset");
  fieldset.className="answer-group";
  const legend=document.createElement("legend");
  legend.textContent="リアルだと思う方を選んでください。";
  fieldset.appendChild(legend);

  const options=document.createElement("div");
  options.className="answer-options three-choice";
  const vals=[
    ["left","左"],
    ["equal","わからない"],
    ["right","右"]
  ];

  vals.forEach(([value,label])=>{
    const opt=document.createElement("label");
    opt.className="answer-option";
    const input=document.createElement("input");
    input.type="radio";
    input.name="currentAnswer";
    input.value=value;
    const span=document.createElement("span");
    span.textContent=label;
    opt.append(input,span);
    options.appendChild(opt);
    input.addEventListener("change",()=>{nextButton.disabled=false});
  });

  fieldset.appendChild(options);
  block.appendChild(fieldset);
  return {block,leftImg:L.img,rightImg:R.img};
}

async function showCurrentQuestionFixed(){
  const q=sequence[currentIndex];
  questionCard.classList.remove("hidden");
  sectionIntroCard.classList.add("hidden");
  nextButton.disabled=true;
  questionArea.innerHTML='<div class="loading">画像を読み込んでいます…</div>';

  try{
    if(q.kind==="ranking"){
      questionArea.innerHTML="";
      questionArea.appendChild(makeRanking(q));
      preloadNext();
      return;
    }

    questionArea.innerHTML="";
    const built=makeComparisonDOM(q,q.leftKey,q.rightKey);
    questionArea.appendChild(built.block);

    const [leftOK,rightOK]=await Promise.all([
      displayImage(built.leftImg,q.leftKey,"左の画像"),
      displayImage(built.rightImg,q.rightKey,"右の画像")
    ]);

    if(!leftOK||!rightOK){
      questionArea.innerHTML="";
      const retry=document.createElement("button");
      retry.className="primary";
      retry.type="button";
      retry.textContent="再読み込み";
      const msg=document.createElement("div");
      msg.className="loading";
      msg.textContent="画像の読み込みに失敗しました。";
      retry.addEventListener("click",showCurrentQuestionFixed);
      questionArea.append(msg,retry);
      return;
    }

    preloadNext();
  }catch(err){
    console.error(err);
    questionArea.innerHTML="";
    const msg=document.createElement("div");
    msg.className="loading";
    msg.textContent="画像の読み込みに失敗しました。";
    const retry=document.createElement("button");
    retry.className="primary";
    retry.type="button";
    retry.textContent="再読み込み";
    retry.addEventListener("click",showCurrentQuestionFixed);
    questionArea.append(msg,retry);
  }
}

function collectAnswer(){
  const checked=document.querySelector('input[name="currentAnswer"]:checked');
  return checked?checked.value:"";
}

function collectRanking(){
  const list=questionArea.querySelector(".ranking-list");
  if(!list)return [];
  return [...list.children]
    .filter(item=>item.classList.contains("selected"))
    .sort((a,b)=>{
      const ar=parseInt(a.querySelector(".rank-number")?.textContent||"",10);
      const br=parseInt(b.querySelector(".rank-number")?.textContent||"",10);
      return ar-br;
    })
    .map(item=>item.dataset.key);
}

function resultRecord(q,answer){
  if(q.kind==="ranking"){
    const ranks=collectRanking();
    return {
      globalOrder:currentIndex+1,
      questionId:`${q.sceneKey}_ranking`,
      questionType:"ranking",
      scene:q.scene,
      leftKey:"",rightKey:"",
      displayImages:q.images.join(" / "),
      answer:"ranking",
      selectedImage:ranks[0]||"",
      ranking:ranks.join(" > "),
      rank1:ranks[0]||"",rank2:ranks[1]||"",rank3:ranks[2]||"",
      rank4:ranks[3]||"",rank5:ranks[4]||"",
      scaleLabel:"",
      retestOf:"",originalLeftImage:"",originalRightImage:""
    };
  }

  const selected=answer==="left"?q.leftKey:answer==="right"?q.rightKey:"";

  return {
    globalOrder:currentIndex+1,
    questionId:q.questionId,
    questionType:q.kind==="retest"?"retest":q.sectionKey,
    scene:q.leftKey.startsWith("CR")?"教室":"神社",
    leftKey:q.leftKey,
    rightKey:q.rightKey,
    displayImages:`${q.leftKey} / ${q.rightKey}`,
    answer,
    selectedImage:selected,
    ranking:"",
    rank1:"",rank2:"",rank3:"",rank4:"",rank5:"",
    scaleLabel:({left:"左",equal:"わからない",right:"右"})[answer]||"",
    retestOf:q.kind==="retest"?q.originalQuestionId:"",
    originalLeftImage:q.kind==="retest"?q.originalLeftImage:"",
    originalRightImage:q.kind==="retest"?q.originalRightImage:""
  };
}

startButton.addEventListener("click",()=>{
  participant.age=ageInput.value.trim();
  participant.cgViewingFrequency=radioValue("cgViewingFrequency");
  participant.cgExperience=radioValue("cgExperience");
  participant.cgFrequency=participant.cgExperience==="ある"?radioValue("cgFrequency"):"";

  sequence=buildInitialSequence();
  currentIndex=0;
  results=[];
  initialComparisonRecords=[];

  introScreen.classList.add("hidden");
  surveyScreen.classList.remove("hidden");
  showSectionIntro(sequence[0]);
});

ageInput.addEventListener("input",validateIntro);
document.querySelectorAll('input[name="cgViewingFrequency"]').forEach(el=>el.addEventListener("change",validateIntro));
document.querySelectorAll('input[name="cgExperience"]').forEach(el=>el.addEventListener("change",updateCgBranch));
document.querySelectorAll('input[name="cgFrequency"]').forEach(el=>el.addEventListener("change",validateIntro));

sectionIntroButton.addEventListener("click",()=>showCurrentQuestionFixed());

nextButton.addEventListener("click",async()=>{
  const q=sequence[currentIndex];

  if(q.kind==="ranking"){
    const ranks=collectRanking();
    if(ranks.length!==5)return;
    results.push(resultRecord(q,"ranking"));
  }else{
    const answer=collectAnswer();
    if(!answer)return;

    const rec=resultRecord(q,answer);
    results.push(rec);

    if(
      q.kind==="comparison" &&
      (q.sectionKey==="dirt"||q.sectionKey==="info")
    ){
      initialComparisonRecords.push(rec);
    }
  }

  // Continue through the current sequence.
  if(currentIndex<sequence.length-1){
    const prev=sequence[currentIndex];
    currentIndex++;

    if(prev.sectionKey!==sequence[currentIndex].sectionKey){
      showSectionIntro(sequence[currentIndex]);
    }else{
      await showCurrentQuestionFixed();
    }
    return;
  }

  // Initial 16 are completed; add retest five and rankings two.
  if(sequence.length===16){
    if(initialComparisonRecords.length!==8){
      console.error("再テスト候補数:",initialComparisonRecords.length);
    }

    const retests=buildRetests();
    const rankings=buildRankings();
    sequence.push(...retests,...rankings);

    currentIndex++;
    showSectionIntro(sequence[currentIndex]);
    return;
  }

  surveyScreen.classList.add("hidden");
  completeScreen.classList.remove("hidden");
  await saveResults();
});

async function saveResults(){
  const payload={
    participant,
    results,
    completedAt:new Date().toISOString()
  };

  saveStatus.textContent="回答を保存しています…";

  try{
    const frameName=`saveFrame_${Date.now()}`;
    const iframe=document.createElement("iframe");
    iframe.name=frameName;
    iframe.style.display="none";
    document.body.appendChild(iframe);

    const form=document.createElement("form");
    form.method="POST";
    form.action=APPS_SCRIPT_URL;
    form.target=frameName;
    form.style.display="none";

    const input=document.createElement("input");
    input.type="hidden";
    input.name="payload";
    input.value=JSON.stringify(payload);

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();

    await new Promise(resolve=>setTimeout(resolve,1800));
    form.remove();
    iframe.remove();

    saveStatus.textContent="回答を受け付けました。ご協力ありがとうございました。";
  }catch(err){
    console.error(err);
    saveStatus.textContent="回答の保存を確認できませんでした。通信状態を確認してください。";
  }
}

closeImageModal.addEventListener("click",closeModal);
modalImage.addEventListener("click",closeModal);
imageModal.addEventListener("click",e=>{if(e.target===imageModal)closeModal()});
modalImage.addEventListener("contextmenu",e=>e.preventDefault());
modalImage.addEventListener("dragstart",e=>e.preventDefault());

document.addEventListener("contextmenu",e=>{
  if(e.target&&e.target.tagName==="IMG")e.preventDefault();
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!imageModal.classList.contains("hidden"))closeModal();
});
