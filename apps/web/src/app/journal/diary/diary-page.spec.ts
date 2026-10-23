import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { DeviceSnapshot } from '../../data/device-storage';
import { deviceData, flushSaves, settle, storedComment, storedGodNote, storedJournal, storedMoment } from '../../data/testing';
import { Toast } from '../../ui/toast';
import { AUTOSAVE_MS, DiaryPage } from './diary-page';
import { memoPlacement } from './memo-layout';

describe('DiaryPage', () => {
  let replaceState: ReturnType<typeof vi.fn>;

  async function render(id?: string, seed: Partial<DeviceSnapshot> = {}, query: Record<string, string> = {}) {
    replaceState = vi.fn();
    const device = deviceData(seed);
    TestBed.configureTestingModule({
      imports: [DiaryPage],
      providers: [
        provideRouter([]),
        ...device.providers,
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}), queryParamMap: convertToParamMap(query) } } },
        { provide: Location, useValue: { replaceState, back: vi.fn(), getState: () => null } },
        { provide: Toast, useValue: { show: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DiaryPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const sheet = el.querySelector<HTMLTextAreaElement>('#diary-sheet')!;
    const type = (text: string) => {
      sheet.value = text;
      sheet.dispatchEvent(new Event('input'));
    };
    const leaveSheet = async () => {
      sheet.dispatchEvent(new Event('blur'));
      await flushSaves();
      await settle(fixture);
    };
    return { fixture, el, sheet, type, leaveSheet, storage: device.storage };
  }

  afterEach(() => vi.useRealTimers());

  it('starts as an empty page that saves itself after a pause, then takes its own address', async () => {
    vi.useFakeTimers();
    const { type, storage, el } = await render();
    expect(el.querySelector<HTMLButtonElement>('.stick-comment')?.disabled).toBe(true);

    type('Dear Diary,\ntoday was long.');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    expect(storage.snapshot().journals).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    const [journal] = storage.snapshot().journals;
    expect(journal).toMatchObject({ body: 'Dear Diary,\ntoday was long.', datePrecision: 'day', momentId: null, deletedAt: null });
    expect(replaceState).toHaveBeenCalledWith(`/journal/${journal.id}`);
  });

  it('never saves a page left empty', async () => {
    const { type, leaveSheet, storage } = await render();
    type('   ');
    await leaveSheet();
    expect(storage.snapshot().journals).toEqual([]);
  });

  it('keeps the same id and date as it goes on saving', async () => {
    const { type, leaveSheet, storage } = await render();
    type('First words');
    await leaveSheet();
    const [first] = storage.snapshot().journals;
    type('First words, then more');
    await leaveSheet();
    expect(storage.snapshot().journals).toEqual([{ ...first, body: 'First words, then more', updatedAt: expect.any(String) }]);
  });

  it('starts a page for a moment, linked once it has words, with back going to the moment', async () => {
    const { el, type, leaveSheet, storage } = await render(undefined, { moments: [storedMoment('m1')] }, { moment: 'm1' });
    expect(el.querySelector('.back')?.getAttribute('href')).toBe('/journal/life/moments/m1');
    type('About that day.');
    await leaveSheet();
    expect(storage.snapshot().journals).toEqual([expect.objectContaining({ body: 'About that day.', momentId: 'm1' })]);
  });

  it('starts a plain page when the moment it was started from is gone', async () => {
    const { type, leaveSheet, storage } = await render(undefined, { moments: [storedMoment('m1', { deletedAt: '2026-10-22T00:00:00.000Z' })] }, { moment: 'm1' });
    type('Still here.');
    await leaveSheet();
    expect(storage.snapshot().journals).toEqual([expect.objectContaining({ momentId: null })]);
  });

  it('shows an entry with its memos: the moment first, then replies by when they were written', async () => {
    const { el, sheet } = await render('j1', {
      moments: [storedMoment('m1', { title: 'Moving day', summary: 'Boxes everywhere.' })],
      journals: [storedJournal('j1', { momentId: 'm1', body: 'So tired.' })],
      comments: [storedComment('c1', { journalId: 'j1', writtenAt: '2026-11-03T10:00:00.000Z', body: 'It got better.' })],
      godNotes: [storedGodNote('g1', 'j1', { writtenAt: '2026-10-22T10:00:00.000Z', verseRef: 'Matthew 11:28' })],
    });
    expect(sheet.value).toBe('So tired.');
    const memos = [...el.querySelectorAll<HTMLAnchorElement>('.memo')];
    expect(memos.map((m) => m.className.match(/memo-(\S+)/)?.[1])).toEqual(['moment', 'god-note', 'comment']);
    expect(memos[0].getAttribute('href')).toBe('/journal/life/moments/m1');
    expect(memos[0].textContent).toContain('Moving day');
    expect(memos[1].querySelector('.verse')?.textContent).toBe('Matthew 11:28');
    expect(memos[2].querySelector('.memo-label')?.textContent?.trim()).toBe('Replied by Ellie · 2026.11');
    expect(memos[2].getAttribute('href')).toBe('/journal/j1/comment/c1');
  });

  it('places each memo from its id, the same on every render', async () => {
    const { el } = await render('j1', { journals: [storedJournal('j1')], comments: [storedComment('c1', { journalId: 'j1' })] });
    const memo = el.querySelector<HTMLElement>('.memo')!;
    const place = memoPlacement('c1');
    expect(memo.style.transform).toBe(`rotate(${place.tilt}deg)`);
    expect(memo.classList.contains('right')).toBe(place.side === 'right');
  });

  it('opens a memo form from the memo bar once the entry is saved', async () => {
    const { el } = await render('j1', { journals: [storedJournal('j1')] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('.stick-god-note')!.click();
    await flushSaves();
    expect(navigate).toHaveBeenCalledWith(['/journal', 'j1', 'god-note']);
  });

  it('deletes the entry and its memos after a second tap', async () => {
    const { el, fixture, storage } = await render('j1', {
      journals: [storedJournal('j1')],
      comments: [storedComment('c1', { journalId: 'j1' })],
    });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const button = () => el.querySelector<HTMLButtonElement>('.danger button')!;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again');
    button().click();
    await flushSaves();
    const after = storage.snapshot();
    expect(after.journals[0].deletedAt).not.toBeNull();
    expect(after.comments[0].deletedAt).not.toBeNull();
  });

  it("says when the entry isn't there", async () => {
    const { el } = await render('nope');
    expect(el.textContent).toContain("This entry isn't in the journal.");
  });
});
