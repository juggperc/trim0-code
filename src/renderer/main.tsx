import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import App from "@renderer/App";
import "@renderer/index.css";

if (!window.trim0) {
  const mount = document.getElementById("root");
  if (mount) {
    mount.innerHTML = "";
    const box = document.createElement("div");
    box.className =
      "mx-auto max-w-lg border border-black bg-white p-6 shadow-[8px_8px_0_0_rgba(0,0,0,1)]";
    box.innerHTML = `
      <p class="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">trim0.code</p>
      <h1 class="mt-3 text-xl font-black uppercase tracking-[0.14em]">Preload bridge missing</h1>
      <p class="mt-3 text-sm leading-relaxed text-zinc-600">
        The Electron preload did not expose <code class="font-mono text-black">window.trim0</code>.
        Use <code class="font-mono text-black">npm run dev</code> (not <code class="font-mono text-black">vite</code> alone).
        Ensure <code class="font-mono text-black">dist-electron/main/index.js</code> is compiled so preload resolves.
      </p>
    `;
    mount.appendChild(box);
  }
} else {
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-none !border !border-black !bg-white !text-black !shadow-[6px_6px_0_0_rgba(0,0,0,1)]",
          title: "!font-black !uppercase !tracking-[0.14em]",
          description: "!text-sm !text-zinc-600",
        },
      }}
    />
  </React.StrictMode>,
);
}
