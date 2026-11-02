// 교육청 목록(edu.js)과 지도 경계(map-geo.js)를 만든다.
// 실행: node tools/build-geo.js   (저장소 루트에서, 인터넷 필요)
// 교육지원청이 바뀌면 아래 EDU만 고치고 다시 실행한다.
// 경계 출처: southkorea/southkorea-maps (통계청 2013, 단순화본)
const fs = require('fs'), path = require('path');
const SRC = 'https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2013/json/';

// [짧은 이름, 시도교육청, 지도 이름, 시군구 코드 앞 2자리, 점 위치(경도, 위도), 교육지원청...]
// 교육지원청 '구리·남양주' → 이름은 '구리남양주', 위치와 글자 찾기는 '구리', '남양주'
// 광역시의 방위 이름(동부 등)은 점 위치를 잡을 시군구 이름을 { } 안에 적는다
const EDU = [
  ['서울', '서울특별시교육청', '서울특별시', '11', 126.99, 37.56, '동부{동대문구 중랑구}', '서부{은평구 서대문구 마포구}', '남부{영등포구 구로구 금천구}', '북부{노원구 도봉구}', '중부{종로구 중구 용산구}', '강동·송파', '강서·양천', '강남·서초', '동작·관악', '성동·광진', '성북·강북'],
  ['부산', '부산광역시교육청', '부산광역시', '21', 129.05, 35.17, '서부{중구 서구 영도구 사하구}', '남부{동구 부산진구 남구 수영구}', '북부{북구 강서구 사상구}', '동래{동래구 연제구 금정구}', '해운대{해운대구 기장군}'],
  ['대구', '대구광역시교육청', '대구광역시', '22', 128.58, 35.85, '동부{중구 동구 수성구}', '서부{서구 북구}', '남부{남구 달서구}', '달성{달성군}', '군위{37:군위군}'],
  ['인천', '인천광역시교육청', '인천광역시', '23', 126.6, 37.47, '남부{중구 동구 남구}', '북부{부평구 계양구}', '동부{남동구 연수구}', '서부{서구}', '강화{강화군}'],
  ['광주', '광주광역시교육청', '광주광역시', '24', 126.85, 35.15, '동부{동구 북구}', '서부{서구 남구 광산구}'],
  ['대전', '대전광역시교육청', '대전광역시', '25', 127.39, 36.33, '동부{동구 중구 대덕구}', '서부{서구 유성구}'],
  ['울산', '울산광역시교육청', '울산광역시', '26', 129.26, 35.55, '강남{남구 울주군}', '강북{중구 동구 북구}'],
  ['세종', '세종특별자치시교육청', '세종특별자치시', '29', 127.27, 36.57],
  ['경기', '경기도교육청', '경기도', '31', 127.32, 37.3, '수원', '성남', '의정부', '안양·과천', '부천', '광명', '동두천·양주', '고양', '구리·남양주', '군포·의왕', '안산', '화성·오산', '시흥', '광주·하남', '용인', '파주', '이천', '안성', '김포', '평택', '양평', '여주', '연천', '가평', '포천'],
  ['강원', '강원특별자치도교육청', '강원도', '32', 128.3, 37.72, '춘천', '원주', '강릉', '동해', '태백', '속초·양양', '삼척', '홍천', '횡성', '영월', '평창', '정선', '철원', '화천', '양구', '인제', '고성'],
  ['충북', '충청북도교육청', '충청북도', '33', 127.75, 36.8, '청주{청주시 청원군}', '충주', '제천', '보은', '옥천', '영동', '진천', '괴산·증평', '음성', '단양'],
  ['충남', '충청남도교육청', '충청남도', '34', 126.85, 36.47, '천안', '공주', '보령', '아산', '서산', '논산·계룡', '당진', '금산', '부여', '서천', '청양', '홍성', '예산', '태안'],
  ['전북', '전북특별자치도교육청', '전라북도', '35', 127.12, 35.72, '전주', '군산', '익산', '정읍', '남원', '김제', '완주', '진안', '무주', '장수', '임실', '순창', '고창', '부안'],
  ['전남', '전라남도교육청', '전라남도', '36', 126.9, 34.86, '목포', '여수', '순천', '나주', '광양', '담양', '곡성', '구례', '고흥', '보성', '화순', '장흥', '강진', '해남', '영암', '무안', '함평', '영광', '장성', '완도', '진도', '신안'],
  ['경북', '경상북도교육청', '경상북도', '37', 128.75, 36.38, '포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주', '문경', '경산', '의성', '청송', '영양', '영덕', '청도', '고령', '성주', '칠곡', '예천', '봉화', '울진', '울릉'],
  ['경남', '경상남도교육청', '경상남도', '38', 128.25, 35.3, '창원', '진주', '통영', '사천', '김해', '밀양', '거제', '양산', '의령', '함안', '창녕', '고성', '남해', '하동', '산청', '함양', '거창', '합천'],
  ['제주', '제주특별자치도교육청', '제주특별자치도', '39', 126.55, 33.38, '제주시', '서귀포시'],
];

