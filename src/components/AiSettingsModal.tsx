import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import type { AppSettings } from '../types';
import { testAiConnection } from '../services/aiClient';
import {
  DEFAULT_AI_API_KEY,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_FALLBACK_MODELS,
  DEFAULT_AI_PRIMARY_MODEL,
  dedupeModelList,
  resolveAiConfig,
} from '../services/aiConfig';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (patch: Partial<AppSettings>) => void;
  isDark?: boolean;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  isDark = false,
}) => {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_AI_BASE_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_AI_API_KEY);
  const [showKey, setShowKey] = useState(false);
  const [primaryModel, setPrimaryModel] = useState(DEFAULT_AI_PRIMARY_MODEL);
  const [models, setModels] = useState<string[]>([...DEFAULT_AI_FALLBACK_MODELS]);
  const [disabledModels, setDisabledModels] = useState<string[]>([]);
  const [newModelInput, setNewModelInput] = useState('');
  const [autoRotate, setAutoRotate] = useState(true);
  const [alwaysCodeFrame, setAlwaysCodeFrame] = useState(true);
  const [useWebDefault, setUseWebDefault] = useState(true);
  const [useContextDefault, setUseContextDefault] = useState(true);
  const [temperature, setTemperature] = useState(0.35);
  const [maxSteps, setMaxSteps] = useState(10);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const resolved = resolveAiConfig(settings);
    setBaseUrl(resolved.baseUrl);
    setApiKey(resolved.apiKey);
    setPrimaryModel(resolved.primaryModel);
    setModels(resolved.models);
    setDisabledModels(resolved.disabledModels);
    setAutoRotate(resolved.autoRotate);
    setAlwaysCodeFrame(resolved.alwaysWrapInCodeFrame);
    setUseWebDefault(resolved.useWebSearchByDefault);
    setUseContextDefault(resolved.useContextByDefault);
    setTemperature(resolved.temperature);
    setMaxSteps(resolved.maxSteps);
    setTestResult(null);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleAddModel = () => {
    const clean = newModelInput.trim();
    if (!clean) return;
    if (!models.includes(clean)) {
      setModels((prev) => dedupeModelList([...prev, clean]));
    }
    setDisabledModels((prev) => prev.filter((m) => m !== clean));
    setNewModelInput('');
  };

  const handleMoveModel = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= models.length) return;
    const next = [...models];
    const [picked] = next.splice(idx, 1);
    next.splice(target, 0, picked);
    setModels(next);
  };

  const handleDeleteModel = (modelId: string) => {
    if (models.length <= 1) return;
    const next = models.filter((m) => m !== modelId);
    setModels(next);
    setDisabledModels((prev) => prev.filter((m) => m !== modelId));
    if (primaryModel === modelId) {
      setPrimaryModel(next[0]);
    }
  };

  const handleToggleDisable = (modelId: string) => {
    setDisabledModels((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]
    );
  };

  const handleRestoreDefaults = () => {
    setBaseUrl(DEFAULT_AI_BASE_URL);
    setApiKey(DEFAULT_AI_API_KEY);
    setPrimaryModel(DEFAULT_AI_PRIMARY_MODEL);
    setModels([...DEFAULT_AI_FALLBACK_MODELS]);
    setDisabledModels([]);
    setAutoRotate(true);
    setAlwaysCodeFrame(true);
    setUseWebDefault(true);
    setUseContextDefault(true);
    setTemperature(0.35);
    setMaxSteps(10);
    setTestResult(null);
  };

  const buildPatch = (): Partial<AppSettings> => ({
    aiBaseUrl: baseUrl.trim() || DEFAULT_AI_BASE_URL,
    aiApiKey: apiKey.trim(),
    aiPrimaryModel: primaryModel.trim() || models[0] || DEFAULT_AI_PRIMARY_MODEL,
    aiFallbackModels: dedupeModelList(models),
    aiDisabledModels: disabledModels,
    aiAutoRotate: autoRotate,
    aiAlwaysWrapInCodeFrame: alwaysCodeFrame,
    aiUseWebSearchByDefault: useWebDefault,
    aiUseContextByDefault: useContextDefault,
    aiTemperature: temperature,
    aiMaxSteps: maxSteps,
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const resolved = resolveAiConfig({ ...settings, ...buildPatch() });
    const res = await testAiConnection(resolved, primaryModel);
    setTestResult({ ok: res.ok, message: res.message });
    setTesting(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(buildPatch());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
      <div
        className={`w-full max-w-2xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
          isDark
            ? 'bg-[#161a22] border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b ${
            isDark ? 'bg-[#1b202b] border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Cấu hình AI & Xoay Model</h2>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                OpenAI-compatible endpoint, API Token và danh sách model tự xoay khi gặp lỗi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {/* Endpoint + API Token */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block font-semibold">AI Base URL (OpenAI-compatible)</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.xah.io/v1"
                required
                className={`w-full px-3 py-2 rounded-xl border outline-none text-xs font-mono ${
                  isDark
                    ? 'bg-[#0f1218] border-slate-700 focus:border-indigo-500 text-slate-100'
                    : 'bg-white border-slate-300 focus:border-indigo-500 text-slate-800'
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold">API Token (Bearer)</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  required
                  className={`w-full pl-3 pr-9 py-2 rounded-xl border outline-none text-xs font-mono ${
                    isDark
                      ? 'bg-[#0f1218] border-slate-700 focus:border-indigo-500 text-slate-100'
                      : 'bg-white border-slate-300 focus:border-indigo-500 text-slate-800'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  title={showKey ? 'Ẩn token' : 'Hiện token'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Model Rotation List */}
          <div
            className={`p-3.5 rounded-xl border space-y-2.5 ${
              isDark ? 'bg-[#0f1218]/70 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Danh sách Model & Thứ tự xoay dự phòng ({models.length})</span>
                </div>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Bấm sao để chọn model chính. Khi model đang gọi bị lỗi/quá tải, AI sẽ tự xoay theo thứ tự bên dưới.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                  isDark
                    ? 'bg-[#1b202b] border-slate-700 text-slate-300 hover:text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Khôi phục mặc định</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {models.map((m, idx) => {
                const isPrimary = m === primaryModel;
                const isDisabled = disabledModels.includes(m);
                return (
                  <div
                    key={m}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
                      isPrimary
                        ? isDark
                          ? 'bg-indigo-950/50 border-indigo-700'
                          : 'bg-indigo-50 border-indigo-300'
                        : isDark
                        ? 'bg-[#161a22] border-slate-800'
                        : 'bg-white border-slate-200'
                    } ${isDisabled ? 'opacity-55' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`w-5 text-center text-[10px] font-bold ${
                          isDark ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPrimaryModel(m)}
                        title="Đặt làm model chính"
                        className={`p-1 rounded cursor-pointer ${
                          isPrimary ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isPrimary ? 'fill-amber-500' : ''}`} />
                      </button>
                      <span className="font-mono text-[11.5px] truncate">{m}</span>
                      {isPrimary && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9.5px] font-bold shrink-0">
                          Chính
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleDisable(m)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer border ${
                          isDisabled
                            ? isDark
                              ? 'border-slate-700 text-slate-400'
                              : 'border-slate-200 text-slate-500 bg-slate-100'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {isDisabled ? 'Đang tắt' : 'Bật'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveModel(idx, -1)}
                        disabled={idx === 0}
                        title="Ưu tiên lên"
                        className="p-1 rounded hover:bg-slate-200/60 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveModel(idx, 1)}
                        disabled={idx === models.length - 1}
                        title="Ưu tiên xuống"
                        className="p-1 rounded hover:bg-slate-200/60 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteModel(m)}
                        disabled={models.length <= 1}
                        title="Xóa khỏi danh sách"
                        className="p-1 rounded text-rose-500 hover:bg-rose-50 disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newModelInput}
                onChange={(e) => setNewModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddModel();
                  }
                }}
                placeholder="Thêm model ID khác (vd: openai/gpt-4.1-mini)"
                className={`flex-1 px-3 py-1.5 rounded-lg border outline-none font-mono text-xs ${
                  isDark
                    ? 'bg-[#161a22] border-slate-700 text-slate-100'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
              />
              <button
                type="button"
                onClick={handleAddModel}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>
          </div>

          {/* Behavior Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                isDark ? 'border-slate-800 bg-[#0f1218]/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <input
                type="checkbox"
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600"
              />
              <div>
                <div className="font-semibold">Tự xoay model khi lỗi</div>
                <div className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Tự chuyển sang model kế tiếp nếu model hiện tại lỗi hoặc quá tải.
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                isDark ? 'border-slate-800 bg-[#0f1218]/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <input
                type="checkbox"
                checked={alwaysCodeFrame}
                onChange={(e) => setAlwaysCodeFrame(e.target.checked)}
                className="mt-0.5 rounded text-emerald-600"
              />
              <div>
                <div className="font-semibold">Mặc định chèn vào Khung Mã</div>
                <div className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Đảm bảo mọi câu trả lời AI chèn vào note giữ chuẩn Markdown + KaTeX.
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                isDark ? 'border-slate-800 bg-[#0f1218]/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <input
                type="checkbox"
                checked={useContextDefault}
                onChange={(e) => setUseContextDefault(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600"
              />
              <div>
                <div className="font-semibold">Mặc định đọc Ngữ cảnh</div>
                <div className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Cho phép AI Agent tự đọc tài liệu bài học Markdown bạn đã dán.
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                isDark ? 'border-slate-800 bg-[#0f1218]/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <input
                type="checkbox"
                checked={useWebDefault}
                onChange={(e) => setUseWebDefault(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600"
              />
              <div>
                <div className="font-semibold">Mặc định cho phép Nguồn mạng</div>
                <div className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Cho phép AI tìm kiếm và đọc trang web tham khảo bên ngoài.
                </div>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold flex justify-between">
                <span>Độ sáng tạo (Temperature)</span>
                <span className="font-mono text-indigo-500">{temperature.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold flex justify-between">
                <span>Số bước Agent tối đa / lượt</span>
                <span className="font-mono text-indigo-500">{maxSteps} bước</span>
              </label>
              <input
                type="range"
                min={3}
                max={18}
                step={1}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`px-3 py-2 rounded-xl border text-xs font-medium ${
                testResult.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border font-semibold cursor-pointer transition-colors disabled:opacity-50 ${
                isDark
                  ? 'bg-[#1b202b] border-slate-700 hover:bg-slate-800 text-slate-200'
                  : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Wifi className={`w-3.5 h-3.5 ${testing ? 'animate-pulse text-indigo-500' : ''}`} />
              <span>{testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`px-3.5 py-2 rounded-xl font-medium cursor-pointer ${
                  isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Lưu cấu hình AI</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
