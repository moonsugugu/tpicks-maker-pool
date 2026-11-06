// 핵심 도구 이름 통일 목록. 등록 페이지(index.html)와 강사풀 지도(map.html)가 함께 씁니다.
// [표시 이름, 같은 도구로 볼 다른 이름...] — 새 도구는 여기에 한 줄 추가하면 됩니다.
var TOOLS = [
  ['챗GPT', 'ChatGPT', 'GPT', 'GPTs', '지피티', '챗지피티', 'Chat GPT', 'OpenAI', '오픈AI'],
  ['코덱스', 'Codex', 'GPT 코덱스', 'OpenAI Codex'],
  ['제미나이', 'Gemini', '구글 제미나이', 'Google Gemini', 'Gem', '젬'],
  ['구글 AI 스튜디오', 'AI Studio', 'Google AI Studio', 'AI 스튜디오', '구글 AI Studio'],
  ['노트북LM', 'NotebookLM', 'Notebook LM', '노트북 엘엠'],
  ['클로드', 'Claude', '클로드 AI'],
  ['클로드 코드', 'Claude Code'],
  ['코파일럿', 'Copilot', 'MS Copilot', '마이크로소프트 코파일럿'],
  ['퍼플렉시티', 'Perplexity'],
  ['뤼튼', 'wrtn'],
  ['안티그래비티', 'Antigravity', '구글 안티그래비티'],
  ['커서', 'Cursor'],
  ['리플릿', 'Replit'],
  ['깃허브', 'GitHub', '깃헙'],
  ['버셀', 'Vercel'],
  ['캔바', 'Canva'],
  ['캔바 코드', 'Canva Code'],
  ['미리캔버스', 'MiriCanvas'],
  ['망고보드', 'Mangoboard'],
  ['감마', 'Gamma', '감마 앱'],
  ['수노', 'Suno', 'Suno AI'],
  ['미드저니', 'Midjourney'],
  ['제미나이 스토리북', 'Gemini Storybook', '스토리북'],
  ['투닝', 'Tooning'],
  ['캡컷', 'CapCut'],
  ['브루', 'Vrew'],
  ['키네마스터', 'KineMaster'],
  ['클로바노트', 'Clova Note'],
  ['클로바더빙', 'Clova Dubbing'],
  ['패들렛', 'Padlet'],
  ['띵커벨', 'ThinkerBell', '띵커벨 보드'],
  ['카훗', 'Kahoot'],
  ['멘티미터', 'Mentimeter'],
  ['슬라이도', 'Slido'],
  ['클래스카드', 'ClassCard'],
  ['클래스팅', 'Classting', '클래스팅 AI'],
  ['하이클래스', 'HiClass'],
  ['구글 클래스룸', 'Google Classroom', '클래스룸'],
  ['구글 시트', 'Google Sheets', '구글 스프레드시트', '스프레드시트', '시트'],
  ['구글 문서', 'Google Docs', '구글 독스'],
  ['구글 슬라이드', 'Google Slides'],
  ['구글 설문지', 'Google Forms', '구글 폼', '설문지'],
  ['구글 사이트', 'Google Sites', '구글 사이트 도구'],
  ['구글 드라이브', 'Google Drive'],
  ['구글 어스', 'Google Earth'],
  ['앱스 스크립트', 'Apps Script', 'App Script', 'Google Apps Script', 'Google App Script', '구글 App Script', '구글 Apps Script', '구글 앱스 스크립트', 'GAS'],
  ['엑셀', 'Excel', 'MS 엑셀'],
  ['파워포인트', 'PowerPoint', 'PPT', '피피티'],
  ['한글(한컴)', '한글', '한컴오피스', 'HWP'],
  ['노션', 'Notion'],
  ['피그마', 'Figma'],
  ['유튜브', 'YouTube'],
  ['줌', 'Zoom'],
  ['네이버 웨일', 'Whale', '웨일', '웨일 스페이스'],
  ['엔트리', 'Entry'],
  ['스크래치', 'Scratch'],
  ['파이썬', 'Python'],
  ['마이크로비트', 'micro:bit', 'Microbit'],
  ['아두이노', 'Arduino'],
  ['젭', 'ZEP'],
  ['마인크래프트 에듀케이션', 'Minecraft Education', '마인크래프트', '마크 에듀'],
  ['코스페이시스', 'CoSpaces', 'CoSpaces Edu'],
  ['티처블 머신', 'Teachable Machine'],
  ['오토드로우', 'AutoDraw'],
  ['북크리에이터', 'Book Creator'],
];
// 등록 화면에서 바로 누를 수 있는 자주 쓰는 도구
var TOOL_QUICK = ['챗GPT', '제미나이', '클로드', '노트북LM', '구글 AI 스튜디오', '캔바', '미리캔버스', '패들렛', '구글 시트', '앱스 스크립트', '감마', '엔트리'];
// 대소문자·띄어쓰기·가운뎃점을 무시하고 비교
function toolKey(s) { return String(s || '').toLowerCase().replace(/[\s·._:\-]/g, ''); }
var TOOL_ALIAS = (function () { var m = {}; TOOLS.forEach(function (t) { t.forEach(function (a) { m[toolKey(a)] = t[0]; }); }); return m; })();
// 'GPT' → '챗GPT'처럼 표시 이름으로. 목록에 없으면 적은 그대로
function normTool(s) { s = String(s || '').trim(); return TOOL_ALIAS[toolKey(s)] || s; }
// 자유롭게 쓴 글('GPT(코덱스), 캔바')도 도구 이름 목록으로 나눔
function splitTools(s) {
  var out = [];
  (Array.isArray(s) ? s : String(s || '').split(/[,/()+]|\s및\s/)).forEach(function (p) {
    var n = normTool(p);
    if (n && out.indexOf(n) < 0) out.push(n);
  });
  return out;
}
if (typeof module !== 'undefined') module.exports = { TOOLS: TOOLS, normTool: normTool, splitTools: splitTools, toolKey: toolKey };
