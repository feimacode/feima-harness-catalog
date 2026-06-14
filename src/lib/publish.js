/**
 * Publish orchestrator — scans a content repo, publishes items as Gists,
 * and opens a catalog PR.
 */

const fs = require('fs');
const path = require('path');

const { createGistClient } = require('./gist-client');
const { extractSkillMetadata, extractPromptMetadata, extractFlowMetadata } = require('./metadata');
const { loadState, saveState, getGistId, getContentHash, setGistId } = require('./state');
const { createCatalogClient } = require('./catalog-client');
const { hashFile, hashFiles } = require('./hash');

/**
 * Scan a content repo and publish all harness items as fine-grained Gists,
 * then submit a catalog issue. In catalog-only mode, skips Gist publishing
 * and uses a repo-level source prefix for all entries.
 *
 * @param {{
 *   repoRoot: string,
 *   provider: string,
 *   gistToken?: string,
 *   githubToken?: string,
 *   dryRun?: boolean,
 *   force?: boolean,
 *   catalogOnly?: boolean,
 *   noSubmit?: boolean,
 *   sourcePrefix?: string,
 *   onProgress?: (msg: string) => void,
 * }} options
 * @returns {Promise<{
 *   published: { skills: any[], prompts: any[], flows: any[] },
 *   catalog: object,
 *   issueUrl: string | null,
 *   counts: { skills: { total: number, new: number, updated: number, skipped: number },
 *             prompts: { total: number, new: number, updated: number, skipped: number },
 *             flows: { total: number, new: number, updated: number, skipped: number } }
 * }>}
 */
