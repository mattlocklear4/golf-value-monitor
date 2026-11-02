export default async (request) => {
 const u=new URL(request.url), tour=u.searchParams.get('tour')||'pga', season=u.searchParams.get('season')||'2025';
 if(!['pga','euro','kft','alt'].includes(tour)||!/^20\d{2}$/.test(season)) return new Response('Invalid tour or season',{status:400});
 const key=Netlify.env.get('DATAGOLF_API_KEY'); if(!key)return new Response('Missing DATAGOLF_API_KEY',{status:503});
 const target=new URL('https://feeds.datagolf.com/get-schedule');
 Object.entries({tour,season,upcoming_only:'no',file_format:'json',key}).forEach(([k,v])=>target.searchParams.set(k,v));
 try {const r=await fetch(target);const body=await r.text();return new Response(body,{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'private, max-age=3600'}})}catch(e){return new Response('Upstream schedule unavailable',{status:502})}
};
