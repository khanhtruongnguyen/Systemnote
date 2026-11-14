import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  Code2,
  Eye,
  FileUp,
  Globe,
  Pencil,
  Send,
  Settings,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AiChatMessage,
  AiCreatedNodeRef,
  AiToolTrace,
  AppSettings,
  MapData,
} from '../types';
import { runAiAgentTurn } from '../services/aiClient';
import { getCandidateModels, resolveAiConfig } from '../services/aiConfig';
import {
  buildMainAgentSystemPrompt,
  createMainMapAgentTools,
} from '../services/aiAgentTools';
import { renderMarkdownWithKatex } from '../utils/markdownRenderer';
import { AiChatMessageList } from './AiChatMessageList';

interface MainAiAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeMap: MapData;
  allMaps: MapData[];
  selectedNodeId: string | null;
  settings: AppSettings;
  onReplaceMap: (nextMap: MapData) => void;
  onCreateNewMap: (name: string, initialContext?: string) => MapData;
  onFocusNode: (nodeId: string) => void;
  onOpenAiSettings: () => void;
  isDark: boolean;
  isMobile: boolean;
}

export const MainAiAgentPanel: React.FC<MainAiAgentPanelProps> = ({
  isOpen,
  onClose,
  activeMap,
  allMaps,
  selectedNodeId,
  settings,
  onReplaceMap,
  onCreateNewMap,
  onFocusNode,
  onOpenAiSettings,
  isDark,
  isMobile,
}) => {
  const aiConfig = useMemo(() => resolveAiConfig(settings), [settings]);
  const candidateModels = useMemo(() => getCandidateModels(aiConfig), [aiConfig]);

  const [activeTab, setActiveTab] = useState<'chat' | 'context'>('chat');
  const [selectedModel, setSelectedModel] = useState<string>(aiConfig.primaryModel);
  const [useContext, setUseContext] = useState<boolean>(aiConfig.useContextByDefault);
  const [useWeb, setUseWeb] = useState<boolean>(aiConfig.useWebSearchByDefault);

  const [messagesByMap, setMessagesByMap] = useState<Record<string, AiChatMessage[]>>({});
  const [undoSnapshots, setUndoSnapshots] = useState<Record<string, MapData>>({});
  const [inputText, setInputText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [liveModel, setLiveModel] = useState<string | undefined>();
  const [liveRotationNote, setLiveRotationNote] = useState<string | undefined>();
  const [liveTraces, setLiveTraces] = useState<AiToolTrace[]>([]);

  // Context editor tab states
  const [previewContext, setPreviewContext] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSelectedModel((prev) =>
      candidateModels.includes(prev) ? prev : aiConfig.primaryModel
    );
  }, [aiConfig.primaryModel, candidateModels]);

  const messages = messagesByMap[activeMap.id] || [];
  const contextText = activeMap.context || '';
  const selectedNode = useMemo(
    () => activeMap.nodes.find((n) => n.id === selectedNodeId) || null,
    [activeMap.nodes, selectedNodeId]
  );

  if (!isOpen) return null;

  const appendMessage = (mapId: string, msg: AiChatMessage) => {
    setMessagesByMap((prev) => ({
      ...prev,
      [mapId]: [...(prev[mapId] || []), msg],
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
    setActiveTab('chat');

    const mapAtStart: MapData = JSON.parse(JSON.stringify(activeMap));
    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    };
    appendMessage(mapAtStart.id, userMsg);

    setIsRunning(true);
    setLiveModel(selectedModel);
    setLiveRotationNote(undefined);
    setLiveTraces([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let workingMap: MapData = JSON.parse(JSON.stringify(mapAtStart));
    let didMutate = false;
    const touchedNodes: AiCreatedNodeRef[] = [];

    const tools = createMainMapAgentTools({
      getWorkingMap: () => workingMap,
      getAllMaps: () => allMaps,
      updateWorkingMap: (nextMap) => {
        workingMap = nextMap;
        onReplaceMap(nextMap);
      },
      onCreateNewMap,
      onSelectNode: onFocusNode,
      allowWebSearch: useWeb,
      allowContext: useContext,
      alwaysWrapInCodeFrame: aiConfig.alwaysWrapInCodeFrame,
      onNodeCreatedOrUpdated: (ref) => {
        if (!touchedNodes.some((item) => item.nodeId === ref.nodeId)) {
          touchedNodes.push(ref);
        }
      },
      onDidMutateMap: () => {
        didMutate = true;
      },
    });

    const contextHint = selectedNode
      ? `\n[Trạng thái hiện tại: Người dùng đang chọn ô "${selectedNode.data.label}" (ID: ${selectedNode.id})]`
      : '';

    try {
      const historyForModel = (messagesByMap[mapAtStart.id] || [])
        .filter((m) => !m.isError)
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await runAiAgentTurn({
        config: aiConfig,
        systemPrompt: buildMainAgentSystemPrompt(workingMap, {
          allowWebSearch: useWeb,
          allowContext: useContext,
          alwaysWrapInCodeFrame: aiConfig.alwaysWrapInCodeFrame,
        }),
        history: historyForModel,
        userMessage: `${prompt}${contextHint}`,
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
        undoId = `undo-map-${Date.now()}`;
        setUndoSnapshots((prev) => ({ ...prev, [undoId!]: mapAtStart }));
      }

      appendMessage(mapAtStart.id, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        createdAt: Date.now(),
        modelUsed: result.modelUsed,
        rotatedModels: result.rotatedModels,
        traces: result.traces,
        createdNodes: touchedNodes,
        undoSnapshotId: undoId,
      });
    } catch (err) {
      let undoId: string | undefined;
      if (didMutate) {
        undoId = `undo-map-${Date.now()}`;
        setUndoSnapshots((prev) => ({ ...prev, [undoId!]: mapAtStart }));
      }

      appendMessage(mapAtStart.id, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Có lỗi xảy ra khi chạy AI Agent.',
        createdAt: Date.now(),
        traces: liveTraces,
        createdNodes: touchedNodes,
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
    onReplaceMap({ ...snap, updatedAt: Date.now() });
    setUndoSnapshots((prev) => {
      const next = { ...prev };
      delete next[snapshotId];
      return next;
    });
  };

  const handleUploadContextFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = typeof reader.result === 'string' ? reader.result : '';
      onReplaceMap({
        ...activeMap,
        context: txt,
        updatedAt: Date.now(),
      });
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  return (
    <>
      {isMobile && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px]"
        />
      )}

      <aside
        className={`fixed z-[35] flex flex-col shadow-2xl border transition-all ${
          isMobile
            ? 'inset-x-0 bottom-0 h-[84vh] rounded-t-3xl'
            : 'top-12 left-0 bottom-0 w-[390px] sm:w-[420px] border-l-0'
        } ${
          isDark
            ? 'bg-[#161a22] border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Top Bar */}
        <div
          className={`h-11 px-3.5 border-b flex items-center justify-between gap-2 shrink-0 ${
            isMobile ? 'rounded-t-3xl' : ''
          } ${isDark ? 'bg-[#161a22] border-slate-800' : 'bg-white border-slate-100'}`}
        >
          <div
            className={`inline-flex items-center p-0.5 rounded-lg border ${
              isDark ? 'bg-[#0f1218] border-slate-800' : 'bg-slate-100 border-slate-200/80'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                activeTab === 'chat'
                  ? isDark
                    ? 'bg-[#1e2430] text-indigo-300 shadow-xs'
                    : 'bg-white text-indigo-600 shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AI Agent</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('context')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                activeTab === 'context'
                  ? isDark
                    ? 'bg-[#1e2430] text-emerald-300 shadow-xs'
                    : 'bg-white text-emerald-700 shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Ngữ cảnh</span>
              {contextText.trim().length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 text-[10px] font-bold">
                  {contextText.trim().length > 999
                    ? `${(contextText.trim().length / 1000).toFixed(1)}k`
                    : contextText.trim().length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1">
            {activeTab === 'chat' && messages.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setMessagesByMap((prev) => ({ ...prev, [activeMap.id]: [] }))
                }
                title="Xóa lịch sử chat"
                className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                  isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAiSettings}
              title="Cấu hình Endpoint, Token & Xoay Model"
              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Đóng bảng AI"
              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab 1: Main AI Agent Chat */}
        {activeTab === 'chat' && (
          <>
            {/* Capability & Model Bar */}
            <div
              className={`px-3 py-2 border-b space-y-2 shrink-0 ${
                isDark ? 'bg-[#12161e] border-slate-800' : 'bg-slate-50/80 border-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  title="Model ưu tiên cho lượt chat này"
                  className={`flex-1 min-w-0 px-2.5 py-1 rounded-lg border text-[11px] font-mono outline-none ${
                    isDark
                      ? 'bg-[#1b202b] border-slate-700 text-slate-200'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {candidateModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <span
                  title="Câu trả lời chèn vào ghi chú luôn được đặt trong Khung Mã"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 text-[10.5px] font-semibold shrink-0"
                >
                  <Code2 className="w-3 h-3" />
                  <span>Khung Mã</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setUseContext((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium cursor-pointer transition-colors ${
                    useContext
                      ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-600'
                      : isDark
                      ? 'bg-[#1b202b] border-slate-800 text-slate-500'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <BookOpen className="w-3 h-3" />
                  <span>Ngữ cảnh: {useContext ? 'Bật' : 'Tắt'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUseWeb((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium cursor-pointer transition-colors ${
                    useWeb
                      ? 'bg-sky-500/12 border-sky-500/35 text-sky-600'
                      : isDark
                      ? 'bg-[#1b202b] border-slate-800 text-slate-500'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  <span>Nguồn mạng: {useWeb ? 'Bật' : 'Tắt'}</span>
                </button>

                {selectedNode && (
                  <span
                    className={`ml-auto truncate max-w-[145px] text-[10.5px] px-1.5 py-0.5 rounded ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-indigo-50 text-indigo-700'
                    }`}
                    title={`Đang chọn: ${selectedNode.data.label}`}
                  >
                    Đang chọn: {selectedNode.data.label}
                  </span>
                )}
              </div>
            </div>

            <AiChatMessageList
              messages={messages}
              isRunning={isRunning}
              liveModel={liveModel}
              liveRotationNote={liveRotationNote}
              liveTraces={liveTraces}
              isDark={isDark}
              emptyTitle={`AI Agent — Sơ đồ "${activeMap.name}"`}
              emptyDescription="Ra lệnh cho tôi tạo thêm nhánh, viết bài từ nguồn mạng hoặc từ tài liệu Markdown trong mục Ngữ cảnh, nối các ô hoặc sắp xếp lại sơ đồ."
              quickPrompts={[
                'Đọc toàn bộ mục Ngữ cảnh bài học và tạo các nhánh mindmap chi tiết cho từng phần (mỗi ô viết trong Khung Mã).',
                'Tìm kiếm tài liệu uy tín trên mạng về chủ đề đang chọn rồi tạo thêm các nhánh kiến thức mở rộng.',
                'Sắp xếp lại bố cục toàn bộ các nhánh trên sơ đồ thành dạng cây gọn gàng.',
              ]}
              onQuickPrompt={(p) => handleSendCommand(p)}
              onFocusNode={onFocusNode}
              canUndoSnapshot={(id) => Boolean(undoSnapshots[id])}
              onUndoSnapshot={handleUndo}
            />

            {/* Input Bar */}
            <div
              className={`p-3 border-t shrink-0 ${
                isDark ? 'bg-[#161a22] border-slate-800' : 'bg-white border-slate-100'
              }`}
            >
              <div
                className={`flex items-end gap-2 p-2 rounded-2xl border ${
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
                  placeholder="Ra lệnh cho AI (vd: Tạo 4 nhánh bài học từ Ngữ cảnh...)"
                  className="flex-1 bg-transparent resize-none outline-none text-xs leading-relaxed max-h-32 px-1 py-0.5"
                />
                {isRunning ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    title="Dừng AI"
                    className="p-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shrink-0"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendCommand()}
                    disabled={!inputText.trim()}
                    title="Gửi lệnh (Enter)"
                    className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white cursor-pointer shrink-0 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Tab 2: Ngữ cảnh Markdown Lesson Editor */}
        {activeTab === 'context' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div
              className={`px-3.5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 ${
                isDark ? 'bg-[#12161e] border-slate-800' : 'bg-emerald-50/50 border-slate-100'
              }`}
            >
              <div className="text-[11.5px] leading-snug">
                <div className="font-bold text-emerald-600">Ngữ cảnh bài học (Markdown)</div>
                <div className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Dán nội dung bài học của bạn tại đây để AI đọc hiểu và viết nhánh chính xác.
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt"
                  onChange={handleUploadContextFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                    isDark
                      ? 'bg-[#1b202b] border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FileUp className="w-3 h-3" />
                  <span>Nạp .md</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewContext((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                    previewContext
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : isDark
                      ? 'bg-[#1b202b] border-slate-700 text-slate-200'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {previewContext ? <Pencil className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{previewContext ? 'Soạn thảo' : 'Xem trước'}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 p-3 overflow-y-auto">
              {previewContext ? (
                <div
                  className={`min-h-full p-3.5 rounded-xl border ${
                    isDark ? 'bg-[#0f1218] border-slate-800' : 'bg-slate-50/70 border-slate-200'
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownWithKatex(
                      contextText || '*Chưa có nội dung Ngữ cảnh nào được dán vào.*'
                    ),
                  }}
                />
              ) : (
                <textarea
                  value={contextText}
                  onChange={(e) =>
                    onReplaceMap({
                      ...activeMap,
                      context: e.target.value,
                      updatedAt: Date.now(),
                    })
                  }
                  placeholder={
                    '# Bài học: ...\n\nDán toàn bộ nội dung bài học dưới dạng Markdown vào đây (hỗ trợ tiêu đề #, danh sách, bảng, công thức $...$)...\n\nSau đó bấm "Tạo nhánh từ Ngữ cảnh" bên dưới hoặc chuyển sang tab AI Agent để ra lệnh.'
                  }
                  className={`w-full h-full min-h-[260px] p-3 rounded-xl border outline-none resize-none font-mono text-xs leading-relaxed ${
                    isDark
                      ? 'bg-[#0f1218] border-slate-700 focus:border-emerald-500 text-slate-100'
                      : 'bg-slate-50/60 border-slate-200 focus:border-emerald-500 focus:bg-white text-slate-800'
                  }`}
                />
              )}
            </div>

            <div
              className={`px-3 py-2.5 border-t flex items-center justify-between gap-2 shrink-0 ${
                isDark ? 'bg-[#161a22] border-slate-800' : 'bg-white border-slate-100'
              }`}
            >
              <button
                type="button"
                disabled={!contextText.trim()}
                onClick={() =>
                  onReplaceMap({
                    ...activeMap,
                    context: '',
                    updatedAt: Date.now(),
                  })
                }
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-500/10 disabled:opacity-35 cursor-pointer"
              >
                Xóa ngữ cảnh
              </button>

              <button
                type="button"
                disabled={!contextText.trim() || isRunning}
                onClick={() => {
                  setUseContext(true);
                  handleSendCommand(
                    'Hãy đọc toàn bộ mục Ngữ cảnh Markdown của sơ đồ này, chia thành các nhánh logic rõ ràng, tạo các ô con đầy đủ nội dung (trình bày trong Khung Mã) và sắp xếp cây gọn gàng.'
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tạo nhánh từ Ngữ cảnh</span>
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
