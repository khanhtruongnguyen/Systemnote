import { createClient, type SupabaseClient, type RealtimeChannel, type User } from '@supabase/supabase-js';
import type { MapData } from '../types';
import { StorageService } from './storage';
import { deleteMapImagesFromSupabase } from '../utils/imageHelper';

let supabaseClient: SupabaseClient | null = null;
let currentUrl = '';
let currentKey = '';

const ENV_URL = import.meta.env?.VITE_SUPABASE_URL || '';
const ENV_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

/**
 * Lấy hoặc khởi tạo Supabase Client
 */
export function getSupabase(customUrl?: string, customKey?: string): SupabaseClient | null {
  const settings = StorageService.getSettings();
  const url = (customUrl || settings.supabaseUrl || ENV_URL || '').trim();
  const key = (customKey || settings.supabaseAnonKey || ENV_KEY || '').trim();

  if (!url || !key) {
    return null;
  }

  if (supabaseClient && currentUrl === url && currentKey === key) {
    return supabaseClient;
  }

  try {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    currentUrl = url;
    currentKey = key;
    return supabaseClient;
  } catch (err) {
    console.error('[Supabase] Không thể khởi tạo client:', err);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabase());
}

/**
 * Kiểm tra kết nối tới Supabase Project
 */
export async function testSupabaseConnection(
  url: string,
  key: string
): Promise<{ success: boolean; message: string; user?: User | null }> {
  try {
    const client = createClient(url.trim(), key.trim());

    const { data: authData } = await client.auth.getUser();
    const user = authData?.user || null;

    const { error: dbError } = await client.from('maps').select('id').limit(1);

    if (dbError) {
      if (dbError.message?.includes('does not exist') || dbError.code === '42P01') {
        return {
          success: false,
          message:
            'Kết nối tới Supabase thành công, nhưng chưa tìm thấy bảng "maps". Vui lòng mở SQL Editor trên Supabase và chạy Script SQL ở tab bên cạnh.',
          user,
        };
      }
      return {
        success: false,
        message: `Lỗi truy vấn Database: ${dbError.message} (Mã: ${dbError.code})`,
        user,
      };
    }

    return {
      success: true,
      message: 'Kết nối thành công! Database và bảng "maps" đã sẵn sàng hoạt động.',
      user,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      success: false,
      message: error.message || 'Không thể kết nối đến URL Supabase.',
    };
  }
}

/**
 * Đồng bộ 1 Map lên Supabase (Upsert)
 */
export async function syncMapToSupabase(
  map: MapData
): Promise<{ success: boolean; updatedMap: MapData }> {
  const client = getSupabase();
  if (!client) return { success: false, updatedMap: map };

  try {
    const { data: authData } = await client.auth.getUser();
    const userId = authData?.user?.id || null;

    const cleanNodes = (map.nodes || []).map((node) => {
      const rawData = (node.data || {}) as Record<string, unknown>;
      const {
        attachments: _attachments,
        onNavigate: _onNavigate,
        onNodeClick: _onNodeClick,
        ...cleanData
      } = rawData;
      return {
        ...node,
        data: cleanData,
      };
    });

    const payload = {
      id: map.id,
      name: map.name,
      nodes: cleanNodes,
      edges: map.edges || [],
      context: typeof map.context === 'string' ? map.context : '',
      attachments: {},
      created_at: map.createdAt || Date.now(),
      updated_at: map.updatedAt || Date.now(),
      ...(userId ? { user_id: userId } : {}),
    };

    const { error } = await client.from('maps').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('[Supabase] Lỗi khi đồng bộ map:', error);
      return { success: false, updatedMap: map };
    }
    return { success: true, updatedMap: map };
  } catch (err) {
    console.error('[Supabase] syncMapToSupabase exception:', err);
    return { success: false, updatedMap: map };
  }
}

/**
 * Đồng bộ toàn bộ danh sách Map lên Supabase
 */
export async function syncAllMapsToSupabase(
  maps: MapData[]
): Promise<{ count: number; updatedMaps: MapData[]; error?: string }> {
  const client = getSupabase();
  if (!client) {
    return { count: 0, updatedMaps: maps, error: 'Chưa cấu hình Supabase URL & Anon Key.' };
  }

  try {
    let successCount = 0;
    const updatedMaps: MapData[] = [];

    for (const map of maps) {
      const res = await syncMapToSupabase(map);
      if (res.success) {
        successCount++;
      }
      updatedMaps.push(res.updatedMap);
    }

    return { count: successCount, updatedMaps };
  } catch (e: unknown) {
    const err = e as Error;
    return { count: 0, updatedMaps: maps, error: err.message };
  }
}

