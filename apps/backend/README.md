# Backend App

This is the backend API server for the Nova project.

## Technologies Used

- Express.js
- Prisma (for database ORM)
- tRPC (for type-safe API)
- Socket.io (for real-time communication)
- Various AI SDKs (OpenAI, Google AI, Anthropic, etc.)

## Setup

1. Install dependencies:

```bash
yarn install
```

2. Set up environment variables:

   - Copy `.env.example` to `.env`
   - Fill in the required values

3. Generate Prisma client:

```bash
yarn prisma generate
```

## Development

To start the development server:

1. Ensure you have Doppler CLI installed and configured
2. Run the following command:

```bash
yarn dev
```

This will start the server with hot reloading enabled.

## Database Management

- To create a new migration:

```bash
yarn prisma migrate dev --name <migration-name>
```

- To apply migrations:

```bash
yarn prisma migrate deploy
```

## Environment Variables

This project uses Doppler for managing environment variables. Ensure you have the Doppler CLI installed and configured for your project.

To run any command with the correct environment variables:

```bash
doppler run -- <your-command>
```

## API Documentation

The API is built using tRPC. You can find the router definitions in the `src/api` directory.

## Deployment

1. Start the production server:

```bash
yarn start
```

Ensure that you have set up the necessary environment variables in your production environment.
