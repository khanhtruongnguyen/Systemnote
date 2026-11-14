import type { DriveFileItem, MapData, SingleMapExportPayload } from '../types';
import { StorageService } from './storage';
import {
  deleteMapAndImagesFromSupabase,
  isSupabaseConfigured,
  syncMapToSupabase,
} from './supabase';
import {
  dehydrateMapImagesForArchive,
  rehydrateMapImagesFromArchive,
} from '../utils/imageHelper';

export const GOOGLE_APPS_SCRIPT_CODE = `// =========================================================================
// SYSTEMNOTE - GOOGLE APPS SCRIPT (KHO LƯU TRỮ LẠNH GOOGLE DRIVE)
// Thư mục lưu trữ tự động tạo trên Google Drive: "SystemNote"
// =========================================================================

var FOLDER_NAME = 'SystemNote';

function getOrCreateFolder_() {
  var folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(FOLDER_NAME);
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : 'list';
    var folder = getOrCreateFolder_();

    if (action === 'list') {
      var files = [];
      var it = folder.getFiles();
      while (it.hasNext()) {
        var f = it.next();
        if (f.isTrashed()) continue;
        var name = f.getName();
        if (name.toLowerCase().slice(-5) === '.json') {
          files.push({
            id: f.getId(),
            name: name,
            updatedAt: f.getLastUpdated().getTime(),
            size: f.getSize(),
            url: f.getUrl()
          });
        }
      }
      files.sort(function(a, b) { return b.updatedAt - a.updatedAt; });
      return jsonResponse_({
        success: true,
        folderName: FOLDER_NAME,
        count: files.length,
        files: files
      });
    }

    if (action === 'get') {
      var fileId = e && e.parameter && e.parameter.fileId ? String(e.parameter.fileId) : '';
      if (!fileId) {
        return jsonResponse_({ success: false, error: 'Thiếu fileId cần tải.' });
      }
      var targetFile = DriveApp.getFileById(fileId);
      if (!targetFile || targetFile.isTrashed()) {
        return jsonResponse_({ success: false, error: 'File không tồn tại hoặc đã vào thùng rác.' });
      }
      var rawText = targetFile.getBlob().getDataAsString('UTF-8');
      return jsonResponse_({
        success: true,
        id: targetFile.getId(),
        name: targetFile.getName(),
        updatedAt: targetFile.getLastUpdated().getTime(),
        content: rawText
      });
    }

    return jsonResponse_({
      success: true,
      message: 'SystemNote Google Apps Script Web App đang hoạt động.',
      folderName: FOLDER_NAME
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(rawBody);
    var action = payload.action ? String(payload.action) : 'save';
    var folder = getOrCreateFolder_();

    if (action === 'delete') {
      var delId = payload.fileId ? String(payload.fileId) : '';
      if (!delId) {
        return jsonResponse_({ success: false, error: 'Thiếu fileId để xóa.' });
      }
      var delFile = DriveApp.getFileById(delId);
      if (delFile) {
        delFile.setTrashed(true);
      }
      return jsonResponse_({ success: true, deletedId: delId });
    }

    var fileName = String(payload.fileName || ('systemnote_map_' + Date.now() + '.json'));
    var contentStr = typeof payload.content === 'string'
      ? payload.content
      : JSON.stringify(payload.content || {}, null, 2);

    // Nếu đã có file trùng tên trong thư mục SystemNote -> Ghi đè lên bản đó
    var existingIt = folder.getFilesByName(fileName);
    var targetFile = null;
    while (existingIt.hasNext()) {
      var candidate = existingIt.next();
      if (candidate.isTrashed()) continue;
      if (!targetFile) {
        targetFile = candidate;
      } else {
        candidate.setTrashed(true);
      }
    }

    if (targetFile) {
      targetFile.setContent(contentStr);
    } else {
      targetFile = folder.createFile(fileName, contentStr, MimeType.PLAIN_TEXT);
    }

    return jsonResponse_({
      success: true,
      id: targetFile.getId(),
      name: targetFile.getName(),
      updatedAt: targetFile.getLastUpdated().getTime(),
      size: targetFile.getSize(),
      url: targetFile.getUrl()
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: err && err.message ? err.message : String(err) });
  }
}`;

