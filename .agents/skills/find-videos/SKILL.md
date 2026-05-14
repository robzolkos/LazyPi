---
name: find-videos
description: Search YouTube for new Pi coding agent videos using agent-browser, list candidates, ask which ones to add, then add selected videos on a new branch using the add-video skill workflow.
---

# Find New Pi Videos for LazyPi

Use this skill for this repository only.

Invoke it with:

```text
/skill:find-videos [optional-search-query-or-notes]
```

Pi appends the command arguments to this skill as `User: <args>`.

## Goal

Find YouTube videos about the Pi coding agent that are not already listed in `docs/_data/videos.yml`, show the user the candidates, ask which ones to add, create a new git branch, and add the selected videos using the `add-video` skill workflow.

## Default search query and lookback

Default lookback: **last 10 days**.

If the user does not provide a query, search YouTube for:

```text
Pi coding agent
```

Also search these variants before concluding there are no more candidates, because YouTube ranking can miss relevant uploads for the default query:

```text
"Pi Coding Agent"
"Pi agent"
"Pi Agent" coding
"picodingagent"
"Pi.dev" coding
"pi-coding-agent"
"@earendil-works" Pi
"Earendil Works" Pi agent
```

The exact phrases `"Pi Coding Agent"` and `"Pi agent"`, plus `"picodingagent"` and `"Pi.dev" coding`, are required in the default workflow; do not skip them just because `Pi coding agent` returned results.

Prefer recent, relevant videos about the Pi coding agent. Avoid unrelated Raspberry Pi, math pi, or generic AI coding videos unless they clearly mention the Pi coding agent.

When possible, use YouTube's upload-date filter for recent videos, then enforce the 10-day lookback yourself using each video's publish date. If YouTube only shows relative ages, accept candidates whose visible age is clearly within 10 days, such as `minutes ago`, `hours ago`, `1 day ago`, or `9 days ago`. Exclude anything older than 10 days unless the user explicitly asks for a wider search.

## Pi coding agent relevance rules

Only propose a candidate if it has at least one strong Pi coding-agent signal:

- title, description, or transcript snippet says `Pi coding agent`
- title, description, or transcript snippet says `Pi agent` in a software/coding-agent context
- title, description, or transcript snippet says `pi-coding-agent`
- title, description, channel, or page metadata mentions `Earendil Works` in connection with Pi
- description links to `github.com/earendil-works/pi-coding-agent`
- description links to official Pi docs, packages, or LazyPi pages in a Pi coding-agent context

Reject candidates when the Pi reference is clearly about something else, including:

- Raspberry Pi hardware, OS, GPIO, homelabs, or Python-on-Raspberry-Pi content
- math π / pi day / numerical pi content
- generic AI coding agent content with no Pi-specific signal
- unrelated products or projects named Pi

If a result looks promising from the search page but lacks a strong signal, open the video page with agent-browser and inspect title, description snippets, metadata, and visible page text before proposing it. Mark borderline candidates as uncertain and explain why.

## Step 1: Read existing videos

Read `docs/_data/videos.yml` and collect existing YouTube IDs. Do not propose videos already present in the YAML.

## Step 2: Ensure agent-browser is available

Check for `agent-browser` before searching:

```bash
command -v agent-browser
```

If it is not found, tell the user that this skill needs Vercel's `agent-browser` CLI and ask whether to install it. Do not install without confirmation.

Recommended install from the `vercel-labs/agent-browser` package:

```bash
npm install -g agent-browser
agent-browser install
```

On Linux, use browser dependency installation if needed:

```bash
agent-browser install --with-deps
```

On macOS, Homebrew is also acceptable if the user prefers it:

```bash
brew install agent-browser
agent-browser install
```

After installation, verify it works:

```bash
agent-browser --version
```

If installation fails, stop and report the error instead of falling back to guessed YouTube data.

## Step 3: Search YouTube with agent-browser

Use `agent-browser` to open YouTube search results. Prefer upload-date sorted results for the 10-day lookback. Example:

```bash
agent-browser open "https://www.youtube.com/results?search_query=Pi%20coding%20agent%20Earendil%20Works&sp=CAI%253D"
```

If needed, also try YouTube's recent upload filters from the UI through agent-browser. The final candidate list must still be filtered to videos published within the last 10 days.

