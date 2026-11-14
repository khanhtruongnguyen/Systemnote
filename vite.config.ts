import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WebSearchItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function stripTags(html: string): string {
  return decodeXmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBingRss(xml: string): WebSearchItem[] {
  const items: WebSearchItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(block);
    const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(block);
    const descMatch = /<description>([\s\S]*?)<\/description>/i.exec(block);
    const title = titleMatch ? stripTags(titleMatch[1]) : '';
    const url = linkMatch ? decodeXmlEntities(linkMatch[1]).trim() : '';
    const snippet = descMatch ? stripTags(descMatch[1]) : '';
    if (title && url && /^https?:\/\//i.test(url)) {
      items.push({ title, url, snippet, source: 'Bing RSS' });
    }
  }
  return items;
}

function isDisallowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.startsWith('169.254.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.')
  ) {
    return true;
  }
  const m172 = /^172\.(\d+)\./.exec(host);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function htmlToReadableMarkdown(html: string): { title: string; content: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';

  let body = html;
  const mainMatch =
    /<(article|main)[^>]*>([\s\S]*?)<\/\1>/i.exec(html) ||
    /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (mainMatch) {
    body = mainMatch[mainMatch.length - 1];
  }

  body = body
    .replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|tr|blockquote|pre)>/gi, '\n');

  const text = decodeXmlEntities(body.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, content: text };
}

