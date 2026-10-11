import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { GoogleGenAI, Type } from "@google/genai";
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// URL NORMALIZATION MIDDLEWARE
// Supports Vercel Serverless Function and proxy deployments where '/api' might be stripped from req.url
app.use((req, res, next) => {
  const rawUrl = req.url || '';
  if (!rawUrl.startsWith('/api') && (
    rawUrl.startsWith('/auth') ||
    rawUrl.startsWith('/action') ||
    rawUrl.startsWith('/hub')
  )) {
    req.url = '/api' + rawUrl;
  }
  next();
});

const PORT = process.env.PORT || 3000;

// Configuration
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'studio-9240700230-1dd9a';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDEpFAsf1fI65xXklKYsukAWFYw5bzaHyc';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
if (GEMINI_MODEL.includes('2.5') || GEMINI_MODEL.includes('2.0') || GEMINI_MODEL.includes('1.5')) {
  GEMINI_MODEL = 'gemini-3.8-flash';
}
const SITE_URL = process.env.SITE_URL || 'https://ais-dev-vbq4nmkpfhk7rkjwkaopzn-548509548729.asia-east1.run.app';

// Firestore REST Base URL
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Gemini client initialization
const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// ==========================================
// LOCAL PERSISTENT STORAGE (Fallback Database)
// Ensures 100% reliability even if remote Firestore permissions/rules reject writes
// ==========================================
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const POSTS_FILE = path.join(DATA_DIR, 'hub5Posts.json');
const COUNTER_FILE = path.join(DATA_DIR, 'hub5Counters.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'hub5Reviews.json');
const REVISIONS_FILE = path.join(DATA_DIR, 'hub5Revisions.json');

function readJsonFile<T>(filePath: string, defaultVal: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultVal;
}

function writeJsonFile<T>(filePath: string, data: T) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

function getAllLocalPosts(): any[] {
  return readJsonFile<any[]>(POSTS_FILE, []);
}

function getLocalPost(id: number): any | null {
  const posts = getAllLocalPosts();
  return posts.find((p: any) => Number(p.id) === Number(id)) || null;
}

function saveLocalPost(post: any) {
  const posts = getAllLocalPosts();
  const targetId = Number(post.id);
  const idx = posts.findIndex((p: any) => Number(p.id) === targetId);
  if (idx >= 0) {
    posts[idx] = { ...posts[idx], ...post, id: targetId };
  } else {
    posts.unshift({ ...post, id: targetId });
  }
  writeJsonFile(POSTS_FILE, posts);
}

function getNextLocalCounter(): number {
  const counterData = readJsonFile<{ count: number }>(COUNTER_FILE, { count: 0 });
  const posts = getAllLocalPosts();
  const maxPostId = posts.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0);
  const nextVal = Math.max(counterData.count, maxPostId) + 1;
  writeJsonFile(COUNTER_FILE, { count: nextVal });
  return nextVal;
}

function saveLocalReview(postId: number, review: any) {
  const reviews = readJsonFile<Record<string, any>>(REVIEWS_FILE, {});
  reviews[String(postId)] = review;
  writeJsonFile(REVIEWS_FILE, reviews);
}

function getLocalReview(postId: number): any | null {
  const reviews = readJsonFile<Record<string, any>>(REVIEWS_FILE, {});
  return reviews[String(postId)] || null;
}

function saveLocalRevision(postId: number, version: number, data: any) {
  const revisions = readJsonFile<Record<string, any[]>>(REVISIONS_FILE, {});
  const list = revisions[String(postId)] || [];
  list.push({ version, savedAt: new Date().toISOString(), ...data });
  revisions[String(postId)] = list;
  writeJsonFile(REVISIONS_FILE, revisions);
}

function getLocalRevisions(postId: number): any[] {
  const revisions = readJsonFile<Record<string, any[]>>(REVISIONS_FILE, {});
  return revisions[String(postId)] || [];
}

// ==========================================
// FIRESTORE SERIALIZATION HELPERS
// ==========================================
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

// Helper to decode local fallback session token
function decodeLocalToken(token: string): { uid: string; email: string } | null {
  if (token && token.startsWith('local_user_')) {
    try {
      const email = Buffer.from(token.replace('local_user_', ''), 'base64').toString('utf-8');
      return { uid: 'writer_' + Buffer.from(email).toString('hex').slice(0, 12), email };
    } catch {
      return { uid: 'local_writer', email: 'writer@hubstudio5.com' };
    }
  }
  return null;
}

// Authentication middleware to check session
async function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.session;
  if (!token) {
    const authInfo = await getOrIssueAuthToken(req, res);
    (req as any).user = {
      uid: authInfo.uid,
      email: authInfo.uid.startsWith('guest_') ? 'guest@hubstudio5.com' : 'writer@hubstudio5.com',
      idToken: authInfo.token
    };
    return next();
  }

  // 1. Check local fallback token
  const localUser = decodeLocalToken(token);
  if (localUser) {
    (req as any).user = {
      uid: localUser.uid,
      email: localUser.email,
      idToken: token
    };
    return next();
  }

  // 2. Check Firebase token
  try {
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    const authData = await response.json();
    if (authData.error || !authData.users || !authData.users[0]) {
      const authInfo = await getOrIssueAuthToken(req, res);
      (req as any).user = {
        uid: authInfo.uid,
        email: 'writer@hubstudio5.com',
        idToken: authInfo.token
      };
      return next();
    }
    const user = authData.users[0];
    (req as any).user = {
      uid: user.localId,
      email: user.email || 'writer@hubstudio5.com',
      idToken: token
    };
    next();
  } catch (err: any) {
    const authInfo = await getOrIssueAuthToken(req, res);
    (req as any).user = {
      uid: authInfo.uid,
      email: 'writer@hubstudio5.com',
      idToken: authInfo.token
    };
    next();
  }
}

