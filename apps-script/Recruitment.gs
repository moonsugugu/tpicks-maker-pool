// 기존 비공개 응답 시트 하나를 사용한다. 인증 정보는 Script Cache에만 보관한다.
const RECRUIT_VERSION = '2026-11-11.1';
const RECRUIT_SHEETS = {
  jobs: ['모집 공고', ['공고 ID', '담당자 이메일', '공개 상태', '등록 요청 ID', '최종 수정', '공고 JSON']],
  requests: ['모집 요청', ['요청 ID', '담당자 이메일', '검토 상태', '최종 수정', '공고 JSON']],
  apps: ['모집 지원', ['지원 ID', '지원자 이메일', '공고 ID', '선발 상태', '제출 시각', '최종 수정', '지원서 JSON']]
};
const RECRUIT_LEVELS = ['유치원', '초등', '중등', '고등', '특수'];
const RECRUIT_TYPES = ['연수 강사', '콘텐츠 제작·집필', '검수·검토', '자문위원'];

function recruitError_(message, code) { const e = new Error(message); e.code = code || 'VALIDATION'; throw e; }
function recruitText_(value, max, label, required) {
  if (typeof value !== 'string' && value != null) recruitError_(label + ' 형식을 확인해 주세요.');
  const s = String(value == null ? '' : value).trim();
  if ((required && !s) || s.length > max) recruitError_(label + ': ' + (s ? max + '자 이내로 적어 주세요.' : '내용을 입력해 주세요.'));
  return s;
}
function recruitEmail_(v) {
  const s = recruitText_(v, 120, '이메일', true).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._%+\-]*@[a-z0-9.\-]+\.[a-z]{2,}$/.test(s)) recruitError_('이메일 주소를 확인해 주세요.');
  return s;
}
function recruitId_(v) { const s = String(v || ''); if (!/^[a-zA-Z0-9_-]{1,90}$/.test(s)) recruitError_('항목 ID가 올바르지 않습니다.'); return s; }
function recruitNow_() { return new Date().toISOString(); }
function recruitToday_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }
function recruitAdmin_(email) {
  const configured = PropertiesService.getScriptProperties().getProperty('RECRUIT_ADMIN_EMAILS');
  const emails = configured ? configured.split(',') : [];
  return emails.some(v => String(v || '').trim().toLowerCase() === email);
}
function recruitOwner_() {
  const configured = PropertiesService.getScriptProperties().getProperty('RECRUIT_ADMIN_EMAILS');
  if (!configured) recruitError_('운영자 이메일 설정이 필요합니다.', 'SETUP');
  return recruitEmail_(configured.split(',')[0].trim());
}
function recruitUser_(token, optional) {
  if (!token && optional) return null;
  const raw = CacheService.getScriptCache().get('recruit:session:' + String(token || ''));
  if (!raw) recruitError_('이메일 인증이 만료되었습니다. 다시 인증해 주세요.', 'AUTH');
  const session = JSON.parse(raw);
  if (session.expiresAt <= Date.now()) recruitError_('이메일 인증이 만료되었습니다. 다시 인증해 주세요.', 'AUTH');
  return {email: session.email, admin: recruitAdmin_(session.email), expiresAt: session.expiresAt};
}
function recruitStore_(kind) {
  const spec = RECRUIT_SHEETS[kind], s = SpreadsheetApp.openById(SS_ID).getSheetByName(spec[0]);
  if (!s) recruitError_('모집 서비스 초기 설정이 필요합니다. 운영자에게 알려 주세요.', 'SETUP');
  return s;
}
function recruitRows_(kind, column, value) {
  const s = recruitStore_(kind);
  if (s.getLastRow() < 2) return [];
  // 전체 지원서를 읽어 브라우저에서 거르지 않는다. 시트의 해당 열에서 일치하는 행만 읽는다.
  const matches = s.getRange(2, column, s.getLastRow() - 1, 1).createTextFinder(String(value)).matchEntireCell(true).useRegularExpression(false).matchCase(true).findAll();
  return matches.map(cell => {
    const row = cell.getRow(), values = s.getRange(row, 1, 1, RECRUIT_SHEETS[kind][1].length).getValues()[0];
    const data = JSON.parse(String(values[values.length - 1]));
    return {row: row, owner: String(values[1]).toLowerCase(), data: data};
  });
}
function recruitGet_(kind, id) { return recruitRows_(kind, 1, recruitId_(id))[0] || null; }
function recruitWrite_(kind, data, existing) {
  const s = recruitStore_(kind), now = recruitNow_();
  data.updatedAt = now; data.revision = Utilities.getUuid();
  const values = kind === 'jobs' ? [data.id, data.ownerEmail, data.published ? '게시' : '비공개', data.sourceRequestId || '', now, JSON.stringify(data)] :
    kind === 'requests' ? [data.id, data.ownerEmail, data.status, now, JSON.stringify(data)] :
    [data.id, data.email, data.jobId, data.status, data.submittedAt, now, JSON.stringify(data)];
  s.getRange(existing ? existing.row : s.getLastRow() + 1, 1, 1, values.length).setNumberFormat('@').setValues([values]);
  if (kind === 'jobs') CacheService.getScriptCache().remove('recruit:public-jobs');
  return data;
}
function recruitCheckRevision_(existing, input) {
  if (existing && existing.data.revision !== input.revision) recruitError_('다른 화면에서 내용이 변경되었습니다. 새로고침한 뒤 다시 수정해 주세요.', 'CONFLICT');
}
function recruitPublicJob_(j) {
  const result = {};
  ['id','title','company','type','levels','seats','fee','deadline','period','summary','tasks','qualification','process','feeDetail','additionalDetails','fields','questions','published','closedAt','updatedAt','revision'].forEach(k => { if (j[k] !== undefined) result[k] = j[k]; });
  return result;
}
function recruitPublic_() {
  const cache = CacheService.getScriptCache(), cached = cache.get('recruit:public-jobs');
  if (cached) return JSON.parse(cached);
  const jobs = recruitRows_('jobs', 3, '게시').map(r => recruitPublicJob_(r.data));
  const response = {ok: true, version: RECRUIT_VERSION, jobs: jobs};
  const json = JSON.stringify(response);
  if (Utilities.newBlob(json).getBytes().length < 95000) cache.put('recruit:public-jobs', json, 30);
  return response;
}
function recruitSnapshot_(user) {
  const publicJobs = recruitPublic_().jobs;
  if (!user) return {jobs: publicJobs, apps: [], requests: [], profile: {name:'', level:''}, history: [], user: null};
  const jobs = user.admin ? recruitRows_('jobs', 3, '게시').concat(recruitRows_('jobs', 3, '비공개')) : recruitRows_('jobs', 2, user.email);
  const ownJobs = jobs.map(r => r.data), merged = {};
  publicJobs.concat(ownJobs).forEach(j => { merged[j.id] = j; });
  const requests = (user.admin ? ['검토 대기','승인 · 게시','반려'].flatMap(status => recruitRows_('requests', 3, status)) : recruitRows_('requests', 2, user.email)).map(r => r.data);
  const applications = recruitRows_('apps', 2, user.email), seen = {};
  applications.concat(ownJobs.flatMap(j => recruitRows_('apps', 3, j.id))).forEach(r => { seen[r.data.id] = r.data; });
  const mine = applications.map(r => r.data).sort((a,b) => a.submittedAt.localeCompare(b.submittedAt));
  const last = mine.length ? mine[mine.length - 1] : {};
  return {jobs: Object.keys(merged).map(k => merged[k]), requests: requests, apps: Object.keys(seen).map(k => seen[k]),
    profile: {name: last.name || '', level: last.level || '', phone: last.phone || '', email: user.email},
    history: mine.map(a => ({activity:a.activity,description:a.description})), user: user};
}
function recruitCode_(email) {
  email = recruitEmail_(email);
  const cache = CacheService.getScriptCache(), waitKey = 'recruit:wait:' + email;
  if (cache.get(waitKey)) recruitError_('인증 메일을 방금 보냈습니다. 1분 뒤 다시 요청해 주세요.');
  const bucket = 'recruit:mail:' + Math.floor(Date.now() / 60000), sent = Number(cache.get(bucket) || 0);
  if (sent >= 10 || MailApp.getRemainingDailyQuota() < 1) recruitError_('지금은 인증 메일 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const code = String(100000 + parseInt(Utilities.getUuid().replace(/-/g, '').slice(0,12), 16) % 900000);
  cache.put('recruit:code:' + email, JSON.stringify({code:code, attempts:0, expiresAt:Date.now() + 600000}), 600);
  cache.put(waitKey, '1', 60); cache.put(bucket, String(sent + 1), 65);
  MailApp.sendEmail(email, '[티픽스 전문가 모집] 인증 코드 ' + code,
    '인증 코드: ' + code + '\n\n10분 안에 전문가 모집 페이지에 입력해 주세요.\nhttps://tpicks-makerpool.vercel.app/experts.html\n\n직접 요청하지 않았다면 이 메일은 무시하셔도 됩니다.');
  return {sent: true};
}
function recruitVerify_(email, code) {
  email = recruitEmail_(email);
  const cache = CacheService.getScriptCache(), key = 'recruit:code:' + email, raw = cache.get(key);
  if (!raw) recruitError_('인증 코드가 없거나 만료되었습니다. 코드를 다시 받아 주세요.');
  const record = JSON.parse(raw), seconds = Math.floor((record.expiresAt - Date.now()) / 1000);
  if (seconds <= 0) { cache.remove(key); recruitError_('인증 코드가 만료되었습니다.'); }
  if (record.code !== String(code || '').trim()) {
    record.attempts++;
    if (record.attempts >= 5) cache.remove(key); else cache.put(key, JSON.stringify(record), seconds);
    recruitError_(record.attempts >= 5 ? '5번 틀려서 코드가 취소되었습니다. 다시 받아 주세요.' : '인증 코드가 맞지 않습니다.');
  }
  cache.remove(key);
  const token = Utilities.getUuid() + Utilities.getUuid(), session = {email:email, expiresAt:Date.now() + 1800000};
  cache.put('recruit:session:' + token, JSON.stringify(session), 1800);
  return {token:token, expiresAt:session.expiresAt, data:recruitSnapshot_(recruitUser_(token))};
}
function recruitQuestions_(d) {
  const questions = Array.isArray(d.questions) ? d.questions : d.secondaryHistory ? [{id:'history-major',label:'역사 전공 여부',level:'중등',type:'yesno',required:true,yesOnly:true}] : [];
  if (questions.length > 12) recruitError_('추가 질문은 12개까지 등록할 수 있습니다.');
  const ids = {};
  return questions.map(q => {
    const id = recruitId_(q.id);
    if (['__proto__','prototype','constructor'].indexOf(id) >= 0 || ids[id]) recruitError_('추가 질문 ID를 확인해 주세요.');
    ids[id] = true;
    return {id:id,label:recruitText_(q.label,120,'추가 질문',true),type:q.type === 'yesno' ? 'yesno':'text',level:RECRUIT_LEVELS.indexOf(q.level) >= 0 ? q.level:'전체',required:q.required === true,yesOnly:q.yesOnly === true};
  });
}
function recruitJobInput_(d) {
  d = d || {}; const result = {};
  const limits = {title:120,company:80,seats:120,fee:200,period:400,summary:400,tasks:4000,qualification:2000,process:1000,feeDetail:1000,additionalDetails:4000};
  Object.keys(limits).forEach(k => { result[k] = recruitText_(d[k],limits[k],({title:'공고명',company:'업체명',seats:'모집 인원',fee:'사례비',period:'진행 일정',tasks:'업무 내용'})[k] || k, ['title','company','seats','fee','period','tasks'].indexOf(k) >= 0); });
  if (RECRUIT_TYPES.indexOf(d.type) < 0) recruitError_('모집 업무 유형을 확인해 주세요.'); result.type = d.type;
  result.levels = RECRUIT_LEVELS.filter(l => Array.isArray(d.levels) && d.levels.indexOf(l) >= 0);
  if (!result.levels.length) recruitError_('모집 학교급을 하나 이상 골라 주세요.');
  const deadline = String(d.deadline || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || isNaN(Date.parse(deadline)) || new Date(deadline).toISOString().slice(0,10) !== deadline) recruitError_('마감일을 확인해 주세요.');
  result.deadline = deadline;
  if (!Array.isArray(d.fields) || d.fields.length > 20) recruitError_('희망 분야를 확인해 주세요.');
  result.fields = [...new Set(d.fields.map(f => recruitText_(f,80,'희망 분야',true)))];
  result.questions = recruitQuestions_(d);
  return result;
}
function recruitOwned_(kind, id, user) {
  const record = recruitGet_(kind, id);
  if (!record || (!user.admin && record.owner !== user.email)) recruitError_('이 항목에 접근할 권한이 없습니다.', 'FORBIDDEN');
  return record;
}
function recruitRequest_(d, user) {
  const input = d.value || {}, id = recruitId_(input.id), existing = recruitGet_('requests', id);
  if (existing) { recruitOwned_('requests',id,user); recruitCheckRevision_(existing,input); if (existing.data.status === '승인 · 게시') recruitError_('승인된 공고는 운영자에게 수정 요청해 주세요.'); }
  if (recruitEmail_(input.contact) !== user.email) recruitError_('인증한 이메일을 담당자 이메일로 사용해 주세요.');
  if (input.agree !== true) recruitError_('공고 검토를 위한 정보 수집·이용에 동의해 주세요.');
  const job = recruitJobInput_(input);
  if (job.deadline < recruitToday_()) recruitError_('마감일이 지난 공고는 등록 요청할 수 없습니다.');
  return recruitWrite_('requests', Object.assign(job,{id:id,ownerEmail:existing ? existing.owner:user.email,contact:existing ? existing.owner:user.email,status:'검토 대기',submittedAt:existing ? existing.data.submittedAt:recruitNow_()}), existing);
}
function recruitReview_(d, user) {
  if (!user.admin) recruitError_('운영자만 공고를 승인할 수 있습니다.', 'FORBIDDEN');
  const request = recruitGet_('requests', d.id);
  if (!request || request.data.status !== '검토 대기') recruitError_('현재 검토 대기 중인 요청이 아닙니다.');
  recruitCheckRevision_(request,d);
  if (d.approve === true) {
    const id = 'job-' + request.data.id, existing = recruitGet_('jobs',id);
    if (existing) recruitError_('이미 처리된 공고입니다. 새로고침해 주세요.');
    recruitWrite_('jobs',Object.assign(recruitJobInput_(request.data),{id:id,ownerEmail:request.owner,sourceRequestId:request.data.id,published:true}),null);
  }
  recruitWrite_('requests',Object.assign(request.data,{status:d.approve === true ? '승인 · 게시':'반려'}),request);
}
function recruitSaveJob_(d,user) {
  if (!user.admin) recruitError_('운영자만 공고를 편집할 수 있습니다.', 'FORBIDDEN');
  const input = d.value || {}, id = recruitId_(input.id), existing = recruitGet_('jobs',id);
  recruitCheckRevision_(existing,input);
  const value = Object.assign(recruitJobInput_(input),{id:id,ownerEmail:existing ? existing.owner:user.email,sourceRequestId:existing ? existing.data.sourceRequestId || '':'',published:input.published === true});
  if (existing && existing.data.closedAt) recruitError_('선발이 종료된 공고는 새 공고로 등록해 주세요.');
  if (existing && recruitRows_('apps',3,id).length && JSON.stringify(value.questions) !== JSON.stringify(existing.data.questions)) recruitError_('지원자가 있는 공고의 추가 질문은 변경할 수 없습니다.');
  recruitWrite_('jobs',value,existing);
}
function recruitApplication_(d,user) {
  const input = d.value || {}, job = recruitGet_('jobs',d.jobId);
  if (!job || !job.data.published || job.data.closedAt || job.data.deadline < recruitToday_()) recruitError_('모집이 마감되었거나 공개되지 않은 공고입니다.');
  let existing = input.id ? recruitGet_('apps',input.id) : recruitRows_('apps',2,user.email).find(r => r.data.jobId === job.data.id);
  if (existing && existing.owner !== user.email) recruitError_('본인의 지원서만 수정할 수 있습니다.', 'FORBIDDEN');
  if (existing && existing.data.jobId !== job.data.id) recruitError_('지원서의 공고가 일치하지 않습니다.');
  recruitCheckRevision_(existing,input);
  if (recruitEmail_(input.email) !== user.email) recruitError_('인증한 이메일로 지원해 주세요.');
  if (input.agreeCollection !== true || input.agreeSharing !== true) recruitError_('개인정보 수집·이용과 해당 공고 담당자 제공에 동의해 주세요.');
  if (job.data.levels.indexOf(input.level) < 0) recruitError_('이 공고의 모집 학교급을 확인해 주세요.');
  if (job.data.fields.length && job.data.fields.indexOf(input.field) < 0) recruitError_('희망 분야를 확인해 주세요.');
  const result = {id:existing ? existing.data.id:'app-' + Utilities.getUuid(),jobId:job.data.id,email:user.email,level:input.level,field:job.data.fields.length ? input.field:'',activity:'지원 분야 관련 이력',additional:''};
  const fields = {name:40,phone:24,description:1600,appMessage:1500,books:160,snsName:80,snsUrl:400,portfolio:400};
  Object.keys(fields).forEach(k => { result[k] = recruitText_(input[k],fields[k],({name:'성함',phone:'연락처',description:'관련 이력',appMessage:'지원 동기'})[k] || k,['name','phone','description','appMessage'].indexOf(k) >= 0); });
  if (!/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(result.phone)) recruitError_('연락처 형식을 확인해 주세요.');
  ['snsUrl','portfolio'].forEach(k => { if (result[k] && !/^https?:\/\/[^\s]+$/.test(result[k])) recruitError_('링크는 https://로 시작하는 주소로 적어 주세요.'); });
  const answers = Object.create(null);
  (job.data.questions || []).forEach(q => {
    if (q.level !== '전체' && q.level !== result.level) return;
    const answer = recruitText_((input.questionAnswers || {})[q.id],300,q.label,q.required);
    if (q.yesOnly && answer !== '예') recruitError_('지원 자격을 확인해 주세요: ' + q.label);
    if (q.type === 'yesno' && answer && ['예','아니요'].indexOf(answer) < 0) recruitError_('질문 답변을 확인해 주세요.');
    answers[q.id] = answer;
  });
  result.questionAnswers = answers; result.agreeCollection = true; result.agreeSharing = true; result.consentVersion = RECRUIT_VERSION;
  result.status = existing ? existing.data.status:'접수 완료'; result.submittedAt = existing ? existing.data.submittedAt:recruitNow_();
  recruitWrite_('apps',result,existing);
}
function recruitHandle_(d) {
  const op = d.op;
  if (op === 'snapshot') return {data:recruitSnapshot_(recruitUser_(d.token,true)),version:RECRUIT_VERSION};
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (op === 'requestCode') return recruitCode_(d.email);
    if (op === 'verifyCode') return recruitVerify_(d.email,d.code);
    const user = recruitUser_(d.token);
    if (op === 'logout') { CacheService.getScriptCache().remove('recruit:session:' + d.token); return {}; }
    if (op === 'saveRequest') recruitRequest_(d,user);
    else if (op === 'reviewRequest') recruitReview_(d,user);
    else if (op === 'saveApplication') recruitApplication_(d,user);
    else if (op === 'saveJob') recruitSaveJob_(d,user);
    else if (op === 'cancelRequest') {
      const r = recruitOwned_('requests',d.id,user); recruitCheckRevision_(r,d);
      if (r.data.status === '승인 · 게시') recruitError_('승인된 공고의 등록 요청은 취소할 수 없습니다.');
      recruitStore_('requests').deleteRow(r.row);
    } else if (op === 'withdrawApplication') {
      const r = recruitGet_('apps',d.id);
      if (!r || r.owner !== user.email) recruitError_('본인의 지원서만 철회할 수 있습니다.', 'FORBIDDEN');
      recruitCheckRevision_(r,d); recruitStore_('apps').deleteRow(r.row);
    } else if (op === 'toggleJob' || op === 'setStatus' || op === 'finishJob') {
      const r = op === 'setStatus' ? recruitGet_('apps',d.id) : recruitOwned_('jobs',d.id,user);
      if (!r) recruitError_('지원서를 찾을 수 없습니다.');
      const job = op === 'setStatus' ? recruitOwned_('jobs',r.data.jobId,user):r;
      if (op === 'setStatus') {
        if (['접수 완료','검토 중','선발','미선발'].indexOf(d.status) < 0) recruitError_('선발 상태를 확인해 주세요.');
        recruitCheckRevision_(r,d); recruitWrite_('apps',Object.assign(r.data,{status:d.status}),r);
      } else {
        if (!user.admin) recruitError_('운영자만 게시 상태를 변경할 수 있습니다.', 'FORBIDDEN');
        recruitCheckRevision_(job,d);
        if (op === 'finishJob') {
          recruitRows_('apps',3,job.data.id).sort((a,b)=>b.row-a.row).forEach(a=>recruitStore_('apps').deleteRow(a.row));
          job.data.closedAt = recruitNow_(); job.data.published = false;
        } else {
          if (job.data.closedAt) recruitError_('선발이 종료된 공고는 다시 게시할 수 없습니다.');
          job.data.published = !job.data.published;
        }
        recruitWrite_('jobs',job.data,job);
      }
    } else recruitError_('지원하지 않는 요청입니다.');
    SpreadsheetApp.flush();
    return {data:recruitSnapshot_(user),version:RECRUIT_VERSION};
  } finally { lock.releaseLock(); }
}

