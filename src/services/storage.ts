import type { MapData, AppSettings, SingleMapExportPayload, ImportDataResult } from '../types';
import { openDB, idbGetAllMaps, idbSaveAllMaps } from './db';
import { buildKatexFrameInnerHtml, escapeHtml, renderKatexCode } from '../utils/katexHelper';

const STORAGE_MAPS_KEY = 'systemnote_maps_v1';
const STORAGE_SETTINGS_KEY = 'systemnote_settings_v1';
const MIGRATED_FLAG = 'systemnote_migrated_idb_v1';

const starterKatexTaylor = buildKatexFrameInnerHtml(
  'f(x) = \\sum_{k=0}^n \\frac{f^{(k)}(a)}{k!} (x-a)^k + R_n(x)',
  'block',
  'Công thức Taylor'
);

const starterKatexMixed = buildKatexFrameInnerHtml(
  'Cho hàm $f(x)$ liên tục trên $[a, b]$ và có nguyên hàm $F(x)$:\n$$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$$\nNhấn vào khung này bất kỳ lúc nào để chỉnh sửa mã KaTeX.',
  'mixed',
  'Khung Mã & KaTeX mẫu'
);

export const DEFAULT_STARTER_MAP: MapData = {
  id: 'starter-systemnote-1',
  name: 'Sơ Đồ Kiến Thức Mẫu',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  nodes: [
    {
      id: 'node-center',
      type: 'mindmap',
      position: { x: 400, y: 240 },
      data: {
        label: 'Trung Tâm Kiến Thức',
        color: 'indigo',
        shape: 'pill',
        content:
          `<h2>Chào mừng đến với SystemNote!</h2>` +
          `<p>Đây là không gian ghi chú dạng <strong>Sơ đồ tư duy</strong> kết hợp trình soạn thảo trực quan giao diện sáng.</p>` +
          `<ul>` +
            `<li><strong>Nhấp đúp chuột</strong> vào khoảng trống để tạo ô ghi chú mới.</li>` +
            `<li><strong>Kéo từ chấm tròn</strong> ở 4 cạnh của ô sang ô khác để tạo đường nối liên kết.</li>` +
            `<li>Bấm nút <strong>Chỉnh sửa</strong> để mở tờ giấy soạn thảo có Zoom, bảng màu, danh sách và thụt lề (<code>Tab</code> / <code>Shift + Tab</code>).</li>` +
            `<li>Thử bấm link nội bộ tới ô: <a href="node:node-taylor" class="sn-internal-link" data-node-id="node-taylor">Khai Triển Taylor &amp; Maclaurin</a> hoặc <a href="node:node-integral" class="sn-internal-link" data-node-id="node-integral">Tích Phân Xác Định</a>.</li>` +
          `</ul>` +
          `<div class="sn-katex-frame" data-mode="mixed" data-title="${escapeHtml('Khung Mã & KaTeX mẫu')}" data-code="${escapeHtml('Cho hàm $f(x)$ liên tục trên $[a, b]$ và có nguyên hàm $F(x)$:\n$$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$$\nNhấn vào khung này bất kỳ lúc nào để chỉnh sửa mã KaTeX.')}" contenteditable="false">${starterKatexMixed}</div>`,
      },
    },
    {
      id: 'node-taylor',
      type: 'mindmap',
      position: { x: 780, y: 120 },
      data: {
        label: 'Khai Triển Taylor & Maclaurin',
        color: 'rose',
        shape: 'pill',
        content:
          `<h3>Công Thức Khai Triển Taylor</h3>` +
          `<p>Giả sử hàm số <span class="sn-katex-inline" data-code="f(x)" contenteditable="false">${renderKatexCode('f(x)', 'inline')}</span> có đạo hàm đến cấp n+1 tại lân cận điểm <span class="sn-katex-inline" data-code="x_0 = a" contenteditable="false">${renderKatexCode('x_0 = a', 'inline')}</span>:</p>` +
          `<div class="sn-katex-frame" data-mode="block" data-title="${escapeHtml('Công thức Taylor')}" data-code="${escapeHtml('f(x) = \\sum_{k=0}^n \\frac{f^{(k)}(a)}{k!} (x-a)^k + R_n(x)')}" contenteditable="false">${starterKatexTaylor}</div>` +
          `<p>Quay lại: <a href="node:node-center" class="sn-internal-link" data-node-id="node-center">Trung Tâm Kiến Thức</a></p>`,
      },
    },
    {
      id: 'node-integral',
      type: 'mindmap',
      position: { x: 780, y: 340 },
      data: {
        label: 'Tích Phân Xác Định',
        color: 'cyan',
        shape: 'card',
        content:
          `<h3>Công thức Newton - Leibniz</h3>` +
          `<p>Liên hệ giữa đạo hàm và tích phân trên đoạn [a, b].</p>` +
          `<p>Xem thêm: <a href="https://vi.wikipedia.org/wiki/T%C3%ADch_ph%C3%A2n" target="_blank" rel="noopener noreferrer" class="sn-external-link">Tài liệu Wikipedia</a></p>`,
      },
    },
    {
      id: 'node-guide',
      type: 'mindmap',
      position: { x: 60, y: 240 },
      data: {
        label: 'Mẹo Liên Kết & Sơ Đồ',
        color: 'emerald',
        shape: 'pill',
        content:
          `<h3>Quản lý liên kết nhanh</h3>` +
          `<ul>` +
            `<li>Dùng nút <strong>Nối các ô</strong> trên thanh công cụ nếu muốn nối 2 ô mà không cần kéo dây.</li>` +
            `<li>Trong trình soạn thảo, dùng nút <strong>Chèn Link</strong> để trỏ tới ô khác trong cùng tab hoặc link web ngoài.</li>` +
            `<li>Bấm <strong>Xếp cây</strong> để tự động căn chỉnh sơ đồ ngay ngắn.</li>` +
          `</ul>`,
      },
    },
  ],
  edges: [
    {
      id: 'e-center-taylor',
      source: 'node-center',
      target: 'node-taylor',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'custom',
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    },
    {
      id: 'e-center-integral',
      source: 'node-center',
      target: 'node-integral',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'custom',
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    },
    {
      id: 'e-guide-center',
      source: 'node-guide',
      target: 'node-center',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'custom',
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    },
  ],
};

