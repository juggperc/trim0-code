import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import App from "@renderer/App";
import "@renderer/index.css";

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
