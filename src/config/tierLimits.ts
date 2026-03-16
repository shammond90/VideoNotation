/**
 * Experience-level tier system.
 *
 * 'starter'  – initial state before user selects a level (forced to level-select screen)
 * 'beginner' – simplified experience with tight limits
 * 'advanced' – most features, higher limits
 * 'expert'   – everything unlocked, no limits
 */

export type UserTier = 'starter' | 'beginner' | 'advanced' | 'expert';

/** Tiers that users can actually pick (excludes 'starter'). */
export const SELECTABLE_TIERS = ['beginner', 'advanced', 'expert'] as const;
export type SelectableTier = (typeof SELECTABLE_TIERS)[number];

export interface TierLimits {
  maxProjects: number;        // 0 = unlimited
  maxCuesPerProject: number;  // 0 = unlimited
  maxCustomFields: number;    // 0 = unlimited
  maxCustomCueTypes: number;  // 0 = unlimited
  allowTemplates: boolean;
  allowDualWindow: boolean;
  allowXlsxExport: boolean;
  allowAdvancedConfig: boolean; // Fields tab, per-type column overrides, etc.
  allowTheatreMode: boolean;
}

export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  // starter is the same as beginner limits (user just hasn't chosen yet)
  starter: {
    maxProjects: 2,
    maxCuesPerProject: 50,
    maxCustomFields: 0,
    maxCustomCueTypes: 0,
    allowTemplates: false,
    allowDualWindow: false,
    allowXlsxExport: false,
    allowAdvancedConfig: false,
    allowTheatreMode: false,
  },
  beginner: {
    maxProjects: 2,
    maxCuesPerProject: 50,
    maxCustomFields: 0,
    maxCustomCueTypes: 0,
    allowTemplates: false,
    allowDualWindow: false,
    allowXlsxExport: false,
    allowAdvancedConfig: false,
    allowTheatreMode: false,
  },
  advanced: {
    maxProjects: 10,
    maxCuesPerProject: 200,
    maxCustomFields: 5,
    maxCustomCueTypes: 10,
    allowTemplates: true,
    allowDualWindow: true,
    allowXlsxExport: true,
    allowAdvancedConfig: true,
    allowTheatreMode: true,
  },
  expert: {
    maxProjects: 0,
    maxCuesPerProject: 0,
    maxCustomFields: 0,
    maxCustomCueTypes: 0,
    allowTemplates: true,
    allowDualWindow: true,
    allowXlsxExport: true,
    allowAdvancedConfig: true,
    allowTheatreMode: true,
  },
};

/** Feature descriptions for the level-select comparison table. */
export interface TierFeatureRow {
  label: string;
  beginner: string;
  advanced: string;
  expert: string;
}

export const TIER_FEATURE_TABLE: TierFeatureRow[] = [
  { label: 'Projects',          beginner: 'Up to 2',   advanced: 'Up to 10',  expert: 'Unlimited' },
  { label: 'Cues per project',  beginner: 'Up to 50',  advanced: 'Up to 200', expert: 'Unlimited' },
  { label: 'Custom fields',     beginner: '—',         advanced: 'Up to 5',   expert: 'Unlimited' },
  { label: 'Custom cue types',  beginner: '—',         advanced: 'Up to 10',  expert: 'Unlimited' },
  { label: 'Config templates',  beginner: '—',         advanced: '✓',         expert: '✓' },
  { label: 'Dual-window mode',  beginner: '—',         advanced: '✓',         expert: '✓' },
  { label: 'XLSX export',       beginner: '—',         advanced: '✓',         expert: '✓' },
  { label: 'Advanced config',   beginner: '—',         advanced: '✓',         expert: '✓' },
  { label: 'Theatre mode',      beginner: '—',         advanced: '✓',         expert: '✓' },
];

export const TIER_DESCRIPTIONS: Record<SelectableTier, { title: string; subtitle: string }> = {
  beginner: {
    title: 'Beginner',
    subtitle: 'Get started with the essentials',
  },
  advanced: {
    title: 'Advanced',
    subtitle: 'More tools for experienced users',
  },
  expert: {
    title: 'Expert',
    subtitle: 'Full access, no limits',
  },
};

/** Check if a limit value means "unlimited". */
export function isUnlimited(limit: number): boolean {
  return limit === 0;
}

/** Check if user is within the project limit. */
export function canCreateProject(tier: UserTier, currentCount: number): boolean {
  const max = TIER_LIMITS[tier].maxProjects;
  return isUnlimited(max) || currentCount < max;
}

/** Check if user is within the cue limit for a project. */
export function canCreateCue(tier: UserTier, currentCount: number): boolean {
  const max = TIER_LIMITS[tier].maxCuesPerProject;
  return isUnlimited(max) || currentCount < max;
}

/** Check if user can add more custom fields. */
export function canAddCustomField(tier: UserTier, currentCustomFieldCount: number): boolean {
  const max = TIER_LIMITS[tier].maxCustomFields;
  return isUnlimited(max) || currentCustomFieldCount < max;
}

/** Check if user can add more custom cue types. */
export function canAddCustomCueType(tier: UserTier, currentCustomTypeCount: number): boolean {
  const max = TIER_LIMITS[tier].maxCustomCueTypes;
  return isUnlimited(max) || currentCustomTypeCount < max;
}
