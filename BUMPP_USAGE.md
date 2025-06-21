# CCoding 插件发布指南 - 使用 bumpp

本项目已集成 `bumpp` 自动化版本管理工具，可以一键完成版本更新、构建、提交、标签创建和推送等操作。

## 🚀 快速发布

### 使用 bumpp 直接发布

```bash
# 发布修复版本 (0.1.1 -> 0.1.2)
npx bumpp patch

# 发布小版本 (0.1.1 -> 0.2.0)
npx bumpp minor

# 发布大版本 (0.1.1 -> 1.0.0)
npx bumpp major

# 交互式选择版本类型
npx bumpp
```

### 使用发布脚本

```bash
# 使用脚本发布（包含额外检查和提示）
./scripts/release.sh patch
./scripts/release.sh minor
./scripts/release.sh major

# 交互式发布
./scripts/release.sh
```

## 📋 发布流程

当您执行 `npx bumpp patch` 时，会自动执行以下步骤：

1. **预处理** (`prebumpp` 脚本)：
   - 编译 TypeScript 代码
   - 构建项目

2. **版本更新**：
   - 更新 `package.json` 和 `package-lock.json` 中的版本号
   - 创建 git commit (格式: `chore: release v0.1.2`)
   - 创建 git tag (格式: `v0.1.2`)
   - 推送到远程仓库

3. **后处理** (`postbumpp` 脚本)：
   - 生成 VSCode 插件包 (`CCoding-0.1.2.vsix`)
   - 显示成功提示信息

4. **自动化构建**：
   - GitHub Actions 检测到新标签
   - 自动构建并创建 Release
   - 上传 `.vsix` 文件和校验和

## 🛠️ 配置说明

### bumpp.config.ts

```typescript
import { defineConfig } from 'bumpp'

export default defineConfig({
  // 指定要更新版本号的文件
  files: [
    'package.json',
    'package-lock.json'
  ]
})
```

### package.json 脚本

```json
{
  "scripts": {
    "prebumpp": "npm run build",
    "postbumpp": "npx vsce package --out CCoding-$(node -p \"require('./package.json').version\").vsix && echo '🎉 版本发布完成！'"
  }
}
```

## 📦 版本类型说明

- **patch**: 修复版本，用于 bug 修复 (0.1.1 → 0.1.2)
- **minor**: 小版本，用于新功能添加 (0.1.1 → 0.2.0)
- **major**: 大版本，用于破坏性更改 (0.1.1 → 1.0.0)
- **prerelease**: 预发布版本 (0.1.1 → 0.1.2-0)

## 🔍 测试发布

在正式发布前，可以使用 dry-run 模式测试：

```bash
# 测试 patch 版本发布（不实际执行）
npx bumpp --dry-run patch

# 测试构建过程
./scripts/test-build.sh
```

## 📝 最佳实践

1. **发布前检查**：
   - 确保所有测试通过
   - 更新 `CHANGELOG.md`
   - 确认没有未提交的更改

2. **版本选择**：
   - 优先使用 `patch` 版本进行 bug 修复
   - 新功能使用 `minor` 版本
   - 破坏性更改使用 `major` 版本

3. **发布验证**：
   - 检查 GitHub Release 是否正确创建
   - 验证 `.vsix` 文件是否正确上传
   - 测试插件安装和功能

## 🚨 注意事项

- bumpp 会自动处理 git 操作，无需手动提交和推送
- 确保有推送到远程仓库的权限
- 发布后 GitHub Actions 需要几分钟时间完成构建
- 本地生成的 `.vsix` 文件仅供测试，正式版本请从 GitHub Release 下载 
