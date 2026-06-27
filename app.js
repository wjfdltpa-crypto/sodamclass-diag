/* ============================================================
   소담클래스 브랜드 자가진단 — 앱 로직 (app.js)
   화면: intro → 응답자정보 → 5개 영역 설문 → 제출 → 결과
   재열람: URL이 #id=<uuid> 이면 저장된 결과를 바로 표시
   ============================================================ */
(function(){
"use strict";

/* ---------- Supabase 클라이언트 ---------- */
const CFG = window.APP_CONFIG || {};
let sb = null;
function supa(){
  if(sb) return sb;
  if(!window.supabase){ console.warn("supabase-js 미로딩"); return null; }
  if(!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("YOUR-PROJECT")) return null;
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  return sb;
}
function siteBase(){
  const b = (CFG.SITE_BASE_URL||"").replace(/\/+$/,"");
  if(b) return b;
  return location.origin + location.pathname.replace(/\/[^\/]*$/, "");
}

/* ===================== 점수 로직 (확정본) ===================== */
// (나) 균등분할: 문항 내 1등=5 … 꼴등=1
function optionScore(idx,total){ if(total<=1)return 5; return 5-(idx*(4/(total-1))); }

const SUBTITLE = {
  biz:'창업 이력, 팀, 수익 구조 등 사업의 기초 체력을 확인합니다.',
  dist:'입점 채널 운영, 노출·전환, 재고까지 판매의 실행력을 점검합니다.',
  mkt:'KPI, 예산, 콘텐츠, CRM 등 마케팅 운영 체계를 진단합니다.',
  brand:'미션·타깃·아이덴티티·경험까지 브랜드의 일관성을 살펴봅니다.',
  tax:'자금 흐름, 원가·마진, 세무 증빙 등 재무 관리 상태를 확인합니다.'
};

// 등급 (임계값 고정 + 브랜드 라벨)
const GRADES = [
  {min:88,key:'S',en:'Market Ready',ko:'시장 주도 단계 — 확장에 집중',col:'#1f9d6b',soft:'#e7f6ef',rng:'88–100'},
  {min:75,key:'A',en:'Scaling Up',ko:'성장 가속 단계 — 체계 고도화',col:'#2f8f4e',soft:'#e9f5ec',rng:'75–87'},
  {min:65,key:'B',en:'Building',ko:'성장 단계 — 운영 체계 강화',col:'#234EC9',soft:'#e8eefb',rng:'65–74'},
  {min:50,key:'C',en:'Catching Up',ko:'초기 단계 — 기본 구조 정립 필요',col:'#c08a16',soft:'#fbf2da',rng:'50–64'},
  {min:0, key:'D',en:'Early Stage',ko:'출발 단계 — 토대 구축 필요',col:'#d6435f',soft:'#fceaee',rng:'0–49'},
];
function gradeOf(pct){ return GRADES.find(g=>pct>=g.min); }

function riskOf(pct){
  if(pct>=70) return {key:'ok',label:'양호',sym:'△',cls:'ok'};
  if(pct>=50) return {key:'mid',label:'보통',sym:'△',cls:'mid'};
  return {key:'bad',label:'위험',sym:'✕',cls:'bad'};
}
const COMMENTS = {
  biz:{ok:'양호 — 사업 기초 체력 안정적',mid:'보완 필요 — 사업 기초 체력 강화 권장',bad:'위험 — 수익·팀 구조 즉시 점검 필요'},
  dist:{ok:'양호 — 채널 운영 안정적',mid:'보완 필요 — 채널 운영 체계 강화 권장',bad:'위험 — 판매·채널 운영 즉시 정비 필요'},
  mkt:{ok:'양호 — 마케팅 운영 안정적',mid:'보완 필요 — 마케팅 체계 강화 권장',bad:'위험 — 마케팅 운영 즉시 정비 필요'},
  brand:{ok:'양호 — 브랜드 일관성 우수',mid:'보완 필요 — 브랜드 일관성 강화 권장',bad:'위험 — 브랜드 정체성 즉시 정립 필요'},
  tax:{ok:'양호 — 재무·세무 관리 안정적',mid:'보완 필요 — 재무·세무 관리 강화 권장',bad:'위험 — 자금·세무 관리 즉시 점검 필요'}
};
function taskFor(secKey, qi){
  return TASK_MAP[secKey+'-'+qi] || {signal:'-', todo:'-', effect:'-'};
}

/* ===================== 채점 ===================== */
function scoreAll(answers){
  const areas = SECTIONS.map(sec=>{
    let sum=0; const per=[];
    sec.questions.forEach((q,qi)=>{
      const ai=answers[sec.key+'-'+qi];
      const sc=(ai==null)?0:optionScore(ai,q.options.length);
      sum+=sc; per.push({qi,q:q.q,score:sc});
    });
    const max=sec.questions.length*5;
    const pct=Math.round((sum/max)*100);
    return {key:sec.key,name:sec.name,pct,sum,max,per};
  });
  const overall = Math.round(areas.reduce((a,x)=>a+x.pct,0)/areas.length); // 방식 B
  return {areas,overall};
}
function buildTasks(areas){
  let tasks=[];
  areas.forEach(a=>{
    a.per.filter(p=>p.score<=2.5).sort((x,y)=>x.score-y.score)
      .forEach(p=> tasks.push({area:a.name,akey:a.key,...taskFor(a.key,p.qi),score:p.score}));
  });
  tasks.sort((x,y)=>x.score-y.score); tasks=tasks.slice(0,20);
  const grouped={};
  SECTIONS.forEach(s=>{ const arr=tasks.filter(t=>t.akey===s.key); if(arr.length)grouped[s.name]=arr; });
  return {tasks,grouped};
}

/* ===================== 응답자 정보 필드 ===================== */
const INFO_FIELDS = [
  {key:'company', label:'기업명', type:'text', ph:'(주)타드'},
  {key:'brand',   label:'브랜드명', type:'text', ph:'브랜드명을 입력하세요'},
  {key:'email',   label:'이메일 주소', type:'text', ph:'name@example.com'},
  {key:'industry',label:'사업분야', type:'choice', options:['패션/잡화','뷰티','라이프스타일/홈리빙','식음료(F&B)','디지털콘텐츠/서비스','핸드메이드/공예','건강/웰니스']},
  {key:'revenue', label:'월매출 규모', type:'choice', options:['1천만원 미만','1천만 ~ 3천만','3천만 ~ 5천만','5천만 ~ 1억','1억 ~ 3억','3억 ~ 10억','10억원 이상']},
];

/* ===================== 상태 ===================== */
const TOTAL_STEPS = 1 + 1 + SECTIONS.length;
let step = 0;
const answers = {};
const info = {};
let submitting = false;

const $ = id=>document.getElementById(id);
let main, bar, pips, stepcount, miniprog, nextBtn, prevBtn, toastEl, chrome;

function totalQ(){ return SECTIONS.reduce((a,s)=>a+s.questions.length,0); }
function toast(msg){
  toastEl.textContent=msg; toastEl.classList.add('show');
  clearTimeout(toastEl._t); toastEl._t=setTimeout(()=>toastEl.classList.remove('show'),2100);
}

/* ===================== 설문 화면 ===================== */
function buildPips(){
  pips.innerHTML='';
  for(let i=1;i<TOTAL_STEPS;i++){
    const p=document.createElement('div'); p.className='pip'; p.dataset.i=i; pips.appendChild(p);
  }
}
function refreshChrome(){
  const overall = (step===0)?0 : Math.round((step/(TOTAL_STEPS-1))*100);
  bar.style.width = overall+'%';
  [...pips.children].forEach(p=>{
    const i=+p.dataset.i;
    p.classList.toggle('done', i<step);
    p.classList.toggle('cur', i===step);
  });
  stepcount.textContent = step===0 ? '' : (step + ' / ' + (TOTAL_STEPS-1));
}
function renderSurvey(){
  window.scrollTo({top:0});
  if(step===0) renderIntro();
  else if(step===1) renderInfo();
  else renderSection(step-2);
  prevBtn.style.display = step===0 ? 'none' : 'block';
  refreshChrome();
}
function renderIntro(){
  nextBtn.textContent='시작하기'; nextBtn.disabled=false;
  miniprog.innerHTML = '약 10분 소요 · 총 '+totalQ()+'문항';
  main.innerHTML = `
    <div class="eyebrow">Brand Self-Diagnosis</div>
    <h1 class="h1">우리 브랜드의 현재 위치를<br>5개 영역으로 진단합니다</h1>
    <p class="lead">응답이 끝나면 영역별 달성률과 등급(BRAND LEVEL), 우선 실행 과제를 담은 결과 리포트를 받아보실 수 있습니다. 결과는 입력하신 이메일로도 발송됩니다.</p>
    <div class="hero-card">
      <div class="eyebrow" style="margin-bottom:10px">진단 영역</div>
      <div class="areas">${SECTIONS.map(s=>`<span class="areachip">${s.name}</span>`).join('')}</div>
      <div class="hero-meta">
        <div class="hm"><div class="n">${totalQ()}</div><div class="l">진단 문항</div></div>
        <div class="hm"><div class="n">5</div><div class="l">진단 영역</div></div>
        <div class="hm"><div class="n">~10<span style="font-size:13px">분</span></div><div class="l">예상 소요</div></div>
      </div>
    </div>`;
}
function renderInfo(){
  nextBtn.textContent='다음';
  miniprog.innerHTML = '응답자 정보 입력';
  main.innerHTML = `
    <div class="sec-intro">
      <div class="kicker">STEP 1 · 응답자 정보</div>
      <h2>먼저 기본 정보를<br>알려주세요</h2>
      <p>결과 리포트 발송과 식별에 사용됩니다.</p>
    </div><div id="infoForm"></div>`;
  const form = $('infoForm');
  INFO_FIELDS.forEach(f=>{
    const wrap=document.createElement('div'); wrap.className='field';
    if(f.type==='text'){
      wrap.innerHTML = `<label>${f.label}<span class="req">*</span></label>
        <input type="text" id="if_${f.key}" placeholder="${f.ph}" autocomplete="off" inputmode="${f.key==='email'?'email':'text'}">`;
      form.appendChild(wrap);
      const inp = wrap.querySelector('input');
      inp.value = info[f.key]||'';
      inp.addEventListener('input', e=>{ info[f.key]=e.target.value.trim(); updateInfoBtn(); });
    } else {
      wrap.innerHTML = `<label>${f.label}<span class="req">*</span></label>
        <div class="choice-grid">${f.options.map((o,i)=>`
          <label class="opt"><input type="radio" name="${f.key}" value="${i}" ${info[f.key]===i?'checked':''}>
          <span class="face">${o}</span></label>`).join('')}</div>`;
      form.appendChild(wrap);
      wrap.querySelectorAll('input').forEach(r=>r.addEventListener('change',e=>{ info[f.key]=+e.target.value; updateInfoBtn(); }));
    }
  });
  updateInfoBtn();
}
function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v||''); }
function infoComplete(){
  return INFO_FIELDS.every(f=> f.type==='text'
    ? (f.key==='email' ? isEmail(info.email) : (info[f.key]&&info[f.key].length))
    : (info[f.key]!=null));
}
function updateInfoBtn(){ nextBtn.disabled = !infoComplete(); }

