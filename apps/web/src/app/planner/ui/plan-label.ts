import { formatDate } from '@angular/common';
import type { Plan } from '@selah/planner-core';
import type { LocalDate } from '@selah/shared-types';
import { addDays } from '@selah/shared-utils';

/** A plan in words: Today, Tomorrow, Wed 4 Nov, Week of 2 Nov, November. */
export function planLabel(plan: Plan, today: LocalDate, locale: string): string {
  if (plan.grain === 'day') {
    if (plan.start === today) return $localize`:@@plan.today:Today`;
    if (plan.start === addDays(today, 1)) return $localize`:@@plan.tomorrow:Tomorrow`;
    return dayLabel(plan.start, locale);
  }
  if (plan.grain === 'week') return $localize`:@@plan.weekOf:Week of ${formatDate(plan.start, 'd MMM', locale)}:date:`;
  return formatDate(plan.start, 'MMMM', locale);
}

/** A day in short words: Wed 4 Nov. */
export function dayLabel(day: LocalDate, locale: string): string {
  return formatDate(day, 'EEE d MMM', locale);
}
