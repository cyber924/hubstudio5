import test from 'node:test';
import assert from 'node:assert/strict';
import {IncomingMessage,ServerResponse} from 'node:http';
import {Socket} from 'node:net';
import {fields,decode,projectId} from '../server/store.js';
process.env.VERCEL='1';process.env.NODE_ENV='test';process.env.GEMINI_API_KEY='test-key';
const {default:handler}=await import('../api/index.js');
const records=new Map<string,any>();let version=0;let denied=false;let aiFailed=false;
const body={title:'실제 생성 <script>alert(1)</script>',description:'고유 설명',intro:'실제 본문 소개',sections:[{heading:'소제목',paragraphs:['실제 본문 문단'],imageId:'image-real',caption:'실제 사진'}],summary:'마무리',tags:['여행']};
const stamp=()=>new Date(Date.parse('2026-10-01T00:00:00Z')+(++version)*1000).toISOString();
globalThis.fetch=async(input:any,options:any={})=>{
 const url=String(input);const payload=options.body?JSON.parse(options.body):{};
 if(url.includes('identitytoolkit.googleapis.com'))return payload.idToken==='valid-a'?Response.json({users:[{localId:'owner-a',email:'test@example.com'}]}):payload.idToken==='valid-b'?Response.json({users:[{localId:'owner-b'}]}):Response.json({error:{message:'invalid'}},{status:400});
 if(url.includes('generativelanguage.googleapis.com')){
  if(aiFailed)return Response.json({error:{message:'model failed'}},{status:503});
  const result=payload.generationConfig?.responseSchema?.properties?.score?{score:80,strengths:['좋음'],weaknesses:['교열'],improvedText:{...body,intro:'실제 검수 개선안'}}:body;
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}],role:'model'},finishReason:'STOP'}]});
 }
 if(url.includes(':runQuery')){
  const q=payload.structuredQuery,c=q.from[0].collectionId;
  const filters=q.where.compositeFilter?.filters||[q.where];
  const rows=[...records.values()].filter(d=>d.name.split('/').at(-2)===c&&filters.every((f:any)=>{const data=decode(d);return data[f.fieldFilter.field.fieldPath]===f.fieldFilter.value.stringValue;}));
  return Response.json(rows.map(document=>({document})));
 }
 if(url.includes(':commit')){
  if(denied)return Response.json({error:{message:'permission denied'}},{status:403});
  assert.equal(options.headers.Authorization,'Bearer valid-a');
  for(const w of payload.writes){const path=w.update?.name||w.delete,old=records.get(path);if(w.currentDocument.exists===false&&old||w.currentDocument.updateTime&&old?.updateTime!==w.currentDocument.updateTime)return Response.json({error:{message:'conflict'}},{status:409});if(w.update)assert.equal(w.update.fields.ownerId.stringValue,'owner-a');}
  const results:any[]=[];
  for(const w of payload.writes){if(w.delete){records.delete(w.delete);results.push({});}else{const updateTime=stamp();records.set(w.update.name,{...w.update,updateTime});results.push({updateTime});}}
  return Response.json({writeResults:results});
 }
 if(url.includes('/contentProjects?')){
  assert.equal(options.headers.Authorization,'Bearer valid-a');const name=`projects/${projectId}/databases/(default)/documents/contentProjects/review_${version}`;
  const doc={name,fields:payload.fields,updateTime:stamp()};records.set(name,doc);return Response.json(doc);
 }
 throw new Error('Unexpected outbound URL: '+url);
};
function exchange(path:string,method='GET',body?:any,token?:string):Promise<Response>{
 return new Promise((resolve,reject)=>{
  const req=new IncomingMessage(new Socket());req.url='/api/index?__route='+encodeURIComponent(path);req.method=method;req.headers={host:'localhost',...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json','content-length':String(Buffer.byteLength(JSON.stringify(body)))}:{})};
  const res=new ServerResponse(req),chunks:Buffer[]=[];
  res.write=((chunk:any)=>{chunks.push(Buffer.from(chunk));return true;}) as any;
  res.end=((chunk:any)=>{if(chunk)chunks.push(Buffer.from(chunk));const headers=new Headers();for(const [k,v]of Object.entries(res.getHeaders()))headers.set(k,String(v));resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));return res;})as any;
  try{handler(req,res);if(body)req.push(JSON.stringify(body));req.push(null);}catch(e){reject(e);}
 });
}
let id:number;
test('real Vercel adapter returns JSON and protects private actions with validated Firebase tokens',async()=>{
 assert.equal((await exchange('/api/health')).headers.get('content-type'),'application/json; charset=utf-8');
 assert.equal((await exchange('/api/action/my-posts')).status,401);
 assert.equal((await exchange('/api/action/my-posts','GET',undefined,'local_user_spoof')).status,401);
 assert.equal((await exchange('/api/action/my-posts','GET',undefined,'valid-b')).status,200);
});
test('create, generate and reload use durable ownerId/agentDraft/contentJson records',async()=>{
 const created=await exchange('/api/action/init-post','POST',{theme:'여행'},'valid-a');assert.equal(created.status,200);id=(await created.json()).id;
 assert.equal([...records.values()][0].fields.recordType.stringValue,'agentDraft');assert.equal([...records.values()][0].fields.ownerId.stringValue,'owner-a');
 const result=await exchange('/api/action/generate-content','POST',{id,theme:'여행',title:'요청 제목',selectedImages:[{id:'image-real',title:'실제 사진',tags:[]}]},'valid-a');assert.equal(result.status,200);assert.equal((await result.json()).post.version,2);
 const mine=await exchange('/api/action/my-posts','GET',undefined,'valid-a');assert.equal((await mine.json()).posts[0].id,id);
 assert.equal((await exchange('/api/hub/posts/'+id)).status,404);assert.equal((await exchange('/api/hub/posts/'+id,'GET',undefined,'valid-a')).status,200);assert.equal((await exchange('/api/hub/posts/'+id,'GET',undefined,'valid-b')).status,404);
 assert.equal((await exchange('/api/action/update-post','POST',{id,status:'published'},'valid-b')).status,404);
});
test('denied Firebase save is an error and never publishes or reports success',async()=>{
 denied=true;const r=await exchange('/api/action/update-post','POST',{id,status:'published',expectedVersion:2},'valid-a');denied=false;
 assert.equal(r.status,403);assert.ok((await r.json()).error);assert.equal([...records.values()].some(d=>d.name.includes('/publishedContents/')),false);
});
test('publication atomically moves the original draft and exposes the same ID publicly',async()=>{
 const r=await exchange('/api/action/update-post','POST',{id,status:'published',expectedVersion:2},'valid-a');assert.equal(r.status,200);
 assert.equal([...records.values()].some(d=>d.fields.recordType?.stringValue==='agentDraft'),false);
 const list=await exchange('/api/hub/posts');assert.equal((await list.json()).posts[0].id,id);
 assert.equal((await exchange('/api/action/update-post','POST',{id,status:'draft',expectedVersion:2},'valid-a')).status,409);
});
test('initial HTML, full detail body, unique canonical and sitemap agree on actual published IDs',async()=>{
 for(const path of ['/','/webzine']){const r=await exchange(path);const html=await r.text();assert.equal(r.status,200);assert.ok(html.includes(`href="/blog/${id}"`));assert.equal((html.match(/rel="canonical"/g)||[]).length,1);}
 const detail=await exchange('/blog/'+id),html=await detail.text();assert.equal(detail.status,200);assert.ok(html.includes('실제 본문 문단'));assert.ok(html.includes('BlogPosting'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));assert.equal((html.match(/name="description"/g)||[]).length,1);
 const sitemap=await (await exchange('/sitemap.xml')).text();assert.ok(sitemap.includes('/blog/'+id));assert.ok(!sitemap.includes('run.app'));
 const missing=await exchange('/blog/nonexistent');assert.equal(missing.status,404);assert.ok((await missing.text()).includes('noindex'));
});
test('AI failure is reported instead of an invented 95-point review or canned generated article',async()=>{
 aiFailed=true;const before=records.size;const r=await exchange('/api/action/review','POST',{id,expectedVersion:3},'valid-a');aiFailed=false;
 assert.equal(r.status,503);assert.ok((await r.json()).error);assert.equal(records.size,before);
});
test('review, atomic revision backup, restore and removal persist through the same Firebase owner rules',async()=>{
 const r=await exchange('/api/action/review','POST',{id,expectedVersion:3},'valid-a');assert.equal(r.status,200);assert.equal((await r.json()).reviewResult.score,80);
 const applied=await exchange('/api/action/apply-review','POST',{id,expectedVersion:3},'valid-a');assert.equal(applied.status,200);
 const history=await (await exchange('/api/action/revisions/'+id,'GET',undefined,'valid-a')).json();assert.equal(history.revisions[0].version,3);
 const restored=await exchange('/api/action/restore-revision','POST',{id,version:3,expectedVersion:4},'valid-a');assert.equal(restored.status,200);
 assert.equal((await exchange('/api/action/revisions/'+id,'GET',undefined,'valid-b')).status,404);
 const removed=await exchange('/api/action/update-post','POST',{id,status:'deleted',expectedVersion:5},'valid-a');assert.equal(removed.status,200);assert.equal((await exchange('/blog/'+id)).status,404);
});
