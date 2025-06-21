#!/bin/bash

# CCoding 插件发布脚本（使用 bumpp）
# 用法: ./scripts/release.sh [patch|minor|major]
# 示例: ./scripts/release.sh patch

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "当前目录不是 git 仓库"
    exit 1
fi

# 检查工作区是否干净
if [[ -n $(git status --porcelain) ]]; then
    print_warning "工作区有未提交的更改，请先提交或暂存"
    git status --short
    read -p "是否继续？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 获取版本类型
VERSION_TYPE=$1
if [[ -z "$VERSION_TYPE" ]]; then
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    print_info "当前版本: $CURRENT_VERSION"
    echo "请选择版本类型:"
    echo "1) patch - 修复版本 (0.1.1 -> 0.1.2)"
    echo "2) minor - 小版本 (0.1.1 -> 0.2.0)"
    echo "3) major - 大版本 (0.1.1 -> 1.0.0)"
    read -p "请输入选择 (1-3): " -n 1 -r
    echo
    case $REPLY in
        1) VERSION_TYPE="patch" ;;
        2) VERSION_TYPE="minor" ;;
        3) VERSION_TYPE="major" ;;
        *) print_error "无效选择"; exit 1 ;;
    esac
fi

# 验证版本类型
case $VERSION_TYPE in
    patch|minor|major|prerelease) ;;
    *) print_error "无效的版本类型: $VERSION_TYPE"; exit 1 ;;
esac

print_info "准备发布 $VERSION_TYPE 版本..."

# 清理旧的构建文件
print_info "清理旧的构建文件..."
rm -f *.vsix *.vsix.sha256

# 使用 bumpp 进行版本管理
print_info "使用 bumpp 管理版本..."
npx bumpp $VERSION_TYPE --yes

# 获取新版本号
NEW_VERSION=$(node -p "require('./package.json').version")
print_success "版本已更新到: v$NEW_VERSION"

# 显示文件信息
if [[ -f "CCoding-$NEW_VERSION.vsix" ]]; then
    print_info "本地生成的文件:"
    ls -la CCoding-$NEW_VERSION.vsix
    print_info "文件大小: $(du -h CCoding-$NEW_VERSION.vsix | cut -f1)"
    if command -v sha256sum >/dev/null 2>&1; then
        print_info "SHA256: $(sha256sum CCoding-$NEW_VERSION.vsix | cut -d' ' -f1)"
    fi
fi

print_success "发布完成！"
print_info "GitHub Actions 将自动构建并创建 Release"
print_info "请访问 GitHub 仓库查看发布进度" 
