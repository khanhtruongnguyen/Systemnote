import {
  buildKatexFrameInnerHtml,
  escapeHtml,
  stripHtmlToText,
  type KatexFrameMode,
} from './katexHelper';

export interface NoteBlockItem {
  index: number;
  kind: 'code-frame' | 'heading' | 'list' | 'paragraph' | 'media' | 'other';
  title?: string;
  mode?: KatexFrameMode;
  code?: string;
  textSummary: string;
  html: string;
}

function isEmptyQuillSpacer(el: Element): boolean {
  if (el.querySelector('img, .sn-katex-frame, .sn-katex-inline, a')) return false;
  const text = (el.textContent || '').replace(/\u200b/g, '').trim();
  return text.length === 0;
}

function parseTopLevelElements(html: string): Element[] {
  if (typeof document === 'undefined') return [];
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html || '';
  const elements: Element[] = [];
  wrapper.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (!isEmptyQuillSpacer(el)) {
        elements.push(el);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').trim();
      if (txt) {
        const p = document.createElement('p');
        p.textContent = txt;
        elements.push(p);
      }
    }
  });
  return elements;
}

function serializeElementsForQuill(htmlChunks: string[]): string {
  const cleaned = htmlChunks.map((c) => c.trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  const last = cleaned[cleaned.length - 1];
  // Đảm bảo Quill luôn có dòng trống cuối để người dùng bấm gõ sau Khung Mã
  if (last.includes('sn-katex-frame')) {
    cleaned.push('<p><br></p>');
  }
  return cleaned.join('');
}

export function createCodeFrameHtml(
  code: string,
  mode: KatexFrameMode = 'mixed',
  title?: string
): string {
  const safeMode: KatexFrameMode =
    mode === 'block' || mode === 'inline' || mode === 'mixed' ? mode : 'mixed';
  const resolvedTitle = (title || '').trim() || (safeMode === 'mixed' ? 'Khung Mã' : 'Công thức KaTeX');
  const inner = buildKatexFrameInnerHtml(code, safeMode, resolvedTitle);
  return (
    `<div class="sn-katex-frame" contenteditable="false"` +
    ` data-code="${escapeHtml(code)}"` +
    ` data-mode="${safeMode}"` +
    ` data-title="${escapeHtml(resolvedTitle)}">${inner}</div>`
  );
}

export function parseNoteBlocks(html: string): NoteBlockItem[] {
  const elements = parseTopLevelElements(html);
  return elements.map((el, index) => {
    if (el.classList.contains('sn-katex-frame')) {
      const code = el.getAttribute('data-code') || '';
      const rawMode = el.getAttribute('data-mode') || 'mixed';
      const mode: KatexFrameMode =
        rawMode === 'block' || rawMode === 'inline' || rawMode === 'mixed' ? rawMode : 'mixed';
      const title = el.getAttribute('data-title') || 'Khung Mã';
      return {
        index,
        kind: 'code-frame',
        title,
        mode,
        code,
        textSummary: code,
        html: createCodeFrameHtml(code, mode, title),
      };
    }

    const tag = el.tagName.toLowerCase();
    let kind: NoteBlockItem['kind'] = 'other';
    if (/^h[1-6]$/.test(tag)) kind = 'heading';
    else if (tag === 'ul' || tag === 'ol') kind = 'list';
    else if (el.querySelector('img') || tag === 'img') kind = 'media';
    else if (tag === 'p' || tag === 'blockquote' || tag === 'pre') kind = 'paragraph';

    return {
      index,
      kind,
      textSummary: stripHtmlToText(el.outerHTML),
      html: el.outerHTML,
    };
  });
}

export function formatNoteBlocksForAi(html: string): string {
  const blocks = parseNoteBlocks(html);
  if (blocks.length === 0) {
    return '(Ghi chú hiện đang trống)';
  }
  return blocks
    .map((block) => {
      if (block.kind === 'code-frame') {
        return (
          `[Block #${block.index} | KHUNG MÃ (${block.mode || 'mixed'}) | Tiêu đề: "${block.title || 'Khung Mã'}"]\n` +
          `${block.code || ''}\n` +
          `[/Block #${block.index}]`
        );
      }
      return `[Block #${block.index} | ${block.kind.toUpperCase()}]\n${block.textSummary}\n[/Block #${block.index}]`;
    })
    .join('\n\n');
}

export interface InsertCodeFrameParams {
  code: string;
  mode?: KatexFrameMode;
  title?: string;
  position?: 'append' | 'prepend' | 'after_index' | 'replace_all';
  targetIndex?: number;
}

export function insertCodeFrameIntoHtml(
  currentHtml: string,
  params: InsertCodeFrameParams
): string {
  const frameHtml = createCodeFrameHtml(
    params.code,
    params.mode || 'mixed',
    params.title || 'Khung Mã AI'
  );
  const pos = params.position || 'append';

  if (pos === 'replace_all') {
    return serializeElementsForQuill([frameHtml]);
  }

  const blocks = parseNoteBlocks(currentHtml);
  const chunks = blocks.map((b) => b.html);

  if (pos === 'prepend') {
    return serializeElementsForQuill([frameHtml, ...chunks]);
  }

  if (pos === 'after_index' && typeof params.targetIndex === 'number') {
    const insertAt = Math.min(Math.max(params.targetIndex + 1, 0), chunks.length);
    chunks.splice(insertAt, 0, frameHtml);
    return serializeElementsForQuill(chunks);
  }

  return serializeElementsForQuill([...chunks, frameHtml]);
}

export interface UpdateCodeFrameParams {
  blockIndex?: number;
  titleMatch?: string;
  code: string;
  mode?: KatexFrameMode;
  title?: string;
}

export function updateCodeFrameInHtml(
  currentHtml: string,
  params: UpdateCodeFrameParams
): { html: string; updatedCount: number; error?: string } {
  const blocks = parseNoteBlocks(currentHtml);
  if (blocks.length === 0) {
    return {
      html: currentHtml,
      updatedCount: 0,
      error: 'Ghi chú chưa có khối nào để cập nhật.',
    };
  }

  let targetIdx = -1;
  if (typeof params.blockIndex === 'number') {
    const candidate = blocks.find((b) => b.index === params.blockIndex && b.kind === 'code-frame');
    if (candidate) targetIdx = candidate.index;
  } else if (params.titleMatch) {
    const needle = params.titleMatch.trim().toLowerCase();
    const candidate = blocks.find(
      (b) => b.kind === 'code-frame' && (b.title || '').toLowerCase().includes(needle)
    );
    if (candidate) targetIdx = candidate.index;
  } else {
    const frames = blocks.filter((b) => b.kind === 'code-frame');
    if (frames.length > 0) targetIdx = frames[frames.length - 1].index;
  }

  if (targetIdx === -1) {
    return {
      html: currentHtml,
      updatedCount: 0,
      error: 'Không tìm thấy Khung Mã phù hợp để cập nhật.',
    };
  }

  const oldBlock = blocks[targetIdx];
  const updatedHtml = createCodeFrameHtml(
    params.code,
    params.mode || oldBlock.mode || 'mixed',
    params.title !== undefined ? params.title : oldBlock.title
  );
  const chunks = blocks.map((b, idx) => (idx === targetIdx ? updatedHtml : b.html));

  return {
    html: serializeElementsForQuill(chunks),
    updatedCount: 1,
  };
}

export interface DeleteNoteBlocksParams {
  mode: 'by_indices' | 'all_old' | 'except_code_frames' | 'by_text';
  blockIndices?: number[];
  searchText?: string;
}

export function deleteNoteBlocksInHtml(
  currentHtml: string,
  params: DeleteNoteBlocksParams
): { html: string; deletedCount: number } {
  const blocks = parseNoteBlocks(currentHtml);
  if (blocks.length === 0) {
    return { html: '', deletedCount: 0 };
  }

  if (params.mode === 'all_old') {
    return { html: '', deletedCount: blocks.length };
  }

  if (params.mode === 'except_code_frames') {
    const kept = blocks.filter((b) => b.kind === 'code-frame');
    return {
      html: serializeElementsForQuill(kept.map((b) => b.html)),
      deletedCount: blocks.length - kept.length,
    };
  }

  if (params.mode === 'by_text') {
    const needle = (params.searchText || '').trim().toLowerCase();
    if (!needle) return { html: currentHtml, deletedCount: 0 };
    const kept = blocks.filter((b) => !b.textSummary.toLowerCase().includes(needle));
    return {
      html: serializeElementsForQuill(kept.map((b) => b.html)),
      deletedCount: blocks.length - kept.length,
    };
  }

  const indexSet = new Set(params.blockIndices || []);
  const kept = blocks.filter((b) => !indexSet.has(b.index));
  return {
    html: serializeElementsForQuill(kept.map((b) => b.html)),
    deletedCount: blocks.length - kept.length,
  };
}

export interface ReorganizeSectionInput {
  title: string;
  markdownContent: string;
  mode?: KatexFrameMode;
}

export function reorganizeNoteHtml(
  currentHtml: string,
  sections: ReorganizeSectionInput[],
  preserveImages = true
): string {
  const blocks = parseNoteBlocks(currentHtml);
  const preservedMedia = preserveImages
    ? blocks.filter((b) => b.kind === 'media').map((b) => b.html)
    : [];

  const frameChunks = sections.map((sec) =>
    createCodeFrameHtml(sec.markdownContent, sec.mode || 'mixed', sec.title || 'Khung Mã')
  );

  return serializeElementsForQuill([...frameChunks, ...preservedMedia]);
}
