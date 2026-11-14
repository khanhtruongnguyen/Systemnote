export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResultItem[];
  sourcesUsed: string[];
  error?: string;
}

export interface WebFetchResponse {
  url: string;
  title?: string;
  content: string;
  source: string;
  truncated?: boolean;
  error?: string;
}

function stripTagsQuick(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchFallbackCors(
  query: string,
  lang: 'vi' | 'en',
  limit: number
): Promise<WebSearchResponse> {
  const results: WebSearchResultItem[] = [];
  const sourcesUsed: string[] = [];

  const [wikiRes, ddgRes] = await Promise.allSettled([
    fetch(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&srlimit=${limit}&format=json&origin=*`,
      { signal: AbortSignal.timeout(7000) }
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(7000) }
    ).then((r) => (r.ok ? r.json() : null)),
  ]);

  if (wikiRes.status === 'fulfilled' && wikiRes.value?.query?.search) {
    sourcesUsed.push(`Wikipedia (${lang})`);
    for (const item of wikiRes.value.query.search as Array<{ title?: string; snippet?: string }>) {
      if (!item.title) continue;
      results.push({
        title: item.title,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
        snippet: stripTagsQuick(item.snippet || ''),
        source: `Wikipedia (${lang})`,
      });
    }
  }

  if (ddgRes.status === 'fulfilled' && ddgRes.value) {
    const ddg = ddgRes.value as {
      Heading?: string;
      AbstractText?: string;
      AbstractURL?: string;
    };
    if (ddg.AbstractText && ddg.AbstractURL) {
      sourcesUsed.push('DuckDuckGo');
      results.push({
        title: ddg.Heading || query,
        url: ddg.AbstractURL,
        snippet: ddg.AbstractText,
        source: 'DuckDuckGo',
      });
    }
  }

  return {
    query,
    results: results.slice(0, limit),
    sourcesUsed,
  };
}

export async function searchWebSources(
  query: string,
  lang: 'vi' | 'en' = 'vi',
  limit = 7
): Promise<WebSearchResponse> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { query: '', results: [], sourcesUsed: [], error: 'Từ khóa tìm kiếm rỗng' };
  }

  // 1. Ưu tiên Vite dev-server middleware (/api/web-search: Bing RSS + Wikipedia + DDG)
  try {
    const res = await fetch(
      `/api/web-search?q=${encodeURIComponent(cleanQuery)}&lang=${lang}&limit=${limit}`,
      { signal: AbortSignal.timeout(9500) }
    );
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && contentType.includes('application/json')) {
      const data = (await res.json()) as WebSearchResponse;
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data;
      }
    }
  } catch {
    // Chuyển sang nguồn CORS trực tiếp từ trình duyệt
  }

  // 2. Fallback trực tiếp bằng CORS (Wikipedia origin=* + DuckDuckGo Instant Answer)
  try {
    return await searchFallbackCors(cleanQuery, lang, limit);
  } catch (err) {
    return {
      query: cleanQuery,
      results: [],
      sourcesUsed: [],
      error: err instanceof Error ? err.message : 'Không thể kết nối công cụ tìm kiếm',
    };
  }
}

export async function fetchWebPage(url: string, maxChars = 12000): Promise<WebFetchResponse> {
  const cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    return { url: cleanUrl, content: '', source: 'none', error: 'URL phải bắt đầu bằng http:// hoặc https://' };
  }

  // 1. Thử Vite dev middleware (/api/web-fetch)
  try {
    const res = await fetch(
      `/api/web-fetch?url=${encodeURIComponent(cleanUrl)}&maxChars=${maxChars}`,
      { signal: AbortSignal.timeout(13000) }
    );
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as WebFetchResponse;
      if (res.ok && data.content) {
        return data;
      }
      if (!res.ok && data.error) {
        return { url: cleanUrl, content: '', source: 'proxy', error: data.error };
      }
    }
  } catch {
    // Fallback Jina Reader
  }

  // 2. Fallback trực tiếp Jina Reader (CORS-enabled Markdown extractor)
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${cleanUrl}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(12000),
    });
    if (jinaRes.ok) {
      const text = (await jinaRes.text()).trim();
      if (text) {
        const lowerSample = text.slice(0, 800).toLowerCase();
        if (
          lowerSample.includes('verify you are human') ||
          lowerSample.includes('cf-turnstile')
        ) {
          return {
            url: cleanUrl,
            content: '',
            source: 'jina-reader',
            error: 'Trang web có bước xác minh anti-bot/CAPTCHA, đã bỏ qua.',
          };
        }
        const truncated = text.length > maxChars;
        return {
          url: cleanUrl,
          content: truncated ? `${text.slice(0, maxChars)}\n\n...[Đã rút gọn]...` : text,
          source: 'jina-reader',
          truncated,
        };
      }
    }
  } catch (err) {
    return {
      url: cleanUrl,
      content: '',
      source: 'jina-reader',
      error: err instanceof Error ? err.message : 'Không thể đọc nội dung URL',
    };
  }

  return {
    url: cleanUrl,
    content: '',
    source: 'none',
    error: 'Không đọc được nội dung từ trang web này.',
  };
}
