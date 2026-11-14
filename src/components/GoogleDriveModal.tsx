import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  HardDrive,
  Archive,
  RotateCcw,
  RefreshCw,
  Key,
  Code2,
  Copy,
  Check,
  ExternalLink,
  Wifi,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Trash2,
  FileJson,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import type { AppSettings, DriveFileItem, MapData } from '../types';
import {
  GOOGLE_APPS_SCRIPT_CODE,
  archiveMapToGoogleDrive,
  backupAllMapsToGoogleDrive,
  backupMapToGoogleDrive,
  deleteDriveFile,
  isDriveScriptConfigured,
  listGoogleDriveFiles,
  restoreMapFromGoogleDrive,
  testDriveScriptConnection,
  toSafeDriveFileName,
} from '../services/googleDrive';
import { isSupabaseConfigured } from '../services/supabase';
import { extractSupabaseStoragePath, formatBytes } from '../utils/imageHelper';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  maps: MapData[];
  activeMap: MapData;
  initialArchiveTargetId?: string | null;
  settings: AppSettings;
  onSaveSettings: (updates: Partial<AppSettings>) => void;
  onMapBackedUp?: (message: string) => void;
  onMapArchived: (mapId: string, message: string) => void;
  onMapRestored: (map: MapData, message: string) => void;
}

