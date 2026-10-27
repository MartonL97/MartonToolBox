import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { licenseGuard } from './core/auth/license.guard';
import { adminGuard } from './core/auth/admin.guard';
export const routes: Routes = [
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
  { path: 'login', loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent) },
  {
    path: 'confirm-email',
    loadComponent: () => import('./features/confirm-email/confirm-email.component').then((m) => m.ConfirmEmailComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/password/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/password/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  { path: 'register', loadComponent: () => import('./features/register/register.component').then((m) => m.RegisterComponent) },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/account.component').then((m) => m.AccountComponent),
  },
  {
    path: 'billing',
    canActivate: [authGuard],
    loadComponent: () => import('./features/billing/billing.component').then((m) => m.BillingComponent),
  },
  {
    path: 'checkout/result',
    canActivate: [authGuard],
    loadComponent: () => import('./features/checkout-result/checkout-result.component').then((m) => m.CheckoutResultComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
  },
  {
    path: 'tools/csv-cleaner',
    canActivate: [authGuard, licenseGuard],
    loadComponent: () => import('./features/csv-cleaner/csv-cleaner.component').then((m) => m.CsvCleanerComponent),
  },
  {
    path: 'tools/screenshot-beautifier',
    canActivate: [authGuard, licenseGuard],
    loadComponent: () =>
      import('./features/screenshot-beautifier/screenshot-beautifier.component').then((m) => m.ScreenshotBeautifierComponent),
  },
  {
    path: 'tools/image-resizer',
    canActivate: [authGuard, licenseGuard],
    loadComponent: () => import('./features/image-resizer/image-resizer.component').then((m) => m.ImageResizerComponent),
  },
  {
    path: 'tools/pdf-toolkit',
    canActivate: [authGuard, licenseGuard],
    loadComponent: () => import('./features/pdf-toolkit/pdf-toolkit.component').then((m) => m.PdfToolkitComponent),
  },
  {
    path: 'tools/document-converter',
    canActivate: [authGuard, licenseGuard],
    loadComponent: () => import('./features/document-converter/document-converter.component').then((m) => m.DocumentConverterComponent),
  },
  { path: 'shop', loadComponent: () => import('./features/shop/shop.component').then((m) => m.ShopComponent) },
  { path: 'shop/cart', loadComponent: () => import('./features/shop/cart.component').then((m) => m.CartComponent) },
  {
    path: 'shop/orders',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shop/shop-orders.component').then((m) => m.ShopOrdersComponent),
  },
  {
    path: 'shop/orders/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shop/shop-order.component').then((m) => m.ShopOrderComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
