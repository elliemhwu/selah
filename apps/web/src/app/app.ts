import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { ApiSchemas } from '@selah/api-client';

@Component({
  imports: [RouterOutlet],
  selector: 'selah-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Placeholder until the real home screen (Phase 5).
  private readonly health = httpResource<ApiSchemas['HealthDto']>(
    () => '/api/v1/health',
  );

  protected readonly apiStatus = computed(() => {
    if (this.health.isLoading()) return 'Checking API…';
    if (this.health.error()) return 'API unreachable';
    const health = this.health.value();
    return health ? `API ${health.status}, database ${health.database}` : '';
  });
}
