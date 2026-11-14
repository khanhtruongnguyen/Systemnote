import React, { useEffect, useRef } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { AiChatMessage, AiToolTrace } from '../types';
import { renderMarkdownWithKatex } from '../utils/markdownRenderer';

interface AiChatMessageListProps {
  messages: AiChatMessage[];
  isRunning: boolean;
  liveModel?: string;
  liveRotationNote?: string;
  liveTraces: AiToolTrace[];
  isDark?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  quickPrompts: string[];
  onQuickPrompt: (prompt: string) => void;
  onFocusNode?: (nodeId: string) => void;
  canUndoSnapshot?: (snapshotId: string) => boolean;
  onUndoSnapshot?: (snapshotId: string) => void;
}

export const AiChatMessageList: React.FC<AiChatMessageListProps> = ({
  messages,
  isRunning,
  liveModel,
  liveRotationNote,
  liveTraces,
  isDark = false,
  emptyTitle,
  emptyDescription,
  quickPrompts,
  onQuickPrompt,
  onFocusNode,
  canUndoSnapshot,
  onUndoSnapshot,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isRunning, liveTraces.length]);

  const renderTraceItem = (tr: AiToolTrace) => (
    <div
      key={tr.id}
      className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border ${
        tr.status === 'error'
          ? isDark
            ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            : 'bg-rose-50 border-rose-200 text-rose-700'
          : tr.status === 'running'
          ? isDark
            ? 'bg-indigo-950/40 border-indigo-800/60 text-indigo-300'
            : 'bg-indigo-50 border-indigo-200 text-indigo-700'
          : isDark
          ? 'bg-[#0f1218] border-slate-800 text-slate-300'
          : 'bg-slate-50 border-slate-200/80 text-slate-600'
      }`}
    >
      {tr.status === 'running' ? (
        <Loader2 className="w-3 h-3 animate-spin shrink-0 text-indigo-500" />
      ) : tr.status === 'error' ? (
        <AlertCircle className="w-3 h-3 shrink-0 text-rose-500" />
      ) : (
        <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-500" />
      )}
      <span className="font-mono text-[10px] opacity-75 shrink-0">{tr.toolName}</span>
      <span className="truncate">{tr.summary}</span>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      {messages.length === 0 && !isRunning && (
        <div className="space-y-3 pt-2">
          <div
            className={`p-3 rounded-xl border ${
              isDark
                ? 'bg-[#1b202b]/80 border-slate-800 text-slate-200'
                : 'bg-indigo-50/70 border-indigo-100 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs mb-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>{emptyTitle}</span>
            </div>
            <p className={`text-[11.5px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {emptyDescription}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className={`text-[10.5px] font-semibold uppercase tracking-wider px-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Gợi ý lệnh nhanh
            </div>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onQuickPrompt(prompt)}
                className={`w-full text-left px-3 py-2 rounded-xl border text-[11.5px] leading-snug transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#1b202b] border-slate-800 hover:border-indigo-600 text-slate-300'
                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-700'
                }`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[88%] px-3 py-2 rounded-2xl rounded-tr-sm bg-indigo-600 text-white text-xs leading-relaxed shadow-xs whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          );
        }

        const undoAvailable =
          Boolean(msg.undoSnapshotId && canUndoSnapshot?.(msg.undoSnapshotId));

        return (
          <div key={msg.id} className="flex items-start gap-2">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                msg.isError
                  ? 'bg-rose-500 text-white'
                  : 'bg-indigo-600/15 text-indigo-500 border border-indigo-500/20'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
            </div>

            <div
              className={`flex-1 min-w-0 rounded-2xl rounded-tl-sm border p-3 space-y-2 ${
                msg.isError
                  ? isDark
                    ? 'bg-rose-950/30 border-rose-800/70 text-rose-200'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                  : isDark
                  ? 'bg-[#1b202b] border-slate-800 text-slate-200'
                  : 'bg-white border-slate-200 text-slate-800 shadow-2xs'
              }`}
            >
              {msg.traces && msg.traces.length > 0 && (
                <div className="space-y-1 pb-1">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-65">
                    <Wrench className="w-3 h-3" />
                    <span>Thao tác đã thực hiện ({msg.traces.length})</span>
                  </div>
                  <div className="space-y-1">{msg.traces.map(renderTraceItem)}</div>
                </div>
              )}

              <div
                className="text-xs leading-relaxed [&_.sn-katex-mixed-body]:text-[12.5px] [&_.sn-katex-mixed-body]:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdownWithKatex(msg.content) }}
              />

              {msg.createdNodes && msg.createdNodes.length > 0 && onFocusNode && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.createdNodes.map((ref) => (
                    <button
                      key={ref.nodeId}
                      type="button"
                      onClick={() => onFocusNode(ref.nodeId)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                        isDark
                          ? 'bg-[#0f1218] border-slate-700 text-indigo-300 hover:border-indigo-500'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                      }`}
                    >
                      <span className="truncate max-w-[160px]">{ref.label}</span>
                      <ArrowUpRight className="w-3 h-3 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {(msg.modelUsed || undoAvailable) && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t text-[10px] ${
                    isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    {msg.modelUsed && <span className="font-mono truncate">{msg.modelUsed}</span>}
                    {msg.rotatedModels && msg.rotatedModels.length > 1 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-medium">
                        Đã tự xoay
                      </span>
                    )}
                  </div>

                  {undoAvailable && msg.undoSnapshotId && onUndoSnapshot && (
                    <button
                      type="button"
                      onClick={() => onUndoSnapshot(msg.undoSnapshotId!)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold cursor-pointer transition-colors ${
                        isDark
                          ? 'bg-slate-800 hover:bg-slate-700 text-amber-300'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Hoàn tác</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isRunning && (
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-600/15 text-indigo-500 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </div>
          <div
            className={`flex-1 min-w-0 rounded-2xl rounded-tl-sm border p-3 space-y-2 ${
              isDark ? 'bg-[#1b202b] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-indigo-500">AI đang xử lý lệnh...</span>
              {liveModel && <span className="font-mono text-[10px] opacity-75 truncate">{liveModel}</span>}
            </div>
            {liveRotationNote && (
              <div className="text-[10.5px] text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                {liveRotationNote}
              </div>
            )}
            {liveTraces.length > 0 && <div className="space-y-1">{liveTraces.map(renderTraceItem)}</div>}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
