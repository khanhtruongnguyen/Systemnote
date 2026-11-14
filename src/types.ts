import type { Node, Edge } from '@xyflow/react';

export type NodeColor =
  | 'purple'
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'indigo'
  | 'graphite';

export type NodeShape = 'pill' | 'circle' | 'card' | 'full';

export type CanvasThemeId = 'light' | 'warm' | 'slate' | 'dark';

export interface MindMapNodeData {
  label: string;
  color: NodeColor;
  shape: NodeShape;
  content: string; // HTML từ trình soạn thảo Quill
  updatedAt?: number;
  [key: string]: unknown;
}

export type CustomNode = Node<MindMapNodeData, 'mindmap'>;

export interface FloatingCardState {
  id: string; // matches node.id
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized?: boolean;
  isEditing?: boolean;
  zIndex: number;
}

export interface MapData {
  id: string;
  name: string;
  nodes: CustomNode[];
  edges: Edge[];
  context?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  activeMapId: string;
  canvasTheme?: CanvasThemeId;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseAutoSync?: boolean;
  supabaseRealtime?: boolean;
  supabaseUserEmail?: string;
  lastCloudSyncedAt?: number;
  googleDriveScriptUrl?: string;
  lastDriveSyncedAt?: number;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiPrimaryModel?: string;
  aiFallbackModels?: string[];
  aiDisabledModels?: string[];
  aiAutoRotate?: boolean;
  aiUseWebSearchByDefault?: boolean;
  aiUseContextByDefault?: boolean;
  aiAlwaysWrapInCodeFrame?: boolean;
  aiTemperature?: number;
  aiMaxSteps?: number;
}

export interface AiToolTrace {
  id: string;
  toolName: string;
  summary: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
}

export interface AiCreatedNodeRef {
  nodeId: string;
  label: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  modelUsed?: string;
  rotatedModels?: string[];
  traces?: AiToolTrace[];
  createdNodes?: AiCreatedNodeRef[];
  undoSnapshotId?: string;
  isError?: boolean;
}

export interface DriveFileItem {
  id: string;
  name: string;
  updatedAt: number;
  size?: number;
  url?: string;
}

export interface SingleMapExportPayload {
  version: 1;
  type: 'systemnote_single_map';
  exportedAt: number;
  source: 'web';
  map: MapData;
}

export type ImportDataResult =
  | { type: 'single_map'; map: MapData }
  | { type: 'multi_maps'; maps: MapData[] };
