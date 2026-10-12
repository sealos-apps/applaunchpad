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
oss://<OSS_BUCKET>/ci/<snapshot>/<short-sha>/applaunchpad-<snapshot>-cluster-<snapshot>-<short-sha>-<arch>.tar.gz
```

Each archive has a matching `.tar.gz.md5` file. Snapshots are `main` and
`release-v5.1`; architectures are `amd64` and `arm64`. The upload checks that both
architecture archives exist and verifies their checksums before uploading.
