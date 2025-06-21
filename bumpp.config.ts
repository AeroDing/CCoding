import { defineConfig } from 'bumpp'

export default defineConfig({
  // 指定要更新版本号的文件
  files: [
    'package.json',
    'package-lock.json',
  ],
})
