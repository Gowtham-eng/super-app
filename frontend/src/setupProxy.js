const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function proxy(app) {
  const liveTarget =
    process.env.REACT_APP_PROXY_TARGET ||
    process.env.REACT_APP_BACKEND_URL ||
    'https://refexone.com';
  const helperTarget =
    process.env.REACT_APP_ITSM_COMMENT_PROXY || 'http://127.0.0.1:8000';

  const onProxyError = (target, label) => (err, req, res) => {
    const code = err && err.code;
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    const unreachable =
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      (err && /timeout/i.test(err.message || ''));
    const detail = unreachable
      ? label === 'helper'
        ? `ITSM helper is not running (${target}). Start the local backend on port 8000.`
        : `Live server is not reachable (${target}). Check VPN/network or try again.`
      : 'API proxy error: ' + (err.message || String(err));
    res.end(JSON.stringify({ detail }));
  };

  // Production RefexOne does not serve these yet (FastAPI 404 / old Live key).
  // Register /comments before /comment — Express does not treat "comment" as a prefix of "comments".
  [
    '/api/itsm/reports/comments',
    '/api/itsm/reports/comment',
    '/api/itsm/reports/reopen',
    '/api/itsm/reports/rating',
    '/api/refexions',
  ].forEach((pathPrefix) => {
    app.use(
      pathPrefix,
      createProxyMiddleware({
        target: helperTarget,
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
        onError: onProxyError(helperTarget, 'helper'),
      })
    );
  });

  app.use(
    '/api',
    createProxyMiddleware({
      target: liveTarget,
      changeOrigin: true,
      timeout: 120000,
      proxyTimeout: 120000,
      onError: onProxyError(liveTarget, 'live'),
    })
  );
};
