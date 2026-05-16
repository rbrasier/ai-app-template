import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/entities/**',
        'src/ports/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
      },
    },
  },
})
