const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function proxy(app) {
  const liveTarget =
    process.env.REACT_APP_PROXY_TARGET ||
    process.env.REACT_APP_BACKEND_URL ||
    'http://localhost:8000';
  const itsmTarget = process.env.REACT_APP_ITSM_PROXY_TARGET || 'http://127.0.0.1:8000';

  const localItsm = createProxyMiddleware({
    target: itsmTarget,
    changeOrigin: true,
  });

  // Local-only ITSM (reports not on live). kissflow-status stays on live RefexOne.
  app.use('/api/itsm/reports', localItsm);
  app.use('/api/itsm/tickets', localItsm);
  app.use('/api/itsm/approval-matrix', localItsm);
  app.use('/api/itsm/config', localItsm);
  app.use('/api/itsm/admin', localItsm);

  app.use(
    '/api',
    createProxyMiddleware({
      target: liveTarget,
      changeOrigin: true,
    })
  );
};
