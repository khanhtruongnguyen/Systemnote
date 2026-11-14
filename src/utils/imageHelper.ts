import { getSupabase } from '../services/supabase';
import type { MapData } from '../types';

export const NOTE_IMAGES_BUCKET = 'note-images';
const DEFAULT_MAX_DIMENSION = 2200;
const DEFAULT_WEBP_QUALITY = 0.92;

export interface CompressedImageResult {
  blob: Blob;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export interface UploadedImageResult {
  url: string;
  path: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export interface SupabaseStorageMapGroup {
  folderKey: string;
  mapId: string;
  mapName: string;
  isDeletedMap: boolean;
  totalFiles: number;
  totalBytes: number;
  activeFiles: number;
  orphanFiles: number;
  orphanBytes: number;
  allPaths: string[];
  orphanPaths: string[];
}

export interface SupabaseStorageScanResult {
  groups: SupabaseStorageMapGroup[];
  totalFiles: number;
  totalBytes: number;
  totalOrphanFiles: number;
  totalOrphanBytes: number;
  remoteChecked: boolean;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể đọc dữ liệu ảnh.'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/**
 * Thu gọn nhẹ kích thước (tối đa 2200px) và nén ảnh sang WebP chất lượng cao (0.92) phía client
 * để giữ ảnh sắc nét mà vẫn tiết kiệm dung lượng trước khi đẩy lên Supabase Storage.
 */
export async function compressImageToWebP(
  file: Blob,
  options?: { maxDimension?: number; quality?: number }
): Promise<CompressedImageResult> {
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options?.quality ?? DEFAULT_WEBP_QUALITY;
  const originalSize = file.size;

  // Giữ nguyên ảnh GIF nhỏ (tránh mất chuyển động) hoặc SVG vector nhỏ
  if ((file.type === 'image/gif' || file.type === 'image/svg+xml') && originalSize <= 1024 * 1024) {
    return {
      blob: file,
      mimeType: file.type,
      extension: file.type === 'image/gif' ? 'gif' : 'svg',
      width: 0,
      height: 0,
      originalSize,
      compressedSize: originalSize,
    };
  }

  const img = await loadImageElement(file);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  if (!srcWidth || !srcHeight) {
    throw new Error('Kích thước ảnh không hợp lệ.');
  }

  let targetWidth = srcWidth;
  let targetHeight = srcHeight;
  const longestSide = Math.max(srcWidth, srcHeight);
  if (longestSide > maxDimension) {
    const scale = maxDimension / longestSide;
    targetWidth = Math.max(1, Math.round(srcWidth * scale));
    targetHeight = Math.max(1, Math.round(srcHeight * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Trình duyệt không hỗ trợ Canvas 2D để nén ảnh.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Ưu tiên WebP (nhẹ nhất và hỗ trợ nền trong suốt)
  let outBlob = await canvasToBlob(canvas, 'image/webp', quality);
  let outMime = 'image/webp';
  let outExt = 'webp';

  // Fallback sang JPEG nếu trình duyệt không xuất được WebP
  if (!outBlob || outBlob.type !== 'image/webp') {
    const jpegCanvas = document.createElement('canvas');
    jpegCanvas.width = targetWidth;
    jpegCanvas.height = targetHeight;
    const jpegCtx = jpegCanvas.getContext('2d');
    if (jpegCtx) {
      jpegCtx.fillStyle = '#ffffff';
      jpegCtx.fillRect(0, 0, targetWidth, targetHeight);
      jpegCtx.drawImage(img, 0, 0, targetWidth, targetHeight);
      outBlob = await canvasToBlob(jpegCanvas, 'image/jpeg', quality);
      outMime = 'image/jpeg';
      outExt = 'jpg';
    }
  }

  if (!outBlob) {
    throw new Error('Không thể nén ảnh.');
  }

  // Nếu ảnh gốc đã nhỏ hơn bản nén (ví dụ ảnh WebP/PNG nhỏ tối ưu sẵn) và không bị quá khổ
  if (
    outBlob.size >= originalSize &&
    longestSide <= maxDimension &&
    (file.type === 'image/webp' || file.type === 'image/jpeg' || file.type === 'image/png')
  ) {
    const extMap: Record<string, string> = {
      'image/webp': 'webp',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    };
    return {
      blob: file,
      mimeType: file.type,
      extension: extMap[file.type] || 'webp',
      width: srcWidth,
      height: srcHeight,
      originalSize,
      compressedSize: originalSize,
    };
  }

  return {
    blob: outBlob,
    mimeType: outMime,
    extension: outExt,
    width: targetWidth,
    height: targetHeight,
    originalSize,
    compressedSize: outBlob.size,
  };
}

function sanitizeSegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'item';
}

/**
 * Nén ảnh sang WebP và tải lên Supabase Storage bucket `note-images`, trả về Public URL.
 */
export async function uploadImageToSupabase(
  file: Blob,
  mapId: string,
  nodeId: string
): Promise<UploadedImageResult> {
  const client = getSupabase();
  if (!client) {
    throw new Error(
      'Chưa cấu hình Supabase Cloud. Hãy mở "Đồng bộ Cloud" để nhập URL & Key hoặc dùng tab "Link ảnh ngoài".'
    );
  }

  const compressed = await compressImageToWebP(file);
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const fileName = `${Date.now()}-${randomSuffix}.${compressed.extension}`;
  const storagePath = `${sanitizeSegment(mapId)}/${sanitizeSegment(nodeId)}/${fileName}`;

  const { error: uploadError } = await client.storage
    .from(NOTE_IMAGES_BUCKET)
    .upload(storagePath, compressed.blob, {
      contentType: compressed.mimeType,
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadError) {
    const msg = uploadError.message || '';
    if (msg.toLowerCase().includes('bucket') || msg.toLowerCase().includes('not found')) {
      throw new Error(
        'Chưa có Storage Bucket "note-images" trên Supabase. Hãy mở Đồng bộ Cloud → tab Script SQL và chạy script cập nhật.'
      );
    }
    if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('policy')) {
      throw new Error(
        'Thiếu quyền tải ảnh lên bucket "note-images" (RLS). Hãy chạy lại Script SQL mới nhất trong Đồng bộ Cloud.'
      );
    }
    throw new Error(`Tải ảnh lên thất bại: ${msg}`);
  }

  const { data: publicData } = client.storage.from(NOTE_IMAGES_BUCKET).getPublicUrl(storagePath);
  if (!publicData?.publicUrl) {
    throw new Error('Đã tải ảnh lên nhưng không lấy được Public URL.');
  }

  return {
    url: publicData.publicUrl,
    path: storagePath,
    width: compressed.width,
    height: compressed.height,
    originalSize: compressed.originalSize,
    compressedSize: compressed.compressedSize,
  };
}

/**
 * Chuyển một chuỗi Data URL (`data:image/...;base64,...`) thành Blob để nén & upload.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Trích xuất đường dẫn tương đối bên trong bucket `note-images` từ Public/Signed URL của Supabase.
 */
export function extractSupabaseStoragePath(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
    const markers = [
      `/storage/v1/object/public/${NOTE_IMAGES_BUCKET}/`,
      `/storage/v1/object/sign/${NOTE_IMAGES_BUCKET}/`,
      `/storage/v1/object/authenticated/${NOTE_IMAGES_BUCKET}/`,
      `/storage/v1/object/${NOTE_IMAGES_BUCKET}/`,
    ];
    for (const marker of markers) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx !== -1) {
        const rawPath = parsed.pathname.slice(idx + marker.length);
        return decodeURIComponent(rawPath);
      }
    }
  } catch {
    // ignore malformed URL
  }
  return null;
}

/**
 * Chuyển Blob sang chuỗi Base64 Data URL (`data:image/...;base64,...`).
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không thể chuyển ảnh sang Data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Lỗi đọc dữ liệu ảnh sang Base64.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Đóng gói (Dehydrate) toàn bộ ảnh Supabase / Blob trong một Map thành Base64 WebP Data URL
 * trước khi đẩy lên Google Drive. Nếu có bất kỳ ảnh Supabase nào tải thất bại, ném lỗi ngay để abort an toàn.
 */
export async function dehydrateMapImagesForArchive(
  map: MapData,
  onProgress?: (done: number, total: number) => void
): Promise<{ archivedMap: MapData; imageCount: number; storagePaths: string[] }> {
  const clonedMap: MapData = JSON.parse(JSON.stringify(map));
  const storagePathsSet = new Set<string>();

  if (typeof DOMParser === 'undefined') {
    return { archivedMap: clonedMap, imageCount: 0, storagePaths: [] };
  }

  const parser = new DOMParser();
  const parsedDocs: Array<{ nodeIndex: number; doc: Document; imgsToEmbed: Array<{ img: HTMLImageElement; src: string; storagePath: string | null }> }> = [];
  let totalToEmbed = 0;

  clonedMap.nodes.forEach((node, nodeIndex) => {
    const html = node.data?.content || '';
    if (!html || !html.toLowerCase().includes('<img')) return;

    const doc = parser.parseFromString(html, 'text/html');
    const imgs = Array.from(doc.querySelectorAll('img'));
    const imgsToEmbed: Array<{ img: HTMLImageElement; src: string; storagePath: string | null }> = [];

    imgs.forEach((img) => {
      const src = (img.getAttribute('src') || '').trim();
      if (!src) return;

      const storagePath = extractSupabaseStoragePath(src);
      if (storagePath) {
        storagePathsSet.add(storagePath);
        imgsToEmbed.push({ img, src, storagePath });
      } else if (src.startsWith('blob:')) {
        imgsToEmbed.push({ img, src, storagePath: null });
      }
    });

    if (imgsToEmbed.length > 0) {
      totalToEmbed += imgsToEmbed.length;
      parsedDocs.push({ nodeIndex, doc, imgsToEmbed });
    }
  });

  if (totalToEmbed === 0) {
    return {
      archivedMap: clonedMap,
      imageCount: 0,
      storagePaths: Array.from(storagePathsSet),
    };
  }

  let doneCount = 0;
  onProgress?.(0, totalToEmbed);

  // Cache để tránh tải lại cùng 1 URL nhiều lần nếu ảnh dùng lại giữa nhiều node
  const dataUrlCache = new Map<string, string>();

  for (const item of parsedDocs) {
    for (const target of item.imgsToEmbed) {
      let dataUrl = dataUrlCache.get(target.src);
      if (!dataUrl) {
        let fetchedBlob: Blob;
        try {
          const response = await fetch(target.src, { mode: 'cors', credentials: 'omit' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          fetchedBlob = await response.blob();
        } catch (err: any) {
          throw new Error(
            `Không thể tải ảnh từ Supabase để nhúng vào file lưu trữ (${target.src}). Đã hủy thao tác để bảo vệ dữ liệu ảnh gốc. Chi tiết: ${err?.message || 'Lỗi mạng'}`
          );
        }

        // Nén WebP nếu chưa phải WebP/GIF/SVG để file JSON trên Drive nhỏ gọn tối đa
        let finalBlob = fetchedBlob;
        if (
          fetchedBlob.type !== 'image/webp' &&
          fetchedBlob.type !== 'image/gif' &&
          fetchedBlob.type !== 'image/svg+xml'
        ) {
          try {
            const compressed = await compressImageToWebP(fetchedBlob);
            finalBlob = compressed.blob;
          } catch {
            finalBlob = fetchedBlob;
          }
        }

        dataUrl = await blobToDataUrl(finalBlob);
        dataUrlCache.set(target.src, dataUrl);
      }

      target.img.setAttribute('src', dataUrl);
      doneCount += 1;
      onProgress?.(doneCount, totalToEmbed);
    }

    clonedMap.nodes[item.nodeIndex].data.content = item.doc.body.innerHTML;
  }

  return {
    archivedMap: clonedMap,
    imageCount: totalToEmbed,
    storagePaths: Array.from(storagePathsSet),
  };
}

/**
 * Khôi phục (Rehydrate) các ảnh Base64 nhúng trong Map từ Google Drive lên lại Supabase Storage (`note-images`)
 * và thay thế `src` trong các node bằng Public URL mới trên Supabase.
 */
export async function rehydrateMapImagesFromArchive(
  map: MapData,
  onProgress?: (done: number, total: number) => void
): Promise<{ restoredMap: MapData; uploadedCount: number }> {
  const clonedMap: MapData = JSON.parse(JSON.stringify(map));
  const client = getSupabase();

  if (!client || typeof DOMParser === 'undefined') {
    return { restoredMap: clonedMap, uploadedCount: 0 };
  }

  const parser = new DOMParser();
  const parsedDocs: Array<{
    nodeIndex: number;
    nodeId: string;
    doc: Document;
    imgsToUpload: Array<{ img: HTMLImageElement; src: string }>;
  }> = [];
  let totalToUpload = 0;

  clonedMap.nodes.forEach((node, nodeIndex) => {
    const html = node.data?.content || '';
    if (!html || !html.toLowerCase().includes('<img')) return;

    const doc = parser.parseFromString(html, 'text/html');
    const imgs = Array.from(doc.querySelectorAll('img'));
    const imgsToUpload: Array<{ img: HTMLImageElement; src: string }> = [];

    imgs.forEach((img) => {
      const src = (img.getAttribute('src') || '').trim();
      if (src.startsWith('data:image/')) {
        imgsToUpload.push({ img, src });
      }
    });

    if (imgsToUpload.length > 0) {
      totalToUpload += imgsToUpload.length;
      parsedDocs.push({ nodeIndex, nodeId: node.id, doc, imgsToUpload });
    }
  });

  if (totalToUpload === 0) {
    return { restoredMap: clonedMap, uploadedCount: 0 };
  }

  let doneCount = 0;
  onProgress?.(0, totalToUpload);
  const uploadedUrlCache = new Map<string, string>();

  for (const item of parsedDocs) {
    for (const target of item.imgsToUpload) {
      let publicUrl = uploadedUrlCache.get(target.src);
      if (!publicUrl) {
        const blob = await dataUrlToBlob(target.src);
        const uploaded = await uploadImageToSupabase(blob, clonedMap.id, item.nodeId);
        publicUrl = uploaded.url;
        uploadedUrlCache.set(target.src, publicUrl);
      }
      target.img.setAttribute('src', publicUrl);
      doneCount += 1;
      onProgress?.(doneCount, totalToUpload);
    }

    clonedMap.nodes[item.nodeIndex].data.content = item.doc.body.innerHTML;
  }

  return {
    restoredMap: clonedMap,
    uploadedCount: totalToUpload,
  };
}

interface StorageListEntry {
  name?: string;
  id?: string | null;
  metadata?: { size?: number } | null;
}

type SupabaseClientInstance = NonNullable<ReturnType<typeof getSupabase>>;

async function listBucketFolderAll(
  client: SupabaseClientInstance,
  prefix: string
): Promise<StorageListEntry[]> {
  const PAGE_SIZE = 1000;
  const collected: StorageListEntry[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage
      .from(NOTE_IMAGES_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset });
    if (error || !Array.isArray(data) || data.length === 0) break;
    collected.push(...(data as StorageListEntry[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return collected;
}

async function listFilesInsideMapFolder(
  client: SupabaseClientInstance,
  folderName: string
): Promise<Array<{ path: string; size: number }>> {
  const files: Array<{ path: string; size: number }> = [];
  const entries = await listBucketFolderAll(client, folderName);

  for (const entry of entries) {
    if (!entry?.name || entry.name === '.emptyFolderPlaceholder') continue;
    if (!entry.id) {
      const subFolder = `${folderName}/${entry.name}`;
      const subFiles = await listBucketFolderAll(client, subFolder);
      for (const f of subFiles) {
        if (f?.name && f.name !== '.emptyFolderPlaceholder') {
          files.push({
            path: `${subFolder}/${f.name}`,
            size: Number(f.metadata?.size) || 0,
          });
        }
      }
    } else {
      files.push({
        path: `${folderName}/${entry.name}`,
        size: Number(entry.metadata?.size) || 0,
      });
    }
  }

  return files;
}

function collectMapImagePathsIntoSet(map: MapData, targetSet: Set<string>): void {
  if (typeof DOMParser === 'undefined') return;
  const parser = new DOMParser();
  for (const node of map.nodes || []) {
    const html = node.data?.content || '';
    if (!html || !html.toLowerCase().includes('<img')) continue;
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      const src = (img.getAttribute('src') || '').trim();
      const extracted = extractSupabaseStoragePath(src);
      if (extracted) {
        targetSet.add(extracted);
      }
    });
  }
}

/**
 * Xóa danh sách các file theo đường dẫn khỏi Supabase Storage bucket `note-images` theo từng batch 100 file.
 */
export async function removeSupabaseStoragePaths(paths: string[]): Promise<number> {
  const client = getSupabase();
  if (!client) return 0;

  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (uniquePaths.length === 0) return 0;

  let removedCount = 0;
  const BATCH_SIZE = 100;
  for (let i = 0; i < uniquePaths.length; i += BATCH_SIZE) {
    const batch = uniquePaths.slice(i, i + BATCH_SIZE);
    const { error } = await client.storage.from(NOTE_IMAGES_BUCKET).remove(batch);
    if (!error) {
      removedCount += batch.length;
    } else {
      console.warn('[Supabase Storage] Lỗi xóa batch ảnh:', error.message);
    }
  }

  return removedCount;
}

/**
 * Quét toàn bộ bucket `note-images` trên Supabase Storage để thống kê dung lượng, ảnh đang dùng và ảnh thừa theo từng Map.
 */
export async function scanSupabaseNoteImages(options: {
  localMaps: MapData[];
  remoteMaps?: MapData[];
  remoteChecked?: boolean;
}): Promise<SupabaseStorageScanResult> {
  const client = getSupabase();
  if (!client) {
    throw new Error('Chưa cấu hình Supabase URL & Key.');
  }

  const knownMapsByFolder = new Map<string, { mapId: string; mapName: string }>();
  const referencedPaths = new Set<string>();

  const registerMap = (map: MapData) => {
    const folderKey = sanitizeSegment(map.id);
    if (!knownMapsByFolder.has(folderKey)) {
      knownMapsByFolder.set(folderKey, {
        mapId: map.id,
        mapName: map.name || 'Bản đồ',
      });
    }
    collectMapImagePathsIntoSet(map, referencedPaths);
  };

  (options.localMaps || []).forEach(registerMap);
  (options.remoteMaps || []).forEach(registerMap);

  const rootEntries = await listBucketFolderAll(client, '');
  const groups: SupabaseStorageMapGroup[] = [];
  const rootLooseFiles: Array<{ path: string; size: number }> = [];

  for (const entry of rootEntries) {
    if (!entry?.name || entry.name === '.emptyFolderPlaceholder') continue;
    if (!entry.id) {
      const folderKey = entry.name;
      const files = await listFilesInsideMapFolder(client, folderKey);
      if (files.length === 0) continue;

      const known = knownMapsByFolder.get(folderKey);
      const isDeletedMap = !known;
      const allPaths = files.map((f) => f.path);
      const orphanList = isDeletedMap
        ? files
        : files.filter((f) => !referencedPaths.has(f.path));

      groups.push({
        folderKey,
        mapId: known?.mapId || folderKey,
        mapName: known?.mapName || `Bản đồ đã xóa (${folderKey})`,
        isDeletedMap,
        totalFiles: files.length,
        totalBytes: files.reduce((sum, f) => sum + f.size, 0),
        activeFiles: files.length - orphanList.length,
        orphanFiles: orphanList.length,
        orphanBytes: orphanList.reduce((sum, f) => sum + f.size, 0),
        allPaths,
        orphanPaths: orphanList.map((f) => f.path),
      });
    } else {
      rootLooseFiles.push({
        path: entry.name,
        size: Number(entry.metadata?.size) || 0,
      });
    }
  }

  if (rootLooseFiles.length > 0) {
    const orphanList = rootLooseFiles.filter((f) => !referencedPaths.has(f.path));
    groups.push({
      folderKey: '__root__',
      mapId: '__root__',
      mapName: 'Ảnh rời ngoài thư mục map',
      isDeletedMap: orphanList.length === rootLooseFiles.length,
      totalFiles: rootLooseFiles.length,
      totalBytes: rootLooseFiles.reduce((sum, f) => sum + f.size, 0),
      activeFiles: rootLooseFiles.length - orphanList.length,
      orphanFiles: orphanList.length,
      orphanBytes: orphanList.reduce((sum, f) => sum + f.size, 0),
      allPaths: rootLooseFiles.map((f) => f.path),
      orphanPaths: orphanList.map((f) => f.path),
    });
  }

  groups.sort((a, b) => {
    if (a.isDeletedMap !== b.isDeletedMap) return a.isDeletedMap ? -1 : 1;
    if (b.orphanFiles !== a.orphanFiles) return b.orphanFiles - a.orphanFiles;
    return b.totalBytes - a.totalBytes;
  });

  return {
    groups,
    totalFiles: groups.reduce((sum, g) => sum + g.totalFiles, 0),
    totalBytes: groups.reduce((sum, g) => sum + g.totalBytes, 0),
    totalOrphanFiles: groups.reduce((sum, g) => sum + g.orphanFiles, 0),
    totalOrphanBytes: groups.reduce((sum, g) => sum + g.orphanBytes, 0),
    remoteChecked: Boolean(options.remoteChecked),
  };
}

/**
 * Xóa toàn bộ file ảnh thuộc một Map trên Supabase Storage bucket `note-images`.
 */
export async function deleteMapImagesFromSupabase(
  mapOrId: MapData | string,
  extraStoragePaths: string[] = []
): Promise<number> {
  const client = getSupabase();
  if (!client) return 0;

  const mapId = typeof mapOrId === 'string' ? mapOrId : mapOrId.id;
  const pathSet = new Set<string>(extraStoragePaths.filter(Boolean));

  // 1. Quét đường dẫn ảnh từ nội dung HTML các node (nếu có truyền MapData)
  if (typeof mapOrId !== 'string') {
    collectMapImagePathsIntoSet(mapOrId, pathSet);
  }

  // 2. Liệt kê tất cả file thực tế trong thư mục `${sanitizeSegment(mapId)}/...` trên Supabase Storage
  const safeMapFolder = sanitizeSegment(mapId);
  try {
    const folderFiles = await listFilesInsideMapFolder(client, safeMapFolder);
    folderFiles.forEach((f) => pathSet.add(f.path));
  } catch (err) {
    console.warn('[Supabase Storage] Không thể liệt kê thư mục ảnh để dọn dẹp:', err);
  }

  return removeSupabaseStoragePaths(Array.from(pathSet));
}