/**
 * Tải toàn bộ Map từ Supabase về máy
 */
export async function fetchAllMapsFromSupabase(): Promise<MapData[]> {
  const client = getSupabase();
  if (!client) return [];

  const { data, error } = await client
    .from('maps')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error || !data) {
    throw new Error(error?.message || 'Không thể tải dữ liệu từ Supabase.');
  }

  const parsed: MapData[] = data.map((row: Record<string, any>) => ({
    id: String(row.id),
    name: String(row.name || 'Bản đồ'),
    nodes: Array.isArray(row.nodes) ? row.nodes : [],
    edges: Array.isArray(row.edges) ? row.edges : [],
    context: typeof row.context === 'string' ? row.context : '',
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  }));

  return StorageService.cleanMapsData(parsed);
}

/**
 * Xóa hoàn toàn 1 bản đồ cùng toàn bộ ảnh trong bucket `note-images` khỏi Supabase
 */
export async function deleteMapAndImagesFromSupabase(
  mapId: string,
  mapData?: MapData,
  extraStoragePaths: string[] = []
): Promise<{ ok: boolean; deletedImages: number }> {
  const client = getSupabase();
  if (!client) return { ok: false, deletedImages: 0 };

  let deletedImages = 0;
  try {
    deletedImages = await deleteMapImagesFromSupabase(mapData || mapId, extraStoragePaths);
  } catch (imgErr) {
    console.warn('[Supabase] Lỗi khi dọn dẹp ảnh của bản đồ:', imgErr);
  }

  try {
    const { error } = await client.from('maps').delete().eq('id', mapId);
    return { ok: !error, deletedImages };
  } catch (err) {
    console.error('[Supabase] deleteMapFromSupabase error:', err);
    return { ok: false, deletedImages };
  }
}

/**
 * Xóa 1 bản đồ khỏi Supabase (bao gồm dọn ảnh đi kèm)
 */
export async function deleteMapFromSupabase(
  mapId: string,
  mapData?: MapData,
  extraStoragePaths: string[] = []
): Promise<boolean> {
  const res = await deleteMapAndImagesFromSupabase(mapId, mapData, extraStoragePaths);
  return res.ok;
}

/**
 * Đăng ký lắng nghe thay đổi thời gian thực (Realtime WebSocket)
 */
export function subscribeToRemoteMaps(
  onRemoteUpdate: (map: MapData) => void,
  onRemoteDelete: (mapId: string) => void
): (() => void) | null {
  const client = getSupabase();
  if (!client) return null;

  try {
    const channelName = `systemnote-maps-${Date.now()}`;
    const channel: RealtimeChannel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maps' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as Record<string, any> | null;
            if (row && row.id) {
              const rawMap: MapData = {
                id: String(row.id),
                name: String(row.name || 'Bản đồ'),
                nodes: Array.isArray(row.nodes) ? row.nodes : [],
                edges: Array.isArray(row.edges) ? row.edges : [],
                context: typeof row.context === 'string' ? row.context : '',
                createdAt: Number(row.created_at) || Date.now(),
                updatedAt: Number(row.updated_at) || Date.now(),
              };
              const cleaned = StorageService.cleanMapsData([rawMap])[0];
              if (cleaned) {
                onRemoteUpdate(cleaned);
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Record<string, any> | null;
            if (oldRow && oldRow.id) {
              onRemoteDelete(String(oldRow.id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  } catch (err) {
    console.warn('[Supabase Realtime] Lỗi đăng ký kênh Realtime:', err);
    return null;
  }
}

/**
 * Quản lý xác thực người dùng (Auth)
 */
export const SupabaseAuth = {
  async getCurrentUser(): Promise<User | null> {
    const client = getSupabase();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    return data?.user || null;
  },

  async signUp(email: string, password: string) {
    const client = getSupabase();
    if (!client) throw new Error('Chưa cấu hình Supabase.');
    const res = await client.auth.signUp({ email, password });
    if (res.error) throw res.error;
    return res.data;
  },

  async signIn(email: string, password: string) {
    const client = getSupabase();
    if (!client) throw new Error('Chưa cấu hình Supabase.');
    const res = await client.auth.signInWithPassword({ email, password });
    if (res.error) throw res.error;
    return res.data;
  },

  async signOut() {
    const client = getSupabase();
    if (!client) return;
    await client.auth.signOut();
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    const client = getSupabase();
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
    return () => data.subscription.unsubscribe();
  },
};
