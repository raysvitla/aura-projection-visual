import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/aura-projection-visual/',
  plugins: [react()],
});
