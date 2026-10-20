Next prompt panel turns the end of an agent reply into a panel. The Recap shows as labeled fields
with the branch and commit state, and each suggested next prompt gets its own row with Send, Edit,
and New thread buttons. Click Send and the prompt goes to the same conversation, with no copy and
paste.

The panel appears only when the agent ends its reply with a What Next section in the format below.
A reply without it keeps the normal Paseo rendering. The panel replaces the whole reply, because
Paseo 0.12 timeline transformers return plugin items only, so the plugin renders the reply text
above the panel itself. Code blocks have no syntax colors there, and tables show as monospace text.

## Setup

Add these rules to your agent instructions, such as `CLAUDE.md` or `AGENTS.md`:

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

A Recap in another shape is not folded and stays in the reply text. Two older shapes also work:
`Branch`, `Did`, `Commit/push` as three labeled bullets, and `Branch`, `Commit/push`, `Did`,
`Not yet`, `Need from you` as five. A `next-prompts` block that breaks a rule is ignored.

Requires Paseo 0.12.0 or later.

## What the buttons do

- Send sends the prompt in this conversation and keeps your composer draft. Each prompt is sent at
  most once; if the result is unknown, the button shows Check chat and is not retried.
- Edit writes the prompt into the composer so you can change it first. Desktop and web only; mobile
  hides it. Paseo 0.12 has no composer API for plugins, so Edit writes into the composer field of
  the page.
- New thread starts the prompt in a new conversation in the same folder, with the same provider,
  model, mode, and thinking option. On desktop and web, hover over Send and hold Command (Control
  off macOS) to swap Send for New thread. Mobile shows a separate New thread button.
- A prompt marked `thread: new` is listed under Other work and offers Start in new thread.
- Prompts allowed together show as checkboxes with Send selected, and exclusive prompts as a Choose
  one list. Selected prompts are sent as one numbered message.
- A prompt that asks to commit gets a Commit button, which sends `/commit --no-push` followed by the
  prompt; Commit & Push sends `/commit`. Your agent needs a `/commit` command or skill for this;
  without one, it receives that text as a plain message. Git actions are always sent alone.
- Only the latest reply has active buttons. Earlier panels stay readable.

## Data access

The daemon part reads the latest turn of the conversation through the Paseo API, to check that a
prompt is still current, and sends prompts or creates conversations through the same API. It makes
no network calls of its own. It keeps the send state of each prompt in
`$PASEO_HOME/plugin-data/next-prompt-panel/state.json` (mode 600), so a restart never sends a
prompt twice. Prompts you send go to your agent provider like any other message.
