import type { Edge } from '@xyflow/react';
import type {
  AiCreatedNodeRef,
  CustomNode,
  MapData,
  MindMapNodeData,
  NodeColor,
  NodeShape,
} from '../types';
import { computeHierarchicalTreeLayout } from '../utils/treeLayout';
import { stripHtmlToText, type KatexFrameMode } from '../utils/katexHelper';
import {
  createCodeFrameHtml,
  deleteNoteBlocksInHtml,
  formatNoteBlocksForAi,
  insertCodeFrameIntoHtml,
  parseNoteBlocks,
  reorganizeNoteHtml,
  updateCodeFrameInHtml,
} from '../utils/noteBlockHelper';
import type { AiToolDefinition } from './aiClient';
import { fetchWebPage, searchWebSources } from './webSearchService';

const VALID_COLORS: NodeColor[] = [
  'purple',
  'blue',
  'emerald',
  'amber',
  'rose',
  'cyan',
  'indigo',
  'graphite',
];

const VALID_SHAPES: NodeShape[] = ['pill', 'circle', 'card', 'full'];

function normalizeColor(raw: unknown, fallback: NodeColor = 'indigo'): NodeColor {
  return typeof raw === 'string' && VALID_COLORS.includes(raw as NodeColor)
    ? (raw as NodeColor)
    : fallback;
}

function normalizeShape(raw: unknown, fallback: NodeShape): NodeShape {
  return typeof raw === 'string' && VALID_SHAPES.includes(raw as NodeShape)
    ? (raw as NodeShape)
    : fallback;
}

export function chooseBestEdgeHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: 'right-src', targetHandle: 'left' }
      : { sourceHandle: 'left-src', targetHandle: 'right' };
  }
  return dy >= 0
    ? { sourceHandle: 'bottom-src', targetHandle: 'top' }
    : { sourceHandle: 'top-src', targetHandle: 'bottom' };
}

function makeEdge(
  source: string,
  target: string,
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  suffix: string | number
): Edge {
  const handles = chooseBestEdgeHandles(sourcePos, targetPos);
  return {
    id: `e-${source}-${target}-${Date.now()}-${suffix}`,
    source,
    target,
    sourceHandle: handles.sourceHandle,
    targetHandle: handles.targetHandle,
    type: 'custom',
    animated: false,
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
  };
}

function createSharedWebTools(allowWebSearch: boolean): AiToolDefinition[] {
  return [
    {
      name: 'web_search',
      description:
        'Tìm kiếm kiến thức, tài liệu, định nghĩa, bài giảng trên Internet (Bing/Wikipedia/DuckDuckGo).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa tìm kiếm rõ ràng' },
          lang: {
            type: 'string',
            enum: ['vi', 'en'],
            description: 'Ngôn ngữ ưu tiên (vi hoặc en)',
          },
          limit: { type: 'number', description: 'Số kết quả tối đa (1..10, mặc định 6)' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        if (!allowWebSearch) {
          return {
            ok: false,
            summary: 'Tìm kiếm mạng đang bị tắt',
            error: 'Người dùng đã tắt tùy chọn "Nguồn mạng" trong khung chat AI.',
          };
        }
        const query = String(args.query || '').trim();
        const lang = args.lang === 'en' ? 'en' : 'vi';
        const limit = typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 10) : 6;
        const res = await searchWebSources(query, lang, limit);
        if (res.results.length === 0) {
          return {
            ok: false,
            summary: `Không tìm thấy kết quả cho "${query}"`,
            error: res.error || 'Không có kết quả phù hợp',
          };
        }
        return {
          ok: true,
          summary: `Tìm thấy ${res.results.length} nguồn cho "${query}"`,
          data: res,
        };
      },
    },
    {
      name: 'fetch_url',
      description: 'Đọc nội dung chi tiết từ một URL kết quả web để lấy thông tin viết bài chính xác.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Địa chỉ URL http/https cần đọc' },
          max_chars: { type: 'number', description: 'Giới hạn ký tự trả về (mặc định 9000)' },
        },
        required: ['url'],
      },
      execute: async (args) => {
        if (!allowWebSearch) {
          return {
            ok: false,
            summary: 'Tìm kiếm mạng đang bị tắt',
            error: 'Người dùng đã tắt tùy chọn "Nguồn mạng" trong khung chat AI.',
          };
        }
        const url = String(args.url || '').trim();
        const maxChars =
          typeof args.max_chars === 'number' ? Math.min(Math.max(args.max_chars, 500), 20000) : 9000;
        const res = await fetchWebPage(url, maxChars);
        if (!res.content || res.error) {
          return {
            ok: false,
            summary: `Không đọc được ${url}`,
            error: res.error || 'Nội dung rỗng',
          };
        }
        return {
          ok: true,
          summary: `Đã đọc ${res.content.length} ký tự từ ${url}`,
          data: res,
        };
      },
    },
  ];
}

function avoidNodeOverlap(
  candidate: { x: number; y: number },
  existingNodes: CustomNode[]
): { x: number; y: number } {
  let x = Math.round(candidate.x);
  let y = Math.round(candidate.y);
  for (let attempt = 0; attempt < 24; attempt++) {
    const collides = existingNodes.some(
      (n) => Math.abs(n.position.x - x) < 220 && Math.abs(n.position.y - y) < 105
    );
    if (!collides) break;
    y += 120;
  }
  return { x, y };
}

function findNodeByIdOrLabel(nodes: CustomNode[], nodeId?: unknown, labelQuery?: unknown): CustomNode | undefined {
  if (typeof nodeId === 'string' && nodeId.trim()) {
    const exact = nodes.find((n) => n.id === nodeId.trim());
    if (exact) return exact;
  }
  if (typeof labelQuery === 'string' && labelQuery.trim()) {
    const needle = labelQuery.trim().toLowerCase();
    return (
      nodes.find((n) => (n.data.label || '').toLowerCase() === needle) ||
      nodes.find((n) => (n.data.label || '').toLowerCase().includes(needle))
    );
  }
  return undefined;
}

