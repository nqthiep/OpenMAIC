/**
 * Nối bộ lọc nội dung vào luồng `/api/chat` (INTERFACES 8.1, ADR 0014 quyết định 2).
 *
 * `withTutorModeration(body, source)` bọc luồng sự kiện của `statelessGenerate`:
 * - Vào: lọc MỌI tin nhắn học sinh trong request (tối đa 10 tin cuối) và observation của trang tương tác (chữ trang tự báo, có thể chứa chữ học sinh gõ); vi phạm thì thay cả luồng bằng một lượt thầy soạn sẵn
 *   (agent không bao giờ chạy: generator chưa được kéo thì chưa làm gì).
 * - Ra: giữ `text_delta` và `action` theo `messageId` tới `agent_end`, lọc trọn câu, rồi mới phát.
 *
 * Chỉ bật khi `isTutorModerationEnabled()`; route quyết định, file này không đọc cờ.
 * Fail-closed: lọc lỗi, quá hạn hoặc ném lỗi đều đi đường an toàn (không bao giờ phát nguyên văn).
 */
import { createLogger } from '@/lib/logger';
import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';
import { moderate, type ModerationCategory, type ModerationVerdict } from '@/lib/tutor/moderation';

const log = createLogger('TutorChatModeration');

type SafeLocale = 'vi' | 'en';
type SafeKey = ModerationCategory | 'generic';
type DoneEvent = Extract<StatelessEvent, { type: 'done' }>;

export type ModerateFn = (
  text: string,
  ctx: { direction: 'in' | 'out'; locale: SafeLocale; subject: string },
) => Promise<ModerationVerdict>;

export interface ChatModerationDeps {
  moderate?: ModerateFn;
}

/**
 * Môn học đưa cho bộ lọc là hằng, không lấy từ request: `stage.name` do client gửi và sẽ nằm
 * trong system prompt của bộ lọc, nên không được tin.
 */
const SUBJECT = 'school tutoring';

/** Thứ tự ưu tiên khi một lượt vi phạm nhiều nhóm: tự hại luôn đứng đầu. */
const PRIORITY: readonly ModerationCategory[] = [
  'self-harm',
  'sexual',
  'violence',
  'hate',
  'personal-data',
  'dangerous-offtopic',
];

/** Toàn bộ câu an toàn của thầy ở một chỗ. `generic`: lọc lỗi/quá hạn hoặc không rõ nhóm. */
export const SAFE_MESSAGES: Record<SafeKey, Record<SafeLocale, string>> = {
  generic: {
    vi: 'Thầy/cô chưa thể trả lời câu này. Mình quay lại bài học nhé: em muốn hỏi thêm về phần nào của bài?',
    en: "I can't answer that right now. Let's get back to the lesson: which part would you like to ask about?",
  },
  sexual: {
    vi: 'Thầy/cô không bàn về nội dung này. Mình quay lại bài học nhé: em đang vướng ở phần nào?',
    en: "I can't discuss that topic here. Let's get back to the lesson: which part are you stuck on?",
  },
  violence: {
    vi: 'Thầy/cô không thể giúp với nội dung bạo lực hay gây hại. Nếu em đang gặp chuyện đáng lo, hãy nói với một người lớn em tin cậy. Còn bây giờ mình quay lại bài học nhé.',
    en: "I can't help with violent or harmful content. If something worrying is happening to you, please tell a trusted adult. For now, let's get back to the lesson.",
  },
  // [Unverified] Số 111 (tổng đài quốc gia bảo vệ trẻ em Việt Nam) lấy từ ADR 0014 quyết định 2,
  // chưa kiểm chứng. Kiểm lại số trước khi phát hành.
  'self-harm': {
    vi: 'Thầy/cô rất quan tâm đến em. Nếu em đang buồn, bế tắc hoặc muốn làm đau bản thân, em hãy nói ngay với một người lớn em tin cậy như bố mẹ, thầy cô hoặc người thân. Em cũng có thể gọi tổng đài hỗ trợ trẻ em 111. Em không phải đối mặt một mình.',
    en: "I care about you. If you feel very sad, stuck, or want to hurt yourself, please tell a trusted adult right away, such as a parent, a teacher or a relative. You can also call the Vietnam child helpline 111. You don't have to face this alone.",
  },
  hate: {
    vi: 'Thầy/cô không đồng tình với lời lẽ xúc phạm hay phân biệt đối xử. Mình giữ cuộc trò chuyện tôn trọng và quay lại bài học nhé.',
    en: "I don't support insulting or discriminating language. Let's keep this respectful and get back to the lesson.",
  },
  'personal-data': {
    vi: 'Để an toàn, em đừng chia sẻ thông tin cá nhân như số điện thoại, địa chỉ hay giấy tờ tuỳ thân ở đây, và thầy/cô cũng sẽ không hỏi những điều đó. Mình quay lại bài học nhé.',
    en: "To stay safe, please don't share personal details such as a phone number, address or ID here, and I won't ask for them either. Let's get back to the lesson.",
  },
  'dangerous-offtopic': {
    vi: 'Thầy/cô không thể hướng dẫn việc này vì có thể gây nguy hiểm hoặc vi phạm pháp luật. Mình quay lại bài học nhé: em muốn hỏi thêm phần nào?',
    en: "I can't guide you on that because it could be dangerous or illegal. Let's get back to the lesson: which part would you like to ask about?",
  },
};

