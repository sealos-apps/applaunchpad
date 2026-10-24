// Run from the repository root: node scripts/test-currency-config.mjs
// Requires Helm. The installer test runs only its configuration phase with stubbed tools.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chart = "deploy/charts/applaunchpad-frontend";
const render = (args = []) => execFileSync('helm', [
  'template', 'applaunchpad-frontend', chart, ...args
], { encoding: 'utf8' });

execFileSync('helm', ['lint', chart], { stdio: 'inherit' });
assert.doesNotMatch(render(), /currencySymbol:/);
assert.match(render(), /requiresIcpReg:\s+false/);
for (const required of [true, false]) {
  for (const legacySymbol of ['shellCoin', 'cny', 'usd']) {
    const output = render([
      '--set', `applaunchpadConfig.requiresDomainReg=${required}`,
      '--set', `applaunchpadConfig.currencySymbol=${legacySymbol}`
    ]);
    assert.match(output, new RegExp(`requiresIcpReg:\\s+${required}`));
    assert.doesNotMatch(output, /currencySymbol:/);
  }
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'launchpad-currency-'));
try {
  const toolsFile = join(temporaryDirectory, 'tools.sh');
  writeFileSync(toolsFile, `
ensure_global_values_ready_for_component() { :; }
fetch_configmap_data_key() { :; }
global_http_disable_https() { :; }
global_http_external_url() { :; }
info() { :; }
warn() { :; }
read_cert_tls_reject_unauthorized() { echo 1; }
read_jwt_internal() { echo test-only; }
read_yaml_file_path() { printf '%s' "$TEST_BILLING_CURRENCY"; }
`);
  const source = readFileSync(
    'deploy/applaunchpad-frontend-entrypoint.sh', 'utf8'
  );
  // Never execute adoption or deployment; stub all configmap reads as well.
  const configPhase = source.slice(0, source.indexOf('adopt_namespaced_resource()'));
  assert.ok(configPhase.includes('add_set_json applaunchpadConfig.requiresDomainReg'));
  for (const [currency, expected] of [['cny', true], ['usd', false]]) {
    const output = execFileSync('bash', ['-c',
      `kubectl() { return 1; }\n${configPhase}\nprintf '%s\\n' "\${AUTO_CONFIG_HELM_OPTS[@]}"`
    ], {
      encoding: 'utf8',
      env: { ...process.env, TOOLS_FILE: toolsFile, TEST_BILLING_CURRENCY: currency }
    });
    assert.match(output, new RegExp(`--set-json\\napplaunchpadConfig.requiresDomainReg=${expected}`));
    assert.doesNotMatch(output, /currencySymbol/);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
console.log('Currency configuration: unified chart and installer policy passed.');
