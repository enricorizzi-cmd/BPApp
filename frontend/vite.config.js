const legacy = require('@vitejs/plugin-legacy').default;

module.exports = {
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'vendor-charts': ['chart.js'],
          'vendor-utils': ['chart.js']
        }
      }
    },
    // Optimize for faster builds
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  plugins: [legacy()]
};
