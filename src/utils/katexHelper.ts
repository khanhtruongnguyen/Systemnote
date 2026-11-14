import katex from 'katex';
import { renderMarkdownWithKatex } from './markdownRenderer';

export type KatexFrameMode = 'block' | 'inline' | 'mixed';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripOuterDelimiters(raw: string, isBlock: boolean): string {
  const trimmed = raw.trim();
  if (isBlock) {
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
      return trimmed.slice(2, -2).trim();
    }
    if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length >= 4) {
      return trimmed.slice(2, -2).trim();
    }
  } else {
    if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2 && !trimmed.startsWith('$$')) {
      return trimmed.slice(1, -1).trim();
    }
    if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length >= 4) {
      return trimmed.slice(2, -2).trim();
    }
  }
  return trimmed;
}

function safeKatexRender(expr: string, displayMode: boolean): string {
  if (!expr.trim()) {
    return '<span class="sn-katex-empty">(Chưa có công thức)</span>';
  }
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'htmlAndMathml',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<span class="sn-katex-error" title="${escapeHtml(msg)}">${escapeHtml(expr)}</span>`;
  }
}

/**
 * Render mã LaTeX / KaTeX hoặc khung mã văn bản hỗn hợp chứa $...$ / $$...$$
 */
export function renderKatexCode(rawCode: string, mode: KatexFrameMode = 'block'): string {
  const source = rawCode || '';
  if (mode === 'block') {
    return safeKatexRender(stripOuterDelimiters(source, true), true);
  }
  if (mode === 'inline') {
    return safeKatexRender(stripOuterDelimiters(source, false), false);
  }

  // Chế độ hỗn hợp: render đầy đủ Markdown + KaTeX ($$...$$, \[...\], $...$, \(...\))
  return renderMarkdownWithKatex(source);
}

/**
 * Xây dựng HTML chuẩn cho một khung mã KaTeX (Block)
 */
export function buildKatexFrameInnerHtml(
  code: string,
  mode: KatexFrameMode = 'block',
  title?: string
): string {
  const label = title?.trim() || (mode === 'mixed' ? 'Khung Mã' : 'Công thức KaTeX');
  const rendered = renderKatexCode(code, mode);
  return (
    `<div class="sn-katex-frame-header">` +
      `<span class="sn-katex-badge">${escapeHtml(label)}</span>` +
      `<span class="sn-katex-actions">` +
        `<span class="sn-katex-edit-hint" data-action="edit-katex">Sửa mã</span>` +
        `<span class="sn-katex-del-hint" data-action="delete-katex" title="Xóa khung mã">✕</span>` +
      `</span>` +
    `</div>` +
    `<div class="sn-katex-render">${rendered}</div>`
  );
}

/**
 * Trích xuất văn bản thuần từ nội dung HTML Quill để hiển thị bản xem trước gọn trên thẻ Card
 */
export function stripHtmlToText(html: string): string {
  if (!html) return '';
  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('.katex-mathml, .sn-katex-actions, style, script').forEach((el) => el.remove());
    tmp.querySelectorAll('.sn-katex-frame').forEach((el) => {
      const code = el.getAttribute('data-code') || '';
      const title = el.getAttribute('data-title') || '';
      const replacement = document.createTextNode(title ? ` [${title}: ${code}] ` : ` [KaTeX: ${code}] `);
      el.replaceWith(replacement);
    });
    tmp.querySelectorAll('.sn-katex-inline').forEach((el) => {
      const code = el.getAttribute('data-code') || '';
      el.replaceWith(document.createTextNode(` $${code}$ `));
    });
    tmp.querySelectorAll('img').forEach((el) => {
      el.replaceWith(document.createTextNode(' [Hình ảnh] '));
    });
    tmp.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr, br').forEach((el) => {
      el.after(document.createTextNode(' '));
    });
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
  }
  return html.replace(/<img[^>]*>/gi, ' [Hình ảnh] ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function hasKatexContent(html: string): boolean {
  if (!html) return false;
  return (
    html.includes('sn-katex-frame') ||
    html.includes('sn-katex-inline') ||
    html.includes('class="katex')
  );
}

export function hasLinkContent(html: string): boolean {
  if (!html) return false;
  return html.includes('<a ') || html.includes('sn-internal-link') || html.includes('sn-external-link');
}

export function hasImageContent(html: string): boolean {
  if (!html) return false;
  return html.includes('<img ');
}
