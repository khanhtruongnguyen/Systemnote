import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { CustomNode, MapData } from '../types';
import {
  buildKatexFrameInnerHtml,
  renderKatexCode,
  type KatexFrameMode,
} from '../utils/katexHelper';
import {
  uploadImageToSupabase,
  dataUrlToBlob,
  formatBytes,
} from '../utils/imageHelper';
import { isSupabaseConfigured } from '../services/supabase';
import {
  Link as LinkIcon,
  Code2,
  ImagePlus,
  UploadCloud,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Compass,
  Globe,
  X,
  Check,
  ExternalLink,
  Unlink,
  ArrowUpRight,
  ZoomIn,
  Sparkles,
} from 'lucide-react';
import { ImageLightbox } from './ImageLightbox';

interface QuillNoteEditorProps {
  nodeId: string;
  content: string;
  onChange: (newHtml: string) => void;
  allNodes: CustomNode[];
  allMaps?: MapData[];
  currentMapId: string;
  onNavigate?: (mapId?: string, noteId?: string) => void;
  onSelectNodeById?: (nodeId: string) => void;
  isFullscreen?: boolean;
  onToggleAiNote?: () => void;
  isAiNoteOpen?: boolean;
}

let customBlotsRegistered = false;

async function resolveQuillLibrary(): Promise<any> {
  if (typeof window !== 'undefined' && window.Quill) {
    return window.Quill;
  }
  const mod = await import('quill');
  return mod.default || mod;
}

function registerSystemNoteBlots(QuillLib: any) {
  if (customBlotsRegistered || !QuillLib) return;
  customBlotsRegistered = true;

  const Link = QuillLib.import('formats/link');
  const ImageBlot = QuillLib.import('formats/image');
  const BlockEmbed = QuillLib.import('blots/block/embed');
  const Embed = QuillLib.import('blots/embed');

  // Cho phép ảnh nhẹ (URL Supabase Storage / URL ngoài) kèm thuộc tính width co giãn
  class SystemNoteImage extends ImageBlot {
    static create(value: string) {
      const node = super.create(value) as HTMLImageElement;
      node.classList.add('sn-note-image');
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
      return node;
    }

    static formats(domNode: HTMLElement) {
      const formats: Record<string, string> = {};
      const width = domNode.getAttribute('width') || domNode.style.width;
      if (width) formats.width = width;
      const alt = domNode.getAttribute('alt');
      if (alt) formats.alt = alt;
      return formats;
    }

    static sanitize(url: string) {
      if (!url) return '//:0';
      const trimmed = url.trim();
      if (/^(https?:\/\/|data:image\/|blob:)/i.test(trimmed)) {
        return trimmed;
      }
      return '//:0';
    }

    format(name: string, value: string) {
      if (name === 'width') {
        if (value) {
          this.domNode.setAttribute('width', value);
          this.domNode.style.width = value;
        } else {
          this.domNode.removeAttribute('width');
          this.domNode.style.width = '';
        }
      } else {
        super.format(name, value);
      }
    }
  }
  SystemNoteImage.blotName = 'image';
  SystemNoteImage.tagName = 'IMG';
  QuillLib.register('formats/image', SystemNoteImage, true);

  // Cho phép giao thức node: cho liên kết nội bộ
  if (Array.isArray(Link.PROTOCOL_WHITELIST) && !Link.PROTOCOL_WHITELIST.includes('node')) {
    Link.PROTOCOL_WHITELIST.push('node');
  }

  class SystemNoteLink extends Link {
    static create(value: string) {
      const node = super.create(value) as HTMLAnchorElement;
      const sanitized = this.sanitize(value);
      node.setAttribute('href', sanitized);
      if (sanitized.startsWith('node:') || sanitized.startsWith('#')) {
        node.removeAttribute('target');
        node.removeAttribute('rel');
        node.classList.add('sn-internal-link');
        node.classList.remove('sn-external-link');
        node.setAttribute('title', 'Link nội bộ - Nhấp để thao tác hoặc đi tới ô');
      } else {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
        node.classList.add('sn-external-link');
        node.classList.remove('sn-internal-link');
      }
      return node;
    }

    static sanitize(url: string) {
      if (!url) return 'about:blank';
      const trimmed = url.trim();
      if (trimmed.startsWith('node:') || trimmed.startsWith('#')) {
        return trimmed;
      }
      return super.sanitize(trimmed);
    }

    format(name: string, value: string) {
      if (name !== this.statics.blotName || !value) {
        return super.format(name, value);
      }
      const sanitized = SystemNoteLink.sanitize(value);
      this.domNode.setAttribute('href', sanitized);
      if (sanitized.startsWith('node:') || sanitized.startsWith('#')) {
        this.domNode.removeAttribute('target');
        this.domNode.removeAttribute('rel');
        this.domNode.classList.add('sn-internal-link');
        this.domNode.classList.remove('sn-external-link');
      } else {
        this.domNode.setAttribute('target', '_blank');
        this.domNode.setAttribute('rel', 'noopener noreferrer');
        this.domNode.classList.add('sn-external-link');
        this.domNode.classList.remove('sn-internal-link');
      }
    }
  }
  SystemNoteLink.blotName = 'link';
  SystemNoteLink.tagName = 'A';
  QuillLib.register('formats/link', SystemNoteLink, true);

  // Khung Chèn Mã & KaTeX (Block)
  class KatexFrameBlot extends BlockEmbed {
    static create(value: { code?: string; mode?: KatexFrameMode; title?: string } | string) {
      const node = super.create() as HTMLElement;
      const payload =
        typeof value === 'string'
          ? { code: value, mode: 'block' as KatexFrameMode, title: '' }
          : {
              code: value?.code || '',
              mode: (value?.mode || 'block') as KatexFrameMode,
              title: value?.title || '',
            };

      node.setAttribute('contenteditable', 'false');
      node.setAttribute('data-code', payload.code);
      node.setAttribute('data-mode', payload.mode);
      if (payload.title) {
        node.setAttribute('data-title', payload.title);
      } else {
        node.removeAttribute('data-title');
      }
      node.innerHTML = buildKatexFrameInnerHtml(payload.code, payload.mode, payload.title);
      return node;
    }

    static formats() {
      return {};
    }

    static value(domNode: HTMLElement) {
      return {
        code: domNode.getAttribute('data-code') || '',
        mode: (domNode.getAttribute('data-mode') as KatexFrameMode) || 'block',
        title: domNode.getAttribute('data-title') || '',
      };
    }
  }
  KatexFrameBlot.blotName = 'katexFrame';
  KatexFrameBlot.tagName = 'DIV';
  KatexFrameBlot.className = 'sn-katex-frame';
  QuillLib.register(KatexFrameBlot, true);

  // Công thức KaTeX cùng dòng (Inline)
  class KatexInlineBlot extends Embed {
    static create(value: { code?: string } | string) {
      const node = super.create() as HTMLElement;
      const code = typeof value === 'string' ? value : value?.code || '';
      node.setAttribute('contenteditable', 'false');
      node.setAttribute('data-code', code);
      node.setAttribute('title', `Công thức KaTeX: ${code} (Nhấp để sửa)`);
      node.innerHTML = renderKatexCode(code, 'inline');
      return node;
    }

    static formats() {
      return {};
    }

    static value(domNode: HTMLElement) {
      return {
        code: domNode.getAttribute('data-code') || '',
      };
    }
  }
  KatexInlineBlot.blotName = 'katexInline';
  KatexInlineBlot.tagName = 'SPAN';
  KatexInlineBlot.className = 'sn-katex-inline';
  QuillLib.register(KatexInlineBlot, true);
}

