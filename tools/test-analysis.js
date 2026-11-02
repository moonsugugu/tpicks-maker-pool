const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'analysis.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const runtime = scripts.find(s => s.includes('const DATA = JSON.parse('));
const embedded = text => text.match(/<script\b[^>]*id="tpx-data"[^>]*>([\s\S]*?)<\/script>/)[1];
const before = cp.execFileSync('git', ['show', 'HEAD:analysis.html'], {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
// 원본 데이터는 그대로 두되, 아래 정리만 허용: 연구회연수 시트 주소 삭제, 연구회연수·지식샘터 날짜는 「YYYY년 M월」
{
  const now = JSON.parse(embedded(html)), old = JSON.parse(embedded(before));
  assert(!html.includes('docs.google.com'), '연구회연수 시트 주소가 페이지에 없음');
  const MONTH = new Set(['연구회연수', '지식샘터']), ym = (v) => { const k = String(v || '').match(/^(\d{4})-(\d{2})/); return k ? `${k[1]}년 ${+k[2]}월` : v; };
  const clean = (r) => {
    const c = { ...r };
    if (c.source === '연구회연수') c.link = null;
    if (MONTH.has(c.source)) for (const k of ['date', 'run_start', 'run_end']) if (c[k]) c[k] = ym(c[k]);
    return c;
  };
  for (const key of ['courses', 'curriculum']) assert.deepEqual(now[key], old[key].map(clean), key + ': 허용한 정리 외에는 그대로');
  assert.deepEqual(now.orgs.map((o) => ({ ...o, basis: null })), old.orgs.map((o) => ({ ...o, basis: null })), 'orgs: 설명 문구 외에는 그대로');
  for (const r of now.courses) if (MONTH.has(r.source)) for (const k of ['date', 'run_start', 'run_end']) assert(!r[k] || /^\d{4}년 \d{1,2}월$/.test(r[k]), r.source + ' 날짜는 연·월까지만');
}
const originalData = JSON.parse(embedded(html));
assert.equal(originalData.courses.length, 2204);
for (const script of scripts) if (script.trim() && script !== embedded(html)) new vm.Script(script);

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
console.log('분석 페이지 문법·원본 데이터 보존·말풍선 재그리기 방지·탭·검색 갱신 검증 통과');
