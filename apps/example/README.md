# StreamWeave Example: AI Code Reviewer

This example demonstrates how to use StreamWeave Core to build an AI-powered code review system. It uses OpenAI's GPT-4 to analyze git diffs and provide constructive feedback.

## Features

- Fetches git diff between branches
- Analyzes code changes using GPT-4
- Provides structured feedback including:
  - Summary of changes
  - Potential issues
  - Improvement suggestions
  - Best practices observed

## Setup

1. Install dependencies:

```bash
yarn install
```

2. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-api-key
```

## Usage

Review changes in a branch:

```bash
yarn start <branch-name>
```

For example:

```bash
yarn start feature/new-feature
```

## How It Works

This example demonstrates several key StreamWeave concepts:

### 1. Effects

- `gitEffect`: Handles Git operations
- `openaiEffect`: Manages OpenAI API interactions

### 2. Nodes

- `ReviewNode`: Orchestrates the review process by:
  1. Getting git diff using `gitEffect`
  2. Generating review using `openaiEffect`

### 3. Runner

The system is tied together using a StreamWeave runner that manages the execution flow.

## Project Structure

```
src/
├── effects/
│   ├── gitEffect.ts    # Git command execution
│   └── openaiEffect.ts # OpenAI API integration
├── nodes/
│   ├── swNode.ts       # Node configuration
│   ├── reviewNode.ts   # Code review logic
│   └── swRunner.ts     # Runner setup
└── index.ts            # Main entry point
```

## Next Steps

1. Add more sophisticated git operations
2. Implement file-type specific review rules
3. Add support for multiple review styles
4. Integrate with CI/CD pipelines
