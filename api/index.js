// server.ts
import express from "express";
import path from "node:path";
import fs2 from "node:fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

// server/store.ts
import { randomInt } from "node:crypto";
var projectId = "studio-9240700230-1dd9a";
var apiKey = "AIzaSyDEpFAsf1fI65xXklKYsukAWFYw5bzaHyc";
var BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
var err = (message, status = 503) => Object.assign(new Error(message), { status });
function fields(data) {
  const value = (x) => x === null ? { nullValue: null } : Array.isArray(x) ? { arrayValue: { values: x.map(value) } } : typeof x === "object" ? { mapValue: { fields: fields(x) } } : typeof x === "boolean" ? { booleanValue: x } : typeof x === "number" ? Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x } : { stringValue: String(x) };
  return Object.fromEntries(Object.entries(data).filter(([, x]) => x !== void 0).map(([k, x]) => [k, value(x)]));
}
function decode(d) {
  const value = (x) => x.mapValue ? Object.fromEntries(Object.entries(x.mapValue.fields || {}).map(([k, v]) => [k, value(v)])) : x.arrayValue ? (x.arrayValue.values || []).map(value) : x.integerValue !== void 0 ? Number(x.integerValue) : x.stringValue ?? x.timestampValue ?? x.booleanValue ?? x.doubleValue ?? null;
  return { ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, value(v)])), _docId: d.name.split("/").pop(), _collection: d.name.split("/").at(-2), _time: d.updateTime };
}
async function request(path2, init = {}, token) {
  const r = await fetch(`${BASE}${path2}${path2.includes("?") ? "&" : "?"}key=${apiKey}`, { signal: AbortSignal.timeout(2e4), ...init, headers: { "Content-Type": "application/json", ...token ? { Authorization: `Bearer ${token}` } : {} } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw err(body?.error?.message || `Firebase \uC694\uCCAD \uC2E4\uD328 (${r.status})`, r.status === 403 ? 403 : r.status === 404 ? 404 : r.status === 409 || r.status === 412 ? 409 : 503);
  return body;
}
async function query(collection, filters, token) {
  const items = [];
  let after;
  do {
    const parts = filters.map(([field, v]) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: v } } }));
    const q = { from: [{ collectionId: collection }], where: parts.length === 1 ? parts[0] : { compositeFilter: { op: "AND", filters: parts } }, orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 100 };
    if (after) q.startAt = { values: [{ referenceValue: after }], before: false };
    const rows = await request(":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: q }) }, token);
    const docs = rows.filter((r) => r.document).map((r) => r.document);
    items.push(...docs.map(decode));
    after = docs.length === 100 ? docs.at(-1).name : void 0;
  } while (after);
  return items;
}
function post(d) {
  const marker = d.sourceSite || d.siteId || d.themePersona;
  if (marker !== "hub5" || !d.ownerId) return null;
  let body = {};
  try {
    body = JSON.parse(d.contentJson || JSON.stringify(d.content || {}));
  } catch {
    return null;
  }
  body.sections = (body.sections || []).map((s) => ({ ...s, heading: s.heading || s.title || "", paragraphs: s.paragraphs || (s.body || s.content || "").split(/\n\n+/) }));
  const id = d.postId || d._docId;
  return { id, owner: d.ownerId, theme: d.theme || "\uB77C\uC774\uD504\uC2A4\uD0C0\uC77C", title: d.title || body.title || "", description: d.description || body.description || body.summary || "", content: JSON.stringify(body), status: d.status, created: d.createdAt, updated: d.updatedAt, published: d.publishedAt || "", version: d.revision || 1, _docId: d._docId, _collection: d._collection, _time: d._time };
}
var isPublic = (p) => p?.status === "published" && !!p.published && Number.isFinite(Date.parse(p.published)) && Date.parse(p.published) <= Date.now();
async function publicPosts() {
  return (await query("publishedContents", [["visibility", "public"]])).map(post).filter(isPublic).sort((a, b) => b.published.localeCompare(a.published));
}
async function ownPosts(uid, token) {
  const [published, drafts] = await Promise.all([publicPosts(), query("contentProjects", [["ownerId", uid], ["recordType", "agentDraft"]], token)]);
  return [...published.filter((p) => p.owner === uid), ...drafts.map(post).filter((p) => p && p.owner === uid && p.status === "draft")].sort((a, b) => b.updated.localeCompare(a.updated));
}
async function ownPost(id, uid, token) {
  const p = (await ownPosts(uid, token)).find((p2) => String(p2.id) === String(id));
  if (!p) throw err("\uBCF8\uC778\uC758 \uC6D0\uACE0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
  return p;
}
function assertVersion(p, expected) {
  if (expected !== void 0 && p.version !== Number(expected)) throw err("\uB2E4\uB978 \uBCC0\uACBD\uC774 \uBA3C\uC800 \uC800\uC7A5\uB410\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.", 409);
}
function record(p, uid) {
  if (p.owner !== uid) throw err("\uBCF8\uC778\uC758 \uC6D0\uACE0\uB9CC \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", 403);
  return { ownerId: uid, sourceSite: "hub5", siteId: "hub5", themePersona: "hub5", type: "blog", postId: p.id, theme: p.theme, title: p.title, description: p.description, status: p.status, visibility: p.status === "published" ? "public" : "private", contentJson: p.content, imageIds: JSON.parse(p.content || "{}").sections?.map((s) => s.imageId).filter(Boolean) || [], createdAt: p.created, updatedAt: p.updated, publishedAt: p.published || "", revision: p.version, ...p.status === "draft" ? { recordType: "agentDraft" } : {} };
}
function write(c, id, data, time) {
  return { update: { name: `projects/${projectId}/databases/(default)/documents/${c}/${id}`, fields: fields(data) }, currentDocument: time ? { updateTime: time } : { exists: false } };
}
function remove(p) {
  return { delete: `projects/${projectId}/databases/(default)/documents/${p._collection}/${p._docId}`, currentDocument: { updateTime: p._time } };
}
async function save(p, uid, token, original, backup = false) {
  if (p.owner !== uid || original && original.owner !== uid) throw err("\uBCF8\uC778\uC758 \uC6D0\uACE0\uB9CC \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", 403);
  const collection = p.status === "published" ? "publishedContents" : "contentProjects";
  const id = original?._docId || `hub5_${p.id}`;
  const writes = [];
  if (backup && original) {
    writes.push(write("contentProjects", `hub5_revision_${uid}_${p.id}_${original.version}_${randomInt(1e8)}`, { ownerId: uid, sourceSite: "hub5", recordType: "hub5Revision", articleId: String(p.id), version: original.version, payloadJson: JSON.stringify({ version: original.version, title: original.title, description: original.description, content: original.content, revisionsSavedAt: (/* @__PURE__ */ new Date()).toISOString() }) }));
  }
  if (p.status === "deleted") {
    if (!original) throw err("\uC6D0\uACE0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    writes.push(remove(original));
  } else {
    writes.push(write(collection, id, record(p, uid), original?._collection === collection ? original._time : void 0));
    if (original && original._collection !== collection) writes.push(remove(original));
  }
  const result = await request(":commit", { method: "POST", body: JSON.stringify({ writes }) }, token);
  return { ...p, _docId: id, _collection: collection, _time: result.writeResults?.[backup ? 1 : 0]?.updateTime };
}
async function createDraft(theme, uid, token) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const p = { id: Date.now() * 1e3 + randomInt(1e3), owner: uid, theme: theme || "\uB77C\uC774\uD504\uC2A4\uD0C0\uC77C", title: "\uC0DD\uC131 \uB300\uAE30 \uC6D0\uACE0", description: "", content: "{}", status: "draft", created: now, updated: now, published: "", version: 1 };
  return save(p, uid, token);
}
async function saveReview(p, result, uid, token) {
  const data = { ownerId: uid, sourceSite: "hub5", recordType: "reviewMessage", articleId: String(p.id), messageId: crypto.randomUUID(), role: "assistant", kind: "review", text: "\uC6D0\uACE0 \uAC80\uC218", createdAt: (/* @__PURE__ */ new Date()).toISOString(), resultJson: JSON.stringify({ reviewResult: result, baseVersion: p.version, baseTime: p._time }) };
  await request("/contentProjects", { method: "POST", body: JSON.stringify({ fields: fields(data) }) }, token);
}
async function reviews(id, uid, token) {
  return (await query("contentProjects", [["ownerId", uid], ["articleId", String(id)], ["recordType", "reviewMessage"]], token)).filter((d) => d.sourceSite === "hub5" && d.kind === "review").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((d) => JSON.parse(d.resultJson));
}
async function revisions(id, uid, token) {
  return (await query("contentProjects", [["ownerId", uid], ["articleId", String(id)], ["recordType", "hub5Revision"]], token)).filter((d) => d.sourceSite === "hub5").map((d) => JSON.parse(d.payloadJson)).sort((a, b) => b.version - a.version);
}
async function identity(token) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(1e4) });
  const body = await r.json();
  const u = body.users?.[0];
  if (!r.ok || !u?.localId || u.disabled) throw err("\uB85C\uADF8\uC778\uC774 \uB9CC\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD558\uC138\uC694.", 401);
  return { uid: u.localId, email: u.email, idToken: token };
}
function clientPost(p) {
  const { _time, _docId, _collection, ...data } = p;
  return data;
}

