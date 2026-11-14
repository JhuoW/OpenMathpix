import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  FIRST_UPDATE_CHECK_DELAY_MS,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_TICK_MS,
  scheduleUpdateChecks,
  updateCheckDue,
} from '../src/main/update-schedule';

const DAY = UPDATE_CHECK_INTERVAL_MS;

test('an automatic check is due at most once a day, and only when switched on', () => {
  const now = Date.UTC(2026, 10, 14, 12);
  assert.equal(updateCheckDue(now, undefined, true), true, 'never checked');
  assert.equal(updateCheckDue(now, now - DAY + 60_000, true), false, 'checked within the day');
  assert.equal(updateCheckDue(now, now - DAY, true), true, 'a day has passed');
  assert.equal(updateCheckDue(now, undefined, false), false, 'switched off');
  assert.equal(updateCheckDue(now, now + 3 * DAY, true), true, 'clock set back');
});

/** A clock the test advances, driving node:test's mocked timers with it. */
function fakeClock(t: TestContext) {
  let time = Date.UTC(2026, 10, 14, 9);
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  return {
    now: () => time,
    async advance(ms: number) {
      time += ms;
      t.mock.timers.tick(ms);
      // Let the awaited check and its bookkeeping settle.
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

test('checks shortly after startup, then once a day while running, retrying failures', async (t) => {
  const clock = fakeClock(t);
  let last: number | undefined;
  const calls: number[] = [];
  let online = false;
  const schedule = scheduleUpdateChecks({
    enabled: () => true,
    lastCheck: () => last,
    record: (time) => {
      last = time;
    },
    check: async () => {
      calls.push(clock.now());
      return online;
    },
    now: clock.now,
  });

  await clock.advance(FIRST_UPDATE_CHECK_DELAY_MS - 1);
  assert.equal(calls.length, 0, 'not during startup');
  await clock.advance(1);
  assert.equal(calls.length, 1, 'shortly after startup');
  assert.equal(last, undefined, 'an offline attempt is not recorded');

  online = true;
  await clock.advance(UPDATE_CHECK_TICK_MS);
  assert.equal(calls.length, 2, 'retried at the next hourly look');
  assert.equal(last, clock.now());

  for (let hour = 0; hour < 23; hour++) await clock.advance(UPDATE_CHECK_TICK_MS);
  assert.equal(calls.length, 2, 'no further check within the day');
  await clock.advance(UPDATE_CHECK_TICK_MS);
  assert.equal(calls.length, 3, 'the next day');

  schedule.stop();
  await clock.advance(2 * DAY);
  assert.equal(calls.length, 3, 'stopped when the app quits');
});

test('a restart within the day does not check again; switching it on checks soon', async (t) => {
  const clock = fakeClock(t);
  let last: number | undefined = clock.now() - 60 * 60 * 1000;
  let enabled = false;
  let calls = 0;
  const schedule = scheduleUpdateChecks({
    enabled: () => enabled,
    lastCheck: () => last,
    record: (time) => {
      last = time;
    },
    check: async () => {
      calls++;
      return true;
    },
    now: clock.now,
  });
  await clock.advance(FIRST_UPDATE_CHECK_DELAY_MS);
  assert.equal(calls, 0, 'switched off');

  last = clock.now() - DAY;
  enabled = true;
  schedule.checkSoon();
  await clock.advance(5_000);
  assert.equal(calls, 1, 'switched on after a day without a check');

  schedule.checkSoon();
  await clock.advance(5_000);
  assert.equal(calls, 1, 'already checked today');
  schedule.stop();
});
