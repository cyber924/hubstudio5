import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import * as store from './server/store.js';
import { mountSeo } from './server/seo.js';
dotenv.config();
const app=express();
app.use(express.json({limit:'2mb'}));
const FIRESTORE_BASE=`https://firestore.googleapis.com/v1/projects/${store.projectId}/databases/(default)/documents`;
const FIREBASE_API_KEY=store.apiKey;
const GEMINI_API_KEY=process.env.GEMINI_API_KEY||'';
const GEMINI_MODEL=process.env.GEMINI_MODEL||'gemini-3.8-flash';
const SITE_URL='https://hubstudio5.vercel.app';
const ai={models:{generateContent:async(input:any)=>{if(!GEMINI_API_KEY)throw store.err('Vercel에 GEMINI_API_KEY를 설정한 뒤 재배포하세요.');return new GoogleGenAI({apiKey:GEMINI_API_KEY}).models.generateContent(input);}}};
const wrap=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res,next)).catch(next);
async function authenticateUser(req:any,res:any,next:any){
 const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
 if(!token)return res.status(401).json({error:'로그인이 필요합니다.'});
 try{req.user=await store.identity(token);next();}catch(e:any){res.status(e.status||503).json({error:e.message});}
}
app.get('/api/health',(_req,res)=>res.json({ok:true,siteId:'hub5'}));
app.get('/api/config-status',(_req,res)=>res.json({configured:!!GEMINI_API_KEY,storageMode:'firebase-user-rest',serverStorageCredentialsRequired:false,siteId:'hub5'}));
app.get('/api/auth/me',authenticateUser,(req:any,res)=>res.json({user:{uid:req.user.uid,email:req.user.email}}));
app.all('/api/auth/*',(_req,res)=>res.status(410).json({error:'브라우저 Firebase 로그인으로 인증하세요.'}));
app.use('/api/action',authenticateUser);
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: val.toString() };
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: any = {};
    for (const k of Object.keys(val)) {
      fields[k] = toFirestoreValue(val[k]);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreDoc(obj: any): any {
  const fields: any = {};
  for (const k of Object.keys(obj)) {
    fields[k] = toFirestoreValue(obj[k]);
  }
  return { fields };
}

function fromFirestoreValue(field: any): any {
  if (!field) return null;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return parseInt(field.integerValue, 10);
  if ('doubleValue' in field) return parseFloat(field.doubleValue);
  if ('booleanValue' in field) return field.booleanValue;
  if ('nullValue' in field) return null;
  if ('arrayValue' in field) {
    const vals = field.arrayValue.values || [];
    return vals.map(fromFirestoreValue);
  }
  if ('mapValue' in field) {
    const fields = field.mapValue.fields || {};
    const res: any = {};
    for (const k of Object.keys(fields)) {
      res[k] = fromFirestoreValue(fields[k]);
    }
    return res;
  }
  return null;
}

function fromFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return null;
  const res: any = {};
  for (const k of Object.keys(doc.fields)) {
    res[k] = fromFirestoreValue(doc.fields[k]);
  }
  if (doc.name) {
    const parts = doc.name.split('/');
    res._id = parts[parts.length - 1];
  }
  return res;
}