function countSupabaseImagesInMap(map?: MapData): number {
  if (!map || typeof DOMParser === 'undefined') return 0;
  const parser = new DOMParser();
  const seen = new Set<string>();
  let total = 0;

  for (const node of map.nodes || []) {
    const html = node.data?.content || '';
    if (!html || !html.toLowerCase().includes('<img')) continue;
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      const src = (img.getAttribute('src') || '').trim();
      const path = extractSupabaseStoragePath(src);
      if (path && !seen.has(path)) {
        seen.add(path);
        total += 1;
      } else if (!path && src.startsWith('blob:')) {
        total += 1;
      }
    });
  }

  return total;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  maps,
  activeMap,
  initialArchiveTargetId,
  settings,
  onSaveSettings,
  onMapBackedUp,
  onMapArchived,
  onMapRestored,
}) => {
  const [scriptUrl, setScriptUrl] = useState(settings.googleDriveScriptUrl || '');
  const [activeTab, setActiveTab] = useState<'vault' | 'config' | 'script'>(() =>
    isDriveScriptConfigured(settings.googleDriveScriptUrl) ? 'vault' : 'config'
  );

  const [selectedArchiveMapId, setSelectedArchiveMapId] = useState<string>(
    initialArchiveTargetId || activeMap.id
  );

  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [backingUp, setBackingUp] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoringFileId, setRestoringFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    setScriptUrl(settings.googleDriveScriptUrl || '');
  }, [settings.googleDriveScriptUrl]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedArchiveMapId(initialArchiveTargetId || activeMap.id);
    setStatusMessage(null);
    setProgressText('');
    setTestResult(null);
    setActiveTab(isDriveScriptConfigured(settings.googleDriveScriptUrl) ? 'vault' : 'config');
  }, [isOpen, initialArchiveTargetId, activeMap.id, settings.googleDriveScriptUrl]);

  const loadDriveFiles = useCallback(async (urlToUse?: string) => {
    const targetUrl = urlToUse ?? settings.googleDriveScriptUrl;
    if (!isDriveScriptConfigured(targetUrl)) return;
    setLoadingFiles(true);
    const res = await listGoogleDriveFiles(targetUrl);
    setLoadingFiles(false);
    if (res.ok) {
      setDriveFiles(res.files);
    } else if (res.message) {
      setStatusMessage({ type: 'error', text: res.message });
    }
  }, [settings.googleDriveScriptUrl]);

  useEffect(() => {
    if (isOpen && activeTab === 'vault' && isDriveScriptConfigured(settings.googleDriveScriptUrl)) {
      loadDriveFiles(settings.googleDriveScriptUrl);
    }
  }, [isOpen, activeTab, settings.googleDriveScriptUrl, loadDriveFiles]);

  const archiveTargetMap = useMemo(() => {
    return maps.find((m) => m.id === selectedArchiveMapId) || activeMap;
  }, [maps, selectedArchiveMapId, activeMap]);

  const supabaseImageCount = useMemo(
    () => countSupabaseImagesInMap(archiveTargetMap),
    [archiveTargetMap]
  );

  if (!isOpen) return null;

  const isConfigured = isDriveScriptConfigured(settings.googleDriveScriptUrl);
  const supabaseReady = isSupabaseConfigured();
  const isBusy = backingUp || archiving || Boolean(restoringFileId) || Boolean(deletingFileId);

  const handleTestAndSaveUrl = async () => {
    const trimmed = scriptUrl.trim();
    if (!trimmed) {
      setTestResult({
        ok: false,
        message: 'Vui lòng dán Google Apps Script Web App URL.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    const res = await testDriveScriptConnection(trimmed);
    setTesting(false);
    setTestResult({ ok: res.ok, message: res.message });

    if (res.ok) {
      onSaveSettings({ googleDriveScriptUrl: trimmed });
      if (res.files) {
        setDriveFiles(res.files);
      }
    }
  };

  const handleSaveUrlOnly = () => {
    const trimmed = scriptUrl.trim();
    onSaveSettings({ googleDriveScriptUrl: trimmed });
    setTestResult({
      ok: isDriveScriptConfigured(trimmed),
      message: isDriveScriptConfigured(trimmed)
        ? 'Đã lưu URL Google Apps Script.'
        : 'Đã lưu nhưng URL chưa đúng định dạng https://script.google.com/.../exec',
    });
  };

  const handleBackupMap = async () => {
    if (!archiveTargetMap || isBusy) return;
    if (!isConfigured) {
      setActiveTab('config');
      setStatusMessage({
        type: 'error',
        text: 'Hãy cấu hình URL Google Apps Script trước khi sao lưu sơ đồ.',
      });
      return;
    }

    const expectedFileName = toSafeDriveFileName(archiveTargetMap.name);
    const hasDuplicateOnDrive = driveFiles.some(
      (f) => f.name.toLowerCase() === expectedFileName.toLowerCase()
    );

    if (hasDuplicateOnDrive) {
      const ok = window.confirm(
        [
          `Trên Google Drive đã có tệp "${expectedFileName}".`,
          '',
          `• Sao lưu sẽ cập nhật (ghi đè) tệp trên Drive bằng dữ liệu hiện tại (${archiveTargetMap.nodes.length} ô, ${supabaseImageCount} ảnh Supabase).`,
          supabaseReady
            ? '• Bản đồ hiện tại ở App chính và Supabase vẫn được GIỮ NGUYÊN, không bị xóa.'
            : '• Bản đồ hiện tại ở App chính vẫn được GIỮ NGUYÊN, không bị xóa.',
          '',
          'Bạn có muốn tiếp tục sao lưu không?',
        ].join('\n')
      );
      if (!ok) return;
    }

    setBackingUp(true);
    setStatusMessage(null);
    setProgressText('Đang chuẩn bị sao lưu lên Google Drive...');

    const res = await backupMapToGoogleDrive(archiveTargetMap, {
      scriptUrl: settings.googleDriveScriptUrl,
      onStatus: (step) => setProgressText(step),
    });

    setBackingUp(false);
    setProgressText('');

    if (res.ok) {
      onSaveSettings({ lastDriveSyncedAt: Date.now() });
      onMapBackedUp?.(res.message);
      setStatusMessage({ type: 'success', text: res.message });
      loadDriveFiles(settings.googleDriveScriptUrl);
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleBackupAllMaps = async () => {
    if (maps.length === 0 || isBusy) return;
    if (!isConfigured) {
      setActiveTab('config');
      setStatusMessage({
        type: 'error',
        text: 'Hãy cấu hình URL Google Apps Script trước khi sao lưu.',
      });
      return;
    }

    const ok = window.confirm(
      [
        `Sao lưu toàn bộ ${maps.length} bản đồ lên Google Drive?`,
        '',
        '• Mỗi bản đồ sẽ được đóng gói kèm ảnh vào tệp .json riêng (ghi đè nếu trùng tên trên Drive).',
        supabaseReady
          ? '• Toàn bộ bản đồ ở App chính và Supabase vẫn được GIỮ NGUYÊN, không xóa dữ liệu nào.'
          : '• Toàn bộ bản đồ ở App chính vẫn được GIỮ NGUYÊN, không xóa dữ liệu nào.',
      ].join('\n')
    );
    if (!ok) return;

    setBackingUp(true);
    setStatusMessage(null);
    setProgressText(`Đang chuẩn bị sao lưu ${maps.length} bản đồ...`);

    const res = await backupAllMapsToGoogleDrive(maps, {
      scriptUrl: settings.googleDriveScriptUrl,
      onStatus: (step) => setProgressText(step),
    });

    setBackingUp(false);
    setProgressText('');

    if (res.ok) {
      onSaveSettings({ lastDriveSyncedAt: Date.now() });
      onMapBackedUp?.(res.message);
      setStatusMessage({ type: 'success', text: res.message });
      loadDriveFiles(settings.googleDriveScriptUrl);
    } else {
      setStatusMessage({ type: 'error', text: res.message });
      if (res.succeeded > 0) {
        loadDriveFiles(settings.googleDriveScriptUrl);
      }
    }
  };

  const handleArchiveMap = async () => {
    if (!archiveTargetMap || isBusy) return;
    if (!isConfigured) {
      setActiveTab('config');
      setStatusMessage({
        type: 'error',
        text: 'Hãy cấu hình URL Google Apps Script trước khi cất sơ đồ.',
      });
      return;
    }

    const expectedFileName = toSafeDriveFileName(archiveTargetMap.name);
    const hasDuplicateOnDrive = driveFiles.some(
      (f) => f.name.toLowerCase() === expectedFileName.toLowerCase()
    );

    const confirmLines = [
      `Xác nhận cất sơ đồ "${archiveTargetMap.name}" vào Google Drive?`,
      '',
      `• Tệp lưu trên Drive: ${expectedFileName}${hasDuplicateOnDrive ? ' (Sẽ ghi đè bản cũ trùng tên)' : ''}`,
      `• Nội dung: ${archiveTargetMap.nodes.length} ô ghi chú, ${supabaseImageCount} ảnh Supabase (sẽ nhúng Base64 WebP vào file JSON).`,
      supabaseReady
        ? '• Sau khi Drive xác nhận lưu thành công: Sơ đồ và toàn bộ ảnh sẽ được XÓA khỏi Supabase và giao diện đang mở để giải phóng dung lượng.'
        : '• Sau khi Drive xác nhận lưu thành công: Sơ đồ sẽ được xóa khỏi danh sách đang mở trên Webapp.',
    ];
    if (maps.length <= 1) {
      confirmLines.push('• Lưu ý: Vì đây là sơ đồ cuối cùng trên màn hình, Webapp sẽ tạo 1 sơ đồ trống mới sau khi cất xong.');
    }

    if (!window.confirm(confirmLines.join('\n'))) {
      return;
    }

    setArchiving(true);
    setStatusMessage(null);
    setProgressText('Đang chuẩn bị đóng gói...');

    const res = await archiveMapToGoogleDrive(archiveTargetMap, {
      scriptUrl: settings.googleDriveScriptUrl,
      onStatus: (step) => setProgressText(step),
    });

    setArchiving(false);
    setProgressText('');

    if (res.ok) {
      onSaveSettings({ lastDriveSyncedAt: Date.now() });
      onMapArchived(archiveTargetMap.id, res.message);
      setStatusMessage({ type: 'success', text: res.message });
      loadDriveFiles(settings.googleDriveScriptUrl);
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleRestoreFile = async (fileItem: DriveFileItem) => {
    if (isBusy) return;

    setRestoringFileId(fileItem.id);
    setStatusMessage(null);
    setProgressText(`Đang tải "${fileItem.name}"...`);

    const res = await restoreMapFromGoogleDrive(fileItem, {
      scriptUrl: settings.googleDriveScriptUrl,
      onStatus: (step) => setProgressText(step),
      confirmOverwrite: (parsedMap) => {
        const existing = maps.find((m) => m.id === parsedMap.id);
        if (!existing) return true;
        return window.confirm(
          [
            `Bản đồ "${existing.name}" hiện vẫn đang có trên ứng dụng (${existing.nodes.length} ô).`,
            '',
            `Khôi phục từ Google Drive sẽ GHI ĐÈ bản hiện tại ở App${
              supabaseReady ? ' và Supabase' : ''
            } bằng dữ liệu từ tệp "${fileItem.name}" (${parsedMap.nodes.length} ô).`,
            '',
            'Bạn có muốn tiếp tục khôi phục không?',
          ].join('\n')
        );
      },
    });

    setRestoringFileId(null);
    setProgressText('');

    if (res.cancelled) {
      return;
    }

    if (res.ok && res.map) {
      onSaveSettings({ lastDriveSyncedAt: Date.now() });
      onMapRestored(res.map, res.message);
      setStatusMessage({ type: 'success', text: res.message });
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleDeleteDriveArchive = async (fileItem: DriveFileItem) => {
    if (isBusy) return;
    if (
      !window.confirm(
        `Xóa vĩnh viễn tệp lưu trữ "${fileItem.name}" khỏi thư mục SystemNote trên Google Drive (đưa vào thùng rác Drive)?`
      )
    ) {
      return;
    }
    setDeletingFileId(fileItem.id);
    setStatusMessage(null);
    const res = await deleteDriveFile(fileItem.id, settings.googleDriveScriptUrl);
    setDeletingFileId(null);
    if (res.ok) {
      setDriveFiles((prev) => prev.filter((f) => f.id !== fileItem.id));
      setStatusMessage({
        type: 'success',
        text: `Đã chuyển tệp "${fileItem.name}" vào thùng rác Google Drive.`,
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: res.message || 'Không thể xóa tệp trên Google Drive.',
      });
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[10000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 border border-amber-200">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  Kho Lưu Trữ Google Drive
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  Backup &amp; Archive
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sao lưu giữ nguyên map hoặc cất gọn sang Google Drive để giải phóng Supabase
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'vault'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Sao lưu &amp; Khôi phục ({driveFiles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'config'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Cấu hình Web App URL</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('script')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'script'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Mã Google Apps Script</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 select-text">
          {/* Progress / Status Banner */}
          {progressText && (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs font-semibold flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-sky-600" />
              <span>{progressText}</span>
            </div>
          )}

          {statusMessage && !progressText && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* TAB 1: VAULT (ARCHIVE & RESTORE) */}
          {activeTab === 'vault' && (
            <div className="space-y-5">
              {!isConfigured && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold mb-0.5">Chưa kết nối Google Apps Script</div>
                    <div className="text-amber-700">
                      Hãy cài đặt Google Apps Script (tab Mã Script) và dán link Web App ở tab Cấu hình.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('config')}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold shrink-0 cursor-pointer"
                  >
                    Cấu hình ngay
                  </button>
                </div>
              )}

              {/* Section 1: Sao lưu hoặc Cất sơ đồ vào Drive */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-800">
                      Lưu sơ đồ lên Google Drive
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Tự động nhúng ảnh vào JSON</span>
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Chọn sơ đồ muốn sao lưu hoặc cất vào Drive:
                  </label>
                  <select
                    value={archiveTargetMap?.id || ''}
                    onChange={(e) => setSelectedArchiveMapId(e.target.value)}
                    disabled={isBusy}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                  >
                    {maps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.nodes.length} ô)
                        {m.id === activeMap.id ? ' — Đang mở' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleBackupMap}
                    disabled={isBusy || !isConfigured || !archiveTargetMap}
                    title="Lưu bản sao lên Google Drive, giữ nguyên bản đồ ở App chính và Supabase"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-left shadow-sm transition-colors cursor-pointer"
                  >
                    {backingUp ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <UploadCloud className="w-4 h-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">
                        Sao lưu lên Drive (Giữ Map)
                      </div>
                      <div className="text-[10px] text-indigo-100 leading-tight mt-0.5 truncate">
                        {supabaseReady
                          ? 'Không xóa ở App chính & Supabase'
                          : 'Không xóa ở App chính'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleArchiveMap}
                    disabled={isBusy || !isConfigured || !archiveTargetMap}
                    title="Lưu lên Google Drive rồi xóa khỏi App chính và Supabase để giải phóng dung lượng"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-left shadow-sm transition-colors cursor-pointer"
                  >
                    {archiving ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <Archive className="w-4 h-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">
                        {supabaseReady ? 'Cất Drive & Xóa Supabase' : 'Cất Drive & Xóa Map'}
                      </div>
                      <div className="text-[10px] text-amber-100 leading-tight mt-0.5 truncate">
                        {supabaseReady
                          ? 'Lưu xong xóa khỏi App & Supabase'
                          : 'Lưu xong xóa khỏi App chính'}
                      </div>
                    </div>
                  </button>
                </div>

                {archiveTargetMap && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 leading-relaxed bg-white border border-slate-200/80 rounded-xl px-3 py-2">
                    <div>
                      Tệp lưu dự kiến:{' '}
                      <code className="font-mono text-amber-700 font-semibold">
                        {toSafeDriveFileName(archiveTargetMap.name)}
                      </code>{' '}
                      ({archiveTargetMap.nodes.length} ô, {supabaseImageCount} ảnh Supabase). Nếu trùng tên trên Drive sẽ ghi đè bản mới.
                    </div>
                    {maps.length > 1 && (
                      <button
                        type="button"
                        onClick={handleBackupAllMaps}
                        disabled={isBusy || !isConfigured}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-semibold disabled:opacity-50 shrink-0 transition-colors cursor-pointer"
                      >
                        <UploadCloud className="w-3 h-3" />
                        <span>Sao lưu cả {maps.length} map (Giữ nguyên)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Section 2: Danh sách bản đồ đang lưu trên Google Drive */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Sơ đồ đang lưu trữ trên Google Drive
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Bấm Khôi phục để đưa lại vào Webapp &amp; Supabase (bản lưu trên Drive vẫn giữ nguyên)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadDriveFiles()}
                    disabled={loadingFiles || !isConfigured || isBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-amber-300 hover:bg-amber-50 text-slate-700 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                    <span>Làm mới</span>
                  </button>
                </div>

                {loadingFiles && driveFiles.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-600" />
                    Đang tải danh sách từ thư mục SystemNote trên Google Drive...
                  </div>
                ) : driveFiles.length === 0 ? (
                  <div className="py-8 px-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    {isConfigured
                      ? 'Chưa có tệp .json nào trong thư mục "SystemNote" trên Google Drive.'
                      : 'Chưa kết nối Google Drive.'}
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-64 overflow-y-auto bg-white">
                    {driveFiles.map((file) => {
                      const isRestoringThis = restoringFileId === file.id;
                      const isDeletingThis = deletingFileId === file.id;
                      return (
                        <div
                          key={file.id}
                          className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                              <FileJson className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 truncate">
                                {file.name}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span>{new Date(file.updatedAt).toLocaleString('vi-VN')}</span>
                                {typeof file.size === 'number' && file.size > 0 && (
                                  <>
                                    <span>·</span>
                                    <span>{formatBytes(file.size)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {file.url && (
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Mở xem tệp trên Google Drive"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRestoreFile(file)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            >
                              {isRestoringThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                              <span>Khôi phục</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDriveArchive(file)}
                              disabled={isBusy}
                              title="Xóa bản lưu này trên Google Drive"
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors cursor-pointer"
                            >
                              {isDeletingThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CONFIG */}
          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="block text-xs font-bold text-slate-700">
                  Google Apps Script Web App URL (/exec)
                </label>
                <input
                  type="url"
                  value={scriptUrl}
                  onChange={(e) => setScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Tất cả tệp lưu trữ sẽ được tự động quản lý trong thư mục riêng tên{' '}
                  <strong>SystemNote</strong> trên Google Drive cá nhân của bạn.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestAndSaveUrl}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm cursor-pointer"
                  >
                    {testing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wifi className="w-3.5 h-3.5" />
                    )}
                    <span>Kiểm tra &amp; Lưu URL</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveUrlOnly}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    <span>Chỉ lưu URL</span>
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                      testResult.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-700'
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: APPS SCRIPT CODE */}
          {activeTab === 'script' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-slate-700 space-y-2 leading-relaxed">
                <div className="font-bold text-amber-900">
                  Hướng dẫn thiết lập Google Apps Script (Chỉ làm 1 lần):
                </div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Mở{' '}
                    <a
                      href="https://script.google.com/home/start"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 font-semibold underline"
                    >
                      script.google.com
                    </a>{' '}
                    bằng tài khoản Google của bạn và bấm <strong>New project (Dự án mới)</strong>.
                  </li>
                  <li>
                    Xóa hết mã mặc định trong <code>Code.gs</code>, bấm nút{' '}
                    <strong>Sao chép mã Apps Script</strong> bên dưới và dán vào.
                  </li>
                  <li>
                    Bấm <strong>Deploy (Triển khai) → New deployment (Tùy chọn triển khai mới)</strong>,
                    chọn loại là <strong>Web app</strong>.
                  </li>
                  <li>
                    Ở mục <em>Execute as</em> chọn <strong>Me (Tôi)</strong>; ở mục{' '}
                    <em>Who has access</em> chọn <strong>Anyone (Bất kỳ ai)</strong> → bấm{' '}
                    <strong>Deploy</strong> và cấp quyền Google Drive.
                  </li>
                  <li>
                    Copy đường dẫn <strong>Web app URL</strong> (kết thúc bằng <code>/exec</code>)
                    rồi dán vào tab <strong>Cấu hình Web App URL</strong>.
                  </li>
                </ol>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Mã nguồn Google Apps Script (Code.gs)
                </span>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {copiedScript ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép mã Apps Script</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-72 leading-relaxed border border-slate-700">
                {GOOGLE_APPS_SCRIPT_CODE}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
