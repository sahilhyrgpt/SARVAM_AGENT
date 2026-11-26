import fs from "fs";
import path from "path";

let isEnvLoaded = false;

/**
 * Universal Environment Loader
 *
 * Ensures that variables from .env.production, .env.local, or .env are
 * loaded into process.env at runtime in Next.js standalone mode if not already present.
 */
export function ensureEnvLoaded(): void {
  if (isEnvLoaded) return;
  isEnvLoaded = true;

  // If already configured by system/container env, nothing to do
  if (process.env.MONGO_DB && process.env.SARVAM_API_KEY) {
    return;
  }

  const possiblePaths = [
    path.join(process.cwd(), ".env.production"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    "/app/.env.production",
  ];

  for (const envFilePath of possiblePaths) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ envFilePath)) {
        const content = fs.readFileSync(/*turbopackIgnore: true*/ envFilePath, "utf8");
        content.split("\n").forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              let val = trimmed.slice(eqIdx + 1).trim();
              if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
              ) {
                val = val.slice(1, -1);
              }
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
        });
        console.log(`[ENV] Successfully loaded environment from ${envFilePath}`);
        break;
      }
    } catch {
      // Ignore file reading error and try next candidate path
    }
  }
}

// Auto-run on module import
ensureEnvLoaded();
