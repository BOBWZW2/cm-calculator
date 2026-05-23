import { fxApiUrl } from "./config.js";
import { getDb } from "./db.js";
import type { ExchangeRatesSnapshot } from "./types.js";

function cacheRates(snapshot: ExchangeRatesSnapshot) {
  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO exchange_rate_cache (base_currency, quote_currency, rate, provider, effective_date, fetched_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(base_currency, quote_currency) DO UPDATE SET
      rate = excluded.rate,
      provider = excluded.provider,
      effective_date = excluded.effective_date,
      fetched_at = CURRENT_TIMESTAMP
  `);

  statement.run(snapshot.baseCurrency, snapshot.baseCurrency, 1, snapshot.provider, snapshot.effectiveDate);

  for (const [quoteCurrency, rate] of Object.entries(snapshot.rates)) {
    statement.run(snapshot.baseCurrency, quoteCurrency, rate, snapshot.provider, snapshot.effectiveDate);
  }
}

function readCachedRates(): ExchangeRatesSnapshot | null {
  const db = getDb();
  const rows = db.prepare(`
    SELECT base_currency, quote_currency, rate, provider, effective_date
    FROM exchange_rate_cache
    WHERE base_currency = 'USD'
  `).all() as Array<{
    base_currency: string;
    quote_currency: string;
    rate: number;
    provider: string;
    effective_date: string;
  }>;

  if (!rows.length) {
    return null;
  }

  const first = rows[0];
  const rates: Record<string, number> = {};

  for (const row of rows) {
    if (row.quote_currency !== first.base_currency) {
      rates[row.quote_currency] = row.rate;
    }
  }

  return {
    baseCurrency: first.base_currency,
    provider: first.provider,
    effectiveDate: first.effective_date,
    rates,
  };
}

export async function getLatestExchangeRates(): Promise<ExchangeRatesSnapshot> {
  try {
    const response = await fetch(fxApiUrl);

    if (!response.ok) {
      throw new Error(`FX API failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      result: string;
      provider: string;
      base_code: string;
      time_last_update_utc: string;
      rates: Record<string, number>;
    };

    const snapshot: ExchangeRatesSnapshot = {
      baseCurrency: payload.base_code,
      provider: payload.provider,
      effectiveDate: new Date(payload.time_last_update_utc).toISOString().slice(0, 10),
      rates: payload.rates,
    };

    cacheRates(snapshot);
    return snapshot;
  } catch (error) {
    const cached = readCachedRates();
    if (cached) {
      return cached;
    }

    throw error;
  }
}

export function convertToUsd(amount: number, currency: string, rates: ExchangeRatesSnapshot): number {
  const normalizedCurrency = currency.toUpperCase();

  if (normalizedCurrency === "USD") {
    return amount;
  }

  const rate = rates.rates[normalizedCurrency];

  if (!rate) {
    throw new Error(`Missing USD FX rate for ${normalizedCurrency}`);
  }

  return amount / rate;
}