function setupRecruitment() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    Object.keys(RECRUIT_SHEETS).forEach(kind => { const spec = RECRUIT_SHEETS[kind]; sheet_(ss,spec[0],spec[1]); });
    if (!recruitGet_('jobs','j1')) {
      const seed = {id:'j1',title:'보훈교육 원격연수 강사 모집',company:'원격연수 제작 업체',type:'연수 강사',levels:['초등','중등'],seats:'초등 3명 · 중등 3명',fee:'차시당 50만 원',deadline:'2026-11-13',period:'강의 원고 작성: 2026년 12월 초까지\n강의 촬영: 2026년 12월 중',summary:'보훈교육 원격연수 「독립·호국·민주」 분야의 강의 원고를 집필하고 강의를 촬영할 교사를 모집합니다.',qualification:'초등 현직 교사 또는 중등 역사 전공 교사',process:'서류 접수 → 업체 검토 → 선발 결과 안내',feeDetail:'차시당 50만 원 (세전 여부 및 지급 일정은 추후 안내)',fields:['독립','호국','민주'],secondaryHistory:true,published:true,additionalDetails:'지원서에 보훈교육 관련 경력이나 활동 이력을 기재해 주세요.\n※ 업체명, 세전 여부 및 지급 일정은 추후 안내됩니다.',tasks:'보훈교육 원격연수 「독립·호국·민주」 중 담당 분야의 강의 원고를 작성합니다.\n작성한 원고를 바탕으로 해당 차시의 강의를 직접 촬영합니다.\n기본 1차시를 담당하며, 지원자의 전문 분야와 참여 가능 범위에 따라 최대 2차시까지 담당할 수 있습니다.'};
      recruitWrite_('jobs',Object.assign(recruitJobInput_(seed),{id:'j1',ownerEmail:recruitOwner_(),published:true,sourceRequestId:''}),null);
    }
    SpreadsheetApp.flush(); Logger.log('전문가 모집 시트 3개와 기존 모집 공고 연결 완료. 예시 공고는 등록하지 않았습니다.');
  } finally { lock.releaseLock(); }
}

