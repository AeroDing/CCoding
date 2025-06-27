import * as path from 'node:path'
import * as vscode from 'vscode'

interface TimelineEvent {
  id: string
  timestamp: number
  type: 'file_created' | 'file_modified' | 'file_deleted' | 'symbol_added' | 'symbol_modified'
  file: string
  description: string
  details?: any
}

export class TimelineProvider {
  private events: TimelineEvent[] = []
  private watchers: vscode.FileSystemWatcher[] = []

  constructor() {
    this.initializeWatchers()
    this.loadRecentFiles()
  }

  async showTimeline() {
    const items = this.events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50)
      .map(event => ({
        label: event.description,
        description: this.formatTimestamp(event.timestamp),
        detail: event.file,
        event,
      }))

    if (items.length === 0) {
      vscode.window.showInformationMessage('No timeline events found')
      return
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a timeline event to view',
      matchOnDescription: true,
      matchOnDetail: true,
    })

    if (selected && selected.event.type !== 'file_deleted') {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
      if (workspaceFolder) {
        const filePath = path.join(workspaceFolder.uri.fsPath, selected.event.file)
        try {
          const uri = vscode.Uri.file(filePath)
          await vscode.window.showTextDocument(uri)
        }
        catch {
          vscode.window.showErrorMessage(`Could not open file: ${selected.event.file}`)
        }
      }
    }
  }

  private initializeWatchers() {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) {
      return
    }

    for (const folder of workspaceFolders) {
      const pattern = new vscode.RelativePattern(folder, '**/*.{js,ts,jsx,tsx,vue,py,java,c,cpp,cs,php,rb,go,rs,swift}')

      const watcher = vscode.workspace.createFileSystemWatcher(pattern)

      watcher.onDidCreate((uri) => {
        this.addEvent({
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: 'file_created',
          file: vscode.workspace.asRelativePath(uri),
          description: `Created ${path.basename(uri.fsPath)}`,
        })
      })

      watcher.onDidChange((uri) => {
        this.addEvent({
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: 'file_modified',
          file: vscode.workspace.asRelativePath(uri),
          description: `Modified ${path.basename(uri.fsPath)}`,
        })
      })

      watcher.onDidDelete((uri) => {
        this.addEvent({
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: 'file_deleted',
          file: vscode.workspace.asRelativePath(uri),
          description: `Deleted ${path.basename(uri.fsPath)}`,
        })
      })

      this.watchers.push(watcher)
    }

    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length > 0) {
        this.addEvent({
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: 'file_modified',
          file: vscode.workspace.asRelativePath(event.document.uri),
          description: `Edited ${path.basename(event.document.uri.fsPath)}`,
          details: {
            changes: event.contentChanges.length,
            version: event.document.version,
          },
        })
      }
    })
  }

  private async loadRecentFiles() {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) {
      return
    }

    for (const folder of workspaceFolders) {
      const pattern = new vscode.RelativePattern(folder, '**/*.{js,ts,jsx,tsx,vue,py,java,c,cpp,cs,php,rb,go,rs,swift}')
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 20)

      for (const file of files) {
        try {
          const stat = await vscode.workspace.fs.stat(file)
          this.addEvent({
            id: `${file.fsPath}-${stat.mtime}`,
            timestamp: stat.mtime,
            type: 'file_modified',
            file: vscode.workspace.asRelativePath(file),
            description: `File ${path.basename(file.fsPath)}`,
          })
        }
        catch (error) {
          console.error(`Error getting file stats for ${file.fsPath}:`, error)
        }
      }
    }

    this.events.sort((a, b) => b.timestamp - a.timestamp)
  }

  private addEvent(event: TimelineEvent) {
    const existingIndex = this.events.findIndex(e =>
      e.file === event.file
      && e.type === event.type
      && Math.abs(e.timestamp - event.timestamp) < 1000,
    )

    if (existingIndex !== -1) {
      this.events[existingIndex] = event
    }
    else {
      this.events.push(event)

      if (this.events.length > 1000) {
        this.events = this.events
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 500)
      }
    }
  }

  private formatTimestamp(timestamp: number): string {
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) {
      return 'Just now'
    }
    else if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000)
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    }
    else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      return `${hours} hour${hours > 1 ? 's' : ''} ago`
    }
    else {
      const days = Math.floor(diff / 86400000)
      return `${days} day${days > 1 ? 's' : ''} ago`
    }
  }

  dispose() {
    this.watchers.forEach(watcher => watcher.dispose())
  }
}