function renderSection(si){
  const sec = SECTIONS[si];
  nextBtn.textContent = si===SECTIONS.length-1 ? '응답 완료' : '다음';
  const done = sec.questions.filter((_,qi)=>answers[sec.key+'-'+qi]!=null).length;
  miniprog.innerHTML = `<b>${done}</b> / ${sec.questions.length} 문항 응답`;
  main.innerHTML = `
    <div class="sec-intro">
      <div class="kicker">STEP ${si+2} · 진단 ${si+1}/${SECTIONS.length}</div>
      <h2>${sec.name}</h2><p>${SUBTITLE[sec.key]||''}</p>
    </div><div id="qlist"></div>`;
  const list=$('qlist');
  sec.questions.forEach((q,qi)=>{
    const id=sec.key+'-'+qi;
    const card=document.createElement('div'); card.className='qcard'; card.id='q_'+id;
    card.innerHTML = `
      <div class="qhead"><div class="qnum">${qi+1}</div><div class="qtext">${q.q}</div></div>
      <div class="opts-stack">${q.options.map((o,oi)=>`
        <label class="opt"><input type="radio" name="${id}" value="${oi}" ${answers[id]===oi?'checked':''}>
        <span class="face">${o}</span></label>`).join('')}</div>`;
    list.appendChild(card);
    card.querySelectorAll('input').forEach(r=>r.addEventListener('change',()=>{
      answers[id]=+r.value; card.classList.remove('flag');
      const d = sec.questions.filter((_,k)=>answers[sec.key+'-'+k]!=null).length;
      miniprog.innerHTML = `<b>${d}</b> / ${sec.questions.length} 문항 응답`;
    }));
  });
}
function firstUnanswered(si){
  const sec=SECTIONS[si];
  for(let qi=0;qi<sec.questions.length;qi++){ if(answers[sec.key+'-'+qi]==null) return qi; }
  return -1;
}
function goNext(){
  if(submitting) return;
  if(step===0){ step=1; renderSurvey(); return; }
  if(step===1){
    if(!infoComplete()){ toast(isEmail(info.email)?'모든 정보를 입력해주세요':'이메일 형식을 확인해주세요'); return; }
    step=2; renderSurvey(); return;
  }
  const si=step-2; const miss=firstUnanswered(si);
  if(miss>=0){
    const sec=SECTIONS[si];
    const card=$('q_'+sec.key+'-'+miss);
    card.classList.add('flag'); card.scrollIntoView({behavior:'smooth',block:'center'});
    toast('아직 응답하지 않은 문항이 있어요'); return;
  }
  if(si===SECTIONS.length-1){ submit(); return; }
  step++; renderSurvey();
}
function goPrev(){ if(step>0&&!submitting){ step--; if(nextBtn.disabled&&step<TOTAL_STEPS-1)nextBtn.disabled=false; renderSurvey(); } }

