/*
 * Synthetic-only two-phase accounting coordinator.
 *
 * This module is deliberately not loaded by Focus Hero. It has no DOM,
 * storage, profile, cloud, network, backup, recovery, or credential access.
 * The injected application participant must atomically persist its own state
 * change and application receipt before returning from applyReservedCommand.
 */

import {
  canonicalJson,
  sha256Hex,
} from "./browser-ledger.mjs";
import {
  SyntheticIndexedDbLedgerAdapter,
} from "./indexeddb-ledger-adapter.mjs";

export const SYNTHETIC_APPLICATION_RECEIPT_FORMAT =
  "focus-hero-synthetic-application-receipt-v1";

function parseCanonical(value) {
  return JSON.parse(canonicalJson(value));
}

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSha256(value, label) {
  requireText(value, label);
  if (value.length !== 64) {
    throw new TypeError(`${label} must be lowercase SHA-256 hex`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) {
      throw new TypeError(`${label} must be lowercase SHA-256 hex`);
    }
  }
  return value;
}

function requireEventId(value, label) {
  requireText(value, label);
  if (!value.startsWith("fh_evt_")) {
    throw new TypeError(`${label} must be a Focus Hero event ID`);
  }
  requireSha256(value.slice("fh_evt_".length), label);
  return value;
}

