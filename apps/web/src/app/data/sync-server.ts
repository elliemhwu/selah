import { InjectionToken } from '@angular/core';
import type { ApiSchemas } from '@selah/api-client';

// The sync server's API (ADR 0028). Only sync talks to the server; screens
// read the device (ADR 0025).

export interface SyncResponse {
  status: number;
  body: unknown;
}

/** Why a sync stopped; everything stays queued for next time. */
export class SyncError extends Error {
  override name = 'SyncError';
  constructor(
    readonly reason: 'offline' | 'unauthorized' | 'server',
    message: string,
  ) {
    super(message);
  }
}

export interface SyncServer {
  /**
   * Sends one request under `/api/v1/`. Resolves with 2xx and 4xx responses
   * other than 401; throws SyncError when the sync can't go on.
   */
  send(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<SyncResponse>;
}

/** Opens a server for an address and access token; tests provide a fake. */
export const SYNC_SERVER = new InjectionToken<(server: string, token: string) => SyncServer>('SYNC_SERVER', {
  providedIn: 'root',
  factory: () => (server, token) => new HttpSyncServer(server, token),
});

export class HttpSyncServer implements SyncServer {
  constructor(
    private readonly server: string,
    private readonly token: string,
  ) {}

  async send(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<SyncResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.server}/api/v1/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new SyncError('offline', $localize`:@@sync.offline:Can't reach the sync server. Check the address and your connection.`);
    }
    if (response.status === 401) {
      throw new SyncError('unauthorized', $localize`:@@sync.unauthorized:The server didn't accept the access token.`);
    }
    if (response.status >= 500) {
      throw new SyncError('server', $localize`:@@sync.serverError:The sync server had a problem. Selah will try again later.`);
    }
    const text = await response.text();
    return { status: response.status, body: text ? safeJson(text) : null };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The server's reason for refusing a change, from its Problem Details (ADR 0017). */
export function refusalMessage(response: SyncResponse): string {
  const problem = response.body as Partial<ApiSchemas['ProblemDetailsDto']> | null;
  const fields = Object.values((problem?.errors as Record<string, string[]> | undefined) ?? {}).flat();
  const detail = problem?.detail ?? problem?.title;
  return [detail, ...fields].filter(Boolean).join(' ') || $localize`:@@sync.refused:The server refused this change.`;
}

/** Trims spaces and trailing slashes from a server address the user typed. */
export function normalizeServer(address: string): string {
  return address.trim().replace(/\/+$/, '');
}
