/// <reference types="vite/client" />

// One language cut out of the translation files at build time (scripts/localeSplit.mjs).
declare module '*/translations?locale=en' {
  export const translations: Record<string, string>;
}
declare module '*/translations?locale=fr' {
  export const translations: Record<string, string>;
}
declare module '*/translations?locale=rw' {
  export const translations: Record<string, string>;
}
