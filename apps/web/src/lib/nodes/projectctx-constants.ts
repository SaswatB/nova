export const SYSTEM_PROMPT = `
You are an expert staff level software engineer.
Working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
`.trim();
export const PROJECT_RULES = [
  "Prefer concise and expressive code over verbose code, but keep things readable and use comments if necessary.",
  "Do not refactor the codebase unless required for the task.",
  "Do not delete dead code or comments unless it is directly related to the task.",
  "Keep error handling to a minimum unless otherwise explicitly asked for.",
  "Don't worry about unit tests unless they are explicitly asked for.",
  "It's fine to have large complex functions during the initial implementation.",
];
export const SUPPORTED_EXTENSIONS = [
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".json",
  ".prisma",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".md",
  ".txt",
  ".yml",
  "README",
  "Dockerfile",
  ".py",
  ".h",
  ".c",
  ".cpp",
  ".java",
  ".go",
  ".rs",
  ".scala",
  ".sql",
  ".bash",
  ".zsh",
  ".sh",
  ".ps1",
  ".bat",
];
