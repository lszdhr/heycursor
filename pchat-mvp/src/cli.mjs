import { createStore, enqueueUserInput, listState } from './core/store.mjs';

const store = createStore({ dataDir: process.env.PCHAT_MVP_DATA_DIR });
const [command, ...args] = process.argv.slice(2);

if (command === 'send') {
  const { sessionId, content } = parseSendArgs(args);
  await enqueueUserInput(store, { sessionId, content });
  console.log(`queued input for session "${sessionId}"`);
} else if (command === 'state') {
  console.log(JSON.stringify(await listState(store), null, 2));
} else {
  printHelp();
  process.exit(command ? 1 : 0);
}

function parseSendArgs(args) {
  let sessionId = 'default';
  const contentParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--session') {
      sessionId = args[index + 1];
      index += 1;
    } else {
      contentParts.push(value);
    }
  }

  const content = contentParts.join(' ').trim();
  if (!content) {
    throw new Error('message content is required');
  }
  return { sessionId, content };
}

function printHelp() {
  console.log(`pchat-mvp commands:
  node src/cli.mjs send [--session default] "hello"
  node src/cli.mjs state

Environment:
  PCHAT_MVP_DATA_DIR  Optional data directory. Defaults to ~/.pchat-mvp`);
}
