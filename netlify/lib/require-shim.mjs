// Gives bundled CommonJS code (the pg library) a real `require` for Node built-ins
// like "events" and "net". Must be imported before anything else.
import { createRequire } from 'node:module';
globalThis.require = createRequire(import.meta.url);
