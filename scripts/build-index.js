#!/usr/bin/env node

/**
 * build-index.js - Merge catalog.json files into index.json
 * 
 * Scans catalogs/ directory for catalog.json files, merges them,
 * computes used_in_flows counts, and writes index.json.
 */

const fs = require('fs');
const path = require('path');

const CATALOGS_DIR = path.join(__dirname, '..', 'catalogs');
const INDEX_FILE = path.join(__dirname, '..', 'index.json');

function scanCatalogs() {
	const providers = [];
	const skills = [];
	const prompts = [];
	const flows = [];
	
	// Scan catalogs/ directory
	const catalogDirs = fs.readdirSync(CATALOGS_DIR);
	
	for (const dirName of catalogDirs) {
		const catalogPath = path.join(CATALOGS_DIR, dirName, 'catalog.json');
		
		if (!fs.existsSync(catalogPath)) {
			continue;
		}
		
		const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
		const providerName = catalog.provider || dirName;
		const trust = dirName === 'feima-awesome-harness' ? 'official' : 'community';
		
		providers.push({
			name: providerName,
			source: `catalogs/${dirName}/catalog.json`,
			trust
		});
		
		// Add skills with provider field
		if (catalog.skills) {
			for (const skill of catalog.skills) {
				skills.push({
					...skill,
					provider: providerName
				});
			}
		}
		
		// Add prompts with provider field
		if (catalog.prompts) {
			for (const prompt of catalog.prompts) {
				prompts.push({
					...prompt,
					provider: providerName
				});
			}
		}
		
		// Add flows with provider field
		if (catalog.flows) {
			for (const flow of catalog.flows) {
				flows.push({
					...flow,
					provider: providerName
				});
			}
		}
	}
	
	return { providers, skills, prompts, flows };
}

function computeUsedInFlows(skills, prompts, flows) {
	// Initialize counts
	const skillCounts = new Map();
	const promptCounts = new Map();
	
	for (const skill of skills) {
		skillCounts.set(skill.id, 0);
	}
	
	for (const prompt of prompts) {
		promptCounts.set(prompt.id, 0);
	}
	
	// Count references from flows
	for (const flow of flows) {
		if (flow.uses_skills) {
			for (const skillId of flow.uses_skills) {
				if (skillCounts.has(skillId)) {
					skillCounts.set(skillId, skillCounts.get(skillId) + 1);
				}
			}
		}
		
		if (flow.uses_prompts) {
			for (const promptId of flow.uses_prompts) {
				if (promptCounts.has(promptId)) {
					promptCounts.set(promptId, promptCounts.get(promptId) + 1);
				}
			}
		}
	}
	
	// Apply counts to entries
	for (const skill of skills) {
		skill.used_in_flows = skillCounts.get(skill.id) || 0;
	}
	
	for (const prompt of prompts) {
		prompt.used_in_flows = promptCounts.get(prompt.id) || 0;
	}
	
	return { skills, prompts };
}

function buildIndex() {
	console.log('Scanning catalogs...');
	
	const { providers, skills, prompts, flows } = scanCatalogs();
	
	console.log(`Found ${providers.length} providers`);
	console.log(`Found ${skills.length} skills`);
	console.log(`Found ${prompts.length} prompts`);
	console.log(`Found ${flows.length} flows`);
	
	// Compute used_in_flows counts
	computeUsedInFlows(skills, prompts, flows);
	
	const index = {
		version: 1,
		updated: new Date().toISOString(),
		providers,
		skills,
		prompts,
		flows
	};
	
	fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, '\t'));
	console.log(`Wrote index.json with ${skills.length + prompts.length + flows.length} entries`);
}

buildIndex();