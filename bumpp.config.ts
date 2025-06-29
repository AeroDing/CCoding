import { defineConfig } from 'bumpp'

export default defineConfig({
  // 指定要更新版本号的文件
  files: [
    'package.json',
    'package-lock.json',
  ],
  // 自动提交和推送
  commit: 'chore: release v%s',
  tag: true,
  push: true,
})
