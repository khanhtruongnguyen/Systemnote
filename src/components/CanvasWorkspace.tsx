import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  BackgroundVariant,
  SelectionMode,
  type Connection,
  type Edge,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnConnect,
} from '@xyflow/react';
import type { CustomNode, MapData, MindMapNodeData } from '../types';
import { MindMapNode } from './nodes/MindMapNode';
import { CustomEdge } from './edges/CustomEdge';
import { COLOR_SCHEMES, CANVAS_THEMES, DEFAULT_CANVAS_THEME, type CanvasTheme } from '../constants/theme';
import { MapPin, Sparkles, Plus, BoxSelect, Scissors, ArrowRight } from 'lucide-react';

interface CanvasWorkspaceProps {
  mapData: MapData;
  canvasTheme?: CanvasTheme;
  isMobile?: boolean;
  onUpdateMap: (updated: Partial<MapData>) => void;
  selectedNodeId: string | null;
  focusNodeId?: string | null;
  onSelectNode: (node: CustomNode | null) => void;
  onNavigate?: (mapId?: string, noteId?: string) => void;
  onDoubleClickedCanvas: (position: { x: number; y: number }) => void;
  onAddNewNodeCenter: () => void;
  isMoveMode?: boolean;
  onExitMoveMode?: () => void;
  onOpenMoveModal?: (selectedNodes: CustomNode[], selectedEdges: Edge[]) => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  mapData,
  canvasTheme = CANVAS_THEMES[DEFAULT_CANVAS_THEME],
  isMobile = false,
  onUpdateMap,
  selectedNodeId,
  focusNodeId,
  onSelectNode,
  onNavigate,
  onDoubleClickedCanvas,
  onAddNewNodeCenter,
  isMoveMode = false,
  onExitMoveMode,
  onOpenMoveModal,
}) => {
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [marqueeNodes, setMarqueeNodes] = useState<CustomNode[]>([]);
  const [marqueeEdges, setMarqueeEdges] = useState<Edge[]>([]);

  const nodeTypes = useMemo(() => ({ mindmap: MindMapNode }), []);
  const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

  const mapNodesRef = useRef(mapData.nodes);
  mapNodesRef.current = mapData.nodes;
  const mapEdgesRef = useRef(mapData.edges);
  mapEdgesRef.current = mapData.edges;
  const onUpdateMapRef = useRef(onUpdateMap);
  onUpdateMapRef.current = onUpdateMap;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  const handleSelectionChange = useCallback(
    ({ nodes: selNodes }: { nodes: unknown[]; edges: Edge[] }) => {
      if (isMoveMode) {
        const cNodes = selNodes as CustomNode[];
        setMarqueeNodes(cNodes);
        const nodeIds = new Set(cNodes.map((n) => n.id));
        const internalEdges = (mapEdgesRef.current || []).filter(
          (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
        );
        setMarqueeEdges(internalEdges);
      }
    },
    [isMoveMode]
  );

  useEffect(() => {
    if (!isMoveMode) {
      setMarqueeNodes([]);
      setMarqueeEdges([]);
    }
  }, [isMoveMode]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    const nextEdges = mapEdgesRef.current.filter((e) => e.id !== edgeId);
    onUpdateMapRef.current({ edges: nextEdges });
  }, []);

  const stableNavigate = useCallback((mapId?: string, noteId?: string) => {
    onNavigateRef.current?.(mapId, noteId);
  }, []);

  const stableNodeClick = useCallback((targetId: string) => {
    const lower = targetId.toLowerCase().trim();
    const target = mapNodesRef.current.find(
      (n) =>
        n.id === targetId ||
        n.data.label?.toLowerCase().trim() === lower ||
        n.data.label?.toLowerCase().includes(lower)
    );
    if (target) onSelectNodeRef.current(target);
    else onNavigateRef.current?.(undefined, targetId);
  }, []);

  const decorateNode = useCallback(
    (node: CustomNode): CustomNode => ({
      ...node,
      selected: node.id === selectedNodeId,
      zIndex: node.id === selectedNodeId ? 9999 : node.data.shape === 'full' ? 50 : 1,
      data: {
        ...node.data,
        onNavigate: stableNavigate,
        onNodeClick: stableNodeClick,
      },
    }),
    [selectedNodeId, stableNavigate, stableNodeClick]
  );

  const formattedEdges = useMemo(() => {
    return mapData.edges.map((edge) => ({
      ...edge,
      type: 'custom',
      animated: false,
      data: {
        ...edge.data,
        onDelete: handleDeleteEdge,
      },
    }));
  }, [mapData.edges, handleDeleteEdge]);

  const formattedNodes = useMemo(
    () => mapData.nodes.map(decorateNode),
    [mapData.nodes, decorateNode]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(formattedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(formattedEdges);

  useEffect(() => {
    setNodes((prevNodes) => {
      const prevMap = new Map(prevNodes.map((pn) => [pn.id, pn]));
      return mapData.nodes.map((node) => {
        const prev = prevMap.get(node.id);
        const decorated = decorateNode(node);
        return prev?.measured ? { ...decorated, measured: prev.measured } : decorated;
      });
    });
  }, [mapData.id, mapData.nodes, decorateNode, setNodes]);

  useEffect(() => {
    setEdges(
      mapData.edges.map((edge) => ({
        ...edge,
        type: 'custom',
        animated: false,
        data: {
          ...edge.data,
          onDelete: handleDeleteEdge,
        },
      }))
    );
  }, [mapData.id, mapData.edges, handleDeleteEdge, setEdges]);

  // Căn giữa viewport khi chuyển hướng tới ô qua link nội bộ
  useEffect(() => {
    if (!focusNodeId) return;
    const target = mapData.nodes.find((n) => n.id === focusNodeId);
    if (target) {
      setCenter(target.position.x + 80, target.position.y + 30, {
        zoom: 1,
        duration: 350,
      });
    }
  }, [focusNodeId, mapData.nodes, setCenter]);

  const sanitizeNodes = useCallback((currentNodes: unknown[]): CustomNode[] => {
    return currentNodes.map((n) => {
      const node = n as CustomNode;
      const rawData = (node.data || {}) as Record<string, unknown>;
      const { onNavigate: _nav, onNodeClick: _clk, ...cleanData } = rawData;
      return {
        ...node,
        data: cleanData as MindMapNodeData,
      };
    });
  }, []);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      const hasStructuralChange = changes.some((c) => c.type === 'remove');
      if (hasStructuralChange) {
        setNodes((currentNodes) => {
          onUpdateMap({ nodes: sanitizeNodes(currentNodes) });
          return currentNodes;
        });
      }
    },
    [onNodesChange, onUpdateMap, setNodes, sanitizeNodes]
  );

  const handleNodeDragStop = useCallback(() => {
    setNodes((currentNodes) => {
      onUpdateMap({ nodes: sanitizeNodes(currentNodes) });
      return currentNodes;
    });
  }, [onUpdateMap, setNodes, sanitizeNodes]);

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      const hasStructuralChange = changes.some((c) => c.type === 'remove');
      if (hasStructuralChange) {
        setEdges((currentEdges) => {
          onUpdateMapRef.current({ edges: currentEdges });
          return currentEdges;
        });
      }
    },
    [onEdgesChange, setEdges]
  );

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        type: 'custom',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        data: {
          onDelete: handleDeleteEdge,
        },
      };

      setEdges((eds) => {
        const nextEdges = addEdge(newEdge, eds);
        onUpdateMapRef.current({ edges: nextEdges });
        return nextEdges;
      });
    },
    [setEdges, handleDeleteEdge]
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      if (event.shiftKey) {
        window.dispatchEvent(
          new CustomEvent('systemnote:open-floating-card', { detail: { nodeId: node.id } })
        );
        return;
      }
      onSelectNode(node as CustomNode);
    },
    [onSelectNode]
  );

  const handleEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          selected: e.id === edge.id,
        }))
      );
    },
    [setEdges]
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [onSelectNode, setEdges]);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).closest('.react-flow__node')) {
        return;
      }
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      onDoubleClickedCanvas(position);
    },
    [screenToFlowPosition, onDoubleClickedCanvas]
  );

  const isDark = canvasTheme.isDark;

  return (
    <div
      className="w-full h-full relative transition-colors duration-200"
      style={{ backgroundColor: canvasTheme.canvasBg }}
      onDoubleClick={handleDoubleClick}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        elevateNodesOnSelect={true}
        connectionRadius={40}
        connectionLineStyle={{ stroke: '#94a3b8', strokeWidth: 1.5 }}
        onNodesChange={handleNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: isMobile ? 0.4 : 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        defaultEdgeOptions={{
          type: 'custom',
          animated: false,
        }}
        onlyRenderVisibleElements={false}
        proOptions={{ hideAttribution: true }}
        selectionOnDrag={isMoveMode}
        panOnDrag={isMoveMode ? [1, 2] : true}
        selectionMode={SelectionMode.Partial}
        onSelectionChange={handleSelectionChange}
      >
        {/* Nền lưới chấm theo chế độ màu nền */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={isMobile ? 20 : 24}
          size={1.1}
          color={canvasTheme.dotColor}
          style={{ backgroundColor: canvasTheme.canvasBg }}
        />

        {!isMobile && (
          <Controls
            showInteractive={false}
            className="!bottom-5 !left-5 !rounded-[10px] overflow-hidden"
          />
        )}

        {/* Nút bật/tắt Minimap trên Desktop */}
        {!isMobile && !showMiniMap && (
          <button
            type="button"
            onClick={() => setShowMiniMap(true)}
            title="Hiện bản đồ thu nhỏ"
            className={`absolute bottom-5 right-5 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-xs font-medium shadow-[0_2px_10px_rgba(15,23,42,0.06)] cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#171b24]/95 hover:bg-[#1e2430] border-slate-800 text-slate-300 hover:text-white'
                : 'bg-white/95 hover:bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>Bản đồ nhỏ</span>
          </button>
        )}

        {showMiniMap && !isMobile && (
          <div className="absolute bottom-5 right-5 z-20">
            <div
              className={`backdrop-blur-md border rounded-[10px] overflow-hidden shadow-[0_4px_16px_rgba(15,23,42,0.08)] p-1.5 ${
                isDark ? 'bg-[#171b24]/95 border-slate-800' : 'bg-white/95 border-slate-200'
              }`}
            >
              <div
                className={`flex items-center justify-between px-2 py-1 text-[10px] font-medium border-b mb-1 ${
                  isDark ? 'text-slate-400 border-slate-800' : 'text-slate-500 border-slate-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 text-slate-400" />
                  Bản đồ thu nhỏ
                </span>
                <button
                  type="button"
                  onClick={() => setShowMiniMap(false)}
                  className={isDark ? 'hover:text-white cursor-pointer' : 'hover:text-slate-900 cursor-pointer'}
                  title="Ẩn minimap"
                >
                  ✕
                </button>
              </div>
              <MiniMap
                nodeColor={(n) => {
                  const nodeData = n.data as MindMapNodeData;
                  const colorKey = nodeData?.color || 'indigo';
                  return COLOR_SCHEMES[colorKey]?.accent || '#64748b';
                }}
                maskColor={isDark ? 'rgba(15, 18, 24, 0.72)' : 'rgba(241, 245, 249, 0.72)'}
                style={{ backgroundColor: canvasTheme.canvasBg }}
                className="!relative !bottom-0 !right-0 !m-0 !w-40 !h-28 !rounded-lg"
              />
            </div>
          </div>
        )}
      </ReactFlow>

      {/* Mobile FAB */}
      {isMobile && !selectedNodeId && (
        <div
          style={{
            bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          }}
          className="absolute right-6 z-30 flex flex-col items-end gap-3 pointer-events-auto"
        >
          <button
            type="button"
            onClick={onAddNewNodeCenter}
            className="flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg active:scale-95 transition-transform"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
            <span>Thêm ô mới</span>
          </button>
        </div>
      )}

      {/* Move Mode Top Banner */}
      {isMoveMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md border border-amber-300 shadow-[0_4px_16px_rgba(15,23,42,0.08)] rounded-xl px-4 py-2 flex items-center gap-3 text-xs text-slate-700 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <BoxSelect className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Chế độ Di chuyển:</strong> Kéo chuột trái trên bảng để khoanh chọn các ô cần chuyển.
            </span>
          </div>
          {onExitMoveMode && (
            <button
              type="button"
              onClick={onExitMoveMode}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer shrink-0 transition-colors"
            >
              Thoát
            </button>
          )}
        </div>
      )}

      {/* Move Mode Selection Action Bar */}
      {isMoveMode && marqueeNodes.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md border border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.1)] rounded-xl px-4 py-2.5 flex items-center gap-4 text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>
              Đã khoanh chọn <strong>{marqueeNodes.length} ô</strong> ({marqueeEdges.length} liên kết)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMarqueeNodes([]);
                setMarqueeEdges([]);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer transition-colors"
            >
              Khoanh lại
            </button>

            {onOpenMoveModal && (
              <button
                type="button"
                onClick={() => onOpenMoveModal(marqueeNodes, marqueeEdges)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-xs cursor-pointer transition-colors"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Chuyển sang Map khác</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty Map Helper */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 px-4">
          <div className="bg-white/95 border border-slate-200 backdrop-blur-md rounded-2xl p-6 text-center max-w-sm pointer-events-auto shadow-xl">
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">Sơ đồ đang trống</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              {isMobile
                ? 'Nhấn nút bên dưới để tạo ô ghi chú đầu tiên.'
                : 'Nhấp đúp chuột vào bất kỳ vị trí nào để tạo ô ghi chú đầu tiên.'}
            </p>
            <button
              type="button"
              onClick={onAddNewNodeCenter}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm cursor-pointer"
            >
              + Tạo ghi chú đầu tiên
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