/**
 * Chọn ngôn ngữ câu an toàn từ `stage.languageDirective` (chữ tự do như "English" / "Vietnamese").
 * Mặc định `vi`; ngôn ngữ khác `en` cũng rơi về `vi` (triển khai tutor là tiếng Việt).
 */
export function pickLocale(hint: string | undefined): SafeLocale {
  return hint && /^\s*en\b|english|tiếng anh/i.test(hint) ? 'en' : 'vi';
}

export function safeMessage(categories: readonly ModerationCategory[], locale: SafeLocale): string {
  const key: SafeKey = PRIORITY.find((c) => categories.includes(c)) ?? 'generic';
  return SAFE_MESSAGES[key][locale];
}

/** Số tin học sinh tối đa được lọc ở chiều vào, và số lời gọi lọc song song. */
const MAX_USER_MESSAGES = 10;
const INPUT_CONCURRENCY = 3;

/** Chữ của một tin học sinh đúng như agent sẽ thấy (`convertMessagesToOpenAI`): text, tên người gửi, kết quả action-*. */
function userMessageText(msg: StatelessChatRequest['messages'][number]): string {
  const out: string[] = [];
  for (const part of msg.parts ?? []) {
    const p = part as { type?: string; text?: unknown; actionName?: unknown; output?: unknown };
    if (p.type === 'text' && typeof p.text === 'string') out.push(p.text);
    else if (typeof p.type === 'string' && p.type.startsWith('action-')) {
      const o = (p.output ?? {}) as { data?: unknown; error?: unknown };
      out.push(
        typeof p.actionName === 'string' ? p.actionName : p.type,
        typeof o.error === 'string' ? o.error : '',
        o.data === undefined ? '' : JSON.stringify(o.data).slice(0, 100),
      );
    }
  }
  const name = msg.metadata?.senderName;
  if (typeof name === 'string') out.push(name);
  return out.join('\n').trim();
}

/** Số ký tự của một lời gọi lọc đầu vào phần observation (cùng cỡ với chiều ra). */
const OBSERVATION_SLICE_CHARS = 4000;

/**
 * Chữ của phần observation của trang tương tác mà agent sẽ thấy (`stateNote`). Trang tự báo nên nó có thể
 * chứa chữ học sinh gõ vào trang, nên được lọc như một tin nhắn học sinh. Không có observation thì rỗng.
 */
export function observationTexts(state: StatelessChatRequest['interactiveState']): string[] {
  const observation = (state as { snapshot?: { observation?: unknown } } | undefined)?.snapshot
    ?.observation;
  const text = observation === undefined ? undefined : JSON.stringify(observation);
  if (!text) return [];
  const slices: string[] = [];
  for (let i = 0; i < text.length; i += OBSERVATION_SLICE_CHARS) {
    slices.push(text.slice(i, i + OBSERVATION_SLICE_CHARS));
  }
  return slices;
}

/** Chữ của tin nhắn học sinh mới nhất, chỉ khi nó là tin CUỐI của lịch sử. */
export function latestStudentText(messages: StatelessChatRequest['messages']): string | null {
  const last = messages[messages.length - 1];
  if (last?.role !== 'user') return null;
  return userMessageText(last) || null;
}

