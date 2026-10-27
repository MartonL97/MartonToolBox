import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * A 401 almost always means the JWT expired (tokens are short-lived). Without
 * this, every page that calls the API quietly fails with a generic error and
 * no indication the fix is just "log in again".
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((err) => {
      if (err?.status === 401 && auth.isAuthenticated()) {
        auth.logout();
        router.navigate(['/login'], { queryParams: { expired: '1' } });
      }
      return throwError(() => err);
    }),
  );
};
