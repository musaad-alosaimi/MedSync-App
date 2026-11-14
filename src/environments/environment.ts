// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.

export const environment = {
  production: false,
  /**
   * Base URL of the MedSync clinical API (server/app.py).
   * On a physical phone `localhost` is the phone itself: use your computer's LAN address, e.g. 'http://192.168.1.20:8000'.
   */
  apiUrl: 'http://localhost:8000',
};
