/**
 * Metadata extraction — parse harness files to extract name, description, tags, etc.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Extract metadata from a SKILL.md file.
 *
 * @param {string} filePath - absolute path to SKILL.md
 * @param {string} skillId - the skill directory name (used as the ID)
 * @returns {{ id: string, name: string, description: string, tags: string[] }}
 */
function extractSkillMetadata(filePath, skillId) {
	const content = fs.readFileSync(filePath, 'utf8');
	const lines = content.split('\n');

	const name = extractTitle(lines) || skillId;
	const description = extractDescription(lines) || '';
	const tags = inferTagsFromContent(content, skillId);

	return { id: skillId, name, description, tags };
}

/**
 * Extract metadata from a .agent.md or .prompt.md file.
 *
 * @param {string} filePath - absolute path to the file
 * @param {string} promptId - the filename stem (e.g. "incident-commander")
 * @returns {{ id: string, name: string, description: string, tags: string[] }}
 */
function extractPromptMetadata(filePath, promptId) {
	const content = fs.readFileSync(filePath, 'utf8');
	const lines = content.split('\n');

	const name = extractTitle(lines) || promptId;
	const description = extractDescription(lines) || '';
	const tags = inferTagsFromContent(content, promptId);

	return { id: promptId, name, description, tags };
}

/**
 * Extract metadata from a .flow.yaml file.
 *
 * @param {string} filePath - absolute path to the .flow.yaml file
 * @param {string} flowId - the filename stem (e.g. "war-room-triage")
 * @returns {{ id: string, name: string, description: string, orchestration: string, roles: number, tags: string[], usesSkills: string[], usesPrompts: string[] }}
 */
function extractFlowMetadata(filePath, flowId) {
	const content = fs.readFileSync(filePath, 'utf8');

	let doc;
	try {
		doc = yaml.load(content);
	} catch (e) {
		// Fall back to regex extraction for fragile YAML files
		doc = extractFlowFieldsFromText(content);
	}

	const name = doc.name || flowId;
	const description = doc.description || '';
	const orchestration = detectOrchestration(doc);
	const roles = countRoles(doc);
	const tags = inferTagsFromFlow(doc, flowId);
	const usesSkills = extractUsedSkills(doc);
	const usesPrompts = extractUsedPrompts(doc);

	return { id: flowId, name, description, orchestration, roles, tags, usesSkills, usesPrompts };
}

/**
 * Fallback: extract flow fields from YAML text using regex when js-yaml fails.
 */
