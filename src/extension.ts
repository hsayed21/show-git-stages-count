import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let statusBarItem: vscode.StatusBarItem;
let updateTimeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  statusBarItem.command = 'show-git-stages-count.refresh';
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('show-git-stages-count.refresh', () => updateCount())
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  watcher.onDidChange(() => debouncedUpdate());
  watcher.onDidCreate(() => debouncedUpdate());
  watcher.onDidDelete(() => debouncedUpdate());
  context.subscriptions.push(watcher);

  // Watch .git directory changes (for commits, checkouts, etc)
  const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/**');
  gitWatcher.onDidChange(() => debouncedUpdate());
  gitWatcher.onDidCreate(() => debouncedUpdate());
  gitWatcher.onDidDelete(() => debouncedUpdate());
  context.subscriptions.push(gitWatcher);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => debouncedUpdate())
  );

  // Watch when window focus changes
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(() => debouncedUpdate())
  );

  updateCount();
  
  // Periodic update every 3 seconds as fallback
  const interval = setInterval(() => updateCount(), 3000);
  context.subscriptions.push({
    dispose: () => clearInterval(interval)
  });
}

function debouncedUpdate(): void {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = setTimeout(() => updateCount(), 500);
}

async function updateCount(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    statusBarItem.hide();
    return;
  }

  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd: workspaceFolder.uri.fsPath,
      timeout: 2000
    });

    let staged = 0;
    let unstaged = 0;

    const lines = stdout.split('\n').filter(line => line.trim());
    for (const line of lines) {
      if (line.length < 2) continue;
      
      const x = line[0]; // Index status (staged)
      const y = line[1]; // Working tree status (unstaged)

      if (x !== ' ' && x !== '?') staged++;
      if (y !== ' ' || x === '?') unstaged++;
    }

    const total = staged + unstaged;
    
    if (total === 0) {
      statusBarItem.text = '$(git-branch) 0';
      statusBarItem.tooltip = 'No changes';
    } else {
      statusBarItem.text = `$(git-branch) S:${staged} U:${unstaged}`;
      statusBarItem.tooltip = `Staged: ${staged}\nUnstaged: ${unstaged}\nTotal: ${total}`;
    }
    
    statusBarItem.show();
  } catch {
    statusBarItem.hide();
  }
}

export function deactivate(): void {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
}