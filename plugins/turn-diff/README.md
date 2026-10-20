# Turn diff

Adds a card to the thread after each agent turn that changed files or made commits. Click a file
on the card to see what that turn changed in it. This is the turn diff part of
[thread-branch](../thread-branch/README.md), without the branch pills and the PR picker.

Do not install both plugins: each turn would then show two cards.

## What the card shows

After each agent turn that changed files or made commits, the thread gets one row:
`2 files changed +14 -3`, then the commits made during the turn (at most 10), then up to 20
files with their `+added -deleted` lines and `and N more`. Binary files show `binary`. A turn
with no change, in a non-git folder, or without a start snapshot adds no row. The start snapshot
is also saved to `$PASEO_HOME/plugin-data/turn-diff/turn-starts/<agent>.json` (about 250
bytes, deleted at turn end, dropped after a day), so a plugin reload mid-turn still gives the card.

- The card shows only what changed during that turn, never the whole diff against `HEAD`. At turn
  start and end the plugin writes the whole work tree, untracked files included, as a git tree
  object through a copy of the index, so your staging area is untouched. The card lists the
  files whose content differs between the two trees, so edits inside files that were already
  dirty, and files that were untracked before the turn, still count. Files edited before the turn
  and not touched during it are left out. The objects stay loose until `git gc` prunes them.
- Untracked files over 1 MiB stay out of snapshots, so they cost no space under `.git`. A new one
  still shows on the card as **large, not saved**, with no diff. Tracked files are always kept.
- If a snapshot times out, the card falls back to comparing `git diff --numstat` against the start
  commit. That fallback can miss an edit that keeps a dirty file's line counts equal.
- When another agent ran a turn in the same `cwd` at the same time, the row says
  **May include changes from another agent**, because git cannot tell whose edit is whose.
- Click a file to open the **Turn diff** panel beside the agent. It shows only that file, and only
  what changed during that turn, from the same two snapshots. Rows from before this version, or
  where a snapshot timed out, are not clickable. **All turns** in the panel, or Command Center →
  **Open turn changes**, lists every recorded turn of the agent, newest first.
- The daemon keeps timeline cards only in memory, so a daemon restart, or a reload of the agent
  session (Refresh, `paseo agent reload`), removes them. Each card is
  also written to `$PASEO_HOME/plugin-data/turn-diff/turn-diffs.jsonl` (mode 600), and the
  panel's turn list reads that file, so turn changes stay viewable after a restart. Nothing is
  cached in memory. Entries older than 30 days, or past 2,000, are dropped.
- Two refs per turn, `refs/turn-diff/turns/<key>/from` and `.../to`, keep the snapshot trees
  safe from `git gc`. They are deleted when the turn leaves the file. They are not branches, so
  `git branch` and pushes of branches do not show them; `git push --mirror` would copy them.
  No worktree is created: snapshots use a temporary index file only.
- Long lines wrap by default and keep their indentation. The **Wrap** switch in the panel header
  turns wrapping off for sideways scrolling; the choice holds until the app reloads.
- Images (`png`, `jpg`, `gif`, `webp`, `bmp`, `ico`, `avif`, `svg`) show a Before and After
  preview read from the same snapshots. An image over 3 MB is not previewed.

## Requirements

- `git` on the daemon `PATH`.
- Paseo `0.8` or `0.9.0-beta.2` and later.

## Install

From GitHub:

```bash
paseo plugin add HiepPP/hiep-paseo-plugin:plugins/turn-diff
```

From a clone:

```bash
cd plugins/turn-diff
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"
paseo plugin ls
```

Reload after source edits with `paseo plugin reload turn-diff`.
