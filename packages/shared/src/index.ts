import { z } from 'zod';

export const IdSchema = z.uuid();
export const SendMessageSchema = z
  .object({ clientRequestId: IdSchema, text: z.string().trim().min(1).max(2000) })
  .strict();
export const CreateConversationSchema = z
  .object({ title: z.string().trim().min(1).max(80).default('我们的日常') })
  .strict();
export const MessageSchema = z.object({
  id: IdSchema,
  sequence: z.number().int().positive(),
  conversationId: IdSchema,
  clientRequestId: IdSchema.nullable(),
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string(),
  status: z.enum(['saved', 'waiting', 'failed']),
  createdAt: z.iso.datetime(),
  replyToMessageId: IdSchema.nullable().optional(),
});
export const ConversationSchema = z.object({
  id: IdSchema,
  title: z.string(),
  createdAt: z.iso.datetime(),
});
export const HistorySchema = z.object({
  messages: z.array(MessageSchema),
  nextCursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type History = z.infer<typeof HistorySchema>;
export const ReplyResultSchema = z.object({
  state: z.enum(['idle', 'running', 'failed', 'succeeded']),
  message: MessageSchema.optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
});
export type ReplyResult = z.infer<typeof ReplyResultSchema>;
export const AiInfoSchema = z.object({
  configured: z.boolean(),
  model: z.string(),
  budget: z
    .object({ limit: z.number(), spent: z.number(), reserved: z.number(), currency: z.string() })
    .nullable(),
});
export type AiInfo = z.infer<typeof AiInfoSchema>;
export interface ServiceHealth {
  status: 'ok' | 'degraded';
  database: 'connected' | 'unavailable';
  ai: 'not-configured' | 'configured';
  mode: 'local-development';
}
export interface ApiError {
  error: { code: string; message: string };
}
