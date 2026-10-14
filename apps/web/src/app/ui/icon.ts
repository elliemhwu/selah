import { Component, computed, input } from '@angular/core';

// Thin stroke icons for the ledger look (ADR 0021). Add a path here to add one.
const PATHS = {
  home: 'M3 10l8-6.5L19 10v8.5H3z',
  records: 'M5 3h12v16H5zM8 8h6M8 12h6',
  budget: 'M11 3a8 8 0 1 0 8 8h-8zM14 3.5V8h4.5',
  review: 'M3 18h16M6 15V9M11 15V5M16 15v-4',
  accounts: 'M3 8l8-4 8 4M5 9v7M9 9v7M13 9v7M17 9v7M3 18h16',
  add: 'M11 4v14M4 11h14',
  check: 'M5.5 11.3l3.5 3.5 7.5-8',
  tools: 'M14 4l4 4-9 9H5v-4zM12 6l4 4',
} as const;

export type IconName = keyof typeof PATHS;

/** An icon that takes the text colour. Decorative unless given a label. */
@Component({
  selector: 'selah-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="weight()"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.aria-label]="label()"
      [attr.role]="label() ? 'img' : null"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(22);
  readonly weight = input(1.5);
  readonly label = input<string | null>(null);
  protected readonly path = computed(() => PATHS[this.name()]);
}
