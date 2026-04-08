import fs from 'node:fs';
import path from 'node:path';

export interface SelectionState {
  selectedTests: Set<string>;
  viewMode: 'primary' | 'split';
}

export function loadSelection(baseDir: string): SelectionState {
  const filePath = path.join(baseDir, 'selection.json');
  if (!fs.existsSync(filePath)) {
    return { selectedTests: new Set(), viewMode: 'primary' };
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    selectedTests: new Set(data.selectedTests || []),
    viewMode: data.viewMode || 'primary',
  };
}

export function saveSelection(state: SelectionState, baseDir: string): void {
  fs.mkdirSync(baseDir, { recursive: true });
  const filePath = path.join(baseDir, 'selection.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        selectedTests: [...state.selectedTests],
        viewMode: state.viewMode,
      },
      null,
      2
    )
  );
}
