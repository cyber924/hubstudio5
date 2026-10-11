/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
  BookOpen, 
  PenTool, 
  Settings, 
  LogIn, 
  LogOut, 
  User, 
  ChevronRight, 
  ChevronLeft,
  Sparkles, 
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Eye, 
  Edit3, 
  RotateCcw, 
  FileText, 
  TrendingUp, 
  Grid, 
  Search, 
  ArrowLeft,
  X,
  Plus,
  RefreshCw,
  Award,
  Check,
  Image as ImageIcon,
  MessageSquare,
  Share2,
  Copy,
  ExternalLink,
  Code
} from 'lucide-react';

// --- TS INTERFACES ---
interface UserSession {
  uid: string;
  email: string;
}

interface PostSection {
  heading: string;
  paragraphs: string[];
  imageId?: string;
  caption?: string;
}

interface PostContent {
  title?: string;
  description?: string;
  intro?: string;
  sections?: PostSection[];
  summary?: string;
  tags?: string[];
}

interface BlogPost {
  id: number;
  owner: string;
  theme: string;
  title: string;
  description: string;
  content: string; // JSON String
  status: 'published' | 'draft' | 'deleted';
  created: string;
  updated: string;
  published: string;
  version: number;
}

interface ReviewResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  improvedText: PostContent;
}

interface GalleryImage {
  id: string;
  title: string;
  destination: string;
  tags: string[];
  prompt?: string;
  ratio?: string;
  previewUrl: string;
  userHint?: string;
}

