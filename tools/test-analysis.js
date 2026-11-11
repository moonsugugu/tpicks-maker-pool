const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'analysis.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const runtime = scripts.find(s => s.includes('const DATA = JSON.parse('));
const embedded = text => text.match(/<script\b[^>]*id="tpx-data"[^>]*>([\s\S]*?)<\/script>/)[1];
// 변경 전 자료의 보호 대상 필드 해시로 다른 기관·도구·시간·분류의 유실을 검사한다.
// 내부 원제목은 검사 파일에 복사하지 않는다.
{
  const now = JSON.parse(embedded(html));
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/analysis-data-integrity.json'), 'utf8'));
  const publicTitles = JSON.parse(fs.readFileSync(path.join(root, 'data/research-public-titles.json'), 'utf8'));
  const official = JSON.parse(fs.readFileSync(path.join(root, 'data/education-courses-2026-11-11.json'), 'utf8'));
  const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const protectedFields = r => {
    const c = {...r};
    if (c.source === '연구회연수') {
      delete c.title;
      delete c.reason;
      for (const k of ['date', 'run_start', 'run_end']) if (c[k]) c[k] = `${String(c[k]).match(/\d{4}/)[0]}년`;
    }
    return c;
  };
  assert(!html.includes('docs.google.com'), '연구회연수 시트 주소가 페이지에 없음');
  for (const key of ['courses', 'curriculum']) {
    const original = now[key].filter(r => r.source !== '교총사제동행');
    assert.equal(hash(original.map(protectedFields)), baseline[key], `${key}: 기존 자료의 보호 대상 필드 보존`);
    now[key].forEach((r, i) => assert.equal(r.no, i + 1, `${key}: 행 인용 번호 유지`));
  }
  assert.deepEqual(now.orgs.map(o => o.source), ['교총사제동행', '티처빌', '비상 비바샘', '아이스크림', '지식샘터', '연구회연수']);
  for (const o of baseline.orgs) assert.deepEqual(now.orgs.find(r => r.source === o.source), o, '다른 기관 운영 일정 보존');
  const research = now.courses.filter(r => r.source === '연구회연수');
  assert.equal(research.length, 241);
  assert.equal(Object.keys(publicTitles).length, 241);
  for (const r of research) {
    assert.equal(r.title, publicTitles[r.id]);
    assert.notEqual(hash(r.title), baseline.researchOriginalTitleHashes[r.id], `${r.id}: 원제목을 공개용 제목으로 변경`);
    assert.equal(r.link, null);
    for (const k of ['date', 'run_start', 'run_end']) assert(!r[k] || /^\d{4}년$/.test(r[k]), `${r.id}: 날짜는 연도만 공개`);
  }
  for (const r of now.curriculum.filter(r => r.source === '연구회연수')) {
    for (const id of r.ref.trim().split(/\s+/)) assert.equal(r.title, publicTitles[id], '추천 커리큘럼에도 공개용 제목 사용');
    assert.equal(r.link, null);
  }
  const org = now.orgs.find(r => r.source === '연구회연수');
  assert.equal(org.precision, 'year');
  assert.match(org.start, /^\d{4}$/);
  assert.match(org.end, /^\d{4}$/);
  for (const r of now.courses.filter(r => r.source === '지식샘터')) for (const k of ['date', 'run_start', 'run_end']) assert(!r[k] || /^\d{4}년 \d{1,2}월$/.test(r[k]), '지식샘터 날짜 정밀도 보존');
  assert.equal(official.courses.length, 33);
  assert.equal(new Set(official.courses.map(r => r.key)).size, 33);
  const added = now.courses.filter(r => r.source === '교총사제동행');
  assert.equal(added.length, 33);
  for (const c of official.courses) {
    assert.equal(c.url, `https://www.education.or.kr/studyjob/course_view.asp?classKey=${c.key}`);
    const r = added.find(r => r.id === `K${c.key}`);
    assert(r, `교총 과정 ${c.key} 존재`);
    assert.equal(r.title, c.title);
    assert.equal(r.hours, c.hours);
    if (c.lessonCount) assert.equal(c.hours, `${c.lessonCount}차시 (${c.credit})`);
    else assert.equal(c.hours, `${c.credit} (차시 미확인)`);
    assert.equal(r.link, c.url);
    assert.equal(r.level, '미표기', '편집 추천 단계와 공식 난이도를 구분');
    assert(c.sessions.length > 0);
    for (const s of c.sessions) {
      assert.match(s.start, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(s.end, /^\d{4}-\d{2}-\d{2}$/);
      assert(s.start <= s.end);
    }
    assert.equal(r.run_start, c.sessions.map(s => s.start).sort()[0]);
    assert.equal(r.run_end, c.sessions.map(s => s.end).sort().at(-1));
    assert.equal(r.runs, c.sessions.length);
    const curriculum = now.curriculum.filter(r => r.source === '교총사제동행' && r.ref === `K${c.key}`);
    assert.equal(curriculum.length, 1);
    assert.equal(curriculum[0].title, c.title);
  }
  assert.equal(now.orgs.find(r => r.source === '교총사제동행').count, 33);
}
const originalData = JSON.parse(embedded(html));
assert.equal(originalData.courses.length, 2237);
assert.equal(originalData.curriculum.length, 2228);
for (const script of scripts) if (script.trim() && script !== embedded(html)) new vm.Script(script);

// 운영 기간 탭에서도 상단 버블·출처 선택은 계속 사용할 수 있어야 한다.
{
  const panels = ['cats', 'curri', 'orgs'].map(id => ({id, hidden: id !== 'cats'}));
  const tabs = panels.map(p => ({dataset: {tab: p.id}, setAttribute(name, value) {this[name] = value;}}));
  const filter = {hidden: false};
  const showTab = html.match(/const showTab = \(id\) => \{[\s\S]*?\n};/)[0];
  vm.runInNewContext(`${showTab}\nshowTab('orgs');`, {
    document: {querySelectorAll: s => s === '.sm-sec' ? panels : s === '.sm-tab' ? tabs : s === '.sm-filter' ? [filter] : []}
  });
  assert.equal(filter.hidden, false, '운영 기간 탭에서 상단 출처 버튼 갱신을 막지 않음');
  assert.deepEqual(panels.map(p => p.hidden), [true, true, false]);
}

let mutation;
let mapDraws = 0;
let timelineDraws = 0;
const element = () => ({isConnected: true, closest: () => null, getBoundingClientRect: () => ({width: 1000})});
const map = element(), timeline = element();
const context = vm.createContext({
  window: {},
  document: {
    getElementById: id => id === 'tpx-data' ? {textContent: embedded(html)} : {},
    querySelectorAll: selector => selector === '[data-draw="map"]' ? [map] : selector === '[data-draw="timeline"]' ? [timeline] : []
  },
  ResizeObserver: class { observe() {} },
  MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} },
  console
});
vm.runInContext(runtime, context);
const dash = context.window.dash;
dash.draw('map', {mount: () => ({}), update: () => mapDraws++});
dash.draw('timeline', () => timelineDraws++);
dash._boot();
assert.equal(mapDraws, 1);
assert.equal(timelineDraws, 1);