// server/seo.ts
import fs from "node:fs";
var SITE = "https://hubstudio5.vercel.app";
var escape = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function detailBody(p) {
  const c = JSON.parse(p.content);
  return `<article><header><h1>${escape(p.title)}</h1><p>${escape(p.description)}</p></header><p>${escape(c.intro)}</p>${(c.sections || []).map((s) => `<section><h2>${escape(s.heading)}</h2>${(s.paragraphs || []).map((text) => `<p>${escape(text)}</p>`).join("")}${s.imageId ? `<figure><img loading="lazy" src="/api/hub/${encodeURIComponent(s.imageId)}" alt="${escape(s.caption || s.heading)}"><figcaption>${escape(s.caption)}</figcaption></figure>` : ""}</section>`).join("")}<p>${escape(c.summary || c.closing)}</p></article>`;
}
function render(template, path2, posts, detail, missing = false) {
  const title = missing ? "\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" : detail ? detail.title : path2 === "/" ? "\uD5C8\uBE0C\uC2A4\uD29C\uB514\uC6245 \xB7 \uC0AC\uC9C4\uACFC \uC774\uC57C\uAE30\uB85C \uB9CC\uB098\uB294 \uB77C\uC774\uD504\uC2A4\uD0C0\uC77C" : "\uD5C8\uBE0C\uC2A4\uD29C\uB514\uC6245 \uC6F9\uC9C4";
  const description = detail?.description || "\uC774\uBBF8\uC9C0\uC640 \uC774\uC57C\uAE30\uB85C \uC804\uD558\uB294 \uC5EC\uD589\uACFC \uC77C\uC0C1\uC758 \uB77C\uC774\uD504\uC2A4\uD0C0\uC77C \uC6F9\uC9C4\uC785\uB2C8\uB2E4.";
  const canonical = SITE + path2;
  const body = missing ? '<h1>\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4</h1><a href="/webzine">\uC6F9\uC9C4\uC73C\uB85C \uC774\uB3D9</a>' : detail ? detailBody(detail) : `<header><h1>${escape(title)}</h1><p>${escape(description)}</p></header><ul>${posts.map((p) => `<li><a href="/blog/${encodeURIComponent(p.id)}">${escape(p.title)}</a><p>${escape(p.description)}</p></li>`).join("")}</ul>`;
  const schema = detail ? { "@context": "https://schema.org", "@type": "BlogPosting", headline: detail.title, description: detail.description, datePublished: detail.published, dateModified: detail.updated, mainEntityOfPage: { "@type": "WebPage", "@id": canonical }, author: { "@type": "Organization", name: "\uD5C8\uBE0C\uC2A4\uD29C\uB514\uC6245" }, image: JSON.parse(detail.content).sections?.filter((s) => s.imageId).map((s) => SITE + "/api/hub/" + encodeURIComponent(s.imageId)) || [] } : { "@context": "https://schema.org", "@type": "CollectionPage", name: title, url: canonical };
  let html = template.replace(/<title>[\s\S]*?<\/title>/g, "").replace(/<meta[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, "").replace(/<link[^>]*rel="canonical"[^>]*>/g, "").replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, "");
  const metadata = `<title>${escape(title)} | \uD5C8\uBE0C\uC2A4\uD29C\uB514\uC6245</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${missing ? "noindex,follow" : "index,follow,max-image-preview:large"}">${missing ? "" : `<link rel="canonical" href="${escape(canonical)}">`}<meta property="og:type" content="${detail ? "article" : "website"}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}">${missing ? "" : `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`}`;
  return html.replace("</head>", metadata + "</head>").replace('<div id="root"></div>', `<div id="root"><main style="max-width:960px;margin:40px auto;padding:24px">${body}</main></div>`);
}
function mountSeo(app2) {
  const wrap2 = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  app2.get("/robots.txt", (_req, res) => res.type("text/plain").send(`User-agent: *
Allow: /
Disallow: /studio
Disallow: /my
Disallow: /api/action/
Sitemap: ${SITE}/sitemap.xml
`));
  app2.get("/sitemap.xml", wrap2(async (_req, res) => {
    const posts = await publicPosts();
    const urls = [`${SITE}/`, `${SITE}/webzine`, ...posts.map((p) => `${SITE}/blog/${encodeURIComponent(p.id)}`)];
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url, i) => `<url><loc>${escape(url)}</loc>${i > 1 ? `<lastmod>${escape(posts[i - 2].updated || posts[i - 2].published)}</lastmod>` : ""}</url>`).join("")}</urlset>`);
  }));
  const page = wrap2(async (req, res) => {
    const posts = await publicPosts();
    const detail = req.params.id ? posts.find((p) => String(p.id) === req.params.id) : void 0;
    const missing = !!req.params.id && !detail;
    const template = fs.readFileSync(fs.existsSync("dist/index.html") ? "dist/index.html" : "index.html", "utf8");
    res.status(missing ? 404 : 200).type("html").send(render(template, req.path, posts, detail, missing));
  });
  app2.get("/", page);
  app2.get("/webzine", page);
  app2.get("/blog", (_req, res) => res.redirect(301, "/webzine"));
  app2.get("/blog/:id", page);
}

// server.ts
dotenv.config();
var app = express();
app.use(express.json({ limit: "2mb" }));
var FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
var GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
var GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
var ai = { models: { generateContent: async (input) => {
  if (!GEMINI_API_KEY) throw err("Vercel\uC5D0 GEMINI_API_KEY\uB97C \uC124\uC815\uD55C \uB4A4 \uC7AC\uBC30\uD3EC\uD558\uC138\uC694.");
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY }).models.generateContent(input);
} } };
var wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
async function authenticateUser(req, res, next) {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  if (!token) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  try {
    req.user = await identity(token);
    next();
  } catch (e) {
    res.status(e.status || 503).json({ error: e.message });
  }
}
app.get("/api/health", (_req, res) => res.json({ ok: true, siteId: "hub5" }));
app.get("/api/config-status", (_req, res) => res.json({ configured: !!GEMINI_API_KEY, storageMode: "firebase-user-rest", serverStorageCredentialsRequired: false, siteId: "hub5" }));
app.get("/api/auth/me", authenticateUser, (req, res) => res.json({ user: { uid: req.user.uid, email: req.user.email } }));
app.all("/api/auth/*", (_req, res) => res.status(410).json({ error: "\uBE0C\uB77C\uC6B0\uC800 Firebase \uB85C\uADF8\uC778\uC73C\uB85C \uC778\uC99D\uD558\uC138\uC694." }));
app.use("/api/action", authenticateUser);
var DEFAULT_GALLERY_IMAGES = [
  {
    _id: "img_jeju_ocean",
    title: "\uC81C\uC8FC \uC560\uC6D4 \uD574\uC548 \uC808\uBCBD\uACFC \uC5D0\uBA54\uB784\uB4DC \uBC14\uB2E4",
    destination: "\uC81C\uC8FC\uB3C4 \uC560\uC6D4\uC74D \uD574\uC548\uB3C4\uB85C",
    tags: ["\uC5EC\uD589\xB7\uB9DB\uC9D1", "\uC81C\uC8FC\uB3C4", "\uBC14\uB2E4", "\uC5EC\uD589", "\uB9DB\uC9D1", "\uD574\uC548\uB3C4\uB85C", "\uD790\uB9C1"],
    prompt: "Breathtaking blue sea cliffs and emerald waters in Aewol Jeju Island",
    ratio: "16:9",
    aspectRatio: "16:9",
    visibility: "public",
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80"
  },
  {
    _id: "img_vintage_cafe",
    title: "\uBE48\uD2F0\uC9C0 \uAC10\uC131 \uBD81\uCE74\uD398\uC640 \uB530\uB73B\uD55C \uB77C\uB5BC \uD55C \uC794",
    destination: "\uC11C\uCD0C \uACE8\uBAA9 \uC228\uC740 \uBD81\uCE74\uD398",
    tags: ["\uCE74\uD398", "\uCEE4\uD53C", "\uBD81\uCE74\uD398", "\uAC10\uC131", "\uB514\uC800\uD2B8", "\uB77C\uB5BC"],
    prompt: "Cozy vintage bookstore cafe with warm wooden interior and hot cafe latte",
    ratio: "4:3",
    aspectRatio: "4:3",
    visibility: "public",
    imageUrl: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80"
  },
  {
    _id: "img_minimal_humidifier",
    title: "\uCE5C\uD658\uACBD \uBB34\uC120 \uBBF8\uB2C8 \uAC00\uC2B5\uAE30 & \uB370\uC2A4\uD06C\uD14C\uB9AC\uC5B4",
    destination: "\uD648 \uC624\uD53C\uC2A4 \uC6D0\uBAA9 \uB370\uC2A4\uD06C",
    tags: ["\uC0DD\uD65C", "\uC81C\uD488", "\uC778\uD14C\uB9AC\uC5B4", "\uAC00\uC804", "\uB370\uC2A4\uD06C\uD14C\uB9AC\uC5B4", "\uB9AC\uBDF0"],
    prompt: "Sleek minimalist ultrasonic humidifier with wood accent on workstation desk",
    ratio: "1:1",
    aspectRatio: "1:1",
    visibility: "public",
    imageUrl: "https://images.unsplash.com/photo-1545231027-63b3f162609c?auto=format&fit=crop&w=800&q=80"
  },
  {
    _id: "img_parkgolf_course",
    title: "\uD478\uB978 \uC794\uB514\uAC00 \uD3BC\uCCD0\uC9C4 \uAC15\uBCC0 \uD30C\uD06C\uACE8\uD504\uC7A5 \uD544\uB4DC",
    destination: "\uB099\uB3D9\uAC15\uBCC0 \uC0DD\uD0DC\uACF5\uC6D0 \uD30C\uD06C\uACE8\uD504 \uD074\uB7FD",
    tags: ["\uD30C\uD06C\uACE8\uD504", "\uACE8\uD504", "\uC2A4\uD3EC\uCE20", "\uC57C\uC678", "\uAC74\uAC15", "\uB77C\uC6B4\uB529"],
    prompt: "Vibrant green lawn fairway with park golf flags under bright clear sky",
    ratio: "16:9",
    aspectRatio: "16:9",
    visibility: "public",
    imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=800&q=80"
  },
  {
    _id: "img_teak_wood_craft",
    title: "\uC790\uC5F0 \uCE5C\uD654\uC801 \uD504\uB9AC\uBBF8\uC5C4 \uD2F0\uD06C\uC6D0\uBAA9 \uC8FC\uBC29 \uB3C4\uB9C8",
    destination: "\uB0B4\uCD94\uB7F4 \uB9AC\uBE59 \uB2E4\uC774\uB2DD\uB8F8",
    tags: ["\uC0DD\uD65C", "\uC8FC\uBC29", "\uC6D0\uBAA9", "\uC694\uB9AC", "\uB3C4\uB9C8", "\uC2DD\uAE30"],
    prompt: "Artisanal organic teak wood cutting board with sourdough bread on linen",
    ratio: "4:3",
    aspectRatio: "4:3",
    visibility: "public",
    imageUrl: "https://images.unsplash.com/photo-1544982503-9f984c14501a?auto=format&fit=crop&w=800&q=80"
  },
  {
    _id: "img_camping_sunset",
    title: "\uB178\uC744 \uC9C0\uB294 \uD638\uC22B\uAC00 \uAC10\uC131 \uCC28\uBC15 \uCEA0\uD551",
    destination: "\uCDA9\uC8FC\uD638 \uB178\uC744 \uCEA0\uD551\uC7A5",
    tags: ["\uC5EC\uD589\xB7\uB9DB\uC9D1", "\uC5EC\uD589", "\uCEA0\uD551", "\uB178\uC744", "\uD790\uB9C1", "\uCC28\uBC15", "\uD48D\uACBD"],
    prompt: "Warm twilight sunset over lakeside campsite with lit lanterns",
    ratio: "16:9",
    aspectRatio: "16:9",
    visibility: "public",
    imageUrl: "https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=800&q=80"
  },
  {
    _id: "img_bakery_pastry",
    title: "\uAC13 \uAD6C\uC6B4 \uD06C\uB8E8\uC544\uC0C1\uACFC \uBE0C\uB7F0\uCE58 \uBCA0\uC774\uCEE4\uB9AC",
    destination: "\uC131\uC218\uB3D9 \uC720\uB7FD\uD48D \uBCA0\uC774\uCEE4\uB9AC \uC20D",
    tags: ["\uCE74\uD398", "\uBCA0\uC774\uCEE4\uB9AC", "\uBE75\uC9D1", "\uB514\uC800\uD2B8", "\uB9DB\uC9D1", "\uBE0C\uB7F0\uCE58"],
    prompt: "Freshly baked golden butter croissants on rustic bakery tray",
    ratio: "4:3",
    aspectRatio: "4:3",
    visibility: "public",
    imageUrl: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=80"
  },
  {
    _id: "img_parkgolf_putter",
    title: "\uC190\uC5D0 \uAC10\uAE30\uB294 \uBA85\uD488 \uD30C\uD06C\uACE8\uD504 \uD074\uB7FD\uACFC \uBCFC",
    destination: "\uD30C\uD06C\uACE8\uD504 \uC804\uBB38 \uC7A5\uBE44 \uBD80\uC2A4",
    tags: ["\uD30C\uD06C\uACE8\uD504", "\uC7A5\uBE44", "\uACE8\uD504\uCC44", "\uC6A9\uD488", "\uC81C\uD488", "\uC2A4\uD3EC\uCE20"],
    prompt: "Close-up of premium wooden park golf club and glossy ball on green turf",
    ratio: "1:1",
    aspectRatio: "1:1",
    visibility: "public",
    imageUrl: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=800&q=80"
  }
];
async function getPublicImageCandidates() {
  return (await query("images", [["visibility", "public"]])).map((d) => ({ ...d, _id: d._docId }));
}
app.get("/api/hub/gallery-images", wrap(async (_req, res) => {
  const images = await getPublicImageCandidates();
  res.json({ images: images.map((img) => ({ id: img._id, title: img.title || "\uC774\uBBF8\uC9C0", destination: img.destination || "", tags: img.tags || [], prompt: img.prompt || "", ratio: img.ratio || img.aspectRatio || "16:9", previewUrl: `/api/hub/${img._id}` })) });
}));
app.post("/api/action/recommend-from-images", async (req, res) => {
  const { theme, selectedImages, userNotes } = req.body;
  if (!theme) return res.status(400).json({ error: "\uD14C\uB9C8\uAC00 \uC120\uD0DD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." });
  if (!Array.isArray(selectedImages) || selectedImages.length === 0) {
    return res.status(400).json({ error: "\uCD5C\uC18C 1\uC7A5 \uC774\uC0C1\uC758 \uC774\uBBF8\uC9C0\uB97C \uC120\uD0DD\uD574\uC57C \uD569\uB2C8\uB2E4." });
  }
  try {
    const existingTitles = (await publicPosts()).map((p) => p.title);
    const imagesSummary = selectedImages.map((img, i) => {
      return `[\uC0AC\uC9C4 ${i + 1}] ID: ${img.id}, \uC81C\uBAA9: ${img.title || ""}, \uC7A5\uC18C/\uC18C\uC7AC: ${img.destination || ""}, \uD0DC\uADF8: ${(img.tags || []).join(", ")}${img.userHint ? `, \uC791\uAC00 \uBA54\uBAA8: "${img.userHint}"` : ""}`;
    }).join("\n");
    const prompt = `\uC0AC\uC6A9\uC790\uAC00 \uC120\uD0DD\uD55C \uD14C\uB9C8: "${theme}"
\uC0AC\uC6A9\uC790\uAC00 \uC774\uBBF8\uC9C0\uD5C8\uBE0C\uC5D0\uC11C \uC9C1\uC811 \uC5C4\uC120\uD55C \uC0AC\uC9C4\uB4E4 (${selectedImages.length}\uC7A5):
${imagesSummary}
${userNotes ? `\uC0AC\uC6A9\uC790 \uC804\uCCB4 \uD78C\uD2B8: "${userNotes}"` : ""}

[\uAE30\uC874\uC5D0 \uBC1C\uD589\uB41C \uBE14\uB85C\uADF8 \uC81C\uBAA9 \uBAA9\uB85D (\uC911\uBCF5 \uD68C\uD53C\uC6A9)]
${existingTitles.length > 0 ? existingTitles.slice(0, 10).map((t) => `- ${t}`).join("\n") : "(\uC5C6\uC74C)"}

[\uC694\uAD6C\uC0AC\uD56D]
1. \uC0AC\uC6A9\uC790\uAC00 \uACE0\uB978 ${selectedImages.length}\uC7A5\uC758 \uC0AC\uC9C4\uB4E4\uC758 \uC7A5\uC18C, \uC18C\uC7AC, \uBD84\uC704\uAE30, \uC791\uAC00 \uBA54\uBAA8\uB97C \uC2EC\uCE35 \uBD84\uC11D\uD558\uC2ED\uC2DC\uC624.
2. \uC774 \uC0AC\uC9C4\uB4E4\uC744 \uD558\uB098\uC758 \uC77C\uAD00\uB41C \uC2A4\uD1A0\uB9AC\uB77C\uC778\uC73C\uB85C \uC5EE\uC5B4\uB0BC \uC218 \uC788\uB294 \uAC00\uC7A5 \uB9E4\uB825\uC801\uC774\uACE0 \uC138\uB828\uB41C \uBE14\uB85C\uADF8 \uAE00 \uC81C\uBAA9 5\uAC1C\uB97C \uCD94\uCC9C\uD558\uC2ED\uC2DC\uC624.
3. \uAE30\uC874 \uC81C\uBAA9 \uBAA9\uB85D\uACFC \uC808\uB300 \uC911\uBCF5\uB418\uC9C0 \uC54A\uC544\uC57C \uD558\uBA70, \uC0AC\uC9C4\uC758 \uAD6C\uCCB4\uC801\uC778 \uD2B9\uC9D5\uACFC \uC7A5\uC18C\uAC00 \uC0DD\uC0DD\uD558\uAC8C \uB290\uAEF4\uC9C0\uB3C4\uB85D \uC791\uC131\uD558\uC2ED\uC2DC\uC624.

\uCD9C\uB825\uC740 \uBC18\uB4DC\uC2DC 5\uAC1C\uC758 \uBB38\uC790\uC5F4\uB85C \uAD6C\uC131\uB41C JSON \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4. \uC608\uC2DC: ["\uC81C\uBAA91", "\uC81C\uBAA92", "\uC81C\uBAA93", "\uC81C\uBAA94", "\uC81C\uBAA95"]`;
    let recommended = [];
    try {
      const geminiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      recommended = JSON.parse(geminiRes.text || "[]");
    } catch (aiErr) {
      throw err("AI \uC81C\uBAA9 \uCD94\uCC9C \uC2E4\uD328: " + aiErr.message);
    }
    if (!Array.isArray(recommended) || recommended.length !== 5) throw err("AI \uC81C\uBAA9 \uCD94\uCC9C \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    return res.json({ recommended: recommended.slice(0, 5) });
  } catch (err2) {
    res.status(err2.status || 503).json({ error: err2.message });
  }
});
app.post("/api/action/recommend", async (req, res) => {
  const { theme } = req.body;
  if (!theme) return res.status(400).json({ error: "\uD14C\uB9C8\uAC00 \uC120\uD0DD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." });
  try {
    const prompt = `\uC0AC\uC6A9\uC790\uAC00 \uC120\uD0DD\uD55C \uD14C\uB9C8\uB294 "${theme}"\uC785\uB2C8\uB2E4.
\uD14C\uB9C8\uC5D0 \uAF2D \uB9DE\uB294 \uB9E4\uB825\uC801\uC774\uACE0 \uC138\uB828\uB41C \uBE14\uB85C\uADF8 \uAE00 \uC8FC\uC81C/\uC81C\uBAA9 5\uAC1C\uB97C \uCD94\uCC9C\uD574\uC8FC\uC138\uC694.
\uCD9C\uB825\uC740 \uBC18\uB4DC\uC2DC 5\uAC1C\uC758 \uBB38\uC790\uC5F4\uB85C \uAD6C\uC131\uB41C JSON \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.`;
    let recommended = [];
    try {
      const geminiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      recommended = JSON.parse(geminiRes.text || "[]");
    } catch (aiErr) {
      throw err("AI \uC81C\uBAA9 \uCD94\uCC9C \uC2E4\uD328: " + aiErr.message);
    }
    if (!Array.isArray(recommended) || recommended.length !== 5) throw err("AI \uC81C\uBAA9 \uCD94\uCC9C \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    return res.json({ recommended });
  } catch (err2) {
    res.status(err2.status || 503).json({ error: err2.message });
  }
});
app.post("/api/action/init-post", wrap(async (req, res) => {
  const p = await createDraft(req.body.theme, req.user.uid, req.user.idToken);
  res.json({ id: p.id, post: clientPost(p) });
}));
app.post("/api/action/generate-content", async (req, res) => {
  const { id, theme, title, selectedImages } = req.body;
  const { uid, idToken: token } = req.user;
  if (!id || !theme || !title) {
    return res.status(400).json({ error: "id, theme, title\uC740 \uD544\uC218 \uC785\uB825 \uD56D\uBAA9\uC785\uB2C8\uB2E4." });
  }
  try {
    const original = await ownPost(id, uid, token);
    assertVersion(original, req.body.expectedVersion);
    let imagesToUse = Array.isArray(selectedImages) && selectedImages.length >= 1 ? selectedImages : [];
    if (imagesToUse.length === 0) {
      const candidates = await getPublicImageCandidates();
      const allCandidates = candidates.length > 0 ? candidates : DEFAULT_GALLERY_IMAGES;
      imagesToUse = allCandidates.slice(0, 3).map((img) => ({
        id: img._id || img.id,
        title: img.title || "",
        destination: img.destination || "",
        tags: img.tags || [],
        userHint: ""
      }));
    }
    const imagesSpec = imagesToUse.map((img, idx) => {
      return `[\uC0AC\uC9C4 ${idx + 1}] ID: "${img.id}", \uC81C\uBAA9: "${img.title || ""}", \uB300\uC0C1/\uC7A5\uC18C: "${img.destination || ""}", \uD0DC\uADF8: "${(img.tags || []).join(", ")}"${img.userHint ? `, \uC791\uAC00 \uBA54\uBAA8: "${img.userHint}"` : ""}`;
    }).join("\n");
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
              imageId: { type: Type.STRING, description: "\uC0AC\uC6A9\uC790\uAC00 \uC804\uB2EC\uD55C \uC774\uBBF8\uC9C0 ID \uC911 \uD558\uB098 (\uC9C0\uC815\uB41C \uC21C\uC11C\uC5D0 \uB9DE\uAC8C \uBC30\uCE58)" },
              caption: { type: Type.STRING, description: "\uC774\uBBF8\uC9C0\uC5D0 \uC5B4\uC6B8\uB9AC\uB294 \uB514\uD14C\uC77C \uCEA1\uC158" }
            },
            required: ["heading", "paragraphs", "imageId", "caption"]
          }
        },
        summary: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["title", "description", "intro", "sections", "summary", "tags"]
    };
    const prompt = `\uD14C\uB9C8: "${theme}"
\uC120\uD0DD\uB41C \uAE00 \uC81C\uBAA9: "${title}"

\uC0AC\uC6A9\uC790\uAC00 \uC9C1\uC811 \uC120\uC815\uD55C ${imagesToUse.length}\uC7A5\uC758 \uC0AC\uC9C4 \uBAA9\uB85D (\uC774 \uC21C\uC11C\uB300\uB85C \uBCF8\uBB38\uC758 \uAC01 \uC139\uC158\uC5D0 \uC21C\uCC28\uC801\uC73C\uB85C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uBC30\uCE58\uD574\uC57C \uD569\uB2C8\uB2E4):
${imagesSpec}

[\uC791\uC131 \uC9C0\uCE68]
1. \uC0AC\uC6A9\uC790\uAC00 \uACE0\uB978 \uC0AC\uC9C4\uB4E4\uC758 ID\uB97C sections\uC758 \uAC01 'imageId'\uC5D0 \uC21C\uC11C\uB300\uB85C \uC815\uD655\uD558\uAC8C \uB9E4\uCE6D\uD558\uC2ED\uC2DC\uC624. (\uC784\uC758\uC758 \uAC00\uC9DC ID\uB97C \uB9CC\uB4E4\uC9C0 \uB9D0\uACE0, \uC704\uC5D0 \uC81C\uACF5\uB41C \uC0AC\uC9C4 ID\uB97C \uC815\uD655\uD788 \uC4F0\uC2ED\uC2DC\uC624).
2. \uCD1D \uC139\uC158 \uAC1C\uC218\uB294 \uC804\uB2EC\uB41C \uC0AC\uC9C4 \uAC1C\uC218(${imagesToUse.length}\uAC1C)\uC5D0 \uB9DE\uCDB0 ${imagesToUse.length}\uAC1C\uC758 \uC139\uC158\uC744 \uAD6C\uC131\uD558\uC2ED\uC2DC\uC624.
3. \uAC01 \uC139\uC158\uB9C8\uB2E4 \uD574\uB2F9 \uC0AC\uC9C4\uC758 \uC18C\uC7AC, \uC7A5\uC18C, \uC791\uAC00 \uBA54\uBAA8\uB97C \uD48D\uBD80\uD558\uAC8C \uBB18\uC0AC\uD558\uB294 \uC18C\uC81C\uBAA9(heading), \uBCF8\uBB38 \uBB38\uB2E8(paragraphs), \uCEA1\uC158(caption)\uC744 \uC644\uC131\uB3C4 \uB192\uC740 \uC874\uB313\uB9D0 \uBB38\uCCB4\uB85C \uC791\uC131\uD558\uC2ED\uC2DC\uC624.
4. \uB3C4\uC785\uBD80(intro)\uC640 \uB9C8\uBB34\uB9AC \uC694\uC57D(summary), \uC5F0\uAD00 \uD574\uC2DC\uD0DC\uADF8(tags)\uB3C4 \uAC10\uC131\uC801\uC774\uACE0 \uC720\uC775\uD558\uAC8C \uC791\uC131\uD558\uC2ED\uC2DC\uC624.

\uCD9C\uB825\uC740 \uBC18\uB4DC\uC2DC \uC9C0\uC815\uB41C JSON schema\uB97C \uC644\uBCBD\uD558\uAC8C \uC900\uC218\uD574\uC57C \uD569\uB2C8\uB2E4.`;
    let postContent = null;
    try {
      const geminiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: postSchema
        }
      });
      postContent = JSON.parse(geminiRes.text || "{}");
    } catch (aiErr) {
      throw err("AI \uAE00 \uC0DD\uC131 \uC2E4\uD328: " + aiErr.message);
    }
    if (!postContent?.sections?.length) throw err("AI\uAC00 \uC720\uD6A8\uD55C \uBCF8\uBB38\uC744 \uBC18\uD658\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    const validIds = imagesToUse.map((img) => img.id);
    if (Array.isArray(postContent.sections)) {
      postContent.sections.forEach((sec, idx) => {
        if (!sec.imageId || !validIds.includes(sec.imageId)) {
          sec.imageId = imagesToUse[idx % imagesToUse.length]?.id || validIds[0];
        }
      });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedPost = {
      id: original.id,
      owner: uid,
      theme,
      title: postContent.title || title,
      description: postContent.description || "",
      content: JSON.stringify(postContent),
      status: "draft",
      created: original.created,
      updated: now,
      published: "",
      version: original.version + 1
    };
    const saved = await save(updatedPost, uid, token, original);
    return res.json({ success: true, post: clientPost(saved) });
  } catch (err2) {
    console.error("Post generation failed:", err2);
    return res.status(err2.status || 503).json({ error: err2.message });
  }
});
app.post("/api/action/review", async (req, res) => {
  const { id } = req.body;
  const uid = req.user.uid;
  const token = req.user.idToken;
  if (!id) return res.status(400).json({ error: "id\uB294 \uD544\uC218\uC785\uB2C8\uB2E4." });
  try {
    const post2 = await ownPost(id, uid, token);
    assertVersion(post2, req.body.expectedVersion);
    let postBody = {};
    try {
      postBody = JSON.parse(post2.content || "{}");
    } catch {
      postBody = { intro: post2.description || "", sections: [] };
    }
    const reviewSchema = {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, description: "\uAE00 \uD3C9\uC810 (100\uC810 \uB9CC\uC810)" },
        strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "\uC7A5\uC810 \uC124\uBA85" },
        weaknesses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "\uAC1C\uC120\uD560 \uC810 \uC124\uBA85" },
        improvedText: {
          type: Type.OBJECT,
          description: "\uAC1C\uC120\uC548 \uBCF8\uBB38 \uAD6C\uC870 (\uC804\uCCB4 \uC591\uC2DD \uC720\uC9C0)",
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
    const reviewPrompt = `\uC544\uB798 \uBE14\uB85C\uADF8 \uAE00\uC758 \uB0B4\uC6A9\uC744 \uC815\uC131\uAECF \uAC80\uC218\uD574\uC8FC\uC138\uC694.
\uAE00\uC790 \uAD50\uC815, \uAC00\uB3C5\uC131, \uD45C\uD604 \uD5A5\uC0C1\uBC95\uC744 \uD53C\uB4DC\uBC31\uD574 \uC8FC\uC2DC\uACE0 \uAC1C\uC120 \uC81C\uC548 \uBCF8\uBB38\uC778 'improvedText'\uB97C \uC644\uBCBD\uD558\uAC8C \uC791\uC131\uD574 \uC8FC\uC138\uC694. 'improvedText' \uAD6C\uC870\uB294 \uC774\uBBF8\uC9C0 ID \uB9E4\uCE6D\uC744 \uACE0\uC2A4\uB780\uD788 \uC0B4\uB9B0 \uCC44 \uD53C\uB4DC\uBC31\uC774 \uC644\uBCBD \uC801\uC6A9\uB41C \uC644\uC131\uBCF8\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.

[\uBE14\uB85C\uADF8 \uBCF8\uBB38]
${JSON.stringify(postBody, null, 2)}`;
    let reviewResult = null;
    try {
      const geminiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: reviewPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: reviewSchema
        }
      });
      reviewResult = JSON.parse(geminiRes.text || "{}");
    } catch (err2) {
      throw err("AI \uAC80\uC218 \uC2E4\uD328: " + err2.message);
    }
    if (!Number.isFinite(reviewResult?.score) || !reviewResult?.improvedText) throw err("AI \uAC80\uC218 \uACB0\uACFC \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    await saveReview(post2, reviewResult, uid, token);
    return res.json({ success: true, reviewResult });
  } catch (err2) {
    console.error("Review failed:", err2);
    return res.status(err2.status || 503).json({ error: err2.message });
  }
});
app.post("/api/action/update-post", wrap(async (req, res) => {
  const { id, status, title, description, content, expectedVersion } = req.body;
  if (!["draft", "published", "deleted"].includes(status)) throw err("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC800\uC7A5 \uC0C1\uD0DC\uC785\uB2C8\uB2E4.", 400);
  const p = await ownPost(id, req.user.uid, req.user.idToken);
  assertVersion(p, expectedVersion);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const next = { ...p, status, title: title ?? p.title, description: description ?? p.description, content: content === void 0 ? p.content : typeof content === "string" ? content : JSON.stringify(content), updated: now, published: status === "published" ? p.published || now : "", version: p.version + 1 };
  JSON.parse(next.content);
  const saved = await save(next, req.user.uid, req.user.idToken, p, content !== void 0 && next.content !== p.content);
  res.json({ success: true, post: clientPost(saved) });
}));
app.post("/api/action/apply-review", wrap(async (req, res) => {
  const p = await ownPost(req.body.id, req.user.uid, req.user.idToken);
  assertVersion(p, req.body.expectedVersion);
  const review = (await reviews(p.id, req.user.uid, req.user.idToken))[0];
  if (!review?.reviewResult?.improvedText) throw err("\uBA3C\uC800 \uC6D0\uACE0\uB97C \uAC80\uC218\uD558\uC138\uC694.", 400);
  if (review.baseVersion !== p.version || review.baseTime !== p._time) throw err("\uAC80\uC218 \uC774\uD6C4 \uC6D0\uACE0\uAC00 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uAC80\uC218\uD558\uC138\uC694.", 409);
  const body = review.reviewResult.improvedText;
  const saved = await save({ ...p, title: body.title || p.title, description: body.description || p.description, content: JSON.stringify(body), version: p.version + 1, updated: (/* @__PURE__ */ new Date()).toISOString() }, req.user.uid, req.user.idToken, p, true);
  res.json({ success: true, version: saved.version });
}));
app.get("/api/action/revisions/:id", wrap(async (req, res) => {
  await ownPost(req.params.id, req.user.uid, req.user.idToken);
  res.json({ revisions: await revisions(req.params.id, req.user.uid, req.user.idToken) });
}));
app.post("/api/action/restore-revision", wrap(async (req, res) => {
  const p = await ownPost(req.body.id, req.user.uid, req.user.idToken);
  assertVersion(p, req.body.expectedVersion);
  const target = (await revisions(p.id, req.user.uid, req.user.idToken)).find((r) => r.version === req.body.version);
  if (!target) throw err("\uBCF5\uC6D0\uD560 \uBC84\uC804\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
  const saved = await save({ ...p, title: target.title, description: target.description, content: target.content, version: p.version + 1, updated: (/* @__PURE__ */ new Date()).toISOString() }, req.user.uid, req.user.idToken, p, true);
  res.json({ success: true, version: saved.version });
}));
app.get("/api/action/my-posts", wrap(async (req, res) => res.json({ posts: (await ownPosts(req.user.uid, req.user.idToken)).map(clientPost) })));
app.get("/api/hub/posts", wrap(async (req, res) => {
  let posts = await publicPosts();
  if (req.query.theme && req.query.theme !== "\uC804\uCCB4") posts = posts.filter((p) => p.theme === req.query.theme);
  res.json({ posts: posts.map(clientPost) });
}));
app.get("/api/hub/posts/:id", wrap(async (req, res) => {
  let p = (await publicPosts()).find((p2) => String(p2.id) === req.params.id);
  if (!p && req.headers.authorization?.startsWith("Bearer ")) {
    const identity2 = await identity(req.headers.authorization.slice(7));
    p = await ownPost(req.params.id, identity2.uid, identity2.idToken);
  }
  if (!p) throw err("\uACF5\uAC1C \uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
  res.json({ post: clientPost(p) });
}));
app.get("/api/hub/:imageId", wrap(async (req, res) => {
  const sample = DEFAULT_GALLERY_IMAGES.find((i) => i._id === req.params.imageId);
  if (sample) return res.redirect(sample.imageUrl);
  const d = decode(await request(`/images/${encodeURIComponent(req.params.imageId)}`));
  if (d.visibility !== "public") throw err("\uACF5\uAC1C \uC774\uBBF8\uC9C0\uAC00 \uC544\uB2D9\uB2C8\uB2E4.", 404);
  const src = d.dataUrl || d.thumbnailUrl || d.imageUrl || d.publicUrl;
  if (typeof src === "string" && /^https:\/\//.test(src)) return res.redirect(src);
  const match = typeof src === "string" ? src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s) : null;
  if (!match) throw err("\uC774\uBBF8\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
  res.setHeader("Cache-Control", "public,max-age=86400");
  res.type(match[1]).send(Buffer.from(match[2], "base64"));
}));
app.all("/api/*", (_req, res) => res.status(404).json({ error: "API \uACBD\uB85C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }));
mountSeo(app);
app.use(express.static(path.resolve("dist"), { index: false }));
app.get("*", (_req, res) => {
  const p = fs2.existsSync("dist/index.html") ? "dist/index.html" : "index.html";
  res.type("html").send(fs2.readFileSync(p, "utf8"));
});
app.use((e, _req, res, _next) => res.status(e.status || 503).json({ error: e.message || "\uC11C\uBC84 \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." }));
if (!process.env.VERCEL && process.env.NODE_ENV !== "test") app.listen(Number(process.env.PORT || 3e3));
var server_default = app;

// server/handler.ts
function handler(req, res) {
  const url = new URL(req.url || "/", "https://hubstudio5.vercel.app");
  const route = req.query?.__route || url.searchParams.get("__route");
  url.searchParams.delete("__route");
  if (route) req.url = String(route) + (url.search ? "?" + url.searchParams.toString() : "");
  return server_default(req, res);
}
export {
  handler as default
};
