const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { compileSpatialFeedbackBatch } = require('../shared/schema');

const execFileAsync = promisify(execFile);

const ALIGNMENT_FILES = [
  'AGENTS.md',
  'GEMINI.md',
  'CLAUDE.md',
  'PLAN.md',
  'README.md',
  'package.json'
];

function resolveAgyBinary() {
  if (process.env.AIFL_AGY_BIN) {
    return process.env.AIFL_AGY_BIN;
  }
  const exeName = process.platform === 'win32' ? 'agy.exe' : 'agy';
  const defaultBin = path.join(os.homedir(), '.gemini', 'bin', exeName);
  try {
    if (fs.existsSync(defaultBin)) {
      return defaultBin;
    }
  } catch {
    // Fallback to PATH lookup
  }
  return 'agy';
}

const PROVIDERS = {
  agy: {
    id: 'agy',
    label: 'Antigravity CLI (agy)',
    command: resolveAgyBinary,
    usesStdin: false,
    args: ({ workspaceRoot, prompt }) =>
      process.env.AIFL_AGY_ARGS
        ? [...process.env.AIFL_AGY_ARGS.split(/\s+/).filter(Boolean), `--print=${prompt}`]
        : [
          '--mode',
          'auto',
          '--dangerously-skip-permissions',
          '--output-format',
          'text',
          '--add-dir',
          workspaceRoot,
          `--print=${prompt}`
        ]
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    command: () => process.env.AIFL_GEMINI_BIN || 'gemini',
    args: () =>
      process.env.AIFL_GEMINI_ARGS
        ? process.env.AIFL_GEMINI_ARGS.split(/\s+/).filter(Boolean)
        : ['--approval-mode', 'auto_edit']
  },
  codex: {
    id: 'codex',
    label: 'Codex CLI (OpenAI)',
    command: () => process.env.AIFL_CODEX_BIN || 'codex',
    args: () =>
      process.env.AIFL_CODEX_ARGS
        ? process.env.AIFL_CODEX_ARGS.split(/\s+/).filter(Boolean)
        : ['exec', '--full-auto', '-']
  },
  claude: {
    id: 'claude',
    label: 'Claude Code CLI (Anthropic)',
    command: () => process.env.AIFL_CLAUDE_BIN || 'claude',
    args: () =>
      process.env.AIFL_CLAUDE_ARGS
        ? process.env.AIFL_CLAUDE_ARGS.split(/\s+/).filter(Boolean)
        : ['-p', '--permission-mode', 'acceptEdits']
  }
};

function normalizeProvider(provider) {
  const raw = String(provider || 'agy').trim().toLowerCase();
  if (raw === 'agy' || raw === 'antigravity') return 'agy';
  if (raw === 'openai' || raw === 'codex') return 'codex';
  if (raw === 'anthropic' || raw === 'claude') return 'claude';
  if (raw === 'gemini' || raw === 'google') return 'gemini';
  return PROVIDERS[raw] ? raw : 'agy';
}

async function getGitBranch(workspaceRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workspaceRoot,
      timeout: 2000
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function discoverAlignmentFiles(workspaceRoot) {
  const found = [];
  for (const name of ALIGNMENT_FILES) {
    const full = path.join(workspaceRoot, name);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        found.push(name);
      }
    } catch {
      // Ignore inaccessible files
    }
  }
  return found;
}

function tailText(str, maxChars = 600) {
  const cleaned = String(str || '').trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;
  return `…${cleaned.slice(-maxChars).trim()}`;
}

