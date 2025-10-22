const legacy = require('@vitejs/plugin-legacy').default;

module.exports = {
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'vendor-charts': ['chart.js']
        },
        // Aumenta la dimensione massima dei chunk
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Disabilita minificazione per test
    minify: false,
    // Aumenta il limite di memoria
    target: 'es2015'
  },
  plugins: [legacy()],
  // Ottimizzazione per build di file grandi
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  }
};