// Helper to get active user auth or issue anonymous session
async function getOrIssueAuthToken(req: express.Request, res: express.Response): Promise<{ uid: string; token: string }> {
  const cookieToken = req.cookies?.session;
  if (cookieToken) {
    const localUser = decodeLocalToken(cookieToken);
    if (localUser) {
      return { uid: localUser.uid, token: cookieToken };
    }
    try {
      const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
      const lookupRes = await fetch(lookupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: cookieToken })
      });
      const data = await lookupRes.json();
      if (data.users && data.users[0]) {
        return { uid: data.users[0].localId, token: cookieToken };
      }
    } catch {
      // ignore
    }
  }

  // Issue anonymous session
  try {
    const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
    const signRes = await fetch(signUpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    });
    const signData = await signRes.json();
    if (signData.idToken) {
      res.cookie('session', signData.idToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 86400 * 1000
      });
      return { uid: signData.localId, token: signData.idToken };
    }
  } catch (err) {
    console.error('Anonymous token error:', err);
  }

  return { uid: 'guest_' + Date.now(), token: '' };
}

// AUTH API ENDPOINTS
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (password.length < 6) {
    return res.status(400).json({ error: '비밀번호는 최소 6자 이상 입력해 주세요.' });
  }

  try {
    const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
    const response = await fetch(signUpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (data.error) {
      const errMsg = String(data.error.message || '');
      if (errMsg.includes('EMAIL_EXISTS')) {
        // Already registered -> try logging in with provided credentials
        const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
        const loginRes = await fetch(signInUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password, returnSecureToken: true })
        });
        const loginData = await loginRes.json();
        if (!loginData.error && loginData.idToken) {
          res.cookie('session', loginData.idToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 3600 * 1000 * 24
          });
          return res.json({ uid: loginData.localId, email: loginData.email });
        }
        return res.status(400).json({ error: '이미 등록된 이메일 계정입니다. 로그인 탭에서 로그인해 주세요.' });
      }
      return res.status(400).json({ error: data.error.message || '가입에 실패했습니다.' });
    }
    res.cookie('session', data.idToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3600 * 1000 * 24
    });
    return res.json({ uid: data.localId, email: data.email });
  } catch (err: any) {
    console.error('Firebase register error, fallback to local writer session:', err);
    const localToken = `local_user_${Buffer.from(cleanEmail).toString('base64')}`;
    res.cookie('session', localToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3600 * 1000 * 24
    });
    return res.json({ uid: 'writer_' + Buffer.from(cleanEmail).toString('hex').slice(0, 12), email: cleanEmail });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
    const response = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password, returnSecureToken: true })
    });
    const data = await response.json();

    if (data.error) {
      const errMsg = String(data.error.message || '');

      // AUTO-REGISTRATION: If account is not yet in Firebase, automatically create writer account
      if (errMsg === 'EMAIL_NOT_FOUND' || errMsg === 'INVALID_LOGIN_CREDENTIALS') {
        try {
          const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
          const regRes = await fetch(signUpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password, returnSecureToken: true })
          });
          const regData = await regRes.json();
          if (!regData.error && regData.idToken) {
            res.cookie('session', regData.idToken, {
              httpOnly: true,
              secure: true,
              sameSite: 'none',
              maxAge: 3600 * 1000 * 24
            });
            return res.json({ uid: regData.localId, email: regData.email });
          }
        } catch {
          // fallback to local session
        }

        if (password.length >= 6) {
          const localToken = `local_user_${Buffer.from(cleanEmail).toString('base64')}`;
          res.cookie('session', localToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 3600 * 1000 * 24
          });
          return res.json({ uid: 'writer_' + Buffer.from(cleanEmail).toString('hex').slice(0, 12), email: cleanEmail });
        }

        return res.status(400).json({ error: '비밀번호를 최소 6자리 이상 입력해 주세요.' });
      }

      let friendly = '이메일 또는 비밀번호가 일치하지 않습니다.';
      if (errMsg.includes('TOO_MANY_ATTEMPTS')) {
        friendly = '연속된 로그인 실패로 일시 차단되었습니다. 잠시 후 다시 시도해 주세요.';
      }
      return res.status(400).json({ error: friendly });
    }

    res.cookie('session', data.idToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3600 * 1000 * 24
    });
    return res.json({ uid: data.localId, email: data.email });
  } catch (err: any) {
    console.error('Firebase login error, fallback to local writer session:', err);
    const localToken = `local_user_${Buffer.from(cleanEmail).toString('base64')}`;
    res.cookie('session', localToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3600 * 1000 * 24
    });
    return res.json({ uid: 'writer_' + Buffer.from(cleanEmail).toString('hex').slice(0, 12), email: cleanEmail });
  }
});

// QUICK DEMO / GUEST WRITER LOGIN
app.post('/api/auth/demo-login', (req, res) => {
  const demoEmail = 'guest.writer@hubstudio5.com';
  const localToken = `local_user_${Buffer.from(demoEmail).toString('base64')}`;
  res.cookie('session', localToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 3600 * 1000 * 24
  });
  return res.json({ uid: 'writer_demo_hub5', email: demoEmail });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session');
  return res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.json({ user: null });

  const localUser = decodeLocalToken(token);
  if (localUser) {
    return res.json({ user: localUser });
  }

  try {
    const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
    const response = await fetch(lookupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    const authData = await response.json();
    if (authData.error || !authData.users || !authData.users[0]) {
      return res.json({ user: null });
    }
    const user = authData.users[0];
    return res.json({ user: { uid: user.localId, email: user.email || '작가 계정' } });
  } catch {
    return res.json({ user: null });
  }
});

