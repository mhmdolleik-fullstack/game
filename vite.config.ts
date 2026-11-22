import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'offline-webview-entry',
    transformIndexHtml: { order: 'post', handler: html => html.replace(
      /<script type="module"(?: crossorigin)? src="\.\/game\.js"><\/script>/,
      '<script defer src="./game.js"></script>'
    ) }
  }],
  build: {
    outDir: 'build',
    assetsInlineLimit: 0,
    target: 'es2020',
    minify: 'esbuild',
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'game.js',
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});


