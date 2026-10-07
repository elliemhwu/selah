import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FormNavigation } from './form-navigation';
import { Toast } from './toast';

describe('FormNavigation', () => {
  let back: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let show: ReturnType<typeof vi.fn>;

  function setup(navigationId: number | undefined) {
    back = vi.fn();
    navigateByUrl = vi.fn(() => Promise.resolve(true));
    show = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: Location, useValue: { back, getState: () => (navigationId ? { navigationId } : null) } },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: Toast, useValue: { show } },
      ],
    });
    return TestBed.inject(FormNavigation);
  }

  it('goes back when the form was opened from inside the app', () => {
    setup(3).leave('/accounts', 'Saved.');
    expect(back).toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('Saved.');
  });

  it('goes to the parent screen after a reload or a direct link', () => {
    setup(1).leave('/accounts');
    expect(back).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/accounts', { replaceUrl: true });
    expect(show).not.toHaveBeenCalled();
  });
});
