# AppLaunchpad

AppLaunchpad sources from `labring/sealos`, separated into `main/` and
`release-v5.1/`. Each directory contains only:

- `applaunchpad/`: the app, server-side APIs, tests, and deployment files.
- `packages/`: the shared packages required by that version of AppLaunchpad.
- Root configuration files: the app's pnpm workspace and frontend build configuration.

The source snapshots are from Sealos `main` commit
`83d1278086c0ba8399c08f43a69b29afb7ca2285` and `release-v5.1` commit
`e630e042c3be23b6cca401aba4e1a980e84bea50`.