// 편집기에서만 실행하는 연결 검사. 새 검토 대기 요청을 저장·조회·수정하고 그 검사 행만 정리한다.
function testRecruitmentConnection() {
  const email = recruitOwner_(), id = 'connection-test-' + Utilities.getUuid();
  const user = {email:email,admin:recruitAdmin_(email)}, lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const input = {id:id,company:'연결 검사',contact:email,title:'연결 확인용 자동 검사',type:'자문위원',levels:['초등'],seats:'검사',fee:'검사',period:'검사',deadline:'2099-12-31',tasks:'검사 행',fields:[],questions:[],agree:true};
    recruitRequest_({value:input},user);
    const saved = recruitGet_('requests',id); if (!saved || saved.owner !== email) throw new Error('연결 검사 저장 실패');
    input.revision = saved.data.revision; input.title = '연결 확인용 자동 검사 수정'; recruitRequest_({value:input},user);
    if (recruitGet_('requests',id).data.title !== input.title) throw new Error('연결 검사 수정 실패');
    Logger.log('모집 요청 실제 저장·조회·수정 성공. 인증 없는 비공개 정보 조회는 허용하지 않습니다.');
  } finally {
    const record = recruitGet_('requests',id); if (record) recruitStore_('requests').deleteRow(record.row);
    lock.releaseLock();
  }
}
