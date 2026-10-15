import { computed, type Signal } from '@angular/core';
import type { DeviceStore } from './device-store';

/** Returned by a resource's calculation when it has nothing to ask for yet. */
export const IDLE = Symbol('idle');

export type DeviceResourceStatus = 'idle' | 'loading' | 'resolved' | 'error';

/**
 * Data calculated from the device store, shaped like Angular's resources so
 * screens read it the same way (`value`, `hasValue`, `status`, `error`). It
 * follows the store, so it is never stale and `reload` has nothing to do.
 */
export interface DeviceResource<T> {
  /** Throws while the resource is in error, like Angular's resources. */
  readonly value: Signal<T>;
  /** Narrows `value` like Angular's `hasValue()`. */
  hasValue(): this is DeviceResource<Exclude<T, undefined>>;
  readonly status: Signal<DeviceResourceStatus>;
  readonly error: Signal<unknown>;
  readonly isLoading: Signal<boolean>;
  reload(): boolean;
}

type Outcome<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'resolved'; value: T }
  | { status: 'error'; error: unknown };

/**
 * A resource calculated by `compute` from the store's data. `compute` may
 * throw (for example NotFoundError), which puts the resource in error, or
 * return IDLE when there is nothing to calculate yet.
 */
export function deviceResource<T>(store: DeviceStore, compute: () => T | typeof IDLE): DeviceResource<T | undefined>;
export function deviceResource<T>(
  store: DeviceStore,
  compute: () => T | typeof IDLE,
  options: { defaultValue: T },
): DeviceResource<T>;
export function deviceResource<T>(
  store: DeviceStore,
  compute: () => T | typeof IDLE,
  options?: { defaultValue: T },
): DeviceResource<T | undefined> {
  const outcome = computed<Outcome<T>>(() => {
    if (store.status() === 'error') return { status: 'error', error: new Error("Couldn't open the data on this device.") };
    if (!store.ready()) return { status: 'loading' };
    try {
      const value = compute();
      return value === IDLE ? { status: 'idle' } : { status: 'resolved', value };
    } catch (error) {
      return { status: 'error', error };
    }
  });
  const hasDefault = options !== undefined;

  const resource: DeviceResource<T | undefined> = {
    value: computed(() => {
      const current = outcome();
      if (current.status === 'resolved') return current.value;
      if (current.status === 'error') throw current.error;
      return options?.defaultValue;
    }),
    // Like Angular, a default value counts as a value until there is an error.
    hasValue(): this is DeviceResource<Exclude<T, undefined>> {
      const status = outcome().status;
      return status === 'resolved' || (hasDefault && status !== 'error');
    },
    status: computed(() => outcome().status),
    error: computed(() => {
      const current = outcome();
      return current.status === 'error' ? current.error : undefined;
    }),
    isLoading: computed(() => outcome().status === 'loading'),
    reload: () => false,
  };
  return resource;
}
