import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'selah',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'selah',
          style: 'kebab-case',
        },
      ],
    },
  },
  // Nx can't see folders inside the app, so this keeps the modules apart here (ADR 0030).
  {
    files: ['src/app/finance/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/journal', '**/journal/**', '@selah/journal-core'],
              message: 'Finance must not import from Journal (ADR 0030).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/journal/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/finance', '**/finance/**', '@selah/finance-core'],
              message: 'Journal must not import from Finance (ADR 0030).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