/**
 * Chữ của MỌI tin học sinh agent sẽ thấy, tối đa `MAX_USER_MESSAGES` tin cuối, bỏ tin rỗng và
 * trùng. Client gửi lại cả lịch sử mỗi request và không thể tin cờ "đã lọc" do client gửi, nên
 * tin bị chặn ở lượt trước (còn trong lịch sử) cũng phải bị chặn lại ở đây.
 */
export function studentTexts(messages: StatelessChatRequest['messages']): string[] {
  const texts = messages
    .filter((m) => m.role === 'user')
    .slice(-MAX_USER_MESSAGES)
    .map(userMessageText)
    .filter(Boolean);
  return [...new Set(texts)];
}

/** Lọc không bao giờ ném: `moderate` thật đã fail-closed, bản tiêm vào cũng bị bọc ở đây. */
async function check(
  mod: ModerateFn,
  text: string,
  direction: 'in' | 'out',
  locale: SafeLocale,
): Promise<ModerationVerdict> {
  try {
    return await mod(text, { direction, locale, subject: SUBJECT });
  } catch {
    return { allow: false, categories: [], model: '', error: true };
  }
}

/**
 * Lọc một đoạn chữ lẻ (đường không phải chat: chấm bài tự luận). Trả câu an toàn của thầy khi bị
 * chặn hoặc lọc lỗi (fail-closed), `null` khi cho qua. `localeHint` như `languageDirective`.
 */
export async function screenText(
  text: string,
  direction: 'in' | 'out',
  localeHint: string | undefined,
  deps: ChatModerationDeps = {},
): Promise<string | null> {
  const locale = pickLocale(localeHint);
  const verdict = await check(deps.moderate ?? moderate, text, direction, locale);
  if (verdict.allow) return null;
  logBlocked(direction, verdict);
  return safeMessage(verdict.categories, locale);
}

/**
 * Lọc các chữ vào, tối đa `INPUT_CONCURRENCY` lời gọi cùng lúc, dừng phát lời gọi mới khi đã có
 * một tin bị chặn. Trả verdict chặn của tin đứng đầu (theo thứ tự), hoặc null nếu tất cả qua.
 * Chi phí: tới 10 lời gọi lọc/request (~ceil(10/3) lượt song song, mỗi lượt ≤ 5 s timeout);
 * vòng lặp client gọi `/api/chat` nhiều lần cho một lượt học sinh nên mỗi lần đều lọc lại.
 * ponytail: không có cache giữa các request; cần thì thêm cache LRU theo hash chữ.
 */
async function checkInputs(
  mod: ModerateFn,
  texts: string[],
  locale: SafeLocale,
): Promise<ModerationVerdict | null> {
  const verdicts: (ModerationVerdict | undefined)[] = new Array(texts.length);
  let next = 0;
  let blocked = false;
  const worker = async () => {
    while (!blocked && next < texts.length) {
      const i = next++;
      const v = await check(mod, texts[i], 'in', locale);
      verdicts[i] = v;
      if (!v.allow) blocked = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(INPUT_CONCURRENCY, texts.length) }, worker));
  return verdicts.find((v) => v && !v.allow) ?? null;
}

/**
 * Chỉ ghi nhóm, không ghi chữ.
 * TODO(tutorLearning): INTERFACES 8.3 muốn bản ghi `{type:'moderation', direction, categories}`
 * trong kho runtime, nhưng kho là IndexedDB của trình duyệt, server không với tới. Khi cần, để
 * client ghi (1c-14) dựa trên một dấu hiệu trong luồng SSE.
 */
function logBlocked(direction: 'in' | 'out', verdict: ModerationVerdict): void {
  log.warn(
    `Chat ${direction}put blocked: categories=[${verdict.categories.join(',')}] model=${verdict.model}`,
  );
}