function sendJson(
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void },
  status: number,
  data: unknown
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function systemnoteWebToolsPlugin(): Plugin {
  return {
    name: 'systemnote-web-tools',
    configureServer(server) {
      server.middlewares.use('/api/web-search', async (req, res) => {
        try {
          const parsedUrl = new URL(req.url || '/', 'http://localhost');
          const query = (parsedUrl.searchParams.get('q') || '').trim();
          const lang = parsedUrl.searchParams.get('lang') === 'en' ? 'en' : 'vi';
          const limit = Math.min(Math.max(Number(parsedUrl.searchParams.get('limit')) || 8, 1), 12);

          if (!query) {
            sendJson(res, 400, { error: 'Thiếu tham số q' });
            return;
          }

          const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': lang === 'en' ? 'en-US,en;q=0.9' : 'vi-VN,vi;q=0.9,en;q=0.8',
          };

          const [bingRes, wikiRes, ddgRes] = await Promise.allSettled([
            fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`, {
              headers,
              signal: AbortSignal.timeout(8000),
            }).then((r) => (r.ok ? r.text() : '')),
            fetch(
              `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&utf8=1`,
              { headers, signal: AbortSignal.timeout(7000) }
            ).then((r) => (r.ok ? r.json() : null)),
            fetch(
              `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
              { headers, signal: AbortSignal.timeout(7000) }
            ).then((r) => (r.ok ? r.json() : null)),
          ]);

          const combined: WebSearchItem[] = [];
          const sourcesUsed: string[] = [];

          if (bingRes.status === 'fulfilled' && bingRes.value) {
            const parsedBing = parseBingRss(bingRes.value);
            if (parsedBing.length > 0) {
              sourcesUsed.push('Bing RSS');
              combined.push(...parsedBing);
            }
          }

          if (wikiRes.status === 'fulfilled' && wikiRes.value) {
            const wikiJson = wikiRes.value as {
              query?: { search?: Array<{ title?: string; snippet?: string }> };
            };
            const wikiList = wikiJson.query?.search || [];
            if (wikiList.length > 0) {
              sourcesUsed.push(`Wikipedia (${lang})`);
              for (const item of wikiList) {
                if (!item.title) continue;
                combined.push({
                  title: item.title,
                  url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
                  snippet: stripTags(item.snippet || ''),
                  source: `Wikipedia (${lang})`,
                });
              }
            }
          }

          if (ddgRes.status === 'fulfilled' && ddgRes.value) {
            const ddg = ddgRes.value as {
              Heading?: string;
              AbstractText?: string;
              AbstractURL?: string;
              RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
            };
            if (ddg.AbstractText && ddg.AbstractURL) {
              sourcesUsed.push('DuckDuckGo');
              combined.push({
                title: ddg.Heading || query,
                url: ddg.AbstractURL,
                snippet: ddg.AbstractText,
                source: 'DuckDuckGo',
              });
            }
            if (Array.isArray(ddg.RelatedTopics)) {
              for (const rel of ddg.RelatedTopics.slice(0, 3)) {
                if (rel.Text && rel.FirstURL) {
                  combined.push({
                    title: rel.Text.split(' - ')[0] || query,
                    url: rel.FirstURL,
                    snippet: rel.Text,
                    source: 'DuckDuckGo',
                  });
                }
              }
            }
          }

          const deduped: WebSearchItem[] = [];
          const seenUrls = new Set<string>();
          for (const item of combined) {
            const norm = item.url.replace(/#.*$/, '');
            if (seenUrls.has(norm)) continue;
            seenUrls.add(norm);
            deduped.push(item);
            if (deduped.length >= limit) break;
          }

          sendJson(res, 200, {
            query,
            lang,
            sourcesUsed,
            results: deduped,
          });
        } catch (err) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : 'Lỗi tìm kiếm web',
          });
        }
      });

      server.middlewares.use('/api/web-fetch', async (req, res) => {
        try {
          const parsedUrl = new URL(req.url || '/', 'http://localhost');
          const rawTarget = (parsedUrl.searchParams.get('url') || '').trim();
          const maxChars = Math.min(Math.max(Number(parsedUrl.searchParams.get('maxChars')) || 12000, 500), 30000);

          if (!rawTarget) {
            sendJson(res, 400, { error: 'Thiếu tham số url' });
            return;
          }

          let target: URL;
          try {
            target = new URL(rawTarget);
          } catch {
            sendJson(res, 400, { error: 'URL không hợp lệ' });
            return;
          }

          if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            sendJson(res, 400, { error: 'Chỉ hỗ trợ URL http/https' });
            return;
          }
          if (isDisallowedHost(target.hostname)) {
            sendJson(res, 403, { error: 'Không hỗ trợ truy cập địa chỉ nội bộ/localhost' });
            return;
          }

          let title = '';
          let content = '';
          let source = 'direct';

          try {
            const directRes = await fetch(target.toString(), {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Accept: 'text/html,text/plain,application/json;q=0.9',
              },
              redirect: 'follow',
              signal: AbortSignal.timeout(10000),
            });

            if (directRes.ok) {
              const contentType = (directRes.headers.get('content-type') || '').toLowerCase();
              const rawText = await directRes.text();
              if (contentType.includes('text/html') || /<html|<body/i.test(rawText.slice(0, 500))) {
                const parsed = htmlToReadableMarkdown(rawText);
                title = parsed.title;
                content = parsed.content;
              } else {
                content = rawText.trim();
              }
            }
          } catch {
            // Sẽ thử nguồn Jina Reader bên dưới nếu fetch trực tiếp lỗi
          }

          if (content.length < 180) {
            try {
              const jinaRes = await fetch(`https://r.jina.ai/${target.toString()}`, {
                headers: { Accept: 'text/plain' },
                signal: AbortSignal.timeout(12000),
              });
              if (jinaRes.ok) {
                const jinaText = (await jinaRes.text()).trim();
                if (jinaText.length > content.length) {
                  content = jinaText;
                  source = 'jina-reader';
                }
              }
            } catch {
              // Bỏ qua nếu fallback không khả dụng
            }
          }

          if (!content) {
            sendJson(res, 502, { error: 'Không thể đọc nội dung từ trang web này (trang có thể yêu cầu đăng nhập hoặc chặn tự động).' });
            return;
          }

          const lowerSample = content.slice(0, 800).toLowerCase();
          if (
            lowerSample.includes('verify you are human') ||
            lowerSample.includes('cf-turnstile') ||
            lowerSample.includes('enable javascript and cookies to continue')
          ) {
            sendJson(res, 403, { error: 'Trang web yêu cầu xác minh người dùng (anti-bot/CAPTCHA), đã dừng đọc.' });
            return;
          }

          const truncated = content.length > maxChars;
          sendJson(res, 200, {
            url: target.toString(),
            title,
            source,
            truncated,
            content: truncated ? `${content.slice(0, maxChars)}\n\n...[Đã rút gọn bớt nội dung]...` : content,
          });
        } catch (err) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : 'Lỗi đọc trang web',
          });
        }
      });
    },
  };
}

