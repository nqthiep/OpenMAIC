'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isLearnHomeBuild } from '@/lib/config/feature-flags';
import { LocaleSwitch } from '@/lib/i18n/locale-switch';
import { useRequestLocale } from '@/lib/i18n/request-locale-provider';
import type { Messages } from '@/lib/tutor/catalog/types';
import type { DoorItem } from '@/lib/tutor/door/catalog';

type Lang = 'vi-VN' | 'en-US';
type Mode = 'lesson' | 'practice';

const T = {
  title: { 'vi-VN': 'Chọn bài để học', 'en-US': 'Pick a lesson' },
  sub: {
    'vi-VN':
      'Xem thuật toán chạy từng bước, đoán trước kết quả, rồi làm vài câu luyện tập. Không cần viết code.',
    'en-US':
      'Watch it run step by step, predict before you see, then try a few practice questions. No code to write.',
  },
  subMath: {
    'vi-VN': 'Xem cách giải từng bước, đoán trước kết quả, rồi làm vài câu luyện tập.',
    'en-US':
      'Follow each solution step by step, predict the result, then try a few practice questions.',
  },
  name: { 'vi-VN': 'Tên của bạn (không bắt buộc)', 'en-US': 'Your name (optional)' },
  namePh: { 'vi-VN': 'Biệt danh cũng được', 'en-US': 'A nickname is fine' },
  notice: {
    'vi-VN':
      'Trang này lưu tên hoặc biệt danh, các bài đã mở, câu trả lời dự đoán, bài làm luyện tập và tiến độ học. Giáo viên có mã truy cập của trường xem được các dữ liệu này. Trên máy này, trình duyệt cũng nhớ tên và các bài đã mở. Dữ liệu chưa tự xoá, và chưa có cách xoá theo yêu cầu: muốn xoá, hãy liên hệ người quản trị. Bạn nên dùng biệt danh, không nhập họ tên thật.',
    'en-US':
      'This page stores the name or nickname you enter, the lessons you opened, your prediction and practice answers, and your progress. Your teacher can see this data with the school access code. On this device the browser also remembers the name and the lessons you opened. Data is not deleted automatically, and there is no way to request deletion yet: contact the administrator. Use a nickname, not your full real name.',
  },
  search: { 'vi-VN': 'Tìm bài…', 'en-US': 'Search…' },
  all: { 'vi-VN': 'Tất cả', 'en-US': 'All' },
  cp: { 'vi-VN': 'Tin học', 'en-US': 'Informatics' },
  math: { 'vi-VN': 'Toán', 'en-US': 'Math' },
  ts10: { 'vi-VN': 'Thi vào 10 chuyên', 'en-US': 'Selective-school entrance' },
  hsg: { 'vi-VN': 'HSG', 'en-US': 'Olympiad' },
  start: { 'vi-VN': 'Bắt đầu học', 'en-US': 'Start' },
  resume: { 'vi-VN': 'Tiếp tục', 'en-US': 'Continue' },
  again: { 'vi-VN': 'Học lại', 'en-US': 'Start over' },
  practice: { 'vi-VN': 'Chỉ luyện tập', 'en-US': 'Practice only' },
  opening: { 'vi-VN': 'Đang mở…', 'en-US': 'Opening…' },
  opened: { 'vi-VN': 'Đã mở', 'en-US': 'Opened' },
  next: { 'vi-VN': 'Học tiếp', 'en-US': 'Up next' },
  examples: { 'vi-VN': 'ví dụ', 'en-US': 'examples' },
  level: { 'vi-VN': 'Bậc', 'en-US': 'Level' },
  other: { 'vi-VN': 'Khác', 'en-US': 'Other' },
  empty: { 'vi-VN': 'Chưa có bài nào khớp.', 'en-US': 'No lesson matches.' },
  off: {
    'vi-VN': 'Trang này chưa sẵn sàng trên máy chủ này. Hãy nhờ người quản trị kiểm tra lại.',
    'en-US': 'This page is not ready on this server yet. Ask the administrator to check it.',
  },
  needCode: {
    'vi-VN': 'Cần nhập mã truy cập ở trang chủ trước.',
    'en-US': 'Enter the access code on the home page first.',
  },
  home: { 'vi-VN': 'Mở trang chủ', 'en-US': 'Open the home page' },
  failed: {
    'vi-VN': 'Chưa mở được bài. Bạn thử lại nhé.',
    'en-US': 'Could not open the lesson. Please try again.',
  },
  stuck: {
    'vi-VN': 'Chưa chuyển được sang trang học, thử lại',
    'en-US': 'The lesson page has not opened yet. Please try again.',
  },
  narrow: {
    'vi-VN':
      'Lớp học hiển thị tốt nhất trên máy tính bảng hoặc máy tính; trên điện thoại chữ sẽ rất nhỏ.',
    'en-US': 'The classroom works best on a tablet or computer; on a phone the text is very small.',
  },
  teachers: { 'vi-VN': 'Dành cho giáo viên', 'en-US': 'For teachers' },
  create: { 'vi-VN': 'Tạo bài mới', 'en-US': 'Create a course' },
  progress: { 'vi-VN': 'Tiến độ của lớp', 'en-US': 'Class progress' },
} satisfies Record<string, Messages>;

