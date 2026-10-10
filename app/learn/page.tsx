/**
 * `/learn` — the student door: pick a topic from the catalog and open its walkthrough, no chat with
 * an agent. The list comes from the widget registry, so it shows exactly what the release gate lets
 * through; `force-dynamic` keeps that request-scoped instead of baked into a prerender.
 */
import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { buildDoorCatalog, sequenceOf, type CurriculumTopic } from '@/lib/tutor/door/catalog';
import { widgetRegistry } from '@/lib/widgets';
import cpIndex from '@/skills/agent-runtime/competitive-programming/references/curriculum/index.json';
import mathIndex from '@/skills/agent-runtime/olympiad-math/references/curriculum/index.json';

import { LearnDoor } from './learn-door';

export const dynamic = 'force-dynamic';

export default function LearnPage() {
  const entries = widgetRegistry
    .walkthroughIds()
    .flatMap((id) => widgetRegistry.findWalkthrough(id) ?? []);
  const topics = [...cpIndex.topics, ...mathIndex.topics] as CurriculumTopic[];
  return (
    <LearnDoor
      items={buildDoorCatalog(entries, topics, [
        ...sequenceOf(cpIndex.sequencing),
        ...sequenceOf(mathIndex.sequencing),
      ])}
      enabled={isServerPersistenceConfigured()}
    />
  );
}
