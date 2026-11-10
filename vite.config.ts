import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [{
    name: 'cueproof-content-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: "default-src 'self'; connect-src 'none'; media-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
        },
        injectTo: 'head-prepend',
      }],
    },
  }],
})
