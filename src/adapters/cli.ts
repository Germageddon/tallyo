import { createInterface } from 'node:readline';
import type { App } from '../app/app';
import type { Reply, UserRef } from '../app/types';

/** A local stdin/stdout adapter — proves the core is platform-agnostic and gives a demo REPL. */
export async function runCli(app: App): Promise<void> {
  const ref: UserRef = { platform: 'cli', platformUserId: 'local' };
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  let lastCaptureId: number | null = null;

  console.log('Tallyo CLI — type an expense (e.g. "coffee 5, gas 10"), or /help. Ctrl-C to quit.');
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    let replies: Reply[];
    if (/^(yes|y)$/i.test(input) && lastCaptureId !== null) {
      replies = await app.confirm(ref, lastCaptureId);
      lastCaptureId = null;
    } else if (/^(no|n)$/i.test(input) && lastCaptureId !== null) {
      replies = await app.cancel(ref, lastCaptureId);
      lastCaptureId = null;
    } else {
      replies = await app.handle(ref, input);
    }

    for (const r of replies) {
      if (r.kind === 'text') {
        console.log(r.text);
      } else if (r.kind === 'confirm') {
        console.log(r.text);
        lastCaptureId = r.captureId;
      } else {
        console.log(`\n[${r.filename}] ${r.caption}\n${r.content}`);
      }
    }
    rl.prompt();
  }
}
