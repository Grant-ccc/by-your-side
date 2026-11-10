import { registerPlugin } from '@capacitor/core';
import type { Message } from '@bys/shared';
import { isAndroid } from './lan';

const ChatExport = registerPlugin<{
  save(options: { name: string; text: string }): Promise<{ saved: boolean }>;
}>('ChatExport');

export async function saveChatExport(messages: Message[]) {
  const saved = messages.filter((m) => m.status === 'saved' && m.role !== 'system');
  if (!saved.length) return 'empty';
  const time = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  });
  const lines = saved.map(
    (m) =>
      `${time.format(new Date(m.createdAt))} · ${m.role === 'user' ? '你' : '李泽言'}\n${m.text}`,
  );
  const text = `在你身边 · 聊天记录（北京时间）\n\n${lines.join('\n\n')}\n`;
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format();
  const name = `在你身边-聊天记录-${day}.txt`;
  if (isAndroid()) return (await ChatExport.save({ name, text })).saved ? 'saved' : 'cancelled';

  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'download';
}
