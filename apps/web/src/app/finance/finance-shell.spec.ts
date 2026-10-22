import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FinanceShell } from './finance-shell';

@Component({ template: '' })
class Blank {}

describe('FinanceShell', () => {
  async function render(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'finance',
            component: FinanceShell,
            children: [
              { path: '', component: Blank },
              { path: 'records/new', component: Blank, data: { form: true } },
            ],
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  it("shows Finance's navigation, linking under /finance", async () => {
    const el = await render('/finance');
    const links = [...el.querySelectorAll('.bottom-nav a')];
    expect(links.map((l) => l.querySelector('.label')?.textContent?.trim())).toEqual(['Home', 'Records', 'Budget', 'Review', 'Accounts']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/finance',
      '/finance/records',
      '/finance/budget',
      '/finance/review',
      '/finance/accounts',
    ]);
    expect(links[0].getAttribute('aria-current')).toBe('page');
  });

  it('steps aside on a form route (ADR 0022)', async () => {
    const el = await render('/finance/records/new');
    expect(el.querySelector('.bottom-nav')).toBeNull();
  });
});
