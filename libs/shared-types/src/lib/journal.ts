// Journal value sets shared by web, api and journal-core. They mirror the
// CHECK constraints in db/migrations; change both together.

/** How sure a journal's date is: imported entries often have a guessed one. */
export const DATE_PRECISIONS = ['day', 'month', 'season', 'year'] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];
