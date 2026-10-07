import { defineConfig } from 'vite';
import base from './vite.config';

export default defineConfig(async (env) => {
  const config = typeof base === 'function' ? await base(env) : await base;
  return { ...config, cacheDir: '.vite-creation-cache', server: { host: '127.0.0.1', port: Number(process.env.SKIN_CREATION_UI_PORT || 5188), strictPort: true,
    proxy: { '/creation-api': `http://127.0.0.1:${process.env.SKIN_CREATION_API_PORT || 5189}` } } };
});