For each query, scroll the results page before extracting. YouTube lazy-loads and re-ranks results, so a single first-viewport extraction can miss relevant videos. Scroll down several times until the result count stops increasing, or until you have inspected at least 60 video results for that query when available. Then use `agent-browser eval` to extract results. Prefer extracting:

- video ID
- title
- channel
- URL
- duration, if visible
- publish age/date, if visible
- whether it appears to be a Short

Example extraction script, adapting selectors as needed:

```bash
agent-browser eval "JSON.stringify([...document.querySelectorAll('ytd-video-renderer,ytd-rich-item-renderer')].map((el) => { const link = el.querySelector('a#video-title,a.yt-simple-endpoint[href*=watch],a[href*=shorts]'); const href = link?.href || ''; const url = href.startsWith('http') ? href : new URL(href, location.origin).href; const id = new URL(url).searchParams.get('v') || url.match(/shorts\\/([^?&/]+)/)?.[1] || ''; const title = (link?.textContent || link?.getAttribute('title') || '').trim(); const channel = (el.querySelector('ytd-channel-name a,#channel-name a')?.textContent || '').trim(); const meta = [...el.querySelectorAll('#metadata-line span')].map((s) => s.textContent.trim()).filter(Boolean); const duration = (el.querySelector('ytd-thumbnail-overlay-time-status-renderer span,span.ytd-thumbnail-overlay-time-status-renderer')?.textContent || '').trim(); return { id, title, channel, url, duration, meta, isShort: url.includes('/shorts/') }; }).filter((v) => v.id && v.title))"
```

If a known-relevant result is missing from the first extraction, rerun the same query after additional scrolling and try a related exact phrase (for example `"Pi Coding Agent"`, `"Pi agent"`, `"picodingagent"`, or `"Pi.dev" coding`). YouTube results are volatile; do not assume the first page is exhaustive.

If YouTube blocks or returns incomplete results, use the normal browser page manually through agent-browser, or try a more specific search query. Do not use guessed metadata.

## Step 4: Filter candidates

Remove candidates that:

- are already in `docs/_data/videos.yml`
- are older than the configured lookback, defaulting to 10 days
- do not have at least one strong Pi coding-agent signal from the relevance rules above
- are clearly unrelated to the Pi coding agent
- are duplicate uploads of the same video
- are ads, playlists, channels, or non-video results

If uncertain after opening the video page and inspecting available metadata, keep the candidate only if it has a plausible Pi coding-agent signal, and mark it as uncertain when asking the user.

## Step 5: Present candidates and ask what to add

List the candidates in a numbered list with enough context for review:

```text
Found these new candidate videos:

1. Title — Channel — duration — published/age
   https://www.youtube.com/watch?v=...
2. Title — Channel — duration — published/age
   https://www.youtube.com/watch?v=...

Which should I add? Enter numbers like `1,3,4`, `all`, or `none`.
```

Use `AskUserQuestion` or the available interactive prompt mechanism. Accept:

- `all`
- `none`
- comma-separated numbers
- ranges such as `2-5`

If the user chooses `none`, stop without making changes.

## Step 6: Create a new branch

Before adding videos, create a new branch from the current branch. Use a descriptive branch name, for example:

```bash
git switch -c add-pi-videos-YYYYMMDD
```

If that branch exists, append a short suffix such as `-2`.

Do not create the branch until after the user confirms which videos to add.

## Step 7: Add each selected video using the add-video skill workflow

For each selected video URL, use the existing `add-video` skill workflow.

Preferred invocation:

```text
/skill:add-video <youtube-url>
```

If direct skill invocation is not available inside the current execution context, follow `.agents/skills/add-video/SKILL.md` exactly for each selected URL:

- fetch metadata with agent-browser
- detect Shorts
- ask for category for regular videos
- insert into `docs/_data/videos.yml`
- avoid duplicates
- keep `Short Pi` as the final category

Add videos one at a time so the user can choose categories for regular videos according to the `add-video` skill.

## Step 8: Confirm changes

After all selected videos are added, summarize:

- branch name
- number of videos added
- each added video title and URL
- category used for each video
- file changed: `docs/_data/videos.yml`

## Notes

- This skill searches and proposes videos; it should not silently add everything it finds.
- Always ask before installing `agent-browser`.
- Always ask before creating the branch and editing files.
- Do not add videos already present in the YAML.
- Shorts go to `Short Pi` automatically through the `add-video` workflow.
- Regular videos require category selection through the `add-video` workflow.
