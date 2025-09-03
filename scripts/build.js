import { rm } from 'node:fs/promises'
import esbuild from 'esbuild'

async function build() {
  try {
    console.log('Cleaning output directory...')
    await rm('out', { recursive: true, force: true })

    console.log('Building ESM bundle with esbuild...')
    await esbuild.build({
      entryPoints: ['src/extension.ts'],
      bundle: true,
      outfile: 'out/extension.js',
      external: ['vscode'],
      platform: 'node',
      target: 'node18',
      format: 'esm',
      sourcemap: true,
      tsconfig: './tsconfig.json',
      logLevel: 'info',
      minify: false,
    })

    console.log('✅ Build completed successfully!')
  }
  catch (error) {
    console.error('❌ Build failed:', error)
    process.exit(1)
  }
}

build()
