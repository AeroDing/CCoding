import type { QuickAccessManager } from '../services/quickAccessManager'
import type { FloatingToolbarConfig } from '../types/quickAccess'
import * as vscode from 'vscode'

/**
 * 悬浮工具栏管理器
 * 在编辑器中显示悬浮的快速访问工具栏
 */
export class FloatingToolbarManager {
  private panel: vscode.WebviewPanel | undefined
  private config: FloatingToolbarConfig
  private quickAccessManager: QuickAccessManager
  private context: vscode.ExtensionContext

  // 状态管理
  private isVisible = false
  private lastMousePosition: vscode.Position | undefined
  private hideTimer: NodeJS.Timeout | undefined
  private currentButtons: ToolbarButton[] = []

  // 事件监听器
  private disposables: vscode.Disposable[] = []

  constructor(context: vscode.ExtensionContext, quickAccessManager: QuickAccessManager) {
    this.context = context
    this.quickAccessManager = quickAccessManager
    this.config = this.loadConfig()

    if (this.config.enabled) {
      this.setupEventListeners()
    }
  }

  /**
   * 加载配置
   */
  private loadConfig(): FloatingToolbarConfig {
    const config = vscode.workspace.getConfiguration('CCoding.floatingToolbar')

    return {
      enabled: config.get('enabled', true),
      position: config.get('position', 'top-right'),
      autoHide: config.get('autoHide', true),
      autoHideDelay: config.get('autoHideDelay', 3000),

      showOnHover: config.get('showOnHover', false),
      showOnFocus: config.get('showOnFocus', true),
      showOnSelection: config.get('showOnSelection', true),
      showOnEdit: config.get('showOnEdit', false),

      maxButtons: config.get('maxButtons', 8),
      showLabels: config.get('showLabels', false),
      showTooltips: config.get('showTooltips', true),
      showBadges: config.get('showBadges', true),

      enableDrag: config.get('enableDrag', true),
      enableResize: config.get('enableResize', false),
      rememberPosition: config.get('rememberPosition', true),

      theme: config.get('theme', 'auto'),
      opacity: config.get('opacity', 0.9),
      borderRadius: config.get('borderRadius', 8),

      fadeInDuration: config.get('fadeInDuration', 300),
      fadeOutDuration: config.get('fadeOutDuration', 200),
      slideAnimation: config.get('slideAnimation', true),
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听编辑器变化
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.config.showOnFocus && editor) {
          this.showToolbar()
        }
      }),
    )

    // 监听选择变化
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (this.config.showOnSelection && !event.selections[0].isEmpty) {
          this.showToolbar()
        }
      }),
    )

    // 监听文档变化
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((_event) => {
        if (this.config.showOnEdit) {
          this.showToolbar()
        }
      }),
    )

    // 监听配置变化
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('CCoding.floatingToolbar')) {
          this.config = this.loadConfig()
          if (!this.config.enabled) {
            this.hideToolbar()
          }
        }
      }),
    )
  }

  /**
   * 显示工具栏
   */
  async showToolbar(): Promise<void> {
    if (!this.config.enabled || this.isVisible) {
      return
    }

    console.log('[CCoding] 显示悬浮工具栏')

    // 清除隐藏定时器
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = undefined
    }

    // 获取当前按钮
    this.currentButtons = await this.generateButtons()

    if (this.currentButtons.length === 0) {
      return
    }

    // 创建或更新面板
    if (!this.panel) {
      await this.createPanel()
    }

    if (this.panel) {
      // 更新内容
      await this.updatePanelContent()

      // 显示面板
      this.panel.reveal(vscode.ViewColumn.Active, true)
      this.isVisible = true

      // 设置自动隐藏
      if (this.config.autoHide) {
        this.scheduleAutoHide()
      }
    }
  }

  /**
   * 隐藏工具栏
   */
  hideToolbar(): void {
    if (!this.isVisible) {
      return
    }

    console.log('[CCoding] 隐藏悬浮工具栏')

    if (this.panel) {
      this.panel.dispose()
      this.panel = undefined
    }

    this.isVisible = false

    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = undefined
    }
  }

  /**
   * 切换工具栏显示
   */
  toggleToolbar(): void {
    if (this.isVisible) {
      this.hideToolbar()
    }
    else {
      this.showToolbar()
    }
  }

  /**
   * 创建面板
   */
  private async createPanel(): Promise<void> {
    this.panel = vscode.window.createWebviewPanel(
      'ccodingFloatingToolbar',
      'CCoding 悬浮工具栏',
      {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: true,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ],
      },
    )

    // 设置面板事件
    this.panel.onDidDispose(() => {
      this.panel = undefined
      this.isVisible = false
    })

    // 处理消息
    this.panel.webview.onDidReceiveMessage(async (message) => {
      await this.handleWebviewMessage(message)
    })
  }

  /**
   * 更新面板内容
   */
  private async updatePanelContent(): Promise<void> {
    if (!this.panel)
      return

    const html = this.generateHTML()
    this.panel.webview.html = html
  }

  /**
   * 生成HTML内容
   */
  private generateHTML(): string {
    const buttonsHtml = this.currentButtons.map(button => this.generateButtonHTML(button)).join('')

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CCoding 悬浮工具栏</title>
    <style>
        ${this.generateCSS()}
    </style>
</head>
<body>
    <div class="floating-toolbar" data-position="${this.config.position}">
        ${buttonsHtml}
    </div>
    <script>
        ${this.generateJavaScript()}
    </script>
</body>
</html>`
  }

  /**
   * 生成CSS样式
   */
  private generateCSS(): string {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: transparent;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            overflow: hidden;
        }

        .floating-toolbar {
            display: flex;
            gap: 4px;
            padding: 6px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: ${this.config.borderRadius}px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            opacity: ${this.config.opacity};
            transition: all ${this.config.fadeInDuration}ms ease;
            position: fixed;
            z-index: 1000;
        }

        .floating-toolbar[data-position="top-right"] {
            top: 10px;
            right: 10px;
            flex-direction: row;
        }

        .floating-toolbar[data-position="top-left"] {
            top: 10px;
            left: 10px;
            flex-direction: row;
        }

        .floating-toolbar[data-position="bottom-right"] {
            bottom: 10px;
            right: 10px;
            flex-direction: row;
        }

        .floating-toolbar[data-position="bottom-left"] {
            bottom: 10px;
            left: 10px;
            flex-direction: row;
        }

        .toolbar-button {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            background: transparent;
            border: none;
            border-radius: 4px;
            color: var(--vscode-foreground);
            cursor: pointer;
            transition: all 150ms ease;
            position: relative;
            min-width: 36px;
            height: 36px;
            justify-content: center;
        }

        .toolbar-button:hover {
            background: var(--vscode-button-hoverBackground);
            transform: scale(1.05);
        }

        .toolbar-button:active {
            transform: scale(0.95);
        }

        .toolbar-button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .toolbar-button.primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .button-icon {
            font-size: 16px;
            line-height: 1;
        }

        .button-label {
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            display: ${this.config.showLabels ? 'block' : 'none'};
        }

        .button-badge {
            position: absolute;
            top: -2px;
            right: -2px;
            background: var(--vscode-errorForeground);
            color: white;
            font-size: 10px;
            font-weight: bold;
            border-radius: 8px;
            min-width: 16px;
            height: 16px;
            display: ${this.config.showBadges ? 'flex' : 'none'};
            align-items: center;
            justify-content: center;
            line-height: 1;
        }

        .button-hotkey {
            position: absolute;
            bottom: -2px;
            left: 2px;
            font-size: 8px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-badge-background);
            padding: 1px 3px;
            border-radius: 2px;
            line-height: 1;
        }

        /* 动画效果 */
        .floating-toolbar.fade-in {
            animation: fadeIn ${this.config.fadeInDuration}ms ease;
        }

        .floating-toolbar.fade-out {
            animation: fadeOut ${this.config.fadeOutDuration}ms ease;
        }

        ${this.config.slideAnimation
          ? `
        .floating-toolbar.slide-in-right {
            animation: slideInRight ${this.config.fadeInDuration}ms ease;
        }

        .floating-toolbar.slide-in-left {
            animation: slideInLeft ${this.config.fadeInDuration}ms ease;
        }

        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: ${this.config.opacity}; }
        }

        @keyframes slideInLeft {
            from { transform: translateX(-100%); opacity: 0; }
            to { transform: translateX(0); opacity: ${this.config.opacity}; }
        }
        `
          : ''}

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: ${this.config.opacity}; }
        }

        @keyframes fadeOut {
            from { opacity: ${this.config.opacity}; }
            to { opacity: 0; }
        }

        /* 深色主题适配 */
        @media (prefers-color-scheme: dark) {
            .floating-toolbar {
                background: var(--vscode-editorWidget-background);
                border-color: var(--vscode-editorWidget-border);
            }
        }

        /* 可拖拽 */
        ${this.config.enableDrag
          ? `
        .floating-toolbar {
            cursor: move;
            user-select: none;
        }

        .floating-toolbar.dragging {
            opacity: 0.8;
            transform: scale(1.02);
        }
        `
          : ''}
    `
  }

  /**
   * 生成JavaScript代码
   */
  private generateJavaScript(): string {
    return `
        const vscode = acquireVsCodeApi();
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        // 按钮点击事件
        document.addEventListener('click', (event) => {
            const button = event.target.closest('.toolbar-button');
            if (button) {
                const buttonId = button.dataset.buttonId;
                const command = button.dataset.command;
                const args = button.dataset.args ? JSON.parse(button.dataset.args) : [];
                
                vscode.postMessage({
                    type: 'button-click',
                    buttonId,
                    command,
                    args
                });

                // 视觉反馈
                button.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    button.style.transform = '';
                }, 100);
            }
        });

        // 鼠标悬停事件
        document.addEventListener('mouseover', (event) => {
            const button = event.target.closest('.toolbar-button');
            if (button) {
                const tooltip = button.dataset.tooltip;
                if (tooltip && ${this.config.showTooltips}) {
                    // 显示工具提示
                    showTooltip(button, tooltip);
                }
            }
        });

        document.addEventListener('mouseout', (event) => {
            const button = event.target.closest('.toolbar-button');
            if (button) {
                hideTooltip();
            }
        });

        // 键盘事件
        document.addEventListener('keydown', (event) => {
            // 数字键快捷访问
            if (event.key >= '1' && event.key <= '9') {
                const index = parseInt(event.key) - 1;
                const buttons = document.querySelectorAll('.toolbar-button');
                if (buttons[index]) {
                    buttons[index].click();
                    event.preventDefault();
                }
            }
            
            // ESC键隐藏工具栏
            if (event.key === 'Escape') {
                vscode.postMessage({
                    type: 'hide-toolbar'
                });
            }
        });

        ${this.config.enableDrag
          ? `
        // 拖拽功能
        const toolbar = document.querySelector('.floating-toolbar');
        
        toolbar.addEventListener('mousedown', (event) => {
            if (event.target.closest('.toolbar-button')) return;
            
            isDragging = true;
            const rect = toolbar.getBoundingClientRect();
            dragOffset.x = event.clientX - rect.left;
            dragOffset.y = event.clientY - rect.top;
            
            toolbar.classList.add('dragging');
            event.preventDefault();
        });

        document.addEventListener('mousemove', (event) => {
            if (!isDragging) return;
            
            const x = event.clientX - dragOffset.x;
            const y = event.clientY - dragOffset.y;
            
            toolbar.style.position = 'fixed';
            toolbar.style.left = x + 'px';
            toolbar.style.top = y + 'px';
            toolbar.style.right = 'auto';
            toolbar.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                toolbar.classList.remove('dragging');
                
                // 保存位置
                const rect = toolbar.getBoundingClientRect();
                vscode.postMessage({
                    type: 'position-changed',
                    position: {
                        x: rect.left,
                        y: rect.top
                    }
                });
            }
        });
        `
          : ''}

        // 工具提示函数
        let tooltipElement = null;

        function showTooltip(button, text) {
            hideTooltip();
            
            tooltipElement = document.createElement('div');
            tooltipElement.className = 'tooltip';
            tooltipElement.textContent = text;
            tooltipElement.style.cssText = \`
                position: fixed;
                background: var(--vscode-editorHoverWidget-background);
                color: var(--vscode-editorHoverWidget-foreground);
                border: 1px solid var(--vscode-editorHoverWidget-border);
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 1001;
                pointer-events: none;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            \`;
            
            document.body.appendChild(tooltipElement);
            
            const buttonRect = button.getBoundingClientRect();
            const tooltipRect = tooltipElement.getBoundingClientRect();
            
            tooltipElement.style.left = (buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2) + 'px';
            tooltipElement.style.top = (buttonRect.bottom + 5) + 'px';
        }

        function hideTooltip() {
            if (tooltipElement) {
                tooltipElement.remove();
                tooltipElement = null;
            }
        }

        // 初始化动画
        const toolbar = document.querySelector('.floating-toolbar');
        toolbar.classList.add('fade-in');
        
        ${this.config.slideAnimation
          ? `
        if ('${this.config.position}'.includes('right')) {
            toolbar.classList.add('slide-in-right');
        } else if ('${this.config.position}'.includes('left')) {
            toolbar.classList.add('slide-in-left');
        }
        `
          : ''}

        // 通知准备就绪
        vscode.postMessage({
            type: 'toolbar-ready'
        });
    `
  }

  /**
   * 生成按钮HTML
   */
  private generateButtonHTML(button: ToolbarButton): string {
    const iconHtml = button.icon ? `<span class="button-icon">${this.getIconHTML(button.icon)}</span>` : ''
    const labelHtml = button.label && this.config.showLabels ? `<span class="button-label">${button.label}</span>` : ''
    const badgeHtml = button.badge && this.config.showBadges ? `<span class="button-badge">${button.badge}</span>` : ''
    const hotkeyHtml = button.hotkey ? `<span class="button-hotkey">${button.hotkey}</span>` : ''

    return `
        <button 
            class="toolbar-button ${button.isPrimary ? 'primary' : ''}"
            data-button-id="${button.id}"
            data-command="${button.command}"
            data-args="${button.args ? JSON.stringify(button.args) : ''}"
            data-tooltip="${button.tooltip || ''}"
            title="${button.tooltip || ''}"
        >
            ${iconHtml}
            ${labelHtml}
            ${badgeHtml}
            ${hotkeyHtml}
        </button>
    `
  }

  /**
   * 获取图标HTML
   */
  private getIconHTML(icon: string): string {
    // 使用 Codicons 图标
    return `<i class="codicon codicon-${icon}"></i>`
  }

  /**
   * 生成工具栏按钮
   */
  private async generateButtons(): Promise<ToolbarButton[]> {
    const buttons: ToolbarButton[] = []
    const quickAccessItems = this.quickAccessManager.getQuickAccessSymbols()

    // 添加快速访问按钮
    for (let i = 0; i < Math.min(this.config.maxButtons - 2, quickAccessItems.length); i++) {
      const item = quickAccessItems[i]
      buttons.push({
        id: item.id,
        icon: item.icon,
        label: item.title,
        tooltip: item.tooltip || item.title,
        command: item.command,
        args: item.args,
        badge: item.badge,
        hotkey: item.hotkeyIndex ? item.hotkeyIndex.toString() : undefined,
        isPrimary: i === 0,
      })
    }

    // 添加更多按钮
    if (quickAccessItems.length > this.config.maxButtons - 2) {
      buttons.push({
        id: 'more',
        icon: 'ellipsis',
        label: '更多',
        tooltip: '显示更多选项',
        command: 'CCoding.showQuickAccess',
        badge: (quickAccessItems.length - (this.config.maxButtons - 2)).toString(),
      })
    }

    // 添加设置按钮
    buttons.push({
      id: 'settings',
      icon: 'gear',
      label: '设置',
      tooltip: '打开设置',
      command: 'workbench.action.openSettings',
      args: ['CCoding'],
    })

    return buttons
  }

  /**
   * 处理Webview消息
   */
  private async handleWebviewMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'button-click':
        await this.handleButtonClick(message)
        break
      case 'hide-toolbar':
        this.hideToolbar()
        break
      case 'position-changed':
        if (this.config.rememberPosition) {
          await this.savePosition(message.position)
        }
        break
      case 'toolbar-ready':
        console.log('[CCoding] 悬浮工具栏已就绪')
        break
    }
  }

  /**
   * 处理按钮点击
   */
  private async handleButtonClick(message: any): Promise<void> {
    try {
      console.log(`[CCoding] 执行悬浮工具栏命令: ${message.command}`)

      if (message.args && message.args.length > 0) {
        await vscode.commands.executeCommand(message.command, ...message.args)
      }
      else {
        await vscode.commands.executeCommand(message.command)
      }

      // 记录使用统计
      await this.quickAccessManager.accessItem(message.buttonId)
    }
    catch (error) {
      console.error(`[CCoding] 执行命令失败: ${message.command}`, error)
      vscode.window.showErrorMessage(`执行命令失败: ${message.command}`)
    }
  }

  /**
   * 安排自动隐藏
   */
  private scheduleAutoHide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
    }

    this.hideTimer = setTimeout(() => {
      this.hideToolbar()
    }, this.config.autoHideDelay)
  }

  /**
   * 保存位置
   */
  private async savePosition(position: { x: number, y: number }): Promise<void> {
    await this.context.globalState.update('CCoding.floatingToolbar.position', position)
  }

  /**
   * 加载位置
   */
  private loadPosition(): { x: number, y: number } | undefined {
    return this.context.globalState.get('CCoding.floatingToolbar.position')
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    this.hideToolbar()

    for (const disposable of this.disposables) {
      disposable.dispose()
    }
    this.disposables = []

    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
    }
  }
}

/**
 * 工具栏按钮接口
 */
interface ToolbarButton {
  id: string
  icon: string
  label?: string
  tooltip?: string
  command: string
  args?: any[]
  badge?: string
  hotkey?: string
  isPrimary?: boolean
}
