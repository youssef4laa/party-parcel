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
// Room Editor Phase 4: adds Gift + Box.scale/openInOrder/createdBySessionHash + Goodie.giftId, and
// backfills one default gift per existing box. It has to be hidden too, or it would run BEFORE the
// legacy rows are seeded below and the backfill would never be exercised on real legacy data.
const GIFTS_MIGRATION = '20260926142900_add_gifts_and_present_scale';

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
  const setAside = [ROOM_EDITOR_MIGRATION, GIFTS_MIGRATION].map((name) => ({
    real: path.join(MIGRATIONS_DIR, name),
    away: path.join(os.tmpdir(), `${name}-set-aside-${Date.now()}`),
  }));
  let movedAside = false;

  try {
    // 1. Simulate "this database predates the Room Editor migration": hide that migration from
    // Prisma's view and apply only what's left (just `init`) to a brand-new temp database.
    for (const m of setAside) fs.renameSync(m.real, m.away);
    movedAside = true;
    runPrisma('migrate deploy', databaseUrl);

    // 2. Seed exactly the shape of data a real pre-Room-Editor room+box had (columns match
    // migrations/20260919235239_init/migration.sql). eventAt is relative to "now" (a fixed literal
    // date would just be further in the past every time this suite runs, and while nothing here
    // actually reads eventAt, a stray absolute date is exactly the kind of fixture that quietly
    // rots — see DECISIONS.md's Room Editor Phase 1c entry).
    const legacyEventAt = new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString(); // 60 days ago
    sqlite(
      dbPath,
      `
      INSERT INTO "Room" (id, title, celebrantName, age, eventAt, timezone, hostEmail, adminTokenHash, contributeTokenHash, celebrateTokenHash)
      VALUES ('room-legacy-1', 'Legacy Bash', 'Pat', 40, '${legacyEventAt}', 'UTC', 'host@example.com', 'admin-hash-1', 'contribute-hash-1', 'celebrate-hash-1');

      INSERT INTO "Box" (id, roomId, fromName, designJson, posX, posY, deleteTokenHash)
      VALUES ('box-legacy-1', 'room-legacy-1', 'Old Friend', '{"shape":"cube"}', 500, 600, 'delete-hash-1');

      INSERT INTO "Goodie" (id, boxId, type, sortOrder, payloadJson, sizeBytes)
      VALUES ('goodie-legacy-1', 'box-legacy-1', 'note', 0, '{"text":"hi"}', 42);

      -- a second legacy box with several goodies (one a redeemed coupon), and a third with none
      INSERT INTO "Box" (id, roomId, fromName, designJson, posX, posY, deleteTokenHash)
      VALUES ('box-legacy-2', 'room-legacy-1', 'Another Friend', '{"shape":"tall"}', 700, 600, 'delete-hash-2');
      INSERT INTO "Goodie" (id, boxId, type, sortOrder, payloadJson, sizeBytes) VALUES
        ('goodie-legacy-2a', 'box-legacy-2', 'note', 0, '{"text":"one"}', 10),
        ('goodie-legacy-2b', 'box-legacy-2', 'coupon', 1, '{"title":"free hug"}', 20),
        ('goodie-legacy-2c', 'box-legacy-2', 'note', 2, '{"text":"three"}', 30);
      INSERT INTO "CouponRedemption" (goodieId) VALUES ('goodie-legacy-2b');
      INSERT INTO "Box" (id, roomId, fromName, designJson, posX, posY, deleteTokenHash)
      VALUES ('box-legacy-3', 'room-legacy-1', 'Empty Box Eddie', '{"shape":"flat"}', 900, 600, 'delete-hash-3');
    `,
    );

    // 3. Restore the migration and bring the database the rest of the way to HEAD — this is the
    // actual "restore a backup, then migrate it" step under test.
    for (const m of setAside) fs.renameSync(m.away, m.real);
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

    // --- Phase 4b: the gifts backfill. Every legacy box got EXACTLY ONE default gift, and every
    // goodie is wrapped in its own box's gift, so each opens exactly as it always did.
    const gifts = sqliteJson(dbPath, `SELECT * FROM "Gift" ORDER BY boxId;`);
    expect(gifts.map((g) => g.boxId)).toEqual(['box-legacy-1', 'box-legacy-2', 'box-legacy-3']);
    for (const g of gifts) {
      expect(g.sortOrder).toBe(0);
      expect(g.label).toBe('');
      expect(g.designJson).toBe('{}');
    }
    const giftOf = (boxId: string) => gifts.find((g) => g.boxId === boxId)!.id;
    const grouped = sqliteJson(dbPath, `SELECT id, boxId, giftId, sortOrder FROM "Goodie" ORDER BY boxId, sortOrder;`);
    expect(grouped).toHaveLength(4); // nothing lost, nothing duplicated
    for (const g of grouped) expect(g.giftId, `goodie ${g.id} must be in its own box's gift`).toBe(giftOf(g.boxId as string));
    expect(grouped.filter((g) => g.boxId === 'box-legacy-2').map((g) => g.id)).toEqual(['goodie-legacy-2a', 'goodie-legacy-2b', 'goodie-legacy-2c']);
    expect(sqliteJson(dbPath, `SELECT COUNT(*) AS n FROM "Goodie" WHERE giftId IS NULL;`)[0].n).toBe(0);

    // The Goodie table is rebuilt by this migration; a redeemed coupon (which references it) must survive.
    expect(sqliteJson(dbPath, `SELECT goodieId FROM "CouponRedemption";`).map((r) => r.goodieId)).toEqual(['goodie-legacy-2b']);
    // Foreign keys still hold after the rebuild.
    expect(sqliteJson(dbPath, `PRAGMA foreign_key_check;`)).toEqual([]);

    // The new Box columns took their defaults on rows that predate them.
    const legacyBox = sqliteJson(dbPath, `SELECT scale, openInOrder, createdBySessionHash, z FROM "Box" WHERE id = 'box-legacy-1';`)[0];
    expect(legacyBox).toMatchObject({ scale: 1, openInOrder: 0, createdBySessionHash: null, z: 0 });

    // Deleting a legacy box cascades through gifts and goodies (no orphans left behind).
    sqlite(dbPath, `PRAGMA foreign_keys=ON; DELETE FROM "Box" WHERE id = 'box-legacy-2';`);
    expect(sqliteJson(dbPath, `SELECT COUNT(*) AS n FROM "Gift" WHERE boxId = 'box-legacy-2';`)[0].n).toBe(0);
    expect(sqliteJson(dbPath, `SELECT COUNT(*) AS n FROM "Goodie" WHERE boxId = 'box-legacy-2';`)[0].n).toBe(0);
  } finally {
    if (movedAside) {
      for (const m of setAside) if (!fs.existsSync(m.real) && fs.existsSync(m.away)) fs.renameSync(m.away, m.real);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
