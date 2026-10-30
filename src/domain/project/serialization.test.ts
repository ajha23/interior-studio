import { describe, expect, it } from 'vitest';
import { createExampleProject, FILE_FORMAT, parseProjectFile, serializeProject } from '@/domain';

describe('project files', () => {
  it('round-trips entities and material assignments', () => {
    const p = createExampleProject();
    const parsed = parseProjectFile(serializeProject(p));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.project).toEqual(p);
      expect(parsed.issues).toEqual([]);
    }
  });

  it.each([
    ['not JSON', '{nope', /not valid JSON/],
    ['another format', JSON.stringify({ format: 'something-else' }), /not an Interior Studio/],
    ['a newer schema', JSON.stringify({ format: FILE_FORMAT, schemaVersion: 99, project: {} }), /newer version/],
    ['no project', JSON.stringify({ format: FILE_FORMAT, schemaVersion: 1 }), /no project/],
  ])('rejects %s', (_label, text, message) => {
    const parsed = parseProjectFile(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[0]).toMatch(message);
  });

  it('rejects invalid dimensions with the path to the bad value', () => {
    const p = createExampleProject();
    const file = JSON.parse(serializeProject(p));
    file.project.cabinets[0].dimensions.width = -600;
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join('\n')).toMatch(/cabinets\.0\.dimensions\.width/);
  });

  it('loads but reports a file whose units overlap', () => {
    const p = createExampleProject();
    const file = JSON.parse(serializeProject(p));
    file.project.cabinets[1].position = file.project.cabinets[0].position;
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.ok && parsed.issues.some((i) => i.code === 'overlap')).toBe(true);
  });
});
