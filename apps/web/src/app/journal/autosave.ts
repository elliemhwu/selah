import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';

/** How long typing pauses before a page saves itself. */
export const AUTOSAVE_MS = 700;

/**
 * Saves a Journal page as it is written (ADR 0030): after a short pause, when
 * the page is left, and when the app goes to the background. Call it in an
 * injection context.
 */
export class Autosave<T> {
  /** Changed but not yet saved. */
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Saves run one after another, in the order they were made. */
  private writing: Promise<void> = Promise.resolve();

  /**
   * @param take what's on the page, taken when a save starts, or null when it
   *   can't be stored yet (a new page with no words): the change is dropped.
   * @param write stores it and resolves to whether it did; on false the
   *   change waits for the next one.
   */
  constructor(
    private readonly take: () => T | null,
    private readonly write: (value: T) => Promise<boolean>,
  ) {
    const document = inject(DOCUMENT);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void this.flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onHidden);
      void this.flush();
    });
  }

  /** Whether a change is waiting to be saved. */
  get pending(): boolean {
    return this.dirty;
  }

  changed(): void {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), AUTOSAVE_MS);
  }

  /** Saves now what's waiting. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.dirty) return this.writing;
    this.dirty = false;
    const value = this.take();
    if (value === null) return this.writing;
    this.writing = this.writing.then(async () => {
      if (!(await this.write(value))) this.dirty = true;
    });
    return this.writing;
  }

  /** Drops what's waiting, e.g. before deleting the page, once the saves under way are done. */
  cancel(): Promise<void> {
    clearTimeout(this.timer);
    this.dirty = false;
    return this.writing;
  }
}
