import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy';
import type { App } from '../app/app';
import type { Reply, UserRef } from '../app/types';

function refFrom(ctx: Context): UserRef | null {
  const id = ctx.from?.id;
  if (id === undefined) return null;
  return { platform: 'telegram', platformUserId: String(id) };
}

async function render(ctx: Context, replies: Reply[]): Promise<void> {
  for (const r of replies) {
    if (r.kind === 'text') {
      await ctx.reply(r.text);
    } else if (r.kind === 'confirm') {
      const keyboard = new InlineKeyboard()
        .text('✅ Confirm', `confirm:${r.captureId}`)
        .text('❌ Cancel', `cancel:${r.captureId}`);
      await ctx.reply(r.text, { reply_markup: keyboard });
    } else {
      await ctx.replyWithDocument(new InputFile(Buffer.from(r.content, 'utf8'), r.filename), {
        caption: r.caption,
      });
    }
  }
}

/** Telegram (grammY) adapter over the platform-agnostic App. Long-polling; outbound only. */
export async function runTelegram(app: App, token: string): Promise<void> {
  const bot = new Bot(token);

  await bot.api.setMyCommands([
    { command: 'help', description: 'How to use Tally' },
    { command: 'report', description: 'Spending report' },
    { command: 'export', description: 'Export CSV' },
    { command: 'settings', description: 'Your currency & timezone' },
    { command: 'currency', description: 'Set your currency (e.g. /currency USD)' },
    { command: 'timezone', description: 'Set your timezone (e.g. /timezone Europe/Berlin)' },
    { command: 'forget', description: 'Delete all your data' },
  ]);

  // All text (expenses AND slash-commands) is routed through the App, which does the parsing.
  bot.on('message:text', async (ctx) => {
    const ref = refFrom(ctx);
    if (!ref) return;
    const replies = await app.handle(ref, ctx.message.text);
    await render(ctx, replies);
  });

  bot.on('callback_query:data', async (ctx) => {
    const ref = refFrom(ctx);
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    if (!ref) return;

    let replies: Reply[] = [];
    if (data.startsWith('confirm:')) {
      replies = await app.confirm(ref, Number(data.slice('confirm:'.length)));
    } else if (data.startsWith('cancel:')) {
      replies = await app.cancel(ref, Number(data.slice('cancel:'.length)));
    }
    // Strip the buttons so the action can't be re-tapped.
    try {
      await ctx.editMessageReplyMarkup();
    } catch {
      /* message may be too old to edit */
    }
    await render(ctx, replies);
  });

  bot.catch((err) => {
    console.error('telegram error:', err.error);
  });

  const stop = () => void bot.stop();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log('Tallyo is running on Telegram (long-polling).');
  await bot.start();
}
