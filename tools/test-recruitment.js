const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness() {
  let time = Date.parse('2026-11-11T09:00:00Z'), serial = 0, locked = false;
  const sheets = {}, cache = new Map(), properties = new Map(), logs = [], tokens = new Map(), drive = {folders:new Map(),files:[]};
  properties.set('RECRUIT_ADMIN_EMAILS','admin@example.com');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args:[time])); } static now() { return time; } }
  class Sheet {
    constructor() { this.rows = []; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(0,...this.rows.map(r=>r.length)); }
    setFrozenRows() {}
    insertColumnBefore(c) { for (const r of this.rows) r.splice(c-1,0,''); }
    deleteRow(r) { this.rows.splice(r-1,1); }
    getRange(r,c,nr=1,nc=1) {
      const sheet = this;
      const range = {
        getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>sheet.rows[r-1+i]?.[c-1+j] ?? '')),
        getDisplayValues() { return this.getValues().map(row=>row.map(String)); },
        setValues(values) { values.forEach((row,i)=>{ sheet.rows[r-1+i] ||= []; row.forEach((value,j)=>sheet.rows[r-1+i][c-1+j]=value); }); return this; },
        setNumberFormat() { return this; },setFontWeight() { return this; },setBackground() { return this; },
        createTextFinder(value) { return {matchEntireCell(){return this;},useRegularExpression(){return this;},matchCase(){return this;},findAll:()=>Array.from({length:nr},(_,i)=>r+i).filter(row=>String(sheet.rows[row-1]?.[c-1]??'')===String(value)).map(row=>({getRow:()=>row}))}; }
      };
      return range;
    }
    getDataRange() { return this.getRange(1,1,this.getLastRow(),this.getLastColumn()); }
  }
  const ctx = vm.createContext({
    Date:Clock,console,Logger:{log:message=>logs.push(message)},
    SpreadsheetApp:{openById:()=>({getSheetByName:n=>sheets[n],insertSheet:n=>(sheets[n]=new Sheet())}),flush(){}},
    CacheService:{getScriptCache:()=>({get:k=>{const item=cache.get(k);return item&&item.expiry>time?item.value:null;},put:(k,value,ttl)=>cache.set(k,{value,expiry:time+ttl*1000}),remove:k=>cache.delete(k)})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})},
    Session:{getEffectiveUser:()=>({getEmail:()=>'admin@example.com'})},
    Utilities:{getUuid:()=>`12345678-1234-4321-a123-${String(++serial).padStart(12,'0')}`,formatDate:d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d),newBlob:(s,type,name)=>({getBytes:()=>Buffer.from(s),type,name}),
      // Apps Script처럼 -128~127 바이트 배열로 돌려준다.
      base64Decode:s=>{if(!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw new Error('잘못된 base64');return Array.from(Buffer.from(s,'base64'),b=>b>127?b-256:b);}},
    // 가짜 Drive: 폴더와 파일, 공유 설정만 기억한다.
    DriveApp:{Access:{ANYONE_WITH_LINK:'ANYONE_WITH_LINK'},Permission:{VIEW:'VIEW'},
      createFolder:name=>{const folder={id:'folder-'+String(drive.folders.size+1).padStart(10,'0'),name,trashed:false,getId(){return this.id;},isTrashed(){return this.trashed;},
        createFile:blob=>{const file={id:'file-'+String(drive.files.length+1).padStart(10,'0'),blob,folder,sharing:null,getId(){return this.id;},setSharing(access,permission){this.sharing=[access,permission];}};drive.files.push(file);return file;}};drive.folders.set(folder.id,folder);return folder;},
      getFolderById:id=>{const folder=drive.folders.get(id);if(!folder)throw new Error('없는 폴더');return folder;}},
    UrlFetchApp:{fetch:url=>{const t=tokens.get(decodeURIComponent(url.split('id_token=')[1]));return {getResponseCode:()=>t?200:400,getContentText:()=>JSON.stringify(t||{error:'invalid_token'})};}},
    LockService:{getScriptLock:()=>({waitLock(){assert(!locked,'중첩 잠금 금지');locked=true;},releaseLock(){assert(locked);locked=false;}})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
    HtmlService:{createHtmlOutput:()=>({setTitle:()=>''})}
  });
  const root = path.join(__dirname,'..');
  vm.runInContext(fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8')+'\n'+fs.readFileSync(path.join(root,'apps-script/Recruitment.gs'),'utf8'),ctx);
  const call = value => JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({action:'recruit',...value})}}));
  const clientId = vm.runInContext('GOOGLE_CLIENT_ID',ctx);
  // 가짜 구글: 증표 문자열 → 구글이 돌려줄 tokeninfo 내용
  const google = (email,over={}) => {const id='h.b.'+String(tokens.size+1).padStart(120,'x');tokens.set(id,{aud:clientId,iss:'https://accounts.google.com',email,email_verified:'true',exp:String(Math.floor(time/1000)+3600),...over});return id;};
  const login = email => {const result=call({op:'googleLogin',credential:google(email)});assert(result.ok,result.error);return result;};
  return {ctx,sheets,cache,properties,logs,drive,call,login,google,advance:ms=>time+=ms,clock:()=>time};
}

