/**
 * The wire contract of `/api/admin/omniroute/*`: what the server answers and what the Settings
 * panel sends. Types only, so the browser bundle can import it without pulling in server code.
 * Every route is for administrators (`provider.manage`). Success bodies are `{ success: true, ... }`,
 * failures are `{ success: false, errorCode, error, details? }` where `details` is an
 * `OmniRouteFailure`.
 */

/** What an administrator picks a model for. The server maps each role to its stages. */
export const ROLE_IDS = ['generate', 'chat', 'grade', 'utility'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** Where setup stands, in the order the panel's steps need it. */
export type OmniRouteState =
  | 'unconfigured' // an environment value is missing (see `missingEnv`)
  | 'unreachable' // the app cannot reach OmniRoute, or cannot sign in to it
  | 'no-providers' // OmniRoute has no active provider connection yet
  | 'no-key' // reachable and has providers, but OpenMAIC has no key yet (step 2)
  | 'ready'; // key stored; roles can be chosen (step 3)

export interface OmniRouteConnection {
  id: string;
  /** The name given in OmniRoute. */
  name: string;
  /** The provider id in OmniRoute, such as `openai` or `claude`. */
  provider: string;
  /** `apikey`, `oauth` or another value OmniRoute reports. */
  authType: string;
  active: boolean;
  /** A subscription plan (OAuth) rather than a pay-per-use key: its terms may forbid this use. */
  subscription: boolean;
  /** Whether the stored OpenMAIC key may use it. False for every connection before step 2. */
  allowed: boolean;
}

export interface OmniRouteKeyInfo {
  /** The last four characters of the key, never the key. */
  hint: string;
  createdAt: string;
  noLog: boolean;
  dailyLimitUsd: number | null;
  connectionIds: string[];
}

/** One role's model and what the app should assume it can do. */
export interface RoleChoice {
  /** The OmniRoute model id, without the `omniroute:` prefix. For example `auto/best-vision`. */
  model: string;
  /** Whether images may be sent to it. */
  vision: boolean;
  /** Whether it can call tools. */
  tools: boolean;
  contextWindow?: number;
}

export type Roles = Partial<Record<RoleId, RoleChoice>>;

/** Paths in OmniRoute's own dashboard that the panel can open (pass one back to `open`). */
export interface OmniRouteDeepLinks {
  providers: string;
  combos: string;
  keys: string;
  health: string;
}

export interface OmniRouteOverview {
  state: OmniRouteState;
  /** Environment variable names that are missing or too short, never their values. */
  missingEnv: string[];
  version?: string;
  providers?: { configured: number; active: number };
  connections: OmniRouteConnection[];
  key: OmniRouteKeyInfo | null;
  roles: Roles;
  deepLinks: OmniRouteDeepLinks;
}

/** `GET /api/admin/omniroute/overview` */
export interface OverviewResponse {
  success: true;
  overview: OmniRouteOverview;
}

/** `POST /api/admin/omniroute/connect` body. At least one connection id; ids must be active. */
export interface ConnectRequest {
  connectionIds: string[];
  noLog: boolean;
  dailyLimitUsd: number | null;
}

/** `POST /api/admin/omniroute/connect` answer: creates the key, or updates its limits if it exists. */
export interface ConnectResponse {
  success: true;
  key: OmniRouteKeyInfo;
}

/** `POST /api/admin/omniroute/connect` with `{ rotate: true }` instead of the body above issues a new key. */
export interface RotateRequest {
  rotate: true;
}

/** `DELETE /api/admin/omniroute/connect` answer: removes the key and the stored credential. */
export interface DisconnectResponse {
  success: true;
  /** The stages whose routes pointed at OmniRoute and were cleared. */
  clearedStages: string[];
}

export type ModelGroup = 'auto' | 'combo' | 'model';

export interface OmniRouteModelItem {
  /** The id to send: `auto/best-chat`, a combo name, or `provider/model`. */
  id: string;
  name: string;
  group: ModelGroup;
  /** The provider id for a single model, `combo` for combos and `auto/*`. */
  owner: string;
  /** `null` means OmniRoute does not say (combos and `auto/*` often). */
  vision: boolean | null;
  tools: boolean | null;
  contextWindow: number | null;
  outputWindow: number | null;
}

export type PresetId = 'balanced' | 'economy' | 'quality';

/** `GET /api/admin/omniroute/models`: needs state `ready`. `presets` hold a full set of four roles. */
export interface ModelsResponse {
  success: true;
  items: OmniRouteModelItem[];
  presets: Partial<Record<PresetId, Record<RoleId, RoleChoice>>>;
}

/** `PUT /api/admin/omniroute/roles` body: all four roles. */
export interface RolesRequest {
  roles: Record<RoleId, RoleChoice>;
}

export interface RolesResponse {
  success: true;
  roles: Roles;
}

/** `POST /api/admin/omniroute/test` body: one tiny request through the role's model. */
export interface TestRequest {
  role: RoleId;
}

export interface TestResponse {
  success: true;
  model: string;
  latencyMs: number;
}

/** `POST /api/admin/omniroute/open` body (all optional). `path` must be one of `deepLinks`. */
export interface OpenRequest {
  path?: string;
}

export interface OpenResponse {
  success: true;
  url: string;
}

/** Values of `details` on a failure body. */
export type OmniRouteFailure =
  | 'unconfigured'
  | 'unreachable'
  | 'login-failed'
  | 'no-connections'
  | 'key-failed'
  | 'not-ready'
  | 'model-failed';
