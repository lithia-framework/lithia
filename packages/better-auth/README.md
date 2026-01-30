<div align="center">
  <a href="https://github.com/lithia-framework/lithia">
    <img alt="Lithia logo" src="https://raw.githubusercontent.com/lithia-framework/lithia/canary/.github/assets/logo.svg" height="128">
  </a>
  <h1>Lithia</h1>
  <p><strong>The high-performance Node.js framework powered by Rust.</strong></p>

  <p>Build APIs with magic, speed, and Type Safety by default.</p>

<a href="https://www.npmjs.com/package/@lithia-js/core"><img alt="NPM version" src="https://img.shields.io/npm/v/@lithia-js/core.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/lithia-framework/lithia/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@lithia-js/core.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://opencollective.com/lithiajs"><img alt="Support Lithia" src="https://img.shields.io/badge/Support%20Lithia-blueviolet.svg?style=for-the-badge&logo=OpenCollective&labelColor=000000&logoWidth=20"></a>

</div>

## 🚀 Quick Start

Build your first Lithia app in seconds:

```bash
npx create-lithia@latest my-app
cd my-app
npm run dev
```

## 🪄 Magic in Action

Lithia uses a clean, file-based routing convention. No boilerplate, just focus on your logic.

```typescript
// routes/hello/route.get.ts
import type { RouteHandler } from "@lithia-js/core";

const Hello: RouteHandler = async (req, res) => {
  const name = req.query.name || "World";
  return res.json({ message: `Hello, ${name}!` });
}

export default Hello;
// Available at: GET /hello
```

## ✨ Features

* **Intuitive Routing**: Method-based file naming (`.get.ts`, `.post.ts`) for automatic route registration.
* **Native Performance**: Core engine written in Rust for lightning-fast request handling.
* **Full-stack Ready**: Native support for WebSockets, Auth, and Drizzle ORM.
* **Modern Stack**: Ships with Biome and TypeScript pre-configured for the best DX.

## 📖 Documentation

Everything you need to know is at [lithiajs.com/docs](https://lithiajs.com/docs).

---

## 🤝 Community & Support

* **Discussions**: [GitHub Discussions](https://github.com/lithia-framework/lithia/discussions)
* **Contribution**: We love PRs! See [CONTRIBUTING.md](https://www.google.com/search?q=CONTRIBUTING.md)
* **Sponsor**: Support the magic on [OpenCollective](https://opencollective.com/lithiajs)

---

## License

Lithia is [MIT licensed](https://www.google.com/search?q=LICENSE). Built with ❤️ by Lucas Arch and the community.

---

<div align="center">
<p>
<a href="https://github.com/lithia-framework/lithia">GitHub</a> •
<a href="https://lithiajs.com">Documentation</a> •
<a href="https://opencollective.com/lithiajs">OpenCollective</a> •
<a href="https://github.com/lithia-framework/lithia/discussions">Discussions</a>
</p>
</div>