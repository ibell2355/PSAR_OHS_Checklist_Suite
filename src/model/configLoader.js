import { parseSimpleYaml } from '../utils/simpleYaml.js';

/**
 * Load and validate a YAML checklist config by id.
 * Tries relative then absolute path.
 */
export async function loadChecklistConfig(checklistId) {
  const candidates = [
    `./config/${checklistId}.yaml`,
    `/config/${checklistId}.yaml`
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      const config = parseSimpleYaml(text);
      if (!config.sections || !config.title) {
        return { ok: false, error: 'Config missing required keys: sections, title' };
      }
      return { ok: true, config };
    } catch (e) {
      continue;
    }
  }

  return { ok: false, error: `Could not load config for checklist: ${checklistId}` };
}