const DEFAULT_GALLERY_IMAGES = [
  {
    _id: 'img_jeju_ocean',
    title: '제주 애월 해안 절벽과 에메랄드 바다',
    destination: '제주도 애월읍 해안도로',
    tags: ['여행·맛집', '제주도', '바다', '여행', '맛집', '해안도로', '힐링'],
    prompt: 'Breathtaking blue sea cliffs and emerald waters in Aewol Jeju Island',
    ratio: '16:9',
    aspectRatio: '16:9',
    visibility: 'public',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80'
  },
  {
    _id: 'img_vintage_cafe',
    title: '빈티지 감성 북카페와 따뜻한 라떼 한 잔',
    destination: '서촌 골목 숨은 북카페',
    tags: ['카페', '커피', '북카페', '감성', '디저트', '라떼'],
    prompt: 'Cozy vintage bookstore cafe with warm wooden interior and hot cafe latte',
    ratio: '4:3',
    aspectRatio: '4:3',
    visibility: 'public',
    imageUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80'
  },
  {
    _id: 'img_minimal_humidifier',
    title: '친환경 무선 미니 가습기 & 데스크테리어',
    destination: '홈 오피스 원목 데스크',
    tags: ['생활', '제품', '인테리어', '가전', '데스크테리어', '리뷰'],
    prompt: 'Sleek minimalist ultrasonic humidifier with wood accent on workstation desk',
    ratio: '1:1',
    aspectRatio: '1:1',
    visibility: 'public',
    imageUrl: 'https://images.unsplash.com/photo-1545231027-63b3f162609c?auto=format&fit=crop&w=800&q=80'
  },
  {
    _id: 'img_parkgolf_course',
    title: '푸른 잔디가 펼쳐진 강변 파크골프장 필드',
    destination: '낙동강변 생태공원 파크골프 클럽',
    tags: ['파크골프', '골프', '스포츠', '야외', '건강', '라운딩'],
    prompt: 'Vibrant green lawn fairway with park golf flags under bright clear sky',
    ratio: '16:9',
    aspectRatio: '16:9',
    visibility: 'public',
    imageUrl: 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=800&q=80'
  },
  {
    _id: 'img_teak_wood_craft',
    title: '자연 친화적 프리미엄 티크원목 주방 도마',
    destination: '내추럴 리빙 다이닝룸',
    tags: ['생활', '주방', '원목', '요리', '도마', '식기'],
    prompt: 'Artisanal organic teak wood cutting board with sourdough bread on linen',
    ratio: '4:3',
    aspectRatio: '4:3',
    visibility: 'public',
    imageUrl: 'https://images.unsplash.com/photo-1544982503-9f984c14501a?auto=format&fit=crop&w=800&q=80'
  },
  {
    _id: 'img_camping_sunset',
    title: '노을 지는 호숫가 감성 차박 캠핑',
    destination: '충주호 노을 캠핑장',
    tags: ['여행·맛집', '여행', '캠핑', '노을', '힐링', '차박', '풍경'],
    prompt: 'Warm twilight sunset over lakeside campsite with lit lanterns',
    ratio: '16:9',
    aspectRatio: '16:9',
    visibility: 'public',
    imageUrl: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=800&q=80'
  },
  {
    _id: 'img_bakery_pastry',
    title: '갓 구운 크루아상과 브런치 베이커리',
    destination: '성수동 유럽풍 베이커리 숍',
    tags: ['카페', '베이커리', '빵집', '디저트', '맛집', '브런치'],
    prompt: 'Freshly baked golden butter croissants on rustic bakery tray',
    ratio: '4:3',
    aspectRatio: '4:3',
    visibility: 'public',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=80'
  },
  {
    _id: 'img_parkgolf_putter',
    title: '손에 감기는 명품 파크골프 클럽과 볼',
    destination: '파크골프 전문 장비 부스',
    tags: ['파크골프', '장비', '골프채', '용품', '제품', '스포츠'],
    prompt: 'Close-up of premium wooden park golf club and glossy ball on green turf',
    ratio: '1:1',
    aspectRatio: '1:1',
    visibility: 'public',
    imageUrl: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=800&q=80'
  }
];

