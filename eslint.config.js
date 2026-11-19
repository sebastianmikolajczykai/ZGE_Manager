import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    rules: {
      'no-magic-numbers': 'off',
      'max-depth': ['error', 3],
      complexity: ['warn', 10],
      'no-console': ['error', { allow: ['log', 'error'] }],
    },
  },
);
