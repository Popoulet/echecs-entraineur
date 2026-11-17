import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.echecs.tablette',
  appName: 'Échecs Entraîneur',
  webDir: 'dist',
  backgroundColor: '#161512',
  android: { allowMixedContent: false },
};

export default config;
