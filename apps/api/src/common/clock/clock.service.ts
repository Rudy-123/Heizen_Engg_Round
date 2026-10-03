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
@Injectable()
export class ClockService {
  readonly kitchenTimeZone: string;

  constructor(config: ConfigService<Env, true>) {
    this.kitchenTimeZone = config.get('KITCHEN_TIME_ZONE', { infer: true });
  }

  now(): Date {
    return new Date();
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
