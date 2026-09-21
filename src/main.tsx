import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import V1ProfessionalShell from "./V1ProfessionalShell.tsx";

const params = new URLSearchParams(window.location.search);

// A versão corrente do MyDoctor é a V1. A aplicação antiga fica disponível
// somente para diagnóstico/compatibilidade através de ?legacy=1.
// Assim, links internos ou acessos a / não podem voltar silenciosamente
// para a interface antiga e perder menu, autenticação e dados da V1.
const RootApp = params.get("legacy") === "1" ? App : V1ProfessionalShell;

ReactDOM.createRoot(document.getElementById("root")!).render(<RootApp />);

// Temporariamente desabilitamos o service worker. O cache-first de bundles podia
// manter uma versão antiga do prontuário após novos deploys e produzir comportamento
// diferente do backend em produção. Ao carregar esta versão, removemos workers e
// caches antigos para que frontend e API fiquem na mesma release.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => ("caches" in window ? caches.keys() : Promise.resolve([])))
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {
        /* limpeza de cache nao deve impedir o app online */
      });
  });
}
