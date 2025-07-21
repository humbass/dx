import esbuild from 'esbuild'

esbuild.build({
  entryPoints: ['src/dx.js'],
  bundle: true,
  outfile: 'dist/dx.js',
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: true,
  sourcemap: true 
}).then(() => {
  console.log('打包完成！')
}).catch((error) => {
  console.error('打包失败：', error)
  process.exit(1)
})