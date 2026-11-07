import { Lang } from '../define';
import { shell } from './shell';
import { dashboard } from './dashboard';
import { shop } from './shop';
import { auth } from './auth';
import { server } from './server';
import { account } from './account';
import { ai } from './ai';
import { tools } from './tools';
import { admin } from './admin';

const AREAS = [shell, dashboard, shop, auth, server, account, ai, tools, admin];

/** Every area's texts merged into one table per language. */
export const MESSAGES: Record<Lang, Record<string, string>> = {
  en: Object.assign({}, ...AREAS.map((a) => a.en)),
  ro: Object.assign({}, ...AREAS.map((a) => a.ro)),
  hu: Object.assign({}, ...AREAS.map((a) => a.hu)),
};
