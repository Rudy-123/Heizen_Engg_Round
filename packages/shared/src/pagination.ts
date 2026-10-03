import { z } from 'zod';

/** ?page=&pageSize= on list endpoints. Lists are always paginated on the server (spec §7). */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

/** One page of a list, plus what the UI needs to show "1-25 of 240". */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
