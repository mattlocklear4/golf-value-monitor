export default async (request) => {
 const u=new URL(request.url),tour=u.searchParams.get('tour')||'pga';
 if(!['pga','euro','kft','alt'].includes(tour))return new Response('Invalid tour',{status:400});
 const key=Netlify.env.get('DATAGOLF_API_KEY');
 if(!key)return new Response('Missing DATAGOLF_API_KEY',{status:503});
 const target=new URL('https://feeds.datagolf.com/historical-raw-data/event-list');
 target.searchParams.set('tour',tour==='alt'?'liv':tour);
 target.searchParams.set('file_format','json');
 target.searchParams.set('key',key);
 try{
  const r=await fetch(target),body=await r.text();
  return new Response(body,{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'private, max-age=86400'}});
 }catch(e){return new Response('Historical event list unavailable',{status:502})}
};
