const fs = require('fs');
const path = require('path');
const { cleanText, csvEscape, parseVideoId } = require('./utils');
const { paginate } = require('./youtubeApi');

const CSV_COLUMNS = [
  'videoId','threadId','commentId','parentId','isReply','author','authorChannelId','publishedAt','updatedAt','likeCount','weight','textClean','textOriginal','totalReplyCount'
];

function toRow(record) {
  return CSV_COLUMNS.map((c) => csvEscape(record[c])).join(',') + '\n';
}

function appendTxt(stream, rec) {
  stream.write(`[${rec.isReply ? 'REPLY' : 'TOP'}] likes=${rec.likeCount} weight=${rec.weight.toFixed(4)} author=${rec.author} publishedAt=${rec.publishedAt}\n`);
  stream.write(`${rec.textOriginal}\n---\n`);
}

function normRecord(base) {
  const likeCount = Number(base.likeCount || 0);
  return {
    ...base,
    likeCount,
    weight: Math.log(1 + likeCount),
    textOriginal: base.textOriginal || '',
    textClean: cleanText(base.textOriginal || '')
  };
}

async function runExtraction(options) {
  const startedAt = new Date().toISOString();
  const videoId = parseVideoId(options.video);
  if (!videoId) throw new Error('Invalid video URL or ID.');
  if (!options.apiKey) throw new Error('Missing API key.');

  const outDir = path.resolve(options.out || './output');
  fs.mkdirSync(outDir, { recursive: true });

  const files = {
    jsonl: path.join(outDir, 'comments_raw.jsonl'),
    csv: path.join(outDir, 'comments_flat.csv'),
    txt: path.join(outDir, 'comments_flat.txt'),
    topCsv: path.join(outDir, 'top_level_only.csv'),
    replyCsv: path.join(outDir, 'replies_only.csv'),
    threadStats: path.join(outDir, 'thread_stats.csv'),
    meta: path.join(outDir, 'meta_summary.json')
  };

  const wsJsonl = fs.createWriteStream(files.jsonl, { encoding: 'utf8' });
  const wsCsv = fs.createWriteStream(files.csv, { encoding: 'utf8' });
  const wsTxt = fs.createWriteStream(files.txt, { encoding: 'utf8' });
  const wsTop = fs.createWriteStream(files.topCsv, { encoding: 'utf8' });
  const wsReply = fs.createWriteStream(files.replyCsv, { encoding: 'utf8' });

  wsCsv.write(CSV_COLUMNS.join(',') + '\n');
  wsTop.write(CSV_COLUMNS.join(',') + '\n');
  wsReply.write(CSV_COLUMNS.join(',') + '\n');

  const requestCounts = { 'commentThreads': 0, 'comments': 0 };
  const dedupe = new Map();
  const seenAuthors = new Set();

  let totalLikeCount = 0;
  let topLevelExported = 0;
  let repliesExported = 0;
  let rawRepliesTotal = 0;

  const threadStats = new Map();
  const logger = options.logger || (() => {});

  try {
    for await (const page of paginate({
      endpoint: 'commentThreads',
      apiKey: options.apiKey,
      params: {
        part: 'snippet',
        videoId,
        order: options.order || 'time',
        textFormat: 'plainText'
      },
      requestCounter: requestCounts,
      sleepMs: options.sleepMs,
      dryRun: options.dryRun,
      logger
    })) {
      for (const item of page.items || []) {
        const top = item.snippet?.topLevelComment;
        if (!top) continue;

        const record = normRecord({
          videoId,
          threadId: item.id,
          commentId: top.id,
          parentId: '',
          isReply: false,
          author: top.snippet?.authorDisplayName || '',
          authorChannelId: top.snippet?.authorChannelId?.value || '',
          publishedAt: top.snippet?.publishedAt || '',
          updatedAt: top.snippet?.updatedAt || '',
          likeCount: top.snippet?.likeCount || 0,
          textOriginal: top.snippet?.textDisplay || top.snippet?.textOriginal || '',
          totalReplyCount: item.snippet?.totalReplyCount ?? 0
        });

        if (!dedupe.has(record.textClean)) {
          dedupe.set(record.textClean, true);
          wsJsonl.write(JSON.stringify(record) + '\n');
          wsCsv.write(toRow(record));
          wsTop.write(toRow(record));
          appendTxt(wsTxt, record);
          topLevelExported += 1;
          totalLikeCount += record.likeCount;
          seenAuthors.add(record.authorChannelId || record.author);
        }

        const threadId = item.id;
        if (!threadStats.has(threadId)) {
          threadStats.set(threadId, {
            threadId,
            topLevelCommentId: top.id,
            totalReplyCount: item.snippet?.totalReplyCount ?? 0,
            repliesFetched: 0,
            authors: new Map()
          });
        }

        if ((item.snippet?.totalReplyCount || 0) > 0) {
          let replyPageCount = 0;
          for await (const rPage of paginate({
            endpoint: 'comments',
            apiKey: options.apiKey,
            params: { part: 'snippet', parentId: top.id, textFormat: 'plainText' },
            requestCounter: requestCounts,
            sleepMs: options.sleepMs,
            dryRun: options.dryRun,
            logger
          })) {
            replyPageCount += 1;
            for (const reply of rPage.items || []) {
              rawRepliesTotal += 1;
              const rr = normRecord({
                videoId,
                threadId,
                commentId: reply.id,
                parentId: reply.snippet?.parentId || top.id,
                isReply: true,
                author: reply.snippet?.authorDisplayName || '',
                authorChannelId: reply.snippet?.authorChannelId?.value || '',
                publishedAt: reply.snippet?.publishedAt || '',
                updatedAt: reply.snippet?.updatedAt || '',
                likeCount: reply.snippet?.likeCount || 0,
                textOriginal: reply.snippet?.textDisplay || reply.snippet?.textOriginal || '',
                totalReplyCount: null
              });

              const stats = threadStats.get(threadId);
              stats.repliesFetched += 1;
              const authorKey = rr.authorChannelId || rr.author || 'unknown';
              stats.authors.set(authorKey, (stats.authors.get(authorKey) || 0) + 1);

              if (!dedupe.has(rr.textClean)) {
                dedupe.set(rr.textClean, true);
                wsJsonl.write(JSON.stringify(rr) + '\n');
                wsCsv.write(toRow(rr));
                wsReply.write(toRow(rr));
                appendTxt(wsTxt, rr);
                seenAuthors.add(rr.authorChannelId || rr.author);
                totalLikeCount += rr.likeCount;
                repliesExported += 1;
              }
            }
            if (options.dryRun && replyPageCount >= 1) break;
          }
        }
      }
    }
  } catch (error) {
    const reason = error.response?.data?.error?.errors?.[0]?.reason;
    if (error.response?.status === 403 && reason === 'commentsDisabled') {
      throw new Error('Comments are disabled for this video (403 commentsDisabled).');
    }
    if (reason === 'rateLimitExceeded' || reason === 'quotaExceeded') {
      throw new Error(`YouTube API quota/rate issue: ${reason}. Please wait and retry.`);
    }
    throw error;
  } finally {
    wsJsonl.end(); wsCsv.end(); wsTxt.end(); wsTop.end(); wsReply.end();
  }

  const cap = Number.isFinite(options.capPerThread) ? options.capPerThread : 5;
  const threadStatsPath = files.threadStats;
  const wsThread = fs.createWriteStream(threadStatsPath, { encoding: 'utf8' });
  wsThread.write('threadId,topLevelCommentId,totalReplyCount,repliesFetched,uniqueAuthorsInThread,topAuthorShare,flag_reply_war\n');

  for (const stat of threadStats.values()) {
    const counts = Array.from(stat.authors.values()).sort((a, b) => b - a);
    const repliesForSummary = Math.min(stat.repliesFetched, cap);
    const uniqueAuthorsInThread = stat.authors.size;
    const topAuthorShare = stat.repliesFetched === 0 ? 0 : (counts[0] || 0) / stat.repliesFetched;
    const flag = stat.repliesFetched >= 25 && (uniqueAuthorsInThread <= 4 || topAuthorShare >= 0.45);
    wsThread.write([
      csvEscape(stat.threadId),
      csvEscape(stat.topLevelCommentId),
      stat.totalReplyCount,
      stat.repliesFetched,
      uniqueAuthorsInThread,
      topAuthorShare.toFixed(4),
      flag
    ].join(',') + '\n');
    stat.repliesForSummary = repliesForSummary;
  }
  wsThread.end();

  const replyCountCappedForSummary = Array.from(threadStats.values())
    .reduce((acc, s) => acc + Math.min(s.repliesFetched, cap), 0);

  const replyCountRaw = Array.from(threadStats.values())
    .reduce((acc, s) => acc + s.repliesFetched, 0);
  const meta = {
    videoId,
    startedAt,
    finishedAt: new Date().toISOString(),
    topLevelCount: topLevelExported,
    replyCountRaw,
    replyCountCappedForSummary,
    totalCountRaw: topLevelExported + replyCountRaw,
    totalCountCappedForSummary: topLevelExported + replyCountCappedForSummary,
    uniqueAuthorsCount: seenAuthors.size,
    totalLikeCount,
    requestCounts,
    estimatedQuotaUsed: (requestCounts.commentThreads || 0) + (requestCounts.comments || 0),
    settings: {
      order: options.order || 'time',
      sleep_ms: options.sleepMs,
      cap_per_thread: cap,
      dedupeCount: dedupe.size,
      rawRepliesFetched: rawRepliesTotal,
      repliesExportedAfterDedupe: repliesExported
    }
  };

  fs.writeFileSync(files.meta, JSON.stringify(meta, null, 2), 'utf8');
  return { files, meta };
}

module.exports = { runExtraction, CSV_COLUMNS };
