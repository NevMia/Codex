#!/usr/bin/env node
const { runExtraction } = require('./extractor');
const { startGui } = require('./gui/server');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

(async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log('Usage: youtube-comments-extractor --video <url|id> --key <api_key> --out <folder> --order <time|relevance> --sleep_ms <n> --cap_per_thread <n> --dry_run');
    console.log('Without arguments, a local GUI opens in your default browser.');
    return;
  }

  if (!args.video) {
    startGui();
    return;
  }

  try {
    const result = await runExtraction({
      video: args.video,
      apiKey: args.key,
      out: args.out || './output',
      order: args.order || 'time',
      sleepMs: Number(args.sleep_ms || 50),
      capPerThread: Number(args.cap_per_thread || 5),
      dryRun: Boolean(args.dry_run),
      logger: (msg) => console.log(msg)
    });

    console.log('Done. Outputs:');
    Object.entries(result.files).forEach(([k, v]) => console.log(`- ${k}: ${v}`));
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  }
})();
