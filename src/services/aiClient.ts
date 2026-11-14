import type { AiToolTrace } from '../types';
import {
  getCandidateModels,
  normalizeAiBaseUrl,
  type ResolvedAiConfig,
} from './aiConfig';

export interface AiToolExecutionResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<AiToolExecutionResult> | AiToolExecutionResult;
}

export interface AiTurnInputMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunAiAgentTurnOptions {
  config: ResolvedAiConfig;
  systemPrompt: string;
  history: AiTurnInputMessage[];
  userMessage: string;
  tools: AiToolDefinition[];
  overrideModel?: string;
  signal?: AbortSignal;
  onModelAttempt?: (info: { model: string; rotatedFrom?: string; reason?: string }) => void;
  onToolTrace?: (trace: AiToolTrace) => void;
}

export interface RunAiAgentTurnResult {
  reply: string;
  modelUsed: string;
  rotatedModels: string[];
  traces: AiToolTrace[];
}

interface RawToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
}

interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface RawChatCompletionResponse {
  error?: { message?: string; code?: string | number } | string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | Array<{ type?: string; text?: string }> | null;
      tool_calls?: RawToolCall[];
    };
  }>;
}

function extractTextContent(
  rawContent: string | Array<{ type?: string; text?: string }> | null | undefined
): string {
  if (typeof rawContent === 'string') return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function parseToolArgs(rawArgs: unknown): { ok: true; value: Record<string, unknown>; rawJson: string } | { ok: false; error: string; rawJson: string } {
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    return {
      ok: true,
      value: rawArgs as Record<string, unknown>,
      rawJson: JSON.stringify(rawArgs),
    };
  }
  const str = typeof rawArgs === 'string' ? rawArgs.trim() : '{}';
  if (!str) {
    return { ok: true, value: {}, rawJson: '{}' };
  }
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, value: parsed as Record<string, unknown>, rawJson: str };
    }
    return { ok: false, error: 'Tham số tool phải là JSON object', rawJson: str };
  } catch (err) {
    return {
      ok: false,
      error: `JSON tham số không hợp lệ: ${err instanceof Error ? err.message : 'parse error'}`,
      rawJson: str,
    };
  }
}

function buildTextToolInstructions(tools: AiToolDefinition[]): string {
  if (tools.length === 0) return '';
  const specs = tools
    .map((t) => `- ${t.name}: ${t.description}\n  parameters: ${JSON.stringify(t.parameters)}`)
    .join('\n');
  return (
    `\n\n[CÔNG CỤ DỰ PHÒNG DẠNG TEXT]\n` +
    `Khi cần gọi công cụ, trả về ĐÚNG định dạng:\n` +
    `<tool_call>{"name": "tên_công_cụ", "arguments": { ... }}</tool_call>\n` +
    `Danh sách công cụ:\n${specs}`
  );
}

function extractTextToolCalls(text: string): Array<{ name: string; arguments: Record<string, unknown> }> {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.name === 'string') {
        const args =
          parsed.arguments && typeof parsed.arguments === 'object'
            ? (parsed.arguments as Record<string, unknown>)
            : {};
        calls.push({ name: parsed.name, arguments: args });
      }
    } catch {
      // Bỏ qua block JSON lỗi
    }
  }
  return calls;
}

function stripTextToolCallTags(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
}