function exactObject(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} has an invalid envelope`);
  }
  return value;
}

function validateReservation(input) {
  const reservation = parseCanonical(input);
  exactObject(
    reservation,
    [
      "actorSequence",
      "command",
      "commandDigest",
      "commandId",
      "eventId",
      "finalized",
      "newlyReserved",
      "reservationDigest",
      "resumedReservation",
      "status",
    ],
    "reservation",
  );
  requireText(reservation.commandId, "reservation.commandId");
  requireSha256(reservation.commandDigest, "reservation.commandDigest");
  requireSha256(
    reservation.reservationDigest,
    "reservation.reservationDigest",
  );
  requireEventId(reservation.eventId, "reservation.eventId");
  if (!Number.isSafeInteger(reservation.actorSequence) ||
      reservation.actorSequence < 1) {
    throw new TypeError(
      "reservation.actorSequence must be a positive safe integer",
    );
  }
  if (reservation.command.commandId !== reservation.commandId) {
    throw new TypeError("reservation command ID mismatch");
  }
  return reservation;
}

function validateApplicationReceipt(input, reservation) {
  const receipt = parseCanonical(input);
  exactObject(
    receipt,
    [
      "applicationDigest",
      "commandDigest",
      "commandId",
      "format",
      "reservationDigest",
    ],
    "application receipt",
  );
  if (receipt.format !== SYNTHETIC_APPLICATION_RECEIPT_FORMAT) {
    throw new TypeError("application receipt format is unsupported");
  }
  requireSha256(receipt.applicationDigest, "applicationDigest");
  requireSha256(receipt.commandDigest, "commandDigest");
  requireSha256(receipt.reservationDigest, "reservationDigest");
  if (
    receipt.commandId !== reservation.commandId ||
    receipt.commandDigest !== reservation.commandDigest ||
    receipt.reservationDigest !== reservation.reservationDigest
  ) {
    throw new SyntheticApplicationReceiptError(
      reservation.commandId,
      "application receipt does not match the durable reservation",
    );
  }
  return receipt;
}

export class SyntheticApplicationReceiptError extends Error {
  constructor(commandId, message = "application receipt is unavailable") {
    super(`${message}: ${commandId}`);
    this.name = "SyntheticApplicationReceiptError";
    this.commandId = commandId;
  }
}

export async function createSyntheticApplicationReceipt(
  reservationInput,
  applicationState,
) {
  const reservation = validateReservation(reservationInput);
  const applicationDigest = await sha256Hex(canonicalJson({
    commandId: reservation.commandId,
    commandDigest: reservation.commandDigest,
    reservationDigest: reservation.reservationDigest,
    applicationState,
  }));
  return parseCanonical({
    format: SYNTHETIC_APPLICATION_RECEIPT_FORMAT,
    commandId: reservation.commandId,
    commandDigest: reservation.commandDigest,
    reservationDigest: reservation.reservationDigest,
    applicationDigest,
  });
}

export class SyntheticAccountingCommandBridge {
  #adapter;
  #applyReservedCommand;
  #readApplicationReceipt;
  #verifyApplicationReceipt;

  constructor({
    adapter,
    applicationParticipant,
  }) {
    if (!(adapter instanceof SyntheticIndexedDbLedgerAdapter)) {
      throw new TypeError(
        "adapter must be a SyntheticIndexedDbLedgerAdapter",
      );
    }
    exactObject(
      applicationParticipant,
      [
        "applyReservedCommand",
        "readApplicationReceipt",
        "verifyApplicationReceipt",
      ],
      "applicationParticipant",
    );
    this.#adapter = adapter;
    this.#applyReservedCommand = requireFunction(
      applicationParticipant.applyReservedCommand,
      "applicationParticipant.applyReservedCommand",
    );
    this.#readApplicationReceipt = requireFunction(
      applicationParticipant.readApplicationReceipt,
      "applicationParticipant.readApplicationReceipt",
    );
    this.#verifyApplicationReceipt = requireFunction(
      applicationParticipant.verifyApplicationReceipt,
      "applicationParticipant.verifyApplicationReceipt",
    );
  }

  async #readVerifiedReceipt(reservation) {
    const raw = await this.#readApplicationReceipt(reservation);
    if (raw === null || raw === undefined) return null;
    const receipt = validateApplicationReceipt(raw, reservation);
    const verified = await this.#verifyApplicationReceipt(
      receipt,
      reservation,
    );
    if (verified !== true) {
      throw new SyntheticApplicationReceiptError(
        reservation.commandId,
        "application receipt did not verify against application state",
      );
    }
    return receipt;
  }

  async execute(inputCommand) {
    const command = parseCanonical(inputCommand);
    const reservation = validateReservation(
      await this.#adapter.reserveCommand(command),
    );
    let receipt = await this.#readVerifiedReceipt(reservation);
    if (receipt === null) {
      if (reservation.finalized) {
        throw new SyntheticApplicationReceiptError(
          reservation.commandId,
          "finalized ledger command has no application receipt",
        );
      }
      const applied = await this.#applyReservedCommand(reservation);
      receipt = validateApplicationReceipt(applied, reservation);
      const verified = await this.#verifyApplicationReceipt(
        receipt,
        reservation,
      );
      if (verified !== true) {
        throw new SyntheticApplicationReceiptError(
          reservation.commandId,
          "new application receipt did not verify against application state",
        );
      }
    }
    const finalization = parseCanonical(
      await this.#adapter.finalizeCommand(command),
    );
    return parseCanonical({
      status: finalization.committed
        ? "finalized"
        : "already-finalized",
      reservation,
      applicationReceipt: receipt,
      finalization,
    });
  }

  async recover() {
    const reservations = await this.#adapter.recoverCommands();
    const results = [];
    for (const input of reservations) {
      const reservation = validateReservation(input);
      const receipt = await this.#readVerifiedReceipt(reservation);
      if (receipt === null) {
        results.push(parseCanonical({
          status: reservation.finalized
            ? "blocked-missing-application-receipt"
            : "needs-application",
          reservation,
          applicationReceipt: null,
          finalization: null,
        }));
        continue;
      }
      if (reservation.finalized) {
        results.push(parseCanonical({
          status: "already-finalized",
          reservation,
          applicationReceipt: receipt,
          finalization: null,
        }));
        continue;
      }
      const finalization = parseCanonical(
        await this.#adapter.finalizeCommand(reservation.command),
      );
      results.push(parseCanonical({
        status: "recovered-finalization",
        reservation,
        applicationReceipt: receipt,
        finalization,
      }));
    }
    return parseCanonical(results);
  }
}
