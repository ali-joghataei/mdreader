import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const external = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    outDir: 'dist-electron',
    rollupOptions: {
      external,
    },
  },
});