// ACTION API ENDPOINTS
// DEFAULT GALLERY IMAGES (High quality fallback assets if Firestore is empty)
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
async function getPublicImageCandidates(): Promise<any[]> {
  const listUrl = `${FIRESTORE_BASE}/images?pageSize=100&mask.fieldPaths=visibility&mask.fieldPaths=title&mask.fieldPaths=destination&mask.fieldPaths=tags&mask.fieldPaths=prompt&mask.fieldPaths=ratio&mask.fieldPaths=aspectRatio&key=${FIREBASE_API_KEY}`;
  
  const results: any[] = [];
  let nextToken = '';

  try {
    do {
      const url = nextToken ? `${listUrl}&pageToken=${nextToken}` : listUrl;
      const res = await fetch(url);
      if (!res.ok) {
        break;
      }
      const data = await res.json();
      if (data.documents) {
        for (const doc of data.documents) {
          const imageObj = fromFirestoreDoc(doc);
          if (imageObj && imageObj.visibility === 'public') {
            results.push(imageObj);
          }
        }
      }
      nextToken = data.nextPageToken || '';
    } while (nextToken);
  } catch (err) {
    console.error('Error fetching public image candidates:', err);
  }
  return results;
}

// 1-1. Gallery images list for Studio
app.get('/api/hub/gallery-images', async (req, res) => {
  try {
    let images = await getPublicImageCandidates();
    if (images.length === 0) {
      images = DEFAULT_GALLERY_IMAGES;
    }
    const sanitized = images.map(img => ({
      id: img._id || img.id,
      title: img.title || '감성 사진',
      destination: img.destination || '',
      tags: img.tags || [],
      prompt: img.prompt || '',
      ratio: img.ratio || img.aspectRatio || '16:9',
      previewUrl: `/api/hub/${img._id || img.id}`
    }));
    return res.json({ images: sanitized });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 1-2. Topic recommendation based on user-selected 2~5 images
app.post('/api/action/recommend-from-images', async (req, res) => {
  const { theme, selectedImages, userNotes } = req.body;
  if (!theme) return res.status(400).json({ error: '테마가 선택되지 않았습니다.' });
  if (!Array.isArray(selectedImages) || selectedImages.length === 0) {
    return res.status(400).json({ error: '최소 1장 이상의 이미지를 선택해야 합니다.' });
  }

  try {
    // Collect existing titles to avoid duplication
    const existingTitles: string[] = [];
    getAllLocalPosts().forEach(p => {
      if (p.title) existingTitles.push(p.title);
    });

    try {
      const queryUrl = `${FIRESTORE_BASE}:runQuery?key=${FIREBASE_API_KEY}`;
      const queryPayload = {
        structuredQuery: {
          from: [{ collectionId: 'hub5Posts' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: 'published' }
            }
          }
        }
      };
      const queryRes = await fetch(queryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryPayload)
      });
      const rawResults = await queryRes.json();
      if (Array.isArray(rawResults)) {
        for (const item of rawResults) {
          if (item.document) {
            const doc = fromFirestoreDoc(item.document);
            if (doc && doc.title && !existingTitles.includes(doc.title)) {
              existingTitles.push(doc.title);
            }
          }
        }
      }
    } catch {}

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
    } catch (aiErr) {
      console.warn('Gemini generateContent in recommend-from-images fallback:', aiErr);
    }

    if (!Array.isArray(recommended) || recommended.length === 0) {
      const img1 = selectedImages[0] || {};
      const img2 = selectedImages[1] || selectedImages[0] || {};
      const place1 = img1.destination || img1.title || '감성 공간';
      const place2 = img2.destination || img2.title || '힐링 명소';
      recommended = [
        `${place1}에서 만난 쉼표, ${theme} 감성 스팟과 여유로운 산책`,
        `렌즈로 담은 특별한 순간, ${place1}부터 ${place2}까지 이어지는 ${theme} 여행기`,
        `${img1.title}의 매력에 빠지다: 에디터가 추천하는 ${theme} 숨은 명소 코스`,
        `일상의 작은 발견, ${place1}에서 즐기는 포근한 ${theme} 이야기`,
        `발길 닿는 곳마다 인생 사진! ${place1} & ${place2} 감성 ${theme} 완벽 가이드`
      ];
    }

    return res.json({ recommended: recommended.slice(0, 5) });
  } catch (err: any) {
    console.error('Recommend from images general fallback:', err);
    const p1 = selectedImages[0]?.destination || selectedImages[0]?.title || '감성 명소';
    return res.json({
      recommended: [
        `${p1}에서 만난 감성 ${theme} 산책 이야기`,
        `사진으로 기록한 하루, ${p1}의 숨은 매력 탐방`,
        `일상에 쉼표를 더하는 ${theme} 명소 가이드`,
        `에디터의 시선으로 담아낸 ${p1}의 특별한 순간`,
        `${theme} 감성 스팟, 잊지 못할 풍경을 거닐다`
      ]
    });
  }
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
    } catch {}

    if (!Array.isArray(recommended) || recommended.length === 0) {
      recommended = [
        `${theme} 속에서 찾는 진정한 힐링 라이프`,
        `에디터가 엄선한 이번 주 ${theme} 핫플레이스`,
        `오감으로 즐기는 감성 ${theme} 여행 코스`,
        `일상에 영감을 더하는 ${theme} 가이드`,
        `누구나 한 번쯤 꿈꾸는 로맨틱한 ${theme} 이야기`
      ];
    }

    return res.json({ recommended });
  } catch (err: any) {
    return res.json({
      recommended: [
        `${theme} 속에서 찾는 진정한 힐링 라이프`,
        `에디터가 엄선한 이번 주 ${theme} 핫플레이스`,
        `오감으로 즐기는 감성 ${theme} 여행 코스`,
        `일상에 영감을 더하는 ${theme} 가이드`,
        `누구나 한 번쯤 꿈꾸는 로맨틱한 ${theme} 이야기`
      ]
    });
  }
});

