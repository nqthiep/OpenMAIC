import { test, expect } from '@playwright/test';
import en from '../../lib/i18n/locales/en-US.json';
import { seedClassroom } from '../fixtures/seed-scenes';
import { ClassroomPage } from '../pages/classroom.page';

const STAGE_ID = 'e2e-code-widget-blocked';
const CODE_HTML =
  '<!DOCTYPE html><html><body><textarea id="student-code-editor">print(1)</textarea></body></html>';

test('code widget is blocked when OPENMAIC_ALLOW_CODE_WIDGET is not set', async ({ page }) => {
  // Registered before any navigation: the probe result decides mount vs. blocked.
  const policy = page.waitForResponse((r) => r.url().endsWith('/api/widgets/policy'));
  await seedClassroom(page, STAGE_ID, [
    {
      id: 'scene-code',
      type: 'interactive',
      title: 'Code',
      content: {
        type: 'interactive',
        url: '',
        html: CODE_HTML,
        widgetType: 'code',
        widgetConfig: { type: 'code' },
      },
    },
  ]);

  const classroom = new ClassroomPage(page);
  await classroom.goto(STAGE_ID);
  await classroom.waitForLoaded();

  // Precondition: this deployment really has the flag off.
  expect(await (await policy).json()).toEqual({ codeWidgetAllowed: false });

  await expect(
    page.getByRole('status').filter({ hasText: en.subject.tutor.blocked }).first(),
  ).toBeVisible();
  // No iframe at all (playback surface or nav thumbnail), so the editor never loads.
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('#student-code-editor')).toHaveCount(0);
});
