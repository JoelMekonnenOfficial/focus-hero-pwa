import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

test("the durable adapter exposes an explicit synthetic-only two-phase API", async () => {
  const source = await read("safety-ledger/indexeddb-ledger-adapter.mjs");
  assert.match(
    source,
    /SYNTHETIC_DATABASE_PREFIX\s*=\s*"focus-hero-synthetic-ledger-"/,
  );
  assert.match(source, /async reserveCommand\(inputCommand\)/);
  assert.match(source, /async finalizeCommand\(inputCommand\)/);
  assert.match(source, /async recoverCommands\(\)/);
  assert.match(
    source,
    /databaseName\.startsWith\(SYNTHETIC_DATABASE_PREFIX\)/,
  );
});

test("the isolated bridge orders reservation, application receipt, and finalization", async () => {
  const source = await read("safety-ledger/accounting-command-bridge.mjs");
  const reserveAt = source.indexOf(
    "await this.#adapter.reserveCommand(command)",
  );
  const applyAt = source.indexOf(
    "await this.#applyReservedCommand(reservation)",
  );
  const finalizeAt = source.indexOf(
    "await this.#adapter.finalizeCommand(command)",
  );
  assert.ok(reserveAt >= 0, "bridge must durably reserve first");
  assert.ok(applyAt > reserveAt, "application commit must follow reservation");
  assert.ok(finalizeAt > applyAt, "ledger finalization must follow receipt");
  assert.match(source, /"needs-application"/);
  assert.match(source, /"blocked-missing-application-receipt"/);

  for (const forbidden of [
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bfetch\s*\(/,
    /\bdocument\./,
    /\bwindow\./,
    /\bsupabase\b/i,
    /\bAWS\b/,
  ]) {
    assert.doesNotMatch(
      source,
      forbidden,
      `isolated bridge must not contain ${forbidden}`,
    );
  }
});

test("the synthetic bridge is hard-blocked from the application runtime", async () => {
  const [indexHtml, focusHeroHtml, economy] = await Promise.all([
    read("index.html"),
    read("focus-hero.html"),
    read("focus-economy.js"),
  ]);
  assert.equal(indexHtml, focusHeroHtml, "HTML mirrors must remain identical");
  for (const source of [indexHtml, focusHeroHtml, economy]) {
    assert.doesNotMatch(
      source,
      /safety-ledger\/accounting-command-bridge|indexeddb-ledger-adapter|SyntheticAccountingCommandBridge/,
    );
    assert.doesNotMatch(source, /\.reserveCommand\(|\.finalizeCommand\(/);
  }
});

test("the integration contract records the exact runtime no-go", async () => {
  const [contract, packageJson] = await Promise.all([
    read("LEDGER_INTEGRATION_CONTRACT.md"),
    read("safety-ledger/package.json"),
  ]);
  assert.match(contract, /Runtime bridge blocker audit \(2026-07-26\)/);
  assert.match(
    contract,
    /atomically commit application effect plus reservation-bound receipt/,
  );
  assert.match(
    contract,
    /partial bridge would create the appearance of atomicity/,
  );
  assert.match(contract, /NO-GO for deployment/);
  assert.match(packageJson, /tests\/accounting-command-bridge\.test\.mjs/);
});