/* ===================== 제출 ===================== */
function setBusy(on, label){
  submitting=on; nextBtn.disabled=on; prevBtn.disabled=on;
  if(on){ nextBtn.textContent=label||'처리 중…'; }
}
async function submit(){
  setBusy(true,'결과 계산 중…');
  const {areas,overall}=scoreAll(answers);
  const grade=gradeOf(overall);
  const payload = {
    company: info.company, brand: info.brand, email: info.email,
    industry: INFO_FIELDS[3].options[info.industry],
    revenue: INFO_FIELDS[4].options[info.revenue],
    answers, areas: areas.map(a=>({key:a.key,name:a.name,pct:a.pct})),
    overall, grade: grade.key
  };

  const client = supa();
  let recordId = null;

  // 1) Supabase 저장
  if(client){
    try{
      setBusy(true,'결과 저장 중…');
      const { data, error } = await client.from('responses').insert({
        company: payload.company, brand: payload.brand, email: payload.email,
        industry: payload.industry, revenue: payload.revenue,
        answers: payload.answers, areas: payload.areas,
        overall: payload.overall, grade: payload.grade
      }).select('id').single();
      if(error) throw error;
      recordId = data.id;
    }catch(e){ console.error('저장 실패:', e); toast('결과 저장 중 문제가 발생했습니다. 화면 결과는 정상입니다.'); }
  } else {
    console.warn('Supabase 미설정 — 저장/이메일 생략(로컬 미리보기 모드)');
  }

  // 2) 결과 화면 표시
  showResult({...payload, id:recordId});

  // 3) PDF 생성 → Storage 업로드 → 이메일 트리거 (백그라운드)
  if(client && recordId){
    finalizeAsync(client, recordId, payload).catch(e=>console.error('후처리 실패:', e));
  }
}

