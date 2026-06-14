#!/usr/bin/env node

/**
 * main-cli.js — CLI entry point for harness-publish.
 *
 * Usage:
 *   npx @feima/harness-publish --provider feima-awesome-harness --gist-token ghp_xxx [--github-token ghp_xxx] [--dry-run]
 *   npx @feima/harness-publish  # interactive mode
 */

const path = require('path');
const readline = require('readline');
const { publish } = require('./lib/publish');

function parseArgs(argv) {
	const args = {
		provider: null,
		gistToken: null,
		githubToken: null,
		dryRun: false,
		force: false,
		catalogOnly: false,
		noSubmit: false,
		sourcePrefix: null,
		repoRoot: process.cwd(),
	};

	for (let i = 2; i < argv.length; i++) {
		switch (argv[i]) {
			case '--provider':
				args.provider = argv[++i];
				break;
			case '--gist-token':
				args.gistToken = argv[++i];
				break;
			case '--github-token':
				args.githubToken = argv[++i];
				break;
			case '--source':
				args.sourcePrefix = argv[++i];
				break;
			case '--repo-root':
				args.repoRoot = argv[++i];
				break;
			case '--dry-run':
				args.dryRun = true;
				break;
			case '--force':
				args.force = true;
				break;
			case '--catalog-only':
				args.catalogOnly = true;
				break;
			case '--no-submit':
				args.noSubmit = true;
				break;
			case '--help':
				printHelp();
				process.exit(0);
		}
	}

	// Fall back to env vars
	if (!args.gistToken) args.gistToken = process.env.GIST_TOKEN;
	if (!args.githubToken) args.githubToken = process.env.GITHUB_TOKEN;

	return args;
}

function printHelp() {
	console.log(`harness-publish — Publish harness items as fine-grained GitHub Gists

Usage:
  npx @feima/harness-publish [options]

Options:
  --provider <name>     Publisher name (e.g., feima-awesome-harness)
  --gist-token <token>  GitHub token with gist scope (or set GIST_TOKEN env var)
  --github-token <tok>  GitHub token for catalog issue submission (or set GITHUB_TOKEN env var)
  --source <url>        Source prefix for catalog-only mode (e.g., github:owner/repo)
  --repo-root <path>    Path to content repo (default: cwd)
  --dry-run             Show what would be published without making changes
  --force               Publish all items even if unchanged (bypass content hash)
  --catalog-only        Skip Gist publishing — only build catalog.json and submit issue
  --no-submit           Build catalog.json locally but skip submitting the catalog issue
  --help                Show this help

Examples:
  # Full Gist publish + catalog issue
  harness-publish --provider my-harness --gist-token ghp_xxx --github-token ghp_xxx

  # Catalog-only: scan repo, use github: source prefix, submit issue
  harness-publish --provider my-harness --catalog-only --source github:owner/my-repo

  # Generate catalog.json locally without submitting
  harness-publish --provider my-harness --gist-token ghp_xxx --no-submit

Interactive mode is used if --provider is not provided.`);
}

async function prompt(rl, question) {
	return new Promise(resolve => {
		rl.question(question, answer => resolve(answer.trim()));
	});
}

async function interactiveMode(args) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	console.log('🔨 Harness Publish — Interactive Mode\n');

	if (!args.provider) {
		args.provider = await prompt(rl, 'Publisher name (e.g., feima-awesome-harness): ');
	}

	// Ask about mode first
	const mode = await prompt(rl, 'Mode? (gist = fine-grained Gists, catalog-only = repo-level source) [gist]: ');
	if (mode === 'catalog-only') {
		args.catalogOnly = true;
		const defaultSource = `github:${args.provider}`;
		const src = await prompt(rl, `Source prefix [${defaultSource}]: `);
		args.sourcePrefix = src || defaultSource;
	}

	if (!args.catalogOnly) {
		if (!args.gistToken) {
			console.log('A GitHub token with "gist" scope is required.');
			console.log('Create one at: https://github.com/settings/tokens');
			args.gistToken = await prompt(rl, 'Gist token: ');
		}
	} else {
		args.gistToken = 'catalog-only';  // dummy — gist client won't be created
	}

	if (!args.githubToken) {
		const useDefault = await prompt(rl, 'Submit catalog issue? (y/n, default: y): ');
		if (useDefault !== 'n') {
			console.log('A GitHub token with "issues:write" scope on feimacode/feima-harness-catalog is needed.');
			args.githubToken = await prompt(rl, 'GitHub token (or press Enter to skip): ');
			if (!args.githubToken) {
				console.log('  (Skipping catalog issue submission — no token provided)\n');
			}
		}
	}

	rl.close();

	if (!args.provider || !args.gistToken) {
		console.error('❌ Provider and gist_token are required.');
		process.exit(1);
	}
}

