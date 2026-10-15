import Fastify from 'fastify';
import {
  CreateConversationSchema,
  IdSchema,
  SendMessageSchema,
  type ServiceHealth,
} from '@bys/shared';
import { StoreError, type ChatStore } from './store.js';
import { z } from 'zod';
import { AiError } from './ai-provider.js';
import type { ChatAi } from './ai-chat.js';
import { authorized, privateIpv4, validDeviceToken } from './lan-policy.js';

export function buildApp(
  store: ChatStore,
  options: {
    port?: number;
    webPort?: number;
    logger?: boolean;
    ai?: ChatAi;
    lan?: { host: string; token: string; cert: Buffer; key: Buffer };
  } = {},
) {
  if (options.lan && (!privateIpv4(options.lan.host) || !validDeviceToken(options.lan.token)))
    throw new Error('LAN requires a private IPv4 host and a generated device token');
  const app = Fastify({
    logger: options.logger ? { redact: ['req.headers.authorization'] } : false,
    bodyLimit: 16 * 1024,
    ...(options.lan
      ? { https: { cert: options.lan.cert, key: options.lan.key, minVersion: 'TLSv1.2' as const } }
      : {}),
  });
  const origins = new Set([
    `http://127.0.0.1:${options.webPort ?? 17400}`,
    `http://localhost:${options.webPort ?? 17400}`,
    `http://127.0.0.1:${options.port ?? 17401}`,
  ]);
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host?.split(':')[0];
    if (
      !host ||
      !['127.0.0.1', 'localhost', ...(options.lan ? [options.lan.host] : [])].includes(host)
    )
      return reply
        .code(403)
        .send({ error: { code: 'LOCAL_ONLY', message: '当前仅支持本机开发访问' } });
    if (options.lan && !authorized(request.headers.authorization, options.lan.token))
      return reply
        .code(401)
        .send({
          error: {
            code: 'DEVICE_UNAUTHORIZED',
            message: '连接凭据不正确，请重新粘贴电脑上的连接配置。',
          },
        });
    const origin = request.headers.origin;
    if (origin && !origins.has(origin))
      return reply
        .code(403)
        .send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: '请求来源不受支持' } });
    if (request.headers['sec-fetch-site'] === 'cross-site')
      return reply
        .code(403)
        .send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: '不接受跨站请求' } });
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AiError)
      return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    if (error instanceof StoreError)
      return reply
        .code(error.code === 'NOT_FOUND' ? 404 : 409)
        .send({ error: { code: error.code, message: error.message } });
    const statusCode =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 0;
    if (statusCode >= 400 && statusCode < 500)
      return reply
        .code(statusCode)
        .send({ error: { code: 'INVALID_REQUEST', message: '请求格式不正确' } });
    request.log.warn({ code: 'DATABASE_UNAVAILABLE' }, 'Local database request failed');
    return reply.code(503).send({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: '数据库尚未就绪，请启动 MySQL 并执行迁移。消息没有伪装成已保存。',
      },
    });
  });
  app.get('/health', async (_request, reply): Promise<ServiceHealth> => {
    try {
      await store.ready();
      return {
        status: 'ok',
        database: 'connected',
        ai: options.ai?.configured ? 'configured' : 'not-configured',
        mode: 'local-development',
      };
    } catch {
      reply.code(503);
      return {
        status: 'degraded',
        database: 'unavailable',
        ai: options.ai?.configured ? 'configured' : 'not-configured',
        mode: 'local-development',
      };
    }
  });
  app.get('/api/bootstrap', async () => {
    await store.bootstrap();
    return {
      conversations: await store.conversations(),
      capabilities: {
        ai: options.ai?.configured ?? false,
        storage: 'mysql' as const,
        authentication: options.lan ? ('device-token' as const) : ('local-only' as const),
      },
    };
  });
  app.get('/api/conversations', async () => ({ conversations: await store.conversations() }));
  app.get('/api/ai', async () => ({
    configured: options.ai?.configured ?? false,
    model: 'deepseek-flash',
    budget: options.ai ? await options.ai.budget() : null,
  }));
  for (const method of ['GET', 'POST'] as const) {
    app.route<{ Params: { id: string; messageId: string } }>({
      method,
      url: '/api/conversations/:id/messages/:messageId/reply',
      handler: async (request, reply) => {
        const id = IdSchema.safeParse(request.params.id),
          source = IdSchema.safeParse(request.params.messageId);
        const body = z
          .object({ retry: z.boolean().default(false) })
          .strict()
          .safeParse(request.body ?? {});
        if (!id.success || !source.success || (method === 'POST' && !body.success))
          return reply
            .code(400)
            .send({ error: { code: 'INVALID_REQUEST', message: '回复请求格式不正确' } });
        if (!options.ai) throw new AiError('AI_NOT_CONFIGURED', '尚未配置模型，消息可以保存。');
        return method === 'GET'
          ? options.ai.status(id.data, source.data)
          : options.ai.reply(id.data, source.data, body.success ? body.data.retry : false);
      },
    });
  }
  app.post('/api/conversations', async (request, reply) => {
    const input = CreateConversationSchema.safeParse(request.body);
    if (!input.success)
      return reply
        .code(400)
        .send({ error: { code: 'INVALID_REQUEST', message: '会话标题格式不正确' } });
    const conversation = await store.createConversation(input.data.title);
    return reply.code(201).send({ conversation });
  });
  app.get<{ Params: { id: string }; Querystring: { after?: string; limit?: string } }>(
    '/api/conversations/:id/messages',
    async (request, reply) => {
      const id = IdSchema.safeParse(request.params.id);
      const after = Number(request.query.after ?? 0),
        limit = Number(request.query.limit ?? 50);
      if (
        !id.success ||
        !Number.isSafeInteger(after) ||
        after < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_REQUEST', message: '消息游标或会话格式不正确' } });
      return store.history(id.data, after, limit);
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/conversations/:id/messages',
    async (request, reply) => {
      const id = IdSchema.safeParse(request.params.id),
        input = SendMessageSchema.safeParse(request.body);
      if (!id.success || !input.success)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: '请输入 1—2000 字的消息，并使用有效请求标识',
          },
        });
      const result = await store.saveMessage(id.data, input.data);
      return reply
        .code(result.duplicate ? 200 : 201)
        .send({ ...result, ai: options.ai?.configured ? 'configured' : 'not-configured' });
    },
  );
  app.addHook('onClose', async () => {
    await store.close();
  });
  return app;
}