// Helper: Traverse all public images in Firestore
async function getPublicImageCandidates(){return (await store.query('images',[['visibility','public']])).map(d=>({...d,_id:d._docId}));}
app.get('/api/hub/gallery-images',wrap(async(_req:any,res:any)=>{
 const images=await getPublicImageCandidates();
 res.json({images:images.map(img=>({id:img._id,title:img.title||'이미지',destination:img.destination||'',tags:img.tags||[],prompt:img.prompt||'',ratio:img.ratio||img.aspectRatio||'16:9',previewUrl:`/api/hub/${img._id}`}))});
}));
app.post('/api/action/recommend-from-images', async (req, res) => {
  const { theme, selectedImages, userNotes } = req.body;
  if (!theme) return res.status(400).json({ error: '테마가 선택되지 않았습니다.' });
  if (!Array.isArray(selectedImages) || selectedImages.length === 0) {
    return res.status(400).json({ error: '최소 1장 이상의 이미지를 선택해야 합니다.' });
  }

  try {
    const existingTitles=(await store.publicPosts()).map(p=>p.title);
    const imagesSummary = selectedImages.map((img: any, i: number) => {
      return `[사진 ${i + 1}] ID: ${img.id}, 제목: ${img.title || ''}, 장소/소재: ${img.destination || ''}, 태그: ${(img.tags || []).join(', ')}${img.userHint ? `, 작가 메모: "${img.userHint}"` : ''}`;
    }).join('\n');

    const prompt = `사용자가 선택한 테마: "${theme}"
사용자가 이미지허브에서 직접 엄선한 사진들 (${selectedImages.length}장):
${imagesSummary}
${userNotes ? `사용자 전체 힌트: "${userNotes}"` : ''}

[기존에 발행된 블로그 제목 목록 (중복 회피용)]
${existingTitles.length > 0 ? existingTitles.slice(0, 10).map(t => `- ${t}`).join('\n') : '(없음)'}

[요구사항]
1. 사용자가 고른 ${selectedImages.length}장의 사진들의 장소, 소재, 분위기, 작가 메모를 심층 분석하십시오.
2. 이 사진들을 하나의 일관된 스토리라인으로 엮어낼 수 있는 가장 매력적이고 세련된 블로그 글 제목 5개를 추천하십시오.
3. 기존 제목 목록과 절대 중복되지 않아야 하며, 사진의 구체적인 특징과 장소가 생생하게 느껴지도록 작성하십시오.

출력은 반드시 5개의 문자열로 구성된 JSON 배열이어야 합니다. 예시: ["제목1", "제목2", "제목3", "제목4", "제목5"]`;

    let recommended: string[] = [];
    try {
      const geminiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      recommended = JSON.parse(geminiRes.text || '[]');
    } catch (aiErr:any) { throw store.err('AI 제목 추천 실패: '+aiErr.message); }
    if(!Array.isArray(recommended)||recommended.length!==5)throw store.err('AI 제목 추천 형식이 올바르지 않습니다.');

    return res.json({ recommended: recommended.slice(0, 5) });
  } catch (err:any) { res.status(err.status||503).json({error:err.message}); }
});

// Fallback legacy recommendation
app.post('/api/action/recommend', async (req, res) => {
  const { theme } = req.body;
  if (!theme) return res.status(400).json({ error: '테마가 선택되지 않았습니다.' });

  try {
    const prompt = `사용자가 선택한 테마는 "${theme}"입니다.
테마에 꼭 맞는 매력적이고 세련된 블로그 글 주제/제목 5개를 추천해주세요.
출력은 반드시 5개의 문자열로 구성된 JSON 배열이어야 합니다.`;

    let recommended: string[] = [];
    try {
      const geminiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      recommended = JSON.parse(geminiRes.text || '[]');
    } catch (aiErr:any) { throw store.err('AI 제목 추천 실패: '+aiErr.message); }
    if(!Array.isArray(recommended)||recommended.length!==5)throw store.err('AI 제목 추천 형식이 올바르지 않습니다.');

    return res.json({ recommended });
  } catch (err:any) { res.status(err.status||503).json({error:err.message}); }
});