export function getDriveScriptUrl(customUrl?: string): string {
  if (customUrl !== undefined) {
    return customUrl.trim();
  }
  const settings = StorageService.getSettings();
  return (settings.googleDriveScriptUrl || '').trim();
}

export function isDriveScriptConfigured(customUrl?: string): boolean {
  const url = getDriveScriptUrl(customUrl);
  return /^https:\/\/script\.google(usercontent)?\.com\//i.test(url);
}

export function toSafeDriveFileName(mapName: string): string {
  const cleaned = (mapName || 'map')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return `${cleaned || 'map'}_systemnote.json`;
}

function buildActionUrl(scriptUrl: string, params: Record<string, string>): string {
  const urlObj = new URL(scriptUrl);
  Object.entries(params).forEach(([k, v]) => {
    urlObj.searchParams.set(k, v);
  });
  return urlObj.toString();
}

async function parseAppsScriptJsonResponse(res: Response): Promise<Record<string, any>> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      throw new Error(
        'Google Apps Script trả về trang HTML (thường do chưa cấp quyền truy cập "Anyone" / "Bất kỳ ai" khi Deploy Web App, hoặc URL không phải link /exec).'
      );
    }
    throw new Error(`Phản hồi từ Apps Script không phải JSON hợp lệ: ${trimmed.slice(0, 120)}`);
  }
}

