import type { Key } from 'ink';

function matchSingleKey(spec: string, input: string, key: Key): boolean {
  if (spec === 'up') return key.upArrow;
  if (spec === 'down') return key.downArrow;
  if (spec === 'left') return key.leftArrow;
  if (spec === 'right') return key.rightArrow;
  if (spec === 'enter') return key.return;
  if (spec === 'escape') return key.escape;
  if (spec === 'backspace') return key.backspace;
  if (spec === 'delete') return key.delete;
  if (spec === 'pageup') return key.pageUp;
  if (spec === 'pagedown') return key.pageDown;
  if (spec === 'tab') return key.tab && !key.shift;
  if (spec === 'shift+tab') return key.tab && key.shift;
  if (spec === 'space') return input === ' ' && !key.ctrl && !key.meta;

  if (spec.startsWith('ctrl+')) {
    const letter = spec.slice(5);
    return key.ctrl && input === letter;
  }

  return input === spec && !key.ctrl && !key.meta;
}

export function matchKey(
  spec: string | string[],
  input: string,
  key: Key
): boolean {
  if (Array.isArray(spec)) {
    return spec.some((s) => matchSingleKey(s, input, key));
  }
  return matchSingleKey(spec, input, key);
}

export function isPrintable(input: string, key: Key): boolean {
  if (input.length === 0) return false;
  if (key.ctrl || key.meta) return false;
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)
    return false;
  if (key.return || key.escape || key.tab || key.backspace || key.delete)
    return false;
  if (key.pageUp || key.pageDown) return false;
  return true;
}
