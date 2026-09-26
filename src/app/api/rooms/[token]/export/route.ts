import { NextRequest, NextResponse } from 'next/server';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { ZipArchive } from 'archiver';
import { resolveRoomByToken } from '@/server/rooms';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { ExportError, exportRoom } from '../../../../../../scripts/lib/exportRoom';

// The export builds a static site and zips files, so it needs Node (not the edge runtime), and a
// large room can take a while.
export const runtime = 'nodejs';
export const maxDuration = 300;

// One export at a time per server process: each one builds the site and holds the whole room's media
// in a temp folder, and two at once would also fight over the shared build output.
let exportInFlight = false;

/**
 * Host-panel "Export a sealed copy": builds the same sealed, fully static site that
 * `npm run export:gift` does and streams it back as a .zip. Host (admin link) only, and the password
 * goes through the same strength check as the CLI — it is the only real lock on the result.
 *
 * This runs a build on the server, so it works when you self-host with Node. On a serverless host
 * with no writable disk or no dev tooling, use `npm run export:gift` from your own machine instead
 * (the README says so).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  // Only the host may export: the archive contains every present's contents (encrypted) and the whole room.
  if (resolved.role !== 'admin') return jsonError(403, 'Only the host link can export the room.');

  if (!checkRateLimit(`export:${clientIp(req)}:${token}`, 5, 10 * 60_000)) {
    return jsonError(429, 'Too many exports — wait a few minutes and try again.');
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) return jsonError(400, 'Choose a password to lock the export with.');

  if (exportInFlight) return jsonError(429, 'Another export is already running — try again in a minute.');
  exportInFlight = true;

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'party-parcel-export-'));
  const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  const folder = 'party-parcel';
  const outDir = path.join(tmp, folder);

  try {
    await exportRoom({
      admin: token,
      password,
      outDir,
      // Development always rebuilds (so it can't serve a stale bundle); a production server reuses
      // the bundle built at deploy time (`npm run build:export-site`) and only builds if it's missing.
      siteBuild: process.env.NODE_ENV === 'production' ? 'if-missing' : 'always',
    });
  } catch (err) {
    exportInFlight = false;
    await cleanup();
    if (err instanceof ExportError) return jsonError(400, err.message);
    console.error('export failed:', err instanceof Error ? err.message : err);
    return jsonError(500, 'The export failed on the server. Check the server log, or run `npm run export:gift` instead.');
  }

  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.directory(outDir, folder);
  const finish = () => {
    exportInFlight = false;
    void cleanup();
  };
  archive.on('end', finish);
  archive.on('error', finish);
  void archive.finalize();

  const slug = resolved.room.celebrantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="party-parcel-${slug}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
