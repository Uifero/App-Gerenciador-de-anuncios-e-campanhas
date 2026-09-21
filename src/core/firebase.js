// Inicialização do Firebase (mesmo projeto do Painel de Comissões).
// A apiKey web do Firebase é pública por design; quem protege os dados são as regras.
import { initializeApp } from 'firebase/app';

export const DEMO = import.meta.env.VITE_DEMO_MODE === '1';

let _app;
export function app() {
  if (!_app) {
    _app = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
  }
  return _app;
}