async function finalizeAsync(client, recordId, payload){
  // PDF 생성 & 업로드
  let pdfUrl = null;
  try{
    const blob = await makePdfBlob();
    const path = `${recordId}.pdf`;
    const up = await client.storage.from(CFG.PDF_BUCKET||'reports')
      .upload(path, blob, {contentType:'application/pdf', upsert:true});
    if(up.error) throw up.error;
    const pub = client.storage.from(CFG.PDF_BUCKET||'reports').getPublicUrl(path);
    pdfUrl = pub.data.publicUrl;
    await client.from('responses').update({pdf_url:pdfUrl}).eq('id', recordId);
  }catch(e){ console.error('PDF 처리 실패:', e); }

  // 이메일 트리거 (Edge Function)
  try{
    const resultUrl = `${siteBase()}/#id=${recordId}`;
    await client.functions.invoke('send-report', {
      body: { id: recordId, result_url: resultUrl, pdf_url: pdfUrl }
    });
  }catch(e){ console.error('이메일 발송 트리거 실패:', e); }
}

/* ===================== 결과 화면 ===================== */
function showResult(rec){
  submitting=false;
  chrome.style.display='none';                 // 설문용 상단/하단 숨김
  document.body.classList.add('result-mode');
  window.scrollTo({top:0});
  renderReport(rec);
}

