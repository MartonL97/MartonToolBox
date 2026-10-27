import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export const licenseGuard: CanActivateFn = async () => {
  const http = inject(HttpClient);
  const router = inject(Router);
  try {
    const res = await firstValueFrom(http.get<{ data: { license: unknown } }>('/api/account'));
    return res.data.license ? true : router.createUrlTree(['/billing']);
  } catch {
    return router.createUrlTree(['/billing']);
  }
};
