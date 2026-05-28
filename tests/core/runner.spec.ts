import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildSystemPrompt,
  scopeToolsToWorkspace,
  parseTimeout,
  installSkillPlugin,
} from '../../src/core/runner.js';

describe('buildSystemPrompt', () => {
  it('includes workspace path constraint', () => {
    const prompt = buildSystemPrompt('/workspace/abc123', 10);
    expect(prompt).toContain('/workspace/abc123');
    expect(prompt).toContain('workspace');
  });

  it('includes the turn budget number', () => {
    const prompt = buildSystemPrompt('/workspace/abc123', 7);
    expect(prompt).toContain('Turn Budget');
    expect(prompt).toContain('up to 7 assistant turns');
  });

  it('includes the decisiveness directive', () => {
    const prompt = buildSystemPrompt('/workspace/abc123', 10);
    expect(prompt).toContain('Be decisive');
    expect(prompt).toContain('state your conclusion and stop');
  });
});

describe('scopeToolsToWorkspace', () => {
  it('scopes file tools to workspace path', () => {
    const tools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];
    const scoped = scopeToolsToWorkspace(tools, '/workspace/abc');
    const readTool = scoped.find((t) => t.startsWith('Read'));
    expect(readTool).toContain('/workspace/abc');
    // Bash should not be scoped
    expect(scoped).toContain('Bash');
  });
});

describe('parseTimeout', () => {
  it('parses seconds', () => {
    expect(parseTimeout('120s')).toBe(120000);
  });

  it('parses minutes', () => {
    expect(parseTimeout('5m')).toBe(300000);
  });

  it('returns default for invalid input', () => {
    expect(parseTimeout('')).toBe(300000);
    expect(parseTimeout(undefined as any)).toBe(300000);
  });
});

describe('installSkillPlugin', () => {
  describe('when extras are not provided', () => {
    it('should preserve current behavior and auto-mount sibling agents/', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const skillSrc = path.join(tmp, 'src-plugin', 'skills', 'primary');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# primary');
      const agentsSrc = path.join(tmp, 'src-plugin', 'agents');
      fs.mkdirSync(agentsSrc, { recursive: true });
      fs.writeFileSync(path.join(agentsSrc, 'grader.md'), '# grader');
      const pluginDest = path.join(tmp, 'workspace', 'plugin');

      // Act
      const result = installSkillPlugin(skillSrc, pluginDest);

      // Assert
      expect(result).toBe(pluginDest);
      expect(
        fs.existsSync(path.join(pluginDest, 'skills', 'primary', 'SKILL.md'))
      ).toBe(true);
      expect(fs.existsSync(path.join(pluginDest, 'agents', 'grader.md'))).toBe(
        true
      );
    });
  });

  describe('when extra-skills are provided', () => {
    it('should mount each extra skill alongside the primary', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const primary = path.join(tmp, 'src', 'skills', 'primary');
      const extra1 = path.join(tmp, 'src', 'skills', 'helper-a');
      const extra2 = path.join(tmp, 'src', 'skills', 'helper-b');
      for (const p of [primary, extra1, extra2]) {
        fs.mkdirSync(p, { recursive: true });
        fs.writeFileSync(path.join(p, 'SKILL.md'), '# ' + path.basename(p));
      }
      const dest = path.join(tmp, 'work', 'plugin');

      // Act
      installSkillPlugin(primary, dest, {
        extraSkillPaths: [extra1, extra2],
      });

      // Assert
      expect(
        fs.existsSync(path.join(dest, 'skills', 'primary', 'SKILL.md'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dest, 'skills', 'helper-a', 'SKILL.md'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dest, 'skills', 'helper-b', 'SKILL.md'))
      ).toBe(true);
    });
  });

  describe('when extra-agents are provided', () => {
    it('should mount only the listed agents (overriding auto-mount)', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const skillSrc = path.join(tmp, 'src', 'skills', 'primary');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# primary');
      const agentsSrc = path.join(tmp, 'src', 'agents');
      fs.mkdirSync(agentsSrc, { recursive: true });
      fs.writeFileSync(path.join(agentsSrc, 'grader.md'), '# grader');
      fs.writeFileSync(path.join(agentsSrc, 'reviewer.md'), '# reviewer');
      const onlyAgent = path.join(agentsSrc, 'grader.md');
      const dest = path.join(tmp, 'work', 'plugin');

      // Act
      installSkillPlugin(skillSrc, dest, {
        extraAgentPaths: [onlyAgent],
      });

      // Assert: grader is mounted, reviewer is NOT (explicit list overrides auto-mount)
      expect(fs.existsSync(path.join(dest, 'agents', 'grader.md'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'agents', 'reviewer.md'))).toBe(
        false
      );
    });
  });

  describe('when extra-hooks are provided', () => {
    it('should mount each hook directory under plugin/hooks/', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const skillSrc = path.join(tmp, 'src', 'skills', 'primary');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# primary');
      const hookSrc = path.join(tmp, 'src', 'hooks', 'on-stop');
      fs.mkdirSync(hookSrc, { recursive: true });
      fs.writeFileSync(path.join(hookSrc, 'hooks.json'), '{"hooks":{}}');
      const dest = path.join(tmp, 'work', 'plugin');

      // Act
      installSkillPlugin(skillSrc, dest, {
        extraHookPaths: [hookSrc],
      });

      // Assert
      expect(
        fs.existsSync(path.join(dest, 'hooks', 'on-stop', 'hooks.json'))
      ).toBe(true);
    });
  });
});
