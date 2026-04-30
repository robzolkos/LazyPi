---
name: add-video
description: Add a new YouTube video to the LazyPi videos page. Use when given a YouTube URL to add to the site. Fetches title, channel, duration, and publish date automatically via agent-browser, then asks the user which category to place it in.
---

# Add Video to LazyPi

Use this skill for this repository only.

Invoke it with:

```text
/skill:add-video <youtube-url>
```

Pi appends the command arguments to this skill as `User: <args>`.

## Goal

Add a YouTube video to `docs/_data/videos.yml` with all metadata fetched automatically, inserted in the correct category and sorted in reverse chronological order.

## Step 1: Extract the video ID

Parse the YouTube URL to extract the video ID.

Supported formats:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`

## Step 2: Fetch metadata via agent-browser

Use `agent-browser` to open the YouTube watch page and extract all four fields in a single session:

```bash
agent-browser open "https://www.youtube.com/watch?v=VIDEO_ID"
agent-browser eval "JSON.stringify({ title: document.querySelector('meta[name=title]')?.content || document.title.replace(/ - YouTube$/, ''), channel: document.querySelector('span[itemprop=author] link[itemprop=name]')?.getAttribute('content') || document.querySelector('meta[itemprop=channelId]')?.content, duration: document.querySelector('meta[itemprop=duration]')?.content, published: document.querySelector('meta[itemprop=datePublished]')?.content })"
```

The oEmbed API (`https://www.youtube.com/oembed?url=URL&format=json`) is a reliable fallback for `title` and `author_name` (channel) if agent-browser returns unexpected values.

### Convert the raw values

**duration** — YouTube returns ISO 8601 (e.g. `PT34M48S`). Convert to `M:SS` or `H:MM:SS`:
- `PT9M24S` → `9:24`
- `PT1H33M56S` → `1:33:56`
- `PT0M38S` → `0:38`
- Pad seconds to two digits always.

**published** — YouTube returns a full ISO 8601 timestamp (e.g. `2026-04-18T04:03:51-07:00`). Truncate to the date portion only: `2026-04-18`.

## Step 3: Present the category list and ask the user

Read `docs/_data/videos.yml` to get the current categories in order. Present them as a numbered list:

```
Which category should this video go in?

1. Intro to Pi
2. Full Course Pi
3. Advanced Pi
4. Slice of Pi

Enter a number:
```

Use `AskUserQuestion` (or equivalent interactive prompt) to get the user's choice. Accept the number only.

## Step 4: Insert into the YAML

Read `docs/_data/videos.yml`. Find the chosen category block and insert the new video entry **at the top of that category's `videos:` list** (newest-first ordering).

Entry format:
```yaml
    - id: VIDEO_ID
      title: "Video title here"
      channel: Channel Name
      duration: "M:SS"
      published: "YYYY-MM-DD"
```

Do not quote `channel` unless it contains a colon or special character. Always quote `title` and `duration`. Always quote `published`.

Preserve all existing entries, whitespace style, and ordering in the file.

## Step 5: Confirm

Tell the user what was added:
- video title
- channel
- duration
- publish date
- which category it was placed in

## Notes

- Do not add a video that already exists in the YAML (check by `id` before inserting).
- If agent-browser cannot fetch a field, ask the user for it rather than leaving it blank.
- The YAML file is the single source of truth — no other files need updating when adding a video.
