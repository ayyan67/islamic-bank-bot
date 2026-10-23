import fs from 'node:fs';
import path from 'node:path';
import { createBotClient, installPrefixAliases } from './app/client.js';
import { installCommandScope } from './infra/discord/commandScope.js';
import { AppContainer } from './app/container.js';
import { env } from './config/env.js';
import { logger } from './infra/logging/logger.js';
import { buildChallengeEmbed } from './modules/challenges/service.js';
import { buildDigestEmbed } from './modules/digest/service.js';

async function main(): Promise<void> {
  if (!env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is required to start the bot runtime.');
  }

  const app = new AppContainer();
  const client = createBotClient(app);

  if (env.APPLICATION_ID) {
    client.applicationId = env.APPLICATION_ID;
  }

  const cachePath = path.resolve(env.COMMAND_UPLOAD_CACHE_PATH);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  await client.start();
  installCommandScope(client);
  installPrefixAliases(client);

  await client.uploadCommands({ cachePath });

  logger.info(
    {
      applicationId: client.applicationId,
      prefixAliasesEnabled: env.ENABLE_PREFIX_ALIASES,
      pid: process.pid
    },
    'HalalEconomyBot started'
  );

  // Reminder poll — check for due reminders every 30 seconds
  const REMINDER_POLL_MS = 30_000;
  const REMINDER_BATCH_SIZE = 25;
  const REMINDER_STALE_PROCESSING_MS = 5 * 60 * 1000;
  const reminderPoll = setInterval(async () => {
    const due = app.reminderService.claimDue(REMINDER_BATCH_SIZE, REMINDER_STALE_PROCESSING_MS);
    for (const reminder of due) {
      try {
        let channelId = reminder.channel_id;
        try {
          const dm = await client.users.createDM(reminder.discord_user_id);
          channelId = dm.id;
        } catch {
          // DMs disabled — fall back to original channel
        }
        await client.messages.write(channelId, {
          content: `<@${reminder.discord_user_id}> ⏰ **Reminder:** ${reminder.message}`
        });
        app.reminderService.deleteById(reminder.id);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        app.reminderService.markFailed(reminder.id, errorMessage);
        logger.warn(
          { reminderId: reminder.id, attemptCount: reminder.attempt_count + 1, err },
          'Failed to deliver reminder'
        );
      }
    }
  }, REMINDER_POLL_MS);
  reminderPoll.unref();

  // Notification poll — process outbox in durable DM-first mode
  const NOTIFICATION_POLL_MS = 15_000;
  const NOTIFICATION_BATCH_SIZE = 25;
  const NOTIFICATION_STALE_PROCESSING_MS = 5 * 60 * 1000;
  const notificationPoll = setInterval(async () => {
    try {
      const summary = await app.notificationsDispatcher.processDue(client, {
        batchSize: NOTIFICATION_BATCH_SIZE,
        staleProcessingMs: NOTIFICATION_STALE_PROCESSING_MS
      });

      if (summary.claimed > 0) {
        logger.info({ summary }, 'Processed notification outbox batch');
      }
    } catch (err) {
      logger.error({ err }, 'Notification outbox poll failed');
    }
  }, NOTIFICATION_POLL_MS);
  notificationPoll.unref();

  // Daily challenge poll — post/repost challenges every 5 minutes
  const CHALLENGE_POLL_MS = 5 * 60 * 1000;
  const challengePoll = setInterval(async () => {
    try {
      const needed = app.challengeService
        .getGuildsNeedingPost()
        .filter((item: any) => app.economyScope.isEconomyGuild(item.challenge?.guildId));
      for (const { channelId, challenge, isNew } of needed) {
        try {
          const completionCount = app.challengeService.getCompletionCount(challenge.id);
          const embed = buildChallengeEmbed(
            challenge.promptText,
            challenge.rewardAmount,
            completionCount
          );
          const msg = await client.messages.write(channelId, embed as any);
          const messageId = (msg as any)?.id;
          if (messageId) {
            app.challengeService.markPosted(challenge.id, messageId);
          }
          logger.info(
            { guildId: challenge.guildId, challengeId: challenge.id, isNew },
            'Posted daily challenge'
          );
        } catch (err) {
          logger.warn({ err, channelId, challengeId: challenge.id }, 'Failed to post daily challenge');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Challenge poll failed');
    }
  }, CHALLENGE_POLL_MS);
  challengePoll.unref();

  // Weekly digest — post to configured channels on Fridays after 12:00 UTC
  const DIGEST_POLL_MS = 15 * 60 * 1000;
  const digestPoll = setInterval(async () => {
    try {
      const now = new Date();
      if (now.getUTCDay() !== 5 || now.getUTCHours() < 12) return;
      const today = now.toISOString().slice(0, 10);

      for (const { guildId, channelId, lastPosted } of app.guildSettingsService.listGuildsWithDigestChannel()) {
        if (lastPosted === today) continue;
        try {
          const digest = app.digestService.computeWeeklyDigest(guildId, now);
          const embed = buildDigestEmbed(digest);
          await client.messages.write(channelId, embed as any);
          app.guildSettingsService.setDigestLastPosted(guildId, today);
          logger.info({ guildId, channelId }, 'Posted weekly digest');
        } catch (err) {
          logger.warn({ err, guildId, channelId }, 'Failed to post weekly digest');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Digest poll failed');
    }
  }, DIGEST_POLL_MS);
  digestPoll.unref();

  // Daily stats snapshots — compute any missing UTC day (up to yesterday) every 10 minutes.
  // Bounded single-day queries on indexed columns; typically a few ms per day.
  const DAILY_STATS_POLL_MS = 10 * 60 * 1000;
  const runDailyStats = () => {
    try {
      const result = app.statsService.runDue(new Date());
      if (result.computed > 0) logger.info(result, 'Computed daily stats snapshots');
    } catch (err) {
      logger.error({ err }, 'Daily stats poll failed');
    }
  };
  const dailyStatsPoll = setInterval(runDailyStats, DAILY_STATS_POLL_MS);
  dailyStatsPoll.unref();
  setTimeout(runDailyStats, 60_000).unref();

  // Periodic heartbeat so we can tell from logs the process is alive
  const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
  const heartbeat = setInterval(() => {
    const mem = process.memoryUsage();
    const notifications = app.notificationsService.getOutboxHealth();
    logger.info(
      {
        uptimeSeconds: Math.round(process.uptime()),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        metrics: app.metrics.snapshot(),
        notifications
      },
      'Heartbeat'
    );
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  const shutdown = () => {
    logger.info('Shutting down bot process');
    clearInterval(heartbeat);
    clearInterval(reminderPoll);
    clearInterval(notificationPoll);
    clearInterval(challengePoll);
    clearInterval(digestPoll);
    clearInterval(dailyStatsPoll);
    app.close();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception — process will exit');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason);
  logger.error({ error }, 'Unhandled promise rejection');
});

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start HalalEconomyBot');
  process.exit(1);
});
