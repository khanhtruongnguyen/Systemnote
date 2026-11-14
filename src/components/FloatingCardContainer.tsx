import React, { useRef, useCallback, useEffect } from 'react';
import type { CustomNode, FloatingCardState } from '../types';
import { COLOR_SCHEMES, CANVAS_THEMES, DEFAULT_CANVAS_THEME, type CanvasTheme } from '../constants/theme';
import { NoteContentRenderer } from './NoteContentRenderer';
import {
  Pencil,
  X,
  Minus,
  Maximize2,
  Grid,
  Layers,
  FileText,
  GripHorizontal,
} from 'lucide-react';

interface FloatingCardContainerProps {
  cards: FloatingCardState[];
  nodes: CustomNode[];
  canvasTheme?: CanvasTheme;
  onCloseCard: (id: string) => void;
  onUpdateCard: (id: string, updates: Partial<FloatingCardState>) => void;
  onBringToFront: (id: string) => void;
  onCloseAllCards: () => void;
  onTileCards: () => void;
  onCascadeCards: () => void;
  onNavigate?: (mapId?: string, noteId?: string) => void;
  onSelectNodeById?: (nodeId: string) => void;
  onEditNodeInSidebar: (nodeId: string) => void;
}

export const FloatingCardContainer: React.FC<FloatingCardContainerProps> = ({
  cards,
  nodes,
  canvasTheme = CANVAS_THEMES[DEFAULT_CANVAS_THEME],
  onCloseCard,
  onUpdateCard,
  onBringToFront,
  onCloseAllCards,
  onTileCards,
  onCascadeCards,
  onNavigate,
  onSelectNodeById,
  onEditNodeInSidebar,
}) => {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const onUpdateCardRef = useRef(onUpdateCard);
  onUpdateCardRef.current = onUpdateCard;

  const dragRef = useRef<{
    activeCardId: string | null;
    startX: number;
    startY: number;
    cardStartX: number;
    cardStartY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  }>({
    activeCardId: null,
    startX: 0,
    startY: 0,
    cardStartX: 0,
    cardStartY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
  });

  const resizeRef = useRef<{
    activeCardId: string | null;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    lastWidth: number;
    lastHeight: number;
    resized: boolean;
  }>({
    activeCardId: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    lastWidth: 0,
    lastHeight: 0,
    resized: false,
  });

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (dragRef.current.activeCardId) {
        const { activeCardId, startX, startY, cardStartX, cardStartY } = dragRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const newX = Math.max(10, Math.min(window.innerWidth - 100, cardStartX + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - 80, cardStartY + dy));

        dragRef.current.lastX = newX;
        dragRef.current.lastY = newY;
        dragRef.current.moved = true;

        const el = cardRefs.current.get(activeCardId);
        if (el) {
          el.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
        }
      }

      if (resizeRef.current.activeCardId) {
        const { activeCardId, startX, startY, startWidth, startHeight } = resizeRef.current;
        const dw = e.clientX - startX;
        const dh = e.clientY - startY;

        const newWidth = Math.max(280, Math.min(window.innerWidth * 0.9, startWidth + dw));
        const newHeight = Math.max(180, Math.min(window.innerHeight * 0.85, startHeight + dh));

        resizeRef.current.lastWidth = newWidth;
        resizeRef.current.lastHeight = newHeight;
        resizeRef.current.resized = true;

        const el = cardRefs.current.get(activeCardId);
        if (el) {
          el.style.width = `${newWidth}px`;
          el.style.height = `${newHeight}px`;
        }
      }
    };

    const handlePointerUp = () => {
      if (dragRef.current.activeCardId) {
        const { activeCardId, lastX, lastY, moved } = dragRef.current;
        dragRef.current.activeCardId = null;
        if (moved) {
          onUpdateCardRef.current(activeCardId, { x: lastX, y: lastY });
        }
      }

      if (resizeRef.current.activeCardId) {
        const { activeCardId, lastWidth, lastHeight, resized } = resizeRef.current;
        resizeRef.current.activeCardId = null;
        if (resized) {
          onUpdateCardRef.current(activeCardId, { width: lastWidth, height: lastHeight });
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  const bringCardToFrontIfNeeded = useCallback(
    (cardId: string) => {
      const currentCards = cardsRef.current;
      const target = currentCards.find((c) => c.id === cardId);
      if (!target) return;
      const maxZ = currentCards.reduce((m, c) => Math.max(m, c.zIndex), 0);
      if (target.zIndex < maxZ) {
        onBringToFront(cardId);
      }
    },
    [onBringToFront]
  );

  const handleStartDrag = useCallback(
    (cardId: string, e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;

      bringCardToFrontIfNeeded(cardId);
      const card = cardsRef.current.find((c) => c.id === cardId);
      if (!card) return;

      dragRef.current = {
        activeCardId: cardId,
        startX: e.clientX,
        startY: e.clientY,
        cardStartX: card.x,
        cardStartY: card.y,
        lastX: card.x,
        lastY: card.y,
        moved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [bringCardToFrontIfNeeded]
  );

  const handleStartResize = useCallback(
    (cardId: string, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();

      bringCardToFrontIfNeeded(cardId);
      const card = cardsRef.current.find((c) => c.id === cardId);
      if (!card) return;

      resizeRef.current = {
        activeCardId: cardId,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: card.width,
        startHeight: card.height,
        lastWidth: card.width,
        lastHeight: card.height,
        resized: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [bringCardToFrontIfNeeded]
  );

  if (cards.length === 0) return null;

  const isDark = canvasTheme.isDark;

  return (
    <div className="fixed inset-0 pointer-events-none z-[120] overflow-hidden select-none">
      {cards.map((card) => {
        const node = nodes.find((n) => n.id === card.id);
        if (!node) return null;

        const data = node.data;
        const colorScheme = COLOR_SCHEMES[data.color] || COLOR_SCHEMES.indigo;
        const isMinimized = Boolean(card.isMinimized);

        return (
          <div
            key={card.id}
            ref={(el) => {
              if (el) cardRefs.current.set(card.id, el);
              else cardRefs.current.delete(card.id);
            }}
            onPointerDown={() => bringCardToFrontIfNeeded(card.id)}
            style={{
              transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
              width: isMinimized ? '280px' : `${card.width}px`,
              height: isMinimized ? 'auto' : `${card.height}px`,
              zIndex: card.zIndex,
            }}
            className={`absolute flex flex-col rounded-xl border shadow-[0_12px_36px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] pointer-events-auto overflow-hidden will-change-transform ${
              isDark ? 'bg-[#171b24] border-slate-800' : 'bg-white border-slate-200/95'
            }`}
          >
            <div className={`h-[2.5px] w-full ${colorScheme.strip} shrink-0`} />
            <div
              onPointerDown={(e) => handleStartDrag(card.id, e)}
              className={`flex items-center justify-between px-3.5 py-2 border-b cursor-grab active:cursor-grabbing shrink-0 select-none transition-colors ${
                isDark
                  ? 'bg-[#1d222d] border-slate-800 hover:bg-[#232936]'
                  : 'bg-slate-50/80 border-slate-100 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 mr-2">
                <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span
                  className={`text-[12.5px] font-semibold truncate ${
                    isDark ? 'text-slate-100' : 'text-slate-800'
                  }`}
                >
                  {data.label || 'Ghi chú'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!isMinimized && (
                  <button
                    type="button"
                    onClick={() => onEditNodeInSidebar(card.id)}
                    title="Mở trong trình soạn thảo Quill"
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                      isDark
                        ? 'bg-[#161a22] text-slate-200 border-slate-700 hover:border-slate-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Pencil className="w-3 h-3 text-slate-400" />
                    <span>Sửa</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onUpdateCard(card.id, { isMinimized: !isMinimized })}
                  title={isMinimized ? 'Mở rộng thẻ' : 'Thu nhỏ thẻ'}
                  className={`p-1 rounded-md text-slate-400 transition-colors cursor-pointer ${
                    isDark
                      ? 'hover:text-slate-200 hover:bg-slate-800'
                      : 'hover:text-slate-700 hover:bg-slate-200/70'
                  }`}
                >
                  {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                </button>

                <button
                  type="button"
                  onClick={() => onCloseCard(card.id)}
                  title="Đóng thẻ này"
                  className={`p-1 rounded-md text-slate-400 transition-colors cursor-pointer ${
                    isDark
                      ? 'hover:text-rose-400 hover:bg-rose-950/50'
                      : 'hover:text-rose-600 hover:bg-rose-50'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <div
                className={`flex-1 flex flex-col min-h-0 relative select-text ${
                  isDark ? 'bg-[#171b24]' : 'bg-white'
                }`}
              >
                <div
                  className="flex-1 overflow-y-auto p-4 text-xs select-text cursor-default space-y-2"
                  onDoubleClick={() => onEditNodeInSidebar(card.id)}
                  title="Nhấp đúp chuột để mở chỉnh sửa"
                >
                  {data.content && data.content.trim() && data.content !== '<p><br></p>' ? (
                    <NoteContentRenderer
                      content={data.content}
                      onNavigate={onNavigate}
                      onNodeClick={onSelectNodeById}
                    />
                  ) : (
                    <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-center p-4 space-y-2 text-slate-400">
                      <FileText className="w-8 h-8 text-slate-300" />
                      <p className="text-[11px] text-slate-500">Ghi chú chưa có nội dung</p>
                      <button
                        type="button"
                        onClick={() => onEditNodeInSidebar(card.id)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Viết ghi chú</span>
                      </button>
                    </div>
                  )}
                </div>

                <div
                  onPointerDown={(e) => handleStartResize(card.id, e)}
                  title="Kéo góc này để chỉnh kích thước thẻ"
                  className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1 text-slate-300 hover:text-slate-600 transition-colors pointer-events-auto select-none"
                >
                  <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor">
                    <circle cx="8" cy="8" r="1.2" />
                    <circle cx="8" cy="4" r="1.2" />
                    <circle cx="4" cy="8" r="1.2" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Dock điều khiển các thẻ nổi */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-xl border shadow-[0_6px_20px_rgba(15,23,42,0.1)] text-xs animate-in fade-in slide-in-from-bottom-2 duration-150 ${
            isDark
              ? 'bg-[#171b24]/95 border-slate-800 text-slate-200'
              : 'bg-white/95 border-slate-200 text-slate-700'
          }`}
        >
          <span
            className={`font-medium flex items-center gap-1.5 pl-1 ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Đang mở {cards.length} thẻ
          </span>

          <div className={`w-px h-3.5 mx-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

          <button
            type="button"
            onClick={onTileCards}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
              isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Grid className="w-3.5 h-3.5 text-slate-400" />
            <span>Xếp cạnh nhau</span>
          </button>

          <button
            type="button"
            onClick={onCascadeCards}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
              isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Xếp so le</span>
          </button>

          <div className={`w-px h-3.5 mx-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

          <button
            type="button"
            onClick={onCloseAllCards}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
              isDark
                ? 'hover:bg-rose-950/50 text-slate-400 hover:text-rose-400'
                : 'hover:bg-rose-50 text-slate-500 hover:text-rose-600'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            <span>Đóng hết</span>
          </button>
        </div>
      </div>
    </div>
  );
};
