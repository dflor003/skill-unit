import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit } from '../../src/cli/commands/init.js';

const BOOTSTRAP_PERMISSION = 'Bash(node */skill-unit/scripts/*)';

describe('cli init', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-unit-init-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('when run against an empty project', () => {
    it('should create the skill-tests directory with a .gitkeep', () => {
      // Act
      runInit(root);

      // Assert
      const gitkeep = path.join(root, 'skill-tests', '.gitkeep');
      expect(fs.existsSync(gitkeep)).toBe(true);
      expect(fs.readFileSync(gitkeep, 'utf-8')).toBe('');
    });

    it('should create .skill-unit.yml at the project root', () => {
      // Act
      runInit(root);

      // Assert
      const config = path.join(root, '.skill-unit.yml');
      expect(fs.existsSync(config)).toBe(true);
      const content = fs.readFileSync(config, 'utf-8');
      expect(content).toContain('test-dir: skill-tests');
    });

    it('should add .workspace to the .gitignore', () => {
      // Act
      runInit(root);

      // Assert
      const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
      expect(gitignore.trim().split(/\r?\n/)).toContain('.workspace');
    });

    it('should add the bootstrap permission to .claude/settings.json', () => {
      // Act
      runInit(root);

      // Assert
      const settingsPath = path.join(root, '.claude', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.permissions.allow).toContain(BOOTSTRAP_PERMISSION);
    });

    it('should report that changes were made', () => {
      // Act
      const result = runInit(root);

      // Assert
      expect(result.changed).toBe(true);
      expect(result.steps.every((s) => s.action !== 'skipped')).toBe(true);
    });
  });

  describe('when run twice against the same project', () => {
    it('should be idempotent and report no new changes the second time', () => {
      // Arrange
      runInit(root);

      // Act
      const result = runInit(root);

      // Assert
      expect(result.changed).toBe(false);
      expect(result.steps.every((s) => s.action === 'skipped')).toBe(true);
    });

    it('should not duplicate the .workspace entry in .gitignore', () => {
      // Arrange
      runInit(root);

      // Act
      runInit(root);

      // Assert
      const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
      const matches = gitignore
        .split(/\r?\n/)
        .filter((l) => l.trim() === '.workspace');
      expect(matches).toHaveLength(1);
    });

    it('should not duplicate the permission entry in settings.json', () => {
      // Arrange
      runInit(root);

      // Act
      runInit(root);

      // Assert
      const settings = JSON.parse(
        fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8')
      );
      const matches = (settings.permissions.allow as string[]).filter(
        (e) => e === BOOTSTRAP_PERMISSION
      );
      expect(matches).toHaveLength(1);
    });
  });

  describe('when .skill-unit.yml already exists', () => {
    it('should not overwrite existing config content', () => {
      // Arrange
      const configPath = path.join(root, '.skill-unit.yml');
      const preExisting = 'test-dir: custom-tests\n';
      fs.writeFileSync(configPath, preExisting, 'utf-8');

      // Act
      runInit(root);

      // Assert
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(preExisting);
    });
  });

  describe('when .gitignore already has unrelated entries', () => {
    it('should append .workspace without touching existing lines', () => {
      // Arrange
      const gitignorePath = path.join(root, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules\ndist\n', 'utf-8');

      // Act
      runInit(root);

      // Assert
      const lines = fs
        .readFileSync(gitignorePath, 'utf-8')
        .split(/\r?\n/)
        .filter(Boolean);
      expect(lines).toEqual(['node_modules', 'dist', '.workspace']);
    });
  });

  describe('when .claude/settings.json already has other permissions', () => {
    it('should preserve them and append the bootstrap permission', () => {
      // Arrange
      const settingsPath = path.join(root, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ permissions: { allow: ['Read', 'Write'] } }, null, 2),
        'utf-8'
      );

      // Act
      runInit(root);

      // Assert
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.permissions.allow).toEqual([
        'Read',
        'Write',
        BOOTSTRAP_PERMISSION,
      ]);
    });
  });

  describe('when .claude/settings.json is malformed JSON', () => {
    it('should throw a descriptive error', () => {
      // Arrange
      const settingsPath = path.join(root, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, '{ not json }', 'utf-8');

      // Act + Assert
      expect(() => runInit(root)).toThrow(/Failed to parse/);
    });
  });
});
