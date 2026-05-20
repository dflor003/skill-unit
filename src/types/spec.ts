export interface SpecFrontmatter {
  name: string;
  skill?: string;
  'extra-skills'?: string[];
  'extra-agents'?: string[];
  'extra-hooks'?: string[];
  tags: string[];
  timeout?: string;
  'global-fixtures'?: string;
  setup?: string;
  teardown?: string;
  'allowed-tools'?: string[];
  'allowed-tools-extra'?: string[];
  'disallowed-tools'?: string[];
  'disallowed-tools-extra'?: string[];
}

export interface TestCase {
  id: string;
  name: string;
  prompt: string;
  expectations: string[];
  'negative-expectations': string[];
  'fixture-paths'?: string[];
}

export interface Spec {
  path: string;
  frontmatter: SpecFrontmatter;
  testCases: TestCase[];
}

export interface ManifestTestCase {
  id: string;
  prompt: string;
  'fixture-paths'?: string[];
}

export interface Manifest {
  'spec-name': string;
  'global-fixture-path': string | null;
  'skill-path': string | null;
  'extra-skill-paths': string[];
  'extra-agent-paths': string[];
  'extra-hook-paths': string[];
  timestamp: string;
  timeout: string;
  runner: {
    tool: string;
    model: string | null;
    'max-turns': number;
    'allowed-tools': string[];
    'disallowed-tools': string[];
  };
  'test-cases': ManifestTestCase[];
}

export interface SpecFilter {
  name?: string[];
  tag?: string[];
  test?: string[];
  file?: string[];
  skill?: string[];
  search?: string;
}
