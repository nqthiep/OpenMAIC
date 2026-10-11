'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocaleSwitch } from '@/lib/i18n/locale-switch';
import { useRequestLocale } from '@/lib/i18n/request-locale-provider';
import type { Messages } from '@/lib/tutor/catalog/types';
import type { ProgressReport } from '@/lib/tutor/door/progress';

const T = {
  title: { 'vi-VN': 'Tiến độ học', 'en-US': 'Learning progress' },
  sub: {
    'vi-VN': 'Dành cho giáo viên và phụ huynh. Số liệu lấy từ các bài học sinh đã mở ở trang Học.',
    'en-US':
      'For teachers and parents. Numbers come from the lessons learners opened on the Learn page.',
  },
  off: {
    'vi-VN': 'Trang chưa mở. Nhờ quản trị kiểm tra cấu hình máy chủ.',
    'en-US': 'This page is not open yet. Ask the administrator to check the server settings.',
  },
  code: { 'vi-VN': 'Mã giáo viên', 'en-US': 'Teacher code' },
  enter: { 'vi-VN': 'Vào xem', 'en-US': 'Open' },
  wrong: { 'vi-VN': 'Mã chưa đúng.', 'en-US': 'Wrong code.' },
  limited: {
    'vi-VN': 'Nhập sai quá nhiều lần. Chờ {s} giây rồi thử lại.',
    'en-US': 'Too many wrong attempts. Wait {s} seconds and try again.',
  },
  limitedNoWait: {
    'vi-VN': 'Nhập sai quá nhiều lần. Chờ một lúc rồi thử lại.',
    'en-US': 'Too many wrong attempts. Wait a while and try again.',
  },
  network: {
    'vi-VN': 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
    'en-US': 'Could not reach the server. Check the connection and try again.',
  },
  loginFailed: {
    'vi-VN': 'Chưa đăng nhập được. Thử lại sau.',
    'en-US': 'Could not sign in. Try again later.',
  },
  retry: { 'vi-VN': 'Thử lại', 'en-US': 'Try again' },
  failed: { 'vi-VN': 'Chưa tải được số liệu.', 'en-US': 'Could not load the numbers.' },
  truncated: {
    'vi-VN': 'Báo cáo chỉ đọc 50 000 bản ghi học mới nhất. Hoạt động cũ hơn không được tính.',
    'en-US':
      'The report reads only the newest 50,000 learning records. Older activity is not counted.',
  },
  logout: { 'vi-VN': 'Đăng xuất', 'en-US': 'Log out' },
  byLesson: { 'vi-VN': 'Theo bài', 'en-US': 'By lesson' },
  byLearner: { 'vi-VN': 'Theo học sinh', 'en-US': 'By learner' },
  lesson: { 'vi-VN': 'Bài', 'en-US': 'Lesson' },
  who: { 'vi-VN': 'Học sinh', 'en-US': 'Learner' },
  attempts: { 'vi-VN': 'Lượt học', 'en-US': 'Attempts' },
  beats: { 'vi-VN': 'Bước đã xem', 'en-US': 'Steps seen' },
  predict: { 'vi-VN': 'Đoán đúng', 'en-US': 'Predictions right' },
  hints: { 'vi-VN': 'Gợi ý', 'en-US': 'Hints' },
  hintsAvg: { 'vi-VN': 'Gợi ý / lượt', 'en-US': 'Hints / attempt' },
  practice: { 'vi-VN': 'Luyện tập', 'en-US': 'Practice' },
  easy: { 'vi-VN': 'Dễ hiểu', 'en-US': 'Easy to follow' },
  easyAvg: { 'vi-VN': 'Dễ hiểu (TB)', 'en-US': 'Easy to follow (avg)' },
  hard: { 'vi-VN': 'Bước hay sai', 'en-US': 'Steps often missed' },
  unknownStep: { 'vi-VN': 'Bước đã đổi', 'en-US': 'Changed step' },
  last: { 'vi-VN': 'Gần nhất', 'en-US': 'Last' },
  none: { 'vi-VN': 'Chưa có số liệu.', 'en-US': 'No data yet.' },
} satisfies Record<string, Messages>;

