import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
export const routes: Routes = [
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/register/register.component').then(m => m.RegisterComponent) },
  { path: 'account', canActivate: [authGuard], loadComponent: () => import('./features/account/account.component').then(m => m.AccountComponent) },
  { path: 'tools/csv-cleaner', loadComponent: () => import('./features/csv-cleaner/csv-cleaner.component').then(m => m.CsvCleanerComponent) },
  { path: 'tools/screenshot-beautifier', loadComponent: () => import('./features/screenshot-beautifier/screenshot-beautifier.component').then(m => m.ScreenshotBeautifierComponent) },
  { path: 'tools/image-resizer', loadComponent: () => import('./features/image-resizer/image-resizer.component').then(m => m.ImageResizerComponent) },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' }, { path: '**', redirectTo: 'dashboard' }
];