/** Một lượt thầy soạn sẵn thay cho agent: giống luồng một-agent (`agent_start`…`cue_user`, `done`). */
function* scriptedTurn(
  body: StatelessChatRequest,
  text: string,
): Generator<StatelessEvent, void, undefined> {
  const agentId = body.config.triggerAgentId ?? body.config.agentIds[0];
  // Client ưu tiên tên/ảnh từ registry của nó theo agentId; tên này chỉ là phương án dự phòng.
  const agentName = body.config.agentConfigs?.find((a) => a.id === agentId)?.name ?? agentId;
  const messageId = `assistant-${agentId}-${Date.now()}`;
  const prev = body.directorState;
  yield { type: 'agent_start', data: { messageId, agentId, agentName } };
  yield { type: 'text_delta', data: { content: text, messageId } };
  yield { type: 'agent_end', data: { messageId, agentId } };
  // `cue_user` trả lượt về cho học sinh: không có nó vòng lặp client sẽ gọi agent tiếp.
  yield { type: 'cue_user', data: { fromAgentId: agentId } };
  yield {
    type: 'done',
    data: {
      totalActions: 0,
      totalAgents: 1,
      agentHadContent: true,
      cueUserReceived: true,
      directorState: {
        turnCount: (prev?.turnCount ?? 0) + 1,
        agentResponses: [
          ...(prev?.agentResponses ?? []),
          {
            agentId,
            agentName,
            contentPreview: text.slice(0, 100),
            actionCount: 0,
            whiteboardActions: [],
          },
        ],
        whiteboardLedger: prev?.whiteboardLedger ?? [],
      },
    },
  };
}

/**
 * `done.directorState` mang 100 ký tự đầu của câu trả lời gốc và các hành động bảng trắng của
 * lượt (client gửi lại ở request sau). Lượt bị chặn thì thay bằng câu an toàn. Mỗi lần gọi
 * `statelessGenerate` chỉ có một lượt agent, và nó là phần tử cuối của `agentResponses`.
 */
function scrubDone(event: DoneEvent, droppedActions: number, safeText: string): DoneEvent {
  const ds = event.data.directorState;
  const last = ds?.agentResponses.at(-1);
  const directorState =
    ds && last
      ? {
          ...ds,
          agentResponses: [
            ...ds.agentResponses.slice(0, -1),
            {
              ...last,
              contentPreview: safeText.slice(0, 100),
              actionCount: 0,
              whiteboardActions: [],
              actionWarnings: undefined,
            },
          ],
          whiteboardLedger: ds.whiteboardLedger.slice(
            0,
            Math.max(0, ds.whiteboardLedger.length - last.whiteboardActions.length),
          ),
        }
      : ds;
  return {
    ...event,
    data: {
      ...event.data,
      totalActions: Math.max(0, event.data.totalActions - droppedActions),
      directorState,
    },
  };
}

/** Chuỗi trong `params` của action (đệ quy, giới hạn độ sâu); bỏ trường id/URL/màu không phải lời. */
const NON_PROSE_KEY = /^id$|[a-z_]Id$|_id$|^(src|url|color|fill|stroke|style|type|kind)$/;
function paramText(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value.trim();
  if (depth > 6 || !value || typeof value !== 'object') return '';
  return Object.entries(value)
    .filter(([k]) => !NON_PROSE_KEY.test(k))
    .map(([, v]) => paramText(v, depth + 1))
    .filter(Boolean)
    .join('\n');
}

/**
 * Chiều ra. Quy tắc giữ sự kiện:
 * - `text_delta` và `action` của một `messageId` bị giữ tới `agent_end` của nó (giữ cả `action`
 *   để còn bỏ được khi chặn, và để giữ nguyên thứ tự giữa chữ và hành động).
 * - Mọi sự kiện khác đi qua ngay, gồm `agent_start` (client hiện bong bóng của thầy sớm),
 *   `thinking`, `whiteboard`, `cue_user`, `error`. Chúng không mang chữ của agent.
 * - Sự kiện không có `messageId` gắn vào lượt đang mở (`agent_start` gần nhất).
 * - `done` hoặc hết luồng mà còn phần chưa chốt (không có `agent_end`) thì chốt nốt qua bộ lọc.
 * - Nguồn ném lỗi: phần đang giữ bị bỏ, chưa lọc thì không phát.
 * Chữ trong `params` của `action` (vd. `wb_draw_text`) cũng qua bộ lọc cùng lời thầy; nhóm chỉ
 * có action thì lọc chữ trong params, và không tốn lời gọi khi params không có chữ (id, số...).
 */
