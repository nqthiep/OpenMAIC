'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
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
    'vi-VN': 'Trang này chưa được bật. Đặt TUTOR_TEACHER_CODE (từ 12 ký tự) trên máy chủ.',
    'en-US': 'This page is off. Set TUTOR_TEACHER_CODE (12+ characters) on the server.',
  },
  code: { 'vi-VN': 'Mã giáo viên', 'en-US': 'Teacher code' },
  enter: { 'vi-VN': 'Vào xem', 'en-US': 'Open' },
  wrong: { 'vi-VN': 'Mã chưa đúng.', 'en-US': 'Wrong code.' },
  failed: { 'vi-VN': 'Chưa tải được số liệu.', 'en-US': 'Could not load the numbers.' },
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
  hard: { 'vi-VN': 'Bước hay sai', 'en-US': 'Steps often missed' },
  last: { 'vi-VN': 'Gần nhất', 'en-US': 'Last' },
  none: { 'vi-VN': 'Chưa có số liệu.', 'en-US': 'No data yet.' },
} satisfies Record<string, Messages>;

type State = 'loading' | 'off' | 'needCode' | 'error' | 'ready';

async function fetchReport(): Promise<{ state: State; report: ProgressReport | null }> {
  try {
    const res = await fetch('/api/teacher/progress', { cache: 'no-store' });
    if (res.status === 404) return { state: 'off', report: null };
    if (res.status === 401) return { state: 'needCode', report: null };
    if (!res.ok) return { state: 'error', report: null };
    return { state: 'ready', report: (await res.json()) as ProgressReport };
  } catch {
    return { state: 'error', report: null };
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
  const { locale } = useI18n();
  const lang = locale === 'vi-VN' ? 'vi-VN' : 'en-US';
  const t = (m: Messages) => m[lang] ?? m['en-US'];

  const [state, setState] = useState<State>('loading');
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetchReport().then((r) => {
      if (!alive) return;
      setState(r.state);
      setReport(r.report);
    });
    return () => {
      alive = false;
    };
  }, [round]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setWrong(false);
    const res = await fetch('/api/teacher/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      setCode('');
      return setRound((n) => n + 1);
    }
    setWrong(true);
  }

  // nothing writes hint records yet (they come from the chat ladder), so the columns show only when some exist
  const showHints = report?.attempts.some((a) => a.hints > 0) ?? false;
  const th = 'px-2 py-1 text-left font-medium';
  const td = 'px-2 py-1 align-top';

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{t(T.title)}</h1>
      <p className="mt-1 text-muted-foreground">{t(T.sub)}</p>

      {state === 'off' && <p className="mt-6 rounded-md border p-4">{t(T.off)}</p>}
      {state === 'error' && <p className="mt-6 rounded-md border p-4">{t(T.failed)}</p>}
      {state === 'needCode' && (
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
          {wrong && (
            <p role="alert" className="text-sm text-destructive">
              {t(T.wrong)}
            </p>
          )}
          <Button type="submit" disabled={code === ''}>
            {t(T.enter)}
          </Button>
        </form>
      )}

      {state === 'ready' && report && (
        <>
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
                        {l.hardBeats.map((b) => `${b.beatId} (${pct(b.rate)})`).join(', ') || '–'}
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
