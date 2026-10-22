# Workspace Spaces

Arc-style numbered Spaces at the bottom of Paseo's desktop sidebar. Each Space shows only the
projects assigned to it, and the sidebar's Workspaces heading shows the selected Space's name.

- Click a tab, or swipe sideways with two fingers over the project list, to switch Spaces.
- **+** adds a Space. Right-click a tab to rename or remove it; removing a Space moves its
  projects to the one before it. The last Space can't be removed.
- To move a project, open its right-click or three-dot menu and pick a Space under
  **Move to workspace**.

## Which Space a project is in

Spaces are saved by repo, so every checkout and worktree of a repo, on any connected machine,
lands in the same Space, including ones added later. Moving a single checkout when Paseo lists it
separately keeps that checkout where you put it, and the rest of the repo follows your latest
move. Projects you never moved are in Space 1.

Paseo's sidebar names a project by its repo while each machine has one checkout of it, and by
machine and project ID once a machine has two. For the second kind, the plugin asks that machine
(through the Paseo app's connection) which repo the project belongs to. If the machine is offline,
its pinned workspaces stay visible in every Space.

## Limits

- Desktop app only. The plugin adds its own tabs to Paseo's sidebar by finding parts of the page
  by name, which is not a supported plugin feature, so a Paseo update can break it. Other clients
  show the normal sidebar.
- Settings live on the daemon where the plugin is installed. Install it on one machine per desktop.
- The selected Space resets to Space 1 when the app reloads.

## Development

```sh
npm install
npm run typecheck && npm run lint && npm test
paseo plugin install "$PWD" --id workspace-spaces   # first time
paseo plugin reload workspace-spaces                # after edits
```

Supports Paseo 0.12.0 and later.