app.post('/api/action/init-post',wrap(async(req:any,res:any)=>{const p=await store.createDraft(req.body.theme,req.user.uid,req.user.idToken);res.json({id:p.id,post:store.clientPost(p)});}));
app.post('/api/action/generate-content', async (req: any, res) => {
  const { id, theme, title, selectedImages } = req.body;
  const { uid, idToken:token } = req.user;

  if (!id || !theme || !title) {
    return res.status(400).json({ error: 'id, theme, title은 필수 입력 항목입니다.' });
  }

  try {
    const original=await store.ownPost(id,uid,token);
    store.assertVersion(original,req.body.expectedVersion);
    let imagesToUse = Array.isArray(selectedImages) && selectedImages.length >= 1 ? selectedImages : [];

    // Fallback if client didn't supply selectedImages
    if (imagesToUse.length === 0) {
      const candidates = await getPublicImageCandidates();
      const allCandidates = candidates.length > 0 ? candidates : DEFAULT_GALLERY_IMAGES;
      imagesToUse = allCandidates.slice(0, 3).map(img => ({
        id: img._id || img.id,
        title: img.title || '',
        destination: img.destination || '',
        tags: img.tags || [],
        userHint: ''
      }));
    }

    const imagesSpec = imagesToUse.map((img: any, idx: number) => {
      return `[사진 ${idx + 1}] ID: "${img.id}", 제목: "${img.title || ''}", 대상/장소: "${img.destination || ''}", 태그: "${(img.tags || []).join(', ')}"${img.userHint ? `, 작가 메모: "${img.userHint}"` : ''}`;
    }).join('\n');

    const postSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        intro: { type: Type.STRING },
        sections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING },
              paragraphs: { type: Type.ARRAY, items: { type: Type.STRING } },
              imageId: { type: Type.STRING, description: "사용자가 전달한 이미지 ID 중 하나 (지정된 순서에 맞게 배치)" },
              caption: { type: Type.STRING, description: "이미지에 어울리는 디테일 캡션" }
            },
            required: ["heading", "paragraphs", "imageId", "caption"]
          }
        },
        summary: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["title", "description", "intro", "sections", "summary", "tags"]
    };

    const prompt = `테마: "${theme}"
선택된 글 제목: "${title}"

사용자가 직접 선정한 ${imagesToUse.length}장의 사진 목록 (이 순서대로 본문의 각 섹션에 순차적으로 자연스럽게 배치해야 합니다):
${imagesSpec}

[작성 지침]
1. 사용자가 고른 사진들의 ID를 sections의 각 'imageId'에 순서대로 정확하게 매칭하십시오. (임의의 가짜 ID를 만들지 말고, 위에 제공된 사진 ID를 정확히 쓰십시오).
2. 총 섹션 개수는 전달된 사진 개수(${imagesToUse.length}개)에 맞춰 ${imagesToUse.length}개의 섹션을 구성하십시오.
3. 각 섹션마다 해당 사진의 소재, 장소, 작가 메모를 풍부하게 묘사하는 소제목(heading), 본문 문단(paragraphs), 캡션(caption)을 완성도 높은 존댓말 문체로 작성하십시오.
4. 도입부(intro)와 마무리 요약(summary), 연관 해시태그(tags)도 감성적이고 유익하게 작성하십시오.

출력은 반드시 지정된 JSON schema를 완벽하게 준수해야 합니다.`;

    let postContent: any = null;
    try {
      const geminiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: postSchema
        }
      });
      postContent = JSON.parse(geminiRes.text || '{}');
    } catch (aiErr:any) { throw store.err('AI 글 생성 실패: '+aiErr.message); }
    if(!postContent?.sections?.length)throw store.err('AI가 유효한 본문을 반환하지 않았습니다.');

    // Ensure valid image IDs are mapped in sequence
    const validIds = imagesToUse.map((img: any) => img.id);
    if (Array.isArray(postContent.sections)) {
      postContent.sections.forEach((sec: any, idx: number) => {
        if (!sec.imageId || !validIds.includes(sec.imageId)) {
          sec.imageId = imagesToUse[idx % imagesToUse.length]?.id || validIds[0];
        }
      });
    }

    // Save directly as draft with issued ID
    const now = new Date().toISOString();
    const updatedPost = {
      id: original.id,
      owner: uid,
      theme,
      title: postContent.title || title,
      description: postContent.description || '',
      content: JSON.stringify(postContent),
      status: 'draft',
      created: original.created,
      updated: now,
      published: '',
      version: original.version + 1
    };

    const saved=await store.save(updatedPost,uid,token,original);
    return res.json({ success: true, post: store.clientPost(saved) });
  } catch (err: any) {
    console.error('Post generation failed:', err);
    return res.status(err.status||503).json({ error: err.message });
  }
});

