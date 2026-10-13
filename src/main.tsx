import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { startBuildSync } from "./state/build-store";
import { initPersistence } from "./state/persistence";

initPersistence();
startBuildSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
