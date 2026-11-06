const SS_ID='1jyZWvsbq2hJBzFZGFhMbFQmzSDAXXnkveRr8XfRVqN8';const CATS=['AI·디지털 기초 소양','구글 협업·데이터','디자인·미디어','수업·평가','학급경영·업무 자동화','바이브코딩·웹 개발','AI·SW 융합','교육연구·교사 전문성·교양'];const FIELDS=[['name','성함',1],['phone','전화번호',1],['email','이메일',1],['office','소속 교육청',1],['school','근무지',1],['level','근무 학교급',1],['target','강의 가능 대상'],['line','한 줄 소개',1],['intro','자기소개 (2문장)',1],['field','주요 전문 분야',1],['fieldMore','전문 분야 자세히'],['p1n','대표 프로그램 ① 이름',1],['p1l','대표 프로그램 ① 링크'],['p2n','대표 프로그램 ② 이름'],['p2l','대표 프로그램 ② 링크'],['p3n','대표 프로그램 ③ 이름'],['p3l','대표 프로그램 ③ 링크'],['history','연수 이력'],['book','대표 저서 1권'],['s1n','SNS ① 이름'],['s1l','SNS ① 링크'],['s2n','SNS ② 이름'],['s2l','SNS ② 링크'],['community','커뮤니티'],['chatUrl','운영 중인 오픈채팅방 주소'],['chatSize','오픈채팅방 인원(대략)'],['award','수상'],['career','이력'],['open','공개 항목']];const COURSE_H=['제출 시각','응답 ID','성함','이메일','대분류','핵심 도구','가능 차시','연수명(가제)','강의 방식','난이도','강의 대상'];const TARGETS=['유치원 교사','초등 교사','중등 교사','고등 교사','학생','학부모','관리자(교장·교감)'];
function doGet(e){if(e&&e.parameter&&e.parameter.list)return ContentService.createTextOutput(JSON.stringify(listPool_())).setMimeType(ContentService.MimeType.JSON);return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;padding:24px">티픽스 메이커 인력풀 조사는 새 주소로 옮겼습니다: <a href="https://moonsugugu.github.io/tpicks-maker-pool/" target="_top">https://moonsugugu.github.io/tpicks-maker-pool/</a></p>').setTitle('티픽스 메이커 인력풀 조사')}
function collabCount_(v) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (typeof v === 'string' && !/^\d+$/.test(v.trim())) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function collabStats_(row) {
  row = row || {};
  const production = collabCount_(row['연수 제작']), publication = collabCount_(row['도서 출판']), remote = collabCount_(row['원격 강의']), onsite = collabCount_(row['대면 강의']);
  const content = production === null || publication === null ? null : production + publication;
  let score = content === null || remote === null || onsite === null ? null : content * 100 + remote * 10 + onsite * 10;
  if (score !== null && !Number.isSafeInteger(score)) score = null;
  return {production: production, publication: publication, content: content, remote: remote, onsite: onsite, score: score};
}
function listPool_() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const rows = name => {
    const s = ss.getSheetByName(name);
    if (!s || s.getLastRow() < 2) return [];
    const v = s.getDataRange().getDisplayValues(), h = v.shift();
    return v.map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i]); return o; });
  };
  const courses = Object.create(null), by = Object.create(null);
  rows('가능 연수').forEach(r => (courses[r['응답 ID']] = courses[r['응답 ID']] || []).push({cat: r['대분류'], tool: r['핵심 도구'], title: r['연수명(가제)'], target: r['강의 대상'] || '', mode: r['강의 방식'] || '', diff: r['난이도'] || ''}));
  rows('강사').forEach(r => {
    if (!r['성함']) return;
    const email = String(r['이메일'] || '').trim().toLowerCase();
    by[email || r['응답 ID']] = {
      name: r['성함'], office: r['소속 교육청'], school: r['근무지'], intro: r['자기소개 (2문장)'],
      courses: courses[r['응답 ID']] || [], ...openExtra_(r)
    };
  });
  return Object.keys(by).map(k => by[k]);
}
function setupCollab() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    let s = ss.getSheetByName('협업 횟수');
    if (!s) s = ss.insertSheet('협업 횟수');
    const headers = s.getLastColumn() ? s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0] : [];
    const added = [];
    ['이메일', '성함', '협업 횟수', '메모', '연수 제작', '도서 출판', '원격 강의', '대면 강의', '협업 점수'].forEach(name => {
      if (headers.indexOf(name) < 0) { headers.push(name); added.push(name); }
    });
    s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#F1ECFF');
    s.setFrozenRows(1);
    const col = name => headers.indexOf(name);
    const current = s.getLastRow() > 1 ? s.getRange(2, 1, s.getLastRow() - 1, headers.length).getValues() : [];
    // 기존 총횟수가 0인 행만 새로 추가한 유형을 0으로 초기화한다.
    const countNames = ['연수 제작', '도서 출판', '원격 강의', '대면 강의'];
    countNames.filter(name => added.indexOf(name) >= 0).forEach(name => {
      if (current.length) s.getRange(2, col(name) + 1, current.length, 1).setValues(current.map(r => [collabCount_(r[col('협업 횟수')]) === 0 ? 0 : '']));
    });
    const have = new Set(current.map(r => String(r[col('이메일')] || '').trim().toLowerCase())), add = [];
    const teachers = ss.getSheetByName('강사');
    if (teachers && teachers.getLastRow() > 1) {
      const values = teachers.getDataRange().getDisplayValues(), h = values.shift();
      values.forEach(r => {
        const email = String(r[h.indexOf('이메일')] || '').trim().toLowerCase();
        if (email && !have.has(email)) {
          have.add(email);
          const row = Array(headers.length).fill('');
          row[col('이메일')] = email;
          row[col('성함')] = clean_(r[h.indexOf('성함')]);
          row[col('협업 횟수')] = 0;
          countNames.forEach(name => row[col(name)] = 0);
          add.push(row);
        }
      });
    }
    if (add.length) s.getRange(s.getLastRow() + 1, 1, add.length, headers.length).setValues(add);
    const n = s.getLastRow() - 1;
    if (n > 0) {
      const refs = countNames.map(name => 'RC' + (col(name) + 1));
      const valid = ['COUNT(' + refs.join(',') + ')=4'].concat(refs.map(r => 'AND(' + r + '>=0,MOD(' + r + ',1)=0)'));
      const formula = '=IFERROR(IF(AND(' + valid.join(',') + '),(' + refs[0] + '+' + refs[1] + ')*100+' + refs[2] + '*10+' + refs[3] + '*10,"확인 중"),"확인 중")';
      s.getRange(2, col('협업 점수') + 1, n, 1).setFormulasR1C1(Array.from({length: n}, () => [formula])).setNumberFormat('0');
      countNames.forEach(name => {
        const c = col(name) + 1, ref = s.getRange(2, c).getA1Notation();
        const rule = SpreadsheetApp.newDataValidation().requireFormulaSatisfied('=OR(' + ref + '="",AND(ISNUMBER(' + ref + '),' + ref + '>=0,MOD(' + ref + ',1)=0))').setAllowInvalid(false).setHelpText('0 이상의 정수를 입력하세요. 미확인 실적은 빈칸으로 둡니다.').build();
        s.getRange(2, c, Math.max(n, 100), 1).setNumberFormat('0').setDataValidation(rule);
      });
    }
    s.getRange(1, col('협업 횟수') + 1).setNote('기존 협업 총횟수 보관용입니다. 점수는 연수 제작·도서 출판·원격 강의·대면 강의로 계산합니다.');
    s.getRange(1, col('연수 제작') + 1).setNote('완료한 연수 과정 1건당 100점');
    s.getRange(1, col('도서 출판') + 1).setNote('출판한 도서 1권당 100점. 연수 제작과 합쳐 콘텐츠 제작 실적으로 표시합니다.');
    s.getRange(1, col('원격 강의') + 1).setNote('완료한 실시간 온라인 강의 1회당 10점');
    s.getRange(1, col('대면 강의') + 1).setNote('완료한 대면 강의 1회당 10점');
    SpreadsheetApp.flush();
    Logger.log('협업 점수 열 설정 완료, 새 강사 ' + add.length + '명 추가');
  } finally { lock.releaseLock(); }
}
function clean_(v){v=Array.isArray(v)?v.map(x=>String(x).trim()).filter(x=>x).join(', '):String(v==null?'':v).trim();v=v.slice(0,2000);return /^[=+\-@]/.test(v)?"'"+v:v}
function sheet_(ss,name,h){let s=ss.getSheetByName(name);if(!s){s=ss.insertSheet(name);s.setFrozenRows(1)}const n=s.getLastColumn(),cur=n?s.getRange(1,1,1,n).getValues()[0]:[];if(cur.slice(0,h.length).join('|')===h.join('|'))return s;h.forEach((t,i)=>{if(cur[i]===t)return;if(cur.indexOf(t)>=0)throw new Error('시트 열 순서가 다릅니다: '+t);if(i<cur.length)s.insertColumnBefore(i+1);cur.splice(i,0,t)});s.getRange(1,1,1,h.length).setValues([h]).setFontWeight('bold').setBackground('#F1ECFF');return s}
function put_(s,rows){const r=s.getLastRow()+1,n=rows[0].length;s.getRange(r,1,rows.length,1).setNumberFormat('yyyy-mm-dd hh:mm');s.getRange(r,2,rows.length,n-1).setNumberFormat('@');s.getRange(r,1,rows.length,n).setValues(rows)}
function submitPool(d){d=d||{};const v={};FIELDS.forEach(f=>v[f[0]]=clean_(d[f[0]]));const miss=FIELDS.filter(f=>f[2]&&!v[f[0]]).map(f=>f[1]);if(miss.length)throw new Error('빠진 항목이 있습니다: '+miss.join(', '));if(!/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(v.phone))throw new Error('전화번호를 010-1234-5678 형식으로 적어 주세요.');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email))throw new Error('이메일 주소를 확인해 주세요.');if(v.line.length>30)throw new Error('한 줄 소개는 30자 이내로 적어 주세요.');if(Array.isArray(d.field)&&d.field.length>3)throw new Error('주요 전문 분야는 3개까지 고를 수 있습니다.');['p1l','p2l','p3l','s1l','s2l','chatUrl'].forEach(k=>{if(v[k]&&!/^https?:\/\/\S+$/.test(v[k]))throw new Error('링크는 https://로 시작하는 주소로 적어 주세요.')});if(d.agree!==true)throw new Error('개인정보 수집·이용에 동의해 주세요.');const cs=(Array.isArray(d.courses)?d.courses:[]).slice(0,10).map((c,i)=>{c=c||{};const cat=clean_(c.cat),hours=parseInt(c.hours,10),mode=(Array.isArray(c.mode)?c.mode:[]).filter(m=>['원격','대면','녹화'].indexOf(m)>=0),tg=(Array.isArray(c.target)?c.target:[]).map(t=>String(t).trim()).filter(t=>TARGETS.indexOf(t)>=0||/^기타: \S/.test(t)),r=[cat,clean_(c.tool),hours,clean_(c.title),mode.join(', '),String(c.diff||''),clean_(tg)];if(!(CATS.indexOf(cat)>=0||/^기타: \S/.test(cat))||!r[1]||!(hours>=1&&hours<=99)||!r[3]||!mode.length||['기초','중급','심화'].indexOf(r[5])<0||!tg.length)throw new Error((i+1)+'번째 가능 연수에 빠진 항목이 있습니다.');return r});if(!cs.length)throw new Error('가능 연수를 하나 이상 등록해 주세요.');const lock=LockService.getScriptLock();lock.waitLock(20000);try{const ss=SpreadsheetApp.openById(SS_ID),now=new Date(),id=Utilities.getUuid().slice(0,8);put_(sheet_(ss,'강사',['제출 시각','응답 ID'].concat(FIELDS.map(f=>f[1]),['가능 연수 수','개인정보 동의'])),[[now,id].concat(FIELDS.map(f=>v[f[0]]),[cs.length,'동의'])]);put_(sheet_(ss,'가능 연수',COURSE_H),cs.map(r=>[now,id,v.name,v.email].concat(r)));return id}finally{lock.releaseLock()}}
function testSubmit(){try{submitPool({});throw 0}catch(e){if(e===0)throw new Error('빈 제출이 통과됨');Logger.log('빈 제출 거절 확인: '+e.message)}const id=submitPool({name:'테스트',phone:'010-0000-0000',email:'test@example.com',office:'테스트교육청',school:'테스트학교',level:'초등학교',target:['교사'],line:'테스트',intro:'테스트',field:['AI 활용 수업'],p1n:'테스트',p1l:'https://example.com',chatUrl:'https://open.kakao.com/o/test',chatSize:'약 10명',agree:true,courses:[{cat:'디자인·미디어',tool:'캔바',hours:'2',title:'캔바로 배우는 우리반 도구 만들기',mode:['원격','대면'],diff:'기초',target:['초등 교사']},{cat:'기타: 테스트 분류',tool:'시트',hours:'1',title:'테스트',mode:['녹화'],diff:'심화',target:['기타: 테스트']}]});const ss=SpreadsheetApp.openById(SS_ID);['강사','가능 연수'].forEach(n=>{const s=ss.getSheetByName(n),ids=s.getRange(1,2,s.getLastRow(),1).getValues();Logger.log(n+' 머리글: '+s.getRange(1,1,1,s.getLastColumn()).getValues()[0].join(' | '));Logger.log(n+' 테스트 행: '+JSON.stringify(s.getRange(s.getLastRow(),1,1,s.getLastColumn()).getDisplayValues()[0]));for(let i=ids.length-1;i>=1;i--)if(ids[i][0]===id)s.deleteRow(i+1)});Logger.log('테스트 통과, 테스트 행 삭제: '+id)}
function doPost(e){let r;try{const d=JSON.parse(e.postData.contents),a=d.action;r={ok:true};if(a==="code")sendCode_(d.email);else if(a==="verify")Object.assign(r,verify_(d.email,d.code));else if(a==="delete")r.n=delete_(d.token);else r.id=save_(d)}catch(err){r={ok:false,error:err.message}}return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON)}
function mail_(v){v=String(v||"").trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))throw new Error("이메일 주소를 확인해 주세요.");return v}
function mine_(ss,email){const t=ss.getSheetByName("강사"),m={t:t,rows:[],ids:[]};if(!t||t.getLastRow()<2)return m;m.v=t.getDataRange().getDisplayValues();m.h=m.v[0];const ei=m.h.indexOf("이메일"),ii=m.h.indexOf("응답 ID");for(let i=1;i<m.v.length;i++)if(String(m.v[i][ei]).trim().toLowerCase()===email){m.rows.push(i+1);m.ids.push(m.v[i][ii])}return m}
function drop_(ss,m,keep){for(let i=m.rows.length-1;i>=0;i--)if(m.ids[i]!==keep)m.t.deleteRow(m.rows[i]);const c=ss.getSheetByName("가능 연수");if(!c||c.getLastRow()<2)return;const v=c.getRange(1,2,c.getLastRow(),1).getDisplayValues();for(let i=v.length-1;i>=1;i--)if(v[i][0]!==keep&&m.ids.indexOf(v[i][0])>=0)c.deleteRow(i+1)}
function sendCode_(email){email=mail_(email);const c=CacheService.getScriptCache();if(c.get("wait:"+email))throw new Error("코드를 방금 보냈습니다. 1분 뒤에 다시 받아 주세요.");if(!mine_(SpreadsheetApp.openById(SS_ID),email).rows.length)throw new Error("이 이메일로 제출한 내용이 없습니다.");const code=String(100000+parseInt(Utilities.getUuid().replace(/-/g,"").slice(0,12),16)%900000);c.put("code:"+email,JSON.stringify({c:code,n:0}),600);c.put("wait:"+email,"1",60);MailApp.sendEmail(email,"[티픽스 메이커 강사풀] 인증 코드 "+code,"인증 코드: "+code+"\n\n10분 안에 조사 페이지에 입력해 주세요.\nhttps://moonsugugu.github.io/tpicks-maker-pool/\n\n직접 요청하지 않았다면 이 메일은 무시하셔도 됩니다.")}
function verify_(email,code){email=mail_(email);const c=CacheService.getScriptCache(),k="code:"+email,s=c.get(k);if(!s)throw new Error("코드가 없거나 10분이 지났습니다. 코드를 다시 받아 주세요.");const o=JSON.parse(s);if(o.c!==String(code||"").trim()){o.n++;if(o.n>=5)c.remove(k);else c.put(k,JSON.stringify(o),600);throw new Error(o.n>=5?"5번 틀려서 코드가 취소되었습니다. 다시 받아 주세요.":"코드가 맞지 않습니다.")}c.remove(k);const t=Utilities.getUuid();c.put("tok:"+t,email,1800);return {token:t,data:load_(email)}}
function load_(email){const ss=SpreadsheetApp.openById(SS_ID),m=mine_(ss,email);if(!m.rows.length)return null;const r=m.v[m.rows[m.rows.length-1]-1],d={},id=r[m.h.indexOf("응답 ID")],c=ss.getSheetByName("가능 연수");FIELDS.forEach(f=>{const i=m.h.indexOf(f[1]);d[f[0]]=i>=0?r[i]:""});["target","field","open"].forEach(k=>d[k]=d[k]?d[k].split(", "):[]);d.courses=(c?c.getDataRange().getDisplayValues().slice(1):[]).filter(x=>x[1]===id).map(x=>({cat:x[4],tool:x[5],hours:x[6],title:x[7],mode:x[8]?x[8].split(", "):[],diff:x[9],target:x[10]?x[10].split(", "):[]}));return d}
function who_(token){const e=CacheService.getScriptCache().get("tok:"+String(token||""));if(!e)throw new Error("인증한 지 30분이 지났습니다. 위에서 코드를 다시 받아 주세요.");return e}
function save_(d){d=d||{};const email=String(d.email||"").trim().toLowerCase(),ss=SpreadsheetApp.openById(SS_ID),old=mine_(ss,email).rows.length;if(old){if(!d.token)throw new Error("이미 등록된 이메일입니다. 위쪽 ‘이미 제출하셨나요?’에서 이메일 인증을 한 뒤 고쳐 주세요.");if(who_(d.token)!==email)throw new Error("인증한 이메일과 제출하는 이메일이 다릅니다.")}const id=submitPool(d);if(old){const l=LockService.getScriptLock();l.waitLock(20000);try{drop_(ss,mine_(ss,email),id)}finally{l.releaseLock()}}return id}
function delete_(token){const email=who_(token),ss=SpreadsheetApp.openById(SS_ID),l=LockService.getScriptLock();l.waitLock(20000);try{const m=mine_(ss,email);drop_(ss,m,null);CacheService.getScriptCache().remove("tok:"+token);return m.rows.length}finally{l.releaseLock()}}
function mailQuota(){Logger.log("오늘 더 보낼 수 있는 메일: "+MailApp.getRemainingDailyQuota()+"통")}
function orderCollab(){const s=SpreadsheetApp.openById(SS_ID).getSheetByName("협업 횟수"),want=["협업 점수","연수 제작","도서 출판","원격 강의","대면 강의","메모","성함","이메일"];want.forEach((n,i)=>{const h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0],j=h.indexOf(n);if(j>i)s.moveColumns(s.getRange(1,j+1),i+1)});const h2=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];["연수 제작","도서 출판","원격 강의","대면 강의"].forEach(n=>{const c=h2.indexOf(n)+1;if(!c)return;const a=s.getRange(2,c).getA1Notation();s.getRange(2,c,Math.max(s.getLastRow()-1,100),1).setDataValidation(SpreadsheetApp.newDataValidation().requireFormulaSatisfied("=OR("+a+"=\"\",AND(ISNUMBER("+a+"),"+a+">=0,MOD("+a+",1)=0))").setAllowInvalid(false).setHelpText("0 이상의 정수를 입력하세요. 미확인 실적은 빈칸으로 둡니다.").build())});s.setFrozenColumns(0);Logger.log(s.getRange(1,1,1,s.getLastColumn()).getValues()[0].join(" | "))}
function openExtra_(r){const o=String(r["공개 항목"]||"").split(", "),has=k=>o.indexOf(k)>=0,x={},url=v=>/^https?:\/\//.test(v||"")?v:"",pairs=(p,cs)=>cs.map(c=>({name:r[p+" "+c+" 이름"]||"",link:url(r[p+" "+c+" 링크"])})).filter(v=>v.name);const pr=pairs("대표 프로그램",["①","②","③"]),sn=pairs("SNS",["①","②"]);if(has("대표 프로그램")&&pr.length)x.programs=pr;if(has("대표 저서")&&r["대표 저서 1권"])x.book=r["대표 저서 1권"];if(has("연수 이력")&&r["연수 이력"])x.history=r["연수 이력"];if(has("SNS")&&sn.length)x.sns=sn;if(has("커뮤니티")&&r["커뮤니티"])x.community=r["커뮤니티"];if(has("수상")&&r["수상"])x.award=r["수상"];if(has("이력")&&r["이력"])x.career=r["이력"];return x}
