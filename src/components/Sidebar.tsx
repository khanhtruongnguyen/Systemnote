import React, { useState, useRef, useEffect } from 'react';
import type { AppSettings, CustomNode, MapData, NodeColor, NodeShape } from '../types';
import { COLOR_SCHEMES, CANVAS_THEMES, DEFAULT_CANVAS_THEME, type CanvasTheme } from '../constants/theme';
import { QuillNoteEditor } from './QuillNoteEditor';
import { NoteContentRenderer } from './NoteContentRenderer';
import { NoteAiAgentPanel } from './NoteAiAgentPanel';
import { ErrorBoundary } from './ErrorBoundary';
import {
  Trash2,
  Link as LinkIcon,
  ChevronDown,
  X,
  Check,
  Maximize2,
  Minimize2,
  Pencil,
  Eye,
  Pin,
  FileText,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  selectedNode: CustomNode | null;
  activeMapId: string;
  activeMap: MapData;
  allNodes: CustomNode[];
  allMaps: MapData[];
  settings: AppSettings;
  canvasTheme?: CanvasTheme;
  isMobile?: boolean;
  initialEditMode?: boolean;
  onClearInitialEditMode?: () => void;
  onSelectNodeById: (nodeId: string) => void;
  onNavigate: (mapId?: string, noteId?: string) => void;
  onUpdateNode: (id: string, updates: Partial<CustomNode['data']>) => void;
  onDeleteNode: (id: string) => void;
  onClose: () => void;
  onOpenFloatingCard?: (nodeId: string) => void;
  onOpenAiSettings: () => void;
}

const SHAPE_LABELS: Record<NodeShape, string> = {
  pill: 'Thẻ',
  circle: 'Chấm',
  card: 'Hộp',
  full: 'Toàn bộ',
};

