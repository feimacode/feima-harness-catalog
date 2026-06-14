#!/usr/bin/env node

/**
 * main-action.js — GitHub Action entry point for harness-publish.
 *
 * Reads inputs via @actions/core, calls the shared publish() orchestrator,
 * and outputs results as step outputs.
 */

const core = require('@actions/core');
const path = require('path');
const fs = require('fs');
const { publish } = require('./lib/publish');

async function run() {
	try {
		const provider = core.getInput('provider', { required: true });
		const gistToken = core.getInput('gist_token') || '';
		const dryRun = core.getBooleanInput('dry_run') || false;
		const force = core.getBooleanInput('force') || false;
		const catalogOnly = core.getBooleanInput('catalog_only') || false;
		const sourcePrefix = core.getInput('source') || '';
		const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();

		// Validate: catalog-only doesn't need gist_token
		if (!catalogOnly && !gistToken) {
			core.setFailed('gist_token is required. Add a GIST_TOKEN secret to your repo, or use catalog_only mode.');
			return;
		}

		core.info(`🔨 Harness Publish — ${provider}`);
		if (catalogOnly) core.info(`   Catalog-only mode (source: ${sourcePrefix || 'auto'})`);
		if (dryRun) core.info('   (dry-run mode)');
		if (force) core.info('   (force mode)');
		core.info(`   Repo root: ${repoRoot}`);

		const result = await publish({
			repoRoot,
			provider,
			gistToken: gistToken || undefined,
			dryRun,
			force,
			catalogOnly,
			sourcePrefix: sourcePrefix || undefined,
			onProgress: (msg) => core.info(msg),
		});

		// Set outputs
		core.setOutput('skills_published', result.counts.skills.new + result.counts.skills.updated);
		core.setOutput('skills_skipped', result.counts.skills.skipped);
		core.setOutput('prompts_published', result.counts.prompts.new + result.counts.prompts.updated);
		core.setOutput('prompts_skipped', result.counts.prompts.skipped);
		core.setOutput('flows_published', result.counts.flows.new + result.counts.flows.updated);
		core.setOutput('flows_skipped', result.counts.flows.skipped);
		core.setOutput('total_changed', (result.counts.skills.new + result.counts.skills.updated
			+ result.counts.prompts.new + result.counts.prompts.updated
			+ result.counts.flows.new + result.counts.flows.updated).toString());
		core.setOutput('total_skipped', (result.counts.skills.skipped
			+ result.counts.prompts.skipped
			+ result.counts.flows.skipped).toString());

		if (result.issueUrl) {
			core.setOutput('issue_url', result.issueUrl);
		}

		// Build summary
		const c = result.counts;
		const summary = [
			'## 📦 Harness Publish Summary',
			'',
			`**Provider**: ${provider}`,
			'',
			'| Type | Total | New | Updated | Skipped |',
			'|------|-------|-----|---------|---------|',
			`| Skills | ${c.skills.total} | ${c.skills.new} | ${c.skills.updated} | ${c.skills.skipped} |`,
			`| Prompts | ${c.prompts.total} | ${c.prompts.new} | ${c.prompts.updated} | ${c.prompts.skipped} |`,
			`| Flows | ${c.flows.total} | ${c.flows.new} | ${c.flows.updated} | ${c.flows.skipped} |`,
		];

		if (!dryRun) {
			summary.push('');
			summary.push('### Published Items');
			summary.push('');
			for (const item of result.published.skills) {
				summary.push(`- **${item.name}** (skill) — \`gist:${item.gistId}\``);
			}
			for (const item of result.published.prompts) {
				summary.push(`- **${item.name}** (prompt) — \`gist:${item.gistId}\``);
			}
			for (const item of result.published.flows) {
				summary.push(`- **${item.name}** (flow, ${item.orchestration}) — \`gist:${item.gistId}\``);
			}
		}

		if (result.issueUrl) {
			summary.push('');
			summary.push(`📬 **Catalog issue**: ${result.issueUrl}`);
		}

		// Write the catalog.json to the repo root so it can be committed
		const catalogPath = path.join(repoRoot, 'catalog.json');
		if (!dryRun) {
			fs.writeFileSync(catalogPath, JSON.stringify(result.catalog, null, '\t') + '\n');
			core.info(`   ✓ Wrote catalog.json to ${catalogPath}`);
		}

		await core.summary.addRaw(summary.join('\n')).write();

		core.info('');
		core.info('✅ Publish complete!');
		core.info(summary.join('\n'));

	} catch (error) {
		core.setFailed(`Harness publish failed: ${error.message}`);
		console.error(error);
	}
}

run();
