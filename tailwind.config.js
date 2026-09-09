import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  // Rutas que Tailwind escanea para saber qué clases generar.
  // Antes el proyecto usaba el CDN de Tailwind, que escanea el DOM YA
  // renderizado; con el build es al revés (escanea el código fuente), así que
  // una clase construida dinámicamente —`text-${color}-600`— dejaría de
  // existir. Por eso App.tsx mantiene NAV_ACTIVE_COLOR con las clases
  // completas escritas a mano: ese patrón ahora es obligatorio, no opcional.
  content: [
    './index.html',
    './index.tsx',
    './app/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  // Provee animate-in / fade-in / zoom-in-95 / slide-in-from-*, que se usan en
  // los modales y menús desplegables y NO son parte del core de Tailwind.
  plugins: [tailwindcssAnimate],
};