function renderReport(rec){
  const areas = rec.areas;
  const overall = rec.overall;
  const g = GRADES.find(x=>x.key===rec.grade) || gradeOf(overall);
  const sorted=[...areas].sort((a,b)=>b.pct-a.pct);
  const top2=sorted.slice(0,2), bot2=sorted.slice(-2).reverse();

  // 실행과제: 저장된 answers로 재계산(재열람 시에도 동일)
  const {grouped, tasks} = buildTasks(scoreAll(rec.answers).areas);

  const R = $('report');
  R.innerHTML = `
    <div class="rep-head">
      <div class="logo"><span class="dot"></span>소담클래스 브랜드 자가진단</div>
      <div class="who"><b>${esc(rec.brand)}</b> · ${esc(rec.company)}</div>
    </div>
    <div id="capture">
      ${gradeHeader(g,overall)}
      <div class="two section-gap">
        <div class="card panel">${radarPanel(areas)}</div>
        <div class="card panel">${areaTable(areas)}</div>
      </div>
      <div class="two section-gap">
        <div class="card panel">${rankPanel('강점 TOP 2','good',top2)}</div>
        <div class="card panel">${rankPanel('취약 TOP 2','weak',bot2)}</div>
      </div>
      <div class="card panel">${actionsPanel(grouped,tasks.length)}</div>
    </div>
    <div class="result-actions" id="resultActions">
      <button class="btn btn-primary" id="pdfBtn">PDF로 저장</button>
      ${rec.id?`<button class="btn btn-ghost" id="copyBtn">결과 링크 복사</button>`:''}
    </div>
    <div class="foot-note">
      본 리포트는 응답자의 자가진단 응답을 기반으로 자동 산출되었습니다.<br>
      ${rec.id?'입력하신 이메일로 결과 링크가 발송되었습니다. · ':''}소담클래스 · (주)타드
    </div>`;

  const pdfBtn=$('pdfBtn');
  if(pdfBtn) pdfBtn.addEventListener('click', downloadPdf);
  const copyBtn=$('copyBtn');
  if(copyBtn) copyBtn.addEventListener('click', ()=>{
    const url = `${siteBase()}/#id=${rec.id}`;
    navigator.clipboard.writeText(url).then(()=>toast('결과 링크가 복사되었습니다'))
      .catch(()=>toast(url));
  });
}

