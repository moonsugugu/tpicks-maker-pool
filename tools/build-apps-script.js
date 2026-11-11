const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const output = process.argv[2];
if (!output) throw new Error('출력할 임시 파일의 절대 경로를 지정해 주세요.');
const content = ['Code.gs','Recruitment.gs'].map(name => fs.readFileSync(path.join(root,'apps-script',name),'utf8').trimEnd()).join('\n\n')+'\n';
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,content);
console.log('Apps Script 배포용 코드 결합: '+path.resolve(output));