function run() {
  const h=createHarness(), {ctx,call}=h;
  ctx.setupRecruitment(); ctx.setupRecruitment();
  assert.equal(h.sheets['모집 공고'].rows.length,2,'초기화 재실행 시 공고 중복 없음');
  ctx.testRecruitmentConnection(); assert.equal(h.sheets['모집 요청'].rows.length,1,'실제 연결 검사 자기 행만 정리');
  let publicData=JSON.parse(ctx.doGet({parameter:{recruit:'1'}}));
  assert(publicData.ok); assert.equal(publicData.jobs.length,1); assert.equal(publicData.jobs[0].id,'j1');
  assert(!JSON.stringify(publicData).includes('admin@example.com'),'공개 API 담당자 이메일 제외');
  assert(!JSON.stringify(publicData).includes('예시'),'예시 공고를 실제 공고로 게시하지 않음');
  assert.equal(call({op:'saveJob',value:{}}).code,'AUTH');
  assert.equal(call({op:'snapshot'}).data.apps.length,0);

  const admin=h.login('admin@example.com'), partner=h.login('partner@example.com'), other=h.login('other@example.com'), teacher=h.login('teacher@example.com');
  assert(admin.data.user.admin); assert(!partner.data.user.admin);
  h.properties.delete('RECRUIT_ADMIN_EMAILS');
  assert.equal(call({op:'snapshot',token:admin.token}).data.user.admin,false,'운영자 설정이 없으면 관리자 권한을 부여하지 않음');
  h.properties.set('RECRUIT_ADMIN_EMAILS','admin@example.com');
  const as=(session,op,values={})=>call({op,token:session.token,...values});
  const ok=result=>{assert(result.ok,result.error);return result;};
  const denied=result=>assert(!result.ok,'허용되지 않은 요청 거절');
  let input={id:'request-1',company:'검사 기관',contact:'partner@example.com',title:'디지털 수업 검토 교사 모집',type:'검수·검토',levels:['초등'],seats:'2명',fee:'차시당 10만 원',period:'2026년 12월',deadline:'2026-12-01',tasks:'자료 검토',fields:['수업'],questions:[{id:'experience',label:'관련 경험',type:'text',level:'전체',required:true}],agree:true};
  denied(as(partner,'saveRequest',{value:{...input,contact:'other@example.com'}}));
  denied(as(partner,'saveRequest',{value:{...input,deadline:'2026-02-31'}}));
  denied(as(partner,'saveRequest',{value:{...input,agree:false}}));
  denied(as(partner,'saveRequest',{value:{...input,questions:[{id:'__proto__',label:'질문'}]}}));
  let saved=ok(as(partner,'saveRequest',{value:input})).data.requests[0];
  assert.equal(ok(as(other,'snapshot')).data.requests.length,0,'다른 기관 요청 비공개');
  denied(as(other,'cancelRequest',{id:saved.id,revision:saved.revision}));
  denied(as(partner,'reviewRequest',{id:saved.id,revision:saved.revision,approve:true}));
  input={...saved,title:'수정된 디지털 수업 검토 모집',contact:'partner@example.com',agree:true};
  saved=ok(as(partner,'saveRequest',{value:input})).data.requests[0];
  denied(as(partner,'saveRequest',{value:input}));
  const reviewed=ok(as(admin,'reviewRequest',{id:saved.id,revision:saved.revision,approve:true}));
  const job=reviewed.data.jobs.find(j=>j.id==='job-request-1');assert(job?.published);
  publicData=JSON.parse(ctx.doGet({parameter:{recruit:'1'}}));
  assert.equal(publicData.jobs.length,2);
  assert(!JSON.stringify(publicData).includes('partner@example.com'));

  let application={name:'검사 교사',phone:'010-0000-0000',email:'teacher@example.com',level:'초등',field:'수업',description:'수업 자료 검토 경험',appMessage:'자료 개발에 참여합니다.',questionAnswers:{experience:'검토 경험'},agreeCollection:true,agreeSharing:true};
  denied(as(teacher,'saveApplication',{jobId:job.id,value:{...application,agreeSharing:false}}));
  denied(as(teacher,'saveApplication',{jobId:job.id,value:{...application,email:'other@example.com'}}));
  denied(as(teacher,'saveApplication',{jobId:job.id,value:{...application,level:'중등'}}));
  denied(as(teacher,'saveApplication',{jobId:job.id,value:{...application,questionAnswers:{}}}));
  denied(as(teacher,'saveApplication',{jobId:job.id,value:{...application,portfolio:'javascript:alert(1)'}}));
  let app=ok(as(teacher,'saveApplication',{jobId:job.id,value:application})).data.apps[0];
  assert.equal(ok(as(other,'snapshot')).data.apps.length,0,'타인 지원서 비공개');
  assert.equal(ok(as(partner,'snapshot')).data.apps.length,1,'해당 공고 담당자는 자기 공고 지원서 조회');
  denied(as(other,'withdrawApplication',{id:app.id,revision:app.revision}));
  denied(as(other,'saveApplication',{jobId:job.id,value:{...application,id:app.id,revision:app.revision,email:'other@example.com'}}));
  denied(as(partner,'saveApplication',{jobId:job.id,value:{...application,id:app.id,revision:app.revision,email:'partner@example.com'}}));
  denied(as(teacher,'setStatus',{id:app.id,revision:app.revision,status:'선발'}));
  app=ok(as(partner,'setStatus',{id:app.id,revision:app.revision,status:'검토 중'})).data.apps[0];
  assert.equal(app.status,'검토 중');
  const stale={...app};
  app=ok(as(teacher,'saveApplication',{jobId:job.id,value:{...app,description:'수정한 관련 이력'}})).data.apps[0];
  denied(as(partner,'setStatus',{id:stale.id,revision:stale.revision,status:'선발'}));
  assert.equal(ok(as(teacher,'snapshot')).data.apps[0].description,'수정한 관련 이력');
  denied(as(partner,'saveJob',{value:{...job,ownerEmail:'partner@example.com'}}));
  denied(as(admin,'saveJob',{value:{...job,questions:[]}}));

  const special={...application,email:'other@example.com',level:'중등',field:'독립',questionAnswers:{'history-major':'아니요'}};
  denied(as(other,'saveApplication',{jobId:'j1',value:special}));
  const specialApp=ok(as(other,'saveApplication',{jobId:'j1',value:{...special,questionAnswers:{'history-major':'예'}}})).data.apps[0];
  ok(as(other,'withdrawApplication',{id:specialApp.id,revision:specialApp.revision}));
  assert.equal(ok(as(other,'snapshot')).data.apps.length,0);
  denied(as(partner,'finishJob',{id:job.id,revision:job.revision}));
  const finished=ok(as(admin,'finishJob',{id:job.id,revision:job.revision}));
  assert.equal(finished.data.apps.length,0,'선발 종료 시 그 공고 지원서 삭제');
  const closed=finished.data.jobs.find(j=>j.id===job.id);
  denied(as(admin,'toggleJob',{id:closed.id,revision:closed.revision}));
  denied(as(teacher,'saveApplication',{jobId:job.id,value:application}));
  denied(as(admin,'saveJob',{value:{...closed,published:true}}));
  assert.equal(JSON.parse(ctx.doGet({parameter:{recruit:'1'}})).jobs.length,1);
  const newRequest=ok(as(partner,'saveRequest',{value:{...input,id:'request-2',revision:undefined}})).data.requests.find(r=>r.id==='request-2');
  ok(as(partner,'cancelRequest',{id:newRequest.id,revision:newRequest.revision}));
  assert.equal(ok(as(partner,'snapshot')).data.requests.length,1);

  // 상세페이지 그림: 로그인한 사용자만 올리고, 실제 그림 파일만 받아 링크 공개로 저장한다.
  const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(40)]).toString('base64');
  const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(40)]).toString('base64');
  const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.alloc(30)]).toString('base64');
  assert.equal(call({op:'uploadImage',name:'a.png',mime:'image/png',data:png}).code,'AUTH','로그인 없이 그림 올리기 거절');
  ctx.setupRecruitImages(); ctx.setupRecruitImages();
  assert.equal(h.drive.folders.size,1,'그림 폴더 재실행 시 중복 없음');
  const folder=[...h.drive.folders.values()][0];
  assert.equal(folder.name,'티픽스 모집 공고 상세 이미지'); assert.equal(h.properties.get('RECRUIT_IMAGE_FOLDER'),folder.id);
  assert(h.logs.some(m=>m.includes(folder.id)),'폴더 ID 기록');
  const up=ok(as(partner,'uploadImage',{name:'상세<1>.png',mime:'image/png',data:png}));
  const file=h.drive.files.find(f=>f.id===up.id);
  assert(file && file.folder===folder,'그림 폴더에 저장'); assert.deepEqual(file.sharing,['ANYONE_WITH_LINK','VIEW'],'링크가 있는 사람 보기 공유');
  assert.equal(file.blob.type,'image/png'); assert(!/[<>]/.test(file.blob.name),'파일 이름 정리');
  ok(as(partner,'uploadImage',{name:'b.jpg',mime:'image/jpeg',data:jpeg})); ok(as(partner,'uploadImage',{name:'c.webp',mime:'image/webp',data:webp}));
  denied(as(partner,'uploadImage',{name:'a.gif',mime:'image/gif',data:png}));
  denied(as(partner,'uploadImage',{name:'a.png',mime:'image/png',data:jpeg}));
  denied(as(partner,'uploadImage',{name:'a.png',mime:'image/png',data:'!!!'}));
  denied(as(partner,'uploadImage',{name:'a.png',mime:'image/png',data:Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47]),Buffer.alloc(5*1024*1024)]).toString('base64')}));
  folder.trashed=true; ok(as(partner,'uploadImage',{name:'d.png',mime:'image/png',data:png}));
  assert.equal(h.drive.folders.size,2,'휴지통에 넣은 폴더는 새로 만듦'); assert.notEqual(h.properties.get('RECRUIT_IMAGE_FOLDER'),folder.id);

  const ids=['file-0000000002','file-0000000001'];
  denied(as(partner,'saveRequest',{value:{...input,id:'request-3',revision:undefined,detailImages:['../x']}}));
  denied(as(partner,'saveRequest',{value:{...input,id:'request-3',revision:undefined,detailImages:Array.from({length:6},(_,i)=>'file-000000000'+i)}}));
  denied(as(partner,'saveRequest',{value:{...input,id:'request-3',revision:undefined,detailImages:'file-0000000001'}}));
  const imageRequest=ok(as(partner,'saveRequest',{value:{...input,id:'request-3',revision:undefined,detailImages:[ids[0],ids[1],ids[0]]}})).data.requests.find(r=>r.id==='request-3');
  assert.deepEqual(imageRequest.detailImages,ids,'중복을 빼고 순서 유지');
  const imageJob=ok(as(admin,'reviewRequest',{id:imageRequest.id,revision:imageRequest.revision,approve:true})).data.jobs.find(j=>j.id==='job-request-3');
  assert.deepEqual(imageJob.detailImages,ids,'승인 시 그림 유지');
  assert.deepEqual(JSON.parse(ctx.doGet({parameter:{recruit:'1'}})).jobs.find(j=>j.id==='job-request-3').detailImages,ids,'공개 API에 그림 포함');
  const editedJob=ok(as(admin,'saveJob',{value:{...imageJob,detailImages:[ids[1]]}})).data.jobs.find(j=>j.id==='job-request-3');
  assert.deepEqual(editedJob.detailImages,[ids[1]],'운영자 편집에서 그림 빼기');
  ok(as(admin,'finishJob',{id:editedJob.id,revision:editedJob.revision}));

  h.advance(31*60*1000);
  assert.equal(as(teacher,'snapshot').code,'AUTH','세션 만료 검사');
  const g=createHarness();g.ctx.setupRecruitment();
  const gl=credential=>g.call({op:'googleLogin',credential});
  assert.equal(ok(gl(g.google('Code@Example.com'))).data.user.email,'code@example.com','구글 이메일은 소문자로 맞춤');
  assert(ok(gl(g.google('admin@example.com'))).data.user.admin,'운영자 이메일은 구글 로그인에서도 운영자');
  g.properties.set('RECRUIT_ADMIN_EMAILS','admin@example.com,ai.lab@keipa.kr');
  assert(ok(gl(g.google('AI.Lab@keipa.kr'))).data.user.admin,'운영자 이메일을 쉼표로 여럿 지정할 수 있음');
  assert(!ok(gl(g.google('teacher@example.com'))).data.user.admin,'목록에 없는 이메일은 운영자가 아님');
  denied(gl(g.google('a@example.com',{aud:'other.apps.googleusercontent.com'})));
  denied(gl(g.google('a@example.com',{email_verified:'false'})));
  denied(gl(g.google('a@example.com',{iss:'https://evil.example'})));
  denied(gl(g.google('a@example.com',{exp:String(Math.floor(g.clock()/1000)-5)})));
  denied(gl('not-a-token')); denied(gl('')); denied(gl('a.b.'+'y'.repeat(150)));
  denied(g.call({op:'requestCode',email:'a@example.com'})); denied(g.call({op:'verifyCode',email:'a@example.com',code:'123456'}));

  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'experts.html'),'utf8');
  for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(script[1].trim())new vm.Script(script[1]);
  new vm.Script(fs.readFileSync(path.join(root,'experts-connection.js'),'utf8'));
  // 공고 상세의 그림 부분만 꺼내 확인한다. 그림이 없는 예전 공고는 아무것도 더하지 않는다.
  const view=vm.createContext({});vm.runInContext(html.match(/^const DETAIL_IMAGE_ID=.*$/m)[0]+'\n'+html.match(/^function detailImages\(.*$/m)[0]+'\nthis.detailImages=detailImages;',view);
  assert.equal(view.detailImages(undefined),''); assert.equal(view.detailImages([]),'');
  const shown=view.detailImages(['aaaaaaaaaa1','bad id"><script>','bbbbbbbbbb2']);
  assert(!shown.includes('script'),'올바르지 않은 그림 ID는 버림');
  assert(shown.indexOf('aaaaaaaaaa1')<shown.indexOf('bbbbbbbbbb2') && /상세 그림 1" +decoding/.test(shown) && /상세 그림 2" loading="lazy"/.test(shown),'첫 그림은 바로, 나머지는 늦게 불러옴');
  assert(shown.includes('lh3.googleusercontent.com/d/aaaaaaaaaa1=w1600') && shown.includes("this.onerror=null;this.src='https://drive.google.com/thumbnail?id=aaaaaaaaaa1&amp;sz=w1600'"),'큰 주소 실패 시 썸네일로 한 번만 바꿈');
  const detailStart=html.indexOf('function detailPanel(j)');
  assert(html.indexOf('<section class="panel" id="detail">${detailImages(j.detailImages)}<div class="detail">',detailStart)>0,'상세 그림을 제목보다 먼저 표시');
  assert(!html.includes('localStorage'),'완료된 지원서를 브라우저 영구 저장소에 저장하지 않음');
  assert(!html.includes('seedJobs'),'서버 실패 시 시제품 공고를 실제 데이터처럼 표시하지 않음');
  console.log('모집 API: 초기화·인증·만료·소유권·승인·접수/수정·선발 상태·동시 수정 충돌·철회·종료 삭제·공개 데이터 제외·상세 그림 올리기/표시·화면 문법 통과');
}
if(require.main===module) run();
module.exports={createHarness};