function extractFlowFieldsFromText(content) {
	const doc = {};

	// Extract top-level key: value pairs (single-line values)
	const nameMatch = content.match(/^name:\s*(.+)$/m);
	if (nameMatch) doc.name = nameMatch[1].trim();

	const descMatch = content.match(/^description:\s*(.+)$/m);
	if (descMatch) doc.description = descMatch[1].trim();

	// Extract skills references
	const skills = new Set();
	const skillRefs = content.matchAll(/skills:\s*\[([^\]]*)\]/g);
	for (const match of skillRefs) {
		match[1].split(',').forEach(s => {
			const clean = s.trim().replace(/^['"]|['"]$/g, '');
			if (clean) skills.add(clean);
		});
	}
	if (skills.size > 0) doc._skills = [...skills];

	// Extract agent references
	const prompts = new Set();
	const agentRefs = content.matchAll(/agent:\s*(\S+)/g);
	for (const match of agentRefs) {
		prompts.add(match[1].trim());
	}
	if (prompts.size > 0) doc._prompts = [...prompts];

	// Detect stages
	if (content.match(/^stages:/m)) doc.stages = [];
	// Detect groups + join
	if (content.match(/^groups:/m)) doc.groups = [];
	if (content.match(/^join:/m)) doc.join = {};
	// Fall back: detect roles
	if (!doc.stages && !doc.groups) {
		doc.roles = [];
	}

	// Count unique role names for the roles count fallback
	const roleNames = new Set();
	const roleRefs = content.matchAll(/^\s+- name:\s*(\S+)/gm);
	for (const match of roleRefs) {
		roleNames.add(match[1].trim());
	}
	doc._roleCount = roleNames.size;

	return doc;
}

// ---- helpers ----

function extractTitle(lines) {
	for (const line of lines) {
		const match = line.match(/^#\s+(.+)/);
		if (match) {
			return match[1].trim();
		}
	}
	return null;
}

function extractDescription(lines) {
	let foundTitle = false;
	for (let i = 0; i < lines.length; i++) {
		if (foundTitle) {
			const trimmed = lines[i].trim();
			if (trimmed && !trimmed.startsWith('#')) {
				// Return first non-empty paragraph (up to 200 chars)
				return trimmed.length > 200 ? trimmed.slice(0, 197) + '...' : trimmed;
			}
		}
		if (lines[i].match(/^#\s+/)) {
			foundTitle = true;
			// Skip the ## section headers that follow the title
			continue;
		}
	}
	return '';
}

function inferTagsFromContent(content, id) {
	const tags = new Set();
	const lower = content.toLowerCase();

	// Domain tags
	if (lower.includes('test') || lower.includes('testing')) tags.add('testing');
	if (lower.includes('incident') || lower.includes('triage') || lower.includes('outage')) tags.add('incident');
	if (lower.includes('devops') || lower.includes('sre') || lower.includes('production')) tags.add('devops');
	if (lower.includes('security') || lower.includes('vulnerability')) tags.add('security');
	if (lower.includes('performance') || lower.includes('latency') || lower.includes('throughput')) tags.add('performance');
	if (lower.includes('config') || lower.includes('setup') || lower.includes('init')) tags.add('config');
	if (lower.includes('review') || lower.includes('pr') || lower.includes('pull request')) tags.add('code-review');
	if (lower.includes('debug') || lower.includes('troubleshoot')) tags.add('debugging');

	// Test scope tags
	if (lower.includes('unit test')) tags.add('unit');
	if (lower.includes('integration test')) tags.add('integration');
	if (lower.includes('e2e') || lower.includes('end-to-end')) tags.add('e2e');
	if (lower.includes('contract test')) tags.add('contract');

	// Technology tags
	if (lower.includes('react') || lower.includes('jsx')) tags.add('react');
	if (lower.includes('typescript')) tags.add('typescript');
	if (lower.includes('python')) tags.add('python');
	if (lower.includes('database') || lower.includes('sql')) tags.add('database');
	if (lower.includes('api') || lower.includes('rest')) tags.add('api');
	if (lower.includes('ai') || lower.includes('copilot') || lower.includes('claude')) tags.add('ai');

	// If no tags inferred, use a sensible default from id
	if (tags.size === 0) {
		tags.add(id.split('-')[0] || 'general');
	}

	return [...tags].sort();
}

function inferTagsFromFlow(doc, flowId) {
	const tags = new Set();

	// From orchestration type
	const orch = detectOrchestration(doc);
	if (orch) tags.add(orch);

	// From flow description and name
	const text = ((doc.description || '') + ' ' + (doc.name || '') + ' ' + flowId).toLowerCase();
	tags.forEach(t => { if (text.includes(t)) tags.add(t); });

	// Explicit tags in flow YAML
	if (Array.isArray(doc.tags)) {
		doc.tags.forEach(t => tags.add(t));
	}

	if (tags.size === 0) {
		tags.add(flowId.split('-')[0] || 'general');
	}

	return [...tags].sort();
}

function detectOrchestration(doc) {
	if (doc.stages && doc.stages.length > 0) return 'staged';
	if (doc.groups && doc.groups.length > 0 && doc.join) return 'fork-join';
	if (doc.roles && doc.roles.length > 0) return 'sequence';
	// For fallback docs where we can only detect structure from YAML text
	if (doc.stages) return 'staged';
	if (doc.groups) return 'fork-join';
	return 'sequence';
}

function countRoles(doc) {
	// For fallback docs, count from regex patterns
	if (doc._roleCount !== undefined) return doc._roleCount;

	if (doc.roles && doc.roles.length > 0) return doc.roles.length;
	if (doc.stages && doc.stages.length > 0) {
		let count = 0;
		for (const stage of doc.stages) {
			count += (stage.roles && stage.roles.length) || 0;
		}
		return count;
	}
	if (doc.groups && doc.groups.length > 0) {
		let count = 0;
		for (const group of doc.groups) {
			count += (group.roles && group.roles.length) || 0;
		}
		if (doc.join) count += 1;
		return count;
	}
	return 0;
}

function extractUsedSkills(doc) {
	const skills = new Set();

	// Handle regex-fallback fields
	if (doc._skills) {
		doc._skills.forEach(s => skills.add(s));
	}

	function collect(obj) {
		if (Array.isArray(obj)) {
			obj.forEach(collect);
		} else if (obj && typeof obj === 'object') {
			if (obj.skills && Array.isArray(obj.skills)) {
				obj.skills.forEach(s => {
					if (typeof s === 'string') skills.add(s);
					else if (s && typeof s === 'object' && s.path) skills.add(s.path);
				});
			}
			Object.values(obj).forEach(collect);
		}
	}

	collect(doc);
	return [...skills].sort();
}

function extractUsedPrompts(doc) {
	const prompts = new Set();

	// Handle regex-fallback fields
	if (doc._prompts) {
		doc._prompts.forEach(p => prompts.add(p));
	}

	function collect(obj) {
		if (Array.isArray(obj)) {
			obj.forEach(collect);
		} else if (obj && typeof obj === 'object') {
			if (obj.agent && typeof obj.agent === 'string') prompts.add(obj.agent);
			if (obj.prompt && typeof obj.prompt === 'string' && obj.prompt.length < 80) prompts.add(obj.prompt);
			Object.values(obj).forEach(collect);
		}
	}

	collect(doc);
	return [...prompts].sort();
}

module.exports = {
	extractSkillMetadata,
	extractPromptMetadata,
	extractFlowMetadata,
};
