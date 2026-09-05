import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react({
      // Use automatic JSX runtime (modern standard for React 17+)
      // This doesn't require explicit React imports in every file
      jsxRuntime: 'automatic',
    }),
    tailwindcss(),
    // Vite plugin to set iframe embedding headers
    {
      name: 'configure-response-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Remove X-Frame-Options
          res.removeHeader('X-Frame-Options');
          
          // Set CSP frame-ancestors for HTML responses
          if (req.url === '/' || req.url.endsWith('.html') || (!req.url.includes('.') && !req.url.startsWith('/api'))) {
            const allowedOrigins = process.env.NODE_ENV === 'development' 
              ? "http://localhost:5173"
              : "https://attendance.bylinelms.com";
            
            const existingCSP = res.getHeader('Content-Security-Policy') || '';
            if (existingCSP && !existingCSP.includes('frame-ancestors')) {
              res.setHeader('Content-Security-Policy', `${existingCSP}; frame-ancestors ${allowedOrigins};`);
            } else if (!existingCSP) {
              res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedOrigins};`);
            }
          }
          
          next();
        });
      },
    },







    // Bundle analyzer for production builds
    process.env.ANALYZE && visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    })
  ].filter(Boolean),
  server: {
    // Increase HMR timeout to prevent connection issues
    hmr: {
      overlay: true,
    },
    proxy: {
      // --- WebSocket proxy MUST come before /api to avoid being intercepted ---
      '/api/socket.io': {
        target: 'http://127.0.0.1:3011',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      // --- Development proxy configuration ---
      '/api': {
        target: 'http://127.0.0.1:3011',
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        // Rewrite cookie domain so Set-Cookie headers from the backend
        // (domain: 127.0.0.1:3011) are accepted by the browser under localhost:5173.
        // Without this the Vite proxy strips / blocks httpOnly cookies on the
        // /api/auth/login and /api/auth/refresh responses.
        cookieDomainRewrite: {
          '127.0.0.1': 'localhost',
          '*': '',
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            // Only log if it's not a connection refused error (server might be starting)
            if (err.code !== 'ECONNREFUSED') {
              console.log('[Vite Proxy] Error:', err.message);
            }
            // Don't send response if already sent
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'Backend server is not available. Please ensure the backend server is running on port 3011.' 
              }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Add timeout handling
            proxyReq.setTimeout(10000, () => {
              if (!res.headersSent) {
                res.writeHead(504, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Request timeout' }));
              }
            });
          });
        },
      },
      // --- Avatar images proxy for development ---
      '/avatars': {
        target: 'http://127.0.0.1:3011',
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            // Only log if it's not a connection refused error (server might be starting)
            if (err.code !== 'ECONNREFUSED') {
              console.log('[Vite Proxy] Avatar error:', err.message);
            }
            // Don't send response if already sent
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'Backend server is not available.' 
              }));
            }
          });
        },
      },
      // --- Policy PDFs proxy for development ---
      '/policies': {
        target: 'http://127.0.0.1:3011',
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            if (err.code !== 'ECONNREFUSED') {
              console.log('[Vite Proxy] Policies error:', err.message);
            }
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'Backend server is not available.' 
              }));
            }
          });
        },
      }
    }
  },
  build: {
    // Optimized build configuration for production
    target: 'es2015',
    minify: 'terser',
    // Module preload to ensure proper loading order
    modulePreload: {
      polyfill: true,
    },
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      format: {
        comments: false, // Remove comments
      },
    },
    // Let Vite handle chunking automatically - safest approach
    rollupOptions: {
      output: {
        // Let Vite's automatic chunking handle everything
        // This prevents circular dependencies and ensures proper load order
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          } else if (/woff|woff2|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[ext]/[name]-[hash][extname]`;
        },
      },
    },
    // Disable source maps for production
    sourcemap: false,
    // Increase chunk size limit (after splitting, individual chunks should be smaller)
    chunkSizeWarningLimit: 600,
    // Optimize assets
    assetsInlineLimit: 4096, // 4kb - inline small assets as base64
    cssCodeSplit: true, // Split CSS for better caching
    reportCompressedSize: true, // Report compressed size
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@emotion/react',
      '@emotion/styled',
      '@emotion/cache',
      '@mui/material',
      '@mui/utils',
      '@mui/icons-material',
      '@mui/icons-material/Add',
      '@mui/icons-material/EditOutlined',
      '@mui/icons-material/DeleteOutline',
      // Pre-bundle deps used by lazy-loaded pages (prevents "Outdated Optimize Dep" 504s)
      'date-fns',
      'jspdf',
      'jspdf-autotable',
      'xlsx',
      '@mui/x-date-pickers',
      '@mui/x-date-pickers/AdapterDateFns',
      // Icon subpath imports used in ReportsPage (and similar routes)
      '@mui/icons-material/Download',
      '@mui/icons-material/PictureAsPdf',
      '@mui/icons-material/TableChart',
      '@mui/icons-material/Description',
      '@mui/icons-material/Assessment',
      '@mui/icons-material/EventNote',
      '@mui/icons-material/History',
      // Leave side panels (LeaveRequestForm)
      '@mui/icons-material/BeachAccess',
      '@mui/icons-material/WorkspacePremium',
      '@mui/icons-material/LocalHospital',
      '@mui/icons-material/Update',
      '@mui/icons-material/WarningAmber',
      '@mui/icons-material/Category',
      '@mui/icons-material/KeyboardArrowDown',
      '@mui/icons-material/Close',
      '@mui/icons-material/CalendarToday',
      '@mui/icons-material/EventAvailable',
      '@mui/icons-material/WbSunnyOutlined',
      '@mui/icons-material/WbTwilight',
      '@mui/icons-material/Schedule',
      '@mui/icons-material/CheckCircle',
      '@mui/x-date-pickers/StaticDatePicker',
      'react-is',
      'prop-types',
      // PDF.js dependencies
      'react-pdf',
      'pdfjs-dist',
    ],
    exclude: [
      // Exclude worker files from optimization
      'pdfjs-dist/build/pdf.worker.min.mjs',
    ],
    esbuildOptions: {
      // Ensure proper initialization order
      target: 'es2015',
    },
    // Do not force re-optimization on every dev start — it invalidates browser
    // module hashes and causes "Failed to fetch dynamically imported module".
  },
  // Resolve configuration to prevent React duplication
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@emotion/react',
      '@emotion/styled',
      'react-is',
      'prop-types',
    ],
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
      '@emotion/react': path.resolve(__dirname, 'node_modules/@emotion/react'),
      '@emotion/styled': path.resolve(__dirname, 'node_modules/@emotion/styled'),
      'react-is': path.resolve(__dirname, 'node_modules/react-is'),
      'prop-types': path.resolve(__dirname, 'node_modules/prop-types'),
    },
  },
  // CSS optimization
  css: {
    devSourcemap: false,
  },
});