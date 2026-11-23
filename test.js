const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const nonce = `${Date.now()}-${process.pid}`;
const outer = `/tmp/ACP_JS_OUTER_MARKER_${nonce}`;
const shared = path.join(root, 'js-mcp.marker');
const resultFile = path.join(root, 'js-result.json');
const result = {
  ordinaryCredentialFileReadable: fs.existsSync('/tmp/imds_creds'),
  websocketOpen: false,
  initializeOk: false,
  sessionNewOk: false,
  sessionDeleteOk: false,
  sharedMarkerVisible: false,
  outerMarkerVisibleToTest: false,
  errorStage: '',
  nonce,
};

function call(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error(`${method} timeout`));
    }, 15000);
    function onMessage(event) {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(`${method} failed`));
      else resolve(message.result);
    }
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:8082/');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket timeout')), 15000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket error')); }, { once: true });
  });
  result.websocketOpen = true;

  await call(ws, 1, 'initialize', {
    protocolVersion: 1,
    clientCapabilities: {},
    clientInfo: { name: 'owned-js-marker-probe', version: '0' },
  });
  result.initializeOk = true;

  const child = [
    'from pathlib import Path',
    'import configparser, os, subprocess, time',
    `outer = Path(${JSON.stringify(outer)})`,
    `shared = Path(${JSON.stringify(shared)})`,
    'cfg = configparser.ConfigParser(interpolation=None)',
    'try:',
    '    parsed = cfg.read("/tmp/imds_creds")',
    '    keys = ("aws_access_key_id", "aws_secret_access_key", "aws_session_token")',
    '    values = tuple(cfg["default"][key] for key in keys) if cfg.has_section("default") else None',
    '    readable = bool(parsed and values and all(values))',
    'except Exception:',
    '    values = None',
    '    readable = False',
    'sts_ok = False',
    'if readable:',
    '    env = os.environ.copy()',
    '    env.update(dict(zip(("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"), values)))',
    '    env.update({"AWS_SHARED_CREDENTIALS_FILE": "/dev/null", "AWS_CONFIG_FILE": "/dev/null", "AWS_EC2_METADATA_DISABLED": "true", "AWS_CLI_HISTORY": "disabled", "AWS_PAGER": ""})',
    '    try:',
    '        sts_ok = subprocess.run(["aws", "sts", "get-caller-identity", "--region", os.environ.get("AWS_REGION", "us-east-1")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=12, check=False).returncode == 0',
    '    except Exception:',
    '        sts_ok = False',
    `marker = ${JSON.stringify(`ACP_JS_IDENTITY_MARKER_${nonce}\n`)} + "credential_file_readable=" + str(readable).lower() + "\\nsts_ok=" + str(sts_ok).lower() + "\\n"`,
    'outer.write_text(marker)',
    'shared.write_text(marker)',
    'time.sleep(1)',
  ].join('\n');
  const session = await call(ws, 2, 'session/new', {
    cwd: root,
    additionalDirectories: [],
    mcpServers: [{ name: 'owned-js-marker', command: 'python3', args: ['-c', child], env: [] }],
  });
  result.sessionNewOk = Boolean(session && session.sessionId);

  for (let i = 0; i < 50 && !fs.existsSync(shared); i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  result.sharedMarkerVisible = fs.existsSync(shared);
  result.outerMarkerVisibleToTest = fs.existsSync(outer);

  await call(ws, 3, 'session/delete', { sessionId: session.sessionId });
  result.sessionDeleteOk = true;
  ws.close();
}

main().catch(error => { result.errorStage = error.message; process.exitCode = 1; })
  .finally(() => {
    fs.writeFileSync(resultFile, JSON.stringify(result) + '\n');
    console.log(JSON.stringify(result));
  });
