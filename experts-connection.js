'use strict';

const RECRUIT_API = 'https://script.google.com/macros/s/AKfycbzezb8Vh2q77N5Tl2nuxx0BVQhqDtFfZ7ujHkG5DAJs-15P7soKd8mrFaKS_1WZa7GduA/exec';
const RECRUIT_SESSION = 'tpicks-recruit-session-v1';
let recruitSession = null, recruitReady = false, recruitBusy = false;
try { const saved = JSON.parse(sessionStorage.getItem(RECRUIT_SESSION) || 'null'); if (saved?.expiresAt > Date.now()) recruitSession = saved; } catch (_) {}
let recruitUser = null;
// 공고는 Apps Script 응답에 1~6초가 걸린다. 지난번에 받은 공개 공고를 먼저 보여 주고, 응답이 오면 목록만 새로 바꾼다.
const RECRUIT_JOBS_CACHE = 'tpicks-recruit-jobs-v1';
const publicJobs = jobs => jobs.filter(j=>j.published).map(({ownerEmail,sourceRequestId,...j})=>j);
try { const cached = JSON.parse(localStorage.getItem(RECRUIT_JOBS_CACHE) || '[]'); if (Array.isArray(cached)) db.jobs = cached; } catch (_) {}
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
  try { localStorage.setItem(RECRUIT_JOBS_CACHE, JSON.stringify(publicJobs(db.jobs))); } catch (_) {}
}
function recruitClearSession(clearDrafts = false) {
  recruitSession = null; recruitUser = null;
  sessionStorage.removeItem(RECRUIT_SESSION);
  if (clearDrafts) for (const key of Object.keys(sessionStorage)) if (key.startsWith(DRAFT_PREFIX)) sessionStorage.removeItem(key);
  db = {jobs:publicJobs(db.jobs),apps:[],requests:[],profile:{},history:[]};
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
  head.innerHTML = `<a href="https://tpickslab.vercel.app/" class="recruit-brand" aria-label="TPICKS LAB 첫 화면으로"><img class="logo-img" src="img/tpicks-lab-logo.svg" alt="TPICKS LAB" width="130" height="18"></a><div>${recruitUser ? `<span class="recruit-email">${esc(recruitUser.email)}</span><button class="btn small" id="recruitLogout">로그아웃</button>${recruitUser.admin ? '<a class="btn small" href="#admin" id="recruitAdminLink">운영자 관리</a>':''}`:'<button class="btn small" id="recruitLogin">관리자 로그인</button>'}</div>`;
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
    message.textContent = '로그인을 확인하고 있습니다.'; loginWait(true);
    try {
      const result = await recruitCall('googleLogin', {credential});
      recruitSession = {token:result.token, expiresAt:result.expiresAt}; sessionStorage.setItem(RECRUIT_SESSION, JSON.stringify(recruitSession)); recruitAccept(result.data);
      closeModal({force:true, skipHistory:true}); render(); if (typeof next === 'function') next(); toast('로그인했습니다.');
    } catch (error) { message.textContent = error.message; } finally { loginWait(false); }
  }).catch(error => { message.textContent = error.message; });
}

