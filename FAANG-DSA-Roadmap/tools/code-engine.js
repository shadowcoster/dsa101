#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const HELP = `
Code Running Engine

Usage:
  node tools/code-engine.js <path-to-js-file>
  node tools/code-engine.js --analyze-only <path-to-js-file>

Examples:
  node tools/code-engine.js 00-start-here/optimal/twosum.js
  node tools/code-engine.js --analyze-only 00-start-here/optimal/containsduplicate.js
`;

const args = process.argv.slice(2);
const analyzeOnly = args.includes("--analyze-only");
const targetArg = args.find((arg) => !arg.startsWith("--"));

if (!targetArg || args.includes("--help") || args.includes("-h")) {
  console.log(HELP.trim());
  process.exit(targetArg ? 0 : 1);
}

const targetPath = path.resolve(process.cwd(), targetArg);

if (!fs.existsSync(targetPath)) {
  fail(`File not found: ${targetPath}`);
}

if (path.extname(targetPath) !== ".js") {
  fail("This engine currently supports JavaScript solution files only.");
}

const source = fs.readFileSync(targetPath, "utf8");
const analysis = analyzeComplexity(source);
const runResult = analyzeOnly ? null : runJavaScript(source, targetPath);

printReport(targetPath, analysis, runResult);

function runJavaScript(sourceCode, filename) {
  const logs = [];
  const errors = [];
  const sandbox = {
    console: {
      log: (...values) => logs.push(values.map(formatValue).join(" ")),
      error: (...values) => errors.push(values.map(formatValue).join(" ")),
      warn: (...values) => errors.push(values.map(formatValue).join(" ")),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    WeakMap,
    WeakSet,
    RegExp,
  };

  const beforeHeap = process.memoryUsage().heapUsed;
  const startedAt = performance.now();

  try {
    vm.runInNewContext(sourceCode, sandbox, {
      filename,
      timeout: 5000,
      displayErrors: true,
    });

    const endedAt = performance.now();
    const afterHeap = process.memoryUsage().heapUsed;

    return {
      ok: true,
      timeMs: endedAt - startedAt,
      heapDeltaBytes: afterHeap - beforeHeap,
      logs,
      errors,
    };
  } catch (error) {
    const endedAt = performance.now();
    const afterHeap = process.memoryUsage().heapUsed;

    return {
      ok: false,
      timeMs: endedAt - startedAt,
      heapDeltaBytes: afterHeap - beforeHeap,
      logs,
      errors,
      error,
    };
  }
}

function analyzeComplexity(sourceCode) {
  const cleaned = stripCommentsAndStrings(sourceCode);
  const loopMatches = findLoopMatches(cleaned);
  const maxLoopDepth = getMaxLoopDepth(cleaned, loopMatches);
  const recursiveFunctions = findRecursiveFunctions(cleaned);
  const hasSort = /\.sort\s*\(/.test(cleaned);
  const hasBinarySearch = /while\s*\([^)]*(left|lo|low|start)[^)]*(right|hi|high|end)[^)]*\)/.test(cleaned)
    && /(mid|middle)\s*=/.test(cleaned)
    && /Math\.floor|>>\s*1|\/\s*2/.test(cleaned);
  const usesHashStorage = /\b(new\s+)?(Map|Set)\s*\(|\{\s*\}|\[\s*\]/.test(cleaned);
  const growsHashStorageInLoop = loopMatches.some((loop) => {
    const body = readBlock(cleaned, loop.bodyStart);
    return /\.(set|add|push)\s*\(|\[[^\]]+\]\s*=/.test(body);
  });
  const hasMatrixAllocation = /Array\.from\s*\([^)]*Array|\.fill\s*\([^)]*\)\s*\.map\s*\(/.test(cleaned);

  let time = "O(1)";
  const reasons = [];

  if (recursiveFunctions.some((fn) => fn.selfCalls > 1)) {
    time = "O(2^n) or exponential";
    reasons.push("multiple self-recursive calls were found");
  } else if (hasSort && maxLoopDepth > 0) {
    time = `O(n^${maxLoopDepth} log n)`;
    reasons.push("sorting is used inside/alongside loops");
  } else if (hasSort) {
    time = "O(n log n)";
    reasons.push("Array.sort usually dominates runtime");
  } else if (hasBinarySearch) {
    time = "O(log n)";
    reasons.push("binary-search style left/right/mid pattern found");
  } else if (maxLoopDepth > 1) {
    time = `O(n^${maxLoopDepth})`;
    reasons.push(`${maxLoopDepth} nested loop levels found`);
  } else if (maxLoopDepth === 1) {
    time = "O(n)";
    reasons.push(`${loopMatches.length} non-nested loop${loopMatches.length === 1 ? "" : "s"} over input-like data found`);
  } else if (recursiveFunctions.length > 0) {
    time = "O(n)";
    reasons.push("single self-recursive path found");
  }

  let space = "O(1)";
  if (hasMatrixAllocation) {
    space = "O(n*m)";
  } else if (growsHashStorageInLoop || recursiveFunctions.length > 0) {
    space = "O(n)";
  } else if (usesHashStorage) {
    space = "O(1) to O(n)";
  }

  return {
    time,
    space,
    confidence: reasons.length === 0 ? "low" : "medium",
    reasons: reasons.length > 0 ? reasons : ["no obvious loop, sort, or recursion pattern found"],
    loopCount: loopMatches.length,
    maxLoopDepth,
    recursiveFunctions: recursiveFunctions.map((fn) => fn.name),
  };
}

function findLoopMatches(code) {
  const pattern = /\b(for|while)\s*\(|\.(forEach|map|filter|reduce|some|every|find)\s*\(/g;
  const matches = [];
  let match;

  while ((match = pattern.exec(code)) !== null) {
    const bodyStart = code.indexOf("{", match.index);
    if (bodyStart !== -1) {
      matches.push({ index: match.index, bodyStart });
    }
  }

  return matches;
}

function getMaxLoopDepth(code, loops) {
  let maxDepth = 0;

  for (const loop of loops) {
    let depth = 1;

    for (const other of loops) {
      if (other.index !== loop.index && other.index > loop.bodyStart && other.index < findBlockEnd(code, loop.bodyStart)) {
        depth = Math.max(depth, 2);
        depth = Math.max(depth, 1 + getNestedDepth(code, other, loops));
      }
    }

    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

function getNestedDepth(code, loop, loops) {
  const end = findBlockEnd(code, loop.bodyStart);
  let depth = 1;

  for (const other of loops) {
    if (other.index > loop.bodyStart && other.index < end) {
      depth = Math.max(depth, 1 + getNestedDepth(code, other, loops));
    }
  }

  return depth;
}

function findRecursiveFunctions(code) {
  const functions = [];
  const declarationPattern = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  const arrowPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g;

  collectFunctions(code, declarationPattern, functions);
  collectFunctions(code, arrowPattern, functions);

  return functions
    .map((fn) => ({
      name: fn.name,
      selfCalls: countMatches(fn.body, new RegExp(`\\b${escapeRegExp(fn.name)}\\s*\\(`, "g")),
    }))
    .filter((fn) => fn.selfCalls > 0);
}

function collectFunctions(code, pattern, output) {
  let match;

  while ((match = pattern.exec(code)) !== null) {
    const bodyStart = code.indexOf("{", match.index);
    output.push({
      name: match[1],
      body: readBlock(code, bodyStart),
    });
  }
}

function stripCommentsAndStrings(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, "\"\"")
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function readBlock(code, openingBraceIndex) {
  const end = findBlockEnd(code, openingBraceIndex);
  return end === -1 ? code.slice(openingBraceIndex) : code.slice(openingBraceIndex, end + 1);
}

function findBlockEnd(code, openingBraceIndex) {
  let depth = 0;

  for (let i = openingBraceIndex; i < code.length; i++) {
    if (code[i] === "{") depth++;
    if (code[i] === "}") depth--;
    if (depth === 0) return i;
  }

  return -1;
}

function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatValue(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function printReport(filename, analysis, runResult) {
  const file = path.relative(process.cwd(), filename);
  console.log(`\nCode Engine Report`);
  console.log(renderTable(["Item", "Value"], [["File", file]]));

  if (runResult) {
    const warnings = runResult.errors.length > 0 ? runResult.errors.join("\n") : "-";
    const error = runResult.error ? runResult.error.stack || runResult.error.message : "-";

    console.log(`\nRun Stats`);
    console.log(renderTable(["Metric", "Value"], [
      ["Status", runResult.ok ? "passed" : "failed"],
      ["Runtime", `${runResult.timeMs.toFixed(3)} ms`],
      ["Heap change", formatBytes(runResult.heapDeltaBytes)],
      ["Warnings", warnings],
      ["Error", error],
    ]));

    console.log(`\nProgram Output`);
    console.log(renderTable(["#", "Result"], formatOutputRows(runResult.logs)));
  } else {
    console.log(`\nProgram Output`);
    console.log(renderTable(["#", "Result"], [["1", "Analyze-only mode: program was not run"]]));
  }

  const complexityRows = [
    ["Time complexity", analysis.time],
    ["Space complexity", analysis.space],
    ["Confidence", analysis.confidence],
    ["Why", analysis.reasons.join("; ")],
    ["Loops found", String(analysis.loopCount)],
    ["Max loop depth", String(analysis.maxLoopDepth)],
  ];

  if (analysis.recursiveFunctions.length > 0) {
    complexityRows.push(["Recursive functions", analysis.recursiveFunctions.join(", ")]);
  }

  console.log(`\nComplexity Estimate`);
  console.log(renderTable(["Metric", "Value"], complexityRows));
  console.log(`\nNote: Big-O is a static estimate. Confirm it with your own reasoning before interviews.\n`);
}

function renderTable(headers, rows) {
  const allRows = [headers, ...rows];
  const widths = headers.map((_, columnIndex) => {
    return Math.max(...allRows.map((row) => {
      return String(row[columnIndex])
        .split("\n")
        .reduce((longest, line) => Math.max(longest, line.length), 0);
    }));
  });
  const divider = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const output = [divider, renderTableRow(headers, widths), divider];

  rows.forEach((row) => {
    const lineGroups = row.map((cell) => String(cell).split("\n"));
    const rowHeight = Math.max(...lineGroups.map((lines) => lines.length));

    for (let lineIndex = 0; lineIndex < rowHeight; lineIndex++) {
      output.push(renderTableRow(lineGroups.map((lines) => lines[lineIndex] || ""), widths));
    }

    output.push(divider);
  });

  return output.join("\n");
}

function renderTableRow(row, widths) {
  return `| ${row.map((cell, index) => String(cell).padEnd(widths[index])).join(" | ")} |`;
}

function formatOutputRows(logs) {
  if (logs.length === 0) {
    return [["1", "No console.log output"]];
  }

  return logs.map((line, index) => [String(index + 1), line]);
}

function formatBytes(bytes) {
  const sign = bytes < 0 ? "-" : "";
  const abs = Math.abs(bytes);

  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(2)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
