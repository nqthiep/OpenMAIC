/**
 * Server-side widget policy probe.
 *
 *   GET /api/widgets/policy -> { codeWidgetAllowed: boolean }
 *
 * Reports whether this deployment allows the student-code widget, so the
 * client can decide to mount or block it without reading server env itself.
 */
import { isCodeWidgetAllowed } from '@/lib/config/feature-flags';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ codeWidgetAllowed: isCodeWidgetAllowed() });
}
