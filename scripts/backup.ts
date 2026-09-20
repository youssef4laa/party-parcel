import { access, cp, mkdir } from 'fs/promises';
import path from 'path';

/**
 * Copies the local dev database and the local storage provider's uploaded media into a
 * timestamped folder outside the repo — a friend's photos and messages live in both of these,
 * and neither is tracked by git (see .gitignore), so this is the only copy that survives
 * deleting the repo, wiping .data/, or running `prisma migrate reset`.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--out');
  return { out: i >= 0 ? args[i + 1] : undefined };
}

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { out } = parseArgs();
  const repoRoot = path.resolve(__dirname, '..');

  // Filesystem-safe timestamp, e.g. 2026-06-15T18-30-00-000Z
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Default: a sibling folder next to the repo, not inside it — this is a private backup of
  // data that was deliberately kept out of git, so it shouldn't live in a location git could
  // ever pick up either. Override with --out <dir> to put it somewhere else.
  const destRoot = path.resolve(out ?? path.join(repoRoot, '..', 'party-parcel-backups'));
  const dest = path.join(destRoot, timestamp);
  await mkdir(dest, { recursive: true });

  const dbPath = path.join(repoRoot, 'prisma', 'dev.db');
  const uploadsPath = path.join(repoRoot, '.data', 'uploads');

  let copiedDb = false;
  let copiedUploads = false;

  if (await exists(dbPath)) {
    await cp(dbPath, path.join(dest, 'dev.db'));
    // SQLite can leave a -journal/-wal/-shm sidecar file mid-write; copy whichever exist so the
    // backup is internally consistent, not just the main file.
    for (const suffix of ['-journal', '-wal', '-shm']) {
      const sidecar = dbPath + suffix;
      if (await exists(sidecar)) await cp(sidecar, path.join(dest, 'dev.db' + suffix));
    }
    copiedDb = true;
  } else {
    console.warn(`No database found at ${dbPath} — skipped.`);
  }

  if (await exists(uploadsPath)) {
    await cp(uploadsPath, path.join(dest, 'uploads'), { recursive: true });
    copiedUploads = true;
  } else {
    console.warn(
      `No local uploads found at ${uploadsPath} — skipped (nothing uploaded yet, or STORAGE_PROVIDER isn't "local"; an S3/R2-backed room's media lives at the bucket, not on this disk).`,
    );
  }

  if (!copiedDb && !copiedUploads) {
    console.error('Nothing to back up — no database and no local uploads found.');
    process.exit(1);
  }

  console.log(`\nBackup written to:\n  ${dest}\n`);
  console.log(`  ${copiedDb ? '✓' : '✗'} prisma/dev.db`);
  console.log(`  ${copiedUploads ? '✓' : '✗'} .data/uploads`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
