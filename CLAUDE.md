<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

## Active Plan

### Add `/health` endpoint to `server.js`

**Goal:** Return app version (from `package.json`) and uptime in seconds.

**Steps:**

1. **Require `package.json` at the top of `server.js`**
   ```js
   const { version } = require('./package.json');
   ```
   Capture server start time just after:
   ```js
   const startTime = Date.now();
   ```

2. **Add the route before `app.listen`**
   ```js
   app.get('/health', (req, res) => {
     res.json({
       version,
       uptime: Math.floor((Date.now() - startTime) / 1000),
     });
   });
   ```

3. **No new files, no new dependencies** — uses only Node built-ins and the existing `package.json`.

**Response shape:**
```json
{ "version": "1.0.0", "uptime": 42 }
```

**Files touched:** `server.js` only (2 additions + 1 route block).
