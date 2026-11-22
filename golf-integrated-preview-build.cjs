// Build the full-board test worker entirely from existing feature-branch files.
const fs=require('node:fs'),path=require('node:path');
const root=__dirname,source=fs.existsSync(path.join(root,'source'))?path.join(root,'source'):root;
const names=['index.html','kalshi-prototype.html','kalshi-prototype.js','weather.html','history-tables.html','golf-auth.js'];
const assets=names.map(name=>{
 let content=fs.readFileSync(path.join(source,name),'utf8');
 // Test-host-only: Sites owner-only access is the outer gate. Supabase cloud-sync
 // code is unchanged, but the production Pages-specific magic-link redirect
 // cannot function on a new preview origin without an auth config change.
 if(name==='index.html')content=content.replace('<script src="golf-auth.js" defer></script>','<!-- Auth gate provided by owner-only Sites test deployment; production auth file remains unchanged. -->');
 return ['/'.concat(name),content];
});
const worker=fs.readFileSync(path.join(root,'golf-integrated-preview-worker.mjs'),'utf8');
const output=path.join(root,'dist/server');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'index.js'),`const files=new Map(${JSON.stringify(assets)});\n${worker}`);
fs.mkdirSync(path.join(root,'dist/.openai'),{recursive:true});
fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
console.log('Built isolated full Golf Board preview');
