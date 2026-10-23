import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUEST_SECTIONS } from '@/lib/home/site-nav';

const DIR = 'lib/i18n/locales';
const load = (code: string) => JSON.parse(readFileSync(`${DIR}/${code}.json`, 'utf8'));
const strings = (o: Record<string, unknown>): string[] =>
  Object.values(o).flatMap((v) =>
    typeof v === 'string'
      ? [v]
      : v && typeof v === 'object'
        ? strings(v as Record<string, unknown>)
        : [],
  );

/** How each language writes "AI", with no letter next to it, so that "KHAITAM" does not count. */
const AI_WORD: Record<string, RegExp> = {
  'vi-VN': /(?<![A-Za-z])AI(?![A-Za-z])/g,
  'en-US': /(?<![A-Za-z])AI(?![A-Za-z])/g,
  'ja-JP': /(?<![A-Za-z])AI(?![A-Za-z])/g,
  'ko-KR': /(?<![A-Za-z])AI(?![A-Za-z])/g,
  'zh-CN': /(?<![A-Za-z])AI(?![A-Za-z])/g,
  'zh-TW': /(?<![A-Za-z])AI(?![A-Za-z])/g,
  'de-DE': /(?<![A-Za-z])KI(?![A-Za-z])/g,
  'es-MX': /(?<![A-Za-z])IA(?![A-Za-z])/g,
  'fr-FR': /(?<![A-Za-z])IA(?![A-Za-z])/g,
  'pt-BR': /(?<![A-Za-z])IA(?![A-Za-z])/g,
  'ru-RU': /ИИ/g,
  'ar-SA': /الذكاء الاصطناعي/g,
};

describe('the guest home copy', () => {
  // A visitor who meets "AI" in every block stops trusting the page. It is named where it has to
  // be (who writes the lessons, and the limit that follows), and nowhere else, in every language.
  it.each(Object.keys(AI_WORD))('names AI only a few times (%s)', (code) => {
    const mentions = strings(load(code).home.guest).join(' ').match(AI_WORD[code]) ?? [];
    expect(mentions.length).toBeGreaterThan(0); // the disclosure is still there
    expect(mentions.length).toBeLessThanOrEqual(3);
  });

  it.each(Object.keys(AI_WORD))(
    'says who it is for and what it does in its first lines (%s)',
    (code) => {
      const guest = load(code).home.guest;
      // Chinese writes the years with its own numerals.
      for (const grade of [/5|五/, /9|九/, /12|十二/]) expect(guest.intents.title).toMatch(grade);
      // The first line promises what the learner gets, and names the grades, not the brand.
      for (const grade of [/5|五/, /9|九/, /12|十二/]) expect(guest.headline).toMatch(grade);
      expect(guest.headline).toContain(' · ');
      expect(guest.headline).not.toBe(load(code).home.slogan);
      expect(guest.lead.length).toBeGreaterThan(40);
      expect(guest.tryFree.length).toBeGreaterThan(0);
    },
  );

  it.each(Object.keys(AI_WORD))(
    'splits the story title where the gold half starts (%s)',
    (code) => {
      expect(load(code).home.guest.story.title).toContain(' · ');
      expect(load(code).home.slogan).toContain(' · ');
    },
  );

  it('names the four subjects in the lead of the languages written by hand', () => {
    expect(load('vi-VN').home.guest.lead).toMatch(/Toán.*Tin học.*Vật lí.*Hoá học/);
    expect(load('en-US').home.guest.lead).toMatch(/maths.*informatics.*physics.*chemistry/i);
  });

  it.each(Object.keys(AI_WORD))('has six questions with an answer (%s)', (code) => {
    const faq = load(code).home.guest.faq;
    expect(faq.title.length).toBeGreaterThan(0);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(faq[`q${n}`].length, `q${n}`).toBeGreaterThan(5);
      expect(faq[`a${n}`].length, `a${n}`).toBeGreaterThan(5);
    }
    // The price and the address are filled in from the brand, not typed into the answer.
    expect(faq.a6).toContain('{{price}}');
    expect(faq.a6).toContain('{{email}}');
  });

  it('has a label for every section the top bar links to, in every language', () => {
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
      const nav = load(file.replace('.json', '')).home.guest.nav;
      for (const id of GUEST_SECTIONS) expect(nav[id], `${file}: nav.${id}`).toBeTruthy();
    }
  });
});
