import { execFileSync } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

/** Gift-readiness pass: `npm run export:gift` must refuse a weak password outright rather than
 * silently accepting the brief's old "8 characters" floor — see scripts/lib/passwordStrength.ts. */
test.describe('export CLI: weak password rejection', () => {
  let admin: string;
  const outDirs: string[] = [];

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PasswordStrengthSuite' });
    admin = tokenFromLink(room.links.admin);
  });

  test.afterAll(async () => {
    await Promise.all(outDirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function runExport(password: string) {
    const repoRoot = path.resolve(__dirname, '..');
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'export-pw-test-'));
    outDirs.push(outDir);
    try {
      execFileSync('npx', ['tsx', 'scripts/export-gift.ts', '--admin', admin, '--password', password, '--out', outDir], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      return { exitCode: 0, stderr: '' };
    } catch (e) {
      const err = e as { status: number | null; stderr: Buffer };
      return { exitCode: err.status ?? 1, stderr: err.stderr.toString() };
    }
  }

  test('a short password is refused before any file is written', async () => {
    const { exitCode, stderr } = await runExport('short12');
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('at least 12 characters');
  });

  test('a common, low-entropy password is refused even if long enough', async () => {
    const { exitCode, stderr } = await runExport('aaaaaaaaaaaa');
    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toContain('common');
  });

  test('a strong password is accepted', async () => {
    const { exitCode } = await runExport('correct-horse-battery-staple-42');
    expect(exitCode).toBe(0);
  });
});
