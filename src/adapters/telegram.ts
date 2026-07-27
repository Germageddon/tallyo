import { Bot, InlineKeyboard, InputFile, Keyboard, type Context } from 'grammy';
import type { App } from '../app/app';
import type { Button, Reply, UserRef } from '../app/types';

function refFrom(ctx: Context): UserRef | null {
  const id = ctx.from?.id;
  if (id === undefined) return null;
  return { platform: 'telegram', platformUserId: String(id) };
}

function kb(rows: Button[][]): InlineKeyboard {
  const k = new InlineKeyboard();
  rows.forEach((row, i) => {
    if (i > 0) k.row();
    for (const b of row) k.text(b.label, b.action);
  });
  return k;
}

async function renderOne(ctx: Context, r: Reply): Promise<void> {
  if (r.kind === 'text') {
    await ctx.reply(r.text);
  } else if (r.kind === 'buttons') {
    await ctx.reply(r.text, { reply_markup: kb(r.rows) });
  } else if (r.kind === 'confirm') {
    const keyboard = new InlineKeyboard()
      .text('✅ Confirm', `confirm:${r.captureId}`)
      .text('❌ Cancel', `cancel:${r.captureId}`);
    await ctx.reply(r.text, { reply_markup: keyboard });
  } else if (r.kind === 'request-location') {
    await ctx.reply(r.text, {
      reply_markup: new Keyboard().requestLocation('📍 Share my location').oneTime().resized(),
    });
  } else {
    await ctx.replyWithDocument(new InputFile(Buffer.from(r.content, 'utf8'), r.filename), {
      caption: r.caption,
    });
  }
}

async function render(ctx: Context, replies: Reply[]): Promise<void> {
  for (const r of replies) await renderOne(ctx, r);
}

export async function runTelegram(app: App, token: string): Promise<void> {
  const bot = new Bot(token);

  await bot.api.setMyCommands([
    { command: 'start', description: 'Open the menu' },
    { command: 'report', description: 'Spending report' },
    { command: 'export', description: 'Export CSV' },
    { command: 'currency', description: 'Set your currency' },
    { command: 'settings', description: 'Settings' },
    { command: 'help', description: 'How to use Tallyo' },
  ]);

  bot.on('message:text', async (ctx) => {
    const ref = refFrom(ctx);
    if (!ref) return;
    await render(ctx, await app.handle(ref, ctx.message.text));
  });

  bot.on('callback_query:data', async (ctx) => {
    const ref = refFrom(ctx);
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    if (!ref) return;
    // reply as fresh messages, not edits
    await render(ctx, await app.action(ref, data));
  });

  bot.on('message:location', async (ctx) => {
    const ref = refFrom(ctx);
    if (!ref) return;
    const { latitude, longitude } = ctx.message.location;
    console.log('location received:', latitude, longitude);
    await render(ctx, await app.setLocation(ref, latitude, longitude));
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
