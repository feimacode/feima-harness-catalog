/**
 * Catalog client — generate catalog.json entries and submit them as issues
 * to the catalog repo for review and processing.
 */

const { Octokit } = require('@octokit/rest');

const CATALOG_REPO = { owner: 'feimacode', repo: 'feima-harness-catalog' };
const CATALOG_LABEL = 'harness-publish';

/**
 * @param {string} githubToken - token with issues:write scope on the catalog repo
 * @returns {{ buildCatalogEntry, submitCatalogIssue }}
 */
function createCatalogClient(githubToken) {
	const octokit = new Octokit({ auth: githubToken });

	/**
	 * Build a complete catalog.json entry from published items.
	 *
	 * @param {string} provider - the publisher name (e.g. "feima-awesome-harness")
	 * @param {{
	 *   skills: Array<{ id: string, name: string, description: string, tags: string[], gistId: string }>,
	 *   prompts: Array<{ id: string, name: string, description: string, tags: string[], gistId: string }>,
	 *   flows: Array<{ id: string, name: string, description: string, orchestration: string,
	 *                   roles: number, tags: string[], gistId: string,
	 *                   usesSkills: string[], usesPrompts: string[] }>
	 * }} published - all published items with their Gist IDs
	 * @returns {object} the complete catalog.json content
	 */
	function buildCatalogEntry(provider, published) {
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

	/**
	 * Submit a catalog entry as a labeled issue to the catalog repo.
	 * Closes older [harness-publish] issues for the same provider.
	 *
	 * @param {string} provider - the publisher name
	 * @param {object} catalog - the catalog.json content
	 * @param {object} counts - publish counts for the human-readable summary
	 * @returns {Promise<{ issueUrl: string }>}
	 */
	async function submitCatalogIssue(provider, catalog, counts) {
		const titlePattern = `[harness-publish] ${provider}`;

		// 1. Close older open issues for this provider
		try {
			const existing = await octokit.rest.issues.listForRepo({
				owner: CATALOG_REPO.owner,
				repo: CATALOG_REPO.repo,
				state: 'open',
				labels: CATALOG_LABEL,
				per_page: 100,
			});

			for (const issue of existing.data) {
				if (issue.title === titlePattern ||
					issue.title.startsWith(`[harness-publish] ${provider} `)) {
					await octokit.rest.issues.createComment({
						owner: CATALOG_REPO.owner,
						repo: CATALOG_REPO.repo,
						issue_number: issue.number,
						body: '🔄 Superseded by a newer catalog submission.',
					});
					await octokit.rest.issues.update({
						owner: CATALOG_REPO.owner,
						repo: CATALOG_REPO.repo,
						issue_number: issue.number,
						state: 'closed',
					});
				}
			}
		} catch (e) {
			// Non-fatal — the new issue will still be opened
		}

		// 2. Build a human-readable issue body with embedded catalog.json
		const issueBody = buildIssueBody(provider, catalog, counts);

		// 3. Open the new issue
		const newIssue = await octokit.rest.issues.create({
			owner: CATALOG_REPO.owner,
			repo: CATALOG_REPO.repo,
			title: titlePattern,
			body: issueBody,
			labels: [CATALOG_LABEL],
		});

		return { issueUrl: newIssue.data.html_url };
	}

	return { buildCatalogEntry, submitCatalogIssue };
}

/**
 * Build a human-readable issue body with an embedded catalog.json block.
 */
function buildIssueBody(provider, catalog, counts) {
	const updated = catalog.updated || new Date().toISOString();
	const skillCount = catalog.skills.length;
	const promptCount = catalog.prompts.length;
	const flowCount = catalog.flows.length;

	const lines = [
		`### ${provider}`,
		'',
		`**Updated**: ${updated}`,
		'',
	];

	// Optional: summary table if counts provided
	if (counts) {
		lines.push(
			'| Type | Total | New | Updated | Skipped |',
			'|------|-------|-----|---------|---------|',
			`| Skills | ${counts.skills.total} | ${counts.skills.new} | ${counts.skills.updated} | ${counts.skills.skipped} |`,
			`| Prompts | ${counts.prompts.total} | ${counts.prompts.new} | ${counts.prompts.updated} | ${counts.prompts.skipped} |`,
			`| Flows | ${counts.flows.total} | ${counts.flows.new} | ${counts.flows.updated} | ${counts.flows.skipped} |`,
			'',
		);
	}

	lines.push(
		`**Skills**: ${skillCount}  ·  **Prompts**: ${promptCount}  ·  **Flows**: ${flowCount}`,
		'',
		'<details><summary>📄 catalog.json</summary>',
		'',
		'```json',
		JSON.stringify(catalog, null, '\t'),
		'```',
		'',
		'</details>',
		'',
		'---',
		'*Submitted by [harness-publish](https://github.com/feimacode/feima-harness-catalog) action.*',
	);

	return lines.join('\n');
}

module.exports = { createCatalogClient };
