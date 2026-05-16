/**
 * DAT-04: All monetary values are stored as NUMERIC(14,2) in Postgres, but
 * intermediate JS arithmetic happens in IEEE-754 doubles which accumulate
 * rounding error (e.g. 0.1 + 0.2). We normalise every value we are about to
 * write or compare with `round2`, and use `eq2` for equality with a 1-cent
 * tolerance to avoid spurious "exceeds remaining" errors caused by float drift.
 */
export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** True when two amounts agree to the nearest cent. */
export const eq2 = (a: number, b: number): boolean => Math.abs(round2(a) - round2(b)) < 0.005;

/** True when `a <= b` to the nearest cent. */
export const lte2 = (a: number, b: number): boolean => round2(a) - round2(b) < 0.005;