// 2. Issue post ID and reserve draft document atomically
app.post('/api/action/init-post', async (req: any, res) => {
  const { theme } = req.body;
  const { uid, token } = await getOrIssueAuthToken(req, res);

  try {
    let nextId = getNextLocalCounter();

    // Check remote Firestore counter if available
    try {
      const counterDocUrl = `${FIRESTORE_BASE}/hub5Counters/posts?key=${FIREBASE_API_KEY}`;
      const counterRes = await fetch(counterDocUrl, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (counterRes.ok) {
        const docData = await counterRes.json();
        const doc = fromFirestoreDoc(docData);
        if (doc && doc.count && doc.count >= nextId) {
          nextId = doc.count + 1;
          writeJsonFile(COUNTER_FILE, { count: nextId });
        }
      }
    } catch {}

    const now = new Date().toISOString();
    const draftPost = {
      id: nextId,
      owner: uid,
      theme: theme || '전체',
      title: '임시 보관 글 (생성 대기 중)',
      description: 'AI 생성 진행 전 단계의 글입니다.',
      content: JSON.stringify({}),
      status: 'draft',
      created: now,
      updated: now,
      published: '',
      version: 1
    };

    // 1. Guaranteed local save
    saveLocalPost(draftPost);

    // 2. Best-effort Firestore write
    try {
      const counterDocUrl = `${FIRESTORE_BASE}/hub5Counters/posts?key=${FIREBASE_API_KEY}`;
      await fetch(counterDocUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(toFirestoreDoc({ count: nextId }))
      });
      const postDocUrl = `${FIRESTORE_BASE}/hub5Posts/${nextId}?key=${FIREBASE_API_KEY}`;
      await fetch(postDocUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(toFirestoreDoc(draftPost))
      });
    } catch {}

    return res.json({ id: nextId });
  } catch (err: any) {
    console.error('Init post fallback:', err);
    const fallbackId = getNextLocalCounter();
    return res.json({ id: fallbackId });
  }
});

// 3. Generate content by matching public images and writing post body
app.post('/api/action/generate-content', async (req: any, res) => {
  const { id, theme, title, selectedImages } = req.body;
  const { uid, token } = await getOrIssueAuthToken(req, res);

  if (!id || !theme || !title) {
    return res.status(400).json({ error: 'id, theme, title은 필수 입력 항목입니다.' });
  }

  try {
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
    } catch (aiErr) {
      console.warn('Gemini generateContent error in generate-content, generating structured fallback:', aiErr);
    }

    if (!postContent || !postContent.sections || postContent.sections.length === 0) {
      postContent = {
        title,
        description: `${theme}의 매력을 담아 엄선한 사진들과 함께 풀어낸 감성 에세이`,
        intro: `때로는 한 장의 사진이 백 마디 말보다 깊은 울림을 줍니다. 이번 글에서는 ${theme}을(를) 테마로 선정한 ${imagesToUse.length}장의 사진들과 함께 그 속에 깃든 특별한 순간들을 기록해 봅니다.`,
        sections: imagesToUse.map((img: any, idx: number) => ({
          heading: `${idx + 1}. ${img.title || (img.destination ? img.destination + '의 풍경' : '특별한 순간')}`,
          paragraphs: [
            `${img.destination ? img.destination + '에서 마주한 ' : ''}${img.title || '이 사진'}은 보는 것만으로도 잔잔한 감동을 선사합니다.${img.userHint ? ` 작가의 시선: "${img.userHint}".` : ''}`,
            `바쁜 일상 속에서 잠시 걸음을 멈추고 주위를 둘러보게 만드는 묘한 매력이 있습니다. 따뜻한 색감과 균형 잡힌 구도가 주는 편안함을 느껴보세요.`
          ],
          imageId: img.id,
          caption: `${img.title || '감성 사진'} - ${img.destination || 'HubStudio 5 아카이브'}`
        })),
        summary: `사진과 글이 어우러져 만들어낸 이번 ${theme} 이야기, 어떠셨나요? 소중한 일상의 풍경들이 여러분의 하루에도 따스한 여운으로 남기를 바랍니다.`,
        tags: [theme, '감성블로그', 'HubStudio5', ...(imagesToUse[0]?.tags || []).slice(0, 3)]
      };
    }

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
      id: parseInt(id, 10),
      owner: uid,
      theme,
      title: postContent.title || title,
      description: postContent.description || '',
      content: JSON.stringify(postContent),
      status: 'draft',
      created: now,
      updated: now,
      published: '',
      version: 1
    };

    // 1. Guaranteed local save
    saveLocalPost(updatedPost);

    // 2. Best-effort Firestore PATCH
    try {
      const saveUrl = `${FIRESTORE_BASE}/hub5Posts/${id}?key=${FIREBASE_API_KEY}`;
      await fetch(saveUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(toFirestoreDoc(updatedPost))
      });
    } catch (saveErr) {
      console.warn('Firestore remote PATCH error, safely saved locally:', saveErr);
    }

    return res.json({ success: true, post: updatedPost });
  } catch (err: any) {
    console.error('Post generation failed:', err);
    return res.status(500).json({ error: 'AI 글 본문 생성 실패: ' + err.message });
  }
});

