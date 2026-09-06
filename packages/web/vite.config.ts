import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT) || 5180;
const api = `http://localhost:${process.env.FLOW_PORT || 5191}`;
const ws = `ws://localhost:${process.env.FLOW_PORT || 5191}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    strictPort: true,
    proxy: {
      "/api": api,
      "/runtime": api,
      "/ws": { target: ws, ws: true }
    }
  }
});
