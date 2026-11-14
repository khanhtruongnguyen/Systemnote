import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Network,
} from 'lucide-react';
import type { CustomNode } from '../types';
import type { Edge } from '@xyflow/react';
import { COLOR_SCHEMES } from '../constants/theme';

interface ConnectNodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: CustomNode[];
  edges: Edge[];
  onAddEdge: (sourceId: string, targetId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export const ConnectNodesModal: React.FC<ConnectNodesModalProps> = ({
  isOpen,
  onClose,
  nodes,
  edges,
  onAddEdge,
  onDeleteEdge,
}) => {
  const [sourceId, setSourceId] = useState<string>(() => nodes[0]?.id || '');
  const [targetId, setTargetId] = useState<string>(() => nodes[1]?.id || nodes[0]?.id || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSourceId((prev) => (nodes.some((n) => n.id === prev) ? prev : nodes[0]?.id || ''));
      setTargetId((prev) =>
        nodes.some((n) => n.id === prev) ? prev : nodes[1]?.id || nodes[0]?.id || ''
      );
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, nodes]);

  if (!isOpen) return null;

  const handleConnect = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!sourceId || !targetId) {
      setErrorMsg('Vui lòng chọn cả ô bắt đầu và ô đích.');
      return;
    }

    if (sourceId === targetId) {
      setErrorMsg('Không thể tự nối một ô vào chính nó.');
      return;
    }

    const exists = edges.some((e) => e.source === sourceId && e.target === targetId);
    if (exists) {
      setErrorMsg('Liên kết này đã tồn tại rồi.');
      return;
    }

    onAddEdge(sourceId, targetId);
    setSuccessMsg('Đã tạo liên kết giữa 2 ô thành công!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-800">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-xs text-white">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Quản lý liên kết các ô</h2>
              <p className="text-[11px] text-slate-500">
                Nối hoặc xóa đường liên kết nhanh giữa các ô trên sơ đồ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
            <span className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tạo liên kết mới</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500 font-medium">Ô bắt đầu:</label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full bg-white border border-slate-300 focus:border-indigo-500 rounded-xl px-2.5 py-2 text-slate-800 outline-none text-xs truncate"
                >
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.data.label || 'Chưa đặt tên'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center pt-3 sm:pt-4 text-indigo-500">
                <ArrowRight className="w-4 h-4" />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-500 font-medium">Ô đích:</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full bg-white border border-slate-300 focus:border-indigo-500 rounded-xl px-2.5 py-2 text-slate-800 outline-none text-xs truncate"
                >
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.data.label || 'Chưa đặt tên'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleConnect}
                disabled={nodes.length < 2}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Nối 2 ô này</span>
              </button>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-500">
              <span className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-cyan-600" />
                <span>Các liên kết hiện có ({edges.length})</span>
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200">
              {edges.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Chưa có đường nối liên kết nào trên sơ đồ.
                </div>
              ) : (
                edges.map((edge) => {
                  const sourceNode = nodes.find((n) => n.id === edge.source);
                  const targetNode = nodes.find((n) => n.id === edge.target);

                  const sourceColor = sourceNode?.data?.color || 'indigo';
                  const targetColor = targetNode?.data?.color || 'indigo';

                  return (
                    <div
                      key={edge.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <div className="flex items-center gap-1 truncate max-w-[120px] sm:max-w-[160px]">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              COLOR_SCHEMES[sourceColor]?.dot || 'bg-indigo-500'
                            } shrink-0`}
                          />
                          <span className="truncate text-slate-700 font-medium">
                            {sourceNode?.data.label || edge.source}
                          </span>
                        </div>

                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                        <div className="flex items-center gap-1 truncate max-w-[120px] sm:max-w-[160px]">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              COLOR_SCHEMES[targetColor]?.dot || 'bg-indigo-500'
                            } shrink-0`}
                          />
                          <span className="truncate text-slate-700 font-medium">
                            {targetNode?.data.label || edge.target}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteEdge(edge.id)}
                        title="Xóa liên kết này"
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
