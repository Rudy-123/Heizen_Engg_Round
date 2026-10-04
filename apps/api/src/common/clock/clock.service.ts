import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Env } from '../../config/env.js';

/**
 * The only place the API reads the current time.
 *
 * Business code asks the clock instead of calling `new Date()`, so tests can freeze time
 * and the demo simulator can replay past days. "Today" is always the kitchen's calendar
 * date, never the server's or the browser's (spec §7, time zones).
 */
/** Set only inside ClockService.runAt: the moment the code running there should see. */
const simulatedNow = new AsyncLocalStorage<Date>();

@Injectable()
export class ClockService {
  readonly kitchenTimeZone: string;

  constructor(config: ConfigService<Env, true>) {
    this.kitchenTimeZone = config.get('KITCHEN_TIME_ZONE', { infer: true });
  }

  now(): Date {
    return simulatedNow.getStore() ?? new Date();
  }

  /**
   * Runs `work` as if the time were `at`: every clock read inside it - and in everything it
   * awaits - returns `at`. Only the demo simulation uses this, to replay a kitchen day with
   * realistic times. Requests running at the same moment are not affected: they see the
   * real time.
   */
  runAt<T>(at: Date, work: () => Promise<T>): Promise<T> {
    return simulatedNow.run(at, work);
  }

  /** The current moment, expressed in the kitchen's time zone. */
  kitchenNow(): DateTime {
    return DateTime.fromJSDate(this.now(), { zone: this.kitchenTimeZone });
  }

  /** Today's date in the kitchen, as YYYY-MM-DD. */
  kitchenToday(): string {
    const today = this.kitchenNow().toISODate();
    if (today === null) {
      throw new Error(`Could not compute today's date in zone ${this.kitchenTimeZone}`);
    }
    return today;
  }
}
