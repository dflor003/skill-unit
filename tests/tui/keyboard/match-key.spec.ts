import { describe, it, expect } from 'vitest';
import { matchKey, isPrintable } from '../../../src/tui/keyboard/match-key.js';
import type { Key } from 'ink';

const emptyKey: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
};

describe('matchKey', () => {
  describe('when matching a single letter', () => {
    it('should match the exact case', () => {
      // Act + Assert
      expect(matchKey('a', 'a', emptyKey)).toBe(true);
      expect(matchKey('A', 'A', emptyKey)).toBe(true);
    });

    it('should not match a different case', () => {
      // Act + Assert
      expect(matchKey('a', 'A', emptyKey)).toBe(false);
      expect(matchKey('A', 'a', emptyKey)).toBe(false);
    });
  });

  describe('when matching special keys', () => {
    it('should match up arrow', () => {
      expect(matchKey('up', '', { ...emptyKey, upArrow: true })).toBe(true);
    });

    it('should match enter via return flag', () => {
      expect(matchKey('enter', '', { ...emptyKey, return: true })).toBe(true);
    });

    it('should match space via input character', () => {
      expect(matchKey('space', ' ', emptyKey)).toBe(true);
    });

    it('should match escape', () => {
      expect(matchKey('escape', '', { ...emptyKey, escape: true })).toBe(true);
    });

    it('should match tab without shift', () => {
      expect(matchKey('tab', '', { ...emptyKey, tab: true })).toBe(true);
      expect(matchKey('tab', '', { ...emptyKey, tab: true, shift: true })).toBe(
        false
      );
    });

    it('should match shift+tab only when shift is held', () => {
      expect(
        matchKey('shift+tab', '', { ...emptyKey, tab: true, shift: true })
      ).toBe(true);
      expect(matchKey('shift+tab', '', { ...emptyKey, tab: true })).toBe(false);
    });
  });

  describe('when matching ctrl modifier', () => {
    it('should match ctrl+c', () => {
      expect(matchKey('ctrl+c', 'c', { ...emptyKey, ctrl: true })).toBe(true);
    });

    it('should not match plain c', () => {
      expect(matchKey('ctrl+c', 'c', emptyKey)).toBe(false);
    });

    it('should not match ctrl+c against plain c', () => {
      expect(matchKey('c', 'c', { ...emptyKey, ctrl: true })).toBe(false);
    });
  });

  describe('when matching numeric digits', () => {
    it('should match 1 through 9', () => {
      for (let i = 1; i <= 9; i++) {
        expect(matchKey(String(i), String(i), emptyKey)).toBe(true);
      }
    });
  });

  describe('when given an array of keys', () => {
    it('should match any key in the array', () => {
      expect(matchKey(['y', 'Y'], 'y', emptyKey)).toBe(true);
      expect(matchKey(['y', 'Y'], 'Y', emptyKey)).toBe(true);
      expect(matchKey(['y', 'Y'], 'n', emptyKey)).toBe(false);
    });
  });
});

describe('isPrintable', () => {
  it('should return true for a printable letter', () => {
    expect(isPrintable('a', emptyKey)).toBe(true);
    expect(isPrintable('Z', emptyKey)).toBe(true);
  });

  it('should return true for space', () => {
    expect(isPrintable(' ', emptyKey)).toBe(true);
  });

  it('should return true for a digit', () => {
    expect(isPrintable('7', emptyKey)).toBe(true);
  });

  it('should return false for empty input', () => {
    expect(isPrintable('', emptyKey)).toBe(false);
  });

  it('should return false when ctrl is held', () => {
    expect(isPrintable('c', { ...emptyKey, ctrl: true })).toBe(false);
  });

  it('should return false when meta is held', () => {
    expect(isPrintable('c', { ...emptyKey, meta: true })).toBe(false);
  });

  it('should return false for arrow keys', () => {
    expect(isPrintable('', { ...emptyKey, upArrow: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, downArrow: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, leftArrow: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, rightArrow: true })).toBe(false);
  });

  it('should return false for return, escape, tab, backspace, delete', () => {
    expect(isPrintable('', { ...emptyKey, return: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, escape: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, tab: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, backspace: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, delete: true })).toBe(false);
  });

  it('should return true for shift+letter (capital letter)', () => {
    expect(isPrintable('A', { ...emptyKey, shift: true })).toBe(true);
  });
});
