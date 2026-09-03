import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import V1PreviewApp from "./V1PreviewApp.tsx";

const params = new URLSearchParams(window.location.search);

// A versão corrente do MyDoctor é a V1. A aplicação antiga fica disponível
// somente para diagnóstico/compatibilidade através de ?legacy=1.
// Assim, links internos ou acessos a / não podem voltar silenciosamente
// para a interface antiga e perder menu, autenticação e dados da V1.
const RootApp = params.get("legacy") === "1" ? App : V1PreviewApp;

ReactDOM.createRoot(document.getElementById("root")!).render(<RootApp />);

// PWA: registro do service worker (apenas no build de produção)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ambiente sem suporte — o app segue funcionando online */
    });
  });
}