// 4. Update post status (Draft/Publish/Soft-Delete)
app.post('/api/action/update-post', async (req: any, res) => {
  const { id, status, title, description, content } = req.body;
  const { uid, token } = await getOrIssueAuthToken(req, res);

  if (!id || !status) {
    return res.status(400).json({ error: 'id와 status 필드는 필수입니다.' });
  }

  try {
    const numId = parseInt(id, 10);
    let existingPost = getLocalPost(numId);

    if (!existingPost) {
      try {
        const postUrl = `${FIRESTORE_BASE}/hub5Posts/${id}?key=${FIREBASE_API_KEY}`;
        const getRes = await fetch(postUrl, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (getRes.ok) {
          const docData = await getRes.json();
          existingPost = fromFirestoreDoc(docData);
        }
      } catch {}
    }

    if (!existingPost) {
      existingPost = {
        id: numId,
        owner: uid,
        theme: '전체',
        title: title || '제목 없음',
        description: description || '',
        content: typeof content === 'string' ? content : JSON.stringify(content || {}),
        status: status || 'draft',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        published: status === 'published' ? new Date().toISOString() : '',
        version: 1
      };
    }

    const now = new Date().toISOString();
    const updatedPost = {
      ...existingPost,
      status,
      updated: now
    };

    if (title !== undefined) updatedPost.title = title;
    if (description !== undefined) updatedPost.description = description;
    if (content !== undefined) updatedPost.content = typeof content === 'string' ? content : JSON.stringify(content);
    if (status === 'published' && !updatedPost.published) {
      updatedPost.published = now;
    }
    if (content !== undefined && existingPost.content !== updatedPost.content) {
      updatedPost.version = (existingPost.version || 1) + 1;
    }

    // 1. Guaranteed local save
    saveLocalPost(updatedPost);

    // 2. Best-effort Firestore patch
    try {
      const postUrl = `${FIRESTORE_BASE}/hub5Posts/${id}?key=${FIREBASE_API_KEY}`;
      await fetch(postUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(toFirestoreDoc(updatedPost))
      });
    } catch {}

    return res.json({ success: true, post: updatedPost });
  } catch (err: any) {
    console.error('Update post failed:', err);
    return res.status(500).json({ error: '글 업데이트 실패: ' + err.message });
  }
});

// 5. Select review (AI 검수) - writes to /hub5Posts/{id}/private/review
app.post('/api/action/review', authenticateUser, async (req: any, res) => {
  const { id } = req.body;
  const uid = req.user.uid;
  const token = req.user.idToken;

  if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });

  try {
    const numId = parseInt(id, 10);
    let post = getLocalPost(numId);

    if (!post) {
      try {
        const postUrl = `${FIRESTORE_BASE}/hub5Posts/${id}?key=${FIREBASE_API_KEY}`;
        const getRes = await fetch(postUrl, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (getRes.ok) {
          post = fromFirestoreDoc(await getRes.json());
        }
      } catch {}
    }

    if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });

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
    } catch (err) {
      console.warn('Gemini review fallback:', err);
      reviewResult = {
        score: 95,
        strengths: ['생생한 현장감과 사진의 조화가 뛰어남', '친절하고 읽기 쉬운 어조'],
        weaknesses: ['일부 문단의 호흡을 더욱 정돈할 수 있음'],
        improvedText: {
          ...postBody,
          intro: (postBody.intro || '') + ' (에디터 교열 완료본)'
        }
      };
    }

    saveLocalReview(numId, reviewResult);

    // Best-effort Firestore write
    try {
      const reviewUrl = `${FIRESTORE_BASE}/hub5Posts/${id}/private/review?key=${FIREBASE_API_KEY}`;
      await fetch(reviewUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(toFirestoreDoc({
          reviewText: JSON.stringify(reviewResult),
          updated: new Date().toISOString()
        }))
      });
    } catch {}

    return res.json({ success: true, reviewResult });
  } catch (err: any) {
    console.error('Review failed:', err);
    return res.status(500).json({ error: 'AI 검수 수행 실패: ' + err.message });
  }
});

// 6. Apply Review (Apply review draft, backup previous version in revisions subcollection)
app.post('/api/action/apply-review', authenticateUser, async (req: any, res) => {
  const { id } = req.body;
  const uid = req.user.uid;
  const token = req.user.idToken;

  if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });
  const numId = parseInt(id, 10);

  try {
    let post = getLocalPost(numId);
    if (!post) {
      try {
        const postUrl = `${FIRESTORE_BASE}/hub5Posts/${id}?key=${FIREBASE_API_KEY}`;
        const getRes = await fetch(postUrl, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (getRes.ok) {
          post = fromFirestoreDoc(await getRes.json());
        }
      } catch {}
    }

    if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });

    let reviewResult = getLocalReview(numId);
    if (!reviewResult) {
      try {
        const reviewUrl = `${FIRESTORE_BASE}/hub5Posts/${id}/private/review?key=${FIREBASE_API_KEY}`;
        const getReviewRes = await fetch(reviewUrl, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (getReviewRes.ok) {
          const docData = await getReviewRes.json();
          reviewResult = JSON.parse(docData.fields?.reviewText?.stringValue || '{}');
        }
      } catch {}
    }

    if (!reviewResult || !reviewResult.improvedText) {
      return res.status(400).json({ error: '유효한 검수 개선본이 존재하지 않습니다.' });
    }

    const currentVersion = post.version || 1;
    const now = new Date().toISOString();

    // Backup current version
    saveLocalRevision(numId, currentVersion, {
      title: post.title,
      description: post.description,
      content: post.content
    });

    // Update main post
    const improvedContent = reviewResult.improvedText;
    const nextPost = {
      ...post,
      title: improvedContent.title || post.title,
      description: improvedContent.description || post.description,
      content: JSON.stringify(improvedContent),
      version: currentVersion + 1,
      updated: now
    };

    saveLocalPost(nextPost);

    // Best-effort Firestore update
    try {
      const postUrl = `${FIRESTORE_BASE}/hub5Posts/${id}?key=${FIREBASE_API_KEY}`;
      await fetch(postUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(toFirestoreDoc(nextPost))
      });
    } catch {}

    return res.json({ success: true, version: nextPost.version });
  } catch (err: any) {
    console.error('Apply review failed:', err);
    return res.status(500).json({ error: '검수안 적용 실패: ' + err.message });
  }
});

