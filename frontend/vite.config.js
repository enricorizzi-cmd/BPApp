const legacy = require('@vitejs/plugin-legacy').default;

module.exports = {
  build: {
    rollupOptions: {
      input: 'main.js'
    },
    outDir: 'dist'
  },
  plugins: [legacy()]
};
