import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACCOUNT_TYPES,
  ANCHORS,
  BUDGET_TRANSFER_KINDS,
  CADENCES,
  CURRENCIES,
  PERCENT_BASES,
  RECORD_TYPES,
  RESET_ACTIONS,
  RESET_CYCLES,
  SECTIONS,
} from './finance';

// The value sets must match the CHECK constraints in the SQL migrations.
const migrationsDir = join(__dirname, '../../../../db/migrations');
const sql = readdirSync(migrationsDir)
  .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
  .join('\n');

describe('finance value sets', () => {
  it.each([
    ['CURRENCIES', CURRENCIES],
    ['ACCOUNT_TYPES', ACCOUNT_TYPES],
    ['RECORD_TYPES', RECORD_TYPES],
    ['SECTIONS', SECTIONS],
    ['CADENCES', CADENCES],
    ['ANCHORS', ANCHORS],
    ['PERCENT_BASES', PERCENT_BASES],
    ['RESET_CYCLES', RESET_CYCLES],
    ['RESET_ACTIONS', RESET_ACTIONS],
    ['BUDGET_TRANSFER_KINDS', BUDGET_TRANSFER_KINDS],
  ])('%s matches a CHECK constraint in the migrations', (_name, values) => {
    expect(sql).toContain(`IN (${values.map((v) => `'${v}'`).join(', ')})`);
  });
});