export const StorageService = {
  cleanMapsData(maps: MapData[]): MapData[] {
    if (!Array.isArray(maps)) return [];
    try {
      const pureMaps: MapData[] = JSON.parse(JSON.stringify(maps));
      return pureMaps.map((map) => ({
        id: map.id,
        name: map.name,
        context: typeof map.context === 'string' ? map.context : '',
        createdAt: map.createdAt || Date.now(),
        updatedAt: map.updatedAt || Date.now(),
        nodes: (map.nodes || []).map((node) => {
          const rawData = { ...((node.data || {}) as Record<string, unknown>) };
          delete rawData.onNavigate;
          delete rawData.onNodeClick;
          delete rawData.attachments;
          delete rawData.attachmentCaptions;
          return {
            ...node,
            data: {
              label: String(rawData.label || 'Ghi chú'),
              color: (rawData.color as any) || 'indigo',
              shape: (rawData.shape as any) || 'pill',
              content: String(rawData.content || ''),
              updatedAt: rawData.updatedAt as number | undefined,
            },
          };
        }),
        edges: (map.edges || []).map((edge) => {
          const rawEdgeData = { ...((edge.data || {}) as Record<string, unknown>) };
          delete rawEdgeData.onDelete;
          return {
            ...edge,
            type: 'custom',
            data: rawEdgeData,
          };
        }),
      }));
    } catch (e) {
      console.error('Error in cleanMapsData:', e);
      return maps;
    }
  },

  async init(): Promise<void> {
    try {
      await openDB();
      const existingMaps = await idbGetAllMaps();
      if (!existingMaps || existingMaps.length === 0) {
        const localData = localStorage.getItem(STORAGE_MAPS_KEY);
        if (localData) {
          try {
            const parsed = JSON.parse(localData);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const cleaned = this.cleanMapsData(parsed);
              await idbSaveAllMaps(cleaned);
            } else {
              await idbSaveAllMaps([DEFAULT_STARTER_MAP]);
            }
          } catch {
            await idbSaveAllMaps([DEFAULT_STARTER_MAP]);
          }
        } else {
          await idbSaveAllMaps([DEFAULT_STARTER_MAP]);
        }
        localStorage.setItem(MIGRATED_FLAG, 'true');
      }
    } catch (e) {
      console.error('StorageService.init error:', e);
    }
  },

  async getMaps(): Promise<MapData[]> {
    try {
      const fromDb = await idbGetAllMaps();
      const localData = localStorage.getItem(STORAGE_MAPS_KEY);
      let localMaps: MapData[] | null = null;
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localMaps = this.cleanMapsData(parsed);
          }
        } catch {
          // ignore
        }
      }

      if (fromDb && fromDb.length > 0 && localMaps && localMaps.length > 0) {
        const dbLatest = Math.max(...fromDb.map((m) => m.updatedAt || 0));
        const localLatest = Math.max(...localMaps.map((m) => m.updatedAt || 0));
        if (localLatest > dbLatest) {
          await idbSaveAllMaps(localMaps);
          return localMaps;
        }
        return this.cleanMapsData(fromDb);
      }

      if (fromDb && fromDb.length > 0) {
        return this.cleanMapsData(fromDb);
      }

      if (localMaps && localMaps.length > 0) {
        await idbSaveAllMaps(localMaps);
        return localMaps;
      }

      return [DEFAULT_STARTER_MAP];
    } catch (e) {
      console.error('Lỗi khi nạp bản đồ:', e);
      return [DEFAULT_STARTER_MAP];
    }
  },

  async saveMaps(maps: MapData[]): Promise<void> {
    try {
      const cleaned = this.cleanMapsData(maps);
      try {
        localStorage.setItem(STORAGE_MAPS_KEY, JSON.stringify(cleaned));
      } catch {
        // ignore quota error
      }
      await idbSaveAllMaps(cleaned);
    } catch (e) {
      console.error('Lỗi khi lưu bản đồ:', e);
    }
  },

  getSettings(): AppSettings {
    try {
      const data = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (!data) {
        return {
          activeMapId: DEFAULT_STARTER_MAP.id,
          supabaseAutoSync: true,
          supabaseRealtime: true,
        };
      }
      const parsed = JSON.parse(data);
      return {
        supabaseAutoSync: true,
        supabaseRealtime: true,
        ...parsed,
        activeMapId: parsed.activeMapId || DEFAULT_STARTER_MAP.id,
      };
    } catch {
      return {
        activeMapId: DEFAULT_STARTER_MAP.id,
        supabaseAutoSync: true,
        supabaseRealtime: true,
      };
    }
  },

  saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  exportBackup(maps: MapData[]): void {
    const cleaned = this.cleanMapsData(maps);
    const jsonStr = JSON.stringify(cleaned, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `systemnote_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  exportSingleMap(map: MapData): void {
    const cleaned = this.cleanMapsData([map])[0];
    const payload: SingleMapExportPayload = {
      version: 1,
      type: 'systemnote_single_map',
      exportedAt: Date.now(),
      source: 'web',
      map: cleaned,
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeName = (map.name || 'map').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}_systemnote.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  parseImportData(rawJson: unknown): ImportDataResult {
    let data = rawJson;
    if (typeof rawJson === 'string') {
      data = JSON.parse(rawJson);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Dữ liệu file không hợp lệ.');
    }

    const obj = data as Record<string, unknown>;
    if (
      (obj.type === 'systemnote_single_map' || obj.type === 'mindnote_single_map') &&
      obj.map
    ) {
      const cleaned = this.cleanMapsData([obj.map as MapData])[0];
      return { type: 'single_map', map: cleaned };
    }

    if (!Array.isArray(data) && obj.id && obj.name && Array.isArray(obj.nodes)) {
      const cleaned = this.cleanMapsData([obj as unknown as MapData])[0];
      return { type: 'single_map', map: cleaned };
    }

    if (Array.isArray(data)) {
      const cleaned = this.cleanMapsData(data as MapData[]);
      if (cleaned.length === 0) {
        throw new Error('File không chứa bản đồ nào.');
      }
      if (cleaned.length === 1) {
        return { type: 'single_map', map: cleaned[0] };
      }
      return { type: 'multi_maps', maps: cleaned };
    }

    throw new Error('Định dạng file JSON không phù hợp với SystemNote.');
  },

  importBackup(file: File): Promise<ImportDataResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const result = this.parseImportData(content);
          resolve(result);
        } catch (err: unknown) {
          reject(new Error((err as Error)?.message || 'Không thể đọc file JSON.'));
        }
      };
      reader.onerror = () => reject(new Error('Lỗi khi đọc file từ thiết bị.'));
      reader.readAsText(file);
    });
  },
};
