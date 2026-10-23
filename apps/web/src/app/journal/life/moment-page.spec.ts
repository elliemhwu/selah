import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { DeviceSnapshot } from '../../data/device-storage';
import { deviceData, flushSaves, settle, storedJournal, storedMoment } from '../../data/testing';
import { Toast } from '../../ui/toast';
import { AUTOSAVE_MS } from '../autosave';
import { memoPlacement } from '../diary/memo-layout';
import { MomentPage } from './moment-page';

describe('MomentPage', () => {
  let replaceState: ReturnType<typeof vi.fn>;

  async function render(id?: string, seed: Partial<DeviceSnapshot> = {}) {
    replaceState = vi.fn();
    const device = deviceData(seed);
    TestBed.configureTestingModule({
      imports: [MomentPage],
      providers: [
        provideRouter([]),
        ...device.providers,
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
        { provide: Location, useValue: { replaceState, back: vi.fn(), getState: () => null } },
        { provide: Toast, useValue: { show: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(MomentPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const field = (selector: string) => el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const type = (selector: string, text: string) => {
      field(selector).value = text;
      field(selector).dispatchEvent(new Event('input'));
    };
    const leave = async () => {
      el.querySelector('form')!.dispatchEvent(new Event('focusout'));
      await flushSaves();
      await settle(fixture);
    };
    return { fixture, el, field, type, leave, storage: device.storage };
  }

  afterEach(() => vi.useRealTimers());

  it('starts blank, dated today, and is stored once its title has words, then takes its own address', async () => {
    vi.useFakeTimers();
    const { el, field, type, storage } = await render();
    expect(field('#moment-date').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(el.querySelector<HTMLButtonElement>('.stick-journal')?.disabled).toBe(true);

    type('#moment-summary', 'Boxes everywhere.');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    expect(storage.snapshot().moments).toEqual([]);

    type('#moment-name', 'Moving day');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    const [moment] = storage.snapshot().moments;
    expect(moment).toMatchObject({ title: 'Moving day', summary: 'Boxes everywhere.', deletedAt: null });
    expect(replaceState).toHaveBeenCalledWith(`/journal/life/moments/${moment.id}`);
  });

  it('edits a stored moment in place, and keeps it while its title is blank', async () => {
    const { field, type, leave, storage, el } = await render('m1', { moments: [storedMoment('m1', { title: 'Moving day' })] });
    expect(field('#moment-name').value).toBe('Moving day');
    type('#moment-name', '');
    await leave();
    expect(storage.snapshot().moments[0].title).toBe('Moving day');
    expect(el.querySelector('.save-status')?.textContent).toContain('Give it a title');
    type('#moment-name', 'Moving house');
    await leave();
    expect(storage.snapshot().moments).toEqual([expect.objectContaining({ id: 'm1', title: 'Moving house' })]);
  });

  it('shows its journals as memos, oldest first, placed from their ids', async () => {
    const { el } = await render('m1', {
      moments: [storedMoment('m1')],
      journals: [
        storedJournal('late', { momentId: 'm1', writtenAt: '2026-10-21T12:00:00.000Z', body: 'Later.' }),
        storedJournal('early', { momentId: 'm1', writtenAt: '2026-10-20T12:00:00.000Z', body: '\nThe night before.' }),
        storedJournal('other'),
      ],
    });
    const memos = [...el.querySelectorAll<HTMLAnchorElement>('.memo-journal')];
    expect(memos.map((m) => m.getAttribute('href'))).toEqual(['/journal/early', '/journal/late']);
    expect(memos[0].querySelector('.memo-text')?.textContent?.trim()).toBe('The night before.');
    expect(memos[0].style.transform).toBe(`rotate(${memoPlacement('early').tilt}deg)`);
  });

  it('opens the journal memo form once the moment is stored', async () => {
    const { el } = await render('m1', { moments: [storedMoment('m1')] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('.stick-journal')!.click();
    await flushSaves();
    expect(navigate).toHaveBeenCalledWith(['/journal/life/moments', 'm1', 'journal']);
  });

  it('deletes the moment after a second tap; its journals stay, unlinked', async () => {
    const { el, fixture, storage } = await render('m1', { moments: [storedMoment('m1')], journals: [storedJournal('j1', { momentId: 'm1' })] });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const button = () => el.querySelector<HTMLButtonElement>('.danger button')!;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again');
    button().click();
    await flushSaves();
    const after = storage.snapshot();
    expect(after.moments[0].deletedAt).not.toBeNull();
    expect(after.journals[0]).toMatchObject({ momentId: null, deletedAt: null });
  });

  it("says when the moment isn't there", async () => {
    const { el } = await render('nope');
    expect(el.textContent).toContain("This moment isn't in Life.");
  });
});
