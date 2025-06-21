#!/bin/bash

# CCoding 插件构建测试脚本
# 用于测试打包过程，不创建 git tag

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_info "开始测试构建..."

# 清理旧的构建文件
print_info "清理旧的构建文件..."
rm -f *.vsix *.vsix.sha256

# 安装依赖
print_info "安装依赖..."
npm ci

# 编译 TypeScript
print_info "编译 TypeScript..."
npm run compile

# 打包插件
print_info "打包插件..."
npx vsce package

# 查找生成的 vsix 文件
VSIX_FILE=$(ls *.vsix 2>/dev/null | head -n 1)

if [[ -z "$VSIX_FILE" ]]; then
    echo "❌ 打包失败，未找到 .vsix 文件"
    exit 1
fi

print_success "插件打包成功: $VSIX_FILE"

# 生成 SHA256 校验和
print_info "生成 SHA256 校验和..."
sha256sum "$VSIX_FILE" > "${VSIX_FILE}.sha256"

# 显示文件信息
print_info "构建结果:"
echo "📦 文件: $VSIX_FILE"
echo "📏 大小: $(du -h "$VSIX_FILE" | cut -f1)"
echo "🔐 SHA256: $(cat "${VSIX_FILE}.sha256" | cut -d' ' -f1)"

print_success "测试构建完成！"
print_info "可以使用以下命令安装测试："
echo "code --install-extension $VSIX_FILE" 
