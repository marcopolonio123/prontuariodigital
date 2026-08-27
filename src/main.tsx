import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import V1PreviewApp from "./V1PreviewApp.tsx";

const params = new URLSearchParams(window.location.search);
const RootApp = params.get("v1") === "1" ? V1PreviewApp : App;

ReactDOM.createRoot(document.getElementById("root")!).render(<RootApp />);

// PWA: registro do service worker (apenas no build de produção)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ambiente sem suporte — o app segue funcionando online */
    });
  });
}
