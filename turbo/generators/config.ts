import { PlopTypes } from "@turbo/gen";
import * as fs from "fs";
import * as path from "path";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("new-site", {
    description: "Create a new game site app under apps/site-{gameId}",
    prompts: [
      {
        type: "input",
        name: "gameId",
        message: "What is the game ID? (lowercase letters, numbers, hyphens only, e.g. magic)",
        validate: (input: string) => {
          if (!input) {
            return "Game ID is required";
          }
          if (!/^[a-z0-9-]+$/.test(input)) {
            return "Game ID must contain only lowercase letters, numbers, or hyphens";
          }
          const appPath = path.join(__dirname, "../../apps", `site-${input}`);
          if (fs.existsSync(appPath)) {
            return `Site "site-${input}" already exists`;
          }
          return true;
        }
      }
    ],
    actions: (data) => {
      // Auto-compute the next available dev port by scanning existing apps
      const root = path.resolve(__dirname, "../..");
      const appsDir = path.join(root, "apps");
      let maxPort = 3000;

      try {
        const entries = fs.readdirSync(appsDir);
        for (const entry of entries) {
          const nuxtConfigPath = path.join(appsDir, entry, "nuxt.config.ts");
          if (fs.existsSync(nuxtConfigPath)) {
            const content = fs.readFileSync(nuxtConfigPath, "utf-8");
            const match = content.match(/port:\s*(\d+)/);
            if (match) {
              maxPort = Math.max(maxPort, parseInt(match[1]!, 10));
            }
          }
        }
      } catch (_e) {
        // Use default port 3000 if scan fails
      }

      data!.port = maxPort + 1;

      const actions: PlopTypes.Actions = [
        // --- App files (recursive, mirrors templates/site/) ---
        {
          type: "addMany",
          destination: "{{ turbo.paths.root }}/apps/site-{{ gameId }}",
          base: "templates/site",
          templateFiles: "templates/site/**"
        },
        // --- Add game to shared GAMES list (append to end) ---
        {
          type: "modify",
          path: "{{ turbo.paths.root }}/packages/shared/src/index.ts",
          pattern: /\] as const;/,
          template: "  '{{ gameId }}',\n] as const;"
        },
        // --- DB schema file ---
        {
          type: "add",
          path: "{{ turbo.paths.root }}/packages/db/src/schema/{{ gameId }}/schema.ts",
          templateFile: "templates/db/schema/schema.ts.hbs"
        }
      ];

      return actions;
    }
  });
}
