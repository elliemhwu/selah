// Calendar checks for request dates the format validators can't catch
// (2026-02-30). Shared with the device through finance-core (ADR 0025).

export { assertDateRange, isRealDate } from '@selah/finance-core';
