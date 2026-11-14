/** Settings the API sends for Sameday's locker map; null when the shop has none, which hides the easybox option. */
export interface EasyboxMapConfig {
  clientId: string;
  apiUsername: string;
  countryCode: string;
}

/** The easybox the buyer picked, as Sameday's map returns it. */
export interface Easybox {
  lockerId: number;
  name: string;
  address: string;
  city: string;
  county: string;
  postalCode: string;
}

interface LockerPluginInstance {
  open(): void;
  close(): void;
  subscribe(callback: (locker: Easybox) => void): void;
}
interface LockerPluginGlobal {
  init(options: object): void;
  reinitializePlugin(options: object): void;
  getInstance(): LockerPluginInstance;
}

const SDK_URL = 'https://cdn.sameday.ro/locker-plugin/lockerpluginsdk.js';
let sdk: Promise<LockerPluginGlobal> | null = null;
let initialised = false;
let onSelect: ((locker: Easybox) => void) | null = null;

/** Loads Sameday's script once, the first time the map is opened. */
function loadSdk(): Promise<LockerPluginGlobal> {
  const existing = (window as { LockerPlugin?: LockerPluginGlobal }).LockerPlugin;
  if (existing) return Promise.resolve(existing);
  sdk ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      const plugin = (window as { LockerPlugin?: LockerPluginGlobal }).LockerPlugin;
      if (plugin) resolve(plugin);
      else reject(new Error('Sameday LockerPlugin did not load.'));
    };
    script.onerror = () => {
      sdk = null; // allow another try
      script.remove();
      reject(new Error('Could not load the Sameday map.'));
    };
    document.body.appendChild(script);
  });
  return sdk;
}

/**
 * Opens Sameday's easybox map in its own popup and calls back with the locker the buyer picks. The plugin is a
 * singleton that keeps its subscribers, so it is subscribed once and forwards to the latest callback.
 */
export async function openEasyboxMap(
  config: EasyboxMapConfig,
  options: { lang: string; city?: string; lockerId?: number | null },
  select: (locker: Easybox) => void,
): Promise<void> {
  const plugin = await loadSdk();
  const settings = {
    clientId: config.clientId,
    apiUsername: config.apiUsername,
    countryCode: config.countryCode,
    langCode: options.lang,
    ...(options.city ? { city: options.city } : {}),
    ...(options.lockerId ? { favLockerId: options.lockerId } : {}),
    filters: [{ showLockers: true }, { showPudos: false }],
  };
  if (initialised) plugin.reinitializePlugin(settings);
  else plugin.init(settings);
  const instance = plugin.getInstance();
  onSelect = select;
  if (!initialised) {
    instance.subscribe((locker) => {
      onSelect?.(locker);
      instance.close();
    });
    initialised = true;
  }
  instance.open();
}
