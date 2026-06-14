/**
 * Gist client — CRUD operations on GitHub Gists via @octokit/rest.
 */

const { Octokit } = require('@octokit/rest');

/**
 * @param {string} token GitHub personal access token with `gist` scope
 * @returns {{ createGist, updateGist, publishItem }}
 */
function createGistClient(token) {
	const octokit = new Octokit({ auth: token });

	/**
	 * Create a new Gist.
	 *
	 * @param {{ [filename: string]: { content: string } }} files - filename → content
	 * @param {string} description - gist description
	 * @param {boolean} [isPublic=true] - whether the gist is public
	 * @returns {Promise<{ gistId: string, htmlUrl: string }>}
	 */
	async function createGist(files, description, isPublic = true) {
		const response = await octokit.rest.gists.create({
			description,
			public: isPublic,
			files,
		});

		return {
			gistId: response.data.id,
			htmlUrl: response.data.html_url,
		};
	}

	/**
	 * Update an existing Gist.
	 *
	 * @param {string} gistId - the Gist ID to update
	 * @param {{ [filename: string]: { content: string } | null }} files - filename → content, or null to delete
	 * @param {string} [description] - new description (if provided)
	 * @returns {Promise<{ gistId: string, htmlUrl: string }>}
	 */
	async function updateGist(gistId, files, description) {
		const params = { gist_id: gistId, files };
		if (description !== undefined) {
			params.description = description;
		}

		const response = await octokit.rest.gists.update(params);

		return {
			gistId: response.data.id,
			htmlUrl: response.data.html_url,
		};
	}

	/**
	 * Publish an item — creates a new Gist or updates an existing one.
	 *
	 * @param {string | null} existingGistId - null if first publish, gist ID if updating
	 * @param {{ [filename: string]: { content: string } }} files
	 * @param {string} description
	 * @returns {Promise<{ gistId: string, htmlUrl: string, isNew: boolean }>}
	 */
	async function publishItem(existingGistId, files, description) {
		if (existingGistId) {
			const result = await updateGist(existingGistId, files, description);
			return { ...result, isNew: false };
		} else {
			const result = await createGist(files, description);
			return { ...result, isNew: true };
		}
	}

	return { createGist, updateGist, publishItem };
}

module.exports = { createGistClient };