const TOOLBAR_MARKUP = `
  <span class="ql-formats">
    <select class="ql-size" title="Cỡ chữ">
      <option value="small">Nhỏ</option>
      <option selected>Bình thường</option>
      <option value="large">Lớn</option>
      <option value="huge">Rất lớn</option>
    </select>
  </span>
  <span class="ql-formats">
    <button class="ql-bold" title="In đậm"></button>
    <button class="ql-italic" title="In nghiêng"></button>
    <button class="ql-underline" title="Gạch chân"></button>
    <button class="ql-strike" title="Gạch ngang"></button>
  </span>
  <span class="ql-formats">
    <select class="ql-color" title="Màu chữ"></select>
    <select class="ql-background" title="Màu nền chữ"></select>
  </span>
  <span class="ql-formats">
    <button class="ql-list" value="bullet" title="Danh sách chấm"></button>
    <button class="ql-list" value="ordered" title="Danh sách số"></button>
    <button class="ql-indent" value="-1" title="Lùi lề (Shift + Tab)"></button>
    <button class="ql-indent" value="+1" title="Thụt lề (Tab)"></button>
  </span>
  <span class="ql-formats">
    <select class="ql-align" title="Căn lề"></select>
  </span>
`;

const KATEX_SNIPPETS: Array<{ label: string; code: string }> = [
  { label: 'Phân số', code: '\\frac{a}{b}' },
  { label: 'Căn bậc 2', code: '\\sqrt{x^2 + y^2}' },
  { label: 'Tích phân', code: '\\int_{a}^{b} f(x)\\,dx' },
  { label: 'Tổng Sigma', code: '\\sum_{i=1}^{n} x_i' },
  { label: 'Giới hạn', code: '\\lim_{x \\to \\infty} f(x)' },
  { label: 'Đạo hàm', code: '\\frac{df}{dx}' },
  { label: 'Ma trận 2x2', code: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Hệ PT', code: '\\begin{cases} x + y = 5 \\\\ 2x - y = 1 \\end{cases}' },
];

export const QuillNoteEditor: React.FC<QuillNoteEditorProps> = ({
  nodeId,
  content,
  onChange,
  allNodes,
  allMaps = [],
  currentMapId,
  onNavigate,
  onSelectNodeById,
  isFullscreen = false,
  onToggleAiNote,
  isAiNoteOpen = false,
}) => {
  const quillToolbarSlotRef = useRef<HTMLDivElement>(null);
  const editorMountRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<any>(null);
  const quillLibRef = useRef<any>(null);
  const lastEmittedHtmlRef = useRef<string>(content);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const onSelectNodeByIdRef = useRef(onSelectNodeById);
  onSelectNodeByIdRef.current = onSelectNodeById;

  const latestContentRef = useRef(content);
  latestContentRef.current = content;

  const [currentZoom, setCurrentZoom] = useState(1);
  const [editorReady, setEditorReady] = useState(false);

  // Saved selection before opening modals
  const savedRangeRef = useRef<{ index: number; length: number } | null>(null);

  // Link Modal States
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTab, setLinkTab] = useState<'internal' | 'external'>('internal');
  const [targetMapId, setTargetMapId] = useState<string>(currentMapId);
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [linkTitle, setLinkTitle] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState<string>('');

  // Code/KaTeX Modal States
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [katexMode, setKatexMode] = useState<KatexFrameMode>('block');
  const [katexTitle, setKatexTitle] = useState<string>('');
  const [katexCode, setKatexCode] = useState<string>('');
  const [editingEmbedTarget, setEditingEmbedTarget] = useState<{ index: number } | null>(null);

  // Floating popover when clicking an existing link inside editor
  const [linkPopover, setLinkPopover] = useState<{
    href: string;
    text: string;
    isInternal: boolean;
    anchorEl: HTMLAnchorElement;
    top: number;
    left: number;
  } | null>(null);

  // Image Modal, Popover & Upload Status States
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');
  const [externalImageUrl, setExternalImageUrl] = useState('');
  const [externalImageWidth, setExternalImageWidth] = useState<'auto' | '35%' | '65%' | '100%'>('auto');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageNotice, setImageNotice] = useState<{
    type: 'loading' | 'success' | 'error';
    text: string;
  } | null>(null);
  const [imagePopover, setImagePopover] = useState<{
    src: string;
    width: string;
    imgEl: HTMLImageElement;
    top: number;
    left: number;
  } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const currentMapIdRef = useRef(currentMapId);
  currentMapIdRef.current = currentMapId;
  const nodeIdRef = useRef(nodeId);
  nodeIdRef.current = nodeId;
  const uploadImagesHandlerRef = useRef<(files: Blob[], insertAtIndex?: number) => Promise<void>>(
    async () => {}
  );

  const paperContainerRef = useRef<HTMLDivElement>(null);

  // Available nodes for internal link target map
  const targetMapNodes = useMemo(() => {
    if (allMaps.length > 0) {
      const m = allMaps.find((mp) => mp.id === targetMapId);
      if (m) return m.nodes || [];
    }
    return allNodes || [];
  }, [allMaps, allNodes, targetMapId]);

  // Reset target map when opening link modal
  useEffect(() => {
    setTargetMapId(currentMapId);
  }, [currentMapId]);

  // Initialize Quill instance cleanly
  useEffect(() => {
    let cancelled = false;
    let quillInstance: any = null;

    const toolbarSlot = quillToolbarSlotRef.current;
    const editorHost = editorMountRef.current;
    if (!toolbarSlot || !editorHost) return;

    const setupQuill = async () => {
      const QuillLib = await resolveQuillLibrary();
      if (cancelled) return;

      quillLibRef.current = QuillLib;
      registerSystemNoteBlots(QuillLib);

      // Tạo mới hoàn toàn markup thanh công cụ và vùng soạn thảo (tránh xung đột StrictMode)
      toolbarSlot.innerHTML = TOOLBAR_MARKUP;
      editorHost.innerHTML = '';

      const editorRoot = document.createElement('div');
      editorRoot.className = 'sn-quill-inner';
      editorHost.appendChild(editorRoot);

      // Chuẩn hóa select size để không lỗi selected option
      const sizeSelect = toolbarSlot.querySelector('select.ql-size') as HTMLSelectElement | null;
      if (sizeSelect) {
        const normalOpt = sizeSelect.querySelector('option:not([value])');
        if (normalOpt) {
          (normalOpt as HTMLOptionElement).selected = true;
        }
      }

      quillInstance = new QuillLib(editorRoot, {
        theme: 'snow',
        placeholder: 'Bắt đầu nhập ghi chú tại đây... (Tab để thụt lề, Shift + Tab để lùi lề)',
        formats: [
          'size',
          'bold',
          'italic',
          'underline',
          'strike',
          'color',
          'background',
          'list',
          'indent',
          'align',
          'link',
          'code',
          'header',
          'image',
          'width',
          'katexFrame',
          'katexInline',
        ],
        modules: {
          toolbar: toolbarSlot,
          clipboard: {
            matchVisual: false,
            matchers: [
              [
                'div.sn-katex-frame',
                (node: HTMLElement, delta: any) => {
                  const DeltaCtor = delta.constructor;
                  return new DeltaCtor().insert({
                    katexFrame: {
                      code: node.getAttribute('data-code') || '',
                      mode: (node.getAttribute('data-mode') as KatexFrameMode) || 'block',
                      title: node.getAttribute('data-title') || '',
                    },
                  });
                },
              ],
              [
                'span.sn-katex-inline',
                (node: HTMLElement, delta: any) => {
                  const DeltaCtor = delta.constructor;
                  return new DeltaCtor().insert({
                    katexInline: {
                      code: node.getAttribute('data-code') || '',
                    },
                  });
                },
              ],
            ],
          },
        },
      });

      quillRef.current = quillInstance;

      // Nạp nội dung ban đầu của node
      const initialHtml = latestContentRef.current || '';
      lastEmittedHtmlRef.current = initialHtml;
      if (initialHtml.trim()) {
        const looksLikeHtml = /<[a-z][\s\S]*>/i.test(initialHtml);
        if (looksLikeHtml) {
          quillInstance.clipboard.dangerouslyPasteHTML(initialHtml, 'silent');
        } else {
          quillInstance.setText(initialHtml, 'silent');
        }
      } else {
        quillInstance.setText('', 'silent');
      }

      // Lắng nghe thay đổi nội dung người dùng nhập
      quillInstance.on('text-change', (_delta: any, _old: any, source: string) => {
        if (source === 'user') {
          const html = quillInstance.root.innerHTML;
          const normalized = html === '<p><br></p>' ? '' : html;
          lastEmittedHtmlRef.current = normalized;
          onChangeRef.current(normalized);
        }
      });

      // Xử lý click vào khung KaTeX hoặc link trong editor
      const handleEditorClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // 1. Nút xóa trên khung KaTeX
        const delBtn = target.closest('[data-action="delete-katex"]');
        if (delBtn) {
          e.preventDefault();
          e.stopPropagation();
          const frameEl = target.closest('.sn-katex-frame');
          if (frameEl) {
            const blot = QuillLib.find(frameEl);
            if (blot) {
              const idx = quillInstance.getIndex(blot);
              quillInstance.deleteText(idx, 1, 'user');
            }
          }
          return;
        }

        // 2. Click vào khung KaTeX Block để sửa mã
        const frameEl = target.closest('.sn-katex-frame') as HTMLElement | null;
        if (frameEl) {
          e.preventDefault();
          e.stopPropagation();
          const blot = QuillLib.find(frameEl);
          if (blot) {
            const idx = quillInstance.getIndex(blot);
            setEditingEmbedTarget({ index: idx });
            setKatexCode(frameEl.getAttribute('data-code') || '');
            setKatexMode((frameEl.getAttribute('data-mode') as KatexFrameMode) || 'block');
            setKatexTitle(frameEl.getAttribute('data-title') || '');
            setShowCodeModal(true);
          }
          return;
        }

        // 3. Click vào công thức KaTeX Inline để sửa mã
        const inlineEl = target.closest('.sn-katex-inline') as HTMLElement | null;
        if (inlineEl) {
          e.preventDefault();
          e.stopPropagation();
          const blot = QuillLib.find(inlineEl);
          if (blot) {
            const idx = quillInstance.getIndex(blot);
            setEditingEmbedTarget({ index: idx });
            setKatexCode(inlineEl.getAttribute('data-code') || '');
            setKatexMode('inline');
            setKatexTitle('');
            setShowCodeModal(true);
          }
          return;
        }

        // 4. Click vào ảnh trong trình soạn thảo để chỉnh kích thước / xóa
        const imgEl = target.closest('img') as HTMLImageElement | null;
        if (imgEl && quillInstance.root.contains(imgEl)) {
          e.preventDefault();
          e.stopPropagation();
          setLinkPopover(null);
          const containerRect = paperContainerRef.current?.getBoundingClientRect();
          const imgRect = imgEl.getBoundingClientRect();
          if (containerRect && paperContainerRef.current) {
            setImagePopover({
              src: imgEl.getAttribute('src') || '',
              width: imgEl.getAttribute('width') || imgEl.style.width || 'auto',
              imgEl,
              top: imgRect.bottom - containerRect.top + paperContainerRef.current.scrollTop + 6,
              left: Math.max(12, imgRect.left - containerRect.left),
            });
          }
          return;
        }

        // 5. Click vào thẻ Link (nội bộ hoặc ngoài)
        const anchorEl = target.closest('a') as HTMLAnchorElement | null;
        if (anchorEl) {
          setImagePopover(null);
          const href = anchorEl.getAttribute('href') || '';
          const isInternal =
            href.startsWith('node:') ||
            href.startsWith('#') ||
            anchorEl.classList.contains('sn-internal-link');

          if (isInternal) {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
              handleNavigateFromHref(href);
              return;
            }
          } else {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
              window.open(href, '_blank', 'noopener,noreferrer');
              return;
            }
          }

          const containerRect = paperContainerRef.current?.getBoundingClientRect();
          const anchorRect = anchorEl.getBoundingClientRect();
          if (containerRect && paperContainerRef.current) {
            setLinkPopover({
              href,
              text: anchorEl.textContent || href,
              isInternal,
              anchorEl,
              top: anchorRect.bottom - containerRect.top + paperContainerRef.current.scrollTop + 6,
              left: Math.max(12, anchorRect.left - containerRect.left),
            });
          }
          return;
        }

        setLinkPopover(null);
        setImagePopover(null);
      };

      // Dán ảnh trực tiếp bằng Ctrl+V (ảnh chụp màn hình hoặc file ảnh trong clipboard)
      const handleEditorPaste = (e: ClipboardEvent) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const imageFiles: File[] = [];
        if (clipboardData.files && clipboardData.files.length > 0) {
          Array.from(clipboardData.files).forEach((file) => {
            if (file.type.startsWith('image/')) imageFiles.push(file);
          });
        }
        if (imageFiles.length === 0 && clipboardData.items) {
          Array.from(clipboardData.items).forEach((item) => {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              const f = item.getAsFile();
              if (f) imageFiles.push(f);
            }
          });
        }

        if (imageFiles.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const range = quillInstance.getSelection();
          uploadImagesHandlerRef.current(imageFiles, range?.index);
          return;
        }

        // Nếu dán HTML có chứa ảnh data:image/ (base64), tự chuyển đổi sang WebP + Supabase Storage
        const pastedHtml = clipboardData.getData('text/html') || '';
        if (pastedHtml.includes('data:image/')) {
          setTimeout(async () => {
            const base64Imgs = Array.from(
              quillInstance.root.querySelectorAll('img[src^="data:image/"]')
            ) as HTMLImageElement[];
            if (base64Imgs.length === 0) return;

            for (const imgEl of base64Imgs) {
              const dataUrl = imgEl.getAttribute('src') || '';
              try {
                setIsUploadingImage(true);
                setImageNotice({ type: 'loading', text: 'Đang nén WebP & tải ảnh lên Cloud...' });
                const blob = await dataUrlToBlob(dataUrl);
                const uploaded = await uploadImageToSupabase(
                  blob,
                  currentMapIdRef.current,
                  nodeIdRef.current
                );
                const blot = QuillLib.find(imgEl);
                if (blot) {
                  const idx = quillInstance.getIndex(blot);
                  quillInstance.deleteText(idx, 1, 'silent');
                  quillInstance.insertEmbed(idx, 'image', uploaded.url, 'user');
                }
                setImageNotice({
                  type: 'success',
                  text: `Đã nén & chèn ảnh (${formatBytes(uploaded.originalSize)} → ${formatBytes(uploaded.compressedSize)})`,
                });
              } catch (err: any) {
                const blot = QuillLib.find(imgEl);
                if (blot) {
                  const idx = quillInstance.getIndex(blot);
                  quillInstance.deleteText(idx, 1, 'user');
                }
                setImageNotice({
                  type: 'error',
                  text: err?.message || 'Không thể tải ảnh dán lên Supabase Storage.',
                });
              } finally {
                setIsUploadingImage(false);
              }
            }
          }, 30);
        }
      };

      const handleEditorDragOver = (e: DragEvent) => {
        if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingOver(true);
        }
      };

      const handleEditorDragLeave = (e: DragEvent) => {
        const related = e.relatedTarget as Node | null;
        if (!related || !quillInstance.root.contains(related)) {
          setIsDraggingOver(false);
        }
      };

      const handleEditorDrop = (e: DragEvent) => {
        setIsDraggingOver(false);
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        e.preventDefault();
        e.stopPropagation();
        const range = quillInstance.getSelection();
        uploadImagesHandlerRef.current(imageFiles, range?.index);
      };

      const handleEditorDblClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const imgEl = target.closest('img') as HTMLImageElement | null;
        if (imgEl && quillInstance.root.contains(imgEl)) {
          const src = imgEl.getAttribute('src');
          if (src) {
            e.preventDefault();
            e.stopPropagation();
            setImagePopover(null);
            setLightboxSrc(src);
          }
        }
      };

      quillInstance.root.addEventListener('click', handleEditorClick);
      quillInstance.root.addEventListener('dblclick', handleEditorDblClick);
      quillInstance.root.addEventListener('paste', handleEditorPaste, true);
      quillInstance.root.addEventListener('dragover', handleEditorDragOver, true);
      quillInstance.root.addEventListener('dragleave', handleEditorDragLeave, true);
      quillInstance.root.addEventListener('drop', handleEditorDrop, true);
      setEditorReady(true);

      return () => {
        quillInstance?.root?.removeEventListener('click', handleEditorClick);
        quillInstance?.root?.removeEventListener('dblclick', handleEditorDblClick);
        quillInstance?.root?.removeEventListener('paste', handleEditorPaste, true);
        quillInstance?.root?.removeEventListener('dragover', handleEditorDragOver, true);
        quillInstance?.root?.removeEventListener('dragleave', handleEditorDragLeave, true);
        quillInstance?.root?.removeEventListener('drop', handleEditorDrop, true);
      };
    };

    let cleanupClick: (() => void) | undefined;
    setupQuill().then((fn) => {
      if (typeof fn === 'function') cleanupClick = fn;
    });

    return () => {
      cancelled = true;
      cleanupClick?.();
      quillRef.current = null;
      setEditorReady(false);
      setLinkPopover(null);
      setImagePopover(null);
      setIsDraggingOver(false);
      if (toolbarSlot) toolbarSlot.innerHTML = '';
      if (editorHost) editorHost.innerHTML = '';
    };
  }, [nodeId]);

  // Đồng bộ nội dung từ bên ngoài (vd AI Agent trong ghi chú hoặc Hoàn tác)
  useEffect(() => {
    const quill = quillRef.current;
    if (!editorReady || !quill) return;

    const incoming = content || '';
    if (incoming === lastEmittedHtmlRef.current) return;

    const rawRootHtml = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML;
    if (rawRootHtml === incoming) {
      lastEmittedHtmlRef.current = incoming;
      return;
    }

    lastEmittedHtmlRef.current = incoming;
    if (incoming.trim()) {
      const looksLikeHtml = /<[a-z][\s\S]*>/i.test(incoming);
      if (looksLikeHtml) {
        quill.clipboard.dangerouslyPasteHTML(incoming, 'silent');
      } else {
        quill.setText(incoming, 'silent');
      }
    } else {
      quill.setText('', 'silent');
    }
  }, [content, editorReady, nodeId]);

  const handleNavigateFromHref = useCallback(
    (href: string) => {
      let clean = href;
      if (clean.startsWith('node:')) clean = clean.slice('node:'.length);
      else if (clean.startsWith('#')) clean = clean.slice(1);
      clean = decodeURIComponent(clean);

      let mapId: string | undefined;
      let targetId = clean;
      if (clean.includes('::')) {
        const [mId, ...rest] = clean.split('::');
        mapId = mId || undefined;
        targetId = rest.join('::');
      }

      if (!mapId && onSelectNodeByIdRef.current && targetId) {
        onSelectNodeByIdRef.current(targetId);
      } else if (onNavigateRef.current) {
        onNavigateRef.current(mapId, targetId || undefined);
      } else {
        window.dispatchEvent(
          new CustomEvent('canvas-navigate', {
            detail: { mapId, noteId: targetId },
          })
        );
      }
    },
    []
  );

  // Auto-hide success notice after 3.5s
  useEffect(() => {
    if (imageNotice?.type !== 'success') return;
    const timer = window.setTimeout(() => setImageNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [imageNotice]);

  // Core handler: compress image(s) to WebP -> upload to Supabase Storage -> insert clean URL
  uploadImagesHandlerRef.current = async (files: Blob[], insertAtIndex?: number) => {
    const quill = quillRef.current;
    if (!quill || files.length === 0) return;

    setIsUploadingImage(true);
    let currentIndex =
      typeof insertAtIndex === 'number'
        ? insertAtIndex
        : quill.getSelection()?.index ??
          savedRangeRef.current?.index ??
          Math.max(0, quill.getLength() - 1);

    let totalOriginal = 0;
    let totalCompressed = 0;
    let successCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setImageNotice({
          type: 'loading',
          text:
            files.length > 1
              ? `Đang nén WebP & tải ảnh ${i + 1}/${files.length}...`
              : 'Đang nén WebP & tải ảnh lên Cloud...',
        });

        const uploaded = await uploadImageToSupabase(
          file,
          currentMapIdRef.current,
          nodeIdRef.current
        );
        totalOriginal += uploaded.originalSize;
        totalCompressed += uploaded.compressedSize;

        quill.focus();
        quill.insertEmbed(currentIndex, 'image', uploaded.url, 'user');
        quill.insertText(currentIndex + 1, '\n', 'user');
        currentIndex += 2;
        quill.setSelection(currentIndex, 0, 'silent');
        successCount++;
      }

      if (successCount > 0) {
        setImageNotice({
          type: 'success',
          text:
            successCount > 1
              ? `Đã chèn ${successCount} ảnh (${formatBytes(totalOriginal)} → ${formatBytes(totalCompressed)})`
              : `Đã nén & chèn ảnh (${formatBytes(totalOriginal)} → ${formatBytes(totalCompressed)})`,
        });
      }
    } catch (err: any) {
      setImageNotice({
        type: 'error',
        text: err?.message || 'Không thể tải ảnh lên Supabase Storage.',
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Open Image Modal
  const openImageModal = () => {
    const quill = quillRef.current;
    if (quill) {
      const range = quill.getSelection() || { index: Math.max(0, quill.getLength() - 1), length: 0 };
      savedRangeRef.current = range;
    }
    setExternalImageUrl('');
    setExternalImageWidth('auto');
    setImageTab('upload');
    setLinkPopover(null);
    setImagePopover(null);
    setShowImageModal(true);
  };

  const handleSelectImageFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setImageNotice({ type: 'error', text: 'Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WebP, GIF).' });
      return;
    }
    setShowImageModal(false);
    await uploadImagesHandlerRef.current(imageFiles, savedRangeRef.current?.index);
  };

  const handleInsertExternalImage = (e: React.FormEvent) => {
    e.preventDefault();
    const quill = quillRef.current;
    const rawUrl = externalImageUrl.trim();
    if (!quill || !rawUrl) return;

    let finalUrl = rawUrl;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    const range = savedRangeRef.current || {
      index: Math.max(0, quill.getLength() - 1),
      length: 0,
    };

    quill.focus();
    if (range.length > 0) {
      quill.deleteText(range.index, range.length, 'user');
    }
    quill.insertEmbed(range.index, 'image', finalUrl, 'user');
    if (externalImageWidth !== 'auto') {
      quill.formatText(range.index, 1, 'width', externalImageWidth, 'user');
    }
    quill.insertText(range.index + 1, '\n', 'user');
    quill.setSelection(range.index + 2, 0, 'silent');

    setShowImageModal(false);
    setExternalImageUrl('');
  };

  const handleUpdateImageWidth = (nextWidth: string) => {
    const quill = quillRef.current;
    const QuillLib = quillLibRef.current;
    if (!quill || !QuillLib || !imagePopover?.imgEl) return;

    try {
      const blot = QuillLib.find(imagePopover.imgEl);
      if (blot) {
        const idx = quill.getIndex(blot);
        quill.formatText(idx, 1, 'width', nextWidth === 'auto' ? false : nextWidth, 'user');
        setImagePopover((prev) => (prev ? { ...prev, width: nextWidth } : null));
      }
    } catch {
      // ignore
    }
  };

  const handleDeletePopoverImage = () => {
    const quill = quillRef.current;
    const QuillLib = quillLibRef.current;
    if (!quill || !QuillLib || !imagePopover?.imgEl) return;

    try {
      const blot = QuillLib.find(imagePopover.imgEl);
      if (blot) {
        const idx = quill.getIndex(blot);
        quill.deleteText(idx, 1, 'user');
      }
    } catch {
      // ignore
    }
    setImagePopover(null);
  };

  // Zoom handlers (đúng theo mẫu người dùng)
  const zoomIn = () => setCurrentZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))));
  const zoomOut = () => setCurrentZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))));
  const resetZoom = () => setCurrentZoom(1);

  // Open Link Modal
  const openLinkModal = () => {
    const quill = quillRef.current;
    if (quill) {
      const range = quill.getSelection() || { index: Math.max(0, quill.getLength() - 1), length: 0 };
      savedRangeRef.current = range;
      const selectedText = range.length > 0 ? quill.getText(range.index, range.length).trim() : '';
      setLinkTitle(selectedText);
    } else {
      setLinkTitle('');
    }
    setTargetMapId(currentMapId);
    const otherInCurrent = allNodes.filter((n) => n.id !== nodeId);
    setTargetNodeId(otherInCurrent[0]?.id || allNodes[0]?.id || '');
    setLinkUrl('');
    setLinkTab('internal');
    setLinkPopover(null);
    setShowLinkModal(true);
  };

  // Open Code/KaTeX Modal
  const openCodeModal = () => {
    const quill = quillRef.current;
    if (quill) {
      const range = quill.getSelection() || { index: Math.max(0, quill.getLength() - 1), length: 0 };
      savedRangeRef.current = range;
      const selectedText = range.length > 0 ? quill.getText(range.index, range.length).trim() : '';
      setKatexCode(selectedText);
    } else {
      setKatexCode('');
    }
    setEditingEmbedTarget(null);
    setKatexMode('block');
    setKatexTitle('');
    setLinkPopover(null);
    setShowCodeModal(true);
  };

  // Insert Internal Link
  const handleInsertInternalLink = (e: React.FormEvent) => {
    e.preventDefault();
    const quill = quillRef.current;
    if (!quill || !targetNodeId) return;

    const targetNode = targetMapNodes.find((n) => n.id === targetNodeId);
    const fallbackLabel = targetNode?.data?.label || 'Ghi chú';
    const displayText = linkTitle.trim() || fallbackLabel;
    const href =
      targetMapId && targetMapId !== currentMapId
        ? `node:${targetMapId}::${targetNodeId}`
        : `node:${targetNodeId}`;

    const range = savedRangeRef.current || {
      index: Math.max(0, quill.getLength() - 1),
      length: 0,
    };

    quill.focus();
    if (range.length > 0) {
      quill.deleteText(range.index, range.length, 'user');
    }
    quill.insertText(range.index, displayText, 'link', href, 'user');
    quill.insertText(range.index + displayText.length, ' ', { link: false }, 'user');
    quill.setSelection(range.index + displayText.length + 1, 0, 'silent');

    setShowLinkModal(false);
    setLinkTitle('');
  };

  // Insert External Link
  const handleInsertExternalLink = (e: React.FormEvent) => {
    e.preventDefault();
    const quill = quillRef.current;
    if (!quill || !linkUrl.trim()) return;

    let finalUrl = linkUrl.trim();
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    const displayText = linkTitle.trim() || finalUrl;
    const range = savedRangeRef.current || {
      index: Math.max(0, quill.getLength() - 1),
      length: 0,
    };

    quill.focus();
    if (range.length > 0) {
      quill.deleteText(range.index, range.length, 'user');
    }
    quill.insertText(range.index, displayText, 'link', finalUrl, 'user');
    quill.insertText(range.index + displayText.length, ' ', { link: false }, 'user');
    quill.setSelection(range.index + displayText.length + 1, 0, 'silent');

    setShowLinkModal(false);
    setLinkTitle('');
    setLinkUrl('');
  };

  // Insert or Update Code/KaTeX Frame
  const handleConfirmKatex = (e: React.FormEvent) => {
    e.preventDefault();
    const quill = quillRef.current;
    if (!quill) return;

    const trimmedCode = katexCode.trim();
    if (!trimmedCode) return;

    quill.focus();

    if (editingEmbedTarget) {
      const { index } = editingEmbedTarget;
      quill.deleteText(index, 1, 'user');
      if (katexMode === 'inline') {
        quill.insertEmbed(index, 'katexInline', { code: trimmedCode }, 'user');
      } else {
        quill.insertEmbed(
          index,
          'katexFrame',
          { code: trimmedCode, mode: katexMode, title: katexTitle.trim() },
          'user'
        );
      }
      quill.setSelection(index + 1, 0, 'silent');
    } else {
      const range = savedRangeRef.current || {
        index: Math.max(0, quill.getLength() - 1),
        length: 0,
      };
      if (range.length > 0) {
        quill.deleteText(range.index, range.length, 'user');
      }

      if (katexMode === 'inline') {
        quill.insertEmbed(range.index, 'katexInline', { code: trimmedCode }, 'user');
        quill.insertText(range.index + 1, ' ', 'user');
        quill.setSelection(range.index + 2, 0, 'silent');
      } else {
        quill.insertEmbed(
          range.index,
          'katexFrame',
          { code: trimmedCode, mode: katexMode, title: katexTitle.trim() },
          'user'
        );
        quill.setSelection(range.index + 1, 0, 'silent');
      }
    }

    setShowCodeModal(false);
    setEditingEmbedTarget(null);
    setKatexCode('');
    setKatexTitle('');
  };

  // Remove link from clicked anchor in editor
  const handleUnlinkPopoverAnchor = () => {
    const quill = quillRef.current;
    const QuillLib = quillLibRef.current;
    if (!quill || !QuillLib || !linkPopover?.anchorEl) return;
    try {
      const blot = QuillLib.find(linkPopover.anchorEl);
      if (blot) {
        const idx = quill.getIndex(blot);
        const len = blot.length();
        quill.formatText(idx, len, 'link', false, 'user');
      }
    } catch {
      // ignore
    }
    setLinkPopover(null);
  };

  // Live preview HTML for KaTeX modal
  const katexPreviewHtml = useMemo(() => {
    return renderKatexCode(katexCode, katexMode);
  }, [katexCode, katexMode]);

  const paperWidthClass = isFullscreen ? 'w-[800px] max-w-[calc(100vw-32px)]' : 'w-full max-w-[800px]';

  return (
    <div className="sn-quill-workspace flex-1 flex flex-col min-h-0 bg-[#f0f2f5] overflow-hidden">
      {/* Vùng cuộn chính chứa thanh Zoom, thanh công cụ và tờ giấy trắng */}
      <div
        ref={paperContainerRef}
        className="relative flex-1 overflow-y-auto overflow-x-auto px-3 sm:px-5 py-4 flex flex-col items-center"
      >
        {/* Thanh điều khiển phụ (nút Zoom) theo mẫu người dùng */}
        <div className={`sn-top-bar ${paperWidthClass} mb-2.5 flex items-center justify-between gap-2 shrink-0`}>
          <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-2">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono text-slate-600">
                Tab
              </kbd>{' '}
              thụt lề
            </span>
            <span>•</span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono text-slate-600">
                Shift + Tab
              </kbd>{' '}
              lùi lề
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={zoomIn}
              className="sn-btn-zoom"
              title="Phóng to trang giấy"
            >
              Phóng to (+)
            </button>
            <button
              type="button"
              onClick={zoomOut}
              className="sn-btn-zoom"
              title="Thu nhỏ trang giấy"
            >
              Thu nhỏ (-)
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="sn-btn-zoom"
              title="Đặt lại tỉ lệ 100%"
            >
              {currentZoom === 1 ? '100%' : `${Math.round(currentZoom * 100)}% (100%)`}
            </button>
          </div>
        </div>

        {/* Thanh công cụ cố định phía trên (#toolbar-container) */}
        <div
          id="toolbar-container"
          className={`${paperWidthClass} sticky top-0 z-20 bg-white rounded-t-lg border border-[#ccc] shadow-[0_1px_3px_rgba(0,0,0,0.1)] flex flex-wrap items-center shrink-0`}
        >
          {/* Nhóm nút gốc của Quill */}
          <div ref={quillToolbarSlotRef} className="inline-flex flex-wrap items-center" />

          {/* Nhóm nút bổ sung: Chèn ảnh, Chèn Link & Chèn mã (KaTeX) */}
          <span className="ql-formats sn-custom-toolbar-actions inline-flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={openImageModal}
              disabled={!editorReady || isUploadingImage}
              title="Chèn ảnh nhẹ (hoặc Ctrl+V dán trực tiếp ảnh chụp màn hình)"
              className="sn-toolbar-pill-btn sn-toolbar-image-btn"
            >
              {isUploadingImage ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ImagePlus className="w-3.5 h-3.5" />
              )}
              <span>Chèn ảnh</span>
            </button>

            <button
              type="button"
              onClick={openLinkModal}
              disabled={!editorReady}
              title="Chèn liên kết nội bộ tới ô khác hoặc liên kết web ngoài"
              className="sn-toolbar-pill-btn sn-toolbar-link-btn"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Chèn Link</span>
            </button>

            <button
              type="button"
              onClick={openCodeModal}
              disabled={!editorReady}
              title="Mở khung Chèn mã hỗ trợ Markdown & công thức KaTeX"
              className="sn-toolbar-pill-btn sn-toolbar-katex-btn"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Chèn mã</span>
            </button>

            {onToggleAiNote && (
              <button
                type="button"
                onClick={onToggleAiNote}
                title="Mở trợ lý AI ngay trong ghi chú"
                className={`sn-toolbar-pill-btn ${
                  isAiNoteOpen
                    ? '!bg-indigo-600 !text-white !border-indigo-600'
                    : '!text-indigo-700 !border-indigo-200 !bg-indigo-50/80 hover:!bg-indigo-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Note</span>
              </button>
            )}
          </span>
        </div>

        {/* Thông báo nén & tải ảnh lên Supabase Storage */}
        {imageNotice && (
          <div
            className={`${paperWidthClass} mt-2 px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in duration-150 ${
              imageNotice.type === 'loading'
                ? 'bg-sky-50 border-sky-200 text-sky-800'
                : imageNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {imageNotice.type === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
              {imageNotice.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
              {imageNotice.type === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate font-medium">{imageNotice.text}</span>
            </div>
            {imageNotice.type !== 'loading' && (
              <button
                type="button"
                onClick={() => setImageNotice(null)}
                className="p-0.5 rounded hover:bg-black/5 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Vùng chứa tờ giấy (.paper-container) */}
        <div className="sn-paper-container relative w-full flex justify-center pb-12">
          <div
            id="editor"
            ref={editorMountRef}
            style={{
              transform: `scale(${currentZoom})`,
              transformOrigin: 'top center',
              marginBottom: currentZoom > 1 ? `${(currentZoom - 1) * 750}px` : undefined,
            }}
            className={`${paperWidthClass} bg-white border border-[#ccc] border-t-0 shadow-[0_4px_6px_rgba(0,0,0,0.1)] text-[16px] text-slate-800 transition-transform duration-150 ${
              isFullscreen ? 'min-h-[900px]' : 'min-h-[560px]'
            }`}
          />

          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center z-30">
              <div className="px-4 py-2.5 rounded-xl bg-sky-600 text-white text-xs font-semibold shadow-lg flex items-center gap-2">
                <UploadCloud className="w-4 h-4" />
                <span>Thả ảnh vào đây để tự nén WebP &amp; tải lên</span>
              </div>
            </div>
          )}
        </div>

        {/* Popover nổi khi nhấp vào Ảnh trong trình soạn thảo */}
        {imagePopover && (
          <div
            style={{ top: imagePopover.top, left: imagePopover.left }}
            className="absolute z-30 bg-white border border-slate-200 rounded-xl shadow-xl px-2.5 py-2 flex flex-wrap items-center gap-1.5 text-xs animate-in fade-in zoom-in-95 duration-100"
          >
            <span className="text-[11px] font-semibold text-slate-500 px-1">Cỡ ảnh:</span>
            {(['35%', '65%', '100%', 'auto'] as const).map((size) => {
              const label =
                size === '35%' ? 'Nhỏ' : size === '65%' ? 'Vừa' : size === '100%' ? 'Đầy' : 'Gốc';
              const active = imagePopover.width === size || (!imagePopover.width && size === 'auto');
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => handleUpdateImageWidth(size)}
                  className={`px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}

            <div className="w-px h-4 bg-slate-200 mx-0.5" />

            <button
              type="button"
              onClick={() => {
                const src = imagePopover.src;
                setImagePopover(null);
                if (src) setLightboxSrc(src);
              }}
              title="Phóng to ảnh để xem chi tiết"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold cursor-pointer"
            >
              <ZoomIn className="w-3 h-3" />
              <span>Phóng to</span>
            </button>

            <a
              href={imagePopover.src}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setImagePopover(null)}
              title="Mở ảnh gốc ở tab mới"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-700 font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Mở</span>
            </a>

            <button
              type="button"
              onClick={handleDeletePopoverImage}
              title="Xóa ảnh khỏi ghi chú"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Xóa</span>
            </button>

            <button
              type="button"
              onClick={() => setImagePopover(null)}
              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Popover nổi khi nhấp vào Link trong trình soạn thảo */}
        {linkPopover && (
          <div
            style={{ top: linkPopover.top, left: linkPopover.left }}
            className="absolute z-30 bg-white border border-slate-200 rounded-xl shadow-xl px-3 py-2 flex items-center gap-2 text-xs animate-in fade-in zoom-in-95 duration-100"
          >
            {linkPopover.isInternal ? (
              <>
                <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold max-w-[180px] truncate">
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{linkPopover.text}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const href = linkPopover.href;
                    setLinkPopover(null);
                    handleNavigateFromHref(href);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                >
                  <span>Đi tới ô</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 text-blue-600 font-medium max-w-[180px] truncate">
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{linkPopover.href}</span>
                </span>
                <a
                  href={linkPopover.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setLinkPopover(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                >
                  <span>Mở web</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}

            <button
              type="button"
              onClick={handleUnlinkPopoverAnchor}
              title="Gỡ bỏ liên kết này"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 cursor-pointer"
            >
              <Unlink className="w-3 h-3" />
              <span>Gỡ</span>
            </button>

            <button
              type="button"
              onClick={() => setLinkPopover(null)}
              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL CHÈN ẢNH NHẸ (NÉN WEBP → SUPABASE STORAGE / LINK NGOÀI)     */}
      {/* ================================================================= */}
      {showImageModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <ImagePlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Chèn hình ảnh nhẹ</h3>
                  <p className="text-[11px] text-slate-500">
                    Tự động thu gọn (tối đa 2200px) &amp; nén WebP chất lượng cao trước khi lưu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setImageTab('upload')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  imageTab === 'upload'
                    ? 'bg-white text-sky-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Tải từ máy (WebP)</span>
              </button>
              <button
                type="button"
                onClick={() => setImageTab('url')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  imageTab === 'url'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Dán Link ảnh ngoài</span>
              </button>
            </div>

            {imageTab === 'upload' ? (
              <div className="space-y-3">
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleSelectImageFiles(e.target.files);
                    e.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  className="w-full py-7 px-4 rounded-xl border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/60 hover:bg-sky-50 transition-colors flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
                >
                  <UploadCloud className="w-8 h-8 text-sky-600" />
                  <div className="text-xs font-bold text-slate-700">
                    Bấm để chọn ảnh từ máy (hỗ trợ nhiều ảnh)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Mẹo nhanh: Nhấn <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">Ctrl + V</kbd> để dán ảnh chụp màn hình hoặc kéo-thả thẳng vào trang viết!
                  </div>
                </button>

                {!isSupabaseConfigured() && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
                    <strong>Lưu ý:</strong> Bạn chưa cấu hình <strong>Supabase Cloud</strong>. Hãy mở mục{' '}
                    <strong>Đồng bộ Cloud</strong> ở thanh trên để kết nối và chạy Script SQL tạo bucket{' '}
                    <code className="font-mono bg-amber-100 px-1 rounded">note-images</code>, hoặc chuyển sang tab{' '}
                    <strong>Dán Link ảnh ngoài</strong>.
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleInsertExternalImage} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Đường dẫn ảnh (URL) *
                  </label>
                  <input
                    type="text"
                    autoFocus
                    required
                    value={externalImageUrl}
                    onChange={(e) => setExternalImageUrl(e.target.value)}
                    placeholder="https://example.com/hinh-anh.webp"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-sky-500 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Kích thước hiển thị
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['auto', '35%', '65%', '100%'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setExternalImageWidth(sz)}
                        className={`py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                          externalImageWidth === sz
                            ? 'bg-sky-50 border-sky-500 text-sky-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {sz === 'auto' ? 'Gốc' : sz}
                      </button>
                    ))}
                  </div>
                </div>

                {externalImageUrl.trim() && (
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex justify-center max-h-40 overflow-hidden">
                    <img
                      src={
                        /^https?:\/\//i.test(externalImageUrl.trim())
                          ? externalImageUrl.trim()
                          : `https://${externalImageUrl.trim()}`
                      }
                      alt="Xem trước ảnh"
                      className="max-h-36 object-contain rounded-lg"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowImageModal(false)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!externalImageUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Chèn ảnh</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL CHÈN LINK (NỘI BỘ CÙNG TAB & WEB NGOÀI)                     */}
      {/* ================================================================= */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <LinkIcon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Chèn liên kết</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chuyển Tab Nội Bộ / Web Ngoài */}
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setLinkTab('internal')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  linkTab === 'internal'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Link Nội Bộ (Cùng tab)</span>
              </button>
              <button
                type="button"
                onClick={() => setLinkTab('external')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  linkTab === 'external'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Link Web Ngoài</span>
              </button>
            </div>

            {linkTab === 'internal' ? (
              <form onSubmit={handleInsertInternalLink} className="space-y-3.5">
                {allMaps.length > 1 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Thuộc Bản đồ
                    </label>
                    <select
                      value={targetMapId}
                      onChange={(e) => {
                        const nextMapId = e.target.value;
                        setTargetMapId(nextMapId);
                        const foundMap = allMaps.find((m) => m.id === nextMapId);
                        const firstNode = foundMap?.nodes?.[0];
                        setTargetNodeId(firstNode?.id || '');
                        if (firstNode && !linkTitle.trim()) {
                          setLinkTitle(firstNode.data.label || '');
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                    >
                      {allMaps.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.id === currentMapId ? '(Bản đồ hiện tại)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Chọn ô ghi chú đích *
                  </label>
                  {targetMapNodes.length > 0 ? (
                    <select
                      value={targetNodeId}
                      onChange={(e) => {
                        setTargetNodeId(e.target.value);
                        const found = targetMapNodes.find((n) => n.id === e.target.value);
                        if (found && !linkTitle.trim()) {
                          setLinkTitle(found.data.label || '');
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                    >
                      <option value="">-- Chọn một ô ghi chú --</option>
                      {targetMapNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.data.label || 'Chưa đặt tên'}
                          {n.id === nodeId && targetMapId === currentMapId ? ' (Ô hiện tại)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                      Bản đồ này chưa có ô ghi chú nào.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tên hiển thị (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="Mặc định lấy theo tiêu đề ô đích"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowLinkModal(false)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!targetNodeId}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Chèn link nội bộ</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleInsertExternalLink} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tên hiển thị
                  </label>
                  <input
                    type="text"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="Ví dụ: Google Docs Bài Giảng"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Đường dẫn (URL) *
                  </label>
                  <input
                    type="text"
                    autoFocus
                    required
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://docs.google.com/... hoặc example.com"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:bg-white font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowLinkModal(false)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!linkUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Chèn link ngoài</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL KHUNG CHÈN MÃ HỖ TRỢ KATEX                                  */}
      {/* ================================================================= */}
      {showCodeModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {editingEmbedTarget ? 'Chỉnh sửa Khung Mã' : 'Khung Mã (Markdown + KaTeX)'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Hỗ trợ Markdown (#, **đậm**, danh sách, bảng, ```code```) kết hợp KaTeX ($...$ / $$...$$)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCodeModal(false);
                  setEditingEmbedTarget(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleConfirmKatex} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Chọn kiểu hiển thị */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setKatexMode('block')}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    katexMode === 'block'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold">Công thức Khối</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">LaTeX căn giữa trong khung</div>
                </button>

                <button
                  type="button"
                  onClick={() => setKatexMode('mixed')}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    katexMode === 'mixed'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold">Khung Mã (MD+TeX)</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Markdown + $...$ và $$...$$</div>
                </button>

                <button
                  type="button"
                  onClick={() => setKatexMode('inline')}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    katexMode === 'inline'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold">Công thức Cùng dòng</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Chèn gọn trên dòng chữ</div>
                </button>
              </div>

              {/* Tiêu đề khung (cho Block & Mixed) */}
              {katexMode !== 'inline' && (
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Nhãn tiêu đề khung (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={katexTitle}
                    onChange={(e) => setKatexTitle(e.target.value)}
                    placeholder="Ví dụ: Công thức Taylor, Định lý, Ghi chú mã..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              )}

              {/* Gợi ý nhanh các ký hiệu KaTeX */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
                  Chèn nhanh mẫu LaTeX:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {KATEX_SNIPPETS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        const snippet = katexMode === 'mixed' ? `$${s.code}$` : s.code;
                        setKatexCode((prev) => (prev ? `${prev} ${snippet}` : snippet));
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-[11px] font-medium text-slate-700 hover:text-emerald-700 transition-colors cursor-pointer"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ô nhập mã */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  {katexMode === 'mixed'
                    ? 'Nhập Markdown / văn bản / mã (dùng $...$ hoặc $$...$$ cho KaTeX):'
                    : 'Nhập mã công thức LaTeX / KaTeX:'}
                </label>
                <textarea
                  autoFocus
                  rows={7}
                  value={katexCode}
                  onChange={(e) => setKatexCode(e.target.value)}
                  placeholder={
                    katexMode === 'mixed'
                      ? 'Ví dụ:\n## Định lý Pytago\n- Với tam giác vuông: $a^2 + b^2 = c^2$\n$$c = \\sqrt{a^2 + b^2}$$'
                      : 'Ví dụ: \\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}'
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:bg-white leading-relaxed"
                />
              </div>

              {/* Khung xem trước trực tiếp */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-1">
                  Xem trước kết quả hiển thị:
                </div>
                <div className="min-h-[84px] max-h-56 overflow-y-auto p-3.5 rounded-xl bg-[#f8fafc] border border-slate-200 text-slate-800">
                  {katexCode.trim() ? (
                    <div
                      className="sn-katex-preview text-sm"
                      dangerouslySetInnerHTML={{ __html: katexPreviewHtml }}
                    />
                  ) : (
                    <span className="text-slate-400 italic text-xs">
                      Kết quả hiển thị KaTeX sẽ xuất hiện tại đây khi bạn gõ mã...
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCodeModal(false);
                    setEditingEmbedTarget(null);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!katexCode.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingEmbedTarget ? 'Cập nhật khung mã' : 'Chèn vào bài viết'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
};
