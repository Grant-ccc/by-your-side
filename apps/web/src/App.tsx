import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  SendMessageSchema,
  type Conversation,
  type Message,
  type SendMessage,
  type ServiceHealth,
  type AiInfo,
  type ReplyResult,
} from '@bys/shared';
import {
  bootstrap,
  health,
  loadHistory,
  sendMessage,
  aiInfo,
  generateReply,
  replyStatus,
} from './api';
import './development.css';

type Page = 'home' | 'chat' | 'album' | 'settings' | 'memory' | 'trip';
type Tab = '日常记录' | '习惯打卡' | '备忘录';
const paths: Record<string, ReactNode> = {
  home: <path d="m2 10 10-8 10 8M5 9v13h14V9M10 22v-8h5v8" />,
  chat: (
    <>
      <path d="M5 3h14a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H9l-5 3v-4a3 3 0 0 1-2-3V6a3 3 0 0 1 3-3Z" />
      <path d="M7 11h.1m4.9 0h.1m4.9 0h.1" />
    </>
  ),
  album: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" />
      <path d="m3 18 6-7 5 5 4-7 4 5" />
      <circle cx="8" cy="7" r="1" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 1v4m0 14v4M1 12h4m14 0h4M4 4l3 3m10 10 3 3M4 20l3-3M17 7l3-3" />
    </>
  ),
  heart: <path d="M12 21 3 12C-3 5 7-2 12 5c5-7 15 0 9 7Z" />,
  back: <path d="m15 3-9 9 9 9" />,
  check: <path d="m3 12 6 6L22 3" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v7l5 3" />
    </>
  ),
};
function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name] || paths.heart}
    </svg>
  );
}
function Avatar({ you = false }: { you?: boolean }) {
  return (
    <span
      className={`avatar ${you ? 'you' : ''}`}
      aria-label={you ? '你的占位头像' : '角色占位头像'}
    >
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="35" r="24" fill={you ? '#a89789' : '#3d3338'} />
        <circle cx="40" cy="39" r="19" fill="#f2d8c6" />
        <path
          d={
            you
              ? 'M19 31Q24 8 49 18l13 16-7-4Q40 16 24 32Z'
              : 'M15 33 23 14 48 11 65 33 44 24 33 31Z'
          }
          fill={you ? '#a89789' : '#3d3338'}
        />
        <rect x="19" y="59" width="42" height="28" rx="16" fill={you ? '#c4a497' : '#5d4241'} />
        <circle cx="33" cy="40" r="1.5" fill="#60443b" />
        <circle cx="47" cy="40" r="1.5" fill="#60443b" />
        <path d="M37 48h6" stroke="#b77c71" strokeWidth="1.2" />
      </svg>
    </span>
  );
}
function Panel({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}
function Plush() {
  return (
    <svg className="plush" viewBox="0 0 160 150" aria-hidden="true">
      <ellipse cx="80" cy="137" rx="54" ry="9" fill="#e9cbbd" />
      <circle cx="42" cy="39" r="19" fill="#c18570" />
      <circle cx="118" cy="39" r="19" fill="#c18570" />
      <circle cx="42" cy="39" r="11" fill="#f2cdb7" />
      <circle cx="118" cy="39" r="11" fill="#f2cdb7" />
      <rect x="45" y="89" width="70" height="49" rx="26" fill="#bf8270" />
      <ellipse cx="80" cy="65" rx="59" ry="48" fill="#e5b395" />
      <ellipse cx="80" cy="85" rx="23" ry="17" fill="#fff0db" />
      <circle cx="57" cy="66" r="4" fill="#634339" />
      <circle cx="103" cy="66" r="4" fill="#634339" />
      <ellipse cx="80" cy="79" rx="6" ry="4" fill="#634339" />
      <path d="M80 82v5m-7 0q7 8 14 0" fill="none" stroke="#634339" strokeWidth="2.3" />
      <ellipse cx="40" cy="80" rx="10" ry="5" fill="#d88e7d" />
      <ellipse cx="120" cy="80" rx="10" ry="5" fill="#d88e7d" />
      <path d="m58 102 22 10 22-10v17l-22-7-22 7Z" fill="#a33232" />
    </svg>
  );
}
function readOutbox(conversationId: string): SendMessage | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(`bys:outbox:${conversationId}`) || 'null');
    const parsed = SendMessageSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function App() {
  const [ai, setAi] = useState<AiInfo | null>(null);
  const [reply, setReply] = useState<ReplyResult | null>(null);
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState('');
  const replyRef = useRef(false);
  const [page, setPage] = useState<Page>('home'),
    [tab, setTab] = useState<Tab>('日常记录');
  const [service, setService] = useState<ServiceHealth | null>(null),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState(''),
    [outbox, setOutbox] = useState<SendMessage | null>(null),
    [sending, setSending] = useState(false),
    [sendError, setSendError] = useState('');
  const [notice, setNotice] = useState(''),
    [habitCounts, setHabitCounts] = useState([0, 0, 0]);
  const historyRef = useRef<HTMLDivElement>(null),
    noticeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestEpoch = useRef(0),
    sendingRef = useRef(false);
  const notify = (text: string) => {
    setNotice(text);
    if (noticeRef.current) clearTimeout(noticeRef.current);
    noticeRef.current = setTimeout(() => setNotice(''), 3000);
  };
  const refresh = useCallback(async () => {
    const epoch = ++requestEpoch.current;
    setLoading(true);
    setLoadError('');
    try {
      const status = await health();
      if (epoch !== requestEpoch.current) return;
      setService(status);
      if (status.database !== 'connected')
        throw new Error('数据库尚未就绪，暂时不能保存或读取聊天。');
      const list = await bootstrap();
      const selected = list[0];
      if (!selected) throw new Error('没有可用会话');
      const data = await loadHistory(selected.id);
      if (epoch !== requestEpoch.current) return;
      setConversations(list);
      setConversationId(selected.id);
      setMessages(data);
      setReply(null);
      setReplyError('');
      // Read-only: refreshing must never start a paid generation.
      if (status.ai === 'configured') {
        const info = await aiInfo();
        if (epoch !== requestEpoch.current) return;
        setAi(info);
        const last = data.filter((m) => m.role === 'user').at(-1);
        if (last && !data.some((m) => m.replyToMessageId === last.id)) {
          const state = await replyStatus(selected.id, last.id);
          if (epoch === requestEpoch.current) setReply(state);
        }
      } else setAi(null);
      const pending = readOutbox(selected.id);
      if (pending && data.some((m) => m.clientRequestId === pending.clientRequestId)) {
        sessionStorage.removeItem(`bys:outbox:${selected.id}`);
        setOutbox(null);
      } else setOutbox(pending);
    } catch (error) {
      if (epoch === requestEpoch.current) {
        setLoadError(error instanceof Error ? error.message : '本地服务暂时不可用');
      }
    } finally {
      if (epoch === requestEpoch.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      requestEpoch.current++;
      if (noticeRef.current) clearTimeout(noticeRef.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (page === 'chat')
      historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, outbox, page, sending, replying]);
  async function askForReply(messageId: string, retry = false, checkOnly = false) {
    if (replyRef.current || !conversationId) return;
    replyRef.current = true;
    setReplying(true);
    setReplyError('');
    try {
      const result = checkOnly
        ? await replyStatus(conversationId, messageId)
        : await generateReply(conversationId, messageId, retry);
      setReply(result);
      if (result.message) {
        const saved = result.message;
        setMessages((old) =>
          old.some((m) => m.id === saved.id)
            ? old
            : [...old, saved].sort((a, b) => a.sequence - b.sequence),
        );
      }
      void aiInfo()
        .then(setAi)
        .catch(() => {});
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : '回复结果尚未确认，请先检查记录。');
    } finally {
      replyRef.current = false;
      setReplying(false);
    }
  }
  async function save(input: SendMessage) {
    if (!conversationId || sendingRef.current || replyRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError('');
    setOutbox(input);
    sessionStorage.setItem(`bys:outbox:${conversationId}`, JSON.stringify(input));
    try {
      const saved = await sendMessage(conversationId, input);
      setMessages((old) => (old.some((m) => m.id === saved.id) ? old : [...old, saved]));
      sessionStorage.removeItem(`bys:outbox:${conversationId}`);
      setOutbox(null);
      setDraft('');
      setReply(null);
      if (service?.ai === 'configured') await askForReply(saved.id);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : '保存结果尚未确认，请重试。');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = SendMessageSchema.safeParse({
      clientRequestId: crypto.randomUUID(),
      text: draft,
    });
    if (!parsed.success) {
      notify('请输入 1—2000 字的消息');
      return;
    }
    void save(parsed.data);
  }
  const connected = service?.database === 'connected' && !loadError;
  const aiEnabled = service?.ai === 'configured';
  const lastUser = messages.filter((m) => m.role === 'user').at(-1);
  const needsReply = lastUser && !messages.some((m) => m.replyToMessageId === lastUser.id);
  const statusText = loading
    ? '正在连接本地服务'
    : connected
      ? `MySQL 已连接 · ${aiEnabled ? '千问已配置' : 'AI 待配置密钥'}`
      : '数据库尚未就绪';
  const go = (next: Page) => {
    setPage(next);
  };
  const header = (title: string, sub?: string) => (
    <header className="topbar">
      <button className="icon-button" onClick={() => go('home')} aria-label="返回日常">
        <Icon name="back" />
      </button>
      <div className="title-block">
        <h2>{title}</h2>
        {sub && <small>{sub}</small>}
      </div>
      <button className="icon-button" onClick={() => go('settings')} aria-label="设置">
        <Icon name="gear" />
      </button>
    </header>
  );
  function daily() {
    return (
      <>
        <Panel title="此时此刻" right={<small>布局示例</small>}>
          <div className="mood-card">
            <div className="mood-face">♥</div>
            <div>
              <h3>今天也有一点想你</h3>
              <p className="muted">留一处，慢慢说今天的事。</p>
              <button className="pill" onClick={() => go('chat')}>
                去聊天 →
              </button>
            </div>
          </div>
        </Panel>
        <Panel title="最新动态" right={<small>日程功能待接入</small>}>
          <div className="timeline">
            <div className="timeline-row">
              <time>日常</time>
              <span>各自忙碌，也留一点分享的时间</span>
            </div>
            <div className="timeline-row">
              <time>稍后</time>
              <span>日程与聊天将从同一份记录读取</span>
            </div>
          </div>
        </Panel>
        <Panel title="出行准备">
          <div className="trip-row">
            <button className="trip-mini" onClick={() => go('trip')}>
              <small>本次外出</small>
              <span className="item-symbol">☂</span>
              <span>折叠伞 · 物品示例</span>
            </button>
            <button className="trip-mini" onClick={() => go('trip')}>
              <small>下次外出</small>
              <span className="item-symbol">＋</span>
              <span>为他准备一件小物品</span>
            </button>
          </div>
        </Panel>
      </>
    );
  }
  function home() {
    return (
      <>
        <header className="topbar">
          <div className="home-title">
            <span className="icon-button">
              <Icon name="home" />
            </span>
            <h2>在你身边</h2>
          </div>
          <button className="icon-button" onClick={() => go('settings')} aria-label="设置">
            <Icon name="gear" />
          </button>
        </header>
        <div className="page-scroll">
          <section className="pair">
            <div className="pair-faces">
              <div className="person">
                <Avatar />
                <strong>李泽言</strong>
              </div>
              <span className="pair-heart">♥</span>
              <div className="person">
                <Avatar you />
                <strong>你</strong>
              </div>
            </div>
            <div className="pair-copy">
              <small>相伴的日常</small>
              <h3>慢慢收藏</h3>
              <button className="pill" onClick={() => go('settings')}>
                称呼与日期待填写
              </button>
            </div>
          </section>
          <div className="connection-strip">
            <span className={connected ? 'connection-dot online' : 'connection-dot'} />
            <span>{statusText}</span>
            <button onClick={() => void refresh()} disabled={loading || sending}>
              重连
            </button>
          </div>
          <div className="tabs" role="tablist">
            {(['日常记录', '习惯打卡', '备忘录'] as Tab[]).map((t) => (
              <button
                key={t}
                className={tab === t ? 'active' : ''}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === '日常记录' ? (
            daily()
          ) : tab === '习惯打卡' ? (
            <Panel title="习惯打卡" right={<small>迁移预览 · 当前会话内记录</small>}>
              {['喝水', '运动', '睡觉'].map((habit, i) => (
                <div className="habit" key={habit}>
                  <span className={`habit-icon ${habitCounts[i] ? 'done' : ''}`}>
                    <Icon name={habitCounts[i] ? 'check' : 'clock'} />
                  </span>
                  <div className="habit-body">
                    <h3>{habit}</h3>
                    <small>
                      {habitCounts[i]
                        ? `本次预览已记录 ${habitCounts[i]} 次`
                        : '按你的方式，慢慢来'}
                    </small>
                  </div>
                  <button
                    onClick={() => {
                      setHabitCounts((old) => old.map((n, j) => (i === j ? n + 1 : n)));
                      notify('已记录本次预览，正式习惯存储后续接入');
                    }}
                  >
                    记录 ＋
                  </button>
                </div>
              ))}
            </Panel>
          ) : (
            <Panel title="两人的备忘录">
              <div className="panel-content">
                <span className="pill">约定功能待接入</span>
                <h3>留一段共同的时间</h3>
                <p className="muted">
                  后续可以从聊天里确认约定，再写入日程。当前不会自动创建任何安排。
                </p>
                <button className="secondary full section-gap" onClick={() => go('chat')}>
                  先说说今天的事
                </button>
              </div>
            </Panel>
          )}
          <p className="mini-portrait-note">React 开发版 · 头像为临时示意</p>
        </div>
      </>
    );
  }
  function chat() {
    return (
      <>
        {header(
          '李泽言',
          replying
            ? '正在输入…'
            : aiEnabled
              ? '留一点时间，说说今天的事'
              : '消息已可保存 · 等待配置模型密钥',
        )}
        <div className="chat-banner">
          <strong>
            {loading
              ? '正在读取消息…'
              : connected
                ? '本地消息存储已连接'
                : '暂时不能读取或保存消息'}
          </strong>
          <small>
            {loadError ||
              (aiEnabled
                ? 'AI 生成回复 · 暂未启用作息延迟与主动留言'
                : '在本机配置百炼密钥后，可启用真实回复。')}
          </small>
          {!connected && !loading && (
            <button className="text-button" onClick={() => void refresh()}>
              重新连接 →
            </button>
          )}
        </div>
        <div className="chat-history" ref={historyRef} aria-live="polite">
          <div className="chat-date">我们的日常 · 开发版</div>
          {!loading && !messages.length && (
            <div className="first-message">
              <Plush />
              <h3>从一句日常开始</h3>
              <p>
                消息保存后，重新打开也能找回来。
                <br />
                {aiEnabled ? '想说什么，就从这里开始。' : '模型接入已准备好，等待本机配置密钥。'}
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div className={`message ${m.role === 'user' ? 'you' : 'him'}`} key={m.id}>
              <Avatar you={m.role === 'user'} />
              <div className="message-body">
                <div className="bubble">{m.text}</div>
                <div className="message-state">
                  {new Date(m.createdAt).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · 已存入数据库
                </div>
              </div>
            </div>
          ))}
          {replying && (
            <div className="message him">
              <Avatar />
              <div className="bubble" role="status">
                正在输入…
              </div>
            </div>
          )}
          {aiEnabled && needsReply && !replying && (
            <div className="reply-control">
              <p role="status">
                {replyError ||
                  reply?.error?.message ||
                  (reply?.state === 'running'
                    ? '回复结果待确认，请检查记录。'
                    : '这条消息尚未收到回复。')}
              </p>
              {(!reply || reply.state === 'idle') && !replyError && (
                <button className="pill" onClick={() => void askForReply(lastUser.id)}>
                  让他回复
                </button>
              )}
              {(reply?.state === 'running' || !!replyError) && (
                <button className="pill" onClick={() => void askForReply(lastUser.id, false, true)}>
                  检查回复结果
                </button>
              )}
              {reply?.state === 'failed' && reply.error?.retryable && (
                <button className="pill" onClick={() => void askForReply(lastUser.id, true)}>
                  重新尝试回复
                </button>
              )}
            </div>
          )}
          {outbox && !messages.some((m) => m.clientRequestId === outbox.clientRequestId) && (
            <div className="message you">
              <Avatar you />
              <div className="message-body">
                <div className="bubble pending-message">{outbox.text}</div>
                <div className="message-state">{sending ? '正在保存…' : '尚未确认保存'}</div>
                {sendError && (
                  <div className="send-failure" role="alert">
                    <p>{sendError}</p>
                    <button
                      className="text-button"
                      onClick={() => void save(outbox)}
                      disabled={sending}
                    >
                      重试保存（不会重复写入）
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <form className="composer" onSubmit={submit}>
          <input
            aria-label="聊天消息"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={outbox ? '先确认上一条消息的保存结果' : '想和他说点什么…'}
            maxLength={2000}
            disabled={!connected || !!outbox || sending || replying}
          />
          <button
            className="primary"
            disabled={!connected || !!outbox || sending || replying || !draft.trim()}
          >
            {aiEnabled ? '发送' : '保存消息'}
          </button>
        </form>
      </>
    );
  }
  function settings() {
    return (
      <>
        {header('我们的设置', '正式功能一点点接起来')}
        <div className="page-scroll">
          <section className="settings-group">
            <h3>连接状态</h3>
            <p className="muted">
              {statusText}
              <br />
              当前仅本机开发访问，尚无云端账号登录。
            </p>
            {loadError && <p className="connection-error">{loadError}</p>}
            <button
              className="secondary full section-gap"
              disabled={loading || sending || replying}
              onClick={() => void refresh()}
            >
              重新连接与读取历史
            </button>
          </section>
          <section className="settings-group">
            <h3>本阶段已经接入</h3>
            <p className="muted">
              React + TypeScript 页面
              <br />
              Node.js + Fastify API
              <br />
              MySQL 会话、消息与请求去重
              <br />
              重开后读取数据库历史
            </p>
            <p className="soft-note">
              连接结果以实时状态为准。数据库不可用时不会自动切到内存保存。
            </p>
          </section>
          <section className="settings-group">
            <h3>文字模型</h3>
            <p className="muted">
              千问 Qwen3.7-Plus · 非思考模式
              <br />
              {aiEnabled
                ? '密钥已配置，实际可用性以调用结果为准。'
                : '等待在本机 .env.local 配置 DASHSCOPE_API_KEY 和北京业务空间 ID。'}
            </p>
            {ai?.budget && (
              <p className="muted">
                本月文字调用：约 ¥{ai.budget.spent.toFixed(4)} / ¥{ai.budget.limit.toFixed(2)}
                <br />
                进行中预留：¥{ai.budget.reserved.toFixed(4)}
                。未知结果可能按上限计入；实际账单以百炼为准。此额度不含图片与服务器。
              </p>
            )}
            <p className="soft-note">
              启用 AI
              后，角色设定和最近一段对话会发送给百炼生成回复。密钥仅在后端读取，不会返回页面或上传
              GitHub。
            </p>
          </section>
          <section className="settings-group">
            <h3>接下来的能力</h3>
            <p className="muted">记忆提取、日程调度、通知、图片生成与数据备份仍待接入。</p>
            <button className="secondary full section-gap" onClick={() => go('memory')}>
              查看记忆模块进度
            </button>
          </section>
          <section className="settings-group">
            <h3>当前会话</h3>
            <p className="muted">
              {conversations[0]?.title || '连接数据库后建立本地会话'}
              <br />
              聊天记录保存在本地数据库，不会上传 GitHub；启用模型后，必要上下文会发送给百炼。
            </p>
          </section>
        </div>
      </>
    );
  }
  const placeholder = (
    title: string,
    subtitle: string,
    text: string,
    action: string,
    target: Page,
  ) => (
    <>
      {header(title, subtitle)}
      <div className="page-scroll">
        <div className="empty-state">
          <Plush />
          <h3>{title === '两人的相册' ? '第一段回忆，正在路上' : title}</h3>
          <p className="muted">{text}</p>
          <button className="primary" onClick={() => go(target)}>
            {action}
          </button>
        </div>
        <p className="soft-note">
          当前只迁移布局，尚未启用这个模块的正式数据或生成服务。完整交互参考仍保留在仓库的原型目录。
        </p>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <aside className="studio">
        <div className="eyebrow">PRIVATE DAYS / DEVELOPMENT</div>
        <h1>
          在你身边
          <span>
            让平常的日子，
            <br />
            慢慢成为回忆。
          </span>
        </h1>
        <p>暖酒红 · React 开发版</p>
        <div className="studio-line" />
        <p className="description">
          先把一句话认真存好，
          <br />
          再让每一次回应接得上。
        </p>
        <div className={`service-card ${connected ? 'ready' : ''}`}>
          <span>{connected ? '消息存储可用' : '等待本地服务'}</span>
          <p>{statusText}</p>
          <button
            className="text-button"
            disabled={loading || sending || replying}
            onClick={() => void refresh()}
          >
            重新检查连接 →
          </button>
        </div>
        <p className="studio-note">
          真实消息存储 · {aiEnabled ? '千问已配置' : 'AI 等待密钥'}
          <br />
          {aiEnabled ? '生成回复按实际用量计费。' : '未配置密钥时不会发起付费调用。'}
        </p>
      </aside>
      <main className="phone" aria-label="手机开发版">
        <div className="statusbar">
          <span>在你身边</span>
          <span className="demo-label">开发版 · {aiEnabled ? '千问聊天' : 'AI 待配置'}</span>
          <span className="signal">♥</span>
        </div>
        <div id="screen">
          {page === 'home'
            ? home()
            : page === 'chat'
              ? chat()
              : page === 'settings'
                ? settings()
                : page === 'album'
                  ? placeholder(
                      '两人的相册',
                      '把平常的日子，慢慢留下来',
                      '照片、纪念物和共同经历会在这里慢慢积累。',
                      '去和他说说话',
                      'chat',
                    )
                  : page === 'memory'
                    ? placeholder(
                        '关于你的记忆',
                        '记得你，也听你的纠正',
                        '记忆提取与确认还未接入。当前聊天不会被自动整理为长期记忆。',
                        '回到聊天',
                        'chat',
                      )
                    : placeholder(
                        '为他准备出行',
                        '小物品，也会带来不同的见闻',
                        '物品分支与角色日程将在后续里程碑接入。',
                        '返回日常',
                        'home',
                      )}
        </div>
        <nav className="bottom-nav" aria-label="主导航">
          {(
            [
              { id: 'home', name: '日常', icon: 'home' },
              { id: 'chat', name: '聊天', icon: 'chat' },
              { id: 'album', name: '回忆', icon: 'album' },
            ] as const
          ).map((n) => (
            <button key={n.id} onClick={() => go(n.id)} className={page === n.id ? 'active' : ''}>
              <Icon name={n.icon} />
              <span>{n.name}</span>
            </button>
          ))}
        </nav>
        <div className="home-indicator" />
      </main>
      <div id="toast" className={notice ? 'show' : ''} role="status">
        {notice}
      </div>
    </div>
  );
}
