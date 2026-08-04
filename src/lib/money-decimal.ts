interface ScaledDecimal {
  value: bigint;
  scale: number;
}

function toScaledDecimal(value: string): ScaledDecimal {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match) return { value: BigInt(0), scale: 0 };
  const fraction = match[3] ?? "";
  const digits = `${match[2]}${fraction}`.replace(/^0+(?=\d)/, "");
  return {
    value: (match[1] === "-" ? -BigInt(1) : BigInt(1)) * BigInt(digits || "0"),
    scale: fraction.length,
  };
}

function fromScaledDecimal(value: bigint, scale: number): string {
  if (value === BigInt(0)) return "0";
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const integer = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function sumMoneyDecimals(values: string[]): string {
  const parsed = values.map(toScaledDecimal);
  const scale = parsed.reduce((maximum, item) => Math.max(maximum, item.scale), 0);
  const total = parsed.reduce(
    (sum, item) => sum + item.value * BigInt(10) ** BigInt(scale - item.scale),
    BigInt(0),
  );
  return fromScaledDecimal(total, scale);
}

export function moneyDecimalToNumber(
  decimal: string | null | undefined,
  numericAlias: number | null,
): number | null {
  if (decimal === null) return null;
  return Number(decimal ?? numericAlias);
}
