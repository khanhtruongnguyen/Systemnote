import type { NodeColor, CanvasThemeId } from '../types';

export interface CanvasTheme {
  id: CanvasThemeId;
  name: string;
  description: string;
  swatch: string;
  swatchBorder: string;
  canvasBg: string;
  dotColor: string;
  chromeBg: string;
  chromeBorder: string;
  bodyBg: string;
  isDark: boolean;
}

export const CANVAS_THEMES: Record<CanvasThemeId, CanvasTheme> = {
  light: {
    id: 'light',
    name: 'Trắng sáng',
    description: 'Nền trắng xanh dịu, sạch sẽ',
    swatch: '#f8fafc',
    swatchBorder: '#cbd5e1',
    canvasBg: '#f8fafc',
    dotColor: '#d5dce6',
    chromeBg: 'bg-white/95',
    chromeBorder: 'border-slate-200',
    bodyBg: '#f1f4f8',
    isDark: false,
  },
  warm: {
    id: 'warm',
    name: 'Giấy ấm',
    description: 'Tông kem dịu mắt khi đọc lâu',
    swatch: '#f5f0e4',
    swatchBorder: '#d6ccb8',
    canvasBg: '#f6f3eb',
    dotColor: '#d9d1c0',
    chromeBg: 'bg-[#fcfaf5]/95',
    chromeBorder: 'border-[#e6dfd1]',
    bodyBg: '#efeae0',
    isDark: false,
  },
  slate: {
    id: 'slate',
    name: 'Xám dịu',
    description: 'Giảm chói, trung tính nhẹ nhàng',
    swatch: '#e6ebf2',
    swatchBorder: '#bfcad8',
    canvasBg: '#edf1f5',
    dotColor: '#c9d2de',
    chromeBg: 'bg-[#f8fafc]/95',
    chromeBorder: 'border-slate-200',
    bodyBg: '#e4e9f0',
    isDark: false,
  },
  dark: {
    id: 'dark',
    name: 'Ban đêm',
    description: 'Nền tối sâu bảo vệ mắt',
    swatch: '#161a22',
    swatchBorder: '#334155',
    canvasBg: '#0f1218',
    dotColor: '#252b37',
    chromeBg: 'bg-[#161a22]/95',
    chromeBorder: 'border-slate-800',
    bodyBg: '#12161f',
    isDark: true,
  },
};

export const DEFAULT_CANVAS_THEME: CanvasThemeId = 'light';

export interface ColorScheme {
  id: NodeColor;
  name: string;
  bg: string;
  softBg: string;
  border: string;
  glow: string;
  badge: string;
  dot: string;
  strip: string;
  text: string;
  accent: string;
}

export const COLOR_SCHEMES: Record<NodeColor, ColorScheme> = {
  purple: {
    id: 'purple',
    name: 'Tím Hoa Cà',
    bg: 'bg-white',
    softBg: 'bg-purple-50/50',
    border: 'border-slate-200/90 hover:border-slate-300',
    glow: 'shadow-[0_6px_20px_rgba(15,23,42,0.08)]',
    badge: 'bg-purple-50 text-purple-700 border-purple-200/80',
    dot: 'bg-purple-500',
    strip: 'bg-purple-500/80',
    text: 'text-slate-800',
    accent: '#7c3aed',
  },
  blue: {
    id: 'blue',
    name: 'Xanh Dương',
    bg: 'bg-white',
    softBg: 'bg-blue-50/50',
    border: 'border-slate-200/90 hover:border-slate-300',
    glow: 'shadow-[0_6px_20px_rgba(15,23,42,0.08)]',
    badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
    dot: 'bg-blue-500',
    strip: 'bg-blue-500/80',
    text: 'text-slate-800',
    accent: '#2563eb',
  },
  emerald: {
    id: 'emerald',
    name: 'Xanh Ngọc Lục',
    bg: 'bg-white',
    softBg: 'bg-emerald-50/50',
    border: 'border-slate-200/90 hover:border-slate-300',
    glow: 'shadow-[0_6px_20px_rgba(15,23,42,0.08)]',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    dot: 'bg-emerald-500',
    strip: 'bg-emerald-500/80',
    text: 'text-slate-800',
    accent: '#059669',
  },
  amber: {
    id: 'amber',
    name: 'Vàng Hổ Phách',
    bg: 'bg-white',
    softBg: 'bg-amber-50/50',
    border: 'border-slate-200/90 hover:border-slate-300',
    glow: 'shadow-[0_6px_20px_rgba(15,23,42,0.08)]',
    badge: 'bg-amber-50 text-amber-800 border-amber-200/80',
    dot: 'bg-amber-500',
    strip: 'bg-amber-500/80',
    text: 'text-slate-800',
    accent: '#d97706',
  },
  rose: {
    id: 'rose',
    name: 'Hồng San Hô',
    bg: 'bg-white',
    softBg: 'bg-rose-50/50',
    border: 'border-slate-200/90 hover:border-slate-300',
    glow: 'shadow-[0_6px_20px_rgba(15,23,42,0.08)]',
    badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
    dot: 'bg-rose-500',
    strip: 'bg-rose-500/80',
    text: 'text-slate-800',
    accent: '#e11d48',
  },
  cyan: {
    id: 'cyan',
    name: 'Xanh Biển Nhạt',
    bg: 'bg-white',
    softBg: 'bg-cyan-50/50',
    border: 'border-slate-200/90 hover:border-slate-300',
    glow: 'shadow-[0_6px_20px_rgba(15,23,42,0.08)]',
    badge: 'bg-cyan-50 text-cyan-800 border-cyan-200/80',
    dot: 'bg-cyan-500',
    strip: 'bg-cyan-500/80',
    text: 'text-slate-800',
    accent: '#0891b2',
  },
  indigo: {
    id: 'indigo',
    name: 'Chàm Indigo',
    bg: 'bg-white',
    softBg: 'bg-indigo-50/50',
    border: 'border-slate-200/90 hover:border-slate-300',
    glow: 'shadow-[0_6px_20px_rgba(15,23,42,0.08)]',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    dot: 'bg-indigo-500',
    strip: 'bg-indigo-500/80',
    text: 'text-slate-800',
    accent: '#4f46e5',
  },
  graphite: {
    id: 'graphite',
    name: 'Xám Thanh Lịch',
    bg: 'bg-white',
    softBg: 'bg-slate-50',
    border: 'border-slate-200/90 hover:border-slate-300',
    glow: 'shadow-[0_6px_20px_rgba(15,23,42,0.08)]',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-500',
    strip: 'bg-slate-400',
    text: 'text-slate-800',
    accent: '#475569',
  },
};