const K = 100, C = Math.cos(36 * Math.PI / 180), X0 = 124.55, Y0 = 38.62;
const P = ([lon, lat]) => [+((lon - X0) * K * C).toFixed(1), +((Y0 - lat) * K).toFixed(1)];
const ring = r => r.map(P).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
const area = r => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const polys = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => ring(p[0]));
const toD = rs => rs.filter(r => r.length > 3 && Math.abs(area(r)) >= 0.5).map(r => 'M' + r.map(p => p.join(' ')).join('L') + 'Z').join('');
// 면적 가중 무게중심(가장 큰 덩어리 기준) — 섬 때문에 점이 바다로 가지 않게
function centroid(rss) {
  let A = 0, X = 0, Y = 0;
  for (const rs of rss) {
    const r = rs.reduce((m, x) => Math.abs(area(x)) > Math.abs(area(m)) ? x : m);
    const a = area(r); let cx = 0, cy = 0;
    r.forEach((p, i) => { const q = r[(i + 1) % r.length], c = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; });
    A += Math.abs(a); X += Math.abs(a) * cx / (6 * a); Y += Math.abs(a) * cy / (6 * a);
  }
  return [+(X / A).toFixed(1), +(Y / A).toFixed(1)];
}

(async () => {
  const get = async n => (await fetch(SRC + n)).json();
  const prov = await get('skorea_provinces_geo_simple.json'), muni = await get('skorea_municipalities_geo_simple.json');
  const PROV = {}, MUNI = {}, edu = [];
  for (const [k, office, mapName, code, lon, lat, ...subs] of EDU) {
    const pf = prov.features.find(f => f.properties.name === mapName);
    if (!pf) throw new Error('시도 경계 없음: ' + mapName);
    PROV[k] = toD(polys(pf));
    const ms = muni.features.filter(f => f.properties.code.startsWith(code));
    MUNI[k] = ms.map(f => toD(polys(f))).join('');
    const out = subs.map(s => {
      const m = s.match(/^([^{]+)(?:\{(.+)\})?$/), name = m[1].replace(/·/g, ''), find = m[1].split('·');
      const parts = m[2] ? m[2].split(' ') : find;
      const hit = parts.map(t => {
        const [cc, nm] = t.includes(':') ? t.split(':') : [code, t];
        const fs_ = muni.features.filter(f => f.properties.code.startsWith(cc) && f.properties.name.startsWith(nm));
        if (!fs_.length) throw new Error(`시군구 없음: ${k} ${s} → ${t}`);
        return fs_;
      }).flat();
      return [name, ...centroid(hit.map(polys)), find];
    });
    edu.push({ k, office, x: P([lon, lat])[0], y: P([lon, lat])[1], subs: out });
  }
  const root = path.join(__dirname, '..');
  fs.writeFileSync(path.join(root, 'edu.js'),
    '// tools/build-geo.js 로 만든 파일입니다. 직접 고치지 말고 스크립트를 고친 뒤 다시 만드세요.\n' +
    '// EDU: [짧은 이름, 시도교육청, 점 x, 점 y, [[교육지원청 이름, 점 x, 점 y, [글자 찾기용 이름...]], ...]]\n' +
    'var EDU=' + JSON.stringify(edu.map(e => [e.k, e.office, e.x, e.y, e.subs])) + ';\n');
  fs.writeFileSync(path.join(root, 'map-geo.js'),
    '// tools/build-geo.js 로 만든 파일입니다. 시도(PROV)와 시군구(MUNI) 경계 SVG path\n' +
    'var PROV=' + JSON.stringify(PROV) + ';\nvar MUNI=' + JSON.stringify(MUNI) + ';\n');
  console.log('edu.js', edu.reduce((n, e) => n + e.subs.length, 0), '개 교육지원청 / map-geo.js', fs.statSync(path.join(root, 'map-geo.js')).size, 'bytes');
})().catch(e => { console.error(e.message); process.exit(1); });
