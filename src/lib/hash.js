/**
 * Content hashing — compute a stable hash of file(s) to detect changes
 * without relying on timestamps or Gist API calls.
 */

const crypto = require('crypto');
const fs = require('fs');

/**
 * Hash a single file's content with SHA-256.
 *
 * @param {string} filePath - absolute path to the file
 * @returns {string} hex digest
 */
function hashFile(filePath) {
	const content = fs.readFileSync(filePath, 'utf8');
	return hashString(content);
}

/**
 * Hash the combined content of multiple files.
 * Order-independent — files are sorted by path before hashing.
 *
 * @param {string[]} filePaths - absolute paths
 * @returns {string} hex digest
 */
function hashFiles(filePaths) {
	const sorted = [...filePaths].sort();
	const hash = crypto.createHash('sha256');
	for (const fp of sorted) {
		hash.update(fp);
		hash.update('\0');
		hash.update(fs.readFileSync(fp, 'utf8'));
		hash.update('\0');
	}
	return hash.digest('hex');
}

/**
 * Hash an arbitrary string.
 *
 * @param {string} content
 * @returns {string} hex digest
 */
function hashString(content) {
	return crypto.createHash('sha256').update(content).digest('hex');
}

module.exports = { hashFile, hashFiles, hashString };
