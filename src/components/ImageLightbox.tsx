import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from 'lucide-react';

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const STEP = 0.25;

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, onClose }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  // Reset zoom & pan mỗi lần mở ảnh mới
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, [src]);

  const clampScale = useCallback((val: number) => {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(val.toFixed(2))));
  }, []);

  const updateScale = useCallback(
    (next: number) => {
      const clamped = clampScale(next);
      setScale(clamped);
      if (clamped <= 1) {
        setOffset({ x: 0, y: 0 });
      }
    },
    [clampScale]
  );

  const zoomIn = useCallback(() => {
    setScale((prev) => clampScale(prev + STEP));
  }, [clampScale]);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const next = clampScale(prev - STEP);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, [clampScale]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Bắt phím Esc ở capture phase để không làm thoát chế độ toàn màn hình hoặc bỏ chọn ô ở nền
  useEffect(() => {
    if (!src) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [src, onClose, zoomIn, zoomOut, resetZoom]);

  // Lăn chuột phóng to / thu nhỏ (dùng passive: false để ngăn trình duyệt cuộn nền)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !src) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setScale((prev) => {
        const next = clampScale(prev + delta);
        if (next <= 1) {
          setOffset({ x: 0, y: 0 });
        }
        return next;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [src, clampScale]);

  if (!src || typeof document === 'undefined') return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if unsupported
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!dragStateRef.current.active) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    setOffset({
      x: dragStateRef.current.originX + dx,
      y: dragStateRef.current.originY + dy,
    });
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    setIsDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    e.stopPropagation();
    if (scale > 1.05) {
      resetZoom();
    } else {
      updateScale(2);
    }
  };

  return createPortal(
    <div
      ref={viewportRef}
      onClick={onClose}
      className="fixed inset-0 z-[20000] bg-slate-950/88 backdrop-blur-xs flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-150 overflow-hidden"
    >
      {/* Thanh điều khiển Zoom phía trên */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-900/85 border border-white/15 text-white shadow-2xl backdrop-blur-md"
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          title="Thu nhỏ (-)"
          className="p-1.5 rounded-xl hover:bg-white/15 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={resetZoom}
          title="Đưa về kích thước gốc (Phím 0)"
          className="px-2.5 py-1 rounded-xl hover:bg-white/15 text-xs font-bold tabular-nums min-w-[54px] transition-colors cursor-pointer flex items-center justify-center gap-1"
        >
          <span>{Math.round(scale * 100)}%</span>
          {scale !== 1 && <RotateCcw className="w-3 h-3 text-slate-300" />}
        </button>

        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          title="Phóng to (+)"
          className="p-1.5 rounded-xl hover:bg-white/15 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-white/20 mx-1" />

        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          title="Mở ảnh gốc trong tab mới"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl hover:bg-white/15 text-xs font-medium text-slate-100 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Mở ảnh gốc</span>
        </a>

        <button
          type="button"
          onClick={onClose}
          title="Đóng (Esc)"
          className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-colors cursor-pointer ml-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Vùng hiển thị ảnh */}
      <div className="w-full h-full flex items-center justify-center overflow-hidden pointer-events-none">
        <img
          src={src}
          alt={alt || 'Xem ảnh phóng to'}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
            touchAction: 'none',
          }}
          className="pointer-events-auto max-w-[90vw] max-h-[84vh] object-contain rounded-xl shadow-2xl border border-white/10"
        />
      </div>

      {/* Gợi ý thao tác ngắn gọn phía dưới */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-900/70 border border-white/10 text-[11px] text-slate-300 pointer-events-none hidden sm:block"
      >
        Lăn chuột hoặc nhấp đúp để phóng to · Kéo ảnh để di chuyển · Bấm Esc để đóng
      </div>
    </div>,
    document.body
  );
};
