import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Laptop, Flame, X, ArrowLeft } from 'lucide-react';
import type { MapData } from '../types';

interface DeleteMapModalProps {
  targetMap: MapData | null;
  hasSupabaseConfigured: boolean;
  onClose: () => void;
  onDeleteLocalOnly: (mapId: string) => void;
  onDeletePurgeAll: (mapId: string) => void;
}

export const DeleteMapModal: React.FC<DeleteMapModalProps> = ({
  targetMap,
  hasSupabaseConfigured,
  onClose,
  onDeleteLocalOnly,
  onDeletePurgeAll,
}) => {
  const [step, setStep] = useState<'choose' | 'confirm-purge'>('choose');

  useEffect(() => {
    setStep('choose');
  }, [targetMap?.id]);

  if (!targetMap) return null;

  const nodeCount = targetMap.nodes?.length || 0;

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs z-[10050] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                step === 'confirm-purge'
                  ? 'bg-rose-100 text-rose-700 border-rose-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}
            >
              {step === 'confirm-purge' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {step === 'confirm-purge' ? 'Xác nhận Xóa sạch' : 'Xóa bản đồ'}
              </h2>
              <p className="text-[11px] text-slate-500 truncate max-w-[260px]">
                {targetMap.name} ({nodeCount} ô ghi chú)
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

        {/* Body */}
        {step === 'choose' ? (
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn muốn xóa bản đồ <strong className="text-slate-900">&ldquo;{targetMap.name}&rdquo;</strong> theo cách nào?
            </p>

            <div className="space-y-2.5">
              {/* Lựa chọn 1: Xóa map (chỉ xóa trên máy này) */}
              <button
                type="button"
                onClick={() => onDeleteLocalOnly(targetMap.id)}
                className="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-start gap-3 cursor-pointer group"
              >
                <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-white border border-slate-200 shrink-0 mt-0.5">
                  <Laptop className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900">Xóa map (chỉ trên máy này)</div>
                  <div className="text-[11px] text-slate-500 leading-relaxed">
                    Xóa bản đồ khỏi thiết bị hiện tại. Dữ liệu và ảnh trên Supabase Cloud vẫn được giữ nguyên cho các thiết bị khác.
                  </div>
                </div>
              </button>

              {/* Lựa chọn 2: Xóa sạch (chuyển sang bước hỏi lại lần 2) */}
              <button
                type="button"
                onClick={() => setStep('confirm-purge')}
                className="w-full text-left p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50 hover:border-rose-300 transition-all flex items-start gap-3 cursor-pointer group"
              >
                <div className="p-2 rounded-lg bg-rose-100 text-rose-700 border border-rose-200 shrink-0 mt-0.5">
                  <Flame className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-rose-700">Xóa sạch</div>
                  <div className="text-[11px] text-rose-800/80 leading-relaxed">
                    {hasSupabaseConfigured
                      ? 'Xóa bản đồ trên máy này, xóa khỏi Supabase Database và xóa toàn bộ ảnh thuộc bản đồ trên Supabase Storage.'
                      : 'Xóa vĩnh viễn bản đồ khỏi thiết bị này (hiện chưa kết nối Supabase Cloud).'}
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 leading-relaxed space-y-1.5">
              <div className="font-bold text-rose-700 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Bạn có chắc chắn muốn xóa sạch không?</span>
              </div>
              <p className="text-[11px] text-rose-800">
                Bản đồ <strong>&ldquo;{targetMap.name}&rdquo;</strong>
                {hasSupabaseConfigured
                  ? ' cùng toàn bộ ảnh trên Supabase Storage sẽ bị xóa vĩnh viễn và không thể khôi phục.'
                  : ' sẽ bị xóa vĩnh viễn khỏi thiết bị này và không thể khôi phục.'}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('choose')}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Quay lại</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePurgeAll(targetMap.id)}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Chắc chắn, xóa sạch
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