const localRender = render;
render = function() {
  recruitHeader();
  const privatePage=['mine','company','partner','admin'].includes(page);
  if (!recruitReady) {
    // 공개 화면(첫 화면·공고 찾기)은 빈 화면으로 기다리게 하지 않는다. 틀은 바로 그리고 목록 자리만 기다린다.
    if (privatePage) el('root').innerHTML='<div class="content-wrap"><div class="panel empty" role="status">모집 정보를 불러오고 있습니다.</div></div>';
    else { localRender(); if (!db.jobs.length) el('jobResults').innerHTML='<div class="listing-header"><strong>모집 공고</strong><span>불러오는 중</span></div><div class="panel empty" role="status">모집 공고를 불러오고 있습니다.</div>'; }
    return;
  }
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
  if (!recruitReady) { toast('모집 정보를 확인하고 있습니다. 잠시 후 다시 눌러 주세요.'); return; }
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

// 상세페이지 그림: 브라우저에서 가로 1400px 이하 JPEG로 줄여 한 장씩 올리고, 공고에는 Drive 파일 ID만 넣습니다.
const DETAIL_IMAGE_MAX = 5;
async function shrinkDetailImage(file) {
  const url = URL.createObjectURL(file), img = new Image();
  try {
    // 어떤 사진이든 브라우저가 열 수 있으면 JPEG로 바꿔 올립니다(못 여는 형식만 안내).
    img.src = url; await img.decode().catch(() => { throw new Error('이 파일은 열지 못했습니다. 사진(JPG·PNG)으로 저장해 다시 첨부해 주세요: ' + file.name); });
    const w = img.naturalWidth, h = img.naturalHeight;
    // 휴대폰 브라우저의 캔버스 한도(약 1,600만 화소)도 넘지 않게 줄입니다.
    const scale = Math.min(1, 1400 / w, 16000 / h, Math.sqrt(16000000 / (w * h)));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.7, 0.55]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 5 * 1024 * 1024) return blob;
    }
    throw new Error('그림이 너무 큽니다. 더 작은 그림으로 올려 주세요: ' + file.name);
  } finally { URL.revokeObjectURL(url); }
}
const blobBase64 = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('그림 파일을 읽지 못했습니다.')); reader.readAsDataURL(blob); });
function mountDetailImages(form, before, ids) {
  if (form.detailImages) return;
  form.detailImages = (Array.isArray(ids) ? ids : []).filter(id => DETAIL_IMAGE_ID.test(id)).slice(0, DETAIL_IMAGE_MAX);
  const box = document.createElement('div'); box.className = 'form-group';
  box.innerHTML = `<label for="detailImageInput">사진·상세페이지 그림 첨부 (선택, 최대 ${DETAIL_IMAGE_MAX}장)</label><span class="hint">사진이나 그림을 그대로 첨부하면 됩니다. 공고를 열면 첨부한 순서대로 맨 위에 보입니다.</span><input type="file" id="detailImageInput" accept="image/*" multiple><p class="hint" role="status" data-image-status></p><div class="detail-image-list" data-image-list></div>`;
  before.before(box);
  const input = box.querySelector('input'), status = box.querySelector('[data-image-status]'), list = box.querySelector('[data-image-list]');
  const draw = () => {
    list.innerHTML = form.detailImages.map((id, i) => `<figure><img src="https://lh3.googleusercontent.com/d/${id}=w200" alt="상세 그림 ${i + 1}"><figcaption>${i + 1}</figcaption><button type="button" data-remove-image="${i}" aria-label="상세 그림 ${i + 1} 빼기">×</button></figure>`).join('');
    list.querySelectorAll('[data-remove-image]').forEach(b => b.onclick = () => { form.detailImages.splice(Number(b.dataset.removeImage), 1); draw(); });
  };
  input.onchange = async () => {
    const files = [...input.files], room = DETAIL_IMAGE_MAX - form.detailImages.length; input.value = '';
    if (files.length > room) toast(`상세페이지 그림은 ${DETAIL_IMAGE_MAX}장까지 올릴 수 있습니다.${room > 0 ? ' 앞의 ' + room + '장만 올립니다.' : ''}`);
    const queue = files.slice(0, Math.max(room, 0)); if (!queue.length) return;
    // 올리는 동안에는 제출하지 못하게 해서, 덜 올라간 그림이 빠진 채 저장되지 않게 합니다.
    const controls = [input, ...form.querySelectorAll('button:not([type="button"])')]; controls.forEach(c => c.disabled = true);
    try {
      for (const [i, file] of queue.entries()) {
        status.textContent = `그림 올리는 중 (${i + 1}/${queue.length}) · ${file.name}`;
        const data = await blobBase64(await shrinkDetailImage(file));
        const result = await recruitCall('uploadImage', {name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data});
        form.detailImages.push(result.id); draw();
      }
      status.textContent = `그림 ${queue.length}장을 올렸습니다.`;
    } catch (error) {
      // Apps Script를 새 버전으로 배포하기 전에는 서버가 이 요청을 모릅니다. 그림 없이도 공고는 제출됩니다.
      status.textContent = /지원하지 않는 요청/.test(error.message) ? '그림 올리기를 아직 준비 중입니다. 운영자에게 알려 주세요. 그림 없이도 공고는 제출할 수 있습니다.' : error.message;
    } finally { controls.forEach(c => c.disabled = false); }
  };
  draw();
}

const localCompanyForm = handleCompanyForm;
handleCompanyForm = function() {
  localCompanyForm(); const form=el('companyForm'); if (!form) return;
  form.elements.contact.value=recruitUser.email; form.elements.contact.readOnly=true;
  mountDetailImages(form,form.elements.agree.closest('label'),db.requests.find(r=>r.id===editingRequestId)?.detailImages);
  form.onsubmit=async e=>{
    e.preventDefault(); if (!form.reportValidity()) return;
    const f=new FormData(form), value=Object.fromEntries(f.entries()), existing=db.requests.find(r=>r.id===editingRequestId);
    value.id=existing?.id || (form.dataset.requestId ||= newRecordId('request')); value.revision=existing?.revision;
    value.levels=f.getAll('levels'); value.fields=value.fields.split(',').map(s=>s.trim()).filter(Boolean); Object.assign(value,extractQuestionSettings(f,form)); value.agree=f.has('agree'); value.detailImages=form.detailImages;
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
  mountDetailImages(form,form.elements.published.closest('.form-group'),db.jobs.find(j=>j.id===id)?.detailImages);
  form.onsubmit=async e=>{
    e.preventDefault(); if (!form.reportValidity()) return;
    const f=new FormData(form), value=Object.fromEntries(f.entries()), existing=db.jobs.find(j=>j.id===id);
    value.id=existing?.id || (form.dataset.jobId ||= newRecordId('job')); value.revision=existing?.revision;
    value.levels=f.getAll('levels'); value.fields=value.fields.split(',').map(s=>s.trim()).filter(Boolean); value.published=f.has('published'); Object.assign(value,extractQuestionSettings(f,form)); value.detailImages=form.detailImages;
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
  if (location.hash.startsWith('#job-')) page='jobs';
  render();
  try {
    let result;
    try { result=await recruitCall('snapshot'); }
    catch(error) { if (!recruitSession) result=await recruitCall('snapshot'); else throw error; }
    recruitAccept(result.data);
    if (location.hash.startsWith('#job-')) { const id=decodeURIComponent(location.hash.slice(5)); history.replaceState({page:'jobs'},'','#jobs');page='jobs';render();openJobDetails(id); }
    else if (el('jobResults')) { recruitHeader(); updateJobResults(); }
    else render();
  } catch(error) {
    recruitHeader(); el('root').innerHTML=`<div class="content-wrap"><div class="panel empty" role="alert"><h2>모집 정보를 불러오지 못했습니다</h2><p>${esc(error.message)}</p><button class="btn" id="recruitRetry">다시 불러오기</button></div></div>`; el('recruitRetry').onclick=bootRecruitment;
  }
}
bootRecruitment();
