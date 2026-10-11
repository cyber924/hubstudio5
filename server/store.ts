import { randomInt } from 'node:crypto';
export const projectId='studio-9240700230-1dd9a';
export const apiKey='AIzaSyDEpFAsf1fI65xXklKYsukAWFYw5bzaHyc';
const BASE=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
export const err=(message:string,status=503)=>Object.assign(new Error(message),{status});
export function fields(data:any):any {
 const value=(x:any):any=>x===null?{nullValue:null}:Array.isArray(x)?{arrayValue:{values:x.map(value)}}:typeof x==='object'?{mapValue:{fields:fields(x)}}:typeof x==='boolean'?{booleanValue:x}:typeof x==='number'?Number.isInteger(x)?{integerValue:String(x)}:{doubleValue:x}:{stringValue:String(x)};
 return Object.fromEntries(Object.entries(data).filter(([,x])=>x!==undefined).map(([k,x])=>[k,value(x)]));
}
export function decode(d:any):any {
 const value=(x:any):any=>x.mapValue?Object.fromEntries(Object.entries(x.mapValue.fields||{}).map(([k,v])=>[k,value(v)])):x.arrayValue?(x.arrayValue.values||[]).map(value):x.integerValue!==undefined?Number(x.integerValue):x.stringValue??x.timestampValue??x.booleanValue??x.doubleValue??null;
 return {...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,value(v)])),_docId:d.name.split('/').pop(),_collection:d.name.split('/').at(-2),_time:d.updateTime};
}
export async function request(path:string,init:any={},token?:string){
 const r=await fetch(`${BASE}${path}${path.includes('?')?'&':'?'}key=${apiKey}`,{signal:AbortSignal.timeout(20000),...init,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
 const body=await r.json().catch(()=>null);
 if(!r.ok)throw err(body?.error?.message||`Firebase 요청 실패 (${r.status})`,r.status===403?403:r.status===404?404:r.status===409||r.status===412?409:503);
 return body;
}
export async function query(collection:string,filters:[string,string][],token?:string){
 const items:any[]=[];let after:string|undefined;
 do{
  const parts=filters.map(([field,v])=>({fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:v}}}));
  const q:any={from:[{collectionId:collection}],where:parts.length===1?parts[0]:{compositeFilter:{op:'AND',filters:parts}},orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:100};
  if(after)q.startAt={values:[{referenceValue:after}],before:false};
  const rows=await request(':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:q})},token);
  const docs=rows.filter((r:any)=>r.document).map((r:any)=>r.document);items.push(...docs.map(decode));after=docs.length===100?docs.at(-1).name:undefined;
 }while(after);
 return items;
}
export function post(d:any):any{
 const marker=d.sourceSite||d.siteId||d.themePersona;
 if(marker!=='hub5'||!d.ownerId)return null;
 let body:any={};try{body=JSON.parse(d.contentJson||JSON.stringify(d.content||{}));}catch{return null;}
 body.sections=(body.sections||[]).map((s:any)=>({...s,heading:s.heading||s.title||'',paragraphs:s.paragraphs||(s.body||s.content||'').split(/\n\n+/)}));
 const id=d.postId||d._docId;
 return {id,owner:d.ownerId,theme:d.theme||'라이프스타일',title:d.title||body.title||'',description:d.description||body.description||body.summary||'',content:JSON.stringify(body),status:d.status,created:d.createdAt,updated:d.updatedAt,published:d.publishedAt||'',version:d.revision||1,_docId:d._docId,_collection:d._collection,_time:d._time};
}
export const isPublic=(p:any)=>p?.status==='published'&&!!p.published&&Number.isFinite(Date.parse(p.published))&&Date.parse(p.published)<=Date.now();
export async function publicPosts(){return (await query('publishedContents',[['visibility','public']])).map(post).filter(isPublic).sort((a,b)=>b.published.localeCompare(a.published));}
export async function ownPosts(uid:string,token:string){
 const [published,drafts]=await Promise.all([publicPosts(),query('contentProjects',[['ownerId',uid],['recordType','agentDraft']],token)]);
 return [...published.filter(p=>p.owner===uid),...drafts.map(post).filter(p=>p&&p.owner===uid&&p.status==='draft')].sort((a,b)=>b.updated.localeCompare(a.updated));
}
export async function ownPost(id:any,uid:string,token:string){const p=(await ownPosts(uid,token)).find(p=>String(p.id)===String(id));if(!p)throw err('본인의 원고를 찾을 수 없습니다.',404);return p;}
export function assertVersion(p:any,expected:any){if(expected!==undefined&&p.version!==Number(expected))throw err('다른 변경이 먼저 저장됐습니다. 새로고침 후 다시 시도하세요.',409);}
function record(p:any,uid:string){
 if(p.owner!==uid)throw err('본인의 원고만 저장할 수 있습니다.',403);
 return {ownerId:uid,sourceSite:'hub5',siteId:'hub5',themePersona:'hub5',type:'blog',postId:p.id,theme:p.theme,title:p.title,description:p.description,status:p.status,visibility:p.status==='published'?'public':'private',contentJson:p.content,imageIds:JSON.parse(p.content||'{}').sections?.map((s:any)=>s.imageId).filter(Boolean)||[],createdAt:p.created,updatedAt:p.updated,publishedAt:p.published||'',revision:p.version,...(p.status==='draft'?{recordType:'agentDraft'}:{})};
}
function write(c:string,id:string,data:any,time?:string){return {update:{name:`projects/${projectId}/databases/(default)/documents/${c}/${id}`,fields:fields(data)},currentDocument:time?{updateTime:time}:{exists:false}};}
function remove(p:any){return {delete:`projects/${projectId}/databases/(default)/documents/${p._collection}/${p._docId}`,currentDocument:{updateTime:p._time}};}
export async function save(p:any,uid:string,token:string,original?:any,backup=false){
 if(p.owner!==uid||(original&&original.owner!==uid))throw err('본인의 원고만 저장할 수 있습니다.',403);
 const collection=p.status==='published'?'publishedContents':'contentProjects';const id=original?._docId||`hub5_${p.id}`;
 const writes:any[]=[];
 if(backup&&original){writes.push(write('contentProjects',`hub5_revision_${uid}_${p.id}_${original.version}_${randomInt(100000000)}`,{ownerId:uid,sourceSite:'hub5',recordType:'hub5Revision',articleId:String(p.id),version:original.version,payloadJson:JSON.stringify({version:original.version,title:original.title,description:original.description,content:original.content,revisionsSavedAt:new Date().toISOString()})}));}
 if(p.status==='deleted'){if(!original)throw err('원고를 찾을 수 없습니다.',404);writes.push(remove(original));}
 else{writes.push(write(collection,id,record(p,uid),original?._collection===collection?original._time:undefined));if(original&&original._collection!==collection)writes.push(remove(original));}
 const result=await request(':commit',{method:'POST',body:JSON.stringify({writes})},token);
 return {...p,_docId:id,_collection:collection,_time:result.writeResults?.[backup?1:0]?.updateTime};
}
export async function createDraft(theme:string,uid:string,token:string){
 const now=new Date().toISOString();const p={id:Date.now()*1000+randomInt(1000),owner:uid,theme:theme||'라이프스타일',title:'생성 대기 원고',description:'',content:'{}',status:'draft',created:now,updated:now,published:'',version:1};return save(p,uid,token);
}
export async function saveReview(p:any,result:any,uid:string,token:string){
 const data={ownerId:uid,sourceSite:'hub5',recordType:'reviewMessage',articleId:String(p.id),messageId:crypto.randomUUID(),role:'assistant',kind:'review',text:'원고 검수',createdAt:new Date().toISOString(),resultJson:JSON.stringify({reviewResult:result,baseVersion:p.version,baseTime:p._time})};
 await request('/contentProjects',{method:'POST',body:JSON.stringify({fields:fields(data)})},token);
}
export async function reviews(id:any,uid:string,token:string){return (await query('contentProjects',[['ownerId',uid],['articleId',String(id)],['recordType','reviewMessage']],token)).filter(d=>d.sourceSite==='hub5'&&d.kind==='review').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(d=>JSON.parse(d.resultJson));}
export async function revisions(id:any,uid:string,token:string){return (await query('contentProjects',[['ownerId',uid],['articleId',String(id)],['recordType','hub5Revision']],token)).filter(d=>d.sourceSite==='hub5').map(d=>JSON.parse(d.payloadJson)).sort((a,b)=>b.version-a.version);}
export async function identity(token:string){
 const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000)});
 const body:any=await r.json();const u=body.users?.[0];if(!r.ok||!u?.localId||u.disabled)throw err('로그인이 만료되었습니다. 다시 로그인하세요.',401);return {uid:u.localId,email:u.email,idToken:token};
}
export function clientPost(p:any){const {_time,_docId,_collection,...data}=p;return data;}
