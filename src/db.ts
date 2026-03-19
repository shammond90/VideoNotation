/**
 * Dexie.js local database — mirrors the Supabase schema.
 *
 * camelCase in Dexie (JS convention), snake_case in Supabase (SQL convention).
 * The sync layer (Sprint 3) translates between them.
 *
 * `syncQueue` and `conflicts` are local-only infrastructure for the sync engine.
 */
import Dexie, { type EntityTable } from 'dexie';

// ── Row types ──────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  name?: string | null;
  tier: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  lapsedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DbProject {
  id: string;
  userId: string;
  name: string;
  productionName?: string | null;
  venue?: string | null;
  year?: string | null;
  videoFilename?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DbCueType {
  id: string;
  projectId: string;
  name: string;
  shortCode?: string | null;
  colour: string;
  isReserved: boolean;
  sortOrder: number;
  createdAt?: string;
}

export interface DbField {
  id: string;
  projectId: string;
  label: string;
  inputType: string;
  sizeHint: string;
  isReserved: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt?: string;
}

export interface DbCue {
  id: string;
  projectId: string;
  cueTypeId?: string | null;
  cueNumber?: string | null;
  timecode?: string | null;
  timecodeUpdatedAt?: string | null;
  status: string;
  isCut: boolean;
  sortOrder?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DbCueFieldValue {
  id: string;
  cueId: string;
  fieldId: string;
  value?: string | null;
  updatedAt?: string;
}

export interface DbTemplate {
  id: string;
  userId: string;
  name: string;
  configJson: Record<string, unknown>;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Local-only: sync engine write-ahead log entry (Sprint 3). */
export interface DbSyncQueueEntry {
  id?: number;
  table: string;
  recordId: string;
  synced: boolean;
  retryCount: number;
  timestamp: string;
}

/** Local-only: unresolved sync conflict (Sprint 3). */
export interface DbConflict {
  id?: number;
  recordId: string;
  table: string;
  resolvedAt?: string | null;
}

// ── Database class ─────────────────────────────────────────────────────

export class CuetationDB extends Dexie {
  users!: EntityTable<DbUser, 'id'>;
  projects!: EntityTable<DbProject, 'id'>;
  cueTypes!: EntityTable<DbCueType, 'id'>;
  fields!: EntityTable<DbField, 'id'>;
  cues!: EntityTable<DbCue, 'id'>;
  cueFieldValues!: EntityTable<DbCueFieldValue, 'id'>;
  templates!: EntityTable<DbTemplate, 'id'>;
  syncQueue!: EntityTable<DbSyncQueueEntry, 'id'>;
  conflicts!: EntityTable<DbConflict, 'id'>;

  constructor() {
    super('cuetation');

    this.version(1).stores({
      // Mirrors Supabase: users
      users: 'id, email, tier',

      // Mirrors Supabase: projects
      projects: 'id, userId, name, productionName, venue, year, updatedAt',

      // Mirrors Supabase: cue_types
      cueTypes: 'id, projectId, name, isReserved, sortOrder',

      // Mirrors Supabase: fields
      fields: 'id, projectId, inputType, isReserved, isArchived, sortOrder',

      // Mirrors Supabase: cues
      // Compound index for fast sorted fetch per project
      cues: 'id, projectId, cueTypeId, cueNumber, timecode, status, isCut, updatedAt, [projectId+timecode]',

      // Mirrors Supabase: cue_field_values
      // Compound index — primary access pattern is by cueId + fieldId
      cueFieldValues: 'id, cueId, fieldId, updatedAt, [cueId+fieldId]',

      // Mirrors Supabase: templates
      templates: 'id, userId, name, isDefault',

      // Local only — sync engine write-ahead log (Sprint 3)
      syncQueue: '++id, table, recordId, synced, retryCount, timestamp',

      // Local only — unresolved sync conflicts (Sprint 3)
      conflicts: '++id, recordId, table, resolvedAt',
    });
  }
}

/** Singleton database instance. */
export const db = new CuetationDB();
