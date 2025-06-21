# CCoding 插件发布指南

本文档介绍如何使用自动化流程发布 CCoding VSCode 插件。

## 🚀 自动化发布流程

### 1. 准备工作

确保您的开发环境已经设置好：

```bash
# 安装依赖
npm install

# 确保可以正常构建
npm run compile
```

### 2. 发布新版本

#### 方法一：使用发布脚本（推荐）

```bash
# 发布 patch 版本（修复版本，如 0.1.1 -> 0.1.2）
./scripts/release.sh patch

# 发布 minor 版本（小版本，如 0.1.1 -> 0.2.0）
./scripts/release.sh minor

# 发布 major 版本（大版本，如 0.1.1 -> 1.0.0）
./scripts/release.sh major

# 或者交互式发布（会提示选择版本类型）
./scripts/release.sh
```

#### 方法二：使用 bumpp（推荐）

```bash
# 直接使用 bumpp 发布 patch 版本
npx bumpp patch

# 发布 minor 版本
npx bumpp minor

# 发布 major 版本
npx bumpp major

# 交互式选择版本类型
npx bumpp
```

#### 方法三：手动发布

```bash
# 1. 更新版本号
npm version patch --no-git-tag-version

# 2. 编译和打包
npm run compile
npx vsce package

# 3. 提交更改
git add .
git commit -m "chore: bump version to $(node -p \"require('./package.json').version\")"

# 4. 创建标签
git tag -a "v$(node -p \"require('./package.json').version\")" -m "Release version $(node -p \"require('./package.json').version\")"

# 5. 推送到远程
git push origin main
git push origin "v$(node -p \"require('./package.json').version\")"
```

### 3. GitHub Actions 自动化

当您推送带有 `v*` 格式的标签时，GitHub Actions 会自动：

1. ✅ 检出代码
2. ✅ 设置 Node.js 环境
3. ✅ 安装依赖
4. ✅ 编译 TypeScript
5. ✅ 打包插件（生成 .vsix 文件）
6. ✅ 创建 GitHub Release
7. ✅ 上传 .vsix 文件到 Release
8. ✅ 生成并上传 SHA256 校验和

### 4. 发布后的文件

每次发布后，GitHub Release 会包含：

- 📦 `CCoding-v0.1.2.vsix` - 插件安装包
- 🔐 `CCoding-v0.1.2.vsix.sha256` - SHA256 校验和
- 📁 `Source code (zip)` - 源代码压缩包
- 📁 `Source code (tar.gz)` - 源代码 tar 包

## 🧪 测试构建

在正式发布前，可以使用测试脚本验证构建过程：

```bash
# 测试构建（不创建 git tag）
./scripts/test-build.sh
```

## 📋 发布检查清单

发布前请确保：

- [ ] 代码已经测试通过
- [ ] 更新了 `CHANGELOG.md`
- [ ] 版本号符合语义化版本规范
- [ ] 没有未提交的更改
- [ ] GitHub 仓库地址正确

## 🔧 配置说明

### package.json 脚本

```json
{
  "scripts": {
    "compile": "tsc -p ./",
    "package": "vsce package",
    "build": "npm run compile && npm run package",
    "release": "npm run build && git add . && git commit -m 'chore: build for release' && npm run bumpp"
  }
}
```

### GitHub Actions 工作流

工作流文件位于 `.github/workflows/release.yml`，会在以下情况触发：

- 推送以 `v` 开头的标签（如 `v0.1.2`、`v1.0.0`）

## 🚨 常见问题

### 1. 发布失败

如果 GitHub Actions 失败，请检查：

- 是否有 `GITHUB_TOKEN` 权限
- package.json 中的版本号是否正确
- 是否有语法错误导致编译失败

### 2. 权限问题

确保您有仓库的写权限，并且 Actions 有权限创建 Release。

### 3. 版本冲突

如果版本号已存在，请使用新的版本号重新发布。

## 📝 版本规范

遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范：

- `MAJOR.MINOR.PATCH` (如 1.0.0)
- 主版本号：不兼容的 API 修改
- 次版本号：向下兼容的功能性新增
- 修订号：向下兼容的问题修正

## 🔗 相关链接

- [VSCode 插件发布指南](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [语义化版本](https://semver.org/lang/zh-CN/) 
