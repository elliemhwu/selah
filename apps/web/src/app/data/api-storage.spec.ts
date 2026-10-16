import { HttpClient, HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { problemOf } from '../core/problem';
import { ApiStorage } from './api-storage';
import { EMPTY_SNAPSHOT } from './device-storage';
import { storedAccount } from './testing';

// ApiStorage is the HTTP layer itself, so its tests stub HTTP; screens never do.
describe('ApiStorage', () => {
  let storage: ApiStorage;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    storage = new ApiStorage(TestBed.inject(HttpClient));
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads every row from the row store', async () => {
    const loaded = storage.load();
    const snapshot = { ...EMPTY_SNAPSHOT, accounts: [storedAccount('cash')] };
    http.expectOne({ method: 'GET', url: '/api/v1/store' }).flush(snapshot);
    expect(await loaded).toEqual(snapshot);
  });

  it('saves changes with PATCH and replaces everything with PUT', async () => {
    const changes = { accounts: [storedAccount('cash')] };
    const saved = storage.save(changes);
    const patch = http.expectOne({ method: 'PATCH', url: '/api/v1/store' });
    expect(patch.request.body).toEqual(changes);
    patch.flush(null, { status: 204, statusText: 'No Content' });
    await saved;

    const replaced = storage.replace(EMPTY_SNAPSHOT);
    http.expectOne({ method: 'PUT', url: '/api/v1/store' }).flush(null, { status: 204, statusText: 'No Content' });
    await replaced;
  });

  it('fails with the Problem Details the screens explain', async () => {
    const saved = storage.save({ accounts: [storedAccount('cash')] });
    http
      .expectOne('/api/v1/store')
      .flush(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'A row conflicts with one already stored.' },
        { status: 409, statusText: 'Conflict' },
      );
    const error = await saved.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(problemOf(error).message).toBe('A row conflicts with one already stored.');
  });
});