app.post('/api/action/review', async (req: any, res) => {
  const { id } = req.body;
  const uid = req.user.uid;
  const token = req.user.idToken;

  if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });

  try {
    const post=await store.ownPost(id,uid,token);
    store.assertVersion(post,req.body.expectedVersion);
    let postBody: any = {};
    try {
      postBody = JSON.parse(post.content || '{}');
    } catch {
      postBody = { intro: post.description || '', sections: [] };
    }

    const reviewSchema = {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, description: "글 평점 (100점 만점)" },
        strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "장점 설명" },
        weaknesses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "개선할 점 설명" },
        improvedText: { 
          type: Type.OBJECT, 
          description: "개선안 본문 구조 (전체 양식 유지)",
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            intro: { type: Type.STRING },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  heading: { type: Type.STRING },
                  paragraphs: { type: Type.ARRAY, items: { type: Type.STRING } },
                  imageId: { type: Type.STRING },
                  caption: { type: Type.STRING }
                }
              }
            },
            summary: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      },
      required: ["score", "strengths", "weaknesses", "improvedText"]
    };

    const reviewPrompt = `아래 블로그 글의 내용을 정성껏 검수해주세요.
글자 교정, 가독성, 표현 향상법을 피드백해 주시고 개선 제안 본문인 'improvedText'를 완벽하게 작성해 주세요. 'improvedText' 구조는 이미지 ID 매칭을 고스란히 살린 채 피드백이 완벽 적용된 완성본이어야 합니다.

[블로그 본문]
${JSON.stringify(postBody, null, 2)}`;

    let reviewResult: any = null;
    try {
      const geminiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: reviewPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: reviewSchema
        }
      });
      reviewResult = JSON.parse(geminiRes.text || '{}');
    } catch (err:any) { throw store.err('AI 검수 실패: '+err.message); }
    if(!Number.isFinite(reviewResult?.score)||!reviewResult?.improvedText)throw store.err('AI 검수 결과 형식이 올바르지 않습니다.');
    await store.saveReview(post,reviewResult,uid,token);

    return res.json({ success: true, reviewResult });
  } catch (err: any) {
    console.error('Review failed:', err);
    return res.status(err.status||503).json({ error: err.message });
  }
});

