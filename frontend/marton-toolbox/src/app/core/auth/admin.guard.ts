import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Lets admins through to /admin; everyone else goes to the dashboard. The API enforces the same rule. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.refreshProfile();
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/dashboard']);
};