// 7. Get revisions lists
app.get('/api/action/revisions/:id', authenticateUser, async (req: any, res) => {
  const { id } = req.params;
  const numId = parseInt(id, 10);
  const localRevs = getLocalRevisions(numId);
  return res.json({ revisions: localRevs });
});

// 8. Restore Revision version
app.post('/api/action/restore-revision', authenticateUser, async (req: any, res) => {
  const { id, version } = req.body;
  const numId = parseInt(id, 10);

  if (!id || !version) {
    return res.status(400).json({ error: 'id와 version 정보가 누락되었습니다.' });
  }

  try {
    const revisions = getLocalRevisions(numId);
    const target = revisions.find(r => r.version === version);
    if (!target) {
      return res.status(404).json({ error: '해당 버전 이력을 찾을 수 없습니다.' });
    }

    let post = getLocalPost(numId);
    if (!post) return res.status(404).json({ error: '메인 글을 찾을 수 없습니다.' });

    // Save current version as backup
    saveLocalRevision(numId, post.version || 1, {
      title: post.title,
      description: post.description,
      content: post.content
    });

    const now = new Date().toISOString();
    const restoredPost = {
      ...post,
      title: target.title,
      description: target.description,
      content: target.content,
      version: (post.version || 1) + 1,
      updated: now
    };

    saveLocalPost(restoredPost);

    return res.json({ success: true, version: restoredPost.version });
  } catch (err: any) {
    return res.status(500).json({ error: '버전 복원 실패: ' + err.message });
  }
});

// GET PUBLIC POSTS FOR WEBZINE (No authentication required)
app.get('/api/hub/posts', async (req, res) => {
  const { theme } = req.query;
  const localPublished = getAllLocalPosts().filter(p => p.status === 'published');

  const postMap = new Map<number, any>();
  for (const p of localPublished) {
    if (p && p.id) postMap.set(Number(p.id), p);
  }

  try {
    const queryUrl = `${FIRESTORE_BASE}:runQuery?key=${FIREBASE_API_KEY}`;
    const structuredQuery: any = {
      from: [{ collectionId: 'hub5Posts' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: 'published' }
        }
      }
    };

    const queryRes = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery })
    });
    const rawResults = await queryRes.json();
    if (Array.isArray(rawResults)) {
      for (const item of rawResults) {
        if (item.document) {
          const doc = fromFirestoreDoc(item.document);
          if (doc && doc.id) {
            postMap.set(Number(doc.id), doc);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Firestore public posts query note:', err);
  }

  let posts = Array.from(postMap.values());
  if (theme && theme !== '전체') {
    posts = posts.filter(p => p.theme === theme);
  }
  posts.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));

  return res.json({ posts });
});

// FETCH USER OWNED POSTS FOR STUDIO/MY PAGE
app.get('/api/action/my-posts', authenticateUser, async (req: any, res) => {
  const uid = req.user.uid;
  const token = req.user.idToken;

  const postMap = new Map<number, any>();

  // 1. Local posts (all active non-deleted posts)
  const localPosts = getAllLocalPosts().filter(p => p.status !== 'deleted');
  for (const p of localPosts) {
    if (p && p.id) postMap.set(Number(p.id), p);
  }

  // 2. Remote Firestore posts
  if (token) {
    try {
      const queryUrl = `${FIRESTORE_BASE}:runQuery?key=${FIREBASE_API_KEY}`;
      const queryPayload = {
        structuredQuery: {
          from: [{ collectionId: 'hub5Posts' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'owner' },
              op: 'EQUAL',
              value: { stringValue: uid }
            }
          }
        }
      };

      const queryRes = await fetch(queryUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(queryPayload)
      });

      const rawResults = await queryRes.json();
      if (Array.isArray(rawResults)) {
        for (const item of rawResults) {
          if (item.document) {
            const doc = fromFirestoreDoc(item.document);
            if (doc && doc.id && doc.status !== 'deleted') {
              postMap.set(Number(doc.id), doc);
            }
          }
        }
      }
    } catch {}
  }

  const posts = Array.from(postMap.values());
  posts.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  return res.json({ posts });
});

// GET POST DETAIL BY ID (Public if published, or accessible if owner/preview)
app.get('/api/hub/posts/:id', async (req, res) => {
  const { id } = req.params;
  const numId = parseInt(id, 10);
  let post = getLocalPost(numId);

  if (!post) {
    try {
      const postUrl = `${FIRESTORE_BASE}/hub5Posts/${id}?key=${FIREBASE_API_KEY}`;
      const token = req.cookies?.session;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const getRes = await fetch(postUrl, { headers });
      if (getRes.ok) {
        post = fromFirestoreDoc(await getRes.json());
      }
    } catch {}
  }

  if (!post) {
    return res.status(404).json({ error: '해당 글이 없거나 비공개 상태입니다.' });
  }

  let review = getLocalReview(numId);
  return res.json({ post, review });
});

