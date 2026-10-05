import { spawnSync } from "child_process";
import { assertPinnedNode } from "./commonjs/oracle";

// Independent valid-wire witnesses for the parsed-event overapproximation.
// The monitor observes propagation only; it does not recover from the throw.
const source = `
  const http = require('http'), fs = require('fs');
  const path = process.argv[1];
  const trace = []; let message = 'old'; let retainedResponse;
  const server = http.createServer();
  function removed() { throw Error('removed'); }
  server.on('request', removed); server.off('request', removed);
  server.on('request', function(req, res) {
    retainedResponse = res;
    trace.push({ receiver: this === server, method: req.method, url: req.url, message });
    if (req.url === '/crash') throw Error('crashed');
    res.end('ok');
  });
  process.on('uncaughtExceptionMonitor', function(error) {
    fs.writeSync(1, JSON.stringify({ trace, error: error.message,
      ended: retainedResponse.writableEnded }) + '\\n');
  });
  server.listen(0, '127.0.0.1', function() {
    message = 'current';
    http.get({ host: '127.0.0.1', port: server.address().port, path, agent: false }, function(res) {
      let body = ''; res.setEncoding('utf8');
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        fs.writeSync(1, JSON.stringify({ trace, body, status: res.statusCode }) + '\\n');
        server.close();
      });
    });
  });
`;

beforeAll(assertPinnedNode);
test.each(['/crash', '/ok'])('pinned Node validates automatic incoming-event witness %s', path => {
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ['--no-global-search-paths', '-e', source, path], {
      encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }
    });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(path === '/crash' ? 1 : 0);
  const observed = JSON.parse(child.stdout);
  expect(observed.trace).toEqual([{ receiver: true, method: 'GET', url: path, message: 'current' }]);
  if (path === '/crash') expect(observed).toMatchObject({ error: 'crashed', ended: false });
  else expect(observed).toMatchObject({ body: 'ok', status: 200 });
});
