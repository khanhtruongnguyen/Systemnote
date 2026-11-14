import React, { useState, useRef, useEffect } from 'react';
import type { MapData, CanvasThemeId } from '../types';
import type { DeviceMode } from '../hooks/useDeviceMode';
import { CANVAS_THEMES, DEFAULT_CANVAS_THEME, type CanvasTheme } from '../constants/theme';
import {
  ChevronDown,
  Plus,
  Download,
  Upload,
  Edit2,
  Trash2,
  Check,
  Layers,
  MoreVertical,
  Monitor,
  Share2,
  FileText,
  BoxSelect,
  Database,
  HardDrive,
  Archive,
  Palette,
  Sparkles,
  Settings,
  Cloud,
} from 'lucide-react';

interface HeaderProps {
  maps: MapData[];
  activeMap: MapData;
  canvasTheme?: CanvasTheme;
  onChangeCanvasTheme?: (themeId: CanvasThemeId) => void;
  isMobile: boolean;
  devicePreference: DeviceMode;
  onChangeDeviceMode: (mode: DeviceMode) => void;
  onSelectMap: (mapId: string) => void;
  onOpenNewMapModal: () => void;
  onRenameMap: (mapId: string, newName: string) => void;
  onDeleteMap: (mapId: string) => void;
  onAddNode: () => void;
  onExportBackup: () => void;
  onExportSingleMap: (map: MapData) => void;
  onImportBackup: (file: File) => void;
  onOpenSupabaseModal: () => void;
  hasSupabaseConfigured?: boolean;
  onOpenDriveModal: (archiveMapId?: string) => void;
  hasDriveConfigured?: boolean;
  isMoveMode?: boolean;
  onToggleMoveMode?: () => void;
  isMainAiOpen?: boolean;
  onToggleMainAi?: () => void;
  onOpenAiSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  maps,
  activeMap,
  canvasTheme = CANVAS_THEMES[DEFAULT_CANVAS_THEME],
  onChangeCanvasTheme,
  isMobile,
  devicePreference,
  onChangeDeviceMode,
  onSelectMap,
  onOpenNewMapModal,
  onRenameMap,
  onDeleteMap,
  onAddNode,
  onExportBackup,
  onExportSingleMap,
  onImportBackup,
  onOpenSupabaseModal,
  hasSupabaseConfigured = false,
  onOpenDriveModal,
  hasDriveConfigured = false,
  isMoveMode = false,
  onToggleMoveMode,
  isMainAiOpen = false,
  onToggleMainAi,
  onOpenAiSettings,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [storageMenuOpen, setStorageMenuOpen] = useState(false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(activeMap.name);
  const [copiedMapLink, setCopiedMapLink] = useState(false);

  const fileImportRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const storageMenuRef = useRef<HTMLDivElement>(null);
  const displayMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const isDark = canvasTheme.isDark;

  const handleCopyMapLink = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('map', activeMap.id);
      url.searchParams.delete('note');
      navigator.clipboard.writeText(url.toString());
      setCopiedMapLink(true);
      setTimeout(() => setCopiedMapLink(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setEditedName(activeMap.name);
    setIsEditingName(false);
  }, [activeMap]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (storageMenuRef.current && !storageMenuRef.current.contains(e.target as Node)) {
        setStorageMenuOpen(false);
      }
      if (displayMenuRef.current && !displayMenuRef.current.contains(e.target as Node)) {
        setDisplayMenuOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveRename = () => {
    if (editedName.trim() && editedName !== activeMap.name) {
      onRenameMap(activeMap.id, editedName.trim());
    }
    setIsEditingName(false);
  };

  const pillBtnClass = isDark
    ? 'bg-[#1d222d] border-slate-700/80 text-slate-200 hover:bg-[#252b39] hover:border-slate-600'
    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300';

  return (
    <header
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
      }}
      className={`relative shrink-0 backdrop-blur-md border-b px-3 sm:px-4 flex flex-col justify-end z-30 select-none transition-colors duration-200 ${canvasTheme.chromeBg} ${canvasTheme.chromeBorder}`}
    >
      <input
        type="file"
        ref={fileImportRef}
        accept=".json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onImportBackup(file);
          }
          if (fileImportRef.current) fileImportRef.current.value = '';
        }}
        className="hidden"
      />

      <div className="h-14 w-full flex items-center justify-between gap-2">
        {/* Left: Brand & Map Selector */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className={`flex items-center gap-2 pr-2 sm:pr-3 border-r shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-sm text-white text-sm font-bold">
              SN
            </div>
            <span className={`text-sm font-bold tracking-tight hidden md:inline ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              System<span className="text-indigo-500">Note</span>
            </span>
          </div>

          <div className="relative min-w-0" ref={dropdownRef}>
            <div className={`flex items-center gap-1.5 border rounded-xl px-2.5 sm:px-3 py-1.5 transition-colors ${
              isDark
                ? 'bg-[#1d222d] border-slate-700/80 hover:border-slate-600'
                : 'bg-slate-100/90 border-slate-200 hover:border-slate-300'
            }`}>
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    autoFocus
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    className={`text-xs font-semibold border border-indigo-400 rounded px-1.5 py-0.5 outline-none w-32 sm:w-44 ${
                      isDark ? 'bg-[#0f1218] text-slate-100' : 'bg-white text-slate-800'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleSaveRename}
                    className="p-1 rounded text-indigo-500 hover:bg-indigo-500/10 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className={`flex items-center gap-1.5 text-xs font-semibold max-w-[130px] sm:max-w-[190px] md:max-w-[230px] truncate cursor-pointer ${
                      isDark ? 'text-slate-200' : 'text-slate-700'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">{activeMap.name}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </button>
                  {!isMobile && (
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      title="Đổi tên Bản đồ này"
                      className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyMapLink}
                    title="Sao chép đường link dẫn thẳng đến Bản đồ này"
                    className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                  >
                    {copiedMapLink ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Share2 className="w-3 h-3" />
                    )}
                  </button>
                </>
              )}
            </div>

            {dropdownOpen && (
              <div className="absolute top-11 left-0 w-68 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Bản đồ của bạn ({maps.length})
                </div>

                <div className="max-h-60 overflow-y-auto py-1">
                  {maps.map((m) => {
                    const isActive = m.id === activeMap.id;
                    return (
                      <div
                        key={m.id}
                        className={`group flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 font-semibold border-l-2 border-indigo-600'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          onSelectMap(m.id);
                          setDropdownOpen(false);
                        }}
                      >
                        <span className="truncate pr-2">{m.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDropdownOpen(false);
                              onOpenDriveModal(m.id);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-amber-600 transition-colors cursor-pointer"
                            title={`Sao lưu hoặc cất "${m.name}" lên Google Drive`}
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExportSingleMap(m);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                            title={`Xuất riêng bản đồ "${m.name}"`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {maps.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDropdownOpen(false);
                                onDeleteMap(m.id);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Xóa bản đồ này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-100 pt-1 mt-1 px-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenNewMapModal();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tạo Bản đồ mới</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Desktop Primary & Workspace Groups */}
          {!isMobile && (
            <>
              <button
                type="button"
                onClick={onAddNode}
                title="Thêm ô ghi chú mới vào giữa màn hình"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm ô</span>
              </button>

              {onToggleMoveMode && (
                <button
                  type="button"
                  onClick={onToggleMoveMode}
                  title="Kéo chuột khoanh chọn vùng các ô để di chuyển hoặc sao chép sang Map khác"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isMoveMode
                      ? 'bg-amber-500 text-white border-amber-500'
                      : pillBtnClass
                  }`}
                >
                  <BoxSelect className={`w-3.5 h-3.5 ${isMoveMode ? 'text-white' : 'text-slate-400'}`} />
                  <span>{isMoveMode ? 'Đang khoanh' : 'Di chuyển'}</span>
                </button>
              )}

              {onToggleMainAi && (
                <button
                  type="button"
                  onClick={onToggleMainAi}
                  title="Mở AI Agent màn hình chính & mục Ngữ cảnh bài học"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isMainAiOpen
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : pillBtnClass
                  }`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isMainAiOpen ? 'text-white' : 'text-indigo-500'}`} />
                  <span>AI Agent</span>
                  {Boolean(activeMap.context?.trim()) && (
                    <span
                      title="Đang có nội dung Ngữ cảnh"
                      className={`w-1.5 h-1.5 rounded-full ${
                        isMainAiOpen ? 'bg-emerald-300' : 'bg-emerald-500'
                      }`}
                    />
                  )}
                </button>
              )}

              <div className={`w-px h-4 mx-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

              {/* Unified Storage & Backup Menu (Supabase + Google Drive + JSON) */}
              <div className="relative" ref={storageMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setStorageMenuOpen((v) => !v);
                    setDisplayMenuOpen(false);
                  }}
                  title="Đồng bộ Supabase, Kho Google Drive & Tệp JSON"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${pillBtnClass}`}
                >
                  <Cloud className="w-3.5 h-3.5 text-slate-400" />
                  <span>Lưu trữ</span>
                  {(hasSupabaseConfigured || hasDriveConfigured) && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                  )}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {storageMenuOpen && (
                  <div
                    className={`absolute right-0 top-10 w-72 rounded-xl border shadow-[0_12px_32px_rgba(15,23,42,0.14)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1 ${
                      isDark
                        ? 'bg-[#1a1f29] border-slate-700 text-slate-200'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Đám mây &amp; Đồng bộ
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setStorageMenuOpen(false);
                        onOpenSupabaseModal();
                      }}
                      className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Database
                          className={`w-4 h-4 shrink-0 ${
                            hasSupabaseConfigured ? 'text-emerald-500' : 'text-slate-400'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">Supabase Cloud</div>
                          <div className="text-[11px] text-slate-400 truncate">
                            Đồng bộ realtime &amp; ảnh ghi chú
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                          hasSupabaseConfigured
                            ? isDark
                              ? 'bg-emerald-950/70 text-emerald-300'
                              : 'bg-emerald-50 text-emerald-700'
                            : isDark
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {hasSupabaseConfigured ? 'Đã bật' : 'Cài đặt'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStorageMenuOpen(false);
                        onOpenDriveModal();
                      }}
                      className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <HardDrive
                          className={`w-4 h-4 shrink-0 ${
                            hasDriveConfigured ? 'text-amber-500' : 'text-slate-400'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">Kho Google Drive</div>
                          <div className="text-[11px] text-slate-400 truncate">
                            Sao lưu &amp; cất kho lạnh bản đồ
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                          hasDriveConfigured
                            ? isDark
                              ? 'bg-amber-950/70 text-amber-300'
                              : 'bg-amber-50 text-amber-700'
                            : isDark
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {hasDriveConfigured ? 'Đã nối' : 'Cài đặt'}
                      </span>
                    </button>

                    <div className={`border-t my-1 ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />

                    <div className="px-2.5 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Tệp JSON trên máy
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setStorageMenuOpen(false);
                        onExportSingleMap(activeMap);
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                        isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">Xuất riêng Map này</div>
                        <div className="text-[10.5px] text-slate-400 truncate">
                          "{activeMap.name}"
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStorageMenuOpen(false);
                        onExportBackup();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                        isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="text-xs font-medium">
                        Sao lưu cả kho ({maps.length} bản đồ)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStorageMenuOpen(false);
                        fileImportRef.current?.click();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                        isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <div className="text-xs font-medium">Nhập tệp sao lưu JSON</div>
                    </button>
                  </div>
                )}
              </div>

              {/* Unified Display & Settings Menu (Canvas Theme + Device Mode + AI Settings) */}
              <div className="relative" ref={displayMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMenuOpen((v) => !v);
                    setStorageMenuOpen(false);
                  }}
                  title="Màu nền, chế độ hiển thị & cài đặt"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${pillBtnClass}`}
                >
                  <span
                    className="w-3 h-3 rounded-full border shrink-0"
                    style={{
                      backgroundColor: canvasTheme.swatch,
                      borderColor: canvasTheme.swatchBorder,
                    }}
                  />
                  <span>Hiển thị</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {displayMenuOpen && (
                  <div
                    className={`absolute right-0 top-10 w-64 rounded-xl border shadow-[0_12px_32px_rgba(15,23,42,0.14)] p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3 ${
                      isDark
                        ? 'bg-[#1a1f29] border-slate-700 text-slate-200'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    {onChangeCanvasTheme && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Palette className="w-3 h-3" />
                          <span>Màu nền bảng vẽ</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(Object.keys(CANVAS_THEMES) as CanvasThemeId[]).map((tId) => {
                            const t = CANVAS_THEMES[tId];
                            const active = canvasTheme.id === tId;
                            return (
                              <button
                                key={tId}
                                type="button"
                                onClick={() => onChangeCanvasTheme(tId)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left text-xs font-medium transition-colors cursor-pointer ${
                                  active
                                    ? isDark
                                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                                      : 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                    : isDark
                                    ? 'border-slate-800 hover:bg-slate-800/80 text-slate-300'
                                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <span
                                  className="w-3.5 h-3.5 rounded-full border shrink-0"
                                  style={{ backgroundColor: t.swatch, borderColor: t.swatchBorder }}
                                />
                                <span className="truncate">{t.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Monitor className="w-3 h-3" />
                        <span>Bố cục thiết bị</span>
                      </div>
                      <div
                        className={`grid grid-cols-3 gap-1 p-1 rounded-lg ${
                          isDark ? 'bg-[#11151d]' : 'bg-slate-100'
                        }`}
                      >
                        {(['auto', 'desktop', 'mobile'] as DeviceMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => onChangeDeviceMode(mode)}
                            className={`py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                              devicePreference === mode
                                ? isDark
                                  ? 'bg-[#262d3c] text-white shadow-xs'
                                  : 'bg-white text-slate-900 shadow-xs'
                                : isDark
                                ? 'text-slate-400 hover:text-slate-200'
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            {mode === 'auto' ? 'Tự động' : mode === 'desktop' ? 'PC' : 'Mobile'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {onOpenAiSettings && (
                      <>
                        <div className={`border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />
                        <button
                          type="button"
                          onClick={() => {
                            setDisplayMenuOpen(false);
                            onOpenAiSettings();
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Settings className="w-3.5 h-3.5 text-slate-400" />
                            <span>Cấu hình AI &amp; Model</span>
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Mobile Controls */}
          <div className="relative flex items-center gap-1.5" ref={mobileMenuRef}>
            {isMobile && onToggleMainAi && (
              <button
                type="button"
                onClick={onToggleMainAi}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                  isMainAiOpen
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : pillBtnClass
                }`}
                title="Mở AI Agent & Ngữ cảnh"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI</span>
              </button>
            )}
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`p-2 rounded-xl border cursor-pointer ${pillBtnClass}`}
                title="Menu"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            )}

            {mobileMenuOpen && (
              <div className="absolute top-12 right-0 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1 text-xs">
                {onOpenAiSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenAiSettings();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 font-semibold transition-colors"
                  >
                    <Settings className="w-4 h-4 text-indigo-600" />
                    <span>Cấu hình AI & Xoay Model</span>
                  </button>
                )}

                {onToggleMoveMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onToggleMoveMode();
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
                      isMoveMode
                        ? 'bg-amber-50 text-amber-800 font-bold border border-amber-300'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <BoxSelect className="w-4 h-4 text-amber-500" />
                    <span>{isMoveMode ? 'Tắt khoanh vùng' : 'Khoanh vùng chuyển Map'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenSupabaseModal();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 hover:bg-emerald-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-600" />
                    <span>Đồng bộ Supabase Cloud</span>
                  </span>
                  {hasSupabaseConfigured && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenDriveModal();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 hover:bg-amber-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-amber-600" />
                    <span>Kho Google Drive</span>
                  </span>
                  {hasDriveConfigured && (
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleCopyMapLink();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-indigo-600" />
                    <span>Sao chép link Bản đồ</span>
                  </span>
                  {copiedMapLink && <span className="text-[10px] text-emerald-600">Đã chép</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onExportSingleMap(activeMap);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Xuất riêng Map này</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onExportBackup();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Sao lưu cả kho ({maps.length} Map)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    fileImportRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>Nhập file JSON sao lưu</span>
                </button>

                <div className="border-t border-slate-100 my-1 pt-1">
                  {onChangeCanvasTheme && (
                    <div className="mb-2">
                      <div className="px-3 py-1 text-[10px] uppercase font-semibold text-slate-400">
                        Chế độ màu nền
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 px-2 pt-1">
                        {(Object.keys(CANVAS_THEMES) as CanvasThemeId[]).map((tId) => {
                          const t = CANVAS_THEMES[tId];
                          const active = canvasTheme.id === tId;
                          return (
                            <button
                              key={tId}
                              type="button"
                              onClick={() => {
                                onChangeCanvasTheme(tId);
                                setMobileMenuOpen(false);
                              }}
                              title={t.name}
                              className={`flex flex-col items-center gap-1 py-1.5 rounded-lg border text-[10px] font-medium ${
                                active
                                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                  : 'border-slate-200 bg-white text-slate-600'
                              }`}
                            >
                              <span
                                className="w-4 h-4 rounded-full border"
                                style={{ backgroundColor: t.swatch, borderColor: t.swatchBorder }}
                              />
                              <span className="truncate max-w-full px-0.5">{t.name.split(' ')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="px-3 py-1 text-[10px] uppercase font-semibold text-slate-400">
                    Giao diện hiển thị
                  </div>
                  <div className="grid grid-cols-3 gap-1 px-1">
                    {(['auto', 'mobile', 'desktop'] as DeviceMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          onChangeDeviceMode(mode);
                          setMobileMenuOpen(false);
                        }}
                        className={`py-1 rounded-lg text-center font-medium capitalize text-[11px] ${
                          devicePreference === mode
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {mode === 'auto' ? 'Tự động' : mode === 'mobile' ? 'Mobile' : 'PC'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
