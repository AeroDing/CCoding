import * as vscode from 'vscode';

interface Bookmark {
    id: string;
    label: string;
    uri: vscode.Uri;
    range: vscode.Range;
    timestamp: number;
}

export class BookmarkProvider implements vscode.TreeDataProvider<BookmarkItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BookmarkItem | undefined | null | void> = new vscode.EventEmitter<BookmarkItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BookmarkItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private bookmarks: Bookmark[] = [];
    private context: vscode.ExtensionContext;
    private currentTab: 'current' | 'all' = 'current';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadBookmarks();
    }

    /**
     * 设置当前Tab状态
     * @param tab - 当前选择的Tab类型
     * @description 外部调用此方法来更新Tab状态并刷新显示
     */
    setCurrentTab(tab: 'current' | 'all'): void {
        if (this.currentTab !== tab) {
            this.currentTab = tab;
            this.refresh();
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BookmarkItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BookmarkItem): Thenable<BookmarkItem[]> {
        if (!element) {
            const filteredBookmarks = this.getFilteredBookmarks();
            const items = filteredBookmarks.map(bookmark => new BookmarkItem(bookmark));
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }

    /**
     * 根据当前Tab状态过滤书签
     * @returns 过滤后的书签数组
     * @description 当Tab为'current'时只返回当前文件的书签，为'all'时返回所有书签
     */
    private getFilteredBookmarks(): Bookmark[] {
        if (this.currentTab === 'current') {
            return this.getCurrentFileBookmarks();
        }
        return this.bookmarks;
    }

    /**
     * 获取当前文件的书签
     * @returns 当前文件的书签数组
     * @description 如果没有打开的编辑器，返回空数组
     */
    private getCurrentFileBookmarks(): Bookmark[] {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return [];
        }
        
        const currentFileUri = editor.document.uri.toString();
        return this.bookmarks.filter(bookmark => bookmark.uri.toString() === currentFileUri);
    }

    async addBookmark() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        const document = editor.document;
        const lineText = document.lineAt(selection.active.line).text.trim();
        
        const label = await vscode.window.showInputBox({
            prompt: 'Enter bookmark label',
            value: lineText || `Bookmark at line ${selection.active.line + 1}`,
            placeHolder: 'Enter a custom name for this bookmark',
            validateInput: (value: string) => {
                if (!value || value.trim().length === 0) {
                    return 'Bookmark label cannot be empty';
                }
                if (value.length > 50) {
                    return 'Bookmark label is too long (max 50 characters)';
                }
                return null;
            }
        });

        if (label) {
            const bookmark: Bookmark = {
                id: Date.now().toString(),
                label,
                uri: document.uri,
                range: selection.isEmpty ? 
                    new vscode.Range(selection.active.line, 0, selection.active.line, 0) : 
                    selection,
                timestamp: Date.now()
            };

            this.bookmarks.push(bookmark);
            this.saveBookmarks();
            this.refresh();
            
            vscode.commands.executeCommand('setContext', 'codingHelper.hasBookmarks', this.bookmarks.length > 0);
            vscode.window.showInformationMessage(`Bookmark "${label}" added`);
        }
    }

    async addBookmarkFromContext(uri: vscode.Uri) {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const fileName = vscode.workspace.asRelativePath(uri);
            
            const label = await vscode.window.showInputBox({
                prompt: 'Enter bookmark label',
                value: `Bookmark for ${fileName}`,
                placeHolder: 'Enter a custom name for this bookmark',
                validateInput: (value: string) => {
                    if (!value || value.trim().length === 0) {
                        return 'Bookmark label cannot be empty';
                    }
                    if (value.length > 50) {
                        return 'Bookmark label is too long (max 50 characters)';
                    }
                    return null;
                }
            });

            if (label) {
                const bookmark: Bookmark = {
                    id: Date.now().toString(),
                    label,
                    uri: uri,
                    range: new vscode.Range(0, 0, 0, 0),
                    timestamp: Date.now()
                };

                this.bookmarks.push(bookmark);
                this.saveBookmarks();
                this.refresh();
                
                vscode.commands.executeCommand('setContext', 'codingHelper.hasBookmarks', this.bookmarks.length > 0);
                vscode.window.showInformationMessage(`Bookmark "${label}" added for ${fileName}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add bookmark: ${error}`);
        }
    }

    /**
     * 从编辑器右键菜单添加书签
     * @description 支持当前文件和当前选中位置的书签添加
     */
    async addBookmarkFromEditor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        const document = editor.document;
        const fileName = vscode.workspace.asRelativePath(document.uri);
        const lineText = document.lineAt(selection.active.line).text.trim();
        
        // 根据是否有选中内容提供不同的默认标签
        let defaultLabel = '';
        if (!selection.isEmpty) {
            const selectedText = document.getText(selection);
            defaultLabel = `Selected: ${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}`;
        } else {
            defaultLabel = lineText || `Line ${selection.active.line + 1} in ${fileName}`;
        }
        
        const label = await vscode.window.showInputBox({
            prompt: '输入书签标签',
            value: defaultLabel,
            placeHolder: '为此书签输入自定义名称',
            validateInput: (value: string) => {
                if (!value || value.trim().length === 0) {
                    return 'Bookmark label cannot be empty';
                }
                if (value.length > 50) {
                    return 'Bookmark label is too long (max 50 characters)';
                }
                return null;
            }
        });

        if (label) {
            const bookmark: Bookmark = {
                id: Date.now().toString(),
                label: label.trim(),
                uri: document.uri,
                range: selection.isEmpty ? 
                    new vscode.Range(selection.active.line, 0, selection.active.line, 0) : 
                    selection,
                timestamp: Date.now()
            };

            this.bookmarks.push(bookmark);
            this.saveBookmarks();
            this.refresh();
            
            vscode.commands.executeCommand('setContext', 'codingHelper.hasBookmarks', this.bookmarks.length > 0);
            vscode.window.showInformationMessage(`书签 "${label}" 已添加到 ${fileName}`);
        }
    }

    async editBookmark(bookmarkId: string) {
        const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) {
            vscode.window.showErrorMessage('Bookmark not found');
            return;
        }

        const newLabel = await vscode.window.showInputBox({
            prompt: 'Edit bookmark label',
            value: bookmark.label,
            placeHolder: 'Enter a new name for this bookmark',
            validateInput: (value: string) => {
                if (!value || value.trim().length === 0) {
                    return 'Bookmark label cannot be empty';
                }
                if (value.length > 50) {
                    return 'Bookmark label is too long (max 50 characters)';
                }
                return null;
            }
        });

        if (newLabel && newLabel !== bookmark.label) {
            bookmark.label = newLabel.trim();
            this.saveBookmarks();
            this.refresh();
            vscode.window.showInformationMessage(`Bookmark renamed to "${newLabel}"`);
        }
    }

    removeBookmark(bookmarkId: string) {
        const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
        if (bookmark) {
            this.bookmarks = this.bookmarks.filter(b => b.id !== bookmarkId);
            this.saveBookmarks();
            this.refresh();
            vscode.commands.executeCommand('setContext', 'codingHelper.hasBookmarks', this.bookmarks.length > 0);
            vscode.window.showInformationMessage(`Bookmark "${bookmark.label}" removed`);
        }
    }

    private loadBookmarks() {
        const saved = this.context.globalState.get<Bookmark[]>('codingHelper.bookmarks', []);
        this.bookmarks = saved.map(b => ({
            ...b,
            uri: vscode.Uri.parse(b.uri.toString()),
            range: new vscode.Range(
                new vscode.Position(b.range.start.line, b.range.start.character),
                new vscode.Position(b.range.end.line, b.range.end.character)
            )
        }));
        vscode.commands.executeCommand('setContext', 'codingHelper.hasBookmarks', this.bookmarks.length > 0);
    }

    private saveBookmarks() {
        this.context.globalState.update('codingHelper.bookmarks', this.bookmarks);
    }
}

class BookmarkItem extends vscode.TreeItem {
    constructor(public readonly bookmark: Bookmark) {
        super(bookmark.label, vscode.TreeItemCollapsibleState.None);

        const fileName = vscode.workspace.asRelativePath(bookmark.uri);
        this.tooltip = `${bookmark.label} in ${fileName} (Line ${bookmark.range.start.line + 1})`;
        this.description = `${fileName}:${bookmark.range.start.line + 1}`;
        
        this.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [bookmark.uri, {
                selection: bookmark.range
            }]
        };

        this.iconPath = new vscode.ThemeIcon('bookmark');
        this.contextValue = 'bookmark';
    }
}
