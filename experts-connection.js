'use strict';

const RECRUIT_API = 'https://script.google.com/macros/s/AKfycbzezb8Vh2q77N5Tl2nuxx0BVQhqDtFfZ7ujHkG5DAJs-15P7soKd8mrFaKS_1WZa7GduA/exec';
const RECRUIT_SESSION = 'tpicks-recruit-session-v1';
let recruitSession = null, recruitReady = false, recruitBusy = false;
try { const saved = JSON.parse(sessionStorage.getItem(RECRUIT_SESSION) || 'null'); if (saved?.expiresAt > Date.now()) recruitSession = saved; } catch (_) {}
let recruitUser = null;
const myApplications = () => db.apps.filter(a => a.email?.toLowerCase() === recruitUser?.email);
const newRecordId = prefix => prefix + '-' + crypto.randomUUID();

async function recruitCall(op, values = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(RECRUIT_API, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'recruit',op,token:recruitSession?.token || '',...values}),signal:controller.signal,redirect:'follow'});
    if (!response.ok) throw new Error('연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.');
    const result = await response.json();
    if (!result.ok) {
      if (result.code === 'AUTH') { recruitClearSession(); render(); }
      throw new Error(result.error || '요청을 처리하지 못했습니다.');
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('응답이 늦어지고 있습니다. 제출한 내용이 저장됐을 수 있으니 새로고침으로 확인해 주세요.');
    throw error;
  } finally { clearTimeout(timeout); }
}
function recruitAccept(data) {
  db = {jobs:data.jobs || [],apps:data.apps || [],requests:data.requests || [],profile:data.profile || {},history:data.history || []};
  recruitUser = data.user || null; recruitReady = true;
}
function recruitClearSession(clearDrafts = false) {
  recruitSession = null; recruitUser = null;
  sessionStorage.removeItem(RECRUIT_SESSION);
  if (clearDrafts) for (const key of Object.keys(sessionStorage)) if (key.startsWith(DRAFT_PREFIX)) sessionStorage.removeItem(key);
  db = {jobs:db.jobs.filter(j=>j.published).map(({ownerEmail,sourceRequestId,...j})=>j),apps:[],requests:[],profile:{},history:[]};
}
async function recruitMutation(op, values, message) {
  if (recruitBusy) { toast('저장 중입니다. 잠시 기다려 주세요.'); return false; }
  recruitBusy = true;
  const controls = [...document.querySelectorAll('#root button,#root select,#modalRoot button')].filter(e=>!e.disabled);
  controls.forEach(e=>e.disabled=true);
  try {
    const token = recruitSession?.token, result = await recruitCall(op,values);
    if (token !== recruitSession?.token) return false;
    if (result.data) recruitAccept(result.data);
    if (message) toast(message);
    return true;
  } catch (error) { toast(error.message); return false; }
  finally { recruitBusy = false; controls.filter(e=>e.isConnected).forEach(e=>e.disabled=false); }
}
function requireRecruitAuth(next) {
  if (recruitUser && recruitSession?.expiresAt > Date.now()) return true;
  showRecruitLogin(next); return false;
}
function recruitHeader() {
  const head = el('recruitHeader');
  head.innerHTML = `<a href="./" class="recruit-brand">↖ <img class="logo-img" src="tpicks-3d/assets/tpicks-logo-traced.svg" alt="TPICKS" width="68" height="22"> LABS</a><div>${recruitUser ? `<span class="recruit-email">${esc(recruitUser.email)}</span><button class="btn small" id="recruitLogout">로그아웃</button>${recruitUser.admin ? '<a class="btn small" href="#admin" id="recruitAdminLink">운영자 관리</a>':''}`:'<button class="btn small" id="recruitLogin">구글 로그인</button>'}</div>`;
  el('recruitLogin')?.addEventListener('click',()=>showRecruitLogin());
  el('recruitLogout')?.addEventListener('click',async()=>{
    if (recruitBusy) { toast('저장이 끝난 뒤 로그아웃해 주세요.'); return; }
    if (!closeModal()) return;
    try { await recruitCall('logout'); } catch (_) {}
    recruitClearSession(true); render(); toast('로그아웃했습니다.');
  });
  el('recruitAdminLink')?.addEventListener('click',e=>{e.preventDefault();navigate('admin');});
}
function showRecruitLogin(next) {
  if (!modal(`<h2>구글로 로그인</h2><p class="form-help">지원서와 모집 내역을 안전하게 확인할 수 있도록 구글 계정으로 로그인해 주세요. 이메일 주소만 확인하며, 비밀번호는 구글 창에서만 입력합니다.</p><div id="recruitGoogleBtn" style="min-height:44px;margin:14px 0"></div><p id="recruitLoginMessage" role="status" class="form-help"></p><button type="button" class="btn" id="recruitCloseLogin">닫기</button>`)) return;
  const message = el('recruitLoginMessage');
  el('recruitCloseLogin').onclick = closeModal;
  googleButton(el('recruitGoogleBtn'), async credential => {
    message.textContent = '로그인을 확인하고 있습니다.';
    try {
      const result = await recruitCall('googleLogin', {credential});
      recruitSession = {token:result.token, expiresAt:result.expiresAt}; sessionStorage.setItem(RECRUIT_SESSION, JSON.stringify(recruitSession)); recruitAccept(result.data);
      closeModal({force:true, skipHistory:true}); render(); if (typeof next === 'function') next(); toast('로그인했습니다.');
    } catch (error) { message.textContent = error.message; }
  }).catch(error => { message.textContent = error.message; });
}