type View =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'needCode' }
  | { kind: 'network' }
  | { kind: 'error' }
  | { kind: 'ready'; report: ProgressReport };

/** Why a code was not accepted; null means it was. */
interface LoginFailure {
  reason: 'wrong' | 'off' | 'network' | 'limited' | 'failed';
  /** Seconds to wait, when the server said so. */
  wait?: number;
}

async function fetchReport(): Promise<View> {
  let res: Response;
  try {
    res = await fetch('/api/teacher/progress', { cache: 'no-store' });
  } catch {
    return { kind: 'network' };
  }
  if (res.status === 403 || res.status === 404) return { kind: 'off' };
  if (res.status === 401) return { kind: 'needCode' };
  if (!res.ok) return { kind: 'error' };
  try {
    return { kind: 'ready', report: (await res.json()) as ProgressReport };
  } catch {
    return { kind: 'error' };
  }
}

async function postLogin(code: string): Promise<LoginFailure | null> {
  let res: Response;
  try {
    res = await fetch('/api/teacher/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch {
    return { reason: 'network' };
  }
  if (res.ok) return null;
  if (res.status === 401) return { reason: 'wrong' };
  if (res.status === 403) return { reason: 'off' };
  if (res.status === 429) {
    const wait = Math.ceil(Number(res.headers.get('Retry-After')));
    return { reason: 'limited', wait: wait > 0 ? wait : undefined };
  }
  return { reason: 'failed' };
}

async function postLogout(): Promise<boolean> {
  try {
    return (await fetch('/api/teacher/logout', { method: 'POST' })).ok;
  } catch {
    return false;
  }
}

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);

/** A rate as a number and a bar, so a column of them reads at a glance. */
function Rate({ value }: { value: number | null }) {
  if (value === null) return <span>–</span>;
  const tone = value >= 0.8 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="flex min-w-24 items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${tone}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="w-10 text-right tabular-nums">{pct(value)}</span>
    </span>
  );
}
const frac = (a: number, b: number | null) => (b === null || b === 0 ? '–' : `${a}/${b}`);

