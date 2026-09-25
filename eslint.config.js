import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // ADR 0001: all simulation goes through our own physics module, so the
    // engine can be swapped. Only src/physics/ may import the engine.
    files: ['src/**/*.ts'],
    ignores: ['src/physics/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser-box2d', 'phaser-box2d/*', '@dimforge/*'],
              message: 'Only src/physics/ may import the physics engine (ADR 0001).',
            },
          ],
        },
      ],
    },
  },
);
