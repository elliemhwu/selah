import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TODAY } from '../core/today';
import { Icon, type IconName } from '../ui/icon';

interface ModuleEntry {
  path: string;
  icon: IconName;
  name: string;
  description: string;
}

/** Selah's home: an entry to each module, and the settings (ADR 0030). The Dashboard module will replace it. */
@Component({
  selector: 'selah-home',
  imports: [DatePipe, Icon, RouterLink],
  templateUrl: './selah-home-page.html',
  styleUrl: './selah-home-page.scss',
})
export class SelahHomePage {
  protected readonly today = signal(inject(TODAY)());

  protected readonly modules: ModuleEntry[] = [
    {
      path: '/finance',
      icon: 'budget',
      name: $localize`:@@selahHome.finance:Finance`,
      description: $localize`:@@selahHome.financeHint:Budget, spending and accounts`,
    },
    {
      path: '/journal',
      icon: 'journal',
      name: $localize`:@@selahHome.journal:Journal`,
      description: $localize`:@@selahHome.journalHint:Dear Diary, and what really happened`,
    },
    {
      path: '/planner',
      icon: 'calendar',
      name: $localize`:@@selahHome.planner:Planner`,
      description: $localize`:@@selahHome.plannerHint:Today, projects and the week ahead`,
    },
  ];
}
