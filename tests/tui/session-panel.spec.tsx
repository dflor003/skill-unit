import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { SessionPanel } from '../../src/tui/components/session-panel.js';

describe('SessionPanel', () => {
  describe('when no session is selected', () => {
    it('should show a placeholder message', () => {
      const { lastFrame } = render(
        <SessionPanel testId={null} testName="" status="idle" transcript={[]} gradeTranscript={[]} elapsed={0} viewMode="execution" />,
      );
      expect(lastFrame()!).toContain('No session selected');
    });
  });

  describe('when transcript is empty', () => {
    it('should show waiting message', () => {
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="basic test" status="running" transcript={[]} gradeTranscript={[]} elapsed={5000} viewMode="execution" />,
      );
      expect(lastFrame()!).toContain('Waiting for output');
    });
  });

  describe('when transcript has content', () => {
    it('should render the test name and status', () => {
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="basic test" status="running" transcript={['## Turn 1', 'Hello']} gradeTranscript={[]} elapsed={5000} viewMode="execution" />,
      );
      const output = lastFrame()!;
      expect(output).toContain('basic test');
      expect(output).toContain('Running');
    });
  });

  describe('when viewMode is grading', () => {
    it('should show the grading indicator as active', () => {
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="basic test" status="grading" transcript={['exec']} gradeTranscript={['grading output']} elapsed={5000} viewMode="grading" />,
      );
      const output = lastFrame()!;
      expect(output).toContain('[Grading]');
    });
  });

  describe('when viewMode is execution', () => {
    it('should show the execution indicator as active', () => {
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="basic test" status="running" transcript={['exec output']} gradeTranscript={[]} elapsed={5000} viewMode="execution" />,
      );
      const output = lastFrame()!;
      expect(output).toContain('[Execution]');
    });
  });

  describe('when not following and scrolled up', () => {
    it('should show the follow indicator', () => {
      // Arrange -- enough lines to actually be scrollable
      const manyLines = Array.from({ length: 50 }, (_, i) => `line-${i}`);
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="basic test" status="running" transcript={manyLines} gradeTranscript={[]} elapsed={1000} viewMode="execution" scrollOffset={5} following={false} />,
      );
      expect(lastFrame()!).toContain('[f] follow');
    });
  });

  describe('when following', () => {
    it('should not show the follow indicator', () => {
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="basic test" status="running" transcript={['line1']} gradeTranscript={[]} elapsed={1000} viewMode="execution" />,
      );
      expect(lastFrame()!).not.toContain('[f] follow');
    });
  });

  describe('when scrolling with a long transcript', () => {
    // Generate enough lines to exceed default panel height
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i + 1}`);

    it('when scrollOffset is 0 should show the last lines (bottom)', () => {
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="test" status="passed" transcript={lines} gradeTranscript={[]} elapsed={0} viewMode="execution" scrollOffset={0} following={true} />,
      );
      const output = lastFrame()!;
      expect(output).toContain('line-50');
    });

    it('when scrollOffset is large should show earlier lines', () => {
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="test" status="passed" transcript={lines} gradeTranscript={[]} elapsed={0} viewMode="execution" scrollOffset={30} following={false} />,
      );
      const output = lastFrame()!;
      // Should NOT show the very last line when scrolled up 30 lines
      expect(output).not.toContain('line-50');
      // Should show some earlier content
      expect(output).toContain('line-');
    });

    it('when scrollOffset exceeds transcript length should clamp to top and not get stuck', () => {
      // panelHeight defaults to 24, visibleLines = 20, maxOffset = 50 - 20 = 30
      // Offset 9999 clamps to 30 (top of transcript)
      // Offset 27 is 3 below max, so view shifts down by 3 lines
      const { lastFrame: atTop } = render(
        <SessionPanel testId="TEST-1" testName="test" status="passed" transcript={lines} gradeTranscript={[]} elapsed={0} viewMode="execution" scrollOffset={9999} following={false} />,
      );
      const { lastFrame: slightlyDown } = render(
        <SessionPanel testId="TEST-1" testName="test" status="passed" transcript={lines} gradeTranscript={[]} elapsed={0} viewMode="execution" scrollOffset={27} following={false} />,
      );

      // Assert
      const top = atTop()!;
      const down = slightlyDown()!;
      expect(top).toContain('line-');
      expect(down).toContain('line-');
      const getMaxLine = (s: string) => {
        const matches = s.match(/line-(\d+)/g) || [];
        return Math.max(...matches.map(m => parseInt(m.replace('line-', ''))));
      };
      // Scrolling down from the top should show later (higher-numbered) lines
      expect(getMaxLine(down)).toBeGreaterThan(getMaxLine(top));
    });

    it('when scrollOffset decreases from large value should show later lines', () => {
      // First render scrolled up
      const { lastFrame: frame1 } = render(
        <SessionPanel testId="TEST-1" testName="test" status="passed" transcript={lines} gradeTranscript={[]} elapsed={0} viewMode="execution" scrollOffset={30} following={false} />,
      );
      // Second render scrolled down (closer to bottom)
      const { lastFrame: frame2 } = render(
        <SessionPanel testId="TEST-1" testName="test" status="passed" transcript={lines} gradeTranscript={[]} elapsed={0} viewMode="execution" scrollOffset={3} following={false} />,
      );
      const out1 = frame1()!;
      const out2 = frame2()!;
      // The second render should show content closer to the bottom
      // Find the highest line number mentioned in each
      const getMaxLine = (s: string) => {
        const matches = s.match(/line-(\d+)/g) || [];
        return Math.max(...matches.map(m => parseInt(m.replace('line-', ''))));
      };
      expect(getMaxLine(out2)).toBeGreaterThan(getMaxLine(out1));
    });
  });
});
