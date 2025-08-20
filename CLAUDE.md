# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个专为前端开发者设计的 VSCode 插件 "CCoding"，提供强大的代码导航和管理功能，特别适合 Vue 和 React 项目开发。

## 常用命令

### 构建和编译

```bash
npm run compile          # 编译 TypeScript 到 JavaScript
npm run watch           # 监视模式编译
npm run vscode:prepublish  # 发布前准备（相当于 compile）
```

### 开发和测试

- 按 F5 键在新的 VSCode 扩展开发主机窗口中启动插件进行调试
- 在扩展开发主机中，使用 Ctrl+Shift+P 打开命令面板测试插件功能

## 架构概述

### 主要结构

- `src/extension.ts` - 插件激活入口点，注册所有命令和提供器
- `src/providers/` - 各种功能提供器（TreeDataProvider 实现）
- `src/parsers/` - 代码解析器，用于解析 React 和 Vue 文件
- `out/` - 编译后的 JavaScript 文件输出目录

### 核心架构组件

#### 1. 扩展激活 (extension.ts)

- 创建并注册所有功能提供器实例
- 注册 VSCode 命令和快捷键绑定
- 创建侧边栏树视图
- 监听编辑器和文档变化事件

#### 2. 提供器模式 (providers/)

每个功能都实现为独立的 TreeDataProvider：

- `FunctionListProvider` - 解析并显示当前文件函数列表
- `BookmarkProvider` - 管理代码书签，支持持久化存储
- `TodoProvider` - 扫描 TODO/FIXME/NOTE 注释
- `TimelineProvider` - 跟踪文件操作历史

#### 3. 解析器模式 (parsers/)

- `ReactParser` - 解析 React 组件，提取 props、state、hooks、methods
- `VueParser` - 解析 Vue 单文件组件

### 功能特性

#### 支持的文件类型

- JavaScript (.js)、TypeScript (.ts)
- Vue 单文件组件 (.vue)
- React JSX (.jsx)、React TSX (.tsx)
- 以及其他多种编程语言

#### 快捷键绑定

- `Ctrl+Shift+F` / `Cmd+Shift+F` - 显示函数列表
- `Ctrl+Shift+B` / `Cmd+Shift+B` - 添加书签
- `Ctrl+Shift+J` / `Cmd+Shift+J` - 快速跳转

#### 命令系统

所有功能都通过 VSCode 命令系统暴露，命令前缀为 `CCoding.`

### 开发注意事项

#### 代码清理原则

- 删除功能时要彻底清理，不要留下多余的注释说明已删除的内容
- 删除的代码就彻底删除，不需要添加"已移除XX"的注释
- 保持代码简洁，避免无意义的历史说明

#### 模块系统注意事项

- VSCode 扩展必须使用 CommonJS 格式，不能在 package.json 中设置 `"type": "module"`
- ESLint 配置文件可以使用 .mjs 扩展名来明确标识为 ES 模块
- TypeScript 源码会被编译成 CommonJS 格式输出到 out/ 目录

#### VSCode API 注意事项

- ThemeIcon 的 color 属性是只读的，需要在构造函数中传入 `new vscode.ThemeIcon(iconId, new vscode.ThemeColor(color))`
- StatusBarItem 的 color 属性需要使用 `new vscode.ThemeColor(colorString)` 包装
- 避免直接赋值只读属性，应该在创建对象时传入相关参数

#### TypeScript 配置

- 目标版本：ES2020
- 输出目录：`out/`
- 严格模式已禁用以提高开发灵活性

#### 符号解析机制

- 主要依赖 VSCode 内置的 `vscode.executeDocumentSymbolProvider` API
- 自定义解析器用于框架特定功能（React hooks、Vue 组件特性等）

#### 状态管理

- 书签使用 VSCode ExtensionContext 进行持久化
- 其他状态基于当前活动编辑器动态计算

#### 扩展点集成

- 侧边栏视图容器：`CCoding`
- 资源管理器视图：根据文件类型条件显示
- 命令面板集成：所有功能都可通过命令面板访问
