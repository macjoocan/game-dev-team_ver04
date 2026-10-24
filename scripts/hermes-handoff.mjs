#!/usr/bin/env node
// Compatibility entry point. No Hermes installation is required.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHandoffCli } from './team-handoff.mjs';
export { collectHandoff } from './team-handoff.mjs';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runHandoffCli();
