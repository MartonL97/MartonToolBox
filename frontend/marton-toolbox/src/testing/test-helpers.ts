import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

/** Stands in for every page a component might navigate to, so navigation never fails in tests. */
@Component({ standalone: true, template: '' })
export class BlankPageComponent {}

export interface TestUser {
  id: string;
  email: string;
  displayName: string;
}

export const TEST_USER: TestUser = { id: 'u-1', email: 'maria@example.com', displayName: 'Maria Ionescu' };

/** Simulates a logged-in browser session (AuthService reads these on creation). */
export function logIn(user: TestUser = TEST_USER) {
  localStorage.setItem('mtb_token', 'test-token');
  localStorage.setItem('mtb_user', JSON.stringify(user));
}

export interface RenderOptions {
  providers?: unknown[];
  /** Start logged in as this user (default: logged out). */
  user?: TestUser;
}

/** Every test starts from a clean browser: no saved login, cart or form drafts. */
function configure(routes: Routes, { providers = [], user }: RenderOptions) {
  localStorage.clear();
  sessionStorage.clear();
  if (user) logIn(user);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([...routes, { path: '**', component: BlankPageComponent }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...(providers as never[]),
    ],
  });
}

export interface Rendered<T> {
  fixture: ComponentFixture<T>;
  component: T;
  el: HTMLElement;
  http: HttpTestingController;
}

/** Creates a component directly (for components that don't read route parameters). */
export function render<T>(component: Type<T>, options: RenderOptions = {}): Rendered<T> {
  configure([], options);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement, http: TestBed.inject(HttpTestingController) };
}

/** Navigates the real router to `url` (matched by `path`), so the component gets genuine route/query params. */
export async function renderAt<T>(component: Type<T>, path: string, url: string, options: RenderOptions = {}) {
  configure([{ path, component }], options);
  const harness = await RouterTestingHarness.create();
  // Untyped navigation so a component that redirects away (e.g. to /billing) doesn't fail the harness.
  const instance = (await harness.navigateByUrl(url)) as T;
  harness.detectChanges();
  return { harness, component: instance, el: harness.routeNativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

/** Answers every pending request to `url` (e.g. the profile fetch AuthService makes when logged in). */
export function flushAll(http: HttpTestingController, url: string, body: object) {
  http.match(url).forEach((req) => req.flush(body));
}

/** Lets awaited HTTP promises (firstValueFrom) resolve, then re-renders. */
export async function settle(fixture: { detectChanges(): void }, rounds = 3) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r));
  fixture.detectChanges();
}

/** Polls until `condition` holds (for real browser async work such as File.text()), then re-renders. */
export async function waitFor(condition: () => boolean, fixture?: { detectChanges(): void }, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
  fixture?.detectChanges();
}

export function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function click(el: Element | null | undefined) {
  (el as HTMLElement).click();
}

/** Types into an input the way a user would, so (input) handlers fire. */
export function type(input: Element | null | undefined, value: string) {
  const i = input as HTMLInputElement;
  i.value = value;
  i.dispatchEvent(new Event('input'));
}
