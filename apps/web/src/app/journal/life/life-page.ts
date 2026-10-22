import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JournalApi } from '../data/journal-api';
import { JournalHeader } from '../journal-header';

/**
 * Life (docs/selah-journal-framework.md): what actually happened, with the
 * moment as the canvas. A placeholder for now: it lists the moments.
 */
@Component({
  selector: 'selah-life-page',
  imports: [DatePipe, JournalHeader, RouterLink],
  templateUrl: './life-page.html',
  styleUrl: './life.scss',
})
export class LifePage {
  protected readonly moments = inject(JournalApi).moments();
}
