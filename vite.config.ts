/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        // jsdom hace falta para los tests de hooks y de componentes; el resto
        // son funciones puras y no lo usan.
        environment: 'jsdom',
        include: ['**/*.test.ts', '**/*.test.tsx'],
        exclude: ['node_modules/**', 'dist/**'],
        // Desmonta el árbol entre tests y rellena lo que jsdom no trae.
        // Sin esto, dos tests que renderizan lo mismo chocan entre sí.
        setupFiles: ['./shared/test/setup.ts'],
      },
    };
});
