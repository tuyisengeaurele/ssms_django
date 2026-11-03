export interface DeviceHints {
  installed: boolean;
  model?: string;
  platform?: string;
}

interface HighEntropy {
  getHighEntropyValues?: (keys: string[]) => Promise<Record<string, unknown>>;
}

/** A browser that does not answer must not hold up a sign in. */
const WAIT_MS = 1000;
const LIMIT = 40;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, LIMIT) : undefined);

function runsInstalled(): boolean {
  try {
    const iphone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return iphone || window.matchMedia?.('(display-mode: standalone)').matches === true;
  } catch {
    return false;
  }
}

/**
 * What the browser will say about the device it runs on. Chrome hides the phone model in its agent text, so the model
 * is asked for here, where the browser allows it. Everything is optional: the server names the device without it.
 */
export async function collectDeviceHints(): Promise<DeviceHints> {
  const hints: DeviceHints = { installed: runsInstalled() };
  const data = (navigator as Navigator & { userAgentData?: HighEntropy }).userAgentData;
  if (!data?.getHighEntropyValues) return hints;
  try {
    const values = await Promise.race([
      data.getHighEntropyValues(['model', 'platform']),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS)),
    ]);
    const model = text(values?.model);
    const platform = text(values?.platform);
    if (model) hints.model = model;
    if (platform) hints.platform = platform;
  } catch {
    // The browser refused. The server names the device from what it already knows.
  }
  return hints;
}
