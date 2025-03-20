# StreamWeave Core

A declarative framework for building complex, composable task graphs with type-safe nodes and effects.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

StreamWeave Core provides a robust foundation for building complex task execution systems using a graph-based approach. It enables you to define type-safe nodes with clear inputs and outputs, manage effects, and handle dependencies between tasks in a declarative way with an API inspired by tRPC.

StreamWeave is especially useful for building modular AI workflows made up of testable, composable nodes.

## Features

- 🔒 **Type-safe Node System**: Build nodes with strongly typed inputs, outputs, and effects using TypeScript and Zod schemas
- 🌳 **Scoped Execution**: Flexible scope management for controlling node execution context
- 🔄 **Dependency Management**: Built-in system for handling node dependencies and references
- 🎯 **Effect System**: Type-safe effect system for handling side effects and external operations
- 🏗️ **Builder Pattern**: Intuitive builder pattern for constructing nodes and runners
- 📦 **Modular Design**: Easy to compose and extend with custom nodes and effects

## Installation

```bash
npm install streamweave-core
# or
yarn add streamweave-core
```

## Quick Start

Here's how to set up a StreamWeave system with effects, nodes, and a runner:

> take a look at `apps/example` for a full example:

### 1. Define Effects

First, create a base effect builder with optional context:

```typescript
// src/effects/swEffect.ts
import OpenAI from "openai";
import { swEffectInit } from "streamweave-core";

interface EffectContext {
  openai: OpenAI;
}

export const swEffect = swEffectInit.context<EffectContext>();
```

Then define specific effects:

```typescript
// src/effects/openaiEffect.ts
import { swEffect } from "./swEffect";

export const openaiEffect = swEffect
  .runnableAnd(async ({ prompt }: { prompt: string }, { effectContext: { openai } }) => {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    return completion.choices[0].message.content || "";
  })
  .callAlias((prompt: string) => ({ prompt }));

// src/effects/writeFileEffect.ts
import { writeFile } from "fs/promises";
import { swEffect } from "./swEffect";

export const writeFileEffect = swEffect
  .runnableAnd(async ({ path, content }: { path: string; content: string }) => {
    await writeFile(path, content);
    return true;
  })
  .callAlias((path: string, content: string) => ({ path, content }));
```

### 2. Create Nodes

Define your node builder with available effects:

```typescript
// src/nodes/swNode.ts
import { swNodeInit } from "streamweave-core";

import { openaiEffect } from "../effects/openaiEffect";
import { writeFileEffect } from "../effects/writeFileEffect";

export const swNode = swNodeInit.effects({
  openai: openaiEffect,
  writeFile: writeFileEffect,
});
```

Create specific nodes, with zod schemas for inputs and outputs:

```typescript
// src/nodes/GenerateOutlineNode.ts
export const GenerateOutlineNode = swNode
  .input(z.object({ topic: z.string() }))
  .output(z.object({ outline: z.string() }))
  .runnable(async ({ topic }, { effects }) => {
    const outline = await effects.openai(`Create a brief 3-point outline for a story about: ${topic}`);
    return { outline };
  });

// src/nodes/ExpandStoryNode.ts
export const ExpandStoryNode = swNode
  .input(z.object({ outline: z.string() }))
  .output(z.object({ story: z.string() }))
  .runnable(async ({ outline }, { effects }) => {
    const story = await effects.openai(`Expand this outline into a short story:\n${outline}`);
    return { story };
  });

// src/nodes/StoryGeneratorNode.ts
export const StoryGeneratorNode = swNode
  .input(z.object({ topic: z.string(), outputPath: z.string() }))
  .output(z.object({ success: z.boolean(), story: z.string() }))
  .runnable(async (input, context) => {
    // Generate outline
    const { outline } = await context.runNode(GenerateOutlineNode, { topic: input.topic });

    // Expand into full story
    const { story } = await context.runNode(ExpandStoryNode, { outline });

    const output = ["## Outline", outline, "", "## Story", story].join("\n");

    // Save to file
    const success = await context.effects.writeFile(input.outputPath, output);

    return { success, story };
  });
```

Configure your runner with all nodes:

```typescript
// swRunner.ts
import { swRunnerInit } from "streamweave-core";
import { GenerateOutlineNode } from "./nodes/GenerateOutlineNode";
import { ExpandStoryNode } from "./nodes/ExpandStoryNode";
import { StoryGeneratorNode } from "./nodes/StoryGeneratorNode";

export const swRunner = swRunnerInit.nodes({
  generateOutline: GenerateOutlineNode,
  expandStory: ExpandStoryNode,
  storyGenerator: StoryGeneratorNode,
});

export type GraphRunner = ExtractGraphRunner<typeof swRunner>;
```

### 4. Use the System

```typescript
// src/index.ts
import { StoryGeneratorNode } from "./nodes/StoryGeneratorNode";
import { swRunner } from "./swRunner";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const runner = swRunner.effectContext({ openai }).create();

// Generate and save a story
runner.addNode(StoryGeneratorNode, {
  topic: "A time-traveling coffee cup",
  outputPath: "story.md",
});
await runner.run();
```

## Core Concepts

### Effects

Effects in StreamWeave represent side effects or external operations. They:

- Have typed inputs and outputs
- Can be cached
- Support dependency injection via context
- Can be composed and reused across nodes

```typescript
const MyEffect = swEffect
  .runnableAnd(async (input: string, context) => {
    // Access injected context
    const result = await context.effectContext.someService.process(input);
    return result;
  })
  .callAliasAnd((input: string) => input)
  .cacheable();

const MyGenericEffect = swEffect
  .runnableAnd(async (input: object, context) => {
    // Access injected context
    const result = await context.effectContext.someService.process(input);
    return result;
  })
  .wrapAnd(
    (runEffect) =>
      async <T>(input: object, schema: z.ZodSchema<T>) =>
        schema.parse(await runEffect(input)),
  )
  .cacheable();
```

### Nodes

Nodes are the core building blocks that:

- Define clear input/output contracts with Zod schemas
- Are deduplicated by value
- Can depend on other nodes
- Can be scoped for isolation
- Have access to registered effects

```typescript
const MyNode = swNode
  .scope(() => createSwTaskScope("my-scope"))
  .input(z.object({ data: z.string() }))
  .output(z.object({ result: z.string() }))
  .runnable(async (input, context) => {
    // Use effects
    const processed = await context.effects.myEffect(input.data);

    // Add dependencies
    const depResult = await context.runNode(OtherNode, { someInput: processed });

    return { result: depResult.output };
  });
```

### Scopes

Scopes provide isolation and context management:

- Group related nodes together
- Control node execution context
- Enable hierarchical task organization
- Support parallel execution of independent tasks

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
