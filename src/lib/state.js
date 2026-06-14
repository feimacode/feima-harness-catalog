/**
 * State tracking — read/write .harness-state.json to track Gist IDs across runs.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = '.harness-state.json';

/**
 * Load the harness state from a content repo root.
 *
 * @param {string} repoRoot - absolute path to the content repo
 * @returns {{ skills: Record<string, { gistId: string, contentHash: string, description: string, publishedAt: string }>,
 *             prompts: Record<string, { gistId: string, contentHash: string, description: string, publishedAt: string }>,
 *             flows: Record<string, { gistId: string, contentHash: string, description: string, publishedAt: string }> }}
 */
function loadState(repoRoot) {
	const statePath = path.join(repoRoot, STATE_FILE);
	if (fs.existsSync(statePath)) {
		try {
			return JSON.parse(fs.readFileSync(statePath, 'utf8'));
		} catch {
			return createEmptyState();
		}
	}
	return createEmptyState();
}

/**
 * Save the harness state back to the repo.
 *
 * @param {string} repoRoot - absolute path to the content repo
 * @param {object} state - the state object
 */
function saveState(repoRoot, state) {
	const statePath = path.join(repoRoot, STATE_FILE);
	fs.writeFileSync(statePath, JSON.stringify(state, null, '\t') + '\n');
}

/**
 * Get a stored Gist ID for an item, or null if not yet published.
 *
 * @param {object} state
 * @param {'skill'|'prompt'|'flow'} type
 * @param {string} id
 * @returns {string | null}
 */
function getGistId(state, type, id) {
	const bucket = type === 'skill' ? 'skills' : type === 'prompt' ? 'prompts' : 'flows';
	const entry = state[bucket] && state[bucket][id];
	return entry ? entry.gistId : null;
}

/**
 * Get a stored content hash for an item, or null if not yet published.
 *
 * @param {object} state
 * @param {'skill'|'prompt'|'flow'} type
 * @param {string} id
 * @returns {string | null}
 */
function getContentHash(state, type, id) {
	const bucket = type === 'skill' ? 'skills' : type === 'prompt' ? 'prompts' : 'flows';
	const entry = state[bucket] && state[bucket][id];
	return entry ? entry.contentHash : null;
}

/**
 * Record a published Gist ID and content hash for an item.
 *
 * @param {object} state
 * @param {'skill'|'prompt'|'flow'} type
 * @param {string} id
 * @param {string} gistId
 * @param {string} description
 * @param {string} contentHash
 */
function setGistId(state, type, id, gistId, description, contentHash) {
	const bucket = type === 'skill' ? 'skills' : type === 'prompt' ? 'prompts' : 'flows';
	if (!state[bucket]) state[bucket] = {};
	state[bucket][id] = {
		gistId,
		contentHash,
		description,
		publishedAt: new Date().toISOString(),
	};
}

function createEmptyState() {
	return { skills: {}, prompts: {}, flows: {} };
}

module.exports = { loadState, saveState, getGistId, getContentHash, setGistId };
