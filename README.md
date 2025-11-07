<div align="center">
  <img alt="Gatana Logo" height="86" src="https://gatana.gatana.ai/favicon-prod.png" width="86">
  <h1 align="center"><b>gatana-js</b></h1>
  <p align="center">🚀 CLI and JavaScript SDK</p>
</div>
<br/>

<p align="center">
  <a href="https://opensource.org/license/mit" rel="nofollow"><img src="https://img.shields.io/github/license/hey-api/openapi-ts" alt="MIT License"></a>
  <a href="https://badge.fury.io/js/gatana" rel="nofollow"><img src="https://badge.fury.io/js/gatana.svg" alt="npm package" /></a>
</p>

<p align="center">
  <a href="https://gatana.ai">Homepage</a><span>&nbsp;•&nbsp;</span>
  <a href="https://docs.gatana.ai/">API Spec</a>
  <span>&nbsp;•&nbsp;</span>
  <a href="https://discord.gg/6TvjvmSP">Discord</a>
</p>

<br/>

## Install

```bash
npm install gatana
```

## Quick Start SDK

```typescript
import { Gatana } from 'gatana';
const client = new Gatana();

// List MCP Servers
await client.api.getMcpServers();
```

## Quick Start CLI

```bash
npm i -g gatana
gatana config login # login
gatana server ls # list servers
```

### Package & Upload Hosted Server

```bash
mkdir pkg
echo 'export const schema = {}' > pkg/index.js
gatana server deploy pgk
```

## Configuration

This is the default configuration lookup strategy:

1. Passed options (only SDK)
2. Environment variables `GATANA_ORG_ID` and `GATANA_API_KEY`
3. Configurations from `~/.gatana.config` in the following order
   1. `GATANA_ORG_ID`
   2. The default organization

## SDK

Authentication can be controlled in the constructor by providing a custom `ConfigLoader`:

```typescript
const client = new Gatana({ configLoader: ConfigLoader });
```

The configLoader must follow this shape:

```typescript
{
  getConfig(): { baseUrl: string; token: () => Promise<string> } | null;
}
```

## Debugging

The SDK uses the `debug` package for logging. Enable debug output with:

```bash
DEBUG=gatana node your-script.js
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

We welcome contributions!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
