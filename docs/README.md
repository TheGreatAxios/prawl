# prawl Documentation Site

Built with [vocs](https://vocs.dev) and hosted at [prawl.dirtroad.dev](https://prawl.dirtroad.dev)

## Development

```bash
cd docs
bun install
bun run dev
```

## Build

```bash
bun run build
```

## Deployment

The docs are automatically deployed via GitHub Actions on push to main.

## Structure

```
docs/
├── pages/
│   ├── index.mdx              # Home page
│   ├── installation.mdx       # Installation guide
│   ├── quick-start.mdx        # Quick start tutorial
│   ├── sessions.mdx           # Session management
│   ├── accessibility-tree.mdx # Accessibility tree guide
│   ├── chaining.mdx           # Command chaining
│   ├── commands/              # Command reference
│   ├── examples/              # Real-world examples
│   ├── api.mdx                # HTTP API docs
│   ├── mcp.mdx                # MCP server docs
│   └── reference/             # Reference docs
├── vocs.config.ts             # Site configuration
└── package.json
```

## Domain Setup

The site is configured for `prawl.dirtroad.dev`. DNS should point to your hosting provider (Vercel, Netlify, etc.)