export async function testDriveScriptConnection(
  scriptUrl: string
): Promise<{ ok: boolean; message: string; files?: DriveFileItem[] }> {
  const url = scriptUrl.trim();
  if (!isDriveScriptConfigured(url)) {
    return {
      ok: false,
      message:
        'URL Web App không hợp lệ. URL cần bắt đầu bằng https://script.google.com/macros/s/.../exec',
    };
  }

  try {
    const res = await fetch(buildActionUrl(url, { action: 'list' }), {
      method: 'GET',
      redirect: 'follow',
    });
    const data = await parseAppsScriptJsonResponse(res);
    if (!data.success) {
      return { ok: false, message: data.error || 'Apps Script báo lỗi.' };
    }
    const files: DriveFileItem[] = Array.isArray(data.files) ? data.files : [];
    return {
      ok: true,
      message: `Kết nối thành công tới thư mục Google Drive "${data.folderName || 'SystemNote'}" (${files.length} file).`,
      files,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Không thể kết nối Google Drive Script: ${err?.message || 'Lỗi mạng'}`,
    };
  }
}

export async function listGoogleDriveFiles(
  scriptUrl?: string
): Promise<{ ok: boolean; files: DriveFileItem[]; message?: string }> {
  const url = getDriveScriptUrl(scriptUrl);
  if (!isDriveScriptConfigured(url)) {
    return { ok: false, files: [], message: 'Chưa cấu hình URL Google Apps Script.' };
  }

  try {
    const res = await fetch(buildActionUrl(url, { action: 'list' }), {
      method: 'GET',
      redirect: 'follow',
    });
    const data = await parseAppsScriptJsonResponse(res);
    if (!data.success) {
      return { ok: false, files: [], message: data.error || 'Không thể lấy danh sách file.' };
    }
    const files: DriveFileItem[] = Array.isArray(data.files) ? data.files : [];
    return { ok: true, files };
  } catch (err: any) {
    return {
      ok: false,
      files: [],
      message: err?.message || 'Lỗi khi tải danh sách file từ Google Drive.',
    };
  }
}

export async function saveMapToGoogleDrive(
  map: MapData,
  scriptUrl?: string
): Promise<{
  ok: boolean;
  fileId?: string;
  fileName?: string;
  updatedAt?: number;
  message?: string;
}> {
  const url = getDriveScriptUrl(scriptUrl);
  if (!isDriveScriptConfigured(url)) {
    return { ok: false, message: 'Chưa cấu hình URL Google Apps Script.' };
  }

  const cleanedMap = StorageService.cleanMapsData([map])[0];
  const fileName = toSafeDriveFileName(cleanedMap.name);
  const payloadContent: SingleMapExportPayload = {
    version: 1,
    type: 'systemnote_single_map',
    exportedAt: Date.now(),
    source: 'web',
    map: cleanedMap,
  };

  try {
    // Dùng text/plain;charset=utf-8 để trình duyệt gửi Simple Request, tránh OPTIONS preflight bị Google Apps Script chặn
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'save',
        fileName,
        content: JSON.stringify(payloadContent),
      }),
    });

    const data = await parseAppsScriptJsonResponse(res);
    if (!data.success) {
      return {
        ok: false,
        message: data.error || 'Google Apps Script từ chối lưu file.',
      };
    }

    return {
      ok: true,
      fileId: data.id,
      fileName: data.name || fileName,
      updatedAt: Number(data.updatedAt) || Date.now(),
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Không thể gửi dữ liệu lên Google Drive.',
    };
  }
}

export async function fetchDriveFileContent(
  fileId: string,
  scriptUrl?: string
): Promise<{ ok: boolean; content?: string; name?: string; message?: string }> {
  const url = getDriveScriptUrl(scriptUrl);
  if (!isDriveScriptConfigured(url)) {
    return { ok: false, message: 'Chưa cấu hình URL Google Apps Script.' };
  }

  try {
    const res = await fetch(buildActionUrl(url, { action: 'get', fileId }), {
      method: 'GET',
      redirect: 'follow',
    });
    const data = await parseAppsScriptJsonResponse(res);
    if (!data.success || !data.content) {
      return {
        ok: false,
        message: data.error || 'Không đọc được nội dung file từ Google Drive.',
      };
    }
    return {
      ok: true,
      content: String(data.content),
      name: data.name,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Lỗi khi tải file từ Google Drive.',
    };
  }
}

export async function deleteDriveFile(
  fileId: string,
  scriptUrl?: string
): Promise<{ ok: boolean; message?: string }> {
  const url = getDriveScriptUrl(scriptUrl);
  if (!isDriveScriptConfigured(url)) {
    return { ok: false, message: 'Chưa cấu hình URL Google Apps Script.' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'delete',
        fileId,
      }),
    });
    const data = await parseAppsScriptJsonResponse(res);
    if (!data.success) {
      return { ok: false, message: data.error || 'Không thể xóa file trên Google Drive.' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Lỗi kết nối khi xóa file.' };
  }
}

export interface DriveMapTransferResult {
  ok: boolean;
  message: string;
  fileName?: string;
  imageCount?: number;
  deletedImages?: number;
}

async function uploadMapPackageToDrive(
  map: MapData,
  options: {
    scriptUrl?: string;
    onStatus?: (step: string) => void;
    deleteAfterSave: boolean;
  }
): Promise<DriveMapTransferResult> {
  const scriptUrl = getDriveScriptUrl(options.scriptUrl);
  if (!isDriveScriptConfigured(scriptUrl)) {
    return {
      ok: false,
      message: options.deleteAfterSave
        ? 'Vui lòng cấu hình Google Apps Script Web App URL trước khi cất bản đồ.'
        : 'Vui lòng cấu hình Google Apps Script Web App URL trước khi sao lưu bản đồ.',
    };
  }

  try {
    options.onStatus?.('Đang kiểm tra và đóng gói hình ảnh vào tệp JSON...');
    const { archivedMap, imageCount, storagePaths } = await dehydrateMapImagesForArchive(
      map,
      (done, total) => {
        options.onStatus?.(`Đang nhúng ảnh vào tệp lưu trữ (${done}/${total})...`);
      }
    );

    options.onStatus?.('Đang tải tệp lên Google Drive (ghi đè nếu trùng tên)...');
    const saveRes = await saveMapToGoogleDrive(archivedMap, scriptUrl);
    if (!saveRes.ok) {
      return {
        ok: false,
        message:
          saveRes.message ||
          'Lưu lên Google Drive thất bại. Dữ liệu trên App và Supabase được giữ nguyên.',
      };
    }

    if (!options.deleteAfterSave) {
      return {
        ok: true,
        fileName: saveRes.fileName,
        imageCount,
        deletedImages: 0,
        message: isSupabaseConfigured()
          ? `Đã sao lưu "${map.name}" lên Google Drive (${saveRes.fileName}, nhúng ${imageCount} ảnh). Bản đồ ở App chính và Supabase vẫn được giữ nguyên.`
          : `Đã sao lưu "${map.name}" lên Google Drive (${saveRes.fileName}, nhúng ${imageCount} ảnh). Bản đồ ở App chính vẫn được giữ nguyên.`,
      };
    }

    let deletedImages = 0;
    if (isSupabaseConfigured()) {
      options.onStatus?.('Đang giải phóng bản đồ & hình ảnh khỏi Supabase Cloud...');
      const delRes = await deleteMapAndImagesFromSupabase(map.id, map, storagePaths);
      deletedImages = delRes.deletedImages;
      if (!delRes.ok) {
        return {
          ok: true,
          fileName: saveRes.fileName,
          imageCount,
          deletedImages,
          message: `Đã cất "${map.name}" vào Google Drive (${saveRes.fileName}, nhúng ${imageCount} ảnh), nhưng có lỗi nhỏ khi xóa dòng trên Supabase (đã dọn ${deletedImages} ảnh).`,
        };
      }
    }

    return {
      ok: true,
      fileName: saveRes.fileName,
      imageCount,
      deletedImages,
      message: `Đã cất "${map.name}" lên Google Drive (${saveRes.fileName}, nhúng ${imageCount} ảnh) và giải phóng ${deletedImages} ảnh khỏi Supabase.`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message:
        err?.message ||
        (options.deleteAfterSave
          ? 'Quá trình cất bản đồ thất bại. Chưa có dữ liệu nào bị xóa.'
          : 'Quá trình sao lưu bản đồ lên Google Drive thất bại.'),
    };
  }
}

/**
 * Sao lưu 1 Map lên Google Drive (nhúng ảnh Base64 WebP vào JSON)
 * nhưng KHÔNG xóa bản đồ ở App chính và KHÔNG xóa dữ liệu/ảnh trên Supabase.
 */
export async function backupMapToGoogleDrive(
  map: MapData,
  options?: {
    scriptUrl?: string;
    onStatus?: (step: string) => void;
  }
): Promise<DriveMapTransferResult> {
  return uploadMapPackageToDrive(map, {
    scriptUrl: options?.scriptUrl,
    onStatus: options?.onStatus,
    deleteAfterSave: false,
  });
}

/**
 * Sao lưu toàn bộ danh sách Map lên Google Drive (mỗi Map 1 file .json kèm ảnh nhúng),
 * giữ nguyên toàn bộ dữ liệu trên App chính và Supabase.
 */
export async function backupAllMapsToGoogleDrive(
  maps: MapData[],
  options?: {
    scriptUrl?: string;
    onStatus?: (step: string) => void;
  }
): Promise<{
  ok: boolean;
  total: number;
  succeeded: number;
  failedNames: string[];
  message: string;
}> {
  const scriptUrl = getDriveScriptUrl(options?.scriptUrl);
  if (!isDriveScriptConfigured(scriptUrl)) {
    return {
      ok: false,
      total: maps.length,
      succeeded: 0,
      failedNames: maps.map((m) => m.name),
      message: 'Vui lòng cấu hình Google Apps Script Web App URL trước khi sao lưu.',
    };
  }

  let succeeded = 0;
  const failedNames: string[] = [];

  for (let i = 0; i < maps.length; i++) {
    const map = maps[i];
    options?.onStatus?.(`Đang sao lưu bản đồ ${i + 1}/${maps.length}: "${map.name}"...`);
    const res = await backupMapToGoogleDrive(map, {
      scriptUrl,
      onStatus: (step) => options?.onStatus?.(`[${i + 1}/${maps.length} · ${map.name}] ${step}`),
    });
    if (res.ok) {
      succeeded += 1;
    } else {
      failedNames.push(map.name);
    }
  }

  if (failedNames.length === 0) {
    return {
      ok: true,
      total: maps.length,
      succeeded,
      failedNames,
      message: isSupabaseConfigured()
        ? `Đã sao lưu thành công ${succeeded}/${maps.length} bản đồ lên Google Drive. Toàn bộ dữ liệu ở App chính và Supabase vẫn được giữ nguyên.`
        : `Đã sao lưu thành công ${succeeded}/${maps.length} bản đồ lên Google Drive. Toàn bộ dữ liệu ở App chính vẫn được giữ nguyên.`,
    };
  }

  return {
    ok: false,
    total: maps.length,
    succeeded,
    failedNames,
    message: `Đã sao lưu ${succeeded}/${maps.length} bản đồ lên Google Drive. Lỗi ở: ${failedNames.join(', ')}.`,
  };
}

/**
 * Quy trình hoàn chỉnh "Cất Map vào Kho Lạnh Google Drive":
 * 1. Đóng gói toàn bộ ảnh Supabase của Map thành Base64 WebP nhúng vào JSON (chốt an toàn nếu lỗi tải ảnh -> abort).
 * 2. Tải file JSON lên Google Drive (ghi đè nếu trùng tên).
 * 3. Chỉ khi Google Drive xác nhận lưu thành công mới xóa sạch ảnh (`note-images`) & dòng Map trên Supabase.
 */
export async function archiveMapToGoogleDrive(
  map: MapData,
  options?: {
    scriptUrl?: string;
    onStatus?: (step: string) => void;
  }
): Promise<DriveMapTransferResult> {
  return uploadMapPackageToDrive(map, {
    scriptUrl: options?.scriptUrl,
    onStatus: options?.onStatus,
    deleteAfterSave: true,
  });
}

/**
 * Quy trình hoàn chỉnh "Khôi phục Map từ Google Drive về Webapp & Supabase":
 * 1. Tải file `.json` từ Google Drive (giữ nguyên bản trên Drive, không xóa).
 * 2. Nếu Supabase đang cấu hình, giải nén các ảnh Base64 và tải lên lại bucket `note-images`.
 * 3. Đẩy Map đã khôi phục lên lại bảng `public.maps` của Supabase.
 */
export async function restoreMapFromGoogleDrive(
  fileItem: DriveFileItem,
  options?: {
    scriptUrl?: string;
    onStatus?: (step: string) => void;
    confirmOverwrite?: (parsedMap: MapData) => boolean | Promise<boolean>;
  }
): Promise<{
  ok: boolean;
  cancelled?: boolean;
  map?: MapData;
  uploadedImages?: number;
  message: string;
}> {
  const scriptUrl = getDriveScriptUrl(options?.scriptUrl);
  if (!isDriveScriptConfigured(scriptUrl)) {
    return {
      ok: false,
      message: 'Vui lòng cấu hình Google Apps Script Web App URL trước.',
    };
  }

  try {
    options?.onStatus?.(`Đang tải "${fileItem.name}" từ Google Drive...`);
    const fileRes = await fetchDriveFileContent(fileItem.id, scriptUrl);
    if (!fileRes.ok || !fileRes.content) {
      return {
        ok: false,
        message: fileRes.message || 'Không thể tải tệp từ Google Drive.',
      };
    }

    const parsedResult = StorageService.parseImportData(fileRes.content);
    const parsedMap: MapData =
      parsedResult.type === 'single_map' ? parsedResult.map : parsedResult.maps[0];

    if (!parsedMap) {
      return { ok: false, message: 'Tệp không chứa dữ liệu bản đồ hợp lệ.' };
    }

    if (options?.confirmOverwrite) {
      const shouldContinue = await options.confirmOverwrite(parsedMap);
      if (!shouldContinue) {
        return {
          ok: false,
          cancelled: true,
          message: `Đã hủy khôi phục "${parsedMap.name}".`,
        };
      }
    }

    let finalMap: MapData = {
      ...parsedMap,
      updatedAt: Math.max(parsedMap.updatedAt || 0, Date.now()),
    };
    let uploadedImages = 0;

    if (isSupabaseConfigured()) {
      options?.onStatus?.('Đang khôi phục hình ảnh từ tệp lên Supabase Storage...');
      const rehydrated = await rehydrateMapImagesFromArchive(finalMap, (done, total) => {
        options?.onStatus?.(`Đang đẩy lại ảnh lên Supabase Storage (${done}/${total})...`);
      });
      finalMap = rehydrated.restoredMap;
      uploadedImages = rehydrated.uploadedCount;

      options?.onStatus?.('Đang đồng bộ lại bản đồ lên Supabase Database...');
      await syncMapToSupabase(finalMap);
    }

    return {
      ok: true,
      map: finalMap,
      uploadedImages,
      message: isSupabaseConfigured()
        ? `Đã khôi phục "${finalMap.name}" về Webapp & Supabase (${uploadedImages} ảnh đã lên Cloud, bản sao trên Drive vẫn được giữ nguyên).`
        : `Đã khôi phục "${finalMap.name}" về Webapp (bản sao trên Drive vẫn được giữ nguyên).`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Lỗi khi khôi phục bản đồ từ Google Drive.',
    };
  }
}
