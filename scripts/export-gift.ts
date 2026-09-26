import 'dotenv/config';
import path from 'path';
import { createInterface } from 'readline/promises';
import { prisma } from '../src/server/db';
import { exportRoom, ExportError } from './lib/exportRoom';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    admin: get('--admin'),
    password: get('--password'),
    out: get('--out'),
  };
}

async function promptHidden(question: string): Promise<string> {
  // Minimal masking: readline doesn't support it natively without a TTY hack, and this is a
  // one-off local CLI tool run by the host on their own machine — not worth a dependency.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs();
  const admin = args.admin ?? (await promptHidden('Admin link token: '));
  const password =
    args.password ?? (await promptHidden('Password to lock this export (the recipient will need it): '));

  if (!admin || !password) {
    console.error('Usage: npm run export:gift -- --admin <adminToken> --password <password> [--out <dir>]');
    process.exit(1);
  }

  try {
    const summary = await exportRoom({
      admin,
      password,
      outDir: args.out ? path.resolve(args.out) : undefined,
      siteBuild: 'always',
      log: (line) => console.log(line),
      inheritBuildOutput: true,
    });
    console.log(
      `\nDone! ${summary.boxes} box(es), ${summary.objects} decoration(s), ${summary.customImages} custom image(s) exported to:\n  ${summary.outDir}\n`,
    );
    console.log('Try it locally with, e.g.:');
    console.log(`  npx serve "${summary.outDir}"`);
    console.log('\nRemember the password — it is the only way to unlock any box in this export.');
  } catch (err) {
    if (err instanceof ExportError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
