import React, { useMemo, useState } from 'react';
import { buildKatexFrameInnerHtml, renderKatexCode, type KatexFrameMode } from '../utils/katexHelper';
import { ImageLightbox } from './ImageLightbox';

interface NoteContentRendererProps {
  content: string;
  onNavigate?: (mapId?: string, noteId?: string) => void;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

function parseInternalHref(href: string): { mapId?: string; nodeId: string } {
  let clean = href;
  if (clean.startsWith('node:')) {
    clean = clean.slice('node:'.length);
  } else if (clean.startsWith('#')) {
    clean = clean.slice(1);
  }
  clean = decodeURIComponent(clean);

  if (clean.includes('::')) {
    const [mId, ...rest] = clean.split('::');
    return { mapId: mId || undefined, nodeId: rest.join('::') };
  }

  if (href.includes('?') && (href.includes('map=') || href.includes('note='))) {
    try {
      const dummy = new URL(href, window.location.origin);
      return {
        mapId: dummy.searchParams.get('map') || undefined,
        nodeId: dummy.searchParams.get('note') || '',
      };
    } catch {
      // ignore
    }
  }

  return { nodeId: clean };
}

export const NoteContentRenderer: React.FC<NoteContentRendererProps> = React.memo(
  ({ content, onNavigate, onNodeClick, className = '' }) => {
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

    const processedHtml = useMemo(() => {
      if (!content || !content.trim()) return '';
      if (typeof document === 'undefined') return content;

      const wrapper = document.createElement('div');
      // Nếu là văn bản thuần chưa có thẻ HTML, bọc thành đoạn <p>
      const looksLikeHtml = /<[a-z][\s\S]*>/i.test(content);
      if (looksLikeHtml) {
        wrapper.innerHTML = content;
      } else {
        content.split(/\n+/).forEach((line) => {
          const p = document.createElement('p');
          p.textContent = line;
          wrapper.appendChild(p);
        });
      }

      // Chuẩn hóa ảnh: chỉ cho phép src an toàn, bật lazy loading & class hiển thị đẹp
      wrapper.querySelectorAll('img').forEach((img) => {
        const src = (img.getAttribute('src') || '').trim();
        if (!src || !/^(https?:\/\/|data:image\/|blob:)/i.test(src)) {
          img.remove();
          return;
        }
        img.classList.add('sn-note-image');
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('title', 'Nhấp để phóng to ảnh');
      });

      // Chuẩn hóa và render lại KaTeX cho mọi khung mã
      wrapper.querySelectorAll('.sn-katex-frame').forEach((el) => {
        const code = el.getAttribute('data-code') || '';
        const mode = (el.getAttribute('data-mode') as KatexFrameMode) || 'block';
        const title = el.getAttribute('data-title') || '';
        el.innerHTML = buildKatexFrameInnerHtml(code, mode, title);
        // Ẩn nút thao tác sửa/xóa khi ở chế độ đọc
        el.querySelectorAll('.sn-katex-actions').forEach((act) => act.remove());
      });

      wrapper.querySelectorAll('.sn-katex-inline').forEach((el) => {
        const code = el.getAttribute('data-code') || '';
        el.innerHTML = renderKatexCode(code, 'inline');
      });

      // Chuẩn hóa link nội bộ vs ngoài
      wrapper.querySelectorAll('a').forEach((a) => {
        const href = a.getAttribute('href') || '';
        const isInternal =
          href.startsWith('node:') ||
          href.startsWith('#') ||
          a.classList.contains('sn-internal-link');

        if (isInternal) {
          a.classList.add('sn-internal-link');
          a.removeAttribute('target');
          a.removeAttribute('rel');
          a.setAttribute('title', 'Nhấp để chuyển tới ô ghi chú này (cùng tab)');
        } else if (href) {
          a.classList.add('sn-external-link');
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      });

      return wrapper.innerHTML;
    }, [content]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const targetEl = e.target as HTMLElement;

      const clickedImg = targetEl.closest('img') as HTMLImageElement | null;
      if (clickedImg) {
        const src = clickedImg.getAttribute('src');
        if (src) {
          e.preventDefault();
          e.stopPropagation();
          setLightboxSrc(src);
        }
        return;
      }

      const anchor = targetEl.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href') || '';
      if (!href) return;

      let isInternal =
        href.startsWith('node:') ||
        href.startsWith('#') ||
        anchor.classList.contains('sn-internal-link');

      if (!isInternal && !href.startsWith('mailto:')) {
        try {
          const urlObj = new URL(href, window.location.origin);
          if (
            urlObj.hostname === window.location.hostname &&
            (urlObj.searchParams.has('note') || urlObj.searchParams.has('map'))
          ) {
            isInternal = true;
          }
        } catch {
          // ignore
        }
      }

      if (isInternal) {
        e.preventDefault();
        e.stopPropagation();
        const { mapId, nodeId } = parseInternalHref(href);
        if (!mapId && onNodeClick && nodeId) {
          onNodeClick(nodeId);
        } else if (onNavigate) {
          onNavigate(mapId, nodeId || undefined);
        } else {
          window.dispatchEvent(
            new CustomEvent('canvas-navigate', {
              detail: { mapId, noteId: nodeId },
            })
          );
        }
      } else {
        e.stopPropagation();
      }
    };

    if (!content || !content.trim() || content === '<p><br></p>') {
      return (
        <div className="text-slate-400 italic text-sm py-4">
          Chưa có nội dung. Bấm nút "Chỉnh sửa" hoặc nhấp đúp để viết.
        </div>
      );
    }

    return (
      <>
        <div
          onClick={handleClick}
          className={`sn-read-surface ql-editor !p-0 ${className}`}
          dangerouslySetInnerHTML={{ __html: processedHtml }}
        />

        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      </>
    );
  }
);

NoteContentRenderer.displayName = 'NoteContentRenderer';
