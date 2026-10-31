import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vitest.config.*.timestamp*',
      '**/*.generated.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // Shared libs stay framework-free and only build on each other.
            {
              sourceTag: 'type:types',
              onlyDependOnLibsWithTags: ['type:types'],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:types'],
            },
            {
              sourceTag: 'type:client',
              onlyDependOnLibsWithTags: ['type:types'],
            },
            // Finance rules and reports, shared by the device and the API (ADR 0025).
            {
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:types', 'type:util'],
            },
            // The API must not use the web's client; the web can use anything shared.
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:api'],
            },
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:web'],
            },
            // Modules stay independent: each builds only on itself and shared libs (ADR 0030).
            {
              sourceTag: 'module:finance',
              onlyDependOnLibsWithTags: ['module:finance', 'module:shared'],
            },
            {
              sourceTag: 'module:journal',
              onlyDependOnLibsWithTags: ['module:journal', 'module:shared'],
            },
            {
              sourceTag: 'module:planner',
              onlyDependOnLibsWithTags: ['module:planner', 'module:shared'],
            },
            {
              sourceTag: 'module:shared',
              onlyDependOnLibsWithTags: ['module:shared'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {
      // `const { omitted, ...rest } = obj` is the idiom for dropping a field.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { ignoreRestSiblings: true },
      ],
    },
  },
];