function gradeHeader(g,overall){
  const scale=GRADES.map(x=>`<span class="s ${x.key===g.key?'on':''}" style="${x.key===g.key?`background:${x.soft};color:${x.col}`:''}">${x.key} ${x.rng} · ${x.en}</span>`).join('');
  return `<div class="card section-gap">
    <div class="grade">
      <div class="grade-badge" style="background:${g.soft};color:${g.col}">
        <div class="g">${g.key}</div><div class="gl">BRAND LEVEL</div>
      </div>
      <div class="grade-main">
        <div class="eyebrow">Brand Level · 종합 진단</div>
        <h1>${g.en}</h1><div class="sub">${g.ko}</div>
      </div>
      <div class="grade-stats">
        <div class="gs"><div class="n">${overall}<small>점</small></div><div class="l">획득점수</div></div>
        <div class="gs"><div class="n">100<small>점</small></div><div class="l">유효만점</div></div>
        <div class="gs"><div class="n acc">${overall}<small>%</small></div><div class="l">달성률</div></div>
      </div>
    </div>
    <div class="scale">${scale}</div>
  </div>`;
}
function radarPanel(areas){
  const N=areas.length, cx=170, cy=160, Rmax=120;
  const ang=i=>(-90 + i*360/N)*Math.PI/180;
  const pt=(i,r)=>[cx+r*Math.cos(ang(i)), cy+r*Math.sin(ang(i))];
  let rings='';
  [0.2,0.4,0.6,0.8,1].forEach(f=>{
    const pts=areas.map((_,i)=>pt(i,Rmax*f).map(n=>n.toFixed(1)).join(',')).join(' ');
    rings+=`<polygon class="ring ${f===1?'r5':''}" points="${pts}"/>`;
  });
  let axes='',labels='',ptsArr=[];
  areas.forEach((a,i)=>{
    const [ex,ey]=pt(i,Rmax);
    axes+=`<line class="axis" x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>`;
    const [lx,ly]=pt(i,Rmax+22);
    const anchor=Math.abs(lx-cx)<8?'middle':(lx>cx?'start':'end');
    labels+=`<text class="lbl" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${a.name}</text>`;
    const [vx,vy]=pt(i,Rmax*(a.pct/100)); ptsArr.push([vx,vy]);
  });
  const area=ptsArr.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ');
  const dots=ptsArr.map(p=>`<circle class="pt" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5"/>`).join('');
  return `<div class="panel-h"><h2>종합 영역 진단 레이더</h2><span class="hint">5개 영역 달성률</span></div>
    <div class="radar-wrap"><svg class="radar" viewBox="0 0 340 340">
      ${rings}${axes}<polygon class="area" points="${area}"/>${dots}${labels}
    </svg></div>`;
}
function areaTable(areas){
  const rows=areas.map(a=>{
    const r=riskOf(a.pct);
    return `<div class="arow">
      <div class="aname"><span class="ad dot-${r.cls}"></span>${a.name}</div>
      <div class="apill pill-${r.cls}">${r.label} ${r.sym}</div>
      <div class="acomment c-${r.cls}">${COMMENTS[a.key][r.key]} · ${a.pct}%</div>
    </div>`;
  }).join('');
  return `<div class="panel-h"><h2>영역별 달성률</h2><span class="hint">리스크 · 코멘트</span></div>${rows}`;
}
function rankPanel(title,cls,list){
  const items=list.map((a,i)=>`<div class="rank ${cls}">
    <span class="tag">${cls==='good'?'TOP '+(i+1):'#'+(i+1)}</span>
    <span class="rn">${a.name}</span><span class="rp">${a.pct}%</span></div>`).join('');
  return `<div class="panel-h"><h2>${title}</h2></div>${items}`;
}
function actionsPanel(grouped,count){
  if(count===0){
    return `<div class="panel-h" style="margin-bottom:12px"><h2>우선 실행 과제</h2></div>
      <div class="empty-actions"><b>취약 항목이 없습니다.</b><br>모든 진단 문항이 기준 점수 이상입니다. 현재 강점을 유지·확장하세요.</div>`;
  }
  const groups=Object.entries(grouped).map(([name,arr])=>`
    <div class="agroup">
      <div class="agroup-h"><span class="gn">${name}</span><span class="gc">${arr.length}건</span></div>
      ${arr.map(t=>`<div class="task">
        <div class="tcol sig"><div class="tl tl-sig">취약 신호</div><div class="tv">${esc(t.signal)}</div></div>
        <div class="tcol do"><div class="tl tl-do">권장 실행 과제</div><div class="tv">${esc(t.todo)}</div></div>
        <div class="tcol eff"><div class="tl tl-eff">기대 효과</div><div class="tv">${esc(t.effect)}</div></div>
      </div>`).join('')}
    </div>`).join('');
  return `<div class="actions-head"><h2>우선 실행 과제</h2><span class="cnt">총 ${count}건</span></div>
    <p class="actions-sub">진단 점수가 낮은 항목을 영역별로 모았습니다. 점수가 낮은 순으로 정렬되며 최대 20건까지 표시됩니다.</p>
    ${groups}`;
}
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ===================== PDF ===================== */
async function makePdfBlob(){
  const node = $('capture');
  const canvas = await html2canvas(node, {scale:2, backgroundColor:'#f6f8fc', useCORS:true});
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p','mm','a4');
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const imgW = pw;
  const imgH = canvas.height * imgW / canvas.width;
  let left = imgH, pos = 0;
  const img = canvas.toDataURL('image/jpeg', 0.92);
  pdf.addImage(img, 'JPEG', 0, pos, imgW, imgH);
  left -= ph;
  while(left > 0){
    pos = left - imgH;
    pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, pos, imgW, imgH);
    left -= ph;
  }
  return pdf.output('blob');
}
async function downloadPdf(){
  const btn=$('pdfBtn'); const old=btn.textContent;
  btn.disabled=true; btn.textContent='PDF 생성 중…';
  try{
    const blob = await makePdfBlob();
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='소담클래스_브랜드진단_결과.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }catch(e){ console.error(e); toast('PDF 생성 중 문제가 발생했습니다'); }
  btn.disabled=false; btn.textContent=old;
}

/* ===================== 재열람 라우팅 ===================== */
function parseId(){
  const m = location.hash.match(/[#&]id=([0-9a-fA-F-]{8,})/);
  return m ? m[1] : null;
}
async function loadShared(id){
  const client = supa();
  document.body.classList.add('result-mode');
  chrome.style.display='none';
  $('report').innerHTML = `<div class="loading">결과를 불러오는 중…</div>`;
  if(!client){ $('report').innerHTML = `<div class="loading err">설정이 필요합니다. config.js를 확인해주세요.</div>`; return; }
  try{
    const { data, error } = await client.from('responses').select('*').eq('id', id).single();
    if(error || !data) throw error || new Error('not found');
    renderReport({
      id:data.id, company:data.company, brand:data.brand, email:data.email,
      industry:data.industry, revenue:data.revenue,
      answers:data.answers, areas:data.areas, overall:data.overall, grade:data.grade
    });
  }catch(e){
    console.error(e);
    $('report').innerHTML = `<div class="loading err">결과를 찾을 수 없습니다.<br>링크를 다시 확인해주세요.</div>`;
  }
}

/* ===================== 부팅 ===================== */
function boot(){
  main=$('main'); bar=$('bar'); pips=$('pips'); stepcount=$('stepcount');
  miniprog=$('miniprog'); nextBtn=$('nextBtn'); prevBtn=$('prevBtn');
  toastEl=$('toast'); chrome=$('chrome');
  nextBtn.addEventListener('click',goNext);
  prevBtn.addEventListener('click',goPrev);

  const id = parseId();
  if(id){ loadShared(id); return; }   // 재열람 모드
  buildPips(); renderSurvey();        // 설문 모드
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
