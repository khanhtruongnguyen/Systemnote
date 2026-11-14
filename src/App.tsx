import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ReactFlowProvider, type Edge } from '@xyflow/react';
import { StorageService, DEFAULT_STARTER_MAP } from './services/storage';
import {
  syncMapToSupabase,
  subscribeToRemoteMaps,
  deleteMapAndImagesFromSupabase,
} from './services/supabase';
import type {
  MapData,
  CustomNode,
  FloatingCardState,
  ImportDataResult,
  AppSettings,
  CanvasThemeId,
} from './types';
import { CANVAS_THEMES, DEFAULT_CANVAS_THEME } from './constants/theme';
import { Header } from './components/Header';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { Sidebar } from './components/Sidebar';
import { NewMapModal } from './components/NewMapModal';
import { DeleteMapModal } from './components/DeleteMapModal';
import { ImportConfirmModal } from './components/ImportConfirmModal';
import { MoveNodesModal } from './components/MoveNodesModal';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { isDriveScriptConfigured } from './services/googleDrive';
import { FloatingCardContainer } from './components/FloatingCardContainer';
import { MainAiAgentPanel } from './components/MainAiAgentPanel';
import { AiSettingsModal } from './components/AiSettingsModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useDeviceMode } from './hooks/useDeviceMode';
import { Sparkles, CheckCircle2 } from 'lucide-react';

