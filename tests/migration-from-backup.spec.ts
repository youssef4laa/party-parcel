import { test, expect } from '@playwright/test';
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Room Editor Phase 1b, standing test (a): "restore a backup into a temp database, migrate it,
 * and confirm an old room and its boxes still load." The manual proof from Phase 1a (see
 * DECISIONS.md) used a real `npm run backup` snapshot by hand; this codifies the same shape of
 * proof so it runs on every suite pass instead of once by hand.
 *
 * There's no repo-checked-in binary backup fixture to restore (a binary .db in git is exactly
 * the kind of file nobody can meaningfully diff or review), so this builds the "old backup"
 * state itself: apply only the pre-Room-Editor migration (`init`) to a fresh temp database,
 * seed a room + box the way that schema shipped, THEN apply every migration up to HEAD
 * (including `add_room_objects_and_custom_items`) — exactly what restoring a real pre-Room-Editor
 * backup and running `prisma migrate deploy` against it would do. Uses the `sqlite3` CLI
 * directly (already relied on for manual DB verification throughout this project) rather than
 * adding a new npm dependency just for this one test.
 */

const REPO_ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'prisma', 'migrations');
const ROOM_EDITOR_MIGRATION = '20260921112426_add_room_objects_and_custom_items';

function runPrisma(args: string, databaseUrl: string) {
  execSync(`npx prisma ${args}`, {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

function sqlite(dbPath: string, sql: string) {
  return execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf-8' });
}

function sqliteJson(dbPath: string, sql: string): Array<Record<string, unknown>> {
  const out = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf-8' }).trim();
  return out ? JSON.parse(out) : [];
}

test('an old room and its boxes survive restoring a pre-Room-Editor backup and migrating to HEAD', async () => {
  test.setTimeout(60_000);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'party-parcel-migration-test-'));
  const dbPath = path.join(tmpDir, 'dev.db');
  const databaseUrl = `file:${dbPath}`;
  const movedAsidePath = path.join(os.tmpdir(), `${ROOM_EDITOR_MIGRATION}-set-aside-${Date.now()}`);
  const realMigrationPath = path.join(MIGRATIONS_DIR, ROOM_EDITOR_MIGRATION);
  let movedAside = false;

  try {
    // 1. Simulate "this database predates the Room Editor migration": hide that migration from
    // Prisma's view and apply only what's left (just `init`) to a brand-new temp database.
    fs.renameSync(realMigrationPath, movedAsidePath);
    movedAside = true;
    runPrisma('migrate deploy', databaseUrl);

    // 2. Seed exactly the shape of data a real pre-Room-Editor room+box had (columns match
    // migrations/20260919235239_init/migration.sql).
    sqlite(
      dbPath,
      `
      INSERT INTO "Room" (id, title, celebrantName, age, eventAt, timezone, hostEmail, adminTokenHash, contributeTokenHash, celebrateTokenHash)
      VALUES ('room-legacy-1', 'Legacy Bash', 'Pat', 40, '2026-01-01T00:00:00.000Z', 'UTC', 'host@example.com', 'admin-hash-1', 'contribute-hash-1', 'celebrate-hash-1');

      INSERT INTO "Box" (id, roomId, fromName, designJson, posX, posY, deleteTokenHash)
      VALUES ('box-legacy-1', 'room-legacy-1', 'Old Friend', '{"shape":"cube"}', 500, 600, 'delete-hash-1');

      INSERT INTO "Goodie" (id, boxId, type, sortOrder, payloadJson, sizeBytes)
      VALUES ('goodie-legacy-1', 'box-legacy-1', 'note', 0, '{"text":"hi"}', 42);
    `,
    );

    // 3. Restore the migration and bring the database the rest of the way to HEAD — this is the
    // actual "restore a backup, then migrate it" step under test.
    fs.renameSync(movedAsidePath, realMigrationPath);
    movedAside = false;
    runPrisma('migrate deploy', databaseUrl);

    // 4. Confirm the old room and its box still load, AND the new schema is usable — queried
    // directly from the migrated file itself (the live app's own Prisma client is bound to the
    // real dev.db, not this temp one), the most direct proof the migrated file is correct.
    const rooms = sqliteJson(dbPath, `SELECT * FROM "Room" WHERE id = 'room-legacy-1';`);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].celebrantName).toBe('Pat');
    expect(rooms[0].age).toBe(40);
    // The new column exists and got its schema default, not NULL, for a row that predates it.
    expect(rooms[0].permissionsJson).toBe('{}');

    const boxes = sqliteJson(dbPath, `SELECT * FROM "Box" WHERE id = 'box-legacy-1';`);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].fromName).toBe('Old Friend');
    expect(boxes[0].roomId).toBe('room-legacy-1');

    const goodies = sqliteJson(dbPath, `SELECT * FROM "Goodie" WHERE id = 'goodie-legacy-1';`);
    expect(goodies).toHaveLength(1);
    expect(goodies[0].type).toBe('note');

    // The new tables exist and are queryable (empty until the app's own lazy-seed runs — see
    // src/server/roomObjects.ts's resolveRoomObjects, covered by the "lazy-seed and idempotency"
    // test in room-objects-permissions.spec.ts).
    const objects = sqliteJson(dbPath, `SELECT * FROM "RoomObject" WHERE roomId = 'room-legacy-1';`);
    expect(objects).toHaveLength(0);
  } finally {
    if (movedAside && !fs.existsSync(realMigrationPath)) {
      fs.renameSync(movedAsidePath, realMigrationPath);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
