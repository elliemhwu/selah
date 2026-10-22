import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { isNotFound } from '../../core/problem';
import { JournalApi } from '../data/journal-api';
import { JournalHeader } from '../journal-header';
import { excerptOf } from '../excerpt';

/** One moment in Life, with the entries that belong to it. A placeholder for the Life canvas. */
@Component({
  selector: 'selah-moment-page',
  imports: [DatePipe, JournalHeader, RouterLink],
  templateUrl: './moment-page.html',
  styleUrl: './life.scss',
})
export class MomentPage {
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? undefined;
  protected readonly page = inject(JournalApi).moment(() => this.id);
  protected readonly view = computed(() => (this.page.hasValue() ? this.page.value() : undefined));
  protected readonly notFound = computed(() => isNotFound(this.page.error()));
  protected readonly excerptOf = excerptOf;
}
