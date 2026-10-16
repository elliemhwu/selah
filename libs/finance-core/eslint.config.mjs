import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Finance rules and reports are pure functions with no framework imports
    // (ADR 0005, 0025), so the device and the API run the same code.
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
