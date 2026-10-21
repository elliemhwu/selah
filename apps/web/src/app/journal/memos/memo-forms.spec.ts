import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { DeviceSnapshot } from '../../data/device-storage';
import { deviceData, flushSaves, settle, storedComment, storedJournal, storedMoment } from '../../data/testing';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { MemoFormPage } from './memo-form-page';
import { MomentFormPage } from './moment-form-page';

async function render<T>(
  component: Type<T>,
  params: Record<string, string>,
  data: Record<string, unknown>,
  seed: Partial<DeviceSnapshot>,
) {
  const leave = vi.fn();
  const device = deviceData(seed);
  TestBed.configureTestingModule({
    imports: [component],
    providers: [
      ...device.providers,
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params), data } } },
      { provide: FormNavigation, useValue: { leave } },
      { provide: Toast, useValue: { show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(component);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const submit = async () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await flushSaves();
  };
  return { fixture, el, submit, leave, storage: device.storage, page: fixture.componentInstance as unknown as { form: MemoFormPage['form'] } };
}

describe('MemoFormPage', () => {
  const seed = { journals: [storedJournal('j1')] };

  it('sticks a comment on the journal', async () => {
    const { page, submit, storage, leave } = await render(MemoFormPage, { id: 'j1' }, { memo: 'comment' }, seed);
    page.form.controls.body.setValue('  It was all right in the end. ');
    await submit();
    expect(storage.snapshot().comments).toEqual([
      expect.objectContaining({ journalId: 'j1', momentId: null, body: 'It was all right in the end.', deletedAt: null }),
    ]);
    expect(leave).toHaveBeenCalledWith('/journal/j1', 'Stuck on the page.');
  });

  it('sticks a god note with its verse', async () => {
    const { el, page, submit, storage } = await render(MemoFormPage, { id: 'j1' }, { memo: 'godNote' }, seed);
    expect(el.querySelector('#memo-verse')).not.toBeNull();
    page.form.setValue({ body: 'Come to me, and rest.', verseRef: ' Matthew 11:28 ' });
    await submit();
    expect(storage.snapshot().godNotes).toEqual([expect.objectContaining({ journalId: 'j1', verseRef: 'Matthew 11:28' })]);
  });

  it('refuses an empty memo', async () => {
    const { el, fixture, submit, storage } = await render(MemoFormPage, { id: 'j1' }, { memo: 'comment' }, seed);
    await submit();
    fixture.detectChanges();
    expect(storage.snapshot().comments).toEqual([]);
    expect(el.querySelector('.field-error')?.textContent).toBe('Write something first.');
  });

  it('edits a comment, keeping when it was first written', async () => {
    const comment = storedComment('c1', { journalId: 'j1', body: 'Old words' });
    const { page, submit, storage } = await render(MemoFormPage, { id: 'j1', memoId: 'c1' }, { memo: 'comment' }, { ...seed, comments: [comment] });
    expect(page.form.controls.body.value).toBe('Old words');
    page.form.controls.body.setValue('New words');
    await submit();
    expect(storage.snapshot().comments[0]).toMatchObject({ body: 'New words', writtenAt: comment.writtenAt });
  });
});

describe('MomentFormPage', () => {
  it('links an existing moment', async () => {
    const { el, storage, leave } = await render(MomentFormPage, { id: 'j1' }, {}, { journals: [storedJournal('j1')], moments: [storedMoment('m1', { title: 'Moving day' })] });
    const choice = [...el.querySelectorAll<HTMLButtonElement>('.choice')].find((b) => b.textContent?.includes('Moving day'))!;
    choice.click();
    await flushSaves();
    expect(storage.snapshot().journals[0].momentId).toBe('m1');
    expect(leave).toHaveBeenCalledWith('/journal/j1', 'Moment stuck on the page.');
  });

  it("creates a moment on the entry's day and links it, together", async () => {
    const { el, submit, storage } = await render(MomentFormPage, { id: 'j1' }, {}, { journals: [storedJournal('j1', { writtenAt: '2026-10-20T06:00:00.000Z' })] });
    const form = el.querySelector('form') as HTMLFormElement;
    const title = form.querySelector<HTMLInputElement>('#moment-name')!;
    expect(form.querySelector<HTMLInputElement>('#moment-date')!.value).toMatch(/^2026-10-2\d$/);
    title.value = 'First snow';
    title.dispatchEvent(new Event('input'));
    await submit();
    const after = storage.snapshot();
    expect(after.moments).toEqual([expect.objectContaining({ title: 'First snow', summary: null })]);
    expect(after.journals[0].momentId).toBe(after.moments[0].id);
  });

  it('takes the moment off the page', async () => {
    const { el, storage } = await render(
      MomentFormPage,
      { id: 'j1' },
      {},
      { journals: [storedJournal('j1', { momentId: 'm1' })], moments: [storedMoment('m1')] },
    );
    const unlink = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Take it off'))!;
    unlink.click();
    await flushSaves();
    expect(storage.snapshot().journals[0].momentId).toBeNull();
    expect(storage.snapshot().moments[0].deletedAt).toBeNull();
  });
});
