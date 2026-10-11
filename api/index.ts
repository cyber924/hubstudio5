import app from '../server';

export default function handler(req: any, res: any) {
  // 1. If Vercel rewrites passed query slug
  if (req.query?.slug) {
    const slugPath = Array.isArray(req.query.slug) ? req.query.slug.join('/') : req.query.slug;
    const queryIdx = req.url ? req.url.indexOf('?') : -1;
    const queryPart = queryIdx !== -1 ? req.url.slice(queryIdx) : '';
    req.url = '/api/' + slugPath + queryPart;
  } else if (req.url) {
    // If stripped of /api prefix
    if (!req.url.startsWith('/api') && !req.url.startsWith('/robots.txt') && !req.url.startsWith('/sitemap.xml')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
  }

  return app(req, res);
}
