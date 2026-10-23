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

## Version releases

Push a version tag such as `v5.2.0-beta2` **after the release workflow is included
in that commit**. The workflow validates both snapshots, builds and publishes
`linux/amd64` and `linux/arm64` runtime and cluster images, uploads the offline
archives to OSS, then attaches all four archives and their four MD5 files to the
GitHub Release. A new Release stays in draft until the uploaded SHA-256 digests
match the local files. Tags with a prerelease suffix (such as `-beta2` or `-rc1`)
are marked as prereleases and are not marked as the latest GitHub Release.

Supported tags are `v<major>.<minor>.<patch>` with an optional alphanumeric
prerelease suffix separated by dots or hyphens; build metadata (`+...`) is not
supported because Docker tags cannot contain `+`.

For `v5.2.0-beta2`, both GHCR image repositories use these tags:

- `main-v5.2.0-beta2`
- `release-v5.1-v5.2.0-beta2`

Each is a multi-platform manifest; architecture-specific tags append `-amd64`
or `-arm64`. Version releases do not change `latest` or `release-v5.1-latest`;
those aliases are updated only by builds on the `main` branch.

Release archives keep the snapshot and version in their names:

```text
applaunchpad-cluster-<snapshot>-<tag>-<arch>.tar.gz
oss://<OSS_BUCKET>/release/<tag>/<snapshot>/applaunchpad-cluster-<snapshot>-<tag>-<arch>.tar.gz
```

The workflow reuses the existing OSS secrets and `OSS_BUCKET` variable described
above. GitHub authentication uses the automatically supplied `GITHUB_TOKEN`
(passed to `gh` as `GH_TOKEN`); `GH_REPO` selects the current repository.
Only the GitHub release job has `contents: write`; image jobs retain
`packages: write`. No new operator credentials or application environment
variables are required.

To retry a version release, rerun its failed Actions jobs, or dispatch
**AppLaunchpad Images** with the tag as the ref:

```sh
gh workflow run ci.yml --ref v5.2.0-beta2
```

For tag refs, image publishing and OSS upload are always enabled, regardless of
the two manual boolean inputs (which still default to false for branch refs).
Reruns replace same-named Release attachments, preserve existing release notes,
and verify the uploaded digests again. Tag runs are not cancelled by a newer run.
Workflow changes do not apply retroactively to old tags: `v5.2.0-beta1` keeps its
manually attached SHA-named archives and must not be moved to adopt this workflow.

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
There is no metrics endpoint environment-variable override.

When upgrading, replace saved/custom `applaunchpadConfig.monitorUrl` values and
mounted YAML URLs that still point to `launchpad-monitor`; `--reuse-values` alone
retains the obsolete service address. No metrics query should target that service.
For local development, the SDK also reads `WHITELIST_KUBERNETES_HOSTS` to allow a
test API server; otherwise it uses in-cluster `KUBERNETES_SERVICE_HOST` and
`KUBERNETES_SERVICE_PORT`. No Kubernetes host whitelist is enabled by the Chart.