// --- TOAST CONTEXT ---
interface ToastItem {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

const ToastContext = createContext<{
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}>({
  showToast: () => {}
});

function useToast() {
  return useContext(ToastContext);
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none max-w-md w-11/12">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between gap-3 text-xs font-bold transition-all border animate-in fade-in slide-in-from-top-3 ${
              t.type === 'error'
                ? 'bg-rose-900/95 text-rose-50 border-rose-700/60 shadow-rose-950/20'
                : t.type === 'success'
                ? 'bg-emerald-900/95 text-emerald-50 border-emerald-700/60 shadow-emerald-950/20'
                : 'bg-slate-900/95 text-white border-slate-700/60 shadow-slate-950/20'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {t.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : t.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              )}
              <span className="leading-snug">{t.message}</span>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-white/60 hover:text-white cursor-pointer ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// --- AUTH CONTEXT ---
interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (e: string, p: string) => Promise<void>;
  register: (e: string, p: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

// Resilient API response parser that safely handles JSON or server HTML errors
async function safeApiCall(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `요청 실패 (${res.status})`);
      }
      return data;
    } catch (e: any) {
      throw new Error(e.message || '응답 데이터 파싱 실패');
    }
  }

  // Non-JSON response (e.g., HTML from proxy or Vercel rewrite)
  const text = await res.text();
  console.warn('Non-JSON response from ' + url + ':', text.slice(0, 200));
  if (!res.ok) {
    throw new Error(`서버 응답 상태코드 (${res.status}). 잠시 후 다시 시도해 주세요.`);
  }
  throw new Error('서버에서 올바른 JSON 형식 데이터를 반환하지 않았습니다.');
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) return res.json();
        return { user: null };
      })
      .then(data => {
        if (data.user) setUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await safeApiCall('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    setUser({ uid: data.uid, email: data.email });
  };

  const register = async (email: string, password: string) => {
    const data = await safeApiCall('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    setUser({ uid: data.uid, email: data.email });
  };

  const demoLogin = async () => {
    const data = await safeApiCall('/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    setUser({ uid: data.uid, email: data.email });
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, demoLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// --- BLOG EXPORT HELPERS & MODAL (네이버 블로그 / 티스토리 / 브런치 서식 내보내기) ---
type ExportPlatform = 'naver' | 'tistory' | 'brunch';

function generateExportHtml(post: any, platform: ExportPlatform): string {
  let contentObj: PostContent = {};
  try {
    contentObj = typeof post.content === 'string' ? JSON.parse(post.content) : (post.content || {});
  } catch {}

  const origin = window.location.origin;
  const sections = contentObj.sections || [];
  const tags = contentObj.tags || [];

  if (platform === 'naver') {
    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 720px; margin: 0 auto; line-height: 1.85; color: #334155;">
  <p style="font-size: 13px; font-weight: 700; color: #03c75a; margin: 0 0 8px 0;">[${post.theme || '라이프'}]</p>
  <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1.35; margin: 0 0 12px 0;">${post.title || ''}</h1>
  <p style="font-size: 14px; color: #64748b; margin: 0 0 24px 0;">${post.description || ''}</p>
  
  ${contentObj.intro ? `
  <div style="background-color: #f8fafc; border-left: 4px solid #03c75a; padding: 16px 20px; border-radius: 0 10px 10px 0; margin: 24px 0; font-size: 15px; color: #334155; font-style: italic;">
    "${contentObj.intro}"
  </div>` : ''}

  <div style="margin: 28px 0;">
    ${sections.map((s: any) => `
      <div style="margin-bottom: 36px;">
        <h2 style="font-size: 19px; font-weight: 700; color: #0f172a; margin: 28px 0 14px 0; border-bottom: 2px solid #03c75a; padding-bottom: 6px; display: inline-block;">
          ${s.heading}
        </h2>
        ${s.imageId ? `
        <div style="margin: 18px 0; text-align: center;">
          <img src="${origin}/api/hub/${s.imageId}" alt="${s.heading}" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);" />
          ${s.caption ? `<p style="font-size: 12px; color: #94a3b8; margin-top: 8px; font-style: italic;">📷 ${s.caption}</p>` : ''}
        </div>` : ''}
        ${(s.paragraphs || []).map((p: string) => `
          <p style="font-size: 15px; line-height: 1.9; color: #334155; margin: 12px 0;">${p}</p>
        `).join('')}
      </div>
    `).join('')}
  </div>

  ${contentObj.summary ? `
  <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 20px; margin: 32px 0; color: #166534;">
    <h3 style="font-size: 15px; font-weight: 700; color: #03c75a; margin: 0 0 8px 0;">🌿 에디터 추천 포인트 & 총평</h3>
    <p style="font-size: 14px; line-height: 1.8; margin: 0;">${contentObj.summary}</p>
  </div>` : ''}

  ${tags.length > 0 ? `
  <div style="margin-top: 30px; padding-top: 16px; border-top: 1px dashed #e2e8f0;">
    <p style="font-size: 13px; font-weight: 700; color: #03c75a; margin: 0;">
      ${tags.map((t: string) => `#${t.replace(/^#/, '')}`).join(' ')}
    </p>
  </div>` : ''}
</div>`;
  }

  if (platform === 'tistory') {
    return `<div class="tistory-post-wrap" style="max-width: 760px; margin: 0 auto; line-height: 1.9; color: #333;">
  <p style="font-size: 13px; color: #ee6c4d; font-weight: bold; margin: 0 0 8px 0;">[${post.theme || '카테고리'}]</p>
  <h1 style="font-size: 28px; font-weight: bold; margin: 0 0 12px 0; color: #111;">${post.title || ''}</h1>
  <p style="font-size: 15px; color: #777; margin: 0 0 30px 0;">${post.description || ''}</p>

  ${contentObj.intro ? `
  <blockquote style="margin: 24px 0; padding: 16px 20px; border-left: 4px solid #ee6c4d; background: #fafafa; color: #555; font-style: italic;">
    ${contentObj.intro}
  </blockquote>` : ''}

  ${sections.map((s: any) => `
    <h2 style="font-size: 20px; font-weight: bold; color: #222; margin: 32px 0 16px 0;">${s.heading}</h2>
    ${s.imageId ? `
    <figure style="margin: 20px 0; text-align: center;">
      <img src="${origin}/api/hub/${s.imageId}" alt="${s.heading}" style="max-width: 100%; border-radius: 8px;" />
      ${s.caption ? `<figcaption style="font-size: 12px; color: #888; margin-top: 6px;">${s.caption}</figcaption>` : ''}
    </figure>` : ''}
    ${(s.paragraphs || []).map((p: string) => `
      <p style="font-size: 15px; line-height: 1.9; margin: 12px 0;">${p}</p>
    `).join('')}
  `).join('')}

  ${contentObj.summary ? `
  <div style="background: #fff7ed; border-left: 4px solid #ee6c4d; padding: 18px 20px; margin: 36px 0; border-radius: 4px;">
    <h3 style="font-size: 15px; font-weight: bold; color: #ee6c4d; margin: 0 0 8px 0;">💡 요약 및 에디터 소감</h3>
    <p style="font-size: 14px; margin: 0; color: #555;">${contentObj.summary}</p>
  </div>` : ''}

  ${tags.length > 0 ? `
  <div style="margin-top: 36px; padding-top: 16px; border-top: 1px solid #eee;">
    <p style="font-size: 13px; color: #ee6c4d; font-weight: bold; margin: 0;">
      ${tags.map((t: string) => `#${t.replace(/^#/, '')}`).join(' ')}
    </p>
  </div>` : ''}
</div>`;
  }

  // Brunch
  return `<div class="brunch-post-wrap" style="font-family: 'Noto Serif KR', Georgia, serif; max-width: 680px; margin: 0 auto; line-height: 2.1; color: #2c3e50;">
  <p style="font-size: 12px; letter-spacing: 2px; color: #95a5a6; text-transform: uppercase; margin: 0 0 8px 0;">${post.theme || 'BRUNCH ESSAY'}</p>
  <h1 style="font-size: 32px; font-weight: 300; letter-spacing: -0.5px; margin: 0 0 16px 0; color: #1a252f; line-height: 1.35;">${post.title || ''}</h1>
  <p style="font-size: 15px; color: #7f8c8d; font-weight: 300; margin: 0 0 40px 0; line-height: 1.8;">${post.description || ''}</p>
  <div style="width: 40px; height: 1px; background: #bdc3c7; margin: 30px 0;"></div>

  ${contentObj.intro ? `
  <div style="font-size: 16px; color: #576574; margin: 30px 0; font-style: italic; letter-spacing: -0.2px;">
    ${contentObj.intro}
  </div>` : ''}

  ${sections.map((s: any) => `
    <h2 style="font-size: 21px; font-weight: 400; color: #2c3e50; margin: 44px 0 20px 0; letter-spacing: -0.3px;">${s.heading}</h2>
    ${s.imageId ? `
    <div style="margin: 28px 0; text-align: center;">
      <img src="${origin}/api/hub/${s.imageId}" alt="${s.heading}" style="max-width: 100%; border-radius: 4px;" />
      ${s.caption ? `<p style="font-size: 12px; color: #95a5a6; margin-top: 8px;">${s.caption}</p>` : ''}
    </div>` : ''}
    ${(s.paragraphs || []).map((p: string) => `
      <p style="font-size: 15px; line-height: 2.1; margin: 18px 0; color: #34495e;">${p}</p>
    `).join('')}
  `).join('')}

  ${contentObj.summary ? `
  <div style="margin: 48px 0; padding: 24px; background-color: #fbfbfc; border-radius: 4px; border: 1px solid #f0f0f2;">
    <h3 style="font-size: 14px; font-weight: 600; color: #2c3e50; margin: 0 0 10px 0;">에디터 노트</h3>
    <p style="font-size: 14px; color: #7f8c8d; margin: 0; line-height: 1.9;">${contentObj.summary}</p>
  </div>` : ''}

  ${tags.length > 0 ? `
  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
    <p style="font-size: 13px; color: #7f8c8d; margin: 0;">
      ${tags.map((t: string) => `#${t.replace(/^#/, '')}`).join(' ')}
    </p>
  </div>` : ''}
</div>`;
}

function generateExportText(post: any, platform: ExportPlatform): string {
  let contentObj: PostContent = {};
  try {
    contentObj = typeof post.content === 'string' ? JSON.parse(post.content) : (post.content || {});
  } catch {}

  const sections = contentObj.sections || [];
  const tags = contentObj.tags || [];
  const origin = window.location.origin;

  let text = `[${post.theme || '테마'}] ${post.title}\n\n`;
  if (post.description) text += `${post.description}\n\n`;
  if (contentObj.intro) text += `"${contentObj.intro}"\n\n--------------------\n\n`;

  sections.forEach((s: any, idx: number) => {
    text += `[섹션 ${idx + 1}] ${s.heading}\n\n`;
    if (s.imageId) {
      text += `[사진 첨부: ${origin}/api/hub/${s.imageId}]\n`;
      if (s.caption) text += `(사진 캡션: ${s.caption})\n\n`;
    }
    (s.paragraphs || []).forEach((p: string) => {
      text += `${p}\n\n`;
    });
  });

  if (contentObj.summary) {
    text += `--------------------\n🌿 에디터 요약 & 소감\n${contentObj.summary}\n\n`;
  }

  if (tags.length > 0) {
    text += tags.map((t: string) => `#${t.replace(/^#/, '')}`).join(' ');
  }

  return text;
}

interface BlogExportModalProps {
  post: any;
  isOpen: boolean;
  onClose: () => void;
}

function BlogExportModal({ post, isOpen, onClose }: BlogExportModalProps) {
  const { showToast } = useToast();
  const [platform, setPlatform] = useState<ExportPlatform>('naver');
  const [viewMode, setViewMode] = useState<'preview' | 'html' | 'text'>('preview');
  const [copied, setCopied] = useState<string | null>(null);

  if (!isOpen || !post) return null;

  const htmlContent = generateExportHtml(post, platform);
  const textContent = generateExportText(post, platform);

  const platforms: { id: ExportPlatform; name: string; tag: string; badgeBg: string; activeBorder: string; link: string; linkName: string }[] = [
    {
      id: 'naver',
      name: '네이버 블로그',
      tag: '스마트에디터 ONE 서식',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      activeBorder: 'border-emerald-500 bg-emerald-50/40 text-emerald-900',
      link: 'https://blog.naver.com/',
      linkName: '네이버 블로그 바로가기'
    },
    {
      id: 'tistory',
      name: '티스토리',
      tag: '모던 웹 HTML 서식',
      badgeBg: 'bg-orange-50 text-orange-700 border-orange-200',
      activeBorder: 'border-orange-500 bg-orange-50/40 text-orange-900',
      link: 'https://www.tistory.com/',
      linkName: '티스토리 바로가기'
    },
    {
      id: 'brunch',
      name: '브런치스토리',
      tag: '감성 에세이 서식',
      badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
      activeBorder: 'border-slate-800 bg-slate-100/60 text-slate-900',
      link: 'https://brunch.co.kr/',
      linkName: '브런치스토리 바로가기'
    }
  ];

  const currentPlatformInfo = platforms.find(p => p.id === platform)!;

  const handleCopyRichText = async () => {
    try {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([textContent], { type: 'text/plain' });

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          })
        ]);
      } else {
        await navigator.clipboard.writeText(textContent);
      }
      setCopied('rich');
      setTimeout(() => setCopied(null), 3000);
      showToast(`${currentPlatformInfo.name} 맞춤 서식이 클립보드에 복사되었습니다! 에디터에서 Ctrl+V(붙여넣기) 하세요.`, 'success');
    } catch {
      await navigator.clipboard.writeText(textContent);
      setCopied('rich');
      setTimeout(() => setCopied(null), 3000);
      showToast('텍스트가 클립보드에 복사되었습니다.', 'info');
    }
  };

  const handleCopyHtml = async () => {
    await navigator.clipboard.writeText(htmlContent);
    setCopied('html');
    setTimeout(() => setCopied(null), 3000);
    showToast('HTML 코드가 복사되었습니다. HTML 모드에 붙여넣기 하세요.', 'success');
  };

  const handleCopyText = async () => {
    await navigator.clipboard.writeText(textContent);
    setCopied('text');
    setTimeout(() => setCopied(null), 3000);
    showToast('순수 텍스트가 복사되었습니다.', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                <Share2 className="w-4 h-4" />
              </span>
              <h2 className="text-base font-extrabold text-slate-900">블로그 원클릭 서식 내보내기</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                #{post.id} {post.theme}
              </span>
            </div>
            <p className="text-xs text-slate-400">네이버 블로그, 티스토리, 브런치 서식에 맞춰 한 번의 클릭으로 클립보드에 복사합니다.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Selector Tabs */}
        <div className="px-6 pt-4 pb-3 bg-white border-b border-slate-100">
          <div className="grid grid-cols-3 gap-3">
            {platforms.map(p => {
              const isActive = platform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`p-3 rounded-2xl border-2 text-left transition cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? p.activeBorder + ' shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs">{p.name}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-current shrink-0" />}
                  </div>
                  <span className="text-[10px] font-medium text-slate-400 mt-1">{p.tag}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Bar */}
        <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyRichText}
              className={`px-4 py-2 rounded-xl text-xs font-black shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                copied === 'rich'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {copied === 'rich' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === 'rich' ? '서식 복사완료!' : '✨ 서식 유지 복사 (원클릭)'}
            </button>

            <button
              onClick={handleCopyHtml}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1 cursor-pointer ${
                copied === 'html'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              HTML 코드 복사
            </button>

            <button
              onClick={handleCopyText}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1 cursor-pointer ${
                copied === 'text'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              텍스트 복사
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex p-0.5 bg-slate-200/60 rounded-xl text-[11px] font-bold">
              <button
                onClick={() => setViewMode('preview')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  viewMode === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                미리보기
              </button>
              <button
                onClick={() => setViewMode('html')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  viewMode === 'html' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                HTML
              </button>
              <button
                onClick={() => setViewMode('text')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  viewMode === 'text' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                텍스트
              </button>
            </div>

            <a
              href={currentPlatformInfo.link}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition"
            >
              <span>{currentPlatformInfo.name}</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/40">
          {viewMode === 'preview' && (
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs">
              <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
            </div>
          )}

          {viewMode === 'html' && (
            <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
              <pre>{htmlContent}</pre>
            </div>
          )}

          {viewMode === 'text' && (
            <div className="bg-white p-6 rounded-2xl font-sans text-xs text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-200">
              {textContent}
            </div>
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-6 py-3.5 bg-emerald-50/70 border-t border-emerald-100/80 flex items-center justify-between text-xs text-emerald-950 font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>원클릭 서식 복사</strong> 후 {currentPlatformInfo.name} 글쓰기 창에서 <strong>Ctrl+V</strong>를 누르면 제목·인용구·사진 배치가 서식 그대로 자동 적용됩니다.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-emerald-200 text-emerald-800 rounded-xl font-bold hover:bg-emerald-50 transition cursor-pointer shrink-0 ml-3"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// --- APP LAYOUT ---
function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-400 flex items-center justify-center text-white font-extrabold shadow-sm">
              H5
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-slate-900 to-indigo-950 bg-clip-text text-transparent">HubStudio 5</span>
              <span className="text-[10px] block font-semibold text-indigo-600 tracking-wider -mt-1 uppercase">감성 웹진 & 블로그</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <Link to="/" className="text-slate-600 hover:text-indigo-600 transition">웹진</Link>
            {user && (
              <>
                <Link to="/studio" className="text-slate-600 hover:text-indigo-600 transition flex items-center gap-1.5">
                  <PenTool className="w-4 h-4" /> 글 작성
                </Link>
                <Link to="/my" className="text-slate-600 hover:text-indigo-600 transition flex items-center gap-1.5">
                  <Settings className="w-4 h-4" /> 내 글 관리
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-4 text-sm">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden lg:flex flex-col items-end">
                  <span className="font-semibold text-slate-800 text-xs">{user.email}</span>
                  <span className="text-[10px] text-slate-400">작가 계정</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                  {user.email[0].toUpperCase()}
                </div>
                <button 
                  onClick={() => { logout().then(() => navigate('/')); }}
                  className="p-2 rounded-lg text-slate-500 hover:text-red-500 hover:bg-slate-100 transition"
                  title="로그아웃"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link 
                to="/login" 
                className="inline-flex items-center gap-1.5 px-4  py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition"
              >
                <LogIn className="w-4 h-4" /> 작가 로그인
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<WebzineHome />} />
          <Route path="/blog/:id" element={<BlogDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/my" element={<MyPosts />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-12">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">
              H5
            </div>
            <span className="text-white font-bold text-sm tracking-wide">HubStudio 5</span>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-xs font-medium">
            <Link to="/" className="hover:text-white transition">웹진</Link>
            <a href="/robots.txt" className="hover:text-white transition">robots.txt</a>
            <a href="/sitemap.xml" className="hover:text-white transition">sitemap.xml</a>
          </div>
          <p className="text-xs text-slate-500 font-normal">
            &copy; 2026 HubStudio 5. All rights reserved. 라이프스타일 감성 매거진 & 블로그 퍼블리셔
          </p>
        </div>
      </footer>
    </div>
  );
}

// --- COMPONENT: WEBZINE HOME ---
function WebzineHome() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const activeTheme = searchParams.get('theme') || '';

  const themes = ['전체', '여행·맛집', '카페', '생활', '제품', '파크골프'];

  useEffect(() => {
    setLoading(true);
    let url = '/api/hub/posts';
    if (activeTheme && activeTheme !== '전체') {
      url += `?theme=${encodeURIComponent(activeTheme)}`;
    }

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.posts) setPosts(data.posts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTheme]);

  const filteredPosts = posts.filter(post => {
    const titleMatch = post.title.toLowerCase().includes(searchQuery.toLowerCase());
    const descMatch = post.description.toLowerCase().includes(searchQuery.toLowerCase());
    return titleMatch || descMatch;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Hero */}
      <div className="bg-gradient-to-tr from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-8 md:p-12 text-white mb-10 shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold tracking-wider uppercase mb-4 inline-block border border-indigo-500/30">
            HubStudio 5 Webzine
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4 leading-tight">
            이미지로 교감하고,<br />
            감성으로 쓰다.
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-6 font-normal">
            여행지에서의 정취, 일상 속 작은 맛집과 카페, 소중한 기록, 파크골프의 즐거움까지 — 사진 한 장에 담긴 교감과 따스한 시선으로 엮어낸 깊이 있는 라이프스타일 매거진을 만나보세요.
          </p>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-20 bg-radial-gradient from-indigo-500 to-transparent pointer-events-none hidden md:block"></div>
      </div>

      {/* Theme Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap gap-2">
          {themes.map(t => {
            const isSelected = activeTheme === t || (t === '전체' && !activeTheme);
            return (
              <button
                key={t}
                onClick={() => {
                  if (t === '전체') {
                    searchParams.delete('theme');
                  } else {
                    searchParams.set('theme', t);
                  }
                  setSearchParams(searchParams);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-200 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="글 제목 또는 소개 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Loading & Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 animate-pulse">
              <div className="w-1/3 h-5 bg-slate-200 rounded-lg"></div>
              <div className="w-full h-24 bg-slate-100 rounded-xl"></div>
              <div className="space-y-2">
                <div className="w-full h-4 bg-slate-200 rounded-md"></div>
                <div className="w-2/3 h-4 bg-slate-200 rounded-md"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 p-8">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-slate-800 font-bold text-base">발행된 글이 존재하지 않습니다.</h3>
          <p className="text-slate-400 text-xs mt-1">테마를 변경하거나 다른 검색어로 다시 검색해 보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map(post => {
            const bodyObj = JSON.parse(post.content || '{}') as PostContent;
            // Get cover image if exists
            const coverImageId = bodyObj.sections?.find(s => s.imageId)?.imageId;
            return (
              <article 
                key={post.id} 
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col"
              >
                {coverImageId ? (
                  <div className="h-44 w-full overflow-hidden bg-slate-100 relative">
                    <img 
                      src={`/api/hub/${coverImageId}`} 
                      alt={post.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      loading="lazy"
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur-xs rounded-full text-[10px] font-bold text-indigo-600 shadow-sm border border-indigo-500/10">
                      {post.theme}
                    </div>
                  </div>
                ) : (
                  <div className="h-44 w-full bg-slate-50 flex items-center justify-center relative border-b border-slate-100">
                    <BookOpen className="w-8 h-8 text-slate-300" />
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-white rounded-full text-[10px] font-bold text-slate-600 shadow-xs border border-slate-200">
                      {post.theme}
                    </div>
                  </div>
                )}
                
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <span className="text-[10px] font-semibold text-slate-400">#No.{post.id}</span>
                    <h2 className="text-base font-bold text-slate-900 leading-snug line-clamp-2 hover:text-indigo-600">
                      <Link to={`/blog/${post.id}`}>{post.title}</Link>
                    </h2>
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                      {post.description || bodyObj.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {new Date(post.published || post.created).toLocaleDateString()}
                    </span>
                    <Link 
                      to={`/blog/${post.id}`} 
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
                    >
                      상세 보기 <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- COMPONENT: BLOG DETAIL ---
function BlogDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/hub/posts/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('해당 글이 없거나 읽기 권한이 없습니다.');
        return res.json();
      })
      .then(data => {
        setPost(data.post);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 animate-pulse space-y-6">
        <div className="h-8 bg-slate-200 rounded-md w-3/4"></div>
        <div className="h-4 bg-slate-200 rounded-md w-1/4"></div>
        <div className="h-40 bg-slate-100 rounded-xl w-full"></div>
        <div className="space-y-3">
          <div className="h-4 bg-slate-200 rounded-md w-full"></div>
          <div className="h-4 bg-slate-200 rounded-md w-full"></div>
          <div className="h-4 bg-slate-200 rounded-md w-2/3"></div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">조회 실패</h2>
        <p className="text-slate-500 text-sm mb-6">{error || '글을 가져오지 못했습니다.'}</p>
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> 웹진으로 돌아가기
        </Link>
      </div>
    );
  }

  const contentObj = JSON.parse(post.content || '{}') as PostContent;
  const isOwner = user && user.uid === post.owner;

  return (
    <div className="bg-white min-h-screen pb-20">
      {/* Optional Creator Notification Bar */}
      {isOwner && (
        <div className="bg-indigo-50 border-b border-indigo-100 py-3.5 px-4 text-center">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-indigo-950 font-medium">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>작성자 본인 계정으로 확인 중입니다. 수정이나 글 검수 작업은 내 글 관리 메뉴에서 바로 하실 수 있습니다.</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowExportModal(true)}
                className="px-3.5 py-1.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition flex items-center gap-1"
              >
                <Share2 className="w-3.5 h-3.5" /> 블로그 내보내기
              </button>
              <Link 
                to="/my" 
                className="px-3.5 py-1.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition"
              >
                내 글 관리로 가기
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Hero Header */}
      <div className="border-b border-slate-100 py-12 md:py-16 bg-slate-50/50">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold border border-indigo-500/10">
            {post.theme}
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tight leading-tight">
            {post.title}
          </h1>
          <p className="text-slate-500 text-sm max-w-xl mx-auto font-normal">
            {post.description}
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-400 pt-2 flex-wrap">
            <span>No.{post.id}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>스튜디오 에디터</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>{new Date(post.published || post.created).toLocaleDateString()}</span>
            {post.version > 1 && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span className="text-indigo-500 font-semibold">Ver. {post.version}</span>
              </>
            )}
          </div>

          <div className="pt-2 flex justify-center">
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" /> 블로그 서식 내보내기 (네이버 · 티스토리 · 브런치)
            </button>
          </div>
        </div>
      </div>

      {/* Main Blog Body */}
      <div className="max-w-3xl mx-auto px-4 py-12">
        <article className="prose prose-slate max-w-none">
          {/* Intro */}
          {contentObj.intro && (
            <div className="p-6 md:p-8 bg-slate-50 border-l-4 border-indigo-500 rounded-r-2xl mb-12 text-slate-700 leading-relaxed font-normal italic text-sm md:text-base">
              {contentObj.intro}
            </div>
          )}

          {/* Sections */}
          <div className="space-y-12">
            {contentObj.sections?.map((section, idx) => {
              const isEven = idx % 2 === 0;
              return (
                <div key={idx} className="space-y-6">
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-950 border-b border-slate-100 pb-2">
                    {section.heading}
                  </h2>
                  
                  <div className={`grid grid-cols-1 ${section.imageId ? 'md:grid-cols-12' : 'grid-cols-1'} gap-6 items-start`}>
                    <div className={`${section.imageId ? 'md:col-span-7' : 'w-full'} space-y-4 text-slate-700 leading-relaxed text-sm md:text-base font-normal`}>
                      {section.paragraphs?.map((p, pIdx) => (
                        <p key={pIdx}>{p}</p>
                      ))}
                    </div>

                    {section.imageId && (
                      <div className={`md:col-span-5 ${isEven ? 'md:order-first' : ''} space-y-2`}>
                        <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 shadow-xs">
                          <img 
                            src={`/api/hub/${section.imageId}`} 
                            alt={section.caption || 'Section image'} 
                            className="w-full h-auto object-cover max-h-72"
                            loading="lazy"
                          />
                        </div>
                        {section.caption && (
                          <p className="text-center text-xs text-slate-400 italic">
                            {section.caption}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {contentObj.summary && (
            <div className="mt-16 p-6 bg-indigo-50/50 rounded-2xl border border-indigo-500/10 mb-8">
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-1.5 mb-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                에디터 요약 및 소감
              </h3>
              <p className="text-xs md:text-sm text-slate-700 leading-relaxed font-normal">
                {contentObj.summary}
              </p>
            </div>
          )}

          {/* Tags */}
          {contentObj.tags && contentObj.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-6 border-t border-slate-100">
              {contentObj.tags.map((tag, idx) => (
                <span 
                  key={idx} 
                  className="px-3 py-1 bg-slate-100 text-slate-600 text-[11px] font-bold rounded-lg hover:bg-slate-200 hover:text-slate-900 transition"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Bottom Export Callout */}
          <div className="mt-12 p-6 bg-gradient-to-r from-emerald-50 to-indigo-50/60 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="text-sm font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1.5">
                <Share2 className="w-4 h-4 text-emerald-600" />
                블로그에 바로 발행하고 싶으신가요?
              </h4>
              <p className="text-xs text-slate-500">네이버 블로그, 티스토리, 브런치 서식으로 서식과 이미지를 그대로 복사해 발행할 수 있습니다.</p>
            </div>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" /> 원클릭 서식 내보내기
            </button>
          </div>
        </article>
      </div>

      <BlogExportModal post={post} isOpen={showExportModal} onClose={() => setShowExportModal(false)} />
    </div>
  );
}

// --- COMPONENT: LOGIN ---
function Login() {
  const { login, register, demoLogin, user } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/studio');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      return setError('이메일과 비밀번호를 모두 입력해 주세요.');
    }
    if (password.length < 6) {
      return setError('비밀번호는 최소 6자리 이상 입력해 주세요.');
    }
    setSubmitting(true);
    setError('');
    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
      navigate('/studio');
    } catch (err: any) {
      setError(err.message || '인증 처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setSubmitting(true);
    setError('');
    try {
      await demoLogin();
      navigate('/studio');
    } catch (err: any) {
      setError(err.message || '체험 로그인 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 font-black text-xl mx-auto">
            H5
          </div>
          <h1 className="text-xl font-bold text-slate-950">
            {isRegister ? '허브스튜디오5 작가 가입' : '허브스튜디오5 작가 로그인'}
          </h1>
          <p className="text-xs text-slate-400">
            {isRegister ? '새로운 스토리 에디터 작가로 합류하세요' : '에디터 계정으로 연동하고 감성 글을 발행해 보세요'}
          </p>
        </div>

        {/* 1-CLICK QUICK DEMO ACCESS */}
        <div>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={submitting}
            className="w-full py-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>1초 작가 체험으로 바로 시작 (입력 없이 즉시 입장)</span>
          </button>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-200 w-full"></div>
          <span className="bg-white px-3 text-[11px] text-slate-400 shrink-0 font-medium">또는 이메일 로그인</span>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2.5 text-xs text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 block">이메일 주소</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="writer@hubstudio.com"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 block">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="•••••••• (6자리 이상)"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-extrabold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:bg-indigo-400 cursor-pointer"
          >
            {submitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isRegister ? (
              '계정 만들기 및 로그인'
            ) : (
              '작가 로그인 완료'
            )}
          </button>
        </form>

        <div className="text-center pt-2 space-y-2">
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
          >
            {isRegister ? '이미 계정이 있으신가요? 로그인' : '에디터 계정이 없으신가요? 가입하기'}
          </button>
          <p className="text-[11px] text-slate-400">
            * 처음 오신 분도 이메일과 비밀번호를 입력하면 안전하게 즉시 작가 계정 등록 및 연동됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

// --- COMPONENT: STUDIO (AI WRITING WITH GALLERY SELECTION) ---
function Studio() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Steps: 1: Theme & Image Selection (2~5), 2: AI Recommendations, 3: ID issue & Generating, 4: Done Preview
  const [step, setStep] = useState(1);
  const [selectedTheme, setSelectedTheme] = useState('전체');
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [imageSearch, setImageSearch] = useState('');

  // Selected images (2 to 5 images in custom storytelling order)
  const [selectedImages, setSelectedImages] = useState<GalleryImage[]>([]);
  const [activeHintId, setActiveHintId] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [recommending, setRecommending] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState('');

  const [issuedId, setIssuedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genStatusText, setGenStatusText] = useState('');
  const [generatedPost, setGeneratedPost] = useState<any>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [exportModalPost, setExportModalPost] = useState<any | null>(null);

  const themes = ['전체', '여행·맛집', '카페', '생활', '제품', '파크골프'];

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      fetchGallery();
    }
  }, [user]);

  const fetchGallery = async () => {
    setGalleryLoading(true);
    try {
      const res = await fetch('/api/hub/gallery-images');
      const data = await res.json();
      if (data.images && data.images.length > 0) {
        setGalleryImages(data.images);
      }
    } catch {
      // ignore
    } finally {
      setGalleryLoading(false);
    }
  };

  // Toggle image selection
  const toggleSelectImage = (img: GalleryImage) => {
    const exists = selectedImages.some(i => i.id === img.id);
    if (exists) {
      setSelectedImages(selectedImages.filter(i => i.id !== img.id));
    } else {
      if (selectedImages.length >= 5) {
        showToast('블로그 글에는 최대 5장까지만 선택할 수 있습니다.', 'info');
        return;
      }
      setSelectedImages([...selectedImages, { ...img, userHint: '' }]);
    }
  };

  // Move selected image position in storyline
  const moveImageSequence = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= selectedImages.length) return;
    const nextList = [...selectedImages];
    const [moved] = nextList.splice(index, 1);
    nextList.splice(targetIdx, 0, moved);
    setSelectedImages(nextList);
  };

  // Update custom user hint for an image
  const updateImageHint = (id: string, hint: string) => {
    setSelectedImages(selectedImages.map(img => img.id === id ? { ...img, userHint: hint } : img));
  };

  // Filter gallery images by theme and search query
  const filteredGallery = galleryImages.filter(img => {
    const themeMatch = selectedTheme === '전체' || img.tags.includes(selectedTheme) || img.title.includes(selectedTheme) || img.destination.includes(selectedTheme);
    const searchMatch = !imageSearch || 
      img.title.toLowerCase().includes(imageSearch.toLowerCase()) ||
      img.destination.toLowerCase().includes(imageSearch.toLowerCase()) ||
      img.tags.some(t => t.toLowerCase().includes(imageSearch.toLowerCase()));
    return themeMatch && searchMatch;
  });

  // Automatically add 1 related photo and request recommendations
  const autoAddOneMoreAndRecommend = () => {
    const unselected = filteredGallery.find(g => !selectedImages.some(s => s.id === g.id)) ||
                       galleryImages.find(g => !selectedImages.some(s => s.id === g.id));
    if (unselected) {
      const updated = [...selectedImages, { ...unselected, userHint: '' }];
      setSelectedImages(updated);
      showToast(`'${unselected.title}' 사진을 자동 추가하여 사진 감성 분석을 진행합니다!`, 'success');
      executeRecommendationWithImages(updated);
    } else {
      showToast('추가 가능한 사진이 없습니다. 갤러리에서 선택해 주세요.', 'info');
    }
  };

  // Helper: Request AI recommendations with specific images
  const executeRecommendationWithImages = async (imagesToAnalyze: GalleryImage[]) => {
    setRecommending(true);
    setRecommendations([]);
    setStep(2);

    try {
      const res = await fetch('/api/action/recommend-from-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: selectedTheme === '전체' ? '여행·라이프' : selectedTheme,
          selectedImages: imagesToAnalyze.map((img, idx) => ({
            id: img.id,
            title: img.title,
            destination: img.destination,
            tags: img.tags,
            userHint: img.userHint || '',
            order: idx + 1
          }))
        })
      });
      const data = await res.json();
      if (data.recommended && data.recommended.length > 0) {
        setRecommendations(data.recommended);
      } else {
        throw new Error(data.error || '추천 목록을 불러오지 못했습니다.');
      }
    } catch (err: any) {
      console.warn('Recommendation fallback used:', err);
      const p1 = imagesToAnalyze[0]?.destination || imagesToAnalyze[0]?.title || '감성 공간';
      const p2 = imagesToAnalyze[1]?.destination || imagesToAnalyze[1]?.title || '명소';
      setRecommendations([
        `${p1}에서 만난 쉼표, ${selectedTheme} 감성 스팟과 여유로운 산책`,
        `렌즈로 담은 특별한 순간: ${p1}부터 ${p2}까지 이어지는 ${selectedTheme} 여행기`,
        `${imagesToAnalyze[0]?.title}의 숨은 매력: 에디터가 추천하는 ${selectedTheme} 코스`,
        `일상에 영감을 더하는 포근한 ${selectedTheme} 이야기`,
        `발길 닿는 곳마다 인생 사진! ${selectedTheme} 감성 스팟 베스트 가이드`
      ]);
    } finally {
      setRecommending(false);
    }
  };

  // Step 1 -> Step 2: Request AI recommendations based on selected 2~5 images
  const handleRequestRecommendations = () => {
    if (selectedImages.length === 0) {
      showToast('갤러리에서 사진을 2장 이상 선택해 주세요 (최대 5장).', 'info');
      return;
    }
    if (selectedImages.length === 1) {
      autoAddOneMoreAndRecommend();
      return;
    }
    executeRecommendationWithImages(selectedImages);
  };

  // Step 2 -> Step 3: Choose Title
  const handleSelectTitle = (title: string) => {
    setSelectedTitle(title);
    setStep(3);
  };

  // Direct fast-track generation from Step 2
  const handleDirectGenerate = (title: string) => {
    setSelectedTitle(title);
    setStep(3);
    executeContentGeneration(title);
  };

  // Step 3 -> Step 4: Issue ID and Generate Content using the exact selected images
  const executeContentGeneration = async (titleToUse: string) => {
    setGenerating(true);
    setGenStatusText('데이터베이스에서 고유 글 번호를 원자적으로 발급하고 있습니다...');

    try {
      // 1. Issue sequence ID
      const initRes = await fetch('/api/action/init-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: selectedTheme === '전체' ? '여행·라이프' : selectedTheme })
      });
      const initData = await initRes.json();
      const nextId = initData.id || 1;
      setIssuedId(nextId);

      // 2. Generate content using the exact selected images in storyline order
      setGenStatusText(`글 번호 #${nextId} 발급 완료! 선정하신 ${selectedImages.length}장의 사진 순서에 맞춰 감성 스토리텔링 글을 집필하고 있습니다...`);

      const genRes = await fetch('/api/action/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: nextId,
          theme: selectedTheme === '전체' ? '여행·라이프' : selectedTheme,
          title: titleToUse,
          selectedImages: selectedImages.map((img, idx) => ({
            id: img.id,
            title: img.title,
            destination: img.destination,
            tags: img.tags,
            userHint: img.userHint || '',
            order: idx + 1
          }))
        })
      });
      const genData = await genRes.json();
      if (genData.error) throw new Error(genData.error);

      setGeneratedPost(genData.post);
      setStep(4);
      showToast(`글 #${nextId} 작성이 성공적으로 완료되었습니다!`, 'success');
    } catch (err: any) {
      showToast('생성 안내: ' + (err.message || '글 생성에 실패했습니다. 다시 시도해 주세요.'), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleStartContentGeneration = () => {
    if (!selectedTitle) return;
    executeContentGeneration(selectedTitle);
  };

  // Step 4: Finalize action (Publish or Save Draft)
  const handleFinalizePost = async (publish: boolean) => {
    if (!issuedId) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/action/update-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: issuedId,
          status: publish ? 'published' : 'draft'
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSaveSuccess(true);
      showToast(publish ? '웹진에 성공적으로 공개 발행되었습니다!' : '임시 보관함에 안전하게 저장되었습니다.', 'success');
      setTimeout(() => {
        navigate('/my');
      }, 1200);
    } catch (err: any) {
      showToast('저장 실패: ' + err.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-36">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
        {/* Stepper Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-5 mb-8 text-xs font-bold text-slate-400 overflow-x-auto gap-2">
          <div className={`flex items-center gap-1.5 shrink-0 ${step === 1 ? 'text-indigo-600' : ''}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-100 border border-slate-200'}`}>1</span>
            <span>테마 & 사진 선택 ({selectedImages.length}/5장)</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <div className={`flex items-center gap-1.5 shrink-0 ${step === 2 ? 'text-indigo-600' : ''}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-indigo-600 text-white' : 'bg-slate-100 border border-slate-200'}`}>2</span>
            <span>사진 감성 분석 & 주제 추천</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <div className={`flex items-center gap-1.5 shrink-0 ${step === 3 ? 'text-indigo-600' : ''}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-indigo-600 text-white' : 'bg-slate-100 border border-slate-200'}`}>3</span>
            <span>ID 발급 & 생성</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <div className={`flex items-center gap-1.5 shrink-0 ${step === 4 ? 'text-indigo-600' : ''}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 4 ? 'bg-indigo-600 text-white' : 'bg-slate-100 border border-slate-200'}`}>4</span>
            <span>완성 및 검수발행</span>
          </div>
        </div>

        {/* STEP 1: Theme & Gallery Image Selection (2~5) */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-600" />
                  테마 선택 및 이미지허브 사진 선택 (2~5장)
                </h2>
                <p className="text-xs text-slate-500">
                  원하는 테마를 누르고 갤러리에서 글에 넣을 사진을 <strong>2개 이상 5개 이하</strong>로 골라주세요. AI가 선택된 사진들을 정밀 분석하여 최고의 맞춤 주제를 추천합니다.
                </p>
              </div>

              {selectedImages.length > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-700 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>현재 {selectedImages.length}장 선택됨 (최대 5장)</span>
                </div>
              )}
            </div>

            {/* Theme Pills & Search Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              {/* Theme Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {themes.map(t => {
                  const isSelected = selectedTheme === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setSelectedTheme(t)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition duration-200 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Search input */}
              <div className="relative max-w-xs w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="사진 제목, 장소, 태그 검색..."
                  value={imageSearch}
                  onChange={(e) => setImageSearch(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Gallery Grid */}
            {galleryLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 py-8">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse"></div>
                ))}
              </div>
            ) : filteredGallery.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-600 font-bold">조건에 맞는 사진이 없습니다.</p>
                <p className="text-[11px] text-slate-400">다른 테마를 선택하거나 검색어를 변경해 보세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredGallery.map(img => {
                  const selectedIndex = selectedImages.findIndex(i => i.id === img.id);
                  const isSelected = selectedIndex >= 0;

                  return (
                    <div
                      key={img.id}
                      onClick={() => toggleSelectImage(img)}
                      className={`group relative rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer flex flex-col bg-white ${
                        isSelected
                          ? 'border-indigo-600 ring-2 ring-indigo-500/30 shadow-md scale-[1.01]'
                          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      {/* Thumbnail Container */}
                      <div className="relative h-36 w-full bg-slate-100 overflow-hidden">
                        <img
                          src={img.previewUrl}
                          alt={img.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          loading="lazy"
                        />
                        {/* Order badge at top right */}
                        <div className="absolute top-2 right-2">
                          {isSelected ? (
                            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-[11px] flex items-center justify-center shadow-md">
                              #{selectedIndex + 1}
                            </span>
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                              <Plus className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>

                        {/* Ratio tag */}
                        {img.ratio && (
                          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/50 text-white rounded text-[9px] font-semibold">
                            {img.ratio}
                          </div>
                        )}
                      </div>

                      {/* Card meta info */}
                      <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 line-clamp-1 leading-snug">
                            {img.title}
                          </h4>
                          {img.destination && (
                            <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                              📍 {img.destination}
                            </p>
                          )}
                        </div>

                        {img.tags && img.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {img.tags.slice(0, 2).map((t, tIdx) => (
                              <span key={tIdx} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: AI Recommendations (based on selected images) */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                선택하신 {selectedImages.length}장의 사진을 분석한 맞춤 추천 주제
              </h2>
              <p className="text-xs text-slate-500">
                선택하신 사진들의 장소, 소재, 분위기를 바탕으로 도출한 맞춤형 블로그 글 제목 5선입니다. 원하는 주제를 선택하면 즉시 고유 글 번호 발급 및 감성 본문 생성이 진행됩니다.
              </p>
            </div>

            {/* Selected Images Tray Preview */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 block mb-2 uppercase">선택된 사진 스토리라인 ({selectedImages.length}장)</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {selectedImages.map((img, idx) => (
                  <div key={img.id} className="relative rounded-xl overflow-hidden border border-slate-200 bg-white">
                    <img src={img.previewUrl} alt={img.title} className="w-full h-20 object-cover" />
                    <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div className="p-1.5 text-[10px] font-bold text-slate-700 truncate">
                      {img.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations List */}
            {recommending ? (
              <div className="space-y-4 py-12 text-center bg-slate-50 rounded-2xl border border-slate-200">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin mx-auto"></div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">선택하신 사진들의 메타정보와 장소를 분석 중입니다...</p>
                  <p className="text-xs text-slate-400">사진의 분위기와 완벽히 어울리는 감성적인 주제 5개를 추출하고 있습니다.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {recommendations.map((title, idx) => (
                  <div
                    key={idx}
                    className="p-4.5 rounded-2xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/20 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs group bg-white"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition flex items-center justify-center text-xs font-black shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-900 leading-snug">{title}</span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => handleSelectTitle(title)}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                      >
                        세부 확인
                      </button>
                      <button
                        onClick={() => handleDirectGenerate(title)}
                        className="px-4.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        이 주제로 바로 생성
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
              >
                ← 사진 다시 선택하기
              </button>

              <button
                onClick={() => executeRecommendationWithImages(selectedImages)}
                disabled={recommending}
                className="px-5 py-2.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recommending ? 'animate-spin' : ''}`} />
                다른 주제 5개 다시 추천받기
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Confirm Title & ID Issue & Content Generation */}
        {step === 3 && (
          <div className="space-y-6">
            {!generating ? (
              <div className="space-y-6">
                <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-2">
                  <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase block">최종 확정 주제</span>
                  <h3 className="text-lg font-black text-indigo-950 leading-relaxed">
                    {selectedTitle}
                  </h3>
                  <div className="text-xs text-indigo-700">
                    테마: {selectedTheme} &bull; 배치 사진: {selectedImages.length}장
                  </div>
                </div>

                {/* Selected Images Sequence Preview */}
                <div className="space-y-3 bg-slate-50 p-4.5 rounded-2xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-800 block">📸 본문에 순차 배치될 사진 스토리라인:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {selectedImages.map((img, idx) => (
                      <div key={img.id} className="bg-white p-2 rounded-xl border border-slate-200 text-center space-y-1">
                        <img src={img.previewUrl} alt={img.title} className="w-full h-18 object-cover rounded-lg" />
                        <span className="text-[10px] font-bold text-indigo-600 block">섹션 #{idx + 1}</span>
                        <p className="text-[9px] text-slate-500 truncate">{img.title}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex justify-between">
                  <button
                    onClick={() => setStep(2)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
                  >
                    ← 주제 목록으로
                  </button>
                  <button
                    onClick={handleStartContentGeneration}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-indigo-100 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    글 번호 발급 및 생성 시작하기
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 space-y-6">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin mx-auto"></div>
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-slate-900">스튜디오 에디터가 정성껏 글을 엮고 있습니다</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {genStatusText}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Success Preview & Final Status Choice */}
        {step === 4 && generatedPost && (
          <div className="space-y-6">
            {saveSuccess ? (
              <div className="text-center py-16 space-y-4">
                <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto" />
                <h3 className="text-lg font-bold text-slate-900">글이 최종 처리되었습니다!</h3>
                <p className="text-xs text-slate-500">내 글 관리 화면으로 이동합니다...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-900">
                  <span className="flex items-center gap-2 font-bold">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    성공적으로 글이 예약 생성되었습니다! 발급된 글 ID: #{issuedId}
                  </span>
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Link
                      to={`/blog/${issuedId}`}
                      className="px-3 py-1 bg-white border border-emerald-200 text-emerald-700 font-bold rounded-lg hover:bg-emerald-100 transition"
                    >
                      미리보기 페이지로
                    </Link>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-3xl p-6 bg-white space-y-6">
                  <h3 className="text-xs font-bold text-slate-400">👀 생성 결과 본문</h3>
                  <div className="space-y-4 border-t border-slate-100 pt-4">
                    <h1 className="text-xl font-bold text-slate-900">{generatedPost.title || selectedTitle}</h1>
                    <p className="text-xs text-slate-500">{generatedPost.description}</p>
                    <div className="h-px bg-slate-100"></div>
                    <div className="text-xs text-slate-600 space-y-4">
                      {(() => {
                        let contentObj: any = {};
                        try {
                          contentObj = typeof generatedPost.content === 'string' ? JSON.parse(generatedPost.content) : generatedPost.content;
                        } catch {}
                        return (
                          <>
                            {contentObj.intro && <p className="font-semibold italic">"{contentObj.intro}"</p>}
                            
                            <div className="space-y-3 pt-2">
                              <span className="text-xs font-bold text-slate-800 block">배치된 섹션별 사진 및 소제목:</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {contentObj.sections?.map((s: any, idx: number) => (
                                  <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-2">
                                    {s.imageId && (
                                      <img src={`/api/hub/${s.imageId}`} alt={s.heading} className="w-full h-24 object-cover rounded-lg" />
                                    )}
                                    <span className="text-[10px] text-indigo-600 font-bold block">섹션 #{idx + 1}</span>
                                    <h5 className="font-bold text-slate-800 text-xs line-clamp-1">{s.heading}</h5>
                                    {s.caption && <p className="text-[10px] text-slate-400 italic line-clamp-1">{s.caption}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {contentObj.summary && (
                              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 mt-4">
                                <span className="font-bold text-indigo-950 block mb-1">에디터 요약</span>
                                <p className="text-slate-600">{contentObj.summary}</p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between gap-3">
                  <button
                    onClick={() => handleFinalizePost(false)}
                    disabled={generating}
                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-extrabold transition cursor-pointer"
                  >
                    임시 보관함에 보관
                  </button>

                  <button
                    onClick={() => setExportModalPost(generatedPost)}
                    className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" /> 블로그 서식 내보내기 (네이버 · 티스토리 · 브런치)
                  </button>

                  <button
                    onClick={() => handleFinalizePost(true)}
                    disabled={generating}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> 저장 및 공개 발행완료 (웹진 노출)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FLOATING SELECTION DOCK AT BOTTOM (Appears during Step 1 when >= 1 image selected) */}
      {step === 1 && selectedImages.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-11/12 max-w-4xl z-40">
          <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-3xl p-4 shadow-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Left: Tray of selected photos */}
            <div className="flex items-center gap-3 overflow-x-auto w-full md:w-auto py-1">
              <div className="shrink-0 flex items-center gap-1">
                <span className="text-xs font-bold text-indigo-400">선택한 사진</span>
                <span className="text-xs text-slate-400 font-semibold">({selectedImages.length}/5장)</span>
              </div>

              <div className="flex items-center gap-2">
                {selectedImages.map((img, idx) => (
                  <div key={img.id} className="relative group shrink-0">
                    <img
                      src={img.previewUrl}
                      alt={img.title}
                      className="w-12 h-12 object-cover rounded-xl border border-slate-700 shadow-xs"
                    />
                    {/* Index badge */}
                    <span className="absolute -top-1.5 -left-1.5 w-4.5 h-4.5 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center shadow-xs">
                      #{idx + 1}
                    </span>

                    {/* Quick remove button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelectImage(img); }}
                      className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-slate-800 hover:bg-red-500 text-white text-[9px] flex items-center justify-center shadow-xs transition cursor-pointer"
                      title="선택 해제"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>

                    {/* Reorder controls on hover */}
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 rounded-b-xl flex items-center justify-between px-1 py-0.5 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveImageSequence(idx, 'left'); }}
                        disabled={idx === 0}
                        className="text-[9px] text-white disabled:opacity-30 hover:text-indigo-300 cursor-pointer"
                        title="순서 앞으로 이동"
                      >
                        ◀
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveImageSequence(idx, 'right'); }}
                        disabled={idx === selectedImages.length - 1}
                        className="text-[9px] text-white disabled:opacity-30 hover:text-indigo-300 cursor-pointer"
                        title="순서 뒤로 이동"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Next button */}
            <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto justify-end">
              {selectedImages.length === 1 && (
                <button
                  onClick={autoAddOneMoreAndRecommend}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-xs rounded-2xl transition cursor-pointer flex items-center gap-1 border border-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  사진 1장 자동 추가
                </button>
              )}

              <button
                onClick={handleRequestRecommendations}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-2xl transition shadow-lg cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {selectedImages.length >= 2 ? (
                  `사진 감성 분석 & 주제 추천 (${selectedImages.length}장) →`
                ) : (
                  '주제 추천 시작하기 (2장 필요)'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <BlogExportModal post={exportModalPost} isOpen={!!exportModalPost} onClose={() => setExportModalPost(null)} />
    </div>
  );
}

// --- COMPONENT: MY POSTS (내 글 관리) ---
function MyPosts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'edit' | 'review' | 'history'>('list');

  // Active Context Post for Management actions
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [exportModalPost, setExportModalPost] = useState<BlogPost | null>(null);

  // Edit states
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContent, setEditContent] = useState<PostContent>({});
  const [saving, setSaving] = useState(false);

  // Review states
  const [reviewData, setReviewData] = useState<ReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // History states
  const [revisions, setRevisions] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      fetchMyPosts();
    }
  }, [user]);

  const fetchMyPosts = () => {
    setLoading(true);
    fetch('/api/action/my-posts')
      .then(res => res.json())
      .then(data => {
        if (data.posts) setPosts(data.posts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  // 1. Unpublish / Publish toggle
  const handleToggleStatus = async (post: BlogPost, isPublish: boolean) => {
    const confirmMsg = isPublish 
      ? '글을 공개 발행하시겠습니까? 공개 웹진에 즉시 노출됩니다.' 
      : '글 발행을 취소하고 임시 저장 상태로 변경하시겠습니까?';
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/action/update-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: post.id,
          status: isPublish ? 'published' : 'draft'
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(isPublish ? '글이 공개 발행되었습니다!' : '발행이 취소되어 임시 저장되었습니다.', 'success');
      fetchMyPosts();
    } catch (err: any) {
      showToast('상태 변경 실패: ' + err.message, 'error');
    }
  };

  // 2. Soft-delete
  const handleDeletePost = async (post: BlogPost) => {
    if (!window.confirm('글을 삭제하시겠습니까? 글 번호는 영구 소멸되며, 다시 생성되지 않습니다.')) return;
    try {
      const res = await fetch('/api/action/update-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: post.id,
          status: 'deleted'
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('글이 삭제 처리되었습니다.', 'info');
      fetchMyPosts();
    } catch (err: any) {
      showToast('삭제 실패: ' + err.message, 'error');
    }
  };

  // 3. Initiate Edit panel
  const handleStartEdit = (post: BlogPost) => {
    setSelectedPost(post);
    setEditTitle(post.title);
    setEditDescription(post.description);
    setEditContent(JSON.parse(post.content));
    setActiveTab('edit');
  };

  // Save edits
  const handleSaveEdits = async () => {
    if (!selectedPost) return;
    setSaving(true);
    try {
      const res = await fetch('/api/action/update-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPost.id,
          status: selectedPost.status,
          title: editTitle,
          description: editDescription,
          content: editContent
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('수정 내용이 저장되었습니다.', 'success');
      fetchMyPosts();
      setActiveTab('list');
      setSelectedPost(null);
    } catch (err: any) {
      showToast('저장 실패: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 4. Initiate AI Review
  const handleStartReview = async (post: BlogPost) => {
    setSelectedPost(post);
    setReviewData(null);
    setActiveTab('review');
    setReviewing(true);

    try {
      const res = await fetch('/api/action/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReviewData(data.reviewResult);
    } catch (err: any) {
      showToast('검수 실패: ' + err.message, 'error');
      setActiveTab('list');
      setSelectedPost(null);
    } finally {
      setReviewing(false);
    }
  };

  // Apply Review Suggestions
  const handleApplyReview = async () => {
    if (!selectedPost) return;
    if (!window.confirm('스마트 검수 제안을 최종 적용하시겠습니까? 적용 시 현재 상태는 이전 버전 이력(revisions)에 자동 안전 백업된 후 덮어쓰기 됩니다.')) return;
    setReviewing(true);
    try {
      const res = await fetch('/api/action/apply-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPost.id })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('검수 개선안이 성공적으로 적용되었습니다!', 'success');
      fetchMyPosts();
      setActiveTab('list');
      setSelectedPost(null);
    } catch (err: any) {
      showToast('적용 오류: ' + err.message, 'error');
    } finally {
      setReviewing(false);
    }
  };

  // 5. Initiate Revision History
  const handleStartHistory = async (post: BlogPost) => {
    setSelectedPost(post);
    setRevisions([]);
    setActiveTab('history');
    setHistoryLoading(true);

    try {
      const res = await fetch(`/api/action/revisions/${post.id}`);
      const data = await res.json();
      setRevisions(data.revisions || []);
    } catch (err: any) {
      showToast('이력 조회 오류', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Restore specific version
  const handleRestoreVersion = async (versionNum: number) => {
    if (!selectedPost) return;
    if (!window.confirm(`버전 ${versionNum}으로 글 내용을 교체하시겠습니까? 현재 활성 본문도 새 버전 번호(백업)로 안전하게 저장됩니다.`)) return;
    setHistoryLoading(true);

    try {
      const res = await fetch('/api/action/restore-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPost.id,
          version: versionNum
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('이전 버전 복원이 완료되었습니다.', 'success');
      fetchMyPosts();
      setActiveTab('list');
      setSelectedPost(null);
    } catch (err: any) {
      showToast('복원 실패: ' + err.message, 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-indigo-600" /> 내 글 관리 (작가 데스크)
          </h1>
          <p className="text-xs text-slate-400">발행한 포스트의 상태 변경, 삭제, 정밀 검수 및 버전 이력 복원, 블로그 서식 내보내기 등을 수행할 수 있습니다.</p>
        </div>
        {activeTab !== 'list' && (
          <button
            onClick={() => {
              setActiveTab('list');
              setSelectedPost(null);
            }}
            className="px-4 py-2 bg-slate-100 text-slate-600 text-xs rounded-xl font-bold hover:bg-slate-200 transition"
          >
            목록으로 돌아가기
          </button>
        )}
      </div>

      {/* VIEW TAB: LIST */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
              <p className="text-xs text-slate-400">데이터베이스를 조회하는 중...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="p-16 text-center space-y-4">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-slate-800 font-bold text-sm">작성한 글이 아직 없습니다.</h3>
              <p className="text-slate-400 text-xs">글 작성 메뉴에서 새로운 감성 블로그 글을 써보세요.</p>
              <Link
                to="/studio"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition"
              >
                <PenTool className="w-4 h-4" /> 첫 글 작성하기
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs">
                    <th className="p-4 pl-6 whitespace-nowrap w-28">ID / 테마</th>
                    <th className="p-4 min-w-[160px] max-w-[220px]">글 제목</th>
                    <th className="p-4 text-center whitespace-nowrap w-16">버전</th>
                    <th className="p-4 text-center whitespace-nowrap w-28">상태</th>
                    <th className="p-4 text-right pr-6 whitespace-nowrap">작업 관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {posts.map(post => (
                    <tr key={post.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-4 pl-6 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-400 block mb-1">#{post.id}</span>
                        <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md font-bold text-[10px] whitespace-nowrap">
                          {post.theme}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="max-w-[170px] sm:max-w-[210px] md:max-w-[250px]">
                          <h3
                            className="font-bold text-slate-800 leading-snug truncate hover:text-indigo-600 transition cursor-pointer"
                            title={post.title}
                            onClick={() => navigate(`/blog/${post.id}`)}
                          >
                            {post.title}
                          </h3>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5" title={post.description || ''}>
                            {post.description}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 text-center font-bold text-indigo-600 whitespace-nowrap">
                        V{post.version}
                      </td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap border ${
                          post.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${post.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {post.status === 'published' ? '공개발행' : '임시저장'}
                        </span>
                      </td>
                      <td className="p-4 text-right pr-6 space-x-1.5 whitespace-nowrap">
                        {/* Status Toggle */}
                        {post.status === 'published' ? (
                          <button
                            onClick={() => handleToggleStatus(post, false)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold transition"
                          >
                            발행 취소
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleStatus(post, true)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition"
                          >
                            발행 하기
                          </button>
                        )}

                        {/* Detail Check */}
                        <Link
                          to={`/blog/${post.id}`}
                          className="inline-block px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg font-bold transition"
                        >
                          본문 읽기
                        </Link>

                        {/* Edit Content */}
                        <button
                          onClick={() => handleStartEdit(post)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold transition"
                        >
                          편집
                        </button>

                        {/* Blog Export */}
                        <button
                          onClick={() => setExportModalPost(post)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold inline-flex items-center gap-1 transition"
                          title="네이버 / 티스토리 / 브런치 서식 내보내기"
                        >
                          <Share2 className="w-3 h-3" /> 내보내기
                        </button>

                        {/* Run Review */}
                        <button
                          onClick={() => handleStartReview(post)}
                          className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold inline-flex items-center gap-1 transition"
                        >
                          <Sparkles className="w-3 h-3" /> 글 검수
                        </button>

                        {/* Revisions list */}
                        <button
                          onClick={() => handleStartHistory(post)}
                          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold inline-flex items-center gap-1 transition"
                        >
                          <RotateCcw className="w-3 h-3" /> 이력
                        </button>

                        {/* Delete post */}
                        <button
                          onClick={() => handleDeletePost(post)}
                          className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition"
                          title="글 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW TAB: EDIT PANEL */}
      {activeTab === 'edit' && selectedPost && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="font-black text-slate-900 text-base">
              글 세부 내용 직접 편집 (ID: #{selectedPost.id})
            </h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">글 제목</label>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">대표 요약 설명</label>
              <input
                type="text"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">도입문 (Intro)</label>
              <textarea
                value={editContent.intro || ''}
                onChange={e => setEditContent({ ...editContent, intro: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            {/* Sections list mapping */}
            <div className="space-y-4 pt-4">
              <h3 className="text-xs font-bold text-slate-800">문단 단락 설정 (Sections)</h3>
              {editContent.sections?.map((section, sIdx) => (
                <div key={sIdx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Section #{sIdx + 1}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">문단 소제목</label>
                        <input
                          type="text"
                          value={section.heading}
                          onChange={e => {
                            const secs = [...(editContent.sections || [])];
                            secs[sIdx].heading = e.target.value;
                            setEditContent({ ...editContent, sections: secs });
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">문단 서술글 (paragraphs)</label>
                        <textarea
                          value={section.paragraphs.join('\n\n')}
                          onChange={e => {
                            const secs = [...(editContent.sections || [])];
                            secs[sIdx].paragraphs = e.target.value.split('\n\n').filter(p => p);
                            setEditContent({ ...editContent, sections: secs });
                          }}
                          rows={4}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs leading-relaxed"
                          placeholder="문단 한 개씩 더블 개행(엔터 두 번)으로 문단을 분할해 기록하세요."
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">매치 이미지 ID</label>
                        <input
                          type="text"
                          value={section.imageId || ''}
                          onChange={e => {
                            const secs = [...(editContent.sections || [])];
                            secs[sIdx].imageId = e.target.value;
                            setEditContent({ ...editContent, sections: secs });
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono"
                          placeholder="이미지 고유 ID"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">이미지 설명 캡션</label>
                        <input
                          type="text"
                          value={section.caption || ''}
                          onChange={e => {
                            const secs = [...(editContent.sections || [])];
                            secs[sIdx].caption = e.target.value;
                            setEditContent({ ...editContent, sections: secs });
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                          placeholder="사진 하단 캡션 문구"
                        />
                      </div>

                      {section.imageId && (
                        <div className="pt-2">
                          <span className="text-[9px] block text-slate-400 font-bold mb-1">현재 적용 사진 미리보기</span>
                          <div className="h-28 rounded-lg overflow-hidden border bg-slate-100 max-w-[200px]">
                            <img 
                              src={`/api/hub/${section.imageId}`} 
                              alt="preview" 
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-4">
              <label className="text-xs font-bold text-slate-600">요약 및 소감 (Summary)</label>
              <textarea
                value={editContent.summary || ''}
                onChange={e => setEditContent({ ...editContent, summary: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button
              onClick={() => {
                setActiveTab('list');
                setSelectedPost(null);
              }}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
            >
              취소
            </button>
            <button
              onClick={handleSaveEdits}
              disabled={saving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:bg-indigo-400 flex items-center gap-1.5 shadow-sm"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              수정 완료 저장
            </button>
          </div>
        </div>
      )}

      {/* VIEW TAB: AI REVIEW (검수) */}
      {activeTab === 'review' && selectedPost && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" /> 정밀 에디터 선택 검수 (ID: #{selectedPost.id})
            </h2>
          </div>

          {reviewing ? (
            <div className="text-center py-16 space-y-5">
              <div className="w-12 h-12 rounded-full border-4 border-amber-100 border-t-amber-500 animate-spin mx-auto"></div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">글을 꼼꼼하게 읽고 검수 보고서를 작성 중입니다</h3>
                <p className="text-xs text-slate-400 leading-relaxed">오타 정정, 어조 최적화, 문맥의 조화도를 검수하고 완성 제안서를 도출합니다.</p>
              </div>
            </div>
          ) : reviewData ? (
            <div className="space-y-6">
              {/* Scorecard */}
              <div className="bg-gradient-to-r from-amber-500 to-indigo-600 p-6 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div>
                  <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Editor Score</span>
                  <h3 className="text-4xl font-black mt-2">{reviewData.score} <span className="text-xs font-normal">/ 100점</span></h3>
                  <p className="text-[11px] text-slate-100 mt-1">감성 지수 및 문법 정밀도가 최상급 수준인지 검수 완료하였습니다.</p>
                </div>
                <button
                  onClick={handleApplyReview}
                  className="px-5 py-3 bg-white text-indigo-950 hover:bg-slate-50 transition font-black text-xs rounded-xl shadow-md cursor-pointer self-start sm:self-center"
                >
                  ✨ 개선안 본문 덮어쓰기 적용
                </button>
              </div>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 space-y-2.5 text-xs text-slate-700">
                  <h4 className="font-bold text-emerald-800 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> 우수한 핵심 강점
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 leading-relaxed">
                    {reviewData.strengths.map((str, idx) => <li key={idx}>{str}</li>)}
                  </ul>
                </div>

                <div className="bg-rose-50/50 p-5 rounded-2xl border border-rose-100 space-y-2.5 text-xs text-slate-700">
                  <h4 className="font-bold text-rose-800 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 text-rose-600" /> 수정 및 개선 여지
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 leading-relaxed">
                    {reviewData.weaknesses.map((weak, idx) => <li key={idx}>{weak}</li>)}
                  </ul>
                </div>
              </div>

              {/* Side by side Diff Concept */}
              <div className="border border-slate-200 rounded-3xl overflow-hidden text-xs">
                <div className="bg-slate-50 p-3 border-b border-slate-200 font-bold text-slate-700 text-center uppercase tracking-wide">
                  전문 에디터가 제안하는 검수 교정 개선안 본문
                </div>
                <div className="p-6 space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">개선안 제목</span>
                    <h4 className="font-bold text-slate-800 text-sm">{reviewData.improvedText.title}</h4>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">개선안 설명</span>
                    <p className="text-slate-600">{reviewData.improvedText.description}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">개선안 도입부</span>
                    <p className="text-slate-600 leading-relaxed italic">"{reviewData.improvedText.intro}"</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500">결과가 존재하지 않습니다. 다시 시도해 주세요.</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW TAB: REVISION HISTORY (이전 버전 복원) */}
      {activeTab === 'history' && selectedPost && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="font-black text-slate-900 text-base">
              역사적 버전 이력 확인 및 안전 복원 (ID: #{selectedPost.id})
            </h2>
            <p className="text-xs text-slate-400">덮어쓰기되거나 개선되기 이전 단계로 안전하게 되돌립니다. 복원 전 현재 내용 또한 최신 버전으로 선백업됩니다.</p>
          </div>

          {historyLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
              <p className="text-xs text-slate-400 mt-2">이전 세이브 포인트를 읽어오고 있습니다...</p>
            </div>
          ) : revisions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <span>백업 이력이 존재하지 않습니다. 수정 및 검수가 발생해야 첫 백업이 자동 생성됩니다.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {revisions.map((rev, idx) => (
                <div key={idx} className="p-5 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition text-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-600 text-sm">Ver. {rev.version}</span>
                      <span className="px-2 py-0.5 bg-slate-100 rounded-sm font-semibold text-[9px] text-slate-400">
                        {new Date(rev.revisionsSavedAt || rev.updated).toLocaleString()} 백업됨
                      </span>
                    </div>
                    <p className="font-bold text-slate-800 text-xs truncate max-w-md">{rev.title}</p>
                    <p className="text-[10px] text-slate-400 line-clamp-1">{rev.description}</p>
                  </div>

                  <button
                    onClick={() => handleRestoreVersion(rev.version)}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-extrabold text-xs rounded-xl transition self-start sm:self-center"
                  >
                    이 버전으로 복원하기
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <BlogExportModal post={exportModalPost} isOpen={!!exportModalPost} onClose={() => setExportModalPost(null)} />
    </div>
  );
}

// --- APP ROOT COMPONENT ---
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
