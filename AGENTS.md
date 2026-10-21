# Agent instructions

This repository holds independent Paseo plugins, not the Paseo application. Never commit API keys,
local config files, credentials, or real user prompts.

## Layout

Each plugin lives in `plugins/<plugin-id>/` and owns its manifest, dependencies, scripts, and README.

```text
plugins/<plugin-id>/
  paseo-plugin.json
  package.json
  package-lock.json
  tsconfig.json
  index.server.ts       # Optional daemon entry
  index.client.tsx      # Optional app entry
  server/               # Daemon-only modules
  client/               # App-only modules
  shared/               # Zod contracts and plain values used by both
```

## Paseo docs and versions

Check the installed version with `paseo --version` and read the matching docs before using an API:

- https://paseo.sh/llms.txt
- https://paseo.sh/docs/plugins.md
- https://paseo.sh/docs/plugins/reference.md

Keep `requirements.paseo` in each `paseo-plugin.json` accurate.

Server code may only import `@getpaseo/plugin`, `@getpaseo/plugin/server*`, `zod`, Node built-ins,
and the plugin's own `dependencies`. Importing `@getpaseo/client` or `@getpaseo/protocol`, even as a
type, fails the build. Take the Paseo API type from `PluginHandlerContext["paseo"]` instead.

## Install and update

Installs point at the plugin directory in this checkout, so pushing does not update an installed
plugin, and moving the checkout breaks the install.

```sh
cd plugins/<plugin-id>
npm install
npm run typecheck && npm run lint && npm test
paseo plugin install "$PWD" --id <plugin-id>   # first time
paseo plugin reload <plugin-id>                # after edits
paseo plugin ls <plugin-id>
paseo plugin logs <plugin-id>
```

Require `running` with no error, then exercise the change in the app. Never restart the Paseo
daemon to load plugin changes; it can kill the agent doing the work.
