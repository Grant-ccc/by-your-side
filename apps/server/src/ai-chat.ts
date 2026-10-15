import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Message } from '@bys/shared';
import {
  AiError,
  context,
  inputBound,
  MAX_OUTPUT,
  type AiConfig,
  type AiProvider,
} from './ai-provider.js';
import { LOCAL_RELATIONSHIP, LOCAL_USER, StoreError } from './store.js';

export interface ReplyResult {
  state: 'idle' | 'running' | 'failed' | 'succeeded';
  message?: Message;
  error?: { code: string; message: string; retryable: boolean };
}
export interface ChatAi {
  configured: boolean;
  status(conversationId: string, sourceId: string): Promise<ReplyResult>;
  reply(conversationId: string, sourceId: string, retry: boolean): Promise<ReplyResult>;
  budget(): Promise<{ limit: number; spent: number; reserved: number; currency: string }>;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const cost = (input: number, output: number) => (input * 2 + output * 8) / 1e6;
function period() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}
function toMessage(row: RowDataPacket): Message {
  return {
    id: row.id,
    sequence: Number(row.sequence),
    conversationId: row.conversation_id,
    clientRequestId: row.client_request_id,
    role: row.role,
    text: row.text,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    replyToMessageId: row.reply_to_message_id,
  };
}
function failed(code: string): ReplyResult {
  return {
    state: 'failed',
    error: {
      code,
      retryable: code !== 'AI_UNCERTAIN',
      message:
        code === 'AI_UNCERTAIN'
          ? '调用结果尚不确定，可能已计费。不会自动重试；请先核对百炼账单。'
          : code === 'AI_RATE_LIMIT'
            ? '模型暂时繁忙，可以稍后手动重试。'
            : '请核对本机模型配置、密钥地域和账户额度，再手动重试。',
    },
  };
}
export class MysqlChatAi implements ChatAi {
  readonly configured: boolean;
  constructor(
    private pool: Pool,
    private config: AiConfig,
    private provider: AiProvider,
    private principal = { userId: LOCAL_USER, relationshipId: LOCAL_RELATIONSHIP },
  ) {
    this.configured = !!config.key;
  }
  private async source(db: Pool | PoolConnection, conversationId: string, sourceId: string) {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id
       WHERE m.id=? AND m.conversation_id=? AND m.role='user' AND c.relationship_id=?`,
      [sourceId, conversationId, this.principal.relationshipId],
    );
    if (!rows.length) throw new StoreError('NOT_FOUND', '消息不存在');
    return rows[0]!;
  }
  private async result(
    db: Pool | PoolConnection,
    conversationId: string,
    sourceId: string,
  ): Promise<ReplyResult> {
    const [replies] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM messages WHERE conversation_id=? AND reply_to_message_id=?',
      [conversationId, sourceId],
    );
    if (replies[0]) return { state: 'succeeded', message: toMessage(replies[0]) };
    const [runs] = await db.execute<RowDataPacket[]>(
      'SELECT state,error_code FROM generation_runs WHERE conversation_id=? AND source_message_id=? ORDER BY attempt DESC LIMIT 1',
      [conversationId, sourceId],
    );
    if (!runs[0]) return { state: 'idle' };
    if (runs[0].state === 'running') return { state: 'running' };
    return failed(runs[0].error_code || 'AI_UNCERTAIN');
  }
  async status(conversationId: string, sourceId: string) {
    await this.source(this.pool, conversationId, sourceId);
    return this.result(this.pool, conversationId, sourceId);
  }
  async budget() {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT spent_amount,reserved_amount FROM budget_periods WHERE user_id=? AND period=?',
      [this.principal.userId, period()],
    );
    return {
      limit: this.config.monthlyLimit,
      spent: Number(rows[0]?.spent_amount || 0),
      reserved: Number(rows[0]?.reserved_amount || 0),
      currency: 'CNY',
    };
  }
  async reply(conversationId: string, sourceId: string, retry: boolean): Promise<ReplyResult> {
    if (!this.configured)
      throw new AiError('AI_NOT_CONFIGURED', '尚未配置模型密钥，消息已保存，暂时不能生成回复。');
    const db = await this.pool.getConnection();
    const lock = `bys-ai-${conversationId}`;
    let locked = false;
    try {
      const [locks] = await db.execute<RowDataPacket[]>('SELECT GET_LOCK(?,0) AS acquired', [lock]);
      locked = Number(locks[0]?.acquired) === 1;
      if (!locked) throw new AiError('AI_BUSY', '这段对话正在生成回复，请稍后查看记录。', 409);
      const source = await this.source(db, conversationId, sourceId);
      const previous = await this.result(db, conversationId, sourceId);
      if (
        previous.state === 'succeeded' ||
        previous.state === 'running' ||
        (previous.state === 'failed' && (!retry || !previous.error?.retryable))
      )
        return previous;
      const [newer] = await db.execute<RowDataPacket[]>(
        "SELECT id FROM messages WHERE conversation_id=? AND role='user' AND sequence>? LIMIT 1",
        [conversationId, source.sequence],
      );
      if (newer.length)
        throw new AiError('AI_NEWER_MESSAGE', '已有更新的消息，请让他一起回复最新一条。', 409);
      // No second generation while an earlier call is unresolved after a process interruption.
      const [pending] = await db.execute<RowDataPacket[]>(
        "SELECT id FROM generation_runs WHERE conversation_id=? AND state='running' LIMIT 1",
        [conversationId],
      );
      if (pending.length)
        throw new AiError(
          'AI_UNCERTAIN',
          '存在尚未确认结果的调用，请先核对记录；不会自动重新扣费。',
          409,
        );
      const [history] = await db.execute<RowDataPacket[]>(
        'SELECT role,text FROM messages WHERE conversation_id=? AND sequence<=? ORDER BY sequence DESC LIMIT 24',
        [conversationId, source.sequence],
      );
      const turns = context(history.reverse().map((r) => ({ role: r.role, content: r.text })));
      const reserve = cost(inputBound(turns), MAX_OUTPUT + 10);
      const runId = randomUUID(),
        budgetId = randomUUID(),
        currentPeriod = period();
      await db.beginTransaction();
      try {
        await db.execute(
          'INSERT INTO budget_periods (id,user_id,period,limit_amount) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE limit_amount=VALUES(limit_amount)',
          [budgetId, this.principal.userId, currentPeriod, this.config.monthlyLimit],
        );
        const [budgets] = await db.execute<RowDataPacket[]>(
          'SELECT * FROM budget_periods WHERE user_id=? AND period=? FOR UPDATE',
          [this.principal.userId, currentPeriod],
        );
        const budget = budgets[0]!;
        if (
          round(Number(budget.spent_amount) + Number(budget.reserved_amount) + reserve) >
          this.config.monthlyLimit
        )
          throw new AiError(
            'AI_BUDGET_EXCEEDED',
            '本月文字模型预算不足，消息仍会保存，新增生成已暂停。',
            409,
          );
        const [attempts] = await db.execute<RowDataPacket[]>(
          'SELECT COALESCE(MAX(attempt),0)+1 AS next FROM generation_runs WHERE source_message_id=?',
          [sourceId],
        );
        const attempt = Number(attempts[0]!.next);
        await db.execute(
          `INSERT INTO generation_runs
          (id,conversation_id,request_key,state,model,reserved_cost,source_message_id,attempt,budget_period_id)
          VALUES (?,?,?,'running',?,?,?,?,?)`,
          [
            runId,
            conversationId,
            `${sourceId}:${attempt}`,
            this.config.model,
            reserve,
            sourceId,
            attempt,
            budget.id,
          ],
        );
        await db.execute('UPDATE budget_periods SET reserved_amount=reserved_amount+? WHERE id=?', [
          reserve,
          budget.id,
        ]);
        await db.commit();
      } catch (error) {
        await db.rollback();
        throw error;
      }
      let generated;
      try {
        generated = await this.provider.complete(turns);
      } catch (error) {
        const code = error instanceof AiError ? error.code : 'AI_UNCERTAIN';
        const knownRejected = ['AI_RATE_LIMIT', 'AI_CONFIG_ERROR'].includes(code);
        await this.settle(db, runId, reserve, knownRejected ? 0 : reserve, code);
        return failed(code);
      }
      // Provider adapters cannot bypass the configured reservation policy.
      if (
        generated.promptTokens < 0 ||
        !Number.isSafeInteger(generated.promptTokens) ||
        generated.completionTokens < 0 ||
        !Number.isSafeInteger(generated.completionTokens) ||
        generated.promptTokens > inputBound(turns) ||
        generated.completionTokens > MAX_OUTPUT + 10 ||
        !generated.text.trim()
      ) {
        await this.settle(db, runId, reserve, reserve, 'AI_UNCERTAIN');
        return failed('AI_UNCERTAIN');
      }
      await db.beginTransaction();
      try {
        await db.execute(
          `INSERT INTO messages (id,conversation_id,role,text,status,reply_to_message_id,created_at)
          VALUES (?,?,'assistant',?,'saved',?,UTC_TIMESTAMP(3))`,
          [randomUUID(), conversationId, generated.text, sourceId],
        );
        await this.settle(
          db,
          runId,
          reserve,
          cost(generated.promptTokens, generated.completionTokens),
          null,
          generated,
        );
        await db.commit();
      } catch (error) {
        await db.rollback();
        throw error;
      }
      return await this.result(db, conversationId, sourceId);
    } finally {
      if (locked) {
        try {
          await db.execute('SELECT RELEASE_LOCK(?)', [lock]);
        } catch {
          db.destroy();
        }
      }
      db.release();
    }
  }
  private async settle(
    db: PoolConnection,
    runId: string,
    reserve: number,
    amount: number,
    code: string | null,
    usage?: { promptTokens: number; completionTokens: number },
  ) {
    // Failure settlement is atomic too; unknown outcomes consume the conservative reservation.
    const ownTransaction = !!code;
    if (ownTransaction) await db.beginTransaction();
    try {
      await db.execute(
        `UPDATE budget_periods b JOIN generation_runs g ON g.budget_period_id=b.id
        SET b.reserved_amount=GREATEST(0,b.reserved_amount-?), b.spent_amount=b.spent_amount+? WHERE g.id=?`,
        [reserve, amount, runId],
      );
      await db.execute(
        `UPDATE generation_runs SET state=?,actual_cost=?,error_code=?,prompt_tokens=?,completion_tokens=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [
          code ? 'failed' : 'succeeded',
          code === 'AI_UNCERTAIN' ? null : amount,
          code,
          usage?.promptTokens ?? null,
          usage?.completionTokens ?? null,
          runId,
        ],
      );
      if (ownTransaction) await db.commit();
    } catch (error) {
      if (ownTransaction) await db.rollback();
      throw error;
    }
  }
}
