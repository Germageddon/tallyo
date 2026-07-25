import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'data/**', 'coverage/**', 'node_modules/**'] },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
