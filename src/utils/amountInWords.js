// Renders a money amount as words for the invoice PDF.
//
// Kept in step with the frontend copy at
// Numor Frontend/feature-showcase-page/src/lib/amountInWords.ts - the preview and
// the PDF must read identically, so any change here belongs there too.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

// Major/minor unit names. Falls back to the raw code for anything unlisted, so a
// new currency reads awkwardly rather than silently printing the wrong money.
const UNITS = {
  INR: { major: 'Rupees', minor: 'Paise', indian: true },
  USD: { major: 'Dollars', minor: 'Cents' },
  EUR: { major: 'Euros', minor: 'Cents' },
  GBP: { major: 'Pounds', minor: 'Pence' },
  AED: { major: 'Dirhams', minor: 'Fils' },
};

// Which locale's grouping a currency should use. INR groups as 7,35,000; the
// rest as 735,000. Exported so every money formatter in the app agrees.
function moneyLocale(currency = 'USD') {
  const unit = UNITS[String(currency || '').toUpperCase()];
  return unit && unit.indian ? 'en-IN' : 'en-US';
}

// Locale-aware grouping: INR groups as 7,35,000 while the rest use 735,000.
// Reuses the UNITS table above so "is this an Indian-convention currency" is
// decided in one place.
function formatMoney(amount, currency = 'USD') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';

  return new Intl.NumberFormat(moneyLocale(currency), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** 0-999 in words. */
function underThousand(n) {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const rest = n % 10;
    return TENS[Math.floor(n / 10)] + (rest ? ' ' + ONES[rest] : '');
  }
  const rest = n % 100;
  return ONES[Math.floor(n / 100)] + ' Hundred' + (rest ? ' ' + underThousand(rest) : '');
}

/** Thousand / Million / Billion grouping. */
function international(n) {
  if (n === 0) return 'Zero';

  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
  const parts = [];

  for (let i = 0; n > 0 && i < scales.length; i++) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(underThousand(chunk) + (scales[i] ? ' ' + scales[i] : ''));
    n = Math.floor(n / 1000);
  }

  return parts.join(' ');
}

/** Thousand / Lakh / Crore grouping, as Indian invoices are written. */
function indian(n) {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundreds = n % 1000;

  const parts = [];
  // The crore count itself can run past 999, so it is spelled out in full.
  if (crore) parts.push(international(crore) + ' Crore');
  if (lakh) parts.push(underThousand(lakh) + ' Lakh');
  if (thousand) parts.push(underThousand(thousand) + ' Thousand');
  if (hundreds) parts.push(underThousand(hundreds));

  return parts.join(' ');
}

/**
 * e.g. amountInWords(735, 'INR')    -> "Rupees Seven Hundred Thirty Five Only"
 *      amountInWords(1250.5, 'USD') -> "Dollars One Thousand Two Hundred Fifty and Fifty Cents Only"
 */
function amountInWords(amount, currency = 'USD') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';

  const code = String(currency || '').toUpperCase();
  const unit = UNITS[code] || { major: code, minor: '' };
  const spell = unit.indian ? indian : international;

  // Rounded first so 0.005 cannot leave the major part behind by a rupee.
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  const major = Math.floor(rounded);
  const minor = Math.round((rounded - major) * 100);

  let words = `${unit.major} ${spell(major)}`;
  if (minor > 0 && unit.minor) {
    words += ` and ${underThousand(minor)} ${unit.minor}`;
  }
  if (value < 0) words = 'Minus ' + words;

  return words + ' Only';
}

module.exports = { amountInWords, formatMoney, moneyLocale };