async function publish(options) {
	const { repoRoot, provider, gistToken, githubToken, dryRun = false, force = false,
		catalogOnly = false, noSubmit = false, sourcePrefix, onProgress } = options;

	const log = onProgress || (() => {});

	const gistClient = catalogOnly ? null : createGistClient(gistToken || '');
	const catalogClient = (githubToken && githubToken !== '') ? createCatalogClient(githubToken) : null;

	// Build the source prefix for catalog-only mode
	const sourceBase = sourcePrefix || `github:${provider}`;


	// Load existing state
	const state = loadState(repoRoot);

	const published = {
		skills: [],
		prompts: [],
		flows: [],
	};

	const counts = {
		skills: { total: 0, new: 0, updated: 0, skipped: 0 },
		prompts: { total: 0, new: 0, updated: 0, skipped: 0 },
		flows: { total: 0, new: 0, updated: 0, skipped: 0 },
	};

	// ── Publish skills ──
	const skillsDir = path.join(repoRoot, 'skills');
	if (fs.existsSync(skillsDir)) {
		const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
			.filter(d => d.isDirectory())
			.map(d => d.name);

		for (const skillId of skillDirs) {
			const skillDirPath = path.join(skillsDir, skillId);
			const skillMdPath = path.join(skillDirPath, 'SKILL.md');

			if (!fs.existsSync(skillMdPath)) {
				log(`  ⚠  Skipping ${skillId}: no SKILL.md found`);
				continue;
			}

			counts.skills.total++;

			const meta = extractSkillMetadata(skillMdPath, skillId);

			// Catalog-only mode: skip all Gist operations, use source prefix
			if (catalogOnly) {
				const sourceUrl = `${sourceBase}/skills/${skillId}`;
				log(`  📋 ${skillId} (catalog-only)`);
				published.skills.push({ ...meta, gistId: null, sourceUrl, isNew: false });
				counts.skills.updated++;
				continue;
			}

			const currentHash = hashFile(skillMdPath);
			const existingGistId = getGistId(state, 'skill', skillId);
			const storedHash = getContentHash(state, 'skill', skillId);

			// Skip if unchanged (unless --force)
			if (!force && existingGistId && storedHash === currentHash) {
				log(`  ⏭  ${skillId} (unchanged)`);
				counts.skills.skipped++;
				published.skills.push({ ...meta, gistId: existingGistId });
				continue;
			}

			const content = fs.readFileSync(skillMdPath, 'utf8');
			const gistDesc = `${meta.name} — ${meta.description.slice(0, 80)}`;

			const label = existingGistId ? (storedHash ? '(changed)' : '(update)') : '(new)';
			log(`  📦 ${skillId} ${label}`);

			if (!dryRun) {
				const result = await gistClient.publishItem(
					existingGistId,
					{ [`${skillId}.skill.md`]: { content } },
					gistDesc,
				);
				setGistId(state, 'skill', skillId, result.gistId, gistDesc, currentHash);
				published.skills.push({ ...meta, gistId: result.gistId });
				if (result.isNew) counts.skills.new++; else counts.skills.updated++;
			} else {
				const fakeId = existingGistId || `gist-fake-${skillId}`;
				published.skills.push({ ...meta, gistId: fakeId });
				if (existingGistId) counts.skills.updated++; else counts.skills.new++;
			}
		}
	}

	// ── Publish prompts ──
	const promptsDir = path.join(repoRoot, 'prompts');
	if (fs.existsSync(promptsDir)) {
		const promptFiles = fs.readdirSync(promptsDir)
			.filter(f => f.endsWith('.prompt.md'));

		for (const filename of promptFiles) {
			const promptId = filename.replace(/\.prompt\.md$/, '');
			const filePath = path.join(promptsDir, filename);
			const meta = extractPromptMetadata(filePath, promptId);

			counts.prompts.total++;

			// Catalog-only: skip Gist, use source prefix
			if (catalogOnly) {
				const sourceUrl = `${sourceBase}/prompts/${promptId}`;
				log(`  📋 ${promptId} (prompt, catalog-only)`);
				published.prompts.push({ ...meta, gistId: null, sourceUrl, isNew: false });
				counts.prompts.updated++;
				continue;
			}

			const currentHash = hashFile(filePath);
			const existingGistId = getGistId(state, 'prompt', promptId);
			const storedHash = getContentHash(state, 'prompt', promptId);

			if (!force && existingGistId && storedHash === currentHash) {
				log(`  ⏭  ${promptId} (prompt, unchanged)`);
				counts.prompts.skipped++;
				published.prompts.push({ ...meta, gistId: existingGistId });
				continue;
			}

			const content = fs.readFileSync(filePath, 'utf8');
			const gistDesc = `${meta.name} — ${meta.description.slice(0, 80)}`;

			const label = existingGistId ? (storedHash ? '(changed)' : '(update)') : '(new)';
			log(`  📦 ${promptId} (prompt) ${label}`);

			if (!dryRun) {
				const result = await gistClient.publishItem(
					existingGistId,
					{ [`${promptId}.prompt.md`]: { content } },
					gistDesc,
				);
				setGistId(state, 'prompt', promptId, result.gistId, gistDesc, currentHash);
				published.prompts.push({ ...meta, gistId: result.gistId });
				if (result.isNew) counts.prompts.new++; else counts.prompts.updated++;
			} else {
				const fakeId = existingGistId || `gist-fake-${promptId}`;
				published.prompts.push({ ...meta, gistId: fakeId });
				if (existingGistId) counts.prompts.updated++; else counts.prompts.new++;
			}
		}
	}

	// ── Publish agents ──
	const agentsDir = path.join(repoRoot, 'agents');
	if (fs.existsSync(agentsDir)) {
		const agentFiles = fs.readdirSync(agentsDir)
			.filter(f => f.endsWith('.agent.md'));

		for (const filename of agentFiles) {
			const agentId = filename.replace(/\.agent\.md$/, '');
			const filePath = path.join(agentsDir, filename);
			const meta = extractPromptMetadata(filePath, agentId);

			counts.prompts.total++;

			// Catalog-only: skip Gist, use source prefix
			if (catalogOnly) {
				const sourceUrl = `${sourceBase}/agents/${agentId}`;
				log(`  📋 ${agentId} (agent, catalog-only)`);
				published.prompts.push({ ...meta, gistId: null, sourceUrl, isNew: false });
				counts.prompts.updated++;
				continue;
			}

			const currentHash = hashFile(filePath);
			const existingGistId = getGistId(state, 'prompt', agentId);
			const storedHash = getContentHash(state, 'prompt', agentId);

			if (!force && existingGistId && storedHash === currentHash) {
				log(`  ⏭  ${agentId} (agent, unchanged)`);
				counts.prompts.skipped++;
				published.prompts.push({ ...meta, gistId: existingGistId });
				continue;
			}

			const content = fs.readFileSync(filePath, 'utf8');
			const gistDesc = `${meta.name} — ${meta.description.slice(0, 80)}`;

			const label = existingGistId ? (storedHash ? '(changed)' : '(update)') : '(new)';
			log(`  📦 ${agentId} (agent) ${label}`);

			if (!dryRun) {
				const result = await gistClient.publishItem(
					existingGistId,
					{ [`${agentId}.agent.md`]: { content } },
					gistDesc,
				);
				setGistId(state, 'prompt', agentId, result.gistId, gistDesc, currentHash);
				published.prompts.push({ ...meta, gistId: result.gistId });
				if (result.isNew) counts.prompts.new++; else counts.prompts.updated++;
			} else {
				const fakeId = existingGistId || `gist-fake-${agentId}`;
				published.prompts.push({ ...meta, gistId: fakeId });
				if (existingGistId) counts.prompts.updated++; else counts.prompts.new++;
			}
		}
	}

	// ── Publish flows ──
	const flowsDir = path.join(repoRoot, 'flows');
	if (fs.existsSync(flowsDir)) {
		const flowFiles = fs.readdirSync(flowsDir)
			.filter(f => f.endsWith('.flow.yaml'));

		for (const filename of flowFiles) {
			const flowId = filename.replace(/\.flow\.yaml$/, '');
			const filePath = path.join(flowsDir, filename);
			const meta = extractFlowMetadata(filePath, flowId);

			counts.flows.total++;

			// Catalog-only: skip Gist, use source prefix (no companion bundling needed)
			if (catalogOnly) {
				const sourceUrl = `${sourceBase}/flows/${flowId}`;
				log(`  📋 ${flowId} (flow, catalog-only)`);
				published.flows.push({ ...meta, gistId: null, sourceUrl, isNew: false });
				counts.flows.updated++;
				continue;
			}

			const existingGistId = getGistId(state, 'flow', flowId);
			const storedHash = getContentHash(state, 'flow', flowId);
			// Build the complete file list for hashing
			const gistFiles = {};
			const companionPaths = [];
			gistFiles[`${flowId}.flow.yaml`] = { content: fs.readFileSync(filePath, 'utf8') };
			companionPaths.push(filePath);

			for (const agentName of meta.usesPrompts) {
				const agentPath = path.join(repoRoot, 'agents', `${agentName}.agent.md`);
				const prPath = path.join(repoRoot, 'prompts', `${agentName}.prompt.md`);
				if (fs.existsSync(agentPath)) {
					gistFiles[`${agentName}.agent.md`] = { content: fs.readFileSync(agentPath, 'utf8') };
					companionPaths.push(agentPath);
				} else if (fs.existsSync(prPath)) {
					gistFiles[`${agentName}.prompt.md`] = { content: fs.readFileSync(prPath, 'utf8') };
					companionPaths.push(prPath);
				}
			}
			for (const skillName of meta.usesSkills) {
				const skillPath = path.join(repoRoot, 'skills', skillName, 'SKILL.md');
				if (fs.existsSync(skillPath)) {
					gistFiles[`${skillName}.skill.md`] = { content: fs.readFileSync(skillPath, 'utf8') };
					companionPaths.push(skillPath);
				}
			}

			const currentHash = hashFiles(companionPaths);

			if (!force && existingGistId && storedHash === currentHash) {
				log(`  ⏭  ${flowId} (flow, unchanged)`);
				counts.flows.skipped++;
				published.flows.push({ ...meta, gistId: existingGistId });
				continue;
			}

			const gistDesc = `${meta.name} — ${meta.description.slice(0, 80)}`;

			const label = existingGistId ? (storedHash ? '(changed)' : '(update)') : '(new)';
			log(`  📦 ${flowId} (flow) ${label}`);

			// Log bundled files (on changed/new only)
			for (const agentName of meta.usesPrompts) {
				const agentPath = path.join(repoRoot, 'agents', `${agentName}.agent.md`);
				const promptPath = path.join(repoRoot, 'prompts', `${agentName}.prompt.md`);
				if (fs.existsSync(agentPath)) {
					log(`    ↳ bundled agent: ${agentName}`);
				} else if (fs.existsSync(promptPath)) {
					log(`    ↳ bundled prompt: ${agentName}`);
				} else {
					log(`    ⚠  referenced agent/prompt "${agentName}" not found in repo`);
				}
			}
			for (const skillName of meta.usesSkills) {
				const skillPath = path.join(repoRoot, 'skills', skillName, 'SKILL.md');
				if (fs.existsSync(skillPath)) {
					log(`    ↳ bundled skill: ${skillName}`);
				} else {
					log(`    ⚠  referenced skill "${skillName}" not found in repo`);
				}
			}

			if (!dryRun) {
				const result = await gistClient.publishItem(
					existingGistId,
					gistFiles,
					gistDesc,
				);
				setGistId(state, 'flow', flowId, result.gistId, gistDesc, currentHash);
				published.flows.push({ ...meta, gistId: result.gistId });
				if (result.isNew) counts.flows.new++; else counts.flows.updated++;
			} else {
				const fakeId = existingGistId || `gist-fake-${flowId}`;
				published.flows.push({ ...meta, gistId: fakeId });
				if (existingGistId) counts.flows.updated++; else counts.flows.new++;
			}
		}
	}

	// Save updated state
	if (!dryRun) {
		saveState(repoRoot, state);
		log('');
		const changed = counts.skills.new + counts.skills.updated
			+ counts.prompts.new + counts.prompts.updated
			+ counts.flows.new + counts.flows.updated;
		const skipped = counts.skills.skipped + counts.prompts.skipped + counts.flows.skipped;
		log(`  ✓ State updated: ${changed} changed, ${skipped} skipped`);
	}

	// ── Build catalog entry ──
	const catalog = catalogClient
		? catalogClient.buildCatalogEntry(provider, published)
		: buildCatalogStandalone(provider, published);

	// ── Submit catalog issue ──
	let issueUrl = null;
	if (noSubmit) {
		log('  📬 [no-submit] Catalog built locally, skipping issue submission');
	} else if (catalogClient && !dryRun) {
		log(`  📬 Submitting catalog issue for ${provider}...`);
		const issueResult = await catalogClient.submitCatalogIssue(provider, catalog, counts);
		issueUrl = issueResult.issueUrl;
		log(`  ✓ Issue submitted: ${issueUrl}`);
	} else if (catalogClient && dryRun) {
		log('  📬 [dry-run] Would submit catalog issue');
	} else {
		log('  ⚠  No github_token provided — skipping catalog issue submission');
	}

	return {
		published,
		catalog: catalog || {},
		issueUrl,
		counts,
	};
}