async function* moderateOutput(
  source: AsyncIterable<StatelessEvent>,
  mod: ModerateFn,
  locale: SafeLocale,
): AsyncGenerator<StatelessEvent, void, undefined> {
  const held = new Map<string, StatelessEvent[]>();
  let current = '';
  let droppedActions = 0;
  let lastSafe: string | null = null;

  async function* settle(id: string): AsyncGenerator<StatelessEvent, void, undefined> {
    const events = held.get(id);
    if (!events) return;
    held.delete(id);
    // Chữ lời thầy (nối liền, không thêm dấu cách) + chữ tự do trong `params` của action
    // (wb_draw_text, latex, ô bảng...), mỗi action một dòng.
    const speech = events.map((e) => (e.type === 'text_delta' ? e.data.content : '')).join('');
    const fromActions = events.map((e) => (e.type === 'action' ? paramText(e.data.params) : ''));
    const text = [speech, ...fromActions].filter((t) => t.trim()).join('\n');
    const verdict = text.trim()
      ? await check(mod, text, 'out', locale)
      : ({ allow: true, categories: [], model: '' } satisfies ModerationVerdict);
    if (verdict.allow) {
      yield* events;
      return;
    }
    logBlocked('out', verdict);
    droppedActions += events.filter((e) => e.type === 'action').length;
    lastSafe = safeMessage(verdict.categories, locale);
    yield { type: 'text_delta', data: { content: lastSafe, messageId: id || undefined } };
  }

  for await (const event of source) {
    if (event.type === 'text_delta' || event.type === 'action') {
      const id = event.data.messageId ?? current;
      const list = held.get(id);
      if (list) list.push(event);
      else held.set(id, [event]);
    } else if (event.type === 'agent_start') {
      current = event.data.messageId;
      yield event;
    } else if (event.type === 'agent_end') {
      yield* settle(event.data.messageId);
      yield event;
    } else if (event.type === 'done') {
      for (const id of [...held.keys()]) yield* settle(id);
      yield lastSafe === null ? event : scrubDone(event, droppedActions, lastSafe);
    } else {
      yield event;
    }
  }
  for (const id of [...held.keys()]) yield* settle(id);
}

/**
 * Bọc luồng sự kiện của `statelessGenerate` bằng bộ lọc vào/ra. `source` phải là generator chưa
 * được kéo: khi chặn đầu vào ta không bao giờ lặp qua nó nên agent không chạy.
 */
export async function* withTutorModeration(
  body: StatelessChatRequest,
  source: AsyncIterable<StatelessEvent>,
  deps: ChatModerationDeps = {},
): AsyncGenerator<StatelessEvent, void, undefined> {
  const mod = deps.moderate ?? moderate;
  const locale = pickLocale(body.storeState?.stage?.languageDirective);

  const verdict = await checkInputs(
    mod,
    [...studentTexts(body.messages), ...observationTexts(body.interactiveState)],
    locale,
  );
  if (verdict) {
    logBlocked('in', verdict);
    yield* scriptedTurn(body, safeMessage(verdict.categories, locale));
    return;
  }
  yield* moderateOutput(source, mod, locale);
}

/**
 * Biến một nhà sản xuất kiểu đẩy (`produce(send)`, như `runPiDirectorLoop`) thành luồng kéo để
 * đưa vào `withTutorModeration`. Lười: `produce` chỉ chạy khi có người kéo lần đầu, nên đầu vào
 * bị chặn thì agent không bao giờ chạy. `send` không chặn (hàng đợi); lỗi của `produce` được ném
 * lại sau khi đã phát hết các sự kiện đã xếp.
 */
export async function* eventsFromProducer(
  produce: (send: (event: StatelessEvent) => Promise<void>) => Promise<unknown>,
): AsyncGenerator<StatelessEvent, void, undefined> {
  const queue: StatelessEvent[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let failure: { error: unknown } | null = null;
  const ping = () => {
    wake?.();
    wake = null;
  };
  produce(async (event) => {
    queue.push(event);
    ping();
  }).then(
    () => {
      finished = true;
      ping();
    },
    (error) => {
      failure = { error };
      finished = true;
      ping();
    },
  );
  for (;;) {
    const event = queue.shift();
    if (event) yield event;
    else if (finished) break;
    else await new Promise<void>((r) => (wake = r));
  }
  if (failure) throw (failure as { error: unknown }).error;
}