export function App() {
  const [maps, setMaps] = useState<MapData[]>([DEFAULT_STARTER_MAP]);
  const [settings, setSettings] = useState<AppSettings>(() => StorageService.getSettings());
  const [activeMapId, setActiveMapId] = useState<string>(DEFAULT_STARTER_MAP.id);
  const [isStorageReady, setIsStorageReady] = useState<boolean>(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [sidebarInitialEditMode, setSidebarInitialEditMode] = useState<boolean>(false);

  const [isNewMapModalOpen, setIsNewMapModalOpen] = useState<boolean>(false);
  const [deleteTargetMapId, setDeleteTargetMapId] = useState<string | null>(null);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState<boolean>(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState<boolean>(false);
  const [driveArchiveTargetId, setDriveArchiveTargetId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportDataResult | null>(null);
  const [isMainAiOpen, setIsMainAiOpen] = useState<boolean>(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState<boolean>(false);

  // Chế độ di chuyển nhiều ô sang bản đồ khác
  const [isMoveMode, setIsMoveMode] = useState<boolean>(false);
  const [moveModalState, setMoveModalState] = useState<{
    isOpen: boolean;
    nodes: CustomNode[];
    edges: Edge[];
  }>({ isOpen: false, nodes: [], edges: [] });

  // Thẻ ghi chú nổi ghim trên canvas
  const [floatingCards, setFloatingCards] = useState<FloatingCardState[]>([]);
  const topZIndexRef = useRef<number>(120);

  // Thông báo nhanh (Toast)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const focusTimerRef = useRef<number | null>(null);

  const {
    isMobile,
    preference: devicePreference,
    changePreference: changeDeviceMode,
  } = useDeviceMode();

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  const triggerFocusNode = useCallback((nodeId: string) => {
    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
    }
    setFocusNodeId(nodeId);
    focusTimerRef.current = window.setTimeout(() => {
      setFocusNodeId(null);
      focusTimerRef.current = null;
    }, 120);
  }, []);

  // 1. Khởi tạo dữ liệu từ IndexedDB & đọc Deep Link (?map=...&note=...)
  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await StorageService.init();
        const savedMaps = await StorageService.getMaps();
        const settings = StorageService.getSettings();

        if (!mounted) return;

        const validMaps = savedMaps.length > 0 ? savedMaps : [DEFAULT_STARTER_MAP];
        const urlParams = new URLSearchParams(window.location.search);
        const paramMap = urlParams.get('map');
        const paramNote = urlParams.get('note');

        let initialMapId = settings.activeMapId || validMaps[0].id;
        if (paramMap && validMaps.some((m) => m.id === paramMap)) {
          initialMapId = paramMap;
        } else if (!validMaps.some((m) => m.id === initialMapId)) {
          initialMapId = validMaps[0].id;
        }

        setMaps(validMaps);
        setActiveMapId(initialMapId);

        if (paramNote) {
          const targetMap = validMaps.find((m) => m.id === initialMapId);
          const foundInActive = targetMap?.nodes.find((n) => n.id === paramNote);
          if (foundInActive) {
            setSelectedNodeId(foundInActive.id);
            triggerFocusNode(foundInActive.id);
          } else {
            // Tìm trên tất cả bản đồ nếu không chỉ định ?map=
            for (const m of validMaps) {
              const found = m.nodes.find((n) => n.id === paramNote);
              if (found) {
                setActiveMapId(m.id);
                setSelectedNodeId(found.id);
                triggerFocusNode(found.id);
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error('Lỗi khởi tạo SystemNote:', err);
      } finally {
        if (mounted) {
          setIsStorageReady(true);
        }
      }
    };

    bootstrap();
    return () => {
      mounted = false;
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    };
  }, [triggerFocusNode]);

  // 2. Tự động lưu bản đồ vào IndexedDB & cài đặt vào localStorage
  useEffect(() => {
    if (!isStorageReady) return;
    const timer = window.setTimeout(() => {
      StorageService.saveMaps(maps).catch((err) => {
        console.error('Lỗi lưu dữ liệu bản đồ:', err);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [maps, isStorageReady]);

  useEffect(() => {
    if (!isStorageReady) return;
    StorageService.saveSettings({ ...settings, activeMapId });
  }, [settings, activeMapId, isStorageReady]);

  const activeMap = useMemo(() => {
    return maps.find((m) => m.id === activeMapId) || maps[0] || DEFAULT_STARTER_MAP;
  }, [maps, activeMapId]);

  const handleSaveSettings = useCallback(
    (updates: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...updates };
        StorageService.saveSettings({ ...next, activeMapId });
        return next;
      });
    },
    [activeMapId]
  );

  const canvasTheme = useMemo(() => {
    const id = settings.canvasTheme || DEFAULT_CANVAS_THEME;
    return CANVAS_THEMES[id] || CANVAS_THEMES[DEFAULT_CANVAS_THEME];
  }, [settings.canvasTheme]);

  const handleChangeCanvasTheme = useCallback(
    (themeId: CanvasThemeId) => {
      handleSaveSettings({ canvasTheme: themeId });
    },
    [handleSaveSettings]
  );

  // Tự động đồng bộ Map hiện tại lên Supabase Cloud (Debounced 1000ms)
  useEffect(() => {
    if (
      !isStorageReady ||
      settings.supabaseAutoSync === false ||
      !settings.supabaseUrl ||
      !settings.supabaseAnonKey
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      syncMapToSupabase(activeMap);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [
    activeMap,
    isStorageReady,
    settings.supabaseAutoSync,
    settings.supabaseUrl,
    settings.supabaseAnonKey,
  ]);

  // Lắng nghe kênh Realtime từ Supabase WebSocket
  useEffect(() => {
    if (
      !isStorageReady ||
      settings.supabaseRealtime === false ||
      !settings.supabaseUrl ||
      !settings.supabaseAnonKey
    ) {
      return;
    }

    const unsubscribe = subscribeToRemoteMaps(
      (remoteMap) => {
        setMaps((prev) => {
          const current = prev.find((m) => m.id === remoteMap.id);
          if (current) {
            if ((current.updatedAt || 0) > (remoteMap.updatedAt || 0)) {
              syncMapToSupabase(current);
              return prev;
            }
            if ((current.updatedAt || 0) === (remoteMap.updatedAt || 0)) {
              return prev;
            }
            return prev.map((m) => (m.id === remoteMap.id ? remoteMap : m));
          }
          return [remoteMap, ...prev];
        });
      },
      (deletedMapId) => {
        setMaps((prev) => {
          if (prev.length <= 1) return prev;
          const remaining = prev.filter((m) => m.id !== deletedMapId);
          if (remaining.length !== prev.length) {
            setActiveMapId((currentActiveId) => {
              if (currentActiveId === deletedMapId && remaining.length > 0) {
                setSelectedNodeId(null);
                setFloatingCards([]);
                return remaining[0].id;
              }
              return currentActiveId;
            });
          }
          return remaining;
        });
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, [
    isStorageReady,
    settings.supabaseRealtime,
    settings.supabaseUrl,
    settings.supabaseAnonKey,
  ]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return activeMap.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [activeMap.nodes, selectedNodeId]);

  // Đồng bộ URL thanh địa chỉ (?map=...&note=...) để chia sẻ deep-link dễ dàng
  useEffect(() => {
    if (!isStorageReady) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('map', activeMap.id);
      if (selectedNodeId && activeMap.nodes.some((n) => n.id === selectedNodeId)) {
        url.searchParams.set('note', selectedNodeId);
      } else {
        url.searchParams.delete('note');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore invalid URL contexts
    }
  }, [isStorageReady, activeMap.id, activeMap.nodes, selectedNodeId]);

  // Dọn thẻ nổi nếu ô tương ứng đã bị xóa khỏi bản đồ hiện tại
  useEffect(() => {
    const nodeIdSet = new Set(activeMap.nodes.map((n) => n.id));
    setFloatingCards((prev) => {
      const filtered = prev.filter((c) => nodeIdSet.has(c.id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [activeMap.nodes]);

  // 3. Điều hướng Link nội bộ giữa các ô / bản đồ (Cùng tab)
  const handleNavigate = useCallback(
    (targetMapId?: string, targetNoteId?: string) => {
      if (!targetMapId && !targetNoteId) return;

      const resolvedMap =
        (targetMapId ? maps.find((m) => m.id === targetMapId) : undefined) || activeMap;

      const findNodeInMap = (mapObj: MapData, query?: string): CustomNode | undefined => {
        if (!query) return undefined;
        const cleanQuery = query.trim();
        const lower = cleanQuery.toLowerCase();
        return (
          mapObj.nodes.find((n) => n.id === cleanQuery) ||
          mapObj.nodes.find((n) => (n.data.label || '').toLowerCase().trim() === lower) ||
          mapObj.nodes.find((n) => (n.data.label || '').toLowerCase().includes(lower))
        );
      };

      let finalMap: MapData | undefined = resolvedMap;
      let foundNode = findNodeInMap(resolvedMap, targetNoteId);

      // Nếu không chỉ định map hoặc không thấy trong map chỉ định, thử tìm trên toàn bộ các bản đồ
      if (!foundNode && targetNoteId) {
        for (const m of maps) {
          const hit = findNodeInMap(m, targetNoteId);
          if (hit) {
            finalMap = m;
            foundNode = hit;
            break;
          }
        }
      }

      if (finalMap && finalMap.id !== activeMap.id) {
        setActiveMapId(finalMap.id);
        setFloatingCards([]);
        setIsMoveMode(false);
      }

      if (foundNode) {
        setSelectedNodeId(foundNode.id);
        triggerFocusNode(foundNode.id);
        showToast(`Đã chuyển tới ô: "${foundNode.data.label || foundNode.id}"`);
      } else if (finalMap) {
        setSelectedNodeId(null);
        showToast(
          targetNoteId
            ? `Không tìm thấy ô ghi chú "${targetNoteId}".`
            : `Đã chuyển sang bản đồ: "${finalMap.name}"`
        );
      }
    },
    [maps, activeMap, triggerFocusNode, showToast]
  );

  const handleSelectNodeById = useCallback(
    (nodeId: string) => {
      handleNavigate(undefined, nodeId);
    },
    [handleNavigate]
  );

  // Lắng nghe sự kiện điều hướng & mở thẻ ghim nổi trên window
  const handleOpenFloatingCard = useCallback((nodeId: string) => {
    setFloatingCards((prev) => {
      const nextZ = ++topZIndexRef.current;
      const existing = prev.find((c) => c.id === nodeId);
      if (existing) {
        return prev.map((c) =>
          c.id === nodeId ? { ...c, isMinimized: false, zIndex: nextZ } : c
        );
      }
      const offset = (prev.length % 5) * 32;
      const cardWidth = typeof window !== 'undefined' ? Math.min(400, window.innerWidth - 32) : 390;
      const cardHeight = 360;
      return [
        ...prev,
        {
          id: nodeId,
          x: Math.max(16, 72 + offset),
          y: Math.max(70, 88 + offset),
          width: cardWidth,
          height: cardHeight,
          isMinimized: false,
          zIndex: nextZ,
        },
      ];
    });
  }, []);

  useEffect(() => {
    const onCanvasNavigate = (e: Event) => {
      const detail = (e as CustomEvent<{ mapId?: string; noteId?: string }>).detail;
      if (detail) {
        handleNavigate(detail.mapId, detail.noteId);
      }
    };

    const onOpenFloating = (e: Event) => {
      const detail = (e as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId) {
        handleOpenFloatingCard(detail.nodeId);
      }
    };

    window.addEventListener('canvas-navigate', onCanvasNavigate);
    window.addEventListener('systemnote:open-floating-card', onOpenFloating);
    return () => {
      window.removeEventListener('canvas-navigate', onCanvasNavigate);
      window.removeEventListener('systemnote:open-floating-card', onOpenFloating);
    };
  }, [handleNavigate, handleOpenFloatingCard]);

  // 4. Quản lý Bản đồ
  const handleSelectMap = useCallback((mapId: string) => {
    setActiveMapId(mapId);
    setSelectedNodeId(null);
    setFloatingCards([]);
    setIsMoveMode(false);
  }, []);

  const handleCreateMap = useCallback(
    (name: string) => {
      const now = Date.now();
      const newMapId = `map-${now}`;
      const welcomeNodeId = `node-${now}-root`;
      const newMap: MapData = {
        id: newMapId,
        name,
        nodes: [
          {
            id: welcomeNodeId,
            type: 'mindmap',
            position: { x: 420, y: 260 },
            data: {
              label: name,
              color: 'indigo',
              shape: 'pill',
              content: `<p>Chủ đề trung tâm của bản đồ <strong>${name}</strong>. Nhấp <em>Sửa</em> để viết ghi chú, chèn liên kết hoặc công thức KaTeX.</p>`,
              updatedAt: now,
            },
          },
        ],
        edges: [],
        createdAt: now,
        updatedAt: now,
      };
      setMaps((prev) => [...prev, newMap]);
      setActiveMapId(newMapId);
      setSelectedNodeId(welcomeNodeId);
      setFloatingCards([]);
      setIsMoveMode(false);
      showToast(`Đã tạo bản đồ mới "${name}"`);
    },
    [showToast]
  );

  const handleRenameMap = useCallback(
    (mapId: string, newName: string) => {
      setMaps((prev) =>
        prev.map((m) => (m.id === mapId ? { ...m, name: newName, updatedAt: Date.now() } : m))
      );
      showToast(`Đã đổi tên bản đồ thành "${newName}"`);
    },
    [showToast]
  );

  const deleteTargetMap = useMemo(
    () => (deleteTargetMapId ? maps.find((m) => m.id === deleteTargetMapId) || null : null),
    [maps, deleteTargetMapId]
  );

  const removeMapFromLocalState = useCallback(
    (mapId: string) => {
      setMaps((prev) => {
        if (prev.length <= 1) return prev;
        const remaining = prev.filter((m) => m.id !== mapId);
        if (activeMapId === mapId && remaining.length > 0) {
          setActiveMapId(remaining[0].id);
          setSelectedNodeId(null);
          setFloatingCards([]);
        }
        return remaining;
      });
    },
    [activeMapId]
  );

  const handleDeleteMap = useCallback((mapId: string) => {
    setDeleteTargetMapId(mapId);
  }, []);

  const handleConfirmDeleteLocal = useCallback(
    (mapId: string) => {
      const target = maps.find((m) => m.id === mapId);
      setDeleteTargetMapId(null);
      removeMapFromLocalState(mapId);
      showToast(
        settings.supabaseUrl && settings.supabaseAnonKey
          ? `Đã xóa bản đồ "${target?.name || ''}" trên máy này (giữ nguyên trên Cloud).`
          : `Đã xóa bản đồ "${target?.name || ''}".`
      );
    },
    [maps, removeMapFromLocalState, settings.supabaseUrl, settings.supabaseAnonKey, showToast]
  );

  const handleConfirmDeletePurge = useCallback(
    (mapId: string) => {
      const target = maps.find((m) => m.id === mapId);
      setDeleteTargetMapId(null);
      removeMapFromLocalState(mapId);

      if (settings.supabaseUrl && settings.supabaseAnonKey) {
        deleteMapAndImagesFromSupabase(mapId, target)
          .then((res) => {
            showToast(
              res.deletedImages > 0
                ? `Đã xóa sạch "${target?.name || 'bản đồ'}" và ${res.deletedImages} ảnh trên Supabase.`
                : `Đã xóa sạch "${target?.name || 'bản đồ'}" khỏi máy và Supabase.`
            );
          })
          .catch((err) => {
            console.warn('Lỗi khi xóa sạch bản đồ trên Supabase:', err);
            showToast('Đã xóa trên máy, nhưng gặp lỗi khi xóa trên Supabase.');
          });
      } else {
        showToast(`Đã xóa sạch bản đồ "${target?.name || ''}" khỏi thiết bị.`);
      }
    },
    [maps, removeMapFromLocalState, settings.supabaseUrl, settings.supabaseAnonKey, showToast]
  );

  const handleOpenDriveModal = useCallback((archiveMapId?: string) => {
    setDriveArchiveTargetId(archiveMapId || null);
    setIsDriveModalOpen(true);
  }, []);

  const handleMapBackedUp = useCallback(
    (message: string) => {
      showToast(message);
    },
    [showToast]
  );

  const handleMapArchived = useCallback(
    (archivedMapId: string, message: string) => {
      const remainingNow = maps.filter((m) => m.id !== archivedMapId);
      const now = Date.now();
      const freshMap: MapData | null =
        remainingNow.length === 0
          ? {
              id: `map-${now}`,
              name: 'Sơ Đồ Mới',
              nodes: [
                {
                  id: `node-${now}`,
                  type: 'mindmap',
                  position: { x: 400, y: 240 },
                  data: {
                    label: 'Ghi chú mới',
                    color: 'indigo',
                    shape: 'pill',
                    content: '',
                    updatedAt: now,
                  },
                },
              ],
              edges: [],
              createdAt: now,
              updatedAt: now,
            }
          : null;

      setMaps(freshMap ? [freshMap] : remainingNow);

      if (activeMapId === archivedMapId) {
        const nextActiveId = freshMap ? freshMap.id : remainingNow[0]?.id;
        if (nextActiveId) {
          setActiveMapId(nextActiveId);
          setSelectedNodeId(null);
          setFloatingCards([]);
        }
      }
      showToast(message);
    },
    [maps, activeMapId, showToast]
  );

  const handleMapRestored = useCallback(
    (restoredMap: MapData, message: string) => {
      setMaps((prev) => {
        const exists = prev.some((m) => m.id === restoredMap.id);
        if (exists) {
          return prev.map((m) => (m.id === restoredMap.id ? restoredMap : m));
        }
        return [restoredMap, ...prev];
      });
      setActiveMapId(restoredMap.id);
      setSelectedNodeId(null);
      setFloatingCards([]);
      showToast(message);
    },
    [showToast]
  );

  const handleUpdateMap = useCallback(
    (updated: Partial<MapData>) => {
      setMaps((prev) =>
        prev.map((m) =>
          m.id === activeMap.id
            ? {
                ...m,
                ...updated,
                updatedAt: Date.now(),
              }
            : m
        )
      );
    },
    [activeMap.id]
  );

  const handleReplaceMap = useCallback((nextMap: MapData) => {
    setMaps((prev) =>
      prev.some((m) => m.id === nextMap.id)
        ? prev.map((m) => (m.id === nextMap.id ? nextMap : m))
        : [nextMap, ...prev]
    );
  }, []);

  const handleCreateNewMapForAi = useCallback(
    (name: string, initialContext?: string): MapData => {
      const now = Date.now();
      const newMapId = `map-${now}-${Math.random().toString(36).slice(2, 5)}`;
      const rootNodeId = `node-${now}`;
      const newMap: MapData = {
        id: newMapId,
        name: name.trim() || 'Sơ Đồ Mới',
        context: initialContext || '',
        nodes: [
          {
            id: rootNodeId,
            type: 'mindmap',
            position: { x: 180, y: 240 },
            data: {
              label: name.trim() || 'Chủ đề chính',
              color: 'indigo',
              shape: 'pill',
              content: '',
              updatedAt: now,
            },
          },
        ],
        edges: [],
        createdAt: now,
        updatedAt: now,
      };
      setMaps((prev) => [...prev, newMap]);
      setActiveMapId(newMapId);
      setSelectedNodeId(rootNodeId);
      setFloatingCards([]);
      showToast(`AI đã tạo sơ đồ mới: "${newMap.name}"`);
      return newMap;
    },
    [showToast]
  );

  const handleFocusNodeFromAi = useCallback(
    (nodeId: string) => {
      setSidebarInitialEditMode(false);
      setSelectedNodeId(nodeId);
      triggerFocusNode(nodeId);
    },
    [triggerFocusNode]
  );

  // 5. Quản lý Ô ghi chú & Đường nối
  const handleAddNodeAtPosition = useCallback(
    (position?: { x: number; y: number }) => {
      const now = Date.now();
      const newId = `node-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const fallbackPos = {
        x: 340 + (activeMap.nodes.length % 5) * 48,
        y: 220 + (activeMap.nodes.length % 4) * 48,
      };
      const newNode: CustomNode = {
        id: newId,
        type: 'mindmap',
        position: position || fallbackPos,
        data: {
          label: 'Ô ghi chú mới',
          color: 'indigo',
          shape: 'pill',
          content: '',
          updatedAt: now,
        },
      };

      setMaps((prev) =>
        prev.map((m) =>
          m.id === activeMap.id
            ? {
                ...m,
                nodes: [...m.nodes, newNode],
                updatedAt: now,
              }
            : m
        )
      );
      setSelectedNodeId(newId);
      setSidebarInitialEditMode(false);
    },
    [activeMap.id, activeMap.nodes.length]
  );

  const handleAddNewNodeCenter = useCallback(() => {
    handleAddNodeAtPosition();
  }, [handleAddNodeAtPosition]);

  const handleUpdateNode = useCallback(
    (id: string, updates: Partial<CustomNode['data']>) => {
      const now = Date.now();
      setMaps((prev) =>
        prev.map((m) =>
          m.id === activeMap.id
            ? {
                ...m,
                nodes: m.nodes.map((n) =>
                  n.id === id
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          ...updates,
                          updatedAt: now,
                        },
                      }
                    : n
                ),
                updatedAt: now,
              }
            : m
        )
      );
    },
    [activeMap.id]
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      const now = Date.now();
      setMaps((prev) =>
        prev.map((m) =>
          m.id === activeMap.id
            ? {
                ...m,
                nodes: m.nodes.filter((n) => n.id !== id),
                edges: m.edges.filter((e) => e.source !== id && e.target !== id),
                updatedAt: now,
              }
            : m
        )
      );
      setSelectedNodeId((prevId) => (prevId === id ? null : prevId));
      setFloatingCards((prev) => prev.filter((c) => c.id !== id));
    },
    [activeMap.id]
  );

  // 6. Chuyển / Sao chép nhiều ô sang bản đồ khác
  const handleMoveOrCopyNodes = useCallback(
    (targetMapId: string, action: 'move' | 'copy') => {
      const selectedNodes = moveModalState.nodes;
      const selectedEdges = moveModalState.edges;
      if (selectedNodes.length === 0 || !targetMapId) return;

      const targetMap = maps.find((m) => m.id === targetMapId);
      if (!targetMap) return;

      const now = Date.now();
      const targetMaxY = targetMap.nodes.reduce(
        (maxY, n) => Math.max(maxY, n.position.y),
        0
      );
      const minSelY = selectedNodes.reduce(
        (minY, n) => Math.min(minY, n.position.y),
        Number.POSITIVE_INFINITY
      );
      const yShift = targetMap.nodes.length > 0 ? Math.max(0, targetMaxY + 220 - minSelY) : 0;

      const idMap = new Map<string, string>();
      const preparedNodes: CustomNode[] = selectedNodes.map((n, idx) => {
        const nextId =
          action === 'copy'
            ? `node-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`
            : targetMap.nodes.some((tn) => tn.id === n.id)
              ? `node-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`
              : n.id;
        idMap.set(n.id, nextId);
        return {
          ...n,
          id: nextId,
          selected: false,
          position: {
            x: n.position.x,
            y: n.position.y + yShift,
          },
          data: {
            ...n.data,
            updatedAt: now,
          },
        };
      });

      const preparedEdges: Edge[] = selectedEdges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e, idx) => {
          const nextSource = idMap.get(e.source)!;
          const nextTarget = idMap.get(e.target)!;
          return {
            ...e,
            id: `e-${nextSource}-${nextTarget}-${now}-${idx}`,
            source: nextSource,
            target: nextTarget,
            selected: false,
          };
        });

      const movedNodeIds = new Set(selectedNodes.map((n) => n.id));

      setMaps((prev) =>
        prev.map((m) => {
          if (m.id === targetMapId) {
            return {
              ...m,
              nodes: [...m.nodes, ...preparedNodes],
              edges: [...m.edges, ...preparedEdges],
              updatedAt: now,
            };
          }
          if (m.id === activeMap.id && action === 'move') {
            return {
              ...m,
              nodes: m.nodes.filter((n) => !movedNodeIds.has(n.id)),
              edges: m.edges.filter(
                (e) => !movedNodeIds.has(e.source) && !movedNodeIds.has(e.target)
              ),
              updatedAt: now,
            };
          }
          return m;
        })
      );

      if (action === 'move' && selectedNodeId && movedNodeIds.has(selectedNodeId)) {
        setSelectedNodeId(null);
      }

      setMoveModalState({ isOpen: false, nodes: [], edges: [] });
      setIsMoveMode(false);
      showToast(
        action === 'move'
          ? `Đã di chuyển ${selectedNodes.length} ô sang "${targetMap.name}".`
          : `Đã sao chép ${selectedNodes.length} ô sang "${targetMap.name}".`
      );
    },
    [moveModalState, maps, activeMap.id, selectedNodeId, showToast]
  );

  // 8. Xuất / Nhập dữ liệu JSON
  const handleExportBackup = useCallback(() => {
    StorageService.exportBackup(maps);
    showToast('Đã xuất file sao lưu toàn bộ kho bản đồ.');
  }, [maps, showToast]);

  const handleExportSingleMap = useCallback(
    (map: MapData) => {
      StorageService.exportSingleMap(map);
      showToast(`Đã xuất bản đồ "${map.name}".`);
    },
    [showToast]
  );

  const handleImportBackup = useCallback(async (file: File) => {
    try {
      const result = await StorageService.importBackup(file);
      setImportResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tệp không hợp lệ';
      alert(`Không thể đọc tệp nhập: ${msg}`);
    }
  }, []);

  const handleImportUpdateExisting = useCallback(
    (importedMap: MapData, existingMapId: string) => {
      const now = Date.now();
      setMaps((prev) =>
        prev.map((m) =>
          m.id === existingMapId
            ? {
                ...importedMap,
                id: existingMapId,
                updatedAt: now,
              }
            : m
        )
      );
      setActiveMapId(existingMapId);
      setSelectedNodeId(null);
      showToast(`Đã cập nhật bản đồ "${importedMap.name}".`);
    },
    [showToast]
  );

  const handleImportAddNewMap = useCallback(
    (importedMap: MapData) => {
      const now = Date.now();
      const idConflict = maps.some((m) => m.id === importedMap.id);
      const nameConflict = maps.some(
        (m) => m.name.trim().toLowerCase() === importedMap.name.trim().toLowerCase()
      );
      const finalId = idConflict
        ? `map-${now}-${Math.random().toString(36).slice(2, 6)}`
        : importedMap.id;
      const finalName = nameConflict ? `${importedMap.name} (Bản mới)` : importedMap.name;

      const addedMap: MapData = {
        ...importedMap,
        id: finalId,
        name: finalName,
        updatedAt: now,
      };
      setMaps((prev) => [...prev, addedMap]);
      setActiveMapId(finalId);
      setSelectedNodeId(null);
      showToast(`Đã thêm bản đồ mới "${finalName}".`);
    },
    [maps, showToast]
  );

  const handleImportMergeVault = useCallback(
    (importedMaps: MapData[]) => {
      if (importedMaps.length === 0) return;
      setMaps((prev) => {
        const nextMapById = new Map<string, MapData>();
        prev.forEach((m) => nextMapById.set(m.id, m));
        importedMaps.forEach((im) => {
          nextMapById.set(im.id, { ...im, updatedAt: Date.now() });
        });
        return Array.from(nextMapById.values());
      });
      showToast(`Đã gộp ${importedMaps.length} bản đồ vào kho.`);
    },
    [showToast]
  );

  const handleImportReplaceVault = useCallback(
    (importedMaps: MapData[]) => {
      const valid = importedMaps.length > 0 ? importedMaps : [DEFAULT_STARTER_MAP];
      setMaps(valid);
      setActiveMapId(valid[0].id);
      setSelectedNodeId(null);
      setFloatingCards([]);
      showToast(`Đã thay thế toàn bộ kho với ${valid.length} bản đồ.`);
    },
    [showToast]
  );

  // 9. Thao tác Thẻ Ghim Nổi
  const handleCloseFloatingCard = useCallback((id: string) => {
    setFloatingCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleUpdateFloatingCard = useCallback(
    (id: string, updates: Partial<FloatingCardState>) => {
      setFloatingCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    },
    []
  );

  const handleBringFloatingToFront = useCallback((id: string) => {
    const nextZ = ++topZIndexRef.current;
    setFloatingCards((prev) => prev.map((c) => (c.id === id ? { ...c, zIndex: nextZ } : c)));
  }, []);

  const handleTileFloatingCards = useCallback(() => {
    setFloatingCards((prev) => {
      const cols = Math.max(1, Math.floor((window.innerWidth - 100) / 380));
      return prev.map((c, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        return {
          ...c,
          x: 40 + col * 370,
          y: 80 + row * 330,
          width: 350,
          height: 310,
          isMinimized: false,
        };
      });
    });
  }, []);

  const handleCascadeFloatingCards = useCallback(() => {
    setFloatingCards((prev) =>
      prev.map((c, idx) => ({
        ...c,
        x: 72 + idx * 34,
        y: 84 + idx * 34,
        width: 390,
        height: 350,
        isMinimized: false,
        zIndex: ++topZIndexRef.current,
      }))
    );
  }, []);

  const handleEditNodeInSidebar = useCallback(
    (nodeId: string) => {
      setSidebarInitialEditMode(true);
      setSelectedNodeId(nodeId);
      triggerFocusNode(nodeId);
    },
    [triggerFocusNode]
  );

  const handleClearInitialEditMode = useCallback(() => {
    setSidebarInitialEditMode(false);
  }, []);

  const handleSelectNode = useCallback((node: CustomNode | null) => {
    setSidebarInitialEditMode(false);
    setSelectedNodeId(node ? node.id : null);
  }, []);

  const handleDoubleClickedCanvas = useCallback(
    (pos: { x: number; y: number }) => {
      handleAddNodeAtPosition(pos);
    },
    [handleAddNodeAtPosition]
  );

  const handleExitMoveMode = useCallback(() => {
    setIsMoveMode(false);
  }, []);

  const handleOpenMoveModal = useCallback((selNodes: CustomNode[], selEdges: Edge[]) => {
    setMoveModalState({ isOpen: true, nodes: selNodes, edges: selEdges });
  }, []);

  const handleCloseAllFloatingCards = useCallback(() => {
    setFloatingCards([]);
  }, []);

  if (!isStorageReady) {
    return (
      <div className="w-screen h-screen bg-[#f8fafc] flex flex-col items-center justify-center gap-3 text-slate-600">
        <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-pulse">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="text-sm font-semibold text-slate-700">Đang nạp SystemNote...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="SystemNote gặp sự cố hiển thị">
      <div
        style={{ backgroundColor: canvasTheme.canvasBg }}
        className={`w-screen h-screen flex flex-col overflow-hidden text-slate-800 select-none ${
          canvasTheme.isDark ? 'sn-theme-dark' : ''
        }`}
      >
        <Header
          maps={maps}
          activeMap={activeMap}
          canvasTheme={canvasTheme}
          onChangeCanvasTheme={handleChangeCanvasTheme}
          isMobile={isMobile}
          devicePreference={devicePreference}
          onChangeDeviceMode={changeDeviceMode}
          onSelectMap={handleSelectMap}
          onOpenNewMapModal={() => setIsNewMapModalOpen(true)}
          onRenameMap={handleRenameMap}
          onDeleteMap={handleDeleteMap}
          onAddNode={() => handleAddNodeAtPosition()}
          onExportBackup={handleExportBackup}
          onExportSingleMap={handleExportSingleMap}
          onImportBackup={handleImportBackup}
          onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
          hasSupabaseConfigured={Boolean(settings.supabaseUrl && settings.supabaseAnonKey)}
          onOpenDriveModal={handleOpenDriveModal}
          hasDriveConfigured={isDriveScriptConfigured(settings.googleDriveScriptUrl)}
          isMoveMode={isMoveMode}
          onToggleMoveMode={() => setIsMoveMode((v) => !v)}
          isMainAiOpen={isMainAiOpen}
          onToggleMainAi={() => setIsMainAiOpen((v) => !v)}
          onOpenAiSettings={() => setIsAiSettingsOpen(true)}
        />

        <main className="relative flex-1 flex min-h-0 overflow-hidden">
          <div className="relative flex-1 h-full min-w-0">
            <ReactFlowProvider>
              <CanvasWorkspace
                mapData={activeMap}
                canvasTheme={canvasTheme}
                isMobile={isMobile}
                onUpdateMap={handleUpdateMap}
                selectedNodeId={selectedNodeId}
                focusNodeId={focusNodeId}
                onSelectNode={handleSelectNode}
                onNavigate={handleNavigate}
                onDoubleClickedCanvas={handleDoubleClickedCanvas}
                onAddNewNodeCenter={handleAddNewNodeCenter}
                isMoveMode={isMoveMode}
                onExitMoveMode={handleExitMoveMode}
                onOpenMoveModal={handleOpenMoveModal}
              />
            </ReactFlowProvider>

            {floatingCards.length > 0 && (
              <FloatingCardContainer
                cards={floatingCards}
                nodes={activeMap.nodes}
                canvasTheme={canvasTheme}
                onCloseCard={handleCloseFloatingCard}
                onUpdateCard={handleUpdateFloatingCard}
                onBringToFront={handleBringFloatingToFront}
                onCloseAllCards={handleCloseAllFloatingCards}
                onTileCards={handleTileFloatingCards}
                onCascadeCards={handleCascadeFloatingCards}
                onNavigate={handleNavigate}
                onSelectNodeById={handleSelectNodeById}
                onEditNodeInSidebar={handleEditNodeInSidebar}
              />
            )}
          </div>

          <MainAiAgentPanel
            isOpen={isMainAiOpen}
            onClose={() => setIsMainAiOpen(false)}
            activeMap={activeMap}
            allMaps={maps}
            selectedNodeId={selectedNodeId}
            settings={settings}
            onReplaceMap={handleReplaceMap}
            onCreateNewMap={handleCreateNewMapForAi}
            onFocusNode={handleFocusNodeFromAi}
            onOpenAiSettings={() => setIsAiSettingsOpen(true)}
            isDark={canvasTheme.isDark}
            isMobile={isMobile}
          />

          {selectedNode && (
            <Sidebar
              selectedNode={selectedNode}
              activeMapId={activeMap.id}
              activeMap={activeMap}
              allNodes={activeMap.nodes}
              allMaps={maps}
              settings={settings}
              canvasTheme={canvasTheme}
              isMobile={isMobile}
              initialEditMode={sidebarInitialEditMode}
              onClearInitialEditMode={handleClearInitialEditMode}
              onSelectNodeById={handleSelectNodeById}
              onNavigate={handleNavigate}
              onUpdateNode={handleUpdateNode}
              onDeleteNode={handleDeleteNode}
              onClose={() => setSelectedNodeId(null)}
              onOpenFloatingCard={handleOpenFloatingCard}
              onOpenAiSettings={() => setIsAiSettingsOpen(true)}
            />
          )}
        </main>

        {/* Thông báo nhanh ở góc dưới */}
        {toastMessage && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10050] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl text-xs font-semibold text-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Các hộp thoại chức năng */}
        <NewMapModal
          isOpen={isNewMapModalOpen}
          onClose={() => setIsNewMapModalOpen(false)}
          onCreate={handleCreateMap}
        />

        <MoveNodesModal
          isOpen={moveModalState.isOpen}
          onClose={() => setMoveModalState({ isOpen: false, nodes: [], edges: [] })}
          selectedNodes={moveModalState.nodes}
          selectedEdges={moveModalState.edges}
          allMaps={maps}
          currentMapId={activeMap.id}
          onConfirm={handleMoveOrCopyNodes}
        />

        <ImportConfirmModal
          isOpen={importResult !== null}
          importResult={importResult}
          existingMaps={maps}
          onClose={() => setImportResult(null)}
          onUpdateExisting={handleImportUpdateExisting}
          onAddNewMap={handleImportAddNewMap}
          onMergeVault={handleImportMergeVault}
          onReplaceVault={handleImportReplaceVault}
        />

        <DeleteMapModal
          targetMap={deleteTargetMap}
          hasSupabaseConfigured={Boolean(settings.supabaseUrl && settings.supabaseAnonKey)}
          onClose={() => setDeleteTargetMapId(null)}
          onDeleteLocalOnly={handleConfirmDeleteLocal}
          onDeletePurgeAll={handleConfirmDeletePurge}
        />

        <SupabaseSyncModal
          isOpen={isSupabaseModalOpen}
          onClose={() => setIsSupabaseModalOpen(false)}
          maps={maps}
          onMapsLoaded={(loadedMaps) => {
            const validMaps = loadedMaps.length > 0 ? loadedMaps : [DEFAULT_STARTER_MAP];
            setMaps(validMaps);
            if (!validMaps.some((m) => m.id === activeMapId)) {
              setActiveMapId(validMaps[0].id);
              setSelectedNodeId(null);
              setFloatingCards([]);
            }
          }}
          settings={settings}
          onSaveSettings={handleSaveSettings}
        />

        <GoogleDriveModal
          isOpen={isDriveModalOpen}
          onClose={() => {
            setIsDriveModalOpen(false);
            setDriveArchiveTargetId(null);
          }}
          maps={maps}
          activeMap={activeMap}
          initialArchiveTargetId={driveArchiveTargetId}
          settings={settings}
          onSaveSettings={handleSaveSettings}
          onMapBackedUp={handleMapBackedUp}
          onMapArchived={handleMapArchived}
          onMapRestored={handleMapRestored}
        />

        <AiSettingsModal
          isOpen={isAiSettingsOpen}
          onClose={() => setIsAiSettingsOpen(false)}
          settings={settings}
          onSaveSettings={handleSaveSettings}
          isDark={canvasTheme.isDark}
        />
      </div>
    </ErrorBoundary>
  );
}

export default App;
