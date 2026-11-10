/**
 * What a disease check found, in the language of the screen. "Healthy" is translated. The name of a disease stays as the
 * model gave it, and so does a result the app does not know.
 */
export function resultLabel(t: (key: string) => string, result: string): string {
  return result === 'Healthy' ? t('drHealthy') : result;
}
