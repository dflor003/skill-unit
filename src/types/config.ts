export interface RunnerConfig {
  tool: string;
  model: string | null;
  'max-turns': number;
  'runner-concurrency': number;
  'allowed-tools'?: string[];
  'disallowed-tools'?: string[];
}

export interface OutputConfig {
  format: 'interactive' | 'json';
  'show-passing-details': boolean;
  'log-level': LogLevel;
}

export interface ExecutionConfig {
  timeout: string;
  'grader-concurrency': number;
}

export interface DefaultsConfig {
  setup: string;
  teardown: string;
}

export interface SkillUnitConfig {
  'test-dir': string;
  runner: RunnerConfig;
  output: OutputConfig;
  execution: ExecutionConfig;
  defaults: DefaultsConfig;
}

export type LogLevel = 'debug' | 'verbose' | 'info' | 'success' | 'warn' | 'error';