export const Sidebar: React.FC<SidebarProps> = ({
  selectedNode,
  activeMapId,
  activeMap,
  allNodes,
  allMaps,
  settings,
  canvasTheme = CANVAS_THEMES[DEFAULT_CANVAS_THEME],
  isMobile = false,
  initialEditMode = false,
  onClearInitialEditMode,
  onSelectNodeById,
  onNavigate,
  onUpdateNode,
  onDeleteNode,
  onClose,
  onOpenFloatingCard,
  onOpenAiSettings,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNoteAiOpen, setIsNoteAiOpen] = useState(false);
  const [copiedNoteLink, setCopiedNoteLink] = useState(false);
  const [stylePopoverOpen, setStylePopoverOpen] = useState(false);

  // Mobile Drag Gesture States
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const startTouchY = useRef(0);
  const currentY = useRef(0);
  const startTime = useRef(0);
  const stylePopoverRef = useRef<HTMLDivElement>(null);

  const prevNodeIdRef = useRef<string | undefined>(selectedNode?.id);
  const isDark = canvasTheme.isDark;

  // Chỉ chuyển về Chế độ đọc khi đổi sang ô khác; tránh reset khi gõ chữ làm component cha re-render
  useEffect(() => {
    const currentId = selectedNode?.id;
    const nodeChanged = prevNodeIdRef.current !== currentId;
    prevNodeIdRef.current = currentId;

    if (initialEditMode) {
      setIsEditing(true);
      onClearInitialEditMode?.();
    } else if (nodeChanged) {
      setIsEditing(false);
      setStylePopoverOpen(false);
    }
  }, [selectedNode?.id, initialEditMode, onClearInitialEditMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stylePopoverOpen) {
          setStylePopoverOpen(false);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, stylePopoverOpen]);

  useEffect(() => {
    if (!stylePopoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (stylePopoverRef.current && !stylePopoverRef.current.contains(e.target as Node)) {
        setStylePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [stylePopoverOpen]);

  useEffect(() => {
    setDragOffsetY(0);
    setIsDragging(false);
    setIsExpanded(false);
  }, [selectedNode?.id]);

  if (!selectedNode) return null;

  const { data } = selectedNode;
  const currentColor = data.color || 'indigo';
  const currentShape = data.shape || 'pill';
  const activeScheme = COLOR_SCHEMES[currentColor] || COLOR_SCHEMES.indigo;

  const handleCopyNoteLink = () => {
    try {
      const url = new URL(window.location.href);
      if (activeMapId) {
        url.searchParams.set('map', activeMapId);
      }
      url.searchParams.set('note', selectedNode.id);
      navigator.clipboard.writeText(url.toString());
      setCopiedNoteLink(true);
      setTimeout(() => setCopiedNoteLink(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    startTouchY.current = e.touches[0].clientY;
    currentY.current = 0;
    startTime.current = Date.now();
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !isDragging) return;
    const deltaY = e.touches[0].clientY - startTouchY.current;
    if (deltaY > 0) {
      currentY.current = deltaY;
      setDragOffsetY(deltaY);
    } else if (deltaY < 0 && !isExpanded) {
      currentY.current = deltaY;
      setDragOffsetY(deltaY * 0.3);
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile || !isDragging) return;
    setIsDragging(false);
    const deltaY = currentY.current;
    const elapsed = Date.now() - startTime.current;
    const velocity = deltaY / Math.max(1, elapsed);

    if (deltaY > 85 || velocity > 0.4) {
      setDragOffsetY(window.innerHeight);
      setTimeout(() => {
        onClose();
        setDragOffsetY(0);
      }, 240);
    } else if (deltaY < -45) {
      setIsExpanded(true);
      setDragOffsetY(0);
    } else {
      setDragOffsetY(0);
    }
  };

  const handleDismiss = () => {
    if (isMobile) {
      setDragOffsetY(window.innerHeight);
      setTimeout(() => {
        onClose();
        setDragOffsetY(0);
      }, 240);
    } else {
      onClose();
    }
  };

  const surfacePanel = isDark
    ? 'bg-[#161a22] border-slate-800 text-slate-200'
    : 'bg-white border-slate-200/90 text-slate-800';

  const containerClasses = isFullscreen
    ? `fixed inset-0 z-[100] w-screen h-screen flex flex-col will-change-transform overflow-hidden box-border ${
        isDark ? 'bg-[#12161f]' : 'bg-[#f0f2f5]'
      }`
    : isMobile
    ? `fixed inset-x-0 bottom-0 border-t rounded-t-3xl shadow-[0_-12px_45px_rgba(15,23,42,0.16)] z-50 flex flex-col will-change-transform overflow-hidden box-border ${surfacePanel}`
    : `fixed top-[calc(3.5rem+env(safe-area-inset-top,0px))] bottom-0 right-0 w-full ${
        isEditing ? 'sm:w-[640px] sm:max-w-[90vw]' : 'sm:w-[460px] sm:max-w-[90vw]'
      } border-l shadow-[0_12px_40px_rgba(15,23,42,0.1)] z-40 flex flex-col transition-all duration-200 ease-in-out select-text overflow-hidden box-border ${surfacePanel}`;

  const iconBtnClass = isDark
    ? 'w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer shrink-0'
    : 'w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0';

  return (
    <>
      {isMobile && !isFullscreen && (
        <div
          onClick={handleDismiss}
          style={{
            opacity: isDragging ? Math.max(0, 1 - dragOffsetY / 350) : 1,
          }}
          className="fixed inset-0 bg-slate-900/35 backdrop-blur-xs z-40 transition-opacity"
        />
      )}

      <aside
        aria-label="Thanh bên ghi chú"
        className={containerClasses}
        style={{
          height: isFullscreen
            ? '100vh'
            : isMobile
            ? isExpanded
              ? '96vh'
              : '86vh'
            : undefined,
          transform: isMobile && !isFullscreen ? `translateY(${dragOffsetY}px)` : undefined,
          transition: isDragging
            ? 'none'
            : 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), height 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingBottom: isMobile && !isFullscreen ? 'max(env(safe-area-inset-bottom, 0px), 16px)' : undefined,
        }}
      >
        {/* Mobile Swipe Handle */}
        {isMobile && (
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`w-full flex flex-col items-center pt-3 pb-1.5 touch-none select-none cursor-grab active:cursor-grabbing rounded-t-3xl ${
              isDark ? 'bg-[#161a22]' : 'bg-white'
            }`}
          >
            <div className={`w-12 h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
            <span className="text-[10px] text-slate-400 mt-1 font-medium">
              {isExpanded ? 'Vuốt xuống để thu nhỏ' : 'Vuốt xuống để đóng • Vuốt lên để mở rộng'}
            </span>
          </div>
        )}

        {/* Top Bar: Mode Switcher + Grouped Utility Icons */}
        <div
          onTouchStart={isMobile && !isFullscreen ? handleTouchStart : undefined}
          onTouchMove={isMobile && !isFullscreen ? handleTouchMove : undefined}
          onTouchEnd={isMobile && !isFullscreen ? handleTouchEnd : undefined}
          className={`h-11 px-3.5 border-b flex items-center justify-between gap-2 touch-none select-none shrink-0 ${
            isDark ? 'bg-[#161a22] border-slate-800' : 'bg-white border-slate-100'
          }`}
        >
          {/* Left: Segmented Read / Edit toggle */}
          <div
            className={`inline-flex items-center p-0.5 rounded-lg border shrink-0 ${
              isDark ? 'bg-[#0f1218] border-slate-800' : 'bg-slate-100/90 border-slate-200/70'
            }`}
          >
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              title="Chế độ đọc"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                !isEditing
                  ? isDark
                    ? 'bg-[#1e2430] text-slate-100 shadow-xs'
                    : 'bg-white text-slate-900 shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Đọc</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              title="Chỉnh sửa bằng trình soạn thảo Quill"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                isEditing
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Sửa</span>
            </button>
          </div>

          {/* Right: Compact grouped actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsNoteAiOpen((v) => !v)}
              title="Mở AI Agent trong ô ghi chú (bố cục lại, xóa cũ, viết mới vào Khung Mã)"
              className={`flex items-center gap-1 px-2 h-7 mr-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0 border ${
                isNoteAiOpen
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'bg-[#1e2430] border-slate-700 text-indigo-300 hover:border-indigo-500'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>AI Note</span>
            </button>

            {onOpenFloatingCard && !isMobile && (
              <button
                type="button"
                onClick={() => onOpenFloatingCard(selectedNode.id)}
                title="Ghim ô thành thẻ nổi trên màn hình"
                className={iconBtnClass}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyNoteLink}
              title={copiedNoteLink ? 'Đã sao chép đường link' : 'Sao chép đường link tới ô này'}
              className={`${iconBtnClass} ${copiedNoteLink ? '!text-emerald-600' : ''}`}
            >
              {copiedNoteLink ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <LinkIcon className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Thu nhỏ lại (Esc)' : 'Mở rộng toàn màn hình'}
              className={iconBtnClass}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (confirm('Bạn có chắc muốn xóa ô ghi chú này không?')) {
                  onDeleteNode(selectedNode.id);
                }
              }}
              title="Xóa ô ghi chú này"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isDark
                  ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/50'
                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <div className={`w-px h-4 mx-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

            <button
              type="button"
              onClick={handleDismiss}
              title="Đóng bảng chi tiết"
              className={iconBtnClass}
            >
              {isMobile && !isFullscreen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Title & Compact Style Popover Trigger */}
        <div
          className={`px-4 py-2.5 border-b shrink-0 ${
            isDark ? 'bg-[#161a22] border-slate-800' : 'bg-white border-slate-100'
          }`}
        >
          <div className="flex items-center justify-between gap-2.5">
            <input
              type="text"
              value={data.label}
              onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
              placeholder="Tiêu đề ô ghi chú..."
              className={`flex-1 min-w-0 bg-transparent text-[15px] font-semibold tracking-[-0.01em] border-none outline-none focus:ring-0 px-0 ${
                isDark
                  ? 'text-slate-100 placeholder-slate-500'
                  : 'text-slate-900 placeholder-slate-400'
              }`}
            />

            {/* Compact Style & Color Popover */}
            <div className="relative shrink-0" ref={stylePopoverRef}>
              <button
                type="button"
                onClick={() => setStylePopoverOpen((v) => !v)}
                title="Đổi hình dạng & màu nhấn của ô"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#1d222d] hover:bg-[#252b39] border-slate-700/80 text-slate-300'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200/90 text-slate-600'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeScheme.dot} shrink-0`} />
                <span>{SHAPE_LABELS[currentShape]}</span>
                <ChevronDown
                  className={`w-3 h-3 opacity-60 transition-transform duration-150 ${
                    stylePopoverOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {stylePopoverOpen && (
                <div
                  className={`absolute right-0 top-9 w-64 rounded-xl border shadow-[0_12px_32px_rgba(15,23,42,0.16)] p-3 z-50 space-y-3 animate-in fade-in zoom-in-95 duration-150 ${
                    isDark
                      ? 'bg-[#1a1f29] border-slate-700 text-slate-200'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Hình dạng ô
                    </div>
                    <div
                      className={`grid grid-cols-4 gap-1 p-1 rounded-lg ${
                        isDark ? 'bg-[#11151d]' : 'bg-slate-100'
                      }`}
                    >
                      {(['pill', 'circle', 'card', 'full'] as NodeShape[]).map((shape) => (
                        <button
                          key={shape}
                          type="button"
                          onClick={() => onUpdateNode(selectedNode.id, { shape })}
                          className={`py-1 px-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                            currentShape === shape
                              ? isDark
                                ? 'bg-[#262d3c] text-white shadow-xs'
                                : 'bg-white text-slate-900 shadow-xs'
                              : isDark
                              ? 'text-slate-400 hover:text-slate-200'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          {SHAPE_LABELS[shape]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Màu nhấn
                    </div>
                    <div className="grid grid-cols-8 gap-1.5 py-0.5">
                      {(Object.keys(COLOR_SCHEMES) as NodeColor[]).map((colorKey) => {
                        const scheme = COLOR_SCHEMES[colorKey];
                        const isSelected = currentColor === colorKey;
                        return (
                          <button
                            key={colorKey}
                            type="button"
                            onClick={() => onUpdateNode(selectedNode.id, { color: colorKey })}
                            title={scheme.name}
                            className={`w-5 h-5 rounded-full ${scheme.dot} transition-transform cursor-pointer mx-auto ${
                              isSelected
                                ? `scale-110 ring-2 ring-indigo-500 ring-offset-2 ${
                                    isDark ? 'ring-offset-[#1a1f29]' : 'ring-offset-white'
                                  }`
                                : 'opacity-75 hover:opacity-100 hover:scale-105'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body: Chế độ đọc hoặc Trình soạn thảo Quill + AI Note Agent */}
        <div
          className={`flex-1 overflow-hidden flex min-h-0 ${
            isFullscreen ? 'flex-row' : 'flex-col'
          }`}
          style={{ backgroundColor: canvasTheme.bodyBg }}
        >
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 min-w-0">
            {isEditing ? (
              <ErrorBoundary fallbackTitle="Không thể tải trình soạn thảo Quill">
                <QuillNoteEditor
                  key={selectedNode.id}
                  nodeId={selectedNode.id}
                  content={data.content || ''}
                  onChange={(newHtml) => onUpdateNode(selectedNode.id, { content: newHtml })}
                  allNodes={allNodes}
                  allMaps={allMaps}
                  currentMapId={activeMapId}
                  onNavigate={onNavigate}
                  onSelectNodeById={onSelectNodeById}
                  isFullscreen={isFullscreen}
                  onToggleAiNote={() => setIsNoteAiOpen((v) => !v)}
                  isAiNoteOpen={isNoteAiOpen}
                />
              </ErrorBoundary>
            ) : (
              <div
                className="flex-1 overflow-y-auto p-4 sm:p-5 select-text cursor-default flex justify-center"
                style={{ backgroundColor: canvasTheme.bodyBg }}
                onDoubleClick={() => setIsEditing(true)}
                title="Nhấp đúp chuột để bắt đầu chỉnh sửa"
              >
                {data.content && data.content.trim() && data.content !== '<p><br></p>' ? (
                  <div
                    className={`w-full ${
                      isFullscreen ? 'max-w-[800px]' : 'max-w-full'
                    } border rounded-xl shadow-xs p-5 sm:p-6 h-fit min-h-[300px] ${
                      isDark
                        ? 'bg-[#171b24] border-slate-800'
                        : canvasTheme.id === 'warm'
                        ? 'bg-[#fcfaf5] border-[#e6dfd1]'
                        : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <NoteContentRenderer
                      content={data.content}
                      onNavigate={onNavigate}
                      onNodeClick={onSelectNodeById}
                    />
                  </div>
                ) : (
                  <div
                    className={`w-full border rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-3.5 text-slate-400 h-fit my-auto max-w-md shadow-xs ${
                      isDark ? 'bg-[#171b24] border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-xl border flex items-center justify-center text-slate-400 ${
                        isDark ? 'bg-[#1d222d] border-slate-700' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <p
                        className={`text-sm font-semibold ${
                          isDark ? 'text-slate-200' : 'text-slate-700'
                        }`}
                      >
                        Chưa có nội dung ghi chú
                      </p>
                      <p className="text-xs text-slate-500">
                        Chuyển sang mục Sửa, nhấp đúp hoặc mở AI Note để tạo nội dung vào Khung Mã.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Bắt đầu viết</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsNoteAiOpen(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Mở AI Note</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <NoteAiAgentPanel
            isOpen={isNoteAiOpen}
            onClose={() => setIsNoteAiOpen(false)}
            node={selectedNode}
            activeMap={activeMap}
            settings={settings}
            onUpdateNode={onUpdateNode}
            onOpenAiSettings={onOpenAiSettings}
            isDark={isDark}
            isFullscreen={isFullscreen}
          />
        </div>
      </aside>
    </>
  );
};