app.post('/api/action/update-post',wrap(async(req:any,res:any)=>{
 const {id,status,title,description,content,expectedVersion}=req.body;
 if(!['draft','published','deleted'].includes(status))throw store.err('유효하지 않은 저장 상태입니다.',400);
 const p=await store.ownPost(id,req.user.uid,req.user.idToken);store.assertVersion(p,expectedVersion);
 const now=new Date().toISOString();
 const next={...p,status,title:title??p.title,description:description??p.description,content:content===undefined?p.content:typeof content==='string'?content:JSON.stringify(content),updated:now,published:status==='published'?p.published||now:'',version:p.version+1};
 JSON.parse(next.content);
 const saved=await store.save(next,req.user.uid,req.user.idToken,p,content!==undefined&&next.content!==p.content);
 res.json({success:true,post:store.clientPost(saved)});
}));
app.post('/api/action/apply-review',wrap(async(req:any,res:any)=>{
 const p=await store.ownPost(req.body.id,req.user.uid,req.user.idToken);store.assertVersion(p,req.body.expectedVersion);
 const review=(await store.reviews(p.id,req.user.uid,req.user.idToken))[0];
 if(!review?.reviewResult?.improvedText)throw store.err('먼저 원고를 검수하세요.',400);
 if(review.baseVersion!==p.version||review.baseTime!==p._time)throw store.err('검수 이후 원고가 바뀌었습니다. 다시 검수하세요.',409);
 const body=review.reviewResult.improvedText;
 const saved=await store.save({...p,title:body.title||p.title,description:body.description||p.description,content:JSON.stringify(body),version:p.version+1,updated:new Date().toISOString()},req.user.uid,req.user.idToken,p,true);
 res.json({success:true,version:saved.version});
}));
app.get('/api/action/revisions/:id',wrap(async(req:any,res:any)=>{await store.ownPost(req.params.id,req.user.uid,req.user.idToken);res.json({revisions:await store.revisions(req.params.id,req.user.uid,req.user.idToken)});}));
app.post('/api/action/restore-revision',wrap(async(req:any,res:any)=>{
 const p=await store.ownPost(req.body.id,req.user.uid,req.user.idToken);store.assertVersion(p,req.body.expectedVersion);
 const target=(await store.revisions(p.id,req.user.uid,req.user.idToken)).find(r=>r.version===req.body.version);
 if(!target)throw store.err('복원할 버전을 찾을 수 없습니다.',404);
 const saved=await store.save({...p,title:target.title,description:target.description,content:target.content,version:p.version+1,updated:new Date().toISOString()},req.user.uid,req.user.idToken,p,true);
 res.json({success:true,version:saved.version});
}));
app.get('/api/action/my-posts',wrap(async(req:any,res:any)=>res.json({posts:(await store.ownPosts(req.user.uid,req.user.idToken)).map(store.clientPost)})));
app.get('/api/hub/posts',wrap(async(req:any,res:any)=>{let posts=await store.publicPosts();if(req.query.theme&&req.query.theme!=='전체')posts=posts.filter(p=>p.theme===req.query.theme);res.json({posts:posts.map(store.clientPost)});}));
app.get('/api/hub/posts/:id',wrap(async(req:any,res:any)=>{
 let p=(await store.publicPosts()).find(p=>String(p.id)===req.params.id);
 if(!p&&req.headers.authorization?.startsWith('Bearer ')){const identity=await store.identity(req.headers.authorization.slice(7));p=await store.ownPost(req.params.id,identity.uid,identity.idToken);}
 if(!p)throw store.err('공개 글을 찾을 수 없습니다.',404);res.json({post:store.clientPost(p)});
}));
app.get('/api/hub/:imageId',wrap(async(req:any,res:any)=>{
 const sample=DEFAULT_GALLERY_IMAGES.find(i=>i._id===req.params.imageId);if(sample)return res.redirect(sample.imageUrl);
 const d=store.decode(await store.request(`/images/${encodeURIComponent(req.params.imageId)}`));
 if(d.visibility!=='public')throw store.err('공개 이미지가 아닙니다.',404);
 const src=d.dataUrl||d.thumbnailUrl||d.imageUrl||d.publicUrl;
 if(typeof src==='string'&&/^https:\/\//.test(src))return res.redirect(src);
 const match=typeof src==='string'?src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s):null;
 if(!match)throw store.err('이미지를 찾을 수 없습니다.',404);
 res.setHeader('Cache-Control','public,max-age=86400');res.type(match[1]).send(Buffer.from(match[2],'base64'));
}));
app.all('/api/*',(_req,res)=>res.status(404).json({error:'API 경로를 찾을 수 없습니다.'}));
mountSeo(app);
app.use(express.static(path.resolve('dist'),{index:false}));
app.get('*',(_req,res)=>{const p=fs.existsSync('dist/index.html')?'dist/index.html':'index.html';res.type('html').send(fs.readFileSync(p,'utf8'));});
app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status||503).json({error:e.message||'서버 요청에 실패했습니다.'}));
if(!process.env.VERCEL&&process.env.NODE_ENV!=='test')app.listen(Number(process.env.PORT||3000));
export default app;