const NICKNAME_KEY = 'learnDoor.nickname';
const OPENED_KEY = 'learnDoor.opened';
const UNPLACED_TIER = 99;
/** A route change unmounts this page; if it has not happened after this long, the button unlocks. */
const NAV_WAIT_MS = 10_000;

type Opened = Record<string, { stageId: string; at: number }>;
type Failure = { id: string; kind: 'needCode' | 'failed' | 'stuck' };

/** Track chips show under All and Informatics only: no other subject has tracks. */
const hasTracks = (subject: string) => subject === 'all' || subject === 'cp';

function readJson<V>(key: string, fallback: V): V {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as V) : fallback;
  } catch {
    return fallback;
  }
}

function writeText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: nothing is remembered, the page still works
  }
}

export function LearnDoor({ items, enabled }: { items: DoorItem[]; enabled: boolean }) {
  // the language the server resolved for this request, so the first render is already right
  const locale = useRequestLocale();
  const router = useRouter();
  // the door has Vietnamese and English copy; any other locale gets Vietnamese
  const lang: Lang = locale === 'en-US' ? 'en-US' : 'vi-VN';
  const t = (m: Messages) => m[lang] ?? m['en-US'];
  // A student deployment has no course generator, so its home is this page. Elsewhere, the generator.
  const learnBuild = isLearnHomeBuild();
  const homeHref = learnBuild ? '/learn' : '/?classic=1';

  const [subject, setSubject] = useState('all');
  const [track, setTrack] = useState('all');
  const [query, setQuery] = useState('');
  const [nickname, setNickname] = useState('');
  const [opened, setOpened] = useState<Opened>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const opening = useRef(false);
  const navTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setNickname(readJson<string>(NICKNAME_KEY, ''));
    setOpened(readJson<Opened>(OPENED_KEY, {}));
    return () => clearTimeout(navTimer.current);
  }, []);

  const subjects = useMemo(() => [...new Set(items.map((i) => i.subject))], [items]);
  const subjectName = (s: string) => t(s in T ? T[s as 'cp' | 'math'] : { 'vi-VN': s, 'en-US': s });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const name = (m: Messages) => (m[lang] ?? m['en-US'] ?? '').toLowerCase();
    return items.filter(
      (i) =>
        (subject === 'all' || i.subject === subject) &&
        (track === 'all' || i.tracks.includes(track)) &&
        (q === '' || name(i.title).includes(q) || (i.topic !== null && name(i.topic).includes(q))),
    );
  }, [items, subject, track, query, lang]);

  // `shown` is already in curriculum order, so the first one not opened yet is the suggestion
  const upNext = query.trim() === '' ? shown.find((i) => !opened[i.id]) : undefined;
  const openedCount = items.filter((i) => opened[i.id]).length;
  const groups = [...new Set(shown.map((i) => `${i.subject}|${i.tier}`))];

  /** Unlocks the button if the route change has not unmounted this page after NAV_WAIT_MS. */
  function waitForNavigation(id: string) {
    clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => {
      opening.current = false;
      setBusy(null);
      setError({ id, kind: 'stuck' });
    }, NAV_WAIT_MS);
  }

  async function open(id: string, mode: Mode, resume = false) {
    // checked synchronously, so a second press cannot start a second course
    if (opening.current) return;
    opening.current = true;
    setBusy(`${id}:${mode}:${resume}`);
    setError(null);
    writeText(NICKNAME_KEY, JSON.stringify(nickname));
    // stays set after a push: the page unmounts once the course opens
    let navigating = false;
    try {
      const known = opened[id];
      if (resume && known) {
        // the course may have been deleted since: only reopen one that is still there
        const alive = await fetch(`/api/stages/${known.stageId}`, { method: 'HEAD' })
          .then((r) => r.ok)
          .catch(() => false);
        if (alive) {
          router.push(`/classroom/${known.stageId}`);
          waitForNavigation(id);
          navigating = true;
          return;
        }
      }
      const res = await fetch('/api/learn/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ walkthroughId: id, mode, locale: lang, nickname }),
      });
      if (res.status === 401) return setError({ id, kind: 'needCode' });
      if (!res.ok) return setError({ id, kind: 'failed' });
      const { stageId, url } = (await res.json()) as { stageId: string; url: string };
      if (mode === 'lesson') {
        const next: Opened = { ...opened, [id]: { stageId, at: Date.now() } };
        setOpened(next);
        writeText(OPENED_KEY, JSON.stringify(next));
      }
      router.push(url);
      waitForNavigation(id);
      navigating = true;
    } catch {
      setError({ id, kind: 'failed' });
    } finally {
      if (!navigating) {
        opening.current = false;
        setBusy(null);
      }
    }
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
    }`;
  const label = (id: string, mode: Mode, resume: boolean, text: Messages) =>
    busy === `${id}:${mode}:${resume}` ? t(T.opening) : t(text);
  // The visible label leads the accessible name, and the lesson title tells the identical buttons apart.
  const named = (i: DoorItem, text: string) => `${text}: ${t(i.title)}`;
  // shown under the card (or the suggestion) that was pressed
  const errorNote = (id: string) =>
    error?.id === id && (
      <p role="alert" className="w-full rounded-md border border-destructive/40 p-2 text-sm">
        {t(error.kind === 'needCode' ? T.needCode : error.kind === 'stuck' ? T.stuck : T.failed)}{' '}
        {error.kind === 'needCode' && (
          <Link href={homeHref} className="underline">
            {t(T.home)}
          </Link>
        )}
      </p>
    );

  return (
    <main lang={lang} className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t(T.title)}</h1>
          <p className="mt-1 text-muted-foreground">{t(subject === 'math' ? T.subMath : T.sub)}</p>
        </div>
        <LocaleSwitch locale={lang} />
      </div>
      <p aria-live="polite" className="sr-only">
        {busy !== null ? t(T.opening) : ''}
      </p>

      {!enabled ? (
        <p className="mt-6 rounded-md border p-4">{t(T.off)}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-1">
              <label className="grid gap-1 text-sm">
                {t(T.name)}
                <Input
                  value={nickname}
                  maxLength={40}
                  placeholder={t(T.namePh)}
                  aria-describedby="learn-data-notice"
                  onChange={(e) => setNickname(e.target.value)}
                />
              </label>
              <p id="learn-data-notice" className="text-sm text-muted-foreground">
                {t(T.notice)}
              </p>
            </div>
            <label className="grid gap-1 text-sm">
              {t(T.search)}
              <Input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {['all', ...subjects].map((s) => (
              <button
                key={s}
                className={chip(subject === s)}
                aria-pressed={subject === s}
                onClick={() => {
                  setSubject(s);
                  if (!hasTracks(s)) setTrack('all');
                }}
              >
                {s === 'all' ? t(T.all) : subjectName(s)}
              </button>
            ))}
            {hasTracks(subject) &&
              (['ts10', 'hsg'] as const).map((tr) => (
                <button
                  key={tr}
                  className={chip(track === tr)}
                  aria-pressed={track === tr}
                  onClick={() => setTrack(track === tr ? 'all' : tr)}
                >
                  {t(T[tr])}
                </button>
              ))}
          </div>

          <p className="mt-4 rounded-md border p-3 text-sm text-muted-foreground md:hidden">
            {t(T.narrow)}
          </p>

          {upNext && (
            <section className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  {t(T.next)}
                  {openedCount > 0 &&
                    ` · ${openedCount}/${items.length} ${t(T.opened).toLowerCase()}`}
                </div>
                <div className="truncate font-medium">{t(upNext.title)}</div>
              </div>
              <Button
                disabled={busy !== null}
                aria-label={named(upNext, label(upNext.id, 'lesson', false, T.start))}
                onClick={() => open(upNext.id, 'lesson')}
              >
                {label(upNext.id, 'lesson', false, T.start)}
              </Button>
              {errorNote(upNext.id)}
            </section>
          )}

          {shown.length === 0 && <p className="mt-8 text-muted-foreground">{t(T.empty)}</p>}
          {groups.map((group) => {
            const [sub, tierText] = group.split('|');
            const tier = Number(tierText);
            return (
              <section key={group} className="mt-8">
                <h2 className="mb-3 text-lg font-medium">
                  {subjectName(sub)} ·{' '}
                  {tier === UNPLACED_TIER ? t(T.other) : `${t(T.level)} ${tier}`}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shown
                    .filter((i) => i.subject === sub && i.tier === tier)
                    .map((i) => {
                      const was = opened[i.id];
                      return (
                        <li key={i.id} className="flex flex-col gap-2 rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-medium">{t(i.title)}</h3>
                            {was && <Badge variant="outline">{t(T.opened)}</Badge>}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            {i.topic && <span>{t(i.topic)}</span>}
                            {i.tracks.map((tr) => (
                              <Badge key={tr} variant="secondary">
                                {t(tr === 'ts10' ? T.ts10 : T.hsg)}
                              </Badge>
                            ))}
                            <span>
                              · {i.presets} {t(T.examples)}
                            </span>
                          </div>
                          <div className="mt-auto flex flex-wrap gap-2 pt-2">
                            {was ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={busy !== null}
                                  aria-label={named(i, label(i.id, 'lesson', true, T.resume))}
                                  onClick={() => open(i.id, 'lesson', true)}
                                >
                                  {label(i.id, 'lesson', true, T.resume)}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy !== null}
                                  aria-label={named(i, label(i.id, 'lesson', false, T.again))}
                                  onClick={() => open(i.id, 'lesson')}
                                >
                                  {label(i.id, 'lesson', false, T.again)}
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                disabled={busy !== null}
                                aria-label={named(i, label(i.id, 'lesson', false, T.start))}
                                onClick={() => open(i.id, 'lesson')}
                              >
                                {label(i.id, 'lesson', false, T.start)}
                              </Button>
                            )}
                            {i.practice && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy !== null}
                                aria-label={named(i, label(i.id, 'practice', false, T.practice))}
                                onClick={() => open(i.id, 'practice')}
                              >
                                {label(i.id, 'practice', false, T.practice)}
                              </Button>
                            )}
                          </div>
                          {errorNote(i.id)}
                        </li>
                      );
                    })}
                </ul>
              </section>
            );
          })}

          <footer className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
            <span>{t(T.teachers)}:</span>
            {!learnBuild && (
              <Link href={homeHref} className="underline">
                {t(T.create)}
              </Link>
            )}
            <Link href="/teacher" className="underline">
              {t(T.progress)}
            </Link>
          </footer>
        </>
      )}
    </main>
  );
}
