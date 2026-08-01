import "./domain-receipt-ledger.js";

const api = globalThis.FocusHeroDomainReceiptLedger;

export const DOMAIN_RECEIPT_LEDGER_VERSION = api.DOMAIN_RECEIPT_LEDGER_VERSION;
export const SYNTHETIC_SESSION_RECEIPT_FIXTURE_POLICY_VERSION =
  api.SYNTHETIC_SESSION_RECEIPT_FIXTURE_POLICY_VERSION;
export const SESSION_RECEIPT_POLICY_VERSION = api.SESSION_RECEIPT_POLICY_VERSION;
export const stableReceiptToken = api.stableReceiptToken;
export const deriveSyntheticSessionReceipts = api.deriveSyntheticSessionReceipts;
export const deriveSessionReceipts = api.deriveSessionReceipts;
export const SessionReceiptLedger = api.SessionReceiptLedger;
