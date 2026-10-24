# AppLaunchpad

The repository root contains the AppLaunchpad application for public and private Sealos.

- `src/`, `public/`, `__tests__/`, and `deploy/`: application, assets, tests, and deployment files.
- UI components (Chakra and shadcn), driver, analytics, shared utilities, and Desktop integration use version-pinned `@labring/sealos-*` npm packages declared in `package.json`. No local package workspace is required.
- `Dockerfile`, `Makefile`, and `package.json`: root build entrypoints.
- [Deployment guide](deploy/README.md): configuration, storage safety,
  upgrade and rollback instructions.

Run from the repository root with Node 20.20.2 and pnpm 8.9.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm run test:unit
pnpm run build
docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile -t <image> --push .
```

## CI and releases

CI validates one workspace and publishes one set of runtime and cluster images for
`linux/amd64` and `linux/arm64`. There are no per-snapshot build paths or distribution
channels. Branch builds use `sha-<short-sha>` tags; version builds use the version tag
itself, for example `v5.2.0-beta2`. Architecture-specific tags append `-amd64` or
`-arm64`. Only pushes to the `main` branch update the `latest` manifest.

Push a version tag after the workflow is included in that commit. Supported tags are
`v<major>.<minor>.<patch>` with an optional alphanumeric prerelease suffix separated
by dots or hyphens. Build metadata (`+...`) is unsupported by Docker tags.

Cluster archives and MD5 files are retained as Actions artifacts for 7 days.
Version releases upload two archives and two checksums to GitHub Release; the release
stays in draft until every uploaded SHA-256 digest matches. Prereleases are not
marked as latest. Existing historical releases and assets are not renamed.

OSS uploads run on main pushes and version releases. For manual branch runs,
`upload_oss` also enables image publishing; `publish_images` alone does not upload.
Configure secrets `OSS_ENDPOINT`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, and
repository variable `OSS_BUCKET` (bucket and optional app prefix).

```text
oss://<OSS_BUCKET>/ci/<short-sha>/applaunchpad-cluster-sha-<short-sha>-<arch>.tar.gz
oss://<OSS_BUCKET>/release/<tag>/applaunchpad-cluster-<tag>-<arch>.tar.gz
```

Each archive has a matching `.tar.gz.md5`. Both architectures and checksums are
verified before upload. To retry, rerun failed jobs or dispatch the version ref:

```sh
gh workflow run ci.yml --ref v5.2.0-beta2
```

Version dispatches always publish images and archives. Reruns replace same-named
assets, preserve release notes and verify digests again. Tag runs are not cancelled
by newer runs. GitHub authentication uses `GITHUB_TOKEN`; only release publication
has `contents: write`, while image publication has `packages: write`.

## Currency display upgrade

AppLaunchpad uses `@labring/sealos-desktop-sdk@0.1.24` directly. The application and shared components
resolve the same published SDK. The unified source does not vendor or build a local SDK copy.

Currency symbols come from Desktop's `desktop.layout.currencySymbol` through
`getHostConfig()`. The result is loaded once after SDK initialization and kept in
memory only. Older Desktop versions that omit the field, failed requests, and
standalone runs fall back to `shellCoin`. Upgrade Desktop **before AppLaunchpad**
in `cny` or `usd` display environments. This changes symbols only, not prices,
billing units, conversions, or backend billing currency.

Configure domain registration independently with
`applaunchpadConfig.requiresDomainReg` (default `false`). The installer derives a
default from platform billing currency; operator values and explicit Helm arguments
can override it. See the deployment guide for configuration migration details.

```sh
pnpm run test:unit
node scripts/test-currency-config.mjs # Helm required; no cluster access or deployment
```

## Metrics SDK

Metrics APIs use `@labring/sealos-metrics-sdk@0.2.0` on the Next.js server,
with a new client bound to each request's authenticated kubeconfig. CPU, memory,
average usage, disk/storage and GPU metrics retain their chart units;
network request count/percentage queries also use the SDK. The browser API
paths and response envelopes are unchanged. Logging still uses its separate log
service.

The metrics endpoint must be a direct Prometheus-compatible base URL, defaulting to
`http://vmselect-vm-stack-victoria-metrics-k8s-stack.vm.svc.cluster.local:8481/select/0/prometheus`.
The SDK appends `/api/v1/query` or `/api/v1/query_range` and checks Kubernetes
readiness and the user's namespace permissions before querying metrics.

Configure the endpoint with Helm `--set-string applaunchpadConfig.monitorUrl=<url>`;
the Chart writes it into the mounted ConfigMap's `config.yaml`. The server reads
`launchpad.components.monitoring.url` from that file.
For standalone development, set the same YAML field in the local configuration.
There is no metrics endpoint environment-variable override.

When upgrading, replace saved/custom `applaunchpadConfig.monitorUrl` values and
mounted YAML URLs that still point to `launchpad-monitor`; `--reuse-values` alone
retains the obsolete service address. No metrics query should target that service.
For local development, the SDK also reads `WHITELIST_KUBERNETES_HOSTS` to allow a
test API server; otherwise it uses in-cluster `KUBERNETES_SERVICE_HOST` and
`KUBERNETES_SERVICE_PORT`. No Kubernetes host whitelist is enabled by the Chart.

The published Sealos UI package targets Tailwind 3. AppLaunchpad keeps its Tailwind 4 entrypoint and existing theme tokens in `src/styles/sealos-ui.css` and `sealos-ui-theme.css`, scanning the installed UI package for component classes. The application-owned quota dialog adapter reuses host configuration while rendering the published Shared SDK view.

Chakra theme typings are generated from the installed `@labring/sealos-chakra-ui` package during installation. `RouteBackendSelect` remains application-owned because the route modal needs positioning and scroll-limit options not exposed by the published select.
