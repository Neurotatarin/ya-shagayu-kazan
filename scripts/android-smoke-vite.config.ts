import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({root: resolve("native/tests/android-web"),base:"./",build:{outDir:resolve("work/android-smoke-web"),emptyOutDir:true,target:"chrome90"}});
