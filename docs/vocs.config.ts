import { defineConfig } from 'vocs'

export default defineConfig({
  title: 'prawl',
  description: 'Lightweight browser automation for AI agents',
  baseUrl: 'https://prawl.dirtroad.dev',
  logoUrl: '/prawl-logo.svg',
  iconUrl: '/favicon.svg',
  theme: {
    accentColor: '#fbbf24',
    variables: {
      color: {
        background: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        text: {
          dark: '#e2e8f0',
          light: '#1e293b',
        },
      },
    },
  },
  socials: [
    {
      icon: 'github',
      link: 'https://github.com/thegreataxios/prawl',
    },
  ],
  sidebar: [
    {
      text: 'Getting Started',
      items: [
        { text: 'Introduction', link: '/' },
        { text: 'Installation', link: '/installation' },
        { text: 'Quick Start', link: '/quick-start' },
      ],
    },
    {
      text: 'Core Concepts',
      items: [
        { text: 'Sessions', link: '/sessions' },
        { text: 'Accessibility Tree', link: '/accessibility-tree' },
        { text: 'Command Chaining', link: '/chaining' },
      ],
    },
    {
      text: 'Commands',
      items: [
        { text: 'Navigation', link: '/commands/navigation' },
        { text: 'Interaction', link: '/commands/interaction' },
        { text: 'Information', link: '/commands/information' },
        { text: 'Device Emulation', link: '/commands/device' },
        { text: 'Workflow', link: '/commands/workflow' },
        { text: 'Advanced', link: '/commands/advanced' },
      ],
    },
    {
      text: 'Integration',
      items: [
        { text: 'HTTP API', link: '/api' },
        { text: 'MCP Server', link: '/mcp' },
        { text: 'Agent Skills', link: '/skills' },
      ],
    },
    {
      text: 'Examples',
      items: [
        { text: 'Form Automation', link: '/examples/form' },
        { text: 'Data Extraction', link: '/examples/data' },
        { text: 'Mobile Testing', link: '/examples/mobile' },
        { text: 'E2E Testing', link: '/examples/testing' },
      ],
    },
    {
      text: 'Reference',
      items: [
        { text: 'CLI Reference', link: '/reference/cli' },
        { text: 'Configuration', link: '/reference/config' },
        { text: 'Troubleshooting', link: '/reference/troubleshooting' },
      ],
    },
  ],
})