// 말풍선과 결과 안내를 반복해서 표시해도 차트가 다시 그려지면 안 된다.
for (let i = 0; i < 20; i++) {
  mutation([{oldValue: i % 2 ? null : '', target: {matches: () => false, hasAttribute: () => i % 2 === 0}}]);
}
assert.equal(mapDraws, 1, '말풍선 표시와 숨김이 지도 라벨을 재시작하지 않음');
assert.equal(timelineDraws, 1, '말풍선 때문에 다른 탭까지 재생성하지 않음');

mutation([{oldValue: '', target: {matches: selector => selector === '.sm-sec', hasAttribute: () => false}}]);
assert.equal(mapDraws, 2, '숨겨진 탭을 열면 필요한 차트는 다시 그림');
mutation([{oldValue: null, target: {matches: selector => selector === '.sm-sec', hasAttribute: () => false}}]);
assert.equal(mapDraws, 2, '같은 숨김 상태를 다시 설정할 때는 재생성하지 않음');
dash.setParams({q: '캔바'});
assert.equal(mapDraws, 3, '검색 조건 변경은 지도를 갱신함');
console.log('분석 페이지 문법·기존 데이터 보존·교총 33개·출처 순서·연구회 241개 공개 제목과 연도·말풍선·탭·검색 검증 통과');
