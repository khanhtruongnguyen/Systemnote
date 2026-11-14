import type { AppSettings } from '../types';

export const DEFAULT_AI_BASE_URL = 'https://api.xah.io/v1';
export const DEFAULT_AI_API_KEY =
  'sk-6e5bd68e2310d13bcf3747838f1cf8138d68e14e318e4e7e68cfb62a30aff59b';
export const DEFAULT_AI_PRIMARY_MODEL = 'vmquang/gemini-3.5-flash-lite';
export const DEFAULT_AI_FALLBACK_MODELS: string[] = [
  'vmquang/gemini-3.5-flash-lite',
  'dungcsnd113/gemini-flash-3.8',
  'levuphong2909/gemini-3.8-flash-high',
  'dungcsnd113/gemini-4-argon',
  'tanynguyen97/gemini-4-argon',
  'thanhnhan9023/gemini-3.7-flash-high',
  'devdoclang/gemini-3.8-flash',
  'sypham98/claude-fable-5-1',
];

export interface ResolvedAiConfig {
  baseUrl: string;
  apiKey: string;
  primaryModel: string;
  models: string[];
  disabledModels: string[];
  autoRotate: boolean;
  useWebSearchByDefault: boolean;
  useContextByDefault: boolean;
  alwaysWrapInCodeFrame: boolean;
  temperature: number;
  maxSteps: number;
}

export function normalizeAiBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

export function dedupeModelList(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of models) {
    const clean = (raw || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export function resolveAiConfig(settings?: AppSettings): ResolvedAiConfig {
  const baseUrl = normalizeAiBaseUrl(
    settings?.aiBaseUrl !== undefined && settings.aiBaseUrl.trim()
      ? settings.aiBaseUrl
      : DEFAULT_AI_BASE_URL
  );
  const apiKey =
    settings?.aiApiKey !== undefined ? settings.aiApiKey.trim() : DEFAULT_AI_API_KEY;

  const rawModels =
    Array.isArray(settings?.aiFallbackModels) && settings.aiFallbackModels.length > 0
      ? settings.aiFallbackModels
      : DEFAULT_AI_FALLBACK_MODELS;

  const models = dedupeModelList(rawModels);
  const safeModels = models.length > 0 ? models : [...DEFAULT_AI_FALLBACK_MODELS];

  const primaryCandidate = (settings?.aiPrimaryModel || '').trim();
  const primaryModel = primaryCandidate || safeModels[0] || DEFAULT_AI_PRIMARY_MODEL;

  const disabledModels = dedupeModelList(settings?.aiDisabledModels || []);

  const rawTemp = typeof settings?.aiTemperature === 'number' ? settings.aiTemperature : 0.35;
  const temperature = Math.min(Math.max(rawTemp, 0), 1.5);

  const rawSteps = typeof settings?.aiMaxSteps === 'number' ? settings.aiMaxSteps : 10;
  const maxSteps = Math.min(Math.max(Math.round(rawSteps), 2), 20);

  return {
    baseUrl,
    apiKey,
    primaryModel,
    models: dedupeModelList([primaryModel, ...safeModels]),
    disabledModels,
    autoRotate: settings?.aiAutoRotate !== false,
    useWebSearchByDefault: settings?.aiUseWebSearchByDefault !== false,
    useContextByDefault: settings?.aiUseContextByDefault !== false,
    alwaysWrapInCodeFrame: settings?.aiAlwaysWrapInCodeFrame !== false,
    temperature,
    maxSteps,
  };
}

export function getCandidateModels(
  config: ResolvedAiConfig,
  overridePrimary?: string
): string[] {
  const disabled = new Set(config.disabledModels);
  const preferred = (overridePrimary || config.primaryModel).trim();

  if (!config.autoRotate) {
    return preferred ? [preferred] : [config.models[0] || DEFAULT_AI_PRIMARY_MODEL];
  }

  const ordered = dedupeModelList([preferred, ...config.models]);
  const active = ordered.filter((m) => !disabled.has(m) || m === overridePrimary?.trim());
  return active.length > 0 ? active : ordered;
}
