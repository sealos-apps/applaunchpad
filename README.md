# AppLaunchpad

AppLaunchpad sources from `labring/sealos`, separated into `main/` and
`release-v5.1/`. Each directory contains only:

- `applaunchpad/`: the app, server-side APIs, tests, and deployment files.
- `packages/`: the shared packages required by that version of AppLaunchpad.
- Root configuration files: the app's pnpm workspace and frontend build configuration.

The source snapshots are from Sealos `main` commit
`83d1278086c0ba8399c08f43a69b29afb7ca2285` and `release-v5.1` commit
`e630e042c3be23b6cca401aba4e1a980e84bea50`.

## CI and OSS archives

CI validates both source snapshots and publishes amd64/arm64 runtime and cluster
images on pushes to `main` and automatically uploads the cluster archives and their
MD5 checksums to OSS. They are also retained as GitHub Actions artifacts for 7 days.

To upload the archives outside a push to `main`, run **AppLaunchpad Images** manually with
`upload_oss` enabled. This also publishes the images required to build the archives;
`publish_images` alone does not upload to OSS.

Configure repository secrets `OSS_ENDPOINT`, `OSS_ACCESS_KEY_ID`, and
`OSS_ACCESS_KEY_SECRET`, plus the repository variable `OSS_BUCKET` containing the
bucket and app prefix (for example, `sealos-io/offline/sealos-apps/applaunchpad`).
Archives are uploaded to:

```text
oss://<OSS_BUCKET>/ci/<snapshot>/<short-sha>/applaunchpad-cluster-<snapshot>-<short-sha>-<arch>.tar.gz
```

Each archive has a matching `.tar.gz.md5` file. Snapshots are `main` and
`release-v5.1`; architectures are `amd64` and `arm64`. The upload checks that both
architecture archives exist and verifies their checksums before uploading.

## Currency display upgrade (both snapshots)

AppLaunchpad now uses `@labring/sealos-desktop-sdk@0.1.24` (installed under the
existing `sealos-desktop-sdk` import name). The application and shared components
resolve the same published SDK. Both snapshots no longer vendor or build a local
SDK copy.

Currency symbols come from Desktop's `desktop.layout.currencySymbol` through
`getHostConfig()`. The result is loaded once after SDK initialization and kept in
memory only. Older Desktop versions that omit the field, failed requests, and
standalone runs fall back to `shellCoin`. Upgrade Desktop **before AppLaunchpad**
in `cny` or `usd` display environments. This changes symbols only, not prices,
billing units, conversions, or backend billing currency.

For manually mounted YAML, remove `launchpad.ui.currencySymbol` in `main` (its
strict schema rejects the removed key), or `launchpad.currencySymbol` in
`release-v5.1`. Keep all other fields, especially
`launchpad.infrastructure.requiresDomainReg` in release YAML, unchanged.

For release Helm values, replace `applaunchpadConfig.currencySymbol` with the
independent boolean `applaunchpadConfig.requiresDomainReg`: old `shellCoin` means
`true`, old `cny`/`usd` means `false`. Migrate saved/custom values explicitly before
upgrading; merely using `--reuse-values` with an old non-shellCoin value would
otherwise take the new default `true`. The main Chart no longer hardcodes a
symbol and needs no replacement display setting.

The release installer retains its original policy: `.global.billing.currency`
equal to `cny` enables domain registration; all other values disable it. It now
passes that boolean directly to Helm, independently of Desktop's display symbol.
As before, installer-derived values override values files; an explicit
`HELM_OPTIONS='--set applaunchpadConfig.requiresDomainReg=false'` (or `true`)
can override the installer policy. Direct Helm installs default to `true`, as
the previous default `shellCoin` did.

Focused checks (after `pnpm install --frozen-lockfile` in each snapshot):

```sh
pnpm --dir main --filter applaunchpad run test:unit
pnpm --dir release-v5.1 --filter applaunchpad exec vitest run __tests__/unit/store/host.test.ts __tests__/unit/pages/api/platform/getInitData.test.ts
node scripts/test-currency-config.mjs # Helm required; no cluster access or deployment
```

## Metrics SDK (both snapshots)

Metrics APIs use `@labring/sealos-metrics-sdk@0.2.0` on the Next.js server,
with a new client bound to each request's authenticated kubeconfig. CPU, memory,
average usage, disk/storage and release GPU metrics retain their chart units;
main network request count/percentage queries also use the SDK. The browser API
paths and response envelopes are unchanged. Logging still uses its separate log
service.

The metrics endpoint must be a direct Prometheus-compatible base URL, defaulting to
`http://vmselect-vm-stack-victoria-metrics-k8s-stack.vm.svc.cluster.local:8481/select/0/prometheus`.
The SDK appends `/api/v1/query` or `/api/v1/query_range` and checks Kubernetes
readiness and the user's namespace permissions before querying metrics.

Configure the endpoint with Helm `--set-string applaunchpadConfig.monitorUrl=<url>`;
the Chart writes it into the mounted ConfigMap's `config.yaml`. The server reads
`launchpad.components.monitoring.url` in main or
`launchpad.components.monitor.url` in release-v5.1 directly from that file.
For standalone development, set the same YAML field in the local configuration.
There is no metrics endpoint environment-variable override. See each app's
`env.template` for the configuration location.

When upgrading, replace saved/custom `applaunchpadConfig.monitorUrl` values and
mounted YAML URLs that still point to `launchpad-monitor`; `--reuse-values` alone
retains the obsolete service address. No metrics query should target that service.
For local development, the SDK also reads `WHITELIST_KUBERNETES_HOSTS` to allow a
test API server; otherwise it uses in-cluster `KUBERNETES_SERVICE_HOST` and
`KUBERNETES_SERVICE_PORT`. No Kubernetes host whitelist is enabled by the Chart.
