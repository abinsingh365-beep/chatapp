# Vite + RSC

This example shows how to set up a React application with [Server Component](https://react.dev/reference/rsc/server-components) features on Vite using [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc).

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc/examples/starter)

```sh
# run dev server
npm run dev

# build for production and preview
npm run build
npm run preview
```

## Client API configuration

Copy `.env.example` to `.env` and set the backend URLs:

```powershell
Copy-Item .env.example .env
```

- `VITE_API_URL` is the backend API base URL, including `/api` (for example, `http://localhost:5000/api`).
- `VITE_SOCKET_URL` is the backend origin used for Socket.IO (for example, `http://localhost:5000`).

Start the backend server before using the client. Restart Vite after changing `.env` values.

## Profile image storage

Profile images are stored in MongoDB GridFS so they survive backend restarts and deployments that use temporary local filesystems. The MongoDB database configured by the server's `MONGO_URI` must have enough storage for uploaded images.

## API usage

See [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc) for the documentation.

- [`vite.config.ts`](./vite.config.ts)
  - `@vitejs/plugin-rsc/plugin`
- [`./src/framework/entry.rsc.tsx`](./src/framework/entry.rsc.tsx)
  - `@vitejs/plugin-rsc/rsc/server`
  - `import.meta.viteRsc.loadModule`
- [`./src/framework/entry.ssr.tsx`](./src/framework/entry.ssr.tsx)
  - `@vitejs/plugin-rsc/ssr`
  - `getClientEntryUrl`
  - `rsc-html-stream/server`
- [`./src/framework/entry.browser.tsx`](./src/framework/entry.browser.tsx)
  - `@vitejs/plugin-rsc/browser`
  - `rsc-html-stream/client`

## Notes

- [`./src/framework/entry.{browser,rsc,ssr}.tsx`](./src/framework) (with inline comments) provides an overview of how low level RSC (React flight) API can be used to build RSC framework.
- You can use [`vite-plugin-inspect`](https://github.com/antfu-collective/vite-plugin-inspect) to understand how `"use client"` and `"use server"` directives are transformed internally.

## Deployment

See [vite-plugin-rsc-deploy-example](https://github.com/hi-ogawa/vite-plugin-rsc-deploy-example)
