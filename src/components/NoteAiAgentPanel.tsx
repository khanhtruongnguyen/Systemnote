import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  Code2,
  Globe,
  Maximize2,
  Minimize2,
  Send,
  Settings,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AiChatMessage,
  AiToolTrace,
  AppSettings,
  CustomNode,
  MapData,
  MindMapNodeData,
} from '../types';
import { runAiAgentTurn } from '../services/aiClient';
import { getCandidateModels, resolveAiConfig } from '../services/aiConfig';
import {
  buildNoteAgentSystemPrompt,
  createNoteAgentTools,
} from '../services/aiAgentTools';
import { AiChatMessageList } from './AiChatMessageList';

interface NoteUndoSnapshot {
  nodeId: string;
  data: MindMapNodeData;
}

interface NoteAiAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  node: CustomNode;
  activeMap: MapData;
  settings: AppSettings;
  onUpdateNode: (nodeId: string, updates: Partial<MindMapNodeData>) => void;
  onOpenAiSettings: () => void;
  isDark: boolean;
  isFullscreen?: boolean;
}

export const NoteAiAgentPanel: React.FC<NoteAiAgentPanelProps> = ({
  isOpen,
  onClose,
  node,
  activeMap,
  settings,
  onUpdateNode,
  onOpenAiSettings,
  isDark,
  isFullscreen = false,
}) => {
  const aiConfig = useMemo(() => resolveAiConfig(settings), [settings]);
  const candidateModels = useMemo(() => getCandidateModels(aiConfig), [aiConfig]);

  const [selectedModel, setSelectedModel] = useState<string>(aiConfig.primaryModel);
  const [useContext, setUseContext] = useState<boolean>(aiConfig.useContextByDefault);
  const [useWeb, setUseWeb] = useState<boolean>(aiConfig.useWebSearchByDefault);
  const [isTall, setIsTall] = useState(false);

  const [messagesByNode, setMessagesByNode] = useState<Record<string, AiChatMessage[]>>({});
  const [undoSnapshots, setUndoSnapshots] = useState<Record<string, NoteUndoSnapshot>>({});
  const [inputText, setInputText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [liveModel, setLiveModel] = useState<string | undefined>();
  const [liveRotationNote, setLiveRotationNote] = useState<string | undefined>();
  const [liveTraces, setLiveTraces] = useState<AiToolTrace[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSelectedModel((prev) =>
      candidateModels.includes(prev) ? prev : aiConfig.primaryModel
    );
  }, [aiConfig.primaryModel, candidateModels]);

  // Dừng agent nếu chuyển sang node khác đang chạy
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [node.id]);

  if (!isOpen) return null;

  const messages = messagesByNode[node.id] || [];

  const appendMessage = (nodeId: string, msg: AiChatMessage) => {
    setMessagesByNode((prev) => ({
      ...prev,
      [nodeId]: [...(prev[nodeId] || []), msg],
    }));
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleSendCommand = async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? inputText).trim();
    if (!prompt || isRunning) return;

    if (!overridePrompt) {
      setInputText('');
    }

    const targetNodeId = node.id;
    const nodeAtStart: CustomNode = JSON.parse(JSON.stringify(node));

    appendMessage(targetNodeId, {
      id: `nu-${Date.now()}`,
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    });

    setIsRunning(true);
    setLiveModel(selectedModel);
    setLiveRotationNote(undefined);
    setLiveTraces([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let workingNode: CustomNode = JSON.parse(JSON.stringify(nodeAtStart));
    let didMutate = false;

    const tools = createNoteAgentTools({
      getWorkingNode: () => workingNode,
      updateWorkingNode: (updates) => {
        workingNode = {
          ...workingNode,
          data: {
            ...workingNode.data,
            ...updates,
            updatedAt: Date.now(),
          },
        };
        onUpdateNode(targetNodeId, updates);
      },
      activeMap,
      allowWebSearch: useWeb,
      allowContext: useContext,
      alwaysWrapInCodeFrame: aiConfig.alwaysWrapInCodeFrame,
      onDidMutateNote: () => {
        didMutate = true;
      },
    });

    try {
      const historyForModel = (messagesByNode[targetNodeId] || [])
        .filter((m) => !m.isError)
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await runAiAgentTurn({
        config: aiConfig,
        systemPrompt: buildNoteAgentSystemPrompt(workingNode, activeMap, {
          allowWebSearch: useWeb,
          allowContext: useContext,
          alwaysWrapInCodeFrame: aiConfig.alwaysWrapInCodeFrame,
        }),
        history: historyForModel,
        userMessage: prompt,
        tools,
        overrideModel: selectedModel,
        signal: controller.signal,
        onModelAttempt: ({ model, rotatedFrom, reason }) => {
          setLiveModel(model);
          if (rotatedFrom) {
            setLiveRotationNote(
              `Model "${rotatedFrom}" gặp lỗi (${reason || 'quá tải'}), đang tự xoay sang "${model}"...`
            );
          }
        },
        onToolTrace: (trace) => {
          setLiveTraces((prev) => {
            const exists = prev.some((t) => t.id === trace.id);
            return exists
              ? prev.map((t) => (t.id === trace.id ? trace : t))
              : [...prev, trace];
          });
        },
      });

      let undoId: string | undefined;
      if (didMutate) {
        undoId = `undo-note-${Date.now()}`;
        setUndoSnapshots((prev) => ({
          ...prev,
          [undoId!]: { nodeId: targetNodeId, data: nodeAtStart.data },
        }));
      }

      appendMessage(targetNodeId, {
        id: `na-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        createdAt: Date.now(),
        modelUsed: result.modelUsed,
        rotatedModels: result.rotatedModels,
        traces: result.traces,
        undoSnapshotId: undoId,
      });
    } catch (err) {
      let undoId: string | undefined;
      if (didMutate) {
        undoId = `undo-note-${Date.now()}`;
        setUndoSnapshots((prev) => ({
          ...prev,
          [undoId!]: { nodeId: targetNodeId, data: nodeAtStart.data },
        }));
      }

      appendMessage(targetNodeId, {
        id: `ne-${Date.now()}`,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Có lỗi xảy ra khi chạy AI trong ghi chú.',
        createdAt: Date.now(),
        traces: liveTraces,
        undoSnapshotId: undoId,
        isError: true,
      });
    } finally {
      setIsRunning(false);
      setLiveRotationNote(undefined);
      abortControllerRef.current = null;
    }
  };

  const handleUndo = (snapshotId: string) => {
    const snap = undoSnapshots[snapshotId];
    if (!snap) return;
    onUpdateNode(snap.nodeId, {
      label: snap.data.label,
      color: snap.data.color,
      shape: snap.data.shape,
      content: snap.data.content,
    });
    setUndoSnapshots((prev) => {
      const next = { ...prev };
      delete next[snapshotId];
      return next;
    });
  };

  return (
    <section
      className={`flex flex-col border shrink-0 overflow-hidden ${
        isFullscreen
          ? 'w-[370px] xl:w-[410px] h-full border-t-0 border-r-0 border-b-0'
          : isTall
          ? 'h-[62%] min-h-[300px] border-x-0 border-b-0'
          : 'h-[47%] min-h-[250px] border-x-0 border-b-0'
      } ${
        isDark
          ? 'bg-[#12161e] border-slate-800 text-slate-100'
          : 'bg-slate-50/90 border-slate-200 text-slate-800'
      }`}
    >
      {/* Panel Header */}
      <div
        className={`px-3 py-2 border-b flex items-center justify-between gap-2 shrink-0 ${
          isDark ? 'bg-[#161a22] border-slate-800' : 'bg-white border-slate-200/80'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold truncate">AI Ghi Chú</span>
          <span
            title="Mọi nội dung AI chèn vào ghi chú mặc định nằm trong Khung Mã"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/12 border border-emerald-500/30 text-emerald-600 text-[10px] font-semibold shrink-0"
          >
            <Code2 className="w-2.5 h-2.5" />
            <span>Khung Mã</span>
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            title="Model ưu tiên"
            className={`max-w-[140px] px-2 py-1 rounded-lg border text-[10.5px] font-mono outline-none ${
              isDark
                ? 'bg-[#0f1218] border-slate-700 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {candidateModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {!isFullscreen && (
            <button
              type="button"
              onClick={() => setIsTall((v) => !v)}
              title={isTall ? 'Thu vừa khung AI' : 'Mở rộng khung AI'}
              className={`p-1.5 rounded-lg cursor-pointer ${
                isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'
              }`}
            >
              {isTall ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setMessagesByNode((prev) => ({ ...prev, [node.id]: [] }))
              }
              title="Xóa lịch sử chat ghi chú này"
              className={`p-1.5 rounded-lg cursor-pointer ${
                isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAiSettings}
            title="Cài đặt AI"
            className={`p-1.5 rounded-lg cursor-pointer ${
              isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Đóng AI Ghi Chú"
            className={`p-1.5 rounded-lg cursor-pointer ${
              isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'
            }`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Actions & Context/Web Toggles */}
      <div
        className={`px-3 py-1.5 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 ${
          isDark ? 'bg-[#12161e] border-slate-800' : 'bg-white/70 border-slate-200/70'
        }`}
      >
        <button
          type="button"
          onClick={() => setUseContext((v) => !v)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-medium shrink-0 cursor-pointer ${
            useContext
              ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-600'
              : isDark
              ? 'border-slate-700 text-slate-500'
              : 'border-slate-200 text-slate-400'
          }`}
        >
          <BookOpen className="w-3 h-3" />
          <span>Ngữ cảnh</span>
        </button>

        <button
          type="button"
          onClick={() => setUseWeb((v) => !v)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-medium shrink-0 cursor-pointer ${
            useWeb
              ? 'bg-sky-500/12 border-sky-500/35 text-sky-600'
              : isDark
              ? 'border-slate-700 text-slate-500'
              : 'border-slate-200 text-slate-400'
          }`}
        >
          <Globe className="w-3 h-3" />
          <span>Mạng</span>
        </button>

        <span className="h-3.5 w-px bg-slate-300/60 mx-0.5 shrink-0" />

        <button
          type="button"
          disabled={isRunning}
          onClick={() =>
            handleSendCommand(
              'Hãy đọc toàn bộ nội dung hiện có trong ghi chú này và trình bày bố cục lại thật mạch lạc, khoa học bằng các Khung Mã.'
            )
          }
          className={`px-2 py-0.5 rounded-md border text-[10.5px] font-medium shrink-0 cursor-pointer disabled:opacity-45 ${
            isDark
              ? 'bg-[#1b202b] border-slate-700 hover:border-indigo-500 text-slate-200'
              : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-700'
          }`}
        >
          Trình bày bố cục lại
        </button>

        <button
          type="button"
          disabled={isRunning}
          onClick={() =>
            handleSendCommand(
              'Hãy xóa nội dung cũ trong ghi chú này và viết lại phiên bản cô đọng, dễ học vào Khung Mã.'
            )
          }
          className={`px-2 py-0.5 rounded-md border text-[10.5px] font-medium shrink-0 cursor-pointer disabled:opacity-45 ${
            isDark
              ? 'bg-[#1b202b] border-slate-700 hover:border-rose-500 text-slate-200'
              : 'bg-white border-slate-200 hover:border-rose-300 text-slate-700'
          }`}
        >
          Xóa cũ & viết lại
        </button>
      </div>

      <AiChatMessageList
        messages={messages}
        isRunning={isRunning}
        liveModel={liveModel}
        liveRotationNote={liveRotationNote}
        liveTraces={liveTraces}
        isDark={isDark}
        emptyTitle={`AI bên trong "${node.data.label || 'Ghi chú'}"`}
        emptyDescription="Tôi có thể sắp xếp lại bố cục note, xóa phần cũ, tìm kiếm thêm nguồn mạng hoặc đọc Ngữ cảnh bài học và chèn câu trả lời vào Khung Mã chuẩn định dạng."
        quickPrompts={[
          'Đọc Ngữ cảnh bài học và tóm tắt phần liên quan tới chủ đề ô này vào Khung Mã.',
          'Tìm kiếm nguồn uy tín trên mạng để bổ sung ví dụ minh họa và công thức vào cuối ghi chú.',
        ]}
        onQuickPrompt={(p) => handleSendCommand(p)}
        canUndoSnapshot={(id) => undoSnapshots[id]?.nodeId === node.id}
        onUndoSnapshot={handleUndo}
      />

      {/* Input Composer */}
      <div
        className={`p-2.5 border-t shrink-0 ${
          isDark ? 'bg-[#161a22] border-slate-800' : 'bg-white border-slate-200/80'
        }`}
      >
        <div
          className={`flex items-end gap-2 p-1.5 rounded-xl border ${
            isDark
              ? 'bg-[#0f1218] border-slate-700 focus-within:border-indigo-500'
              : 'bg-slate-50 border-slate-200 focus-within:border-indigo-400 focus-within:bg-white'
          }`}
        >
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendCommand();
              }
            }}
            placeholder="Ra lệnh sửa bố cục, xóa cũ, thêm ý mới vào Khung Mã..."
            className="flex-1 bg-transparent resize-none outline-none text-xs leading-relaxed max-h-24 px-1.5 py-0.5"
          />
          {isRunning ? (
            <button
              type="button"
              onClick={handleStop}
              title="Dừng AI"
              className="p-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shrink-0"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSendCommand()}
              disabled={!inputText.trim()}
              title="Gửi (Enter)"
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white cursor-pointer shrink-0 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
