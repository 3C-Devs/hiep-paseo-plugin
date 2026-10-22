# 3C Devs Paseo plugins

Paseo plugins we use, forked from [HiepPP/hiep-paseo-plugin](https://github.com/HiepPP/hiep-paseo-plugin)
and kept working on Paseo 0.12. Each plugin installs on its own.

## Workspace Spaces

Arc-style numbered Spaces at the bottom of the desktop sidebar. Move a project into a Space from
its menu, then click a tab or swipe sideways over the project list to switch.

<img src="docs/images/spaces.png" alt="Project menu with Move to workspace and numbered Space tabs." width="420">

[Workspace Spaces README](plugins/workspace-spaces/README.md)

## Install

```sh
cd plugins/<plugin-id>
npm install
paseo plugin install "$PWD" --id <plugin-id>
```

After editing, run `npm run typecheck` and `paseo plugin reload <plugin-id>`.
