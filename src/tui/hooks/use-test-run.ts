import { useState, useEffect, useRef, useCallback } from 'react';
import type { TestStatus } from '../../types/run.js';

export interface TestRunEntry {
  id: string;
  name: string;
  specName: string;
  status: TestStatus;
  durationMs: number;
  transcript: string[];
  activity: string;
}

export interface TestRunState {
  status: 'idle' | 'running' | 'complete';
  tests: TestRunEntry[];
  activeTestId: string | null;
  elapsed: number;
}

export interface TestRunActions {
  startRun: (tests: Array<{ id: string; name: string; specName: string }>) => void;
  selectTest: (id: string) => void;
  updateTest: (id: string, patch: Partial<TestRunEntry>) => void;
  completeRun: () => void;
}

const INITIAL_STATE: TestRunState = {
  status: 'idle',
  tests: [],
  activeTestId: null,
  elapsed: 0,
};

export function useTestRun(): [TestRunState, TestRunActions] {
  const [state, setState] = useState<TestRunState>(INITIAL_STATE);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRun = useCallback(
    (tests: Array<{ id: string; name: string; specName: string }>) => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }

      const entries: TestRunEntry[] = tests.map(t => ({
        id: t.id,
        name: t.name,
        specName: t.specName,
        status: 'pending',
        durationMs: 0,
        transcript: [],
        activity: '',
      }));

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          setState(prev => ({
            ...prev,
            elapsed: Date.now() - startTimeRef.current!,
          }));
        }
      }, 250);

      setState({
        status: 'running',
        tests: entries,
        activeTestId: entries[0]?.id ?? null,
        elapsed: 0,
      });
    },
    [],
  );

  const selectTest = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeTestId: id }));
  }, []);

  const updateTest = useCallback((id: string, patch: Partial<TestRunEntry>) => {
    setState(prev => ({
      ...prev,
      tests: prev.tests.map(t => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const completeRun = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState(prev => ({ ...prev, status: 'complete' }));
  }, []);

  const actions: TestRunActions = { startRun, selectTest, updateTest, completeRun };
  return [state, actions];
}
