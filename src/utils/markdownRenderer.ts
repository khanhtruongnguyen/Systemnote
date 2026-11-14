import katex from 'katex';

export function escapeHtmlText(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderKatexSafe(expr: string, displayMode: boolean): string {
  const trimmed = expr.trim();
  if (!trimmed) return '';
  try {
    return katex.renderToString(trimmed, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
    });
  } catch {
    return `<code class="sn-katex-error">${escapeHtmlText(trimmed)}</code>`;
  }
}

function sanitizeSafeUrl(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (!url) return null;
  if (url.startsWith('#')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  return null;
}

interface TokenStore {
  values: string[];
}

function makeToken(store: TokenStore, html: string): string {
  const id = store.values.length;
  store.values.push(html);
  return `\uE000SNT${id}\uE001`;
}

function restoreTokens(text: string, store: TokenStore): string {
  let result = text;
  // Pass twice in case a container token wraps an inline token
  for (let pass = 0; pass < 2; pass++) {
    if (!result.includes('\uE000SNT')) break;
    result = result.replace(/\uE000SNT(\d+)\uE001/g, (_, idxStr) => {
      const idx = Number(idxStr);
      return Number.isFinite(idx) && store.values[idx] !== undefined ? store.values[idx] : '';
    });
  }
  return result;
}

function protectCodeAndMath(rawInput: string, store: TokenStore): string {
  let text = rawInput.replace(/\r\n?/g, '\n');

  // 1. Fenced code blocks ```lang ... ```
  text = text.replace(
    /^```([a-zA-Z0-9_+#.-]*)[ \t]*\n([\s\S]*?)^```[ \t]*$/gm,
    (_, lang: string, code: string) => {
      const cleanLang = (lang || '').trim();
      const langBadge = cleanLang
        ? `<div class="sn-md-code-lang">${escapeHtmlText(cleanLang)}</div>`
        : '';
      const html =
        `<div class="sn-md-code-block">${langBadge}` +
        `<pre class="sn-md-pre"><code>${escapeHtmlText(code.replace(/\n$/, ''))}</code></pre></div>`;
      return makeToken(store, html);
    }
  );

  // Also handle inline/single-line fenced blocks without trailing newline
  text = text.replace(
    /```([a-zA-Z0-9_+#.-]*)\s+([\s\S]*?)```/g,
    (_, lang: string, code: string) => {
      const cleanLang = (lang || '').trim();
      const langBadge = cleanLang
        ? `<div class="sn-md-code-lang">${escapeHtmlText(cleanLang)}</div>`
        : '';
      const html =
        `<div class="sn-md-code-block">${langBadge}` +
        `<pre class="sn-md-pre"><code>${escapeHtmlText(code.trim())}</code></pre></div>`;
      return makeToken(store, html);
    }
  );

  // 2. Inline code spans (`...` or ``...``)
  text = text.replace(/``([^\n]+?)``|`([^`\n]+?)`/g, (_, doubleInner: string, singleInner: string) => {
    const codeText = doubleInner ?? singleInner ?? '';
    return makeToken(store, `<code class="sn-md-inline-code">${escapeHtmlText(codeText)}</code>`);
  });

  // 3. Display math $$...$$ and \[...\]
  text = text.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, dollarExpr: string, bracketExpr: string) => {
    const expr = dollarExpr ?? bracketExpr ?? '';
    return makeToken(store, `<div class="sn-katex-display">${renderKatexSafe(expr, true)}</div>`);
  });

  // 4. Inline math \(...\)
  text = text.replace(/\\\((.+?)\\\)/g, (_, parenExpr: string) => {
    return makeToken(store, renderKatexSafe(parenExpr, false));
  });

  // 5. Inline math $...$ (single line, avoids price literals like $100 / $50)
  text = text.replace(/(^|[^\\$])\$([^\s$\n](?:[^\n$]*?[^\s$\n])?)\$(?!\d)/g, (full, prefix: string, expr: string) => {
    // Heuristic: if it starts with digits + space/text like "$10 và $20", skip math unless it contains math symbols
    if (/^\d+(?:[.,]\d+)?(?:\s+|$)/.test(expr) && !/[=+\-*/^_{}\\]/.test(expr)) {
      return full;
    }
    return `${prefix}${makeToken(store, renderKatexSafe(expr, false))}`;
  });

  // Unescape literal \$
  text = text.replace(/\\\$/g, '$');

  return text;
}

function renderInlineMarkdown(rawText: string, store: TokenStore): string {
  // Replace Markdown links BEFORE escaping so quotes/urls stay parseable, then store as tokens
  let working = rawText.replace(/\[([^\]\n]+)\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g, (full, label: string, urlPart: string) => {
    const cleanUrlRaw = urlPart.replace(/\s+"[^"]*"$/, '');
    const safeUrl = sanitizeSafeUrl(cleanUrlRaw);
    if (!safeUrl) return full;
    const innerLabel = formatBasicInlineText(escapeHtmlText(label));
    return makeToken(
      store,
      `<a href="${escapeHtmlText(safeUrl)}" target="_blank" rel="noopener noreferrer" class="sn-md-link">${innerLabel}</a>`
    );
  });

  // Escape remaining raw HTML safely
  working = escapeHtmlText(working);

  // Format bold/italic/strikethrough
  working = formatBasicInlineText(working);

  return restoreTokens(working, store);
}

function formatBasicInlineText(escaped: string): string {
  let out = escaped;
  // Bold + Italic ***text***
  out = out.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold **text** or __text__
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])__([^\s_](?:[^_\n]*?[^\s_])?)__(?=$|[\s).,!?:;])/g, '$1<strong>$2</strong>');
  // Strikethrough ~~text~~
  out = out.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
  // Italic *text* or _text_
  out = out.replace(/\*([^\s*\n](?:[^*\n]*?[^\s*\n])?)\*/g, '<em>$1</em>');
  out = out.replace(/(^|[\s(])_([^\s_\n](?:[^_\n]*?[^\s_\n])?)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
  return out;
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
  const cells = splitTableCells(trimmed);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function getColumnAlignments(separatorLine: string): Array<'left' | 'center' | 'right'> {
  return splitTableCells(separatorLine).map((cell) => {
    const startsColon = cell.startsWith(':');
    const endsColon = cell.endsWith(':');
    if (startsColon && endsColon) return 'center';
    if (endsColon) return 'right';
    return 'left';
  });
}

function isStandaloneBlockToken(line: string, store: TokenStore): boolean {
  const trimmed = line.trim();
  const match = /^\uE000SNT(\d+)\uE001$/.exec(trimmed);
  if (!match) return false;
  const html = store.values[Number(match[1])] || '';
  return html.startsWith('<div class="sn-md-code-block"') || html.startsWith('<div class="sn-katex-display"');
}

const HR_REGEX = /^([-*_])(?:\s*\1){2,}\s*$/;

function renderBlocks(lines: string[], store: TokenStore): string {
  const htmlBlocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Standalone fenced code block or display math block
    if (isStandaloneBlockToken(trimmed, store)) {
      htmlBlocks.push(restoreTokens(trimmed, store));
      i++;
      continue;
    }

    // Horizontal rule
    if (HR_REGEX.test(trimmed)) {
      htmlBlocks.push('<hr class="sn-md-hr" />');
      i++;
      continue;
    }

    // Heading #..####
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInlineMarkdown(headingMatch[2], store);
      htmlBlocks.push(`<h${level} class="sn-md-h${level}">${content}</h${level}>`);
      i++;
      continue;
    }

    // Markdown Table
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      const headerCells = splitTableCells(lines[i]);
      const aligns = getColumnAlignments(lines[i + 1]);
      i += 2;

      const bodyRows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes('|')) break;
        bodyRows.push(splitTableCells(lines[i]));
        i++;
      }

      const thHtml = headerCells
        .map((cell, idx) => {
          const align = aligns[idx] || 'left';
          return `<th style="text-align:${align}">${renderInlineMarkdown(cell, store)}</th>`;
        })
        .join('');

      const tbodyHtml = bodyRows
        .map((row) => {
          const tds = headerCells
            .map((_, idx) => {
              const align = aligns[idx] || 'left';
              const cellText = row[idx] || '';
              return `<td style="text-align:${align}">${renderInlineMarkdown(cellText, store)}</td>`;
            })
            .join('');
          return `<tr>${tds}</tr>`;
        })
        .join('');

      htmlBlocks.push(
        `<div class="sn-md-table-wrap"><table class="sn-md-table"><thead><tr>${thHtml}</tr></thead><tbody>${tbodyHtml}</tbody></table></div>`
      );
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      htmlBlocks.push(`<blockquote class="sn-md-blockquote">${renderBlocks(quoteLines, store)}</blockquote>`);
      continue;
    }

    // Lists (unordered / ordered, supports 1-level indent nesting cleanly)
    const listMatch = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (listMatch) {
      const listHtml = parseListBlock(lines, i, store);
      htmlBlocks.push(listHtml.html);
      i = listHtml.nextIndex;
      continue;
    }

    // Paragraph: collect contiguous normal text lines
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      const curTrim = cur.trim();
      if (
        !curTrim ||
        isStandaloneBlockToken(curTrim, store) ||
        /^(#{1,4})\s+/.test(curTrim) ||
        HR_REGEX.test(curTrim) ||
        /^\s*>/.test(cur) ||
        /^(\s*)([-*+]|\d+[.)])\s+/.test(cur) ||
        (curTrim.includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(curTrim);
      i++;
    }

    if (paraLines.length > 0) {
      const joined = paraLines.map((l) => renderInlineMarkdown(l, store)).join('<br />');
      htmlBlocks.push(`<p class="sn-md-p">${joined}</p>`);
    }
  }

  return htmlBlocks.join('');
}

function parseListBlock(
  lines: string[],
  startIndex: number,
  store: TokenStore
): { html: string; nextIndex: number } {
  const firstMatch = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/.exec(lines[startIndex]);
  if (!firstMatch) return { html: '', nextIndex: startIndex + 1 };

  const baseIndent = firstMatch[1].length;
  const isOrdered = /^\d+[.)]$/.test(firstMatch[2]);
  const tag = isOrdered ? 'ol' : 'ul';
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // Allow single blank line only if next line is indented list item
      if (i + 1 < lines.length && /^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i + 1])) {
        const nextM = /^(\s*)([-*+]|\d+[.)])\s+/.exec(lines[i + 1])!;
        if (nextM[1].length >= baseIndent) {
          i++;
          continue;
        }
      }
      break;
    }

    const m = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (!m) break;

    const indent = m[1].length;
    const itemIsOrdered = /^\d+[.)]$/.test(m[2]);

    if (indent < baseIndent) {
      break;
    }

    if (indent > baseIndent + 1) {
      // Nested child list
      const nested = parseListBlock(lines, i, store);
      if (items.length > 0) {
        items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, `${nested.html}</li>`);
      } else {
        items.push(`<li>${nested.html}</li>`);
      }
      i = nested.nextIndex;
      continue;
    }

    if (indent === baseIndent && itemIsOrdered !== isOrdered) {
      break;
    }

    let itemContent = m[3];
    // Support GitHub task list checkboxes nicely
    const taskMatch = /^\[( |x|X)\]\s+([\s\S]+)$/.exec(itemContent);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === 'x';
      const inner = renderInlineMarkdown(taskMatch[2], store);
      items.push(
        `<li class="sn-md-task-item"><span class="sn-md-checkbox ${checked ? 'is-checked' : ''}">${checked ? '✓' : ''}</span><span>${inner}</span></li>`
      );
    } else {
      items.push(`<li>${renderInlineMarkdown(itemContent, store)}</li>`);
    }
    i++;
  }

  return {
    html: `<${tag} class="sn-md-list sn-md-${tag}">${items.join('')}</${tag}>`,
    nextIndex: i,
  };
}

/**
 * Render Markdown + KaTeX (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) thành HTML an toàn cho Khung Mã.
 */
export function renderMarkdownWithKatex(rawMarkdown: string): string {
  const source = (rawMarkdown || '').trim();
  if (!source) {
    return '<div class="sn-katex-mixed-body"><p class="sn-md-empty">(Khung mã trống)</p></div>';
  }

  const store: TokenStore = { values: [] };
  const protectedText = protectCodeAndMath(source, store);
  const lines = protectedText.split('\n');
  const renderedBlocks = renderBlocks(lines, store);
  const restored = restoreTokens(renderedBlocks, store);

  return `<div class="sn-katex-mixed-body">${restored}</div>`;
}