const localRender = render;
render = function() {
  recruitHeader();
  if (!recruitReady) { el('root').innerHTML='<div class="content-wrap"><div class="panel empty" role="status">모집 공고를 불러오고 있습니다.</div></div>'; return; }
  const privatePage=['mine','company','partner','admin'].includes(page);
  if (privatePage && !recruitUser) {
    el('root').innerHTML=spaceNav()+`<div class="content-wrap"><div class="panel empty"><h2>로그인이 필요합니다</h2><p>본인의 지원서와 모집 내역만 확인할 수 있습니다.</p><button class="btn primary" id="recruitPageLogin">구글로 로그인하기</button></div></div>`;
    document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=e=>{e.preventDefault();navigate(b.dataset.nav);});
    el('recruitPageLogin').onclick=()=>showRecruitLogin(()=>render()); return;
  }
  if (page==='admin' && !recruitUser?.admin) { el('root').innerHTML='<div class="content-wrap"><div class="panel empty"><h2>운영자 전용 화면입니다</h2><a href="#jobs" class="btn">모집 공고로 돌아가기</a></div></div>'; return; }
  localRender();
};

const localOpenApply = openApply;
openApply = function(id, appId=null) {
  if (!requireRecruitAuth(()=>openApply(id,appId))) return;
  localOpenApply(id,appId);
  const form=el('appForm'), job=db.jobs.find(j=>j.id===id);
  if (!form || !job) return;
  form.elements.email.value=recruitUser.email; form.elements.email.readOnly=true;
  form.addEventListener('submit',async e=>{
    e.preventDefault(); e.stopImmediatePropagation();
    if (!form.reportValidity()) return;
    const f=new FormData(form), value=Object.fromEntries(f.entries()), existing=myApplications().find(a=>a.jobId===id);
    value.id=existing?.id; value.revision=existing?.revision; value.agreeCollection=f.has('agreeCollection'); value.agreeSharing=f.has('agreeSharing'); value.questionAnswers={};
    for (const q of normalizedQuestions(job)) if (q.level==='전체' || q.level===value.level) value.questionAnswers[q.id]=String(f.get('answer_'+q.id)||'').trim();
    saveApplicationDraft();
    if (await recruitMutation('saveApplication',{jobId:id,value},existing?'지원서를 수정했습니다.':'지원서를 접수했습니다.')) {
      clearDraft(id); modalContext=null; closeModal({force:true,skipHistory:true}); navigate('mine');
    }
  },{capture:true});
};

const localCompanyForm = handleCompanyForm;
handleCompanyForm = function() {
  localCompanyForm(); const form=el('companyForm'); if (!form) return;
  form.elements.contact.value=recruitUser.email; form.elements.contact.readOnly=true;
  form.onsubmit=async e=>{
    e.preventDefault(); if (!form.reportValidity()) return;
    const f=new FormData(form), value=Object.fromEntries(f.entries()), existing=db.requests.find(r=>r.id===editingRequestId);
    value.id=existing?.id || (form.dataset.requestId ||= newRecordId('request')); value.revision=existing?.revision;
    value.levels=f.getAll('levels'); value.fields=value.fields.split(',').map(s=>s.trim()).filter(Boolean); Object.assign(value,extractQuestionSettings(f,form)); value.agree=f.has('agree');
    if (await recruitMutation('saveRequest',{value},'검토 대기로 접수했습니다.')) { editingRequestId=null; navigate('partner'); }
  };
};
async function cancelRequest(id) {
  const request=db.requests.find(r=>r.id===id); if (!request) return;
  if (!confirm('이 공고 등록 요청을 취소할까요?')) return;
  if (await recruitMutation('cancelRequest',{id,revision:request.revision},'등록 요청을 취소했습니다.')) render();
}

