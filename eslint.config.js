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
      // Typed linting, so rules can see a switch's union.
      parserOptions: { projectService: true },
    },
    rules: {
      // A new Thing, Form or Happening must be handled everywhere one is
      // switched on; a `default:` doesn't excuse a missing case of a union.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Runs must be repeatable: all randomness comes from the seeded generator.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded Random from src/sandbox/random.ts.',
        },
      ],
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
  {
    // Files outside tsconfig.json have no type information.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
