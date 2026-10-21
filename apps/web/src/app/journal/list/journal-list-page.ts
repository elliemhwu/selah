import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JournalApi } from '../data/journal-api';
import { excerptOf } from '../excerpt';
import { JournalHeader } from '../journal-header';

/** Every entry, newest first, and an empty page to start a new one (ADR 0030). */
@Component({
  selector: 'selah-journal-list-page',
  imports: [DatePipe, JournalHeader, RouterLink],
  templateUrl: './journal-list-page.html',
  styleUrl: './journal-list-page.scss',
})
export class JournalListPage {
  private readonly journalApi = inject(JournalApi);
  protected readonly journals = this.journalApi.list();

  protected readonly entries = computed(() =>
    (this.journals.hasValue() ? this.journals.value() : []).map((journal) => ({ ...journal, excerpt: excerptOf(journal.body) })),
  );
}

