// Config mínima, no estricta: el objetivo es que el estilo no diverja más
// entre módulos nuevos y viejos, no reescribir 30 archivos existentes.
// Reglas que generarían cientos de avisos sobre código ya en producción
// (no-explicit-any, no-unused-vars agresivo, etc.) se dejan apagadas o en
// "warn" a propósito — ver README para el razonamiento de cada `any`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Solo las dos reglas clásicas (rules-of-hooks/exhaustive-deps). El
      // resto del "recommended" de v7 son reglas del React Compiler (aún
      // experimentales) que marcan como error patrones estándar como
      // `useEffect(() => { load(); }, [])`, usado a propósito en todo el
      // proyecto — no encajan con una config "mínima, no estricta".
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // El proyecto usa `any` deliberadamente en las fronteras con EspoCRM
      // (mapeo de JSON sin tipar) — ver auditoría técnica, sección 12.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Los scripts de `scripts/` no corren en el navegador sino con node, así
    // que `console`, `process` y compañía sí existen ahí.
    files: ['scripts/**/*.mjs', '*.config.js', '*.config.ts'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', __dirname: 'readonly' },
    },
  },
  eslintConfigPrettier,
);
