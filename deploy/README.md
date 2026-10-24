# Unified AppLaunchpad deployment

The repository root contains the application and deployment files; published npm dependencies provide shared
UI components and SDKs. Build and install dependencies from the repository root.

## Configure

Use the chart at `charts/applaunchpad-frontend` and an operator values file:

```sh
helm upgrade --install applaunchpad-frontend ./charts/applaunchpad-frontend \
  -n applaunchpad-frontend --create-namespace -f operator-values.yaml --atomic --wait
```

All defaults and units are documented in `charts/applaunchpad-frontend/values.yaml` and
`../.env.template`. Helm renders `/app/data/config.yaml`; do not configure application features
through frontend environment variables. Development uses `data/config.local.yaml`, with
`data/config.yaml.local` as a fallback. The startup adapter accepts the old release YAML;
new canonical fields win when both formats occur. Helm retains the legacy `defaultGPU` slider key so existing overrides are not shadowed by chart defaults; the runtime normalizes it to `default-gpu`. Currency comes from Desktop.

| Operator value                                            | Default                      | Purpose                                                                     |
| --------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `applaunchpadConfig.nodePortHost`                         | empty                        | Public host/IP for NodePort links; empty hides creation controls            |
| `applaunchpadConfig.networkStorageEnabled`                | false                        | Mount shared, existing, bound PVCs                                          |
| `applaunchpadConfig.imagePortsEnabled`                    | false                        | Inspect container exposed ports on demand                                   |
| `applaunchpadConfig.imagePortsTrustedRegistries`          | []                           | Explicit trusted registries for private-network inspection                  |
| `applaunchpadConfig.customPublicDomainPrefixEnabled`      | false                        | User-selected public hostname prefix                                        |
| `applaunchpadConfig.publicDomainReservedPrefixes`         | []                           | Additional reserved hostname prefixes                                       |
| `applaunchpadConfig.customDomainMode`                     | cname                        | `cname` or existing shared `certificate` integration                        |
| `applaunchpadConfig.customDomainCertificateSecretName`    | wildcard-cert                | Shared certificate target                                                   |
| `certificateRbac.enabled`                                 | false                        | Read certificate/configuration metadata in sealos-system and higress-system |
| `serviceAccount.create` / `name`                          | true / applaunchpad-frontend | Platform metadata reader identity; tenant operations use user credentials   |
| `applaunchpadConfig.guideEnabled/apiEnabled/gpuEnabled`   | false                        | Optional UI capabilities; GPU adds read-only node-gpu-info RBAC             |
| `applaunchpadConfig.requiresDomainReg`                    | false                        | ICP policy; installer derives a default from platform billing currency      |
| `applaunchpadConfig.domainChallengeSecret`                | development placeholder      | Set a private production domain challenge signing value                     |
| `applaunchpadConfig.pvcStorageMax`                        | 100 Gi                       | Local PVC form maximum                                                      |
| `applaunchpadConfig.fileManger.uploadLimit/downloadLimit` | 50/100 MiB                   | File transfer limits; legacy Helm spelling retained                         |
| `applaunchpadConfig.appResourceFormSliderConfig`          | chart lists                  | CPU/memory/ephemeral storage form choices                                   |

Certificate mode needs existing cert-manager/Higress and their namespaces. Set
`certificateRbac.enabled=true` when using the chart-created service account. GPU mode needs
`node-system/node-gpu-info`; application startup does not depend on GPU metadata availability.
These integrations do not install external controllers. `monitorUrl` must point directly to a
Prometheus-compatible API, such as VictoriaMetrics `/select/0/prometheus`, not launchpad-monitor.

The installer accepts `HELM_OPTIONS` and `HELM_OPTS`. Platform tools are optional; when present,
its configured TLS policy is authoritative. Otherwise chart defaults apply. Operator values
at `/root/.sealos/cloud/values/apps/applaunchpad/applaunchpad-frontend-values.yaml` take precedence
over detected settings. The older `values/core/applaunchpad-frontend-values.yaml` is used when
the new file does not exist. Explicit Helm arguments have final precedence except platform TLS.
The installer refuses to adopt resources owned by another Helm release.

## Upgrade and rollback

Save `helm get values` and `helm get manifest` before upgrading. Supply saved operator values
with `-f` so new chart defaults are included; do not blindly reuse the old computed values.
Keep existing ingress hosts, certificate names, external service URLs and secrets. Pin runtime
images by digest. Use `helm rollback RELEASE REVISION --wait` to restore the preceding revision.
A rollback restores the old application's storage semantics as well, so avoid empty storage
updates after rollback to a legacy release image.

Empty or omitted API `storage` updates preserve mounts and PVCs. Removing a mount through the
form never deletes its underlying PVC. Explicit application deletion removes only PVCs from
that application's StatefulSet claim templates, excluding referenced/shared PVCs. File writes
require the user's `pods/exec` permission. Permission/network failures do not cause controller
deletion; immutable StatefulSet changes validate before orphaning and restore the old controller
if replacement fails. Existing pod and PVC data remain intact.
