// 로컬 검사: Code.gs 저장 로직, 시트 열 맞춤, index.html과 서버 항목 일치
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 가짜 시트: rows[r][c]
const sheets = {}, cache = new Map();
// 가짜 구글: 증표(credential) 문자열 → 구글이 돌려줄 tokeninfo 내용
const CLIENT_ID = src.match(/const GOOGLE_CLIENT_ID="([^"]+)"/)[1], tokens = new Map();
const google = (email, over = {}) => { const id = 'h.b.' + String(tokens.size + 1).padStart(120, 'x'); tokens.set(id, { aud: CLIENT_ID, iss: 'https://accounts.google.com', email, email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600), ...over }); return id; };
const mkSheet = () => {
  const rows = [];
  const s = {
    rows, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
    insertColumnBefore: c => rows.forEach(r => { while (r.length < c - 1) r.push(''); r.splice(c - 1, 0, ''); }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = x); }); return this; },
      setNumberFormat() { return this; }, getDisplayValues() { return this.getValues().map(r => r.map(x => String(x))); }, setFontWeight() { return this; }, setBackground() { return this; },
    }),
    setFrozenRows() {}, deleteRow: r => rows.splice(r - 1, 1), getDataRange: () => ({ getDisplayValues: () => rows.map(r => r.map(x => String(x ?? ""))) }),
  };
  return s;
};
const ctx = {
  HtmlService: { createHtmlOutput: () => ({ setTitle: () => "html" }) }, ContentService: { MimeType: { JSON: 1 }, createTextOutput: s => ({ setMimeType: () => s }) }, Logger: { log() {} }, Utilities: { getUuid: (() => { let u = 0; return () => (u++ ? (0xa0000000 + u).toString(16) : 'abcdef12') + '-xxxx'; })() },
  CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) }, UrlFetchApp: { fetch: url => { const t = tokens.get(decodeURIComponent(url.split('id_token=')[1])); return { getResponseCode: () => t ? 200 : 400, getContentText: () => JSON.stringify(t || { error: 'invalid_token' }) }; } }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: n => sheets[n], insertSheet: n => (sheets[n] = mkSheet()) }) },
};
vm.createContext(ctx);
vm.runInContext(src + '\n;this.submitPool=submitPool;this.listPool_=listPool_;this.doGet=doGet;this.setupCollab=setupCollab;this.save_=save_;this.googleLogin_=googleLogin_;this.delete_=delete_;this.doPost=doPost;this.clean_=clean_;this.FIELDS=FIELDS;', ctx);
// 연수별 강의 대상
const base = { name: '김하늘', phone: '01012345678', email: 'a@b.co', office: '경기도교육청 의정부교육지원청', school: '○○초', level: '초등학교',
  line: '한 줄', intro: '소개', field: ['AI 활용 수업'], p1n: '앱', agree: true };
const c1 = { cat: '디자인·미디어', tool: '캔바', hours: '2', title: '캔바 연수', mode: ['원격'], diff: '기초', target: ['초등 교사', '학부모'] };
const thr = (f, m) => assert.throws(f, e => e.message.includes(m), m);
thr(() => ctx.submitPool({ ...base, courses: [{ ...c1, target: [] }] }), '1번째 가능 연수');
thr(() => ctx.submitPool({ ...base, courses: [{ ...c1, target: ['교사'] }] }), '1번째 가능 연수');
thr(() => ctx.submitPool({ ...base, courses: [{ ...c1, target: ['기타'] }] }), '1번째 가능 연수');
const id = ctx.submitPool({ ...base, target: ['초등 교사', '학부모', '기타: 예비교사'], courses: [c1, { ...c1, title: '둘', target: ['기타: 예비교사'] }] });
const C = sheets['가능 연수'].rows; assert.strictEqual(C[0][10], '강의 대상');
assert.deepStrictEqual(C.slice(1).map(r => r[10]), ['초등 교사, 학부모', '기타: 예비교사']);
const T = sheets['강사'].rows; assert.strictEqual(T[1][T[0].indexOf('강의 가능 대상')], '초등 교사, 학부모, 기타: 예비교사');
const vr = JSON.parse(JSON.stringify(ctx.googleLogin_(google('A@b.co'))));
assert.strictEqual(vr.email, 'a@b.co', '구글 이메일은 소문자로 맞춤');
thr(() => ctx.googleLogin_(google('a@b.co', { aud: 'other.apps.googleusercontent.com' })), '확인할 수 없습니다');
thr(() => ctx.googleLogin_(google('a@b.co', { email_verified: 'false' })), '확인할 수 없습니다');
thr(() => ctx.googleLogin_(google('a@b.co', { iss: 'https://evil.example' })), '확인할 수 없습니다');
thr(() => ctx.googleLogin_(google('a@b.co', { exp: String(Math.floor(Date.now() / 1000) - 5) })), '확인할 수 없습니다');
thr(() => ctx.googleLogin_('not-a-token'), '확인하지 못했습니다');
thr(() => ctx.googleLogin_('a.b.' + 'y'.repeat(150)), '올바르지 않습니다');
thr(() => ctx.googleLogin_(google('nobody@b.co')), '제출한 내용이 없습니다');
assert.strictEqual(JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'code', email: 'a@b.co' }) } })).ok, false, '이메일 코드 방식은 없어졌음(저장 요청으로 처리되지 않음)');
assert.deepStrictEqual(vr.data.courses.map(c => c.target), [['초등 교사', '학부모'], ['기타: 예비교사']]);
// 화면: 강의 정보 칸에서 대상이 빠지고 연수 칸에 들어감, 화면 항목 = 서버 항목(target은 연수에서 모아 보냄)
const js = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>', html.indexOf('<script>')));
new vm.Script(js);
const pg = vm.runInNewContext("var U='';var CATS=[];" + js.slice(js.indexOf('var SECS='), js.indexOf(';var cid=')) + ';[SECS,CF]');

