import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRightLeft,
  Copy,
  Scissors,
  Check,
  AlertTriangle,
  FolderSymlink,
} from 'lucide-react';
import type { CustomNode, MapData } from '../types';
import type { Edge } from '@xyflow/react';

interface MoveNodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNodes: CustomNode[];
  selectedEdges: Edge[];
  allMaps: MapData[];
  currentMapId: string;
  onConfirm: (targetMapId: string, action: 'move' | 'copy') => void;
}

export const MoveNodesModal: React.FC<MoveNodesModalProps> = ({
  isOpen,
  onClose,
  selectedNodes,
  selectedEdges,
  allMaps,
  currentMapId,
  onConfirm,
}) => {
  const otherMaps = allMaps.filter((m) => m.id !== currentMapId);
  const [targetMapId, setTargetMapId] = useState<string>(otherMaps[0]?.id || '');
  const [action, setAction] = useState<'move' | 'copy'>('move');

  useEffect(() => {
    if (isOpen) {
      setTargetMapId((prev) =>
        otherMaps.some((m) => m.id === prev) ? prev : otherMaps[0]?.id || ''
      );
    }
  }, [isOpen, otherMaps]);

  if (!isOpen) return null;

  const handleExecute = () => {
    if (!targetMapId) {
      alert('Vui lòng chọn bản đồ đích!');
      return;
    }
    onConfirm(targetMapId, action);
  };

  const selectedMap = otherMaps.find((m) => m.id === targetMapId);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[10000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 border border-amber-200">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                <span>Chuyển ô sang Bản đồ khác</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono">
                  {selectedNodes.length} ô
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Di chuyển hoặc nhân bản cụm ô vừa khoanh vùng sang bản đồ bạn chọn
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

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold text-slate-800">Các ô trong vùng khoanh:</span>
              <span className="font-mono text-indigo-600">
                {selectedNodes.length} ô • {selectedEdges.length} liên kết nội bộ
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {selectedNodes.map((node) => (
                <span
                  key={node.id}
                  className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] truncate max-w-[200px]"
                >
                  {node.data?.label || 'Chưa đặt tên'}
                </span>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2.5 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[11px]">
              <strong>Quy tắc liên kết:</strong> Chỉ giữ lại <strong>{selectedEdges.length}</strong> đường nối giữa các ô cùng nằm trong vùng chọn. Các đường nối ra ngoài sẽ được tự động tách bỏ.
            </div>
          </div>

          <div className="space-y-2">
            <label className="block font-semibold text-slate-700">
              1. Chọn Bản đồ đích muốn chuyển vào:
            </label>

            {otherMaps.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                Kho của bạn hiện chỉ có 1 bản đồ. Vui lòng tạo thêm một bản đồ mới trước khi chuyển ô!
              </div>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {otherMaps.map((map) => {
                  const isSelected = map.id === targetMapId;
                  return (
                    <div
                      key={map.id}
                      onClick={() => setTargetMapId(map.id)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderSymlink
                          className={`w-4 h-4 shrink-0 ${
                            isSelected ? 'text-indigo-600' : 'text-slate-400'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold truncate text-xs">{map.name}</div>
                          <div className="text-[10px] text-slate-500">
                            Hiện có {map.nodes?.length || 0} ô ghi chú • Cập nhật{' '}
                            {new Date(map.updatedAt).toLocaleDateString('vi-VN')}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <label className="block font-semibold text-slate-700">
              2. Chọn phương thức thực hiện:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction('move')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  action === 'move'
                    ? 'bg-amber-50 border-amber-400 text-amber-900 ring-1 ring-amber-400/50'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                  <Scissors className="w-3.5 h-3.5 text-amber-600" />
                  <span>Di chuyển (Cắt)</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Xóa các ô này ở Map hiện tại và chuyển sang Map đích.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAction('copy')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  action === 'copy'
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-900 ring-1 ring-indigo-400/50'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                  <Copy className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Nhân bản (Sao chép)</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Giữ nguyên ở Map hiện tại và tạo bản sao sang Map đích.
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={handleExecute}
            disabled={!targetMapId || otherMaps.length === 0}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              action === 'move'
                ? 'bg-amber-500 hover:bg-amber-400 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {action === 'move' ? (
              <>
                <Scissors className="w-3.5 h-3.5" />
                <span>Chuyển sang "{selectedMap?.name || 'Map đích'}"</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép sang "{selectedMap?.name || 'Map đích'}"</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
