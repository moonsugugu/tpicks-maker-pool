// 콘텐츠 제작은 연수 제작과 도서 출판을 합산한다. 예전 협업 총횟수는 점수로 환산하지 않는다.
var CollabScore = (function () {
  function count(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
    var n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  function summary(person) {
    var c = person.collaboration || {};
    var production = count(c.production), publication = count(c.publication), remote = count(c.remote), onsite = count(c.onsite);
    var content = production === null || publication === null ? null : production + publication;
    var score = content === null || remote === null || onsite === null ? null : content * 100 + remote * 10 + onsite * 10;
    if (score !== null && !Number.isSafeInteger(score)) score = null;
    return {production: production, publication: publication, content: content, remote: remote, onsite: onsite, score: score};
  }
  function rank(people) {
    var rows = people.map(function (person) { return {person: person, stats: summary(person), rank: null}; });
    rows.sort(function (a, b) {
      var x = a.stats.score, y = b.stats.score;
      if (x === null && y !== null) return 1;
      if (y === null && x !== null) return -1;
      return (y || 0) - (x || 0) || a.person.name.localeCompare(b.person.name, 'ko');
    });
    var previous = null, place = 0;
    rows.forEach(function (row, i) {
      if (row.stats.score > 0) {
        if (row.stats.score !== previous) place = i + 1;
        row.rank = place;
        previous = row.stats.score;
      }
    });
    return rows;
  }
  return {summary: summary, rank: rank};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CollabScore;
