const legacy = require('@vitejs/plugin-legacy').default;

module.exports = {
  build: {
    outDir: 'dist'
  },
  plugins: [legacy()]
};
