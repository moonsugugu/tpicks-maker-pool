const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const score = require('../collab-score.js');
const person = (name, production, remote, onsite, publication = 0) => ({name, collaboration: {production, publication, remote, onsite}});

assert.equal(score.summary(person('제작', 2, 5, 3)).score, 280);
assert.equal(score.summary(person('연수와 도서', 2, 5, 3, 1)).score, 380);
assert.equal(score.summary(person('연수와 도서', 2, 5, 3, 1)).content, 3);
assert.equal(score.summary(person('미확인 도서', 2, 5, 3, null)).score, null);
assert.equal(score.summary(person('실적 없음', 0, 0, 0)).score, 0);
for (const value of ['', null, undefined, -1, 1.5, '2회', true, NaN, Infinity]) {
  assert.equal(score.summary(person('미확인', value, 0, 0)).score, null);
}
assert.equal(score.summary({collab: 30}).score, null, '기존 총횟수에서 유형별 점수를 추정하지 않음');
assert.equal(score.summary(person('문자 숫자', '2', '5', '3')).score, 280);
const ranked = score.rank([person('미확인', null, 0, 0), person('무실적', 0, 0, 0), person('다', 1, 0, 0), person('나', 2, 5, 3), person('가', 2, 0, 8)]);
assert.deepEqual(ranked.map(r => [r.person.name, r.stats.score, r.rank]), [['가', 280, 1], ['나', 280, 1], ['다', 100, 3], ['무실적', 0, null], ['미확인', null, null]]);

class Sheet {
  constructor(values) { this.values = values.map(row => row.slice()); this.formulas = new Map(); }
  getLastRow() { return this.values.length; }
  getLastColumn() { return Math.max(0, ...this.values.map(row => row.length)); }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  setFrozenRows() {}
  getRange(row, col, nr = 1, nc = 1) {
    const sheet = this;
    return {
      getValues() { return Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => sheet.values[row - 1 + i]?.[col - 1 + j] ?? '')); },
      getDisplayValues() { return this.getValues().map(r => r.map(String)); },
      setValues(values) { values.forEach((r, i) => { sheet.values[row - 1 + i] ||= []; r.forEach((v, j) => sheet.values[row - 1 + i][col - 1 + j] = v); }); return this; },
      setFormulasR1C1(values) { values.forEach((r, i) => r.forEach((v, j) => sheet.formulas.set((row + i) + ':' + (col + j), v))); return this; },
      setFontWeight() { return this; }, setBackground() { return this; }, setNumberFormat() { return this; }, setNote() { return this; }, setDataValidation() { return this; }, getA1Notation() { let n = col, s = ""; while (n) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s + row; }
    };
  }
}
const data = {
  '강사': new Sheet([
    ['응답 ID', '성함', '이메일', '전화번호', '소속 교육청', '근무지', '자기소개 (2문장)'],
    ['a1', '가', 'A@example.com', '010-0000-0000', '경기도교육청', '가학교', '소개'],
    ['a2', '가', 'a@example.com', '010-0000-0000', '경기도교육청', '새학교', '새 소개'],
    ['b1', '나', 'b@example.com', '010-0000-0000', '서울교육청', '나학교', '소개'],
    ['c1', '다', 'c@example.com', '010-0000-0000', '', '', '소개']
  ]),
  '가능 연수': new Sheet([['응답 ID', '대분류', '핵심 도구', '연수명(가제)'], ['a2', '디자인', '캔바', '새 과정']]),
  '협업 횟수': new Sheet([['이메일', '성함', '협업 횟수', '메모'], ['a@example.com', '가', 7, '기존 메모'], ['b@example.com', '나', 0, '보관']])
};
const validation = {};
for (const k of ['requireFormulaSatisfied', 'setAllowInvalid', 'setHelpText', 'build']) validation[k] = () => validation;
let locked = 0;
const context = vm.createContext({
  SpreadsheetApp: {openById: () => ({getSheetByName: name => data[name], insertSheet: name => data[name] = new Sheet([])}), newDataValidation: () => validation, flush() {}},
  LockService: {getScriptLock: () => ({waitLock() { locked++; }, releaseLock() { locked--; }})},
  Logger: {log() {}}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), context);
vm.runInContext('setupCollab()', context);
assert.equal(locked, 0);
const activity = data['협업 횟수'];
assert.deepEqual(activity.values[0], ['이메일', '성함', '협업 횟수', '메모', '연수 제작', '도서 출판', '원격 강의', '대면 강의', '협업 점수']);
assert.deepEqual(activity.values[1].slice(0, 8), ['a@example.com', '가', 7, '기존 메모', '', '', '', '']);
assert.deepEqual(activity.values[2].slice(0, 8), ['b@example.com', '나', 0, '보관', 0, 0, 0, 0]);
assert.equal(activity.values.length, 4, '중복 응답은 한 강사로 관리');
activity.values[1][4] = 2;
activity.values[1][5] = 1;
activity.values[1][6] = 5;
activity.values[1][7] = 3;
const before = JSON.stringify(activity.values);
vm.runInContext('setupCollab()', context);
assert.equal(JSON.stringify(activity.values), before, '재실행해도 입력 실적과 기존 메모 보존');
const publicRows = JSON.parse(vm.runInContext('JSON.stringify(listPool_())', context));
assert.equal(publicRows.length, 3);
assert.equal(publicRows[0].school, '새학교');
assert.equal(publicRows[0].courses[0].title, '새 과정');
assert.equal(publicRows[0].collaboration.score, 380);
assert.equal(score.summary(publicRows[0]).score, 380, '시트 조회와 화면 배점 일치');
assert.equal(publicRows[1].collaboration.score, 0);
for (const row of publicRows) {
  assert.deepEqual(Object.keys(row).sort(), ['collab', 'collaboration', 'courses', 'intro', 'name', 'office', 'school']);
}
assert.equal(JSON.stringify(activity.values), before, '공개 조회는 시트를 수정하지 않음');
assert.ok(!JSON.stringify(publicRows).includes('@example.com'));
assert.ok(!JSON.stringify(publicRows).includes('010-0000-0000'));
// 이미 세 유형이 설정된 시트에도 도서 열을 추가하고 기존 실적을 보존한다.
data['협업 횟수'] = new Sheet([
  ['이메일', '성함', '협업 횟수', '메모', '연수 제작', '원격 강의', '대면 강의', '협업 점수'],
  ['a@example.com', '가', 0, '기존 메모', 2, 5, 3, 280],
  ['b@example.com', '나', 0, '', 0, 0, 0, 0]
]);
vm.runInContext('setupCollab()', context);
assert.equal(data['협업 횟수'].values[0][8], '도서 출판');
assert.deepEqual(data['협업 횟수'].values[1].slice(3, 7), ['기존 메모', 2, 5, 3]);
assert.equal(data['협업 횟수'].values[1][8], 0);
data['협업 횟수'].values[1][8] = 1;
assert.equal(JSON.parse(vm.runInContext('JSON.stringify(listPool_())', context))[0].collaboration.score, 380);
console.log('협업 점수 계산·공동 순위·기존 시트 이관·재실행·공개 필드 검증 통과');
