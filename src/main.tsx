import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getPocResults, runPoc } from "./lab/run";
import "./styles.css";

window.__proofsheetCanary = "clean";
window.__proofsheetCspViolations = [];
document.addEventListener("securitypolicyviolation", (event) => {
  window.__proofsheetCspViolations?.push(
    `${event.violatedDirective} blocked ${event.blockedURI || "inline"}${event.sourceFile ? ` at ${event.sourceFile}:${event.lineNumber}` : ""}`,
  );
});

window.__proofsheetPoc = {
  runAll: runPoc,
  getResults: getPocResults,
};

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
