import esbuild from 'esbuild'
import { glob } from 'glob'

async function build() {
  try {
    // Get all TypeScript files in src directory
    const entryPoints = await glob('src/**/*.ts', {
      absolute: true,
      ignore: ['**/*.d.ts'],
    })

    console.log('Building with esbuild...')
    console.log(`Found ${entryPoints.length} TypeScript files`)

    await esbuild.build({
      entryPoints,
      bundle: false,
      outdir: 'out',
      platform: 'node',
      target: 'node16',
      format: 'cjs',
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
