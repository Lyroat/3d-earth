import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';

const STATIC_ASSETS = [
  'earth/earth.jpg',
  'earth/bump.jpg',
  'sem/sun.jpg',
  'sem/moon.jpg',
  'plates/pb-data.json',
  'plates/split-data.json',
  'plates/textures/汇聚型板块边界.jpg',
  'plates/textures/离散型板块边界.jpg',
  'plates/textures/转换断层.jpg',
  'volcanoes/data.json',
];

export default defineConfig({
  publicDir: false,
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: { drop_debugger: true, passes: 2 },
      mangle: { toplevel: true },
      format: { comments: false },
    },
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
  },
  plugins: [
    {
      name: 'copy-static-assets',
      writeBundle() {
        for (const f of STATIC_ASSETS) {
          if (!existsSync(f)) continue;
          const dest = join('dist', f);
          mkdirSync(dirname(dest), { recursive: true });
          copyFileSync(f, dest);
        }
      },
    },
  ],
});
