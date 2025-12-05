import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use happy-dom for DOM testing
    environment: 'happy-dom',

    // Global setup file (runs before all tests)
    setupFiles: ['./tests/setup.js'],

    // Test file patterns
    include: ['tests/**/*.test.js'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/sizeof.js',      // Debug utility, not used in production
        'src/types.js',       // TypeScript type definitions (JSDoc only)
        'src/index.js',       // Re-export entry point
        'src/patches.js',     // Three.js workaround, not application logic
      ],
    },

    // Globals (optional - allows using expect, test, describe without importing)
    globals: true,

    // Snapshot configuration
    snapshotFormat: {
      printBasicPrototype: false,
    },
  },

  // Handle HTML imports as raw strings
  plugins: [
    {
      name: 'html-loader',
      enforce: 'pre', // Run before other plugins
      transform(code, id) {
        if (id.endsWith('.html')) {
          // Return the HTML content as a string export
          return {
            code: `export default ${JSON.stringify(code)}`,
            map: null,
          };
        }
      },
    },
  ],
});
