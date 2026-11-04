import { describe, it, expect, beforeEach } from 'vitest';
import { PREDEFINED_ROLE_TEMPLATES, getRoleTemplates, getRoleTemplateById } from './roleTemplates';
import { RoleTemplateSchema } from './types';
import { bootstrapModuleRegistry } from './bootstrap';
import { moduleRegistry } from './moduleRegistry';

describe('Role Templates (T002, T003)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
  });

  it('validates all predefined templates against RoleTemplateSchema', () => {
    expect(PREDEFINED_ROLE_TEMPLATES.length).toBeGreaterThanOrEqual(5);

    for (const template of PREDEFINED_ROLE_TEMPLATES) {
      const parsed = RoleTemplateSchema.safeParse(template);
      expect(parsed.success).toBe(true);
    }
  });

  it('ensures all granted permissions in templates exist in the Central Module Registry', () => {
    const allRegisteredPermissions = new Set(
      moduleRegistry.getAllPermissions().map((p) => p.id)
    );

    for (const template of PREDEFINED_ROLE_TEMPLATES) {
      for (const permId of template.grantedPermissionIds) {
        expect(allRegisteredPermissions.has(permId)).toBe(true);
      }
    }
  });

  it('provides helper functions getRoleTemplates and getRoleTemplateById', () => {
    const templates = getRoleTemplates();
    expect(templates).toHaveLength(5);

    const pm = getRoleTemplateById('tpl-project-manager');
    expect(pm).toBeDefined();
    expect(pm?.name).toBe('Project Manager');
    expect(pm?.recommendedScope).toBe('all_projects');

    const designer = getRoleTemplateById('tpl-designer');
    expect(designer).toBeDefined();
    expect(designer?.recommendedScope).toBe('assigned_projects');

    expect(getRoleTemplateById('non-existent')).toBeUndefined();
  });
});
