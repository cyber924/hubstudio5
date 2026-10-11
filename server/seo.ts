import fs from 'node:fs';
import * as store from './store.js';
export const SITE='https://hubstudio5.vercel.app';
export const escape=(x:any)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function detailBody(p:any){
 const c=JSON.parse(p.content);
 return `<article><header><h1>${escape(p.title)}</h1><p>${escape(p.description)}</p></header><p>${escape(c.intro)}</p>${(c.sections||[]).map((s:any)=>`<section><h2>${escape(s.heading)}</h2>${(s.paragraphs||[]).map((text:string)=>`<p>${escape(text)}</p>`).join('')}${s.imageId?`<figure><img loading="lazy" src="/api/hub/${encodeURIComponent(s.imageId)}" alt="${escape(s.caption||s.heading)}"><figcaption>${escape(s.caption)}</figcaption></figure>`:''}</section>`).join('')}<p>${escape(c.summary||c.closing)}</p></article>`;
}
export function render(template:string,path:string,posts:any[],detail?:any,missing=false){
 const title=missing?'글을 찾을 수 없습니다':detail?detail.title:path==='/'?'허브스튜디오5 · 사진과 이야기로 만나는 라이프스타일':'허브스튜디오5 웹진';
 const description=detail?.description||'이미지와 이야기로 전하는 여행과 일상의 라이프스타일 웹진입니다.';
 const canonical=SITE+path;
 const body=missing?'<h1>글을 찾을 수 없습니다</h1><a href="/webzine">웹진으로 이동</a>':detail?detailBody(detail):`<header><h1>${escape(title)}</h1><p>${escape(description)}</p></header><ul>${posts.map(p=>`<li><a href="/blog/${encodeURIComponent(p.id)}">${escape(p.title)}</a><p>${escape(p.description)}</p></li>`).join('')}</ul>`;
 const schema=detail?{'@context':'https://schema.org','@type':'BlogPosting',headline:detail.title,description:detail.description,datePublished:detail.published,dateModified:detail.updated,mainEntityOfPage:{'@type':'WebPage','@id':canonical},author:{'@type':'Organization',name:'허브스튜디오5'},image:JSON.parse(detail.content).sections?.filter((s:any)=>s.imageId).map((s:any)=>SITE+'/api/hub/'+encodeURIComponent(s.imageId))||[]}:{'@context':'https://schema.org','@type':'CollectionPage',name:title,url:canonical};
 let html=template.replace(/<title>[\s\S]*?<\/title>/g,'').replace(/<meta[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g,'').replace(/<link[^>]*rel="canonical"[^>]*>/g,'').replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g,'');
 const metadata=`<title>${escape(title)} | 허브스튜디오5</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${missing?'noindex,follow':'index,follow,max-image-preview:large'}">${missing?'':`<link rel="canonical" href="${escape(canonical)}">`}<meta property="og:type" content="${detail?'article':'website'}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}">${missing?'':`<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>`}`;
 return html.replace('</head>',metadata+'</head>').replace('<div id="root"></div>',`<div id="root"><main style="max-width:960px;margin:40px auto;padding:24px">${body}</main></div>`);
}
export function mountSeo(app:any){
 const wrap=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res)).catch(next);
 app.get('/robots.txt',(_req:any,res:any)=>res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /studio\nDisallow: /my\nDisallow: /api/action/\nSitemap: ${SITE}/sitemap.xml\n`));
 app.get('/sitemap.xml',wrap(async(_req:any,res:any)=>{
  const posts=await store.publicPosts();const urls=[`${SITE}/`,`${SITE}/webzine`,...posts.map(p=>`${SITE}/blog/${encodeURIComponent(p.id)}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url,i)=>`<url><loc>${escape(url)}</loc>${i>1?`<lastmod>${escape(posts[i-2].updated||posts[i-2].published)}</lastmod>`:''}</url>`).join('')}</urlset>`);
 }));
 const page=wrap(async(req:any,res:any)=>{
  const posts=await store.publicPosts();const detail=req.params.id?posts.find(p=>String(p.id)===req.params.id):undefined;
  const missing=!!req.params.id&&!detail;
  const template=fs.readFileSync(fs.existsSync('dist/index.html')?'dist/index.html':'index.html','utf8');
  res.status(missing?404:200).type('html').send(render(template,req.path,posts,detail,missing));
 });
 app.get('/',page);app.get('/webzine',page);app.get('/blog',(_req:any,res:any)=>res.redirect(301,'/webzine'));app.get('/blog/:id',page);
}
