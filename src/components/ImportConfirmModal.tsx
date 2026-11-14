import React from 'react';
import type { MapData, ImportDataResult } from '../types';
import {
  Layers,
  FileText,
  AlertTriangle,
  CheckCircle2,
  CopyPlus,
  RefreshCw,
  X,
  GitBranch,
} from 'lucide-react';

interface ImportConfirmModalProps {
  isOpen: boolean;
  importResult: ImportDataResult | null;
  existingMaps: MapData[];
  onClose: () => void;
  onUpdateExisting: (importedMap: MapData, existingMapId: string) => void;
  onAddNewMap: (importedMap: MapData) => void;
  onMergeVault: (importedMaps: MapData[]) => void;
  onReplaceVault: (importedMaps: MapData[]) => void;
}

export const ImportConfirmModal: React.FC<ImportConfirmModalProps> = ({
  isOpen,
  importResult,
  existingMaps,
  onClose,
  onUpdateExisting,
  onAddNewMap,
  onMergeVault,
  onReplaceVault,
}) => {
  if (!isOpen || !importResult) return null;

  const isSingle = importResult.type === 'single_map';
  const singleMap = isSingle ? importResult.map : null;

  const existingMatch =
    isSingle && singleMap
      ? existingMaps.find(
          (m) =>
            m.id === singleMap.id ||
            m.name.trim().toLowerCase() === singleMap.name.trim().toLowerCase()
        )
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 sm:p-6 text-slate-800 max-h-[90vh] flex flex-col overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600">
            {isSingle ? <FileText className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">
              {isSingle ? 'Nhập Bản Đồ Đơn Lẻ' : 'Khôi Phục Sao Lưu Kho'}
            </h3>
            <p className="text-xs text-slate-500">
              {isSingle
                ? 'Xử lý nạp một bản đồ từ file JSON'
                : 'Xử lý file sao lưu chứa nhiều bản đồ'}
            </p>
          </div>
        </div>

        <div className="py-4 space-y-4 overflow-y-auto pr-1">
          {isSingle && singleMap && (
            <>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-indigo-700 truncate max-w-[280px]">
                    {singleMap.name}
                  </div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700">
                    Bản đồ đơn lẻ
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-slate-600 pt-1">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <strong className="text-slate-800">{(singleMap.nodes || []).length}</strong> ô ghi chú
                  </span>
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                    <strong className="text-slate-800">{(singleMap.edges || []).length}</strong> liên kết
                  </span>
                </div>
              </div>

              {existingMatch ? (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">
                      Đã tìm thấy bản đồ "{existingMatch.name}" trong kho của bạn.
                    </span>
                    <p className="mt-1 text-amber-800/80 text-[11px] leading-relaxed">
                      Khi chọn <b>"Cập nhật"</b>, hệ thống sẽ tự tạo một bản sao lưu dự phòng cho bản cũ để an toàn dữ liệu.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Bản đồ này chưa có trong kho. Bạn có thể thêm vào danh sách.</span>
                </div>
              )}

              <div className="space-y-2 pt-2">
                {existingMatch && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateExisting(singleMap, existingMatch.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition-all text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className="w-4 h-4 text-indigo-100 group-hover:rotate-180 transition-transform duration-500" />
                      <div>
                        <div className="font-semibold">Cập nhật bản đồ này (Khuyên dùng)</div>
                        <div className="text-[11px] text-indigo-100 font-normal">
                          Cập nhật bản mới + Tự động lưu bản cũ vào kho dự phòng
                        </div>
                      </div>
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onAddNewMap(singleMap);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border font-medium text-xs transition-all text-left cursor-pointer ${
                    existingMatch
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-indigo-600 border-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CopyPlus className="w-4 h-4" />
                    <div>
                      <div className="font-semibold">
                        {existingMatch ? 'Thêm thành bản đồ mới độc lập' : 'Thêm bản đồ vào kho'}
                      </div>
                      <div className={`text-[11px] font-normal ${existingMatch ? 'text-slate-500' : 'text-indigo-100'}`}>
                        {existingMatch
                          ? `Tạo bản đồ mới mang tên "${singleMap.name} (Bản mới)"`
                          : 'Lưu bản đồ này vào danh sách bản đồ của bạn'}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {!isSingle && importResult.type === 'multi_maps' && (
            <>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-indigo-700">File Sao Lưu Toàn Bộ Kho</div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-blue-700">
                    Kho đa bản đồ
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  File chứa tổng cộng <strong className="text-slate-800">{importResult.maps.length}</strong> bản đồ ghi chú.
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onMergeVault(importResult.maps);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <GitBranch className="w-4 h-4 text-indigo-100" />
                    <div>
                      <div className="font-semibold">Gộp vào kho hiện tại (Khuyên dùng)</div>
                      <div className="text-[11px] text-indigo-100 font-normal">
                        Giữ nguyên các bản đồ hiện tại, chỉ thêm hoặc cập nhật từ file
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (confirm('CẢNH BÁO: Thao tác này sẽ thay thế TOÀN BỘ kho hiện tại bằng các bản đồ trong file. Bạn chắc chắn chứ?')) {
                      onReplaceVault(importResult.maps);
                      onClose();
                    }
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-medium text-xs transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <div>
                      <div className="font-semibold">Thay thế toàn bộ kho</div>
                      <div className="text-[11px] text-rose-600/80 font-normal">
                        Xóa sạch kho hiện tại và nạp lại toàn bộ từ file sao lưu này
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Đóng / Hủy bỏ
          </button>
        </div>
      </div>
    </div>
  );
};
