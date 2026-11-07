export type Lang = 'en' | 'ro' | 'hu';
export const LANGS: Lang[] = ['en', 'ro', 'hu'];

/**
 * One area's texts in all three languages. English is the source; Romanian and Hungarian must have exactly the same
 * keys, so a missing translation is a build error instead of a blank on the page.
 *
 * Placeholders are written {name}. Counted texts use the CLDR plural categories as key suffixes: "items.one" and
 * "items.other" (Romanian also has "items.few": 2–19 → "2 produse", 20+ → "20 de produse").
 */
export function defineMessages<T extends Record<string, string>>(m: { en: T; ro: Translation<T>; hu: Translation<T> }) {
  return m;
}

/** Same keys as English, plus the extra "few" plural forms Romanian needs. */
export type Translation<T> = Record<keyof T, string> & { [few: `${string}.few`]: string };