function systemnoteSingleFileRootPlugin(): Plugin {
  return {
    name: 'systemnote-singlefile-root',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '/').split('?')[0];
        if (pathname === '/' || pathname === '/index.html') {
          try {
            const templatePath = path.resolve(__dirname, 'app.html');
            const rawHtml = fs.readFileSync(templatePath, 'utf-8');
            const transformed = await server.transformIndexHtml(req.url || '/', rawHtml);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(transformed);
            return;
          } catch (err) {
            next(err);
            return;
          }
        }
        next();
      });
    },
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir || path.resolve(__dirname, 'dist');
      const appHtmlPath = path.resolve(outDir, 'app.html');
      if (!fs.existsSync(appHtmlPath)) return;

      let html = fs.readFileSync(appHtmlPath, 'utf-8');
      const inlinedScripts: string[] = [];

      // Xóa thẻ modulepreload nếu có
      html = html.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>\s*/gi, '');

      // Nhúng CSS từ dist/assets/*.css vào <style>
      html = html.replace(
        /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
        (fullMatch, href: string) => {
          if (/^https?:\/\//i.test(href) || href.startsWith('//')) {
            return fullMatch;
          }
          const relPath = href.replace(/^\.\//, '').replace(/^\//, '');
          const cssPath = path.resolve(outDir, relPath);
          if (!fs.existsSync(cssPath)) return fullMatch;
          const cssText = fs.readFileSync(cssPath, 'utf-8').replace(/<\/style/gi, '<\\/style');
          return `<style>${cssText}</style>`;
        }
      );

      // Nhúng JS module từ dist/assets/*.js vào <script type="module"> cuối <body>
      html = html.replace(
        /<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>\s*/gi,
        (fullMatch, src: string) => {
          if (/^https?:\/\//i.test(src) || src.startsWith('//')) {
            return fullMatch;
          }
          const relPath = src.replace(/^\.\//, '').replace(/^\//, '');
          const jsPath = path.resolve(outDir, relPath);
          if (!fs.existsSync(jsPath)) return fullMatch;
          const jsText = fs.readFileSync(jsPath, 'utf-8').replace(/<\/script/gi, '<\\/script');
          inlinedScripts.push(`<script type="module">${jsText}</script>`);
          return '';
        }
      );

      if (inlinedScripts.length > 0) {
        html = html.replace('</body>', () => `  ${inlinedScripts.join('\n  ')}\n  </body>`);
      }

      fs.writeFileSync(path.resolve(outDir, 'index.html'), html, 'utf-8');
      fs.writeFileSync(path.resolve(__dirname, 'index.html'), html, 'utf-8');
      fs.rmSync(appHtmlPath, { force: true });
      fs.rmSync(path.resolve(outDir, 'assets'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  base: './',
  optimizeDeps: {
    entries: ['app.html'],
  },
  plugins: [
    react(),
    tailwindcss(),
    systemnoteWebToolsPlugin(),
    systemnoteSingleFileRootPlugin(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rolldownOptions: {
      input: path.resolve(__dirname, 'app.html'),
      output: {
        codeSplitting: false,
      },
    },
  },
});

