// Build a single Worker module from the feature branch's read-only prototype files.
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const from=fs.existsSync(path.join(root,'source'))?path.join(root,'source'):root;
const html=fs.readFileSync(path.join(from,'kalshi-prototype.html'),'utf8');
const js=fs.readFileSync(path.join(from,'kalshi-prototype.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'kalshi-preview-worker.mjs'),'utf8');
const output=path.join(root,'dist/server');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'index.js'),`const page=${JSON.stringify(html)};\nconst script=${JSON.stringify(js)};\n${worker}`);
fs.mkdirSync(path.join(root,'dist/.openai'),{recursive:true});
fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
console.log('Built isolated Kalshi preview Worker');