export default function TeacherPage() {
  // the language the server resolved for this request, so the first render is already right
  const locale = useRequestLocale();
  // the page has Vietnamese and English copy only, so every other language gets Vietnamese
  const lang = locale === 'en-US' ? 'en-US' : 'vi-VN';
  const t = (m: Messages) => m[lang] ?? m['en-US'];
  const score = (x: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(x);

  const [view, setView] = useState<View>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetchReport().then((next) => {
      if (alive) setView(next);
    });
    return () => {
      alive = false;
    };
  }, [round]);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    setFailure(null);
    const result = await postLogin(code);
    if (result === null) {
      setCode('');
      setRound((n) => n + 1);
      return;
    }
    if (result.reason === 'off') {
      setView({ kind: 'off' });
      return;
    }
    setFailure(result);
  }

  async function logout() {
    if (!(await postLogout())) {
      setView({ kind: 'network' });
      return;
    }
    setCode('');
    setFailure(null);
    setView({ kind: 'needCode' });
  }

  function failureText(f: LoginFailure): string {
    switch (f.reason) {
      case 'wrong':
        return t(T.wrong);
      case 'limited':
        return f.wait ? t(T.limited).replace('{s}', String(f.wait)) : t(T.limitedNoWait);
      case 'network':
        return t(T.network);
      default:
        return t(T.loginFailed);
    }
  }

  const report = view.kind === 'ready' ? view.report : null;
  // nothing writes hint records yet (they come from the chat ladder), so the columns show only when some exist
  const showHints = report?.attempts.some((a) => a.hints > 0) ?? false;
  const th = 'px-2 py-1 text-left font-medium';
  const td = 'px-2 py-1 align-top';

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t(T.title)}</h1>
          <p className="mt-1 text-muted-foreground">{t(T.sub)}</p>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitch locale={lang} />
          {report && (
            <Button type="button" onClick={() => void logout()}>
              {t(T.logout)}
            </Button>
          )}
        </div>
      </div>

      {view.kind === 'off' && <p className="mt-6 rounded-md border p-4">{t(T.off)}</p>}
      {(view.kind === 'network' || view.kind === 'error') && (
        <div className="mt-6 flex max-w-sm flex-col items-start gap-2 rounded-md border p-4">
          <p>{t(view.kind === 'network' ? T.network : T.failed)}</p>
          <Button type="button" onClick={() => setRound((n) => n + 1)}>
            {t(T.retry)}
          </Button>
        </div>
      )}
      {view.kind === 'needCode' && (
        <form onSubmit={login} className="mt-6 flex max-w-sm flex-col gap-2">
          <label className="text-sm" htmlFor="teacher-code">
            {t(T.code)}
          </label>
          <Input
            id="teacher-code"
            type="password"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {failure && (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
              <p>{failureText(failure)}</p>
              {failure.reason === 'network' && (
                <Button type="button" onClick={() => void login()}>
                  {t(T.retry)}
                </Button>
              )}
            </div>
          )}
          <Button type="submit" disabled={code === ''}>
            {t(T.enter)}
          </Button>
        </form>
      )}

      {report && (
        <>
          {report.truncated && (
            <p role="status" className="mt-6 rounded-md border border-amber-500 p-4 text-sm">
              {t(T.truncated)}
            </p>
          )}

          <h2 className="mt-8 text-lg font-medium">{t(T.byLesson)}</h2>
          {report.lessons.length === 0 ? (
            <p className="mt-2 text-muted-foreground">{t(T.none)}</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>{t(T.lesson)}</th>
                    <th className={th}>{t(T.attempts)}</th>
                    <th className={th}>{t(T.predict)}</th>
                    {showHints && <th className={th}>{t(T.hintsAvg)}</th>}
                    <th className={th}>{t(T.practice)}</th>
                    <th className={th}>{t(T.easyAvg)}</th>
                    <th className={th}>{t(T.hard)}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lessons.map((l) => (
                    <tr key={l.walkthroughId} className="border-b">
                      <td className={td}>{l.title}</td>
                      <td className={td}>{l.attempts}</td>
                      <td className={td}>
                        <Rate value={l.predictionRate} />
                      </td>
                      {showHints && <td className={td}>{l.hintsPerAttempt.toFixed(1)}</td>}
                      <td className={td}>
                        <Rate value={l.practiceRate} />
                      </td>
                      <td className={td}>
                        {l.easyAverage === null
                          ? '–'
                          : `${score(l.easyAverage)} / 5 (${l.easyCount})`}
                      </td>
                      <td className={td}>
                        {l.hardBeats
                          .map((b) => `${b.label ?? t(T.unknownStep)} (${pct(b.rate)})`)
                          .join(', ') || '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mt-8 text-lg font-medium">{t(T.byLearner)}</h2>
          {report.attempts.length === 0 ? (
            <p className="mt-2 text-muted-foreground">{t(T.none)}</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>{t(T.who)}</th>
                    <th className={th}>{t(T.lesson)}</th>
                    <th className={th}>{t(T.beats)}</th>
                    <th className={th}>{t(T.predict)}</th>
                    {showHints && <th className={th}>{t(T.hints)}</th>}
                    <th className={th}>{t(T.practice)}</th>
                    <th className={th}>{t(T.easy)}</th>
                    <th className={th}>{t(T.last)}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.attempts.map((a, i) => (
                    <tr key={`${a.stageId}:${i}`} className="border-b">
                      <td className={td}>{a.who}</td>
                      <td className={td}>{a.lesson}</td>
                      <td className={td}>{frac(a.beats.reached, a.beats.total)}</td>
                      <td className={td}>
                        <Rate
                          value={
                            a.predictions.answered > 0
                              ? a.predictions.correct / a.predictions.answered
                              : null
                          }
                        />
                        {a.predictions.answered > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {frac(a.predictions.correct, a.predictions.answered)}
                          </span>
                        )}
                      </td>
                      {showHints && <td className={td}>{a.hints}</td>}
                      <td className={td}>
                        <Rate value={a.practice ? a.practice.correct / a.practice.total : null} />
                        {a.practice && (
                          <span className="text-xs text-muted-foreground">
                            {a.practice.correct}/{a.practice.total}
                          </span>
                        )}
                      </td>
                      <td className={td}>{a.easy === null ? '–' : `${a.easy} / 5`}</td>
                      <td className={td}>{new Date(a.lastAt).toLocaleString(lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