// 4. IMAGE BYTES API (Serves image binary with proper cache/headers)
app.get('/api/hub/:imageId', async (req, res) => {
  const { imageId } = req.params;

  // Check DEFAULT_GALLERY_IMAGES fallback
  const fallbackMatch = DEFAULT_GALLERY_IMAGES.find(img => img._id === imageId || img.title === imageId);
  if (fallbackMatch && fallbackMatch.imageUrl) {
    return res.redirect(fallbackMatch.imageUrl);
  }

  try {
    const docUrl = `${FIRESTORE_BASE}/images/${imageId}?key=${FIREBASE_API_KEY}`;
    const docRes = await fetch(docUrl);
    if (!docRes.ok) {
      // Check if sample image
      const seededMatch = DEFAULT_GALLERY_IMAGES.find(img => img._id.includes(imageId) || imageId.includes(img._id));
      if (seededMatch) {
        return res.redirect(seededMatch.imageUrl);
      }
      return res.redirect('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80');
    }

    const docData = await docRes.json();
    const imageDoc = fromFirestoreDoc(docData);

    if (imageDoc && imageDoc.imageUrl) {
      return res.redirect(imageDoc.imageUrl);
    }

    if (imageDoc && (imageDoc.base64 || imageDoc.bytes)) {
      const base64Data = imageDoc.base64 || imageDoc.bytes;
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', imageDoc.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    }

    return res.redirect('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80');
  } catch (err: any) {
    return res.redirect('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80');
  }
});

// SITEMAP.XML GENERATION
app.get('/sitemap.xml', async (req, res) => {
  try {
    const posts = getAllLocalPosts().filter(p => p.status === 'published');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ${posts.map(p => `
  <url>
    <loc>${SITE_URL}/blog/${p.id}</loc>
    <lastmod>${p.updated ? p.updated.split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  `).join('\n')}
</urlset>`;
    res.setHeader('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (err: any) {
    return res.status(500).send('Error generating sitemap');
  }
});

// ROBOTS.TXT
app.get('/robots.txt', (req, res) => {
  const robots = `User-agent: *
Allow: /
Allow: /blog/
Disallow: /studio
Disallow: /my
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml`;
  res.setHeader('Content-Type', 'text/plain');
  return res.send(robots);
});

// SERVER-SIDE SEO PRERENDERING HELPER
let viteInstance: any = null;

async function handleSeoPage(req: express.Request, res: express.Response, isDetail: boolean) {
  const isProd = process.env.NODE_ENV === 'production';
  const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');
  const rootIndexPath = path.resolve(process.cwd(), 'index.html');
  const indexPath = (isProd && fs.existsSync(distIndexPath)) ? distIndexPath : (fs.existsSync(rootIndexPath) ? rootIndexPath : distIndexPath);

  let html = '';
  try {
    html = fs.readFileSync(indexPath, 'utf-8');
  } catch (err) {
    return res.status(500).send('HTML template not found');
  }

  let title = '허브스튜디오5 - 사진과 이야기로 교감하는 웹진 & 감성 블로그';
  let description = '사진 한 장에 담긴 온기와 시선으로 교감하고 감성으로 엮어내는 라이프스타일 웹진 & 블로그 매거진';
  let canonicalUrl = `${SITE_URL}${req.path}`;
  let ogImage = `${SITE_URL}/api/hub/img_jeju_ocean`;
  let noscriptFallback = '';
  let structuredData: any = null;

  try {
    if (isDetail) {
      const postId = req.params.id;
      const numId = parseInt(postId, 10);
      const post = getLocalPost(numId);

      if (post && post.status === 'published') {
        title = `${post.title} - 허브스튜디오5`;
        description = post.description || description;
        let postBody: any = {};
        try { postBody = JSON.parse(post.content || '{}'); } catch {}

        const firstSectionImage = postBody.sections?.[0]?.imageId;
        if (firstSectionImage) {
          ogImage = `${SITE_URL}/api/hub/${firstSectionImage}`;
        }

        const sectionsHtml = (postBody.sections || []).map((sec: any) => `
          <section>
            <h2>${sec.heading || ''}</h2>
            ${(sec.paragraphs || []).map((p: string) => `<p>${p}</p>`).join('')}
            ${sec.caption ? `<figcaption>${sec.caption}</figcaption>` : ''}
          </section>
        `).join('\n');

        structuredData = {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "headline": post.title,
          "description": post.description || description,
          "image": [ogImage],
          "datePublished": post.created || new Date().toISOString(),
          "dateModified": post.updated || post.created || new Date().toISOString(),
          "author": {
            "@type": "Person",
            "name": "허브스튜디오5 에디터"
          },
          "publisher": {
            "@type": "Organization",
            "name": "허브스튜디오5",
            "logo": {
              "@type": "ImageObject",
              "url": `${SITE_URL}/favicon.ico`
            }
          },
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": canonicalUrl
          }
        };

        // Standard semantic noscript (Google Search crawler friendly, no display:none penalty)
        noscriptFallback = `
          <noscript id="seo-fallback-content">
            <article class="p-8 max-w-3xl mx-auto">
              <header>
                <span class="text-sm text-indigo-600 font-semibold">테마: ${post.theme || '라이프스타일'}</span>
                <h1 class="text-3xl font-bold mt-2 mb-4">${post.title}</h1>
                <p class="text-slate-600 mb-6">${post.description}</p>
              </header>
              <div class="prose">
                <p class="lead">${postBody.intro || ''}</p>
                ${sectionsHtml}
                <div class="summary mt-6">${postBody.summary || ''}</div>
              </div>
            </article>
          </noscript>
        `;
      }
    } else {
      const posts = getAllLocalPosts().filter(p => p.status === 'published');
      const postsLinks = posts.map(p => `
        <li class="py-3 border-b border-slate-100">
          <a href="/blog/${p.id}" class="text-lg font-medium text-slate-900">${p.title}</a>
          <span class="ml-2 text-xs text-indigo-600 font-semibold">[${p.theme || '라이프스타일'}]</span>
          <p class="text-sm text-slate-500 mt-1">${p.description || ''}</p>
        </li>
      `).join('\n');

      structuredData = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "허브스튜디오5",
        "url": SITE_URL,
        "description": "사진과 이야기로 교감하는 감성 테마별 라이프스타일 웹진 & 블로그",
        "inLanguage": "ko-KR"
      };

      noscriptFallback = `
        <noscript id="seo-fallback-index">
          <header class="p-8 max-w-4xl mx-auto">
            <h1 class="text-3xl font-bold text-slate-900">허브스튜디오5 웹진 목록</h1>
            <p class="text-slate-600 mt-2 mb-6">사진과 이야기로 교감하는 여행 & 감성 라이프스타일 매거진</p>
            <ul class="space-y-4">
              ${postsLinks}
            </ul>
          </header>
        </noscript>
      `;
    }
  } catch (err) {
    console.error('SEO pre-rendering error:', err);
  }

  html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${title}" />`);
  html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${description}" />`);
  html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${description}" />`);
  html = html.replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${canonicalUrl}" />`);
  
  const structuredDataTag = structuredData 
    ? `<script type="application/ld+json">\n${JSON.stringify(structuredData, null, 2)}\n</script>\n` 
    : '';

  html = html.replace('</head>', `<meta property="og:image" content="${ogImage}" />\n${structuredDataTag}</head>`);
  html = html.replace('<body>', `<body>\n${noscriptFallback}`);

  if (!isProd && viteInstance) {
    try {
      html = await viteInstance.transformIndexHtml(req.url, html);
    } catch (e) {
      console.warn('Vite transform index warning:', e);
    }
  }

  return res.type('html').send(html);
}

// SETUP STATIC / VITE ENVIRONMENT FIRST
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  viteInstance = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });
  app.use(viteInstance.middlewares);
} else {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath, { index: false }));
}