export interface MainAgentContext {
  getWorkingMap: () => MapData;
  getAllMaps: () => MapData[];
  updateWorkingMap: (nextMap: MapData) => void;
  onCreateNewMap: (name: string, initialContext?: string) => MapData;
  onSelectNode: (nodeId: string) => void;
  allowWebSearch: boolean;
  allowContext: boolean;
  alwaysWrapInCodeFrame: boolean;
  onNodeCreatedOrUpdated?: (ref: AiCreatedNodeRef) => void;
  onDidMutateMap?: () => void;
}

export function buildMainAgentSystemPrompt(map: MapData, ctx: { allowWebSearch: boolean; allowContext: boolean; alwaysWrapInCodeFrame: boolean }): string {
  const ctxLen = (map.context || '').trim().length;
  return [
    'Bạn là AI Agent điều khiển không gian sơ đồ tư duy SystemNote (bản đồ ghi chú học tập).',
    'Hãy trả lời và thực thi yêu cầu bằng tiếng Việt rõ ràng, chính xác.',
    '',
    'NGUYÊN TẮC BẮT BUỘC:',
    '1. Khi người dùng ra lệnh tạo nhánh, thêm ô, sửa nội dung, nối dây, xóa ô, sắp xếp sơ đồ... hãy TRỰC TIẾP gọi công cụ thực thi, không chỉ nói suông.',
    '2. Trước khi tạo nhánh mới hoặc sửa sơ đồ hiện tại, nên gọi `get_map_overview` để biết chính xác ID và vị trí các ô hiện có.',
    ctx.allowContext
      ? `3. Tab hiện tại (${map.name}) đang có phần "Ngữ cảnh" Markdown dài ${ctxLen} ký tự. Nếu yêu cầu liên quan tới bài học/tài liệu của người dùng hoặc có nội dung ngữ cảnh, hãy gọi \`read_lesson_context\` để đọc đầy đủ trước khi chia nhánh hoặc viết nội dung.`
      : '3. Người dùng đang TẮT quyền đọc "Ngữ cảnh" ở phiên này.',
    ctx.allowWebSearch
      ? '4. Khi cần kiến thức ngoài hoặc người dùng bảo tìm tài liệu trên mạng, dùng `web_search` rồi `fetch_url` để đọc nguồn đáng tin cậy và trích nguồn cuối bài.'
      : '4. Người dùng đang TẮT quyền tìm kiếm mạng ở phiên này.',
    ctx.alwaysWrapInCodeFrame
      ? '5. MỌI nội dung chi tiết bạn chèn vào ô ghi chú (tham số `markdown_content`) sẽ TỰ ĐỘNG được hệ thống đóng gói vào **Khung Mã** (`Markdown + KaTeX`) để giữ nguyên định dạng. Vì vậy hãy viết `markdown_content` bằng Markdown chuẩn (`#`, `##`, `**đậm**`, danh sách, bảng, công thức `$...$` / `$$...$$`, code block ```) — KHÔNG tự viết thẻ HTML rời rạc.'
      : '5. Viết nội dung ghi chú dưới dạng Markdown + KaTeX rõ ràng.',
    '6. Sau khi hoàn thành hành động, báo lại ngắn gọn cho người dùng biết đã tạo/sửa những ô nào, nguồn đã dùng (nếu có).',
  ].join('\n');
}