async function callSingleModelCompletion(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessagePayload[];
  tools: AiToolDefinition[];
  temperature: number;
  useNativeTools: boolean;
  signal?: AbortSignal;
}): Promise<{ ok: true; content: string; toolCalls: RawToolCall[] } | { ok: false; error: string; aborted?: boolean }> {
  const url = `${normalizeAiBaseUrl(params.baseUrl)}/chat/completions`;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 45000);

  const onParentAbort = () => timeoutController.abort();
  params.signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      stream: false,
    };

    if (params.useNativeTools && params.tools.length > 0) {
      body.tools = params.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: timeoutController.signal,
    });

    const rawText = await res.text();
    let json: RawChatCompletionResponse | null = null;
    try {
      json = JSON.parse(rawText) as RawChatCompletionResponse;
    } catch {
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${rawText.slice(0, 180) || res.statusText}` };
      }
      return { ok: false, error: 'Phản hồi từ AI không phải JSON hợp lệ' };
    }

    if (!res.ok || json?.error) {
      const errMsg =
        typeof json?.error === 'string'
          ? json.error
          : json?.error?.message || `HTTP ${res.status} ${res.statusText}`;
      return { ok: false, error: errMsg };
    }

    const msg = json?.choices?.[0]?.message;
    if (!msg) {
      return { ok: false, error: 'Model trả về choices rỗng' };
    }

    const content = extractTextContent(msg.content);
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    if (!content.trim() && toolCalls.length === 0) {
      return { ok: false, error: 'Model trả về nội dung rỗng' };
    }

    return { ok: true, content, toolCalls };
  } catch (err) {
    if (params.signal?.aborted) {
      return { ok: false, error: 'Người dùng đã dừng tác vụ AI.', aborted: true };
    }
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      error: isTimeout
        ? 'Quá thời gian chờ phản hồi (45s)'
        : err instanceof Error
        ? err.message
        : 'Lỗi kết nối mạng tới AI endpoint',
    };
  } finally {
    clearTimeout(timeoutId);
    params.signal?.removeEventListener('abort', onParentAbort);
  }
}

const MODEL_COOLDOWN_MS = 120_000;
const modelCooldownUntil = new Map<string, number>();

function orderModelsBySessionHealth(candidates: string[], allowReorder: boolean): string[] {
  if (!allowReorder || candidates.length <= 1) return candidates;
  const now = Date.now();
  const healthy: string[] = [];
  const cooling: string[] = [];
  for (const m of candidates) {
    const until = modelCooldownUntil.get(m) || 0;
    if (until > now) {
      cooling.push(m);
    } else {
      healthy.push(m);
    }
  }
  return healthy.length > 0 ? [...healthy, ...cooling] : candidates;
}

async function callWithRotation(params: {
  config: ResolvedAiConfig;
  candidates: string[];
  messages: ChatMessagePayload[];
  tools: AiToolDefinition[];
  useNativeTools: boolean;
  signal?: AbortSignal;
  rotatedModels: string[];
  onModelAttempt?: RunAiAgentTurnOptions['onModelAttempt'];
}): Promise<{ model: string; content: string; toolCalls: RawToolCall[] }> {
  const failures: string[] = [];
  let prevModel: string | undefined;
  let prevReason: string | undefined;

  for (const model of params.candidates) {
    if (params.signal?.aborted) {
      throw new Error('Đã hủy yêu cầu AI.');
    }

    params.onModelAttempt?.({
      model,
      rotatedFrom: prevModel,
      reason: prevReason,
    });

    const attempt = await callSingleModelCompletion({
      baseUrl: params.config.baseUrl,
      apiKey: params.config.apiKey,
      model,
      messages: params.messages,
      tools: params.tools,
      temperature: params.config.temperature,
      useNativeTools: params.useNativeTools,
      signal: params.signal,
    });

    if (attempt.ok) {
      modelCooldownUntil.delete(model);
      if (prevModel && !params.rotatedModels.includes(model)) {
        params.rotatedModels.push(model);
      }
      return {
        model,
        content: attempt.content,
        toolCalls: attempt.toolCalls,
      };
    }

    if (attempt.aborted) {
      throw new Error(attempt.error);
    }

    modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
    failures.push(`${model}: ${attempt.error}`);
    if (!params.rotatedModels.includes(model)) {
      params.rotatedModels.push(model);
    }
    prevModel = model;
    prevReason = attempt.error;
  }

  throw new Error(
    `Tất cả model AI đều lỗi hoặc quá tải:\n• ${failures.slice(0, 5).join('\n• ')}`
  );
}

export async function runAiAgentTurn(options: RunAiAgentTurnOptions): Promise<RunAiAgentTurnResult> {
  const { config, history, userMessage, tools, signal } = options;

  if (!config.baseUrl) {
    throw new Error('Chưa cấu hình AI Base URL.');
  }
  if (!config.apiKey) {
    throw new Error('Chưa cấu hình AI API Token.');
  }

  let candidateOrder = orderModelsBySessionHealth(
    getCandidateModels(config, options.overrideModel),
    config.autoRotate
  );
  const rotatedModels: string[] = [];
  const traces: AiToolTrace[] = [];
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const trimmedHistory = history.slice(-12).map(
    (msg): ChatMessagePayload => ({
      role: msg.role,
      content: msg.content || '',
    })
  );

  const messages: ChatMessagePayload[] = [
    { role: 'system', content: options.systemPrompt },
    ...trimmedHistory,
    { role: 'user', content: userMessage },
  ];

  let activeModel = candidateOrder[0];
  let useNativeTools = tools.length > 0;

  for (let step = 0; step < config.maxSteps; step++) {
    if (signal?.aborted) {
      throw new Error('Đã dừng phiên AI.');
    }

    // Đặt model đang chạy tốt lên đầu ở các bước tiếp theo
    const stepCandidates = [
      activeModel,
      ...candidateOrder.filter((m) => m !== activeModel),
    ];

    let response: { model: string; content: string; toolCalls: RawToolCall[] };
    try {
      response = await callWithRotation({
        config,
        candidates: stepCandidates,
        messages,
        tools,
        useNativeTools,
        signal,
        rotatedModels,
        onModelAttempt: options.onModelAttempt,
      });
    } catch (err) {
      if (useNativeTools && step === 0 && !signal?.aborted) {
        // Fallback sang chế độ gọi tool bằng JSON text nếu tất cả model từ chối schema tools native
        useNativeTools = false;
        messages[0] = {
          role: 'system',
          content: options.systemPrompt + buildTextToolInstructions(tools),
        };
        response = await callWithRotation({
          config,
          candidates: candidateOrder,
          messages,
          tools: [],
          useNativeTools: false,
          signal,
          rotatedModels,
          onModelAttempt: options.onModelAttempt,
        });
      } else {
        throw err;
      }
    }

    activeModel = response.model;
    candidateOrder = [activeModel, ...candidateOrder.filter((m) => m !== activeModel)];

    // Kiểm tra tool calls (native hoặc fallback <tool_call>)
    const normalizedCalls: Array<{
      id: string;
      name: string;
      rawArgsJson: string;
      parsedArgs: { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
    }> = [];

    if (response.toolCalls.length > 0) {
      response.toolCalls.forEach((tc, idx) => {
        const fnName = (tc.function?.name || '').trim();
        const callId = (tc.id || '').trim() || `call_${step}_${idx}_${Date.now()}`;
        const parsed = parseToolArgs(tc.function?.arguments);
        normalizedCalls.push({
          id: callId,
          name: fnName,
          rawArgsJson: parsed.rawJson,
          parsedArgs: parsed.ok
            ? { ok: true, value: parsed.value }
            : { ok: false, error: parsed.error },
        });
      });
    } else if (!useNativeTools && tools.length > 0) {
      const textCalls = extractTextToolCalls(response.content);
      textCalls.forEach((tc, idx) => {
        normalizedCalls.push({
          id: `txtcall_${step}_${idx}`,
          name: tc.name,
          rawArgsJson: JSON.stringify(tc.arguments),
          parsedArgs: { ok: true, value: tc.arguments },
        });
      });
    }

    if (normalizedCalls.length === 0) {
      const cleanReply = stripTextToolCallTags(response.content) || response.content;
      return {
        reply: cleanReply,
        modelUsed: activeModel,
        rotatedModels,
        traces,
      };
    }

    if (useNativeTools) {
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: normalizedCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: {
            name: c.name,
            arguments: c.rawArgsJson,
          },
        })),
      });
    } else {
      messages.push({
        role: 'assistant',
        content: response.content || '',
      });
    }

    const textResultsBuffer: string[] = [];

    for (const call of normalizedCalls) {
      const traceId = `${call.id}-${Math.random().toString(36).slice(2, 6)}`;
      const runningTrace: AiToolTrace = {
        id: traceId,
        toolName: call.name,
        summary: `Đang chạy ${call.name}...`,
        status: 'running',
      };
      traces.push(runningTrace);
      options.onToolTrace?.({ ...runningTrace });

      let resultPayload: AiToolExecutionResult;
      const toolDef = toolMap.get(call.name);
      if (!toolDef) {
        resultPayload = {
          ok: false,
          summary: `Không tồn tại công cụ "${call.name}"`,
          error: `Tool "${call.name}" chưa được đăng ký.`,
        };
      } else if (!call.parsedArgs.ok) {
        resultPayload = {
          ok: false,
          summary: 'Lỗi cú pháp tham số JSON',
          error: call.parsedArgs.error,
        };
      } else {
        try {
          resultPayload = await toolDef.execute(call.parsedArgs.value);
        } catch (err) {
          resultPayload = {
            ok: false,
            summary: `Lỗi thực thi ${call.name}`,
            error: err instanceof Error ? err.message : 'Lỗi không xác định',
          };
        }
      }

      runningTrace.status = resultPayload.ok ? 'done' : 'error';
      runningTrace.summary = resultPayload.summary || (resultPayload.ok ? 'Hoàn tất' : 'Thất bại');
      runningTrace.detail = resultPayload.error;
      options.onToolTrace?.({ ...runningTrace });

      const serializedResult = JSON.stringify(resultPayload);
      if (useNativeTools) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: serializedResult,
        });
      } else {
        textResultsBuffer.push(`[TOOL_RESULT ${call.name}]: ${serializedResult}`);
      }
    }

    if (!useNativeTools && textResultsBuffer.length > 0) {
      messages.push({
        role: 'user',
        content: `${textResultsBuffer.join('\n')}\nHãy tiếp tục xử lý hoặc trả lời kết quả cuối cho người dùng.`,
      });
    }
  }

  // Nếu hết vòng maxSteps mà vẫn gọi tool, yêu cầu tổng kết ngắn gọn
  messages.push({
    role: 'user',
    content: 'Hãy tổng hợp ngắn gọn bằng tiếng Việt những gì bạn vừa thực hiện xong cho tôi.',
  });

  const summaryResponse = await callWithRotation({
    config,
    candidates: [activeModel, ...candidateOrder.filter((m) => m !== activeModel)],
    messages,
    tools: [],
    useNativeTools: false,
    signal,
    rotatedModels,
    onModelAttempt: options.onModelAttempt,
  });

  return {
    reply: stripTextToolCallTags(summaryResponse.content) || 'Đã hoàn thành các thao tác yêu cầu.',
    modelUsed: summaryResponse.model,
    rotatedModels,
    traces,
  };
}

export async function testAiConnection(
  config: ResolvedAiConfig,
  modelOverride?: string
): Promise<{ ok: boolean; modelUsed?: string; latencyMs: number; message: string }> {
  const started = performance.now();
  const candidates = getCandidateModels(config, modelOverride);
  if (!config.baseUrl || !config.apiKey) {
    return {
      ok: false,
      latencyMs: 0,
      message: 'Thiếu Base URL hoặc API Token.',
    };
  }

  const targetModel = candidates[0];
  const res = await callSingleModelCompletion({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: targetModel,
    messages: [{ role: 'user', content: 'Trả lời đúng 2 chữ: OK.' }],
    tools: [],
    temperature: 0,
    useNativeTools: false,
  });

  const latencyMs = Math.round(performance.now() - started);
  if (res.ok) {
    return {
      ok: true,
      modelUsed: targetModel,
      latencyMs,
      message: `Kết nối thành công (${targetModel}) - ${latencyMs}ms`,
    };
  }

  return {
    ok: false,
    latencyMs,
    message: `Lỗi (${targetModel}): ${res.error}`,
  };
}
