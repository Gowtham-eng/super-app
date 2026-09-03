const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function proxy(app) {
  const liveTarget =
    process.env.REACT_APP_PROXY_TARGET ||
    process.env.REACT_APP_BACKEND_URL ||
    'http://localhost:8000';
  // Prefer explicit ITSM proxy; otherwise same host as main API (live when .env.local points to refexone.com).
  const itsmTarget =
    process.env.REACT_APP_ITSM_PROXY_TARGET ||
    process.env.REACT_APP_PROXY_TARGET ||
    process.env.REACT_APP_BACKEND_URL ||
    'http://127.0.0.1:8000';

  const itsmProxy = createProxyMiddleware({
    target: itsmTarget,
    changeOrigin: true,
  });

  app.use('/api/itsm/reports', itsmProxy);
  app.use('/api/itsm/tickets', itsmProxy);
  app.use('/api/itsm/approval-matrix', itsmProxy);
  app.use('/api/itsm/config', itsmProxy);
  app.use('/api/itsm/admin', itsmProxy);

  app.use(
    '/api',
    createProxyMiddleware({
      target: liveTarget,
      changeOrigin: true,
    })
  );
};
