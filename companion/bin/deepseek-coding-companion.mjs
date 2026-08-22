#!/usr/bin/env node
import { runCli } from "../src/companion.mjs";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`Companion error: ${error.message}`);
  process.exitCode = 1;
});
