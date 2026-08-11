/**
 * Pass-through adapter: one event per stdout line as JSON.
 *
 * For programmatic consumers (future React/Slack UIs), pipe stdout through
 * `--emit jsonl`. Schema matches the sidecar .jsonl exactly.
 */

import type { AdapterSink, TranscribeEvent } from "../lib";

export function jsonlSink(stream: NodeJS.WriteStream = process.stdout): AdapterSink {
  return {
    onEvent(ev: TranscribeEvent) {
      stream.write(JSON.stringify(ev) + "\n");
    },
  };
}
