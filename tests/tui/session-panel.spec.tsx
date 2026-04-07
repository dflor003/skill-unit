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
      const { lastFrame } = render(
        <SessionPanel testId="TEST-1" testName="basic test" status="running" transcript={['line1', 'line2']} gradeTranscript={[]} elapsed={1000} viewMode="execution" scrollOffset={5} following={false} />,
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
});
