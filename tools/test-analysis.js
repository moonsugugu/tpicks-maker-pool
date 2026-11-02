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
assert.equal(embedded(html), embedded(before), '연수 원본 데이터는 바뀌지 않음');
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
