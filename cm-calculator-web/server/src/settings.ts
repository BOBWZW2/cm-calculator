import fs from "node:fs";
import path from "node:path";
import { defaultInputRoot } from "./config.js";
import { getDb } from "./db.js";

const inputRootKey = "input_root";

export interface InputSettings {
  inputRoot: string;
  inputRootExists: boolean;
  inputRootSource: "metadata" | "env" | "default";
}

function normalizeInputRoot(inputRoot: string) {
  const nextPath = inputRoot.trim();

  if (!nextPath) {
    throw new Error("Input path cannot be empty.");
  }

  return path.resolve(nextPath);
}

function setMetadata(key: string, value: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function getMetadata(key: string) {
  const db = getDb();
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;

  return row?.value ?? null;
}

export function getInputSettings(): InputSettings {
  const fromMetadata = getMetadata(inputRootKey);
  const fromEnv = process.env.CM_INPUT_ROOT?.trim();
  const inputRoot = normalizeInputRoot(fromMetadata ?? fromEnv ?? defaultInputRoot);

  return {
    inputRoot,
    inputRootExists: fs.existsSync(inputRoot),
    inputRootSource: fromMetadata ? "metadata" : fromEnv ? "env" : "default",
  };
}

export function getConfiguredInputRoot() {
  return getInputSettings().inputRoot;
}

export function updateInputRoot(inputRoot: string) {
  const normalizedPath = normalizeInputRoot(inputRoot);
  setMetadata(inputRootKey, normalizedPath);
  return getInputSettings();
}
