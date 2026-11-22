// Isolated, read-only full-board Sites test Worker. `files` is injected by the build.
const kalshiOrigin='https://api.elections.kalshi.com';
const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
export default {
 async fetch(request){
  const url=new URL(request.url);
  if(request.method!=='GET')return new Response('Method not allowed',{status:405});
  const path=url.pathname==='/'?'/index.html':url.pathname;
  if(files.has(path)){
   const mime=path.endsWith('.js')?'text/javascript':path.endsWith('.html')?'text/html':'text/plain';
   return new Response(files.get(path),{headers:{'content-type':mime+'; charset=utf-8','cache-control':'no-store'}});
  }
  // Public orderbook proxy: a fixed series only, one strictly validated ticker.
  // No credentials, private endpoints, trading methods, or arbitrary upstream URLs.
  if(path.startsWith('/api/kalshi/orderbook/')){
   const ticker=path.slice('/api/kalshi/orderbook/'.length);
   if(url.search||!/^[A-Z0-9-]{12,140}$/.test(ticker)||!ticker.startsWith('KXPGAROUNDSCORE-'))return new Response(JSON.stringify({error:'Invalid public market ticker'}),{status:400,headers:jsonHeaders});
   try{
    const upstream=new URL('/trade-api/v2/markets/'+encodeURIComponent(ticker)+'/orderbook',kalshiOrigin);
    const response=await fetch(upstream,{headers:{accept:'application/json'},redirect:'manual'});
    if(!response.ok)return new Response(JSON.stringify({error:'Kalshi orderbook HTTP '+response.status}),{status:502,headers:jsonHeaders});
    const raw=await response.text();if(raw.length>250_000)throw Error('Oversized orderbook response');
    const data=JSON.parse(raw),book=data.orderbook_fp;
    if(!book||!Array.isArray(book.yes_dollars)||!Array.isArray(book.no_dollars))throw Error('Unexpected orderbook payload');
    return new Response(JSON.stringify({orderbook_fp:{yes_dollars:book.yes_dollars,no_dollars:book.no_dollars}}),{headers:jsonHeaders});
   }catch(e){return new Response(JSON.stringify({error:'Kalshi orderbook retrieval failed: '+e.message}),{status:502,headers:jsonHeaders});}
  }
  if(path!=='/api/kalshi/markets')return new Response('Not found',{status:404});
  const allowed=['series_ticker','status','limit','cursor'];
  const series=url.searchParams.get('series_ticker'),status=url.searchParams.get('status'),limit=Number(url.searchParams.get('limit')),cursor=url.searchParams.get('cursor');
  if([...url.searchParams.keys()].some(x=>!allowed.includes(x))||series!=='KXPGAROUNDSCORE'||status!=='open'||!Number.isInteger(limit)||limit<1||limit>200||(cursor!==null&&!/^[A-Za-z0-9+/_=-]{1,512}$/.test(cursor)))return new Response(JSON.stringify({error:'Invalid public-market query'}),{status:400,headers:jsonHeaders});
  const upstream=new URL('/trade-api/v2/markets',kalshiOrigin);
  for(const [key,value] of [['series_ticker',series],['status',status],['limit',String(limit)]])upstream.searchParams.set(key,value);
  if(cursor)upstream.searchParams.set('cursor',cursor);
  try{
   const response=await fetch(upstream,{headers:{accept:'application/json'},redirect:'manual'});
   if(!response.ok)return new Response(JSON.stringify({error:'Kalshi HTTP '+response.status}),{status:502,headers:jsonHeaders});
   const raw=await response.text();if(raw.length>3_000_000)throw Error('Oversized market response');
   const parsed=JSON.parse(raw);if(!Array.isArray(parsed.markets)||typeof parsed.cursor!=='string')throw Error('Unexpected market payload');
   return new Response(JSON.stringify({markets:parsed.markets,cursor:parsed.cursor}),{status:200,headers:jsonHeaders});
  }catch(e){return new Response(JSON.stringify({error:'Kalshi retrieval failed: '+e.message}),{status:502,headers:jsonHeaders});}
 }
};
