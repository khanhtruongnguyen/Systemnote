import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  Key,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  Wifi,
  UploadCloud,
  DownloadCloud,
  Code2,
  Copy,
  Check,
  User as UserIcon,
  LogOut,
  Zap,
  Image as ImageIcon,
  Trash2,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import {
  testSupabaseConnection,
  syncAllMapsToSupabase,
  fetchAllMapsFromSupabase,
  SupabaseAuth,
} from '../services/supabase';
import {
  scanSupabaseNoteImages,
  removeSupabaseStoragePaths,
  formatBytes,
  type SupabaseStorageMapGroup,
  type SupabaseStorageScanResult,
} from '../utils/imageHelper';
import type { MapData, AppSettings } from '../types';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  maps: MapData[];
  onMapsLoaded: (maps: MapData[]) => void;
  settings: AppSettings;
  onSaveSettings: (updates: Partial<AppSettings>) => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({
  isOpen,
  onClose,
  maps,
  onMapsLoaded,
  settings,
  onSaveSettings,
}) => {
  const [url, setUrl] = useState(settings.supabaseUrl || '');
  const [anonKey, setAnonKey] = useState(settings.supabaseAnonKey || '');
  const [autoSync, setAutoSync] = useState(settings.supabaseAutoSync ?? true);
  const [realtime, setRealtime] = useState(settings.supabaseRealtime ?? true);

  const [activeTab, setActiveTab] = useState<'sync' | 'storage' | 'config' | 'sql'>('sync');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Storage image cleanup state
  const [scanningStorage, setScanningStorage] = useState(false);
  const [cleaningStorage, setCleaningStorage] = useState(false);
  const [storageScan, setStorageScan] = useState<SupabaseStorageScanResult | null>(null);
  const [confirmDeleteMapKey, setConfirmDeleteMapKey] = useState<string | null>(null);

  // Auth state
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(
    settings.supabaseUserEmail || null
  );
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authLoading, setAuthLoading] = useState(false);

  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    setUrl(settings.supabaseUrl || '');
    setAnonKey(settings.supabaseAnonKey || '');
    setAutoSync(settings.supabaseAutoSync ?? true);
    setRealtime(settings.supabaseRealtime ?? true);
  }, [settings.supabaseUrl, settings.supabaseAnonKey, settings.supabaseAutoSync, settings.supabaseRealtime]);

  useEffect(() => {
    if (isOpen && settings.supabaseUrl && settings.supabaseAnonKey) {
      SupabaseAuth.getCurrentUser().then((user) => {
        if (user?.email) {
          setCurrentUserEmail(user.email);
          onSaveSettings({ supabaseUserEmail: user.email });
        }
      });
    }
  }, [isOpen, settings.supabaseUrl, settings.supabaseAnonKey, onSaveSettings]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!url.trim() || !anonKey.trim()) {
      setTestResult({
        success: false,
        message: 'Vui lòng nhập đầy đủ Supabase Project URL và Anon Public Key.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    const res = await testSupabaseConnection(url.trim(), anonKey.trim());
    setTesting(false);
    setTestResult(res);

    if (res.success) {
      onSaveSettings({
        supabaseUrl: url.trim(),
        supabaseAnonKey: anonKey.trim(),
        supabaseAutoSync: autoSync,
        supabaseRealtime: realtime,
      });
      if (res.user?.email) {
        setCurrentUserEmail(res.user.email);
        onSaveSettings({ supabaseUserEmail: res.user.email });
      }
    }
  };

  const handlePushAll = async () => {
    setSyncing(true);
    setStatusMessage(null);

    try {
      const res = await syncAllMapsToSupabase(maps);
      if (res.error) {
        setStatusMessage({ type: 'error', text: `Lỗi đồng bộ: ${res.error}` });
      } else {
        if (res.updatedMaps && res.updatedMaps.length > 0) {
          onMapsLoaded(res.updatedMaps);
        }
        onSaveSettings({ lastCloudSyncedAt: Date.now() });
        setStatusMessage({
          type: 'success',
          text: `Đã đồng bộ thành công ${res.count}/${maps.length} bản đồ lên Supabase Cloud!`,
        });
      }
    } catch (e: unknown) {
      const err = e as Error;
      setStatusMessage({ type: 'error', text: err.message || 'Lỗi khi tải lên Supabase.' });
    } finally {
      setSyncing(false);
    }
  };

  const handlePullAll = async () => {
    setSyncing(true);
    setStatusMessage(null);

    try {
      const remoteMaps = await fetchAllMapsFromSupabase();
      if (remoteMaps.length === 0) {
        setStatusMessage({
          type: 'success',
          text: 'Kết nối thành công nhưng chưa có bản đồ nào trên Supabase. Hãy bấm "Đẩy lên Cloud" trước!',
        });
      } else {
        onMapsLoaded(remoteMaps);
        onSaveSettings({ lastCloudSyncedAt: Date.now() });
        setStatusMessage({
          type: 'success',
          text: `Đã tải về thành công ${remoteMaps.length} bản đồ từ Supabase!`,
        });
      }
    } catch (e: unknown) {
      const err = e as Error;
      setStatusMessage({
        type: 'error',
        text: err.message || 'Không thể tải dữ liệu từ Supabase.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPass.trim()) return;

    setAuthLoading(true);
    setStatusMessage(null);

    try {
      if (authMode === 'signin') {
        const res = await SupabaseAuth.signIn(authEmail.trim(), authPass.trim());
        const email = res.user?.email || authEmail.trim();
        setCurrentUserEmail(email);
        onSaveSettings({ supabaseUserEmail: email });
        setStatusMessage({ type: 'success', text: `Đăng nhập thành công: ${email}` });
      } else {
        const res = await SupabaseAuth.signUp(authEmail.trim(), authPass.trim());
        setStatusMessage({
          type: 'success',
          text: `Đã đăng ký tài khoản! ${
            res.session ? 'Đã tự động đăng nhập.' : 'Vui lòng kiểm tra email xác nhận (nếu có).'
          }`,
        });
        if (res.user?.email) {
          setCurrentUserEmail(res.user.email);
          onSaveSettings({ supabaseUserEmail: res.user.email });
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      setStatusMessage({ type: 'error', text: error.message || 'Lỗi đăng nhập/đăng ký.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await SupabaseAuth.signOut();
    setCurrentUserEmail(null);
    onSaveSettings({ supabaseUserEmail: undefined });
    setStatusMessage({ type: 'success', text: 'Đã đăng xuất khỏi Supabase.' });
  };

  const handleScanStorageImages = async () => {
    setScanningStorage(true);
    setConfirmDeleteMapKey(null);
    setStatusMessage(null);

    try {
      let remoteMaps: MapData[] = [];
      let remoteChecked = false;
      try {
        remoteMaps = await fetchAllMapsFromSupabase();
        remoteChecked = true;
      } catch {
        remoteChecked = false;
      }

      const scanRes = await scanSupabaseNoteImages({
        localMaps: maps,
        remoteMaps,
        remoteChecked,
      });
      setStorageScan(scanRes);
    } catch (e: unknown) {
      const err = e as Error;
      setStatusMessage({
        type: 'error',
        text: err.message || 'Không thể quét danh sách ảnh trên Supabase Storage.',
      });
    } finally {
      setScanningStorage(false);
    }
  };

  const handleCleanupPaths = async (paths: string[], successLabel: string) => {
    if (paths.length === 0) return;
    setCleaningStorage(true);
    setStatusMessage(null);

    try {
      const removed = await removeSupabaseStoragePaths(paths);
      setConfirmDeleteMapKey(null);
      await handleScanStorageImages();
      setStatusMessage({
        type: 'success',
        text: `Đã xóa ${removed} ảnh khỏi Supabase Storage (${successLabel}).`,
      });
    } catch (e: unknown) {
      const err = e as Error;
      setStatusMessage({
        type: 'error',
        text: err.message || 'Không thể xóa ảnh trên Supabase Storage.',
      });
    } finally {
      setCleaningStorage(false);
    }
  };

  const handleCleanAllOrphans = () => {
    if (!storageScan) return;
    const allOrphans = storageScan.groups.flatMap((g) => g.orphanPaths);
    void handleCleanupPaths(allOrphans, 'ảnh thừa & bản đồ đã xóa');
  };

  const handleCleanMapOrphans = (group: SupabaseStorageMapGroup) => {
    void handleCleanupPaths(group.orphanPaths, `ảnh thừa của "${group.mapName}"`);
  };

  const handleDeleteAllMapImages = (group: SupabaseStorageMapGroup) => {
    void handleCleanupPaths(group.allPaths, `toàn bộ ảnh của "${group.mapName}"`);
  };

  const copySqlToClipboard = () => {
    const sqlCode = `-- Bảng lưu trữ Bản Đồ (Maps)
create table if not exists public.maps (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  context text default '',
  attachments jsonb default '{}'::jsonb,
  created_at bigint not null,
  updated_at bigint not null
);

alter table public.maps enable row level security;

drop policy if exists "Users can access their own maps" on public.maps;
create policy "Users can access their own maps" on public.maps
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

begin;
  do $$
  begin
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'maps'
    ) then
      alter publication supabase_realtime add table public.maps;
    end if;
  end $$;
commit;

-- Tạo Storage Bucket 'note-images' để lưu ảnh nhẹ (WebP)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  true,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif'];

drop policy if exists "Public read note-images" on storage.objects;
create policy "Public read note-images" on storage.objects
  for select using (bucket_id = 'note-images');

drop policy if exists "Users can upload note-images" on storage.objects;
create policy "Users can upload note-images" on storage.objects
  for insert with check (bucket_id = 'note-images');

drop policy if exists "Users can update note-images" on storage.objects;
create policy "Users can update note-images" on storage.objects
  for update using (bucket_id = 'note-images')
  with check (bucket_id = 'note-images');

drop policy if exists "Users can delete note-images" on storage.objects;
create policy "Users can delete note-images" on storage.objects
  for delete using (bucket_id = 'note-images');`;
    navigator.clipboard.writeText(sqlCode);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const isConfigured = Boolean(settings.supabaseUrl && settings.supabaseAnonKey);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[10000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">Đồng bộ Supabase Cloud</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-600" />
                  <span>Realtime Sync</span>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Đồng bộ tức thì sơ đồ & ghi chú 2 chiều giữa các thiết bị
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

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sync'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Đồng bộ & Trạng thái</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('storage');
              if (isConfigured && !storageScan && !scanningStorage) {
                void handleScanStorageImages();
              }
            }}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'storage'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Dọn ảnh Storage</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'config'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Kết nối API</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sql'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Script SQL (1-Click)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* TAB 1: SYNC & STATUS */}
          {activeTab === 'sync' && (
            <div className="space-y-4">
              {/* Connection Status Card */}
              <div className="p-4 rounded-xl border bg-slate-50 border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isConfigured
                        ? 'bg-emerald-500 shadow-sm shadow-emerald-400 animate-pulse'
                        : 'bg-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-semibold text-slate-800">
                      {isConfigured ? 'Đã kết nối Supabase Project' : 'Chưa thiết lập kết nối'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {currentUserEmail
                        ? `Đăng nhập: ${currentUserEmail}`
                        : isConfigured
                        ? 'Chế độ Anonymous Public Key'
                        : 'Vào tab Kết nối API để cấu hình'}
                    </div>
                  </div>
                </div>

                {isConfigured && (
                  <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-mono bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    <Wifi className="w-3 h-3" />
                    <span>Realtime Sẵn sàng</span>
                  </div>
                )}
              </div>

              {/* Sync Actions Grid */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handlePushAll}
                  disabled={syncing || !isConfigured}
                  className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex flex-col items-center gap-2 group cursor-pointer"
                >
                  <UploadCloud className="w-6 h-6 text-emerald-600 group-hover:scale-110 transition-transform" />
                  <div className="text-center">
                    <div className="text-xs font-bold text-slate-800">Đẩy lên Cloud (Push All)</div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">
                      Lưu trữ {maps.length} bản đồ lên máy chủ
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handlePullAll}
                  disabled={syncing || !isConfigured}
                  className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 text-indigo-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex flex-col items-center gap-2 group cursor-pointer"
                >
                  <DownloadCloud className="w-6 h-6 text-indigo-600 group-hover:scale-110 transition-transform" />
                  <div className="text-center">
                    <div className="text-xs font-bold text-slate-800">Kéo về máy (Pull All)</div>
                    <div className="text-[10px] text-indigo-700 mt-0.5">
                      Đồng bộ về IndexedDB trên máy này
                    </div>
                  </div>
                </button>
              </div>

              {/* Realtime & Auto-Sync Settings */}
              <div className="p-3.5 rounded-xl border bg-slate-50 border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Cấu hình tự động
                </div>

                <label className="flex items-center justify-between cursor-pointer">
                  <div className="space-y-0.5 pr-3">
                    <div className="text-xs font-semibold text-slate-800">
                      Tự động đồng bộ khi sửa (Auto-sync)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Tự động gửi cập nhật khi thêm ô, nối dây hoặc sửa ghi chú
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => {
                      setAutoSync(e.target.checked);
                      onSaveSettings({ supabaseAutoSync: e.target.checked });
                    }}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-slate-200">
                  <div className="space-y-0.5 pr-3">
                    <div className="text-xs font-semibold text-slate-800">
                      Kênh Realtime WebSocket tức thì
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Điện thoại và máy tính tự động nhận thay đổi tức thì
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={realtime}
                    onChange={(e) => {
                      setRealtime(e.target.checked);
                      onSaveSettings({ supabaseRealtime: e.target.checked });
                    }}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                </label>
              </div>

              {/* User Account / Auth Section */}
              <div className="p-3.5 rounded-xl border bg-slate-50 border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tài khoản người dùng (Tùy chọn)</span>
                  </div>
                  {currentUserEmail && (
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="text-[11px] text-rose-600 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Đăng xuất</span>
                    </button>
                  )}
                </div>

                {currentUserEmail ? (
                  <div className="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                    Đang đăng nhập với email: <strong>{currentUserEmail}</strong>. Toàn bộ bản đồ của
                    bạn được bảo vệ qua Supabase Row Level Security (RLS).
                  </div>
                ) : (
                  <form onSubmit={handleAuthSubmit} className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="email"
                        placeholder="Email cá nhân..."
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500 font-sans"
                      />
                      <input
                        type="password"
                        placeholder="Mật khẩu..."
                        value={authPass}
                        onChange={(e) => setAuthPass(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500 font-sans"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setAuthMode('signin')}
                          className={`cursor-pointer ${
                            authMode === 'signin'
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Đăng nhập
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setAuthMode('signup')}
                          className={`cursor-pointer ${
                            authMode === 'signup'
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Tạo tài khoản mới
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={authLoading || !isConfigured}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors"
                      >
                        {authLoading
                          ? 'Đang xử lý...'
                          : authMode === 'signin'
                          ? 'Đăng nhập'
                          : 'Đăng ký'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: STORAGE IMAGE CLEANUP */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border bg-slate-50 border-slate-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-800">
                    Quản lý & dọn dẹp ảnh trên bucket <code className="font-mono text-emerald-700">note-images</code>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Quét ảnh không còn dùng trong ghi chú (đã gỡ ảnh/xóa ô/xóa map) để giải phóng dung lượng Supabase.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleScanStorageImages()}
                  disabled={!isConfigured || scanningStorage || cleaningStorage}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanningStorage ? 'animate-spin' : ''}`} />
                  <span>{scanningStorage ? 'Đang quét...' : 'Quét lại'}</span>
                </button>
              </div>

              {!isConfigured && (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
                  Hãy cấu hình Supabase Project URL & Anon Key ở tab <strong>Kết nối API</strong> trước khi quét ảnh.
                </div>
              )}

              {isConfigured && storageScan && (
                <>
                  {/* Tổng quan dung lượng */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-xl border border-slate-200 bg-white">
                      <div className="text-[11px] text-slate-500">Tổng ảnh Cloud</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">
                        {storageScan.totalFiles} file
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {formatBytes(storageScan.totalBytes)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-white">
                      <div className="text-[11px] text-slate-500">Ảnh thừa / Đã xóa</div>
                      <div className="text-sm font-bold text-amber-600 mt-0.5">
                        {storageScan.totalOrphanFiles} file
                      </div>
                      <div className="text-[11px] text-amber-700 font-mono">
                        {formatBytes(storageScan.totalOrphanBytes)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-white">
                      <div className="text-[11px] text-slate-500">Đối chiếu Cloud DB</div>
                      <div className="text-xs font-semibold text-slate-800 mt-1">
                        {storageScan.remoteChecked ? 'Local + Cloud' : 'Chỉ Local'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {storageScan.groups.length} thư mục map
                      </div>
                    </div>
                  </div>

                  {/* Nút dọn nhanh toàn bộ ảnh thừa */}
                  {storageScan.totalOrphanFiles > 0 && (
                    <button
                      type="button"
                      onClick={handleCleanAllOrphans}
                      disabled={cleaningStorage || scanningStorage}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {cleaningStorage
                          ? 'Đang dọn dẹp...'
                          : `Dọn nhanh ${storageScan.totalOrphanFiles} ảnh thừa (${formatBytes(storageScan.totalOrphanBytes)}) — Giữ nguyên ảnh đang dùng`}
                      </span>
                    </button>
                  )}

                  {/* Danh sách từng map */}
                  {storageScan.groups.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                      Bucket <code className="font-mono">note-images</code> hiện chưa có file ảnh nào.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {storageScan.groups.map((group) => {
                        const isConfirmingFullDelete = confirmDeleteMapKey === group.folderKey;
                        return (
                          <div
                            key={group.folderKey}
                            className="p-3 rounded-xl border border-slate-200 bg-white space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-800 truncate">
                                    {group.mapName}
                                  </span>
                                  {group.isDeletedMap && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                      Map đã xóa
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span>
                                    Tổng: <strong>{group.totalFiles}</strong> ảnh ({formatBytes(group.totalBytes)})
                                  </span>
                                  <span>·</span>
                                  <span className="text-emerald-700">
                                    Đang dùng: <strong>{group.activeFiles}</strong>
                                  </span>
                                  <span>·</span>
                                  <span className={group.orphanFiles > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}>
                                    Ảnh thừa: {group.orphanFiles}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {group.orphanFiles > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleCleanMapOrphans(group)}
                                    disabled={cleaningStorage || scanningStorage}
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40"
                                  >
                                    Dọn {group.orphanFiles} thừa
                                  </button>
                                )}

                                {!group.isDeletedMap && !isConfirmingFullDelete && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteMapKey(group.folderKey)}
                                    disabled={cleaningStorage || scanningStorage}
                                    title="Xóa toàn bộ ảnh của bản đồ này trên Supabase Storage"
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {isConfirmingFullDelete && (
                              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 text-[11px] text-rose-800">
                                <div className="flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                                  <span>
                                    Xóa cả <strong>{group.totalFiles} ảnh</strong> của map này? Ảnh trong ghi chú sẽ không tải được nữa nếu chưa backup Drive/JSON.
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteMapKey(null)}
                                    className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 font-medium cursor-pointer"
                                  >
                                    Hủy
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAllMapImages(group)}
                                    disabled={cleaningStorage}
                                    className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                                  >
                                    Xóa hết
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 3: CONFIG API KEYS */}
          {activeTab === 'config' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Supabase Project URL</span>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-emerald-600 hover:underline flex items-center gap-1 font-normal lowercase"
                  >
                    <span>Lấy tại supabase.com</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 font-mono transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Supabase Anon Public API Key
                </label>
                <input
                  type="password"
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 font-mono transition-colors"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Key công khai dùng ở phía Client (được giới hạn bởi chính sách RLS trên Supabase).
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  {testing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{testing ? 'Đang kiểm tra kết nối...' : 'Lưu & Kiểm tra kết nối'}</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-3.5 rounded-xl text-xs leading-relaxed ${
                    testResult.success
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-700'
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SQL SCHEMA GUIDE */}
          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Script khởi tạo bảng (Chạy 1 lần)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Vào Supabase Dashboard → mục <strong>SQL Editor</strong> → Dán và bấm{' '}
                    <strong>Run</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copySqlToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors shrink-0"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Đã sao chép!' : 'Copy Script SQL'}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-100 font-mono overflow-x-auto max-h-60 leading-relaxed select-text">
{`-- 1. Bảng lưu trữ Bản Đồ (Maps)
create table if not exists public.maps (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  context text default '',
  attachments jsonb default '{}'::jsonb,
  created_at bigint not null,
  updated_at bigint not null
);

-- 2. Kích hoạt RLS & Realtime
alter table public.maps enable row level security;

drop policy if exists "Users can access their own maps" on public.maps;
create policy "Users can access their own maps" on public.maps
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

begin;
  do $$
  begin
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'maps'
    ) then
      alter publication supabase_realtime add table public.maps;
    end if;
  end $$;
commit;

-- 3. Storage Bucket 'note-images' lưu ảnh nhẹ (WebP)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  true,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif'];

drop policy if exists "Public read note-images" on storage.objects;
create policy "Public read note-images" on storage.objects
  for select using (bucket_id = 'note-images');

drop policy if exists "Users can upload note-images" on storage.objects;
create policy "Users can upload note-images" on storage.objects
  for insert with check (bucket_id = 'note-images');

drop policy if exists "Users can update note-images" on storage.objects;
create policy "Users can update note-images" on storage.objects
  for update using (bucket_id = 'note-images')
  with check (bucket_id = 'note-images');

drop policy if exists "Users can delete note-images" on storage.objects;
create policy "Users can delete note-images" on storage.objects
  for delete using (bucket_id = 'note-images');`}
                </pre>
              </div>

              <p className="text-[11px] text-slate-500 leading-normal">
                File <code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded font-mono">supabase_schema.sql</code>{' '}
                đầy đủ cũng đã được lưu sẵn trong thư mục gốc của dự án.
              </p>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs leading-relaxed ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-700'
              }`}
            >
              {statusMessage.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200">
          <div className="text-[11px] text-slate-500">
            {settings.lastCloudSyncedAt ? (
              <span>
                Đồng bộ gần nhất: {new Date(settings.lastCloudSyncedAt).toLocaleTimeString()}
              </span>
            ) : (
              <span>Chưa đồng bộ lên Cloud</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