async function main() {
	const args = parseArgs(process.argv);

	if (process.argv.includes('--help')) {
		printHelp();
		return;
	}

	// Interactive mode if missing required args — but catalog-only doesn't need gistToken
	if (!args.provider || (!args.catalogOnly && !args.gistToken)) {
		await interactiveMode(args);
	}

	// Validate: need provider in all cases; gistToken only for Gist mode
	if (!args.provider) {
		console.error('❌ Provider is required. Use --help for usage.');
		process.exit(1);
	}
	if (!args.catalogOnly && !args.gistToken) {
		console.error('❌ Gist token is required for Gist mode. Use --catalog-only for catalog-only mode.');
		process.exit(1);
	}

	console.log(`🔨 Harness Publish — ${args.provider}`);
	console.log(`   Repo root: ${args.repoRoot}`);
	if (args.catalogOnly) console.log(`   Catalog-only mode (source: ${args.sourcePrefix || 'auto'})`);
	if (args.dryRun) console.log('   (dry-run mode)');
	if (args.force) console.log('   (force mode — bypassing content hash checks)');
	console.log('');

	const result = await publish({
		repoRoot: args.repoRoot,
		provider: args.provider,
		gistToken: args.gistToken || undefined,
		githubToken: args.githubToken || undefined,
		dryRun: args.dryRun,
		force: args.force,
		catalogOnly: args.catalogOnly,
		noSubmit: args.noSubmit,
		sourcePrefix: args.sourcePrefix || undefined,
		onProgress: (msg) => console.log(msg),
	});

	// Write catalog.json to repo root
	if (!args.dryRun) {
		const fs = require('fs');
		const catalogPath = path.join(args.repoRoot, 'catalog.json');
		fs.writeFileSync(catalogPath, JSON.stringify(result.catalog, null, '\t') + '\n');
	}

	console.log('');
	console.log('═══════════════════════════════════════');
	console.log('  📊 Publish Summary');
	console.log('═══════════════════════════════════════');
	const c = result.counts;
	console.log(`  Skills:  ${c.skills.new} new, ${c.skills.updated} updated, ${c.skills.skipped} skipped  (${c.skills.total} total)`);
	console.log(`  Prompts: ${c.prompts.new} new, ${c.prompts.updated} updated, ${c.prompts.skipped} skipped  (${c.prompts.total} total)`);
	console.log(`  Flows:   ${c.flows.new} new, ${c.flows.updated} updated, ${c.flows.skipped} skipped  (${c.flows.total} total)`);
	const changed = c.skills.new + c.skills.updated + c.prompts.new + c.prompts.updated + c.flows.new + c.flows.updated;
	const skipped = c.skills.skipped + c.prompts.skipped + c.flows.skipped;
	console.log('───────────────────────────────────────');
	console.log(`  Changed: ${changed}  ·  Skipped: ${skipped}`);

	if (result.issueUrl) {
		console.log('───────────────────────────────────────');
		console.log(`  📬 Catalog issue: ${result.issueUrl}`);
	}

	if (args.dryRun) {
		console.log('');
		console.log('  [dry-run: no changes were made]');
	}

	console.log('═══════════════════════════════════════');
}

main().catch(err => {
	console.error('❌', err.message);
	process.exit(1);
});
