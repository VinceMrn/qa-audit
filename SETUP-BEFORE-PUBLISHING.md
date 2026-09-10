# Before you publish this repo

Three placeholders need replacing, then delete this file.

## 1. Replace `OWNER` and `REPO`

They appear in:

- `.claude-plugin/marketplace.json` — `owner.url`, `homepage`, `repository`
- `plugins/qa-live/.claude-plugin/plugin.json` — `homepage`, `repository`
- `README.md` — the install snippet

One pass does it (macOS/BSD sed shown; on GNU sed use `-i` with no argument):

```bash
grep -rl 'OWNER/REPO\|github.com/OWNER' . --exclude-dir=.git \
  | xargs sed -i '' 's|OWNER/REPO|your-user/your-repo|g; s|github.com/OWNER|github.com/your-user|g'
```

Then check nothing was missed:

```bash
grep -rn 'OWNER\|REPO' . --exclude-dir=.git --exclude=SETUP-BEFORE-PUBLISHING.md
```

## 2. Check the marketplace name

`.claude-plugin/marketplace.json` declares `"name": "qa-live"`. That name is what users
type after the `@`:

```
/plugin install qa-live@qa-live
```

If you rename the marketplace, update the install snippet in `README.md` to match.

## 3. Verify the install path end to end

From a different directory, with the repo pushed:

```
/plugin marketplace add your-user/your-repo
/plugin install qa-live@qa-live
```

Then start a fresh Claude Code session and confirm `qa-live` shows up in the skill list.

## Optional

- Add a real example report under `examples/` — it is the most persuasive thing on the page.
- A short screen recording of a run in the README goes further than any description.
