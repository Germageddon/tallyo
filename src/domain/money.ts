import { minorUnits } from './currencies';

export class MoneyError extends Error {}

export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: string,
  ) {}

  static ofMinor(amountMinor: number, currency: string): Money {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new MoneyError(`amountMinor must be a safe integer: ${amountMinor}`);
    }
    return new Money(amountMinor, currency.toUpperCase());
  }

  static fromDecimalString(decimal: string, currency: string): Money {
    const code = currency.toUpperCase();
    const exp = minorUnits(code);
    const trimmed = decimal.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new MoneyError(`invalid amount: ${decimal}`);
    }
    const negative = trimmed.startsWith('-');
    const [intPart, fracPart = ''] = trimmed.replace('-', '').split('.');
    if (fracPart.length > exp) {
      throw new MoneyError(`too many decimal places for ${code}: ${decimal}`);
    }
    const fracPadded = fracPart.padEnd(exp, '0');
    const minor = Number(intPart) * 10 ** exp + Number(fracPadded || '0');
    if (!Number.isSafeInteger(minor)) {
      throw new MoneyError(`amount out of range: ${decimal}`);
    }
    return new Money(negative ? -minor : minor, code);
  }

  format(locale = 'en-US'): string {
    const exp = minorUnits(this.currency);
    const value = this.amountMinor / 10 ** exp;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
    }).format(value);
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }
}
