// Read-only isolated Sites Worker. `page` and `script` are embedded by the build.
const apiOrigin = 'https://api.elections.kalshi.com';
const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};

export default {
 async fetch(request) {
  const url = new URL(request.url);
  if(request.method !== 'GET')return new Response('Method not allowed',{status:405});
  if(url.pathname==='/' || url.pathname==='/kalshi-prototype.html')return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  if(url.pathname==='/kalshi-prototype.js')return new Response(script,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'}});
  if(url.pathname!=='/api/kalshi/markets')return new Response('Not found',{status:404});

  const series=url.searchParams.get('series_ticker');
  const status=url.searchParams.get('status');
  const limit=Number(url.searchParams.get('limit'));
  const cursor=url.searchParams.get('cursor');
  const allowed=['series_ticker','status','limit','cursor'];
  if([...url.searchParams.keys()].some(k=>!allowed.includes(k)) || series!=='KXPGAROUNDSCORE' || status!=='open' || !Number.isInteger(limit)||limit<1||limit>200 || (cursor!==null&&!/^[a-zA-Z0-9+/_=-]{1,512}$/.test(cursor)))
   return new Response(JSON.stringify({error:'Invalid public-market query'}),{status:400,headers});

  const upstream=new URL('/trade-api/v2/markets',apiOrigin);
  upstream.searchParams.set('series_ticker',series);
  upstream.searchParams.set('status',status);
  upstream.searchParams.set('limit',String(limit));
  if(cursor)upstream.searchParams.set('cursor',cursor);
  try{
   const response=await fetch(upstream,{headers:{accept:'application/json'},redirect:'error'});
   if(!response.ok)return new Response(JSON.stringify({error:'Kalshi HTTP '+response.status}),{status:502,headers});
   const raw=await response.text();
   if(raw.length>3_000_000)throw Error('Kalshi response exceeds size limit');
   const data=JSON.parse(raw);
   if(!Array.isArray(data.markets)||typeof data.cursor!=='string')throw Error('Unexpected Kalshi response');
   return new Response(JSON.stringify({markets:data.markets,cursor:data.cursor}),{status:200,headers});
  }catch(error){return new Response(JSON.stringify({error:'Kalshi retrieval failed: '+error.message}),{status:502,headers});}
 }
};
