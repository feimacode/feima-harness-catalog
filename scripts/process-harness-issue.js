#!/usr/bin/env node

/**
 * process-harness-issue.js — Called by harness-issue-processor.yml.
 *
 * Reads a labeled [harness-publish] issue, extracts and validates the
 * catalog.json payload, writes it to catalogs/{provider}/catalog.json,
 * and commits the change.
 *
 * Inputs (environment variables set by the workflow):
 *   ISSUE_NUMBER  — the issue number to process
 *   PROVIDER      — provider name parsed from the issue title
 *
 * Requires GITHUB_TOKEN with contents:write on the repo (built-in in Actions).
 */

const { Octokit } = require('@octokit/rest');

const OWNER = process.env.GITHUB_REPOSITORY_OWNER || 'feimacode';
const REPO = process.env.GITHUB_REPOSITORY_NAME || 'feima-harness-catalog';
const ISSUE_NUMBER = parseInt(process.env.ISSUE_NUMBER, 10);
const PROVIDER = process.env.PROVIDER;

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Extract catalog.json from an issue body.
 * Tries in order: attachment URL → ```json block → ``` block.
 */
function extractCatalogJson(body) {
	// 1. Try GitHub attachment URL (drag & drop)
	const attachMatch = body.match(
		/https:\/\/github\.com\/user-attachments\/files\/[^\s)]+/
	);
	if (attachMatch) {
		// We can't fetch attachments without a raw URL easily,
		// so fall through to code blocks
	}

	// 2. Try ```json block
	const jsonMatch = body.match(/```json\s*\n([\s\S]*?)\n\s*```/);
	if (jsonMatch) {
		try {
			return JSON.parse(jsonMatch[1]);
		} catch {
			// Fall through
		}
	}

	// 3. Try any ``` block (no language tag)
	const codeMatch = body.match(/```\s*\n([\s\S]*?)\n\s*```/);
	if (codeMatch) {
		try {
			const parsed = JSON.parse(codeMatch[1]);
			if (parsed && parsed.provider) {
				return parsed;
			}
		} catch {
			// Fall through
		}
	}

	return null;
}

/**
 * Validate that the catalog entry has the required structure.
 */
function validateCatalog(catalog) {
	if (!catalog || typeof catalog !== 'object') {
		return 'catalog.json is not a valid JSON object';
	}
	if (!catalog.provider) {
		return 'catalog.json is missing required field: provider';
	}
	if (catalog.provider !== PROVIDER) {
		return `provider "${catalog.provider}" does not match issue title provider "${PROVIDER}"`;
	}
	// Arrays are optional — if present they must be arrays
	for (const field of ['skills', 'prompts', 'flows']) {
		if (catalog[field] !== undefined && !Array.isArray(catalog[field])) {
			return `catalog.json field "${field}" must be an array if present`;
		}
	}
	return null;
}

async function main() {
	console.log(`Processing issue #${ISSUE_NUMBER} for provider "${PROVIDER}"...`);

	// Fetch the issue
	const issue = await octokit.rest.issues.get({
		owner: OWNER,
		repo: REPO,
		issue_number: ISSUE_NUMBER,
	});

	const body = issue.data.body || '';
	const catalog = extractCatalogJson(body);

	if (!catalog) {
		console.error('❌ Could not extract valid catalog.json from issue body.');
		console.error('   Ensure the issue contains a ```json block with valid catalog data.');
		process.exit(1);
	}

	// Validate
	const validationError = validateCatalog(catalog);
	if (validationError) {
		console.error(`❌ Validation failed: ${validationError}`);
		await octokit.rest.issues.createComment({
			owner: OWNER,
			repo: REPO,
			issue_number: ISSUE_NUMBER,
			body: `❌ **Validation failed**: ${validationError}\n\nPlease fix the catalog.json and edit the issue, or open a new one.`,
		});
		process.exit(1);
	}

	console.log('✓ catalog.json is valid');

	// Write the file
	const fs = require('fs');
	const path = require('path');
	const catalogDir = path.join(process.env.GITHUB_WORKSPACE, 'catalogs', PROVIDER);
	fs.mkdirSync(catalogDir, { recursive: true });
	const filePath = path.join(catalogDir, 'catalog.json');
	fs.writeFileSync(filePath, JSON.stringify(catalog, null, '\t') + '\n');

	console.log(`✓ Wrote catalogs/${PROVIDER}/catalog.json`);

	// Add success comment
	await octokit.rest.issues.createComment({
		owner: OWNER,
		repo: REPO,
		issue_number: ISSUE_NUMBER,
		body: [
			'✅ **Catalog entry processed**',
			'',
			`- Provider: **${PROVIDER}**`,
			`- Skills: ${(catalog.skills || []).length}`,
			`- Prompts: ${(catalog.prompts || []).length}`,
			`- Flows: ${(catalog.flows || []).length}`,
			'',
			'The catalog index will be rebuilt automatically.',
		].join('\n'),
	});

	console.log('✓ Done');
}

main().catch(err => {
	console.error('❌', err.message);
	process.exit(1);
});
