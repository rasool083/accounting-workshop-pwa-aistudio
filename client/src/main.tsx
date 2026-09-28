import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./ui-fixes.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then(registration => registration.update())
      .catch(() => undefined);
  });
}
