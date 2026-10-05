/**
 * Nối bộ lọc nội dung vào luồng `/api/chat` (INTERFACES 8.1, ADR 0014 quyết định 2).
 *
 * `withTutorModeration(body, source)` bọc luồng sự kiện của `statelessGenerate`:
 * - Vào: lọc tin nhắn học sinh mới nhất; vi phạm thì thay cả luồng bằng một lượt thầy soạn sẵn
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

/**
 * Chữ của tin nhắn học sinh mới nhất, chỉ khi nó là tin CUỐI của lịch sử. Vòng lặp client gọi
 * `/api/chat` nhiều lần cho một lượt của học sinh (mỗi lần một agent); từ lần hai tin cuối là
 * của agent, tin học sinh đã được lọc ở lần một. Đọc `parts` kiểu text giống
 * `convertMessagesToOpenAI`, tức đúng chữ agent sẽ thấy.
 */
export function latestStudentText(messages: StatelessChatRequest['messages']): string | null {
  const last = messages[messages.length - 1];
  if (last?.role !== 'user') return null;
  const text = (last.parts ?? [])
    .map((p) => p as { type?: string; text?: unknown })
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('\n')
    .trim();
  return text || null;
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
    return { allow: false, categories: [], model: '' };
  }
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

/**
 * Chiều ra. Quy tắc giữ sự kiện:
 * - `text_delta` và `action` của một `messageId` bị giữ tới `agent_end` của nó (giữ cả `action`
 *   để còn bỏ được khi chặn, và để giữ nguyên thứ tự giữa chữ và hành động).
 * - Mọi sự kiện khác đi qua ngay, gồm `agent_start` (client hiện bong bóng của thầy sớm),
 *   `thinking`, `whiteboard`, `cue_user`, `error`. Chúng không mang chữ của agent.
 * - Sự kiện không có `messageId` gắn vào lượt đang mở (`agent_start` gần nhất).
 * - `done` hoặc hết luồng mà còn phần chưa chốt (không có `agent_end`) thì chốt nốt qua bộ lọc.
 * - Nguồn ném lỗi: phần đang giữ bị bỏ, chưa lọc thì không phát.
 * Trần đã biết: chữ trong `params` của `action` (vd. `wb_draw_text`) không qua bộ lọc, chỉ chữ
 * lời thầy qua; các lượt chỉ-có-action cũng không tốn một lần gọi lọc.
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
    const text = events.map((e) => (e.type === 'text_delta' ? e.data.content : '')).join('');
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

  const text = latestStudentText(body.messages);
  if (text) {
    const verdict = await check(mod, text, 'in', locale);
    if (!verdict.allow) {
      logBlocked('in', verdict);
      yield* scriptedTurn(body, safeMessage(verdict.categories, locale));
      return;
    }
  }
  yield* moderateOutput(source, mod, locale);
}
