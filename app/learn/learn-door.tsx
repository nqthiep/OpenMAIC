'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
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
  name: { 'vi-VN': 'Tên của em (không bắt buộc)', 'en-US': 'Your name (optional)' },
  namePh: { 'vi-VN': 'Biệt danh cũng được', 'en-US': 'A nickname is fine' },
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
  examples: { 'vi-VN': 'bộ dữ liệu', 'en-US': 'examples' },
  level: { 'vi-VN': 'Mức', 'en-US': 'Level' },
  other: { 'vi-VN': 'Khác', 'en-US': 'Other' },
  empty: { 'vi-VN': 'Chưa có bài nào khớp.', 'en-US': 'No lesson matches.' },
  off: {
    'vi-VN': 'Chức năng này cần máy chủ có cơ sở dữ liệu.',
    'en-US': 'This needs a server with a database.',
  },
  needCode: {
    'vi-VN': 'Cần nhập mã truy cập ở trang chủ trước.',
    'en-US': 'Enter the access code on the home page first.',
  },
  home: { 'vi-VN': 'Mở trang chủ', 'en-US': 'Open the home page' },
  failed: {
    'vi-VN': 'Chưa mở được bài. Em thử lại nhé.',
    'en-US': 'Could not open the lesson. Please try again.',
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
/** `/` goes to this page on student deployments (`OPENMAIC_HOME=learn`); `classic` is the way out. */
const HOME_HREF = '/?classic=1';

type Opened = Record<string, { stageId: string; at: number }>;

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
  const { locale } = useI18n();
  const router = useRouter();
  const lang: Lang = locale === 'vi-VN' ? 'vi-VN' : 'en-US';
  const t = (m: Messages) => m[lang] ?? m['en-US'];

  const [subject, setSubject] = useState('all');
  const [track, setTrack] = useState('all');
  const [query, setQuery] = useState('');
  const [nickname, setNickname] = useState('');
  const [opened, setOpened] = useState<Opened>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<'needCode' | 'failed' | null>(null);

  useEffect(() => {
    setNickname(readJson<string>(NICKNAME_KEY, ''));
    setOpened(readJson<Opened>(OPENED_KEY, {}));
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

  async function open(id: string, mode: Mode, resume = false) {
    setBusy(`${id}:${mode}:${resume}`);
    setError(null);
    writeText(NICKNAME_KEY, JSON.stringify(nickname));
    try {
      const known = opened[id];
      if (resume && known) {
        // the course may have been deleted since: only reopen one that is still there
        const alive = await fetch(`/api/stages/${known.stageId}`, { method: 'HEAD' })
          .then((r) => r.ok)
          .catch(() => false);
        if (alive) return router.push(`/classroom/${known.stageId}`);
      }
      const res = await fetch('/api/learn/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ walkthroughId: id, mode, locale: lang, nickname }),
      });
      if (res.status === 401) return setError('needCode');
      if (!res.ok) return setError('failed');
      const { stageId, url } = (await res.json()) as { stageId: string; url: string };
      if (mode === 'lesson') {
        const next: Opened = { ...opened, [id]: { stageId, at: Date.now() } };
        setOpened(next);
        writeText(OPENED_KEY, JSON.stringify(next));
      }
      router.push(url);
    } catch {
      setError('failed');
    } finally {
      setBusy(null);
    }
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
    }`;
  const label = (id: string, mode: Mode, resume: boolean, text: Messages) =>
    busy === `${id}:${mode}:${resume}` ? t(T.opening) : t(text);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold">{t(T.title)}</h1>
      <p className="mt-1 text-muted-foreground">{t(T.sub)}</p>

      {!enabled ? (
        <p className="mt-6 rounded-md border p-4">{t(T.off)}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              {t(T.name)}
              <Input
                value={nickname}
                maxLength={40}
                placeholder={t(T.namePh)}
                onChange={(e) => setNickname(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              {t(T.search)}
              <Input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {['all', ...subjects].map((s) => (
              <button key={s} className={chip(subject === s)} onClick={() => setSubject(s)}>
                {s === 'all' ? t(T.all) : subjectName(s)}
              </button>
            ))}
            {(subject === 'all' || subject === 'cp') &&
              (['ts10', 'hsg'] as const).map((tr) => (
                <button
                  key={tr}
                  className={chip(track === tr)}
                  onClick={() => setTrack(track === tr ? 'all' : tr)}
                >
                  {t(T[tr])}
                </button>
              ))}
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-md border border-destructive/40 p-3 text-sm">
              {t(error === 'needCode' ? T.needCode : T.failed)}{' '}
              {error === 'needCode' && (
                <Link href={HOME_HREF} className="underline">
                  {t(T.home)}
                </Link>
              )}
            </p>
          )}

          <p className="mt-4 rounded-md border p-3 text-sm text-muted-foreground sm:hidden">
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
              <Button disabled={busy !== null} onClick={() => open(upNext.id, 'lesson')}>
                {label(upNext.id, 'lesson', false, T.start)}
              </Button>
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
                            <div className="font-medium">{t(i.title)}</div>
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
                                  onClick={() => open(i.id, 'lesson', true)}
                                >
                                  {label(i.id, 'lesson', true, T.resume)}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy !== null}
                                  onClick={() => open(i.id, 'lesson')}
                                >
                                  {label(i.id, 'lesson', false, T.again)}
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                disabled={busy !== null}
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
                                onClick={() => open(i.id, 'practice')}
                              >
                                {label(i.id, 'practice', false, T.practice)}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </section>
            );
          })}

          <footer className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
            <span>{t(T.teachers)}:</span>
            <Link href={HOME_HREF} className="underline">
              {t(T.create)}
            </Link>
            <Link href="/teacher" className="underline">
              {t(T.progress)}
            </Link>
          </footer>
        </>
      )}
    </main>
  );
}