function buildAgentPrompt({ pins, workspaceRoot, branch, alignmentFiles }) {
  const compiledFeedback = compileSpatialFeedbackBatch(pins, { mode: 'standard' });
  const docsList = alignmentFiles.length > 0 ? alignmentFiles.join(', ') : '(none detected)';

  return [
    '# AI Feedback Loop — Headless Execution Request',
    '',
    'You are executing approved UI & code feedback directly inside the target project workspace.',
    '',
    `- **Workspace Root**: \`${workspaceRoot}\``,
    branch ? `- **Git Branch**: \`${branch}\`` : null,
    `- **Project Context / Alignment Files**: ${docsList}`,
    '',
    '## Instructions',
    '1. Read any relevant project alignment docs (`AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `PLAN.md`, `README.md`, `package.json`) in the workspace root first if needed to match project conventions.',
    '2. Implement every approved pin below by editing the appropriate source files in this workspace.',
    '3. Keep edits minimal, accurate, and scoped to the requested feedback.',
    '4. When finished, output a concise summary of the files modified and changes made.',
    '',
    compiledFeedback
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function createAgentRunner({
  store,
  workspaceRoot = process.cwd(),
  defaultProvider = 'agy',
  onEvent = null,
  spawnImpl = spawn
}) {
  const resolvedWorkspace = path.resolve(workspaceRoot || process.cwd());
  let activeProvider = normalizeProvider(defaultProvider);
  let activeRun = null;

  function getStatus() {
    return {
      running: Boolean(activeRun),
      activeProvider,
      workspaceRoot: resolvedWorkspace,
      availableProviders: Object.values(PROVIDERS).map((p) => ({
        id: p.id,
        label: p.label
      })),
      activeRun: activeRun
        ? {
          runId: activeRun.runId,
          provider: activeRun.provider,
          pinIds: activeRun.pinIds,
          startedAt: activeRun.startedAt
        }
        : null
    };
  }

  function emit(payload) {
    if (typeof onEvent === 'function') {
      try {
        onEvent(payload);
      } catch {
        // Ignore broadcast errors
      }
    }
  }

  async function run({ pinIds = null, provider = null } = {}) {
    if (activeRun) {
      const err = new Error(
        `Agent run already in progress (${activeRun.provider} on ${activeRun.pinIds.length} pin(s))`
      );
      err.statusCode = 409;
      throw err;
    }

    const chosenProvider = normalizeProvider(provider || activeProvider);
    const providerSpec = PROVIDERS[chosenProvider];
    activeProvider = chosenProvider;

    const allPins = store.getAllPins();
    const targetPins = Array.isArray(pinIds) && pinIds.length > 0
      ? allPins.filter((p) => pinIds.includes(p.id))
      : allPins.filter((p) => p.status === 'approved');

    if (targetPins.length === 0) {
      const err = new Error('No matching approved pins found to execute');
      err.statusCode = 400;
      throw err;
    }

    const targetIds = targetPins.map((p) => p.id);
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Transition pins to in_progress immediately so connected browsers show live state
    const { pins: inProgressPins } = store.batchUpdateStatus(targetIds, 'in_progress', {
      actorRole: 'mcp'
    });
    emit({
      type: 'pins_updated',
      action: 'batch_status',
      pinIds: targetIds,
      status: 'in_progress',
      actorRole: 'mcp',
      pins: inProgressPins
    });
    emit({
      type: 'agent_run_started',
      runId,
      provider: chosenProvider,
      label: providerSpec.label,
      workspaceRoot: resolvedWorkspace,
      pinIds: targetIds
    });

    const branch = await getGitBranch(resolvedWorkspace);
    const alignmentFiles = discoverAlignmentFiles(resolvedWorkspace);
    const prompt = buildAgentPrompt({
      pins: targetPins,
      workspaceRoot: resolvedWorkspace,
      branch,
      alignmentFiles
    });

    const command = providerSpec.command();
    const args = providerSpec.args({ workspaceRoot: resolvedWorkspace, prompt });

    activeRun = {
      runId,
      provider: chosenProvider,
      pinIds: targetIds,
      startedAt: Date.now(),
      child: null
    };

    const runPromise = new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (ok, code, errorMsg = null) => {
        if (settled) return;
        settled = true;
        activeRun = null;

        console.error(
          `[agentRunner] ${chosenProvider} finished ok=${ok} code=${code} stdout=${stdout.length}B stderr=${stderr.length}B`
        );

        const hasOutput = Boolean(stdout.trim() || stderr.trim());
          const noOutputDenied =
            !stdout.trim() && /no output produced|auto-denied/i.test(stderr);
          if (ok && (!hasOutput || noOutputDenied) && chosenProvider === 'agy') {
            ok = false;
            errorMsg = noOutputDenied
              ? tailText(stderr, 360)
              : 'Antigravity CLI (agy) exited 0 with no output. Check `agy` auth/logs in terminal.';
          }

          if (ok) {
            const summaryTail = tailText(stdout || stderr, 420);
            const summary = summaryTail
              ? `Resolved via ${providerSpec.label}:\n${summaryTail}`
              : `Resolved via ${providerSpec.label}.`;
            const { pins: resolvedPins } = store.batchUpdateStatus(targetIds, 'resolved', {
              summary,
              actorRole: 'mcp'
            });
            emit({
              type: 'pins_updated',
              action: 'batch_status',
              pinIds: targetIds,
              status: 'resolved',
              actorRole: 'mcp',
              pins: resolvedPins
            });
            const result = {
              ok: true,
              runId,
              provider: chosenProvider,
              label: providerSpec.label,
              pinIds: targetIds,
              exitCode: code ?? 0,
              summary
            };
            emit({ type: 'agent_run_finished', ...result });
            resolve(result);
            return;
          }

          // Revert in_progress pins back to approved on failure so they can be retried
          const { pins: revertedPins } = store.batchUpdateStatus(targetIds, 'approved', {
            actorRole: 'mcp'
          });
          const detail = errorMsg || tailText(stderr || stdout, 360) || `Exited with code ${code}`;
          const errReply = `${providerSpec.label} failed: ${detail}`;
          for (const id of targetIds) {
            try {
              store.addReply(
                id,
                {
                  authorName: 'AI Coding Agent',
                  role: 'agent',
                  text: errReply
                },
                'mcp'
              );
            } catch {
              // Ignore reply error if pin deleted
            }
          }
          const latestPins = store.getAllPins();
          emit({
            type: 'pins_updated',
            action: 'batch_status',
            pinIds: targetIds,
            status: 'approved',
            actorRole: 'mcp',
            pins: latestPins.length ? latestPins : revertedPins
          });
          const result = {
            ok: false,
            runId,
            provider: chosenProvider,
            label: providerSpec.label,
            pinIds: targetIds,
            exitCode: code,
            error: detail
          };
          emit({ type: 'agent_run_finished', ...result });
          resolve(result);
        };

        let child;
        try {
          const useShell =
            process.platform === 'win32' && !/\.exe$/i.test(command);
          child = spawnImpl(command, args, {
            cwd: resolvedWorkspace,
            shell: useShell,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env
          });
          activeRun.child = child;
        } catch (err) {
          finish(false, -1, err.message);
          return;
        }

        if (child.stdout) {
          child.stdout.on('data', (chunk) => {
            stdout = (stdout + chunk.toString('utf8')).slice(-16000);
          });
        }
        if (child.stderr) {
          child.stderr.on('data', (chunk) => {
            stderr = (stderr + chunk.toString('utf8')).slice(-16000);
          });
        }

        child.on('error', (err) => {
          const msg =
            err.code === 'ENOENT'
              ? `Command "${command}" not found on PATH. Install ${providerSpec.label} or switch provider.`
              : err.message;
          finish(false, -1, msg);
        });

        child.on('close', (code) => {
          if (code === 0) {
            finish(true, 0);
          } else {
            finish(false, code, tailText(stderr || stdout, 360) || `Exited with code ${code}`);
          }
        });

        try {
          if (child.stdin) {
            if (providerSpec.usesStdin !== false) {
              child.stdin.write(prompt);
            }
            child.stdin.end();
          }
        } catch {
          // Ignore broken pipe if child exited immediately
        }
      });

    return {
      accepted: true,
      runId,
      provider: chosenProvider,
      label: providerSpec.label,
      workspaceRoot: resolvedWorkspace,
      pinIds: targetIds,
      completion: runPromise
    };
  }

  return {
    getStatus,
    run,
    normalizeProvider
  };
}

module.exports = {
  PROVIDERS,
  normalizeProvider,
  buildAgentPrompt,
  createAgentRunner
};