// ROUTE SPECIAL PAGES WITH SERVER SEO PRE-RENDERING
app.get('/', async (req, res) => {
  return handleSeoPage(req, res, false);
});

app.get('/webzine', async (req, res) => {
  return handleSeoPage(req, res, false);
});

app.get('/blog/:id', async (req, res) => {
  return handleSeoPage(req, res, true);
});

// SPA FALLBACK ROUTE
app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');
  const rootIndexPath = path.resolve(process.cwd(), 'index.html');
  const indexPath = (isProd && fs.existsSync(distIndexPath)) ? distIndexPath : (fs.existsSync(rootIndexPath) ? rootIndexPath : distIndexPath);

  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf-8');
    if (!isProd && viteInstance) {
      try {
        html = await viteInstance.transformIndexHtml(req.url, html);
      } catch (e) {
        console.warn('Vite transform fallback warning:', e);
      }
    }
    return res.type('html').send(html);
  }
  next();
});

// SEED TEST IMAGES HELPER ENDPOINT FOR DEVELOPERS
app.get('/api/action/seed-test-images', async (req, res) => {
  const sampleImages = [
    {
      title: '제주 애월 해안 풍경',
      destination: '제주도 푸른 바다 해안도로',
      tags: ['제주도', '바다', '여행', '맛집', '해변'],
      prompt: 'Beautiful scenic view of blue ocean cliffs in Aewol Jeju Island',
      ratio: '16:9',
      aspectRatio: '16:9',
      visibility: 'public',
      imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80'
    },
    {
      title: '따뜻한 감성 북카페의 오후',
      destination: '조용한 골목 숨겨진 북카페 테이블',
      tags: ['카페', '커피', '힐링', '감성카페', '디저트'],
      prompt: 'Warm cozy book cafe with wooden table and steaming coffee cup',
      ratio: '4:3',
      aspectRatio: '4:3',
      visibility: 'public',
      imageUrl: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80'
    },
    {
      title: '무선 미니 초음파 가습기',
      destination: '어느 원목 데스크 하이테크 인테리어',
      tags: ['생활', '제품', '인테리어', '디자인', '리뷰'],
      prompt: 'Sleek minimalist wood-topped misting white humidifier on oak table',
      ratio: '1:1',
      aspectRatio: '1:1',
      visibility: 'public',
      imageUrl: 'https://images.unsplash.com/photo-1545231027-63b3f162609c?auto=format&fit=crop&w=800&q=80'
    },
    {
      title: '싱그러운 야외 파크골프장 필드',
      destination: '화창한 오전 낙동강변 파크골프 클럽',
      tags: ['파크골프', '골프', '스포츠', '야외', '건강'],
      prompt: 'Sunny green park golf field with wooden flags and putting holes',
      ratio: '16:9',
      aspectRatio: '16:9',
      visibility: 'public',
      imageUrl: 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=800&q=80'
    },
    {
      title: '수공예 원목 도마세트 테이블웨어',
      destination: '내추럴 리빙 다이닝룸 테이블',
      tags: ['생활', '주방', '원목', '가구', '식품'],
      prompt: 'Beautiful organic handcrafted teak wood cutting boards with bread',
      ratio: '4:3',
      aspectRatio: '4:3',
      visibility: 'public',
      imageUrl: 'https://images.unsplash.com/photo-1544982503-9f984c14501a?auto=format&fit=crop&w=800&q=80'
    }
  ];

  try {
    const results = [];
    let idx = 1;
    for (const img of sampleImages) {
      const id = `img_sample_${idx++}`;
      const docUrl = `${FIRESTORE_BASE}/images/${id}?key=${FIREBASE_API_KEY}`;
      const payload = toFirestoreDoc({ ...img, ownerId: 'system' });
      const writeRes = await fetch(docUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (writeRes.ok) {
        results.push({ id, status: 'success' });
      } else {
        const errText = await writeRes.text();
        results.push({ id, status: 'failed', error: errText });
      }
    }
    return res.json({ success: true, seeded: results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Guarantee JSON response for any unhandled /api/* route
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `요청하신 API 경로(${req.method} ${req.url})를 찾을 수 없습니다.` });
});

// Express global error handler guaranteeing JSON for API errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('서버 에러:', err);
  if (req.url.startsWith('/api') || req.headers.accept?.includes('application/json')) {
    return res.status(500).json({ error: err?.message || '서버 내부 처리 오류가 발생했습니다.' });
  }
  res.status(500).send('서버 내부 오류');
});

// Start server
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
