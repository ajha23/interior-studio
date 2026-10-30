/**
 * Project invariants. Commands are rejected when they would introduce a new issue, so a project
 * built through commands is always valid; loaded files are checked with the same rules.
 */
import { boxesIntersect, elementBox } from '@/engine/geometry/box';
import { interiorErrors } from '../furniture/interior';
import { dimensionErrors, specFor } from '../furniture/specs';
import { isCabinet, type KitchenElement, type KitchenProject } from '../schema';

export type IssueCode = 'out_of_room' | 'overlap' | 'unsupported_size' | 'unknown_material' | 'invalid_interior' | 'not_on_wall';

export interface Issue {
  code: IssueCode;
  entityIds: string[];
  message: string;
}

export function allElements(project: KitchenProject): KitchenElement[] {
  return [...project.cabinets, ...project.appliances];
}

export function elementLabel(el: KitchenElement): string {
  const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
  return `${spec.label} ${el.dimensions.width}`;
}

export function validateProject(project: KitchenProject): Issue[] {
  const issues: Issue[] = [];
  const { room } = project;
  const elements = allElements(project);
  const boxes = elements.map(elementBox);

  elements.forEach((el, i) => {
    const b = boxes[i]!;
    const name = elementLabel(el);
    if (b.minX < 0 || b.minZ < 0 || b.maxX > room.width || b.maxZ > room.length) {
      issues.push({ code: 'out_of_room', entityIds: [el.id], message: `${name} extends outside the room walls.` });
    } else if (b.maxY > room.height) {
      issues.push({ code: 'out_of_room', entityIds: [el.id], message: `${name} is taller than the ceiling (${b.maxY} mm > ${room.height} mm).` });
    }
    const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
    const sizeErrors = dimensionErrors(spec, el.dimensions);
    if (sizeErrors.length) issues.push({ code: 'unsupported_size', entityIds: [el.id], message: `${name}: ${sizeErrors.join(' ')}` });
    if (spec.mount === 'wall' && !el.wallId) issues.push({ code: 'not_on_wall', entityIds: [el.id], message: `${name} must hang on a wall.` });
    if (isCabinet(el)) {
      const inside = interiorErrors(el);
      if (inside.length) issues.push({ code: 'invalid_interior', entityIds: [el.id], message: `${name}: ${inside.join(' ')}` });
    }
    if (isCabinet(el)) {
      const m = project.materials[el.materialId];
      if (!m || m.category !== 'shutter') issues.push({ code: 'unknown_material', entityIds: [el.id], message: `${name} uses an unknown shutter finish "${el.materialId}".` });
    }
  });

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      if (boxesIntersect(boxes[i]!, boxes[j]!)) {
        const a = elements[i]!;
        const b = elements[j]!;
        issues.push({ code: 'overlap', entityIds: [a.id, b.id], message: `${elementLabel(a)} overlaps ${elementLabel(b)}.` });
      }
    }
  }

  for (const [surface, id] of Object.entries(project.surfaces)) {
    if (project.materials[id]?.category !== surface) {
      issues.push({ code: 'unknown_material', entityIds: [], message: `The ${surface} uses an unknown finish "${id}".` });
    }
  }
  return issues;
}

export function issueKey(issue: Issue): string {
  return `${issue.code}:${[...issue.entityIds].sort().join(',')}`;
}

/** Issues present in `after` that were not already present in `before`. */
export function newIssues(before: KitchenProject, after: KitchenProject): Issue[] {
  const existing = new Set(validateProject(before).map(issueKey));
  return validateProject(after).filter((i) => !existing.has(issueKey(i)));
}
