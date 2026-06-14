# Feima Harness Catalog

Central catalog service for the feima harness ecosystem. Aggregates catalog entries from harness repositories into a unified index for `@flow /browse` discovery.

## Architecture

This catalog follows **Model A** architecture: each harness repo owns its plugin manifests (`.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`, `skills.sh.json`), but catalog metadata lives here in the catalog service.

```
catalogs/
├── feima-awesome-harness/
│   └── catalog.json      ← Official feima harness content
├── community/
│   └── <author>/
│       └── catalog.json  ← Community contributions
index.json                ← Auto-generated aggregate
```

## Registration Process

To register your harness in this catalog:

### 1. Fork this repo

```bash
git clone https://github.com/YOUR_USERNAME/feima-harness-catalog
cd feima-harness-catalog
```

### 2. Create your catalog entry

```bash
mkdir -p catalogs/community/YOUR_USERNAME
```

Create `catalogs/community/YOUR_USERNAME/catalog.json`:

```json
{
	"provider": "YOUR_USERNAME",
	"updated": "2026-05-30T00:00:00Z",
	"skills": [
		{
			"id": "your-skill-name",
			"name": "Your Skill Name",
			"description": "Brief description of what this skill does",
			"source": "github:YOUR_USERNAME/your-harness-repo",
			"tags": ["tag1", "tag2"],
			"type": "skill"
		}
	],
	"flows": [
		{
			"id": "your-flow-name",
			"name": "Your Flow Name",
			"description": "Brief description of this flow",
			"source": "github:YOUR_USERNAME/your-harness-repo",
			"tags": ["tag1", "tag2"],
			"category": "operations",
			"orchestration": "staged",
			"roles": 3,
			"type": "flow",
			"uses_skills": ["your-skill-name"]
		}
	]
}
```

### 3. Submit PR

```bash
git add catalogs/community/YOUR_USERNAME/catalog.json
git commit -m "Register YOUR_USERNAME harness"
git push
```

Open a pull request to `feima/feima-harness-catalog`.

### 4. CI validates and builds

The `build-index.yml` workflow:
- Validates catalog.json schema
- Merges all catalogs into `index.json`
- Computes `used_in_flows` counts
- Commits updated index

## Catalog Entry Schema

### Skill Entry

```json
{
	"id": "skill-name",
	"name": "Skill Display Name",
	"description": "What this skill does",
	"source": "github:owner/repo" | "gist:id" | "pkg:marketplace/plugin",
	"tags": ["tag1", "tag2"],
	"type": "skill"
}
```

### Prompt/Agent Entry

```json
{
	"id": "agent-name",
	"name": "Agent Display Name",
	"description": "What this agent does",
	"source": "github:owner/repo",
	"tags": ["tag1", "tag2"],
	"type": "prompt"
}
```

### Flow Entry

```json
{
	"id": "flow-name",
	"name": "Flow Display Name",
	"description": "What this flow orchestrates",
	"source": "github:owner/repo",
	"tags": ["tag1", "tag2"],
	"category": "operations",
	"orchestration": "staged" | "sequence" | "fork-join",
	"roles": 5,
	"type": "flow",
	"uses_skills": ["skill1", "skill2"],
	"uses_prompts": ["agent1", "agent2"]
}
```

## Trust Tiers

| Directory | Badge | Who can PR |
|-----------|-------|------------|
| `catalogs/feima-awesome-harness/` | `[official]` | Feima maintainers only |
| `catalogs/community/` | `[community]` | Anyone |

## For Maintainers

### Running build-index locally

```bash
node scripts/build-index.js
```

### Output

```
Scanning catalogs...
Found 2 providers
Found 5 skills
Found 3 prompts
Found 4 flows
Wrote index.json with 12 entries
```

## Related

- [feima-awesome-harness](https://github.com/feimacode/awesome-harness) - Official harness content
- [CATALOG_ECOSYSTEM.md](https://github.com/feimacode/copilot-ai-flow/blob/main/docs/CATALOG_ECOSYSTEM.md) - Architecture documentation