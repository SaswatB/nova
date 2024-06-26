# Web App

This is the main web application frontend for the Nova project.

## Technologies Used

- React
- Vite
- tRPC (for type-safe API communication)
- Panda CSS (for styling)
- Zod (for schema validation)
- Framer Motion (for animations)

## Development

To start the development server:

1. Navigate to the `apps/web` directory
2. Run the following command:

```bash
yarn dev
```

This will start the Vite development server, and you can view the app at `http://localhost:5173` (or the port specified in your configuration).

## Building for Production

To build the web app for production:

1. Navigate to the `apps/web` directory
2. Run the following command:

```bash
yarn build
```

This will generate a production-ready build in the `dist` directory.

## Project Structure

- `src/components`: React components
- `src/lib`: Utility functions and hooks
- `src/lib/nodes`: Logic for agent operations
- `src/lib/hooks`: Custom React hooks

## API Integration

This app uses tRPC for type-safe API communication with the backend. The tRPC client is set up in `src/lib/trpc-client.ts`.

## Styling

This project uses Panda CSS for styling. The Panda CSS configuration can be found in `panda.config.ts`.
