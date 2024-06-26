# Landing App

This is the landing page application for the Nova project.

## Technologies Used

- React
- Vite
- Tailwind CSS
- Framer Motion
- TSParticles

## Development

To start the development server:

1. Navigate to the `apps/landing` directory
2. Run the following command:

```bash
yarn dev
```

This will start the Vite development server, and you can view the landing page at `http://localhost:3000` (or the port specified in your configuration).

## Building for Production

To build the landing page for production:

1. Navigate to the `apps/landing` directory
2. Run the following command:

```bash
yarn build
```

This will generate a production-ready build in the `dist` directory.

## Preview Production Build

To preview the production build locally:

1. After building, run:

```bash
yarn preview
```

This will serve the production build locally for testing.

## Customizing the Landing Page

The main components of the landing page are located in the `src/components` directory. To make changes:

1. Edit the relevant component files (e.g., `Hero.tsx`, `Features.tsx`, etc.)
2. Update the content in `src/App.tsx` if needed
3. Modify styles using Tailwind classes or by editing the `src/index.css` file

Remember to run `yarn lint` and `yarn typecheck` before committing your changes to ensure code quality and type safety.