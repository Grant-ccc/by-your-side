import { randomUUID } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { Conversation, History, Message, SendMessage } from '@bys/shared';
import { getConfig } from './config.js';

export const LOCAL_USER = '00000000-0000-4000-8000-000000000001';
export const LOCAL_CHARACTER = '00000000-0000-4000-8000-000000000002';
export const LOCAL_RELATIONSHIP = '00000000-0000-4000-8000-000000000003';
export const LOCAL_CONVERSATION = '00000000-0000-4000-8000-000000000004';
export class StoreError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'REQUEST_CONFLICT',
    message: string,
  ) {
    super(message);
  }
}
export interface ChatStore {
  ready(): Promise<void>;
  bootstrap(): Promise<void>;
  conversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  history(conversationId: string, after: number, limit: number): Promise<History>;
  saveMessage(
    conversationId: string,
    message: SendMessage,
  ): Promise<{ message: Message; duplicate: boolean }>;
  close(): Promise<void>;
}
function date(value: Date | string): string {
  return new Date(value).toISOString();
}
function conversation(row: RowDataPacket): Conversation {
  return { id: row.id, title: row.title, createdAt: date(row.created_at) };
}
function message(row: RowDataPacket): Message {
  const sequence = Number(row.sequence);
  if (!Number.isSafeInteger(sequence)) throw new Error('Message cursor exceeded supported range');
  return {
    id: row.id,
    sequence,
    conversationId: row.conversation_id,
    clientRequestId: row.client_request_id,
    role: row.role,
    text: row.text,
    status: row.status,
    createdAt: date(row.created_at),
    replyToMessageId: row.reply_to_message_id ?? null,
  };
}

export class MysqlChatStore implements ChatStore {
  constructor(public pool: Pool = mysql.createPool(getConfig().database)) {}
  async ready() {
    await this.pool.query('SELECT id FROM conversations LIMIT 0');
    await this.pool.query('SELECT reply_to_message_id FROM messages LIMIT 0');
    await this.pool.query('SELECT source_message_id,budget_period_id FROM generation_runs LIMIT 0');
  }
  async bootstrap() {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('INSERT IGNORE INTO users (id, display_name) VALUES (?,?)', [
        LOCAL_USER,
        '本地开发用户',
      ]);
      await connection.execute('INSERT IGNORE INTO characters (id, name) VALUES (?,?)', [
        LOCAL_CHARACTER,
        '李泽言',
      ]);
      await connection.execute(
        'INSERT IGNORE INTO relationships (id,user_id,character_id,settings) VALUES (?,?,?,?)',
        [LOCAL_RELATIONSHIP, LOCAL_USER, LOCAL_CHARACTER, '{}'],
      );
      await connection.execute(
        'INSERT IGNORE INTO conversations (id,relationship_id,title,created_at) VALUES (?,?,?,UTC_TIMESTAMP(3))',
        [LOCAL_CONVERSATION, LOCAL_RELATIONSHIP, '我们的日常'],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  async conversations() {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT id,title,created_at FROM conversations WHERE relationship_id=? ORDER BY created_at,id',
      [LOCAL_RELATIONSHIP],
    );
    return rows.map(conversation);
  }
  async createConversation(title: string) {
    const id = randomUUID();
    await this.pool.execute(
      'INSERT INTO conversations (id,relationship_id,title,created_at) VALUES (?,?,?,UTC_TIMESTAMP(3))',
      [id, LOCAL_RELATIONSHIP, title],
    );
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT id,title,created_at FROM conversations WHERE id=?',
      [id],
    );
    return conversation(rows[0]!);
  }
  private async owned(id: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT id FROM conversations WHERE id=? AND relationship_id=?',
      [id, LOCAL_RELATIONSHIP],
    );
    if (!rows.length) throw new StoreError('NOT_FOUND', '会话不存在');
  }
  async history(conversationId: string, after: number, limit: number) {
    await this.owned(conversationId);
    // after/limit are validated integers; interpolating only the integer limit avoids driver LIMIT type differences.
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM messages WHERE conversation_id=? AND sequence>? ORDER BY sequence LIMIT ${limit + 1}`,
      [conversationId, after],
    );
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(message);
    return { messages, nextCursor: messages.at(-1)?.sequence ?? after, hasMore };
  }
  async saveMessage(conversationId: string, input: SendMessage) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [owned] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM conversations WHERE id=? AND relationship_id=? FOR SHARE',
        [conversationId, LOCAL_RELATIONSHIP],
      );
      if (!owned.length) throw new StoreError('NOT_FOUND', '会话不存在');
      const id = randomUUID();
      await connection.execute(
        'INSERT INTO messages (id,conversation_id,client_request_id,role,text,status,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id=id',
        [id, conversationId, input.clientRequestId, 'user', input.text, 'saved'],
      );
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT * FROM messages WHERE conversation_id=? AND client_request_id=?',
        [conversationId, input.clientRequestId],
      );
      const saved = message(rows[0]!);
      if (saved.text !== input.text)
        throw new StoreError('REQUEST_CONFLICT', '同一个请求标识不能用于不同的消息');
      await connection.commit();
      return { message: saved, duplicate: saved.id !== id };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
