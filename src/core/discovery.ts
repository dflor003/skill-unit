import fs from 'node:fs';
import path from 'node:path';
import type { Spec, SpecFilter } from '../types/spec.js';

export function discoverSpecPaths(testDir: string): string[] {
  const results: string[] = [];
  walkDir(testDir, results);
  return results.sort();
}

function walkDir(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'fixtures') continue;
      walkDir(fullPath, results);
    } else if (entry.name.endsWith('.spec.md')) {
      results.push(fullPath);
    }
  }
}

export function filterSpecs(specs: Spec[], filter: SpecFilter): Spec[] {
  let result = specs;

  if (filter.name && filter.name.length > 0) {
    result = result.filter((s) => filter.name!.includes(s.frontmatter.name));
  }

  if (filter.skill && filter.skill.length > 0) {
    result = result.filter(
      (s) =>
        s.frontmatter.skill !== undefined &&
        filter.skill!.includes(s.frontmatter.skill)
    );
  }

  if (filter.tag && filter.tag.length > 0) {
    result = result.filter((s) =>
      s.frontmatter.tags.some((t) => filter.tag!.includes(t))
    );
  }

  if (filter.file && filter.file.length > 0) {
    result = result.filter((s) => {
      const normalized = path.normalize(s.path);
      return filter.file!.some((f) => normalized === path.normalize(f));
    });
  }

  if (filter.test && filter.test.length > 0) {
    result = result
      .map((s) => ({
        ...s,
        testCases: s.testCases.filter((tc) => filter.test!.includes(tc.id)),
      }))
      .filter((s) => s.testCases.length > 0);
  }

  if (filter.search && filter.search.trim().length > 0) {
    const query = filter.search.trim().toLowerCase();
    result = result
      .map((s) => {
        const specHit =
          s.frontmatter.name.toLowerCase().includes(query) ||
          (s.frontmatter.skill?.toLowerCase().includes(query) ?? false) ||
          path.basename(s.path).toLowerCase().includes(query);
        if (specHit) return s;
        const matchedCases = s.testCases.filter(
          (tc) =>
            tc.id.toLowerCase().includes(query) ||
            tc.name.toLowerCase().includes(query)
        );
        if (matchedCases.length > 0) {
          return { ...s, testCases: matchedCases };
        }
        return null;
      })
      .filter((s): s is Spec => s !== null);
  }

  return result;
}