// 핵심 도구는 칩(배열)으로 받아 한 칸에 저장, 공개 항목은 고른 것만 공개 데이터에 포함
const id2 = ctx.submitPool({ ...base, email: 'open@x.co', p1n: '우리반 앱', p1l: 'https://app.example', p2n: '자료집', book: '책 제목', award: '상 이름', career: '자문 위원', history: '연수 이력', open: ['대표 프로그램', '대표 저서', '수상'], courses: [{ ...c1, tool: ['캔바', '챗GPT'] }] });
const lastCourse = sheets['가능 연수'].rows.at(-1); assert.strictEqual(lastCourse[5], '캔바, 챗GPT');
const pub = JSON.parse(JSON.stringify(ctx.listPool_())), me = pub.find(t => t.name === '김하늘' && t.book);
assert.deepStrictEqual(me.programs, [{ name: '우리반 앱', link: 'https://app.example' }, { name: '자료집', link: '' }], '대표 프로그램: 링크 없는 것은 이름만');
assert.strictEqual(me.book, '책 제목'); assert.strictEqual(me.award, '상 이름');
assert(!('career' in me) && !('history' in me) && !('sns' in me), '고르지 않은 정보는 공개하지 않음');
assert(!JSON.stringify(pub).includes('open@x.co') && !JSON.stringify(pub).includes('01012345678'), '연락처 비공개');
const other = pub.find(t => !t.book); assert.deepStrictEqual(Object.keys(other).sort(), ['courses', 'intro', 'name', 'office', 'school'], '공개 항목을 고르지 않으면 기본 정보만');
const vr2 = JSON.parse(JSON.stringify(ctx.googleLogin_(google('open@x.co'))));
assert.deepStrictEqual(vr2.data.open, ['대표 프로그램', '대표 저서', '수상'], '수정할 때 공개 항목을 다시 불러옴');
assert.strictEqual(vr2.data.courses[0].tool, '캔바, 챗GPT');

// 화면: 연수명 맨 위, 도구는 칩, 글자 수 제한, 공개 항목 칸, 임시 저장·미리보기
assert.strictEqual(pg[1][0][0], 'title', '가능 연수에서 연수명이 맨 위');
assert.strictEqual(pg[1].find(f => f[0] === 'tool')[2], 'tools');
const fld = (k) => pg[0].flatMap(s => s[4]).find(f => f[0] === k);
assert.strictEqual(fld('intro')[8], 200); assert.strictEqual(fld('line')[8], 30); assert.strictEqual(pg[1][0][8], 40);
assert.deepStrictEqual([...fld('open')[5]], ['대표 프로그램', '대표 저서', '연수 이력', 'SNS', '커뮤니티', '수상', '이력']);
for (const s of ['function saveDraft(', 'function preview(', 'function addTool(', '<script src="tools.js">']) assert(html.includes(s), s);
const tools = require(path.join(root, 'tools.js'));
assert.deepStrictEqual(tools.splitTools('클로드, GPT(코덱스)'), ['클로드', '챗GPT', '코덱스']);
const map = fs.readFileSync(path.join(root, 'map.html'), 'utf8');
assert(map.includes('<script src="tools.js">') && map.includes('function hit(t)') && map.includes("['대표 저서',t.book]"));
new vm.Script(map.slice(map.lastIndexOf('<script>') + 8, map.lastIndexOf('</script>')));
console.log('강사풀 등록·공개 항목·도구 통일·임시 저장·미리보기 검사 통과');
