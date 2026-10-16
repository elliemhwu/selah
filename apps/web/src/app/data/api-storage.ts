import type { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { DeviceChanges, DeviceSnapshot, DeviceStorage } from './device-storage';

const STORE_URL = '/api/v1/store';

/**
 * The API build's storage (ADR 0029): the same rows as IndexedDB, kept in
 * Postgres through the API's row store. Errors are HttpErrorResponses, which
 * `problemOf` explains (a 0 status means the server can't be reached).
 */
export class ApiStorage implements DeviceStorage {
  constructor(private readonly http: HttpClient) {}

  load(): Promise<DeviceSnapshot> {
    return firstValueFrom(this.http.get<DeviceSnapshot>(STORE_URL));
  }

  async save(changes: DeviceChanges): Promise<void> {
    await firstValueFrom(this.http.patch(STORE_URL, changes));
  }

  async replace(snapshot: DeviceSnapshot): Promise<void> {
    await firstValueFrom(this.http.put(STORE_URL, snapshot));
  }

  /** Other tabs' changes show after a reload; the server doesn't push them. */
  watch(): () => void {
    return () => undefined;
  }
}
