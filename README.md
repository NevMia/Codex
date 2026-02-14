# YouTube Comments Extractor (Node.js + pkg)

Single-file Windows `.exe` + full source for extracting **all top-level comments and all replies** from a YouTube video using the official YouTube Data API v3 (API key only, no OAuth).

## Features
- Official YouTube Data API v3 only (`commentThreads.list` + `comments.list`)
- Full pagination with `pageToken` loops until no `nextPageToken`
- Exports:
  - `comments_raw.jsonl` (no dedupe; every fetched comment/reply)
  - `comments_deduped.jsonl` (dedupe by `textClean`, keep first)
  - `comments_flat.csv`
  - `comments_flat.txt`
  - `meta_summary.json`
  - `thread_stats.csv`
  - `duplicate_phrases.csv`
  - `top_level_only.csv`
  - `replies_only.csv`
- `duplicate_phrases.csv` (`textClean,count,exampleCommentId,isReplyExample`)
- Includes `likeCount` and `weight = ln(1 + likeCount)`
- Minimal cleaning only:
  - strip URLs
  - normalize whitespace
  - exact dedupe by `textClean` (keep first)
- Anti “reply echo” cap for summary stats only (`cap_per_thread`, default `5`)
- Retries transient/network/5xx/quota-rate errors with exponential backoff + jitter
- Polite pacing between requests (`sleep_ms`, default `50`)
- UTF-8 outputs preserving emojis
- CLI + lightweight GUI (opens default browser)

## Requirements
- Node.js 18+ (recommended 20+)
- npm

## Install
```bash
npm install
```

This creates `package-lock.json`, allowing consistent `npm ci` installs afterwards.

## Build Windows EXE (single file)
```bash
npm run build
```
Output:
- `dist/youtube-comments-extractor.exe`

## One-click Windows build
Use `build.bat` (uses `npm ci` if `package-lock.json` exists, otherwise `npm install`):
```bat
if exist package-lock.json (
  npm ci
) else (
  npm install
)
npm run build
```

## Get a YouTube API key
1. Open Google Cloud Console.
2. Create/select a project.
3. Enable **YouTube Data API v3**.
4. Create credentials → **API key**.
5. Restrict key as needed.

## Run (CLI)
```bash
node src/index.js --video "https://www.youtube.com/watch?v=VIDEO_ID" --key "YOUR_API_KEY" --out "./output" --order time --sleep_ms 50 --cap_per_thread 5
```

Dry run (first page of threads + max one page replies per thread):
```bash
node src/index.js --video VIDEO_ID --key YOUR_API_KEY --dry_run --out ./output_dry
```

CLI flags:
- `--video`
- `--key`
- `--out`
- `--order` (`time` or `relevance`)
- `--sleep_ms`
- `--cap_per_thread`
- `--dry_run`

## Run GUI (double-click EXE behavior)
- Running without `--video` launches a local GUI in your default browser.
```bash
node src/index.js
```
Or double-click the built `.exe`.

If double-clicking the EXE does not auto-open your browser, the app still runs and prints the local GUI URL in console; open that URL manually.

GUI fields:
- `video_url_or_id`
- `api_key`
- `output_folder`
- `order`
- `sleep_ms`
- `cap_per_thread`
- Start button
- progress indicator
- live logs
- Open output folder button (enabled after successful run)

## Output schema
Each record contains:
- `videoId`
- `threadId`
- `commentId`
- `parentId`
- `isReply`
- `author`
- `authorChannelId`
- `publishedAt`
- `updatedAt`
- `likeCount`
- `weight`
- `textOriginal`
- `textClean`
- `totalReplyCount`

CSV column order:
`videoId,threadId,commentId,parentId,isReply,author,authorChannelId,publishedAt,updatedAt,likeCount,weight,textClean,textOriginal,totalReplyCount`

TXT format:
```text
[TOP|REPLY] likes=X weight=Y author=... publishedAt=...
textOriginal
---
```

## Meta summary
`meta_summary.json` includes:
- `videoId`
- `startedAt`, `finishedAt`
- `topLevelCount`, `replyCountRaw`, `replyCountCappedForSummary`
- `totalCountRaw`, `totalCountCappedForSummary`
- `uniqueAuthorsCount`
- `totalLikeCount`
- `requestCounts`
- `estimatedQuotaUsed`
- `settings` (`order`, `sleep_ms`, `cap_per_thread`, `dedupeCount`, etc.)

## Thread stats
`thread_stats.csv` columns:
`threadId,topLevelCommentId,totalReplyCount,repliesFetched,repliesCappedForSummary,uniqueAuthorsInThread,topAuthorShare,flag_reply_war`

Heuristic:
`flag_reply_war = repliesFetched >= 25 AND (uniqueAuthorsInThread <= 4 OR topAuthorShare >= 0.45)`

## Tests
```bash
npm test
```
Covers:
- `parseVideoId()`
- `cleanText()`
- pagination termination

## Windows commands (exact)
Build (first run to generate lockfile):
```powershell
npm install
```

Build (after lockfile exists):
```powershell
npm ci
npm run build
```
Run exe (CLI):
```powershell
.\dist\youtube-comments-extractor.exe --video "https://www.youtube.com/watch?v=VIDEO_ID" --key "YOUR_API_KEY" --out ".\output" --order time --sleep_ms 50 --cap_per_thread 5
```
Run exe GUI:
```powershell
.\dist\youtube-comments-extractor.exe
```