export function createMainMapAgentTools(ctx: MainAgentContext): AiToolDefinition[] {
  const paletteCycle: NodeColor[] = ['indigo', 'blue', 'emerald', 'amber', 'purple', 'cyan', 'rose'];

  return [
    {
      name: 'get_map_overview',
      description: 'Xem toàn bộ danh sách ô ghi chú, kết nối cạnh và thông tin cơ bản của bản đồ hiện tại.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: () => {
        const map = ctx.getWorkingMap();
        const childrenByNode = new Map<string, string[]>();
        const parentsByNode = new Map<string, string[]>();
        for (const e of map.edges) {
          childrenByNode.set(e.source, [...(childrenByNode.get(e.source) || []), e.target]);
          parentsByNode.set(e.target, [...(parentsByNode.get(e.target) || []), e.source]);
        }

        const nodes = map.nodes.map((n) => ({
          id: n.id,
          label: n.data.label || 'Chưa đặt tên',
          color: n.data.color,
          shape: n.data.shape,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
          preview: stripHtmlToText(n.data.content || '').slice(0, 140),
          hasCodeFrame: (n.data.content || '').includes('sn-katex-frame'),
          parentIds: parentsByNode.get(n.id) || [],
          childIds: childrenByNode.get(n.id) || [],
        }));

        return {
          ok: true,
          summary: `Bản đồ "${map.name}": ${nodes.length} ô, ${map.edges.length} liên kết`,
          data: {
            mapId: map.id,
            mapName: map.name,
            contextLength: (map.context || '').trim().length,
            allMaps: ctx.getAllMaps().map((m) => ({ id: m.id, name: m.name, nodeCount: m.nodes.length })),
            nodes,
            edges: map.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
          },
        };
      },
    },
    {
      name: 'get_node_detail',
      description: 'Đọc toàn bộ nội dung chi tiết (bao gồm các Khung Mã) của một ô ghi chú cụ thể.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID chính xác của ô cần đọc' },
          label_query: { type: 'string', description: 'Tìm theo tiêu đề gần đúng nếu không có ID' },
        },
      },
      execute: (args) => {
        const map = ctx.getWorkingMap();
        const target = findNodeByIdOrLabel(map.nodes, args.node_id, args.label_query);
        if (!target) {
          return {
            ok: false,
            summary: 'Không tìm thấy ô ghi chú',
            error: 'Không tìm thấy ô khớp với node_id hoặc label_query.',
          };
        }
        return {
          ok: true,
          summary: `Đã đọc ô "${target.data.label}"`,
          data: {
            id: target.id,
            label: target.data.label,
            color: target.data.color,
            shape: target.data.shape,
            position: target.position,
            blocksFormatted: formatNoteBlocksForAi(target.data.content || ''),
          },
        };
      },
    },
    {
      name: 'read_lesson_context',
      description: 'Đọc nội dung bài học Markdown mà người dùng đã dán vào mục "Ngữ cảnh" của bản đồ này.',
      parameters: {
        type: 'object',
        properties: {
          offset: { type: 'number', description: 'Vị trí ký tự bắt đầu đọc (mặc định 0)' },
          max_chars: { type: 'number', description: 'Số ký tự tối đa mỗi lần đọc (mặc định 14000)' },
        },
      },
      execute: (args) => {
        if (!ctx.allowContext) {
          return {
            ok: false,
            summary: 'Đã tắt quyền đọc Ngữ cảnh',
            error: 'Người dùng đang tắt tùy chọn dùng "Ngữ cảnh" trong phiên chat này.',
          };
        }
        const map = ctx.getWorkingMap();
        const fullContext = (map.context || '').trim();
        if (!fullContext) {
          return {
            ok: true,
            summary: 'Ngữ cảnh hiện đang trống',
            data: { totalLength: 0, content: '(Người dùng chưa dán nội dung nào vào mục Ngữ cảnh)' },
          };
        }
        const offset = typeof args.offset === 'number' ? Math.max(0, args.offset) : 0;
        const maxChars =
          typeof args.max_chars === 'number' ? Math.min(Math.max(args.max_chars, 500), 24000) : 14000;
        const slice = fullContext.slice(offset, offset + maxChars);
        return {
          ok: true,
          summary: `Đã đọc Ngữ cảnh (${slice.length}/${fullContext.length} ký tự)`,
          data: {
            totalLength: fullContext.length,
            offset,
            returnedLength: slice.length,
            hasMore: offset + maxChars < fullContext.length,
            content: slice,
          },
        };
      },
    },
    {
      name: 'update_lesson_context',
      description: 'Ghi thêm hoặc cập nhật nội dung Markdown vào mục "Ngữ cảnh" của bản đồ hiện tại.',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['append', 'replace'], description: 'Nối thêm hoặc thay thế toàn bộ' },
          markdown: { type: 'string', description: 'Nội dung Markdown cần lưu vào Ngữ cảnh' },
        },
        required: ['mode', 'markdown'],
      },
      execute: (args) => {
        const map = ctx.getWorkingMap();
        const md = String(args.markdown || '');
        const nextContext =
          args.mode === 'append' && (map.context || '').trim()
            ? `${(map.context || '').trim()}\n\n${md}`
            : md;
        ctx.onDidMutateMap?.();
        ctx.updateWorkingMap({
          ...map,
          context: nextContext,
          updatedAt: Date.now(),
        });
        return {
          ok: true,
          summary: `Đã ${args.mode === 'append' ? 'thêm vào' : 'cập nhật'} Ngữ cảnh (${nextContext.length} ký tự)`,
        };
      },
    },
    ...createSharedWebTools(ctx.allowWebSearch),
    {
      name: 'create_nodes_and_branches',
      description:
        'Tạo 1 hoặc nhiều ô ghi chú / nhánh con mới (hỗ trợ tạo cả cây nhiều tầng bằng temp_id & parent_temp_id), tự động nối dây và xếp vị trí gọn.',
      parameters: {
        type: 'object',
        properties: {
          parent_node_id: {
            type: 'string',
            description: 'ID ô cha có sẵn để nối các nhánh cấp 1 từ đó (tùy chọn).',
          },
          parent_label: {
            type: 'string',
            description: 'Tên gần đúng của ô cha có sẵn nếu không có parent_node_id (tùy chọn).',
          },
          auto_layout: {
            type: 'boolean',
            description: 'Nếu true sẽ chạy sắp xếp lại toàn bộ sơ đồ dạng cây sau khi tạo nhánh.',
          },
          items: {
            type: 'array',
            description: 'Danh sách các ô mới cần tạo',
            items: {
              type: 'object',
              properties: {
                temp_id: {
                  type: 'string',
                  description: 'ID tạm (vd "n1") để các ô khác trong cùng mảng trỏ parent_temp_id vào',
                },
                parent_temp_id: {
                  type: 'string',
                  description: 'Trỏ tới temp_id của ô khác trong cùng đợt tạo (hoặc bỏ trống để nối vào parent_node_id)',
                },
                parent_node_id: {
                  type: 'string',
                  description: 'Ô cha có sẵn riêng cho mục này (ưu tiên hơn parent_node_id chung)',
                },
                label: { type: 'string', description: 'Tiêu đề ngắn gọn của ô ghi chú' },
                color: {
                  type: 'string',
                  enum: VALID_COLORS,
                },
                shape: {
                  type: 'string',
                  enum: VALID_SHAPES,
                  description: 'Chọn "card" nếu có nội dung dài, "pill" nếu làm nhánh tiêu đề gọn',
                },
                markdown_content: {
                  type: 'string',
                  description: 'Nội dung chi tiết dạng Markdown + KaTeX; hệ thống sẽ tự đặt vào Khung Mã.',
                },
                code_frame_title: {
                  type: 'string',
                  description: 'Tiêu đề hiển thị trên thanh Khung Mã (tùy chọn)',
                },
              },
              required: ['label'],
            },
          },
        },
        required: ['items'],
      },
      execute: (args) => {
        const rawItems = Array.isArray(args.items) ? (args.items as Array<Record<string, unknown>>) : [];
        if (rawItems.length === 0) {
          return {
            ok: false,
            summary: 'Danh sách nhánh cần tạo bị rỗng',
            error: 'Tham số items phải có ít nhất 1 phần tử.',
          };
        }

        const map = ctx.getWorkingMap();
        const now = Date.now();
        const defaultParent = findNodeByIdOrLabel(map.nodes, args.parent_node_id, args.parent_label);

        const workingNodes: CustomNode[] = [...map.nodes];
        const workingEdges: Edge[] = [...map.edges];
        const tempToRealId = new Map<string, string>();
        const createdRefs: AiCreatedNodeRef[] = [];

        // Sắp đặt vị trí tránh chồng lấn theo từng cha
        const childCounterByParent = new Map<string, number>();

        rawItems.forEach((item, idx) => {
          const label = String(item.label || `Nhánh mới ${idx + 1}`).trim();
          const newId = `node-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
          if (typeof item.temp_id === 'string' && item.temp_id.trim()) {
            tempToRealId.set(item.temp_id.trim(), newId);
          }

          let resolvedParent: CustomNode | undefined;
          if (typeof item.parent_temp_id === 'string' && item.parent_temp_id.trim()) {
            const realParentId = tempToRealId.get(item.parent_temp_id.trim());
            resolvedParent = workingNodes.find((n) => n.id === realParentId);
          } else if (typeof item.parent_node_id === 'string' && item.parent_node_id.trim()) {
            resolvedParent = workingNodes.find((n) => n.id === String(item.parent_node_id).trim());
          } else {
            resolvedParent = defaultParent;
          }

          let rawPos: { x: number; y: number };
          if (resolvedParent) {
            const pCount = childCounterByParent.get(resolvedParent.id) || 0;
            childCounterByParent.set(resolvedParent.id, pCount + 1);
            const yOffset = (pCount - 1) * 140;
            rawPos = {
              x: resolvedParent.position.x + 330,
              y: resolvedParent.position.y + yOffset,
            };
          } else {
            const baseX = workingNodes.length > 0 ? workingNodes[0].position.x + 320 : 120;
            const baseY = workingNodes.length > 0 ? workingNodes[0].position.y + idx * 140 : 120 + idx * 140;
            rawPos = { x: baseX, y: baseY };
          }

          const finalPos = avoidNodeOverlap(rawPos, workingNodes);
          const mdContent = typeof item.markdown_content === 'string' ? item.markdown_content.trim() : '';
          const frameTitle =
            typeof item.code_frame_title === 'string' && item.code_frame_title.trim()
              ? item.code_frame_title.trim()
              : label;

          const htmlContent = mdContent
            ? createCodeFrameHtml(mdContent, 'mixed', frameTitle)
            : '';

          const defaultShape: NodeShape = mdContent ? 'card' : 'pill';
          const defaultColor = paletteCycle[(workingNodes.length + idx) % paletteCycle.length];

          const newNode: CustomNode = {
            id: newId,
            type: 'mindmap',
            position: finalPos,
            data: {
              label,
              color: normalizeColor(item.color, defaultColor),
              shape: normalizeShape(item.shape, defaultShape),
              content: htmlContent,
              updatedAt: now,
            },
          };

          workingNodes.push(newNode);
          const ref = { nodeId: newId, label };
          createdRefs.push(ref);
          ctx.onNodeCreatedOrUpdated?.(ref);

          if (resolvedParent) {
            workingEdges.push(makeEdge(resolvedParent.id, newId, resolvedParent.position, finalPos, idx));
          }
        });

        let finalNodes = workingNodes;
        let finalEdges = workingEdges;
        if (args.auto_layout === true || (args.auto_layout !== false && createdRefs.length >= 3)) {
          finalNodes = computeHierarchicalTreeLayout(workingNodes, workingEdges);
          const nodePosMap = new Map(finalNodes.map((n) => [n.id, n.position]));
          finalEdges = workingEdges.map((e) => {
            const sp = nodePosMap.get(e.source);
            const tp = nodePosMap.get(e.target);
            if (!sp || !tp) return e;
            const handles = chooseBestEdgeHandles(sp, tp);
            return { ...e, ...handles };
          });
        }

        ctx.onDidMutateMap?.();
        ctx.updateWorkingMap({
          ...map,
          nodes: finalNodes,
          edges: finalEdges,
          updatedAt: Date.now(),
        });

        if (createdRefs.length > 0) {
          ctx.onSelectNode(createdRefs[0].nodeId);
        }

        return {
          ok: true,
          summary: `Đã tạo ${createdRefs.length} nhánh/ô mới`,
          data: {
            createdNodes: createdRefs,
            parentNodeId: defaultParent?.id || null,
          },
        };
      },
    },
    {
      name: 'update_node',
      description: 'Cập nhật tiêu đề, màu, hình dáng hoặc nội dung (trong Khung Mã) của một ô ghi chú.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID của ô cần sửa' },
          label_query: { type: 'string', description: 'Tìm theo tiêu đề nếu không có node_id' },
          new_label: { type: 'string', description: 'Tiêu đề mới' },
          color: { type: 'string', enum: VALID_COLORS },
          shape: { type: 'string', enum: VALID_SHAPES },
          markdown_content: {
            type: 'string',
            description: 'Nội dung Markdown + KaTeX sẽ được đưa vào Khung Mã',
          },
          content_action: {
            type: 'string',
            enum: ['replace', 'append_code_frame'],
            description: 'Thay toàn bộ nội dung ô hay thêm một Khung Mã mới xuống cuối',
          },
          code_frame_title: { type: 'string', description: 'Tiêu đề Khung Mã' },
        },
      },
      execute: (args) => {
        const map = ctx.getWorkingMap();
        const target = findNodeByIdOrLabel(map.nodes, args.node_id, args.label_query);
        if (!target) {
          return {
            ok: false,
            summary: 'Không tìm thấy ô cần sửa',
            error: 'Vui lòng kiểm tra lại node_id hoặc label_query.',
          };
        }

        const now = Date.now();
        const nextLabel =
          typeof args.new_label === 'string' && args.new_label.trim()
            ? args.new_label.trim()
            : target.data.label;

        let nextContent = target.data.content || '';
        if (typeof args.markdown_content === 'string') {
          const md = args.markdown_content.trim();
          const frameTitle =
            typeof args.code_frame_title === 'string' && args.code_frame_title.trim()
              ? args.code_frame_title.trim()
              : nextLabel;
          nextContent = insertCodeFrameIntoHtml(nextContent, {
            code: md,
            mode: 'mixed',
            title: frameTitle,
            position: args.content_action === 'append_code_frame' ? 'append' : 'replace_all',
          });
        }

        const updatedNode: CustomNode = {
          ...target,
          data: {
            ...target.data,
            label: nextLabel,
            color: normalizeColor(args.color, target.data.color),
            shape: normalizeShape(args.shape, target.data.shape),
            content: nextContent,
            updatedAt: now,
          },
        };

        ctx.onDidMutateMap?.();
        ctx.updateWorkingMap({
          ...map,
          nodes: map.nodes.map((n) => (n.id === target.id ? updatedNode : n)),
          updatedAt: now,
        });

        const ref = { nodeId: target.id, label: nextLabel };
        ctx.onNodeCreatedOrUpdated?.(ref);

        return {
          ok: true,
          summary: `Đã cập nhật ô "${nextLabel}"`,
          data: ref,
        };
      },
    },
    {
      name: 'delete_nodes',
      description: 'Xóa một hoặc nhiều ô ghi chú (và các dây liên kết tới chúng) khỏi sơ đồ hiện tại.',
      parameters: {
        type: 'object',
        properties: {
          node_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Danh sách ID các ô cần xóa',
          },
        },
        required: ['node_ids'],
      },
      execute: (args) => {
        const ids = Array.isArray(args.node_ids) ? args.node_ids.map(String) : [];
        const idSet = new Set(ids);
        const map = ctx.getWorkingMap();
        const beforeCount = map.nodes.length;
        const nextNodes = map.nodes.filter((n) => !idSet.has(n.id));
        const deleted = beforeCount - nextNodes.length;
        if (deleted === 0) {
          return {
            ok: false,
            summary: 'Không có ô nào bị xóa',
            error: 'Không tìm thấy node_ids khớp trong sơ đồ.',
          };
        }
        const nextEdges = map.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target));
        ctx.onDidMutateMap?.();
        ctx.updateWorkingMap({
          ...map,
          nodes: nextNodes,
          edges: nextEdges,
          updatedAt: Date.now(),
        });
        return {
          ok: true,
          summary: `Đã xóa ${deleted} ô ghi chú`,
        };
      },
    },
    {
      name: 'connect_nodes',
      description: 'Nối dây liên kết giữa các cặp ô ghi chú trong sơ đồ.',
      parameters: {
        type: 'object',
        properties: {
          connections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source_id: { type: 'string' },
                target_id: { type: 'string' },
              },
              required: ['source_id', 'target_id'],
            },
          },
        },
        required: ['connections'],
      },
      execute: (args) => {
        const list = Array.isArray(args.connections)
          ? (args.connections as Array<{ source_id?: string; target_id?: string }>)
          : [];
        const map = ctx.getWorkingMap();
        const nodeMap = new Map(map.nodes.map((n) => [n.id, n]));
        const nextEdges = [...map.edges];
        let added = 0;

        list.forEach((conn, idx) => {
          const s = conn.source_id ? nodeMap.get(conn.source_id) : undefined;
          const t = conn.target_id ? nodeMap.get(conn.target_id) : undefined;
          if (!s || !t || s.id === t.id) return;
          const exists = nextEdges.some((e) => e.source === s.id && e.target === t.id);
          if (exists) return;
          nextEdges.push(makeEdge(s.id, t.id, s.position, t.position, `conn-${idx}`));
          added++;
        });

        if (added === 0) {
          return {
            ok: false,
            summary: 'Không thêm được liên kết mới',
            error: 'Các cặp nối không hợp lệ hoặc đã tồn tại.',
          };
        }

        ctx.onDidMutateMap?.();
        ctx.updateWorkingMap({
          ...map,
          edges: nextEdges,
          updatedAt: Date.now(),
        });
        return {
          ok: true,
          summary: `Đã tạo ${added} liên kết mới`,
        };
      },
    },
    {
      name: 'disconnect_edges',
      description: 'Xóa đường nối giữa các ô theo cặp source_id/target_id hoặc edge_id.',
      parameters: {
        type: 'object',
        properties: {
          edge_ids: { type: 'array', items: { type: 'string' } },
          pairs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source_id: { type: 'string' },
                target_id: { type: 'string' },
              },
            },
          },
        },
      },
      execute: (args) => {
        const map = ctx.getWorkingMap();
        const edgeIds = new Set(Array.isArray(args.edge_ids) ? args.edge_ids.map(String) : []);
        const pairs = Array.isArray(args.pairs)
          ? (args.pairs as Array<{ source_id?: string; target_id?: string }>)
          : [];
        const nextEdges = map.edges.filter((e) => {
          if (edgeIds.has(e.id)) return false;
          if (pairs.some((p) => p.source_id === e.source && p.target_id === e.target)) return false;
          return true;
        });
        const removed = map.edges.length - nextEdges.length;
        if (removed === 0) {
          return { ok: false, summary: 'Không tìm thấy dây nối để xóa' };
        }
        ctx.onDidMutateMap?.();
        ctx.updateWorkingMap({
          ...map,
          edges: nextEdges,
          updatedAt: Date.now(),
        });
        return { ok: true, summary: `Đã xóa ${removed} dây nối` };
      },
    },
    {
      name: 'auto_layout_map',
      description: 'Tự động căn chỉnh toàn bộ các ô và dây nối trong sơ đồ thành bố cục cây ngay ngắn.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: () => {
        const map = ctx.getWorkingMap();
        const laidOut = computeHierarchicalTreeLayout(map.nodes, map.edges);
        const posMap = new Map(laidOut.map((n) => [n.id, n.position]));
        const routedEdges = map.edges.map((e) => {
          const sp = posMap.get(e.source);
          const tp = posMap.get(e.target);
          if (!sp || !tp) return e;
          return { ...e, ...chooseBestEdgeHandles(sp, tp) };
        });

        ctx.onDidMutateMap?.();
        ctx.updateWorkingMap({
          ...map,
          nodes: laidOut,
          edges: routedEdges,
          updatedAt: Date.now(),
        });
        return {
          ok: true,
          summary: `Đã xếp lại bố cục cây cho ${laidOut.length} ô`,
        };
      },
    },
    {
      name: 'rename_map',
      description: 'Đổi tên tab sơ đồ hiện tại.',
      parameters: {
        type: 'object',
        properties: {
          new_name: { type: 'string', description: 'Tên mới của sơ đồ' },
        },
        required: ['new_name'],
      },
      execute: (args) => {
        const name = String(args.new_name || '').trim();
        if (!name) return { ok: false, summary: 'Tên mới không được rỗng' };
        const map = ctx.getWorkingMap();
        ctx.onDidMutateMap?.();
        ctx.updateWorkingMap({ ...map, name, updatedAt: Date.now() });
        return { ok: true, summary: `Đã đổi tên bản đồ thành "${name}"` };
      },
    },
    {
      name: 'create_new_map',
      description: 'Tạo một tab bản đồ sơ đồ tư duy mới hoàn toàn và chuyển sang làm việc trên đó.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Tên tab bản đồ mới' },
          initial_context: { type: 'string', description: 'Nội dung Ngữ cảnh Markdown ban đầu (tùy chọn)' },
        },
        required: ['name'],
      },
      execute: (args) => {
        const name = String(args.name || '').trim() || 'Bản đồ AI mới';
        const initCtx = typeof args.initial_context === 'string' ? args.initial_context : undefined;
        const created = ctx.onCreateNewMap(name, initCtx);
        ctx.updateWorkingMap(created);
        return {
          ok: true,
          summary: `Đã tạo bản đồ mới "${created.name}" (${created.id})`,
          data: { mapId: created.id, mapName: created.name, rootNodeId: created.nodes[0]?.id },
        };
      },
    },
    {
      name: 'focus_node',
      description: 'Căn màn hình tới một ô ghi chú cụ thể và mở ô đó cho người dùng xem.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string' },
        },
        required: ['node_id'],
      },
      execute: (args) => {
        const map = ctx.getWorkingMap();
        const found = map.nodes.find((n) => n.id === String(args.node_id || '').trim());
        if (!found) {
          return { ok: false, summary: 'Không tìm thấy ô để mở' };
        }
        ctx.onSelectNode(found.id);
        return { ok: true, summary: `Đã mở ô "${found.data.label}"` };
      },
    },
  ];
}

export interface NoteAgentContext {
  getWorkingNode: () => CustomNode;
  updateWorkingNode: (updates: Partial<MindMapNodeData>) => void;
  activeMap: MapData;
  allowWebSearch: boolean;
  allowContext: boolean;
  alwaysWrapInCodeFrame: boolean;
  onDidMutateNote?: () => void;
}

export function buildNoteAgentSystemPrompt(
  node: CustomNode,
  map: MapData,
  ctx: { allowWebSearch: boolean; allowContext: boolean; alwaysWrapInCodeFrame: boolean }
): string {
  const blocks = parseNoteBlocks(node.data.content || '');
  const ctxLen = (map.context || '').trim().length;
  return [
    `Bạn là AI Agent chuyên trách bên trong ô ghi chú "${node.data.label}" (ID: ${node.id}, hiện có ${blocks.length} khối nội dung) thuộc bản đồ "${map.name}".`,
    'Bạn có toàn quyền trình bày lại bố cục, sửa, xóa nội dung cũ, thêm nội dung mới, đổi tiêu đề/màu ô ghi chú theo lệnh người dùng.',
    '',
    'QUY TẮC QUAN TRỌNG NHẤT:',
    ctx.alwaysWrapInCodeFrame
      ? '1. KHI CHÈN HOẶC VIẾT LẠI NỘI DUNG VÀO Ô GHI CHÚ, LUÔN MẶC ĐỊNH ĐẶT BÊN TRONG **KHUNG MÃ** (`insert_code_frame`, `update_code_frame`, hoặc `reorganize_note_layout`) ĐỂ BẢO TOÀN ĐỊNH DẠNG MARKDOWN + KATEX.'
      : '1. Hãy ưu tiên chèn nội dung vào Khung Mã để bảo toàn định dạng.',
    '2. Viết nội dung bên trong Khung Mã bằng Markdown đẹp (`#`, `##`, `**in đậm**`, danh sách gạch đầu dòng `-`, bảng `|...|`, blockquote `>`, code block ```) kết hợp công thức KaTeX (`$...$`, `$$...$$`).',
    '3. Trước khi sửa hoặc xóa, hãy gọi `read_current_note` để thấy chính xác từng Block #0, #1, #2... đang có trong ghi chú.',
    ctx.allowContext
      ? `4. Bản đồ có mục "Ngữ cảnh" (${ctxLen} ký tự). Nếu người dùng nhắc đến bài học/tài liệu hoặc cần bám sát ngữ cảnh, gọi \`read_map_context_and_nodes\`.`
      : '4. Quyền đọc "Ngữ cảnh" đang tắt ở phiên chat này.',
    ctx.allowWebSearch
      ? '5. Nếu người dùng yêu cầu tìm thêm kiến thức/nguồn trên mạng, dùng `web_search` và `fetch_url`, sau đó tổng hợp vào Khung Mã kèm link nguồn.'
      : '5. Quyền tìm kiếm "Nguồn mạng" đang tắt ở phiên chat này.',
    '6. Luôn thực thi bằng tool trực tiếp vào ghi chú (không chỉ chat suông), sau đó báo ngắn gọn cho người dùng biết đã cập nhật Khung Mã nào.',
  ].join('\n');
}

export function createNoteAgentTools(ctx: NoteAgentContext): AiToolDefinition[] {
  return [
    {
      name: 'read_current_note',
      description: 'Đọc toàn bộ nội dung hiện tại của ô ghi chú (liệt kê rõ từng Block #0, #1... và mã Khung Mã).',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: () => {
        const node = ctx.getWorkingNode();
        const blocks = parseNoteBlocks(node.data.content || '');
        return {
          ok: true,
          summary: `Ghi chú "${node.data.label}" có ${blocks.length} khối nội dung`,
          data: {
            nodeId: node.id,
            label: node.data.label,
            color: node.data.color,
            shape: node.data.shape,
            blockCount: blocks.length,
            formattedBlocks: formatNoteBlocksForAi(node.data.content || ''),
          },
        };
      },
    },
    {
      name: 'read_map_context_and_nodes',
      description: 'Đọc "Ngữ cảnh" Markdown của bản đồ hiện tại và danh sách các ô lân cận để đồng bộ kiến thức.',
      parameters: {
        type: 'object',
        properties: {
          offset: { type: 'number', description: 'Vị trí bắt đầu đọc Ngữ cảnh (mặc định 0)' },
          max_chars: { type: 'number', description: 'Số ký tự tối đa (mặc định 12000)' },
          include_neighbor_notes: { type: 'boolean', description: 'Có kèm nội dung tóm tắt các ô nối với ô này không' },
        },
      },
      execute: (args) => {
        const node = ctx.getWorkingNode();
        const fullContext = ctx.allowContext ? (ctx.activeMap.context || '').trim() : '';
        const offset = typeof args.offset === 'number' ? Math.max(0, args.offset) : 0;
        const maxChars =
          typeof args.max_chars === 'number' ? Math.min(Math.max(args.max_chars, 500), 20000) : 12000;

        let neighbors: Array<{ id: string; label: string; relation: string; preview: string }> = [];
        if (args.include_neighbor_notes !== false) {
          const nodeMap = new Map(ctx.activeMap.nodes.map((n) => [n.id, n]));
          for (const e of ctx.activeMap.edges) {
            if (e.source === node.id && nodeMap.has(e.target)) {
              const targetNode = nodeMap.get(e.target)!;
              neighbors.push({
                id: targetNode.id,
                label: targetNode.data.label,
                relation: 'nhánh con',
                preview: stripHtmlToText(targetNode.data.content || '').slice(0, 220),
              });
            } else if (e.target === node.id && nodeMap.has(e.source)) {
              const srcNode = nodeMap.get(e.source)!;
              neighbors.push({
                id: srcNode.id,
                label: srcNode.data.label,
                relation: 'nhánh cha',
                preview: stripHtmlToText(srcNode.data.content || '').slice(0, 220),
              });
            }
          }
        }

        return {
          ok: true,
          summary: ctx.allowContext
            ? `Đã đọc Ngữ cảnh (${fullContext.length} ký tự) và ${neighbors.length} ô liên kết`
            : `Đã đọc ${neighbors.length} ô liên kết (Ngữ cảnh đang tắt)`,
          data: {
            mapName: ctx.activeMap.name,
            contextAllowed: ctx.allowContext,
            contextTotalLength: fullContext.length,
            contextContent: ctx.allowContext ? fullContext.slice(offset, offset + maxChars) : '',
            neighbors,
          },
        };
      },
    },
    ...createSharedWebTools(ctx.allowWebSearch),
    {
      name: 'insert_code_frame',
      description:
        'Chèn một Khung Mã (Markdown + KaTeX) mới vào ghi chú. Mặc định luôn dùng hàm này để chèn câu trả lời AI vào ghi chú.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Tiêu đề hiển thị ở đầu Khung Mã' },
          markdown_content: {
            type: 'string',
            description: 'Nội dung Markdown + KaTeX đặt bên trong Khung Mã',
          },
          mode: {
            type: 'string',
            enum: ['mixed', 'block', 'inline'],
            description: 'Luôn dùng "mixed" (mặc định) cho Markdown + KaTeX hỗn hợp; chỉ dùng "block" cho 1 công thức thuần.',
          },
          position: {
            type: 'string',
            enum: ['append', 'prepend', 'after_index', 'replace_all'],
            description: 'Vị trí chèn: cuối ghi chú (append), đầu (prepend), sau block (after_index), hoặc thay toàn bộ (replace_all)',
          },
          target_index: { type: 'number', description: 'Chỉ số block nếu position là after_index' },
        },
        required: ['title', 'markdown_content'],
      },
      execute: (args) => {
        const node = ctx.getWorkingNode();
        const mode: KatexFrameMode =
          args.mode === 'block' || args.mode === 'inline' ? args.mode : 'mixed';
        const title = String(args.title || 'Khung Mã AI').trim();
        const code = String(args.markdown_content || '').trim();
        if (!code) {
          return { ok: false, summary: 'Nội dung Khung Mã bị rỗng' };
        }
        const position =
          args.position === 'prepend' ||
          args.position === 'after_index' ||
          args.position === 'replace_all'
            ? args.position
            : 'append';

        const nextContent = insertCodeFrameIntoHtml(node.data.content || '', {
          code,
          mode,
          title,
          position,
          targetIndex: typeof args.target_index === 'number' ? args.target_index : undefined,
        });

        ctx.onDidMutateNote?.();
        ctx.updateWorkingNode({ content: nextContent });
        return {
          ok: true,
          summary: `Đã chèn Khung Mã "${title}" (${position})`,
        };
      },
    },
    {
      name: 'update_code_frame',
      description: 'Cập nhật nội dung hoặc tiêu đề của một Khung Mã đang có sẵn trong ghi chú.',
      parameters: {
        type: 'object',
        properties: {
          block_index: { type: 'number', description: 'Chỉ số Block # của Khung Mã cần sửa' },
          title_match: { type: 'string', description: 'Tên gần đúng của Khung Mã cần sửa nếu không truyền block_index' },
          new_title: { type: 'string', description: 'Tiêu đề mới (tùy chọn)' },
          markdown_content: { type: 'string', description: 'Toàn bộ nội dung Markdown + KaTeX mới cho Khung Mã này' },
          mode: { type: 'string', enum: ['mixed', 'block', 'inline'] },
        },
        required: ['markdown_content'],
      },
      execute: (args) => {
        const node = ctx.getWorkingNode();
        const result = updateCodeFrameInHtml(node.data.content || '', {
          blockIndex: typeof args.block_index === 'number' ? args.block_index : undefined,
          titleMatch: typeof args.title_match === 'string' ? args.title_match : undefined,
          title: typeof args.new_title === 'string' ? args.new_title : undefined,
          code: String(args.markdown_content || ''),
          mode:
            args.mode === 'block' || args.mode === 'inline' || args.mode === 'mixed'
              ? args.mode
              : undefined,
        });

        if (result.updatedCount === 0) {
          return {
            ok: false,
            summary: 'Không tìm thấy Khung Mã để cập nhật',
            error: result.error,
          };
        }

        ctx.onDidMutateNote?.();
        ctx.updateWorkingNode({ content: result.html });
        return {
          ok: true,
          summary: 'Đã cập nhật Khung Mã trong ghi chú',
        };
      },
    },
    {
      name: 'delete_note_blocks',
      description: 'Xóa các khối nội dung cũ trong ghi chú theo chỉ số, theo từ khóa, hoặc dọn sạch ghi chú.',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['by_indices', 'all_old', 'except_code_frames', 'by_text'],
            description: 'Kiểu xóa: theo chỉ số block, xóa hết, chỉ xóa văn bản thường ngoài khung mã, hoặc xóa block chứa từ khóa',
          },
          block_indices: {
            type: 'array',
            items: { type: 'number' },
            description: 'Danh sách số Block # cần xóa (khi mode = by_indices)',
          },
          search_text: {
            type: 'string',
            description: 'Từ khóa tìm đoạn cần xóa (khi mode = by_text)',
          },
        },
        required: ['mode'],
      },
      execute: (args) => {
        const node = ctx.getWorkingNode();
        const mode =
          args.mode === 'all_old' ||
          args.mode === 'except_code_frames' ||
          args.mode === 'by_text'
            ? args.mode
            : 'by_indices';
        const res = deleteNoteBlocksInHtml(node.data.content || '', {
          mode,
          blockIndices: Array.isArray(args.block_indices)
            ? args.block_indices.map(Number)
            : undefined,
          searchText: typeof args.search_text === 'string' ? args.search_text : undefined,
        });

        if (res.deletedCount === 0 && mode !== 'all_old') {
          return {
            ok: false,
            summary: 'Không có khối nào khớp để xóa',
          };
        }

        ctx.onDidMutateNote?.();
        ctx.updateWorkingNode({ content: res.html });
        return {
          ok: true,
          summary: `Đã xóa ${res.deletedCount} khối nội dung cũ`,
        };
      },
    },
    {
      name: 'reorganize_note_layout',
      description:
        'Trình bày lại toàn bộ bố cục ghi chú thành các Khung Mã gọn gàng, mạch lạc (giữ ảnh đính kèm nếu có).',
      parameters: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            description: 'Danh sách các phần nội dung đã sắp xếp lại, mỗi phần trở thành 1 Khung Mã đẹp',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Tiêu đề phần (vd "1. Tổng quan", "2. Công thức cốt lõi")' },
                markdown_content: { type: 'string', description: 'Nội dung Markdown + KaTeX bên trong Khung Mã' },
                mode: { type: 'string', enum: ['mixed', 'block'] },
              },
              required: ['title', 'markdown_content'],
            },
          },
          new_note_title: { type: 'string', description: 'Đổi luôn tiêu đề ô ghi chú nếu cần (tùy chọn)' },
          preserve_images: {
            type: 'boolean',
            description: 'Giữ lại ảnh cũ trong ghi chú (mặc định true)',
          },
        },
        required: ['sections'],
      },
      execute: (args) => {
        const rawSections = Array.isArray(args.sections)
          ? (args.sections as Array<{ title?: string; markdown_content?: string; mode?: string }>)
          : [];
        if (rawSections.length === 0) {
          return { ok: false, summary: 'Danh sách sections không được rỗng' };
        }

        const node = ctx.getWorkingNode();
        const mappedSections = rawSections.map((sec, idx) => ({
          title: (sec.title || `Phần ${idx + 1}`).trim(),
          markdownContent: String(sec.markdown_content || '').trim(),
          mode: (sec.mode === 'block' ? 'block' : 'mixed') as KatexFrameMode,
        }));

        const nextHtml = reorganizeNoteHtml(
          node.data.content || '',
          mappedSections,
          args.preserve_images !== false
        );

        const nextLabel =
          typeof args.new_note_title === 'string' && args.new_note_title.trim()
            ? args.new_note_title.trim()
            : undefined;

        ctx.onDidMutateNote?.();
        ctx.updateWorkingNode({
          content: nextHtml,
          ...(nextLabel ? { label: nextLabel } : {}),
        });

        return {
          ok: true,
          summary: `Đã trình bày lại bố cục thành ${mappedSections.length} Khung Mã`,
        };
      },
    },
    {
      name: 'update_note_metadata',
      description: 'Cập nhật tiêu đề, màu sắc hoặc hình dạng hiển thị của ô ghi chú đang mở.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          color: { type: 'string', enum: VALID_COLORS },
          shape: { type: 'string', enum: VALID_SHAPES },
        },
      },
      execute: (args) => {
        const node = ctx.getWorkingNode();
        const updates: Partial<MindMapNodeData> = {};
        if (typeof args.label === 'string' && args.label.trim()) {
          updates.label = args.label.trim();
        }
        if (args.color !== undefined) {
          updates.color = normalizeColor(args.color, node.data.color);
        }
        if (args.shape !== undefined) {
          updates.shape = normalizeShape(args.shape, node.data.shape);
        }
        if (Object.keys(updates).length === 0) {
          return { ok: false, summary: 'Không có thuộc tính nào thay đổi' };
        }
        ctx.onDidMutateNote?.();
        ctx.updateWorkingNode(updates);
        return {
          ok: true,
          summary: 'Đã cập nhật thông tin ô ghi chú',
        };
      },
    },
  ];
}
