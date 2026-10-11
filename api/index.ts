import app from '../server';
export default function handler(req:any,res:any){
 const url=new URL(req.url||'/', 'https://hubstudio5.vercel.app');
 const route=req.query?.__route||url.searchParams.get('__route');
 url.searchParams.delete('__route');
 if(route)req.url=String(route)+(url.search?'?'+url.searchParams.toString():'');
 return app(req,res);
}