const localJobEditor = jobEditor;
jobEditor = function(id) {
  if (!recruitUser?.admin) { toast('운영자만 공고를 편집할 수 있습니다.'); return; }
  localJobEditor(id); const form=el('jobForm'); if (!form) return;
  form.onsubmit=async e=>{
    e.preventDefault(); if (!form.reportValidity()) return;
    const f=new FormData(form), value=Object.fromEntries(f.entries()), existing=db.jobs.find(j=>j.id===id);
    value.id=existing?.id || (form.dataset.jobId ||= newRecordId('job')); value.revision=existing?.revision;
    value.levels=f.getAll('levels'); value.fields=value.fields.split(',').map(s=>s.trim()).filter(Boolean); value.published=f.has('published'); Object.assign(value,extractQuestionSettings(f,form));
    if (await recruitMutation('saveJob',{value},'공고를 저장했습니다.')) { closeModal({force:true}); render(); }
  };
};

const localBind = bind;
bind = function() {
  localBind();
  document.querySelectorAll('[data-withdraw]').forEach(b=>b.onclick=async()=>{
    const app=myApplications().find(a=>a.id===b.dataset.withdraw); if (!app || !confirm('지원서를 철회하고 삭제할까요?')) return;
    if (await recruitMutation('withdrawApplication',{id:app.id,revision:app.revision},'지원서를 철회했습니다.')) { clearDraft(app.jobId); render(); }
  });
  for (const [attribute,approve] of [['approve',true],['reject',false]]) document.querySelectorAll(`[data-${attribute}]`).forEach(b=>b.onclick=async()=>{
    const request=db.requests.find(r=>r.id===b.dataset[attribute]); if (!request) return;
    if (await recruitMutation('reviewRequest',{id:request.id,revision:request.revision,approve},approve?'공고를 승인해 게시했습니다.':'공고를 반려했습니다.')) render();
  });
  document.querySelectorAll('[data-job-toggle]').forEach(b=>b.onclick=async()=>{
    const job=db.jobs.find(j=>j.id===b.dataset.jobToggle); if (!job) return;
    if (await recruitMutation('toggleJob',{id:job.id,revision:job.revision},'게시 상태를 변경했습니다.')) render();
  });
  document.querySelectorAll('[data-status]').forEach(select=>select.onchange=async()=>{
    const app=db.apps.find(a=>a.id===select.dataset.status); if (!app) return;
    const previous=app.status;
    if (await recruitMutation('setStatus',{id:app.id,revision:app.revision,status:select.value},'선발 상태를 저장했습니다.')) render(); else select.value=previous;
  });
  document.querySelectorAll('[data-finish-job]').forEach(b=>b.onclick=async()=>{
    const job=db.jobs.find(j=>j.id===b.dataset.finishJob); if (!job) return;
    if (!confirm('선발을 종료하고 이 공고의 모든 지원서를 삭제할까요? 삭제된 지원서는 복원할 수 없습니다.')) return;
    if (await recruitMutation('finishJob',{id:job.id,revision:job.revision},'선발을 종료하고 지원서를 삭제했습니다.')) render();
  });
};

async function bootRecruitment() {
  render();
  try {
    let result;
    try { result=await recruitCall('snapshot'); }
    catch(error) { if (!recruitSession) result=await recruitCall('snapshot'); else throw error; }
    recruitAccept(result.data);
    if (location.hash.startsWith('#job-')) { const id=decodeURIComponent(location.hash.slice(5)); history.replaceState({page:'jobs'},'','#jobs');page='jobs';render();openJobDetails(id); }
    else render();
  } catch(error) {
    recruitHeader(); el('root').innerHTML=`<div class="content-wrap"><div class="panel empty" role="alert"><h2>모집 정보를 불러오지 못했습니다</h2><p>${esc(error.message)}</p><button class="btn" id="recruitRetry">다시 불러오기</button></div></div>`; el('recruitRetry').onclick=bootRecruitment;
  }
}
bootRecruitment();
