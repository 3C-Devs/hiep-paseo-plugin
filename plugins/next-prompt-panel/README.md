# Next prompt panel

Turns the end of an agent reply into a panel: the Recap as labeled fields, and each suggested next
prompt as a row with **Send**, **Edit**, and **New thread** buttons. Click Send and the prompt goes
to the same conversation. You do not need to copy and paste.

![A reply with its Recap and three suggested prompts, each with Edit and Send or Commit.](assets/next-prompt-panel.png)

The image comes from Paseo 0.12.0, with sample data.

## What the panel does

- The panel replaces the reply from its last `## What Next`, `## What's Next`, or `## Next Steps`
  heading. It also replaces a recognized `## Recap` directly before that heading. The plugin renders
  the reply text above them itself, because Paseo 0.12 transformers replace the whole reply. Code
  blocks have no syntax colors, and tables show as monospace text.
- A reply without an eligible suggestion block keeps the normal Paseo rendering.
- Only the latest reply has active buttons. Earlier panels stay readable.
- **Send** sends the prompt in this conversation and keeps your composer draft.
- **Edit** writes the prompt into the composer so you can change it before you send it. It is
  available on desktop and web only; mobile clients hide it.
- **New thread** starts the prompt in a new conversation with the same provider, model, mode, and
  folder. On desktop and web, hover over Send and hold Command (Control off macOS) to swap Send
  for New thread. Mobile shows a separate New thread button.
- A prompt marked `thread: new` is listed under **Other work** and offers Start in new thread.
- A prompt that asks to commit gets a **Commit** button, which sends `/commit --no-push` with the
  prompt. **Commit & Push** sends `/commit`, and **Push** sends the prompt as written. Your agent
  needs a `/commit` command or skill for these. Git actions are never sent together with other
  prompts.
- Each prompt is sent at most once. If the send result is unknown, the button shows **Check chat**
  and is not retried.

## Make your agent write the format

The panel only reads replies in the shape below. Add these rules to your agent instructions, such
as `CLAUDE.md` or `AGENTS.md`:

````markdown
End each task reply with a Recap section, then a What Next section.

## Recap

- <branch> · <commit state, for example "not committed" or "committed abc1234">
- Did: <one sentence on what this turn did>
- Open: <unfinished work, if any; leave the line out when there is none>
- Need from you: <actions for the user, if any; leave the line out when there is none>

## What Next

Put the suggested prompts in one fenced block under What Next. Write no text around the block.
Each prompt must make sense on its own and name a concrete action.

For one suggestion, use a plain fence:

```text
prompt: <the next prompt to send>
why: <optional reason, shown under the prompt and never sent>
suggestion: true
```

For two or more different suggestions, use a `next-prompts` fence with JSON:

```next-prompts
{
  "version": 1,
  "prompts": [
    { "id": "docs", "prompt": "Document the new function in README.md.", "why": "Users can find it.", "suggestion": true },
    { "id": "test", "prompt": "Add a test for the empty list.", "suggestion": false },
    { "id": "audit", "prompt": "Audit the build logs for warnings.", "thread": "new", "suggestion": false }
  ],
  "exclusiveGroups": [],
  "allowedCombinations": [["docs", "test"]]
}
```

Rules for the `next-prompts` block:

- Put the recommended prompt first and set `"suggestion": true` on it. Set `false` on the others.
- Each `id` is unique, lowercase, and matches `[a-z][a-z0-9-]*`.
- `exclusiveGroups` lists sets of prompts that conflict; the user can pick at most one per set. Use `[]` when nothing conflicts.
- `allowedCombinations` lists the exact sets the user may send together as one message. Add a set only when every prompt in it can run together. Use `[]` when each prompt must be sent alone.
- A set in either list holds 2 or more ids. A set never holds two prompts of the same exclusive group.
- Set `"thread": "new"` on a prompt that is unrelated to the current task. It starts in a new conversation, so its text must carry all needed context. Never put it in either list.
- Set `"goal": "done"` on the block when the task is finished.
- Keep commit and push prompts alone: never put them in `allowedCombinations`.
````

- A Recap in another shape is not folded: it stays in the reply text above the panel.
- Two older Recap shapes also work: `Branch`, `Did`, `Commit/push` as three labeled bullets, and
  `Branch`, `Commit/push`, `Did`, `Not yet`, `Need from you` as five.
- A plain fence can hold several `prompt:` lines, each with its own `why:`, `thread: new`, and
  `suggestion: true` lines. These prompts are always sent one at a time.
- In the panel, an exclusive group shows as a **Choose one** list with radio buttons, and allowed
  combinations show as checkboxes with **Send selected**. A `next-prompts` block that breaks a rule
  above is ignored, and the reply keeps the normal Paseo rendering.

## Data

- The daemon part reads the conversation's latest turn to check that a prompt is current, and sends
  prompts through the Paseo API. It makes no network calls of its own.
- It keeps the send state of each prompt in `$PASEO_HOME/plugin-data/next-prompt-panel/state.json`
  (mode 600), so a restart never sends a prompt twice.

## Requirements

- Paseo 0.12.0 or later. Turn on **Settings → Plugins → Enable plugins** first; it starts off.

## Install

From GitHub:

```bash
paseo plugin add git:HiepPP/hiep-paseo-plugin:plugins/next-prompt-panel
```

From a clone:

```bash
cd plugins/next-prompt-panel
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"
```

Reload after source edits with `paseo plugin reload next-prompt-panel`.
