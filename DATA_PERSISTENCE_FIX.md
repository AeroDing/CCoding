# 数据持久化修复文档

## 问题描述

CCoding扩展的书签和置顶符号功能在VS Code重启后数据丢失的问题。

## 修复内容

### 1. 数据序列化/反序列化优化

**修复的关键问题：**

- `vscode.Uri` 和 `vscode.Range` 对象在序列化到 `globalState` 时丢失原型链信息
- 数据验证过于严格，导致有效数据被误删
- 异步保存时机问题

**解决方案：**

- 改进了数据序列化逻辑，确保 URI 和 Range 对象正确转换为可序列化格式
- 放宽了数据验证条件，提供默认值处理
- 增强了错误处理和恢复机制

### 2. 新增功能

#### 公共方法

- `BookmarkProvider.forceSave()` - 强制保存书签数据
- `BookmarkProvider.getDataHealth()` - 检查书签数据健康状态
- `PinnedSymbolProvider.forceSave()` - 强制保存置顶符号数据
- `PinnedSymbolProvider.getDataHealth()` - 检查置顶符号数据健康状态

#### 新增命令

- `CCoding.forceSaveData` - 手动强制保存所有数据
- `CCoding.checkDataHealth` - 检查数据健康状态

### 3. 自动保护机制

#### 定期自动保存

- 每5分钟自动保存一次数据
- 在文件保存时同步保存数据
- VS Code关闭前最后一次数据保存

#### 日志监控

- 添加了详细的数据加载/保存日志
- 错误情况的详细记录
- 数据健康状态监控

## 使用方法

### 1. 测试数据持久化

1. **创建测试数据：**

   ```
   - 打开任意代码文件
   - 右键选择"添加书签"或使用命令面板
   - 置顶一些符号（函数、类等）
   ```

2. **检查数据状态：**

   ```
   - 按 Ctrl+Shift+P 打开命令面板
   - 输入"CCoding: Check Data Health"
   - 查看数据健康状态报告
   ```

3. **手动保存数据：**

   ```
   - 命令面板中输入"CCoding: Force Save Data"
   - 确认数据已保存并查看状态
   ```

4. **验证持久化：**
   ```
   - 重启VS Code
   - 检查书签和置顶符号是否还存在
   ```

### 2. 故障排除

**如果数据仍然丢失：**

1. **检查控制台日志：**

   ```
   - 打开开发者工具 (Ctrl+Shift+I)
   - 查看Console标签页中的CCoding相关日志
   ```

2. **使用数据修复工具：**

   ```
   - 命令面板中输入"CCoding: Repair Data"
   - 清理可能损坏的数据条目
   ```

3. **手动清理数据：**
   ```
   - 如果问题持续，可能需要清理globalState
   - 这将删除所有现有数据，但解决持久化问题
   ```

## 技术细节

### 数据存储格式

**序列化前（内存中）：**

```typescript
interface Bookmark {
  id: string
  label: string
  uri: vscode.Uri // VS Code URI对象
  range: vscode.Range // VS Code Range对象
  timestamp: number
}
```

**序列化后（存储中）：**

```typescript
interface SerializedBookmark {
  id: string
  label: string
  uri: string // 字符串格式的URI
  range: { // 普通对象格式的Range
    start: { line: number, character: number }
    end: { line: number, character: number }
  }
  timestamp: number
}
```

### 自动保存机制

- **触发条件：**

  - 每5分钟定期保存
  - 文件保存时
  - 数据修改操作后
  - VS Code关闭前

- **错误处理：**
  - 保存失败时显示错误信息
  - 加载失败时不清除原数据
  - 提供数据恢复机制

## 测试建议

1. **基本功能测试：**

   - 添加书签 → 重启 → 检查是否存在
   - 置顶符号 → 重启 → 检查是否存在

2. **异常情况测试：**

   - 强制终止VS Code → 重启 → 检查数据
   - 扩展异常关闭 → 重启 → 检查数据

3. **大量数据测试：**
   - 添加50+书签 → 重启 → 检查性能和完整性
   - 置顶大量符号 → 重启 → 检查完整性

## 更新日志

- **v1.0.0** - 修复数据持久化问题
  - 改进序列化逻辑
  - 添加自动保存机制
  - 增加数据健康检查功能
  - 提供手动数据管理命令

---

如果仍遇到问题，请查看VS Code的开发者控制台日志，或联系技术支持。
