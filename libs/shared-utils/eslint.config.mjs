import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Finance math is pure functions with no framework imports (ADR 0005),
    // so it can be ported to C#.
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
