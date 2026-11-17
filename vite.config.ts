import { defineConfig } from 'vite';

export default defineConfig({
  // base relatif : indispensable pour que les fichiers se chargent dans la WebView Capacitor
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
  // numéro de version affiché dans l'appli (numéro de build CI, sinon "dev")
  define: { __APP_VERSION__: JSON.stringify(process.env.BUILD_NUMBER ?? 'dev') },
});
