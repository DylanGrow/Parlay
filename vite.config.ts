import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  build: {
    // Ensure clean output for GitHub Pages
    outDir: 'dist',
    emptyOutDir: true,
    // Minify for performance
    minify: 'terser',
    rollupOptions: {
      output: {
        // Stable filenames so service worker cache stays valid
        entryFileNames: 'assets/app.[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  // Base must be './' for subfolder deployment (e.g. GitHub Pages)
  base: './',
})
