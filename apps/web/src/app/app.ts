import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { catchError, map, of } from 'rxjs';

@Component({
  imports: [RouterOutlet],
  selector: 'selah-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);

  // Placeholder until the real home screen (Phase 5).
  protected readonly apiStatus = toSignal(
    this.http.get<{ status: string; database: string }>('/api/v1/health').pipe(
      map((h) => `API ${h.status}, database ${h.database}`),
      catchError(() => of('API unreachable')),
    ),
    { initialValue: 'Checking API…' },
  );
}
