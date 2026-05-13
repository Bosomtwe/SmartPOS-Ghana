// proxy.js – Routes /api/ to Django (8000) and everything else to Vite (5173)

const http = require('http');
const httpProxy = require('http-proxy');

// If http-proxy is not installed, run: npm install http-proxy
// Or use a vanilla implementation below.

const apiProxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:8000' });
const frontendProxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:5173' });

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    apiProxy.web(req, res);
  } else {
    frontendProxy.web(req, res);
  }
});

server.listen(9000, () => {
  console.log('Proxy listening on port 9000');
});