import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from '../app.routes';
import type { DeviceSnapshot } from '../data/device-storage';
import { deviceData, storedJournal, storedMoment } from '../data/testing';
import { excerptOf } from './excerpt';

describe('Journal pages', () => {
  async function open(url: string, seed: Partial<DeviceSnapshot> = {}) {
    TestBed.configureTestingModule({ providers: [provideRouter(appRoutes), ...deviceData(seed).providers] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { el: harness.routeNativeElement as HTMLElement, url: () => TestBed.inject(Router).url };
  }

  it('lists entries newest first, each opening its page', async () => {
    const { el } = await open('/journal', {
      journals: [
        storedJournal('old', { writtenAt: '2026-09-01T12:00:00.000Z', body: '\n\nAn old night.' }),
        storedJournal('new', { writtenAt: '2026-10-20T12:00:00.000Z', body: 'A new morning.\nMore.' }),
        storedJournal('gone', { deletedAt: '2026-10-21T00:00:00.000Z' }),
      ],
    });
    const entries = [...el.querySelectorAll<HTMLAnchorElement>('.entry')];
    expect(entries.map((e) => e.getAttribute('href'))).toEqual(['/journal/new', '/journal/old']);
    expect(entries.map((e) => e.querySelector('.entry-excerpt')?.textContent?.trim())).toEqual(['A new morning.', 'An old night.']);
    expect(el.querySelector('.new-entry')?.getAttribute('href')).toBe('/journal/new');
  });

  it('starts with an empty journal', async () => {
    const { el } = await open('/journal');
    expect(el.textContent).toContain('No entries yet.');
  });

  it('opens a new page at /journal/new and Life at /journal/life', async () => {
    expect((await open('/journal/new')).el.querySelector('#diary-sheet')).not.toBeNull();
    TestBed.resetTestingModule();
    const life = await open('/journal/life', { moments: [storedMoment('m1', { title: 'Moving day' })] });
    expect(life.el.textContent).toContain('Moving day');
    expect(life.el.querySelector('.views a.active')?.textContent?.trim()).toBe('Life');
  });

  it('starts a new moment from Life', async () => {
    const life = await open('/journal/life');
    expect(life.el.querySelector('.new-moment')?.getAttribute('href')).toBe('/journal/life/moments/new');
    TestBed.resetTestingModule();
    const blank = await open('/journal/life/moments/new');
    expect(blank.el.querySelector('#moment-name')).not.toBeNull();
    TestBed.resetTestingModule();
    const form = await open('/journal/life/moments/m1/journal', { moments: [storedMoment('m1')] });
    expect(form.el.textContent).toContain('Write a new entry');
  });

  it('is an entry on the Selah home page', async () => {
    const { el } = await open('/');
    expect([...el.querySelectorAll('.module')].map((m) => m.getAttribute('href'))).toEqual(['/finance', '/journal']);
  });
});

describe('excerptOf', () => {
  it('takes the first line with words, shortened', () => {
    expect(excerptOf('\n  Dear Diary,  \nmore')).toBe('Dear Diary,');
    expect(excerptOf('x'.repeat(200))).toHaveLength(90);
    expect(excerptOf('   ')).toBe('');
  });
});
