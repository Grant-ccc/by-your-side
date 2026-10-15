import {
  ConversationSchema,
  ReplyResultSchema,
  AiInfoSchema,
  HistorySchema,
  MessageSchema,
  type Conversation,
  type Message,
  type ServiceHealth,
  type SendMessage,
} from '@bys/shared';
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request(path: string, init?: RequestInit, timeout = 8000) {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(timeout),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiRequestError(
      data.error?.message || '服务暂时不可用',
      data.error?.code || 'SERVICE_UNAVAILABLE',
      response.status,
    );
  return data;
}
export async function health(): Promise<ServiceHealth> {
  const r = await fetch('/health', { signal: AbortSignal.timeout(5000) });
  return r.json();
}
export async function bootstrap(): Promise<Conversation[]> {
  const data = await request('/api/bootstrap');
  return ConversationSchema.array().parse(data.conversations);
}
export async function loadHistory(id: string): Promise<Message[]> {
  let cursor = 0;
  const messages: Message[] = [];
  for (let i = 0; i < 100; i++) {
    const data = HistorySchema.parse(
      await request(`/api/conversations/${id}/messages?after=${cursor}&limit=100`),
    );
    messages.push(...data.messages);
    if (!data.hasMore) return messages;
    if (data.nextCursor <= cursor) throw new Error('消息游标异常');
    cursor = data.nextCursor;
  }
  throw new Error('历史记录过多，分段历史加载功能尚待接入');
}
export async function sendMessage(id: string, input: SendMessage): Promise<Message> {
  const data = await request(`/api/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return MessageSchema.parse(data.message);
}
export async function aiInfo() {
  return AiInfoSchema.parse(await request('/api/ai'));
}
export async function replyStatus(id: string, messageId: string) {
  return ReplyResultSchema.parse(
    await request(`/api/conversations/${id}/messages/${messageId}/reply`),
  );
}
export async function generateReply(id: string, messageId: string, retry = false) {
  return ReplyResultSchema.parse(
    await request(
      `/api/conversations/${id}/messages/${messageId}/reply`,
      {
        method: 'POST',
        body: JSON.stringify({ retry }),
      },
      60000,
    ),
  );
}
