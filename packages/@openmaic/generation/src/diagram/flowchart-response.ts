import { parseJsonResponse } from '../json-repair.js';

import type { Direction, FlowEdge, FlowGraph, FlowNode } from './flowchart.js';

export interface FlowchartResponse {
  graph: FlowGraph;
  direction?: Direction;
  labels?: { prev: string; next: string };
  /** BCP 47 language tag of the course, e.g. "vi" or "zh-CN". */
  lang?: string;
}

export interface FlowchartParseOptions {
  /** The outline's node-count limit; a graph above it is rejected. */
  maxNodes?: number;
}

/** Hard ceiling regardless of the outline: keeps a runaway response from building a huge page. */
const HARD_MAX_NODES = 60;
const MAX_ID = 64;
const MAX_LABEL = 200;
const MAX_DETAILS = 800;
const MAX_ICON = 16;
const MAX_EDGE_LABEL = 80;
const MAX_BUTTON = 40;
const LANG_TAG = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
const NODE_TYPES = ['default', 'start', 'end'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Cut text to `max` characters, marking the cut with an ellipsis. */
function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID;
}

function toNode(value: unknown): FlowNode | null {
  if (!isRecord(value) || !validId(value.id) || typeof value.label !== 'string') return null;
  const type = NODE_TYPES.find((t) => t === value.type);
  return {
    id: value.id,
    label: clip(value.label, MAX_LABEL),
    ...(typeof value.icon === 'string' ? { icon: clip(value.icon, MAX_ICON) } : {}),
    ...(typeof value.details === 'string' ? { details: clip(value.details, MAX_DETAILS) } : {}),
    ...(type ? { type } : {}),
    ...(value.focal === true ? { focal: true } : {}),
  };
}

function toEdge(value: unknown): FlowEdge | null {
  if (!isRecord(value) || !validId(value.from) || !validId(value.to)) return null;
  return {
    from: value.from,
    to: value.to,
    ...(typeof value.label === 'string' ? { label: clip(value.label, MAX_EDGE_LABEL) } : {}),
  };
}

/**
 * Parse the JSON object the diagram-graph prompt asks for. Returns null when the shape is wrong or
 * the graph exceeds its node limit. Unknown edge endpoints are left for the renderer to reject,
 * since it owns the graph rules.
 */
export function parseFlowchartResponse(
  response: string,
  options: FlowchartParseOptions = {},
): FlowchartResponse | null {
  const raw = parseJsonResponse<unknown>(response);
  if (!isRecord(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;

  const limit = Math.min(HARD_MAX_NODES, options.maxNodes ?? HARD_MAX_NODES);
  if (raw.nodes.length === 0 || raw.nodes.length > limit) return null;

  const nodes = raw.nodes.map(toNode);
  const edges = raw.edges.map(toEdge);
  if (nodes.some((n) => n === null) || edges.some((e) => e === null)) return null;

  const labels =
    isRecord(raw.labels) &&
    typeof raw.labels.prev === 'string' &&
    typeof raw.labels.next === 'string' &&
    raw.labels.prev.trim() !== '' &&
    raw.labels.next.trim() !== ''
      ? {
          prev: clip(raw.labels.prev, MAX_BUTTON),
          next: clip(raw.labels.next, MAX_BUTTON),
        }
      : undefined;

  return {
    graph: { nodes: nodes as FlowNode[], edges: edges as FlowEdge[] },
    direction: raw.direction === 'LR' || raw.direction === 'TB' ? raw.direction : undefined,
    labels,
    lang: typeof raw.lang === 'string' && LANG_TAG.test(raw.lang) ? raw.lang : undefined,
  };
}
