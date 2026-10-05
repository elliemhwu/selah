# 0005. Finance math as pure functions in `libs/shared-utils`

- Status: Accepted
- Date: 2026-10-05

## Context
Money math is easy to get subtly wrong. The same math is needed in the browser (live editor previews) and on the server (reports). It will also have to be rewritten in C#.

## Decision
- All finance math lives in `libs/shared-utils` as **pure, framework-free functions**:
  - money parsing and formatting, rounding
  - amount ↔ percentage anchoring
  - cadence conversion (`monthly = weekly × 52 / 12`, `daily × days in month`)
  - rollover and reset calculation
  - FX conversion
- Each function has thorough unit tests that serve as the specification for the C# port.

## Consequences
- No Angular or Nest imports and no I/O in this library. Inputs and outputs are plain data.
- Porting to C# means rewriting the functions and porting the test cases one-to-one.
