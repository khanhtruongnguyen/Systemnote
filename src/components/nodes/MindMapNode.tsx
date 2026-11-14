import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { MindMapNodeData } from '../../types';
import { COLOR_SCHEMES } from '../../constants/theme';
import { NoteContentRenderer } from '../NoteContentRenderer';
import { hasKatexContent, hasLinkContent, hasImageContent, stripHtmlToText } from '../../utils/katexHelper';
import { FileText, Sigma, Link2, Image as ImageIcon, GripHorizontal, Pin } from 'lucide-react';

export const MindMapNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const nodeData = data as MindMapNodeData;
  const colorScheme = COLOR_SCHEMES[nodeData.color] || COLOR_SCHEMES.indigo;
  const shape = nodeData.shape || 'pill';

  const hasKatex = hasKatexContent(nodeData.content || '');
  const hasLinks = hasLinkContent(nodeData.content || '');
  const hasImages = hasImageContent(nodeData.content || '');
  const plainPreview = shape === 'card' ? stripHtmlToText(nodeData.content || '') : '';

  const openFloatingCard = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('systemnote:open-floating-card', { detail: { nodeId: id } }));
  };

  return (
    <div className={`relative group ${selected ? 'z-[9999]' : ''}`}>
      {/* TOP */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="sn-node-handle !w-2.5 !h-2.5 !bg-white !border-[1.5px] !border-slate-400 hover:!border-indigo-600 hover:!bg-indigo-50"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-src"
        className="!w-2.5 !h-2.5 !bg-transparent !border-0"
      />

      {/* RIGHT */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="sn-node-handle !w-2.5 !h-2.5 !bg-white !border-[1.5px] !border-slate-400 hover:!border-indigo-600 hover:!bg-indigo-50"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-tgt"
        className="!w-2.5 !h-2.5 !bg-transparent !border-0"
      />

      {/* BOTTOM */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="sn-node-handle !w-2.5 !h-2.5 !bg-white !border-[1.5px] !border-slate-400 hover:!border-indigo-600 hover:!bg-indigo-50"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-tgt"
        className="!w-2.5 !h-2.5 !bg-transparent !border-0"
      />

      {/* LEFT */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="sn-node-handle !w-2.5 !h-2.5 !bg-white !border-[1.5px] !border-slate-400 hover:!border-indigo-600 hover:!bg-indigo-50"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-src"
        className="!w-2.5 !h-2.5 !bg-transparent !border-0"
      />

      {/* Circle / Anchor shape */}
      {shape === 'circle' && (
        <div
          className={`sn-node-surface flex items-center justify-center w-8 h-8 rounded-full bg-white border cursor-grab active:cursor-grabbing touch-none select-none transition-all duration-150 ${
            selected
              ? 'sn-node-selected border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
              : 'border-slate-300 hover:border-slate-400 shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
          }`}
        >
          <div className={`w-2.5 h-2.5 rounded-full ${colorScheme.dot}`} />
          <div className="sn-node-surface sn-node-title absolute top-9.5 whitespace-nowrap px-2 py-0.5 rounded-md bg-white/95 border border-slate-200/90 text-[11px] font-medium text-slate-700 pointer-events-none shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            {nodeData.label || 'Chưa đặt tên'}
          </div>
        </div>
      )}

      {/* Compact Note Block (Pill) */}
      {shape === 'pill' && (
        <div
          className={`sn-node-surface flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-white border cursor-grab active:cursor-grabbing touch-none transition-all duration-150 select-none ${
            selected
              ? 'sn-node-selected border-indigo-500 ring-2 ring-indigo-500/18 shadow-[0_4px_14px_rgba(15,23,42,0.08)]'
              : `${colorScheme.border} shadow-[0_1px_2px_rgba(15,23,42,0.05),0_2px_6px_rgba(15,23,42,0.03)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.07)]`
          }`}
        >
          <span className={`w-[3px] self-stretch min-h-[16px] rounded-full ${colorScheme.strip} shrink-0`} />

          <span className="sn-node-title text-[12.5px] font-medium text-slate-800 max-w-[220px] truncate tracking-[-0.01em]">
            {nodeData.label || 'Chưa đặt tên'}
          </span>

          {(hasImages || hasKatex || hasLinks) ? (
            <div className="sn-node-sub flex items-center gap-1.5 pl-2 border-l border-slate-100 text-slate-400">
              {hasImages && <ImageIcon className="w-3 h-3" />}
              {hasKatex && <Sigma className="w-3 h-3" />}
              {hasLinks && <Link2 className="w-3 h-3" />}
            </div>
          ) : (
            <FileText className="w-3 h-3 text-slate-300 shrink-0" />
          )}

          <button
            type="button"
            onClick={openFloatingCard}
            title="Ghim ô thành thẻ nổi trên màn hình (Shift + Click)"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -mr-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <Pin className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Preview Card shape */}
      {shape === 'card' && (
        <div
          className={`sn-node-surface flex flex-col rounded-xl border bg-white overflow-hidden cursor-grab active:cursor-grabbing touch-none transition-all duration-150 min-w-[190px] max-w-[248px] select-none ${
            selected
              ? 'sn-node-selected border-indigo-500 ring-2 ring-indigo-500/18 shadow-[0_6px_18px_rgba(15,23,42,0.09)]'
              : `${colorScheme.border} shadow-[0_1px_3px_rgba(15,23,42,0.05),0_4px_10px_rgba(15,23,42,0.03)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.07)]`
          }`}
        >
          <div className={`h-[2.5px] w-full ${colorScheme.strip}`} />
          <div className="p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="sn-node-title text-[12.5px] font-semibold text-slate-900 truncate tracking-[-0.01em] flex-1">
                {nodeData.label || 'Chưa đặt tên'}
              </span>
              <button
                type="button"
                onClick={openFloatingCard}
                title="Ghim ô thành thẻ nổi trên màn hình (Shift + Click)"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -mr-1 -my-0.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <Pin className="w-3 h-3" />
              </button>
            </div>
            {plainPreview && (
              <p className="sn-node-sub text-[11.5px] text-slate-500 line-clamp-2 leading-[1.55]">
                {plainPreview}
              </p>
            )}
            {(hasImages || hasKatex || hasLinks) && (
              <div className="sn-node-sub flex items-center gap-1.5 pt-0.5 text-slate-400">
                {hasImages && <ImageIcon className="w-3 h-3" />}
                {hasKatex && <Sigma className="w-3 h-3" />}
                {hasLinks && <Link2 className="w-3 h-3" />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Note directly on Canvas mode */}
      {shape === 'full' && (
        <div
          className={`sn-node-surface flex flex-col rounded-xl border bg-white overflow-hidden transition-all duration-150 w-[320px] sm:w-[420px] max-h-[480px] ${
            selected
              ? 'sn-node-selected border-indigo-500 ring-2 ring-indigo-500/18 shadow-[0_10px_30px_rgba(15,23,42,0.1)]'
              : `${colorScheme.border} shadow-[0_2px_8px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]`
          }`}
        >
          <div className={`h-[2.5px] w-full ${colorScheme.strip} shrink-0`} />
          <div className="sn-node-header flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70 shrink-0 touch-none cursor-grab active:cursor-grabbing select-none hover:bg-slate-100/70 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="sn-node-title text-[12.5px] font-semibold text-slate-900 truncate tracking-[-0.01em]">
                {nodeData.label || 'Chưa đặt tên'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
              {hasImages && <ImageIcon className="w-3.5 h-3.5" />}
              {hasKatex && <Sigma className="w-3.5 h-3.5" />}
              {hasLinks && <Link2 className="w-3.5 h-3.5" />}
              <button
                type="button"
                onClick={openFloatingCard}
                title="Ghim ô thành thẻ nổi trên màn hình"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
              >
                <Pin className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div
            className="sn-node-body nowheel nopan nodrag p-3.5 overflow-y-auto max-h-[380px] text-xs space-y-2 select-text cursor-auto touch-pan-y bg-white"
            onWheel={(e) => e.stopPropagation()}
          >
            {nodeData.content && nodeData.content.trim() ? (
              <NoteContentRenderer
                content={nodeData.content}
                onNavigate={nodeData.onNavigate as ((mapId?: string, noteId?: string) => void) | undefined}
                onNodeClick={nodeData.onNodeClick as ((nodeId: string) => void) | undefined}
              />
            ) : (
              <div className="text-slate-400 italic text-xs py-2">
                Chưa có nội dung. Bấm vào ô này để bắt đầu viết chi tiết.
              </div>
            )}
          </div>

          <div className="sn-node-header flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-50/70 border-t border-slate-100 text-[10px] text-slate-400 font-medium touch-none cursor-grab active:cursor-grabbing select-none hover:text-slate-600 hover:bg-slate-100/70 transition-colors shrink-0">
            <GripHorizontal className="w-3 h-3" />
            <span>Kéo để di chuyển</span>
          </div>
        </div>
      )}
    </div>
  );
});

MindMapNode.displayName = 'MindMapNode';
