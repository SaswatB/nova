# Bench App

This application is used for benchmarking and testing purposes within the Nova project.

## Purpose

The bench app allows us to run performance tests and benchmarks on various components of the Nova system. It helps us identify bottlenecks, measure improvements, and ensure the overall performance of our applications.

## Key Dependencies

- `@repo/web`: Imports components from the main web application for testing
- `duckdb`: Used for data processing and analysis during benchmarking
- `simple-git`: Allows interaction with Git repositories for version-specific testing

## Running Benchmarks

To run the benchmarks:

1. Ensure you're in the `apps/bench` directory
2. Run the following command:

```bash
yarn start
```

This will execute the benchmark suite defined in `src/index.ts`.

## Development

To work on the bench app:

1. Navigate to the `apps/bench` directory
2. Run the development server:

```bash
yarn dev
```

This will start the application in development mode, allowing you to make changes and see the results in real-time.