/**
 * Build a catalog.json entry without any remote client — pure data transform.
 * Used when no github_token is available for the catalog PR.
 */
function buildCatalogStandalone(provider, published) {
	const catalog = {
		provider,
		updated: new Date().toISOString(),
		skills: [],
		prompts: [],
		flows: [],
	};

	for (const item of published.skills) {
		catalog.skills.push({
			id: item.id,
			name: item.name,
			description: item.description,
			source: item.sourceUrl || (item.gistId ? `gist:${item.gistId}` : ''),
			tags: item.tags,
			type: 'skill',
		});
	}

	for (const item of published.prompts) {
		catalog.prompts.push({
			id: item.id,
			name: item.name,
			description: item.description,
			source: item.sourceUrl || (item.gistId ? `gist:${item.gistId}` : ''),
			tags: item.tags,
			type: 'prompt',
		});
	}

	for (const item of published.flows) {
		catalog.flows.push({
			id: item.id,
			name: item.name,
			description: item.description,
			source: item.sourceUrl || (item.gistId ? `gist:${item.gistId}` : ''),
			tags: item.tags,
			orchestration: item.orchestration,
			roles: item.roles,
			type: 'flow',
			uses_skills: item.usesSkills,
			uses_prompts: item.usesPrompts,
		});
	}

	return catalog;
}

module.exports = { publish };
