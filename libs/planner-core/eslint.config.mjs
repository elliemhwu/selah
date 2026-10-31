import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Planner rules and views are pure functions with no framework imports
    // (ADR 0025, 0033), so every build runs the same code.
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@angular/*',
            '@nestjs/*',
            'rxjs',
            'rxjs/*',
            'kysely',
            'pg',
            'node:*',
          ],
        },
      ],
    },
  },
];
