# NextFlow

NextFlow is a visual AI workflow builder where users create and run media + LLM pipelines by connecting nodes on a canvas.

## Features

- User authentication and protected workflows with Clerk
- Workflow builder with 6 node types:
	- Text Node
	- Upload Image
	- Upload Video
	- Run Any LLM
	- Crop Image
	- Extract Frame
- Full workflow execution with node-level status updates
- Run single node or selected nodes for faster iteration
- Image and video upload support via Transloadit
- Workflow execution history with timestamped runs
- Export and import workflows as JSON
- Trigger.dev task execution for async/long-running jobs

## Tech Stack

- Next.js (App Router) + TypeScript
- React Flow / XYFlow for visual graph editing
- Zustand for client state
- Prisma + PostgreSQL
- Clerk for authentication
- Trigger.dev for background task orchestration
- FFmpeg for media operations
- Transloadit for upload and media processing pipeline

## Project Structure

```text
src/
	app/          # App Router pages and API routes
	components/   # UI and node components
	lib/          # Shared server/client utilities
	store/        # Zustand stores
	trigger/      # Trigger.dev task definitions
	types/        # Shared TypeScript types
prisma/         # Prisma schema and migrations
```

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL database
- Accounts/keys for Clerk, Trigger.dev, Google Gemini, and Transloadit

## Environment Variables

Create a `.env.local` file in the repository root.

Required variables:

```dotenv
DATABASE_URL=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/workflow
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/workflow

GEMINI_API_KEY=

TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_ID=

NEXT_PUBLIC_TRANSLOADIT_KEY=
TRANSLOADIT_SECRET=

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Local Development

Install dependencies:

```bash
pnpm install
```

Generate Prisma client:

```bash
pnpm run db:generate
```

Push schema to database (if needed):

```bash
pnpm run db:push
```

Start Next.js app:

```bash
pnpm dev
```

Open http://localhost:3000

## Trigger.dev

Run Trigger tasks locally:

```bash
pnpm run trigger:dev
```

Deploy Trigger tasks:

```bash
pnpm run trigger:deploy
```

## Build and Production

Build:

```bash
pnpm run db:generate
pnpm build
```

Start:

```bash
pnpm start
```

## Deployment Notes

- Keep app env vars in Vercel and task env vars in Trigger.dev in sync.
- Video uploads are routed through a production-safe Transloadit direct upload flow.
- Ensure `DATABASE_URL` is configured for runtime database access.

## Scripts

- `pnpm dev` - run local Next.js app
- `pnpm build` - production build
- `pnpm start` - run production server
- `pnpm lint` - run ESLint
- `pnpm run db:generate` - generate Prisma client
- `pnpm run db:push` - push Prisma schema
- `pnpm run trigger:dev` - run Trigger.dev locally
- `pnpm run trigger:deploy` - deploy Trigger.dev tasks
