import antfu from '@antfu/eslint-config'

export default antfu(
  {
    typescript: true,
    vue: false,
    react: false,
    formatters: true,
    stylistic: {
      indent: 2,
      quotes: 'single',
    },
  },
  {
    rules: {
      // VSCode extension specific rules
      'no-console': 'off',
      'ts/no-var-requires': 'off',
      'node/prefer-global/process': 'off',
    },
  },
  {
    ignores: [
      '.claude/**',
      'out/**',
      'node_modules/**',
      '**/*.vsix',
      '**/*.js.map',
    ],
  },
)
