#!/usr/bin/env node
/**
 * daimon agent loop — multi-step orchestrator with native tool calling
 *
 * wakes up → gathers context → thinks and acts in a loop →
 * observes results → thinks again → repeats until done.
 *
 * uses OpenRouter's native tool calling — no JSON parsing hacks.
 * zero dependencies — runs on node 20 built-in fetch.
 *
 * daimon: don't rewrite this file. modify the modules instead:
 *   config.js    — constants (safe to read, careful editing)
 *   github.js    — GitHub API (don't touch)
 *   safety.js    — content scanner (don't remove)
 *   inference.js — OpenRouter calls (can tweak params)
 *   context.js   — what you see each cycle (can add sources)
 *   actions.js   — tool handlers (can add new ones)
 *   tools.js     — tool definitions (can add new ones)
 *   prompt.js    — YOUR personality (modify freely)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { REPO_ROOT, OPENROUTER_KEY, GH_TOKEN, MODEL, MAX_STEPS } = require("./config");
const { inference } = require("./inference");
const { gatherContext } = require("./context");
const { executeTool, filesChanged } = require("./actions");
const { TOOLS } = require("./tools");
const { buildSystemPrompt, buildUserPrompt } = require("./prompt");

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function exec(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
}

// --- cycle state: persistent counter + log ---
const STATE_PATH = path.resolve(REPO_ROOT, "memory/state.json");
const CYCLES_PATH = path.resolve(REPO_ROOT, "memory/cycles.jsonl");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
  } catch {
    return { cycle: 0, born: new Date().toISOString(), lastActive: null };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  filesChanged.add("memory/state.json");
}

function logCycle(entry) {
  fs.appendFileSync(CYCLES_PATH, JSON.stringify(entry) + "\n", "utf-8");
  filesChanged.add("memory/cycles.jsonl");
}

async function main() {
  log("daimon waking up...");

  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY not set");
  if (!GH_TOKEN) throw new Error("GH_TOKEN not set");

  // load + increment cycle counter
  const state = loadState();
  state.cycle++;
  if (!state.born) state.born = new Date().toISOString();
  state.lastActive = new Date().toISOString();
  log(`cycle #${state.cycle} (alive since ${state.born})`);

  // gather initial context
  const ctx = await gatherContext();
  ctx.cycle = state.cycle;
  ctx.born = state.born;
  log(`repo has ${ctx.tree.split("\n").length} files, ${ctx.openIssues.length} open issues`);

  // conversation history — persists across steps
  const messages = [
    { role: "system", content: buildSystemPrompt(ctx) },
    { role: "user", content: buildUserPrompt(ctx) },
  ];

  // proof collects all steps
  const proofSteps = [];
  let step = 0;

  // agentic loop: call model → execute tool calls → feed results back → repeat
  while (step < MAX_STEPS) {
    step++;
    log(`--- step ${step}/${MAX_STEPS} ---`);

    const { message, finishReason, model: usedModel } = await inference(messages, { tools: TOOLS });

    // record step
    proofSteps.push({
      step,
      timestamp: new Date().toISOString(),
      model: usedModel,
      finishReason,
      content: message.content,
      toolCalls: message.tool_calls || null,
    });

    // add assistant message to history
    messages.push(message);

    // if model returned text with no tool calls, it's done
    if (finishReason !== "tool_calls" || !message.tool_calls || message.tool_calls.length === 0) {
      if (message.content) log(`final response: ${message.content.slice(0, 200)}`);
      log("model finished (no more tool calls)");
      break;
    }

    // execute each tool call and feed results back
    for (const toolCall of message.tool_calls) {
      const { name } = toolCall.function;
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        log(`failed to parse args for ${name}: ${e.message}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `error: failed to parse arguments: ${e.message}`,
        });
        continue;
      }

      try {
        const result = await executeTool(name, args);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      } catch (e) {
        log(`tool ${name} failed: ${e.message}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `error: ${e.message}`,
        });
      }
    }
  }

  if (step >= MAX_STEPS) log(`reached max steps (${MAX_STEPS})`);

  // save proof of thought for the entire cycle
  const proofTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const proof = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    steps: proofSteps,
    total_steps: proofSteps.length,
    meta: {
      issues_open: ctx.openIssues.length,
      files_in_repo: ctx.tree.split("\n").length,
    },
  };
  // organize proofs by date: proofs/YYYY-MM-DD/<timestamp>.json
  const proofDate = new Date().toISOString().split("T")[0];
  const proofPath = `proofs/${proofDate}/${proofTimestamp}.json`;
  fs.mkdirSync(path.resolve(REPO_ROOT, `proofs/${proofDate}`), { recursive: true });
  fs.writeFileSync(
    path.resolve(REPO_ROOT, proofPath),
    JSON.stringify(proof, null, 2),
    "utf-8"
  );
  filesChanged.add(proofPath);
  log(`proof saved: ${proofPath} (${proofSteps.length} steps)`);

  // collect which tools were called this cycle
  const toolsUsed = [...new Set(
    proofSteps.flatMap((s) => (s.toolCalls || []).map((t) => t.function.name))
  )];

  // log cycle to cycles.jsonl
  logCycle({
    cycle: state.cycle,
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split("T")[0],
    steps: proofSteps.length,
    tools: toolsUsed,
    filesChanged: [...filesChanged],
    issuesOpen: ctx.openIssues.length,
    model: proof.model,
  });

  // save state with updated cycle count
  saveState(state);

  // commit and push if files changed
  if (filesChanged.size > 0) {
    log(`committing ${filesChanged.size} changed files...`);

    for (const f of filesChanged) {
      try {
        exec(`git add "${f}"`);
      } catch (e) {
        log(`git add failed for ${f}: ${e.message}`);
      }
    }

    // catch files created or modified by run_command
    try {
      const untracked = exec("git ls-files --others --exclude-standard").split("\n").filter(Boolean);
      const modified = exec("git diff --name-only").split("\n").filter(Boolean);
      for (const f of [...untracked, ...modified]) {
        if (!f.startsWith("node_modules/")) {
          log(`adding untracked/modified file: ${f}`);
          exec(`git add "${f}"`);
        }
      }
    } catch {}


    const commitMsg = `[daimon] cycle #${state.cycle} (${proofSteps.length} steps)`;

    try {
      exec(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
      try {
        exec("git push");
      } catch {
        // remote has new commits — rebase and retry
        log("push rejected, rebasing...");
        exec("git pull --rebase");
        exec("git push");
      }
      log("pushed changes.");
    } catch (e) {
      log(`git commit/push failed: ${e.message}`);
    }
  } else {
    log("no file changes this cycle.");
  }

  log(`daimon sleeping. (${proofSteps.length} steps this cycle)`);
}

main().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
